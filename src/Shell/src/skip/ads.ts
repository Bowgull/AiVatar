// Blocking YouTube ads.
//
// Ghostery's engine, but deliberately NOT its prebuilt list. The plan's research found the prebuilt
// one is EasyList-based and misses what actually works on YouTube; uBlock Origin's own lists are what
// keep up, because that is where the work happens. So the engine is Ghostery's and the lists are
// uBlock's, refreshed on a schedule.
//
// Honest about this one: it works, and it breaks for a day or two every few weeks when YouTube changes
// something. That is in the switch's own description, so a quiet week of ads is a known thing rather
// than a mystery. When it breaks, the lists catch up on their own.
//
// It runs ONLY on the stock Shell's session. The DRM runtime never sees it: a paid service has no ads
// to block, and putting a request filter in front of a licence negotiation is a good way to break
// playback for no gain.
import { createHash } from 'node:crypto';
import { promises as dns } from 'node:dns';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Worker } from 'node:worker_threads';
import path from 'node:path';
import type { Session } from 'electron';
import { parse as parseHost } from 'tldts-experimental';
import { reportWriteFailure, writeFileAtomic } from '../atomic.ts';
import { sched } from '../sched.ts';

/**
 * uBlock Origin's own default set (its assets.json, checked 2026-11-13), which is where the work on YouTube and on
 * "ad blocker detected" walls actually happens, plus its "other annoyances" list (pop-ups, newsletter boxes, chat
 * bubbles). Cookie banners are left to autoconsent (privacy.ts), which answers them with a no; a list that only hides
 * them would leave the site thinking nobody had answered. uBlock's URLhaus list is left out on purpose: phish.ts
 * already blocks its sites by name, and its 108,000 single addresses were 12 MB, more than every other list together.
 */
export const LISTS = [
  'https://ublockorigin.github.io/uAssets/filters/filters.txt',
  'https://ublockorigin.github.io/uAssets/filters/privacy.txt',
  'https://ublockorigin.github.io/uAssets/filters/quick-fixes.txt',
  'https://ublockorigin.github.io/uAssets/filters/unbreak.txt',
  // Scam and badware sites (uBlock Origin's own list, 2026-10-14).
  'https://ublockorigin.github.io/uAssets/filters/badware.txt',
  'https://ublockorigin.github.io/uAssets/filters/annoyances-others.txt',
  'https://ublockorigin.github.io/uAssets/thirdparties/easylist.txt',
  'https://ublockorigin.github.io/uAssets/thirdparties/easyprivacy.txt',
  'https://pgl.yoyo.org/adservers/serverlist.php?hostformat=adblockplus&showintro=0&mimetype=plaintext',
];

/**
 * The page tricks (scriptlets) and stand-in files ($redirect) the lists call by name. Without them every `##+js(...)`
 * rule and every redirect in uBlock's lists did nothing (found 2026-11-13): Ghostery's parse() starts with none.
 */
export const RESOURCES = 'https://raw.githubusercontent.com/ghostery/adblocker/master/packages/adblocker/assets/ublock-origin/resources.json';

/** Every 4 hours (was daily until 2026-11-13): when YouTube changes something, the fix reaches him the same day. */
const KEEP_MS = 4 * 60 * 60 * 1000;

export interface AdBlock {
  /** Stop blocking, for example when he turns the switch off. */
  stop(): void;
  /** Start again after a stop (the browser's "Block ads" switch back on). */
  start(): void;
  /** How many lists were actually loaded. Zero means it is not blocking anything. */
  lists: number;
  /** 6.22: stop blocking ads on one site (on = paused), or start again. Kept by the caller. */
  pause(host: string, on: boolean): void;
  /** The same for many sites in one change (start-up): each change rebuilds the engine's index, ~50 ms on his Mac. */
  pauseMany(hosts: string[], on: boolean): void;
}

/**
 * Start blocking on a session. Returns null if the blocker could not be built, which is not fatal: he
 * sees ads, and that is better than a browser that will not load anything.
 */
/**
 * `cosmetic`: also hide the empty boxes ads leave behind and run the page tricks. Any number of sessions can have it
 * (2026-11-13, see wireCosmetics); the pop-out, which only plays video, still goes without.
 */
/** A request the guard stops before anything else sees it (true = cancel). */
export type RequestGuard = (d: Electron.OnBeforeRequestListenerDetails) => boolean;
type Blocking = {
  onBeforeRequest: (d: Electron.OnBeforeRequestListenerDetails, cb: (r: Electron.CallbackResponse) => void) => void;
  onHeadersReceived?: (d: Electron.OnHeadersReceivedListenerDetails, cb: (r: Electron.HeadersReceivedResponse) => void) => void;
};
/** What privacy.ts adds to a session's two hooks (2026-10-26): links without tracking tags, hidden sites' cookies dropped. */
export interface PrivacyHooks { clean?: (url: string) => string | null; headers?: (d: Electron.OnHeadersReceivedListenerDetails) => Record<string, string[]> | null }
const privacyOf = new WeakMap<Session, PrivacyHooks>();
export function privacyHooks(session: Session, p: PrivacyHooks): void { privacyOf.set(session, p); }
/**
 * The session's one before-request hook and one on-headers hook: the guard, then a page's tracking tags taken off, then
 * the ad blocker (or nothing when ads are off). Called again each time the blocker starts, stops or is swapped.
 */
export function guardRequests(session: Session, guard: RequestGuard, blocker: Blocking | null): void {
  session.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (d, cb) => {
    let stop = false;
    try { stop = guard(d); } catch { stop = false; }
    if (stop) { cb({ cancel: true }); return; }
    const p = privacyOf.get(session);
    if (p?.clean && d.method === 'GET' && (d.resourceType === 'mainFrame' || d.resourceType === 'subFrame')) {
      let to: string | null = null;
      try { to = p.clean(d.url); } catch { to = null; }
      if (to) { cb({ redirectURL: to }); return; }
    }
    if (blocker) blocker.onBeforeRequest(d, cb); else cb({});
  });
  session.webRequest.onHeadersReceived({ urls: ['<all_urls>'] }, (d, cb) => {
    let mine: Record<string, string[]> | null = null;
    try { mine = privacyOf.get(session)?.headers?.(d) ?? null; } catch { mine = null; }
    if (!blocker?.onHeadersReceived) { cb(mine ? { responseHeaders: mine } : {}); return; }
    blocker.onHeadersReceived(mine ? { ...d, responseHeaders: mine } : d, (r) => cb(r.responseHeaders ? r : mine ? { responseHeaders: mine } : {}));
  });
}

/**
 * Everything a page on each site loads goes through, the way uBlock's per-site switch works; one engine update for all.
 * `@@*$domain=` (2026-10-22, measured against the real lists): Ghostery ignores uBlock's `@@||site^$document` for the
 * page's own scripts and frames, so until then a paused site (and the call sites kept open for Zoom and Teams) was
 * still blocked.
 */
const rulesFor = (hosts: Iterable<string>) => [...new Set([...hosts].map((x) => String(x).toLowerCase().replace(/^www\./, '')).filter((h) => /^[a-z0-9.-]+$/.test(h)))].sort().map((h) => `@@*$domain=${h}`);
/**
 * The lists with his paused sites' rules written in (2026-10-24, speed check): adding them to a ready engine rebuilds its
 * whole index, about 0.7 s on his Mac on every start, just before the window shows. Built in, the kept engine already
 * has them; only a change he makes later is added the slow way (and the next start builds it in again, in the worker).
 */
const withPauses = (text: string, hosts: Iterable<string>) => { const r = rulesFor(hosts); return r.length ? text + '\n' + r.join('\n') + '\n' : text; };
function pauseRules(blocker: { updateFromDiff(d: { added?: string[]; removed?: string[] }): unknown }, hosts: string[], on: boolean): void {
  const rules = rulesFor(hosts);
  if (!rules.length) return;
  try { blocker.updateFromDiff(on ? { added: rules } : { removed: rules }); } catch (e) { console.error('shell: ad pause failed: ' + (e as Error).message); }
}

/** One download. A stuck one used to hold the refresh forever (no time limit, 2026-10-30): one minute each. */
async function fetchText(url: string): Promise<string> {
  const r = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error(`said ${r.status}`);
  return r.text();
}
/**
 * uBlock's main list is mostly an index (2026-11-13): `!#include filters-2025.txt` and nine more, which only uBlock
 * follows. Ghostery skipped them, so Samara had a fraction of uBlock's rules. Followed here: one level, same folder.
 */
export async function withIncludes(url: string, text: string, get: (u: string) => Promise<string> = fetchText): Promise<string> {
  const parts = [text];
  for (const m of text.matchAll(/^!#include\s+(\S+)\s*$/gm)) {
    if (!/^[\w.-]+\.txt$/.test(m[1])) continue;
    parts.push(await get(new URL(m[1], url).href));
  }
  return parts.join('\n');
}
/** Every list, fetched one at a time. A list that fails is said out loud (blocking less looks like blocking). */
async function fetchLists(): Promise<{ text: string; got: number }> {
  let text = '', got = 0;
  const missed: string[] = [];
  for (const url of LISTS) {
    try {
      text += '\n' + await withIncludes(url, await fetchText(url));
      got++;
    } catch (e) { missed.push(`${url}: ${(e as Error).message}`); }
  }
  // Seen on 2026-10-04: one run got three lists and the next got four, and the rule for a well-known ad address was in
  // the one that was missing.
  if (missed.length) console.error(`shell: ${missed.length} block list(s) did not load: ${missed.join('; ')}`);
  return { text, got };
}
/**
 * Fresh lists for everyone who asks within ten minutes (the default session, the browser and the secret window each
 * keep a blocker, and each used to download every list on its own).
 */
let shared: { at: number; lists: Promise<{ text: string; got: number }> } | null = null;
function freshLists(): Promise<{ text: string; got: number }> {
  if (!shared || Date.now() - shared.at > 10 * 60_000) shared = { at: Date.now(), lists: fetchLists() };
  return shared.lists;
}
/** The page tricks, shared the same way. */
let sharedRes: { at: number; text: Promise<string> } | null = null;
function freshResources(file: string): Promise<string> {
  if (!sharedRes || Date.now() - sharedRes.at > 10 * 60_000) sharedRes = { at: Date.now(), text: fetchResources(file) };
  return sharedRes.text;
}
let adJobs = 0;
/** The page tricks, kept with the lists. Old ones still work; none at all only costs the tricks, never the blocking. */
async function fetchResources(file: string): Promise<string> {
  try {
    const t = await fetchText(RESOURCES);
    JSON.parse(t);
    try { writeFileAtomic(file, t); } catch (e) { reportWriteFailure(file, e); }
    return t;
  } catch (e) {
    console.error('shell: the ad page tricks did not load: ' + (e as Error).message);
    try { return readFileSync(file, 'utf8'); } catch { return ''; }
  }
}
const sha = (t: string) => createHash('sha256').update(t).digest('hex');
/** The engine built from these lists in a worker thread, as the bytes the kept copy holds. */
function buildAway(text: string, cosmetic: boolean, resources: string): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('./adbuild-worker.mjs', import.meta.url), { workerData: { text, cosmetic, resources, checksum: sha(resources) } });
    w.once('message', (b: Uint8Array) => { resolve(b); void w.terminate(); });
    w.once('error', reject);
    w.once('exit', (code) => { if (code) reject(new Error(`the ad list builder stopped (${code})`)); });
  });
}

/** What the cosmetic side needs from an engine; ElectronBlocker has it. */
type Cosmetic = {
  config: { enableMutationObserver: boolean };
  getCosmeticsFilters(o: Record<string, unknown>): { active: boolean; styles: string; scripts: string[] };
};
/**
 * Hiding empty ad boxes and running page tricks, for EVERY session (2026-11-13). Ghostery wires this with app-wide
 * handlers bound to one engine, so only one session in the app could have it and the secret window went without.
 * Samara owns the handlers instead and asks each page's own session which engine it uses.
 */
const cosmeticOf = new WeakMap<Session, Cosmetic>();
const INJECT = '@ghostery/adblocker/inject-cosmetic-filters', OBSERVE = '@ghostery/adblocker/is-mutation-observer-enabled';
/** Samara's own early preload asks on this one, before the page's scripts run. */
export const SCRIPTS_CHANNEL = 'samara:adblock:scripts';
const req = createRequire(import.meta.url);
const PRELOADS = [req.resolve('@ghostery/adblocker-electron-preload'), path.join(import.meta.dirname, 'adscripts.cjs')];
const preloadIds = new WeakMap<Session, string[]>();
let wired: Promise<void> | null = null;
function wireCosmetics(): Promise<void> {
  wired ??= import('electron').then(({ ipcMain }) => {
    const where = (url: string) => { const h = parseHost(url); return { hostname: h.hostname ?? '', domain: h.domain ?? '' }; };
    // Styles only: the tricks already ran from adscripts.cjs, at the start of the page, where they have to.
    ipcMain.handle(INJECT, (e, url: string, msg?: { classes?: string[]; hrefs?: string[]; ids?: string[]; lifecycle?: string }) => {
      const engine = cosmeticOf.get(e.sender.session);
      if (!engine || typeof url !== 'string') return;
      const first = msg === undefined;
      const { active, styles } = engine.getCosmeticsFilters({
        ...where(url), url, classes: msg?.classes, hrefs: msg?.hrefs, ids: msg?.ids,
        getBaseRules: first, getInjectionRules: false, getExtendedRules: false, getRulesFromHostname: first, getRulesFromDOM: !first,
        callerContext: { frameId: e.frameId, processId: e.processId, lifecycle: msg?.lifecycle },
      });
      if (active !== false && styles.length) void e.sender.insertCSS(styles, { cssOrigin: 'user' }).catch(() => { /* page gone */ });
    });
    ipcMain.handle(OBSERVE, (e) => cosmeticOf.get(e.sender.session)?.config.enableMutationObserver ?? false);
    // The answer goes out the moment returnValue is first set (found by adtricks-check), so it is set exactly once.
    ipcMain.on(SCRIPTS_CHANNEL, (e, url: unknown) => {
      let scripts: string[] = [];
      const engine = cosmeticOf.get(e.sender.session);
      if (engine && typeof url === 'string' && /^https?:/.test(url)) {
        try {
          const r = engine.getCosmeticsFilters({
            ...where(url), url, getBaseRules: false, getInjectionRules: true, getExtendedRules: false, getRulesFromHostname: true, getRulesFromDOM: false,
            callerContext: { frameId: e.frameId, processId: e.processId },
          });
          if (r.active !== false) scripts = r.scripts;
        } catch (err) { console.error('shell: ad page tricks failed: ' + (err as Error).message); }
      }
      e.returnValue = scripts;
    });
  });
  return wired;
}
function cosmeticsOn(session: Session, engine: Cosmetic): void {
  cosmeticOf.set(session, engine);
  if (preloadIds.has(session)) return;
  preloadIds.set(session, PRELOADS.map((filePath) => session.registerPreloadScript({ type: 'frame', filePath })));
}
function cosmeticsOff(session: Session): void {
  cosmeticOf.delete(session);
  for (const id of preloadIds.get(session) ?? []) { try { session.unregisterPreloadScript(id); } catch { /* gone */ } }
  preloadIds.delete(session);
}

/**
 * Trackers hiding behind the site's own name (CNAME cloaking, 2026-11-13): `metrics.shop.com` that is really a
 * tracking company's server. uBlock in Firefox looks up where the name points and blocks it if the real server is on
 * the lists. Done here without ever making a page wait: the first request to a name starts the lookup, and every one
 * after it is judged by the answer. Only the site's own sub-names are looked up, and only names the page is
 * already loading, so it asks nothing the page was not about to ask.
 */
const cnames = new Map<string, { to: string | null; at: number }>();
const CNAME_MS = 60 * 60_000;
function cnameOf(host: string): string | null {
  const c = cnames.get(host);
  if (c && Date.now() - c.at < CNAME_MS) return c.to;
  if (!c || Date.now() - c.at >= CNAME_MS) {
    if (cnames.size > 4000) cnames.clear();
    cnames.set(host, { to: c?.to ?? null, at: Date.now() });
    dns.resolveCname(host).then((r) => cnames.set(host, { to: r[0]?.toLowerCase().replace(/\.$/, '') ?? null, at: Date.now() }), () => { /* no alias: kept as none */ });
  }
  return c?.to ?? null;
}
type Matcher = { match(r: unknown): { match: boolean; redirect?: unknown; exception?: unknown } };
/** Would the lists stop this request if it went by its real server's name? Exported for the test. */
export function cloaked(engine: Matcher, makeRequest: (o: Record<string, unknown>) => unknown, d: { url: string; referrer?: string; resourceType?: string }, lookup = cnameOf): boolean {
  if (d.resourceType === 'mainFrame' || !d.referrer) return false;
  let u: URL;
  try { u = new URL(d.url); } catch { return false; }
  if (!/^https?:$/.test(u.protocol)) return false;
  const host = parseHost(u.hostname), page = parseHost(d.referrer);
  if (!host.domain || host.domain !== page.domain || u.hostname === host.domain || u.hostname === 'www.' + host.domain) return false;
  const to = lookup(u.hostname);
  if (!to || parseHost(to).domain === host.domain) return false;
  u.hostname = to;
  const r = engine.match(makeRequest({ url: u.href, sourceUrl: d.referrer, type: d.resourceType || 'other' }));
  return r.match && !r.redirect;
}

export async function blockAds(session: Session, stateDir: string, opts: { cosmetic?: boolean; guard?: RequestGuard; paused?: string[]; slot?: string } = {}): Promise<AdBlock | null> {
  const cacheDir = path.join(stateDir, 'adblock');
  try { mkdirSync(cacheDir, { recursive: true }); } catch { /* checked on write */ }
  const cache = path.join(cacheDir, 'lists.txt'), whenFile = path.join(cacheDir, 'when.json'), resFile = path.join(cacheDir, 'resources.json');
  const keep = (text: string, got: number) => {
    try { writeFileAtomic(cache, text); writeFileAtomic(whenFile, JSON.stringify({ at: Date.now(), lists: got, set: sha(LISTS.join('\n')) })); } catch (e) { reportWriteFailure(cache, e); }
  };

  // The kept lists are used at once, even a day old (2026-10-22, his Mac: the first start of each day waited on five
  // downloads and a 1.8 s rebuild before the window could appear). Old lists still block nearly everything; fresh ones
  // are fetched and built in the background and swapped in. A cache left by a run where a list failed counts as old,
  // and so does one made from a different set of lists.
  let text = '', got = 0, stale = true, age = 0;
  try {
    if (existsSync(cache)) {
      const when = JSON.parse(readFileSync(whenFile, 'utf8'));
      text = readFileSync(cache, 'utf8'); got = Number(when.lists) || 0;
      age = Math.max(0, Date.now() - (Number(when.at) || 0));
      stale = age >= KEEP_MS || got !== LISTS.length || when.set !== sha(LISTS.join('\n'));
    }
  } catch { text = ''; got = 0; }
  let resources = '';
  try { resources = readFileSync(resFile, 'utf8'); } catch { resources = ''; }
  // The very first start has nothing kept: that one has to wait for the lists.
  if (!text) { ({ text, got } = await fetchLists()); stale = false; if (got) keep(text, got); }
  if (!resources) resources = await fetchResources(resFile);
  if (!got || !text.trim()) {
    console.error('shell: no block lists could be loaded, so ads are not being blocked');
    return null;
  }

  try {
    const { ElectronBlocker, makeRequest } = await import('@ghostery/adblocker-electron');
    type Blocker = InstanceType<typeof ElectronBlocker>;
    // Built once and kept ready (measured 2026-10-20): reading the 3.2 MB of lists from scratch froze Samara for about
    // 1.8 s on every start, before its window could appear. The ready-built blocker loads in a fraction of that. It is
    // rebuilt whenever the lists change, and any doubt about the saved copy simply means building it again.
    const cosmetic = opts.cosmetic === true;
    if (cosmetic) await wireCosmetics();
    const slot = opts.slot ? '-' + opts.slot.replace(/[^\w-]/g, '') : '';
    const engine = path.join(cacheDir, (cosmetic ? 'engine-cosmetic' : 'engine') + slot + '.bin');
    const keyOf = (t: string, res: string) => createHash('sha256').update(cosmetic ? 'cosmetic|' : 'plain|').update(sha(res)).update(t).digest('hex');
    const keepEngine = (bytes: Uint8Array, key: string) => { try { writeFileAtomic(engine, bytes); writeFileAtomic(engine + '.key', key); } catch (e) { reportWriteFailure(engine, e); } };
    const paused = new Set<string>(opts.paused ?? []);
    let key = keyOf(withPauses(text, paused), resources);
    let blocker: Blocker | null = null;
    try { if (readFileSync(engine + '.key', 'utf8') === key) blocker = ElectronBlocker.deserialize(new Uint8Array(readFileSync(engine))); } catch { blocker = null; }
    if (!blocker) {
      // No kept engine for these lists (and paused sites): built away from the main process, loaded from its bytes.
      let bytes: Uint8Array | null = null;
      try { bytes = await buildAway(withPauses(text, paused), cosmetic, resources); } catch (e) { console.error('shell: ad lists built here instead: ' + (e as Error).message); }
      if (bytes) blocker = ElectronBlocker.deserialize(bytes);
      else {
        blocker = ElectronBlocker.parse(withPauses(text, paused), { loadCosmeticFilters: cosmetic });
        if (resources) blocker.updateResources(resources, sha(resources));
      }
      const b = bytes ?? blocker.serialize(), k = key;
      setTimeout(() => keepEngine(b, k), 5000).unref?.();
    }
    const guard: RequestGuard = opts.guard ?? (() => false);
    // The session's hooks: the guard first, then the hidden-tracker check, then the lists (2026-10-14, 2026-11-13).
    const hooks = (b: Blocker): Blocking => ({
      onBeforeRequest: (d, cb) => {
        let hide = false;
        try { hide = cloaked(b as unknown as Matcher, makeRequest as never, d); } catch { hide = false; }
        if (hide) cb({ cancel: true }); else b.onBeforeRequest(d, cb);
      },
      onHeadersReceived: b.onHeadersReceived,
    });
    let on = true;
    const switchOn = (b: Blocker) => { guardRequests(session, guard, hooks(b)); if (cosmetic) cosmeticsOn(session, b as unknown as Cosmetic); };
    switchOn(blocker);
    const ab: AdBlock = {
      lists: got,
      stop: () => { on = false; guardRequests(session, guard, null); if (cosmetic) cosmeticsOff(session); },
      start: () => { on = true; switchOn(blocker!); },
      pause: (host: string, p: boolean) => ab.pauseMany([host], p),
      pauseMany: (hosts: string[], p: boolean) => { for (const h of hosts) { if (p) paused.add(h); else paused.delete(h); } pauseRules(blocker!, hosts, p); },
    };
    // Fresh lists, quietly: fetched, built in the worker, then the new engine takes over with the same paused sites.
    // On the scheduler (2026-10-30): at start when stale, then every 4 hours for a Samara left running, held while he
    // is in a call, a game or full screen.
    const refresh = async () => {
      const f = await freshLists();
      if (!f.got || f.got < got || !f.text.trim()) return;      // never swap in fewer lists than are blocking now
      keep(f.text, f.got);
      const res = (await freshResources(resFile)) || resources;
      const now = [...paused];
      const k = keyOf(withPauses(f.text, now), res);
      if (k === key) return;
      const bytes = await buildAway(withPauses(f.text, now), cosmetic, res);
      const next = ElectronBlocker.deserialize(bytes);
      // Sites paused or let go while it was building: told to the new engine the slow way.
      const added = [...paused].filter((h) => !now.includes(h)), gone = now.filter((h) => !paused.has(h));
      pauseRules(next, added, true); pauseRules(next, gone, false);
      blocker = next; key = k; resources = res; got = f.got; ab.lists = f.got;
      if (on) switchOn(next);
      keepEngine(bytes, k);
      console.log(`shell: ad lists refreshed (${f.got} lists)`);
    };
    sched.every(`ads.lists.${++adJobs}`, KEEP_MS, () => refresh().catch((e) => console.error('shell: the ad lists could not be refreshed: ' + (e as Error).message)),
      { quiet: true, first: stale ? 0 : KEEP_MS - age });
    return ab;
  } catch (e) {
    console.error('shell: the ad blocker would not start, so ads are not being blocked: ' + (e as Error).message);
    return null;
  }
}

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
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { Worker } from 'node:worker_threads';
import path from 'node:path';
import type { Session } from 'electron';
import { reportWriteFailure, writeFileAtomic } from '../atomic.ts';

/** uBlock Origin's own lists, which is where the work on YouTube actually happens. */
export const LISTS = [
  'https://ublockorigin.github.io/uAssets/filters/filters.txt',
  'https://ublockorigin.github.io/uAssets/filters/privacy.txt',
  'https://ublockorigin.github.io/uAssets/filters/quick-fixes.txt',
  // Scam and badware sites (uBlock Origin's own list, 2026-10-14).
  'https://ublockorigin.github.io/uAssets/filters/badware.txt',
  'https://easylist.to/easylist/easylist.txt',
];

/** Refreshed daily. The lists change often; that is the point of them. */
const KEEP_MS = 24 * 60 * 60 * 1000;

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
 * `cosmetic`: also hide the empty boxes ads leave behind. Ghostery can do that for ONE session per app (it
 * registers app-wide handlers), so his browser gets it and the pop-out, which only plays video, does not.
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
 * the ad blocker (or nothing when ads are off). Called again each time the blocker starts, stops or is swapped, since
 * Ghostery's own start and stop replace both hooks.
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

/** Every list, fetched one at a time. A list that fails is said out loud (blocking less looks like blocking). */
async function fetchLists(): Promise<{ text: string; got: number }> {
  let text = '', got = 0;
  const missed: string[] = [];
  for (const url of LISTS) {
    try {
      const r = await fetch(url);
      if (!r.ok) { missed.push(`${url} said ${r.status}`); continue; }
      text += '\n' + await r.text();
      got++;
    } catch (e) { missed.push(`${url}: ${(e as Error).message}`); }
  }
  // Seen on 2026-10-04: one run got three lists and the next got four, and the rule for a well-known ad address was in
  // the one that was missing.
  if (missed.length) console.error(`shell: ${missed.length} block list(s) did not load: ${missed.join('; ')}`);
  return { text, got };
}
/** The engine built from these lists in a worker thread, as the bytes the kept copy holds. */
function buildAway(text: string, cosmetic: boolean): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('./adbuild-worker.mjs', import.meta.url), { workerData: { text, cosmetic } });
    w.once('message', (b: Uint8Array) => { resolve(b); void w.terminate(); });
    w.once('error', reject);
    w.once('exit', (code) => { if (code) reject(new Error(`the ad list builder stopped (${code})`)); });
  });
}

export async function blockAds(session: Session, stateDir: string, opts: { cosmetic?: boolean; guard?: RequestGuard; paused?: string[] } = {}): Promise<AdBlock | null> {
  const cacheDir = path.join(stateDir, 'adblock');
  try { mkdirSync(cacheDir, { recursive: true }); } catch { /* checked on write */ }
  const cache = path.join(cacheDir, 'lists.txt'), whenFile = path.join(cacheDir, 'when.json');
  const keep = (text: string, got: number) => {
    try { writeFileAtomic(cache, text); writeFileAtomic(whenFile, JSON.stringify({ at: Date.now(), lists: got })); } catch (e) { reportWriteFailure(cache, e); }
  };

  // The kept lists are used at once, even a day old (2026-10-22, his Mac: the first start of each day waited on five
  // downloads and a 1.8 s rebuild before the window could appear). Old lists still block nearly everything; fresh ones
  // are fetched and built in the background and swapped in. A cache left by a run where a list failed counts as old.
  let text = '', got = 0, stale = true;
  try {
    if (existsSync(cache)) {
      const when = JSON.parse(readFileSync(whenFile, 'utf8'));
      text = readFileSync(cache, 'utf8'); got = Number(when.lists) || 0;
      stale = Date.now() - when.at >= KEEP_MS || got !== LISTS.length;
    }
  } catch { text = ''; got = 0; }
  // The very first start has nothing kept: that one has to wait for the lists.
  if (!text) { ({ text, got } = await fetchLists()); stale = false; if (got) keep(text, got); }
  if (!got || !text.trim()) {
    console.error('shell: no block lists could be loaded, so ads are not being blocked');
    return null;
  }

  try {
    const { ElectronBlocker } = await import('@ghostery/adblocker-electron');
    type Blocker = InstanceType<typeof ElectronBlocker>;
    // Built once and kept ready (measured 2026-10-20): reading the 3.2 MB of lists from scratch froze Samara for about
    // 1.8 s on every start, before its window could appear. The ready-built blocker loads in a fraction of that. It is
    // rebuilt whenever the lists change, and any doubt about the saved copy simply means building it again.
    const cosmetic = opts.cosmetic === true;
    const engine = path.join(cacheDir, cosmetic ? 'engine-cosmetic.bin' : 'engine.bin');
    const keyOf = (t: string) => createHash('sha256').update(cosmetic ? 'cosmetic|' : 'plain|').update(t).digest('hex');
    const keepEngine = (bytes: Uint8Array, key: string) => { try { writeFileAtomic(engine, bytes); writeFileAtomic(engine + '.key', key); } catch (e) { reportWriteFailure(engine, e); } };
    const paused = new Set<string>(opts.paused ?? []);
    let key = keyOf(withPauses(text, paused));
    let blocker: Blocker | null = null;
    try { if (readFileSync(engine + '.key', 'utf8') === key) blocker = ElectronBlocker.deserialize(new Uint8Array(readFileSync(engine))); } catch { blocker = null; }
    if (!blocker) {
      // No kept engine for these lists (and paused sites): built away from the main process, loaded from its bytes.
      let bytes: Uint8Array | null = null;
      try { bytes = await buildAway(withPauses(text, paused), cosmetic); } catch (e) { console.error('shell: ad lists built here instead: ' + (e as Error).message); }
      blocker = bytes ? ElectronBlocker.deserialize(bytes) : ElectronBlocker.parse(withPauses(text, paused), { loadCosmeticFilters: cosmetic });
      const b = bytes ?? blocker.serialize(), k = key;
      setTimeout(() => keepEngine(b, k), 5000).unref?.();
    }
    let on = true;
    blocker.enableBlockingInSession(session);
    // A session has one "before a request" hook; the network guard goes first, then the blocker (2026-10-14).
    if (opts.guard) guardRequests(session, opts.guard, blocker);
    const ab: AdBlock = {
      lists: got,
      stop: () => { on = false; try { blocker!.disableBlockingInSession(session); } catch { /* already off */ } if (opts.guard) guardRequests(session, opts.guard, null); },
      start: () => { on = true; try { blocker!.enableBlockingInSession(session); } catch { /* already on */ } if (opts.guard) guardRequests(session, opts.guard, blocker); },
      pause: (host: string, p: boolean) => ab.pauseMany([host], p),
      pauseMany: (hosts: string[], p: boolean) => { for (const h of hosts) { if (p) paused.add(h); else paused.delete(h); } pauseRules(blocker!, hosts, p); },
    };
    // Fresh lists, quietly: fetched, built in the worker, then the new engine takes over with the same paused sites.
    if (stale) {
      void (async () => {
        const f = await fetchLists();
        if (!f.got || f.got < got || !f.text.trim()) return;      // never swap in fewer lists than are blocking now
        keep(f.text, f.got);
        const now = [...paused];
        const k = keyOf(withPauses(f.text, now));
        if (k === key) return;
        const bytes = await buildAway(withPauses(f.text, now), cosmetic);
        const next = ElectronBlocker.deserialize(bytes);
        // Sites paused or let go while it was building: told to the new engine the slow way.
        const added = [...paused].filter((h) => !now.includes(h)), gone = now.filter((h) => !paused.has(h));
        pauseRules(next, added, true); pauseRules(next, gone, false);
        if (on) { try { blocker!.disableBlockingInSession(session); } catch { /* fine */ } next.enableBlockingInSession(session); if (opts.guard) guardRequests(session, opts.guard, next); }
        blocker = next; key = k; ab.lists = f.got;
        keepEngine(bytes, k);
        console.log(`shell: ad lists refreshed (${f.got} lists)`);
      })().catch((e) => console.error('shell: the ad lists could not be refreshed: ' + (e as Error).message));
    }
    return ab;
  } catch (e) {
    console.error('shell: the ad blocker would not start, so ads are not being blocked: ' + (e as Error).message);
    return null;
  }
}

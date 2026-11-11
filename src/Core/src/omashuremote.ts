// The phone fire remote for Omashu (his couch laptop), served by Aang on the Mac (omashu PLAN Phase 13, MAC.md M3).
// Approved mockups: mockups/omashu/remote/02-fire-remote-live.html (the fire) and 06-wow-chat.html (WoW chat).
//
// Phones on the home Wi-Fi open a page here; only this process talks to the laptop. The laptop's side is the contract in
// the omashu repo (reports/phone-remote-contract.md), faked in test/fakes/omashulaptop.ts:
//   GET /state ("dark": the fire is out; no answer = asleep or off the network), POST /wake (screen on, campfire
//   back), POST /power (the fire out: the laptop goes dark, it does not sleep), GET /chat?after=, POST /chat/send, all
//   with X-Omashu-Key. When /wake gets no answer, a Wake-on-LAN packet goes from here instead. Item, quest and spell tooltips are looked up on Wowhead from here.
//
// Who may use it: a home (private LAN) address AND a paired phone (a key in omashu-remote.json, set as a cookie by
// opening its /pair/<key> link once). The fire is for every paired phone; WoW chat only for phones with "chat": true
// (Joshua's). Chat history is this WoW session only: it is dropped when WoW closes.
import http from 'node:http';
import dgram from 'node:dgram';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { buildLine, CATALOG, CATALOG_FILE, cleanFavourites, isHomeAddress, magicPacket, macBytes, parseChatLine, parseGuildLine, tooltipLines, type ChatLine, type GuildMember, type SendAsk, type TipLine } from './omashu.ts';
import { writeFileAtomic } from './atomic.ts';

export const REMOTE_PORT = 47880;
const ASSETS = path.join(import.meta.dirname, '..', 'assets', 'omashu');

export interface PhoneEntry { name: string; key: string; chat?: boolean; /** Emote favourites (commands), set from the phone. */ favourites?: string[] }
export interface RemoteConfig {
  enabled?: boolean;
  port?: number;
  /** The laptop, from omashu's handoff/laptop.md (never committed). */
  laptop: { url: string; key: string; mac?: string; broadcast?: string[]; wakePort?: number };
  phones: PhoneEntry[];
  /** Wowhead's data set for WoW Forever: "classic" (default), "" for retail, or another of its paths. */
  wowhead?: string;
}

/** The settings file, or null when the remote is not set up. Phones without a key get one (and the file is saved). */
export function loadRemoteConfig(file: string): RemoteConfig | null {
  if (!existsSync(file)) return null;
  let cfg: RemoteConfig;
  try { cfg = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { console.error(`omashu remote: ${file} is not valid JSON: ${(e as Error).message}`); return null; }
  if (!cfg || typeof cfg !== 'object' || !cfg.laptop || typeof cfg.laptop.url !== 'string') { console.error(`omashu remote: ${file} has no laptop.url`); return null; }
  if (!Array.isArray(cfg.phones)) cfg.phones = [];
  let changed = false;
  for (const p of cfg.phones) if (typeof p.key !== 'string' || p.key.length < 20) { p.key = randomBytes(24).toString('base64url'); changed = true; }
  if (changed) writeFileAtomic(file, JSON.stringify(cfg, null, 2) + '\n', { mode: 0o600 });
  return cfg;
}

// ------------------------------------------------------------------ the laptop

type Fetch = typeof fetch;
export interface ChatBatch { session: string | null; seq: number; ah?: boolean; lines: { seq: number; raw: string }[] }

export class Laptop {
  private cfg: RemoteConfig['laptop'];
  private fetchFn: Fetch;
  constructor(cfg: RemoteConfig['laptop'], fetchFn: Fetch = fetch) { this.cfg = cfg; this.fetchFn = fetchFn; }
  private async call(p: string, init: RequestInit = {}, ms = 1500): Promise<Response | null> {
    try {
      return await this.fetchFn(this.cfg.url.replace(/\/$/, '') + p, {
        ...init, headers: { 'X-Omashu-Key': this.cfg.key, ...(init.headers as Record<string, string> ?? {}) }, signal: AbortSignal.timeout(ms),
      });
    } catch { return null; }
  }
  /** Null: no answer, so asleep (or off the network). Dark: awake, but the fire is out (no picture, no game). */
  async state(): Promise<{ game: 'zelda' | 'wow' | null; dark: boolean } | null> {
    const r = await this.call('/state');
    if (!r?.ok) return null;
    const j = await r.json().catch(() => null) as { game?: unknown; dark?: unknown } | null;
    if (!j) return null;
    return { game: j.game === 'zelda' || j.game === 'wow' ? j.game : null, dark: j.dark === true };
  }
  /** Screen on, campfire back. 'busy' when it is mid-close (409); 'down' when it did not answer (or an older laptop). */
  async wake(): Promise<'ok' | 'busy' | 'down'> {
    const r = await this.call('/wake', { method: 'POST' }, 2500);
    return !r ? 'down' : r.ok ? 'ok' : r.status === 409 ? 'busy' : 'down';
  }
  async power(): Promise<'ok' | 'busy' | 'down'> {
    const r = await this.call('/power', { method: 'POST' }, 4000);
    return !r ? 'down' : r.ok ? 'ok' : r.status === 409 ? 'busy' : 'down';
  }
  async chat(after: number): Promise<ChatBatch | null> {
    const r = await this.call(`/chat?after=${Math.max(0, after | 0)}`);
    if (!r?.ok) return null;
    const j = await r.json().catch(() => null) as ChatBatch | null;
    if (!j || !Array.isArray(j.lines)) return null;
    return { session: typeof j.session === 'string' ? j.session : null, seq: Number(j.seq) || 0, ah: j.ah === true, lines: j.lines.filter(l => l && typeof l.raw === 'string' && Number.isFinite(l.seq)) };
  }
  /** Auction search (sheet omashu/remote/14): the laptop types it into aux's search box, only if that box is on screen. */
  async ahSearch(text: string): Promise<{ ok: boolean; why?: string }> {
    const r = await this.call('/ah/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) }, 5000);
    if (!r) return { ok: false, why: 'asleep' };
    const j = await r.json().catch(() => ({})) as { ok?: boolean; why?: string };
    return r.ok && j.ok !== false ? { ok: true } : { ok: false, why: String(j.why ?? r.status) };
  }
  /** Auctionable item names for the phone's suggestions (sheet omashu/remote/15): [name, quality, weight] from aux's own list
   *  (weight: +2 seen for sale, +1 trade good/consumable/reagent). */
  async ahItems(): Promise<{ at: string | null; items: [string, number, number][] } | null> {
    const r = await this.call('/ah/items', {}, 8000);
    if (!r?.ok) return null;
    const j = await r.json().catch(() => null) as { at?: unknown; items?: unknown } | null;
    if (!j || !Array.isArray(j.items)) return null;
    const items = (j.items as unknown[]).filter((x): x is [string, number, number?] => Array.isArray(x) && typeof x[0] === 'string' && x[0].length <= 100 && Number.isInteger(x[1]))
      .slice(0, 30000).map(x => [x[0], Math.max(0, Math.min(7, x[1])), Math.max(0, Math.min(3, Number(x[2]) || 0))] as [string, number, number]);
    return { at: typeof j.at === 'string' ? j.at : null, items };
  }
  async send(line: string): Promise<{ ok: boolean; why?: string }> {
    const r = await this.call('/chat/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ line }) }, 5000);
    if (!r) return { ok: false, why: 'asleep' };
    const j = await r.json().catch(() => ({})) as { ok?: boolean; why?: string };
    return r.ok && j.ok !== false ? { ok: true } : { ok: false, why: String(j.why ?? r.status) };
  }
}

/** Wake-on-LAN: the magic packet to each address (the LAN broadcast and the laptop's own IP), UDP port 9. */
export function sendWake(mac: string, targets: string[], port = 9): Promise<void> {
  const pkt = magicPacket(mac);
  return new Promise((resolve, reject) => {
    const s = dgram.createSocket('udp4');
    s.once('error', e => { s.close(); reject(e); });
    s.bind(0, () => {
      s.setBroadcast(true);
      let left = targets.length;
      if (!left) { s.close(); resolve(); return; }
      for (const t of targets) s.send(pkt, port, t, () => { if (--left === 0) { s.close(); resolve(); } });
    });
  });
}

// ------------------------------------------------------------------ Wowhead

export interface Tip { name: string; kind: 'item' | 'quest' | 'spell'; q?: number; lines: TipLine[] }
const TYPE: Record<number, Tip['kind']> = { 3: 'item', 5: 'quest', 6: 'spell' };
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15';

/** Looks things up on Wowhead's public tooltip data: by id when the chat log kept link codes, by name when it did not. */
export class Wowhead {
  private cache = new Map<string, Tip | null>();
  private flavor: string;
  private fetchFn: Fetch;
  private hosts: { tip: string; search: string };
  constructor(flavor = 'classic', fetchFn: Fetch = fetch, hosts = { tip: 'https://nether.wowhead.com', search: 'https://www.wowhead.com' }) {
    this.flavor = flavor; this.fetchFn = fetchFn; this.hosts = hosts;
  }
  private get dir() { return this.flavor ? '/' + this.flavor.replace(/[^a-z0-9-]/gi, '') : ''; }
  private async json(url: string): Promise<unknown> {
    try {
      const r = await this.fetchFn(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(6000) });
      return r.ok ? await r.json() : null;
    } catch { return null; }
  }
  async byId(kind: Tip['kind'], id: number): Promise<Tip | null> {
    const k = `${kind}:${id}`;
    if (this.cache.has(k)) return this.cache.get(k)!;
    const j = await this.json(`${this.hosts.tip}${this.dir}/tooltip/${kind}/${id}?locale=0`) as { name?: string; quality?: number; tooltip?: string } | null;
    const tip = j && typeof j.name === 'string' && typeof j.tooltip === 'string'
      ? { name: j.name, kind, ...(typeof j.quality === 'number' ? { q: j.quality } : {}),
        // Classic's own tooltips show no item level; Wowhead adds one
        lines: tooltipLines(j.tooltip).filter(l => !(this.flavor === 'classic' && /^Item Level \d+$/.test(l.l))) } : null;
    if (tip || j) this.remember(k, tip);   // a network failure is not remembered, so it is tried again
    return tip;
  }
  async byName(name: string, want?: Tip['kind']): Promise<Tip | null> {
    const k = `name:${want ?? ''}:${name.toLowerCase()}`;
    if (this.cache.has(k)) return this.cache.get(k)!;
    const j = await this.json(`${this.hosts.search}${this.dir}/search/suggestions-template?q=${encodeURIComponent(name)}`) as { results?: { type: number; id: number; name: string }[] } | null;
    const same = (j?.results ?? []).filter(r => TYPE[r.type] && (!want || TYPE[r.type] === want) && String(r.name).toLowerCase() === name.toLowerCase());
    same.sort((a, b) => [3, 5, 6].indexOf(a.type) - [3, 5, 6].indexOf(b.type));
    const tip = same[0] ? await this.byId(TYPE[same[0].type], same[0].id) : null;
    if (tip || j) this.remember(k, tip);
    return tip;
  }
  private remember(k: string, v: Tip | null) { this.cache.set(k, v); while (this.cache.size > 300) this.cache.delete(this.cache.keys().next().value!); }
}

// ------------------------------------------------------------------ the service

export type Fire = 'out' | 'waking' | 'lit' | 'sleeping';
const WAKE_GIVE_UP_MS = 120_000;
const SLEEP_GIVE_UP_MS = 150_000;   // Couch Mode waits up to 90 s for Zelda to close, then forces it
const KEEP_LINES = 2000;

export interface RemoteOpts {
  cfg: RemoteConfig;
  fetch?: Fetch;
  wowhead?: Wowhead;
  wake?: (mac: string, targets: string[], port: number) => Promise<void>;
  /** A whisper came in: buzz Joshua's phone (core.ts sends it through Discord). */
  notify?: (text: string) => void;
  log?: (s: string) => void;
  now?: () => number;
  /** Fast polling for tests. */
  tickMs?: { busy: number; idle: number };
  host?: string;
  /** Saves the settings file after a phone changes its favourites (core.ts writes omashu-remote.json). */
  saveCfg?: (cfg: RemoteConfig) => void;
}

export class OmashuRemote {
  readonly laptop: Laptop;
  private readonly wowhead: Wowhead;
  private server: http.Server | null = null;
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;
  port = 0;

  fire: Fire = 'out';
  game: 'zelda' | 'wow' | null = null;
  private since = 0;          // when 'waking' or 'sleeping' began
  private lookedAt = 0;       // the last time a phone asked
  private session: string | null = null;
  private after = 0;
  private primed = false;     // the first batch of a session is backlog: shown, never buzzed
  lines: ChatLine[] = [];
  whispers = 0;
  /** aux's search box is on screen in WoW (the auction house is open): the phone shows its Auction tab. */
  ah = false;
  /** aux's auctionable items, fetched from the laptop while at the auction house (at most every 5 minutes). */
  items: { at: string | null; items: [string, number, number][] } | null = null;
  private itemsAskedAt = 0;
  /** Who in the guild is online (sheet 11): the last complete list from the add-on; null until one arrives. */
  guild: GuildMember[] | null = null;
  private guildParts: { list: number; n: number; got: (GuildMember | undefined)[] } | null = null;
  private tickRunning: Promise<void> | null = null;

  private o: RemoteOpts;
  constructor(o: RemoteOpts) {
    this.o = o;
    this.laptop = new Laptop(o.cfg.laptop, o.fetch);
    this.wowhead = o.wowhead ?? new Wowhead(o.cfg.wowhead ?? 'classic');
  }
  private now() { return this.o.now?.() ?? Date.now(); }
  private log(s: string) { (this.o.log ?? console.log)(`omashu remote: ${s}`); }

  async start(): Promise<number> {
    this.server = http.createServer((req, res) => { void this.handle(req, res).catch(e => { this.log(`error: ${(e as Error).message}`); if (!res.headersSent) res.writeHead(500).end(); }); });
    await new Promise<void>((resolve, reject) => { this.server!.once('error', reject); this.server!.listen(this.o.cfg.port ?? REMOTE_PORT, this.o.host ?? '0.0.0.0', () => resolve()); });
    const a = this.server.address();
    this.port = typeof a === 'object' && a ? a.port : 0;
    this.schedule(0);
    return this.port;
  }
  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    await this.tickRunning;
    await new Promise<void>(r => this.server ? this.server.close(() => r()) : r());
    this.server?.closeAllConnections?.();
  }

  // ---------- watching the laptop ----------
  private schedule(ms: number) {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.tickRunning = this.tick().finally(() => { this.tickRunning = null; this.schedule(this.pace()); }); }, ms);
  }
  private pace(): number {
    const t = this.o.tickMs ?? { busy: 2000, idle: 10_000 };
    const busy = this.game === 'wow' || this.fire === 'waking' || this.fire === 'sleeping' || this.now() - this.lookedAt < 20_000;
    return busy ? t.busy : t.idle;
  }

  /** One look at the laptop: is it up, what game, and any new chat. */
  async tick(): Promise<void> {
    const st = await this.laptop.state();
    const up = st !== null && !st.dark, now = this.now();       // lit: it answers and is not dark
    if (this.fire === 'waking') { if (up) this.fire = 'lit'; else if (now - this.since > WAKE_GIVE_UP_MS) { this.fire = 'out'; this.log('woke nothing: the laptop stayed dark or did not answer'); } }
    else if (this.fire === 'sleeping') { if (!up) this.fire = 'out'; else if (now - this.since > SLEEP_GIVE_UP_MS) this.fire = 'lit'; }
    else this.fire = up ? 'lit' : 'out';
    this.game = st?.game ?? null;
    if (this.game === 'wow') await this.follow();
    else this.forget();
  }

  private forget() { this.ah = false; this.session = null; this.after = 0; this.lines = []; this.whispers = 0; this.primed = false; this.guild = null; this.guildParts = null; }

  private async follow(): Promise<void> {
    let b = await this.laptop.chat(this.after);
    if (!b) return;
    this.ah = !!b.ah;
    if (this.ah && this.now() - this.itemsAskedAt > 300_000) { this.itemsAskedAt = this.now(); const it = await this.laptop.ahItems(); if (it && it.items.length) this.items = it; }
    if (b.session !== this.session) {
      this.forget();
      this.session = b.session;
      if (!b.session) return;
      if (b.lines.length && b.lines[0].seq > 1) { const all = await this.laptop.chat(0); if (all) b = all; }
    }
    for (const l of b.lines) {
      if (l.seq <= this.after) continue;
      this.after = l.seq;
      const gl = parseGuildLine(l.raw);
      if (gl) { this.takeGuild(gl); continue; }      // the guild list: never shown as chat
      const c = parseChatLine(l.raw, l.seq);
      if (!c) continue;
      this.lines.push(c);
      if (c.kind === 'whisper') {
        this.whispers++;
        if (this.primed) this.o.notify?.(`${c.who} whispers: ${c.text.map(s => 's' in s ? s.s : `[${s.name}]`).join('')}`);
      }
    }
    this.after = Math.max(this.after, b.seq);
    if (this.lines.length > KEEP_LINES) this.lines.splice(0, this.lines.length - KEEP_LINES);
    this.primed = true;
  }

  private takeGuild(g: { list: number; i: number; n: number; m?: GuildMember }) {
    if (g.n === 0) { this.guild = []; this.guildParts = null; return; }
    if (!this.guildParts || this.guildParts.list !== g.list || this.guildParts.n !== g.n) this.guildParts = { list: g.list, n: g.n, got: new Array(g.n) };
    this.guildParts.got[g.i - 1] = g.m;
    let have = 0; for (let k = 0; k < g.n; k++) if (this.guildParts.got[k]) have++;     // (every() skips the holes of a new Array)
    if (have === g.n) { this.guild = this.guildParts.got as GuildMember[]; this.guildParts = null; }
  }

  // ---------- what the phone can do ----------
  async wake(): Promise<Fire> {
    if (this.fire === 'lit' || this.fire === 'waking') return this.fire;
    // Going out (a game still closing, ~40 s for WoW): a touch now never lights it again. 2026-11-11: a touch during
    // WoW's close got 409 busy, was taken for "asleep", showed the fire lit, and the next touch after the close lit it.
    if (this.fire === 'sleeping') return this.fire;
    // dark (awake): the laptop relights itself; asleep or off the network: the magic packet below
    const r = await this.laptop.wake();
    if (r === 'ok') { this.fire = 'waking'; this.since = this.now(); this.schedule(this.pace()); return this.fire; }
    if (r === 'busy') return this.fire;          // awake and in the middle of something: it is not asleep
    const l = this.o.cfg.laptop;
    if (!l.mac || !macBytes(l.mac)) { this.log('wake: no laptop MAC address in omashu-remote.json'); return this.fire; }
    const host = (() => { try { return new URL(l.url).hostname; } catch { return ''; } })();
    const targets = [...new Set([...(l.broadcast ?? []), ...(/^\d+\.\d+\.\d+\.\d+$/.test(host) ? [host] : [])])];
    try { await (this.o.wake ?? sendWake)(l.mac, targets, l.wakePort ?? 9); }
    catch (e) { this.log(`wake: ${(e as Error).message}`); return this.fire; }
    this.fire = 'waking'; this.since = this.now();
    this.schedule(this.pace());
    return this.fire;
  }
  async sleep(): Promise<Fire> {
    if (this.fire === 'out' || this.fire === 'sleeping') return this.fire;
    const r = await this.laptop.power();
    if (r === 'down') this.fire = 'out';
    else if (r === 'ok') { this.fire = 'sleeping'; this.since = this.now(); }
    this.schedule(this.pace());
    return this.fire;
  }

  // ---------- HTTP ----------
  private phoneOf(req: http.IncomingMessage, pairKey?: string): PhoneEntry | null {
    const key = pairKey ?? /(?:^|;\s*)omashu=([A-Za-z0-9_-]{20,64})/.exec(req.headers.cookie ?? '')?.[1];
    if (!key) return null;
    const kb = Buffer.from(key);
    return this.o.cfg.phones.find(p => { const pb = Buffer.from(p.key); return pb.length === kb.length && timingSafeEqual(pb, kb); }) ?? null;
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // Home Wi-Fi only: Tailscale and the internet never get in, paired or not.
    if (!isHomeAddress(req.socket.remoteAddress ?? '')) { res.writeHead(403).end(); return; }
    const url = new URL(req.url ?? '/', 'http://x');
    const p = url.pathname;
    // The home-screen icon: iOS fetches it without the cookie, so it needs no pairing (still home Wi-Fi only).
    if (req.method === 'GET' && (p === '/fire-icon-180.png' || p === '/apple-touch-icon.png')) {
      send(res, 200, readFileSync(path.join(ASSETS, 'fire-icon-180.png')), 'image/png', { 'Cache-Control': 'max-age=86400' });
      return;
    }
    const pair = /^\/pair\/([A-Za-z0-9_-]{20,64})$/.exec(p)?.[1];
    const phone = this.phoneOf(req, pair);
    if (!phone) { send(res, 401, 'This phone is not paired with the fire remote.', 'text/plain; charset=utf-8'); return; }
    this.lookedAt = this.now();

    if (req.method === 'GET' && (p === '/' || pair)) {
      const head: Record<string, string> = pair ? { 'Set-Cookie': `omashu=${pair}; Path=/; Max-Age=315360000; HttpOnly; SameSite=Strict` } : {};
      send(res, 200, readFileSync(path.join(ASSETS, 'remote.html')), 'text/html; charset=utf-8', {
        ...head,
        'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'",
      });
      return;
    }
    if (req.method === 'GET' && p === '/emotes.json') { send(res, 200, readFileSync(CATALOG_FILE), 'application/json'); return; }
    if (req.method === 'GET' && p === '/api/favourites') { json(res, 200, { favourites: phone.favourites ?? CATALOG.favourites }); return; }
    if (req.method === 'GET' && p === '/forest.js') { send(res, 200, readFileSync(path.join(ASSETS, 'forest.js')), 'text/javascript; charset=utf-8'); return; }

    if (req.method === 'GET' && p === '/api/poll') {
      const chat = !!phone.chat && this.game === 'wow';
      const after = Number(url.searchParams.get('after')) || 0;
      const s = url.searchParams.get('session');
      const lines = !chat ? [] : (s && s === this.session ? this.lines.filter(l => l.seq > after) : this.lines).slice(-500);
      json(res, 200, { fire: this.fire, game: this.game, chat, ...(chat ? { session: this.session, whispers: this.whispers, lines, guild: this.guild, ah: this.ah } : {}) });
      return;
    }
    if (req.method === 'GET' && p === '/api/items') {
      if (!phone.chat) { json(res, 403, { ok: false }); return; }
      json(res, 200, this.items ?? { at: null, items: [] });
      return;
    }
    if (req.method === 'GET' && p === '/api/lookup') {
      if (!phone.chat) { json(res, 403, { ok: false }); return; }
      const kind = url.searchParams.get('kind'), id = Number(url.searchParams.get('id')), name = (url.searchParams.get('name') ?? '').slice(0, 120);
      const k = kind === 'item' || kind === 'quest' || kind === 'spell' ? kind : undefined;
      const tip = k && Number.isInteger(id) && id > 0 ? await this.wowhead.byId(k, id) : name ? await this.wowhead.byName(name, k) : null;
      json(res, tip ? 200 : 404, tip ?? { ok: false });
      return;
    }

    if (req.method !== 'POST') { res.writeHead(404).end(); return; }
    // A page elsewhere cannot post here: SameSite=Strict keeps the cookie off cross-site requests, and this header
    // cannot be set by a plain form.
    if (req.headers['x-omashu'] !== '1') { res.writeHead(403).end(); return; }
    if (p === '/api/wake' || p === '/api/sleep') {
      const was = this.fire, fire = p === '/api/wake' ? await this.wake() : await this.sleep();
      this.log(`${phone.name} ${p === '/api/wake' ? 'lights' : 'puts out'} the fire: ${was} -> ${fire}`);
      json(res, 200, { fire });
      return;
    }
    if (p === '/api/favourites') {
      const favs = cleanFavourites((await body(req) as { favourites?: unknown } | null)?.favourites);
      if (!favs) { json(res, 400, { ok: false }); return; }
      phone.favourites = favs;
      try { this.o.saveCfg?.(this.o.cfg); } catch (e) { this.log(`favourites not saved: ${(e as Error).message}`); }
      json(res, 200, { ok: true, favourites: favs });
      return;
    }
    if (!phone.chat) { json(res, 403, { ok: false }); return; }
    if (p === '/api/seen') { this.whispers = 0; json(res, 200, { ok: true }); return; }
    if (p === '/api/ah') {
      const t = (await body(req) as { text?: unknown } | null)?.text;
      const text = typeof t === 'string' ? t.trim() : '';
      if (!text || text.length > 60 || /[\x00-\x1f|\\]/.test(text)) { json(res, 400, { ok: false, why: 'refused' }); return; }
      if (this.game !== 'wow') { json(res, 409, { ok: false, why: 'not-in-wow' }); return; }
      const r = await this.laptop.ahSearch(text);
      json(res, r.ok ? 200 : 409, r);
      return;
    }
    if (p === '/api/send') {
      const ask = await body(req) as SendAsk | null;
      const line = ask ? buildLine(ask) : null;
      if (!line) { json(res, 400, { ok: false, why: 'refused' }); return; }
      if (this.game !== 'wow') { json(res, 409, { ok: false, why: 'not-in-wow' }); return; }
      const r = await this.laptop.send(line);
      json(res, r.ok ? 200 : 409, r);
      if (r.ok) this.schedule(300);   // the echo shows up sooner
      return;
    }
    res.writeHead(404).end();
  }
}

function send(res: http.ServerResponse, code: number, data: string | Buffer, type: string, extra: Record<string, string> = {}) {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', ...extra }).end(data);
}
const json = (res: http.ServerResponse, code: number, v: unknown) => send(res, code, JSON.stringify(v), 'application/json');
function body(req: http.IncomingMessage): Promise<unknown> {
  return new Promise(resolve => {
    let b = '';
    req.on('data', d => { b += d; if (b.length > 4000) { req.destroy(); resolve(null); } });
    req.on('end', () => { try { resolve(JSON.parse(b)); } catch { resolve(null); } });
    req.on('error', () => resolve(null));
  });
}

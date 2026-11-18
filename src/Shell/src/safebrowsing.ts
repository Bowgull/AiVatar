// Google Safe Browsing, private mode (his yes, 2026-11-17: "i dont want people to see what websites im browsing").
//
// Local List Mode of Safe Browsing v5: Samara keeps Google's lists of known scam pages, malware and unwanted
// software on this PC, as 4-byte fingerprints (the first 4 bytes of a SHA-256), and checks every page against them
// here. Only when a page's fingerprint is on a list does Samara ask Google, and then only for that 4-byte
// fingerprint, which thousands of addresses share; Google answers with the full fingerprints behind it and Samara
// compares them here. The address itself never leaves the PC. The "real-time" mode (every page sent) is never used.
//
// Never in the secret window (his ask: "nothing from my secret window is public"): browser.ts gives it none.
// No key (safebrowsing-key.txt beside Samara's state): nothing happens; the daily lists in phish.ts stand alone.
//
// Spec: developers.google.com/safe-browsing/reference (URLs and Hashing; Local Database; hashLists.batchGet;
// hashes.search). The Rice-Golomb layout is the one Google's v4 compression page describes.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { getDomain } from 'tldts-experimental';
import { writeFileAtomic } from './atomic.ts';
import { readJson } from './store.ts';
import { sched } from './sched.ts';

export const SB_NAME = 'GOOGLE SAFE BROWSING';
/** Scam pages, malware, unwanted software (desktop). Google never renames or removes a list. */
export const SB_LISTS = ['se-4b', 'mw-4b', 'uws-4b'] as const;
const API = 'https://safebrowsing.googleapis.com/v5';
const KNOWN_THREATS = new Set(['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION']);
const MIN_WAIT_MS = 30 * 60_000, MAX_WAIT_MS = 24 * 3600_000, MAX_CACHE_MS = 24 * 3600_000;

// ---------- URLs into expressions (URLs and Hashing) ----------

/** Percent-unescape until nothing changes (bad escapes stay as they are). */
function unescapeAll(s: string): string {
  for (let i = 0; i < 1024; i++) {
    const n = s.replace(/%([0-9a-fA-F]{2})/g, (_m, h: string) => String.fromCharCode(parseInt(h, 16)));
    if (n === s) return s;
    s = n;
  }
  return s;
}
/** Escape every character <= 32, >= 127, '#' and '%' (upper-case hex), byte by byte. */
function escapeSb(s: string): string {
  let out = '';
  for (const b of Buffer.from(s, 'latin1')) out += b <= 32 || b >= 127 || b === 0x23 || b === 0x25 ? '%' + b.toString(16).toUpperCase().padStart(2, '0') : String.fromCharCode(b);
  return out;
}
const isIp = (h: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.startsWith('[');

/** The canonical host and path (with and without its query), or null for anything that is not http(s). */
export function canonical(u: string): { host: string; path: string; query: string | null } | null {
  let x: URL;
  try { x = new URL(u.replace(/[\t\r\n]/g, '')); } catch { return null; }
  if (x.protocol !== 'http:' && x.protocol !== 'https:') return null;
  // WHATWG's parser already turned the host into ASCII (Punycode), normalised IPv4 in any notation and IPv6, and
  // resolved /./ and /../. What is left is Safe Browsing's own unescaping and dots and slashes.
  let host = unescapeAll(x.hostname).toLowerCase().replace(/^\.+|\.+$/g, '').replace(/\.{2,}/g, '.');
  const mapped = /^\[(?:::ffff:|64:ff9b::)(\d+\.\d+\.\d+\.\d+)\]$/.exec(host);
  if (mapped) host = mapped[1]!;
  const mappedHex = /^\[(?:::ffff:|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})\]$/.exec(host);
  if (mappedHex) { const a = parseInt(mappedHex[1]!, 16), b = parseInt(mappedHex[2]!, 16); host = [a >> 8, a & 255, b >> 8, b & 255].join('.'); }
  let p = unescapeAll(x.pathname).replace(/\/{2,}/g, '/');
  if (!p.startsWith('/')) p = '/' + p;
  const q = x.search ? unescapeAll(x.search.slice(1)) : null;
  return { host: escapeSb(host), path: escapeSb(p), query: q === null ? null : escapeSb(q) };
}

/** Up to 5 hosts: the exact one, then the registrable domain and up to 3 more leading parts (never for an IP). */
export function hostsOf(host: string): string[] {
  const out = [host];
  if (isIp(host)) return out;
  const reg = getDomain(host, { allowPrivateDomains: false });
  if (!reg || reg === host) return out;
  const extra = host.slice(0, host.length - reg.length - 1).split('.');
  let h = reg;
  const tries = [reg];
  for (let i = extra.length - 1; i >= 0 && tries.length < 4; i--) { h = extra[i] + '.' + h; if (h !== host) tries.push(h); }
  for (const t of tries) if (!out.includes(t)) out.push(t);
  return out.slice(0, 5);
}
/** Up to 6 paths: with its query, without, then "/" and up to 3 more leading directories. */
export function pathsOf(p: string, query: string | null): string[] {
  const out: string[] = [];
  if (query !== null) out.push(p + '?' + query);
  out.push(p);
  const parts = p.split('/').filter(Boolean);
  let acc = '/';
  const pre = [acc];
  for (let i = 0; i < parts.length - (p.endsWith('/') ? 0 : 1) && pre.length < 4; i++) { acc += parts[i] + '/'; pre.push(acc); }
  for (const x of pre) if (!out.includes(x)) out.push(x);
  return out.slice(0, 6);
}
/** Every host-suffix/path-prefix expression for an address (at most 30), or none. */
export function expressions(u: string): string[] {
  const c = canonical(u);
  if (!c) return [];
  const out: string[] = [];
  for (const h of hostsOf(c.host)) for (const p of pathsOf(c.path, c.query)) out.push(h + p);
  return out;
}
export const fullHash = (expr: string): Buffer => createHash('sha256').update(expr, 'latin1').digest();

// ---------- Rice-Golomb (Google's compression) ----------

/** Rice-Golomb deltas from Google's lists: bits are read least significant first within each byte; each delta is a
 *  run of 1s ended by a 0 (the quotient), then `k` remainder bits, least significant first. Returns firstValue and
 *  the running sums, as unsigned 32-bit numbers. */
export function riceDecode32(r: { firstValue?: number | string; riceParameter?: number; entriesCount?: number; encodedData?: string } | undefined): number[] {
  if (!r || (r.firstValue === undefined && !r.entriesCount)) return [];
  const out = [Number(r.firstValue ?? 0) >>> 0];
  const n = Number(r.entriesCount ?? 0), k = Number(r.riceParameter ?? 0);
  if (!n) return out;
  const data = Buffer.from(r.encodedData ?? '', 'base64');
  let bit = 0;
  const next = (): number => { if (bit >= data.length * 8) throw new Error('rice data ran out'); const v = (data[bit >> 3]! >> (bit & 7)) & 1; bit++; return v; };
  let cur = out[0]!;
  for (let i = 0; i < n; i++) {
    let q = 0;
    while (next() === 1) q++;
    let rem = 0;
    for (let j = 0; j < k; j++) rem += next() * 2 ** j;
    cur = (cur + q * 2 ** k + rem) >>> 0;
    out.push(cur);
  }
  return out;
}
const swap32 = (v: number) => (((v & 0xff) << 24) | ((v & 0xff00) << 8) | ((v >>> 8) & 0xff00) | (v >>> 24)) >>> 0;
/** A 4-byte prefix as the number it sorts by (big-endian: numeric order is byte order). */
export const prefixNum = (b: Buffer): number => b.readUInt32BE(0);
/** SHA-256 of the list's prefixes in byte order, as Google's sha256Checksum. */
export function checksumOf(list: Uint32Array): string {
  const b = Buffer.alloc(list.length * 4);
  list.forEach((v, i) => b.writeUInt32BE(v, i * 4));
  return createHash('sha256').update(b).digest('base64');
}

// ---------- one list ----------

export interface HashListJson {
  name?: string; version?: string; partialUpdate?: boolean; minimumWaitDuration?: string; sha256Checksum?: string;
  compressedRemovals?: Parameters<typeof riceDecode32>[0]; additionsFourBytes?: Parameters<typeof riceDecode32>[0];
}
/** Apply one list's answer to what is kept. Which byte order Google's numbers use is told by the checksum: both are
 *  tried, and the one that matches is kept. Throws when neither matches (the caller starts that list again). */
export function applyUpdate(had: Uint32Array, u: HashListJson, order: 'be' | 'le' | ''): { list: Uint32Array; order: 'be' | 'le' } {
  const adds = riceDecode32(u.additionsFourBytes);
  const removals = new Set(riceDecode32(u.compressedRemovals));
  const base = u.partialUpdate ? had.filter((_v, i) => !removals.has(i)) : new Uint32Array(0);
  const tryOrder = (o: 'be' | 'le') => {
    const all = new Uint32Array(base.length + adds.length);
    all.set(base);
    adds.forEach((v, i) => { all[base.length + i] = o === 'be' ? v : swap32(v); });
    all.sort();
    return all;
  };
  const orders: ('be' | 'le')[] = order ? [order] : ['be', 'le'];
  for (const o of orders) {
    const list = tryOrder(o);
    if (!u.sha256Checksum || checksumOf(list) === u.sha256Checksum) return { list, order: o };
  }
  throw new Error(`${u.name ?? 'a list'}: the checksum did not match`);
}
function has(list: Uint32Array, v: number): boolean {
  let lo = 0, hi = list.length - 1;
  while (lo <= hi) { const mid = (lo + hi) >>> 1, x = list[mid]!; if (x === v) return true; if (x < v) lo = mid + 1; else hi = mid - 1; }
  return false;
}
const seconds = (d: string | undefined): number => { const m = /^(\d+(?:\.\d+)?)s$/.exec(d ?? ''); return m ? Number(m[1]) * 1000 : 0; };

// ---------- the check ----------

type Fetch = (url: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export class SafeBrowsing {
  private readonly dir: string;
  private readonly keyFile: string;
  private lists = new Map<string, Uint32Array>();
  private state: { versions: Record<string, string>; order: Record<string, 'be' | 'le'>; next: number } = { versions: {}, order: {}, next: 0 };
  /** prefix (number) -> when the answer runs out, and the full fingerprints (base64) Google named behind it. */
  private cache = new Map<number, { until: number; full: Map<string, string[]> }>();
  private updating = false;
  private readonly fetcher: Fetch;
  constructor(stateDir: string, fetcher: Fetch = fetch as unknown as Fetch) {
    this.fetcher = fetcher;
    this.dir = path.join(stateDir, 'phish');
    this.keyFile = path.join(stateDir, 'safebrowsing-key.txt');
  }
  /** His API key, or '' (then Safe Browsing is off and nothing is ever sent). */
  key(): string { try { return readFileSync(this.keyFile, 'utf8').trim().slice(0, 200); } catch { return ''; } }
  get on(): boolean { return this.key() !== '' && [...this.lists.values()].some((l) => l.length > 0); }
  count(): number { let n = 0; for (const l of this.lists.values()) n += l.length; return n; }

  /** Use the kept lists at once, then keep them fresh when Google says (never sooner than 30 min), quietly. */
  start(): void {
    try { mkdirSync(this.dir, { recursive: true }); } catch { /* checked on write */ }
    this.state = { versions: {}, order: {}, next: 0, ...readJson<any>(path.join(this.dir, 'sb-state.json'), {}) };
    for (const n of SB_LISTS) {
      try {
        const b = readFileSync(path.join(this.dir, `sb-${n}.bin`));
        const l = new Uint32Array(b.length >> 2);
        for (let i = 0; i < l.length; i++) l[i] = b.readUInt32BE(i * 4);
        this.lists.set(n, l);
      } catch { this.lists.set(n, new Uint32Array(0)); delete this.state.versions[n]; }
    }
    if (this.key()) console.log(`shell: safe browsing (private mode): ${this.count()} fingerprints kept`);
    sched.every('safebrowsing.lists', MIN_WAIT_MS, () => this.update(), { quiet: true, first: 5_000 });
  }

  /** Fetch what changed in the three lists, if it is time and there is a key. Only list names and versions go out. */
  async update(force = false): Promise<void> {
    const key = this.key();
    if (!key || this.updating || (!force && Date.now() < this.state.next)) return;
    this.updating = true;
    try {
      const q = new URLSearchParams();
      for (const n of SB_LISTS) q.append('names', n);
      for (const n of SB_LISTS) if (this.state.versions[n]) q.append('version', this.state.versions[n]!);
      q.set('key', key);
      const r = await this.fetcher(`${API}/hashLists:batchGet?${q}`, { signal: AbortSignal.timeout(60_000), headers: { accept: 'application/json' } });
      if (!r.ok) { console.error(`shell: safe browsing lists: Google said ${r.status}`); this.state.next = Date.now() + MIN_WAIT_MS; return; }
      const body = await r.json() as { hashLists?: HashListJson[] };
      let wait = MAX_WAIT_MS;
      for (const u of body.hashLists ?? []) {
        const name = String(u.name ?? '').replace(/^hashLists\//, '');
        if (!(SB_LISTS as readonly string[]).includes(name)) continue;
        try {
          const { list, order } = applyUpdate(this.lists.get(name) ?? new Uint32Array(0), u, this.state.order[name] ?? '');
          this.lists.set(name, list);
          this.state.order[name] = order;
          if (u.version) this.state.versions[name] = u.version;
          const b = Buffer.alloc(list.length * 4);
          list.forEach((v, i) => b.writeUInt32BE(v, i * 4));
          writeFileAtomic(path.join(this.dir, `sb-${name}.bin`), b);
        } catch (e) {
          // Out of step: start this list again next time (a full download).
          console.error('shell: safe browsing: ' + (e as Error).message + '; fetching it whole next time');
          delete this.state.versions[name];
          this.lists.set(name, new Uint32Array(0));
        }
        wait = Math.min(wait, Math.max(MIN_WAIT_MS, seconds(u.minimumWaitDuration)));
      }
      this.state.next = Date.now() + wait;
      console.log(`shell: safe browsing lists: ${this.count()} fingerprints`);
    } catch (e) {
      console.error('shell: safe browsing lists did not load: ' + (e as Error).message);
      this.state.next = Date.now() + MIN_WAIT_MS;
    } finally {
      try { writeFileAtomic(path.join(this.dir, 'sb-state.json'), JSON.stringify(this.state)); } catch { /* next time */ }
      this.updating = false;
    }
  }

  /** The fingerprints of an address whose first 4 bytes are on one of the kept lists. Nothing leaves the PC. */
  private hits(u: string): { prefix: number; full: string }[] {
    if (!this.key()) return [];
    const out: { prefix: number; full: string }[] = [];
    for (const e of expressions(u)) {
      const h = fullHash(e), p = prefixNum(h);
      for (const l of this.lists.values()) if (has(l, p)) { out.push({ prefix: p, full: h.toString('base64') }); break; }
    }
    return out;
  }
  private threatsIn(hits: { prefix: number; full: string }[]): string[] {
    const found = new Set<string>();
    for (const h of hits) for (const t of this.cache.get(h.prefix)?.full.get(h.full) ?? []) found.add(t);
    return [...found];
  }
  private fresh(prefix: number): boolean { const c = this.cache.get(prefix); return Boolean(c && c.until > Date.now()); }

  /** Known now, without asking: a fingerprint Google already confirmed (the synchronous checks use this). */
  known(u: string): boolean { return this.threatsIn(this.hits(u).filter((h) => this.fresh(h.prefix))).length > 0; }
  /** On a kept list and not yet answered: the page must wait for verdict(). */
  suspect(u: string): boolean { return this.hits(u).some((h) => !this.fresh(h.prefix)); }

  /** The threats Google names for this address. Asks only when a 4-byte prefix is on a kept list and not answered
   *  lately, and then sends only those prefixes. Fails open (no answer is not a block), like Chrome. */
  async verdict(u: string): Promise<string[]> {
    const hits = this.hits(u);
    if (!hits.length) return [];
    const ask = [...new Set(hits.filter((h) => !this.fresh(h.prefix)).map((h) => h.prefix))];
    if (ask.length) {
      try {
        const q = new URLSearchParams();
        for (const p of ask) { const b = Buffer.alloc(4); b.writeUInt32BE(p); q.append('hashPrefixes', b.toString('base64')); }
        q.set('key', this.key());
        const r = await this.fetcher(`${API}/hashes:search?${q}`, { signal: AbortSignal.timeout(8_000), headers: { accept: 'application/json' } });
        if (r.ok) {
          const body = await r.json() as { fullHashes?: { fullHash?: string; fullHashDetails?: { threatType?: string; attributes?: string[] }[] }[]; cacheDuration?: string };
          const until = Date.now() + Math.min(MAX_CACHE_MS, Math.max(60_000, seconds(body.cacheDuration)));
          for (const p of ask) this.cache.set(p, { until, full: new Map() });
          for (const f of body.fullHashes ?? []) {
            const full = String(f.fullHash ?? '');
            const b = Buffer.from(full, 'base64');
            if (b.length !== 32) continue;
            const c = this.cache.get(prefixNum(b));
            if (!c) continue;
            // An unknown threat or attribute: that detail is ignored (Google's rule). A canary is never a block, and a
            // frame-only threat is not a reason to stop a whole page: so only details with no attribute at all count.
            const types = (f.fullHashDetails ?? []).filter((d) => KNOWN_THREATS.has(String(d.threatType)) && !(d.attributes ?? []).length).map((d) => String(d.threatType));
            if (types.length) c.full.set(full, types);
          }
        } else console.error(`shell: safe browsing check: Google said ${r.status}`);
      } catch (e) { console.error('shell: safe browsing check did not answer: ' + (e as Error).message); }
    }
    return this.threatsIn(hits);
  }
}
/** Whether a key file is there (Settings shows "on" or how to turn it on). */
export const sbKeyed = (stateDir: string) => existsSync(path.join(stateDir, 'safebrowsing-key.txt'));

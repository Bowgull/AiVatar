// 6.22: known fake and harmful sites, checked before a page loads (sheet 3, section 6).
//
// Three public lists, refreshed daily and kept on this PC, so a check never tells anyone what he is
// visiting: OpenPhish (live phishing URLs), URLhaus (live malware URLs) and Phishing.Database (active
// phishing domains). The research is honest about the limit and so is this: a list cannot catch a fake site
// in its first hour; it catches the known ones, which is most of what reaches an inbox.
//
// Kept as a small index (2026-10-22, measured on his Mac): reading 414,000 names into a Map on every start cost
// ~0.8 s of the main process plus ~1 s of clean-up, and the main process also serves Samara's own pages, so the
// window waited on it. Each list is now a sorted array of 64-bit fingerprints of its names, written once when the
// list changes and read back in a few milliseconds. Two different names sharing a fingerprint is a 1 in 10^13 event
// per check. Old lists are used at once; fresh ones are fetched and indexed in the background.
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { writeFileAtomic } from './atomic.ts';

export const PHISH_LISTS = [
  { name: 'OPENPHISH', url: 'https://openphish.com/feed.txt', kind: 'urls' as const },
  { name: 'URLHAUS', url: 'https://urlhaus.abuse.ch/downloads/text_online/', kind: 'urls' as const },
  { name: 'PHISHING.DATABASE', url: 'https://raw.githubusercontent.com/Phishing-Database/Phishing.Database/master/phishing-domains-ACTIVE.txt', kind: 'domains' as const },
  // 2026-10-14 (security plan, extra shields): two more free lists, refreshed every 12 hours, adding PhishTank and
  // IPThreat on top of the sources above. Same check, same red plate, nothing sent anywhere.
  { name: 'PHISHING FILTER', url: 'https://malware-filter.gitlab.io/malware-filter/phishing-filter-domains.txt', kind: 'domains' as const },
  { name: 'MALWARE FILTER', url: 'https://malware-filter.gitlab.io/malware-filter/urlhaus-filter-domains-online.txt', kind: 'domains' as const },
];
const KEEP_MS = 24 * 3600_000;
/** Hosts that carry many people's pages: a scam page on one is blocked by its own address, never the whole host. */
const SHARED_HOSTS = new Set(['boards.greenhouse.io', 'job-boards.greenhouse.io', 'jobs.lever.co', 'jobs.ashbyhq.com', 'apply.workable.com',
  'docs.google.com', 'drive.google.com', 'sites.google.com', 'forms.office.com', 'onedrive.live.com', 'dropbox.com', 'www.dropbox.com', 'github.com']);

/** Lower-cased host and URL without a trailing slash, the forms the lists use. */
export function norm(u: string): { host: string; url: string } | null {
  try { const x = new URL(u); return { host: x.hostname.toLowerCase().replace(/^www\./, ''), url: (x.origin + x.pathname + x.search).toLowerCase().replace(/\/$/, '') }; }
  catch { return null; }
}

/** Two independent 32-bit FNV-1a hashes of a name, the high and low halves of its fingerprint. */
function hash2(s: string): [number, number] {
  let a = 0x811c9dc5, b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x5bd1e995); b ^= b >>> 13;
  }
  return [a >>> 0, b >>> 0];
}
const key64 = (s: string): bigint => { const [hi, lo] = hash2(s); return (BigInt(hi) << 32n) | BigInt(lo); };

/** One list: its kind and its fingerprints, sorted, so a check is a binary search. */
type Index = { name: string; kind: 'urls' | 'domains'; keys: BigUint64Array };
const MAGIC = 'PHX1';

/** The names a list's text holds, in the form a check looks them up by. Comments and junk are skipped. */
function namesOf(kind: 'urls' | 'domains', text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (kind === 'domains') { const d = line.toLowerCase().replace(/^www\./, ''); if (/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) out.push(d); }
    else { const n = norm(line); if (n) out.push(n.url); }
  }
  return out;
}
/** Fingerprints, sorted and without repeats. Written as two 32-bit halves into the 64-bit array (little-endian). */
function indexOf(name: string, kind: 'urls' | 'domains', names: string[]): Index {
  const all = new BigUint64Array(names.length);
  const half = new Uint32Array(all.buffer);
  names.forEach((s, i) => { const [hi, lo] = hash2(s); half[2 * i] = lo; half[2 * i + 1] = hi; });
  return { name, kind, keys: dedupe(all.sort()) };
}
function has(keys: BigUint64Array, k: bigint): boolean {
  let lo = 0, hi = keys.length - 1;
  while (lo <= hi) { const mid = (lo + hi) >>> 1, v = keys[mid]!; if (v === k) return true; if (v < k) lo = mid + 1; else hi = mid - 1; }
  return false;
}

export class PhishCheck {
  private lists: Index[] = [];
  private readonly dir: string;
  ready = false;
  constructor(stateDir: string) { this.dir = path.join(stateDir, 'phish'); }

  /** Use what is kept at once (even if old), then fetch lists older than a day and index them in the background. */
  async start(fetcher: typeof fetch = fetch): Promise<void> {
    try { mkdirSync(this.dir, { recursive: true }); } catch { /* checked on write */ }
    const file = (l: { name: string }) => path.join(this.dir, `${l.name.toLowerCase()}.txt`);
    const when = (l: { name: string }) => { try { return Number(JSON.parse(readFileSync(file(l) + '.when', 'utf8')).at) || 0; } catch { return 0; } };
    // The index is current when it was made from exactly these list files.
    const stamp = () => JSON.stringify(PHISH_LISTS.map((l) => { try { return [l.name, statSync(file(l)).size, when(l)]; } catch { return [l.name, 0, 0]; } }));
    const idx = path.join(this.dir, 'index-v1.bin');
    if (!this.load(idx, stamp())) await this.rebuild(file, idx, stamp());
    this.ready = true;
    console.log(`shell: phishing lists: ${this.count(['domains'])} domains, ${this.count(['urls'])} addresses`);
    // Fresh lists: fetched one at a time, and the index made again once at the end, softly.
    let changed = false;
    for (const l of PHISH_LISTS) {
      if (Date.now() - when(l) <= KEEP_MS && existsSync(file(l))) continue;
      try {
        const r = await fetcher(l.url, { signal: AbortSignal.timeout(30_000) });
        if (r.ok) { writeFileAtomic(file(l), await r.text()); writeFileAtomic(file(l) + '.when', JSON.stringify({ at: Date.now() })); changed = true; }
        else console.error(`shell: phishing list ${l.name} said ${r.status}`);
      } catch (e) { console.error(`shell: phishing list ${l.name} did not load: ${(e as Error).message}`); }
    }
    if (changed) { await this.rebuild(file, idx, stamp()); console.log(`shell: phishing lists refreshed: ${this.count(['domains'])} domains, ${this.count(['urls'])} addresses`); }
  }

  /** The kept index, if it was made from these list files. */
  private load(idx: string, stamp: string): boolean {
    try {
      if (readFileSync(idx + '.key', 'utf8') !== stamp) return false;
      const buf = readFileSync(idx);
      if (buf.toString('latin1', 0, 4) !== MAGIC) return false;
      const lists: Index[] = [];
      let at = 4;
      const count = buf.readUInt32LE(at); at += 4;
      for (let i = 0; i < count; i++) {
        const nl = buf.readUInt8(at); at += 1;
        const name = buf.toString('utf8', at, at + nl); at += nl;
        const kind = buf.readUInt8(at) === 1 ? 'urls' : 'domains'; at += 1;
        const n = buf.readUInt32LE(at); at += 4;
        at = (at + 7) & ~7;                                   // the keys start on an 8-byte boundary in the file
        const bytes = buf.subarray(at, at + n * 8); at += n * 8;
        if (bytes.length !== n * 8) return false;
        // Copied into its own buffer: a read file's bytes need not sit on an 8-byte boundary in memory.
        lists.push({ name, kind, keys: new BigUint64Array(new Uint8Array(bytes).buffer) });
      }
      this.lists = lists;
      return true;
    } catch { return false; }
  }
  /** Index every kept list (a breath between lists, so the browser keeps answering) and keep the index on disk. */
  private async rebuild(file: (l: { name: string }) => string, idx: string, stamp: string): Promise<void> {
    const lists: Index[] = [];
    for (const l of PHISH_LISTS) {
      let text = '';
      try { text = readFileSync(file(l), 'utf8'); } catch { /* not fetched yet */ }
      // 40,000 lines at a time with a breath between (the biggest list has ~400,000): no stall over ~60 ms on his Mac.
      const lines = text.split(/\r?\n/), names: string[] = [];
      for (let i = 0; i < lines.length; i += 40_000) {
        names.push(...namesOf(l.kind, lines.slice(i, i + 40_000).join('\n')));
        await new Promise<void>((r) => setImmediate(r));
      }
      lists.push(indexOf(l.name, l.kind, names));
      await new Promise<void>((r) => setImmediate(r));
    }
    this.lists = lists;
    try {
      const parts: Buffer[] = [Buffer.from(MAGIC, 'latin1'), u32(lists.length)];
      let at = 8;
      for (const x of lists) {
        const name = Buffer.from(x.name, 'utf8');
        const head = Buffer.concat([Buffer.from([name.length]), name, Buffer.from([x.kind === 'urls' ? 1 : 0]), u32(x.keys.length)]);
        at += head.length; parts.push(head);
        const pad = ((at + 7) & ~7) - at; if (pad) { parts.push(Buffer.alloc(pad)); at += pad; }
        parts.push(Buffer.from(x.keys.buffer, x.keys.byteOffset, x.keys.byteLength)); at += x.keys.byteLength;
      }
      writeFileAtomic(idx, Buffer.concat(parts));
      writeFileAtomic(idx + '.key', stamp);
    } catch (e) { console.error('shell: the phishing index could not be kept: ' + (e as Error).message); }
  }

  /** How many known fake sites and addresses the lists hold, for Settings. */
  count(kinds: ('urls' | 'domains')[] = ['urls', 'domains']): number { return this.lists.filter((x) => kinds.includes(x.kind)).reduce((n, x) => n + x.keys.length, 0); }
  /** Put one list's lines in (tests, and nothing else: the real lists come through start()). */
  add(name: string, kind: 'urls' | 'domains', text: string): void {
    const was = this.lists.find((x) => x.name === name);
    const merged = indexOf(name, kind, namesOf(kind, text));
    if (was) { const all = new BigUint64Array(was.keys.length + merged.keys.length); all.set(was.keys); all.set(merged.keys, was.keys.length); was.keys = dedupe(all.sort()); }
    else this.lists.push(merged);
  }

  /** Which lists name this address, or an empty list when none do. The host and every parent domain count. */
  check(u: string): string[] {
    const n = norm(u);
    if (!n) return [];
    const hits = new Set<string>();
    const url = key64(n.url);
    for (const x of this.lists) if (x.kind === 'urls' && has(x.keys, url)) hits.add(x.name);
    const parts = n.host.split('.');
    for (let i = 0; i < parts.length - 1; i++) {
      const d = parts.slice(i).join('.');
      // A shared host (job boards, Google Docs, Dropbox): one scam page there must not block every real one, so only
      // the exact page counts (2026-10-14: a domain list named boards.greenhouse.io, thousands of real job boards).
      if (SHARED_HOSTS.has(d)) continue;
      const k = key64(d);
      for (const x of this.lists) if (x.kind === 'domains' && has(x.keys, k)) hits.add(x.name);
    }
    return [...hits];
  }
}
function u32(n: number): Buffer { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; }
function dedupe(sorted: BigUint64Array): BigUint64Array {
  let n = 0;
  for (let i = 0; i < sorted.length; i++) if (i === 0 || sorted[i] !== sorted[n - 1]) sorted[n++] = sorted[i]!;
  return sorted.slice(0, n);
}

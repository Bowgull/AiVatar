// 6.22: known fake and harmful sites, checked before a page loads (sheet 3, section 6).
//
// Three public lists, refreshed daily and kept on this PC, so a check never tells anyone what he is
// visiting: OpenPhish (live phishing URLs), URLhaus (live malware URLs) and Phishing.Database (active
// phishing domains). The research is honest about the limit and so is this: a list cannot catch a fake site
// in its first hour; it catches the known ones, which is most of what reaches an inbox.
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { writeFileAtomic } from './atomic.ts';

export const PHISH_LISTS = [
  { name: 'OPENPHISH', url: 'https://openphish.com/feed.txt', kind: 'urls' as const },
  { name: 'URLHAUS', url: 'https://urlhaus.abuse.ch/downloads/text_online/', kind: 'urls' as const },
  { name: 'PHISHING.DATABASE', url: 'https://raw.githubusercontent.com/Phishing-Database/Phishing.Database/master/phishing-domains-ACTIVE.txt', kind: 'domains' as const },
];
const KEEP_MS = 24 * 3600_000;

/** Lower-cased host and URL without a trailing slash, the forms the lists use. */
export function norm(u: string): { host: string; url: string } | null {
  try { const x = new URL(u); return { host: x.hostname.toLowerCase().replace(/^www\./, ''), url: (x.origin + x.pathname + x.search).toLowerCase().replace(/\/$/, '') }; }
  catch { return null; }
}

export class PhishCheck {
  private domains = new Map<string, string[]>();
  private urls = new Map<string, string[]>();
  private readonly dir: string;
  ready = false;
  constructor(stateDir: string) { this.dir = path.join(stateDir, 'phish'); }

  /** Load the cached lists at once, then refresh any older than a day in the background. */
  async start(fetcher: typeof fetch = fetch): Promise<void> {
    try { mkdirSync(this.dir, { recursive: true }); } catch { /* checked on write */ }
    for (const l of PHISH_LISTS) {
      const file = path.join(this.dir, `${l.name.toLowerCase()}.txt`);
      let text = '';
      let stale = true;
      try { if (existsSync(file)) { text = readFileSync(file, 'utf8'); stale = Date.now() - JSON.parse(readFileSync(file + '.when', 'utf8')).at > KEEP_MS; } } catch { /* fetch it */ }
      if (stale) {
        try {
          const r = await fetcher(l.url, { signal: AbortSignal.timeout(30_000) });
          if (r.ok) { text = await r.text(); writeFileAtomic(file, text); writeFileAtomic(file + '.when', JSON.stringify({ at: Date.now() })); }
          else console.error(`shell: phishing list ${l.name} said ${r.status}`);
        } catch (e) { console.error(`shell: phishing list ${l.name} did not load: ${(e as Error).message}`); }
      }
      await this.addSoftly(l.name, l.kind, text);
    }
    this.ready = true;
    console.log(`shell: phishing lists: ${this.domains.size} domains, ${this.urls.size} addresses`);
  }

  /** Put one list's lines in. Comments and blanks are skipped; nothing in a list is ever run or opened. */
  /** How many known fake sites and addresses the lists hold, for Settings. */
  count(): number { return this.domains.size + this.urls.size; }
  add(name: string, kind: 'urls' | 'domains', text: string): void { for (const raw of text.split(/\r?\n/)) this.line(name, kind, raw); }
  /**
   * The same, 5,000 lines at a time with a breath in between (2026-10-12, his "make it fast"): in one go,
   * 386,000 lines held up everything else the browser does for a moment as it started.
   */
  async addSoftly(name: string, kind: 'urls' | 'domains', text: string): Promise<void> {
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 5000) {
      for (let j = i; j < Math.min(lines.length, i + 5000); j++) this.line(name, kind, lines[j]!);
      await new Promise<void>((r) => setImmediate(r));
    }
  }
  private line(name: string, kind: 'urls' | 'domains', raw: string): void {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    if (kind === 'domains') { const d = line.toLowerCase().replace(/^www\./, ''); if (/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) this.mark(this.domains, d, name); }
    else { const n = norm(line); if (n) this.mark(this.urls, n.url, name); }
  }
  private mark(m: Map<string, string[]>, key: string, name: string): void { const a = m.get(key); if (!a) m.set(key, [name]); else if (!a.includes(name)) a.push(name); }

  /** Which lists name this address, or an empty list when none do. The host and every parent domain count. */
  check(u: string): string[] {
    const n = norm(u);
    if (!n) return [];
    const hits = new Set<string>(this.urls.get(n.url) ?? []);
    const parts = n.host.split('.');
    for (let i = 0; i < parts.length - 1; i++) for (const x of this.domains.get(parts.slice(i).join('.')) ?? []) hits.add(x);
    return [...hits];
  }
}

// Sender logos for the morning brief (6.15, sheet 6 section 7, his ask 2026-10-04).
//
// First the company's BIMI logo (the brand mark Gmail shows, published in DNS at default._bimi.<domain>),
// then the website's own icon, then nothing, and the page draws the gold first letter instead.
//
// THREE RULES, each one a reason this file exists rather than an <img src="https://..."> in the page:
//  1. ONCE PER DOMAIN, KEPT ON THIS PC, never per email. A fetch per message would tell a sender the
//     moment their mail was looked at, which is exactly what tracking pixels are for. A failure is kept
//     too, so a domain with no logo is not asked again every morning.
//  2. NEVER A PRIVATE ADDRESS. The domain comes out of an email's From line, which anyone can write. A
//     "From: x@localhost" or a domain that resolves to 192.168.x.x would otherwise make Aang knock on
//     machines inside his own network (server-side request forgery). Names are checked, and so is every
//     address they resolve to, before any request is made, and again for the BIMI link.
//  3. ONLY AS AN IMAGE. What comes back is a stranger's file. It is size-capped, must say it is an image,
//     and reaches the page as a data URL drawn by <img>, where an SVG cannot run anything.
import { lookup, resolveTxt } from 'node:dns/promises';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { isIP } from 'node:net';
import { writeFileAtomic } from './atomic.ts';
import { readJson } from './store.ts';

/** Addresses from these belong to people, not companies: always the letter, never a lookup. */
const PERSONAL = new Set(['gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
  'yahoo.com', 'yahoo.ca', 'icloud.com', 'me.com', 'mac.com', 'proton.me', 'protonmail.com', 'aol.com', 'gmx.com']);

/** How long a result is trusted before it may be looked up again: logos change rarely. */
const KEEP_MS = 30 * 24 * 3600_000;
const MAX_BYTES = 200_000;

/** The domain of the address in a From line, lower case, or null when there is no usable one. */
export function senderDomain(from: string): string | null {
  const m = /@([a-z0-9.-]+\.[a-z]{2,})>?\s*$/i.exec(String(from ?? '').trim());
  return m ? m[1]!.toLowerCase().replace(/\.$/, '') : null;
}

/** The part of a domain a company owns: mail.blizzard.com -> blizzard.com, news.bbc.co.uk -> bbc.co.uk. */
export function brandDomain(domain: string): string {
  const parts = domain.split('.');
  const two = /^(co|com|org|net|ac|gov)$/.test(parts.at(-2) ?? '') && (parts.at(-1) ?? '').length === 2;
  return parts.slice(two ? -3 : -2).join('.');
}

export const isPersonal = (domain: string): boolean => PERSONAL.has(domain);

/** Is this a name it is safe to ask the internet about? Public-looking names only. */
export function publicName(host: string): boolean {
  const h = host.toLowerCase();
  if (!h.includes('.') || isIP(h)) return false;
  if (/(^|\.)(localhost|local|lan|home|internal|intranet|corp|test|invalid|onion|arpa)$/.test(h)) return false;
  return /^[a-z0-9.-]+$/.test(h);
}

/** Does this address belong to the public internet, rather than this PC or his network? */
export function publicAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number) as [number, number];
    return !(a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224);
  }
  if (isIP(ip) === 6) {
    const x = ip.toLowerCase();
    if (x.startsWith('::ffff:')) return publicAddress(x.slice(7));
    return !(x === '::' || x === '::1' || x.startsWith('fc') || x.startsWith('fd') || x.startsWith('fe8')
      || x.startsWith('fe9') || x.startsWith('fea') || x.startsWith('feb') || x.startsWith('ff'));
  }
  return false;
}

type Fetch = (url: string, init?: Record<string, unknown>) => Promise<{ ok: boolean; url?: string; headers: { get(n: string): string | null }; arrayBuffer(): Promise<ArrayBuffer> }>;
type Txt = (name: string) => Promise<string[][]>;
type Lookup = (name: string) => Promise<{ address: string }[]>;

export class Logos {
  private readonly file: string;
  private data: Record<string, { at: number; img: string | null }> = {};
  private readonly fetcher: Fetch;
  private readonly txt: Txt;
  private readonly resolve: Lookup;
  private readonly now: () => number;
  constructor(dir: string, fetcher?: Fetch, txt?: Txt, resolve?: Lookup, now: () => number = Date.now) {
    this.fetcher = fetcher ?? ((u, i) => fetch(u, i as RequestInit) as never);
    this.txt = txt ?? resolveTxt;
    this.resolve = resolve ?? ((n) => lookup(n, { all: true }));
    this.now = now;
    this.file = path.join(dir, 'logos.json');
    this.data = readJson(this.file, {});
  }

  /** What is kept for a domain: a data URL, null for "has none", undefined for "not looked up yet". */
  get(domain: string): string | null | undefined {
    const d = this.data[domain];
    if (!d || this.now() - d.at > KEEP_MS) return undefined;
    return d.img;
  }

  /**
   * Look up the domains not kept yet, all at once, giving up after `budgetMs` so the brief is never
   * held up: one still on its way is simply a letter this morning and a logo tomorrow.
   */
  async ensure(domains: string[], budgetMs = 3000): Promise<void> {
    const todo = [...new Set(domains)].filter((d) => publicName(d) && !isPersonal(d) && this.get(d) === undefined).slice(0, 12);
    if (!todo.length) return;
    const work = Promise.all(todo.map(async (d) => {
      const img = await this.find(d).catch(() => null);
      this.data[d] = { at: this.now(), img };
    }));
    await Promise.race([work, new Promise((r) => setTimeout(r, budgetMs).unref?.())]);
    // Whatever finished is kept; the rest is kept when it lands.
    void work.then(() => this.save());
    this.save();
  }

  private save(): void {
    try { mkdirSync(path.dirname(this.file), { recursive: true }); writeFileAtomic(this.file, JSON.stringify(this.data)); }
    catch { /* a logo is a nicety */ }
  }

  private async find(domain: string): Promise<string | null> {
    const brand = brandDomain(domain);
    for (const d of [...new Set([domain, brand])]) {
      try {
        const recs = (await this.txt(`default._bimi.${d}`)).map((r) => r.join(''));
        const rec = recs.find((r) => /^v=BIMI1/i.test(r.trim()));
        const l = rec ? /(?:^|;)\s*l=([^;\s]+)/i.exec(rec)?.[1] : undefined;
        if (l) { const img = await this.image(l); if (img) return img; }
      } catch { /* no BIMI record: the usual case */ }
    }
    for (const u of [`https://${brand}/apple-touch-icon.png`, `https://${brand}/favicon.ico`]) {
      const img = await this.image(u);
      if (img) return img;
    }
    return null;
  }

  /** One image, or null. Every guard in the header comment is applied here, before and after. */
  private async image(url: string): Promise<string | null> {
    let u: URL;
    try { u = new URL(url); } catch { return null; }
    if (u.protocol !== 'https:' || !publicName(u.hostname)) return null;
    const addrs = await this.resolve(u.hostname).catch(() => []);
    if (!addrs.length || !addrs.every((a) => publicAddress(a.address))) return null;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    try {
      // No redirects followed: a redirect is a second address that was never checked.
      const r = await this.fetcher(u.href, { redirect: 'error', signal: ctrl.signal, headers: { accept: 'image/*' } });
      if (!r.ok) return null;
      const type = (r.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
      if (!/^image\/(png|x-icon|vnd\.microsoft\.icon|svg\+xml|jpeg|gif|webp)$/.test(type)) return null;
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 64 || buf.length > MAX_BYTES) return null;
      return `data:${type};base64,${buf.toString('base64')}`;
    } catch { return null; } finally { clearTimeout(t); }
  }
}

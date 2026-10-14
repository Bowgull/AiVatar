// The browser's History (his design, 2026-10-12): every page he opened, kept 90 days, only on this PC.
// One small JSON file in the Shell's own state folder, written atomically and at most every few seconds.
// Plain functions over a list, so they can be tested without Electron.
import { existsSync, readFileSync } from 'node:fs';
import { writeFileAtomic } from './atomic.ts';

export interface Visit { url: string; title: string; at: number }

export const KEEP_DAYS = 90;
const DAY = 86_400_000;
const MAX = 20_000;

/** Only real web pages count: no Aang pages, no blank tabs, no data or file addresses. */
export function counts(url: string): boolean { return /^https?:\/\//i.test(url) && url.length <= 2000; }

/** Add a visit. The same page again within a minute is one visit (reloads, redirects, fragments). */
/**
 * Banking and money sites are never kept in his history (his call, 2026-10-13), so they can never reach Aang
 * either. Banks and credit unions (Canadian first), cards, payments, brokers and crypto.
 */
const MONEY_HOSTS = /(^|\.)(rbc|royalbank|rbcroyalbank|td|tdcanadatrust|tdbank|easyweb|scotiabank|scotiaonline|bmo|cibc|nbc|bnc|desjardins|tangerine|simplii|eqbank|pcfinancial|motusbank|meridiancu|vancity|atb|hsbc|chase|bankofamerica|wellsfargo|citi|citibank|capitalone|americanexpress|amex|paypal|interac|wise|revolut|venmo|cash|koho|neofinancial|mogo|wealthsimple|questrade|qtrade|interactivebrokers|fidelity|vanguard|schwab|robinhood|coinbase|binance|kraken|crypto|stripe|moneris|square|afterpay|klarna|affirm|turbotax|wealthica)\.(com|ca|co|net|org|app)$/i;
export function neverKeep(url: string): boolean {
  let host = '';
  try { host = new URL(url).hostname.toLowerCase().replace(/\.+$/, ''); } catch { return false; }
  return MONEY_HOSTS.test(host) || /(^|[.-])(bank|banque|creditunion|caisse)([.-]|$)/.test(host) || /online-?banking|onlinebanking/.test(host);
}

export function addVisit(list: Visit[], url: string, title: string, now: number): Visit[] {
  if (neverKeep(url)) return list;
  if (!counts(url)) return list;
  const last = list[list.length - 1];
  const same = (a: string) => a.replace(/#.*$/, '') === url.replace(/#.*$/, '');
  if (last && same(last.url) && now - last.at < 60_000) { last.at = now; if (title) last.title = title.slice(0, 300); return list; }
  list.push({ url, title: (title || '').slice(0, 300), at: now });
  return prune(list, now);
}

/** The page's name arrives after the visit: put it on the newest visit to that page. */
export function nameVisit(list: Visit[], url: string, title: string): void {
  for (let i = list.length - 1, n = 0; i >= 0 && n < 50; i--, n++) if (list[i].url === url) { list[i].title = String(title).slice(0, 300); return; }
}

export function prune(list: Visit[], now: number): Visit[] {
  const from = now - KEEP_DAYS * DAY;
  let i = 0;
  while (i < list.length && list[i].at < from) i++;
  const out = i ? list.slice(i) : list;
  return out.length > MAX ? out.slice(out.length - MAX) : out;
}

/** Newest first, matching every word he typed in the name or the address. */
export function search(list: Visit[], q: string, offset: number, limit: number): { items: Visit[]; more: boolean } {
  const words = String(q ?? '').toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
  const hit = (v: Visit) => { const s = (v.title + ' ' + v.url.replace(/^https?:\/\/(www\.)?/, '')).toLowerCase(); return words.every((w) => s.includes(w)); };
  const items: Visit[] = [];
  let skipped = 0;
  for (let i = list.length - 1; i >= 0; i--) {
    if (words.length && !hit(list[i])) continue;
    if (skipped < offset) { skipped++; continue; }
    if (items.length === limit) return { items, more: true };
    items.push(list[i]);
  }
  return { items, more: false };
}

/** Take one visit off (by its address and time), or clear a stretch: the last hour, today, or everything. */
/**
 * For Aang, only when he asks (2026-10-13): the pages whose title or address hold every word, newest first, from
 * the last `days` days, one line per page (the same page visited again counts once). Titles and addresses only;
 * no page text is kept.
 */
export function forAang(list: Visit[], q: string, days: number, limit: number, now: number): { title: string; url: string; at: number }[] {
  const words = q.toLowerCase().split(/\s+/).filter((w) => w.length > 1).slice(0, 8);
  const from = now - Math.max(1, Math.min(90, days)) * 86_400_000;
  const seen = new Set<string>(), out: { title: string; url: string; at: number }[] = [];
  for (let i = list.length - 1; i >= 0 && out.length < limit; i--) {
    const v = list[i]!;
    if (v.at < from) continue;                     // skipped, not stopped: an out-of-order entry must not hide newer ones
    if (neverKeep(v.url) || seen.has(v.url)) continue;
    const s = (v.title + ' ' + v.url.replace(/^https?:\/\/(www\.)?/, '')).toLowerCase();
    if (words.length && !words.every((w) => s.includes(w))) continue;
    seen.add(v.url);
    out.push({ title: v.title.slice(0, 160), url: v.url.slice(0, 300), at: v.at });
  }
  return out;
}

export function forget(list: Visit[], url: string, at: number): Visit[] { return list.filter((v) => !(v.url === url && v.at === at)); }
export function clearSince(list: Visit[], from: number): Visit[] { return from <= 0 ? [] : list.filter((v) => v.at < from); }

export class Visits {
  list: Visit[] = [];
  private timer: NodeJS.Timeout | null = null;
  private readonly file: string;
  constructor(file: string) {
    this.file = file;
    try {
      if (existsSync(file)) {
        const a = JSON.parse(readFileSync(file, 'utf8'));
        if (Array.isArray(a)) this.list = prune(a.filter((v: Partial<Visit>) => typeof v?.url === 'string' && counts(v.url) && !neverKeep(v.url) && Number.isFinite(v.at))
          .map((v: Visit) => ({ url: v.url, title: String(v.title ?? '').slice(0, 300), at: Number(v.at) })).sort((x, y) => x.at - y.at), Date.now());
      }
    } catch { /* none yet */ }
  }
  /** M6: told of each change, so the other machine's browser gets it too. */
  onChange: ((c: { op: 'add'; v: Visit } | { op: 'forget'; url: string; at: number } | { op: 'clear'; from: number }) => void) | null = null;
  add(url: string, title: string): void {
    const n = this.list.length, last = this.list[n - 1];
    this.list = addVisit(this.list, url, title, Date.now()); this.save();
    const now = this.list[this.list.length - 1];
    if (now && (this.list.length !== n || now !== last)) this.onChange?.({ op: 'add', v: { ...now } });
  }
  name(url: string, title: string): void { nameVisit(this.list, url, title); this.save(); }
  forget(url: string, at: number): void { this.list = forget(this.list, url, at); this.save(true); this.onChange?.({ op: 'forget', url, at }); }
  clear(from: number): void { this.list = clearSince(this.list, from); this.save(true); this.onChange?.({ op: 'clear', from }); }
  /** M6: visits from the other machine, put in time order. */
  merge(list: Visit[]): void {
    if (!list.length) return;
    this.list = prune([...this.list, ...list.filter((v) => counts(v.url) && !neverKeep(v.url))].sort((x, y) => x.at - y.at), Date.now());
    this.save();
  }
  /** Written a few seconds after the last change (a page load names itself in bursts); right away for a removal. */
  save(now = false): void {
    if (this.timer) clearTimeout(this.timer);
    const write = () => { this.timer = null; try { writeFileAtomic(this.file, JSON.stringify(this.list)); } catch (e) { console.error('shell: history not saved: ' + (e as Error).message); } };
    if (now) write(); else this.timer = setTimeout(write, 4000);
  }
  flush(): void { if (this.timer) { clearTimeout(this.timer); this.timer = null; try { writeFileAtomic(this.file, JSON.stringify(this.list)); } catch { /* best effort */ } } }
}

// 6.25a: the driving rules (decision 42) as pure functions, testable without Electron.

/** What a click or a key would do, judged from the element itself. */
export type Weight = 'free' | 'lever' | 'never';

/** Words on a control that mean it sends, posts or changes something for him: the held lever. */
const LEVER = /\b(send|post|publish|reply|comment|tweet|share|apply|submit|sign ?in|log ?in|sign ?up|register|join|subscribe|unsubscribe|follow|delete|remove|discard|confirm|save|update|accept|agree|continue to|book|reserve|vote|upload|message)\b/i;
/** Words that mean money: never. */
const NEVER = /\b(buy|purchase|checkout|check out|place (your )?order|pay|payment|add to (cart|bag|basket)|donate|subscribe and pay|order now|complete order|billing)\b/i;

/** The pure judgement, testable without a page. */
export function weigh(it: { kind: string; label: string; search?: boolean; formSearch?: boolean }): Weight {
  const label = String(it.label ?? '');
  if (it.kind === 'password' || it.kind === 'payment') return 'never';
  if (it.kind === 'file') return 'lever';                                          // a file of his leaves the machine: asked every time
  if (NEVER.test(label)) return 'never';
  if (it.kind === 'link') return LEVER.test(label) && /delete|remove|unsubscribe|sign ?out|log ?out/i.test(label) ? 'lever' : 'free';
  if (it.kind === 'search') return 'free';
  if (it.kind === 'text' || it.kind === 'select') return 'free';                  // typing is free; sending it is not
  if (it.kind === 'submit') return it.formSearch ? 'free' : 'lever';
  if (it.kind === 'button') return LEVER.test(label) ? 'lever' : 'free';
  return 'free';
}

/** A job's name for its trail: his words, short, in capitals like his trails. */
export function cleanName(s: string): string {
  const w = String(s ?? '').replace(/[^\p{L}\p{N}' ]+/gu, ' ').replace(/\s+/g, ' ').trim();
  return (w || 'AANG').slice(0, 24).toUpperCase();
}

// ---- driver v2 (his "I want everything", 2026-10-14; research_notes/driver-upgrades): the pure parts.

/**
 * A site checking whether he is a bot: stop at once, never solve it (research_notes/job-hunt-safety). Judged from the
 * page's title, its first words and its address.
 */
export function challengeOf(p: { title?: string; text?: string; url?: string }): string | null {
  const t = `${p.title ?? ''}\n${String(p.text ?? '').slice(0, 1500)}`;
  const u = String(p.url ?? '');
  if (/\/checkpoint\/|\/authwall|captcha|\/sorry\/|challenges\.cloudflare\.com|\/cdn-cgi\/challenge/i.test(u)) return 'a security check';
  if (/just a moment\.\.\./i.test(t)) return 'a security check';
  if (/\b(verify (that )?you('| a)re (a )?human|are you a robot|i'?m not a robot|security (check|verification)|unusual activity|suspicious activity|checking your browser|too many requests|access denied|rate limit(ed)?|let'?s do a quick security check)\b/i.test(t)) return 'a security check';
  return null;
}

/** Sites where a person's pace is kept between page loads (his safety rule): the least seconds, plus up to `jitter` more. */
const PACED: { host: RegExp; least: number; jitter: number }[] = [
  { host: /(^|\.)linkedin\.com$/i, least: 20, jitter: 40 },
  { host: /(^|\.)indeed\.(com|ca)$/i, least: 15, jitter: 30 },
  { host: /(^|\.)glassdoor\.(com|ca)$/i, least: 15, jitter: 30 },
];
export function paceFor(host: string): { least: number; jitter: number } | null {
  const h = String(host ?? '').toLowerCase();
  const p = PACED.find((x) => x.host.test(h));
  return p ? { least: p.least, jitter: p.jitter } : null;
}

export interface ReadItem { n: number; kind: string; role?: string; label: string; href: string; state?: string; ctx?: string }
/** Only what changed since the last read: new lines of text, and controls that are new or changed. */
export function diffRead(prev: { lines: string[]; items: ReadItem[] } | undefined, next: { lines: string[]; items: ReadItem[] }): { lines: string[]; items: ReadItem[]; sameLines: number; sameItems: number } {
  if (!prev) return { lines: next.lines, items: next.items, sameLines: 0, sameItems: 0 };
  const had = new Set(prev.lines);
  const key = (i: ReadItem) => `${i.n}|${i.kind}|${i.label}|${i.state ?? ''}|${i.href}`;
  const hadI = new Set(prev.items.map(key));
  const lines = next.lines.filter((l) => !had.has(l));
  const items = next.items.filter((i) => !hadI.has(key(i)));
  return { lines, items, sameLines: next.lines.length - lines.length, sameItems: next.items.length - items.length };
}

export interface PageState { url: string; title: string; focus: number | null; dialogs: string[]; textLen: number; lines: string[]; el?: { n: number; value?: string; state?: string; gone?: boolean } }
/** What an action did, in plain words, so a click that silently failed is never reported as done. */
export function whatChanged(a: PageState, b: PageState): string[] {
  const out: string[] = [];
  if (a.url !== b.url) out.push(`the page moved to ${b.url}`);
  else if (a.title !== b.title) out.push(`the title is now "${b.title}"`);
  const newDialogs = b.dialogs.filter((d) => !a.dialogs.includes(d));
  if (newDialogs.length) out.push(`a box opened: ${newDialogs.map((d) => `"${d}"`).join(', ')}`);
  if (a.dialogs.length && !b.dialogs.length) out.push('the box closed');
  if (b.el?.gone && !a.el?.gone) out.push(`control ${b.el.n} is gone`);
  else if (a.el && b.el && !b.el.gone) {
    if ((a.el.value ?? '') !== (b.el.value ?? '')) out.push(`control ${b.el.n} now says "${String(b.el.value ?? '').slice(0, 60)}"`);
    if ((a.el.state ?? '') !== (b.el.state ?? '')) out.push(`control ${b.el.n} is now ${b.el.state || 'plain'}`);
  }
  if (a.focus !== b.focus && b.focus !== null) out.push(`control ${b.focus} has the cursor`);
  if (a.url === b.url) {
    const had = new Set(a.lines);
    const fresh = b.lines.filter((l) => !had.has(l));
    if (fresh.length) out.push(`new on the page: ${fresh.slice(0, 4).map((l) => `"${l.slice(0, 80)}"`).join('; ')}${fresh.length > 4 ? ` (+${fresh.length - 4} more lines)` : ''}`);
    else if (Math.abs(a.textLen - b.textLen) > 40) out.push('the page\'s words changed');
  }
  return out;
}

// ---- job-hunt parity (2026-10-14, research_notes/job-hunt-skill/analysis.md) ----

/**
 * The job boards his skill sweeps (its references/boards.md): the search path ({q} is the keyword), the card selector,
 * and the seconds between searches. LinkedIn is not here on purpose: it is read by real page loads (collect), never
 * fetched in bulk.
 */
export interface Board { name: string; host: RegExp; path: string; card: string; spacing: number }
export const BOARDS: Board[] = [
  { name: 'indeed', host: /(^|\.)indeed\.(com|ca)$/i, path: '/jobs?q={q}&l=Toronto%2C+ON&fromage=3', card: '.job_seen_beacon', spacing: 11 },
  { name: 'eluta', host: /(^|\.)eluta\.ca$/i, path: '/search?q={q}&l=Toronto', card: '.organic-job', spacing: 2.5 },
  { name: 'simplyhired', host: /(^|\.)simplyhired\.(ca|com)$/i, path: '/search?q={q}&l=Toronto%2C+ON&t=3', card: '[data-testid="searchSerpJob"]', spacing: 3.5 },
  { name: 'ziprecruiter', host: /(^|\.)ziprecruiter\.(ca|com)$/i, path: '/jobs-search?search={q}&location=Toronto%2C+ON&days=3&country=ca', card: 'article', spacing: 4.5 },
  { name: 'glassdoor', host: /(^|\.)glassdoor\.(ca|com)$/i, path: '/Job/jobs.htm?sc.keyword={q}&locT=C&locId=2281069&fromAge=3', card: 'li[data-test="jobListing"]', spacing: 6 },
  { name: 'jobbank', host: /(^|\.)jobbank\.gc\.ca$/i, path: '/jobsearch/jobsearch?searchstring={q}&locationstring=Toronto%2C+ON&sort=D&fage=3', card: 'article', spacing: 3 },
  { name: 'jobs.ca', host: /(^|\.)jobs\.ca$/i, path: '/jobs?q={q}&location=Toronto%2C+ON&radius=50', card: 'article', spacing: 3.5 },
  { name: 'weworkremotely', host: /(^|\.)weworkremotely\.com$/i, path: '/remote-jobs/search?term={q}', card: 'li.new-listing-container', spacing: 3 },
  { name: 'hcareers', host: /(^|\.)hcareers\.(ca|com)$/i, path: '/jobs?what={q}&where=Toronto%2C+ON', card: 'article', spacing: 2.5 },
];
export function boardFor(host: string): Board | null { const h = String(host ?? '').toLowerCase(); return BOARDS.find((b) => b.host.test(h)) ?? null; }

/** A sweep's own search: a same-site path with {q}, and a card selector. Anything else is refused. */
export function sweepPlan(host: string, o: { path?: string; card?: string; spacing?: number }): { path: string; card: string; spacing: number } | string {
  if (/(^|\.)linkedin\.com$/i.test(host)) return 'LinkedIn is never swept in bulk (his safety rule): open its search pages and use browser_collect_jobs';
  const b = boardFor(host);
  const path = String(o.path ?? b?.path ?? '');
  const card = String(o.card ?? b?.card ?? '');
  if (!path.startsWith('/') || path.startsWith('//') || !path.includes('{q}') || path.length > 300) return 'a sweep needs a path on this same site that starts with / and has {q} where the keyword goes';
  if (!card || card.length > 200) return 'a sweep needs a card selector (how one posting is marked on the page)';
  const least = Math.max(2.5, b?.spacing ?? 4);
  return { path, card, spacing: Math.max(least, Number(o.spacing) || 0) };
}

/** A full-page check (stop the session) or a box on a form for him to tick (keep going, say "needs Josh"). */
export function challengeLevel(p: { title?: string; url?: string; host?: string }): 'page' | 'box' {
  if (paceFor(String(p.host ?? ''))) return 'page';
  if (/\/checkpoint\/|\/authwall|\/sorry\/|challenges\.cloudflare\.com|\/cdn-cgi\/challenge/i.test(String(p.url ?? ''))) return 'page';
  if (/just a moment|security (check|verification)|unusual activity|too many requests|access denied|are you a robot|verify you are human/i.test(String(p.title ?? ''))) return 'page';
  return 'box';
}

/** Only his own documents go up: a PDF, Word or text file in his home folder, not hidden, under 10 MB. */
export function uploadable(file: string, home: string, size: number): string | null {
  const f = String(file ?? '').replace(/\\/g, '/');
  const h = String(home ?? '').replace(/\\/g, '/').replace(/\/+$/, '');
  if (!f || !h || !f.toLowerCase().startsWith(h.toLowerCase() + '/')) return 'only a file in his own home folder';
  if (f.split('/').some((part) => part.startsWith('.') || part === '..')) return 'not from a hidden folder';
  if (!/\.(pdf|docx?|txt|rtf)$/i.test(f)) return 'only a PDF, Word or text file';
  if (!(size > 0) || size > 10 * 1024 * 1024) return 'the file is empty or over 10 MB';
  return null;
}

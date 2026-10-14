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
/** A host as the rules read it: lower case, without the trailing dot that would slip past every pattern (AI lockdown,
 *  2026-10-14: "linkedin.com." lost the pace rule and "rbc.com." the bank block). */
export const cleanHost = (h: string): string => String(h ?? '').toLowerCase().replace(/\.+$/, '');
/** This machine, the home network and Tailscale: never opened by a driving session (a page could probe them). */
export function privateHost(host: string): boolean {
  const h = cleanHost(host).replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.ts.net') || h === '0.0.0.0' || h === '::1' || h === '::') return true;
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h);
  if (m) { const [a, b] = [Number(m[1]), Number(m[2])]; return a === 127 || a === 10 || a === 0 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127); }
  return /^(fc|fd|fe8|fe9|fea|feb)[0-9a-f]*:/.test(h);
}
/**
 * Private Network Access, done here (2026-10-14; Electron switches Chrome's own off): a page from the internet never
 * reaches this computer, the home network or Tailscale (the brain's doors, the router, the printer). Pages that are
 * themselves local (Samara's own pages, his router's page he typed in) still load their own parts. Top-level
 * navigation is his to make, so it is left alone. True = stop the request.
 */
export function reachesIn(url: string, from: string, mainFrame: boolean): boolean {
  if (mainFrame) return false;
  let to = '', by = '';
  try { const u = new URL(url); if (u.protocol !== 'http:' && u.protocol !== 'https:' && u.protocol !== 'ws:' && u.protocol !== 'wss:') return false; to = u.hostname; } catch { return false; }
  if (!privateHost(to)) return false;
  try { by = new URL(from).hostname; } catch { return true; }   // no known page behind it: never let it in
  return !privateHost(by);
}
/** A site's own name ("linkedin.com", "bbc.co.uk", "someone.github.io"): two labels, three under shared endings. */
export function siteOf(host: string): string {
  const parts = cleanHost(host).replace(/^www\./, '').split('.').filter(Boolean);
  const two = parts.slice(-2).join('.');
  const shared = /^(co|com|org|net|ac|gov|edu)\.[a-z]{2}$|^(gc|on|qc|bc|ab)\.ca$|^(github|gitlab)\.io$|^(pages|workers)\.dev$|^(vercel|netlify|herokuapp|web|firebaseapp|appspot|azurewebsites|cloudfront|blogspot|myshopify|wixsite|wordpress|substack|notion|bubbleapps|glitch|onrender|fly)\.(app|com|site|me|io|net|dev)$/;
  return parts.length > 2 && shared.test(two) ? parts.slice(-3).join('.') : two;
}
/** A job scan's own sites (AI lockdown G1, 2026-10-14): signed in as him here; anywhere else is read logged out. */
export const JOB_SITES = ['linkedin.com', 'indeed.com', 'ziprecruiter.com', 'jobbank.gc.ca', 'eluta.ca', 'jobs.ca', 'workopolis.com', 'weworkremotely.com', 'hcareers.com',
  'greenhouse.io', 'lever.co', 'ashbyhq.com', 'myworkdayjobs.com', 'workable.com', 'bamboohr.com', 'smartrecruiters.com', 'icims.com', 'jobvite.com', 'rippling.com',
  'recruitee.com', 'breezy.hr', 'applytojobs.ca', 'teamtailor.com', 'comeet.co', 'dayforcehcm.com', 'successfactors.com', 'taleo.net', 'ultipro.com', 'paylocity.com', 'pinpointhq.com', 'oraclecloud.com'];
/** Is this task a job hunt (its sites are the job sites)? */
export const jobTask = (name: string): boolean => /job|scan|appl|career|hunt|recruit|linkedin|indeed/i.test(String(name ?? ''));
/** What private detail an address carries out to another site, or '' (AI lockdown G2): an email, a phone number, a long
 *  block of encoded data, or an address far longer than a page link needs. */
export function carriesData(u: string): string {
  let x: URL; try { x = new URL(u); } catch { return ''; }
  let s = x.pathname + x.search + x.hash; try { s = decodeURIComponent(s.replace(/\+/g, ' ')); } catch { /* as it is */ }
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(s)) return 'an email address';
  if (/(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/.test(s)) return 'a phone number';
  if (/[A-Za-z0-9+/_-]{120,}={0,2}/.test(s)) return 'a long block of encoded data';
  if ((x.search + x.hash).length > 1500) return 'a very long address';
  return '';
}
/** Does this text look like his personal details (AI lockdown G3)? An email, a phone number, or one of his own words. */
/**
 * Words on a page aimed at an AI assistant (2026-10-14): "ignore your previous instructions", "you are now an AI
 * agent", fake system or assistant turns, "don't tell the user". A real page talks to people, never to the model
 * reading it. Returns the first such phrase, or ''.
 */
const AI_TALK = [
  /\b(ignore|disregard|forget|override)\s+(all\s+|any\s+)?(of\s+)?(the\s+|your\s+|my\s+)?(previous|prior|above|earlier|preceding|original|system)\s+(instructions?|prompts?|rules|directions|guidelines)/i,
  /\b(you are|you're|act as)\s+(now\s+)?(an?\s+)?(ai|ai assistant|language model|llm|claude|chatgpt|gpt|gemini|browser agent)\b(?![-\s]*(powered|driven|enthusiast|company|startup|team|first|native|tools?|products?|platform))/i,
  /\b(system prompt|developer message|new instructions|hidden instructions?)\b/i,
  /(^|\n)\s*(system|assistant)\s*:/i,
  /<\/?\s*(system|instructions?|assistant|user_query|im_start)\b/i,
  /\b(do not|don't|never)\s+(tell|inform|alert)\s+(the\s+)?(user|human|joshua)\b/i,
  /\b(attention|note|message)\s+(to|for)\s+(the\s+|any\s+)?(ai|assistant|llm|ai agent|claude|chatgpt|model)\b/i,
];
export function talksToAI(text: string): string {
  const t = String(text ?? '');
  for (const re of AI_TALK) { const m = re.exec(t); if (m) return t.slice(m.index, m.index + 80).replace(/\s+/g, ' ').trim(); }
  return '';
}

export function personal(text: string, words: string[] = []): string {
  const t = String(text ?? '');
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(t)) return 'an email address';
  if (/(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/.test(t)) return 'a phone number';
  const low = t.toLowerCase();
  const w = words.find((x) => x.trim().length >= 4 && low.includes(x.trim().toLowerCase()));
  return w ? 'your personal details' : '';
}
export function paceFor(host: string): { least: number; jitter: number } | null {
  const h = cleanHost(host);
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
export function boardFor(host: string): Board | null { const h = cleanHost(host); return BOARDS.find((b) => b.host.test(h)) ?? null; }

/** A sweep's own search: a same-site path with {q}, and a card selector. Anything else is refused. */
export function sweepPlan(host: string, o: { path?: string; card?: string; spacing?: number }): { path: string; card: string; spacing: number } | string {
  host = cleanHost(host);
  if (/(^|\.)linkedin\.com$/i.test(host)) return 'LinkedIn is never swept in bulk (his safety rule): open its search pages and use browser_collect_jobs';
  const b = boardFor(host);
  const path = String(o.path ?? b?.path ?? '');
  const card = String(o.card ?? b?.card ?? '');
  // A backslash counts as a slash to a browser: "/\\other.site" would leave this site (AI lockdown G12).
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\') || !path.includes('{q}') || path.length > 300) return 'a sweep needs a path on this same site that starts with / and has {q} where the keyword goes';
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
  // Never his apps' own folders (code audit M7, 2026-10-14): settings, keys, Aang's memory, Samara's data.
  const rest = '/' + f.slice(h.length + 1).toLowerCase() + '/';
  if (/\/(appdata|library|application data)\//.test(rest) || /^\/documents\/(aang|aangapp)\//.test(rest)) return 'not from a folder that holds your apps\' own data';
  if (!/\.(pdf|docx?|txt|rtf)$/i.test(f)) return 'only a PDF, Word or text file';
  if (!(size > 0) || size > 10 * 1024 * 1024) return 'the file is empty or over 10 MB';
  return null;
}

// ---- the job digest (2026-10-14, his "lighter but as powerful"): his skill's own filters (li_extract.js, verbatim),
// only new postings, near misses kept, and the full list in a file instead of the conversation.
export const HOT = /customer success|client success|customer experience|client services|client relationship|account manager|account coordinator|account service|onboarding|implementation|enablement|activation|partner success|partner manager|renewals|customer operations|guest experience|student success|engagement manager|operations coordinator|project coordinator|program coordinator|vendor manager|event coordinator|event manager|relationship manager|order management|sales support|production coordinator|campaign manager|technical account|customer support|customer service|logistics coordinator|supply chain coordinator|catering|field marketing|client operations|solutions manager|delivery manager/i;
export const SKIP = /senior|\bsr\b|director|\bvp\b|vice|head of|principal|staff|architect|engineer|developer|bilingu|french|\bintern\b|\bSAP\b|oracle|netsuite|workday|technician|driver|store manager|warehouse|sales rep|business development|territory|nurse|clinical|payroll|recruit|estimator|legal|junior|restaurant manager|assistant manager|cook|server|cashier|analyst|consultant|\berp\b/i;
export const AWAY = /Quebec|QC\b|Montr|Vancouver|BC\b|Alberta|Calgary|Edmonton|Manitoba|Winnipeg|Halifax|Nova Scotia|Saskatchewan|Victoria/i;
/** Titles that are roles like his but not in his lane words: shown as near misses so an odd title is never lost. */
const ROLEISH = /\b(manager|coordinator|specialist|associate|representative|advisor|partner|lead|success|client|customer|account|operations|program|project)\b/i;

// His data (tracker, Aug 28 to Sep 24 2026) on top of the research: 2 of 11 LinkedIn Easy Apply applications got good
// interviews (Octup, BIS Safety Software), none of ~20 company-form ones did; his interviews are at small companies in
// mid-level roles, while $120K+ enterprise and senior roles went nowhere. So: Account Executive comes through flagged
// (BoomerangFX, his call 2026-10-14), mid-level is ranked first, high-level is kept but marked, stale/reposted is dropped.
const SALES = /account executive/i;
const HIGH = /enterprise|strategic|\bmajor\b|mid-?market|global|\blead\b|team lead|\bhead of\b|\bsenior\b|\bsr\.?\b/i;
const STALE = /reposted|(\b[3-9]|\d{2,})\s+weeks?\s+ago|months?\s+ago|30\+\s+days|\b(2[2-9]|[3-9]\d)\s+days?\s+ago/i;
export interface Posting { flags?: string[]; title: string; company?: string; location?: string; posted?: string; salary?: string; easyApply?: string; url?: string; text?: string; keyword?: string }
export const postingKey = (p: Posting) => String(p.url || `${p.title}|${p.company ?? ''}|${p.location ?? ''}`).toLowerCase().trim();

/** The same job on another board: its title and company, plainly. */
export const sameJobKey = (p: Posting) => (p.company ? `job:${String(p.title || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}|${String(p.company).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}` : '');
/** The yearly top of a pay line ("CA$80K/yr - CA$95K/yr", "$40 an hour"), or null. */
export function topPay(s: string): number | null {
  const nums = [...String(s ?? '').matchAll(/\$\s?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s?([kK])?(\s?(?:\/|an?|per)\s?(?:hour|hr))?/g)].map((m) => { let v = Number(m[1]!.replace(/,/g, '')); if (m[2]) v *= 1000; if (m[3]) v *= 2080; return v; }).filter((v) => v >= 20_000);
  return nums.length ? Math.max(...nums) : null;
}

/** Sort postings: new matches (mid-level first, flags on), near misses, and counts of the rest. */
export function digest(list: Posting[], seen: Set<string>): { match: Posting[]; near: Posting[]; isNew: number; old: number; skipped: number; away: number; stale: number; dupes: number } {
  const match: Posting[] = [], near: Posting[] = [];
  let isNew = 0, old = 0, skipped = 0, away = 0, stale = 0, dupes = 0;
  const here = new Set<string>();
  for (const p of list) {
    const k = postingKey(p), k2 = sameJobKey(p);
    if (!k || seen.has(k) || (k2 && seen.has(k2))) { old++; continue; }
    if (k2 && here.has(k2)) { dupes++; continue; }
    if (k2) here.add(k2);
    isNew++;
    const title = p.title || String(p.text ?? '').split(' | ')[0] || '';
    const where = `${p.location ?? ''} ${p.text ?? ''}`;
    if (SKIP.test(title)) { skipped++; continue; }
    if (AWAY.test(where)) { away++; continue; }
    if (STALE.test(`${p.posted ?? ''} ${p.text ?? ''}`)) { stale++; continue; }
    const flags: string[] = [];
    if (SALES.test(title)) flags.push('sales role: check the commission and quota');
    const top = topPay(`${p.salary ?? ''} ${p.text ?? ''}`);
    const high = HIGH.test(title) || (top !== null && top >= 120_000);
    if (high) flags.push('aims high (enterprise or senior level): his interviews came from mid-level roles');
    if (top !== null && top < 75_000) flags.push(`pay tops out at $${Math.round(top / 1000)}K`);
    const q = { ...p, flags };
    if (HOT.test(title) || SALES.test(title)) match.push(q); else if (ROLEISH.test(title)) near.push(q); else skipped++;
  }
  // Mid-level first: his interviews came from those; high-level and low-pay stay, below.
  const rank = (p: Posting) => (p.flags?.some((f) => f.startsWith('aims high') || f.startsWith('pay tops')) ? 1 : 0);
  match.sort((a, b) => rank(a) - rank(b));
  return { match, near, isNew, old, skipped, away, stale, dupes };
}
/** One short line per posting. */
export function line(p: Posting): string {
  const t = p.title || String(p.text ?? '').split(' | ')[0] || '';
  return [t, p.company, p.location, p.salary, p.posted, p.easyApply ? 'Easy Apply' : '', p.url, ...(p.flags ?? []).map((f) => `[${f}]`)].filter(Boolean).map((x) => String(x).replace(/\s+/g, ' ').trim()).join(' | ').slice(0, 260);
}

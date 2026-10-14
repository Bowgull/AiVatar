/**
 * Target companies (his picks 2026-10-14; research_notes/job-hunt-skill/what-gets-interviews-2026.md, change #2): the
 * companies he approved are checked on their own public job boards (Greenhouse, Lever, Ashby) ONLY when he asks or runs
 * his job scan. His rule, same day: "NO AUTO SCANNING". Nothing here runs on a timer. Company career pages convert about
 * twice as well as job boards, and about half of hires applied in a posting's first week.
 *
 * Public, read-only, no account and no login: these are the boards the companies publish for exactly this. The filters
 * are his job-hunt skill's (li_extract.js HOT/SKIP/AWAY, verbatim), his $80K floor (Ontario postings must show a range
 * since 2026-01-01), Toronto or remote Canada, and the ghost-job rules (older than 21 days, "not an existing vacancy").
 */

export interface Company { company: string; ats: 'greenhouse' | 'lever' | 'ashby'; slug: string }
export interface Opening { company: string; ats: string; id: string; title: string; location: string; url: string; postedMs: number | null; payMin: number | null; payMax: number | null; text: string }

export const HOT = /customer success|client success|customer experience|client services|client relationship|account manager|account coordinator|account service|onboarding|implementation|enablement|activation|partner success|partner manager|renewals|customer operations|guest experience|student success|engagement manager|operations coordinator|project coordinator|program coordinator|vendor manager|event coordinator|event manager|relationship manager|order management|sales support|production coordinator|campaign manager|technical account|customer support|customer service|logistics coordinator|supply chain coordinator|catering|field marketing|client operations|solutions manager|delivery manager/i;
export const SKIP = /senior|\bsr\b|director|\bvp\b|vice|head of|principal|staff|architect|engineer|developer|bilingu|french|\bintern\b|\bSAP\b|oracle|netsuite|workday|technician|driver|store manager|warehouse|sales rep|business development|territory|nurse|clinical|payroll|recruit|estimator|legal|junior|restaurant manager|assistant manager|cook|server|cashier|analyst|consultant|\berp\b/i;
export const AWAY = /Quebec|QC\b|Montr|Vancouver|BC\b|Alberta|Calgary|Edmonton|Manitoba|Winnipeg|Halifax|Nova Scotia|Saskatchewan|Victoria/i;
const HERE = /toronto|ontario|\bON\b|\bGTA\b|mississauga|markham|vaughan|oakville|canada|remote\b/i;
const NOT_CANADA = /\b(US|USA|United States|UK|United Kingdom|EMEA|Europe|APAC|India|Australia|Brazil|Mexico)\b(?![^()]*canada)/i;
// His call 2026-10-14: Account Executive comes through, flagged (BoomerangFX gave him a panel interview). Enterprise-level
// roles are kept but ranked below mid-level ones, where all his interviews came from.
const SALES = /account executive/i;
const HIGH = /enterprise|strategic|\bmajor\b|mid-?market|global|\blead\b|team lead/i;
export const FLOOR = 80_000, NEAR_FLOOR = 75_000, STALE_DAYS = 21;

const strip = (h: string) => String(h ?? '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/** The pay range in a posting's words, as yearly dollars: "$80,000 - $95,000", "$80K to $95K", "$40/hour". */
export function payIn(text: string): { min: number; max: number } | null {
  const t = String(text ?? '');
  const nums: number[] = [];
  const re = /(?:CA\$|C\$|CAD\s?\$?|\$)\s?(\d{1,3}(?:[,\s]\d{3})+|\d+(?:\.\d+)?)\s?([kK])?(?:\s?(?:\/|per|an?)\s?(hour|hr|year|yr|annum))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    let v = Number(m[1]!.replace(/[,\s]/g, ''));
    if (m[2]) v *= 1000;
    if (/hour|hr/i.test(m[3] ?? '')) v *= 2080;
    if (v >= 20_000 && v <= 500_000) nums.push(Math.round(v));
  }
  if (!nums.length) return null;
  return { min: Math.min(...nums), max: Math.max(...nums) };
}

/** Each board's own shape, made the same. */
export function normalize(c: Company, raw: unknown): Opening[] {
  const out: Opening[] = [];
  const j = raw as any;
  if (c.ats === 'greenhouse') {
    for (const x of Array.isArray(j?.jobs) ? j.jobs : []) {
      const text = strip(x.content ?? '');
      const p = payIn(text);
      out.push({ company: c.company, ats: 'greenhouse', id: String(x.id), title: String(x.title ?? ''), location: String(x.location?.name ?? ''), url: String(x.absolute_url ?? ''),
        postedMs: Date.parse(x.first_published ?? x.updated_at ?? '') || null, payMin: p?.min ?? null, payMax: p?.max ?? null, text: text.slice(0, 4000) });
    }
  } else if (c.ats === 'lever') {
    for (const x of Array.isArray(j) ? j : []) {
      const text = strip(x.descriptionPlain ?? x.description ?? '') + ' ' + strip((x.lists ?? []).map((l: any) => l.content).join(' ')) + ' ' + strip(x.additionalPlain ?? '');
      const s = x.salaryRange;
      const p = s && Number(s.max) ? { min: Number(s.min) * (/hour/i.test(s.interval ?? '') ? 2080 : 1), max: Number(s.max) * (/hour/i.test(s.interval ?? '') ? 2080 : 1) } : payIn(text);
      out.push({ company: c.company, ats: 'lever', id: String(x.id), title: String(x.text ?? ''), location: [x.categories?.location, ...(x.categories?.allLocations ?? []), x.workplaceType].filter(Boolean).join(' / '), url: String(x.hostedUrl ?? ''),
        postedMs: Number(x.createdAt) || null, payMin: p?.min ?? null, payMax: p?.max ?? null, text: text.slice(0, 4000) });
    }
  } else if (c.ats === 'ashby') {
    for (const x of Array.isArray(j?.jobs) ? j.jobs : []) {
      const text = strip(x.descriptionPlain ?? x.descriptionHtml ?? '');
      const comp = (x.compensation?.summaryComponents ?? []).find((s: any) => /salary/i.test(s.compensationType ?? '')) ?? null;
      const yearly = (v: number) => (/hour/i.test(comp?.interval ?? '') ? v * 2080 : v);
      const p = comp && Number(comp.maxValue) ? { min: yearly(Number(comp.minValue)), max: yearly(Number(comp.maxValue)) } : payIn(`${x.compensation?.compensationTierSummary ?? ''} ${text}`);
      out.push({ company: c.company, ats: 'ashby', id: String(x.id), title: String(x.title ?? ''), location: [x.location, ...(x.secondaryLocations ?? []).map((l: any) => l.location), x.isRemote ? 'Remote' : '', x.workplaceType].filter(Boolean).join(' / '), url: String(x.jobUrl ?? ''),
        postedMs: Date.parse(x.publishedAt ?? '') || null, payMin: p?.min ?? null, payMax: p?.max ?? null, text: text.slice(0, 4000) });
    }
  }
  return out.filter((o) => o.title && /^https:\/\//.test(o.url));
}

export type Verdict = { keep: true; flags: string[] } | { keep: false; why: string };
/** His filters, in order. Kept postings carry flags he should see (no pay range, near his floor). */
export function judge(o: Opening, now = Date.now()): Verdict {
  if (!HOT.test(o.title) && !SALES.test(o.title)) return { keep: false, why: 'not his lanes' };
  if (SKIP.test(o.title)) return { keep: false, why: 'his skip list' };
  if (AWAY.test(o.location)) return { keep: false, why: 'outside his area' };
  if (!HERE.test(o.location) || (NOT_CANADA.test(o.location) && !/canada|toronto|ontario/i.test(o.location))) return { keep: false, why: 'not Toronto or remote Canada' };
  if (/bilingual|french is required|fluent in french/i.test(o.text)) return { keep: false, why: 'French required' };
  if (o.postedMs && now - o.postedMs > STALE_DAYS * 86_400_000) return { keep: false, why: `older than ${STALE_DAYS} days` };
  if (/not (?:for |currently )?an? existing vacanc|not currently vacant|for future (?:openings|opportunities)|talent (?:pool|pipeline|community)\b/i.test(`${o.title} ${o.text}`)) return { keep: false, why: 'not an existing vacancy' };
  const flags: string[] = [];
  if (SALES.test(o.title)) flags.push('sales role: check the commission and quota');
  if (HIGH.test(o.title) || (o.payMax ?? 0) >= 120_000) flags.push('aims high (enterprise level): his interviews came from mid-level roles');
  if (o.payMax === null) flags.push('no pay range posted');
  else if (o.payMax < NEAR_FLOOR) return { keep: false, why: `pay tops out at $${Math.round(o.payMax / 1000)}K` };
  else if (o.payMax < FLOOR) flags.push(`pay tops out at $${Math.round(o.payMax / 1000)}K, under $80K`);
  return { keep: true, flags };
}

export function boardUrl(c: Company): string {
  const s = encodeURIComponent(c.slug);
  if (c.ats === 'greenhouse') return `https://boards-api.greenhouse.io/v1/boards/${s}/jobs?content=true`;
  if (c.ats === 'lever') return `https://api.lever.co/v0/postings/${s}?mode=json`;
  return `https://api.ashbyhq.com/posting-api/job-board/${s}?includeCompensation=true`;
}

/** One pass over his companies: new postings that pass, and what each board said. A second each between boards. */
export async function sweepCompanies(list: Company[], seen: Set<string>, get: typeof fetch = fetch, now = Date.now()): Promise<{ fresh: (Opening & { flags: string[] })[]; checked: number; failed: string[]; seenKeys: string[] }> {
  const fresh: (Opening & { flags: string[] })[] = [];
  const failed: string[] = [];
  const seenKeys: string[] = [];
  let checked = 0;
  for (const c of list) {
    try {
      const r = await get(boardUrl(c), { headers: { 'User-Agent': 'Mozilla/5.0 Aang (personal job alerts)', Accept: 'application/json' }, signal: AbortSignal.timeout(20_000) });
      if (!r.ok) { failed.push(`${c.company} (${r.status})`); continue; }
      checked++;
      for (const o of normalize(c, await r.json())) {
        const key = `${o.ats}:${c.slug}:${o.id}`;
        seenKeys.push(key);
        if (seen.has(key)) continue;
        const v = judge(o, now);
        if (v.keep) fresh.push({ ...o, flags: v.flags });
      }
    } catch (e) { failed.push(`${c.company} (${(e as Error).message.slice(0, 40)})`); }
    await new Promise((res) => setTimeout(res, 1000));
  }
  // Mid-level first; the high-aiming ones stay, below.
  fresh.sort((a, b) => Number(a.flags.some((f) => f.startsWith('aims high'))) - Number(b.flags.some((f) => f.startsWith('aims high'))));
  return { fresh, checked, failed, seenKeys };
}

/** The bubble's line for one new posting. */
export function alertLine(o: Opening & { flags: string[] }): string {
  const pay = o.payMax ? ` $${Math.round((o.payMin ?? o.payMax) / 1000)}K${o.payMin && o.payMin !== o.payMax ? `-$${Math.round(o.payMax / 1000)}K` : ''}` : '';
  return `New at ${o.company}: ${o.title}, ${o.location}${pay}${o.flags.length ? ` (${o.flags.join('; ')})` : ''}`;
}

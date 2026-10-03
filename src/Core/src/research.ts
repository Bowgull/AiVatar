// Phase 7: what is trending, from sources that need no key and no scraping.
//
// Joshua, 2026-10-03: "can we also get aang to weekly scan github or find something that shows whats
// trending on github all time and weekly... not just that but what people are generally doing with AI
// agents if something is coming up frequently to look into it like when harnesses first started coming
// out i.e hermes open claw etc."
//
// THE RULE THAT MATTERS is the second half of that sentence, not the first. A list of this week's
// popular repositories is easy and nearly useless - it is mostly the same tutorial repos and framework
// rewrites every week. The thing he actually wants is "people keep mentioning X", which needs memory
// across weeks, and lives in mentions.ts rather than here.
//
// APIs, never scraping. GitHub, Hacker News and arXiv all publish real ones that need no key, and a
// scraped trending page breaks silently the first time someone changes a CSS class. Reddit is included
// but treated as optional: it blocks unfamiliar callers often enough that it must never fail the sweep.
import type { Fetch } from './google.ts';

/** One thing found out there. `id` is stable so the same repo next week is recognised, not re-reported. */
export interface Finding {
  source: 'github' | 'hn' | 'reddit' | 'arxiv';
  id: string;
  title: string;
  url: string;
  by: string;
  /** Stars, points, upvotes. Only comparable WITHIN a source, never across. */
  score: number;
  at: string;
  blurb: string;
  lang?: string;
  licence?: string;
}

const UA = 'Aang/1.0 (personal assistant; one user; https://github.com/Bowgull)';

/** A fetch that gives up rather than hanging the sweep, and never throws. */
async function get(fetch: Fetch, url: string, ms = 20_000): Promise<any | null> {
  try {
    const timer = AbortSignal.timeout?.(ms);
    void timer;
    const r = await Promise.race([
      fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } }),
      new Promise<null>(res => setTimeout(() => res(null), ms)),
    ]);
    if (!r || !r.ok) {
      if (r) console.error(`research: ${new URL(url).host} said ${r.status}`);
      return null;
    }
    return await r.json();
  } catch (e) {
    console.error(`research: ${url.slice(0, 60)} failed: ${(e as Error).message}`);
    return null;
  }
}

const clip = (s: unknown, n: number) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/**
 * Repositories that got popular recently.
 *
 * GitHub has no official "trending" endpoint - the trending page is a web page, not an API. The search
 * API sorted by stars with a created-after filter is the honest approximation and is a real, supported,
 * keyless endpoint. It answers "new and already popular", which is what trending means in practice.
 *
 * Unauthenticated search allows 10 requests a minute, which is ample for something that runs weekly.
 */
export async function trendingRepos(fetch: Fetch, sinceDays = 7, topics = ['ai-agents', 'llm', 'mcp']): Promise<Finding[]> {
  const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString().slice(0, 10);
  const out: Finding[] = [];
  for (const topic of topics) {
    const q = encodeURIComponent(`topic:${topic} created:>${since}`);
    const j = await get(fetch, `https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=10`);
    for (const r of j?.items ?? []) {
      if (out.some(f => f.id === `gh:${r.id}`)) continue;
      out.push({
        source: 'github', id: `gh:${r.id}`,
        title: clip(r.full_name, 120), url: String(r.html_url ?? ''),
        by: clip(r.owner?.login, 60), score: Number(r.stargazers_count ?? 0),
        at: String(r.created_at ?? ''), blurb: clip(r.description, 300),
        lang: clip(r.language, 30) || undefined,
        licence: clip(r.license?.spdx_id, 30) || undefined,
      });
    }
  }
  return out;
}

/**
 * The same, but for things that are merely popular rather than new - the "all time" half of his ask.
 * Sorted by stars with no date filter, so it answers "what do people actually use for this".
 */
export async function establishedRepos(fetch: Fetch, topic: string): Promise<Finding[]> {
  const j = await get(fetch, `https://api.github.com/search/repositories?q=${encodeURIComponent(`topic:${topic}`)}&sort=stars&order=desc&per_page=10`);
  return (j?.items ?? []).map((r: any) => ({
    source: 'github' as const, id: `gh:${r.id}`,
    title: clip(r.full_name, 120), url: String(r.html_url ?? ''),
    by: clip(r.owner?.login, 60), score: Number(r.stargazers_count ?? 0),
    at: String(r.created_at ?? ''), blurb: clip(r.description, 300),
    lang: clip(r.language, 30) || undefined,
    licence: clip(r.license?.spdx_id, 30) || undefined,
  }));
}

/**
 * Hacker News, through Algolia's search API: free, keyless, and the place agent tooling surfaces first.
 *
 * Points are the filter rather than recency. Anything can be posted; a story has to be found useful by
 * a few hundred people to clear 150, and that is a far better signal than "it was posted".
 */
export async function hackerNews(fetch: Fetch, sinceDays = 7, minPoints = 150, terms = ['AI agent', 'LLM agent', 'MCP']): Promise<Finding[]> {
  const after = Math.floor((Date.now() - sinceDays * 86_400_000) / 1000);
  const out: Finding[] = [];
  for (const term of terms) {
    const u = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(term)}&tags=story&numericFilters=created_at_i>${after},points>${minPoints}&hitsPerPage=10`;
    const j = await get(fetch, u);
    for (const h of j?.hits ?? []) {
      const id = `hn:${h.objectID}`;
      if (out.some(f => f.id === id)) continue;
      out.push({
        source: 'hn', id,
        title: clip(h.title, 200),
        // A text post has no url of its own; the discussion IS the thing, so point at it.
        url: String(h.url || `https://news.ycombinator.com/item?id=${h.objectID}`),
        by: clip(h.author, 60), score: Number(h.points ?? 0),
        at: String(h.created_at ?? ''), blurb: clip(h.story_text, 300),
      });
    }
  }
  return out;
}

/**
 * arXiv. Slower and heavier than the rest, and worth it for one reason: it is the primary source.
 *
 * This is the step that catches a vendor number. Jev's headline 193x was its own claim; independently
 * it is 1.7-25x, and the only way to know that is to read the paper rather than the announcement.
 *
 * Returns Atom XML, not JSON, so it is parsed with a narrow regex rather than a parser - this reads one
 * known feed shape, and pulling in an XML library for it would be the heavier mistake.
 */
export async function papers(fetch: Fetch, terms = ['LLM agent', 'tool use'], max = 8): Promise<Finding[]> {
  const out: Finding[] = [];
  for (const term of terms) {
    const u = `http://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(`"${term}"`)}&sortBy=submittedDate&sortOrder=descending&max_results=${max}`;
    let xml = '';
    try {
      const r = await fetch(u, { headers: { 'User-Agent': UA } });
      if (!r.ok) { console.error(`research: arxiv said ${r.status}`); continue; }
      xml = await r.text();
    } catch (e) { console.error('research: arxiv failed: ' + (e as Error).message); continue; }
    for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
      const e = m[1];
      const pick = (tag: string) => clip(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`).exec(e)?.[1], 400);
      const id = pick('id');
      if (!id || out.some(f => f.id === `arxiv:${id}`)) continue;
      out.push({
        source: 'arxiv', id: `arxiv:${id}`,
        title: pick('title').slice(0, 200), url: id,
        by: clip(/<name>([\s\S]*?)<\/name>/.exec(e)?.[1], 60),
        score: 0, at: pick('published'), blurb: pick('summary').slice(0, 300),
      });
    }
  }
  return out;
}

/**
 * Reddit, where people say what actually worked on real hardware.
 *
 * Optional by design. Reddit blocks unfamiliar callers often and without warning, so this returns an
 * empty list rather than failing, and the sweep must never depend on it.
 */
export async function reddit(fetch: Fetch, subs = ['LocalLLaMA'], period = 'week'): Promise<Finding[]> {
  const out: Finding[] = [];
  for (const sub of subs) {
    const j = await get(fetch, `https://www.reddit.com/r/${sub}/top.json?t=${period}&limit=10`);
    for (const c of j?.data?.children ?? []) {
      const d = c?.data ?? {};
      out.push({
        source: 'reddit', id: `rd:${d.id}`,
        title: clip(d.title, 200),
        url: `https://www.reddit.com${String(d.permalink ?? '')}`,
        by: clip(d.author, 60), score: Number(d.ups ?? 0),
        at: new Date(Number(d.created_utc ?? 0) * 1000).toISOString(),
        blurb: clip(d.selftext, 300),
      });
    }
  }
  return out;
}

/**
 * Everything, once. Each source is allowed to fail on its own without taking the sweep with it, because
 * four partial answers are worth more than one failure.
 */
export async function sweep(fetch: Fetch, sinceDays = 7): Promise<Finding[]> {
  const parts = await Promise.all([
    trendingRepos(fetch, sinceDays).catch(() => []),
    hackerNews(fetch, sinceDays).catch(() => []),
    papers(fetch).catch(() => []),
    reddit(fetch).catch(() => []),
  ]);
  const all = parts.flat();
  const seen = new Set<string>();
  return all.filter(f => f.id && f.title && readable(f) && !seen.has(f.id) && (seen.add(f.id), true));
}

/**
 * Something he can actually read.
 *
 * The first real digest carried a Claude Code course written in Russian, a hot-topic site framework in
 * Chinese and a Japanese text-refining skill. All three are real and popular; none of them are any use
 * to someone who reads English, and three unreadable rows in a twelve-row list is a quarter of the page
 * wasted (2026-10-03).
 *
 * Judged on the DESCRIPTION, not the title: plenty of good projects have a stylised name. A project
 * described in English stays, whatever it is called. Anything with no description at all also stays -
 * absence of evidence is not a reason to drop something.
 */
function readable(f: Finding): boolean {
  const text = f.blurb || f.title;
  if (!text) return true;
  const letters = text.replace(/[^\p{L}]/gu, '');
  if (letters.length < 8) return true;
  const latin = letters.replace(/[^\p{Script=Latin}]/gu, '').length;
  return latin / letters.length >= 0.5;
}

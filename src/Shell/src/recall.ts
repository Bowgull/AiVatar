// Sheet 102 (his pick, 2026-10-29: "does it remember anything I've typed"): what the address bar remembers of him, read
// from his History (which already travels between his Mac and his PC). Its own file so it is tested without Electron.
//
// A search he made is remembered as his words, never as a page called "... - Brave Search". Searches and sites are
// ranked by how often AND how recently (frecency, Firefox's way): every visit counts, and a visit's weight halves
// every 30 days, so what he uses often rises and what he stopped using fades out after a month or so.

export interface Seen { url: string; title: string; at: number }
const DAY = 86_400_000;
export const HALF_LIFE_DAYS = 30;
const weight = (at: number, now: number) => Math.pow(0.5, Math.max(0, now - at) / (HALF_LIFE_DAYS * DAY));

/** His words, when this address is a search on one of the engines Samara knows; else null. */
export function searchQueryOf(url: string): string | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  const h = u.hostname.replace(/^www\./, '');
  let q: string | null = null;
  if (h === 'search.brave.com' && u.pathname === '/search') q = u.searchParams.get('q');
  else if ((h === 'duckduckgo.com' || h === 'noai.duckduckgo.com') && u.pathname === '/') q = u.searchParams.get('q');
  else if (h === 'google.com' && u.pathname === '/search') q = u.searchParams.get('q');
  else if (h === 'bing.com' && u.pathname === '/search') q = u.searchParams.get('q');
  else if (h === 'yandex.com' && /^\/search\/?$/.test(u.pathname)) q = u.searchParams.get('text');
  const t = String(q ?? '').replace(/\s+/g, ' ').trim();
  return t && t.length <= 200 ? t : null;
}

/**
 * His past searches that hold what he has typed (any case), best first, never the very words he typed (the bar's own
 * first line already searches those). With nothing typed: his most recent searches, newest first.
 */
export function pastSearches(visits: readonly Seen[], typed: string, now: number, max = 3, scan = 5000): { query: string; url: string }[] {
  const q = typed.replace(/\s+/g, ' ').trim().toLowerCase();
  const score = new Map<string, { query: string; url: string; s: number; last: number }>();
  for (let i = visits.length - 1, n = 0; i >= 0 && n < scan; i--, n++) {
    const v = visits[i]!;
    const query = searchQueryOf(v.url);
    if (!query) continue;
    const k = query.toLowerCase();
    if (q && (k === q || !k.includes(q))) continue;
    const e = score.get(k);
    if (e) e.s += weight(v.at, now);
    else score.set(k, { query, url: v.url, s: weight(v.at, now), last: v.at });
  }
  const all = [...score.values()];
  all.sort(q ? (a, b) => b.s - a.s || b.last - a.last : (a, b) => b.last - a.last);
  return all.slice(0, max).map(({ query, url }) => ({ query, url }));
}

/** The sites he goes to most (one line per site, its newest page's name), by frecency. Never a search page. */
export function topSites(visits: readonly Seen[], now: number, max = 3, scan = 5000): Seen[] {
  const score = new Map<string, { v: Seen; s: number }>();
  for (let i = visits.length - 1, n = 0; i >= 0 && n < scan; i--, n++) {
    const v = visits[i]!;
    if (searchQueryOf(v.url)) continue;
    let host = '';
    try { const u = new URL(v.url); if (!/^https?:$/.test(u.protocol)) continue; host = u.hostname.replace(/^www\./, ''); } catch { continue; }
    const e = score.get(host);
    if (e) e.s += weight(v.at, now);
    else score.set(host, { v: { url: `https://${host}/`, title: siteName(host), at: v.at }, s: weight(v.at, now) });
  }
  return [...score.values()].sort((a, b) => b.s - a.s).slice(0, max).map((x) => x.v);
}

/** A site's plain name from its address: reddit.com is Reddit, en.wikipedia.org is Wikipedia. */
export function siteName(host: string): string {
  const parts = host.replace(/^www\./, '').split('.');
  const core = parts.length >= 2 ? parts[parts.length - 2]! : parts[0]!;
  return core ? core.charAt(0).toUpperCase() + core.slice(1) : host;
}

// 6.20: what the browser's address slot may open. Its own file so it is tested without Electron.
//
// A web address, or a search. NEVER anything else: no javascript:, file:, chrome:, data: or any other
// scheme, because a page or a pasted line must never be able to make the slot run something.

/** What the address slot may open: a web address, or a search. Never anything else. `pick`: a window's own engine
 *  (sheet 87: the secret window searches with Yandex), else his. */
export function addressFor(input: string, pick?: Engine): string | null {
  const t = String(input ?? '').trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) { try { const u = new URL(t); return /^https?:$/.test(u.protocol) ? u.href : null; } catch { return null; } }
  // Any other scheme is refused outright: the slot never carries commands.
  if (/^[a-z][a-z0-9+.-]*:/i.test(t) && !/^[\w.-]+:\d+(\/|$)/.test(t)) return searchFor(t, pick);
  // Looks like an address: a dot, no spaces.
  if (!/\s/.test(t) && /^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(t)) { try { return new URL('https://' + t).href; } catch { return searchFor(t, pick); } }
  if (/^localhost(:\d+)?(\/.*)?$/i.test(t)) return 'http://' + t;
  return searchFor(t, pick);
}
/** His search engine and whether its AI answer box shows (Settings > General). Brave with the box off is the
 *  default (his pick, 2026-10-12, research_notes/Search engine for Aang browser): its own index, the least
 *  filtering of the free engines, and !g still jumps to Google. */
export type Engine = 'brave' | 'ddg' | 'google' | 'yandex';
let current: Engine = 'brave';
let aiBox = false;
export function setSearch(e: Engine, ai: boolean): void { current = e === 'ddg' || e === 'google' || e === 'yandex' ? e : 'brave'; aiBox = ai === true; }
export const searchFor = (q: string, pick?: Engine): string => {
  const s = encodeURIComponent(q);
  const engine = pick ?? current;
  if (engine === 'ddg') return aiBox ? `https://duckduckgo.com/?q=${s}` : `https://noai.duckduckgo.com/?q=${s}`;
  // Yandex (his ask, 2026-10-12): note it removes sites Russia bans (research_notes/Search engine for Aang browser).
  if (engine === 'yandex') return `https://yandex.com/search/?text=${s}`;
  if (engine === 'google') return aiBox ? `https://www.google.com/search?q=${s}` : `https://www.google.com/search?q=${s}&udm=14`;
  return `https://search.brave.com/search?q=${s}&summary=${aiBox ? 1 : 0}`;
};
/** Where a search engine's own front page is, for the default home page. */
export const engineHome = (pick?: Engine): string => (pick ?? current) === 'yandex' ? 'https://yandex.com/' : (pick ?? current) === 'ddg' ? 'https://duckduckgo.com/' : (pick ?? current) === 'google' ? 'https://www.google.com/' : 'https://search.brave.com/';

/**
 * Sheet 88 (his ask, 2026-10-25: "it starts giving me what it thinks I want"): where his engine's own guesses come from
 * for what he has typed so far (each engine's public suggestion address, the one Firefox and Chrome use), or null for
 * nothing worth asking about. `pick`: a window's own engine (the secret window's Yandex), else his.
 */
export function guessesUrl(typed: string, pick?: Engine): string | null {
  const q = String(typed ?? '').trim();
  if (!q || q.length > 200 || /^[a-z][a-z0-9+.-]*:\/\//i.test(q)) return null;
  const s = encodeURIComponent(q);
  const e = pick ?? current;
  if (e === 'yandex') return `https://suggest.yandex.com/suggest-ff.cgi?part=${s}&uil=en`;
  if (e === 'ddg') return `https://duckduckgo.com/ac/?q=${s}&type=list`;
  if (e === 'google') return `https://suggestqueries.google.com/complete/search?client=firefox&q=${s}`;
  return `https://search.brave.com/api/suggest?q=${s}`;
}
/** An engine's answer (["what he typed", ["guess", ...]]) as at most `max` plain guesses, never what he typed itself. */
export function parseGuesses(body: unknown, typed: string, max = 4): string[] {
  const list = Array.isArray(body) && Array.isArray(body[1]) ? body[1] : [];
  const mine = String(typed ?? '').trim().toLowerCase();
  const out: string[] = [];
  for (const g of list) {
    if (typeof g !== 'string') continue;
    const t = g.replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!t || t.toLowerCase() === mine || out.some((x) => x.toLowerCase() === t.toLowerCase())) continue;
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

// 6.20: what the browser's address slot may open. Its own file so it is tested without Electron.
//
// A web address, or a search. NEVER anything else: no javascript:, file:, chrome:, data: or any other
// scheme, because a page or a pasted line must never be able to make the slot run something.

/** What the address slot may open: a web address, or a search. Never anything else. */
export function addressFor(input: string): string | null {
  const t = String(input ?? '').trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) { try { const u = new URL(t); return /^https?:$/.test(u.protocol) ? u.href : null; } catch { return null; } }
  // Any other scheme is refused outright: the slot never carries commands.
  if (/^[a-z][a-z0-9+.-]*:/i.test(t) && !/^[\w.-]+:\d+(\/|$)/.test(t)) return searchFor(t);
  // Looks like an address: a dot, no spaces.
  if (!/\s/.test(t) && /^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(t)) { try { return new URL('https://' + t).href; } catch { return searchFor(t); } }
  if (/^localhost(:\d+)?(\/.*)?$/i.test(t)) return 'http://' + t;
  return searchFor(t);
}
/** His search engine and whether its AI answer box shows (Settings > General). Brave with the box off is the
 *  default (his pick, 2026-10-12, research_notes/Search engine for Aang browser): its own index, the least
 *  filtering of the free engines, and !g still jumps to Google. */
export type Engine = 'brave' | 'ddg' | 'google' | 'yandex';
let engine: Engine = 'brave';
let aiBox = false;
export function setSearch(e: Engine, ai: boolean): void { engine = e === 'ddg' || e === 'google' || e === 'yandex' ? e : 'brave'; aiBox = ai === true; }
export const searchFor = (q: string): string => {
  const s = encodeURIComponent(q);
  if (engine === 'ddg') return aiBox ? `https://duckduckgo.com/?q=${s}` : `https://noai.duckduckgo.com/?q=${s}`;
  // Yandex (his ask, 2026-10-12): note it removes sites Russia bans (research_notes/Search engine for Aang browser).
  if (engine === 'yandex') return `https://yandex.com/search/?text=${s}`;
  if (engine === 'google') return aiBox ? `https://www.google.com/search?q=${s}` : `https://www.google.com/search?q=${s}&udm=14`;
  return `https://search.brave.com/search?q=${s}&summary=${aiBox ? 1 : 0}`;
};
/** Where a search engine's own front page is, for the default home page. */
export const engineHome = (): string => engine === 'yandex' ? 'https://yandex.com/' : engine === 'ddg' ? 'https://duckduckgo.com/' : engine === 'google' ? 'https://www.google.com/' : 'https://search.brave.com/';

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
export const searchFor = (q: string): string => `https://www.google.com/search?q=${encodeURIComponent(q)}`;

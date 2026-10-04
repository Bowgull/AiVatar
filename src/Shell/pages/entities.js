// Step 6.12: files and links in a reply become pressable chips (parity row, from 4.5).
//
// Ported from Entities.cs rather than rewritten, including the reasoning, because every rule in it was
// put there for a reason that is not obvious from the code:
//
//   - the patterns are DELIBERATELY STRICT. "a loose path pattern matches half of ordinary prose, and a
//     chip on a non-file is worse than no chip."
//   - files come first, NOT in the order they appear. "A file Aang just wrote is the thing he is most
//     likely to want, so it should not be pushed off the end of the row by two links that happened to
//     be mentioned earlier."
//   - at most three, so the row never becomes a menu.
//   - it never throws. "a chip is a convenience; never let it break the view it sits in."

/** @typedef {{ kind: 'file'|'link', label: string, value: string }} Chip */

export const MAX = 3;

/** A Windows path with a drive letter, or a UNC share. Entities.cs FileRe. */
const FILE = /(?:[A-Za-z]:\\|\\\\)[^\s"'<>|?*]+\.[A-Za-z0-9]{1,8}/g;
const LINK = /https?:\/\/[^\s"'<>)\]]+/gi;

/** Trailing sentence punctuation is not part of a path or an address. */
const trim = (/** @type {string} */ s) => s.replace(/[.,;:]+$/, '');

/**
 * Up to three things worth a button.
 * @param {string} text
 * @returns {Chip[]}
 */
export function find(text) {
  /** @type {Chip[]} */
  const found = [];
  if (!text) return found;
  try {
    for (const m of String(text).matchAll(FILE)) {
      const full = trim(m[0]);
      if (full.length < 4 || found.some((c) => c.value === full)) continue;
      found.push({ kind: 'file', label: leaf(full), value: full });
      if (found.length >= MAX) return found;
    }
    for (const m of String(text).matchAll(LINK)) {
      const full = trim(m[0]);
      if (found.some((c) => c.value === full)) continue;
      found.push({ kind: 'link', label: host(full), value: full });
      if (found.length >= MAX) return found;
    }
  } catch { /* a chip is a convenience; never let it break the view it sits in */ }
  return found;
}

/** The file's own name. The full path is the value; nobody reads a path on a button. */
/** @param {string} path @returns {string} */
export function leaf(path) {
  const cut = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'));
  const name = cut >= 0 && cut < path.length - 1 ? path.slice(cut + 1) : path;
  return name.length > 28 ? name.slice(0, 27) + '…' : name;
}

/** The site, without the scheme or the www. "github.com", not the whole query string. */
/** @param {string} url @returns {string} */
export function host(url) {
  try {
    let h = new URL(url).hostname;
    if (h.toLowerCase().startsWith('www.')) h = h.slice(4);
    return h.length > 28 ? h.slice(0, 27) + '…' : h;
  } catch { return 'link'; }
}

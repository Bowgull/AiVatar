// 6.11 on the desktop: the reply's own light formatting, read into blocks the bubble can draw.
//
// The model writes the same reply wherever it goes (voice.ts, "structure only when it earns it"): at most
// one heading, a few bullet rows, bold on the words that matter, now and then a small table. Discord draws
// that itself; the old GDI bubble could not, so the Core flattened it (the lint). The new bubble can, so
// this reads it into plain data - blocks of runs - and the bubble builds every element with textContent.
// NOTHING here ever becomes markup: a reply may quote a web page or an email, and a reader that turned
// text into HTML would hand that page a way into the window.
//
// Plain JavaScript in pages/, tested by importing this same file (see reveal.js for why).

/**
 * @typedef {{ text: string, bold?: boolean, code?: boolean }} Run
 * @typedef {{ kind: 'p' | 'h' | 'li' | 'hr' | 'row', runs: Run[], cells?: Run[][] }} Block
 */

/**
 * Bold and inline code inside one line. Anything unmatched stays as the characters it is.
 * @param {string} line @returns {Run[]}
 */
export function runs(line) {
  /** @type {Run[]} */
  const out = [];
  const re = /\*\*([^*\n]+?)\*\*|`([^`\n]+?)`/g;
  let last = 0, m;
  while ((m = re.exec(line))) {
    if (m.index > last) out.push({ text: line.slice(last, m.index) });
    out.push(m[1] !== undefined ? { text: m[1], bold: true } : { text: m[2], code: true });
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push({ text: line.slice(last) });
  return out.filter((r) => r.text.length);
}

/** @param {string} md @returns {Block[]} */
export function blocks(md) {
  /** @type {Block[]} */
  const out = [];
  /** @type {string[]} */
  let para = [];
  const flush = () => { if (para.length) { out.push({ kind: 'p', runs: runs(para.join(' ')) }); para = []; } };
  for (const raw of String(md ?? '').split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) { flush(); continue; }
    let m;
    if ((m = /^\s{0,3}#{1,4}\s+(.*)$/.exec(line))) { flush(); out.push({ kind: 'h', runs: runs(m[1]) }); continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flush(); out.push({ kind: 'hr', runs: [] }); continue; }
    if ((m = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line))) { flush(); out.push({ kind: 'li', runs: runs(m[1]) }); continue; }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      flush();
      if (/^\s*\|[\s:|-]+\|\s*$/.test(line)) continue;            // the |---|---| separator row
      const cells = line.trim().slice(1, -1).split('|').map((c) => runs(c.trim()));
      out.push({ kind: 'row', runs: [], cells });
      continue;
    }
    para.push(line.trim());
  }
  flush();
  return out;
}

/**
 * How many of the reply's words have been revealed, counted the way the bubble draws them: tokens that
 * are only markup (a "#", a "-" bullet, a "|" cell edge, a "---" rule) draw nothing, so they count nothing.
 * @param {string} rawPrefix the part of the raw reply revealed so far
 */
export function shownWords(rawPrefix) {
  let n = 0;
  for (const tok of String(rawPrefix ?? '').split(/\s+/)) {
    if (!tok) continue;
    const bare = tok.replace(/\*\*|`/g, '');
    if (!bare || /^(#{1,4}|[-*•]|\d+[.)]|\|+|[-|:]{3,}|[*_]{3,})$/.test(bare)) continue;
    n++;
  }
  return n;
}

// Sheet 41: the new pixel icons the scroll-back needs, in pixicons.js's own style (Stardew: chunky, coloured outlines,
// two or three tones, light from the top-left), drawn with the same idea. If he picks them, they move into
// src/Shell/pages/pixicons.js. The rest come from the real file and from sheet 37's set.
import { pixIcon } from '../../../src/Shell/pages/pixicons.js';
import { pix as pix37 } from '../sheet-37/icons.js';

const C = {
  k: '#2E3248', b: '#2B78D0', B: '#8ED2FF', w: '#FFFFFF', G: '#A2AAC0',
  n: '#7A4A1C', m: '#C98A3E', Z: '#FFF2A0', X: '#F6EBD3', e: '#6A4A22',
  a: '#B06A10', A: '#FFD24A', y: '#FFF2A0',
  T: '#1F8C7E', t: '#3FBFAE', u: '#9FF0E6',
  r: '#C8402E', R: '#F06A50', p: '#5865F2', P: '#9AA3FF',
};
const ICONS = {
  // a little screen with a play mark: a video he showed you
  video: ['kkkkkkkkkk', 'kBBBBBBBBk', 'kbbwbbbbbk', 'kbbwwbbbbk', 'kbbwwwbbbk', 'kbbwwbbbbk', 'kbbwbbbbbk', 'kkkkkkkkkk', '...kGGk...', '.kkkkkkkk.'],
  // a rolled scroll: research
  scroll: ['.nnnnnnnn.', 'nmZZZZZZmn', '.nZeeeeZn.', '.nZZZZZZn.', '.nZeeeZZn.', '.nZZZZZZn.', '.nZeeeeZn.', 'nmZZZZZZmn', '.nnnnnnnn.'],
  // a gold arrow curling back: undone
  undo: ['...a......', '..aAa.....', '.aAAaaaa..', 'aAAAAAAAa.', '.aAAaaaAAa', '..aAa..aAa', '...a...aAa', '.......aAa', '..aaaaaAa.', '..aAAAAa..', '..aaaaa...'],
  // a turquoise tick in a slot, the update glow's colour: you said yes
  yes: ['TTTTTTTTTT', 'TuuuuuuuuT', 'TtttttttwT', 'TttttttwwT', 'TtwtttwwtT', 'TtwwtwwttT', 'TttwwwtttT', 'TtttwttttT', 'TTTTTTTTTT'],
  // a phone in Discord's colour: sent to your phone while you were away
  phone: ['.pppppp.', 'pPPPPPPp', 'pPwwwwPp', 'pPwwwwPp', 'pPwwwwPp', 'pPwwwwPp', 'pPPPPPPp', 'pPPwwPPp', '.pppppp.'],
};

/** An icon as an SVG element (2 CSS px per art pixel), from here, sheet 37, or the real pixicons.js. */
export function icon(name, scale = 2) {
  const g = ICONS[name];
  if (!g) return pix37(name, scale) ?? pixIcon(name, scale);
  const w = Math.max(...g.map((r) => r.length)), h = g.length;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', String(w * scale)); svg.setAttribute('height', String(h * scale));
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`); svg.setAttribute('shape-rendering', 'crispEdges'); svg.setAttribute('class', 'pix');
  g.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.' || !C[ch]) return;
    const r = document.createElementNS(NS, 'rect');
    r.setAttribute('x', String(x)); r.setAttribute('y', String(y)); r.setAttribute('width', '1'); r.setAttribute('height', '1'); r.setAttribute('fill', C[ch]);
    svg.append(r);
  }));
  return svg;
}
export function paintIcons(root) {
  for (const el of root.querySelectorAll('[data-ic]')) { if (el.firstChild) continue; const s = icon(el.dataset.ic); if (s) el.append(s); }
}

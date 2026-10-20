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
  for (const el of root.querySelectorAll('[data-play]')) { if (!el.firstChild) el.append(playButton()); }
  for (const el of root.querySelectorAll('[data-ic]')) { if (el.firstChild) continue; const s = icon(el.dataset.ic); if (s) el.append(s); }
}

// The big play button over a video (his ask, 2026-10-20: "like megavideo or putlocker"), hand-laid on a 20 x 20 grid
// and shown at 4x: a gold coin key with a carved play mark, light from the top-left, sitting on a darker lip so it
// lifts on hover and sinks when pressed, like the keycaps.
const PLAY = { O: '#2a1406', 1: '#8a4a0c', 2: '#c27a12', 3: '#eaa524', 4: '#ffcf4a', 5: '#fff0a8', t: '#3a2004', u: '#ffe58a', L: '#6b3a0a' };
const PLAY_FACE = [".......OOOOOO.......", ".....OO444444OO.....", "...OO4554333344OO...", "..O44543333333322O..", "..O45333333333332O..", ".O43433ttu33333331O.", ".O44333tttu3333331O.", "O433333tttttu333331O", "O433333ttttttu33331O", "O433333ttttttttu321O", "O433333ttttttttu221O", "O433333ttttttuu2221O", "O433333tttttu322221O", ".O43333tttuu322221O.", ".O43333ttu33222221O.", "..O2333uu33222221O..", "..O22333332222211O..", "...OO1133222211OO...", ".....OO111111OO.....", ".......OOOOOO......."];
const PLAY_LIP = [".......OOOOOO.......", ".....OOLLLLLLOO.....", "...OOLLLLLLLLLLOO...", "..OLLLLLLLLLLLLLLO..", "..OLLLLLLLLLLLLLLO..", ".OLLLLLLLLLLLLLLLLO.", ".OLLLLLLLLLLLLLLLLO.", "OLLLLLLLLLLLLLLLLLLO", "OLLLLLLLLLLLLLLLLLLO", "OLLLLLLLLLLLLLLLLLLO", "OLLLLLLLLLLLLLLLLLLO", "OLLLLLLLLLLLLLLLLLLO", "OLLLLLLLLLLLLLLLLLLO", ".OLLLLLLLLLLLLLLLLO.", ".OLLLLLLLLLLLLLLLLO.", "..OLLLLLLLLLLLLLLO..", "..OLLLLLLLLLLLLLLO..", "...OOLLLLLLLLLLOO...", ".....OOLLLLLLOO.....", ".......OOOOOO......."];
function grid(rows, pal, scale, cls) {
  const NS = 'http://www.w3.org/2000/svg', w = rows[0].length, h = rows.length;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', String(w * scale)); svg.setAttribute('height', String(h * scale));
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`); svg.setAttribute('shape-rendering', 'crispEdges'); svg.setAttribute('class', cls);
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (!pal[ch]) return;
    const r = document.createElementNS(NS, 'rect');
    r.setAttribute('x', String(x)); r.setAttribute('y', String(y)); r.setAttribute('width', '1'); r.setAttribute('height', '1'); r.setAttribute('fill', pal[ch]);
    svg.append(r);
  }));
  return svg;
}
export function playButton(scale = 4) {
  const b = document.createElement('span');
  b.className = 'bigplay';
  b.append(grid(PLAY_LIP, PLAY, scale, 'lip'), grid(PLAY_FACE, PLAY, scale, 'face'));
  return b;
}

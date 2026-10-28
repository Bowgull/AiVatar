// Sheet 17's wheel (approved 2026-10-12): hold the mouse on Aang and six wood discs fan out; let go on one.
// Mouse only: the pet holds the mouse while he points, so this window never takes it, and never the keyboard.
import { layoutWheel } from './wheellayout.js';
// Icons: pixelarticons (MIT, Gerrit Halfmann, art/pixelarticons/LICENSE.txt), each in its own colour.
const ICONS = {
  timer: 'M16 22H8v-2h8v2Zm-8-2H6v-4h2v4Zm10 0h-2v-4h2v4Zm-8-4H8v-2h2v2Zm6 0h-2v-2h2v2Zm-6-6h4v4h-4v-4Zm0 0H8V8h2v2Zm6 0h-2V8h2v2ZM8 8H6V4h2v4Zm10 0h-2V4h2v4Zm-2-4H8V2h8v2Z',
  note: 'M4 4H2v16h2zm12-2H4v2h12zm6 6h-2v12h2zm-2 12H4v2h16zM18 6h2v2h-2zm-2-2h2v2h-2zm-4 0h2v6h-2zm0 6h8v2h-8zm-6 2h4v2H6zm0 4h6v2H6z',
  globe: 'M6 2h12v2H6zm0 18h12v2H6zM4 4h2v2H4zm5 0h2v2H9zm0 14h2v2H9zm4 0h2v2h-2zM7 6h2v12H7zm8 0h2v12h-2zm-2-2h2v2h-2zm7 0h-2v2h2zM2 6h2v12H2zm20 0h-2v12h2zM4 18h2v2H4zm16 0h-2v2h2zM3 11h18v2H3z',
  music: 'M4 12h4v2H4zm-2 2h2v4H2zm2 4h4v2H4zM8 6h2v12H8zm10 0h2v12h-2zm-6 8h2v4h-2zm2-2h4v2h-4zm0 6h4v2h-4zM10 4h8v2h-8z',
  snip: 'M5 2h4v2H5zm0 12h4v2H5zm0-6h4v2H5zm0 12h4v2H5zM3 4h2v4H3zm0 12h2v4H3zM9 4h2v4H9zm0 12h2v4H9zm0-8h2v2H9zm2 2h2v2h-2zm-2 4h2v2H9zm2-2h2v2h-2zm2-2h2v2h-2zm2 4h2v2h-2zm2 2h2v2h-2zm2 2h2v2h-2zM15 8h2v2h-2zm2-2h2v2h-2zm2-2h2v2h-2z',
  moon: 'M18 22H8v-2h10v2ZM8 20H6v-2h2v2Zm12 0h-2v-2h2v2ZM6 18H4v-2h2v2Zm16 0h-2v-4h-2v-2h2v-2h2v8ZM4 16H2V6h2v10Zm14 0h-6v-2h6v2Zm-6-2h-2v-2h2v2Zm-2-2H8V6h2v6ZM6 6H4V4h2v2Zm8-2h-2v2h-2V4H6V2h8v2Z',
};
/** His six, in this order, each its own colour (light, middle, deep). */
const SLOTS = [
  ['timer', 'TIMER', ['#FFF0B8', '#FFC43C', '#C98C14']],
  ['note', 'NOTES', ['#FFD9C9', '#F08A68', '#B4472C']],
  ['globe', 'BROWSER', ['#DDF0FF', '#7FB8EA', '#3C6E9E']],
  ['music', 'MUSIC', ['#EBDDFF', '#B48CEB', '#6E46A8']],
  ['snip', 'SNIP', ['#E2F5CF', '#8FD07A', '#3E8A4E']],
  ['moon', 'AWAY', ['#F2F2FF', '#C9CDEA', '#7C82B0']],     // 9.D D9: was QUIET; stepping away moves talking to Discord
// His call (2026-10-28): no Snip on the Mac; macOS has its own. Five there.
].filter(([, label]) => !(label === 'SNIP' && /Mac/i.test(navigator.platform)));
const HIT = 40;
const NS = 'http://www.w3.org/2000/svg';
/** @type {{el: HTMLElement, x: number, y: number}[]} */
let discs = [];
let on = -1;

function icon(key, c) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', '30'); svg.setAttribute('height', '30'); svg.setAttribute('shape-rendering', 'crispEdges');
  svg.classList.add('gi');
  const id = 'g-' + key;
  svg.innerHTML = `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c[0]}"/><stop offset=".45" stop-color="${c[1]}"/><stop offset="1" stop-color="${c[2]}"/></linearGradient></defs><path d="${ICONS[key]}" fill="url(#${id})"/>`;
  return svg;
}

/** Fan the discs out from where Aang is, toward the side of the screen with room. */
function show(s) {
  document.body.replaceChildren();
  discs = []; on = -1;
  // Toward the middle of his screen, and slid fully on screen wherever he is docked (wheellayout.js, tested).
  const spots = layoutWheel({ cx: s.cx, cy: s.cy, w: s.w || innerWidth, h: s.h || innerHeight, n: SLOTS.length });
  SLOTS.forEach(([key, label, c], i) => {
    const { x, y } = spots[i];
    const d = document.createElement('div');
    d.className = 'disc';
    d.style.left = x + 'px'; d.style.top = y + 'px';
    const name = document.createElement('span'); name.textContent = label;
    d.append(icon(key, c), name);
    document.body.append(d);
    setTimeout(() => d.classList.add('in'), 20 + i * 40);
    discs.push({ el: d, x, y });
  });
}
function nearest(p) {
  let best = -1, dist = HIT;
  discs.forEach((d, i) => { const h = Math.hypot(p.x - d.x, p.y - d.y); if (h < dist) { dist = h; best = i; } });
  return best;
}
window.aang?.onWheel?.((m) => {
  if (!m || typeof m !== 'object') return;
  if (m.kind === 'show') show(m);
  if (m.kind === 'hover') { const i = nearest(m); if (i !== on) { on = i; discs.forEach((d, j) => d.el.classList.toggle('on', j === i)); } }
  if (m.kind === 'release') { const i = nearest(m); window.aang?.wheelPick?.(i >= 0 ? SLOTS[i][1] : ''); }
});

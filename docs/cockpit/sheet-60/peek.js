// Sheet 60 v4 (2026-10-22, night): "Aang notices things in your notes - this is boring as fuck." Three livelier ways for
// the one line to arrive, still calm. Loaded INTO the real bubble page by notice-peek.ts, so the bubble (look B, S2 rim),
// its keys (cockpit.css .key) and Aang are the product's own; the note is the sheet's drawn note (notes.js).
//   A  the note peeks: the real note rises from behind Aang on a spring, the line that matters marked in gold, keys on it
//   B  Aang holds it up: a little paper in his hands, the line in his bubble
//   C  a richer bubble: the note's line quoted on its own paper colour inside the bubble, the same keys
import { P, art, mix } from '../sheet-59/pix.js';
import { ready, el, at, note, paperOf, keyOf } from './notes.js';

export { ready };
const TODO = { title: 'Before Friday', cat: 'To-do', html:
  '<ul class="chk"><li class="hi">Renew the passport <b>(Fri)</b></li><li>Order Mom\'s gift</li></ul>' };

const CSS = `
.pk{position:fixed;z-index:3}
.pk .nb ul.chk li{background:none;box-shadow:none}
.pk .nb ul.chk li.hi{background:linear-gradient(transparent 12%,rgba(255,196,60,.62) 12%,rgba(255,196,60,.62) 88%,transparent 88%);margin-left:-4px;padding-left:4px;border-radius:3px;box-shadow:0 0 0 2px rgba(201,140,20,.35)}
.pk .pkeys{position:absolute;display:flex;gap:8px}
.pk .key.sm{font-size:12px;padding:6px 11px 7px;--lip:3px}
.stg.aang{z-index:5 !important}
.clip{position:fixed;overflow:hidden;z-index:3}
.nq{margin:10px 0 2px;padding:9px 11px 10px;border:2.5px solid var(--outline);border-radius:8px;box-shadow:0 3px 0 var(--outline),inset 0 2px 0 rgba(255,255,255,.45)}
.nq .nqh{font:400 9px var(--label);letter-spacing:1px;color:#3a4a6a;margin-bottom:6px;display:flex;gap:8px;align-items:center}
.nq .nqh i{width:10px;height:10px;border-radius:2px;box-shadow:0 0 0 2px var(--outline)}
.nq .nql{display:flex;align-items:center;gap:8px;font:600 14px/1.3 var(--body);color:var(--ink-text)}
.nq .nql span{background:linear-gradient(transparent 10%,rgba(255,196,60,.62) 10%,rgba(255,196,60,.62) 90%,transparent 90%);padding:0 3px;border-radius:3px}
.nq .nql .nqbx{width:12px;height:12px;border-radius:2px;border:2px solid #6b5236;background:rgba(255,255,255,.6);flex:none}
.stagetag{position:fixed;z-index:9;font:700 12.5px Figtree,sans-serif;letter-spacing:.4px;color:#c9cee0}
.stagetag b{color:#ffd36a;font-weight:400}
`;
export function style() { const s = document.createElement('style'); s.textContent = CSS; document.head.append(s); }
function keyRow(names) { const r = el('div', 'pkeys'); names.forEach(([t, k]) => { const b = el('button', 'key sm' + (k ? ' ' + k : ''), t); b.type = 'button'; r.append(b); }); return r; }

/** A: the note in a clip box whose floor is Aang's feet, so it rises from behind him. y: how far it still has to rise. */
export function peek(fx, fy, rise, pagesOrigin) {
  const W = 236, H = 184;
  // the note lives in its own shadow root so the bubble's styles and the note's never touch
  const host = el('div'); host.style.cssText = 'position:fixed;left:0;top:0;z-index:3'; document.body.append(host);
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = '<link rel="stylesheet" href="' + pagesOrigin + '/cockpit.css"><link rel="stylesheet" href="' + new URL('./notes.css', import.meta.url).href + '"><style>' + CSS + '</style>';
  const clip = el('div', 'clip'); Object.assign(clip.style, { left: (fx - 150) + 'px', top: (fy + 78) + 'px', width: (W + 20) + 'px', height: (H + 8) + 'px' });
  const n = note('B', TODO, W, H, { foot: false, small: true }); n.classList.add('pk');
  n.style.position = 'absolute'; n.style.left = '10px'; n.style.top = (16 + rise) + 'px';
  const keys = keyRow([['Tick it', 'primary'], ['Open', ''], ['Later', '']]); at(n, keys, 14, H - 44, { zIndex: '4' });
  clip.append(n); root.append(clip);
  return clip;
}
/** B: a little paper (To-do blue, two ruled lines, the gold one marked) held up in Aang's hands, pixel art at 2x. */
export function held(x, y) {
  const paper = paperOf(keyOf(TODO)), edge = '#3a2a1e', skin = '#f2c49a', skinD = '#c98e66';
  const c = art(17, 14, (put) => {
    for (let yy = 0; yy < 12; yy++) for (let xx = 1; xx < 16; xx++) {
      const e = yy === 0 || yy === 11 || xx === 1 || xx === 15, corner = (yy === 0 || yy === 11) && (xx === 1 || xx === 15);
      if (corner) continue;
      put(xx, yy, e ? edge : yy < 3 ? mix(paper, '#ffffff', 0.35) : paper);
    }
    for (let xx = 3; xx < 12; xx++) put(xx, 3, '#5a6a8a');
    for (let xx = 3; xx < 14; xx++) { put(xx, 6, '#ffc43c'); put(xx, 7, '#e0a020'); }
    for (let xx = 3; xx < 10; xx++) put(xx, 9, '#5a6a8a');
    put(3, 6, '#2a1c10'); put(4, 6, '#2a1c10');
    // his hands on the bottom corners
    for (const [hx, hy] of [[0, 9], [0, 10], [1, 10], [1, 11], [2, 11], [16, 9], [16, 10], [15, 10], [15, 11], [14, 11]]) put(hx, hy, hy === 11 ? skinD : skin);
    put(0, 11, skinD); put(16, 11, skinD);
  });
  c.classList.add('pk'); c.style.position = 'fixed'; c.style.left = x + 'px'; c.style.top = y + 'px'; c.style.zIndex = '6';
  document.body.append(c); return c;
}
/** C: the line quoted on its note's own paper inside the bubble; the keys go in the bubble's own asks row. */
export function quote(said, asks) {
  const q = el('div', 'nq'); q.style.background = paperOf(keyOf(TODO));
  const h = el('div', 'nqh'); const sw = el('i'); sw.style.background = '#2f78b8'; h.append(sw, el('span', '', 'BEFORE FRIDAY &middot; TO-DO'));
  const l = el('div', 'nql'); l.append(el('i', 'nqbx'), el('span', '', 'Renew the passport <b>(Fri)</b>'));
  q.append(h, l); said.after(q);
  if (asks) asks.hidden = false;
  return q;
}
export function stageTag(x, y, html) { const t = el('div', 'stagetag', html); t.style.left = x + 'px'; t.style.top = y + 'px'; document.body.append(t); return t; }
import { box } from './notes.js';
export const tick = () => box(true, 'B');

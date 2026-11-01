// Sheet 116 (2026-11-01): the clipboard shelf, live. His interview: remember every copy safely, an edge strip AND a way
// in from Aang, Aang reads it only when asked, the Mac shares it. Built from the sheet 59/60 kit (pixels at exactly 2x,
// Samara's tray wood, the notes' papers), so it sits beside the notes as one family. The motion is Edge-Drop's
// (github.com/Deepender25/Edge-Drop, Apache-2.0): springs baked into CSS linear() on clip-path and transform only.
import { P, rr, fills, cover, mix } from '../sheet-59/pix.js';
import { ready, el, at, paper, face, snipPic } from '../sheet-60/notes.js';

await ready();
const $ = (s, r = document) => r.querySelector(s);

// ---------------------------------------------------------------- springs as CSS linear() (no JavaScript per frame)
/** A damped spring from 0 to 1 sampled into a linear() easing. response = seconds per cycle, damping 1 = no bounce.
 *  cut: stop where it first reaches the target (Edge-Drop's open: an overshoot would be clipped away anyway). */
function spring({ response, damping, v0 = 0, cut = false }) {
  const w = (2 * Math.PI) / response, dt = 1 / 600; let x = 0, v = v0, t = 0; const pts = [[0, 0]];
  while (t < 3) {
    v += (-(w * w) * (x - 1) - 2 * damping * w * v) * dt; x += v * dt; t += dt;
    if (cut && x >= 1) { pts.push([t, 1]); break; }
    if (Math.abs(1 - x) < 0.0015 && Math.abs(v) < 0.02) { pts.push([t, 1]); break; }
    if (Math.round(t * 600) % 12 === 0) pts.push([t, x]);
  }
  const T = pts[pts.length - 1][0];
  return { css: 'linear(' + pts.map(([tt, xx]) => `${xx.toFixed(3)} ${(100 * tt / T).toFixed(1)}%`).join(', ') + ')', ms: Math.round(T * 1000) };
}
const root = document.documentElement.style;
const open = spring({ response: 0.38, damping: 0.86, v0: 0.6, cut: true });
const close = spring({ response: 0.24, damping: 1 });
const drop = spring({ response: 0.42, damping: 0.72 });
root.setProperty('--open-ease', open.css); root.setProperty('--open-ms', open.ms + 'ms');
root.setProperty('--close-ease', close.css); root.setProperty('--close-ms', close.ms + 'ms');
root.setProperty('--drop-ease', drop.css); root.setProperty('--drop-ms', drop.ms + 'ms');
$('#springs').textContent = `open ${open.ms} ms (response 0.38 s, damping 0.86) · close ${close.ms} ms (no bounce) · new card ${drop.ms} ms (a small settle)`;

// ---------------------------------------------------------------- cards
const W = 360;
const PAPER = { clip: '#f3e2a6', snip: '#d3e9f8', mac: '#e6dcf2' };
function fav(letter, bg) { const f = el('span', 'fav', letter); f.style.background = bg; return f; }
function acts(kind) {
  const a = el('div', 'acts');
  a.append(el('span', '', 'Copy'), el('span', '', 'Pin'), el('span', '', kind === 'snip' ? 'Pin on screen' : 'Keep as a note'));
  const ask = el('span', 'ask'); ask.append(face(), el('span', '', 'Ask')); a.append(ask, el('span', 'bin', 'Bin'));
  return a;
}
/** One clip: kind, words, where it came from. The paper is sized to the words once they are on the page. */
function card(it) {
  const c = el('div', 'card ' + it.kind); c.style.width = W + 'px';
  const cin = el('div', 'cin');
  if (it.kind === 'text') cin.append(el('div', '', it.text));
  if (it.kind === 'code') cin.append(el('div', 'code', it.text));
  if (it.kind === 'link') { const r = el('div', 'row'); r.append(fav(it.letter, it.col), el('div', 'ln', `<b>${it.title}</b><span>${it.host}</span>`)); cin.append(r); }
  if (it.kind === 'pic') { const p = el('div', 'pic'); const art = cover(Math.floor((W - 32) / P), P, it.look ?? 'dusk'); p.style.height = '120px'; p.append(art); art.style.marginTop = '-130px'; cin.append(p); }
  if (it.kind === 'snip') cin.append(snipPic(160, 44));
  if (it.kind === 'file') { const r = el('div', 'row file'); const i = el('img'); i.src = '../../../src/Shell/pages/art/browser/' + it.icon; r.append(i, el('div', 'ln', `<b>${it.name}</b><span>${it.size}</span>`)); cin.append(r); }
  if (it.kind === 'color') { const r = el('div', 'row'); const s = el('span', 'sw'); s.style.background = it.hex; r.append(s, el('div', 'ln', `<b>${it.hex}</b><span>a colour</span>`)); cin.append(r); }
  const meta = el('div', 'meta', it.meta);
  if (it.mac) meta.append(el('span', 'mac', 'from the Mac'));
  if (it.pinned) meta.prepend(el('span', 'pinned', 'PINNED ·'));
  cin.append(meta); c.append(cin, acts(it.kind));
  c._it = it; return c;
}
function dress(c) {
  if (c.querySelector(':scope > canvas.paper')) return c;
  const col = c._it.kind === 'snip' ? PAPER.snip : c._it.mac ? PAPER.mac : PAPER.clip;
  const cw = c.offsetWidth; const pp = paper('B', cw / P, Math.max(24, Math.ceil(c.offsetHeight / P)), col, { small: true, lifted: true }); pp.classList.add('paper');
  c.prepend(pp);
  if (c._it.stack) for (const k of [2, 1]) { const u = paper('B', cw / P, Math.max(24, Math.ceil(c.offsetHeight / P)), col, { small: true }); u.classList.add('under', 'u' + k); c.prepend(u); }
  if (c._it.stack) c.append(el('span', 'count', String(c._it.stack)));
  return c;
}

const CLIPS = [
  { kind: 'link', letter: 'W', col: '#2f78b8', title: 'Patch notes: Forever 1.4', host: 'forever.warcraft.com', meta: '9:40 pm · from Samara', pinned: true },
  { kind: 'text', text: 'Molten Core, Fri 8pm. Bring fire resist.', meta: '9:12 pm · Discord' },
  { kind: 'snip', meta: '8:58 pm · Snipit' },
  { kind: 'pic', look: 'dusk', meta: '8:31 pm · a picture you copied', mac: true },
  { kind: 'file', icon: 'file_pdf.png', name: 'Lease renewal.pdf', size: '412 KB · drag it anywhere', meta: '7:05 pm · Explorer' },
  { kind: 'color', hex: '#A970FF', meta: '6:50 pm · a colour' },
];
const NEW = [
  { kind: 'text', text: 'the good coffee is the one in the blue bag', meta: 'just now · Notepad' },
  { kind: 'code', text: 'git push origin main --follow-tags', meta: 'just now · Terminal' },
  { kind: 'link', letter: 'Y', col: '#c4372f', title: 'Tiny Desk Concert, full set', host: 'youtube.com', meta: 'just now · from Samara' },
];

// ---------------------------------------------------------------- the shelf on a desk
const desk = $('#desk');
desk.innerHTML = '<div class="wall">YOUR DESKTOP · HOVER THE GOLD STRIP ON THE RIGHT EDGE</div><div class="appwin"><b>Discord · #raid-night</b><div class="drop">drop here</div></div>';
const strip = el('div', 'strip new'); desk.append(strip);
const shelf = el('div', 'shelf'); desk.append(shelf);
const wood = rr(392 / P, 580 / P, 9, { band: 's2', E: 4, fill: fills.wood(1) }); wood.classList.add('wood'); shelf.append(wood);
const hd = el('div', 'hd'); hd.append(el('span', 'ttl', 'Shelf'), el('span', 'pause', 'Pause')); shelf.append(hd);
shelf.append(el('div', 'search', '&#9906;&nbsp; Search your shelf'));
const chips = el('div', 'chips'); ['All', 'Text', 'Links', 'Pictures', 'Snips', 'Files'].forEach((t, i) => chips.append(el('span', 'chip' + (i ? '' : ' on'), t))); shelf.append(chips);
const list = el('div', 'list'); shelf.append(list);
list.append(el('div', 'sec', 'TODAY'));
for (const it of CLIPS) list.append(card(it));
requestAnimationFrame(() => list.querySelectorAll('.card').forEach(dress));

let isOpen = false, closing = null;
function setOpen(v) {
  if (v === isOpen) return; isOpen = v;
  shelf.classList.add('moving'); shelf.classList.toggle('open', v); desk.classList.toggle('isopen', v); if (v) strip.classList.remove('new');
  setTimeout(() => shelf.classList.remove('moving'), 400 * slow());
  if (v) requestAnimationFrame(() => list.querySelectorAll('.card').forEach(dress));
}
const slow = () => Number(getComputedStyle(document.documentElement).getPropertyValue('--slow')) || 1;
// Edge-Drop's hysteresis: open after a 40 ms rest on the strip, stay open within 255 px of the edge, close past 290 px after 250 ms
let dwell = null;
strip.addEventListener('mouseenter', () => { dwell = setTimeout(() => setOpen(true), 40); });
strip.addEventListener('mouseleave', () => clearTimeout(dwell));
desk.addEventListener('mousemove', (e) => {
  if (!isOpen || pinnedOpen) return;
  const fromEdge = desk.getBoundingClientRect().right - e.clientX;
  if (fromEdge > 390 + 35) { if (!closing) closing = setTimeout(() => { closing = null; setOpen(false); }, 250); }
  else if (closing) { clearTimeout(closing); closing = null; }
});
desk.addEventListener('mouseleave', () => { if (isOpen && !pinnedOpen) closing = setTimeout(() => { closing = null; setOpen(false); }, 250); });

// ---------------------------------------------------------------- the demo keys
let pinnedOpen = false, nNew = 0;
const keys = $('#keys');
function key(label, fn, cls = '') { const b = el('button', cls, label); b.onclick = fn; keys.append(b); return b; }
const kOpen = key('Open the shelf', () => { pinnedOpen = !isOpen; setOpen(!isOpen); kOpen.textContent = isOpen ? 'Close the shelf' : 'Open the shelf'; });
function ensureOpen() { if (!isOpen) { pinnedOpen = true; setOpen(true); kOpen.textContent = 'Close the shelf'; } }
key('You copy something', () => {
  ensureOpen();
  const cards = [...list.querySelectorAll('.card')], before = new Map(cards.map((c) => [c, c.getBoundingClientRect().top]));
  const c = card(NEW[nNew++ % NEW.length]); c.classList.add('entering'); list.querySelector('.sec').after(c); dress(c);
  // FLIP: the others glide down on the same spring instead of jumping
  for (const o of cards) { const d = before.get(o) - o.getBoundingClientRect().top; if (!d) continue; o.style.transition = 'none'; o.style.transform = `translateY(${d}px)`; }
  requestAnimationFrame(() => requestAnimationFrame(() => { for (const o of cards) { o.style.transition = `transform calc(var(--drop-ms) * var(--slow)) var(--drop-ease)`; o.style.transform = ''; } }));
  setTimeout(() => { c.classList.remove('entering'); for (const o of cards) o.style.transition = ''; }, (drop.ms + 60) * slow());
});
key('Stack two', () => {
  ensureOpen();
  const texts = [...list.querySelectorAll('.card.text, .card.code')];
  if (texts.length < 2) return;
  const [a, b] = texts; b.style.transition = `transform calc(.32s * var(--slow)) var(--lift), opacity calc(.32s * var(--slow))`;
  const dy = a.getBoundingClientRect().top - b.getBoundingClientRect().top; b.style.transform = `translateY(${dy}px) scale(.96)`; b.style.opacity = '0';
  setTimeout(() => {
    b.remove(); const it = { ...a._it, stack: (a._it.stack ?? 1) + 1, meta: `${(a._it.stack ?? 1) + 1} clips · stacked` };
    const s = card(it); s.classList.add('stack'); a.replaceWith(s); dress(s); s.classList.add('hover'); setTimeout(() => s.classList.remove('hover'), 900 * slow());
  }, 330 * slow());
});
key('Copy one back', () => {
  ensureOpen();
  const c = list.querySelector('.card'); if (!c) return;
  c.append(el('div', 'ripple'));
  const r = c.getBoundingClientRect(), d = desk.getBoundingClientRect();
  at(desk, el('div', 'toast', 'Copied'), r.left - d.left + 140, r.top - d.top - 24);
  setTimeout(() => { c.querySelector('.ripple')?.remove(); desk.querySelector('.toast')?.remove(); }, 1150 * slow());
});
key('Drag a picture out', () => {
  ensureOpen();
  const src = list.querySelector('.card.pic') ?? list.querySelector('.card'); const r = src.getBoundingClientRect(), d = desk.getBoundingClientRect();
  // the drag picture: up to three cards fanned 28 px and 5 degrees apart (Edge-Drop's ghost)
  const g = el('div', 'ghost'); const pp = src.querySelector('canvas.paper');
  for (let i = 2; i >= 0; i--) { const cv = document.createElement('canvas'); cv.width = pp.width; cv.height = pp.height; cv.getContext('2d').drawImage(pp, 0, 0); cv.style.width = pp.style.width; cv.style.height = pp.style.height;
    cv.style.transform = `translate(${i * 10}px, ${-i * 4}px) rotate(${-i * 5}deg) scale(${1 - i * 0.04})`; cv.style.opacity = String(1 - i * 0.25); g.append(cv); }
  g.style.left = r.left - d.left + 'px'; g.style.top = r.top - d.top + 'px'; g.style.transform = 'scale(.62)'; g.style.transformOrigin = '0 0'; desk.append(g);
  const dz = $('.appwin .drop', desk), z = dz.getBoundingClientRect();
  requestAnimationFrame(() => requestAnimationFrame(() => { g.style.transform = `translate(${z.left - r.left + 40}px, ${z.top - r.top + 10}px) scale(.42) rotate(-4deg)`; dz.classList.add('hot'); }));
  setTimeout(() => { g.style.opacity = '0'; dz.textContent = 'a picture, dropped in'; }, 900 * slow());
  setTimeout(() => { g.remove(); dz.classList.remove('hot'); dz.textContent = 'drop here'; }, 2200 * slow());
});
const kSlow = key('Slow motion', () => { const on = slow() === 1; root.setProperty('--slow', on ? '4' : '1'); kSlow.classList.toggle('on', on); }, 'plum');

// ---------------------------------------------------------------- the bubble with the same spring
const bd = $('#bubdemo');
const aang = el('div', 'aang'); const fc = face(); fc.style.transform = 'scale(2)'; fc.style.transformOrigin = '0 100%'; aang.append(fc); bd.append(aang);
const bub = el('div', 'bub'); bd.append(bub);
const say = el('p', '', 'The link you copied yesterday at 9:40 pm: the Forever 1.4 patch notes.<br><span class="door">Open it on the shelf</span>');
bub.append(say);
requestAnimationFrame(() => { const h = say.offsetHeight; const parch = rr(380 / P, Math.ceil(h / P), 8, { band: 's2', E: 3, fill: fills.paper(Math.ceil(h / P)) }); parch.style.position = 'absolute'; bub.prepend(parch); bub.style.height = h + 'px'; });
const bkeys = $('#bubkeys');
const bb = el('button', '', 'Ask: what was that link I copied yesterday?'); bb.onclick = () => bub.classList.add('open'); bkeys.append(bb);
const bc = el('button', 'plum', 'Close'); bc.onclick = () => bub.classList.remove('open'); bkeys.append(bc);

// ---------------------------------------------------------------- with the rest of Aang (still pictures)
const f1 = $('#flow-snip');
f1.append(el('div', 'cap', 'A SNIP ALSO LANDS ON THE SHELF, MARKED NEW'));
const s1 = card({ kind: 'snip', meta: 'just now · Snipit' }); at(f1, s1, 80, 70); dress(s1);
at(f1, el('div', 'hint', 'NEW'), 392, 62);
const f2 = $('#flow-note');
f2.append(el('div', 'cap', 'DRAG A CLIP ONTO A NOTE: IT JOINS THE NOTE'));
const pn = el('div', 'papernote target'); const pc = paper('B', 300 / P, 180 / P, 'C', { small: true }); pn.append(pc, el('div', 't', 'Route list idea'), el('div', 'b', 'Waymark: let the route list fold to <b>one line</b> while driving.')); at(f2, pn, 30, 50);
const s2 = card({ kind: 'link', letter: 'W', col: '#2f78b8', title: 'Patch notes: Forever 1.4', host: 'forever.warcraft.com', meta: 'dragging' }); s2.style.width = '300px';
at(f2, s2, 190, 170, { transform: 'rotate(-3deg)', zIndex: 5 }); dress(s2);
at(f2, el('div', 'hint', '+ Keep it in this note'), 250, 140);

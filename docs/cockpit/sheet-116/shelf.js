// Sheet 116 (2026-11-01): the Satchel, his clipboard, live. v2 from his second interview: not always there (a tab peeks
// out when he hovers the middle of the right edge, and he clicks it), Ctrl+Alt+V, keyboard and mouse both, pinned on
// top + filter by type (no stacks, no groups), pixel icons with the word on hover, things dropped onto the tab are kept,
// "Keep as a note" opens the quick note with the clip in it. Built from the sheet 59/60 kit (pixels at exactly 2x,
// Samara's tray wood, the notes' papers). Motion is Edge-Drop's (Apache-2.0): springs as CSS linear() on clip-path and
// transform, never size or position.
import { P, rr, fills, cover, spr, mix, paperAt } from '../sheet-59/pix.js';
import { ready, el, at, paper, face, snipPic } from '../sheet-60/notes.js';

await ready();
const $ = (s, r = document) => r.querySelector(s);

// ---------------------------------------------------------------- springs as CSS linear() (no JavaScript per frame)
/** A damped spring 0 -> 1 sampled into a linear() easing. response = seconds per cycle, damping 1 = no bounce.
 *  cut: stop where it first reaches 1 (Edge-Drop's open: the overshoot would be clipped away anyway). */
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
const peek = spring({ response: 0.34, damping: 0.62 });
for (const [k, s] of [['open', open], ['close', close], ['drop', drop], ['peek', peek]]) { root.setProperty(`--${k}-ease`, s.css); root.setProperty(`--${k}-ms`, s.ms + 'ms'); }
$('#springs').textContent = `open ${open.ms} ms (response 0.38 s, damping 0.86) · close ${close.ms} ms (no bounce) · tab peek ${peek.ms} ms · new clip ${drop.ms} ms`;
const slow = () => Number(getComputedStyle(document.documentElement).getPropertyValue('--slow')) || 1;

// ---------------------------------------------------------------- pixel icons (hand-placed, shown 2x)
const INK = '#2c1c10';
// v2.1 (his note: "the icons were a bit low quality"): crisper glyphs, two or three tones, 11 px, drawn for the keycap
const ICON = {
  copy: spr(['...OOOOOOO.', '...OWWWWWO.', '...OWKKKWO.', 'OOOOOOOWWO.', 'OWWWWWOKWO.', 'OWKKKWOWWO.', 'OWWWWWOOOO.', 'OWKKKWO....', 'OWWWWWO....', 'OWKKWWO....', 'OOOOOOO....'],
    { O: INK, W: '#fffaf0', K: '#a07a48' }),
  pin: spr(['..OOOOOOO..', '..OLGGGGO..', '..OGGGGSO..', '..OGGGGSO..', '..OGGGGSO..', '..OGGGGSO..', '..OGGGGSO..', '..OGGOGSO..', '..OGO.OSO..', '..OO...OO..'],
    { O: INK, L: '#ffe9a8', G: '#e8b440', S: '#b97a22' }),
  note: spr(['OOOOOOOOOOO', 'OYYYYYYYYYO', 'OYKKKKKKYYO', 'OYYYYYYYYYO', 'OYKKKKKYYYO', 'OYYYYYYYYYO', 'OYKKKKKKKYO', 'OYYYYYYYYYO', 'OSSSSSSSSSO', 'OOOOOOOOOOO'],
    { O: INK, Y: '#f8dc8e', K: '#a07a48', S: '#d9b25a' }),
  bin: spr(['....OOO....', '.OOOOOOOOO.', 'OLLLLLLLLLO', 'OOOOOOOOOOO', '.ORRRRRRRO.', '.ORSRSRSRO.', '.ORSRSRSRO.', '.ORSRSRSRO.', '.ORSRSRSRO.', '.ORRRRRRRO.', '..OOOOOOO..'],
    { O: INK, L: '#e79c7b', R: '#c4572f', S: '#8a3e1c' }),
};
const clone = (c) => { const k = document.createElement('canvas'); k.width = c.width; k.height = c.height; k.getContext('2d').drawImage(c, 0, 0); k.style.cssText = c.style.cssText; return k; };
const SATCHEL = ['....OOOOOOO....', '...OBBBBBBBO...', '..OBO.....OBO..', '..OB.......BO..', 'OOOOOOOOOOOOOOO', 'OLLLLLLLLLLLLLO', 'OLLLLLGGGLLLLLO', 'OHHHHHGYGHHHHHO', 'OLLLLLGGGLLLLLO', 'OLLLLLLLLLLLLLO', 'OLLLLLLLLLLLLLO', 'OSSSSSSSSSSSSSO', '.OOOOOOOOOOOOO.'];
const satchelIcon = () => spr(SATCHEL, { O: INK, B: '#7a5532', L: '#a8743c', H: '#8a5a2a', S: '#6a4422', G: '#c98c14', Y: '#ffe096' }, { drop: 'rgba(0,0,0,.4)' });

// ---------------------------------------------------------------- clips
const W = 360;
const PAPER = { clip: '#f3e2a6', snip: '#d3e9f8', mac: '#e6dcf2' };
function fav(letter, bg) { const f = el('span', 'fav', letter); f.style.background = bg; return f; }
function keycap(dark = false) {
  return rr(16, 14, 4, { band: 'edge', shadow: 1, shadowCol: [40, 22, 8, 255], fill: (x, y, c) => {
    let p = dark ? mix('#6a3fa0', '#4A2C6E', y / 14) : paperAt(y / 14);
    if (c.d === 0 && c.lit > 0.3) p = mix(p, '#ffffff', dark ? 0.25 : 0.55);
    if (y === 12) p = mix(p, dark ? '#24123c' : '#b8955e', 0.6);
    return p; } });
}
function keyIcon(word, icon, cls = '') {
  const s = el('span', 'ik ' + cls); s.dataset.w = word;
  const cap = keycap(cls.includes('ask')); cap.classList.add('cap'); icon.classList.add('glyph');
  // Aang's face is drawn bigger than a glyph: it sits in his plum key at glyph size, the key showing round it
  if (cls.includes('ask')) { icon.style.width = '18px'; icon.style.height = '18px'; icon.style.left = '7px'; icon.style.top = '4px'; }
  s.append(cap, icon);
  return s;
}
function acts(it) {
  const a = el('div', 'acts');
  a.append(keyIcon('Copy', clone(ICON.copy)), keyIcon(it.pinned ? 'Unpin' : 'Pin to the top', clone(ICON.pin), it.pinned ? 'on' : ''),
    keyIcon('Keep as a note', clone(ICON.note)), keyIcon('Ask Aang about it', face(), 'ask'), keyIcon('Bin', clone(ICON.bin), 'bin'));
  return a;
}
function card(it) {
  const c = el('div', 'card ' + it.kind); c.style.width = W + 'px';
  const cin = el('div', 'cin');
  if (it.kind === 'text') cin.append(el('div', '', it.text));
  if (it.kind === 'code') cin.append(el('div', 'code', it.text));
  if (it.kind === 'link') { const r = el('div', 'row'); r.append(fav(it.letter, it.col), el('div', 'ln', `<b>${it.title}</b><span>${it.host}</span>`)); cin.append(r); }
  if (it.kind === 'pic') { const p = el('div', 'pic'); const a = cover(Math.floor((W - 32) / P), P, it.look ?? 'dusk'); p.style.height = '110px'; p.append(a); a.style.marginTop = '-130px'; cin.append(p); }
  if (it.kind === 'snip') cin.append(snipPic(160, 40));
  if (it.kind === 'file') { const r = el('div', 'row file'); const i = el('img'); i.src = '../../../src/Shell/pages/art/browser/' + it.icon; r.append(i, el('div', 'ln', `<b>${it.name}</b><span>${it.size}</span>`)); cin.append(r); }
  if (it.kind === 'color') { const r = el('div', 'row'); const s = el('span', 'sw'); s.style.background = it.hex; r.append(s, el('div', 'ln', `<b>${it.hex}</b><span>a colour</span>`)); cin.append(r); }
  const meta = el('div', 'meta', it.meta);
  if (it.mac) meta.append(el('span', 'mac', 'from the Mac'));
  cin.append(meta); c.append(cin, acts(it));
  c._it = it; c._words = [it.text, it.title, it.host, it.name, it.hex, it.meta, it.kind].filter(Boolean).join(' ').toLowerCase();
  return c;
}
function dress(c) {
  if (c.querySelector(':scope > canvas.paper') || !c.offsetHeight) return c;
  const col = c._it.kind === 'snip' ? PAPER.snip : c._it.mac ? PAPER.mac : PAPER.clip;
  const pp = paper('B', c.offsetWidth / P, Math.max(24, Math.ceil(c.offsetHeight / P)), col, { small: true, lifted: true }); pp.classList.add('paper'); c.prepend(pp);
  return c;
}
const PINNED = [
  { kind: 'link', letter: 'W', col: '#2f78b8', title: 'Patch notes: Forever 1.4', host: 'forever.warcraft.com', meta: 'pinned · from Samara', pinned: true },
  { kind: 'text', text: 'Molten Core, Fri 8pm. Bring fire resist.', meta: 'pinned · Discord', pinned: true },
];
const TODAY = [
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

// ---------------------------------------------------------------- the desk: a hover area, the tab, the Satchel
const desk = $('#desk');
desk.innerHTML = '<div class="wall">YOUR MAIN SCREEN · HOVER THE MIDDLE OF THE RIGHT EDGE, OR PRESS CTRL + ALT + V</div><div class="appwin"><b>Discord · #raid-night</b><div class="drop">drop here</div></div>';
const dragme = el('div', 'dragme'); const dimg = el('img'); dimg.src = '../../../src/Shell/pages/art/browser/file_img.png'; dragme.append(dimg, el('span', '', 'Raid comp.png')); desk.append(dragme);
const zone = el('div', 'zone'); desk.append(zone);                                   // invisible: the middle third of the right edge
const tab = el('div', 'tab tabA'); tab.append(satchelIcon()); tab.title = 'Satchel (Ctrl + Alt + V)'; desk.append(tab);
const sat = el('div', 'shelf'); desk.append(sat);
const wood = rr(392 / P, 580 / P, 9, { band: 's2', E: 4, fill: fills.wood(1) }); wood.classList.add('wood'); sat.append(wood);
const hd = el('div', 'hd'); const ic = satchelIcon(); ic.classList.add('hdic'); hd.append(ic, el('span', 'ttl', 'Satchel'), el('span', 'hk', 'Ctrl + Alt + V')); sat.append(hd);
const search = el('input', 'search'); search.placeholder = 'Type to find a clip'; sat.append(search);
const chips = el('div', 'chips'); ['All', 'Text', 'Links', 'Pictures', 'Snips', 'Files'].forEach((t, i) => chips.append(el('span', 'chip' + (i ? '' : ' on'), t))); sat.append(chips);
const list = el('div', 'list'); sat.append(list);
const secPin = el('div', 'sec', 'PINNED'), secToday = el('div', 'sec', 'TODAY');
list.append(secPin); for (const it of PINNED) list.append(card(it));
list.append(secToday); for (const it of TODAY) list.append(card(it));
const none = el('div', 'none', 'Nothing in your Satchel matches that.'); none.style.display = 'none'; list.append(none);
requestAnimationFrame(() => list.querySelectorAll('.card').forEach(dress));

let isOpen = false, entered = false, sel = -1;
const cards = () => [...list.querySelectorAll('.card')].filter((c) => c.style.display !== 'none');
function setOpen(v, how = 'click') {
  if (v === isOpen) return; isOpen = v; entered = false;
  sat.classList.add('moving'); sat.classList.toggle('open', v); desk.classList.toggle('isopen', v); tab.classList.remove('peek');
  setTimeout(() => sat.classList.remove('moving'), 420 * slow());
  if (v) { requestAnimationFrame(() => list.querySelectorAll('.card').forEach(dress)); if (how === 'key') { search.value = ''; filter(); setTimeout(() => search.focus(), 60); select(0); } }
  else { search.blur(); select(-1); }
}
// The tab: hover the area and it peeks out on a spring; it goes back a moment after the mouse leaves both.
let hideTab = null;
const peekOn = () => { if (isOpen || desk.classList.contains('gaming')) return; clearTimeout(hideTab); tab.classList.add('peek'); };
const peekOff = () => { clearTimeout(hideTab); hideTab = setTimeout(() => tab.classList.remove('peek'), 700); };
zone.addEventListener('mouseenter', peekOn); zone.addEventListener('mouseleave', peekOff);
tab.addEventListener('mouseenter', peekOn); tab.addEventListener('mouseleave', peekOff);
tab.addEventListener('click', () => setOpen(true));
// Closing, his four ways: Esc, a click outside, the hotkey again, the mouse wandering off after it was in.
let wander = null;
sat.addEventListener('mouseenter', () => { entered = true; clearTimeout(wander); });
sat.addEventListener('mouseleave', () => { if (isOpen && entered) wander = setTimeout(() => setOpen(false), 900); });
desk.addEventListener('pointerdown', (e) => { if (isOpen && !sat.contains(e.target)) setOpen(false); });
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'v') { e.preventDefault(); setOpen(!isOpen, 'key'); return; }
  if (!isOpen) return;
  if (e.key === 'Escape') { setOpen(false); return; }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const n = cards().length; select(Math.max(0, Math.min(n - 1, sel + (e.key === 'ArrowDown' ? 1 : -1)))); return; }
  if (e.key === 'Enter' && sel >= 0) { e.preventDefault(); copied(cards()[sel], true); }
});
function select(i) { cards().forEach((c, k) => c.classList.toggle('sel', k === i)); sel = i; }
function filter() {
  const q = search.value.trim().toLowerCase();
  for (const c of list.querySelectorAll('.card')) c.style.display = !q || c._words.includes(q) ? '' : 'none';
  // a section with nothing left in it hides; nothing at all says so in a line
  for (const sec of [secPin, secToday]) { let n = sec.nextElementSibling, any = false; while (n && !n.classList.contains('sec')) { if (n.style.display !== 'none' && n.classList.contains('card')) any = true; n = n.nextElementSibling; } sec.style.display = any ? '' : 'none'; }
  none.style.display = cards().length ? 'none' : '';
  select(cards().length ? 0 : -1);
}
search.addEventListener('input', filter);
// A click on a clip copies it and the Satchel stays; Enter copies and closes (his picks).
function copied(c, andClose = false) {
  if (!c) return;
  c.append(el('div', 'ripple'));
  const r = c.getBoundingClientRect(), d = desk.getBoundingClientRect();
  const t = el('div', 'toast', 'Copied'); at(desk, t, r.left - d.left + 150, r.top - d.top - 26);
  setTimeout(() => { c.querySelector('.ripple')?.remove(); t.remove(); }, 1150 * slow());
  if (andClose) setTimeout(() => setOpen(false), 380 * slow());
}
list.addEventListener('click', (e) => { const c = e.target.closest('.card'); if (c && !e.target.closest('.acts')) copied(c); });

function arrive(it) {
  const before = new Map(cards().map((c) => [c, c.getBoundingClientRect().top]));
  const c = card(it); c.classList.add('entering'); secToday.after(c); dress(c);
  for (const [o, top] of before) { const d = top - o.getBoundingClientRect().top; if (!d) continue; o.style.transition = 'none'; o.style.transform = `translateY(${d}px)`; }
  requestAnimationFrame(() => requestAnimationFrame(() => { for (const o of before.keys()) { o.style.transition = 'transform calc(var(--drop-ms) * var(--slow)) var(--drop-ease)'; o.style.transform = ''; } }));
  setTimeout(() => { c.classList.remove('entering'); for (const o of before.keys()) o.style.transition = ''; }, (drop.ms + 80) * slow());
}

// ---------------------------------------------------------------- the demo keys (outside the desk, so they never count as "a click outside")
let nNew = 0;
const keys = $('#keys');
function key(label, fn, cls = '') { const b = el('button', cls, label); b.onclick = fn; keys.append(b); return b; }
const later = (fn) => (isOpen ? fn() : (setOpen(true), setTimeout(fn, 330 * slow())));
key('Ctrl + Alt + V', () => setOpen(!isOpen, 'key'));
key('You copy something', () => later(() => arrive(NEW[nNew++ % NEW.length])));
key('Drop a file onto the tab', () => {
  if (isOpen) setOpen(false);
  tab.classList.add('peek');
  const fr = dragme.getBoundingClientRect();
  setTimeout(() => {
    const t = tab.getBoundingClientRect();
    dragme.classList.add('flying'); dragme.style.transform = `translate(${t.left - fr.left - 40}px, ${t.top - fr.top + 8}px) rotate(6deg) scale(.8)`;
  }, 250 * slow());
  setTimeout(() => tab.classList.add('hot'), 1000 * slow());
  setTimeout(() => { tab.classList.remove('hot'); dragme.classList.remove('flying'); dragme.style.transform = ''; setOpen(true); }, 1350 * slow());
  setTimeout(() => arrive({ kind: 'file', icon: 'file_img.png', name: 'Raid comp.png', size: '1.2 MB · dropped on the Satchel', meta: 'just now · dragged in' }), 1750 * slow());
});
key('Drag a picture out', () => later(() => {
  const src = list.querySelector('.card.pic') ?? list.querySelector('.card'); const r = src.getBoundingClientRect(), d = desk.getBoundingClientRect();
  const g = el('div', 'ghost'); const pp = src.querySelector('canvas.paper');
  // the drag picture: Edge-Drop's fan of up to three, 5 degrees apart
  for (let i = 2; i >= 0; i--) { const cv = clone(pp); cv.style.transform = `translate(${i * 10}px, ${-i * 4}px) rotate(${-i * 5}deg) scale(${1 - i * 0.04})`; cv.style.opacity = String(1 - i * 0.25); g.append(cv); }
  g.style.left = r.left - d.left + 'px'; g.style.top = r.top - d.top + 'px'; g.style.transform = 'scale(.62)'; g.style.transformOrigin = '0 0'; desk.append(g);
  const dz = $('.appwin .drop', desk), z = dz.getBoundingClientRect();
  requestAnimationFrame(() => requestAnimationFrame(() => { g.style.transform = `translate(${z.left - r.left + 40}px, ${z.top - r.top + 10}px) scale(.42) rotate(-4deg)`; dz.classList.add('hot'); }));
  setTimeout(() => { g.style.opacity = '0'; dz.textContent = 'a picture, dropped in'; }, 900 * slow());
  setTimeout(() => { g.remove(); dz.classList.remove('hot'); dz.textContent = 'drop here'; }, 2200 * slow());
}));
const kGame = key('A game is running', () => { const on = desk.classList.toggle('gaming'); tab.classList.remove('peek'); kGame.classList.toggle('on', on); kGame.textContent = on ? 'Game running: the tab stays hidden' : 'A game is running'; }, 'plum');
const kSlow = key('Slow motion', () => { const on = slow() === 1; root.setProperty('--slow', on ? '4' : '1'); kSlow.classList.toggle('on', on); }, 'plum');

// ---------------------------------------------------------------- the tab, three looks
const looks = $('#tablooks');
for (const [k, name, why] of [['A', 'A · WOOD TAB (MY PICK)', "Samara's wood with the satchel on it: the same wood as the Satchel it opens."], ['B', "B · AANG-BLUE TAB", "Aang's pale blue, like Snipit: says \"Aang's\" at a glance."], ['C', 'C · GOLD RIBBON', "A slim ribbon like the notes' tab: the smallest of the three."]]) {
  const cell = el('div', 'look'); const stage = el('div', 'lookstage'); const t = el('div', `tab tab${k} peek still`); t.append(satchelIcon()); stage.append(t);
  cell.append(el('div', 'lbl', name), stage, el('p', '', why)); looks.append(cell);
}
// the icons, each with its word
const legend = $('#iconlegend');
for (const [w, i, cls] of [['Copy', clone(ICON.copy), ''], ['Pin to the top', clone(ICON.pin), ''], ['Keep as a note', clone(ICON.note), ''], ['Ask Aang about it', face(), 'ask'], ['Bin', clone(ICON.bin), '']]) {
  const r = el('div', 'leg'); const k = keyIcon(w, i, cls); delete k.dataset.w; r.append(k, el('b', '', w)); legend.append(r);
}

// ---------------------------------------------------------------- the bubble with the same spring
const bd = $('#bubdemo');
const aang = el('div', 'aang'); const fc = face(); fc.style.transform = 'scale(2)'; fc.style.transformOrigin = '0 100%'; aang.append(fc); bd.append(aang);
const bub = el('div', 'bub'); bd.append(bub);
const say = el('p', '', 'The link you copied yesterday at 9:40 pm: the Forever 1.4 patch notes.<br><span class="door">Open it in the Satchel</span>');
bub.append(say);
requestAnimationFrame(() => { const h = say.offsetHeight; const parch = rr(380 / P, Math.ceil(h / P), 8, { band: 's2', E: 3, fill: fills.paper(Math.ceil(h / P)) }); parch.style.position = 'absolute'; bub.prepend(parch); bub.style.height = h + 'px'; });
const bkeys = $('#bubkeys');
const bb = el('button', '', 'Ask: what was that link I copied yesterday?'); bb.onclick = () => bub.classList.add('open'); bkeys.append(bb);
const bc = el('button', 'plum', 'Close'); bc.onclick = () => bub.classList.remove('open'); bkeys.append(bc);

// ---------------------------------------------------------------- with the rest of Aang (still pictures)
const f1 = $('#flow-snip');
f1.append(el('div', 'cap', 'A SNIP ALSO LANDS IN THE SATCHEL, MARKED NEW'));
const s1 = card({ kind: 'snip', meta: 'just now · Snipit' }); at(f1, s1, 80, 70); requestAnimationFrame(() => dress(s1));
at(f1, el('div', 'hint', 'NEW'), 392, 62);
const f2 = $('#flow-note');
f2.append(el('div', 'cap', 'KEEP AS A NOTE: THE QUICK NOTE OPENS WITH THE CLIP IN IT'));
const qn = el('div', 'papernote quick'); const qp = paper('B', 360 / P, 226 / P, 'B', { small: true }); qn.append(qp, el('div', 'b', 'Read before raid night<span class="caret"></span>'));
const inNote = card({ kind: 'link', letter: 'W', col: '#2f78b8', title: 'Patch notes: Forever 1.4', host: 'forever.warcraft.com', meta: 'from your Satchel' }); inNote.style.width = '320px'; inNote.querySelector('.acts').remove();
const holder = el('div', 'innote'); holder.append(inNote); qn.append(holder, el('div', 'qfoot', '<span class="cat"># category</span><span class="ctrl">Ctrl + *</span>'));
at(f2, qn, 80, 46); requestAnimationFrame(() => dress(inNote));

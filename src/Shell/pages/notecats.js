// @ts-nocheck  (a page module, like the other pages: checked by its tests, not by tsc)
// Sheet 60 (v5, his picks 2026-10-22): a note's colour comes FROM its category. No colour dots, nothing else to pick.
// A plain note is butter; To-do sky blue, Idea green, Reference stone, For Claude coral (Claude's own colour); each
// category he makes takes the next free colour (Recipes, the sheet's example, got mauve). The papers differ in hue AND
// lightness, pair by pair (the sheet's CIELAB + colour-blindness check: notes.js STICKY / DOT, copied exactly).
//
// What holds a note up is the RIBBON TAB (sheet 60 section 2, option A, "ribbons are wonderful"): a slim bookmark over
// the top edge in the category's deep colour with a gold fold. The brown pushpin is gone everywhere.
//
// Shared by every place a note is drawn: the note on his screen and the quick note (note.html), the board in Aang's
// bubble (bubble.js), and the notes rail in Samara (browser.js). Pixel art is drawn at whole-number scale, never smoothed.

/** The plain note, and the four categories every board has. `paper` is the note, `deep` its ribbon and swatch rim. */
export const PLAIN = { name: 'Just a note', paper: '#f8dc8e', deep: '#d9a83a' };
export const BUILTIN = [
  { name: 'To-do', paper: '#84c9f8', deep: '#2f78b8' },
  { name: 'Idea', paper: '#a8dba5', deep: '#3f8a4e' },
  { name: 'Reference', paper: '#dbd3cb', deep: '#7a6e60' },
  { name: 'For Claude', paper: '#e79c7b', deep: '#c4572f' },
];
/** His own categories, in the order he made them: the first is the sheet's mauve, then the next free colours. */
export const OWN = [
  { paper: '#d49dbb', deep: '#9a4478' },   // mauve (the sheet's "Recipes")
  { paper: '#a99be6', deep: '#5b48b0' },   // lavender: violet, darker than To-do's sky
  { paper: '#62c2b2', deep: '#1f7e72' },   // teal: darker and bluer than Idea's green
  { paper: '#c9a77a', deep: '#8a6a3e' },   // sand: warmer and darker than Reference's stone
  { paper: '#9fb0c6', deep: '#4f6178' },   // slate
  { paper: '#f0b3c3', deep: '#b0506a' },   // blush
];

/** His own categories as the brain last sent them (notes.state cats.own). */
let own = [];
export function setOwnCats(list) { own = Array.isArray(list) ? list.map((c) => String(c ?? '')).filter(Boolean).slice(0, 12) : []; }
export function ownCats() { return [...own]; }

/**
 * The colours of a category: plain for none; a built-in by its name (any case); his own by its place in his list, so
 * the colour stays with it as notes come and go. A name nobody knows yet (just typed) gets the next free colour.
 * @param {string|undefined|null} cat @param {string[]} [mine]
 */
export function catColour(cat, mine = own) {
  const c = String(cat ?? '').trim();
  if (!c) return { ...PLAIN, name: PLAIN.name, plain: true };
  const k = c.toLowerCase();
  const b = BUILTIN.find((x) => x.name.toLowerCase() === k);
  if (b) return { ...b, plain: false };
  let i = mine.findIndex((x) => String(x).toLowerCase() === k);
  if (i < 0) i = mine.length;
  return { ...OWN[i % OWN.length], name: c, plain: false };
}
/** Every category a picker lists: plain first, the four, then his own, each with its colour. */
export function allCats(mine = own) {
  return [{ ...PLAIN, cat: '' }, ...BUILTIN.map((b) => ({ ...b, cat: b.name })), ...mine.map((m) => ({ ...catColour(m, mine), cat: m }))];
}
/** Put a category's colours on an element as CSS variables (the paper cross-fades when they change, notecats.css). */
export function paintCat(el, cat, mine = own) {
  const c = catColour(cat, mine);
  el.style.setProperty('--paper', c.paper);
  el.style.setProperty('--deep', c.deep);
  el.dataset.cat = c.plain ? '' : c.name;
  return c;
}

// ---------------------------------------------------------------- the pixels (drawn at whole-number scale)
const hex = (h) => { const n = parseInt(String(h).replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mix = (a, b, t) => { const x = hex(a), y = hex(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
export { mix };
/** One sprite from rows of letters, each letter one art pixel, drawn `scale` CSS px wide (crisp). */
function sprite(rows, colours, scale = 2) {
  const c = document.createElement('canvas');
  const w = rows[0].length, h = rows.length, dpr = Math.max(1, Math.round(globalThis.devicePixelRatio || 1));
  c.width = w * scale * dpr; c.height = h * scale * dpr;
  c.style.width = w * scale + 'px'; c.style.height = h * scale + 'px';
  c.style.imageRendering = 'pixelated';
  const g = c.getContext('2d');
  if (!g) return c;
  const s = scale * dpr;
  rows.forEach((r, y) => [...r].forEach((ch, x) => { const col = colours[ch]; if (!col) return; g.fillStyle = col; g.fillRect(x * s, y * s, s, s); }));
  return c;
}
/** The ribbon tab (sheet 60 notes.js fastTab, pixel for pixel): category colour, gold fold, a notched tail. */
export function ribbon(deep, scale = 2) {
  const R = ['OOOOOOOOO', 'OGLLLLLGO', 'OGGGGGGGO', 'OHFFFFFSO', 'OHFFFFFSO', 'OHFFFFFSO', 'OHFFFFFSO', 'OHFFFFFSO', 'OHFFFFFSO', 'OHFFFFFSO', 'OHFFFFFSO', 'OHFFOFFSO', 'OHFO.OFSO', 'OHO...OSO', 'OO.....OO'];
  const c = sprite(R, { O: '#2c1c10', G: '#c98c14', L: '#ffe096', H: mix(deep, '#ffffff', 0.35), F: deep, S: mix(deep, '#1a0e06', 0.3) }, scale);
  c.className = 'np-ribbon';
  return c;
}
/** "Aang can bring this up": the sheet's small switch, gold track and the plum gem when on (14 x 8 art pixels). */
export function switchArt(on, scale = 2) {
  const rows = [];
  for (let y = 0; y < 8; y++) {
    let r = '';
    for (let x = 0; x < 14; x++) {
      const d = Math.hypot(Math.max(0, Math.abs(x + 0.5 - 7) - 3), y + 0.5 - 4);
      const kx = on ? 9 : 4, kd = Math.hypot(x + 0.5 - kx, y + 0.5 - 4);
      if (kd <= 3 && y >= 1 && y < 7) r += kd > 2.3 ? 'O' : y < 3 ? 'a' : y < 5 ? 'b' : 'c';
      else if (d > 3.9) r += '.';
      else if (d > 3.0) r += 'E';
      else r += on ? (y < 3 ? 'L' : 'G') : (y < 3 ? 'l' : 'g');
    }
    rows.push(r);
  }
  return sprite(rows, { E: '#4a2e1a', L: '#ffe096', G: '#e9b949', l: '#8a7a62', g: '#6f6455', O: '#120a05', a: '#d9c2ff', b: '#8a5cc4', c: '#4A2C6E' }, scale);
}
/** The checklist key's picture: a ticked box over two lines (9 x 7 art pixels). */
export function checkArt(on, scale = 2) {
  const rows = ['III......', 'I.I.IIIII', 'III......', '.........', 'III......', 'III.IIIII', 'III......'];
  return sprite(rows, { I: on ? '#ffffff' : '#4a3a28' }, scale);
}
/** A tick box, 7 x 7 art pixels: the job pop-out's teal done box. */
export function boxArt(done, scale = 2) {
  const rows = [];
  for (let y = 0; y < 7; y++) { let r = ''; for (let x = 0; x < 7; x++) { const rim = x === 0 || y === 0 || x === 6 || y === 6, corner = (x === 0 || x === 6) && (y === 0 || y === 6); r += corner ? '.' : rim ? 'R' : 'F'; } rows.push(r); }
  if (done) [[1, 3], [2, 4], [3, 5], [4, 4], [5, 3], [5, 2]].forEach(([x, y]) => { rows[y] = rows[y].slice(0, x) + 'W' + rows[y].slice(x + 1); });
  return sprite(rows, { R: done ? '#2f6f66' : '#6b5236', F: done ? '#58b0a3' : 'rgba(255,255,255,.55)', W: '#ffffff' }, scale);
}

// ---------------------------------------------------------------- the control row (one on every note, sheet 60 section 3)
/**
 * `# category`, the checklist key, and "Aang can bring this up". The same on a quick note, a note on the screen and a
 * note opened from the board. `act(what, value)`: 'cat' (open the picker; value = the chip), 'check', 'notice' (bool).
 */
export function controls(n, act) {
  const f = document.createElement('div'); f.className = 'np-ctl';
  const r1 = document.createElement('div'); r1.className = 'np-r1';
  const chip = document.createElement('button'); chip.type = 'button'; chip.className = 'np-chip' + (n.cat ? '' : ' ghost');
  chip.innerHTML = '<i>#</i>'; chip.append(document.createTextNode(n.cat || 'category'));
  chip.title = 'Category: its colour comes with it';
  chip.addEventListener('mousedown', (e) => e.preventDefault());
  chip.addEventListener('click', (e) => { e.stopPropagation(); act('cat', chip); });
  const isList = /class="cl/.test(String(n.html ?? ''));
  const ck = document.createElement('button'); ck.type = 'button'; ck.className = 'np-ck' + (isList ? ' on' : '');
  ck.title = isList ? 'Checklist: on' : 'Make it a checklist';
  ck.append(checkArt(isList));
  ck.addEventListener('mousedown', (e) => e.preventDefault());
  ck.addEventListener('click', (e) => { e.stopPropagation(); act('check'); });
  r1.append(chip, ck);
  const r2 = document.createElement('button'); r2.type = 'button'; r2.className = 'np-r2';
  const on = n.notice !== false;
  r2.append(switchArt(on), Object.assign(document.createElement('span'), { textContent: on ? 'Aang can bring this up' : 'Aang keeps this one to himself' }));
  r2.title = on ? 'Aang may bring this note up himself. Click to keep it to yourself.' : 'Aang only reads it when you ask. Click to let him bring it up.';
  r2.addEventListener('mousedown', (e) => e.preventDefault());
  r2.addEventListener('click', (e) => { e.stopPropagation(); act('notice', !on); });
  f.append(r1, r2);
  return f;
}

/**
 * The category list (sheet 60 B-cats): each with its colour beside its name, plain first, "+ New category" last (it
 * gets the next colour). `pick(cat)` with '' for plain; the picker closes itself on a pick, a click away or Esc.
 */
export function openPicker(host, at, current, pick, mine = own) {
  closePicker(host);
  const p = document.createElement('div'); p.className = 'np-pick'; p.id = 'nppick';
  p.append(Object.assign(document.createElement('div'), { className: 'np-ph', textContent: 'Category = its colour' }));
  for (const c of allCats(mine)) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'np-prow' + ((c.cat || '') === (current || '') ? ' on' : '');
    const sw = document.createElement('i'); sw.style.setProperty('--paper', c.paper); sw.style.setProperty('--deep', c.deep);
    b.append(sw, Object.assign(document.createElement('span'), { textContent: c.cat ? c.cat : PLAIN.name }));
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', (e) => { e.stopPropagation(); closePicker(host); pick(c.cat); });
    p.append(b);
  }
  const add = document.createElement('div'); add.className = 'np-padd';
  const next = catColour('\u0000new', mine);
  const plus = document.createElement('button'); plus.type = 'button'; plus.className = 'np-prow new';
  const sw = document.createElement('i'); sw.style.setProperty('--paper', next.paper); sw.style.setProperty('--deep', next.deep);
  plus.append(sw, Object.assign(document.createElement('span'), { textContent: '+ New category' }), Object.assign(document.createElement('em'), { textContent: 'gets the next colour' }));
  const box = document.createElement('input'); box.className = 'np-pin'; box.type = 'text'; box.maxLength = 24; box.placeholder = 'Name it, then Enter'; box.hidden = true; box.spellcheck = false;
  plus.addEventListener('click', (e) => { e.stopPropagation(); plus.hidden = true; box.hidden = false; box.focus(); });
  box.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); closePicker(host); }
    if (e.key === 'Enter') { e.preventDefault(); const v = box.value.replace(/[<>#]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24); if (v) { closePicker(host); pick(v); } }
  });
  add.append(plus, box);
  p.append(add);
  host.append(p);
  const hw = host.clientWidth || innerWidth, hh = host.clientHeight || innerHeight;
  p.style.left = Math.max(4, Math.min(at.x, hw - p.offsetWidth - 4)) + 'px';
  p.style.top = Math.max(4, Math.min(at.y, hh - p.offsetHeight - 4)) + 'px';
  const away = (e) => { if (!p.contains(/** @type {Node} */ (e.target))) closePicker(host); };
  const esc = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePicker(host); } };
  setTimeout(() => { document.addEventListener('pointerdown', away, true); document.addEventListener('keydown', esc, true); }, 0);
  /** @type {any} */ (p).__off = () => { document.removeEventListener('pointerdown', away, true); document.removeEventListener('keydown', esc, true); };
  return p;
}
export function closePicker(host) {
  const p = /** @type {any} */ (host.querySelector('#nppick'));
  if (!p) return false;
  p.__off?.();
  p.remove();
  return true;
}

/** Tick boxes on every line of the note, or off again when it already is a checklist (the checklist key). */
export function toggleChecklist(body) {
  // Loose text and <br>-separated lines become a line each first, so every line can carry a box.
  const kids = [...body.childNodes];
  if (kids.some((k) => k.nodeType === 3 || (k.nodeType === 1 && !['DIV', 'UL', 'OL', 'H3'].includes(/** @type {Element} */ (k).tagName)))) {
    const lines = []; let cur = document.createElement('div');
    for (const k of kids) {
      if (k.nodeType === 1 && ['DIV', 'UL', 'OL', 'H3'].includes(/** @type {Element} */ (k).tagName)) { if (cur.childNodes.length) lines.push(cur); cur = document.createElement('div'); lines.push(k); continue; }
      if (k.nodeType === 1 && /** @type {Element} */ (k).tagName === 'BR') { lines.push(cur); cur = document.createElement('div'); continue; }
      cur.append(k);
    }
    if (cur.childNodes.length) lines.push(cur);
    body.replaceChildren(...lines);
  }
  const rows = [...body.children].filter((e) => e.tagName === 'DIV' && (e.textContent ?? '').trim());
  const on = !rows.some((e) => e.classList.contains('cl'));
  for (const e of rows) { e.classList.toggle('cl', on); if (!on) e.classList.remove('done'); }
  return on;
}

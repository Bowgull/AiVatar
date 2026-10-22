// Sheet 67 v2 (2026-10-22): a timer's right-click menu, in Aang's menu look. Lifted from docs/cockpit/sheet-67/sheet67.js
// (timerMenu / newMenu, the 11x11 icons) and drawn with the markup aangmenu.js uses (.tabmenu > button, .sep, .mhead).
//   New timer ▸ 5 / 10 / 25 / 45 minutes, Custom (type a time, Enter)
//   Rename (on the nameplate itself)      Colour ▸ Blue / Gold / Rose / Jade / Violet (sheet 67b)
//   Restart (or hold the glass)           joined: See-through, Pin on top, Click through, Pull apart (the family's rows)
//   Stop (hold, red, last)
// The window covers the work area and is cut to the menus' shape; it takes the keys while it is up (Esc closes it, the
// Custom field types) and goes when he clicks away. Every pick goes back to timerwin.ts, which checks it.

const P = 2, N = 11;
const ICONS = {
  newt: ['OOOOOOOOOOO', '.O.......O.', '..OAAAAAO..', '...OAAAO...', '....OAO....', '.....O.....', '....O.O....', '...O.A.O...', '..O.AAA.O..', '.OAAAAAAAO.', 'OOOOOOOOOOO'],
  rename: ['........OO.', '.......OAAO', '......OAAO.', '.....OAAO..', '....OAAO...', '...OAAO....', '..OAAO.....', '.OOAO......', '.OOO.......', 'OO.........', '...........'],
  restart: ['...OOOO.O..', '..O....OO..', '.O....OOO..', 'O..........', 'O..........', 'O.........O', 'O.........O', '.O.......O.', '..O.....O..', '...OOOOO...', '...........'],
  quit: ['OO.......OO', 'OOO.....OOO', '.OOO...OOO.', '..OOO.OOO..', '...OOOOO...', '....OOO....', '...OOOOO...', '..OOO.OOO..', '.OOO...OOO.', 'OOO.....OOO', 'OO.......OO'],
  see: ['...OOOOO...', '.OOOOO..OO.', '.OOOOO...O.', 'OOOOOO....O', 'OOOOOO....O', 'OOOOOO....O', 'OOOOOO....O', 'OOOOOO....O', '.OOOOO...O.', '.OOOOO..OO.', '...OOOOO...'],
  pin: ['...OOOOO...', '...O.A.O...', '...O.A.O...', '...O.A.O...', '..OO.A.OO..', '.OOOOOOOOO.', '.....O.....', '.....O.....', '.....O.....', '.....O.....', '.....O.....'],
  apart: ['OOOO...OOOO', 'O..O...O..O', 'O..O...O..O', 'OOOO...OOOO', '...........', '...........', '...........', 'OOOO...OOOO', 'O..O...O..O', 'O..O...O..O', 'OOOO...OOOO'],
  tick: ['...........', '...........', '..........O', '.........OO', 'O.......OO.', 'OO.....OO..', '.OO...OO...', '..OO.OO....', '...OOO.....', '....O......', '...........'],
  // a little heap of sand, in the timer's colour (edge = the deep shade, fill = the light one)
  sand: ['...........', '...........', '...........', '.....O.....', '....OAO....', '...OAAAO...', '..OAAAAAO..', '.OAAAAAAAO.', 'OAAAAAAAAAO', 'OOOOOOOOOOO', '...........'],
};
const TONE = { O: '#d8c8a8', A: '#a8946e', sh: 'rgba(0,0,0,.65)', red: '#ff9a8a', tick: '#ffe28c' };
// sheet 67b's sands: [light, deep]
const SWATCH = { blue: ['#9BE7D8', '#3A9688'], gold: ['#F9DA92', '#CF9645'], rose: ['#F8B6C6', '#BF5F78'], jade: ['#B6E89E', '#5A9E48'], violet: ['#D3B0F5', '#8460B4'] };
const NAMES = { blue: 'Blue', gold: 'Gold', rose: 'Rose', jade: 'Jade', violet: 'Violet' };
const HOLD = 600, MIN_SEE = 0.3;

function icon(name, O = TONE.O, A = TONE.A) {
  const map = ICONS[name], pal = { O, A };
  const dpr = window.devicePixelRatio || 1, px = Math.max(1, Math.round(P * dpr)), sh = Math.max(1, Math.round(dpr));
  const c = document.createElement('canvas'); c.width = N * px + sh; c.height = N * px + sh;
  const g = c.getContext('2d');
  const put = (col, o) => map.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch]) { g.fillStyle = col ?? pal[ch]; g.fillRect(x * px + o, y * px + o, px, px); } }));
  put(TONE.sh, sh); put(null, 0);
  c.className = 'ic'; c.style.width = (c.width / dpr) + 'px'; c.style.height = (c.height / dpr) + 'px';
  c.setAttribute('aria-hidden', 'true');
  return c;
}
const h = (t, c, text) => { const e = document.createElement(t); if (c) e.className = c; if (text !== undefined) e.textContent = text; return e; };
const api = window.aang;
let main = null, sub = null, subFor = '', st = null, area = { w: 0, h: 0 };

function row(o) {
  const b = /** @type {HTMLButtonElement} */ (h('button')); b.type = 'button'; b.setAttribute('role', 'menuitem'); b.dataset.id = o.id;
  if (o.danger) b.classList.add('danger');
  const lab = h('span', 'lab'); lab.append(o.icon ?? icon(o.ic, o.danger ? TONE.red : TONE.O, o.danger ? TONE.red : TONE.A), o.t); b.append(lab);
  const i = h('i'); if (o.tag) { i.className = 'st'; i.append(o.tag); }
  if (o.sub) i.append(Object.assign(h('b', 'ar'), { textContent: '▸' }));
  if (o.tick) { const k = icon('tick', TONE.tick); k.classList.add('tk'); i.append(k); b.classList.add('on'); }
  b.append(i);
  if (o.on) b.addEventListener('click', o.on);
  return b;
}
const pick = (what, extra = {}) => api?.timerMenuPick?.({ what, ...extra });

/** "25" = minutes, "1:30" = minutes and seconds, "1h 20m", "90s". Null unless 10 s to 24 h. */
export function parseCustom(s) {
  s = String(s).trim().toLowerCase();
  let ms = null, m;
  if ((m = /^(\d{1,3}):(\d{1,2})$/.exec(s))) ms = (Number(m[1]) * 60 + Number(m[2])) * 1000;
  else if (/^\d+(\.\d+)?$/.test(s)) ms = Number(s) * 60_000;
  else if (/^(\d+(\.\d+)?\s*(h|hr|hrs|hours?|m|min|mins|minutes?|s|sec|secs|seconds?)\s*)+$/.test(s)) {
    ms = 0; for (const x of s.matchAll(/(\d+(?:\.\d+)?)\s*([hms])/g)) ms += Number(x[1]) * (x[2] === 'h' ? 3_600_000 : x[2] === 'm' ? 60_000 : 1000);
  }
  return ms !== null && ms >= 10_000 && ms <= 24 * 3_600_000 ? Math.round(ms) : null;
}

function newMenu() {
  const m = h('div', 'tabmenu'); m.setAttribute('role', 'menu'); m.id = 'tm-new'; m.style.minWidth = '230px';
  for (const n of [5, 10, 25, 45]) m.append(row({ id: 'new' + n, ic: 'newt', t: `${n} minutes`, on: () => pick('new', { ms: n * 60_000 }) }));
  m.append(h('div', 'sep'), h('div', 'mhead', 'Custom'));
  const tf = h('div', 'tf'), inp = /** @type {HTMLInputElement} */ (h('input')); inp.placeholder = '1:30'; inp.maxLength = 12; inp.setAttribute('aria-label', 'Custom time');
  inp.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const ms = parseCustom(inp.value);
    if (ms) pick('new', { ms }); else inp.classList.add('bad');
  });
  inp.addEventListener('input', () => inp.classList.remove('bad'));
  const kc = h('span', 'kc', 'Enter');
  tf.append(inp, kc, h('span', 'mcap', 'to start'));
  m.append(tf);
  return m;
}
function colourMenu() {
  const m = h('div', 'tabmenu'); m.setAttribute('role', 'menu'); m.id = 'tm-colour'; m.style.minWidth = '200px';
  for (const c of Object.keys(SWATCH)) {
    const [light, deep] = SWATCH[c];
    m.append(row({ id: 'colour-' + c, icon: icon('sand', deep, light), t: NAMES[c], tick: st?.colour === c, on: () => pick('colour', { colour: c }) }));
  }
  return m;
}
function familyRows(m, fam) {
  m.append(h('div', 'sep'), h('div', 'mhead', `${Number(fam.n) || 2} WINDOWS JOINED`));
  let opacity = Number(fam.opacity) || 1;
  const see = h('div', 'seerow'); see.append(icon('see', '#FFE096'), 'See-through');
  const track = h('div', 'track'); track.append(h('i', 'fill'), h('i', 'knob'));
  const num = h('span', 'tnum');
  const paint = () => { const f = Math.max(MIN_SEE, Math.min(1, opacity)); track.querySelector('.fill').style.width = f * 100 + '%'; track.querySelector('.knob').style.left = f * 100 + '%'; num.textContent = Math.round(f * 100) + '%'; };
  const set = (v) => { opacity = Math.round(v * 100) / 100; paint(); pick('opacity', { value: opacity }); };
  const at = (e) => { const r = track.getBoundingClientRect(); return Math.max(MIN_SEE, Math.min(1, (e.clientX - r.left) / r.width)); };
  track.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    try { track.setPointerCapture(e.pointerId); } catch { /* fine */ }
    set(at(e)); track.onpointermove = (ev) => set(at(ev)); track.onpointerup = track.onpointercancel = () => { track.onpointermove = null; };
  });
  track.addEventListener('wheel', (e) => { e.preventDefault(); set(Math.max(MIN_SEE, Math.min(1, opacity + (e.deltaY < 0 ? 0.05 : -0.05)))); }, { passive: false });
  see.append(track, num); m.append(see); paint();
  // no icon of its own (his rule for 1b: no new icons), as in the family's menu: an empty slot keeps the words lined up
  const none = icon('tick', 'transparent', 'transparent'); none.style.visibility = 'hidden';
  const thr = row({ id: 'through', icon: none, t: 'Click through', tag: `ALL ${Number(fam.n) || 2}`, tick: fam.through === true, on: () => pick('through') });
  thr.title = 'Clicks go through to whatever is behind. Ctrl+Alt+P over one of them brings them back.';
  m.append(row({ id: 'pin', ic: 'pin', t: 'Pin on top', tick: fam.pinned === true, on: () => pick('pin') }), thr, row({ id: 'apart', ic: 'apart', t: 'Pull apart', on: () => pick('apart') }));
}

function closeSub() { sub?.remove(); sub = null; subFor = ''; main?.querySelectorAll('button.open').forEach((b) => b.classList.remove('open')); shape(); }
function openSub(which, parent) {
  if (subFor === which) return;
  sub?.remove(); main?.querySelectorAll('button.open').forEach((b) => b.classList.remove('open'));
  subFor = which; parent.classList.add('open');
  sub = which === 'new' ? newMenu() : colourMenu();
  sub.style.left = '-9999px'; sub.style.top = '0px';
  document.body.append(sub);
  const m = main.getBoundingClientRect(), p = parent.getBoundingClientRect(), s = sub.getBoundingClientRect();
  // beside the menu, on the right when it fits, else on the left; level with its row, kept on the screen
  const x = m.right + 4 + s.width <= area.w - 4 ? m.right + 4 : Math.max(4, m.left - 4 - s.width);
  const y = Math.max(4, Math.min(area.h - s.height - 4, p.top - 8));
  sub.style.left = Math.round(x) + 'px'; sub.style.top = Math.round(y) + 'px';
  sub.classList.add('on');
  shape();
  if (which === 'new') requestAnimationFrame(() => sub?.querySelector('input')?.focus());
}
function shape() {
  requestAnimationFrame(() => {
    const rs = [main, sub].filter(Boolean).map((e) => { const b = e.getBoundingClientRect(); return { x: Math.floor(b.left), y: Math.floor(b.top), width: Math.ceil(b.width) + 1, height: Math.ceil(b.height) + 1 }; });
    if (rs.length) api?.timerMenuShape?.(rs);
  });
}

function show(m) {
  main?.remove(); sub?.remove(); main = sub = null; subFor = '';
  if (!m || typeof m !== 'object') return;
  st = m; area = { w: Number(m.w) || innerWidth, h: Number(m.h) || innerHeight };
  const menu = h('div', 'tabmenu'); menu.setAttribute('role', 'menu'); menu.id = 'tm';
  const nw = row({ id: 'new', ic: 'newt', t: 'New timer', sub: true, on: (e) => { e.stopPropagation(); openSub('new', nw); } });
  nw.addEventListener('pointerenter', () => openSub('new', nw));
  const [light, deep] = SWATCH[m.colour] ?? SWATCH.blue;
  const col = row({ id: 'colour', icon: icon('sand', deep, light), t: 'Colour', sub: true, on: (e) => { e.stopPropagation(); openSub('colour', col); } });
  col.addEventListener('pointerenter', () => openSub('colour', col));
  const rn = row({ id: 'rename', ic: 'rename', t: 'Rename', on: () => pick('rename') });
  const rs = row({ id: 'restart', ic: 'restart', t: 'Restart', tag: 'OR HOLD THE GLASS', on: () => pick('restart') });
  for (const b of [rn, rs]) b.addEventListener('pointerenter', () => { if (subFor) closeSub(); });
  menu.append(nw, rn, col, rs);
  if (m.fam && typeof m.fam === 'object') familyRows(menu, m.fam);
  const stop = row({ id: 'stop', ic: 'quit', t: 'Stop', tag: 'HOLD', danger: true });
  stop.title = 'Hold to stop';
  let hr = 0;
  stop.addEventListener('pointerenter', () => { if (subFor) closeSub(); });
  stop.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const at = performance.now();
    const f = () => { const k = Math.min(1, (performance.now() - at) / HOLD); stop.classList.add('holdrow'); stop.style.setProperty('--k', k * 100 + '%'); if (k >= 1) { pick('stop'); return; } hr = requestAnimationFrame(f); };
    hr = requestAnimationFrame(f);
  });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) stop.addEventListener(ev, () => { cancelAnimationFrame(hr); stop.classList.remove('holdrow'); });
  menu.append(h('div', 'sep'), stop);
  for (const x of menu.querySelectorAll('.seerow,.mhead')) x.addEventListener('pointerenter', () => { if (subFor) closeSub(); });
  menu.style.left = '-9999px'; menu.style.top = '0px';
  document.body.append(menu);
  main = menu;
  // whole art pixels wide, placed where he clicked, kept on the screen
  const w = Math.ceil(menu.getBoundingClientRect().width / P) * P; menu.style.width = w + 'px';
  const r = menu.getBoundingClientRect();
  const x = Math.max(4, Math.min(area.w - r.width - 4, Number(m.x) || 0));
  const y = Math.max(4, Math.min(area.h - r.height - 4, Number(m.y) || 0));
  menu.style.left = x + 'px'; menu.style.top = y + 'px';
  menu.classList.add('on');
  shape();
}

api?.onTimerMenu?.(show);
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.preventDefault(); if (sub && subFor === 'new' && document.activeElement?.tagName === 'INPUT') { closeSub(); return; } pick('close'); }
});
window.addEventListener('contextmenu', (e) => e.preventDefault());
window.__timerMenu = { parseCustom };

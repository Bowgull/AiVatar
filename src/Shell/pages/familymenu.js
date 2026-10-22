// The window family's menu (sheet 63 step 2, his picks 2026-10-22): one menu for the whole family, in Aang's right-click
// wood. See-through (every member at once, never under 30%), Pin on top (every member), Click through (the group, 1b),
// Pull apart. Built with the markup
// Aang's menu uses (.tabmenu > button, .sep, .mhead, <i> tags) so the same styles draw it; the 11x11 icons are sheet 63's,
// drawn the way aangmenu.js draws its own (every art pixel a whole block of real pixels, a 1-pixel drop).
//
// While a group is pulled apart the same window is the catcher (step 3 and 6): it shows the hint line above the group,
// and a click on the empty desktop, or Esc, joins the rest back.

const P = 2, N = 11;
const ICONS = {
  see: ['...OOOOO...', '.OOOOO..OO.', '.OOOOO...O.', 'OOOOOO....O', 'OOOOOO....O', 'OOOOOO....O', 'OOOOOO....O', 'OOOOOO....O', '.OOOOO...O.', '.OOOOO..OO.', '...OOOOO...'],
  pin: ['...OOOOO...', '...O.A.O...', '...O.A.O...', '...O.A.O...', '..OO.A.OO..', '.OOOOOOOOO.', '.....O.....', '.....O.....', '.....O.....', '.....O.....', '.....O.....'],
  apart: ['OOOO...OOOO', 'O..O...O..O', 'O..O...O..O', 'OOOO...OOOO', '...........', '...........', '...........', 'OOOO...OOOO', 'O..O...O..O', 'O..O...O..O', 'OOOO...OOOO'],
  tick: ['...........', '...........', '..........O', '.........OO', 'O.......OO.', 'OO.....OO..', '.OO...OO...', '..OO.OO....', '...OOO.....', '....O......', '...........'],
};
const TONE = { O: '#d8c8a8', A: '#a8946e', sh: 'rgba(0,0,0,.65)' };
const MIN = 0.3;

function icon(name, O = TONE.O) {
  const map = ICONS[name], pal = { O, A: TONE.A };
  const dpr = window.devicePixelRatio || 1, px = Math.max(1, Math.round(P * dpr)), sh = Math.max(1, Math.round(dpr));
  const c = document.createElement('canvas'); c.width = N * px + sh; c.height = N * px + sh;
  const g = c.getContext('2d');
  const put = (col, o) => map.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch]) { g.fillStyle = col ?? pal[ch]; g.fillRect(x * px + o, y * px + o, px, px); } }));
  put(TONE.sh, sh); put(null, 0);
  c.className = 'ic'; c.style.width = (c.width / dpr) + 'px'; c.style.height = (c.height / dpr) + 'px';
  c.setAttribute('aria-hidden', 'true');
  return c;
}
function blank() { const c = icon('tick', 'transparent'); c.style.visibility = 'hidden'; return c; }
const h = (t, c, text) => { const e = document.createElement(t); if (c) e.className = c; if (text !== undefined) e.textContent = text; return e; };
const api = window.family;
let mode = 'none', menuEl = null, hintEl = null, opacity = 1;

function clear() { menuEl?.remove(); hintEl?.remove(); menuEl = hintEl = null; document.body.classList.remove('catch'); }

function paintSee(track, num) {
  const f = Math.max(MIN, Math.min(1, opacity));
  track.querySelector('.fill').style.width = (f * 100) + '%';
  track.querySelector('.knob').style.left = (f * 100) + '%';
  num.textContent = Math.round(f * 100) + '%';
}

function showMenu(m) {
  clear();
  mode = 'menu';
  opacity = Number(m.opacity) || 1;
  const menu = h('div', 'tabmenu'); menu.setAttribute('role', 'menu');
  menu.append(h('div', 'mhead', `${Number(m.n) || 2} WINDOWS JOINED`));
  const see = h('div', 'seerow'); see.append(icon('see', '#FFE096'), 'See-through');
  const track = h('div', 'track'); track.append(h('i', 'fill'), h('i', 'knob'));
  track.title = 'See-through: every window of the family at once';
  const num = h('span', 'tnum');
  see.append(track, num);
  menu.append(see);
  paintSee(track, num);
  // Drag the knob (or click the groove, or roll the wheel): every member follows live.
  const at = (e) => { const r = track.getBoundingClientRect(); return Math.max(MIN, Math.min(1, (e.clientX - r.left) / r.width)); };
  const set = (v) => { opacity = Math.round(v * 100) / 100; paintSee(track, num); api?.pick('opacity', opacity); };
  track.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    try { track.setPointerCapture(e.pointerId); } catch { /* fine */ }
    set(at(e));
    track.onpointermove = (ev) => set(at(ev));
    track.onpointerup = track.onpointercancel = () => { track.onpointermove = null; };
  });
  track.addEventListener('wheel', (e) => { e.preventDefault(); set(Math.max(MIN, Math.min(1, opacity + (e.deltaY < 0 ? 0.05 : -0.05)))); }, { passive: false });
  const row = (id, ic, t, tag, tick) => {
    const b = h('button'); b.type = 'button'; b.dataset.id = id; b.setAttribute('role', 'menuitem');
    // No icon of its own (his rule for 1b: no new icons): an empty one keeps the words lined up.
    const l = h('span', 'lab'); l.append(ic ? icon(ic) : blank(), t); b.append(l);
    if (tag) b.append(h('i', 'st', tag));
    if (tick) { const k = icon('tick', '#ffe28c'); k.classList.add('tk'); b.append(k); b.classList.add('on'); }
    b.addEventListener('click', () => api?.pick(id));
    return b;
  };
  const total = Number(m.total) || 2;
  const n = Number(m.n) || 2;
  // 1b (his ask): the whole group lets clicks through; Ctrl+Alt+P over any of them brings them back.
  const thr = row('through', null, 'Click through', `ALL ${n}`, m.through === true);
  thr.title = 'Clicks go through to whatever is behind. Ctrl+Alt+P over one of them brings them back.';
  menu.append(row('pin', 'pin', 'Pin on top', `ALL ${total}`, m.pinned === true), thr, h('div', 'sep'), row('apart', 'apart', 'Pull apart'));
  document.body.append(menu);
  menuEl = menu;
  // Whole art pixels wide, then placed where he clicked, kept on the screen.
  const w = Math.ceil(menu.getBoundingClientRect().width / P) * P; menu.style.width = w + 'px';
  const r = menu.getBoundingClientRect();
  const x = Math.max(4, Math.min(innerWidth - r.width - 4, Number(m.x) || 0));
  const y = Math.max(4, Math.min(innerHeight - r.height - 4, Number(m.y) || 0));
  menu.style.left = x + 'px'; menu.style.top = y + 'px';
  requestAnimationFrame(() => {
    const b = menu.getBoundingClientRect();
    api?.shape([{ x: Math.floor(b.left), y: Math.floor(b.top), width: Math.ceil(b.width) + 1, height: Math.ceil(b.height) + 1 }]);
    menu.classList.add('on');
  });
}

function showCatch(m) {
  clear();
  mode = 'catch';
  document.body.classList.add('catch');
  const p = h('div', 'plate hint');
  p.append('Drag one out', h('i', '', '·'), h('b', 'kc', 'ESC'), ' to join back');
  document.body.append(p);
  hintEl = p;
  const r = p.getBoundingClientRect();
  const x = Math.max(8, Math.min(innerWidth - r.width - 8, (Number(m.x) || 0) - r.width / 2));
  let y = (Number(m.y) || 0) - r.height - 12;
  if (y < 8) y = 8;
  p.style.left = Math.round(x) + 'px'; p.style.top = Math.round(y) + 'px';
  requestAnimationFrame(() => p.classList.add('on'));
}

api?.on((m) => {
  if (!m || typeof m !== 'object') return;
  if (m.kind === 'menu') showMenu(m);
  else if (m.kind === 'catch') showCatch(m);
  else { mode = 'none'; clear(); }
});

// Esc: closes the menu, or joins a pulled-apart group back.
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); if (mode === 'catch') api?.end(); else if (mode === 'menu') api?.pick('close'); } });
// While catching: any click on the empty desktop joins them back. A right-click too.
window.addEventListener('pointerdown', (e) => { if (mode === 'catch') { e.preventDefault(); api?.end(); } });
window.addEventListener('contextmenu', (e) => e.preventDefault());

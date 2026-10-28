// Sheet 56, look A (2026-10-21): Aang's right-click menu, as he picked it. Only what he kept, most used at the top, Quit
// last in red. Built with the markup Samara's own menus use (.tabmenu > button, .sep, <i> tags, .danger) so Samara's
// styles draw it; the submenus open to the side, as in the mockup he chose. A pick goes out as an id; the pet runs it.
//
// The window covers the screen's work area and is see-through; the main process cuts it down to the menus' shape
// (menuShape), so everywhere else his clicks go through to whatever is under them.

const P = 2;   // one art pixel = 2 CSS pixels, whole-number, like his sprite

// ---------------------------------------------------------------- hand-placed 11x11 icons
// 2026-10-21 (his report: the menu read about 12 px on his screen, too small): redrawn on an 11x11 grid from the
// mockup's 9x9 ones, so at the same whole-number 2x they come out 22 px, crisp, never scaled by a fraction.
const ICONS = {
  back: ['...OOOOO...', '.OO.....OO.', '.O...O...O.', 'O....O....O', 'O....O....O', 'O....OOO..O', 'O.........O', 'A.........O', 'AA.......O.', 'AAA....OO..', '...OOOO....'],
  hunt: ['..OOOO.....', '.O....O....', 'O......O...', 'O......O...', 'O......O...', 'O......O...', '.O....O....', '..OOOOOO...', '.......OO..', '........OO.', '.........OO'],
  hush: ['...OOOO....', '..OO.......', '.OO........', 'OO.........', 'OO.........', 'OO.........', 'OO........O', '.OO......O.', '..OOO..OO..', '....OOOO...', '...........'],
  dock: ['.....O.....', '.....O.....', '.....O.....', '.....O.....', '..O..O..O..', '...O.O.O...', '....OOO....', '.....O.....', '...........', 'OOOOOOOOOOO', 'OOOOOOOOOOO'],
  back2: ['OOOOOOOOOOO', 'OOOOOOOOOOO', '...........', '.....O.....', '....OOO....', '...O.O.O...', '..O..O..O..', '.....O.....', '.....O.....', '.....O.....', '.....O.....'],
  hide: ['O..........', '.O.........', '..OOOOOOO..', '.O.O.....O.', 'O...O.....O', 'O....O....O', 'O.....O...O', '.O.....O.O.', '..OOOOOOO..', '.........O.', '..........O'],
  model: ['.....O.....', '.....O.....', '....OOO....', '...OOOOO...', '..OOOOOOO..', 'OOOOOOOOOOO', '..OOOOOOO..', '...OOOOO...', '....OOO....', '.....O.....', '.....O.....'],
  quota: ['OOOOOOOOOOO', '.O.......O.', '..OAAAAAO..', '...OAAAO...', '....OAO....', '.....O.....', '....O.O....', '...O.A.O...', '..O.AAA.O..', '.OAAAAAAAO.', 'OOOOOOOOOOO'],
  quit: ['OO.......OO', 'OOO.....OOO', '.OOO...OOO.', '..OOO.OOO..', '...OOOOO...', '....OOO....', '...OOOOO...', '..OOO.OOO..', '.OOO...OOO.', 'OOO.....OOO', 'OO.......OO'],
  claude: ['.....O.....', '.O...O...O.', '..O..O..O..', '...O.O.O...', '....OOO....', 'OOOOOOOOOOO', '....OOO....', '...O.O.O...', '..O..O..O..', '.O...O...O.', '.....O.....'],
  // Sheet 61 v2 (2026-10-22): the Hotkeys row's keyboard, and the "taken" warning (the sheet's own pixels)
  keys: ['...........', 'OOOOOOOOOOO', 'O.........O', 'O.O.O.O.O.O', 'O.........O', 'O.OO.O.O.OO', 'O.........O', 'O..OOOOO..O', 'O.........O', 'OOOOOOOOOOO', '...........'],
  warn: ['....OO....', '...OOOO...', '...O..O...', '..OO..OO..', '..O....O..', '.OO.OO.OO.', '.O..OO..O.', 'OO......OO', 'O...OO...O', 'OOOOOOOOOO', '..........'],
  // Sheet 59 (2026-10-22): the Music player row, a pixel quaver
  music: ['....OOOOOO.', '....OOOOOO.', '....O....O.', '....O....O.', '....O....O.', '....O....O.', '..OOO..OOO.', '.OOOO.OOOO.', '.OOOO.OOOO.', '..OO...OO..', '...........'],
  // Sheet 101 (2026-10-28): Go to the PC / Go to the Mac, a screen with an arrow going into it.
  gopc: ['OOOOOOOOOOO', 'O.........O', 'O...O.....O', 'O....O....O', 'O.OOOOO...O', 'O....O....O', 'O...O.....O', 'O.........O', 'OOOOOOOOOOO', '....OOO....', '..OOOOOOO..'],
  tick: ['...........', '...........', '..........O', '.........OO', 'O.......OO.', 'OO.....OO..', '.OO...OO...', '..OO.OO....', '...OOO.....', '....O......', '...........'],
};
const N = 11;
const TONE = { O: '#d8c8a8', A: '#a8946e', sh: 'rgba(0,0,0,.65)', red: '#ff9a8a', tick: '#ffe28c', claude: '#E88A6A' };

/** One icon, drawn at the screen's own pixel density so every art pixel is a whole block of real pixels. */
function icon(name, tone = {}) {
  const map = ICONS[name], pal = { O: tone.O ?? TONE.O, A: tone.A ?? TONE.A };
  const dpr = window.devicePixelRatio || 1, px = Math.max(1, Math.round(P * dpr)), sh = Math.max(1, Math.round(dpr));
  const c = document.createElement('canvas'); c.width = N * px + sh; c.height = N * px + sh;
  const g = c.getContext('2d');
  const put = (col, o) => map.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch]) { g.fillStyle = col ?? pal[ch]; g.fillRect(x * px + o, y * px + o, px, px); } }));
  put(TONE.sh, sh);   // a 1-pixel drop, like the words' text-shadow
  put(null, 0);
  c.className = 'ic';
  c.style.width = (c.width / dpr) + 'px'; c.style.height = (c.height / dpr) + 'px';
  c.setAttribute('aria-hidden', 'true');
  return c;
}

// ---------------------------------------------------------------- the menus (his picks, 2026-10-21)
const MODEL_TAG = { auto: 'AUTO', quick: 'QUICK', smart: 'SMART', deep: 'DEEP' };
const MODELS = [
  { id: 'auto', label: 'Auto: Quick for chat, Smart when the work needs it' },
  { id: 'quick', label: 'Quick (Haiku): fastest, for chat' },
  { id: 'smart', label: 'Smart (Sonnet): better reasoning' },
  { id: 'deep', label: 'Deep (Opus): the strongest, slowest' },
];
const clock = (ms) => { const d = new Date(ms); return `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}`; };

/** A row this machine cannot do yet (the Mac's `soon` list). @param {any} s @param {string} id */
// The Mac's own sizes (sheet 103): the stylesheet's html.mac rules.
if (/Mac/i.test(navigator.platform)) document.documentElement.classList.add('mac');
const soon = (s, id) => Array.isArray(s.soon) && s.soon.includes(id);
/** A row this machine leaves out altogether (the Mac's `gone` list). @param {any} s @param {string} id */
const gone = (s, id) => Array.isArray(s.gone) && s.gone.includes(id);
function mainRows(s) {
  const jobs = Number(s.jobsRunning) || 0, hushed = Number(s.hushedUntil) > Date.now();
  return [
    { id: 'back', ic: 'back', t: 'Look back' },
    { id: 'jobs', ic: 'claude', t: 'Claude jobs', tag: jobs > 0 ? `${jobs} RUNNING` : '' },
    { id: 'claudejob', ic: 'claude', t: 'Start a Claude job' },
    { id: 'hunt', ic: 'hunt', t: 'Job hunt now' },
    // The Mac (2026-10-28): rows it cannot do yet are dim, never a pick that does nothing (s.soon lists them).
    { id: 'player', ic: 'music', t: 'Music player', off: soon(s, 'player') },
    '-',
    { sub: 'hush', ic: 'hush', t: 'Hush', tag: hushed ? `UNTIL ${clock(Number(s.hushedUntil))}` : '' },
    '-',
    { sub: 'dock', ic: 'dock', t: 'Dock' },
    { id: 'comeback', ic: 'back2', t: 'Come back', off: !s.docked },
    { id: 'hide', ic: 'hide', t: 'Hide' },
    // Sheet 101 (2026-10-28): only where there is another machine to go to; dim while it is not on.
    ...(s.other === 'pc' || s.other === 'mac' ? [{ id: 'gopc', ic: 'gopc', t: s.other === 'pc' ? 'Go to the PC' : 'Go to the Mac', off: s.otherOn !== true }] : []),
    '-',
    { sub: 'model', ic: 'model', t: 'Model', tag: MODEL_TAG[s.model] ?? 'AUTO' },
    { id: 'saving', ic: 'quota', t: 'Save quota', tick: !!s.saving },
    // Sheet 61 v2 (2026-10-22): every key he can press, to see and change (the count is all of them, fixed ones too)
    ...(Array.isArray(s.hotkeys) ? [{ sub: 'hotkeys', ic: 'keys', t: 'Hotkeys', tag: `${s.hotkeys.length} KEYS` }] : []),
    '-',
    { id: 'quit', ic: 'quit', t: 'Quit Aang', danger: true },
  ];
}
function subRows(which, s) {
  if (which === 'hush') {
    const hushed = Number(s.hushedUntil) > Date.now(), q = s.quiet ?? 'auto';
    return [
      { id: 'hush.15', t: 'For 15 minutes' },
      { id: 'hush.60', t: 'For 1 hour' },
      { id: 'hush.240', t: 'For 4 hours' },
      { id: 'hush.tomorrow', t: 'Until tomorrow' },
      { id: 'hush.off', t: 'Stop hushing now', off: !hushed },
      '-',
      { id: 'mute', t: 'Mute: nothing unprompted', tick: !!s.muted },
      // Not on the Mac (his call, 2026-10-28): no games there; calls, Shadow and full screen keep him quiet by themselves.
      ...(gone(s, 'quiet') ? [] : ['-', { head: 'QUIET IN GAMES' },
        { id: 'quiet.auto', t: 'Auto: while WoW is in front', tick: q === 'auto', off: soon(s, 'quiet') },
        { id: 'quiet.always', t: 'Always', tick: q === 'always', off: soon(s, 'quiet') },
        { id: 'quiet.never', t: 'Never', tick: q === 'never', off: soon(s, 'quiet') }]),
      // Sheet 60 (2026-10-22): the one switch for all of "Aang notices things in your notes".
      '-',
      { head: 'YOUR NOTES' },
      { id: 'notes.notice', t: 'Let Aang bring up my notes', tick: s.notesNotice !== false },
      { cap: 'Each note also has its own switch.' },
    ];
  }
  if (which === 'dock') {
    const d = s.docked ? s.dock : 'none';
    return ['bottom', 'left', 'right', 'top'].map((e) => ({ id: 'dock.' + e, t: e[0].toUpperCase() + e.slice(1), tick: d === e, off: soon(s, 'dock.' + e) }));
  }
  const list = Array.isArray(s.models) && s.models.length ? s.models : MODELS;
  return list.filter((m) => m && typeof m.id === 'string').map((m) => ({ id: 'model.' + m.id, t: String(m.label ?? m.id), tick: s.model === m.id }));
}

function row(r, inSub) {
  const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'menuitem');
  if (r.id) b.dataset.id = r.id;
  if (r.sub) { b.dataset.sub = r.sub; b.setAttribute('aria-haspopup', 'menu'); }
  if (r.danger) b.classList.add('danger');
  b.disabled = !!r.off;
  const lab = document.createElement('span'); lab.className = 'lab';
  if (!inSub) lab.append(icon(r.ic, r.danger ? { O: TONE.red, A: TONE.red } : r.ic === 'claude' ? { O: TONE.claude } : {}));
  lab.append(r.t);
  b.append(lab);
  if (r.tag || r.sub) {
    const i = document.createElement('i'); if (r.tag) { i.className = 'st'; i.append(r.tag); }
    if (r.sub) i.append(Object.assign(document.createElement('b'), { className: 'ar', textContent: '▸' }));
    b.append(i);
  }
  if (r.tick) { const t = icon('tick', { O: TONE.tick }); t.classList.add('tk'); t.dataset.tick = '1'; b.append(t); }
  return b;
}
function menu(rows, inSub) {
  const m = document.createElement('div'); m.setAttribute('role', 'menu');
  m.className = 'tabmenu' + (inSub ? ' submenu' : '');
  for (const r of rows) {
    if (r === '-') m.append(Object.assign(document.createElement('div'), { className: 'sep' }));
    else if (r.head) m.append(Object.assign(document.createElement('div'), { className: 'mhead', textContent: r.head }));
    else if (r.cap) m.append(Object.assign(document.createElement('div'), { className: 'mcap', textContent: r.cap }));
    else m.append(row(r, inSub));
  }
  return m;
}

// ---------------------------------------------------------------- placing it, and telling the window its shape
let state = {}, main = null, sub = null, subOf = '', at = { x: 0, y: 0 }, open = false;
let subTimer = 0;
const even = (el) => { el.style.width = ''; const w = el.getBoundingClientRect().width; el.style.width = (Math.ceil(w / P) * P) + 'px'; };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));
const EDGE = 4;

/** Aang and his mark, in this page's pixels (main.ts avoidRect); with none, just the mouse point. */
let avoid = null;
const GAP = 2;
const hits = (a, b) => a.x < b.x + b.width && b.x < a.x + a.w && a.y < b.y + b.height && b.y < a.y + a.h;
const fits = (c, W, H) => c.x >= EDGE && c.y >= EDGE && c.x + c.w <= W - EDGE && c.y + c.h <= H - EDGE;
/**
 * 2026-10-21 (his report: at the bottom-right corner it opened ON TOP of Aang): the menu goes BESIDE Aang and his mark,
 * never over them. The side with more room first (so near the right edge it opens to his left), level with the mouse:
 * down from it when there is room, else up from it (he stands at the bottom), slid to stay on the screen. Only if
 * neither side has room does it go above him, then below. Always fully on the screen.
 */
function placeMain() {
  const W = innerWidth, H = innerHeight;
  main.style.left = '0px'; main.style.top = '0px';
  even(main);
  const r = main.getBoundingClientRect(), w = r.width, h = r.height;
  const A = avoid ?? { x: at.x, y: at.y, width: 0, height: 0 };
  // Level with the mouse: down from it, or up from it when the bottom is near; then kept on the screen.
  const yAt = clamp(at.y + h > H - EDGE ? at.y - h : at.y, EDGE, H - EDGE - h);
  const xAt = clamp(at.x, EDGE, W - EDGE - w);
  const left = { x: A.x - GAP - w, y: yAt, w, h }, right = { x: A.x + A.width + GAP, y: yAt, w, h };
  const above = { x: xAt, y: A.y - GAP - h, w, h }, below = { x: xAt, y: A.y + A.height + GAP, w, h };
  const sides = A.x + A.width / 2 > W / 2 ? [left, right] : [right, left];
  const c = [...sides, above, below].find((k) => fits(k, W, H)) ?? sides[0];
  main.style.left = Math.round(clamp(c.x, EDGE, W - EDGE - w)) + 'px';
  main.style.top = (Math.round(clamp(c.y, EDGE, H - EDGE - h) / P) * P) + 'px';
}
/**
 * The submenu beside its row, overlapping the main menu's rim by 4 px (the mockup). 2026-10-21: it opens on the side AWAY
 * from Aang (opening toward him would cover him again), flips to the other side when that one runs off the screen, and
 * is always kept on the screen.
 */
function placeSub(parent) {
  const W = innerWidth, H = innerHeight;
  sub.style.left = '0px'; sub.style.top = '0px';
  even(sub);
  const mr = main.getBoundingClientRect(), pr = parent.getBoundingClientRect(), r = sub.getBoundingClientRect(), w = r.width, h = r.height;
  // level with its row: the menu's 8 px padding plus the 2 px rim (2026-10-21, the bigger menu)
  const y = clamp(Math.round((pr.top - 10) / P) * P, EDGE, H - EDGE - h);
  const right = { x: mr.right - 4, y, w, h }, left = { x: mr.left + 4 - w, y, w, h };
  const A = avoid ?? { x: at.x, y: at.y, width: 0, height: 0 };
  const sides = A.x + A.width / 2 >= mr.left + mr.width / 2 ? [left, right] : [right, left];
  const c = sides.find((k) => fits(k, W, H) && !hits(k, A)) ?? sides.find((k) => fits(k, W, H)) ?? sides[0];
  sub.style.left = Math.round(clamp(c.x, EDGE, W - EDGE - w)) + 'px'; sub.style.top = y + 'px';
}
/** Only the menus (and their shadow) take the mouse; the main process cuts the window to these. */
function reportShape() {
  const rects = [main, sub].filter((m) => m && !m.hidden).map((m) => {
    const r = m.getBoundingClientRect();
    return { x: Math.floor(r.left - 6), y: Math.floor(r.top - 6), width: Math.ceil(r.width + 12), height: Math.ceil(r.height + 28) };
  });
  window.aang?.menuShape?.(rects);
}

function openSub(which, parent) {
  clearTimeout(subTimer);
  if (subOf === which && sub && !sub.hidden) return;
  closeSub(false);
  sub = which === 'hotkeys' ? keysMenu() : menu(subRows(which, state), true);
  sub.id = 'sub'; sub.dataset.of = which;
  document.body.append(sub);
  subOf = which;
  parent.classList.add('on');
  placeSub(parent);
  if (which === 'hotkeys') keysRoom();
  reportShape();
}
function closeSub(report = true) {
  clearTimeout(subTimer);
  keysIdle();
  sub?.remove(); sub = null; subOf = '';
  main?.querySelectorAll('button.on').forEach((b) => b.classList.remove('on'));
  if (report && main) reportShape();
}

// ---------------------------------------------------------------- Hotkeys (sheet 61 v2, 2026-10-22)
// His note: "just a click might happen by accident, have it on hold click". A row changes only when he presses and
// HOLDS it for 0.6 s (a gold fill sweeps the row, a pixel ring fills); letting go early changes nothing, and a plain
// click never does anything. Then the row listens: the new keys pressed together and let go, or Esc to keep the old
// ones. The main process says whether they are kept, or refused (another program has them, another of Aang's keys
// does, or they are not allowed), and then the old key stays.
const HOLD_MS = 600;
/** What the Hotkeys submenu is doing: rest, a row being held, a row listening, or a row refused. */
let kState = { mode: 'rest', id: '', t0: 0, raf: 0, combo: '' };
/** The hold's end, on a timer of its own: the fill is drawn per frame, but frames can stall; the 0.6 s must not. */
let holdTimer = 0;
const T = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

/** The hold ring: 11 x 11 art pixels, gold filling clockwise from the top up to `k` (the sheet's own ring). */
function ring(k) {
  const dpr = window.devicePixelRatio || 1, px = Math.max(1, Math.round(P * dpr));
  const c = document.createElement('canvas'); c.width = 11 * px; c.height = 11 * px;
  const g = c.getContext('2d');
  for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) {
    const dx = x + 0.5 - 5.5, dy = y + 0.5 - 5.5, d = Math.hypot(dx, dy);
    if (d > 5.4) continue;
    let col;
    if (d > 4.4) col = '#120a05';
    else if (d < 2.4) col = d > 1.4 ? '#120a05' : '#3a2516';
    else { const a = (Math.atan2(dx, -dy) + Math.PI * 2) % (Math.PI * 2) / (Math.PI * 2); col = a <= k ? (y < 5 ? '#ffe096' : '#ffc43c') : '#4a3420'; }
    g.fillStyle = col; g.fillRect(x * px, y * px, px, px);
  }
  c.className = 'ring'; c.style.width = (c.width / dpr) + 'px'; c.style.height = (c.height / dpr) + 'px';
  c.setAttribute('aria-hidden', 'true');
  return c;
}
function keycaps(list) {
  const i = T('i', 'kk');
  (Array.isArray(list) ? list : []).forEach((k, n) => { if (n) i.append(T('span', 'kp', '+')); i.append(T('span', 'kc', String(k))); });
  return i;
}
function keyRow(r) {
  const b = T('button'); b.type = 'button'; b.setAttribute('role', 'menuitem');
  if (r.fixed) b.classList.add('fixed'); else b.dataset.hk = String(r.id);
  const lab = T('span', 'lab', String(r.label)); if (r.fresh) lab.append(T('small', '', 'NEW'));
  const right = T('span', 'kr');
  if (!r.fixed) right.append(T('span', 'hint', 'HOLD TO CHANGE'));
  right.append(keycaps(r.chips));
  b.append(lab, right);
  return b;
}
function keysMenu() {
  const m = document.createElement('div'); m.setAttribute('role', 'menu'); m.className = 'tabmenu submenu keys';
  const rows = Array.isArray(state.hotkeys) ? state.hotkeys.filter((x) => x && typeof x === 'object') : [];
  m.append(T('div', 'mhead', 'ANY TIME'));
  for (const r of rows.filter((x) => x.group === 'any')) m.append(keyRow(r));
  m.append(T('div', 'sep'), T('div', 'mhead', 'ONLY WHILE SOMETHING IS UP'));
  for (const r of rows.filter((x) => x.group !== 'any')) m.append(keyRow(r));
  m.append(T('div', 'sep'));
  // putting them all back changes things too, so it is held as well
  const reset = T('button'); reset.type = 'button'; reset.dataset.hk = 'reset'; reset.setAttribute('role', 'menuitem');
  const rr = T('span', 'kr'); rr.append(T('span', 'hint', 'HOLD'));
  reset.append(T('span', 'lab', 'Put them all back to the defaults'), rr);
  m.append(reset);
  m.append(T('div', 'note', /Mac/i.test(navigator.platform)
    ? 'Press and hold a row to change it, so a stray click never does. The + keys work on the number pad too. Esc only listens while his bubble is up, so it is fixed.'
    : 'Press and hold a row to change it, so a stray click never does. The + keys work on the number pad too. Ctrl+C and Esc only listen while his bubble is up, so they are fixed.'));
  // it grows and shrinks (the hold's line, the warning, the glove's nudge): kept on the screen, and the window's shape with it
  const ro = new ResizeObserver(() => { if (sub === m) relayout(); else ro.disconnect(); });
  ro.observe(m);
  return m;
}
const rowOf = (id) => sub?.querySelector(`[data-hk="${id}"]`);
const keyOf = (id) => (Array.isArray(state.hotkeys) ? state.hotkeys : []).find((r) => r && r.id === id);
/** The line under a row (the hold's, the listen's, or the warning), one at a time. */
function sayUnder(b, el) { sub?.querySelectorAll('.say').forEach((x) => x.remove()); if (b && el) { el.classList.add('say'); b.after(el); } }
/**
 * The Hotkeys list grows a line under a row (the hold's, the listen's, the warning). It is placed once with room for
 * that line (keysRoom) and then never moves while he holds a row: a list jumping under his finger would slide the row
 * out from under it and cancel the hold. Only if it would still run off the screen is it lifted, never dropped.
 */
const KEYS_ROOM = 80;
function keysRoom() {
  if (!sub) return;
  const r = sub.getBoundingClientRect(), over = r.bottom - (innerHeight - EDGE - KEYS_ROOM);
  if (over > 0) sub.style.top = Math.max(EDGE, Math.floor((r.top - over) / P) * P) + 'px';
}
function relayout() {
  if (sub && subOf === 'hotkeys') {
    const r = sub.getBoundingClientRect(), over = r.bottom - (innerHeight - EDGE);
    if (over > 0) sub.style.top = Math.max(EDGE, Math.floor((r.top - over) / P) * P) + 'px';
  }
  reportShape();
}

/** Back to rest: no fill, nothing listening, our keys held again. */
function keysIdle() {
  cancelAnimationFrame(kState.raf); clearTimeout(holdTimer);
  if (kState.mode === 'listen') window.aang?.menuHotkey?.({ kind: 'listen', on: false });
  kState = { mode: 'rest', id: '', t0: 0, raf: 0, combo: '' };
}
function redrawKeys() {
  if (!sub || subOf !== 'hotkeys') return;
  const fresh = keysMenu(); fresh.id = 'sub'; fresh.dataset.of = 'hotkeys';
  fresh.style.left = sub.style.left; fresh.style.top = sub.style.top; fresh.style.width = sub.style.width;
  sub.replaceWith(fresh); sub = fresh;
  relayout();
}

function holdStart(b) {
  const id = b.dataset.hk;
  // from rest the row is used as it is (the glove stays on it); after a listen or a warning, the list is drawn afresh
  const dirty = kState.mode !== 'rest';
  keysIdle(); if (dirty) redrawKeys();
  const row = rowOf(id); if (!row) return;
  kState = { mode: 'hold', id, t0: performance.now(), raf: 0, combo: '' };
  row.classList.add('holding');
  row.style.setProperty('--k', '0%');
  const right = row.querySelector('.kr'); right.querySelector('.hint')?.remove();
  let rg = ring(0); right.prepend(rg);
  sayUnder(row, T('div', 'note gold', id === 'reset'
    ? 'Keep holding: the gold fills the row in 0.6 s, then every key goes back to how it came.'
    : 'Keep holding: the gold fills the row in 0.6 s, then it listens. Let go early and nothing changes.'));
  relayout();
  const step = () => {
    if (kState.mode !== 'hold' || kState.id !== id) return;
    const k = Math.min(1, (performance.now() - kState.t0) / HOLD_MS);
    row.style.setProperty('--k', (k * 100).toFixed(1) + '%');
    const n = ring(k); rg.replaceWith(n); rg = n;
    if (k < 1) kState.raf = requestAnimationFrame(step);
  };
  kState.raf = requestAnimationFrame(step);
  holdTimer = setTimeout(() => held(id), HOLD_MS);
}
/** Let go (or slid off) before the fill reached the end: nothing changes. */
function holdCancel() {
  if (kState.mode !== 'hold') return;
  keysIdle(); redrawKeys();
}
function held(id) {
  if (kState.mode !== 'hold' || kState.id !== id) return;
  if (id === 'reset') { keysIdle(); window.aang?.menuHotkey?.({ kind: 'reset' }); return; }
  listen(id);
}
function listen(id) {
  keysIdle();
  const was = keyOf(id); if (!was) return;
  redrawKeys();
  const row = rowOf(id); if (!row) return;
  kState = { mode: 'listen', id, t0: 0, raf: 0, combo: '' };
  // our keys are let go while he presses, so his new keys reach this menu instead of firing
  window.aang?.menuHotkey?.({ kind: 'listen', on: true });
  row.classList.add('listen');
  const right = row.querySelector('.kr'); right.replaceChildren();
  const w = T('span', 'wait', 'PRESS THE NEW KEYS'); w.append(T('b')); right.append(w);
  sayUnder(row, T('div', 'note gold', `Now press the new keys together, then let go. Esc keeps ${was.words}.`));
  relayout();
}
/** What the keyboard pressed, as an Electron accelerator; the main process checks it again (hotkeys.ts). */
const CODE = { Equal: '=', Minus: '-', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\',
  Backquote: '`', Space: 'Space', Insert: 'Insert', Delete: 'Delete', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
  ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', NumpadAdd: 'numadd', NumpadSubtract: 'numsub', NumpadMultiply: 'nummult',
  NumpadDivide: 'numdiv', NumpadDecimal: 'numdec', Escape: 'Escape', Tab: 'Tab', Enter: 'Enter', Backspace: 'Backspace' };
function accel(e) {
  const c = e.code;
  const key = /^Key[A-Z]$/.test(c) ? c.slice(3) : /^Digit\d$/.test(c) ? c.slice(5) : /^Numpad\d$/.test(c) ? 'num' + c.slice(6) : /^F\d{1,2}$/.test(c) ? c : CODE[c];
  if (!key) return '';
  return [e.ctrlKey && 'Control', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Super', key].filter(Boolean).join('+');
}
const MOD_CODES = /^(Control|Shift|Alt|Meta|OS)(Left|Right)?$/;
function listenKey(e) {
  e.preventDefault(); e.stopImmediatePropagation();   // never the menu's own Esc, which would close it
  if (e.type === 'keydown') {
    if (e.code === 'Escape' && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) { keysIdle(); redrawKeys(); return; }
    if (MOD_CODES.test(e.code) || e.repeat) return;
    kState.combo = accel(e) || '?';
    return;
  }
  // keyup: the first let-go after a real key is his choice
  if (!kState.combo) return;
  const id = kState.id, acc = kState.combo;
  kState.combo = '';
  window.aang?.menuHotkey?.({ kind: 'change', id, acc: acc === '?' ? '' : acc });
}
/** The main process said how it went. Kept: the row shows the new keys. Refused: the old key stays, and why is said. */
function keysResult(m) {
  if (Array.isArray(m.list)) state = { ...state, hotkeys: m.list };
  const r = m.result && typeof m.result === 'object' ? m.result : { ok: false, why: 'bad', say: 'That is not a key.' };
  const id = typeof m.id === 'string' ? m.id : '';
  keysIdle(); redrawKeys();
  if (r.ok) return;
  const row = rowOf(id), was = keyOf(id); if (!row || !was) return;
  kState = { mode: 'taken', id, t0: 0, raf: 0, combo: '' };
  row.classList.add('taken');
  if (m.tried?.chips) row.querySelector('.kr').replaceChildren(keycaps(m.tried.chips));
  const wn = T('div', 'warn'); wn.append(icon('warn', { O: '#ff9a8a' }));
  const tx = T('span');
  const b = (t) => T('b', '', String(t));
  if (r.why === 'taken') tx.append('Another program already has ', b(m.tried?.words ?? 'those keys'), ', so it would never reach Aang. ');
  else if (r.why === 'ours') tx.append(b(m.tried?.words ?? 'Those keys'), ' already belong to ', b(r.by ?? 'another key'), '. ');
  else tx.append(String(r.say ?? 'That is not a key Aang can hold.'), ' ');
  const again = T('u', '', 'Try other keys'); again.dataset.do = 'again';
  const keep = T('u', '', `keep ${was.words}`); keep.dataset.do = 'keep';
  tx.append(again, ' or ', keep, '.');
  wn.append(tx);
  sayUnder(row, wn);
  relayout();
}

function pick(id) {
  if (!open) return;
  open = false;
  window.aang?.menuPick?.(id);
}

function show(m) {
  state = m.state && typeof m.state === 'object' ? m.state : {};
  at = { x: Number(m.x) || 0, y: Number(m.y) || 0 };
  const a = m.avoid && typeof m.avoid === 'object' ? m.avoid : null;
  avoid = a && [a.x, a.y, a.width, a.height].every(Number.isFinite) && a.width > 0 && a.height > 0
    ? { x: a.x, y: a.y, width: a.width, height: a.height } : null;
  document.body.replaceChildren();
  sub = null; subOf = '';
  main = menu(mainRows(state), false);
  main.id = 'main';
  document.body.append(main);
  open = true;
  placeMain();
  reportShape();
}

// The mouse: a row with a submenu opens it after a short rest (or at once on a click); any other row closes it.
document.addEventListener('mouseover', (e) => {
  const b = e.target.closest?.('button');
  if (!b || !main) return;
  if (main.contains(b)) {
    clearTimeout(subTimer);
    if (b.dataset.sub) subTimer = setTimeout(() => openSub(b.dataset.sub, b), 140);
    else if (sub) subTimer = setTimeout(() => closeSub(), 260);
  } else if (sub?.contains(b)) clearTimeout(subTimer);
});
// Sheet 61 v2 (2026-10-22): a Hotkeys row is pressed and HELD to change it; let go early, or slide off it, and nothing does.
document.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  const b = e.target.closest?.('#sub button[data-hk]');
  if (b && kState.mode !== 'listen') holdStart(b);
});
document.addEventListener('pointerup', () => holdCancel());
document.addEventListener('pointercancel', () => holdCancel());
document.addEventListener('pointerout', (e) => {
  if (kState.mode !== 'hold') return;
  const sel = `[data-hk="${kState.id}"]`;
  if (e.target.closest?.(sel) && !e.relatedTarget?.closest?.(sel)) holdCancel();
});
window.addEventListener('blur', () => holdCancel());
document.addEventListener('keydown', (e) => { if (kState.mode === 'listen') listenKey(e); }, true);
document.addEventListener('keyup', (e) => { if (kState.mode === 'listen') listenKey(e); }, true);
document.addEventListener('click', (e) => {
  const u = e.target.closest?.('.warn u[data-do]');
  if (u) { const id = kState.id; if (u.dataset.do === 'again') listen(id); else { keysIdle(); redrawKeys(); } return; }
  const b = e.target.closest?.('button');
  // a Hotkeys row never acts on a click: only a hold changes it
  if (!b || b.disabled || b.dataset.hk || b.classList.contains('fixed')) return;
  if (b.dataset.sub) { openSub(b.dataset.sub, b); return; }
  if (b.dataset.id) pick(b.dataset.id);
});
// A press anywhere that is not a menu (the shadow's edge) is a click away.
// Sheet 61 v2 (2026-10-22): not when a hold has just begun: starting it can redraw the list under his finger, and the
// browser then hands this press to the page itself, which is not "away".
document.addEventListener('mousedown', (e) => { if (!e.target.closest?.('.tabmenu') && kState.mode !== 'hold') pick(''); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.preventDefault(); if (sub) closeSub(); else pick(''); }
});
document.addEventListener('contextmenu', (e) => e.preventDefault());

window.aang?.onMenu?.((m) => {
  if (m?.kind === 'show') { keysIdle(); show(m); }
  else if (m?.kind === 'hide') { keysIdle(); open = false; clearTimeout(subTimer); }
  else if (m?.kind === 'hotkeys') keysResult(m);
});

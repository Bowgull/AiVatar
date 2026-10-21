// Sheet 56, look A (2026-10-21): Aang's right-click menu, as he picked it. Only what he kept, most used at the top, Quit
// last in red. Built with the markup Samara's own menus use (.tabmenu > button, .sep, <i> tags, .danger) so Samara's
// styles draw it; the submenus open to the side, as in the mockup he chose. A pick goes out as an id; the pet runs it.
//
// The window covers the screen's work area and is see-through; the main process cuts it down to the menus' shape
// (menuShape), so everywhere else his clicks go through to whatever is under them.

const P = 2;   // one art pixel = 2 CSS pixels, whole-number, like his sprite

// ---------------------------------------------------------------- hand-placed 9x9 icons (the mockup's own pixels)
const ICONS = {
  back: ['..OOOOO..', '.O.....O.', 'O...O...O', 'O...O...O', 'O...OO..O', 'O.......O', 'A.O...O..', 'AA.OOO...', 'AAA......'],
  hunt: ['..OOO....', '.O...O...', 'O.....O..', 'O.....O..', 'O.....O..', '.O...O...', '..OOOOO..', '......OO.', '.......OO'],
  hush: ['..OOOO...', '.OO......', 'OO.......', 'OO.......', 'OO.......', 'OO......O', '.OO....O.', '..OOOOO..', '.........'],
  dock: ['....O....', '....O....', '....O....', '..O.O.O..', '...OOO...', '....O....', '.........', 'OOOOOOOOO', 'OOOOOOOOO'],
  back2: ['OOOOOOOOO', 'OOOOOOOOO', '.........', '....O....', '...OOO...', '..O.O.O..', '....O....', '....O....', '....O....'],
  hide: ['O........', '.O.......', '..OOOOO..', '.O.O...O.', 'O...O...O', '.O...O.O.', '..OOOOO..', '.......O.', '........O'],
  model: ['....O....', '....O....', '...OOO...', '..OOOOO..', 'OOOOOOOOO', '..OOOOO..', '...OOO...', '....O....', '....O....'],
  quota: ['OOOOOOOOO', '.O.....O.', '..OAAAO..', '...OAO...', '....O....', '...O.O...', '..O.A.O..', '.OAAAAAO.', 'OOOOOOOOO'],
  quit: ['OO.....OO', 'OOO...OOO', '.OOO.OOO.', '..OOOOO..', '...OOO...', '..OOOOO..', '.OOO.OOO.', 'OOO...OOO', 'OO.....OO'],
  claude: ['....O....', '.O..O..O.', '..O.O.O..', '...OOO...', 'OOOOOOOOO', '...OOO...', '..O.O.O..', '.O..O..O.', '....O....'],
  tick: ['.........', '........O', '.......OO', 'O.....OO.', 'OO...OO..', '.OO.OO...', '..OOO....', '...O.....', '.........'],
};
const TONE = { O: '#d8c8a8', A: '#a8946e', sh: 'rgba(0,0,0,.65)', red: '#ff9a8a', tick: '#ffe28c', claude: '#E88A6A' };

/** One icon, drawn at the screen's own pixel density so every art pixel is a whole block of real pixels. */
function icon(name, tone = {}) {
  const map = ICONS[name], pal = { O: tone.O ?? TONE.O, A: tone.A ?? TONE.A };
  const dpr = window.devicePixelRatio || 1, px = Math.max(1, Math.round(P * dpr)), sh = Math.max(1, Math.round(dpr));
  const c = document.createElement('canvas'); c.width = 9 * px + sh; c.height = 9 * px + sh;
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

function mainRows(s) {
  const jobs = Number(s.jobsRunning) || 0, hushed = Number(s.hushedUntil) > Date.now();
  return [
    { id: 'back', ic: 'back', t: 'Look back' },
    { id: 'jobs', ic: 'claude', t: 'Claude jobs', tag: jobs > 0 ? `${jobs} RUNNING` : '' },
    { id: 'hunt', ic: 'hunt', t: 'Job hunt now' },
    '-',
    { sub: 'hush', ic: 'hush', t: 'Hush', tag: hushed ? `UNTIL ${clock(Number(s.hushedUntil))}` : '' },
    '-',
    { sub: 'dock', ic: 'dock', t: 'Dock' },
    { id: 'comeback', ic: 'back2', t: 'Come back', off: !s.docked },
    { id: 'hide', ic: 'hide', t: 'Hide' },
    '-',
    { sub: 'model', ic: 'model', t: 'Model', tag: MODEL_TAG[s.model] ?? 'AUTO' },
    { id: 'saving', ic: 'quota', t: 'Save quota', tick: !!s.saving },
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
      '-',
      { head: 'QUIET IN GAMES' },
      { id: 'quiet.auto', t: 'Auto: while WoW is in front', tick: q === 'auto' },
      { id: 'quiet.always', t: 'Always', tick: q === 'always' },
      { id: 'quiet.never', t: 'Never', tick: q === 'never' },
    ];
  }
  if (which === 'dock') {
    const d = s.docked ? s.dock : 'none';
    return ['bottom', 'left', 'right', 'top'].map((e) => ({ id: 'dock.' + e, t: e[0].toUpperCase() + e.slice(1), tick: d === e }));
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

/** Opens at the mouse, to its right and below; up from the mouse when there is no room below (he stands at the bottom),
 *  to its left when there is no room on the right (docked on the right edge). Always kept on the screen. */
function placeMain() {
  const W = innerWidth, H = innerHeight;
  main.style.left = '0px'; main.style.top = '0px';
  even(main);
  const r = main.getBoundingClientRect();
  let x = at.x + 2, y = at.y;
  if (x + r.width > W - EDGE) x = at.x - 2 - r.width;
  if (y + r.height > H - EDGE) y = at.y - r.height;
  x = clamp(x, EDGE, W - EDGE - r.width); y = clamp(y, EDGE, H - EDGE - r.height);
  main.style.left = Math.round(x) + 'px'; main.style.top = (Math.round(y / P) * P) + 'px';
}
/** The submenu beside its row, overlapping the main menu's rim by 4 px (the mockup); on the left when the right is full. */
function placeSub(parent) {
  const W = innerWidth, H = innerHeight;
  sub.style.left = '0px'; sub.style.top = '0px';
  even(sub);
  const mr = main.getBoundingClientRect(), pr = parent.getBoundingClientRect(), r = sub.getBoundingClientRect();
  let x = mr.right - 4;
  if (x + r.width > W - EDGE) x = mr.left + 4 - r.width;
  const y = clamp(Math.round((pr.top - 9) / P) * P, EDGE, H - EDGE - r.height);
  sub.style.left = Math.round(clamp(x, EDGE, W - EDGE - r.width)) + 'px'; sub.style.top = y + 'px';
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
  sub = menu(subRows(which, state), true);
  sub.id = 'sub'; sub.dataset.of = which;
  document.body.append(sub);
  subOf = which;
  parent.classList.add('on');
  placeSub(parent);
  reportShape();
}
function closeSub(report = true) {
  clearTimeout(subTimer);
  sub?.remove(); sub = null; subOf = '';
  main?.querySelectorAll('button.on').forEach((b) => b.classList.remove('on'));
  if (report && main) reportShape();
}

function pick(id) {
  if (!open) return;
  open = false;
  window.aang?.menuPick?.(id);
}

function show(m) {
  state = m.state && typeof m.state === 'object' ? m.state : {};
  at = { x: Number(m.x) || 0, y: Number(m.y) || 0 };
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
document.addEventListener('click', (e) => {
  const b = e.target.closest?.('button');
  if (!b || b.disabled) return;
  if (b.dataset.sub) { openSub(b.dataset.sub, b); return; }
  if (b.dataset.id) pick(b.dataset.id);
});
// A press anywhere that is not a menu (the shadow's edge) is a click away.
document.addEventListener('mousedown', (e) => { if (!e.target.closest?.('.tabmenu')) pick(''); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.preventDefault(); if (sub) closeSub(); else pick(''); }
});
document.addEventListener('contextmenu', (e) => e.preventDefault());

window.aang?.onMenu?.((m) => {
  if (m?.kind === 'show') show(m);
  else if (m?.kind === 'hide') { open = false; clearTimeout(subTimer); }
});

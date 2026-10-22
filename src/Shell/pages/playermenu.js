// 2026-10-22: the music player's own menu, behind its ··· key (his report: the old BARS / SCENE / OFF key "is so
// confusing ... shouldn't this just be hidden behind a click somewhere?"). Two plain things:
//   PICTURE: Album cover, or one of his four named scenes, each with a tiny moving thumbnail, a tick on the one showing;
//   Bars on the screen: a tick, on or off.
// Aang's menu look (the same .tabmenu rows aangmenu.js builds). A pick goes back to the player (miniplayer.ts checks it)
// and the menu closes; Esc closes it, the arrows move, Enter picks.
import { rrMask, cover as drawnCover, hex } from './player/pix.js';
import * as S from './player/scenes.js';
import { PICTURES } from './playerstate.js';

const api = window.player;
const P = 2;
const SKATER = 'tee';

// ---------------------------------------------------------------- hand-placed 11x11 icons (aangmenu.js's tick, at 2x)
const ICONS = {
  tick: ['...........', '...........', '..........O', '.........OO', 'O.......OO.', 'OO.....OO..', '.OO...OO...', '..OO.OO....', '...OOO.....', '....O......', '...........'],
  bars: ['...........', '........O..', '........O..', '....O...O..', '....O...O.O', '.O..O.O.O.O', '.O..O.O.O.O', '.O.OO.O.OOO', '.OOOOOOOOOO', '...........', 'OOOOOOOOOOO'],
};
const TONE = { O: '#d8c8a8', sh: 'rgba(0,0,0,.65)', tick: '#ffe28c' };
const dprPx = (n) => Math.max(1, Math.round(n * (window.devicePixelRatio || 1)));
function icon(name, col = TONE.O) {
  const map = ICONS[name], dpr = window.devicePixelRatio || 1, px = dprPx(P), sh = dprPx(1);
  const c = document.createElement('canvas'); c.width = 11 * px + sh; c.height = 11 * px + sh;
  const g = c.getContext('2d');
  const put = (fill, o) => map.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === 'O') { g.fillStyle = fill; g.fillRect(x * px + o, y * px + o, px, px); } }));
  put(TONE.sh, sh); put(col, 0);
  c.className = 'ic'; c.style.width = c.width / dpr + 'px'; c.style.height = c.height / dpr + 'px';
  c.setAttribute('aria-hidden', 'true');
  return c;
}

// ---------------------------------------------------------------- the thumbnails: 34 art pixels, one device block each
const ROUND = rrMask(S.SW, S.SH, 4);
const thumbs = [];          // { c, id }
let coverImg = null, frame = 0, timer = 0;
function thumbCanvas(id) {
  const k = dprPx(1), dpr = window.devicePixelRatio || 1;
  const c = document.createElement('canvas'); c.width = S.SW * k; c.height = S.SH * k;
  c.style.width = c.width / dpr + 'px'; c.style.height = c.height / dpr + 'px';
  c.className = 'th' + (id === 'cover' ? ' cov' : ''); c.dataset.picture = id;
  c.setAttribute('aria-hidden', 'true');
  return c;
}
function paintScene(c, id, f) {
  const k = c.width / S.SW, g = c.getContext('2d'), im = g.createImageData(c.width, c.height), d = im.data;
  S[id](f % 8, f, SKATER)((x, y, col) => {
    x |= 0; y |= 0; if (x < 0 || y < 0 || x >= S.SW || y >= S.SH || !col || !ROUND[y * S.SW + x]) return;
    const v = hex(col);
    for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) { const n = ((y * k + j) * c.width + x * k + i) * 4; d[n] = v[0]; d[n + 1] = v[1]; d[n + 2] = v[2]; d[n + 3] = 255; }
  });
  g.putImageData(im, 0, 0);
}
function paintCover(c) {
  const g = c.getContext('2d'), n = c.width, k = n / S.SW;
  g.clearRect(0, 0, n, n);
  if (coverImg) { g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(coverImg, 0, 0, n, n); }
  else { g.imageSmoothingEnabled = false; g.drawImage(drawnCover(S.SW, 1), 0, 0, n, n); }
  const d = g.getImageData(0, 0, n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!ROUND[Math.floor(y / k) * S.SW + Math.floor(x / k)]) d.data[(y * n + x) * 4 + 3] = 0;
  g.putImageData(d, 0, 0);
}
/** Live-ish: the scenes move at 6 frames a second while the menu is up, and stop the moment it goes. */
function tick() {
  timer = 0;
  if (!menu || document.visibilityState !== 'visible') return;
  frame++;
  for (const t of thumbs) if (t.id !== 'cover') paintScene(t.c, t.id, frame);
  timer = setTimeout(tick, 166);
}

// ---------------------------------------------------------------- the menu
let menu = null;
function button(cls, label, onPick) {
  const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'menuitemradio');
  if (cls) b.className = cls;
  const lab = document.createElement('span'); lab.className = 'lab';
  if (label.icon) lab.append(label.icon);
  lab.append(label.text);
  b.append(lab);
  if (label.tick) { const t = icon('tick', TONE.tick); t.classList.add('tk'); t.dataset.tick = '1'; b.append(t); }
  b.addEventListener('click', onPick);
  return b;
}
function build(st) {
  thumbs.length = 0;
  const m = document.createElement('div'); m.className = 'tabmenu'; m.setAttribute('role', 'menu'); m.id = 'pm';
  m.append(Object.assign(document.createElement('div'), { className: 'mhead', textContent: 'PICTURE' }));
  for (const p of PICTURES) {
    const c = thumbCanvas(p.id);
    thumbs.push({ c, id: p.id });
    const on = st.picture === p.id;
    const b = button('pic' + (on ? ' on' : ''), { icon: c, text: p.name, tick: on }, () => api.menuPick('picture', p.id));
    b.dataset.picture = p.id; b.setAttribute('aria-checked', String(on));
    m.append(b);
  }
  m.append(Object.assign(document.createElement('div'), { className: 'sep' }));
  const bars = button(st.bars ? 'on' : '', { icon: icon('bars'), text: 'Bars on the screen', tick: !!st.bars }, () => api.menuPick('bars', !st.bars));
  bars.dataset.bars = st.bars ? 'on' : 'off'; bars.setAttribute('role', 'menuitemcheckbox'); bars.setAttribute('aria-checked', String(!!st.bars));
  m.append(bars);
  return m;
}

api.onMenu((st) => {
  clearTimeout(timer); timer = 0;
  menu?.remove(); menu = null;
  if (!st || typeof st !== 'object') return;
  menu = build(st);
  document.body.append(menu);
  for (const t of thumbs) if (t.id === 'cover') paintCover(t.c); else paintScene(t.c, t.id, frame);
  if (typeof st.cover === 'string' && st.cover.startsWith('data:image/')) {
    const img = new Image();
    img.onload = () => { coverImg = img; for (const t of thumbs) if (t.id === 'cover') paintCover(t.c); };
    img.src = st.cover;
  } else coverImg = null;
  timer = setTimeout(tick, 166);
  // the window is sized to the menu, its shadow room included
  requestAnimationFrame(() => { if (!menu) return; const r = menu.getBoundingClientRect(); api.menuSize(Math.ceil(r.right + 10), Math.ceil(r.bottom + 14)); });
});

// Arrow keys move, Enter picks (the button's own click), Esc closes.
document.addEventListener('keydown', (e) => {
  if (!menu) return;
  const keys = [...menu.querySelectorAll('button:not(:disabled)')];
  const at = keys.indexOf(document.activeElement);
  if (e.key === 'Escape') { api.menuPick('close'); e.preventDefault(); }
  else if (e.key === 'ArrowDown') { keys[(at + 1) % keys.length]?.focus(); e.preventDefault(); }
  else if (e.key === 'ArrowUp') { keys[(at - 1 + keys.length) % keys.length]?.focus(); e.preventDefault(); }
});
document.addEventListener('contextmenu', (e) => e.preventDefault());

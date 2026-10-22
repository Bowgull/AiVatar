// Sheet 67 v2: live timers on the sheet, built on the new hourglass (glass2.js). Every hourglass here is the engine
// running. Mockup code only.
import { Glass, secondly, fmt, DESIGNS } from './glass2.js';

class Clock {
  constructor() { this.rate = 1; this.base = Date.now(); this.real = this.base; }
  now() { return this.base + (Date.now() - this.real) * this.rate; }
  setRate(r) { this.base = this.now(); this.real = Date.now(); this.rate = r; }
}
const BOX = 35;   // the glass's square, in art pixels (upright 27 x 35, on its side 35 x 27)
const S = 45;     // the turning picture (glass2.js S)
const HOLD = 600, CLICK = 250;

// ---------------------------------------------------------------- sounds
const SND = {};
const SRC = { 'times-up-wood': 'sheet-67/times-up-wood.mp3', 'times-up-wood-again': 'sheet-67/times-up-wood-again.mp3', 'times-up-bowl': 'sheet-67/times-up-bowl.mp3', flip: 'sheet-67/flip.mp3', notch: 'sheet-67/notch.mp3' };
for (const [n, src] of Object.entries(SRC)) SND[n] = new Audio(src);
let pickedEnd = 'times-up-wood';
let soundsOk = false;
document.addEventListener('pointerdown', () => { soundsOk = true; }, { once: true });
function play(n) { if (!soundsOk) return; const a = SND[n]; if (!a) return; try { a.currentTime = 0; void a.play().catch(() => {}); } catch { /* fine */ } }

// ---------------------------------------------------------------- the hold ring around the glass: whole art pixels
function ringPixels(r) {
  const pts = [], seen = new Set();
  for (let a = 0; a < 720; a++) {
    const t = (a / 720) * Math.PI * 2, x = Math.round(Math.sin(t) * r), y = Math.round(-Math.cos(t) * r), k = x + ',' + y;
    if (!seen.has(k)) { seen.add(k); pts.push([x, y]); }
  }
  return pts;   // clockwise from the top
}
function drawRing(cv, frac, scale) {
  const r = 20, n = 2 * r + 3, dpr = devicePixelRatio || 1, k = Math.max(1, Math.round(scale * dpr));
  if (cv.width !== n * k) { cv.width = n * k; cv.height = n * k; cv.style.width = (n * k) / dpr + 'px'; cv.style.height = (n * k) / dpr + 'px'; }
  const g = cv.getContext('2d'); g.clearRect(0, 0, cv.width, cv.height);
  const pts = ringPixels(r), m = Math.floor(pts.length * Math.max(0, Math.min(1, frac)));
  pts.forEach(([x, y], i) => {
    const X = (x + r + 1) * k, Y = (y + r + 1) * k;
    g.fillStyle = '#1a1009'; g.fillRect(X, Y + k, k, k);                         // a 1-pixel drop under it
    g.fillStyle = i < m ? (i % 6 === 0 ? '#FFE096' : '#FFC43C') : 'rgba(255,224,150,.18)'; g.fillRect(X, Y, k, k);
  });
}

// ---------------------------------------------------------------- the menu's icons, 11x11 at 2x like aangmenu.js
const ICONS = {
  newt: ['OOOOOOOOOOO', '.O.......O.', '..OAAAAAO..', '...OAAAO...', '....OAO....', '.....O.....', '....O.O....', '...O.A.O...', '..O.AAA.O..', '.OAAAAAAAO.', 'OOOOOOOOOOO'],
  rename: ['........OO.', '.......OAAO', '......OAAO.', '.....OAAO..', '....OAAO...', '...OAAO....', '..OAAO.....', '.OOAO......', '.OOO.......', 'OO.........', '...........'],
  restart: ['...OOOO.O..', '..O....OO..', '.O....OOO..', 'O..........', 'O..........', 'O.........O', 'O.........O', '.O.......O.', '..O.....O..', '...OOOOO...', '...........'],
  quit: ['OO.......OO', 'OOO.....OOO', '.OOO...OOO.', '..OOO.OOO..', '...OOOOO...', '....OOO....', '...OOOOO...', '..OOO.OOO..', '.OOO...OOO.', 'OOO.....OOO', 'OO.......OO'],
  see: ['OOOOOOOOOOO', 'O.A.A.A.A.O', 'OA.A.A.A.AO', 'O.A.A.A.A.O', 'OA.A.A.A.AO', 'O.A.A.A.A.O', 'OA.A.A.A.AO', 'O.A.A.A.A.O', 'OA.A.A.A.AO', 'O.A.A.A.A.O', 'OOOOOOOOOOO'],
  pin: ['...OOOOO...', '...OAAAO...', '...OAAAO...', '...OAAAO...', '..OOOOOOO..', '.OOOOOOOOO.', '.....O.....', '.....O.....', '.....O.....', '.....O.....', '.....O.....'],
  click: ['O..........', 'OO.........', 'OAO........', 'OAAO.......', 'OAAAO......', 'OAAAAO.....', 'OAAAAAO....', 'OAAOOOOO...', 'OAO..O.....', 'OO....O....', 'O......O...'],
  apart: ['...........', 'OOOO...OOOO', 'OAAO...OAAO', 'OAAO...OAAO', 'OOOO...OOOO', '...........', '..O.....O..', '.OO.....OO.', 'OOOO...OOOO', '.OO.....OO.', '..O.....O..'],
  tick: ['...........', '...........', '..........O', '.........OO', 'O.......OO.', 'OO.....OO..', '.OO...OO...', '..OO.OO....', '...OOO.....', '....O......', '...........'],
};
const TONE = { O: '#d8c8a8', A: '#a8946e', sh: 'rgba(0,0,0,.65)', red: '#ff9a8a', tick: '#ffe28c' };
function icon(name, tone = {}) {
  const map = ICONS[name], pal = { O: tone.O ?? TONE.O, A: tone.A ?? TONE.A };
  const dpr = devicePixelRatio || 1, px = Math.max(1, Math.round(2 * dpr)), sh = Math.max(1, Math.round(dpr));
  const c = document.createElement('canvas'); c.width = 11 * px + sh; c.height = 11 * px + sh;
  const g = c.getContext('2d');
  const put = (col, o) => map.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch]) { g.fillStyle = col ?? pal[ch]; g.fillRect(x * px + o, y * px + o, px, px); } }));
  put(TONE.sh, sh); put(null, 0);
  c.className = 'ic'; c.style.width = c.width / dpr + 'px'; c.style.height = c.height / dpr + 'px';
  return c;
}
const E = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
function mrow(r) {
  const b = E('button'); b.type = 'button'; if (r.danger) b.classList.add('danger'); if (r.cls) b.classList.add(r.cls);
  const lab = E('span', 'lab'); lab.append(icon(r.ic, r.danger ? { O: TONE.red, A: TONE.red } : {}), r.t); b.append(lab);
  const i = E('i'); if (r.tag) { i.className = 'st'; i.append(r.tag); }
  if (r.sub) i.append(Object.assign(E('b', 'ar'), { textContent: '▸' }));
  if (r.tick) i.append(icon('tick', { O: TONE.tick }));
  b.append(i); if (r.k) b.style.setProperty('--k', r.k);
  if (r.on) b.addEventListener('click', r.on);
  return b;
}
/** The timer's right-click menu. fam = joined in a window family (the family's items join below). */
function timerMenu(o = {}) {
  const m = E('div', 'tabmenu'); m.setAttribute('role', 'menu');
  m.append(mrow({ ic: 'newt', t: 'New timer', sub: true, on: o.onNew }), mrow({ ic: 'rename', t: 'Rename', on: o.onRename }), mrow({ ic: 'restart', t: 'Restart', tag: 'OR HOLD THE GLASS', on: o.onRestart }));
  if (o.fam) {
    m.append(E('div', 'sep'), E('div', 'mhead', 'With the video'));
    const sl = E('div', 'slide'), lab = E('span', 'lab'); lab.append(icon('see'), 'See-through');
    const tr = E('div', 'tr'); tr.innerHTML = '<i style="width:30%"></i><u style="left:30%"></u>';
    sl.append(lab, tr, E('span', '', '30%')); m.append(sl);
    m.append(mrow({ ic: 'pin', t: 'Pin on top', tick: true }), mrow({ ic: 'click', t: 'Click through' }), mrow({ ic: 'apart', t: 'Pull apart' }));
  }
  m.append(E('div', 'sep'), mrow({ ic: 'quit', t: 'Stop', tag: 'HOLD', danger: true, cls: o.holdStop ? 'holdrow' : '', k: o.holdStop ?? '' }));
  return m;
}
function newMenu(o = {}) {
  const m = E('div', 'tabmenu submenu'); m.setAttribute('role', 'menu'); m.style.minWidth = '230px';
  for (const [t, ms] of [['5 minutes', 5], ['10 minutes', 10], ['25 minutes', 25], ['45 minutes', 45]]) {
    const b = mrow({ ic: 'newt', t, on: () => o.onPick?.(ms * 60_000) }); m.append(b);
  }
  m.append(E('div', 'sep'), E('div', 'mhead', 'Custom'));
  const tf = E('div', 'tf'); const f = E('span', 'field'); f.innerHTML = '1:30<b></b>'; tf.append(f, Object.assign(E('span', 'kc', 'Enter')), Object.assign(E('span', 'mcap', 'to start'))); m.append(tf);
  return m;
}

// ---------------------------------------------------------------- one live timer
/**
 * @param {HTMLElement} host
 * @param {{ shape?: 'plate'|'stack'|'strip', label: string, total: number, left: number, ramp?: string, design?: string, scale?: number,
 *   calm?: boolean, ring?: boolean, loop?: boolean, fam?: boolean }} o
 */
export function timer(host, o) {
  const clock = new Clock();
  const shape = o.shape ?? 'plate', scale = o.scale ?? (shape === 'strip' ? 1 : 2);
  const el = E('div', 'tw ' + shape);
  el.innerHTML = '<div class="gbox"><canvas class="gl"></canvas><canvas class="ring"></canvas></div><div class="twr"><span class="np"></span><span class="tmv">0:00</span><span class="pz">PAUSED</span></div><div class="chip2"></div><div class="trow"></div>';
  host.append(el);
  const box = /** @type {HTMLElement} */ (el.querySelector('.gbox')), cv = /** @type {HTMLCanvasElement} */ (el.querySelector('canvas.gl')), rc = /** @type {HTMLCanvasElement} */ (el.querySelector('canvas.ring'));
  box.style.width = box.style.height = BOX * scale + 'px';
  cv.style.left = cv.style.top = -((S - BOX) / 2) * scale + 'px';
  drawRing(rc, 0, scale); rc.style.left = rc.style.top = -((2 * 20 + 3 - BOX) / 2) * scale + 'px';
  const np = /** @type {HTMLElement} */ (el.querySelector('.np')), tm = /** @type {HTMLElement} */ (el.querySelector('.tmv'));
  const chip = /** @type {HTMLElement} */ (el.querySelector('.chip2')), row = /** @type {HTMLElement} */ (el.querySelector('.trow'));
  let label = o.label; np.textContent = label;
  let t = { total: o.total, end: clock.now() + o.left, paused: 0 };
  let done = false, ringing = false, again = 0;
  const g = new Glass(cv, {
    scale, design: o.design ?? 'walnut', ramp: o.ramp ?? 'gold', seed: o.label.length * 97 + (o.total % 1000), clock,
    onEnd: () => {
      done = true; el.classList.add('done'); np.textContent = `${label} · time's up`; keys();
      el.classList.remove('hop'); void el.offsetWidth; el.classList.add('hop');
      if (o.ring || ringing) { play(pickedEnd); again = window.setTimeout(() => { if (done) { play(pickedEnd === 'times-up-wood' ? 'times-up-wood-again' : pickedEnd); el.classList.remove('hop'); void el.offsetWidth; el.classList.add('hop'); } }, 60_000); }
      if (o.loop) window.setTimeout(() => { if (done) restart(o.total); }, 4000);
    },
  });
  if (o.calm) g.calm(true);
  g.set(t);
  secondly(() => { tm.textContent = fmt(g.left()); }, clock, () => (t.paused ? 0 : t.end));
  const push = () => { g.set(t); tm.textContent = fmt(g.left()); el.classList.toggle('paused', !!t.paused); };

  function restart(total) {
    clearTimeout(again); el.classList.remove('done'); np.textContent = label; play('flip');
    if (t.paused) { t = { ...t, end: clock.now() + t.paused, paused: 0 }; el.classList.remove('paused'); }
    g.turnOver(() => { done = false; t = { total, end: clock.now() + total, paused: 0 }; push(); keys(); });
  }
  function pause() {
    if (done) { restart(t.total); return; }
    if (t.paused) { t = { ...t, end: clock.now() + t.paused, paused: 0 }; g.tip(false); }
    else { t = { ...t, paused: Math.max(1, t.end - clock.now()) }; g.tip(true); }
    push(); keys();
  }
  function add(ms) {
    if (done) { restart(Math.max(60_000, ms)); return; }
    const left = t.paused || t.end - clock.now();
    if (left + ms < 10_000) ms = 10_000 - left;
    t = t.paused ? { ...t, total: Math.max(10_000, t.total + ms), paused: t.paused + ms } : { ...t, total: Math.max(10_000, t.total + ms), end: t.end + ms };
    push();
  }
  let chipSum = 0, chipT = 0;
  function showChip(ms) {
    chipSum += ms; const m = Math.round(chipSum / 60000);
    chip.textContent = (m >= 0 ? '+' : '−') + Math.abs(m) + ':00'; chip.classList.add('on');
    clearTimeout(chipT); chipT = window.setTimeout(() => { chip.classList.remove('on'); chipSum = 0; }, 900);
  }
  function stop() {
    clearTimeout(again); el.style.transition = 'opacity .25s'; el.style.opacity = '0';
    window.setTimeout(() => { reset(o.left); el.style.opacity = '1'; }, 1600);   // on the sheet it comes back
  }
  function reset(left) {
    clearTimeout(again); done = false; el.classList.remove('done', 'paused'); np.textContent = label;
    t = { total: o.total, end: clock.now() + left, paused: 0 }; g.angle = 0; g.target = 0; g.set(null); g.set(t); keys();
  }
  function key(text, cls, title, fn, hold = false) {
    const b = E('button', 'tb ' + cls); b.type = 'button'; b.title = title; b.textContent = text; if (hold) b.append(E('span', 'fill'));
    if (hold) {
      let h = 0;
      b.addEventListener('pointerdown', (e) => { e.stopPropagation(); b.classList.add('holding'); h = window.setTimeout(() => { b.classList.remove('holding'); fn(); }, HOLD); });
      for (const ev of ['pointerup', 'pointerleave']) b.addEventListener(ev, () => { clearTimeout(h); b.classList.remove('holding'); });
    } else b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
    return b;
  }
  function keys() {
    row.replaceChildren(...(done
      ? [key('Again', 'go', 'Turn it over: the same time again', () => restart(t.total)), key('+5', '', 'Five more minutes', () => restart(5 * 60_000)), key('✕', 'stop', 'Hold to close', stop, true)]
      : [key('+1', '', 'One more minute (or scroll up)', () => { add(60_000); showChip(60_000); }), key('+5', '', 'Five more minutes (or Shift + scroll)', () => { add(5 * 60_000); showChip(5 * 60_000); }), key('✕', 'stop', 'Hold to stop', stop, true)]));
  }
  keys();
  // the glass: click = pause / go on; hold = turn it over (restart). A short press never shows the ring.
  let downAt = 0, ringRaf = 0;
  const endHold = () => { cancelAnimationFrame(ringRaf); ringRaf = 0; box.classList.remove('holding'); drawRing(rc, 0, scale); };
  box.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return; e.stopPropagation(); downAt = performance.now();
    const tick = () => {
      const held = performance.now() - downAt;
      if (held > 150) { box.classList.add('holding'); drawRing(rc, held / HOLD, scale); }
      if (held >= HOLD) { endHold(); downAt = 0; restart(t.total); return; }
      ringRaf = requestAnimationFrame(tick);
    };
    ringRaf = requestAnimationFrame(tick);
  });
  box.addEventListener('pointerup', () => { if (!downAt) return; const held = performance.now() - downAt; downAt = 0; endHold(); if (held < CLICK) pause(); });
  box.addEventListener('pointerleave', () => { downAt = 0; endHold(); });
  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    const step = (e.shiftKey ? 5 : 1) * 60_000 * (e.deltaY < 0 ? 1 : -1);
    add(step); showChip(step); play('notch');
  }, { passive: false });
  function rename() {
    el.classList.add('renaming');
    const inp = document.createElement('input'); inp.value = label; np.replaceChildren(inp); inp.focus(); inp.select();
    const finish = (keep) => { if (!el.classList.contains('renaming')) return; el.classList.remove('renaming'); if (keep && inp.value.trim()) label = inp.value.trim().slice(0, 30); np.textContent = done ? `${label} · time's up` : label; };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); e.stopPropagation(); });
    inp.addEventListener('blur', () => finish(true));
  }
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault(); closeMenus();
    const m = timerMenu({ fam: o.fam, onRename: () => { closeMenus(); rename(); }, onRestart: () => { closeMenus(); restart(t.total); }, onNew: (ev) => {
      ev.stopPropagation(); if (document.querySelector('.livesub')) return;
      const sm = newMenu({ onPick: (ms) => { closeMenus(); clearTimeout(again); restart(ms); } }); sm.classList.add('livemenu', 'livesub');
      const r = m.getBoundingClientRect(); sm.style.left = r.right + 4 + 'px'; sm.style.top = r.top + 'px'; document.body.append(sm);
    } });
    m.classList.add('livemenu'); m.style.left = e.clientX + 'px'; m.style.top = e.clientY + 'px';
    const stopRow = m.querySelector('button.danger'); let h = 0;
    stopRow?.addEventListener('pointerdown', () => { const at = performance.now(); const f = () => { const k = Math.min(1, (performance.now() - at) / HOLD); stopRow.classList.add('holdrow'); stopRow.style.setProperty('--k', k * 100 + '%'); if (k >= 1) { closeMenus(); stop(); return; } h = requestAnimationFrame(f); }; h = requestAnimationFrame(f); });
    for (const ev of ['pointerup', 'pointerleave']) stopRow?.addEventListener(ev, () => { cancelAnimationFrame(h); stopRow.classList.remove('holdrow'); });
    document.body.append(m);
  });
  return {
    el, g, clock, pause, add, restart, rename, reset,
    speed(r) { clock.setRate(r); g.wake(); push(); },
    ring(on) { ringing = on; },
    ringAt(f) { box.classList.add('holding'); drawRing(rc, f, scale); },
    chip(ms) { showChip(ms); clearTimeout(chipT); },
    get t() { return t; },
  };
}
function closeMenus() { document.querySelectorAll('.livemenu').forEach((m) => m.remove()); }
document.addEventListener('pointerdown', (e) => { if (!(/** @type {HTMLElement} */ (e.target)).closest?.('.livemenu')) closeMenus(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenus(); });

/** A bare glass (no plate), for the 1x and 4x views. */
function bare(host, o) {
  const clock = new Clock(), cv = document.createElement('canvas'); host.append(cv);
  const g = new Glass(cv, { scale: o.scale, design: o.design, ramp: o.ramp ?? 'gold', seed: 7, clock });
  let t = { total: o.total, end: clock.now() + o.left, paused: 0 };
  g.onEnd = () => window.setTimeout(() => g.turnOver(() => { t = { total: o.total, end: clock.now() + o.total, paused: 0 }; g.set(t); }), 1500);
  g.set(t);
  return { g, clock, speed(r) { clock.setRate(r); g.wake(); g.set(t); } };
}

// ---------------------------------------------------------------- the sheet
const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
const fast = [];
// 1. three hourglasses
for (const d of Object.keys(DESIGNS)) {
  const host = $('d-' + d); if (!host) continue;
  fast.push(timer(host.querySelector('.p2'), { label: 'Pizza', total: 2 * 60_000, left: 80_000, design: d, loop: true }));
  fast.push(bare(host.querySelector('.p1'), { scale: 1, design: d, total: 2 * 60_000, left: 70_000 }));
  fast.push(bare(host.querySelector('.p4'), { scale: 4, design: d, total: 2 * 60_000, left: 50_000 }));
}
$('fast1').addEventListener('click', (e) => { const on = /** @type {HTMLElement} */ (e.currentTarget).classList.toggle('on') ? 10 : 1; for (const x of fast) x.speed(on); });

// 2. paused: it lies down
const pz = timer($('pz-plate'), { label: 'Tea', total: 4 * 60_000, left: 150_000, ramp: 'gold', loop: true });
const pzBig = bare($('pz-big'), { scale: 4, design: 'walnut', total: 4 * 60_000, left: 150_000 });
let pzOn = false, auto = 0;
const pzToggle = () => { pzOn = !pzOn; pz.pause(); pzBig.g.tip(pzOn); $('pz-btn').textContent = pzOn ? 'Go on (stands up)' : 'Pause (lies down)'; };
$('pz-btn').addEventListener('click', () => { soundsOk = true; pzToggle(); });
$('pz-auto').addEventListener('click', (e) => { const b = /** @type {HTMLElement} */ (e.currentTarget); if (auto) { clearInterval(auto); auto = 0; b.classList.remove('on'); } else { auto = window.setInterval(pzToggle, 2400); b.classList.add('on'); } });
auto = window.setInterval(pzToggle, 2400); $('pz-auto').classList.add('on');

// 3. the gestures, frozen in each state, and one to try
timer($('g-try'), { label: 'Pizza', total: 3 * 60_000, left: 140_000, loop: true });
const st = (id, o) => timer($(id), { label: 'Pizza', total: 3 * 60_000, left: 140_000, ...o });
st('g-rest', {});
st('g-hover', {}).el.classList.add('show');
const gh = st('g-hold', {}); gh.ringAt(0.62);
const gf = st('g-flip', {}); window.setTimeout(() => { gf.g.angle = 125; gf.g.sand.g = [0, 1]; gf.g.paint(); }, 300);
const gx = st('g-x', {}); gx.el.classList.add('show'); window.setTimeout(() => { const f = /** @type {HTMLElement} */ (gx.el.querySelector('.tb.stop .fill')); f.style.transform = 'scaleX(.62)'; gx.el.querySelector('.tb.stop')?.classList.add('holding'); f.style.transition = 'none'; }, 50);
const gs = st('g-scroll', {}); window.setTimeout(() => gs.chip(60_000), 200);
const gp = st('g-paused', {}); window.setTimeout(() => gp.pause(), 200);
const gd = st('g-done', { left: 1500 });
void gd;

// 4. the menus, drawn with the real menu styles
$('m-solo').append(timerMenu({}));
const pair = E('div', 'pair'); pair.append(timerMenu({}), newMenu()); $('m-new').append(pair);
pair.querySelector('button')?.classList.add('on');
$('m-fam').append(timerMenu({ fam: true, holdStop: '55%' }));
const rn = timer($('m-rename'), { label: 'Raid pull', total: 10 * 60_000, left: 372_000, ramp: 'sea' });
window.setTimeout(() => { rn.rename(); const i = /** @type {HTMLInputElement} */ (rn.el.querySelector('.np input')); i.value = 'Raid pu'; i.blur = () => {}; }, 400);

// 5. many timers
timer($('mt-free'), { label: 'Pizza', total: 12 * 60_000, left: 7 * 60_000 + 40_000, loop: true }).el.style.cssText = 'left:0;top:10px';
timer($('mt-free'), { label: 'Raid pull', total: 10 * 60_000, left: 2 * 60_000 + 5_000, ramp: 'sea', loop: true }).el.style.cssText = 'left:290px;top:0';
timer($('mt-free'), { label: 'Stretch', total: 45 * 60_000, left: 31 * 60_000, ramp: 'plum', loop: true }).el.style.cssText = 'left:120px;top:140px';
for (const [lb, tot, left, ramp] of [['Pizza', 12, 460, 'gold'], ['Raid pull', 10, 125, 'sea'], ['Stretch', 45, 1860, 'plum']]) timer($('mt-stack'), { label: lb, total: tot * 60_000, left: left * 1000, ramp, loop: true, fam: true });
for (const [lb, tot, left, ramp] of [['Pizza', 12, 460, 'gold'], ['Raid pull', 10, 125, 'sea'], ['Stretch', 45, 1860, 'plum']]) timer($('mt-strip'), { shape: 'strip', label: lb, total: tot * 60_000, left: left * 1000, ramp, loop: true, fam: true });

// 6. time's up
const end = timer($('e-plate'), { label: 'Pizza', total: 60_000, left: 12_000 });
$('e-play').addEventListener('click', () => { soundsOk = true; end.ring(true); end.reset(11_000); });

// 7. in a game
timer($('c-normal'), { label: 'Raid pull', total: 2 * 60_000, left: 90_000, ramp: 'sea', loop: true });
timer($('c-calm'), { label: 'Raid pull', total: 2 * 60_000, left: 90_000, ramp: 'sea', loop: true, calm: true });

// sounds: every play key; the time's-up choice also becomes the sound in section 6
let cur = null;
for (const b of document.querySelectorAll('[data-src]')) {
  b.addEventListener('click', () => {
    soundsOk = true;
    const el = /** @type {HTMLElement} */ (b), list = (el.dataset.src ?? '').split('|');
    if (el.dataset.pick) pickedEnd = el.dataset.pick;
    if (cur) cur.pause();
    document.querySelectorAll('[data-src]').forEach((x) => x.classList.remove('playing'));
    el.classList.add('playing');
    let i = 0;
    const next = () => {
      if (i >= list.length) { el.classList.remove('playing'); return; }
      const a = new Audio(list[i++]); cur = a; a.onended = () => window.setTimeout(next, 500); void a.play().catch(() => el.classList.remove('playing'));
    };
    next();
  });
}
window.__sheet = { end, pz };
window.__ready = true;

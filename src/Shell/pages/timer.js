// Sheet 67 v2 + 67b (2026-10-22): one timer, in its own small window. The brain keeps the time; this page shows it.
//
// Click the glass = pause (it lies on its side) / go on; at time's up = Again. Hold the glass 0.6 s (a gold pixel ring
// fills) = turn it right over and start again. Hover = +1 / +5 / hold X. Scroll = one minute (Shift: five). Right-click
// = its menu (its own window, timermenu.html). The window never takes the keyboard, except while he renames it.
// Light: the hourglass paints only when a grain moves (sandglass.js), the time once a second on the second, nothing
// while hidden, and calm (no shimmer, one paint per grain) while a game is in front.
import { Glass, fmt } from './sandglass.js';

const api = window.aang;
const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
const plate = $('tw'), box = $('gbox'), np = $('np'), tm = $('left'), chip = $('chip'), keysRow = $('keys');
const ringCv = /** @type {HTMLCanvasElement} */ ($('ring'));
const HOLD = 600, CLICK = 250, RING_AFTER = 150;

/** @type {{id:string,label:string,total:number,end:number,paused:number,colour?:string,done?:number}|null} */
let t = null;
let pinned = false, renaming = false, tipped = false, keyState = '';
/** @type {Glass|null} */
let g = null;

// ---------------------------------------------------------------- the time, once a second, on the second
let tick = 0;
const leftNow = () => (!t || t.done ? 0 : t.paused ? t.paused : Math.max(0, t.end - Date.now()));
function showTime() {
  clearTimeout(tick); tick = 0;
  if (!t) return;
  tm.textContent = fmt(leftNow());
  plate.classList.toggle('paused', !!t.paused && !t.done);
  if (t.paused || t.done || document.visibilityState === 'hidden') return;
  const ms = (t.end - Date.now()) % 1000;
  if (t.end - Date.now() > 0) tick = window.setTimeout(showTime, (ms > 0 ? ms : 1000) + 4);
}
document.addEventListener('visibilitychange', showTime);

// ---------------------------------------------------------------- the state
const isDone = () => !!t && (!!t.done || (!!g && g.ended && leftNow() <= 0));
function paintName() {
  if (renaming || !t) return;
  const label = t.label || 'Timer';
  np.textContent = isDone() ? `${label} · time's up` : label;
}
function apply(next) {
  const first = !t;
  t = next;
  if (!g) {
    let seed = 7; for (const ch of next.id) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    g = new Glass(/** @type {HTMLCanvasElement} */ ($('gl')), { scale: 2, colour: next.colour, seed, onEnd: ended });
    window.__glass = g;
  }
  if (g.sand.colour !== (next.colour || 'blue')) g.setColour(next.colour || 'blue');
  g.set(next);
  const wantTip = !!next.paused && !next.done;
  if (first) { tipped = wantTip; if (wantTip) { g.angle = g.target = 90; g.gravity(); g.sand.settle(); g.paint(); } }
  else if (wantTip !== tipped && !g.turning) { tipped = wantTip; g.tip(wantTip); }
  plate.classList.toggle('done', isDone());
  paintName(); showTime(); keys();
}
function ended() {
  plate.classList.add('done');
  plate.classList.remove('hop'); void plate.offsetWidth; plate.classList.add('hop');
  paintName(); keys(); showTime();
}

// ---------------------------------------------------------------- doing things (the page moves first; the brain confirms)
const act = (action, extra = {}) => { if (t) api?.timerAct?.({ action, ...extra }); };
function pause() {
  if (!t || g?.turning) return;
  if (isDone()) { restart(t.total); return; }
  const local = t.paused ? { ...t, end: Date.now() + t.paused, paused: 0 } : { ...t, paused: Math.max(1, t.end - Date.now()) };
  apply(local);
  act('pause');
}
/** Turn it right over and run `ms` again (the sand that fell is the sand that runs). */
function restart(ms) {
  if (!t || !g || g.turning) return;
  const total = Math.max(1000, ms || t.total);
  tipped = false;
  plate.classList.remove('done'); keyState = ''; keys();
  act('again', { ms: total });
  g.turnOver(() => { t = { ...t, total, end: Date.now() + total, paused: 0 }; delete t.done; g.set(t); plate.classList.remove('done', 'paused'); paintName(); showTime(); keys(); });
}
function add(ms) {
  if (!t) return;
  if (isDone()) { restart(ms); return; }
  const left = leftNow(), next = Math.max(10_000, left + ms), d = next - left;
  if (!d) return;
  apply(t.paused ? { ...t, total: Math.max(next, t.total + d), paused: next } : { ...t, total: Math.max(next, t.total + d), end: Date.now() + next });
  return d;
}
function stop() { plate.classList.add('gone'); act('stop'); }

// scroll: one minute a notch (Shift five), shown on a chip, sent as one change after 400 ms of quiet
let chipSum = 0, chipT = 0, sendSum = 0, sendT = 0;
function showChip(ms) {
  chipSum += ms; const m = Math.round(chipSum / 60000);
  chip.textContent = (m >= 0 ? '+' : '−') + Math.abs(m) + ':00'; chip.classList.add('on');
  clearTimeout(chipT); chipT = window.setTimeout(() => { chip.classList.remove('on'); chipSum = 0; }, 900);
}
plate.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (!t || pinned || isDone() || g?.turning) return;
  const step = (e.shiftKey ? 5 : 1) * 60_000 * (e.deltaY < 0 ? 1 : -1);
  const d = add(step);
  if (!d) return;
  showChip(d); sendSum += d;
  clearTimeout(sendT); sendT = window.setTimeout(() => { const s = sendSum; sendSum = 0; if (s) act('add', { ms: s }); }, 400);
}, { passive: false });

// ---------------------------------------------------------------- the keys under it
const E = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
function key(text, cls, title, fn, hold = false) {
  const b = /** @type {HTMLButtonElement} */ (E('button', 'tb ' + cls, text)); b.type = 'button'; b.title = title; b.dataset.k = text;
  if (hold) {
    b.append(E('span', 'fill'));
    let h = 0;
    b.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (e.button !== 0) return; b.classList.add('holding'); h = window.setTimeout(() => { b.classList.remove('holding'); fn(); }, HOLD); });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => { clearTimeout(h); b.classList.remove('holding'); });
  } else {
    b.addEventListener('pointerdown', (e) => e.stopPropagation());
    b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
  }
  return b;
}
function keys() {
  const done = isDone(), s = done ? 'done' : 'run';
  if (s === keyState) return;
  keyState = s;
  keysRow.replaceChildren(...(done
    ? [key('Again', 'go', 'Turn it over: the same time again', () => restart(t?.total ?? 0)), key('+5', '', 'Five more minutes', () => restart(5 * 60_000)), key('✕', 'stop', 'Hold to close', stop, true)]
    : [key('+1', '', 'One more minute (or scroll up)', () => { const d = add(60_000); if (d) { showChip(d); act('add', { ms: d }); } }),
      key('+5', '', 'Five more minutes (or Shift + scroll)', () => { const d = add(5 * 60_000); if (d) { showChip(d); act('add', { ms: d }); } }),
      key('✕', 'stop', 'Hold to stop', stop, true)]));
}

// ---------------------------------------------------------------- the glass: click = pause, hold = turn it over
function ringPixels(r) {
  const pts = [], seen = new Set();
  for (let a = 0; a < 720; a++) {
    const th = (a / 720) * Math.PI * 2, x = Math.round(Math.sin(th) * r), y = Math.round(-Math.cos(th) * r), k = x + ',' + y;
    if (!seen.has(k)) { seen.add(k); pts.push([x, y]); }
  }
  return pts;   // clockwise from the top
}
const RING = ringPixels(20);
function drawRing(frac) {
  const r = 20, n = 2 * r + 3, dpr = devicePixelRatio || 1, k = Math.max(1, Math.round(2 * dpr));
  if (ringCv.width !== n * k) { ringCv.width = n * k; ringCv.height = n * k; ringCv.style.width = (n * k) / dpr + 'px'; ringCv.style.height = (n * k) / dpr + 'px'; }
  const c = ringCv.getContext('2d'); c.clearRect(0, 0, ringCv.width, ringCv.height);
  const m = Math.floor(RING.length * Math.max(0, Math.min(1, frac)));
  RING.forEach(([x, y], i) => {
    const X = (x + r + 1) * k, Y = (y + r + 1) * k;
    c.fillStyle = '#1a1009'; c.fillRect(X, Y + k, k, k);
    c.fillStyle = i < m ? (i % 6 === 0 ? '#FFE096' : '#FFC43C') : 'rgba(255,224,150,.18)'; c.fillRect(X, Y, k, k);
  });
}
let downAt = 0, ringRaf = 0;
const endHold = () => { cancelAnimationFrame(ringRaf); ringRaf = 0; box.classList.remove('holding'); };
box.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || pinned) return;
  e.stopPropagation(); downAt = performance.now();
  const step = () => {
    if (!downAt) return;
    const held = performance.now() - downAt;
    if (held > RING_AFTER) { box.classList.add('holding'); drawRing(held / HOLD); }
    if (held >= HOLD) { endHold(); downAt = 0; restart(t?.total ?? 0); return; }
    ringRaf = requestAnimationFrame(step);
  };
  ringRaf = requestAnimationFrame(step);
});
box.addEventListener('pointerup', () => { if (!downAt) return; const held = performance.now() - downAt; downAt = 0; endHold(); if (held < CLICK) pause(); });
box.addEventListener('pointerleave', () => { downAt = 0; endHold(); });

// ---------------------------------------------------------------- rename: on the nameplate, the keyboard only while editing
function rename() {
  if (!t || renaming) return;
  renaming = true; plate.classList.add('renaming');
  const inp = document.createElement('input'); inp.value = t.label || ''; inp.maxLength = 40; inp.placeholder = 'Name';
  np.replaceChildren(inp); inp.focus(); inp.select();
  const finish = (keep) => {
    if (!renaming) return;
    renaming = false; plate.classList.remove('renaming');
    const v = inp.value.replace(/\s+/g, ' ').trim().slice(0, 40);
    if (keep && t && v !== t.label) { t = { ...t, label: v }; act('rename', { label: v }); }
    paintName();
    api?.timerTyping?.(false);
  };
  inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); });
  inp.addEventListener('blur', () => finish(true));
}

// ---------------------------------------------------------------- from the Shell
api?.onTimerData?.((d) => { if (d && typeof d === 'object' && typeof d.id === 'string') apply(d); });
api?.onTimerPinned?.((on) => { pinned = on === true; document.body.classList.toggle('pinned', pinned); });
api?.onTimerCalm?.((on) => g?.calm(on === true));
api?.onTimerDo?.((what) => { if (what === 'rename') rename(); else if (what === 'restart') restart(t?.total ?? 0); });
// a new screen scale (moved to another display): whole device pixels again
let dpr = devicePixelRatio;
window.addEventListener('resize', () => { if (devicePixelRatio !== dpr && g) { dpr = devicePixelRatio; g.fit(); g.paint(); drawRing(0); } });

// The window takes the mouse only over the plate and its keys; anywhere else goes to whatever is behind.
let over = false;
const hot = () => plate.matches(':hover') || keysRow.matches(':hover');
document.addEventListener('mousemove', () => { const h = hot(); if (h !== over) { over = h; api?.timerClickable?.(h); } });
document.addEventListener('mouseleave', () => { over = false; if (!renaming) api?.timerClickable?.(false); });

// Drag the plate anywhere (the family snaps it). The Shell moves the window; the page only says how far.
plate.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || pinned || renaming) return;
  e.preventDefault();
  const sx = e.screenX, sy = e.screenY;
  plate.setPointerCapture(e.pointerId);
  plate.classList.add('held');
  api?.timerDrag?.({ phase: 'start' });
  plate.onpointermove = (ev) => api?.timerDrag?.({ phase: 'move', dx: ev.screenX - sx, dy: ev.screenY - sy });
  plate.onpointerup = () => { plate.onpointermove = null; plate.classList.remove('held'); api?.timerDrag?.({ phase: 'end' }); };
});
// Right-click: its menu, at the mouse (its own window, so it can be as big as it needs and take the keys for Custom).
plate.addEventListener('contextmenu', (e) => { e.preventDefault(); if (!pinned && !renaming) api?.timerMenu?.({ x: e.screenX, y: e.screenY }); });
drawRing(0);

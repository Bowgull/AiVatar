// Sheet 17: one running timer. The hourglass shows the share of time left; the clock beside it is exact.
// The window never takes the keyboard (WoW keeps it); only the plate, its keys and the menu take the mouse.
import { makeGlass, draw } from './hourglass.js';

const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
const plate = $('tw'), menu = $('menu'), see = /** @type {HTMLInputElement} */ ($('see'));
const glass = makeGlass(2);
$('glass').append(glass);

/** @type {{id:string,label:string,total:number,end:number,paused:number}|null} */
let timer = null;
let pinned = false;

const fmt = (ms) => {
  ms = Math.max(0, ms);
  const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
};
function paint() {
  if (!timer) return;
  const left = timer.paused || Math.max(0, timer.end - Date.now());
  $('left').textContent = fmt(left);
  draw(glass, timer.total ? left / timer.total : 0, !timer.paused && left > 0);
  plate.classList.toggle('paused', !!timer.paused);
  $('pause').textContent = timer.paused ? 'GO' : 'II';
}
setInterval(paint, 200);
window.aang?.onTimerData?.((t) => {
  if (!t || typeof t !== 'object') return;
  timer = t;
  $('label').textContent = t.label || 'Timer';
  paint();
});
window.aang?.onTimerPinned?.((on) => { pinned = on === true; document.body.classList.toggle('pinned', pinned); if (pinned) closeMenu(); });

// The window takes the mouse only over the plate, its keys and the menu; anywhere else goes to the game.
let over = false;
const hot = () => plate.matches(':hover') || (!menu.hidden && menu.matches(':hover')) || $('keys').matches(':hover');
document.addEventListener('mousemove', () => { const h = hot(); if (h !== over) { over = h; window.aang?.timerClickable?.(h || !menu.hidden); } });
document.addEventListener('mouseleave', () => { over = false; window.aang?.timerClickable?.(!menu.hidden); });

const act = (action) => { if (timer) window.aang?.timerAct?.({ id: timer.id, action }); };
for (const [id, a] of [['add', 'add'], ['pause', 'pause'], ['stop', 'stop'], ['mstop', 'stop']]) {
  $(id).addEventListener('pointerdown', (e) => e.stopPropagation());
  $(id).addEventListener('click', (e) => { e.stopPropagation(); closeMenu(); act(a); });
}

// Drag the plate anywhere. The Shell moves the window; the page only says how far.
plate.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || pinned) return;
  e.preventDefault();
  const sx = e.screenX, sy = e.screenY;
  plate.setPointerCapture(e.pointerId);
  plate.classList.add('held');
  window.aang?.timerDrag?.({ phase: 'start' });
  plate.onpointermove = (ev) => window.aang?.timerDrag?.({ phase: 'move', dx: ev.screenX - sx, dy: ev.screenY - sy });
  plate.onpointerup = () => { plate.onpointermove = null; plate.classList.remove('held'); window.aang?.timerDrag?.({ phase: 'end' }); };
});

// Right-click: see-through and pin.
function closeMenu() { menu.hidden = true; window.aang?.timerClickable?.(over); }
plate.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (pinned) return;
  menu.style.top = (plate.offsetTop + plate.offsetHeight + 8) + 'px';
  menu.hidden = false;
  window.aang?.timerClickable?.(true);
});
see.addEventListener('input', () => { $('seev').textContent = see.value + '%'; window.aang?.timerOpacity?.(Number(see.value) / 100); });
$('pin').addEventListener('click', () => { closeMenu(); window.aang?.timerPin?.(true); });
document.addEventListener('pointerdown', (e) => { if (!menu.hidden && !menu.contains(/** @type {Node} */ (e.target))) closeMenu(); });
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

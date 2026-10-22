// Sheet 17: one sticky note on his screen. Type on it; drag it by its top; resize from the corner; right-click
// for colour, text, size, font, see-through, pin, back to board, delete. Drop it on Aang to put it back.
import { buildPaper, openMenu, closeMenu, paintNote } from './notepaper.js';

const paperEl = /** @type {HTMLElement} */ (document.getElementById('paper'));
/** @type {any} */ let note = null;
/** @type {any} */ let paper = null;
let typedAt = 0;

window.aang?.onNoteData?.((n) => {
  if (!n || typeof n !== 'object') return;
  const first = !note;
  // While he is typing on it, his own words win over an echo of them coming back from the brain. And when what
  // came back is what this window already shows (his own change, saved), nothing is redrawn: the caret, the
  // highlight and the scroll stay where they were (his test: every font pick reset the note).
  const busy = document.hasFocus() && Date.now() - typedAt < 4000;
  const same = !first && paper && n.title === (paper.title.textContent ?? '').trim() && n.html === note.html;
  note = Object.assign(note ?? {}, n);
  document.body.classList.toggle('pinned', !!n.out?.pinned);
  if (!first && (busy || same)) { paintNote(paperEl, note); return; }
  paper = buildPaper(paperEl, note, (changed) => { typedAt = Date.now(); if (!changed.title) changed.title = 'Note'; window.aang?.noteSave?.(changed); });
});
document.addEventListener('input', () => { typedAt = Date.now(); });

// Drag by the top strip (or the pin); resize from the corner. The Shell moves the window.
function dragger(el, kind) {
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || note?.out?.pinned) return;
    e.preventDefault();
    const sx = e.screenX, sy = e.screenY;
    el.setPointerCapture(e.pointerId);
    window.aang?.noteMove?.({ kind, phase: 'start' });
    el.onpointermove = (ev) => window.aang?.noteMove?.({ kind, phase: 'move', dx: ev.screenX - sx, dy: ev.screenY - sy });
    el.onpointerup = () => { el.onpointermove = null; window.aang?.noteMove?.({ kind, phase: 'end' }); };
  });
}
dragger(/** @type {HTMLElement} */ (document.getElementById('grab')), 'drag');
dragger(/** @type {HTMLElement} */ (document.getElementById('grip')), 'resize');

let menuPending = false;
// Right-click: the menu. The window grows to fit it while it is open, and the paper keeps its own size.
paperEl.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (!note || !paper || note.out?.pinned) return;
  if (menuPending || document.getElementById('nmenu')) return;     // one menu at a time
  menuPending = true;
  const r = paperEl.getBoundingClientRect();
  document.body.style.setProperty('--w', r.width + 'px');
  document.body.style.setProperty('--h', r.height + 'px');
  document.body.classList.add('menu');
  // Where he clicked (his call). The window grows first so the whole menu fits, then it opens there.
  const at = { x: e.clientX, y: e.clientY };
  const part = /** @type {HTMLElement} */ (e.target).closest?.('.ntitle') ? 'title' : 'body';
  window.aang?.noteMenu?.({ open: true, x: at.x, y: at.y });
  let opened = false;
  const open = () => { if (opened) return; opened = true; menuPending = false; removeEventListener('resize', open); showMenu(at, part); };
  addEventListener('resize', open);
  setTimeout(open, 250);
});
function showMenu(at, part) {
  const m = openMenu(document.body, at, paper, note, 'screen', (what, v) => {
    if (what === 'opacity') window.aang?.noteOpacity?.(v);
    else if (what === 'pin') window.aang?.notePin?.(true);
    else if (what === 'through') window.aang?.noteThrough?.();
    else if (what === 'back') window.aang?.noteBack?.();
    else if (what === 'delete') window.aang?.noteDelete?.();
  }, part);
  // When the menu goes, the window shrinks back to the note.
  const watch = new MutationObserver(() => { if (!document.body.contains(m)) { watch.disconnect(); document.body.classList.remove('menu'); window.aang?.noteMenu?.(false); } });
  watch.observe(document.body, { childList: true });
}
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(document.body); });

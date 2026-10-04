// Step 6.12b: the typing box's behaviour.
//
// Keys, exactly as InputWindow.ProcessCmdKey has them, because his hands already know them:
//   Enter               send (empty Enter does nothing)
//   Shift/Ctrl+Enter    new line
//   Esc                 stop Aang if he is working, otherwise close
//   Up (first line)     previous message, keeping what he was typing as a draft
//   Down (last line)    next message, then the draft back
//   PageUp / PageDown   page the bubble
//   Ctrl+1..4           Auto, Quick, Smart, Deep
//
// FOCUS is not taken here. It is given by the main process on the hotkey press, because Windows only
// lets the program that received the key press take the keyboard (the old box's blank-until-clicked
// bug, 2026-10-04). This page only has to be ready to type into the instant it is shown.
import { History, MODES, modeForKey } from './history.js';

const el = (id) => document.getElementById(id);
const box = el('box'), modeBtn = el('mode'), savingBtn = el('saving'), segs = el('segs');

let history = new History([]);
let mode = 'auto';
let working = false;
const MAX_LINES = 4;            // InputWindow.MaxLinesShown

const LABEL = { auto: 'Auto', quick: 'Quick', smart: 'Smart', deep: 'Deep' };
function paintMode() {
  modeBtn.textContent = LABEL[mode] ?? 'Auto';
  // The mode colours already exist in cockpit.css as .pill.auto/.quick/.smart/.deep.
  modeBtn.className = 'pill sm ' + mode;
}

/**
 * Ten usage segments that FILL with how much of the week he has used.
 *
 * The meaning is InputWindow.PaintUsage's, ported: fine, then orange from 40%, red from 50% - his quota
 * rule - and the brain's own `level` wins when it says saving. The colours are sheet 2's tokens. The
 * C# also draws part of a segment for part of a tenth; the sheet draws whole ones, so whole ones here.
 * @param {number} week 0..1 used  @param {string} [level]
 */
function paintSegs(week, level) {
  const used = Math.max(0, Math.min(1, Number(week) || 0));
  const filled = Math.round(used * 10);
  const tone = level === 'saving' ? 'on' : used >= 0.5 ? 'stop' : used >= 0.4 ? 'warn' : 'on';
  segs.replaceChildren();
  for (let i = 0; i < 10; i++) {
    const s = document.createElement('i');
    if (i < filled) s.className = tone;
    segs.append(s);
  }
  segs.title = `${Math.round(used * 100)}% of this week used`;
}

/** Grow with the text, up to six lines, then scroll - the old box's rule. */
function grow() {
  box.style.height = 'auto';
  const line = parseFloat(getComputedStyle(box).lineHeight) || 22;
  const pad = box.offsetHeight - box.clientHeight + parseFloat(getComputedStyle(box).paddingTop) + parseFloat(getComputedStyle(box).paddingBottom);
  const max = line * MAX_LINES + pad;
  const want = Math.min(box.scrollHeight + (box.offsetHeight - box.clientHeight), max);
  box.style.height = want + 'px';
  box.style.overflowY = box.scrollHeight + (box.offsetHeight - box.clientHeight) > max ? 'auto' : 'hidden';
  reportSize();
}

let lastSize = '';
function reportSize() {
  const r = el('frame').getBoundingClientRect();
  const size = { width: Math.ceil(r.width), height: Math.ceil(r.height) };
  const key = size.width + 'x' + size.height;
  if (key === lastSize) return;
  lastSize = key;
  window.aang?.inputSize?.(size);
}

const onFirstLine = () => !box.value.slice(0, box.selectionStart).includes('\n');
const onLastLine = () => !box.value.slice(box.selectionEnd).includes('\n');

function setText(t) {
  box.value = t;
  box.selectionStart = box.selectionEnd = t.length;
  grow();
}

function send() {
  const text = box.value.trim();
  if (!text) return;                                  // an empty Enter does nothing
  window.aang?.saveHistory?.(history.add(text));
  box.value = '';
  grow();
  window.aang?.submit?.({ text, mode });
  working = true;                                     // Esc now means "stop", until the answer lands
}

box.addEventListener('input', grow);
box.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.shiftKey || e.ctrlKey)) {
    // New line where the caret is. The textarea would do this for Shift, not for Ctrl.
    e.preventDefault();
    const a = box.selectionStart, b = box.selectionEnd;
    box.setRangeText('\n', a, b, 'end');
    grow();
    return;
  }
  if (e.key === 'Enter') { e.preventDefault(); send(); return; }
  if (e.key === 'Escape') {
    e.preventDefault();
    if (working) window.aang?.stop?.();
    else window.aang?.inputClose?.();
    return;
  }
  if (e.key === 'ArrowUp' && onFirstLine()) {
    const p = history.prev(box.value);
    if (p !== null) { e.preventDefault(); setText(p); }
    return;
  }
  if (e.key === 'ArrowDown' && onLastLine() && history.browsing) {
    const n = history.next();
    if (n !== null) { e.preventDefault(); setText(n); }
    return;
  }
  if (e.key === 'PageUp' || e.key === 'PageDown') {
    e.preventDefault();
    window.aang?.pageBubble?.(e.key === 'PageUp' ? -1 : 1);
    return;
  }
  if (e.ctrlKey && /^[1-4]$/.test(e.key)) {
    e.preventDefault();
    mode = modeForKey(e.key) ?? mode;
    paintMode();
    window.aang?.setMode?.(mode);
  }
});

modeBtn.addEventListener('mousedown', (e) => {
  // A click on the pill cycles the mode, like ModelChip, without taking focus from the text.
  e.preventDefault();
  mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
  paintMode();
  window.aang?.setMode?.(mode);
});

// What the main process tells this page.
window.aang?.onInputState?.((s) => {
  if (!s || typeof s !== 'object') return;
  if (Array.isArray(s.history)) history = new History(s.history);
  if (typeof s.mode === 'string' && MODES.includes(s.mode)) mode = s.mode;
  if (typeof s.saving === 'boolean') savingBtn.hidden = !s.saving;
  if (typeof s.week === 'number') paintSegs(s.week);
  paintMode();
  // Opened: the caret at the end of whatever draft is there, ready for the very next key.
  if (s.opened) { box.focus(); box.selectionStart = box.selectionEnd = box.value.length; grow(); }
});
window.aang?.onMessage?.((m) => {
  // A finished reply or a failure ends the turn; streaming parts do not. `claude.working` is about
  // Claude Code jobs, not Aang's own turn, and is deliberately NOT used here.
  if ((m?.t === 'bubble' && m.stream !== true) || m?.t === 'error') working = false;
  if (m?.t === 'quota' && typeof m.week === 'number') paintSegs(m.week, m.level);
});

paintMode();
paintSegs(0);
grow();

// THE CARET LIVES IN THE TEXT FIELD, from the moment the page loads and every time the window comes to
// the front. The main process focuses the WINDOW on the hotkey; that is not the same as focusing the
// field inside it, and the first version of this box did only the first. His keys reached the window
// and went nowhere: the same blank box as the old bug, for a different reason (2026-10-04, seen in a
// recording). Focusing here at load means the field is already the active element when the window is
// shown, so not even the first key waits for a message to arrive.
box.focus();
window.addEventListener('focus', () => box.focus());
document.addEventListener('mousedown', (e) => {
  // A click anywhere in the box's window that is not on a button puts the caret back, so it can never
  // be stranded on the strip.
  if (!e.target.closest('button')) setTimeout(() => box.focus(), 0);
});

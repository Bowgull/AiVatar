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

/**
 * The pace tick, and the thin five-hour bar under the segments.
 *
 * Ported from InputWindow.PaintUsage: "a tick for where the week is (so 44% reads as ahead of or behind
 * pace), and a thin bar under it for the last five hours". Without the tick a percentage says nothing -
 * 44% on a Monday is fast, 44% on a Saturday is slack. The Shell was dropping both numbers until now.
 */
function paintPace(five, weekResetsAt) {
  const wrap = document.getElementById('pace');
  if (!wrap) return;
  // Where the week itself has got to, from the reset time the brain sends.
  const WEEK = 7 * 24 * 3600;
  const left = weekResetsAt > 0 ? weekResetsAt - Date.now() / 1000 : 0;
  const through = weekResetsAt > 0 ? Math.max(0, Math.min(1, 1 - left / WEEK)) : null;
  const tick = document.getElementById('pacetick');
  if (tick) {
    tick.hidden = through === null;
    if (through !== null) tick.style.left = (through * 100).toFixed(1) + '%';
  }
  const bar = document.getElementById('fivebar');
  if (bar) {
    const f = Math.max(0, Math.min(1, Number(five) || 0));
    bar.style.width = (f * 100).toFixed(1) + '%';
    // Same thresholds as the C#: red from 90%, orange from 75%.
    bar.className = 'fivefill' + (f >= 0.9 ? ' stop' : f >= 0.75 ? ' warn' : '');
    bar.parentElement.title = `${Math.round(f * 100)}% of this five-hour window used`;
  }
}

/**
 * What the thing under the mouse actually means, in plain words.
 *
 * Ported from InputWindow.MeaningAt, same sentences. "The strip is three controls with no labels on
 * them and nothing on screen ever said what any of them did... a control you cannot read is a control
 * you do not use." Hovering swaps the bars for the sentence, because they share the strip and words are
 * worth more than bars at the moment you are asking what something is.
 */
const MEANING = {
  auto: 'Auto: I choose', quick: 'Quick: fastest', smart: 'Smart: thinks more', deep: 'Deep: most thorough',
};
function wireHints() {
  const hint = document.getElementById('hint');
  if (!hint) return;
  const say = (text) => {
    hint.textContent = text;
    hint.hidden = !text;
    document.getElementById('strip')?.classList.toggle('hinting', Boolean(text));
  };
  const on = (elem, text) => {
    if (!elem) return;
    elem.addEventListener('mouseenter', () => say(typeof text === 'function' ? text() : text));
    elem.addEventListener('mouseleave', () => say(''));
  };
  on(modeBtn, () => MEANING[mode] ?? MEANING.auto);
  on(savingBtn, () => (savingBtn.classList.contains('on') ? 'Saving: Quick only' : 'Click to use less'));
  on(document.getElementById('usage'), "Week's Claude use");
}
wireHints();

/**
 * An ask waiting on him, shown in the strip so it can be answered without leaving the box.
 *
 * The C# did this with a consent row: "Allow X once?  Enter = yes   Esc = no". Same idea, same keys,
 * widened to every ask the bubble can show, because being made to move to another window to press a
 * key is what made the old permission questions feel like an interruption.
 *
 * The bubble is still the real surface: it shows the whole question, the explaining line and the
 * keycaps. This is the shortcut for when his hands are already here.
 */
let pendingAsk = null;
function shortAsk(a) {
  if (!a) return '';
  if (a.t === 'consent') return `Allow ${a.wanted || 'that'} once?`;
  if (a.t === 'fact.ask') return 'Is that right?';
  if (a.t === 'backup.ask') return 'Back up now?';
  return String(a.question || 'Can I do that?');
}
function paintAsk(a) {
  pendingAsk = a || null;
  const row = document.getElementById('askrow');
  const strip = document.getElementById('strip');
  if (!row || !strip) return;
  row.textContent = '';
  strip.classList.toggle('asking', Boolean(pendingAsk));
  row.hidden = !pendingAsk;
  paintStarters();
  if (!pendingAsk) return;
  const q = document.createElement('b');
  // One line, cut rather than wrapped: the strip is one line tall and a question that reflows it
  // would move the box under his hands mid-sentence.
  q.textContent = shortAsk(pendingAsk);
  const how = document.createElement('span');
  how.className = 'how';
  // A hold-to-confirm ask is deliberately NOT answerable with one key here. Something that cannot be
  // undone has to be held down in the bubble, which is where that lever lives.
  how.textContent = pendingAsk.hold ? 'Answer in the bubble' : 'Enter = yes   Esc = no';
  row.append(q, how);
}
window.aang?.onAsk?.(paintAsk);

/**
 * My brain is not there to take a message. 6.14b: "Every failure says plainly what is wrong in Aang's
 * voice, with a way to retry... Nothing you said is lost."
 *
 * The text goes BACK in the box (the send already cleared it), so nothing typed is lost, and the strip
 * says why in plain words. Enter sends it again: the same message, the same mode, once the brain is back.
 */
const failRow = document.getElementById('failrow');
window.aang?.onFailed?.((f) => {
  if (!f || typeof f.text !== 'string') return;
  setText(f.text);
  if (!failRow) return;
  failRow.textContent = '';
  const m = document.createElement('b');
  // Measured: the strip is 256px and this line must fit beside "Enter to retry". The full sentence
  // cut to "Nothi..." on the first draw. The words that matter are the first two.
  m.textContent = 'Brain is down. Not lost.';
  const how = document.createElement('span');
  how.className = 'how';
  how.textContent = 'Enter to retry';
  failRow.append(m, how);
  failRow.hidden = false;
});

/**
 * Three things to tap when the box is empty.
 *
 * Ported from InputWindow.DrawSuggestions and ShowingSuggestions: three equal chips splitting the row,
 * shown only when the box is EMPTY and nothing else is using that row, and clicking one FILLS the box
 * rather than sending it, with the caret at the end. Quieter than a pin, in the C#'s own words,
 * "because a pin is something he chose, these are only offers".
 */
let starters = [];
function paintStarters() {
  const row = document.getElementById('starters');
  if (!row) return;
  // Never while he is typing, and never on top of a chip row or a question: one row, one job.
  const show = starters.length > 0 && box.value.length === 0 && !pendingAsk
    && !(pinnedRow && pinnedRow.childElementCount);
  row.hidden = !show;
  if (!show) { row.textContent = ''; return; }
  // Rebuilt only when the list actually changed, so it does not flicker on every keystroke.
  const key = starters.map((s) => s.label).join('|');
  if (row.dataset.key === key) return;
  row.dataset.key = key;
  row.textContent = '';
  for (const s of starters) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'starter';
    b.tabIndex = -1;                       // Tab belongs to the text, not to the offers
    b.textContent = s.label;
    b.title = s.text;
    b.addEventListener('click', () => {
      setText(s.text);                     // fills, never sends: his next key can still change it
      box.focus();
      paintStarters();
    });
    row.append(b);
  }
}
box.addEventListener('input', paintStarters);

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
  if (failRow) failRow.hidden = true;
  window.aang?.saveHistory?.(history.add(text));
  box.value = '';
  grow();
  window.aang?.submit?.({ text, mode });
  working = true;                                     // Esc now means "stop", until the answer lands
}

/**
 * The chips above the box: what he is replying to, and what he has pinned as context.
 *
 * The Shell owns the list, not this page, because the box is opened and closed constantly and a pin has
 * to survive that. Sheet 2's `.pinned`, `.pinchip` and `.pinchip.reply` draw them; the only thing added
 * here is the cross that takes one off.
 */
const pinnedRow = document.getElementById('pinned');
function paintChips({ replyTo, pinned } = {}) {
  if (!pinnedRow) return;
  pinnedRow.textContent = '';
  const chip = (kind, label, text, onDrop) => {
    const c = document.createElement('span');
    c.className = kind === 'reply' ? 'pinchip reply' : 'pinchip';
    const b = document.createElement('b'); b.textContent = label;
    const t = document.createElement('span');
    // One line of it, so a long reply does not become a long chip.
    t.textContent = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 38);
    c.title = String(text || '');
    const x = document.createElement('s');
    x.textContent = '×';
    x.setAttribute('role', 'button');
    x.title = 'Take this off';
    x.addEventListener('click', onDrop);
    c.append(b, t, x);
    return c;
  };
  if (replyTo) {
    pinnedRow.append(chip('reply', 'REPLY', replyTo.preview,
      () => window.aang?.dropChip?.({ kind: 'reply' })));
  }
  for (const p of pinned || []) {
    pinnedRow.append(chip('pin', 'CONTEXT', p.preview,
      () => window.aang?.dropChip?.({ kind: 'pin', turn: p.turn })));
  }
  pinnedRow.hidden = !pinnedRow.childElementCount;
  paintStarters();
  reportSize();                       // the row changes how tall the box is
}
window.aang?.onChips?.(paintChips);

box.addEventListener('input', grow);
box.addEventListener('keydown', (e) => {
  // An ask takes the keys first, exactly as InputWindow.ProcessCmdKey does: Enter answers yes ONLY on
  // an empty box, so a half-typed message is never thrown away by a question arriving; Esc says no.
  // A hold-to-confirm ask is never answerable from here.
  if (pendingAsk && !pendingAsk.hold) {
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && box.value.trim().length === 0) {
      e.preventDefault();
      window.aang?.answerFromBox?.({ choice: 'yes' });
      paintAsk(null);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      window.aang?.answerFromBox?.({ choice: 'no' });
      paintAsk(null);
      return;
    }
  }
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
  // Page the BUBBLE, not this box: he types here and reads there. This call was already here and had
  // nothing behind it - `pageBubble` did not exist in the preload, so the key did nothing at all. The
  // door, the relay in main.ts and the bubble's own handler were added 2026-10-05.
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
  if (Array.isArray(s.starters)) { starters = s.starters.filter(x => x && x.label && x.text); paintStarters(); }
  if (typeof s.week === 'number') paintSegs(s.week, s.level);
  if (typeof s.five === 'number' || typeof s.weekResetsAt === 'number') paintPace(s.five, s.weekResetsAt);
  paintMode();
  // Opened: the caret at the end of whatever draft is there, ready for the very next key.
  if (s.opened) { box.focus(); box.selectionStart = box.selectionEnd = box.value.length; grow(); }
});
window.aang?.onMessage?.((m) => {
  // A finished reply or a failure ends the turn; streaming parts do not. `claude.working` is about
  // Claude Code jobs, not Aang's own turn, and is deliberately NOT used here.
  if ((m?.t === 'bubble' && m.stream !== true) || m?.t === 'error') working = false;
  if (m?.t === 'quota' && typeof m.week === 'number') { paintSegs(m.week, m.level); paintPace(m.five, m.weekResetsAt); }
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

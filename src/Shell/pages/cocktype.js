// The one cockpit's typing area (2026-10-21): the typing box, moved into the bubble as its bottom edge.
//
// This is input.js carried over rule for rule, because his hands already know every key:
//   Enter               send (empty Enter does nothing)
//   Shift/Ctrl+Enter    new line
//   Esc                 stop Aang if he is working, otherwise close the cockpit
//   Up (first line)     previous message, keeping what he was typing as a draft
//   Down (last line)    next message, then the draft back
//   PageUp / PageDown   page the conversation
//   Ctrl+1..4           Auto, Quick, Smart, Deep
// What changed: the ids are the cockpit's own (ck...), and the size goes to the bubble (onSize), which sizes the one
// window, instead of to a window of its own. Focus is still given by the main process on the hotkey or click.
import { History, MODES, modeForKey } from './history.js';

const el = (id) => document.getElementById(id);

/** Start the typing area. `onSize` is called whenever it changes height, so the bubble can grow with it. */
export function startTyping({ onSize }) {
  const box = el('ckBox'), modeBtn = el('ckMode'), savingBtn = el('ckSaving'), segs = el('ckSegs');
  let history = new History([]);
  let mode = 'auto';
  let working = false;
  let live = false;                 // the cockpit is open: only then does this area take keys or the caret
  const MAX_LINES = 5;              // sheet 13: one line at rest, one more per line typed, up to 5, then it scrolls

  const LABEL = { auto: 'Auto', quick: 'Quick', smart: 'Smart', deep: 'Deep' };
  function paintMode() { modeBtn.textContent = LABEL[mode] ?? 'Auto'; modeBtn.className = 'pill sm ' + mode; }

  /** Ten week segments: fine, orange from 40%, red from 50% (his quota rule), the brain's `saving` wins. */
  function paintSegs(week, level) {
    const used = Math.max(0, Math.min(1, Number(week) || 0));
    const filled = Math.round(used * 10);
    const tone = level === 'saving' ? 'on' : used >= 0.5 ? 'stop' : used >= 0.4 ? 'warn' : 'on';
    segs.replaceChildren();
    for (let i = 0; i < 10; i++) { const s = document.createElement('i'); if (i < filled) s.className = tone; segs.append(s); }
    segs.title = `${Math.round(used * 100)}% of this week used`;
  }
  /** The pace tick (where the week is) and the thin five-hour bar under the segments. */
  function paintPace(five, weekResetsAt) {
    const WEEK = 7 * 24 * 3600;
    const left = weekResetsAt > 0 ? weekResetsAt - Date.now() / 1000 : 0;
    const through = weekResetsAt > 0 ? Math.max(0, Math.min(1, 1 - left / WEEK)) : null;
    const tick = el('ckPaceTick');
    if (tick) { tick.hidden = through === null; if (through !== null) tick.style.left = (through * 100).toFixed(1) + '%'; }
    const bar = el('ckFiveBar');
    if (bar) {
      const f = Math.max(0, Math.min(1, Number(five) || 0));
      bar.style.width = (f * 100).toFixed(1) + '%';
      bar.className = 'fivefill' + (f >= 0.9 ? ' stop' : f >= 0.75 ? ' warn' : '');
      bar.parentElement.title = `${Math.round(f * 100)}% of this five-hour window used`;
    }
  }
  // Hovering a control swaps the bars for a sentence saying what it is (4.5, ported from the C#).
  const MEANING = { auto: 'Aang picks for you', quick: 'Claude, fast and light', smart: 'Claude, for most jobs', deep: 'Claude, big thinking' };
  {
    const hint = el('ckHint');
    const say = (text) => { hint.textContent = text; hint.hidden = !text; el('ckStrip')?.classList.toggle('hinting', Boolean(text)); };
    const on = (elem, text) => { if (!elem) return; elem.addEventListener('mouseenter', () => say(typeof text === 'function' ? text() : text)); elem.addEventListener('mouseleave', () => say('')); };
    on(modeBtn, () => MEANING[mode] ?? MEANING.auto);
    on(savingBtn, () => (savingBtn.classList.contains('on') ? 'Saving: Quick only' : 'Click to use less'));
    on(el('ckUsage'), "Week's Claude use");
  }

  // An ask waiting on him, answerable right here: Enter = yes on an empty box, Esc = no. Never a hold-to-confirm one.
  let pendingAsk = null;
  const shortAsk = (a) => !a ? '' : a.t === 'consent' ? `Allow ${a.wanted || 'that'} once?` : a.t === 'fact.ask' ? 'Is that right?' : a.t === 'backup.ask' ? 'Back up now?' : String(a.question || 'Can I do that?');
  function paintAsk(a) {
    pendingAsk = a || null;
    const row = el('ckAskRow'), strip = el('ckStrip');
    row.textContent = '';
    strip.classList.toggle('asking', Boolean(pendingAsk));
    row.hidden = !pendingAsk;
    if (!pendingAsk) return;
    const q = document.createElement('b'); q.textContent = shortAsk(pendingAsk);
    const how = document.createElement('span'); how.className = 'how';
    how.textContent = pendingAsk.hold ? 'Answer above' : 'Enter = yes   Esc = no';
    row.append(q, how);
  }
  window.aang?.onAsk?.(paintAsk);

  // The brain could not take it: the words go back in the box, nothing is lost (6.14b).
  const failRow = el('ckFail');
  window.aang?.onFailed?.((f) => {
    if (!f || typeof f.text !== 'string') return;
    setText(f.text);
    failRow.textContent = '';
    const m = document.createElement('b'); m.textContent = f.reason === 'no-answer' ? 'No answer. Not lost.' : 'Brain is down. Not lost.';
    const how = document.createElement('span'); how.className = 'how'; how.textContent = 'Enter to retry';
    failRow.append(m, how);
    failRow.hidden = false;
    onSize();
  });

  // Hug the text: measured on a hidden twin so the field never jiggles while he types (sheet 13).
  const twin = document.createElement('textarea');
  twin.setAttribute('aria-hidden', 'true'); twin.tabIndex = -1; twin.rows = 1; twin.className = 'field twin';
  el('ck').append(twin);
  let lastLines = 0;
  function grow(force) {
    const cs = getComputedStyle(box);
    twin.style.width = box.getBoundingClientRect().width + 'px';
    twin.value = box.value || ' ';
    const line = parseFloat(cs.lineHeight) || 22;
    const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const edge = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    const lines = Math.max(1, Math.round((twin.scrollHeight - pad) / line));
    if (lines === lastLines && force !== true) return;
    lastLines = lines;
    box.style.height = (Math.min(MAX_LINES, lines) * line + pad + edge) + 'px';
    box.style.overflowY = lines > MAX_LINES ? 'auto' : 'hidden';
    setTimeout(onSize, 150);          // once the 140 ms height ease has landed
  }
  const onFirstLine = () => !box.value.slice(0, box.selectionStart).includes('\n');
  const onLastLine = () => !box.value.slice(box.selectionEnd).includes('\n');
  function setText(t) { box.value = t; box.selectionStart = box.selectionEnd = t.length; grow(); }

  function send() {
    const text = box.value.trim();
    if (!text) return;
    failRow.hidden = true;
    window.aang?.saveHistory?.(history.add(text));
    box.value = '';
    grow();
    window.aang?.submit?.({ text, mode });
    working = true;                   // Esc now means "stop", until the answer lands
  }

  // The chips above the field: what he is replying to, his pinned context, files, highlights, mockups, snips.
  const pinnedRow = el('ckPinned');
  function paintChips({ replyTo, pinned, snips, highlights, files, mockups } = {}) {
    pinnedRow.textContent = '';
    const chip = (kind, label, text, onDrop) => {
      const c = document.createElement('span');
      c.className = kind === 'reply' ? 'pinchip reply' : 'pinchip';
      const b = document.createElement('b'); b.textContent = label;
      const t = document.createElement('span'); t.textContent = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 38);
      c.title = String(text || '');
      const x = document.createElement('s'); x.textContent = '×'; x.setAttribute('role', 'button'); x.title = 'Take this off';
      x.addEventListener('click', onDrop);
      c.append(b, t, x);
      return c;
    };
    if (replyTo) pinnedRow.append(chip('reply', 'REPLY', replyTo.preview, () => window.aang?.dropChip?.({ kind: 'reply' })));
    for (const p of pinned || []) pinnedRow.append(chip('pin', 'CONTEXT', p.preview, () => window.aang?.dropChip?.({ kind: 'pin', turn: p.turn })));
    for (const f of files || []) { const c = chip('file', 'FILE', f.name, () => window.aang?.dropChip?.({ kind: 'file', name: f.name })); c.classList.add('snip'); pinnedRow.append(c); }
    for (const h of highlights || []) { const c = chip('highlight', 'HIGHLIGHT', h.preview, () => window.aang?.dropChip?.({ kind: 'highlight', i: h.i })); c.classList.add('snip'); pinnedRow.append(c); }
    for (const m of mockups || []) {
      const c = chip('mockup', String(m.label || 'MOCKUP').slice(0, 12), m.title, () => window.aang?.dropChip?.({ kind: 'mockup', i: m.i }));
      c.classList.add('snip');
      if (typeof m.thumb === 'string' && m.thumb.startsWith('data:image/png;base64,')) {
        const img = Object.assign(document.createElement('img'), { src: m.thumb, alt: '' });
        img.style.cssText = 'height:16px;width:auto;border-radius:3px;vertical-align:middle;margin-right:4px';
        c.prepend(img);
      }
      pinnedRow.append(c);
    }
    for (const s of snips || []) { const c = chip('snip', 'SNIP', s.name, () => window.aang?.dropChip?.({ kind: 'snip', name: s.name })); c.classList.add('snip'); pinnedRow.append(c); }
    pinnedRow.hidden = !pinnedRow.childElementCount;
    onSize();
  }
  window.aang?.onChips?.(paintChips);

  box.addEventListener('input', () => grow());
  box.addEventListener('keydown', (e) => {
    if (!live) return;
    if (pendingAsk && !pendingAsk.hold) {
      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && box.value.trim().length === 0) { e.preventDefault(); window.aang?.answerFromBox?.({ choice: 'yes' }); paintAsk(null); return; }
      if (e.key === 'Escape') { e.preventDefault(); window.aang?.answerFromBox?.({ choice: 'no' }); paintAsk(null); return; }
    }
    if (e.key === 'Enter' && (e.shiftKey || e.ctrlKey)) { e.preventDefault(); box.setRangeText('\n', box.selectionStart, box.selectionEnd, 'end'); grow(); return; }
    if (e.key === 'Enter') { e.preventDefault(); send(); return; }
    if (e.key === 'Escape') { e.preventDefault(); if (working) window.aang?.stop?.(); else window.aang?.inputClose?.(); return; }
    if (e.key === 'ArrowUp' && onFirstLine()) { const p = history.prev(box.value); if (p !== null) { e.preventDefault(); setText(p); } return; }
    if (e.key === 'ArrowDown' && onLastLine() && history.browsing) { const n = history.next(); if (n !== null) { e.preventDefault(); setText(n); } return; }
    if (e.key === 'PageUp' || e.key === 'PageDown') { e.preventDefault(); window.dispatchEvent(new CustomEvent('cockpit:page', { detail: e.key === 'PageUp' ? -1 : 1 })); return; }
    if (e.ctrlKey && /^[1-4]$/.test(e.key)) { e.preventDefault(); mode = modeForKey(e.key) ?? mode; paintMode(); window.aang?.setMode?.(mode); }
  });
  modeBtn.addEventListener('mousedown', (e) => { e.preventDefault(); mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length]; paintMode(); window.aang?.setMode?.(mode); });

  window.aang?.onInputState?.((s) => {
    if (!s || typeof s !== 'object') return;
    if (Array.isArray(s.history)) history = new History(s.history);
    if (typeof s.mode === 'string' && MODES.includes(s.mode)) mode = s.mode;
    if (typeof s.saving === 'boolean') savingBtn.hidden = !s.saving;
    if (typeof s.week === 'number') paintSegs(s.week, s.level);
    if (typeof s.five === 'number' || typeof s.weekResetsAt === 'number') paintPace(s.five, s.weekResetsAt);
    paintMode();
    if (s.opened) focus();
  });
  window.aang?.onMessage?.((m) => {
    if ((m?.t === 'bubble' && m.stream !== true) || m?.t === 'error' || m?.t === 'bubble.clear' || (m?.t === 'state' && m.state === 'idle')) working = false;
    if (m?.t === 'state' && m.state === 'think') working = true;
    if (m?.t === 'quota' && typeof m.week === 'number') { paintSegs(m.week, m.level); paintPace(m.five, m.weekResetsAt); }
  });

  // The caret lives in the field while the cockpit is open; a click anywhere in the typing area that is not a button
  // puts it back (input.js's rule), never a click up in the conversation, where he is reading or picking a row.
  function focus() { box.focus(); box.selectionStart = box.selectionEnd = box.value.length; grow(true); }
  el('ck').addEventListener('mousedown', (e) => { if (live && !e.target.closest('button, s')) setTimeout(() => box.focus(), 0); });
  window.addEventListener('focus', () => { if (live) box.focus(); });

  paintMode();
  paintSegs(0);
  return {
    /** The cockpit opened (true) or closed (false). */
    setLive(on) { live = on; if (on) focus(); else box.blur(); },
    focus,
  };
}

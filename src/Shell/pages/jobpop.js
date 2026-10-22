// Sheet 52 (2026-10-21, docs/cockpit/sheet-52-job-popout.html): one Claude job popped out of Aang's bubble.
//
// The card is the mockup's, built the same way (sheet-52/pop.js card()), but every number on it comes from the shared
// live progress engine in claudejobs.js (liveProgress, livePill, liveText, leftOf, describeNow, readJob), imported and
// not copied, so this bar creeps, steps and never goes back exactly like the bubble's and Samara's rune panel's.
// Every word here is Claude's or a session's, so everything is built with textContent, never markup from the wire.
//
// His picks on 52: folded by default, a click unfolds (520 ms soft spring) and folds (340 ms); B, a slider by the pin while
// the mouse is on it, floor 30%; E, the fade stays with the mouse over it; the pin is the only chrome and looks pressed
// in and lit when pinned; JOB COMPLETE is teal with "Nice", which shrinks it away; "needs you" is a small blue chip.
// The window decides nothing: the main process (jobpop.ts) knows which job this is and builds every request.
import { animate, anims, SEA, SLATE, MSG, CL, readJob, curIndex, h, btn, liveProgress, livePill, liveText, leftOf, describeNow, kick, liveOverall, liveRows, rowsKey, liveAgents } from './claudejobs.js';
import { paintPinKey } from './pinkey.js';

const api = window.jobpop;
const pw = document.getElementById('pw');
/** jobpop.ts CARD_Y and the room under the card for its shadow: the window is this much taller than the card. */
const ROOM_TOP = 36, ROOM_BOTTOM = 42;
const MIN_OP = 0.3;
const rgb = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16));
const mix = (x, t, k) => `rgb(${rgb(x).map((v, i) => Math.round(v + (t[i] - v) * k)).join(',')})`;

/* ---- pixel art, verbatim from sheet 52 (the slider; the pin is now the family's pin key, pinkey.js) and the pet's job-done tick (src/Body/ClaudeMarks.cs) ---- */
/** A vertical groove with a plum gem knob; top = solid, bottom = 30%. knobY is where the knob's middle is, in CSS px. */
function vslider(op, px = 2) {
  const W = 8, H = 42, cv = Object.assign(document.createElement('canvas'), { width: W * px, height: H * px });
  const g = cv.getContext('2d'), P = (x, y, c) => { g.fillStyle = c; g.fillRect(x * px, y * px, px, px); };
  const f = (op - MIN_OP) / (1 - MIN_OP), ky = Math.round(2 + (1 - f) * 34);
  for (let y = 1; y < H - 1; y++) { P(3, y, '#0d0703'); P(4, y, '#0d0703'); P(2, y, '#6a4628'); P(5, y, '#3a2414'); }
  for (let y = ky + 2; y < H - 2; y++) { P(3, y, '#e9d3a6'); P(4, y, '#c9ad78'); }
  const K = ['.OOOOOO.', 'OHHHFFSO', 'OHFFFFSO', 'OFFFFSSO', '.OOOOOO.'];
  K.forEach((r, y) => [...r].forEach((c, x) => { const k = { O: '#120a05', H: '#d9c2ff', F: '#8a5cc4', S: '#4A2C6E' }[c]; if (k) P(x, ky + y, k); }));
  cv.style.width = cv.width + 'px'; cv.style.height = cv.height + 'px';
  return cv;
}
/** The slider's inverse: a pointer at `y` CSS px from the top of .vs gives this fade (the knob's middle follows it). */
const opAt = (y) => { const ky = Math.max(2, Math.min(36, Math.round((y - 6) / 2 - 2))); return Math.round((MIN_OP + (1 - MIN_OP) * (1 - (ky - 2) / 34)) * 100) / 100; };
const DONE_MAP = ['..........OOO', '.........OHHO', '........OHHFO', '.......OHHFSO', '.OOO..OHHFSO.', 'OHHHOOHHFSO..', 'OFHHHHHFSO...', '.OFFHHFSO....', '..OFFFSO.....', '...OSSO......', '....OO.......'];
function doneTick(col, px = 3) {
  const w = DONE_MAP[0].length, ht = DONE_MAP.length;
  const cv = Object.assign(document.createElement('canvas'), { width: (w + 1) * px, height: (ht + 1) * px });
  const g = cv.getContext('2d');
  const fill = { O: '#2a1a10', H: mix(col, [255, 255, 255], 0.55), F: col, S: mix(col, [40, 20, 10], 0.35) };
  g.fillStyle = 'rgba(0,0,0,.4)';
  DONE_MAP.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '.') g.fillRect((x + 1) * px, (y + 1) * px, px, px); }));
  DONE_MAP.forEach((r, y) => [...r].forEach((ch, x) => { if (fill[ch]) { g.fillStyle = fill[ch]; g.fillRect(x * px, y * px, px, px); } }));
  return cv;
}

/* ---- what this window knows ---- */
let job = null, waits = [], pinned = false, opacity = 1, done = null;
let open = false, sig = '';
const latest = () => job;
let pj = null, vs = null, ro = null;

/** "about 38 min left" reads "38 min" on the folded bar (sheet 52); anything else as the engine says it. */
const shortLeft = (s) => String(s).replace(/^about /, '').replace(/ left$/, '');
function took(ms) {
  if (!Number.isFinite(ms)) return '';
  const m = Math.max(1, Math.round(ms / 60000));
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
}

/** How far into task `k` the shared engine's bar stands, e.g. "48%" (never 100: a task is done only when Claude ticks it). */
function nowPct(k, now) {
  const j = latest(), total = j?.progress?.total ?? j?.tasks.length ?? 0;
  const m = j ? liveProgress(j, now) : null;
  if (!m || m.p === null || !total) return 'NOW';
  return Math.round(Math.max(0, Math.min(0.99, m.p * total - k)) * 100) + '%';
}

/* ---- the card ---- */
function card() {
  const j = job, needs = waits.length > 0, paused = j.phase === 'paused';
  const st = done ? 'done' : needs ? 'needs' : paused ? 'paused' : 'work';
  const c = h('div', 'pj' + (st === 'done' ? ' done' : st === 'paused' ? ' paused' : '') + (open && !done ? ' open' : ''));
  c.dataset.state = st;
  const pinB = btn('pin' + (pinned ? ' on' : ''), undefined, pinned ? 'Pinned: stays on top (click to unpin)' : 'Pin: stays on top');
  paintPinKey(pinB, pinned);   // the family's pin key (cleanup 2026-10-22)
  pinB.addEventListener('click', (e) => { e.stopPropagation(); api?.pin(); });
  const top = h('div', 'top');
  if (st === 'done') {
    const big = h('div', 'big'), tk = h('span', 'tk'), words = h('span');
    tk.append(doneTick('#3fc4b4', 3));
    const n = j.tasks.length;
    const bits = [j.project, n ? `all ${n} task${n > 1 ? 's' : ''}` : 'done', took(done.tookMs)].filter(Boolean);
    words.append(h('b', '', 'JOB COMPLETE'), h('small', '', bits.join(' · ')));
    big.append(tk, words);
    top.append(big, pinB);
    const keys = h('div', 'ckeys'), nice = btn('key primary sm nice', 'Nice');
    nice.addEventListener('click', (e) => { e.stopPropagation(); goNice(); });
    keys.append(nice);
    c.append(top, keys);
    // 2026-10-21 (his ask): the finished card is a door to its session in Claude (Nice and the pin keep their own clicks).
    c.title = 'Open in Claude';
    c.addEventListener('click', (e) => { if (e.target.closest('button')) return; e.stopPropagation(); api?.act('open'); });
    return c;
  }
  const img = document.createElement('img'); img.className = 'ci'; img.src = CL; img.alt = '';
  const pbw = h('span', 'pbw');
  pbw.append(livePill(st === 'work' ? 60 : st === 'needs' ? 40 : 46, 9, 2, latest, paused ? SLATE : SEA, !paused));
  const pct = liveText(h('span', 'pct'), (now) => { const p = liveProgress(latest(), now).percent; return p === null ? '' : p + '%'; });
  top.append(img, h('b', 'pr', j.project), pbw, pct);
  if (st === 'needs') {
    const chip = btn('chip needs', 'NEEDS YOU', 'Claude needs you: Aang will show you the question');
    chip.addEventListener('click', (e) => { e.stopPropagation(); api?.act('ask'); });
    top.append(chip);
  } else if (st === 'paused') top.append(h('span', 'chip paused', 'PAUSED'));
  else top.append(liveText(h('span', 'lt'), (now) => shortLeft(leftOf(latest(), now))));
  top.append(pinB);
  // v3: with a phase plan, OVERALL under the folded bar, always in view (the bar above is CURRENT).
  const ovr = liveOverall(latest, 60);
  // Unfolded (sheet 52 section 2): what it is doing now and on which computer, its helper agents, the to-do list, keys.
  const det = h('div', 'det'), inner = h('div', 'inner');
  const nowl = h('div', 'nowl');
  nowl.append(h('span', 'mc', j.machine), liveText(h('span', 'an'), (now) => describeNow(latest(), now).line));
  inner.append(nowl);
  // v3: the command's sub-bar, the helper agents and the CI runs, a row each (the same rows as the bubble and the rune).
  const rows = liveRows(latest, 60);
  if (rows) inner.append(rows);
  const list = h('div', 'list'), cur = curIndex(j);
  j.tasks.forEach((t, k) => {
    const isDone = t.status === 'completed', isNow = !isDone && k === cur;
    const ob = h('div', 'ob' + (isDone ? ' done' : isNow ? ' now' : ''));
    // The task in hand shows how far into it the bar has crept (sheet 52: "48%"), live; NOW when there is no pace yet.
    const r = isNow ? liveText(h('span', 'r'), (now) => nowPct(k, now)) : h('span', 'r', isDone ? 'done' : '');
    ob.append(h('i'), h('span', 'tx', isNow && t.active ? t.active : t.text), r);
    list.append(ob);
  });
  if (!j.tasks.length) list.append(h('div', 'ob none', 'Claude keeps no to-do list for this one, so there is no percent.'));
  inner.append(list);
  const keys = h('div', 'ckeys');
  const pp = btn('key sm pp', paused ? 'Play' : 'Pause');
  pp.addEventListener('click', (e) => { e.stopPropagation(); api?.act(paused ? 'play' : 'pause'); });
  keys.append(pp);
  // 2026-10-21 (his rule: never do nothing): always there. A session with no app link (a terminal one) brings the Claude
  // app forward instead (jobpop.ts works out which). The pop-out itself stays where he put it.
  {
    const op = btn('key sm primary oc', 'Open in Claude');
    op.addEventListener('click', (e) => { e.stopPropagation(); api?.act('open'); });
    keys.append(op);
  }
  const msg = btn('msg', undefined, 'Message this session'); msg.innerHTML = MSG;   // a fixed drawing, no wire data in it
  msg.addEventListener('click', (e) => { e.stopPropagation(); api?.act('message'); });
  keys.append(msg);
  inner.append(keys);
  det.append(inner);
  // Sheet 58 C (his pick, 2026-10-21): its helper agents, a small row each, tucked under the folded bar, always in view.
  const ags = liveAgents(latest);
  c.append(top, ...(ags ? [ags] : []), ...(ovr ? [ovr] : []), det);
  return c;
}

/** What changes the card's layout; the %, the bar and the live lines update in place every frame instead. */
function signature() {
  const j = job;
  return JSON.stringify([j.id, j.project, j.machine, j.phase, j.open ? 1 : 0, j.tasks.map((t) => t.status + t.text + t.active),
    rowsKey(j), waits.length > 0, done ? 1 : 0]);
}

function render() {
  anims.clear();            // the old canvases and lines stop with the old card
  pj = card();
  pj.style.setProperty('--op', String(opacity));
  ro = h('span', 'ro', Math.round(opacity * 100) + '%');
  vs = h('div', 'vs' + (hot && !done ? ' on' : '')); vs.append(vslider(opacity));
  wireCard(); wireSlider();
  pw.replaceChildren(pj, ro, vs);
  animate(true);
  report();
}

/* ---- the window's height follows the card (the spring's overshoot is allowed for while it plays) ---- */
let hold = 0, sizeQueued = false;
function report() {
  if (sizeQueued) return;
  sizeQueued = true;
  requestAnimationFrame(() => {
    sizeQueued = false;
    if (!pj) return;
    api?.size(Math.ceil(Math.max(ROOM_TOP + pj.offsetHeight + ROOM_BOTTOM, hold)));
  });
}
new ResizeObserver(() => report()).observe(pw);

/* ---- unfold / fold, the mockup's motion: ~520 ms with a 4% overshoot that settles, ~340 ms back with no bounce ---- */
function setOpen(on) {
  if (!pj || done) return;
  open = on;
  const det = pj.querySelector('.det'), inner = det.firstElementChild;
  const ht = inner.offsetHeight;
  const instant = matchMedia('(prefers-reduced-motion: reduce)').matches;
  pj.classList.toggle('open', on);
  if (on) {
    hold = ROOM_TOP + pj.offsetHeight + Math.ceil(ht * 1.05) + ROOM_BOTTOM;
    api?.size(hold);
    det.style.height = ht + 'px';
    if (!instant) {
      det.animate([{ height: '0px' }, { height: ht * 1.045 + 'px', offset: 0.6 }, { height: ht * 0.992 + 'px', offset: 0.84 }, { height: ht + 'px' }], { duration: 520, easing: 'cubic-bezier(.3,.7,.35,1)' });
      inner.animate([{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 300, easing: 'ease-out' });
    }
    setTimeout(() => { if (open) det.style.height = ''; hold = 0; report(); }, instant ? 0 : 540);
  } else {
    hold = ROOM_TOP + pj.offsetHeight + ROOM_BOTTOM;
    det.style.height = '0px';
    if (!instant) det.animate([{ height: ht + 'px' }, { height: '0px' }], { duration: 340, easing: 'cubic-bezier(.32,.72,0,1)' });
    setTimeout(() => { if (!open) det.style.height = ''; hold = 0; report(); }, instant ? 0 : 360);
  }
}

/* ---- the mouse: the window takes it only over the card and its slider; elsewhere it goes to whatever is behind ---- */
let hot = false, dragging = false, sliding = false, hideTimer = 0, roTimer = 0;
const showSlider = (on) => {
  clearTimeout(hideTimer);
  if (!vs) return;
  if (on) vs.classList.add('on');
  else hideTimer = setTimeout(() => { if (!hot && !sliding) vs.classList.remove('on'); }, 500);
};
function setHot(on) {
  if (on === hot) return;
  hot = on;
  api?.clickable(on || dragging || sliding);
  // B (his pick): the slider shows while the mouse is on the job; E: the card keeps its fade, it never goes solid here.
  if (!done) showSlider(on); else showSlider(false);
}
const isHot = (x, y) => { const e = document.elementFromPoint(x, y); return !!e && !!pj && (pj.contains(e) || (vs?.classList.contains('on') && vs.contains(e))); };
document.addEventListener('mousemove', (e) => setHot(isHot(e.clientX, e.clientY)));
document.addEventListener('mouseleave', () => setHot(false));

/** Grab it anywhere to move it; a press that does not move is a click, which folds or unfolds it. */
function wireCard() {
  pj.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('button')) return;
    const sx = e.screenX, sy = e.screenY;
    let moved = false;
    try { pj.setPointerCapture(e.pointerId); } catch { /* a pointer the page did not see go down */ }
    pj.onpointermove = (ev) => {
      const dx = ev.screenX - sx, dy = ev.screenY - sy;
      if (!moved && Math.hypot(dx, dy) > 4) { moved = true; dragging = true; api?.drag({ phase: 'start' }); }
      if (moved) api?.drag({ phase: 'move', dx, dy });
    };
    pj.onpointerup = () => {
      pj.onpointermove = null; pj.onpointerup = null;
      if (moved) { dragging = false; api?.drag({ phase: 'end' }); api?.clickable(hot); }
      else setOpen(!open);
    };
  });
}

/** The see-through slider: drag the knob (or roll the wheel on it); the number shows above while it changes. */
function setOpacity(op, say = true) {
  opacity = Math.max(MIN_OP, Math.min(1, op));
  if (pj) pj.style.setProperty('--op', String(opacity));
  if (vs) vs.replaceChildren(vslider(opacity));
  if (ro && say) {
    ro.textContent = Math.round(opacity * 100) + '%'; ro.classList.add('on');
    clearTimeout(roTimer); roTimer = setTimeout(() => ro?.classList.remove('on'), 900);
  }
}
function wireSlider() {
  vs.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    sliding = true;
    try { vs.setPointerCapture(e.pointerId); } catch { /* as above */ }
    const top = () => vs.getBoundingClientRect().top;
    setOpacity(opAt(e.clientY - top()));
    vs.onpointermove = (ev) => setOpacity(opAt(ev.clientY - top()));
    vs.onpointerup = () => {
      vs.onpointermove = null; vs.onpointerup = null; sliding = false;
      api?.opacity(opacity); api?.clickable(hot); if (!hot) showSlider(false);
    };
  });
  vs.addEventListener('wheel', (e) => { e.preventDefault(); setOpacity(opacity + (e.deltaY > 0 ? -0.05 : 0.05)); api?.opacity(opacity); }, { passive: false });
}

/* ---- Nice: it shrinks and fades away (sheet 52 section 5), then the window goes ---- */
let nicing = false;
function goNice() {
  if (nicing) return;
  nicing = true;
  const instant = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!instant) pw.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.86)' }], { duration: 340, easing: 'cubic-bezier(.32,.72,0,1)', fill: 'forwards' });
  setTimeout(() => api?.nice(), instant ? 0 : 340);
}

/* ---- the main process ---- */
api?.onData((d) => {
  if (!d || typeof d !== 'object') return;
  const j = readJob(d.job);
  if (j) job = j;
  if (!job) return;
  waits = (Array.isArray(d.waits) ? d.waits : []).filter((w) => w && typeof w.id === 'string').slice(0, 10);
  done = d.done && typeof d.done === 'object' ? { tookMs: Number.isFinite(d.done.tookMs) ? d.done.tookMs : null } : null;
  if (done) open = false;
  const newPin = d.pinned === true;
  // The fade he set is remembered by the main process for this run (put back and pulled out again, it keeps it).
  if (Number.isFinite(d.opacity) && !sliding) opacity = Math.max(MIN_OP, Math.min(1, Number(d.opacity)));
  const s = signature();
  if (s !== sig) { sig = s; pinned = newPin; render(); return; }
  // Same layout: the bar, the % and the live line move now, not at the next breath (2026-10-21).
  kick();
  if (newPin !== pinned) {
    // Only the pin changed: swap its look in place (pressed in and lit, or flat), no redraw of the card.
    pinned = newPin;
    const b = pj?.querySelector('.pin');
    if (b) paintPinKey(b, pinned);
  }
});
api?.onLeave(() => { pw.classList.add('leaving'); });
api?.ready();

// C7 Claude's rune in Samara's band (2026-10-21, docs/COCKPIT-BUILD.md; sheet 50 section 2).
//
// His picks: B, a small rune stone with Claude's sunburst carved in and a thin pixel ring round it that FILLS with the
// job's progress (like a cooldown in WoW); Q, two jobs at once = ONE rune with a small gold number. Clicking it drops a
// rounded panel (soft edges, his rule) that lists the jobs folded; each unfolds on its own into the cockpit's job card
// (project, what it is on, %, time left, the soft pill with a notch per task, the tasks, Pause, Open in Claude, the
// purple message key). Working is amber, needs you is blue (a little quicker), a finished job is teal with a tick for a
// few seconds, then goes by itself: "Nice" belongs only to a popped-out job (his call, 2026-10-21). The rune is there
// ONLY while a job runs, waits on him, or has just finished.
//
// The brain's claude.jobs / claude.wait arrive through the Shell (browser.ts claudeNews); no brain, no rune. What this
// page sends back is pause / play / a message / open, which the Shell checks again (claudewire.ts). Every word here is
// Claude's or a session's, so everything is built with textContent, never markup from the wire.
import { animate, anims, SEA, SLATE, MSG, CL, readJob, curIndex, leftOf, onOf, h, btn, liveProgress, livePill, liveText, describeNow, runeHeadLine, openTarget, liveOverall, liveRows } from './claudejobs.js';

// His final colours (sheets 49/50, the same as the marks over Aang's head, src/Body/ClaudeMarks.cs).
/** How long a finished job stays teal on the rune before it goes (the cockpit's strip uses the same ~4 s). */
const DONE_MS = 4000;
// v3 (2026-10-21): a stall is a dimmed, darker amber (working is already his amber here) and the ring stops creeping;
// a turn that ended in an error is red.
const COL = { working: '#f0a64a', needs: '#7cc4ff', complete: '#3fc4b4', paused: '#6f7787', stalled: '#a8692e', failed: '#d0503f' };
const rgb = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16));
const mix = (x, t, k) => `rgb(${rgb(x).map((v, i) => Math.round(v + (t[i] - v) * k)).join(',')})`;

/* ---- the rune, the ring and the job-done tick (first drawn in docs/cockpit/sheet-50/marks.js) ---- */
// His ask (2026-10-21): the rune should look like the Claude logo, "the taskbar icon isn't a bad place to start". So the
// stone is the app icon's cream (a lit top-left edge and a shaded bottom-right, so it is still a RuneScape-ish rune
// stone, but a clean face: specks made the mark noisy) and the glyph is Claude's own terracotta starburst
// (pages/art/claude-icon.png). The glyph does not take the job's colour: the ring carries the state (amber, blue, teal,
// slate), so the mark always reads as Claude. A finished job turns it into a teal tick; a paused one greys it.
// Back to sheet 50 take B's size (2026-10-21, his words: "the previous one was the PERFECT size", the 17-pixel one was
// "so huge"): a 12 x 12 art-pixel stone, 2 screen px each, 36 px across with its ring. At this size the starburst is 8
// one-pixel rays round a 3-pixel centre, a little uneven in length and angle like the real mark, every ray joined to
// the centre so there are no loose specks; it was picked by eye against the app icon scaled to the same size.
const STONE = [
  '...OOOOOO...',
  '..OHHHHHLO..',
  '.OHHLLLLLSO.',
  'OHLLLLLLLLSO',
  'OHLLLLLLLLSO',
  'OHLLLLLLLLSO',
  'OLLLLLLLLLSO',
  'OLLLLLLLLSSO',
  'OLLLLLLLLSSO',
  '.OSLLLLLSSO.',
  '..OSSSSSSO..',
  '...OOOOOO...'];
const GLYPH = [
  '...G...',
  'G..G.G.',
  '.G.GG..',
  '..GGGGG',
  'GGGG...',
  '..G.GG.',
  '.G..G.G'];
// The finished tick, two pixels thick where it can be so it reads as clearly as the starburst; E is its darker underside.
const TICK = [
  '......G',
  '.....GG',
  'G...GGE',
  'GG.GGE.',
  'EGGGE..',
  '.EGE...',
  '..E....'];
const STONE_COL = { O: '#2a1a10', H: '#fbf3e4', L: '#f0e3c8', S: '#cdb48c' };
/** Claude's terracotta, read off the real app icon (pages/art/claude-icon.png). */
const CLAUDE = '#d97757';
function rune(col, px = 2, glyph = 'sun', paused = false) {
  const n = 12, cv = Object.assign(document.createElement('canvas'), { width: (n + 1) * px, height: (n + 1) * px, className: 'rn' });
  const g = cv.getContext('2d'), P = (x, y, c) => { g.fillStyle = c; g.fillRect(x * px, y * px, px, px); };
  g.fillStyle = 'rgba(0,0,0,.4)';
  STONE.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '.') g.fillRect((x + 1) * px, (y + 1) * px, px, px); }));
  STONE.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '.') P(x, y, STONE_COL[ch]); }));
  const G = glyph === 'tick' ? TICK : GLYPH;
  const fill = glyph === 'tick' ? { G: col, E: mix(col, [20, 40, 40], 0.45) } : { G: paused ? mix(CLAUDE, rgb(COL.paused), 0.65) : CLAUDE };
  // The 7 x 7 glyph sits two art pixels in, a hair up-left of centre, where the stone's face is lit (sheet 50's place).
  G.forEach((r, y) => [...r].forEach((ch, x) => { if (fill[ch]) P(x + 2, y + 2, fill[ch]); }));
  return cv;
}
// The thin pixel ring for take B: whole art pixels on a circle round the stone, lit up to the job's progress.
// `into` redraws an existing ring in place (2026-10-21: the ring follows the live progress engine, and a new canvas
// would restart its slow breathing every step).
function ring(col, p, px = 2, into = null) {
  const n = 18, c = (n - 1) / 2, R = 8.2;     // sheet 50 take B's ring, verbatim (2026-10-21: back to its size)
  const cv = into ?? Object.assign(document.createElement('canvas'), { width: n * px, height: n * px, className: 'rg' });
  const g = cv.getContext('2d');
  g.clearRect(0, 0, cv.width, cv.height);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const d = Math.hypot(x - c, y - c); if (Math.abs(d - R) > 0.62) continue;
    let a = Math.atan2(x - c, -(y - c)) / (2 * Math.PI); if (a < 0) a += 1;
    g.fillStyle = a <= p ? col : 'rgba(18,10,5,.75)';
    g.fillRect(x * px, y * px, px, px);
  }
  return cv;
}
// The job-complete tick over Aang's head (no circle), drawn the way the pet draws it.
const DONE_MAP = ['..........OOO', '.........OHHO', '........OHHFO', '.......OHHFSO', '.OOO..OHHFSO.', 'OHHHOOHHFSO..', 'OFHHHHHFSO...', '.OFFHHFSO....', '..OFFFSO.....', '...OSSO......', '....OO.......'];
function doneTick(col, px = 3) {
  const w = DONE_MAP[0].length, ht = DONE_MAP.length;
  const cv = Object.assign(document.createElement('canvas'), { width: (w + 1) * px, height: (ht + 1) * px, className: 'mk' });
  const g = cv.getContext('2d');
  const fill = { O: '#2a1a10', H: mix(col, [255, 255, 255], 0.55), F: col, S: mix(col, [40, 20, 10], 0.35) };
  g.fillStyle = 'rgba(0,0,0,.4)';
  DONE_MAP.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '.') g.fillRect((x + 1) * px, (y + 1) * px, px, px); }));
  DONE_MAP.forEach((r, y) => [...r].forEach((ch, x) => { if (fill[ch]) { g.fillStyle = fill[ch]; g.fillRect(x * px, y * px, px, px); } }));
  return cv;
}

/** The rune button for one state. p is the progress 0..1 the ring is lit to; pip the small gold number. */
function chip(state, p, pip, on) {
  const col = COL[state];
  const el = document.createElement('button'); el.type = 'button';
  el.className = `rune tB st-${state}` + (on ? ' on' : '');
  el.style.setProperty('--c', col); el.style.setProperty('--u', '2px');
  el.dataset.state = state; el.dataset.p = String(Math.round(p * 100));
  el.title = state === 'needs' ? 'Claude needs you: click for the details' : state === 'complete' ? 'Claude finished a job: click for the details' : state === 'paused' ? 'A Claude job is paused: click for the details'
    : state === 'stalled' ? 'No sign of life from a Claude job: click for the details' : state === 'failed' ? 'A Claude job stopped on an error: click for the details' : 'Claude is working: click for the details';
  el.setAttribute('aria-label', el.title); el.setAttribute('aria-haspopup', 'dialog'); el.setAttribute('aria-expanded', on ? 'true' : 'false');
  const st = h('span', 'stone');
  st.append(ring(col, p, 2), rune(col, 2, state === 'complete' ? 'tick' : 'sun', state === 'paused'));
  if (pip) st.append(h('i', 'pip', pip));
  el.append(st);
  return el;
}

const WAIT_WORD = { permission: 'wants your OK to go on', question: 'has a question for you', plan: 'has a plan ready for you' };

/**
 * Start the rune. Two halves of one thing (2026-10-21, his report: opening it "bugs out the browser completely,
 * especially when I'm watching a video"; it used to freeze the page into a still picture while the panel was open,
 * which stalled a playing video):
 *   - in the band (`slot`, `band`): only the rune. A click asks the Shell to open the panel (`browserRune`), and the
 *     Shell says when it is open, so the gold number fades the same as before. `closeOthers` shuts the band's trays.
 *   - in its own see-through layer ABOVE the live page (`layer: true`, runelayer.html, browser.ts runeView): only the
 *     panel. The page under it is never hidden, frozen or pictured, so a video keeps playing with sound and picture.
 */
export function startRune({ slot, band, closeOthers, layer = false }) {
  const aang = window.aang;
  if (!band || !aang?.onBrowserClaude || (!layer && !slot)) return null;
  let jobs = [], waits = [];
  const ranBefore = new Set();       // jobs this band has seen working: only those can "finish" here
  const done = new Map();            // finished, not okayed yet (kept even after the session itself ends)
  const unfolded = new Set();
  let open = false, sayFor = null, draft = '', chipKey = '';
  // The panel only exists in the layer; the band only has the rune.
  const panel = layer ? h('div', 'rpanel') : null, tip = layer ? h('i', 'rtip') : null;
  if (layer) { panel.id = 'rpanel'; panel.hidden = true; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Claude'); tip.hidden = true; band.append(panel, tip); }
  /** Where the Shell put the layer: the rune's centre from the layer's left edge, and how tall the panel may be. */
  let tipX = 300, maxH = 600;

  // A one-step job with no list that ended on its own is done too (2026-10-21, the brain's `finished`).
  const allDone = (j) => (j.tasks.length > 0 && j.tasks.every((t) => t.status === 'completed')) || j.finished === true;
  const waitOf = (j) => waits.find((w) => w.session === j.id);
  // v3: a job gone silent too long is 'stalled', one that ended in an error 'failed' (claudejobs.js liveProgress says which).
  const stateOf = (j) => {
    if (done.has(j.id)) return 'complete';
    if (waitOf(j)) return 'needs';
    if (j.phase === 'paused') return 'paused';
    const s = liveProgress(j).state;
    return s === 'stalled' ? 'stalled' : s === 'failed' ? 'failed' : 'working';
  };
  /** What the rune stands for, most pressing first: needs you, working (newest first), then finished ones. */
  function shown() {
    const live = jobs.filter((j) => !done.has(j.id) && (j.phase === 'working' || j.phase === 'paused' || waitOf(j) || j.failed));
    const rank = { needs: 0, failed: 1, stalled: 1, working: 2, paused: 3 };
    live.sort((a, b) => rank[stateOf(a)] - rank[stateOf(b)] || b.startedAt - a.startedAt);
    return [...live, ...[...done.values()]];
  }

  /* ---------------------------------------------------------------- the rune */
  function paintChip() {
    const list = shown();
    if (layer) { if (!list.length && open) close(); return; }
    if (!list.length) { chipKey = ''; slot.replaceChildren(); slot.hidden = true; if (open) close(); return; }
    const top = list[0], state = stateOf(top);
    // The fill is the shared progress engine's (claudejobs.js liveProgress, 2026-10-21): it creeps inside the task in
    // hand and never goes back, the same number the panel's bars show.
    // No to-do list means no percent. 2026-10-21, his ask: no spinning quarter ring any more ("I wanted the ring around
    // it to load and fill, not spin"), so the ring is just its empty track, still, until there is a list to fill it.
    const m = state === 'complete' ? null : liveProgress(top);
    const still = state !== 'complete' && m.p === null;
    const p = state === 'complete' ? 1 : still ? 0 : m.p;
    const pip = list.length > 1 ? String(Math.min(9, list.length)) : '';
    const key = `${state}|${pip}|${still}`;
    slot.hidden = false;
    if (key !== chipKey) {            // unchanged: leave it, so its slow breathing is not restarted every message
      chipKey = key;
      // A redraw starts the ring where it was shown, then eases on to the new value (same job; a new one starts fresh).
      const from = top.id === ringJob && !still ? shownP : p;
      const c = chip(state, from, pip, open);
      c.classList.toggle('still', still);
      c.addEventListener('click', (e) => { e.stopPropagation(); if (open) close(); else openPanel(); });
      slot.replaceChildren(c);
      shownP = from; c.dataset.p = String(Math.round(from * 100));
    }
    if (top.id !== ringJob || still) shownP = p;
    ringJob = top.id;
    fillRing(p);
    ringTop = state === 'complete' || still ? null : top.id;
    if (ringTop && !ringNext) ringNext = setTimeout(ringStep, RING_MS);
    // His ask (2026-10-21): while the panel is open the gold number hides ("it's obvious"), and comes back when it
    // closes. Opening only flips a class on the same rune, so the number can fade (rune.css) instead of being redrawn.
    const r = slot.firstElementChild;
    if (r) { r.classList.toggle('on', open); r.setAttribute('aria-expanded', open ? 'true' : 'false'); }
  }

  /**
   * Move the ring's fill in place. 2026-10-21, his ask: the ring LOADS and FILLS, so a new value eases in over about
   * 300 ms instead of jumping. The value itself is the engine's (it already never goes back unless Claude rewrote its
   * list); this only smooths the drawing between values. data-p is the value being eased to.
   */
  let shownP = 0, ringJob = null, ease = null;
  function fillRing(p) {
    const r = slot.firstElementChild, cv = r?.querySelector('.rg');
    if (!r || !cv) return;
    const pc = String(Math.round(p * 100));
    if (r.dataset.p === pc) { if (!ease && Math.abs(shownP - p) > 0.004) drawAt(r, cv, p); return; }   // already heading there
    r.dataset.p = pc;
    if (ease) cancelAnimationFrame(ease.raf);
    const from = shownP, t0 = performance.now(), MS = 300;
    if (Math.abs(p - from) < 0.004 || matchMedia('(prefers-reduced-motion: reduce)').matches) { ease = null; drawAt(r, cv, p); return; }
    const step = (t) => {
      const k = Math.min(1, (t - t0) / MS), e = 1 - Math.pow(1 - k, 3);      // ease-out
      if (!cv.isConnected) { ease = null; return; }
      drawAt(r, cv, from + (p - from) * e);
      ease = k < 1 ? { raf: requestAnimationFrame(step) } : null;
    };
    ease = { raf: requestAnimationFrame(step) };
  }
  function drawAt(r, cv, v) { shownP = v; ring(COL[r.dataset.state] ?? COL.working, v, 2, cv); }
  // The ring creeps with the job between the brain's messages (2026-10-21: event-driven first). Every message fills it
  // at once (paintChip above); between messages a light step every RING_MS, drawn on an animation frame, and only
  // while a job with a % is on the rune: nothing runs for an empty or finished rune (it used to tick every 250 ms
  // forever).
  const RING_MS = 100;
  let ringTop = null, ringNext = 0;
  function ringStep() {
    ringNext = 0;
    if (!ringTop || !slot || slot.hidden) return;
    requestAnimationFrame(() => {
      const j = jobs.find((x) => x.id === ringTop);
      const m = j && liveProgress(j);
      // v3: a stall begins (or ends) with no message at all: the rune changes colour by itself.
      if (j && slot.firstElementChild?.dataset.state !== stateOf(j)) { paintChip(); return; }
      if (m && m.p !== null) fillRing(m.p);
      if (ringTop && !ringNext) ringNext = setTimeout(ringStep, RING_MS);
    });
  }

  /* ---------------------------------------------------------------- the panel */
  function cardOf(j) {
    const state = stateOf(j);
    if (state === 'complete') {
      const d = h('div', 'job done'); d.dataset.id = j.id;
      const big = h('div', 'big'), words = h('span');
      const n = j.tasks.length;
      words.append(h('b', '', 'JOB COMPLETE'), h('small', '', `${j.project}${n ? ` · all ${n} task${n > 1 ? 's' : ''}` : ''}`));
      big.append(doneTick(COL.complete, 3), words);
      const keys = h('div', 'ckeys');
      { const op = btn('key sm', 'Open in Claude'); op.addEventListener('click', (e) => { e.stopPropagation(); openIn(j); }); keys.append(op); }
      keys.style.marginTop = '12px';
      d.append(big, keys);
      // 2026-10-21 (his ask): the whole finished card is a door to its session (its key keeps its own click).
      d.title = 'Open in Claude';
      d.addEventListener('click', (e) => { e.stopPropagation(); openIn(j); });
      return d;
    }
    const paused = j.phase === 'paused', isOpen = unfolded.has(j.id);
    const d = h('div', 'job' + (isOpen ? ' open' : '') + (paused ? ' paused' : '') + (state === 'needs' ? ' needs' : ''));
    d.dataset.id = j.id;
    const hd = h('div', 'hd');
    const img = document.createElement('img'); img.src = CL; img.alt = '';
    // Live from the shared progress engine (2026-10-21, claudejobs.js): the %, the bar and the time left move every
    // frame between the brain's messages and never go back; `latest` is this job as the brain last sent it.
    const latest = () => jobs.find((x) => x.id === j.id) ?? j;
    const msg = btn('msg', undefined, 'Message this session'); msg.innerHTML = MSG;
    hd.append(img, h('b', '', j.project), h('span', 't', onOf(j)), liveText(h('span', 'pct'), (now) => { const p = liveProgress(latest(), now).percent; return p === null ? '' : p + '%'; }), msg);
    const row2 = h('div', 'row2'), pb = h('span', 'pb');
    pb.append(livePill(96, 9, 2, latest, paused ? SLATE : SEA, !paused));
    row2.append(pb, liveText(h('span', 'lt'), (now) => leftOf(latest(), now)), h('i', 'chev'));
    // v3: OVERALL (the project's phases) over CURRENT (this job), as in the bubble's card.
    const ovr = liveOverall(latest, 96);
    if (ovr) { row2.prepend(h('b', 'tag', 'CURRENT')); d.append(hd, ovr, row2); } else d.append(hd, row2);
    const w = waitOf(j);
    if (w) { const a = h('div', 'ask'); a.append(h('b', '', 'NEEDS YOU'), document.createTextNode(`${j.project} ${WAIT_WORD[w.kind] ?? 'is waiting on you'}: answer it in Aang's bubble or in Claude.`)); d.append(a); }
    if (isOpen) {
      // The tracker (45f): ticked, the one in progress, the rest.
      const list = h('div', 'list'), cur = curIndex(j);
      // What it is doing right now, above the tasks (2026-10-21, the cockpit's card): the tool and for how long, then
      // its helper agents.
      const act = h('div', 'act');
      act.append(liveText(h('div', 'an'), (now) => describeNow(latest(), now).line));
      // v3: the command's sub-bar, the helper agents and the CI runs, a row each (the bubble's card, the same rows).
      const rows = liveRows(latest, 70);
      if (rows) act.append(rows);
      list.append(act);
      j.tasks.forEach((t, k) => {
        const isDone = t.status === 'completed', now = !isDone && k === cur;
        const ob = h('div', 'ob' + (isDone ? ' done' : now ? ' now' : ''));
        ob.append(h('i'), h('span', 'tx', now && t.active ? t.active : t.text), h('span', 'r', isDone ? 'done' : now ? 'NOW' : ''));
        list.append(ob);
      });
      if (!j.tasks.length) list.append(h('div', 'ob now', 'Working. Claude keeps no to-do list for this one, so there is no percent.'));
      const keys = h('div', 'ckeys');
      const pp = btn('key sm', paused ? 'Play' : 'Pause'); pp.dataset.act = paused ? 'play' : 'pause';
      pp.addEventListener('click', (e) => { e.stopPropagation(); aang.browserClaude?.(paused ? { t: 'claude.play', session: j.id } : { t: 'claude.pause', session: j.id }); });
      const op = btn('key sm primary', 'Open in Claude'); op.dataset.act = 'open';
      op.addEventListener('click', (e) => { e.stopPropagation(); openIn(latest()); });
      keys.append(pp, op);   // 2026-10-21: always; no app link brings the Claude app forward instead
      d.append(list, keys);
    }
    if (sayFor === j.id) d.append(sayRow(j));
    msg.addEventListener('click', (e) => { e.stopPropagation(); sayFor = sayFor === j.id ? null : j.id; draft = ''; paint(); });
    d.addEventListener('click', () => { if (unfolded.has(j.id)) unfolded.delete(j.id); else unfolded.add(j.id); paint(); });
    return d;
  }
  /** The purple key: his words to that session, now or after the task in progress (the cockpit's two ways). */
  function sayRow(j) {
    const row = h('div', 'say');
    const input = document.createElement('input'); input.type = 'text'; input.maxLength = 4000; input.placeholder = `Tell ${j.project} something`; input.value = draft;
    input.setAttribute('aria-label', input.placeholder);
    const go = (when) => {
      const text = input.value.trim(); if (!text) return;
      aang.browserClaude?.({ t: 'claude.send', session: j.id, text, when });
      sayFor = null; draft = ''; paint();
    };
    const now = btn('key sm primary', 'Send'); now.dataset.act = 'send';
    const after = btn('key sm', 'After this task'); after.dataset.act = 'after';
    now.addEventListener('click', (e) => { e.stopPropagation(); go('now'); });
    after.addEventListener('click', (e) => { e.stopPropagation(); go('after'); });
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('input', () => { draft = input.value; });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go('now'); } else if (e.key === 'Escape') { e.stopPropagation(); sayFor = null; draft = ''; paint(); } });
    row.append(input, now, after);
    return row;
  }
  function paintPanel() {
    if (!open || !layer) return;
    const focused = document.activeElement?.closest?.('.say') ? true : false;
    anims.clear();                     // drawn afresh; the old pills stop breathing with them
    const list = shown();
    const kids = [];
    const any = (s) => list.some((j) => stateOf(j) === s);
    kids.push(h('div', 'gh', list.length > 1 ? `CLAUDE · ${list.length} JOBS` : any('needs') ? 'CLAUDE NEEDS YOU' : any('complete') ? 'CLAUDE FINISHED' : any('paused') ? 'CLAUDE IS PAUSED' : 'CLAUDE IS WORKING'));
    const one = list.length === 1 ? list[0] : null;
    if (one && stateOf(one) !== 'complete') {
      // One job: what it is on now, how much of the whole job is done, about how long is left (sheet 50).
      // 2026-10-21 (his report: "—% all done · Working"): with no to-do list there is no percent, so none is drawn and
      // the line under it says only what is true. ON NOW is the live line (what it is doing, for how long); "Working" is
      // said once; "all done" only when every task is done.
      const latest = () => jobs.find((x) => x.id === one.id) ?? one;
      // With nothing more to say than "Working" (no list, no tool running) both rows hide: the job's own bar below
      // says "Working", once.
      const onNow = (now) => onOf(latest()).replace(/ · task \d+ of \d+$/, '') || describeNow(latest(), now).line;
      const on = h('div', 'onnow'); on.append(h('b', '', 'ON NOW'), liveText(h('span'), (now) => { const t = onNow(now); on.hidden = !t; return t; }));
      const big = h('div', 'big');
      const pctOfNow = (now) => { const p = liveProgress(latest(), now).percent; return p === null ? '' : p + '%'; };
      big.append(liveText(h('em'), pctOfNow),
        liveText(h('span'), (now) => { const t = runeHeadLine(latest(), now, onNow(now)); big.hidden = !t && !pctOfNow(now); return t; }));
      kids.push(on, big);
    }
    for (const j of list) kids.push(cardOf(j));
    panel.replaceChildren(...kids);
    animate(true);
    if (focused || sayFor) { const i = panel.querySelector('.say input'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
    place();
  }
  /**
   * In the layer: the panel at the layer's own left (the Shell placed the layer by sheet 50's sums: its right edge a
   * little past the rune), the point under the rune, and its size told to the Shell so the layer fits it exactly.
   */
  const MARGIN = 24;                 // room round the panel for its shadow (runelayer.css)
  function place() {
    if (!layer) return;
    panel.style.maxHeight = Math.max(120, maxH) + 'px';
    tip.style.left = Math.round(tipX - 9) + 'px';
    tellSize();
  }
  let sentSize = '';
  function tellSize() {
    if (!layer || panel.hidden) return;
    const w = panel.offsetWidth + 2 * MARGIN, ht = panel.offsetTop + panel.offsetHeight + MARGIN + 20;
    const k = `${w}x${ht}`;
    if (k === sentSize) return;
    sentSize = k;
    aang.browserRune?.({ size: { w, h: ht } });
  }
  if (layer && typeof ResizeObserver === 'function') new ResizeObserver(() => { if (open) tellSize(); }).observe(panel);
  function paint() { paintChip(); paintPanel(); }
  /** The rune was clicked in the band: the Shell opens the layer under it (and says so back, onBrowserRune). */
  function openPanel() {
    if (layer || open || !shown().length) return;
    closeOthers?.();
    const r = slot.firstElementChild; if (!r) return;
    const b = band.getBoundingClientRect(), c = r.getBoundingClientRect();
    aang.browserRune?.({ open: true, x: Math.round(c.left + c.width / 2), y: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right) });
  }
  /**
   * Smooth (his ask, 2026-10-21: "make it smooth when I open and close that function"): it slides down and fades in over
   * ~260 ms on Samara's ease, and out over ~180 ms; the Shell hides the layer only once it is out.
   */
  let shutTimer = 0;
  function showLayer() {
    clearTimeout(shutTimer);
    open = true; sentSize = '';
    panel.hidden = false; tip.hidden = false;
    panel.classList.add('shut'); tip.classList.add('shut');
    paint();
    void panel.offsetWidth;              // the start of the slide is laid out before it moves, so it transitions
    panel.classList.remove('shut', 'leaving'); tip.classList.remove('shut', 'leaving');
  }
  function close() {
    if (!open) return;
    open = false; sayFor = null; draft = '';
    if (!layer) { aang.browserRune?.({ open: false }); paintChip(); return; }
    panel.classList.add('shut', 'leaving'); tip.classList.add('shut', 'leaving');
    aang.browserRune?.({ open: false });
    clearTimeout(shutTimer);
    shutTimer = setTimeout(() => { if (open) return; panel.hidden = true; tip.hidden = true; panel.replaceChildren(); anims.clear(); animate(false); }, 200);
  }
  /** Open in Claude (2026-10-21, his rule): that session to the front in the Claude app, and this panel folds away at once. */
  function openIn(j) { aang.browserOpenClaude?.(openTarget(j)); close(); }
  if (layer) {
    panel.addEventListener('click', (e) => e.stopPropagation());
    // A press on the layer's see-through edge, or Esc: it folds away. A press anywhere else takes the keyboard from the
    // layer, and the Shell folds it then (browser.ts runeView, on blur).
    document.addEventListener('pointerdown', (e) => { if (open && !panel.contains(e.target)) close(); }, true);
  } else {
    // In the band: a press anywhere but the rune folds it.
    document.addEventListener('pointerdown', (e) => { if (open && !slot.contains(e.target)) close(); }, true);
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) close(); });
  // What the Shell says: in the band, whether the panel is open (the gold number fades); in the layer, open it here
  // (where the rune is, how tall it may be) or fold it.
  aang.onBrowserRune?.((m) => {
    if (!m || typeof m !== 'object') return;
    if (!layer) { const want = m.open === true; if (want !== open) { open = want; if (!want) { sayFor = null; draft = ''; } paintChip(); } return; }
    if (Number.isFinite(m.tip)) tipX = m.tip;
    if (Number.isFinite(m.maxH)) maxH = m.maxH;
    if (m.open === true) { if (!open) showLayer(); else place(); }
    else if (m.open === false && open) close();
  });

  /* ---------------------------------------------------------------- the brain, through the Shell */
  aang.onBrowserClaude((s) => {
    if (!s || typeof s !== 'object') { jobs = []; waits = []; done.clear(); ranBefore.clear(); unfolded.clear(); paint(); return; }
    jobs = (Array.isArray(s.jobs) ? s.jobs : []).slice(0, 50).map(readJob).filter(Boolean);
    waits = (Array.isArray(s.waits) ? s.waits : []).filter((w) => w && typeof w.session === 'string').map((w) => ({ session: w.session, kind: String(w.kind ?? '') }));
    for (const j of jobs) {
      // A job seen working here that now has every task ticked has finished: teal for DONE_MS, then off the rune by itself,
      // the same as the cockpit's strip.
      if (ranBefore.has(j.id) && allDone(j) && j.phase !== 'working') {
        done.set(j.id, j); ranBefore.delete(j.id);
        const id = j.id;
        setTimeout(() => { if (done.delete(id)) { unfolded.delete(id); paint(); } }, DONE_MS);
      }
      else if (j.phase === 'working' || j.phase === 'paused' || waitOf(j)) { ranBefore.add(j.id); if (done.has(j.id) && !allDone(j)) done.delete(j.id); }
      if (done.has(j.id)) done.set(j.id, j);
    }
    for (const id of [...ranBefore]) if (!jobs.some((j) => j.id === id)) ranBefore.delete(id);
    for (const id of [...unfolded]) if (!jobs.some((j) => j.id === id) && !done.has(id)) unfolded.delete(id);
    if (sayFor && !jobs.some((j) => j.id === sayFor)) { sayFor = null; draft = ''; }
    paint();
  });
  aang.browserClaudeHello?.();
  return { close, isOpen: () => open };
}

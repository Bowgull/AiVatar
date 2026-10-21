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
import { pill, animate, anims, SEA, SLATE, MSG, CL, readJob, curIndex, boundsOf, pctOf, leftOf, onOf, h, btn } from './claudejobs.js';

// His final colours (sheets 49/50, the same as the marks over Aang's head, src/Body/ClaudeMarks.cs).
/** How long a finished job stays teal on the rune before it goes (the cockpit's strip uses the same ~4 s). */
const DONE_MS = 4000;
const COL = { working: '#f0a64a', needs: '#7cc4ff', complete: '#3fc4b4', paused: '#6f7787' };
const rgb = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16));
const mix = (x, t, k) => `rgb(${rgb(x).map((v, i) => Math.round(v + (t[i] - v) * k)).join(',')})`;

/* ---- the rune, the ring and the job-done tick (first drawn in docs/cockpit/sheet-50/marks.js) ---- */
// His ask (2026-10-21): the rune should look like the Claude logo, "the taskbar icon isn't a bad place to start". So the
// stone is the app icon's cream (a rounded tablet with a lit top-left edge and a shaded bottom-right, so it is still a
// RuneScape-ish rune stone, but a clean face: specks made the mark noisy) and the glyph is Claude's own terracotta
// starburst, drawn the way the real mark is built (pages/art/claude-icon.png): THIN separate rays with cream between
// them, round a SMALL centre, a little uneven in length and angle. At this size eight rays read; more ran together.
// Each ray is one pixel wide and touches the 3 x 3 centre on its own cell, so no two rays merge; slanted ones are
// clean one-pixel staircases. The glyph no longer takes the job's colour: the ring carries the state (amber, blue,
// teal, slate), so the mark always reads as Claude. A finished job turns it into a teal tick; a paused one greys it.
// 17 x 17 art pixels, 2 screen px each (the band's art scale); the band keeps its height.
const STONE = [
  '....OOOOOOOOO....',
  '..OOHHHHHHHHHOO..',
  '.OHHLLLLLLLLLLSO.',
  '.OHLLLLLLLLLLLSO.',
  'OHLLLLLLLLLLLLLSO',
  'OHLLLLLLLLLLLLLSO',
  'OHLLLLLLLLLLLLLSO',
  'OHLLLLLLLLLLLLLSO',
  'OHLLLLLLLLLLLLLSO',
  'OHLLLLLLLLLLLLLSO',
  'OHLLLLLLLLLLLLLSO',
  'OHLLLLLLLLLLLLLSO',
  'OHLLLLLLLLLLLLLSO',
  '.OLLLLLLLLLLLLSO.',
  '.OSLLLLLLLLLLSSO.',
  '..OOSSSSSSSSSOO..',
  '....OOOOOOOOO....'];
const GLYPH = [
  '...............',
  '........G......',
  '..G.....G......',
  '...G....G...G..',
  '....G..G..GG...',
  '.....G.G.G.....',
  '......GGG...GG.',
  '....GGGGGGGG...',
  '.GGG..GGG......',
  '.....G.G.G.....',
  '.....G.G..G....',
  '....G...G..G...',
  '....G...G......',
  '........G......',
  '...............'];
// The finished tick, two pixels thick so it reads as clearly as the starburst it replaces; E is its darker underside.
const TICK = [
  '...............',
  '...............',
  '...............',
  '............GG.',
  '...........GGE.',
  '..........GGE..',
  '.........GGE...',
  '..GG....GGE....',
  '..EGG..GGE.....',
  '...EGGGGE......',
  '....EGGE.......',
  '.....EE........',
  '...............',
  '...............',
  '...............'];
const STONE_COL = { O: '#2a1a10', H: '#fbf3e4', L: '#f0e3c8', S: '#cdb48c' };
/** Claude's terracotta, read off the real app icon (pages/art/claude-icon.png). */
const CLAUDE = '#d97757';
function rune(col, px = 2, glyph = 'sun', paused = false) {
  const n = 17, cv = Object.assign(document.createElement('canvas'), { width: (n + 1) * px, height: (n + 1) * px, className: 'rn' });
  const g = cv.getContext('2d'), P = (x, y, c) => { g.fillStyle = c; g.fillRect(x * px, y * px, px, px); };
  g.fillStyle = 'rgba(0,0,0,.4)';
  STONE.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '.') g.fillRect((x + 1) * px, (y + 1) * px, px, px); }));
  STONE.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '.') P(x, y, STONE_COL[ch]); }));
  const G = glyph === 'tick' ? TICK : GLYPH;
  const fill = glyph === 'tick' ? { G: col, E: mix(col, [20, 40, 40], 0.45) } : { G: paused ? mix(CLAUDE, rgb(COL.paused), 0.65) : CLAUDE };
  G.forEach((r, y) => [...r].forEach((ch, x) => { if (fill[ch]) P(x + 1, y + 1, fill[ch]); }));
  return cv;
}
// The thin pixel ring for take B: whole art pixels on a circle round the stone, lit up to the job's progress.
function ring(col, p, px = 2) {
  const n = 23, c = (n - 1) / 2, R = 10.6;
  const cv = Object.assign(document.createElement('canvas'), { width: n * px, height: n * px, className: 'rg' });
  const g = cv.getContext('2d');
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
  el.title = state === 'needs' ? 'Claude needs you: click for the details' : state === 'complete' ? 'Claude finished a job: click for the details' : state === 'paused' ? 'A Claude job is paused: click for the details' : 'Claude is working: click for the details';
  el.setAttribute('aria-label', el.title); el.setAttribute('aria-haspopup', 'dialog'); el.setAttribute('aria-expanded', on ? 'true' : 'false');
  const st = h('span', 'stone');
  st.append(ring(col, p, 2), rune(col, 2, state === 'complete' ? 'tick' : 'sun', state === 'paused'));
  if (pip) st.append(h('i', 'pip', pip));
  el.append(st);
  return el;
}

const WAIT_WORD = { permission: 'wants your OK to go on', question: 'has a question for you', plan: 'has a plan ready for you' };

/**
 * Start the rune in this band. `slot` is where the rune sits (by the ... key), `band` the band it hangs under,
 * `freeze`/`unfreeze` the frame's own (the page is pictured while anything lies over it), `closeOthers` shuts the
 * band's other trays when the panel opens.
 */
export function startRune({ slot, band, freeze, unfreeze, closeOthers }) {
  const aang = window.aang;
  if (!slot || !band || !aang?.onBrowserClaude) return null;
  let jobs = [], waits = [];
  const ranBefore = new Set();       // jobs this band has seen working: only those can "finish" here
  const done = new Map();            // finished, not okayed yet (kept even after the session itself ends)
  const unfolded = new Set();
  let open = false, sayFor = null, draft = '', chipKey = '';
  const panel = h('div', 'rpanel'); panel.id = 'rpanel'; panel.hidden = true; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Claude');
  const tip = h('i', 'rtip'); tip.hidden = true;
  band.append(panel, tip);

  const allDone = (j) => j.tasks.length > 0 && j.tasks.every((t) => t.status === 'completed');
  const waitOf = (j) => waits.find((w) => w.session === j.id);
  const stateOf = (j) => (done.has(j.id) ? 'complete' : waitOf(j) ? 'needs' : j.phase === 'paused' ? 'paused' : 'working');
  /** What the rune stands for, most pressing first: needs you, working (newest first), then finished ones. */
  function shown() {
    const live = jobs.filter((j) => !done.has(j.id) && (j.phase === 'working' || j.phase === 'paused' || waitOf(j)));
    const rank = { needs: 0, working: 1, paused: 2 };
    live.sort((a, b) => rank[stateOf(a)] - rank[stateOf(b)] || b.startedAt - a.startedAt);
    return [...live, ...[...done.values()]];
  }

  /* ---------------------------------------------------------------- the rune */
  function paintChip() {
    const list = shown();
    if (!list.length) { chipKey = ''; slot.replaceChildren(); slot.hidden = true; if (open) close(); return; }
    const top = list[0], state = stateOf(top);
    // No to-do list means no percent: the ring turns slowly instead of sitting at an empty 0 (his catch, 2026-10-21).
    const busy = state !== 'complete' && pctOf(top) === null;
    const p = state === 'complete' ? 1 : busy ? 0.25 : (pctOf(top) ?? 0) / 100;
    const pip = list.length > 1 ? String(Math.min(9, list.length)) : '';
    const key = `${state}|${Math.round(p * 100)}|${pip}|${busy}`;
    slot.hidden = false;
    if (key !== chipKey) {            // unchanged: leave it, so its slow breathing is not restarted every message
      chipKey = key;
      const c = chip(state, p, pip, open);
      c.classList.toggle('busy', busy);
      c.addEventListener('click', (e) => { e.stopPropagation(); if (open) close(); else openPanel(); });
      slot.replaceChildren(c);
    }
    // His ask (2026-10-21): while the panel is open the gold number hides ("it's obvious"), and comes back when it
    // closes. Opening only flips a class on the same rune, so the number can fade (rune.css) instead of being redrawn.
    const r = slot.firstElementChild;
    if (r) { r.classList.toggle('on', open); r.setAttribute('aria-expanded', open ? 'true' : 'false'); }
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
      if (j.open) { const op = btn('key sm', 'Open in Claude'); op.addEventListener('click', (e) => { e.stopPropagation(); aang.browserOpenClaude?.(j.open); }); keys.append(op); }
      keys.style.marginTop = '12px';
      d.append(big, keys);
      return d;
    }
    const paused = j.phase === 'paused', isOpen = unfolded.has(j.id);
    const d = h('div', 'job' + (isOpen ? ' open' : '') + (paused ? ' paused' : '') + (state === 'needs' ? ' needs' : ''));
    d.dataset.id = j.id;
    const hd = h('div', 'hd');
    const img = document.createElement('img'); img.src = CL; img.alt = '';
    const p = pctOf(j);
    const msg = btn('msg', undefined, 'Message this session'); msg.innerHTML = MSG;
    hd.append(img, h('b', '', j.project), h('span', 't', onOf(j)), h('span', 'pct', p === null ? '' : p + '%'), msg);
    const row2 = h('div', 'row2'), pb = h('span', 'pb');
    pb.append(pill(96, 9, 2, boundsOf(j), (p ?? 0) / 100, j.tasks.length ? curIndex(j) : -1, paused ? SLATE : SEA, !paused));
    row2.append(pb, h('span', 'lt', leftOf(j)), h('i', 'chev'));
    d.append(hd, row2);
    const w = waitOf(j);
    if (w) { const a = h('div', 'ask'); a.append(h('b', '', 'NEEDS YOU'), document.createTextNode(`${j.project} ${WAIT_WORD[w.kind] ?? 'is waiting on you'}: answer it in Aang's bubble or in Claude.`)); d.append(a); }
    if (isOpen) {
      // The tracker (45f): ticked, the one in progress, the rest.
      const list = h('div', 'list'), cur = curIndex(j);
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
      op.addEventListener('click', (e) => { e.stopPropagation(); if (j.open) aang.browserOpenClaude?.(j.open); });
      keys.append(pp); if (j.open) keys.append(op);
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
    if (!open) return;
    const focused = document.activeElement?.closest?.('.say') ? true : false;
    anims.clear();                     // drawn afresh; the old pills stop breathing with them
    const list = shown();
    const kids = [];
    const any = (s) => list.some((j) => stateOf(j) === s);
    kids.push(h('div', 'gh', list.length > 1 ? `CLAUDE · ${list.length} JOBS` : any('needs') ? 'CLAUDE NEEDS YOU' : any('complete') ? 'CLAUDE FINISHED' : any('paused') ? 'CLAUDE IS PAUSED' : 'CLAUDE IS WORKING'));
    const one = list.length === 1 ? list[0] : null;
    if (one && stateOf(one) !== 'complete') {
      // One job: what it is on now, how much of the whole job is done, about how long is left (sheet 50).
      const on = h('div', 'onnow'); on.append(h('b', '', 'ON NOW'), h('span', '', onOf(one).replace(/ · task \d+ of \d+$/, '') || 'Working'));
      const p = pctOf(one), big = h('div', 'big');
      big.append(h('em', '', p === null ? '—%' : p + '%'), h('span', '', `all done · ${leftOf(one)}`));
      kids.push(on, big);
    }
    for (const j of list) kids.push(cardOf(j));
    panel.replaceChildren(...kids);
    animate(true);
    if (focused || sayFor) { const i = panel.querySelector('.say input'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
    place();
  }
  /** Hang it from the rune: its right edge a little past the rune, the point under the rune (sheet 50's own sums). */
  function place() {
    const r = slot.firstElementChild; if (!r) return;
    const b = band.getBoundingClientRect(), c = r.getBoundingClientRect(), W = panel.offsetWidth || 384;
    const left = Math.max(8, Math.min(b.width - W - 8, Math.round(c.left - b.left + c.width / 2 - W + 70)));
    panel.style.left = left + 'px';
    tip.style.left = Math.round(c.left - b.left + c.width / 2 - 9) + 'px';
  }
  function paint() { paintChip(); paintPanel(); }
  function openPanel() {
    if (open || !shown().length) return;
    closeOthers?.();
    open = true; panel.hidden = false; tip.hidden = false;
    freeze?.('rune');
    paint();
  }
  function close() {
    if (!open) return;
    open = false; sayFor = null; draft = '';
    panel.hidden = true; tip.hidden = true; panel.replaceChildren();
    anims.clear(); animate(false);
    unfreeze?.('rune');
    paintChip();
  }
  panel.addEventListener('click', (e) => e.stopPropagation());
  // Click anywhere else, or Esc: the panel folds away (pointerdown, so a key that stops its own clicks still closes it).
  document.addEventListener('pointerdown', (e) => { if (open && !panel.contains(e.target) && !slot.contains(e.target)) close(); }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) close(); });
  addEventListener('resize', () => { if (open) place(); });

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

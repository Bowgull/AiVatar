// C4, Claude in the cockpit (2026-10-21, docs/COCKPIT-BUILD.md; sheets 45g, 45f, 45d, 46).
//
// Two zones of the one cockpit, under the conversation and over the typing area:
//   #ckjobs  the jobs strip: ONE tracked bar (the job he started last), up to two; "N other jobs running" opens a list
//            with Track this. A bar is 45f's soft pill: overall %, time left, a notch per task, the current piece
//            glowing. A click unfolds the tasks (Pause/Play, Open in Claude, Stop tracking); a click on the % flips it
//            to "N% WEEK" in lavender; the purple key points the typing area at that session.
//   #ckpins  the most urgent thing a session is waiting on ("N MORE" to step through): a permission (Allow / Always /
//            No / No, and...), a question (glove rows, boxes for several picks, QUESTION 2 OF 3 with Back), a plan
//            (Go / Change it). With the cockpit closed the bubble shows the same card, so he can answer without opening it.
// Every word here is Claude's or a session's, so everything is built with textContent, never markup from the wire.
// The brain keeps the truth (claude.jobs, claude.wait); this page keeps only what he is looking at: which jobs he
// tracks, which bar is unfolded, which way a % is flipped, where he is in a set of questions.

const CL = 'art/claude-icon.png';
// The 45f pill's palettes, verbatim; SLATE is 45d's dusk slate (154,168,192) for a paused job, shaded the same way.
const SEA = ['#d9f3ee', '#b2e6dd', '#8ad5c9', '#6cc3b6', '#58b0a3', '#479a8e', '#3a857a', '#2f6f66'];
const SEA_NOW = ['#f4fcfa', '#e2f6f1', '#cdeee6', '#b8e5db', '#a4dbcf', '#90cfc2', '#7fc2b5', '#6fb3a6'];
// Paused is his final slate, #6f7787 (2026-10-21 mark colours), shaded light to dark the same way around it.
const SLATE = ['#c9ced8', '#aeb4c0', '#959cab', '#7f8798', '#6f7787', '#626a7a', '#555c6b', '#474d5a'];
// The purple key's pixel speech balloon, verbatim from sheet 45g (a fixed drawing, no wire data in it).
const MSG = '<svg viewBox="0 0 10 9" shape-rendering="crispEdges"><path d="M1 0h8v1H1zM0 1h1v5H0zM9 1h1v5H9zM1 6h3v1H1zM6 6h3v1H6zM3 7h2v1H3zM3 8h1v1H3zM2 2h6v1H2zM2 4h4v1H2z" fill="#efe6ff"/></svg>';

const el = (id) => document.getElementById(id);
/** An element with a class and plain text. */
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = String(text); return e; }
function btn(cls, text, title) { const b = h('button', cls, text); b.type = 'button'; if (title) b.title = title; return b; }
const str = (v, n) => (typeof v === 'string' ? v : '').slice(0, n);

/* ---- 45g's soft pill bar, lifted (one canvas, whole art pixels at 2x); `pal` and `glow` added for a paused job ---- */
const anims = new Set();
let tk = 0, animTimer = 0;
/**
 * The pill. `p` is 0..1, or null for the busy look (2026-10-21, progress engine rule 5: no to-do list = no percent, a
 * soft band sweeping instead of a fake 0%). `c.setProgress(p, cur)` moves it without a new canvas (the live updater
 * calls it every frame; it redraws only when a whole art pixel changes).
 */
function pill(w, ht, s, bounds, p, cur, pal = SEA, glow = true) {
  const c = document.createElement('canvas'); c.className = 'jpill'; c.width = w; c.height = ht; c.style.width = w * s + 'px'; c.style.height = ht * s + 'px';
  const g = c.getContext('2d'), r = Math.floor(ht / 2);
  const st = { p: p === null || !Number.isFinite(p) ? null : Math.max(0, Math.min(1, p)), cur };
  const P = (x, y, col, a = 1) => { g.globalAlpha = a; g.fillStyle = col; g.fillRect(x, y, 1, 1); g.globalAlpha = 1; };
  const inside = (x, y) => { const cx = x < r ? r - .5 : x > w - 1 - r ? w - 1 - r + .5 : x, cy = y < r ? r - .5 : y > ht - 1 - r ? ht - 1 - r + .5 : y; return Math.hypot(x - cx, y - cy) <= r + .15; };
  const draw = (t) => {
    g.clearRect(0, 0, w, ht);
    for (let y = 0; y < ht; y++) for (let x = 0; x < w; x++) { if (!inside(x, y)) continue; const rim = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1); P(x, y, rim ? (y < ht / 2 ? '#6a4628' : '#3a2414') : y === 1 ? '#1a100a' : '#2a1a10'); }
    const inner = w - 2, cur = st.cur;
    const paint = (x0, x1, pl, al) => { for (let x = x0; x < x1; x++) for (let y = 1; y < ht - 1; y++) { if (!inside(x, y) || !(inside(x - 1, y) && inside(x + 1, y) && inside(x, y - 1) && inside(x, y + 1))) continue; P(x, y, pl[Math.min(7, Math.round((y - 1) / (ht - 3) * 7))], al); } };
    // No to-do list yet: the empty track, perfectly still (2026-10-21, his rule: nothing spins or sweeps; the words
    // beside it say "Working"). It fills the moment Claude writes its list.
    if (st.p === null) return;
    const fw = Math.round(inner * st.p);
    if (glow && cur >= 0 && cur < bounds.length) { const a = cur > 0 ? bounds[cur - 1] : 0, b = bounds[cur]; paint(1 + Math.round(inner * a), 1 + Math.round(inner * b), SEA_NOW, .7 + .2 * Math.sin(t / 7)); }
    paint(1, 1 + fw, pal, 1);
    for (let x = 2; x < fw; x++) if (inside(x, 2)) P(x, 2, '#fff', .45);
    for (const q of bounds.slice(0, -1)) { const x = 1 + Math.round(inner * q); for (let y = 2; y < ht - 2; y++) P(x, y, '#2a1a10', .45); }
    if (fw > 1) for (let y = 1; y < ht - 1; y++) { P(fw, y, '#fffaf0'); P(fw + 1, y, '#fff3d8', .5); }
  };
  if (glow) anims.add(draw);
  draw(tk);
  c.setProgress = (np, ncur = st.cur) => {
    const v = np === null || !Number.isFinite(np) ? null : Math.max(0, Math.min(1, np));
    const px = (x) => (x === null ? -1 : Math.round((w - 2) * x));
    if (px(v) === px(st.p) && ncur === st.cur) return;
    st.p = v; st.cur = ncur;
    draw(tk);                         // at once (2026-10-21): a tick must not wait for the next breath
  };
  return c;
}
/** The current piece breathes only while the strip is on screen: no timer runs for a closed cockpit. */
function animate(on) {
  if (on && !animTimer) animTimer = setInterval(() => { tk++; for (const a of anims) a(tk); }, 90);
  if (!on && animTimer) { clearInterval(animTimer); animTimer = 0; }
}
/**
 * Every live bar, percent and line moves NOW (2026-10-21, supercharged): called the moment the brain's news lands,
 * so a tick or a tool start shows on this frame instead of waiting up to 90 ms for the breathing timer.
 */
function kick() { for (const a of anims) { try { a(tk); } catch { /* one bad line must not stop the rest */ } } }
/**
 * The last hop of the progress trace: from the event in the Claude session to this page's paint. Kept as a counter
 * (globalThis.aangProgressLat: count, last, worst), never a log line per event; with the brain's trace on
 * (AANG_PROGRESS_TRACE=1) each push also says it once in the page's console.
 */
function notePaint(lat) {
  if (!lat || typeof lat !== 'object' || !Number.isFinite(lat.ev)) return;
  requestAnimationFrame(() => {
    const ms = Date.now() - lat.ev;
    const s = (globalThis.aangProgressLat ??= { count: 0, last: 0, worst: 0 });
    s.count++; s.last = ms; s.worst = Math.max(s.worst, ms);
    if (lat.trace === true) console.log(`progress trace: ${lat.type} event->paint ${ms} ms (shell->paint ${Date.now() - (lat.sh ?? lat.tx)} ms)`);
  });
}

/* ---- reading a job ---- */
/** At work or paused mid-job (his decision, 2026-10-21: idle and ended jobs never show in the strip). */
const active = (j) => j.phase === 'working' || j.phase === 'paused';
const curIndex = (j) => { const i = j.tasks.findIndex((t) => t.status === 'in_progress'); return i >= 0 ? i : j.tasks.findIndex((t) => t.status !== 'completed'); };
const boundsOf = (j) => (j.tasks.length ? j.tasks.map((_, i) => (i + 1) / j.tasks.length) : [1]);
const pctOf = (j) => (Number.isFinite(j.percent) ? Math.max(0, Math.min(100, Math.round(j.percent))) : null);
/** 45f's time-left words, from the progress engine (2026-10-21): live, "about", and only from a real pace. */
function leftOf(j, now = Date.now()) { return liveProgress(j, now).left; }
/** "N% WEEK": the session's weekly rate limit as the status line has it; nothing known says so quietly. */
function weekOf(j) {
  const r = (j.usage?.rateLimits ?? []).find((x) => /week|seven|7.?d/i.test(String(x?.kind ?? '')));
  return r && Number.isFinite(Number(r.percentUsed)) ? `${Math.max(0, Math.min(100, Math.round(Number(r.percentUsed))))}% WEEK` : '—% WEEK';
}
/** What a bar says it is on: the task in progress and where that is in the list. */
function onOf(j) {
  const i = curIndex(j), n = j.tasks.length;
  // Never the first thing typed into the session (2026-10-21: the rune read "job hunt data yes build the fit as is from
  // the research before phase 4"): the task in hand, or just "Working" when Claude keeps no to-do list.
  const what = j.current || (i >= 0 ? j.tasks[i].active || j.tasks[i].text : '') || (j.phase === 'working' ? 'Working' : '');
  return n && i >= 0 ? `${what} · task ${i + 1} of ${n}` : what;
}
/* ---- THE PROGRESS ENGINE, the Shell's half (2026-10-21; the rules are at the top of src/Core/src/claudeprogress.ts
   and in docs/COCKPIT-BUILD.md "The progress engine"). The brain sends the authoritative numbers (done, total, the task
   in hand, its working time so far, the pace, the rewrite count); every frame this works out where the bar stands:
   the ticked tasks, plus a creep inside the task in hand by the pace so far (straight to 60% of a pace, then easing,
   never past 90% of the task's slot), frozen while paused or idle. A viewer never lets its bar go back unless the
   brain says Claude rewrote the list, and then says so once. One model, used by the jobs strip, the job cards and
   Samara's rune panel (rune.js imports these), and the pop-out later. ---- */
const DEFAULT_PACE_MS = 120_000;
const SLOT_CAP = 0.9;
/** Share of a slot crept after `f` paces (the brain's creep(), the same sum). */
function creep(f) {
  if (!(f > 0)) return 0;
  return Math.min(SLOT_CAP - 1e-6, f <= 0.6 ? f : 0.6 + 0.3 * (1 - Math.exp(-(f - 0.6) / 0.6)));
}
const NOTE_MS = 6000;
/** "about 12 min left", or null. Estimates always say "about" (rule 5). */
function aboutLeft(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return null;
  if (ms < 60_000) return 'about a minute left';
  const m = Math.round(ms / 60000);
  return m >= 60 ? `about ${Math.floor(m / 60)} h ${m % 60} min left` : `about ${m} min left`;
}
/**
 * Where a job's bar stands at `now`, from the brain's numbers alone (pure: no memory of earlier frames).
 * { p: 0..1 or null (no list: the busy look), percent: whole number or null, cur: the task in hand for the glow,
 *   etaMs: or null (only from a real pace), left: the words beside the bar, rev, rewroteAt }.
 */
function progressModel(j, now = Date.now()) {
  const pr = j.progress, paused = j.phase === 'paused', working = j.phase === 'working';
  // A one-step job (no to-do list) whose turn ended on its own is complete: the bar fills (2026-10-21).
  if (!pr && j.finished && !working && !paused) return { p: 1, percent: 100, cur: -1, etaMs: 0, left: 'Done', rev: 0, rewroteAt: null };
  // An older brain (no progress numbers): its percent and time left as they are, no creep.
  if (!pr) {
    const pc = pctOf(j);
    const left = paused ? 'Paused' : j.etaMs === 0 || pc === 100 ? 'All tasks done' : aboutLeft(j.etaMs) ?? (working ? 'Working' : 'Resting');
    return { p: pc === null ? null : pc / 100, percent: pc, cur: j.tasks.length ? curIndex(j) : -1, etaMs: j.etaMs, left, rev: 0, rewroteAt: null };
  }
  const base = pr.done / pr.total;
  let p = base, eta = null;
  const elapsed = pr.elapsedMs + (working ? Math.max(0, now - pr.at) : 0);
  if (working && pr.cur >= 0 && pr.done < pr.total) p = base + creep(elapsed / (pr.paceMs ?? DEFAULT_PACE_MS)) / pr.total;
  if (pr.done >= pr.total) eta = 0;
  else if (pr.paceMs !== null) eta = Math.max(0, (pr.total - pr.done) * pr.paceMs - Math.min(elapsed, SLOT_CAP * pr.paceMs));
  const left = paused ? 'Paused'
    : pr.rewroteAt !== null && now - pr.rewroteAt < NOTE_MS ? 'Claude rewrote its list'
    : eta === 0 ? 'All tasks done'
    : aboutLeft(eta) ?? (working ? 'Working' : 'Resting');
  return { p, percent: pr.done >= pr.total ? 100 : Math.floor(p * 100), cur: pr.cur, etaMs: eta, left, rev: pr.rev, rewroteAt: pr.rewroteAt };
}
/** Per job: the furthest its bar has been drawn in this window, and under which list (rev). */
const held = new Map();
/**
 * progressModel, kept from ever going back (rule 2): within the same list the bar holds the furthest it has been; only a
 * new rev (Claude rewrote its list) may drop it, and then the words beside it say so for a few seconds.
 */
function liveProgress(j, now = Date.now()) {
  const m = progressModel(j, now);
  if (m.p === null) { held.delete(j.id); return m; }
  const h0 = held.get(j.id);
  let dropAt = h0?.dropAt ?? null;
  if (h0 && h0.rev === m.rev) { if (m.p < h0.v) { m.p = h0.v; m.percent = Math.max(m.percent ?? 0, h0.pc); } }
  else if (h0 && m.p < h0.v - 0.003) dropAt = now;
  held.set(j.id, { rev: m.rev, v: m.p, pc: m.percent ?? 0, dropAt });
  if (dropAt !== null && now - dropAt < NOTE_MS && j.phase !== 'paused') m.left = 'Claude rewrote its list';
  return m;
}
/** "12 s", "3 min", "1 h 5 min". */
function since(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}
/** "1 helper agent: reviewing the diff", "3 helper agents: mapping the code (Explore), reviewing the diff +1 more"; '' with none. */
function agentsLine(agents) {
  const list = Array.isArray(agents) ? agents : [];
  if (!list.length) return '';
  const word = (a) => { const w = a.what ? a.what.charAt(0).toLowerCase() + a.what.slice(1) : 'working'; return !a.kind || /^(general-purpose|helper|fork)$/i.test(a.kind) ? w : `${w} (${a.kind})`; };
  const shown = list.slice(0, 2).map(word).join(', ');
  return `${list.length} helper agent${list.length > 1 ? 's' : ''}: ${shown}${list.length > 2 ? ` +${list.length - 2} more` : ''}`;
}
/**
 * The drop-down's live lines (2026-10-21): what it is doing now, with how long, e.g. "Running the tests · npm test
 * (12 s)", and the helper agents. From the brain's activity; an older brain gives the task in hand.
 */
function describeNow(j, now = Date.now()) {
  const a = j.activity;
  if (!a) return { line: j.phase === 'paused' ? 'Paused' : j.current || (j.phase === 'working' ? 'Working' : ''), agents: '' };
  const line = a.now ? (a.now === 'Paused' ? a.now : `${a.now} (${since(now - a.since)})`) : j.phase === 'working' ? 'Working' : '';
  return { line, agents: agentsLine(a.agents) };
}
/** Keep an element's text live: `fn(now)` every frame while the strip (or rune panel) is on screen. */
function liveText(e, fn) {
  const tick = () => { const t = fn(Date.now()); if (e.textContent !== t) e.textContent = t; };
  tick(); anims.add(tick);
  return e;
}
/** A pill bound to a job: it creeps and steps by itself every frame. `getJob()` gives the latest job (or null). */
function livePill(w, ht, s, getJob, pal = SEA, glow = true) {
  const j = getJob(), m = liveProgress(j);
  const c = pill(w, ht, s, boundsOf(j), m.p, m.cur, pal, glow);
  anims.add(() => { const x = getJob(); if (!x) return; const n = liveProgress(x); c.setProgress(n.p, n.cur); });
  return c;
}

/** Claude marks its suggested option "(Recommended)"; the card shows it as the turquoise BEST tag instead. */
const BEST = /\s*\((recommended|best)\)\s*$/i;

/** A job from the wire, cut to sane sizes; anything malformed is dropped rather than drawn. */
function readJob(x) {
  if (!x || typeof x !== 'object' || typeof x.id !== 'string' || !x.id) return null;
  const phase = ['working', 'idle', 'paused', 'ended'].includes(x.phase) ? x.phase : 'idle';
  const tasks = (Array.isArray(x.tasks) ? x.tasks : []).slice(0, 40).map((t) => ({
    text: str(t?.text, 200), status: ['pending', 'in_progress', 'completed'].includes(t?.status) ? t.status : 'pending', active: str(t?.active, 200),
  }));
  return {
    // His own name for the session in the Claude app when it has one (claudenames.ts), else its folder's.
    id: x.id.slice(0, 100), machine: x.machine === 'mac' ? 'MAC' : 'PC', project: str(x.title, 60) || str(x.project, 60) || 'Claude', phase, tasks,
    startedAt: Number(x.startedAt) || 0, prompt: str(x.prompt, 200), current: str(x.current, 200),
    percent: Number.isFinite(x.percent) ? x.percent : null, etaMs: Number.isFinite(x.etaMs) ? x.etaMs : null,
    usage: x.usage && typeof x.usage === 'object' ? x.usage : null, open: str(x.open, 200), held: Math.max(0, Math.min(99, Number(x.held) || 0)),
    failed: x.failed === true, progress: readProgress(x.progress), activity: readActivity(x.activity), finished: x.finished === true,
  };
}
const num = (v) => (Number.isFinite(v) ? Number(v) : null);
/** The engine's numbers from the wire, or null (no list, or anything that does not add up). */
function readProgress(p) {
  if (!p || typeof p !== 'object') return null;
  const total = num(p.total), done = num(p.done);
  if (!total || total < 1 || done === null || done < 0 || done > total) return null;
  const pace = num(p.paceMs);
  return { done: Math.round(done), total: Math.round(total), cur: Math.round(num(p.cur) ?? -1), elapsedMs: Math.max(0, num(p.elapsedMs) ?? 0),
    at: num(p.at) ?? Date.now(), paceMs: pace !== null && pace > 0 ? pace : null, rev: Math.round(num(p.rev) ?? 0), rewroteAt: num(p.rewroteAt) };
}
function readActivity(a) {
  if (!a || typeof a !== 'object') return null;
  const agents = (Array.isArray(a.agents) ? a.agents : []).slice(0, 20).map((x) => ({ kind: str(x?.kind, 40), what: str(x?.what, 80), since: num(x?.since) ?? Date.now() }));
  return { now: str(a.now, 140), since: num(a.since) ?? Date.now(), agents };
}
function readWait(x) {
  if (!x || typeof x !== 'object' || typeof x.id !== 'string' || !x.id || typeof x.session !== 'string') return null;
  const kind = ['permission', 'question', 'plan'].includes(x.kind) ? x.kind : null;
  if (!kind) return null;
  const questions = kind === 'question' && Array.isArray(x.questions) ? x.questions.slice(0, 4).map((q) => ({
    question: str(q?.question, 500), header: str(q?.header, 40), multiSelect: q?.multiSelect === true,
    options: (Array.isArray(q?.options) ? q.options : []).slice(0, 8).map((o) => ({ label: str(o?.label, 200), description: str(o?.description, 500), plain: str(o?.plain, 500) })),
  })).filter((q) => q.question) : [];
  if (kind === 'question' && !questions.length && x.readonly !== true) return null;
  return { id: x.id.slice(0, 100), session: x.session.slice(0, 100), project: str(x.project, 60) || 'Claude', kind, tool: str(x.tool, 120),
    summary: str(x.summary, 300), plain: str(x.plain, 400), input: str(x.input, 2000), questions, plan: str(x.plan, 8000), canAlways: x.canAlways === true,
    readonly: x.readonly === true };
}

/**
 * Start the two zones. `typing` is the cockpit's typing area (cocktype.js), `isOpen` says whether the cockpit is open,
 * `withTyping(fn)` runs fn once the typing area is there (opening the cockpit first if it is closed), `onMine` puts what he
 * sent a session into the conversation, `onChange` asks the bubble to re-measure, and `onWaiting(has, fresh)` tells it
 * whether something is waiting (fresh: a new thing came to the top), so a closed bubble can speak the card.
 */
// Sheet 53 (2026-10-21): `stripOn` says whether the job bars are on screen. In the cockpit that is the cockpit being
// open; in the one speech bubble it is the jobs he opened from Claude's working mark (every running job, each folded).
export function startClaude({ typing, isOpen, withTyping, onMine, onChange, onWaiting, stripOn = isOpen }) {
  const strip = el('ckjobs'), pins = el('ckpins');
  let jobs = [], waits = [];
  const answered = new Set();        // answered here, still in the brain's last list until its next one
  let tracked = [], chose = false;   // remembered for the life of the page (his session), as the sheet asks
  let listOpen = false;
  const unfolded = new Set(), flipped = new Set();
  let shownId = null, topId = null;
  const steps = new Map();           // wait id -> { at, answers, picks }
  let targetId = null;               // the session the purple key pointed the typing area at
  let toast = null, toastTimer = 0;

  const send = (m) => window.aang?.claude?.(m);
  const jobOf = (id) => jobs.find((j) => j.id === id);
  const live = () => waits.filter((w) => !answered.has(w.id));
  /**
   * His decision (2026-10-21): the strip shows a job ONLY while it is working, or waiting on him (a question for him,
   * or paused). Idle and ended jobs never show. A job that finishes shows JOB COMPLETE (teal) for about four
   * seconds, then folds away by itself (his correction, 2026-10-21: "Nice" belongs only to the popped-out job window). With none of those, the strip takes no room at all.
   */
  const running = (j) => active(j) || waits.some((w) => w.session === j.id && !answered.has(w.id));
  /** Jobs seen at work in this page's life, so finishing can be told from never having started. */
  const wasActive = new Set();
  /** Finished and not yet folded away: id -> the job as it was when it finished. */
  const complete = new Map();
  /** Folding away now. */
  const leaving = new Set();
  /**
   * Sheet 52 (2026-10-21): jobs he held down and pulled out onto his desktop. They stay out of the bubble's list until
   * the pop-out is dropped back on Aang ('jobpop:back'); `arriving` is the one sliding back in on the next draw.
   */
  const popped = new Set(), arriving = new Set();
  /** Sheet 52: how long he holds a bar before it comes away, and how far the pointer may wander meanwhile. */
  const HOLD_MS = 500, HOLD_SLOP = 6;
  function noteFinished() {
    for (const j of jobs) {
      if (active(j)) { wasActive.add(j.id); complete.delete(j.id); continue; }
      if (wasActive.has(j.id) && !j.failed) { wasActive.delete(j.id); complete.set(j.id, j); }
    }
    // A job that vanished from the brain's list mid-work is simply forgotten: there is no finish to tell him about.
    for (const id of [...wasActive]) if (!jobOf(id)) wasActive.delete(id);
  }
  /** Put the waiting card away (a click outside, Esc, or it came while he was in Claude): no closed-bubble card until something new. */
  let parked = false;
  let jobsSig = '', pinsSig = '';

  /* ---------------------------------------------------------------- tracking */
  /**
   * His rules: the job started last is the one bar until he picks; up to two; tracking a third swaps out the older one;
   * a tracked job that ends hands its place to the next running one (the newest he is not already watching).
   */
  function retrack() {
    const run = jobs.filter(running).sort((a, b) => b.startedAt - a.startedAt);
    const next = () => run.find((j) => !tracked.includes(j.id));
    const before = tracked.length;
    tracked = tracked.filter((id) => run.some((j) => j.id === id));
    for (let lost = before - tracked.length; lost > 0; lost--) { const n = next(); if (n) tracked.push(n.id); }
    if (!chose && !tracked.length && run.length) tracked = [run[0].id];
  }
  function track(id) { chose = true; tracked = [...tracked.filter((x) => x !== id), id].slice(-2); listOpen = false; paintJobs(true); onChange(); }
  function untrack(id) { chose = true; tracked = tracked.filter((x) => x !== id); unfolded.delete(id); paintJobs(true); onChange(); }

  /* ---------------------------------------------------------------- the jobs strip */
  function flipEl(j, cls = '') {
    const f = btn('flip' + (flipped.has(j.id) ? ' back' : '') + cls, undefined, 'Flip: how much of your Claude week this job has used');
    const fi = h('span', 'fi');
    // The percent moves with the bar, live (the progress engine); nothing at all without a to-do list.
    fi.append(liveText(h('span', 'ff'), (now) => { const p = liveProgress(jobOf(j.id) ?? j, now).percent; return p === null ? '' : p + '%'; }), h('span', 'fb', weekOf(j)));
    f.append(fi);
    f.addEventListener('click', (e) => { e.stopPropagation(); if (flipped.has(j.id)) flipped.delete(j.id); else flipped.add(j.id); f.classList.toggle('back', flipped.has(j.id)); });
    return f;
  }
  function barOf(j) {
    const d = h('div', 'job' + (unfolded.has(j.id) ? ' open' : '') + (j.phase === 'paused' ? ' paused' : '') + (targetId === j.id ? ' sel' : ''));
    d.dataset.id = j.id;
    const hd = h('div', 'hd');
    const img = document.createElement('img'); img.src = CL; img.alt = '';
    const msg = btn('msg', undefined, 'Message this session'); msg.innerHTML = MSG;
    hd.append(img, h('b', '', j.project), h('span', 'mc', j.machine), h('span', 't', onOf(j)), flipEl(j), msg);
    const row2 = h('div', 'row2'), pb = h('span', 'pb');
    const paused = j.phase === 'paused';
    const latest = () => jobOf(j.id) ?? j;
    pb.append(livePill(84, 9, 2, latest, paused ? SLATE : SEA, !paused));
    row2.append(pb, liveText(h('span', 'lt'), (now) => leftOf(latest(), now)), h('i', 'chev'));
    d.append(hd, row2);
    if (j.held) { const q = h('div', 'queued'); q.append(h('i', '', 'QUEUED'), h('span', '', `${j.held} message${j.held > 1 ? 's' : ''}, after this task`)); d.append(q); }
    // The tracker, inside the bar (45f): ticked, the one in progress, the rest.
    const det = h('div', 'det'), inner = h('div'), list = h('div', 'list'), cur = curIndex(j);
    // What it is doing right now, above the tasks (2026-10-21): the tool running and for how long, then its helper agents.
    const act = h('div', 'act');
    act.append(liveText(h('div', 'an'), (now) => describeNow(latest(), now).line));
    if (j.activity?.agents?.length) act.append(liveText(h('div', 'ag'), (now) => describeNow(latest(), now).agents));
    list.append(act);
    j.tasks.forEach((t, k) => {
      const done = t.status === 'completed', now = !done && k === cur;
      const ob = h('div', 'ob' + (done ? ' done' : now ? ' now' : ''));
      ob.append(h('i'), h('span', 'tx', now && t.active ? t.active : t.text), h('span', 'r', done ? 'done' : now ? 'NOW' : ''));
      list.append(ob);
    });
    if (!j.tasks.length) list.append(h('div', 'ob now', 'Claude keeps no to-do list for this one, so there is no percent.'));
    const keys = h('div', 'ckeys');
    const pp = btn('key sm', paused ? 'Play' : 'Pause');
    pp.addEventListener('click', (e) => { e.stopPropagation(); send(paused ? { t: 'claude.play', session: j.id } : { t: 'claude.pause', session: j.id }); });
    const op = btn('key sm primary', 'Open in Claude');
    op.addEventListener('click', (e) => { e.stopPropagation(); if (j.open) window.aang?.openClaude?.(j.open); });
    keys.append(pp); if (j.open) keys.append(op);   // a terminal session has no app link to open
    const un = btn('untrack', 'STOP TRACKING');
    un.addEventListener('click', (e) => { e.stopPropagation(); untrack(j.id); });
    inner.append(list, keys, un); det.append(inner); d.append(det);
    msg.addEventListener('click', (e) => { e.stopPropagation(); pointAt(j); });
    // Sheet 52: in the speech bubble a bar can be held down and pulled out. Not in the wooden cockpit: its bars are the
    // tracked ones, and pulling one out there would fight the tracking rules.
    if (!isOpen()) holdToTear(d, j.id);
    if (arriving.delete(j.id) && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // Put back (sheet 52 section 4): it slides in from just above with a small settle, no placeholder.
      requestAnimationFrame(() => d.animate([{ opacity: 0, transform: 'translateY(-10px)' }, { opacity: 1, transform: 'translateY(2px)', offset: 0.75 }, { opacity: 1, transform: 'none' }], { duration: 340, easing: 'cubic-bezier(.32,.72,0,1)' }));
    }
    d.addEventListener('click', () => { if (unfolded.has(j.id)) unfolded.delete(j.id); else unfolded.add(j.id); d.classList.toggle('open', unfolded.has(j.id)); onChange(); setTimeout(onChange, 300); });
    return d;
  }
  /**
   * Sheet 52 section 3: press and hold a bar about half a second. A gold ring fills under his pointer; moving more than
   * 6 px or letting go early calls it off (so a plain click still unfolds and a scroll still scrolls). The buttons on
   * the bar keep their own clicks.
   */
  function holdToTear(d, id) {
    // `eat`: the click that follows is not a click on the bar (a hold that fired, or a press that wandered off as a drag).
    let timer = 0, x0 = 0, y0 = 0, ring = null, eat = false;
    const cancel = () => { clearTimeout(timer); timer = 0; ring?.remove(); ring = null; };
    d.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('button, .ckeys, .untrack, .flip, .msg')) return;
      cancel();
      x0 = e.clientX; y0 = e.clientY; eat = false;
      const r = d.getBoundingClientRect();
      ring = h('i', 'tearring');
      ring.style.left = Math.round(e.clientX - r.left) + 'px'; ring.style.top = Math.round(e.clientY - r.top) + 'px';
      d.append(ring);
      timer = setTimeout(() => { timer = 0; eat = true; ring?.remove(); ring = null; tearOff(id, d); }, HOLD_MS);
    });
    d.addEventListener('pointermove', (e) => { if (timer && Math.hypot(e.clientX - x0, e.clientY - y0) > HOLD_SLOP) { eat = true; cancel(); } });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) d.addEventListener(ev, cancel);
    // The click that ends a hold would unfold the bar as it leaves; one that ends a wander was never meant as a click.
    d.addEventListener('click', (e) => { if (eat) { eat = false; e.stopImmediatePropagation(); } }, true);
  }
  /**
   * It comes away (sheet 52 section 3): main.ts opens the pop-out under his pointer, and here the bar folds shut while
   * the ones below rise into its place with a tiny bounce. No empty slot; the bubble shrinks in the same breath
   * (bubble.js measures without anything marked ck-leaving).
   */
  function tearOff(id, d) {
    popped.add(id);
    unfolded.delete(id);
    window.aang?.jobPop?.(id);
    const finish = () => { if (d.isConnected) { paintJobs(true); onChange(); } };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { paintJobs(true); onChange(); return; }
    const rest = [...strip.children].filter((c) => c !== d && !c.classList.contains('ck-leaving'));
    if (!rest.length) strip.classList.add('ck-leaving');
    // A script animation, not a CSS transition: bubble.js measures with anything ck-leaving set to display:none, and
    // that cancels a CSS transition on the spot (the bar vanished at once and left the paper empty under the rest).
    // It runs on the balloon's own shrink (340 ms, cubic ease-out, bubble.js ease.close) so the two close together;
    // the 7 px gap beside it closes too, so nothing jumps when it is finally taken out.
    const cs = getComputedStyle(d), hgt = d.offsetHeight;
    const gap = rest.length ? (d.nextElementSibling ? { marginBottom: '-7px' } : { marginTop: '-7px' }) : {};
    d.classList.add('ck-leaving', 'going');
    d.animate([
      { height: hgt + 'px', paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom, opacity: 1 },
      { opacity: 0, offset: 0.55 },
      { height: '0px', paddingTop: '0px', paddingBottom: '0px', opacity: 0, ...gap },
    ], { duration: 340, easing: 'cubic-bezier(.33,1,.68,1)', fill: 'forwards' });
    onChange();
    // The next one along lands with a 4 px hop as the gap closes (the one above, when it was the last bar).
    const below = rest.find((c) => d.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING) ?? rest[rest.length - 1];
    if (below) setTimeout(() => { if (below.isConnected) below.animate([{ transform: 'none' }, { transform: 'translateY(-4px)' }, { transform: 'none' }], { duration: 220, easing: 'ease-out' }); }, 320);
    setTimeout(finish, 380);
  }
  /** Per finished job, the timer that folds its card away about four seconds after he could first see it. */
  const doneTimers = new Map();
  const DONE_SHOW_MS = 4000;
  /** JOB COMPLETE (teal, 2026-10-21): the finished job shows a moment, then folds away by itself and the rest close up. */
  function doneOf(j) {
    const d = h('div', 'jdone' + (leaving.has(j.id) ? ' ck-leaving going' : '')); d.dataset.id = j.id;
    if (leaving.has(j.id)) d.style.height = '0px';     // redrawn mid-fold: it stays folded
    const img = document.createElement('img'); img.src = CL; img.alt = '';
    const on = h('span', 'on'); on.append(h('i', 'jc', 'JOB COMPLETE'), h('b', '', j.project));
    const last = [...j.tasks].reverse().find((t) => t.status === 'completed');
    on.append(h('small', '', last?.text || j.prompt || 'All done'));
    d.append(img, on);
    // The clock starts when it is first drawn in the open cockpit, so a job finishing while he is away is still seen.
    if (!doneTimers.has(j.id)) doneTimers.set(j.id, setTimeout(() => {
      const now = [...strip.querySelectorAll('.jdone')].find((x) => x.dataset.id === j.id);
      if (now && stripOn() && !strip.hidden) acknowledge(j.id, now);
      else { doneTimers.delete(j.id); complete.delete(j.id); paintJobs(); }
    }, DONE_SHOW_MS));
    return d;
  }
  /**
   * Its time is up: a tiny bounce, then it folds shut (340 ms, Samara's ease) while the jobs under it close the gap, and the
   * cockpit shrinks in the same breath (bubble.js measures without anything marked ck-leaving). Reduced motion: at once.
   */
  function acknowledge(id, d) {
    if (leaving.has(id)) return;
    const instant = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const finish = () => { leaving.delete(id); complete.delete(id); doneTimers.delete(id); paintJobs(true); onChange(); };
    if (instant) { finish(); return; }
    d.classList.add('bounce');
    setTimeout(() => {
      // The strip may have been redrawn during the bounce: fold the card that is on screen now.
      d = [...strip.querySelectorAll('.jdone')].find((x) => x.dataset.id === id) ?? d;
      leaving.add(id);
      d.style.height = d.offsetHeight + 'px';
      // The last thing in the strip: the strip's own room goes with it, in the same motion.
      if (![...strip.children].some((c) => c !== d && !c.classList.contains('ck-leaving'))) strip.classList.add('ck-leaving');
      d.classList.add('ck-leaving', 'going');
      void d.offsetHeight;
      d.style.height = '0px';
      onChange();
      setTimeout(finish, 360);
    }, 120);
  }
  /**
   * Draw the strip. Skipped when nothing he would see has changed: the brain sends the job list again on every bit of
   * news (often every second or two), and redrawing (and so re-measuring the cockpit) for nothing made it twitch.
   * True when it drew.
   */
  function paintJobs(force = false) {
    retrack();
    // Sheet 52: a job out on his desktop is not in the speech bubble's list (the wooden cockpit tracks its own).
    const run = jobs.filter(running).filter((j) => isOpen() || !popped.has(j.id)).sort((a, b) => b.startedAt - a.startedAt);
    const done = [...complete.values()].filter((j) => !run.some((r) => r.id === j.id) && (isOpen() || !popped.has(j.id)));
    const sig = JSON.stringify([isOpen(), stripOn(), tracked, listOpen, [...unfolded], targetId, [...leaving], [...popped],
      // Not the percent, the time left or the live line: those update in place every frame (the progress engine), and
      // redrawing for them would re-measure the cockpit many times a second. Whether helper agents show is layout.
      run.map((j) => [j.id, j.project, j.machine, j.phase, pctOf(j) === null, onOf(j), j.held, weekOf(j), j.tasks.map((t) => t.status + t.text + t.active), Boolean(j.activity?.agents?.length)]),
      done.map((j) => [j.id, j.project, j.tasks.length])]);
    if (!force && sig === jobsSig) return false;
    jobsSig = sig;
    anims.clear();                   // the bars are drawn afresh; the old canvases stop breathing with them
    strip.replaceChildren();
    strip.classList.remove('ck-leaving');
    strip.hidden = !stripOn() || (!run.length && !done.length);
    animate(!strip.hidden);
    if (strip.hidden) return true;
    // In the speech bubble (sheet 53) every running job is its own folded bar, newest first; tracking is the cockpit's.
    const bars = isOpen() ? tracked : run.map((j) => j.id);
    for (const id of bars) { const j = jobOf(id); if (j) strip.append(barOf(j)); }
    for (const j of done) strip.append(doneOf(j));
    const others = run.filter((j) => !bars.includes(j.id));
    if (!others.length) return true;
    const o = h('div', 'others' + (listOpen ? ' open' : ''));
    const line = btn('oline'), dots = h('span', 'dots');
    for (let i = 0; i < Math.min(others.length, 6); i++) dots.append(h('i'));
    line.append(dots, document.createTextNode(`${others.length} OTHER JOB${others.length > 1 ? 'S' : ''} RUNNING`), h('i', 'chev'));
    line.addEventListener('click', (e) => { e.stopPropagation(); listOpen = !listOpen; o.classList.toggle('open', listOpen); onChange(); });
    const ol = h('div', 'olist');
    for (const j of others) {
      const r = h('div', 'orow' + (j.phase === 'paused' ? ' paused' : '')); r.dataset.id = j.id;
      const img = document.createElement('img'); img.src = CL; img.alt = '';
      const latest = () => jobOf(j.id) ?? j;
      const on = h('span', 'on'); on.append(h('b', '', j.project), liveText(h('small'), (now) => `${onOf(j) || j.machine} · ${leftOf(latest(), now)}`));
      const pb = h('span', 'pb2'), paused = j.phase === 'paused';
      pb.append(livePill(40, 7, 2, latest, paused ? SLATE : SEA, !paused));
      const k = btn('key sm', 'Track this'); k.dataset.track = j.id;
      k.addEventListener('click', (e) => { e.stopPropagation(); track(j.id); });
      r.append(img, on, pb, flipEl(j, ' op'), k);
      ol.append(r);
    }
    o.append(line, ol);
    strip.append(o);
    return true;
  }

  /* ---------------------------------------------------------------- the purple key: talk to that session */
  function pointAt(j) {
    withTyping(() => {
      typing.pointAt({
        label: j.project, placeholder: `Tell ${j.project} something`, when: true,
        onSend: (text, when) => { send({ t: 'claude.send', session: j.id, text, when }); onMine(text, j.project, when === 'after' ? 'AFTER THIS TASK' : ''); },
        onClear: () => { targetId = null; for (const b of strip.querySelectorAll('.job')) b.classList.remove('sel'); },
      });
      targetId = j.id;                // after pointAt: pointing elsewhere first clears the old one
      for (const b of strip.querySelectorAll('.job')) b.classList.toggle('sel', b.dataset.id === j.id);
    });
  }
  /** "No, and...", "Something else", "Change it": the typing area is pointed at the session for his own words. */
  function askWords(w, placeholder, onSend) {
    withTyping(() => {
      typing.pointAt({ label: w.project, placeholder, when: false, onSend, onClear: () => { targetId = null; paintJobs(true); } });
      targetId = w.session;
      paintJobs(true);
    });
  }

  /* ---------------------------------------------------------------- the pinned card */
  function done(w, said) {
    answered.add(w.id);
    steps.delete(w.id);
    if (said) onMine(said, w.project, '');
    paintPins(); onChange();
  }
  function answer(w, decision, message) {
    send({ t: 'claude.answer', id: w.id, decision, ...(message ? { message } : {}) });
    done(w, decision === 'allow' ? (w.kind === 'plan' ? 'Go' : 'Allow') : decision === 'always' ? 'Always allow' : decision === 'deny' ? 'No' : message);
  }
  function claudeWords(text) {
    const frag = document.createDocumentFragment();
    const cw = btn('cw'); cw.append(h('i'), document.createTextNode("CLAUDE'S WORDS"));
    const box = h('pre', 'cwbox', text); box.hidden = true;
    cw.addEventListener('click', (e) => { e.stopPropagation(); box.hidden = !box.hidden; onChange(); });
    frag.append(cw, box);
    return frag;
  }
  function stateOf(w) { let s = steps.get(w.id); if (!s) { s = { at: 0, answers: {}, picks: new Set() }; steps.set(w.id, s); } return s; }
  /** One question's answer is in: the next one, or all of them go together. */
  function nextQuestion(w, s) {
    if (s.at < w.questions.length - 1) { s.at++; s.picks = new Set(); paintPins(); onChange(); return; }
    send({ t: 'claude.answer', id: w.id, answers: { ...s.answers } });
    done(w, Object.values(s.answers).join(' / '));
  }
  function questionCard(card, w) {
    const s = stateOf(w), q = w.questions[Math.min(s.at, w.questions.length - 1)], n = w.questions.length;
    if (n > 1) {
      const st = h('div', 'stepper'), dots = h('span', 'dots');
      for (let i = 0; i < n; i++) dots.append(h('i', i < s.at ? 'done' : i === s.at ? 'now' : ''));
      st.append(dots, h('span', '', `QUESTION ${s.at + 1} OF ${n}`));
      if (s.at > 0) {
        const back = btn('sback', 'BACK');
        back.addEventListener('click', (e) => { e.stopPropagation(); s.at--; s.picks = new Set(); paintPins(); onChange(); });
        st.append(back);
      }
      card.append(st);
    }
    card.append(h('p', 'q', q.question));
    const list = h('div', 'opts glove' + (q.multiSelect ? ' multi' : '')), rows = [];
    const sendKey = btn('key sm primary');
    const count = () => {
      const k = s.picks.size, last = s.at === n - 1;
      sendKey.textContent = !k ? 'Pick at least one' : last ? `Send ${k} pick${k > 1 ? 's' : ''}` : `${k} pick${k > 1 ? 's' : ''}, next`;
      sendKey.disabled = !k;
    };
    q.options.forEach((o, i) => {
      const best = BEST.test(o.label), label = o.label.replace(BEST, '');
      const row = h('div', 'opt' + (s.picks.has(o.label) ? ' picked' : ''));
      if (q.multiSelect) row.append(h('i', 'mk box'));
      const lab = h('span', 'lab', label);
      if (best) lab.append(h('span', 'rec', 'BEST'));
      // The brain's everyday-words line when it has one (it arrives a few seconds later), else Claude's own explanation.
      if (o.plain || o.description) lab.append(h('small', 'hint', o.plain || o.description));
      row.append(lab, h('span', 'kc', String(i + 1)));
      row.addEventListener('mouseenter', () => rows.forEach((x) => x.classList.toggle('on', x === row)));
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        if (list.classList.contains('guard')) return;
        // Claude's exact label goes back (the brain matches labels to pass them on untouched); BEST is only how it is drawn.
        if (!q.multiSelect) { s.answers[q.question] = o.label; nextQuestion(w, s); return; }
        if (s.picks.has(o.label)) s.picks.delete(o.label); else s.picks.add(o.label);
        row.classList.toggle('picked', s.picks.has(o.label)); count();
      });
      rows.push(row); list.append(row);
    });
    const other = h('div', 'opt other');
    other.append(h('span', 'lab', 'Something else'), h('span', 'kc', String(q.options.length + 1)));
    other.addEventListener('mouseenter', () => rows.forEach((x) => x.classList.toggle('on', x === other)));
    other.addEventListener('click', (e) => {
      e.stopPropagation();
      askWords(w, `Tell ${w.project} what you want instead`, (text) => { s.answers[q.question] = text; nextQuestion(w, s); });
    });
    rows.push(other); list.append(other);
    rows[0].classList.add('on');
    // The bubble's own 600 ms guard (choiceList): a mouse already moving cannot land on a pick the moment it appears.
    list.classList.add('guard'); setTimeout(() => list.classList.remove('guard'), 600);
    card.append(list);
    if (q.multiSelect) {
      const row = h('div', 'sendrow'); row.append(sendKey, h('span', 'n', 'OR SOMETHING ELSE'));
      sendKey.addEventListener('click', (e) => { e.stopPropagation(); if (!s.picks.size) return; s.answers[q.question] = q.options.map((o) => o.label).filter((l) => s.picks.has(l)).join(', '); nextQuestion(w, s); });
      count(); card.append(row);
    }
    const asked = w.questions.map((x, i) => `${i + 1}. ${x.question}${x.multiSelect ? ' (pick any)' : ''}\n${x.options.map((o) => '   - ' + o.label + (o.description ? ': ' + o.description : '')).join('\n')}`).join('\n');
    card.append(claudeWords(`${w.tool || 'AskUserQuestion'}\n${asked}`));
  }
  function paintPins() {
    pins.replaceChildren();
    // Put away with the cockpit closed: nothing in the closed bubble until something new comes (it stays in the brain).
    const list = parked && !isOpen() ? [] : live();
    // Items arrive in priority order; "N MORE" steps through them, and the one he stepped to stays while it waits.
    if (!list.some((w) => w.id === shownId)) shownId = list[0]?.id ?? null;
    const w = list.find((x) => x.id === shownId);
    if (toast) pins.append(toast);
    pins.hidden = !w && !toast;
    if (!w) return;
    const card = h('div', `pin k-${w.kind} fadein`);
    if (list.length > 1) {
      const more = h('span', 'pmore', `${list.length - 1} MORE`); more.setAttribute('role', 'button'); more.title = 'The next thing waiting';
      more.addEventListener('click', (e) => { e.stopPropagation(); const i = list.indexOf(w); shownId = list[(i + 1) % list.length].id; paintPins(); onChange(); });
      card.append(more);
    }
    const tag = h('span', 'ctag'), img = document.createElement('img'); img.src = CL; img.alt = '';
    tag.append(img, document.createTextNode(w.project)); card.append(tag);
    // 2026-10-21: a wait the brain only knows of (it restarted while Claude was asking): Aang can show it but not
    // answer it, so the one key opens the session in Claude, where the question is still up.
    if (w.readonly) {
      card.append(h('p', 'q', w.plain || w.summary || `${w.project} is waiting for you.`), h('p', 'q', 'Open in Claude to answer.'));
      const keys = h('div', 'ckeys'), j = jobOf(w.session);
      if (j?.open) { const o = btn('key sm primary', 'Open in Claude'); o.addEventListener('click', (e) => { e.stopPropagation(); window.aang?.openClaude?.(j.open); }); keys.append(o); }
      card.append(keys);
      pins.append(card);
      return;
    }
    if (w.kind === 'question') questionCard(card, w);
    else if (w.kind === 'plan') {
      card.append(h('p', 'q', w.plain || w.summary || `${w.project} has a plan ready.`));
      const lines = w.plan.split('\n'), short = lines.slice(0, 4).join('\n');
      const fold = h('pre', 'planfold', short + (lines.length > 4 ? '\n…' : ''));
      card.append(fold);
      const keys = h('div', 'ckeys');
      const go = btn('key sm primary', 'Go'), ch = btn('key sm', 'Change it');
      go.addEventListener('click', (e) => { e.stopPropagation(); answer(w, 'allow'); });
      ch.addEventListener('click', (e) => { e.stopPropagation(); askWords(w, `Tell ${w.project} what to change`, (text) => answer(w, 'deny-message', text)); });
      keys.append(go, ch); card.append(keys);
      if (lines.length > 4) card.append(claudeWords(w.plan));
    } else {
      card.append(h('p', 'q', w.plain || w.summary || `${w.project} wants to use ${w.tool || 'a tool'}.`));
      const keys = h('div', 'ckeys');
      const key = (label, cls, go) => { const b = btn('key sm' + cls, label); b.addEventListener('click', (e) => { e.stopPropagation(); go(); }); keys.append(b); };
      key('Allow', ' primary', () => answer(w, 'allow'));
      if (w.canAlways) key('Always', '', () => answer(w, 'always'));
      key('No', '', () => answer(w, 'deny'));
      key('No, and...', '', () => askWords(w, `Tell ${w.project} why, or what to do instead`, (text) => answer(w, 'deny-message', text)));
      card.append(keys, claudeWords(`${w.tool}\n${w.input}`.trim()));
    }
    pins.append(card);
  }
  function say(why) {
    clearTimeout(toastTimer);
    toast = h('div', 'ctoast');
    const img = document.createElement('img'); img.src = CL; img.alt = '';
    toast.append(img, document.createTextNode(String(why).slice(0, 120)));
    paintPins(); onChange();
    toastTimer = setTimeout(() => { toast = null; paintPins(); onChange(); }, 6000);
  }

  /* ---------------------------------------------------------------- the brain */
  window.aang?.onMessage?.((m) => {
    if (m?.t === 'claude.jobs' && Array.isArray(m.jobs)) {
      jobs = m.jobs.slice(0, 50).map(readJob).filter(Boolean);
      noteFinished();
      // Only when something he would see changed (2026-10-21): the same list again must not re-measure the cockpit.
      if (paintJobs()) onChange();
      // The bars, percents and live lines that were not redrawn move now, not at the next breath (2026-10-21).
      else kick();
      notePaint(m.lat);
    } else if (m?.t === 'claude.wait' && Array.isArray(m.items)) {
      waits = m.items.slice(0, 50).map(readWait).filter(Boolean);
      for (const id of [...answered]) if (!waits.some((w) => w.id === id)) answered.delete(id);
      for (const id of [...steps.keys()]) if (!waits.some((w) => w.id === id)) steps.delete(id);
      const top = live()[0]?.id ?? null;
      // The brain marks the list quiet while he is in the Claude app (2026-10-21, core.ts FrontGate): Claude is already
      // showing him the question, so nothing pops up here; it waits (parked) for the next time he opens Aang.
      const fresh = top !== null && top !== topId && m.quiet !== true;
      if (top !== null && top !== topId && m.quiet === true) parked = true;
      if (fresh) parked = false;
      topId = top;
      const sig = JSON.stringify([live().map((w) => [w.id, w.plain, w.summary, w.questions.map((q) => q.options.map((o) => o.plain))]), parked]);
      if (sig !== pinsSig || fresh) { pinsSig = sig; paintPins(); onChange(); }
      // A job waiting on him shows in the strip (and leaves it once answered).
      if (paintJobs()) onChange();
      onWaiting(top !== null && !parked, fresh);
    } else if (m?.t === 'claude.said' && m.ok === false && typeof m.why === 'string') {
      say(m.why);
    }
  });

  return {
    /** The cockpit opened or closed: the strip only lives in the open cockpit; the card lives in both. */
    setOpen(on) { if (!on) { listOpen = false; typing.clearTarget?.(); } paintJobs(true); paintPins(); },
    /** Something is waiting on him (the card is up), so a closed bubble must not fade under it. Not once put away. */
    waiting: () => live().length > 0 && !parked,
    /**
     * He clicked outside (or pressed Esc) with the card up (2026-10-21): it goes from the closed bubble but stays waiting
     * in the brain, unanswered, and is pinned again the next time he opens Aang.
     */
    park() { parked = true; paintPins(); },
    /** Opening Aang shows what is still waiting, put away or not. */
    unpark() { parked = false; paintPins(); },
    /** Sheet 53: something is waiting on him in the brain, put away or not (a click on the working mark brings it back). */
    anyWaiting: () => live().length > 0,
    /** Sheet 53: how many jobs are at work or waiting on him (what a click on the working mark would show). */
    // Not counting the ones out on his desktop (sheet 52): they are not in the bubble's list.
    running: () => jobs.filter((j) => running(j) && !popped.has(j.id)).length,
    /** Sheet 52: the pop-out was dropped on Aang. The bar slides back into the list (the bubble grows to take it). */
    putBack(id) {
      if (!popped.delete(id)) return;
      arriving.add(id);
      // With the jobs not open it waits for the next draw (bubble.js opens them on a put-back), and slides in then.
      paintJobs(true); onChange();
    },
    /** Sheet 52: which jobs are out on his desktop now (the test reads it). */
    poppedIds: () => [...popped],
    /** Sheet 52: the pop-out's "needs you" chip: this wait goes to the top of the card, put away or not. */
    showWait(id) { if (!live().some((w) => w.id === id)) return false; shownId = id; parked = false; paintPins(); onChange(); return true; },
    /** Sheet 52: the pop-out's Message: the typing box is pointed at that session, as its purple key does. */
    messageJob(id) { const j = jobOf(id); if (!j) return false; pointAt(j); return true; },
    /** Sheet 53: the jobs view opened or closed in the speech bubble: draw the bars (or take them away) now. */
    refresh() { paintJobs(true); },
    /**
     * Not enough room: the list of other jobs folds first (sheet 45g's rule), then the tasks of a bar he unfolded earlier
     * (the one he just opened only when `evenHis`: nothing else is left). Redrawn rather than animated, so the next measure already sees the folded height.
     * True when it did.
     */
    fold(evenHis = false) {
      if (listOpen) listOpen = false;
      else if (unfolded.size > (evenHis ? 0 : 1)) unfolded.delete([...unfolded][0]);
      else return false;
      // Forced: a bar or the list opened by a click changes the page without a redraw, so the last drawing's
      // signature cannot tell this fold from "nothing changed".
      paintJobs(true); return true;
    },
  };
}

// C7 (2026-10-21): Samara's rune panel (rune.js) draws the same job card, so it borrows these rather than copying them.
// Additive only: nothing above changes for the cockpit.
export { pill, animate, anims, SEA, SLATE, MSG, CL, readJob, curIndex, boundsOf, pctOf, leftOf, onOf, h, btn };
// The progress engine (2026-10-21): one model and one live look for every Claude bar. rune.js (and the pop-out) should
// draw with livePill / liveText / liveProgress / describeNow rather than pill(pctOf(...)), so its bars creep, step and
// never go back exactly as the cockpit's do.
export { progressModel, liveProgress, livePill, liveText, describeNow, agentsLine, creep, DEFAULT_PACE_MS, SLOT_CAP };
// 2026-10-21: move every live bar now (the brain's news just landed), and time the paint against the event.
export { kick, notePaint };

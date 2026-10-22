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

import { barNow, EtaSteady, etaRange, etaWords, overallNow, overallWords, remaining, roundLeft, seedOf } from './progressmath.js';

const CL = 'art/claude-icon.png';
// The 45f pill's palettes, verbatim; SLATE is 45d's dusk slate (154,168,192) for a paused job, shaded the same way.
const SEA = ['#d9f3ee', '#b2e6dd', '#8ad5c9', '#6cc3b6', '#58b0a3', '#479a8e', '#3a857a', '#2f6f66'];
const SEA_NOW = ['#f4fcfa', '#e2f6f1', '#cdeee6', '#b8e5db', '#a4dbcf', '#90cfc2', '#7fc2b5', '#6fb3a6'];
// Paused is his final slate, #6f7787 (2026-10-21 mark colours), shaded light to dark the same way around it.
const SLATE = ['#c9ced8', '#aeb4c0', '#959cab', '#7f8798', '#6f7787', '#626a7a', '#555c6b', '#474d5a'];
/** Eight shades light to dark round one colour, the way SEA and SLATE are shaded (v3 state colours, 2026-10-21). */
function shades(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const at = (k) => '#' + c.map((v) => Math.round(k < 0 ? v + (255 - v) * -k : v * (1 - k)).toString(16).padStart(2, '0')).join('');
  return [-0.7, -0.5, -0.3, -0.15, 0, 0.12, 0.25, 0.38].map(at);
}
// v3 (2026-10-21, docs/PROGRESS-RESEARCH.md section 4): waiting on him is his "needs you" blue (the marks' #7cc4ff),
// a stall is amber with the bar frozen, failed is red, done is teal.
const BLUE = shades('#5aa6e0');
const AMBER = shades('#d98a2b');
const RED = shades('#c4453a');
const TEAL = shades('#3fc4b4');
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
 * The pill. `p` is 0..1, or null for no percent (no to-do list: the empty, STILL track, with one lit pip per finished
 * tool call when there are any, v3). `c.setProgress(p, cur, o)` moves it without a new canvas (the live updater calls
 * it every frame; it redraws only when a whole art pixel, the colour, the notches or the pips change). `o` (v3,
 * 2026-10-21) may change the palette (amber when stalled, blue when it waits on him, red failed, teal done), whether
 * the current piece breathes (never while stalled: stillness means stillness), the notches (time-weighted slices) and
 * the pips.
 */
function pill(w, ht, s, bounds, p, cur, pal = SEA, glow = true) {
  const c = document.createElement('canvas'); c.className = 'jpill'; c.width = w; c.height = ht; c.style.width = w * s + 'px'; c.style.height = ht * s + 'px';
  const g = c.getContext('2d'), r = Math.floor(ht / 2);
  const st = { p: p === null || !Number.isFinite(p) ? null : Math.max(0, Math.min(1, p)), cur, pal, glow, bounds, pips: 0 };
  const P = (x, y, col, a = 1) => { g.globalAlpha = a; g.fillStyle = col; g.fillRect(x, y, 1, 1); g.globalAlpha = 1; };
  const inside = (x, y) => { const cx = x < r ? r - .5 : x > w - 1 - r ? w - 1 - r + .5 : x, cy = y < r ? r - .5 : y > ht - 1 - r ? ht - 1 - r + .5 : y; return Math.hypot(x - cx, y - cy) <= r + .15; };
  const draw = (t) => {
    g.clearRect(0, 0, w, ht);
    for (let y = 0; y < ht; y++) for (let x = 0; x < w; x++) { if (!inside(x, y)) continue; const rim = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1); P(x, y, rim ? (y < ht / 2 ? '#6a4628' : '#3a2414') : y === 1 ? '#1a100a' : '#2a1a10'); }
    const inner = w - 2, cur = st.cur, pl = st.pal, bd = st.bounds;
    const paint = (x0, x1, pal, al) => { for (let x = x0; x < x1; x++) for (let y = 1; y < ht - 1; y++) { if (!inside(x, y) || !(inside(x - 1, y) && inside(x + 1, y) && inside(x, y - 1) && inside(x, y + 1))) continue; P(x, y, pal[Math.min(7, Math.round((y - 1) / (ht - 3) * 7))], al); } };
    // No percent: the empty track, perfectly still (his rule: nothing spins or sweeps), with a lit pip per finished
    // tool call (v3, research section 4: "activity-stepped"), so it moves only when something really happened.
    if (st.p === null) {
      const room = Math.floor((w - 2 * r) / 4);
      for (let k = 0; k < Math.min(st.pips, room); k++) { const x = r + 1 + k * 4, y = Math.floor(ht / 2); P(x, y, pl[1]); P(x + 1, y, pl[2]); if (ht > 6) { P(x, y - 1, pl[0], .8); P(x + 1, y - 1, pl[1], .8); } }
      return;
    }
    const fw = Math.round(inner * st.p);
    if (st.glow && cur >= 0 && cur < bd.length) { const a = cur > 0 ? bd[cur - 1] : 0, b = bd[cur]; paint(1 + Math.round(inner * a), 1 + Math.round(inner * b), SEA_NOW, .7 + .2 * Math.sin(t / 7)); }
    paint(1, 1 + fw, pl, 1);
    for (let x = 2; x < fw; x++) if (inside(x, 2)) P(x, 2, '#fff', .45);
    for (const q of bd.slice(0, -1)) { const x = 1 + Math.round(inner * q); for (let y = 2; y < ht - 2; y++) P(x, y, '#2a1a10', .45); }
    if (fw > 1) for (let y = 1; y < ht - 1; y++) { P(fw, y, '#fffaf0'); P(fw + 1, y, '#fff3d8', .5); }
  };
  anims.add((t) => { if (st.glow && st.p !== null) draw(t); });
  draw(tk);
  const px = (x) => (x === null ? -1 : Math.round((w - 2) * x));
  const notchKey = (b) => b.map((q) => Math.round((w - 2) * q)).join(',');
  c.setProgress = (np, ncur = st.cur, o = {}) => {
    const v = np === null || !Number.isFinite(np) ? null : Math.max(0, Math.min(1, np));
    const pal2 = o.pal ?? st.pal, glow2 = o.glow ?? st.glow, bd2 = o.bounds ?? st.bounds, pips2 = o.pips ?? st.pips;
    if (px(v) === px(st.p) && ncur === st.cur && pal2 === st.pal && glow2 === st.glow && pips2 === st.pips && notchKey(bd2) === notchKey(st.bounds)) return;
    st.p = v; st.cur = ncur; st.pal = pal2; st.glow = glow2; st.bounds = bd2; st.pips = pips2;
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
    const s = (globalThis.aangProgressLat ??= { count: 0, last: 0, worst: 0, recent: [], p50: 0, p95: 0, p99: 0 });
    s.count++; s.last = ms; s.worst = Math.max(s.worst, ms);
    // v3 (research section 5): a rolling record of the last 200, its p50/p95/p99 kept current and said every 200
    // events with the trace on. The latency check fails when p99 from the session's event to paint is over 150 ms.
    s.recent.push(ms); if (s.recent.length > 200) s.recent.shift();
    const q = [...s.recent].sort((a, b) => a - b), at = (f) => q[Math.min(q.length - 1, Math.floor(q.length * f))];
    s.p50 = at(0.5); s.p95 = at(0.95); s.p99 = at(0.99);
    if (lat.trace === true) console.log(`progress trace: ${lat.type} event->paint ${ms} ms (shell->paint ${Date.now() - (lat.sh ?? lat.tx)} ms)`);
    if (lat.trace === true && s.count % 200 === 0) console.log(`progress trace: event->paint p50 ${s.p50} ms, p95 ${s.p95} ms, p99 ${s.p99} ms (${s.count} pushes)`);
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
  // 2026-10-21 (his report: "Aang/Samara · Working" over a bar that also read "Working"): with no list and nothing in
  // hand the title line stays quiet. "Working" is said once, beside the bar (leftOf), and the live line says what it is doing.
  const what = j.current || (i >= 0 ? j.tasks[i].active || j.tasks[i].text : '');
  return n && i >= 0 ? `${what} · task ${i + 1} of ${n}` : what;
}
/* ---- THE PROGRESS ENGINE, the Shell's half. v3, 2026-10-21 (docs/PROGRESS-RESEARCH.md; the rules head
   src/Core/src/claudeprogress.ts). The brain sends the numbers (progressmath.ts ProgressV3: the finished items' real
   working time, the item in hand's expected duration and working time so far, the pending items' expected durations,
   the speed factor, the squeeze, the last sign of life and the silence allowed); every frame this draws from them with
   the brain's own arithmetic (progressmath.js, checked against the brain's in the Core tests):
     - the bar is weighted by time and creeps by working time; a late item keeps inching (no 90% wall);
     - a rewritten list squeezes the rest of the bar, never pulls it back; the time left rises and says why once;
     - silence past the limit freezes the bar, turns it amber and says "No sign of life for N min";
     - waiting on him is blue (his "needs you" colour) and stops the clock; failed is red; done is teal;
     - the time left shows only once earned, rounded, "about" or a range, steady (it changes past 15%, or after 3 s).
   One model, used by the jobs strip, the job cards, Samara's rune and panel, and the pop-out. A brain from before v3
   (progress without `v`) still draws, the old way. ---- */
const DEFAULT_PACE_MS = 120_000;
const SLOT_CAP = 0.9;
/** v2 only (a brain from before v3): share of a slot crept after `f` paces. */
function creep(f) {
  if (!(f > 0)) return 0;
  return Math.min(SLOT_CAP - 1e-6, f <= 0.6 ? f : 0.6 + 0.3 * (1 - Math.exp(-(f - 0.6) / 0.6)));
}
const NOTE_MS = 6000;
/** "about 12 min left", or null (v2 and the no-progress path). */
function aboutLeft(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return null;
  if (ms < 60_000) return 'about a minute left';
  const m = Math.round(ms / 60000);
  return m >= 60 ? `about ${Math.floor(m / 60)} h ${m % 60} min left` : `about ${m} min left`;
}
/** Per job: the steady words and the last Monte Carlo spread (worked out about once a second, research 3.2). */
const words = new Map();
const wordsOf = (id) => { let w = words.get(id); if (!w) { w = { s: new EtaSteady(), mcAt: -1e9, ratio: 1, key: '' }; words.set(id, w); if (words.size > 60) words.delete(words.keys().next().value); } return w; };
const isWaiting = (j) => /^Waiting for/.test(j.activity?.now ?? '');
/** The helper agents' clocks, for the floor a foreground one puts under the item's time left. */
const agentClocks = (j) => (j.activity?.agents ?? []).map((a) => ({ since: a.since, est: a.est, fg: a.fg, failed: a.failed, endedAt: a.endedAt }));
/** "No sign of life for 4 min". */
const silentWords = (ms) => `No sign of life for ${ms < 120_000 ? '1 min' : Math.floor(ms / 60_000) + ' min'}`;
/** No list: still a stall when nothing has been heard for too long (the activity carries the same two numbers). */
function stalledNoList(j, now) {
  const a = j.activity;
  if (j.phase !== 'working' || isWaiting(j) || !a || !Number.isFinite(a.aliveAt) || !Number.isFinite(a.stallMs)) return 0;
  const s = now - a.aliveAt;
  return s > a.stallMs ? s : 0;
}
/** The notches, time-weighted: each finished item at its share of the real time, the rest at their expected time. */
function boundsV3(pr, b) {
  const r = pr.r > 0 ? pr.r : 1, out = [];
  const curW = pr.curEst ? b.e + remaining(pr.curEst, b.e) : 0;
  const pend = pr.pend.map((x) => Math.exp(x.mu + (x.sigma * x.sigma) / 2) * r);
  const doneEach = pr.done ? pr.doneW / pr.done : 0;
  const parts = [...Array(pr.done).fill(doneEach), ...(pr.cur >= 0 ? [curW] : []), ...pend];
  const total = parts.reduce((a, x) => a + x, 0);
  if (!(total > 0) || parts.length !== pr.total) return pr.total ? Array.from({ length: pr.total }, (_, i) => (i + 1) / pr.total) : [1];
  let s = 0;
  for (const x of parts) { s += x; out.push(s / total); }
  return out;
}
/**
 * Where a job's bar stands at `now`, from the brain's numbers alone (no memory of earlier frames but the steady words).
 * { p: 0..1 or null (no list), percent, cur, etaMs (only when earned), left (the words beside the bar), state
 *   (working | waiting | stalled | failed | paused | done | idle), stalled, silentMs, bounds (notches), pips, rev }.
 */
function progressModel(j, now = Date.now()) {
  const pr = j.progress, paused = j.phase === 'paused', working = j.phase === 'working';
  const pips = Math.max(0, Number(j.activity?.pips) || 0);
  const flat = { bounds: [1], pips, stalled: false, silentMs: 0, rev: 0, rewroteAt: null };
  const failed = j.failed === true && !working;
  // A one-step job (no to-do list) whose turn ended on its own is complete: the bar fills (2026-10-21).
  if (!pr && j.finished && !working && !paused) return { ...flat, p: 1, percent: 100, cur: -1, etaMs: 0, left: 'Done', state: 'done' };
  if (!pr) {
    const pc = pctOf(j), silent = stalledNoList(j, now);
    const state = failed ? 'failed' : paused ? 'paused' : isWaiting(j) ? 'waiting' : silent ? 'stalled' : working ? 'working' : 'idle';
    const left = failed ? 'Stopped on an error' : paused ? 'Paused' : silent ? silentWords(silent) : state === 'waiting' ? j.activity.now : j.etaMs === 0 || pc === 100 ? 'All tasks done' : aboutLeft(j.etaMs) ?? (working ? 'Working' : 'Resting');
    return { ...flat, p: pc === null ? null : pc / 100, percent: pc, cur: j.tasks.length ? curIndex(j) : -1, etaMs: j.etaMs, left, state, stalled: !!silent, silentMs: silent, bounds: boundsOf(j) };
  }
  if (pr.v !== 3) return modelV2(j, now);
  const b = barNow(pr, working, now, agentClocks(j));
  const doneAll = pr.done >= pr.total;
  const state = failed ? 'failed' : paused ? 'paused' : isWaiting(j) ? 'waiting' : b.stalled ? 'stalled' : doneAll ? 'done' : working ? 'working' : 'idle';
  const earned = pr.earned && b.jobW >= 20_000 && !b.stalled;
  let left;
  if (failed) left = 'Stopped on an error';
  else if (paused) left = 'Paused';
  else if (state === 'waiting') left = j.activity.now;
  else if (b.stalled) left = silentWords(b.silentMs);
  else if (doneAll) left = 'All tasks done';
  else if (earned && working) {
    const w = wordsOf(j.id), key = `${pr.rev}|${pr.done}|${pr.cur}`;
    // The spread from 500 seeded draws, about once a second (or at once when the list moved): "about" or a range.
    if (now - w.mcAt >= 1000 || w.key !== key) {
      const mc = etaRange(pr.curEst, b.e, pr.pend, pr.r, seedOf(j.id + '|' + pr.rev));
      w.ratio = mc.p50 > 0 ? mc.p80 / mc.p50 : 1; w.mcAt = now; w.key = key;
    }
    left = w.s.update(b.left, etaWords(b.left, w.ratio), now);
    // The reason, once: a note from the brain ("Claude added 3 steps", "Tidying its memory") or the item running late.
    const note = pr.note && now - pr.note.at < NOTE_MS ? pr.note.text : w.s.roseAt !== null && now - w.s.roseAt < NOTE_MS ? (b.late ? 'Taking longer than usual' : '') : '';
    if (note) left = `${left} · ${note}`;
  } else left = working ? (pr.note && now - pr.note.at < NOTE_MS ? pr.note.text : 'Working') : 'Resting';
  return { p: doneAll ? 1 : b.p, percent: doneAll ? 100 : Math.floor(b.p * 100), cur: pr.cur, etaMs: earned ? b.left : doneAll ? 0 : null, left, state,
    stalled: b.stalled, silentMs: b.silentMs, bounds: boundsV3(pr, b), pips, rev: pr.rev, rewroteAt: pr.rewroteAt };
}
/** A brain from before v3: ticked tasks plus a creep by the median pace, capped at 90% of the slot. */
function modelV2(j, now) {
  const pr = j.progress, paused = j.phase === 'paused', working = j.phase === 'working';
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
  const state = paused ? 'paused' : pr.done >= pr.total ? 'done' : working ? 'working' : 'idle';
  return { p, percent: pr.done >= pr.total ? 100 : Math.floor(p * 100), cur: pr.cur, etaMs: eta, left, rev: pr.rev, rewroteAt: pr.rewroteAt, state,
    stalled: false, silentMs: 0, bounds: boundsOf(j), pips: 0 };
}
/** Per job: the furthest its bar has been drawn in this window, and under which list (rev). */
const held = new Map();
/**
 * progressModel, kept from ever going back. v3: the brain's squeeze already keeps it from dropping; this holds the
 * furthest it has been drawn as a backstop (a new speed factor after a tick can shave a hair off). v2: only a new rev
 * (Claude rewrote its list) may drop it, and then the words say so for a few seconds.
 */
function liveProgress(j, now = Date.now()) {
  const m = progressModel(j, now);
  if (m.p === null) { held.delete(j.id); return m; }
  const h0 = held.get(j.id);
  if (j.progress?.v === 3) {
    if (h0 && h0.v3 && m.p < h0.v) { m.p = h0.v; m.percent = Math.max(m.percent ?? 0, h0.pc); }
    held.set(j.id, { v3: true, v: m.p, pc: m.percent ?? 0 });
    return m;
  }
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
/** "1 min 30 s" for a command's usual time ("usually 1 min 30 s"). */
function usual(ms) {
  const s = Math.max(1, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60), r = s % 60;
  return m < 60 ? (r && m < 10 ? `${m} min ${Math.round(r / 5) * 5} s`.replace(/ 0 s$/, '') : `${m} min`) : `${Math.floor(m / 60)} h ${m % 60} min`;
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
 * (40 s, usually 1 min 30 s)", and the helper agents. Stalled (v3): "Last: Running the tests (6 min)", since the words
 * beside the bar already say "No sign of life for 6 min". From the brain's activity; an older brain gives the task in hand.
 */
// 2026-10-21 (his report: a job with no to-do list read "Working" two or three times): with nothing more to say than
// that it works, this line stays empty. The words beside the bar (leftOf) already say "Working", once.
function describeNow(j, now = Date.now()) {
  const a = j.activity;
  if (!a) return { line: j.phase === 'paused' ? 'Paused' : j.current || '', agents: '' };
  if (!a.now) return { line: '', agents: agentsLine(a.agents) };
  if (a.now === 'Paused' || isWaiting(j)) return { line: a.now, agents: agentsLine(a.agents) };
  const m = liveProgress(j, now);
  const tool = a.tool && a.tool.since === a.since ? `, usually ${usual(a.tool.usual)}` : '';
  const line = m.stalled ? `Last: ${a.now} (${since(now - a.since)})` : `${a.now} (${since(now - a.since)}${tool})`;
  return { line, agents: agentsLine(a.agents) };
}
/**
 * The words under the rune panel's big percent (2026-10-21, his report: "—% all done · Working"). With a list:
 * "done · about 12 min left", and "all done" only when every task is. With no list there is no percent, so just the
 * state ("Paused", "Resting"), and nothing at all when the ON NOW line above already says it (`said`), so "Working" is
 * never said twice.
 */
function runeHeadLine(j, now = Date.now(), said = '') {
  const m = liveProgress(j, now);
  if (m.percent === null) return m.left === said || m.left === 'Working' ? '' : m.left;
  if (m.percent >= 100) return 'all done';
  return m.stalled || m.state === 'waiting' ? m.left : `done · ${m.left}`;
}
/** Keep an element's text live: `fn(now)` every frame while the strip (or rune panel) is on screen. */
function liveText(e, fn) {
  const tick = () => { const t = fn(Date.now()); if (e.textContent !== t) e.textContent = t; };
  tick(); anims.add(tick);
  return e;
}
/** The colour of a bar in each state (v3): his sea while working, his blue when it waits on him, amber stalled, red failed, teal done. */
function palFor(state, base = SEA) {
  return state === 'paused' ? SLATE : state === 'waiting' ? BLUE : state === 'stalled' ? AMBER : state === 'failed' ? RED : state === 'done' ? TEAL : base;
}
/** A pill bound to a job: it creeps, steps, freezes and changes colour by itself every frame. `getJob()` gives the latest job (or null). */
function livePill(w, ht, s, getJob, pal = SEA, glow = true) {
  const j = getJob(), m = liveProgress(j);
  const c = pill(w, ht, s, m.bounds ?? boundsOf(j), m.p, m.cur, palFor(m.state, pal), glow && m.state === 'working');
  const upd = () => { const x = getJob(); if (!x) return; const n = liveProgress(x); c.setProgress(n.p, n.cur, { pal: palFor(n.state, pal), glow: glow && n.state === 'working', bounds: n.bounds ?? boundsOf(x), pips: n.pips ?? 0 }); };
  upd(); anims.add(upd);
  return c;
}
/** A small live bar for one thing with its own clock (a command, a helper agent, a CI run): `frac(now)` 0..1 or null. */
function miniPill(w, frac, palFn) {
  const v0 = frac(Date.now());
  const c = pill(w, 5, 2, [1], v0, -1, palFn ? palFn() : SEA, false);
  anims.add(() => c.setProgress(frac(Date.now()), -1, palFn ? { pal: palFn() } : {}));
  return c;
}
/** "about 2 min", or "under a minute" (never "about under a minute"). */
const aboutShort = (ms) => (ms < 45_000 ? 'under a minute' : `about ${roundLeft(ms)}`);
/** A thing that started `since` with expected duration `est`: how far along, by the same overrun curve as the bars. */
const fracOf = (est, e) => (est && e >= 0 ? (e > 0 ? e / (e + remaining(est, e)) : 0) : null);

/**
 * OVERALL (v3, research 3.8 and his Waymark mod): the project's phase plan, when Claude keeps one. A row with its own
 * bar: "OVERALL · phase 2 of 5 · about 6 h of build left, maybe 9". The job's own bar under it is CURRENT.
 */
function liveOverall(getJob, w = 84) {
  const j = getJob();
  if (!j?.plan) return null;
  const row = h('div', 'ovr');
  const at = (now) => { const x = getJob(); return x?.plan ? overallNow(x.plan, now, seedOf(x.project || x.id)) : null; };
  row.append(h('b', 'tag', 'OVERALL'), miniPill(w, (now) => at(now)?.p ?? null, () => SEA),
    liveText(h('span', 'ow'), (now) => { const o = at(now); return o ? `phase ${o.phase} of ${o.of} · ${overallWords(o.p50, o.p80) || 'nearly there'}` : ''; }));
  return row;
}

/**
 * The rows under the live line (v3): the running command's sub-bar when its history knows it, each helper agent
 * ("Explore · mapping the code · 14 tool calls · about 1 min", a bar once its type has 3 runs behind it; red when it
 * failed), and the repo's CI runs ("CI · iOS build · step 9 of 12 · about 2 min"; "waiting for a runner · 40 s").
 * Built from the job as it is now; the caller redraws when the set of rows changes (rowsKey).
 */
function liveRows(getJob, w = 60) {
  const j = getJob(), box = h('div', 'rows');
  const a = j?.activity;
  if (a?.tool) {
    const t0 = a.tool;
    const r = h('div', 'sub');
    r.append(miniPill(w, (now) => { const x = getJob()?.activity?.tool; return x && x.since === t0.since ? fracOf(x.est, now - x.since) : null; }, () => SEA),
      liveText(h('span'), (now) => { const x = getJob()?.activity?.tool; return x && x.since === t0.since ? `${since(now - x.since)} of usually ${usual(x.usual)}` : ''; }));
    box.append(r);
  }
  // 2026-10-21 (sheet 58, his pick C): the helper agents left these rows; they now sit right under the job's own bar,
  // always in view (liveAgents below), so they are not drawn twice.
  for (const c0 of j?.ci ?? []) {
    const id = c0.id, r = h('div', 'crow ' + c0.status + (c0.conclusion && c0.conclusion !== 'success' ? ' failed' : ''));
    const cur = () => getJob()?.ci?.find((x) => x.id === id) ?? c0;
    const sel = (x, now) => (x.progress ? barNow(x.progress, true, now) : null);
    if (c0.status === 'in_progress' && c0.progress) r.append(miniPill(Math.round(w * 0.7), (now) => sel(cur(), now)?.p ?? null, () => SEA));
    r.append(liveText(h('span'), (now) => {
      const x = cur(), head = `CI · ${x.workflow}`;
      if (x.status === 'queued') return `${head} · waiting for a runner · ${since(now - (x.createdAt || now))}`;
      if (x.status === 'completed') return `${head} · ${x.conclusion === 'success' ? 'passed' : x.conclusion || 'ended'}`;
      const b = sel(x, now), step = x.steps ? ` · step ${x.stepNo} of ${x.steps}` : '';
      return `${head}${step}${b && x.progress?.earned ? ` · ${aboutShort(b.left)}` : x.startedAt ? ` · ${since(now - x.startedAt)}` : ''}`;
    }));
    box.append(r);
  }
  return box.childElementCount ? box : null;
}
/** What changes the rows' layout (not their numbers): for the redraw signatures. */
// The helpers' ids only (2026-10-21, sheet 58 C): their bars, words and red-for-failed all update in place.
const rowsKey = (j) => JSON.stringify([!!j.plan, j.plan?.phases?.length ?? 0, !!j.activity?.tool, j.activity?.tool?.since ?? 0,
  (j.activity?.agents ?? []).map((a) => a.id), (j.ci ?? []).map((c) => c.id + c.status + c.conclusion + (c.progress ? '+' : ''))]);

/* ---- Sheet 58, option C (his pick, 2026-10-21): each helper agent as a small row tucked under its job ----
   Its type icon, a short label (the type, then what it is doing) and its own thin bar. One builder for the bubble's job
   card, Samara's rune panel and the pop-out, so all three look the same. Helpers are never jobs: they only ever appear
   as these rows inside the job that started them. No count anywhere (his words: "I don't care about the numbers at all"). */
/** The six types, each with its colour (the mockup's tints, verbatim). */
const AGENT_TINT = { research: '#966EC8', explore: '#58b0a3', build: '#f0a64a', check: '#8fbf4a', design: '#d9774f', plan: '#c9a46a' };
const AGENT_WORD = { research: 'Research', explore: 'Explore', build: 'Build', check: 'Check', design: 'Design', plan: 'Plan' };
// The icons, hand-placed 10 x 10 art pixels lifted verbatim from sheet 58 (agents-shots.ts): O dark wood outline, H the
// colour mixed 55% to white, F the colour, S mixed 35% to dark, and a few fixed colours (W handle wood, P parchment,
// K ink, R rust, G white, L/M/N the hammer's steel). Drawn whole at 2x: 20 screen px.
const AGENT_MAPS = {
  research: ['..OOOO....', '.OFFFFO...', 'OFHGHHFO..', 'OFGHHHFO..', 'OFHHHHFO..', 'OFHHHHSO..', '.OSSSSOO..', '..OOOOOWO.', '......OWWO', '.......OO.'],
  explore: ['..OOOOOO..', '.OFFFFFFO.', 'OFPPPPPRFO', 'OFPPPPRRFO', 'OFPPPRRPFO', 'OFPPKKPPFO', 'OFPKKPPPFO', 'OFPKPPPPSO', '.OSFFFFSO.', '..OOOOOO..'],
  build: ['.OOOOOOO..', 'OLLLLLLLO.', 'OMMMMMMMOO', 'ONNNNNNNO.', '.OOOFFOOO.', '....OFSO..', '....OFSO..', '....OFSO..', '....OFSO..', '.....OO...'],
  check: ['........OO', '.......OHO', '......OHFO', 'OO...OHFO.', 'OHO.OHFO..', 'OFHOHFO...', '.OFFFSO...', '..OFSO....', '...OO.....', '..........'],
  design: ['.......OO.', '......ORRO', '.....OOROO', '....OHFO..', '...OHFSO..', '..OHFSO...', '.OPPSO....', '.OKPO.....', 'OOOO......', '..........'],
  plan: ['...OOOO...', '.OOFHHFOO.', 'OPPOFFOPPO', 'OPPPPPPPPO', 'OPKKKKKPPO', 'OPPPPPPPPO', 'OPKKKKKKPO', 'OPPPPPPPPO', 'OPKKKPPPPO', '.OOOOOOOO.'],
};
const mixRgb = (hex, t, k) => { const a = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)); return 'rgb(' + a.map((v, i) => Math.round(v + (t[i] - v) * k)).join(',') + ')'; };
/**
 * Which of the six a helper is, from its subagent type and the few words Claude gave it. The ONE place this is decided
 * (the bubble, the rune and the pop-out all ask here). The named types win (Explore, Plan, a guide that looks things up);
 * a general helper is read from its words, checks first so "write the tests" is a Check, not a Build. Build when
 * nothing fits: most helpers are sent to make something.
 */
function agentType(kind, what) {
  const k = String(kind ?? '').toLowerCase(), w = String(what ?? '').toLowerCase();
  if (/^explore$/.test(k)) return 'explore';
  if (/^plan$/.test(k)) return 'plan';
  if (/guide|research/.test(k)) return 'research';
  if (/design|ui|ux/.test(k)) return 'design';
  if (/review|test|check|verif|audit|lint/.test(k)) return 'check';
  if (/\b(design|mock-?ups?|pictures?|draw|sketch|icons?|styl\w*|layouts?|palette|sheet)\b/.test(w)) return 'design';
  if (/\b(tests?|testing|checks?|checking|verif\w*|review\w*|audit\w*|lint\w*|type-?check\w*|confirm\w*|prove)\b/.test(w)) return 'check';
  if (/\b(plan\w*|outline|architect\w*|strategy|approach|roadmap)\b/.test(w)) return 'plan';
  // Looking things up before mapping the code: "Look up the map tiles docs" is research, not a map of the code.
  if (/\b(research\w*|look(ing)? up|docs|documentation|investigat\w*|compare|search(ing)?|read(ing)? up|find out|learn)\b/.test(w)) return 'research';
  if (/\b(explore|exploring|map(ping)?|survey|locate|where|find (the|all|every)|scan)\b/.test(w)) return 'explore';
  return 'build';
}
/** A type's icon, whole pixels at `px` per art pixel. */
function agentIcon(type, px = 2) {
  const map = AGENT_MAPS[type] ?? AGENT_MAPS.build, F = AGENT_TINT[type] ?? AGENT_TINT.build;
  const pal = { O: '#2a1a10', H: mixRgb(F, [255, 255, 255], 0.55), F, S: mixRgb(F, [40, 20, 10], 0.35), W: '#8a5a28', P: '#f6e7c4', K: '#5c4426', R: '#c4453a', G: '#ffffff', L: '#e6e8ee', M: '#a7adba', N: '#6c7282' };
  const c = document.createElement('canvas'); c.className = 'agi'; c.width = map[0].length * px; c.height = map.length * px;
  const g = c.getContext('2d');
  map.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch]) { g.fillStyle = pal[ch]; g.fillRect(x * px, y * px, px, px); } }));
  return c;
}
/**
 * Where one helper stands, honestly (the v3 rules, docs/PROGRESS-RESEARCH.md): its OWN to-do list when it keeps one
 * (two items or more: "62%", the solid bar); else its time so far against how long its type usually takes here, once
 * the history has 3 runs of it (the paler bar, "4 min"); else no guess at all: the still track with a lit pip per tool
 * call it made, and its time so far. Failed: red, full, "failed".
 */
function agentNow(a, now = Date.now()) {
  const e = Math.max(0, now - (a.since || now));
  if (a.failed) return { mode: 'failed', p: 1, text: 'failed' };
  if (a.total >= 2) { const p = Math.max(0, Math.min(1, (a.done ?? 0) / a.total)); return { mode: 'list', p, text: Math.round(p * 100) + '%' }; }
  if (a.est && a.n >= 3) return { mode: 'time', p: fracOf(a.est, e), text: since(e) };
  return { mode: 'still', p: null, pips: a.calls || 0, text: since(e) };
}
/**
 * A helper's thin bar (sheet 58's, lifted): the 45f pill's shape, rounded ends, whole art pixels at 2x, in the helper's
 * colour on the paper's own track. A bar that is only time is the same but paler, so a real % reads stronger; with no
 * guess it stays still and lights a pip per tool call (stillness means stillness). Redrawn only when an art pixel changes.
 */
function agentBar(w, ht, col) {
  const s = 2, c = document.createElement('canvas'); c.className = 'agb'; c.width = w; c.height = ht; c.style.width = w * s + 'px'; c.style.height = ht * s + 'px';
  const g = c.getContext('2d'), r = (ht - 1) / 2;
  const inside = (x, y) => { const cx = x < r ? r : x > w - 1 - r ? w - 1 - r : x; return Math.hypot(x - cx, y - r) <= r + 0.3; };
  let key = '';
  c.set = (st) => {
    const red = st.mode === 'failed', soft = st.mode === 'time', lit = st.p === null ? 0 : Math.round(st.p * w);
    const pips = st.mode === 'still' ? Math.min(st.pips || 0, Math.floor((w - 4) / 3)) : 0;
    const k = `${st.mode}|${lit}|${pips}`;
    if (k === key) return;
    key = k;
    const C = red ? '#c4453a' : col;
    g.clearRect(0, 0, w, ht);
    for (let y = 0; y < ht; y++) for (let x = 0; x < w; x++) {
      if (!inside(x, y)) continue;
      const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
      g.fillStyle = edge ? 'rgba(90,60,25,.55)' : x < lit ? (y <= 1 ? mixRgb(C, [255, 255, 255], soft ? 0.62 : 0.35) : soft ? mixRgb(C, [255, 255, 255], 0.4) : C) : '#ead8b0';
      g.fillRect(x, y, 1, 1);
    }
    for (let i = 0; i < pips; i++) { g.fillStyle = col; g.fillRect(2 + i * 3, Math.floor(ht / 2), 2, 1); }
  };
  return c;
}
/** Most helpers shown under one job; the rest are one quiet "+N more" line (sheet 58: three fit without crowding). */
const AGENT_ROWS = 3;
/**
 * The helper rows for a job, or null with none. Built from the job as it is now; each row's bar, % or time moves in
 * place every frame (the caller redraws only when the set of helpers changes, rowsKey).
 */
function liveAgents(getJob) {
  const list = getJob()?.activity?.agents ?? [];
  if (!list.length) return null;
  const box = h('div', 'agc');
  for (const g of list.slice(0, AGENT_ROWS)) {
    const id = g.id, type = agentType(g.kind, g.what), r = h('div', 'agr t-' + type);
    r.dataset.type = type;
    const cur = () => getJob()?.activity?.agents?.find((x) => x.id === id) ?? g;
    const what = g.what ? g.what.charAt(0).toUpperCase() + g.what.slice(1) : 'Working';
    r.title = `${AGENT_WORD[type]} helper${g.kind && !/^(general-purpose|helper)$/i.test(g.kind) ? ` (${g.kind})` : ''}: ${what}`;
    const bar = agentBar(30, 5, AGENT_TINT[type]);
    const tm = h('span', 'tm');
    const tick = () => {
      const x = cur(), st = agentNow(x);
      bar.set(st);
      r.classList.toggle('failed', st.mode === 'failed');
      tm.classList.toggle('pc', st.mode === 'list');
      if (tm.textContent !== st.text) tm.textContent = st.text;
    };
    tick(); anims.add(tick);
    r.append(agentIcon(type), h('b', '', AGENT_WORD[type]), h('span', 'wh', what), bar, tm);
    box.append(r);
  }
  if (list.length > AGENT_ROWS) box.append(h('div', 'agmore', `+${list.length - AGENT_ROWS} more`));
  return box;
}

/**
 * What an Open in Claude press asks main.ts for (2026-10-21, claudewire.ts claudeOpenTarget): the session's own app link,
 * 'mac' for a job on the MacBook, or 'front' (the Claude app forward) when there is no app link. Never nothing.
 */
function openTarget(j) {
  if (j?.machine === 'MAC') return 'mac';
  return typeof j?.open === 'string' && /^claude:\/\/claude\.ai\/epitaxy\//.test(j.open) ? j.open : 'front';
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
    plan: readPlan(x.plan), ci: (Array.isArray(x.ci) ? x.ci : []).slice(0, 4).map(readCi).filter(Boolean),
  };
}
const est = (e) => (e && Number.isFinite(e.mu) && Number.isFinite(e.sigma) && e.sigma > 0 ? { mu: Number(e.mu), sigma: Math.min(3, Number(e.sigma)) } : null);
/** OVERALL's plan from the wire (v3), or null. */
function readPlan(x) {
  if (!x || typeof x !== 'object' || !Array.isArray(x.phases)) return null;
  const phases = x.phases.slice(0, 30).map((p) => ({ label: str(p?.label, 80), hours: Math.max(0, Math.min(1000, Number(p?.hours) || 0)), status: ['todo', 'running', 'done'].includes(p?.status) ? p.status : 'todo' })).filter((p) => p.label);
  if (!phases.length) return null;
  return { phases, runE: Math.max(0, num(x.runE) ?? 0), at: num(x.at) ?? Date.now(), running: x.running === true, R: num(x.R) > 0 ? num(x.R) : 1,
    ratios: (Array.isArray(x.ratios) ? x.ratios : []).slice(0, 30).map(Number).filter((r) => r > 0) };
}
/** A CI run from the wire (v3), or null. */
function readCi(x) {
  if (!x || typeof x !== 'object' || typeof x.id !== 'string') return null;
  const status = ['queued', 'in_progress', 'completed'].includes(x.status) ? x.status : 'queued';
  return { id: x.id.slice(0, 30), workflow: str(x.workflow, 60) || 'CI', status, conclusion: str(x.conclusion, 20), createdAt: num(x.createdAt) ?? 0, startedAt: num(x.startedAt),
    step: str(x.step, 80), stepNo: Math.max(0, Math.round(num(x.stepNo) ?? 0)), steps: Math.max(0, Math.round(num(x.steps) ?? 0)), progress: readProgress(x.progress) };
}
const num = (v) => (Number.isFinite(v) ? Number(v) : null);
/** The engine's numbers from the wire, or null (no list, or anything that does not add up). */
function readProgress(p) {
  if (!p || typeof p !== 'object') return null;
  const total = num(p.total), done = num(p.done);
  if (!total || total < 1 || done === null || done < 0 || done > total) return null;
  if (p.v === 3) {
    // v3 (2026-10-21): the time-weighted numbers (progressmath.js ProgressV3).
    const pend = (Array.isArray(p.pend) ? p.pend : []).slice(0, 100).map(est);
    if (pend.some((x) => !x)) return null;
    const sq = p.sq && Number.isFinite(p.sq.a) && Number.isFinite(p.sq.m0) ? { a: Math.max(0, Math.min(1, p.sq.a)), m0: Math.max(0, Math.min(1, p.sq.m0)) } : null;
    return { v: 3, done: Math.round(done), total: Math.round(total), cur: Math.round(num(p.cur) ?? -1), at: num(p.at) ?? Date.now(), e: Math.max(0, num(p.e) ?? 0),
      jobW: Math.max(0, num(p.jobW) ?? 0), doneW: Math.max(0, num(p.doneW) ?? 0), curEst: est(p.curEst), pend, r: num(p.r) > 0 ? num(p.r) : 1, earned: p.earned === true,
      sq, note: p.note && typeof p.note.text === 'string' ? { text: str(p.note.text, 60), at: num(p.note.at) ?? 0 } : null,
      aliveAt: num(p.aliveAt) ?? Date.now(), stallMs: Math.max(1000, num(p.stallMs) ?? 60_000), running: p.running !== false, rev: Math.round(num(p.rev) ?? 0),
      rewroteAt: num(p.rewroteAt), ...(p.cap === false ? { cap: false } : {}) };
  }
  const pace = num(p.paceMs);
  return { done: Math.round(done), total: Math.round(total), cur: Math.round(num(p.cur) ?? -1), elapsedMs: Math.max(0, num(p.elapsedMs) ?? 0),
    at: num(p.at) ?? Date.now(), paceMs: pace !== null && pace > 0 ? pace : null, rev: Math.round(num(p.rev) ?? 0), rewroteAt: num(p.rewroteAt) };
}
function readActivity(a) {
  if (!a || typeof a !== 'object') return null;
  const agents = (Array.isArray(a.agents) ? a.agents : []).slice(0, 20).map((x, i) => ({ id: str(x?.id, 100) || String(i), kind: str(x?.kind, 40), what: str(x?.what, 80), since: num(x?.since) ?? Date.now(),
    calls: Math.max(0, Math.round(num(x?.calls) ?? 0)), est: est(x?.est), n: Math.max(0, Math.round(num(x?.n) ?? 0)), fg: x?.fg !== false, failed: x?.failed === true, endedAt: num(x?.endedAt) ?? undefined,
    // Its own to-do list, when it keeps one (2026-10-21, sheet 58 C): items done of all.
    ...(num(x?.total) >= 2 ? { total: Math.min(200, Math.round(num(x.total))), done: Math.max(0, Math.min(Math.round(num(x.total)), Math.round(num(x?.done) ?? 0))) } : {}) }));
  const t = a.tool && typeof a.tool === 'object' && est(a.tool.est) ? { since: num(a.tool.since) ?? Date.now(), est: est(a.tool.est), n: Math.round(num(a.tool.n) ?? 0), usual: Math.max(0, num(a.tool.usual) ?? 0) } : null;
  return { now: str(a.now, 140), since: num(a.since) ?? Date.now(), agents, tool: t, pips: Math.max(0, Math.min(200, Math.round(num(a.pips) ?? 0))),
    aliveAt: num(a.aliveAt) ?? undefined, stallMs: num(a.stallMs) ?? undefined };
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
export function startClaude({ typing, isOpen, withTyping, onMine, onChange, onWaiting, stripOn = isOpen, onOpened = null }) {
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
  /**
   * Open in Claude (2026-10-21, his rule): that session comes to the front in the Claude app (main.ts openInClaude) and
   * Aang's bubble goes at once (`onOpened`), so the two never sit on top of each other.
   */
  const openIn = (j) => { window.aang?.openClaude?.(openTarget(j)); onOpened?.(); };
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
    // v3: with a phase plan, OVERALL (the whole project) sits above this job's bar, which is then CURRENT (Waymark's two levels).
    const ovr = liveOverall(latest, 84);
    if (ovr) { row2.prepend(h('b', 'tag', 'CURRENT')); d.append(hd, ovr, row2); } else d.append(hd, row2);
    // Sheet 58 C (his pick, 2026-10-21): its helper agents, a small row each, tucked right under the bar.
    const ags = liveAgents(latest);
    if (ags) d.append(ags);
    if (j.held) { const q = h('div', 'queued'); q.append(h('i', '', 'QUEUED'), h('span', '', `${j.held} message${j.held > 1 ? 's' : ''}, after this task`)); d.append(q); }
    // The tracker, inside the bar (45f): ticked, the one in progress, the rest.
    const det = h('div', 'det'), inner = h('div'), list = h('div', 'list'), cur = curIndex(j);
    // What it is doing right now, above the tasks (2026-10-21): the tool running and for how long, then its helper agents.
    const act = h('div', 'act');
    act.append(liveText(h('div', 'an'), (now) => describeNow(latest(), now).line));
    // v3: the command's sub-bar, a row per helper agent and per CI run (they replace the one-line agents summary).
    const rows = liveRows(latest, 60);
    if (rows) act.append(rows);
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
    op.addEventListener('click', (e) => { e.stopPropagation(); openIn(latest()); });
    keys.append(pp, op);   // 2026-10-21: always; a terminal session (no app link) brings the Claude app forward instead
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
    // 2026-10-21 (his ask): the finished job is a door: a click takes him to that session in Claude (and Aang's bubble goes).
    d.classList.add('go'); d.title = 'Open in Claude';
    d.addEventListener('click', (e) => { e.stopPropagation(); openIn(jobOf(j.id) ?? j); });
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
      run.map((j) => [j.id, j.project, j.machine, j.phase, pctOf(j) === null && !j.progress, onOf(j), j.held, weekOf(j), j.tasks.map((t) => t.status + t.text + t.active), rowsKey(j)]),
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
      const keys = h('div', 'ckeys');
      // 2026-10-21: always (the question is up in Claude; with no app link the Claude app at least comes forward).
      { const o = btn('key sm primary', 'Open in Claude'); o.addEventListener('click', (e) => { e.stopPropagation(); openIn(jobOf(w.session) ?? null); }); keys.append(o); }
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
    /**
     * 2026-10-21: where Open in Claude goes for a piece of Claude news (a finished message, its scroll-back row): that
     * session's own link when it is known here, else the newest job of the same project, else null (the Claude app
     * forward, the caller's choice).
     */
    openFor({ session, project } = {}) {
      const byId = typeof session === 'string' ? jobs.find((j) => j.id === session) ?? complete.get(session) : null;
      const p = typeof project === 'string' ? project.trim().toLowerCase() : '';
      const byProject = !byId && p ? [...jobs, ...complete.values()].filter((j) => String(j.project).toLowerCase() === p || String(j.cwd ?? '').toLowerCase().endsWith(p)).sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))[0] : null;
      const j = byId ?? byProject;
      return j ? openTarget(j) : null;
    },
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
export { progressModel, liveProgress, livePill, liveText, describeNow, agentsLine, creep, DEFAULT_PACE_MS, SLOT_CAP, runeHeadLine };
// v3 (2026-10-21): the state colours, OVERALL, and the rows (command sub-bar, helper agents, CI), for the rune and the pop-out.
export { palFor, liveOverall, liveRows, rowsKey, BLUE, AMBER, RED, TEAL };
// 2026-10-21: move every live bar now (the brain's news just landed), and time the paint against the event.
export { kick, notePaint, openTarget };
// Sheet 58 C (2026-10-21): the helper agents' rows, and the one classifier of their six types.
export { liveAgents, agentType, agentIcon, agentNow, AGENT_TINT, AGENT_WORD, AGENT_ROWS };

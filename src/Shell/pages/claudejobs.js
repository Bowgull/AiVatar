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
const SLATE = ['#e6eaf0', '#cbd2de', '#b2bccc', '#9aa8c0', '#8996ad', '#77839a', '#667086', '#565e71'];
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
function pill(w, ht, s, bounds, p, cur, pal = SEA, glow = true) {
  const c = document.createElement('canvas'); c.className = 'jpill'; c.width = w; c.height = ht; c.style.width = w * s + 'px'; c.style.height = ht * s + 'px';
  const g = c.getContext('2d'), r = Math.floor(ht / 2);
  const P = (x, y, col, a = 1) => { g.globalAlpha = a; g.fillStyle = col; g.fillRect(x, y, 1, 1); g.globalAlpha = 1; };
  const inside = (x, y) => { const cx = x < r ? r - .5 : x > w - 1 - r ? w - 1 - r + .5 : x, cy = y < r ? r - .5 : y > ht - 1 - r ? ht - 1 - r + .5 : y; return Math.hypot(x - cx, y - cy) <= r + .15; };
  const draw = (t) => {
    g.clearRect(0, 0, w, ht);
    for (let y = 0; y < ht; y++) for (let x = 0; x < w; x++) { if (!inside(x, y)) continue; const rim = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1); P(x, y, rim ? (y < ht / 2 ? '#6a4628' : '#3a2414') : y === 1 ? '#1a100a' : '#2a1a10'); }
    const inner = w - 2, fw = Math.round(inner * p);
    const paint = (x0, x1, pl, al) => { for (let x = x0; x < x1; x++) for (let y = 1; y < ht - 1; y++) { if (!inside(x, y) || !(inside(x - 1, y) && inside(x + 1, y) && inside(x, y - 1) && inside(x, y + 1))) continue; P(x, y, pl[Math.min(7, Math.round((y - 1) / (ht - 3) * 7))], al); } };
    if (glow && cur >= 0 && cur < bounds.length) { const a = cur > 0 ? bounds[cur - 1] : 0, b = bounds[cur]; paint(1 + Math.round(inner * a), 1 + Math.round(inner * b), SEA_NOW, .7 + .2 * Math.sin(t / 7)); }
    paint(1, 1 + fw, pal, 1);
    for (let x = 2; x < fw; x++) if (inside(x, 2)) P(x, 2, '#fff', .45);
    for (const q of bounds.slice(0, -1)) { const x = 1 + Math.round(inner * q); for (let y = 2; y < ht - 2; y++) P(x, y, '#2a1a10', .45); }
    if (fw > 1) for (let y = 1; y < ht - 1; y++) { P(fw, y, '#fffaf0'); P(fw + 1, y, '#fff3d8', .5); }
  };
  if (glow) anims.add(draw);
  draw(0);
  return c;
}
/** The current piece breathes only while the strip is on screen: no timer runs for a closed cockpit. */
function animate(on) {
  if (on && !animTimer) animTimer = setInterval(() => { tk++; for (const a of anims) a(tk); }, 90);
  if (!on && animTimer) { clearInterval(animTimer); animTimer = 0; }
}

/* ---- reading a job ---- */
const running = (j) => j.phase !== 'ended';
const curIndex = (j) => { const i = j.tasks.findIndex((t) => t.status === 'in_progress'); return i >= 0 ? i : j.tasks.findIndex((t) => t.status !== 'completed'); };
const boundsOf = (j) => (j.tasks.length ? j.tasks.map((_, i) => (i + 1) / j.tasks.length) : [1]);
const pctOf = (j) => (Number.isFinite(j.percent) ? Math.max(0, Math.min(100, Math.round(j.percent))) : null);
/** 45f's time-left words. */
function leftOf(j) {
  if (j.phase === 'paused') return 'Paused';
  const ms = j.etaMs;
  if (ms === 0 || pctOf(j) === 100) return 'All tasks done';
  if (Number.isFinite(ms) && ms > 0) { const m = Math.max(1, Math.round(ms / 60000)); return m >= 60 ? `about ${Math.floor(m / 60)} h ${m % 60} min left` : `about ${m} min left`; }
  return j.phase === 'working' ? 'Working' : 'Resting';
}
/** "N% WEEK": the session's weekly rate limit as the status line has it; nothing known says so quietly. */
function weekOf(j) {
  const r = (j.usage?.rateLimits ?? []).find((x) => /week|seven|7.?d/i.test(String(x?.kind ?? '')));
  return r && Number.isFinite(Number(r.percentUsed)) ? `${Math.max(0, Math.min(100, Math.round(Number(r.percentUsed))))}% WEEK` : '—% WEEK';
}
/** What a bar says it is on: the task in progress and where that is in the list. */
function onOf(j) {
  const i = curIndex(j), n = j.tasks.length;
  const what = j.current || (i >= 0 ? j.tasks[i].active || j.tasks[i].text : '') || j.prompt || '';
  return n && i >= 0 ? `${what} · task ${i + 1} of ${n}` : what;
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
    id: x.id.slice(0, 100), machine: x.machine === 'mac' ? 'MAC' : 'PC', project: str(x.project, 60) || 'Claude', phase, tasks,
    startedAt: Number(x.startedAt) || 0, prompt: str(x.prompt, 200), current: str(x.current, 200),
    percent: Number.isFinite(x.percent) ? x.percent : null, etaMs: Number.isFinite(x.etaMs) ? x.etaMs : null,
    usage: x.usage && typeof x.usage === 'object' ? x.usage : null, open: str(x.open, 200), held: Math.max(0, Math.min(99, Number(x.held) || 0)),
  };
}
function readWait(x) {
  if (!x || typeof x !== 'object' || typeof x.id !== 'string' || !x.id || typeof x.session !== 'string') return null;
  const kind = ['permission', 'question', 'plan'].includes(x.kind) ? x.kind : null;
  if (!kind) return null;
  const questions = kind === 'question' && Array.isArray(x.questions) ? x.questions.slice(0, 4).map((q) => ({
    question: str(q?.question, 500), header: str(q?.header, 40), multiSelect: q?.multiSelect === true,
    options: (Array.isArray(q?.options) ? q.options : []).slice(0, 8).map((o) => ({ label: str(o?.label, 200), description: str(o?.description, 500), plain: str(o?.plain, 500) })),
  })).filter((q) => q.question) : [];
  if (kind === 'question' && !questions.length) return null;
  return { id: x.id.slice(0, 100), session: x.session.slice(0, 100), project: str(x.project, 60) || 'Claude', kind, tool: str(x.tool, 120),
    summary: str(x.summary, 300), plain: str(x.plain, 400), input: str(x.input, 2000), questions, plan: str(x.plan, 8000), canAlways: x.canAlways === true };
}

/**
 * Start the two zones. `typing` is the cockpit's typing area (cocktype.js), `isOpen` says whether the cockpit is open,
 * `withTyping(fn)` runs fn once the typing area is there (opening the cockpit first if it is closed), `onMine` puts what he
 * sent a session into the conversation, `onChange` asks the bubble to re-measure, and `onWaiting(has, fresh)` tells it
 * whether something is waiting (fresh: a new thing came to the top), so a closed bubble can speak the card.
 */
export function startClaude({ typing, isOpen, withTyping, onMine, onChange, onWaiting }) {
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
  function track(id) { chose = true; tracked = [...tracked.filter((x) => x !== id), id].slice(-2); listOpen = false; paintJobs(); onChange(); }
  function untrack(id) { chose = true; tracked = tracked.filter((x) => x !== id); unfolded.delete(id); paintJobs(); onChange(); }

  /* ---------------------------------------------------------------- the jobs strip */
  function flipEl(j, cls = '') {
    const f = btn('flip' + (flipped.has(j.id) ? ' back' : '') + cls, undefined, 'Flip: how much of your Claude week this job has used');
    const fi = h('span', 'fi'), p = pctOf(j);
    fi.append(h('span', 'ff', p === null ? '—%' : p + '%'), h('span', 'fb', weekOf(j)));
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
    pb.append(pill(84, 9, 2, boundsOf(j), (pctOf(j) ?? 0) / 100, j.tasks.length ? curIndex(j) : -1, paused ? SLATE : SEA, !paused));
    row2.append(pb, h('span', 'lt', leftOf(j)), h('i', 'chev'));
    d.append(hd, row2);
    if (j.held) { const q = h('div', 'queued'); q.append(h('i', '', 'QUEUED'), h('span', '', `${j.held} message${j.held > 1 ? 's' : ''}, after this task`)); d.append(q); }
    // The tracker, inside the bar (45f): ticked, the one in progress, the rest.
    const det = h('div', 'det'), inner = h('div'), list = h('div', 'list'), cur = curIndex(j);
    j.tasks.forEach((t, k) => {
      const done = t.status === 'completed', now = !done && k === cur;
      const ob = h('div', 'ob' + (done ? ' done' : now ? ' now' : ''));
      ob.append(h('i'), h('span', 'tx', now && t.active ? t.active : t.text), h('span', 'r', done ? 'done' : now ? 'NOW' : ''));
      list.append(ob);
    });
    if (!j.tasks.length) list.append(h('div', 'ob now', j.prompt || 'No to-do list yet'));
    const keys = h('div', 'ckeys');
    const pp = btn('key sm', paused ? 'Play' : 'Pause');
    pp.addEventListener('click', (e) => { e.stopPropagation(); send(paused ? { t: 'claude.play', session: j.id } : { t: 'claude.pause', session: j.id }); });
    const op = btn('key sm primary', 'Open in Claude');
    op.addEventListener('click', (e) => { e.stopPropagation(); if (j.open) window.aang?.openClaude?.(j.open); });
    keys.append(pp, op);
    const un = btn('untrack', 'STOP TRACKING');
    un.addEventListener('click', (e) => { e.stopPropagation(); untrack(j.id); });
    inner.append(list, keys, un); det.append(inner); d.append(det);
    msg.addEventListener('click', (e) => { e.stopPropagation(); pointAt(j); });
    d.addEventListener('click', () => { if (unfolded.has(j.id)) unfolded.delete(j.id); else unfolded.add(j.id); d.classList.toggle('open', unfolded.has(j.id)); onChange(); setTimeout(onChange, 300); });
    return d;
  }
  function paintJobs() {
    retrack();
    anims.clear();                   // the bars are drawn afresh; the old canvases stop breathing with them
    strip.replaceChildren();
    const run = jobs.filter(running).sort((a, b) => b.startedAt - a.startedAt);
    strip.hidden = !isOpen() || !run.length;
    animate(!strip.hidden);
    if (strip.hidden) return;
    for (const id of tracked) { const j = jobOf(id); if (j) strip.append(barOf(j)); }
    const others = run.filter((j) => !tracked.includes(j.id));
    if (!others.length) return;
    const o = h('div', 'others' + (listOpen ? ' open' : ''));
    const line = btn('oline'), dots = h('span', 'dots');
    for (let i = 0; i < Math.min(others.length, 6); i++) dots.append(h('i'));
    line.append(dots, document.createTextNode(`${others.length} OTHER JOB${others.length > 1 ? 'S' : ''} RUNNING`), h('i', 'chev'));
    line.addEventListener('click', (e) => { e.stopPropagation(); listOpen = !listOpen; o.classList.toggle('open', listOpen); onChange(); });
    const ol = h('div', 'olist');
    for (const j of others) {
      const r = h('div', 'orow' + (j.phase === 'paused' ? ' paused' : '')); r.dataset.id = j.id;
      const img = document.createElement('img'); img.src = CL; img.alt = '';
      const on = h('span', 'on'); on.append(h('b', '', j.project), h('small', '', `${onOf(j) || j.machine} · ${leftOf(j)}`));
      const pb = h('span', 'pb2'), paused = j.phase === 'paused';
      pb.append(pill(40, 7, 2, boundsOf(j), (pctOf(j) ?? 0) / 100, j.tasks.length ? curIndex(j) : -1, paused ? SLATE : SEA, !paused));
      const k = btn('key sm', 'Track this'); k.dataset.track = j.id;
      k.addEventListener('click', (e) => { e.stopPropagation(); track(j.id); });
      r.append(img, on, pb, flipEl(j, ' op'), k);
      ol.append(r);
    }
    o.append(line, ol);
    strip.append(o);
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
      typing.pointAt({ label: w.project, placeholder, when: false, onSend, onClear: () => { targetId = null; paintJobs(); } });
      targetId = w.session;
      paintJobs();
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
    const list = live();
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
      paintJobs(); onChange();
    } else if (m?.t === 'claude.wait' && Array.isArray(m.items)) {
      waits = m.items.slice(0, 50).map(readWait).filter(Boolean);
      for (const id of [...answered]) if (!waits.some((w) => w.id === id)) answered.delete(id);
      for (const id of [...steps.keys()]) if (!waits.some((w) => w.id === id)) steps.delete(id);
      const top = live()[0]?.id ?? null, fresh = top !== null && top !== topId;
      topId = top;
      paintPins(); onChange();
      onWaiting(top !== null, fresh);
    } else if (m?.t === 'claude.said' && m.ok === false && typeof m.why === 'string') {
      say(m.why);
    }
  });

  return {
    /** The cockpit opened or closed: the strip only lives in the open cockpit; the card lives in both. */
    setOpen(on) { if (!on) { listOpen = false; typing.clearTarget?.(); } paintJobs(); paintPins(); },
    /** Something is waiting on him (the card is up), so a closed bubble must not fade under it. */
    waiting: () => live().length > 0,
    /**
     * Not enough room: the list of other jobs folds first (sheet 45g's rule), then the tasks of a bar he unfolded earlier
     * (the one he just opened only when `evenHis`: nothing else is left). Redrawn rather than animated, so the next measure already sees the folded height.
     * True when it did.
     */
    fold(evenHis = false) {
      if (listOpen) listOpen = false;
      else if (unfolded.size > (evenHis ? 0 : 1)) unfolded.delete([...unfolded][0]);
      else return false;
      paintJobs(); return true;
    },
  };
}

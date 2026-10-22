// Step 6.15: window 2, the desk. Pass 1.
//
// Ports the C# Panel (PanelWindow.cs) into sheet 6's look: What I know, What I may do, What I did,
// Drafts, Jobs and History. Everything comes from ONE `panel.reply`, worked out by the brain without
// the model, exactly as the Panel gets it; every button sends the same message the Panel sends, so the
// brain does not know or care which window asked. Settings is pass 2: those switches belong to the pet
// (Body), and a tab whose switches do nothing is worse than no tab.
//
// Built with textContent throughout, never innerHTML from data: facts, drafts and history are his words
// and outside content, and none of it may ever become markup.
import { HOLD_MS } from './asks.js';

const el = (id) => document.getElementById(id);
const body = el('body'), foot = el('foot');
const tabs = [...document.querySelectorAll('.tab')];

/** @type {any} the last panel.reply */
let data = null;
let tab = 0;


/** Make an element with a class and optional text. */
function h(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function key(label, cls, onClick) {
  const b = h('button', 'key sm' + (cls ? ' ' + cls : ''), label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}
function ruleMajor() {
  const r = h('div', 'rule-major');
  r.append(h('i', 'endcap'), h('i', 'bar'), h('i', 'endcap'));
  return r;
}
function ruleTitled(text) {
  const r = h('div', 'rule-titled');
  r.append(h('i', 'bar'), h('span', '', text), h('i', 'bar'));
  return r;
}
/** "today", "yesterday", "4 Oct": the way the sheet writes when. */
function whenOf(iso) {
  const d = new Date(iso);
  if (isNaN(+d)) return String(iso ?? '');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const that = new Date(d); that.setHours(0, 0, 0, 0);
  const days = Math.round((+today - +that) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return d.toLocaleDateString('en-CA', { day: 'numeric', month: 'short' });
}
const times = (n) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);

// ---------------------------------------------------------------- the tabs
function show(n) {
  tab = n;
  tabs.forEach((t, i) => { t.classList.toggle('on', i === n); t.setAttribute('aria-selected', String(i === n)); });
  if (n === 7) window.aang?.deskBrief?.();
  foot.hidden = true;
  body.replaceChildren();
  body.scrollTop = 0;
  if (!data && n !== 4 && n !== 5) { body.append(h('p', 'empty-line', 'Asking Aang...')); return; }
  if (data?.notice) body.append(h('p', 'notice', data.notice));
  [know, didView, jobsView, settingsView, searchAll, brief][n]?.();
}
tabs.forEach((t, i) => t.addEventListener('click', () => show(i)));

// 0. What I know. "Forget" sits on the row the mouse is on, so the wrong one can never be forgotten.
function know() {
  const facts = data.facts ?? [];
  body.append(h('p', 't-eyebrow', `${facts.length} ${facts.length === 1 ? 'THING' : 'THINGS'} · NEWEST FIRST`),
    h('h3', 't-display', 'What I know about you'), ruleMajor());
  if (!facts.length) body.append(h('p', 'empty-line', 'Nothing yet. Tell me about yourself and I will keep it here.'));
  for (const f of facts) {
    const row = h('div', 'row'), left = h('div');
    const meta = h('div', 'meta');
    meta.append('Confirmed ', h('b', '', times(f.times)), ' · last seen ', h('b', '', whenOf(f.seen)));
    left.append(h('div', 'main', f.text), meta);
    const act = h('span', 'act');
    act.append(key('Forget', 'danger', () => window.aang?.deskForgetFact?.(f.id)));
    row.append(left, act);
    body.append(row);
  }
  body.append(h('p', 't-hint', 'Forgetting one stops him using it from his next answer. "Undo that" brings it back.'));
}

// 1. What I may do. The things that ALWAYS ask are shown as their own tags, so the limits are visible.
function mayDo() {
  const trust = data.trust ?? [];
  body.append(h('h3', 't-display', 'What I may do without asking'), ruleMajor());
  if (!trust.length) body.append(h('p', 'empty-line', 'Nothing yet. When you say "Always" to something, it shows up here.'));
  for (const t of trust) {
    const row = h('div', 'row'), left = h('div'), meta = h('div', 'meta');
    meta.append('For example ', h('b', '', t.example || '-'), ' · since ', h('b', '', whenOf(t.since)));
    left.append(h('div', 'main', t.kind.charAt(0).toUpperCase() + t.kind.slice(1)), meta);
    const act = h('span', 'act');
    act.append(key('Take this back', '', () => window.aang?.deskRevoke?.(t.kind)));
    row.append(left, act);
    body.append(row);
  }
  body.append(ruleTitled('Always asks, no matter what'));
  const tags = h('div', 'alwaysask');
  for (const s of ['Deleting files', 'Force quitting an app', 'Sending email', 'Anything with the lever']) tags.append(h('span', '', s));
  body.append(tags, h('p', 't-hint', 'Taking one back means he asks again next time. Deleting files, force quits and sending mail always ask.'));
}

// 2. What I did. Claude jobs first, each with a coloured state, then the log as a timeline.
function did() {
  body.append(h('h3', 't-display', 'What I did'), ruleTitled('Claude jobs'));
  const sessions = data.sessions ?? [];
  if (!sessions.length) body.append(h('p', 'empty-line', 'No Claude jobs yet. Ask me to start one and it will show here.'));
  for (const s of sessions) {
    const state = /need|wait/i.test(s.state) ? 'needs' : /work|run/i.test(s.state) ? 'working' : /done|finish/i.test(s.state) ? 'done' : 'ended';
    const row = h('div', 'job'), mid = h('div');
    mid.append(h('div', 'nm', s.name), h('div', 'last', s.last || `Started ${whenOf(s.since)}`));
    const chip = h('span', 'chip ' + ({ needs: 'careful', working: 'off', done: 'good', ended: 'off' })[state],
      ({ needs: 'NEEDS YOU', working: 'WORKING', done: 'DONE', ended: 'ENDED' })[state]);
    if (state === 'working') chip.style.cssText = 'background:#C8E8FF;color:#1a2a3a;text-shadow:none';
    row.append(h('i', 'dot ' + state), mid, chip);
    body.append(row);
  }
  body.append(ruleMajor(), ruleTitled('Everything else, newest first'));
  const lines = String(data.actions ?? '').split('\n').filter(Boolean);
  const tl = h('div', 'tl');
  for (const line of lines) {
    // "2:41 PM  Opened Chrome", or "Tue 2:41 PM  ..." over several days (actionlog.ts formatAction).
    const at = line.indexOf('  ');
    const when = at > 0 ? line.slice(0, at) : '';
    const what = at > 0 ? line.slice(at + 2) : line;
    const ev = h('div', 'ev' + (/\(failed/.test(what) ? ' undo' : /undid|put it back/i.test(what) ? ' undo' : ''));
    ev.append(h('div', 'when', when.toUpperCase()), h('div', 'what', what));
    tl.append(ev);
  }
  body.append(tl);
  const keys = h('div', 'keys');
  const undo = key('Undo the last one', '', () => window.aang?.deskUndo?.());
  undo.append(h('span', 'k', 'Z'));
  keys.append(undo);
  body.append(keys);
  foot.textContent = 'Gold square: done. Grey: failed or undone.';
  foot.hidden = false;
}

// 3. Drafts: the letter itself. Never-written-to addresses flagged; Send is the lever.
function drafts() {
  const list = data.drafts ?? [];
  if (!data.mail) { body.append(h('p', 'empty-line', 'Email is not connected, so there are no drafts.')); return; }
  body.append(h('p', 't-eyebrow', list.length ? `${list.length} ${list.length === 1 ? 'DRAFT' : 'DRAFTS'} WAITING · NOTHING SENT YET` : 'NOTHING WAITING'));
  if (!list.length) body.append(h('p', 'empty-line', 'No drafts. When I write an email for you, it waits here for your yes.'));
  for (const d of list) {
    const card = h('div', 'mailcard');
    const hdr = h('div', 'hdr');
    const to = h('div', '', (d.to ?? []).join(', '));
    if ((d.newTo ?? []).length) {
      const n = h('span', 'newto');
      n.append(h('span', 'chip careful', 'NEVER WRITTEN TO BEFORE'));
      to.append(n);
    }
    hdr.append(h('span', '', 'TO'), to, h('span', '', 'SUBJECT'), h('div', '', d.subject || '(no subject)'));
    const act = (action) => window.aang?.deskMail?.({ id: d.id, hash: d.hash, action });
    const keys = h('div', 'keys');
    keys.append(lever(d.status === 'confirm' ? 'Hold to really send' : 'Hold to send', () => act('send')),
      key('Save as Gmail draft', '', () => act('save')), key('Discard', 'danger', () => act('discard')));
    card.append(hdr, h('div', 'letter', d.body), keys);
    body.append(card);
  }
}

/** Sheet 5's lever, held for HOLD_MS. Letting go stops it dead; a held key cannot cheat it. */
function lever(label, done) {
  const l = h('div', 'lever');
  l.tabIndex = 0;
  l.append(h('i', 'fillbar'), h('i', 'knob'), h('span', 'txt', label), h('span', 'hold', 'HOLD'));
  let from = 0, raf = 0;
  const stop = () => { cancelAnimationFrame(raf); raf = 0; l.style.setProperty('--fill', '0%'); };
  const paint = () => {
    const k = Math.min(1, (performance.now() - from) / HOLD_MS);
    l.style.setProperty('--fill', (k * 100).toFixed(1) + '%');
    if (k >= 1) { stop(); done(); return; }
    raf = requestAnimationFrame(paint);
  };
  const start = () => { if (raf) return; from = performance.now(); raf = requestAnimationFrame(paint); };
  l.addEventListener('pointerdown', (e) => { l.setPointerCapture?.(e.pointerId); start(); });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave', 'blur']) l.addEventListener(ev, stop);
  l.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); start(); } });
  l.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') stop(); });
  return l;
}

// 4. Jobs: the C# card, one at a time, A / X / O / Z as today.
let jobAt = 0;
function jobs() {
  const list = data.jobs ?? [];
  if (!list.length) { body.append(h('p', 'empty-line', 'No jobs waiting on you. New ones from the job hunt land here.')); return; }
  jobAt = Math.min(jobAt, list.length - 1);
  const j = list[jobAt];
  const card = h('div', 'jobcard');
  const chip = h('span', 'chip ' + (j.verdict === 'apply' ? 'good' : j.verdict === 'skip' ? 'off' : 'normal'),
    `${j.verdict.toUpperCase()} · ${j.score}`);
  card.append(h('div', 'ttl', j.title), h('div', 'where', [j.company, j.location, j.salary].filter(Boolean).join(' · ')));
  const c = h('div'); c.style.marginTop = '10px'; c.append(chip);
  card.append(c, h('div', 'why', j.reason));
  const go = (action) => { window.aang?.deskJob?.({ id: action === 'undo' ? 'undo' : j.id, action }); };
  const keys = h('div', 'keys');
  const k = (label, letter, cls, f) => { const b = key(label, cls, f); b.append(h('span', 'k', letter)); return b; };
  keys.append(k('Apply', 'A', 'primary', () => go('apply')), k('Skip', 'X', '', () => go('skip')),
    k('Open', 'O', '', () => go('open')), k('Undo', 'Z', '', () => go('undo')));
  card.append(keys, h('div', 'left', `${list.length} ${list.length === 1 ? 'IS' : 'ARE'} WAITING ON YOU`));
  body.append(card);
}
// Ctrl+F: one search over everything (6.18), from any tab, box focused.
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'f') { e.preventDefault(); show(4); }
});
window.addEventListener('keydown', (e) => {
  if (tab === 1 && e.key.toLowerCase() === 'z' && !e.ctrlKey && !e.altKey && !(e.target instanceof HTMLInputElement)) {
    e.preventDefault(); window.aang?.deskUndo?.(); return;
  }
  if (tab !== 2 || !data?.jobs?.length || e.target instanceof HTMLInputElement) return;
  const j = data.jobs[Math.min(jobAt, data.jobs.length - 1)];
  const map = { a: 'apply', x: 'skip', o: 'open', z: 'undo' };
  const action = map[e.key.toLowerCase()];
  if (!action || e.ctrlKey || e.altKey || e.metaKey) return;
  e.preventDefault();
  window.aang?.deskJob?.({ id: action === 'undo' ? 'undo' : j.id, action });
});

// 5. History: today's search box words kept. Results in the two voices, matches highlighted.
let query = '', found = [], searchTimer = 0;
function history() {
  const slot = h('div', 'searchslot');
  const input = h('input', 'q');
  input.type = 'search';
  input.placeholder = 'Search everything you and Aang have said...';
  input.value = query;
  input.setAttribute('aria-label', 'Search everything you and Aang have said');
  const count = h('span', 'chip normal', `${found.length} FOUND`);
  count.hidden = !query;
  slot.append(h('span', 'lab', 'FIND'), input, count);
  const list = h('div');
  list.id = 'found';
  body.append(slot, list);
  input.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { query = input.value.trim(); window.aang?.deskHistory?.({ q: query }); }, 250);
  });
  paintFound();
  if (!found.length) window.aang?.deskHistory?.({ q: query });
  input.focus();
}
function paintFound() {
  const list = el('found');
  if (!list) return;
  list.replaceChildren();
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  if (!found.length) list.append(h('p', 'empty-line', query ? 'Nothing matches that.' : 'No history yet. Everything we say to each other will be here.'));
  let prev = 0;
  for (const t of found) {
    // The forged divider at every gap of 30 minutes or more (ConversationView's rule), labelled with the
    // day and the part of it: "TUESDAY 30 SEPT · MORNING" (sheet 2, part 4).
    const at = +new Date(t.ts);
    if (prev && at - prev >= 30 * 60000) list.append(dayDivider(new Date(at)));
    prev = at || prev;
    const mine = t.who === 'you';
    const turn = h('div', 'turn' + (mine ? ' r' : ''));
    const d = new Date(t.ts);
    turn.append(h('p', 'who', `${mine ? 'YOU' : 'AANG'} · ${isNaN(+d) ? '' : d.toLocaleString('en-CA', { weekday: 'short', hour: 'numeric', minute: '2-digit' }).toUpperCase()}`));
    const bub = h('div', 'bub ' + (mine ? 'you' : 'aang'));
    marked(bub, t.text, words);
    const bar = h('div', 'hoverbar');
    // Sheet 2's hover actions: reply to it, add it as context (both put a chip on the typing box), copy, forget.
    bar.append(key('Reply to this', '', () => window.aang?.replyToTurn?.(t.id, t.text)),
      key('Add as context', '', () => window.aang?.pinTurn?.(t.id, t.text)),
      key('Copy', '', () => window.aang?.deskCopy?.(t.text)),
      key('Forget', 'danger', () => { window.aang?.deskForgetTurn?.(t.id); setTimeout(() => window.aang?.deskHistory?.({ q: query }), 300); }));
    bub.append(bar);
    turn.append(bub);
    list.append(turn);
  }
  if (found.length) {
    const keys = h('div', 'keys');
    keys.append(key('Copy all of it', '', () => window.aang?.deskCopy?.(found.map((t) => `${t.who === 'you' ? 'You' : 'Aang'}: ${t.text}`).join('\n\n'))));
    list.append(keys);
  }
}
function dayDivider(d) {
  const part = d.getHours() < 12 ? 'MORNING' : d.getHours() < 17 ? 'AFTERNOON' : 'EVENING';
  const day = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' }).replace(',', '').toUpperCase();
  const r = h('div', 'daydiv');
  r.append(h('i', 'endcap'), h('i', 'bar'), h('span', '', `${day} \u00b7 ${part}`), h('i', 'bar'), h('i', 'endcap'));
  return r;
}

/** Put the text in, with the searched words marked, without ever treating the text as markup. */
function marked(into, text, words) {
  if (!words.length) { into.append(text); return; }
  const re = new RegExp('(' + words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi');
  let last = 0;
  for (const m of text.matchAll(re)) {
    into.append(text.slice(last, m.index), h('mark', '', m[0]));
    last = (m.index ?? 0) + m[0].length;
  }
  into.append(text.slice(last));
}

// 6. Settings: today's five switches and two buttons, word for word, grouped (sheet 6 section 6). The
// pet owns them; this asks where they stand, and a switch shows its new state only once the pet says so.
let sets = null;
const GROUPS = [
  ['While you play', [
    ['quietGame', 'Stay quiet while WoW has focus', 'He holds anything that is not urgent until you come out of the game'],
    ['mute', 'Mute: nothing unprompted', 'He only speaks when you speak to him']]],
  ['What he can see', [
    ['seeWindow', 'Let him see which app I\u2019m in', 'Only the name of the app at the front, never what is in it'],
    ['usage', 'Show the usage bars under the box', 'The ten segments that show how much Claude you have left this week']]],
  ['This computer', [
    ['autostart', 'Start with Windows', 'He is there when Shadow starts']]],
  ['The browser', [
    ['browserSounds', 'Little wood sounds', 'A soft tap when a tab opens or closes, and when a download finishes']]],
  // C5 (2026-10-21): the wooden chimes, a mute and a volume, both kept by the pet. Four sounds since 2026-10-22.
  ['Sounds', [
    ['chimes', 'Wooden chimes', 'A soft chime when Claude needs you, when a job is done or has failed. The timer always knocks']]],
];
function settings() {
  body.append(h('h3', 't-display', 'Settings'));
  if (!sets) { body.append(h('p', 'empty-line', 'Asking the pet...')); window.aang?.deskSettings?.(); return; }
  for (const [title, rows] of GROUPS) {
    body.append(ruleTitled(title));
    const list = h('div', 'setlist');
    for (const [k, label, line] of rows) {
      const row = h('div', 'setrow');
      const sw = h('button', 'sw' + (sets[k] ? ' on' : ''));
      sw.type = 'button';
      sw.setAttribute('role', 'switch');
      sw.setAttribute('aria-checked', String(!!sets[k]));
      sw.setAttribute('aria-label', label);
      const bed = h('i', 'bed'); bed.append(h('i', 'nub')); sw.append(bed);
      sw.addEventListener('click', () => window.aang?.deskSetting?.({ key: k, on: !sets[k] }));
      const text = h('div'); text.append(h('b', '', label), h('span', '', line));
      row.append(sw, text);
      list.append(row);
    }
    if (title === 'Sounds') list.append(volumeRow());
    body.append(list);
  }
  const keys = h('div', 'keys');
  keys.append(key('Change the hide and show key...', '', () => window.aang?.deskSettingDo?.('hotkey')),
    key('Bring him off the edge (undock)', '', () => window.aang?.deskSettingDo?.('undock')));
  body.append(keys);
}

/** The chimes' loudness. Sent when he lets go, so the pet plays one chime at the new level and he hears it. */
function volumeRow() {
  const v = Number.isFinite(sets?.chimeVolume) ? sets.chimeVolume : 80;
  const row = h('div', 'setrow volrow');
  const slider = h('input', 'vol');
  slider.type = 'range'; slider.min = '0'; slider.max = '100'; slider.step = '5'; slider.value = String(v);
  slider.setAttribute('aria-label', 'Chime volume');
  const pct = h('i', 'volpct', v + '%');
  slider.addEventListener('input', () => { pct.textContent = slider.value + '%'; });
  slider.addEventListener('change', () => window.aang?.deskVolume?.(Number(slider.value)));
  const text = h('div'); text.append(h('b', '', 'Chime volume'), h('span', '', 'How loud the chimes are. Let go to hear one.'));
  const left = h('div', 'volcell'); left.append(pct);
  row.append(left, text);
  text.append(slider);
  return row;
}

// ---------------------------------------------------------------- the four tabs (his call, 2026-10-11)
/** What I did: anything waiting on him first (drafts), then the jobs, the use chart and the timeline. */
function didView() {
  const waiting = (data.drafts ?? []).length;
  if (waiting && data.mail) {
    body.append(ruleTitled('Waiting on you'));
    drafts();
    body.append(ruleMajor());
  }
  did();
  if (data.usage?.length) {
    body.append(ruleTitled('Claude and Qwen, replies per week'));
    if (typeof data.quotaWeek === 'number') {
      const st = h('div', 'stat');
      const b = h('b', '', `${Math.round(data.quotaWeek * 100)}%`);
      st.append(b, h('span', '', ' of your Claude week used. Qwen\u2019s replies cost no quota.'));
      body.append(st);
    }
    body.append(useChart(data.usage));
  }
}
/** Jobs: where every job is, then the card. */
function jobsView() {
  const s = data.jobStages ?? {};
  const total = Object.values(s).reduce((a, b) => a + b, 0);
  if (total) {
    body.append(h('p', 't-eyebrow', 'JOB HUNT \u00b7 WHERE EACH ONE IS'), stageChart(s), ruleMajor());
  }
  jobs();
}
/** Settings: the switches, then what he may do without asking. */
function settingsView() {
  settings();
  if (!data) return;
  body.append(ruleMajor());
  mayDo();
}

// ---------------------------------------------------------------- the charts (6.18, sheet 7)
// Drawn on the parchment, every bar with the black outline the rest of Aang has, every number written on
// the chart so nothing depends on colour, one scale per chart. Built as SVG elements, never as markup.
const SVG = 'http://www.w3.org/2000/svg';
const sv = (tag, attrs = {}, text) => { const e = document.createElementNS(SVG, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v)); if (text !== undefined) e.textContent = text; return e; };
function stageChart(s) {
  const rows = [['new', 'New'], ['approved', 'Approved'], ['sent', 'Sent to apply'], ['applied', 'Applied'], ['stuck', 'Needs you'], ['skipped', 'Skipped']];
  const max = Math.max(1, ...rows.map(([k]) => s[k] ?? 0));
  const W = 560, rowH = 34, x0 = 150, x1 = 500;
  const svg = sv('svg', { viewBox: `0 0 ${W} ${rows.length * rowH + 6}`, role: 'img', 'aria-label': 'Jobs by stage' });
  rows.forEach(([k, label], i) => {
    const n = s[k] ?? 0, y = i * rowH + 4, w = Math.max(n ? 6 : 0, (x1 - x0) * n / max);
    svg.append(sv('text', { x: x0 - 10, y: y + 20, 'text-anchor': 'end', class: 'lab' }, label + (k === 'stuck' && n ? ' !' : '')));
    const bar = sv('rect', { x: x0, y: y + 4, width: w, height: 22, rx: 4, class: 'm', fill: k === 'stuck' ? 'var(--orange)' : k === 'skipped' ? '#B9B3C9' : 'var(--gold)' });
    bar.append(sv('title', {}, `${label}: ${n}`));
    svg.append(bar, sv('text', { x: x0 + w + 8, y: y + 20, class: 'val' }, String(n)));
  });
  const c = h('div', 'chart'); c.append(svg); return c;
}
function useChart(weeks) {
  const max = Math.max(1, ...weeks.map((w) => Math.max(w.claude, w.qwen)));
  const W = 560, H = 210, base = 180, top = 16, gw = (W - 60) / weeks.length;
  const svg = sv('svg', { viewBox: `0 0 ${W} ${H + 24}`, role: 'img', 'aria-label': 'Replies per week, Claude and Qwen' });
  svg.append(sv('line', { x1: 40, y1: base, x2: W - 10, y2: base, class: 'base' }));
  weeks.forEach((wk, i) => {
    const gx = 50 + i * gw;
    [['claude', '#E88A6A', 'Claude'], ['qwen', '#966EC8', 'Qwen']].forEach(([k, fill, name], j) => {
      const n = wk[k], hgt = (base - top) * n / max, bx = gx + j * (gw * .36) + 4, bw = gw * .32;
      const bar = sv('rect', { x: bx, y: base - hgt, width: bw, height: Math.max(n ? 3 : 0, hgt), rx: 3, class: 'm', fill });
      bar.append(sv('title', {}, `${name}, week of ${wk.week}: ${n}`));
      svg.append(bar);
      if (n) svg.append(sv('text', { x: bx + bw / 2, y: base - hgt - 5, 'text-anchor': 'middle', class: 'val' }, String(n)));
    });
    const d = new Date(wk.week + 'T12:00:00');
    svg.append(sv('text', { x: gx + gw * .34, y: base + 18, 'text-anchor': 'middle', class: 'axis' }, d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).toUpperCase()));
  });
  const legend = h('div', 'legend');
  for (const [name, fill] of [['Claude', '#E88A6A'], ['Qwen', '#966EC8']]) { const s = h('span'); const i = h('i'); i.style.background = fill; s.append(i, name); legend.append(s); }
  const c = h('div', 'chart'); c.append(legend, svg); return c;
}

// 4. Search over everything (6.18, sheet 7). One box over five places, grouped by where each hit lives,
// with a count pill per place so an empty place says so. Nothing here goes to a model.
let sq = '', sres = null, sTimer = 0;
const PLACES = [['addons', 'Addons', 'm-addon', 'ADD'], ['talk', 'Conversations', 'm-talk', ''], ['vault', 'Vault', 'm-vault', 'NOTE'], ['facts', 'What I know', 'm-mem', 'FACT'], ['jobs', 'Jobs', 'm-job', 'JOB']];
function searchAll() {
  const box = h('div', 'sbox');
  const input = h('input', 'q');
  input.type = 'search'; input.value = sq; input.placeholder = 'Search everything';
  input.setAttribute('aria-label', 'Search everything: what I know, your vault, our conversations, jobs and addons');
  box.append(h('i', 'glass'), input, h('span', 'k', 'ENTER OPENS'));
  const out = h('div'); out.id = 'sres';
  body.append(box, out);
  input.addEventListener('input', () => {
    clearTimeout(sTimer);
    sTimer = setTimeout(() => { sq = input.value.trim(); if (sq.length > 1) window.aang?.deskSearch?.(sq); else { sres = null; paintSearch(); } }, 250);
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const first = out.querySelector('.hit'); if (first) first.click(); } });
  paintSearch();
  input.focus();
}
function paintSearch() {
  const out = el('sres'); if (!out) return;
  out.replaceChildren();
  // An empty box is the recent conversation: History's job, now that it lives here.
  if (!sq || !sres) {
    out.append(h('p', 't-hint', 'One box for what I know, your vault, our conversations, jobs and addons. Searching costs nothing: it all stays on this PC.'));
    out.append(ruleTitled('Lately'));
    const list = h('div'); list.id = 'found'; out.append(list);
    query = '';
    paintFound();
    if (!found.length) window.aang?.deskHistory?.({ q: '' });
    return;
  }
  const words = sq.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  const pills = h('div', 'srcs');
  for (const [k, label] of PLACES) { const n = (sres[k] ?? []).length; const p = h('span', n ? '' : 'none'); p.append(h('b', '', String(n)), ' ' + label); pills.append(p); }
  out.append(pills);
  const empty = [];
  for (const [k, label, medalClass, medalText] of PLACES) {
    const list = sres[k] ?? [];
    if (!list.length) { empty.push(label); continue; }
    out.append(ruleTitled(label));
    for (const x of list) {
      const row = h('div', 'hit');
      row.tabIndex = 0;
      const medal = h('span', 'medal ' + medalClass, k === 'talk' ? (x.who === 'you' ? 'YOU' : 'AANG') : medalText);
      const mid = h('div');
      const ttl = h('div', 'ttl'), sn = h('div', 'sn');
      let how = '', go = null;
      if (k === 'addons') { marked(ttl, x.title, words); sn.textContent = `Version ${x.version}`; go = () => show(0); go = null; }
      if (k === 'talk') { marked(ttl, x.text, words); sn.textContent = new Date(x.ts).toLocaleString('en-CA', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); how = x.how.toUpperCase(); go = null; }
      if (k === 'vault') { marked(ttl, x.title, words); marked(sn, x.head, words); how = x.how.toUpperCase(); go = () => window.aang?.openThing?.({ kind: 'file', value: x.path }); }
      if (k === 'facts') { marked(ttl, x.text, words); go = () => show(0); }
      if (k === 'jobs') { marked(ttl, x.title, words); sn.textContent = `${x.company} \u00b7 ${x.status}`; go = () => show(2); }
      mid.append(ttl); if (sn.textContent) mid.append(sn);
      row.append(medal, mid, h('span', 'how', how));
      if (go) { row.addEventListener('click', go); row.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); }); row.style.cursor = 'pointer'; }
      out.append(row);
    }
  }
  if (empty.length) out.append(h('p', 'empty-src', `Nothing in ${empty.join(' or ')} matches "${sq}".`));
}

// 7. The morning brief, whole (sheet 6 section 7). Not one of the seven tabs: it opens from the balloon's
// "Open the whole brief". A wooden banner for the day, the calendar as a carved timeline with a line for
// now, and the inbox as rows with a medallion per sender.
let briefCard = null;
function brief() {
  if (!briefCard) { body.append(h('p', 'empty-line', 'Asking Aang for today...')); window.aang?.deskBrief?.(); return; }
  const b = briefCard;
  body.replaceChildren();
  const wrap = h('div', 'brief');
  const banner = h('div', 'banner');
  const hour = new Date().getHours();
  banner.append(h('div', 'hi', hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'),
    h('div', 'day', String(b.day ?? '').replace(',', ' \u00b7').toUpperCase()));
  const counts = h('div', 'counts');
  counts.append(h('span', '', `${b.events.length} TODAY`), h('span', 'mail', `${b.unread.length} UNREAD`));
  if (b.weather) {
    const w = b.weather;
    counts.append(h('span', 'wx', `${w.now} C \u00b7 ${w.words.toUpperCase()}` + (w.rain >= 30 ? ` \u00b7 ${w.rain}% RAIN` : '')));
  }
  // His face where the sheet drew a sun (his call, 2026-10-11): Aang greeting you, in the same glowing medallion.
  const sun = h('span', 'sun');
  const face = document.createElement('img');
  face.src = 'art/aang-face.png'; face.alt = 'Aang';
  sun.append(face);
  banner.append(counts, sun);
  const page = h('div', 'page tex');
  page.append(ruleTitled('Today'));
  const cal = h('div', 'cal');
  const now = Date.now();
  let nowDrawn = false;
  if (!b.events.length) cal.append(h('p', 'empty-line', 'Nothing on the calendar today.'));
  for (const e of b.events) {
    const start = e.start ? Date.parse(e.start) : 0, end = e.end ? Date.parse(e.end) : start;
    if (!nowDrawn && start > now) { cal.append(nowLine()); nowDrawn = true; }
    const game = /\b(raid|mythic|m\+|wow|apex|game night|gaming)\b/i.test(e.title);
    const ev = h('div', 'ev2' + (end && end < now ? ' past' : '') + (game ? ' game' : ''));
    const what = h('div', 'what', e.title);
    const mins = start && end ? Math.round((end - start) / 60000) : 0;
    const small = [mins ? (mins >= 60 ? `${Math.round(mins / 60 * 10) / 10} ${mins === 60 ? 'hour' : 'hours'}` : `${mins} minutes`) : '', e.where].filter(Boolean).join(' \u00b7 ');
    if (small) what.append(h('small', '', small));
    ev.append(h('span', 't', e.allDay ? 'ALL DAY' : new Date(start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })), h('i', 'rail'), what);
    cal.append(ev);
  }
  if (b.events.length && !nowDrawn) cal.append(nowLine());
  page.append(cal, ruleMajor());
  const ut = ruleTitled('Unread'); ut.style.marginTop = '0'; page.append(ut);
  if (!b.unread.length) page.append(h('p', 'empty-line', 'Nothing unread in the last two days.'));
  for (const u of b.unread) {
    const row = h('div', 'mailrow' + (u.job ? ' job' : ''));
    const med = h('span', 'medal' + (u.logo ? ' logo' : ''));
    if (u.logo && /^data:image\//.test(u.logo)) { const i = document.createElement('img'); i.src = u.logo; i.alt = u.from; med.append(i); }
    else { med.textContent = (u.from.trim()[0] ?? '?').toUpperCase(); med.style.background = 'linear-gradient(180deg,var(--gold-lit),var(--gold))'; }
    const mid = h('div'); mid.append(h('div', 'from', u.from), h('div', 'subj', u.subject));
    const d = new Date(u.at), today = new Date();
    const when = d.toDateString() === today.toDateString() ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toUpperCase() : 'YESTERDAY';
    row.append(med, mid, h('span', 'when', u.at ? when : ''));
    page.append(row);
  }
  const free = h('div', 'freebar');
  free.append(h('b', '', 'NO QUOTA'), h('span', '', 'Worked out without Claude or Qwen. It cost nothing.'));
  page.append(free);
  if (b.error) page.append(h('p', 't-hint', 'Part of this could not be read just now: ' + b.error));
  wrap.append(banner, page);
  body.append(wrap);
}
function nowLine() { const n = h('div', 'nowline'); n.append(h('span', 'lab', 'NOW'), h('i', 'ln')); return n; }

// ---------------------------------------------------------------- what the brain says
window.aang?.onMessage?.((m) => {
  if (!m || typeof m !== 'object') return;
  if (m.t === 'panel.reply') {
    data = m;
    const nd = (m.drafts ?? []).length, nj = (m.jobs ?? []).length;
    el('ndrafts').hidden = !nd; el('ndrafts').textContent = String(nd);
    el('njobs').hidden = !nj; el('njobs').textContent = String(nj);
    if (tab !== 4) show(tab);
    return;
  }
  if (m.t === 'search.reply' && typeof m.q === 'string') { if (m.q === sq) { sres = m; if (tab === 4) paintSearch(); } return; }
  if (m.t === 'brief.card' && m.card) { briefCard = m.card; if (tab === 5) show(5); return; }
  if (m.t === 'settings') {
    sets = m;
    if (tab === 3) show(3);
    return;
  }
  if (m.t === 'history.reply' && typeof m.q === 'string') {
    if (m.q !== query) return;                         // a stale answer to an older search
    found = [...(m.items ?? [])].reverse();            // newest first from the brain; read oldest first
    if (tab === 4 && !sq) {
      const c = body.querySelector('.searchslot .chip');
      if (c) { c.textContent = `${found.length} FOUND`; c.hidden = !query; }
      paintFound();
    }
  }
});
// The pet's menu still names the old seven (Panel 0, Permissions 1, Activity 2) and the brief card asks
// for 7; each lands where that thing lives now.
const FROM_OLD = { 0: 0, 1: 3, 2: 1, 3: 1, 4: 2, 5: 4, 6: 3, 7: 5 };
window.aang?.onDeskTab?.((n) => { const v = FROM_OLD[n]; if (v !== undefined) show(v); window.aang?.deskPanel?.(); });

show(0);
window.aang?.deskPanel?.();

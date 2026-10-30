// Sheet 107, Mockups, the one place (his picks, 2026-10-30). Everything drawn with textContent: titles are Claude's words.
// The tree comes from Samara (mocklog:get, then mocklog:data on every change). A sheet opens here, on the right, at its
// true size, in a frame that cannot reach this page; opening it is all it takes for its NEW to go.
import { pixIcon } from './pixicons.js';
import { projectIcon, topicIcon } from './mockicons.js';

const STG = { fix: ['FIX', 'chg'], ok: ['APPROVED', 'ok'], chat: ['APPROVED', 'ok'], built: ['BUILT', 'built'], park: ['PARKED', 'park'] };
const OPEN = ['OPEN', 'ok'];
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
let tree = { projects: [] };
// What he is looking at: the project tab, the sheet open on the right (and its version), and the topics he folded.
const pick = { p: null, s: null, v: null, newAtOpen: false };
const folded = new Set();
let focusN = null;

// Each project's own logo (his pick): pixel art at whole-number sizes, a drawn logo only ever scaled down.
// Aang's face is 27 x 27 art drawn at 4x: shown at 1x and 2x, so every pixel stays whole.
const LOGOS = {
  samara: { src: 'art/samara/samara-lantern-64.png', px: true, sm: 32, lg: 64 },
  aang: { src: 'art/aang-face.png', px: true, sm: 27, lg: 54 },
  waymark: { src: 'art/mockups/waymark.png', px: false, sm: 32, lg: 64 },
};
const PIX = { 'couch mode': 'fire', showcase: 'video' };
function emblem(name, big = false) {
  const k = String(name).toLowerCase(), size = big ? 64 : 32;
  const own = LOGOS[k], other = tree.logos?.[name];
  if (own || (typeof other === 'string' && other.startsWith('http://127.0.0.1:'))) {
    const i = el('img', own?.px ? 'px' : 'smooth'); i.alt = ''; i.src = own?.src ?? other;
    if (own) { i.width = i.height = big ? own.lg : own.sm; } else i.style.cssText = `max-width:${size}px;max-height:${size}px`;
    return i;
  }
  if (PIX[k]) return pixIcon(PIX[k], big ? 6 : 3);
  return projectIcon(name, false, null);
}
const projects = () => tree.projects ?? [];
const sheetsOf = (p) => [...p.topics.flatMap((t) => t.sheets), ...p.done];
function where(sheet) {
  for (const p of projects()) {
    for (const t of p.topics) { const n = t.sheets.find((x) => x.sheet === sheet); if (n) return { p, t, n }; }
    const n = p.done.find((x) => x.sheet === sheet); if (n) return { p, t: null, n };
  }
  return null;
}

function openSheet(sheet, v = null) {
  const w = where(sheet);
  if (!w) return;
  pick.p = w.p.name; pick.s = sheet; pick.v = v; pick.newAtOpen = w.n.fresh;
  // Its NEW goes at once here; Samara's own copy follows a moment later.
  if (w.n.fresh) { window.mocklog?.seen(sheet); w.n.fresh = false; w.p.fresh = Math.max(0, w.p.fresh - 1); }
  draw();
}

function draw() {
  const ps = projects();
  const p = ps.find((x) => x.name === pick.p) ?? ps[0];
  const tabs = document.getElementById('ptabs'); tabs.replaceChildren(leaveKey());
  for (const q of ps) {
    const b = el('button', 'ptab' + (q === p ? ' on' : '')); b.type = 'button';
    const em = el('span', 'em'); em.append(emblem(q.name));
    b.append(em, el('span', '', q.name), el('span', 'c', String(q.count)));
    if (q.fresh) b.append(el('span', 'newc', `${q.fresh} NEW`));
    b.addEventListener('click', () => { if (pick.p !== q.name) { pick.p = q.name; pick.s = pick.v = null; } draw(); });
    tabs.append(b);
  }
  const list = document.getElementById('list'); list.replaceChildren();
  if (!p) { list.append(el('div', 'empty', 'No mockups yet.')); drawView(null); return; }
  pick.p = p.name;
  if (pick.s && !sheetsOf(p).some((x) => x.sheet === pick.s)) pick.s = pick.v = null;
  const row = (n) => {
    const b = el('button', 'sh' + (n.mark === 'park' ? ' parked' : '') + (n.sheet === pick.s ? ' on' : '')); b.type = 'button';
    if (n.num) b.append(el('span', 'num', n.num));
    b.append(el('span', 'nm', n.name));
    const last = n.versions.at(-1);
    if (last) b.append(el('span', 'vc', 'v' + last.v));
    const m = STG[n.mark] ?? OPEN;
    b.append(n.fresh ? el('span', 'new', 'NEW') : el('i', 'mk ' + m[1], m[0]));
    b.addEventListener('click', () => openSheet(n.sheet));
    return b;
  };
  const head = (key, name, count, icon, done) => {
    const shut = folded.has(p.name + '\n' + key);
    const h = el('button', 'topic' + (shut ? '' : ' on')); h.type = 'button';
    h.append(el('i', 'chev'));
    if (!done) { const ic = el('span', 'ti'); ic.append(topicIcon(name, icon)); h.append(ic); }
    h.append(el('span', '', name), el('span', 'n', String(count)));
    h.addEventListener('click', () => { const k = p.name + '\n' + key; if (folded.has(k)) folded.delete(k); else folded.add(k); draw(); });
    return [h, shut];
  };
  // A project with one group only, the one with no topic, needs no heading over it.
  const lone = p.topics.length === 1 && p.topics[0].name === 'Other';
  for (const t of p.topics) {
    if (lone) { list.append(...t.sheets.map(row)); continue; }
    const [h, shut] = head(t.id, t.name, t.sheets.length, t.icon, false);
    list.append(h);
    if (!shut) list.append(...t.sheets.map(row));
  }
  if (p.done.length) {
    const d = el('div', 'done');
    const [h, shut] = head('done', 'Done', p.done.length, null, true);
    d.append(h);
    if (!shut) d.append(...p.done.map(row));
    list.append(d);
  }
  drawView(p);
}

let frameSrc = '';
function drawView(p) {
  const view = document.getElementById('view');
  const w = pick.s ? where(pick.s) : null;
  if (!p || !w) {
    frameSrc = '';
    const f = el('div', 'frame'), r = el('div', 'rest');
    if (p) r.append(emblem(p.name, true));
    f.append(r); view.replaceChildren(f); closeMenu();
    return;
  }
  const { t, n } = w, vs = n.versions;
  const v = vs.find((x) => x.v === pick.v) ?? vs.findLast((x) => x.stage === 'ok' || x.stage === 'chat') ?? vs.at(-1);
  pick.v = v.v;
  const bar = el('div', 'vbar');
  // Back says where it goes: the topic (or the project, when it has no topics), or Done.
  const lone = p.topics.length === 1 && p.topics[0].name === 'Other';
  const back = el('button', 'back'); back.type = 'button'; back.append(el('i'), !t ? 'Done' : lone ? p.name : t.name);
  back.addEventListener('click', () => { pick.s = pick.v = null; draw(); });
  const dt = el('div', 'dt');
  if (n.num) dt.append(el('span', 'num', n.num));
  dt.append(el('span', '', n.name));
  if (pick.newAtOpen) dt.append(el('span', 'tag1', 'NEW'));
  const chips = el('div', 'vs');
  for (const x of vs) {
    const b = el('b', x === v ? 'on' : '', 'v' + x.v);
    if (x.said || x.note) b.title = x.said ? `You said: "${x.said}"` : `To fix: ${x.note}`;
    b.addEventListener('click', () => { pick.v = x.v; draw(); });
    chips.append(b);
  }
  const m = STG[v.stage] ?? OPEN;
  const mk = el('button', 'mk ' + m[1], m[0]); mk.type = 'button';
  if (v.said || v.note) mk.title = v.said ? `You said: "${v.said}"` : `To fix: ${v.note}`;
  mk.addEventListener('click', (e) => { e.stopPropagation(); markMenu(v, mk); });
  bar.append(back, dt, chips, mk);
  // The frame is kept while the same version shows, never moved (moving a frame reloads it), so a change elsewhere never
  // reloads the sheet he is reading or loses his place in it.
  let f = view.querySelector('.frame');
  if (f && frameSrc === v.url && f.querySelector('iframe')) {
    const old = view.querySelector('.vbar');
    if (old) old.replaceWith(bar); else view.prepend(bar);
    return;
  }
  {
    f = el('div', 'frame');
    const ifr = el('iframe');
    ifr.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    ifr.setAttribute('referrerpolicy', 'no-referrer');
    ifr.title = n.name; ifr.src = v.url;
    // A sheet with no background of its own sits on white, as it would in a tab (after it loads: no white flash).
    ifr.addEventListener('load', () => ifr.classList.add('ready'), { once: true });
    f.append(ifr);
    frameSrc = v.url;
  }
  view.replaceChildren(bar, f);
}

// ---- The mark: tap it for the rest (his marks, sheet 79): approve, needs a fix, park, take it off, Send to Aang.
function closeMenu() { document.querySelector('.mmenu')?.remove(); }
function markMenu(v, anchor) {
  closeMenu();
  const m = el('div', 'mmenu'); m.setAttribute('role', 'menu');
  const item = (label, go) => { const b = el('button', '', label); b.type = 'button'; b.setAttribute('role', 'menuitem'); b.addEventListener('click', (e) => { e.stopPropagation(); go(); }); m.append(b); };
  const set = (to, note = '') => { closeMenu(); window.mocklog?.stage(v.id, to, note); };
  const ok = v.stage === 'ok' || v.stage === 'chat';
  if (v.stage !== 'built') item(ok ? 'Take back the approval' : 'Approve this version', () => set(ok ? null : 'ok'));
  item(v.stage === 'fix' ? 'Take off the fix' : 'Needs a fix…', () => {
    if (v.stage === 'fix') { set(null); return; }
    const box = el('input'); box.maxLength = 300; box.placeholder = 'What to fix';
    box.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && box.value.trim()) set('fix', box.value.trim()); if (e.key === 'Escape') closeMenu(); });
    box.addEventListener('click', (e) => e.stopPropagation());
    m.replaceChildren(box); box.focus();
  });
  if (v.stage !== 'park') item('Park it', () => set('park'));
  if (v.stage && v.stage !== 'chat' && v.stage !== 'ok' && v.stage !== 'fix') item('Take off the mark', () => set(null));
  if (tree.toAang) { m.append(el('div', 'sep')); item('Send to Aang', () => { closeMenu(); window.mocklog?.send(v.id); }); }
  document.body.append(m);
  const r = anchor.getBoundingClientRect();
  m.style.left = Math.max(8, Math.min(innerWidth - m.offsetWidth - 8, r.right - m.offsetWidth)) + 'px';
  m.style.top = Math.min(innerHeight - m.offsetHeight - 8, r.bottom + 6) + 'px';
}
document.addEventListener('click', (e) => { if (!e.target.closest?.('.mmenu')) closeMenu(); });
// Esc (Samara sends it, from the sheet's frame too): the mark's menu closes first, else he leaves Mockups.
window.mocklog?.onEsc(() => { if (document.querySelector('.mmenu')) closeMenu(); else window.mocklog?.leave(); });

// Sheet 107 v4 (his ask: "a way to get out of mockups and back to my regular samara"): Back to Samara, first along the
// top, in the scroll plaque's blue and gold with the lantern on it. Mockups closes; he is back on the tab he was on.
let leave = null;
function leaveKey() {
  if (leave) return leave;
  leave = el('button', 'leave'); leave.type = 'button';
  const lamp = el('img', 'px'); lamp.src = 'art/samara/samara-lantern-64.png'; lamp.alt = ''; lamp.width = lamp.height = 32;
  leave.append(el('i'), lamp, el('span', '', 'Back to Samara'));
  leave.addEventListener('click', () => window.mocklog?.leave());
  return leave;
}

function take(d) {
  if (!d) return;
  tree = d;
  // A new sheet from Claude (or one picked elsewhere): Mockups opens right on it, in its project's tab.
  if (d.focus && d.focus.n !== focusN) {
    focusN = d.focus.n;
    const w = where(d.focus.sheet);
    if (w) { const ver = w.n.versions.find((x) => x.id === d.focus.id); openSheet(d.focus.sheet, ver?.v ?? null); return; }
  }
  draw();
}
window.mocklog?.onData(take);
window.mocklog?.get().then(take);

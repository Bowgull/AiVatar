// Sheet 41 (his picks, 2026-10-20): the scroll-back keeps everything Aang showed him, looking like itself.
//
// His rule: Aang speaks in one short line, and that line is a door. Click it and it opens into the rich thing it
// was: the video with one big play key, the brief, the research, Claude's plan, a yes he gave and what it did. The
// scroll-back keeps every door, so a morning message is just as openable three weeks later.
//
// Drawn as the Lantern (sheet 24's wood under a lamp, parchment slips, a pixel icon on every row), one slip per part
// of a day, newest at the bottom where he left off. His own words are plum on the right, because plum is him
// everywhere; Aang's have Aang's face. Hover any row and a gold REPLY key takes the place of its time.
//
// No screen state lives here: bubble.js owns the history (Scrollback) and passes callbacks in. Every element is built
// with textContent; nothing that came from a model or a web page ever becomes markup.

import { pixIcon, playButton } from './pixicons.js';

const T = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

/** The row's stored time ("2026-10-20 13:14:02", UTC) as a Date. */
export const whenOf = (ts) => { const d = new Date(String(ts ?? '').replace(' ', 'T') + 'Z'); return Number.isNaN(d.getTime()) ? null : d; };
const clock = (d) => d ? d.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(/\s?([ap])\.?m\.?/i, ' $1m') : '';
const PART = (h) => h < 12 ? 'MORNING' : h < 17 ? 'AFTERNOON' : 'EVENING';

/** "TODAY · MORNING", "YESTERDAY · EVENING", "THURSDAY 16 OCT · AFTERNOON". */
export function slipName(d, now = new Date()) {
  if (!d) return '';
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86_400_000);
  const name = diff === 0 ? 'TODAY' : diff === 1 ? 'YESTERDAY'
    : d.toLocaleDateString('en-CA', { weekday: 'long', day: 'numeric', month: 'short' }).replace(/,/g, '').toUpperCase();
  return `${name} · ${PART(d.getHours())}`;
}

/**
 * A web address in his words: a full one, or a bare one with a path ("meet.google.com/abc-defg"). Strict on purpose,
 * like entities.js: a link on something that is not an address is worse than no link.
 */
const URLISH = /^(?:https?:\/\/[^\s<>"']+|(?:[a-z0-9-]+\.)+[a-z]{2,}\/[^\s<>"']*)$/i;
export function urlOf(word) {
  const w = String(word ?? '').replace(/[.,;:!?)\]]+$/, '');
  if (!URLISH.test(w)) return null;
  const u = /^https?:\/\//i.test(w) ? w : 'https://' + w;
  try { const p = new URL(u); return p.protocol === 'https:' || p.protocol === 'http:' ? p.href : null; } catch { return null; }
}

/** Samara's lantern in front of a link: it says where the click goes. */
function lantern() { const i = document.createElement('img'); i.src = 'art/samara/samara-lantern-16.png'; i.alt = ''; i.className = 'lnk-lamp'; return i; }

/** One link, underlined in the Lantern's ink, Samara's lantern in front. */
export function linkEl(url, label) {
  const a = T('a', 'lnk');
  a.dataset.url = url;
  a.title = url;
  a.append(lantern(), document.createTextNode(label ?? url.replace(/^https?:\/\//, '').replace(/\/$/, '')));
  return a;
}

/** Text with any web addresses in it turned into links. Everything else stays plain text. */
export function textWithLinks(host, text) {
  for (const part of String(text ?? '').split(/(\s+)/)) {
    if (!part) continue;
    const url = /\s/.test(part) ? null : urlOf(part);
    if (!url) { host.append(part); continue; }
    const tail = part.slice(part.replace(/[.,;:!?)\]]+$/, '').length);
    host.append(linkEl(url, part.slice(0, part.length - tail.length)));
    if (tail) host.append(tail);
  }
}

/** The words of the reply showing now (one span per word): any that are web addresses become links. */
export function linkifyWords(said) {
  for (const s of said.querySelectorAll('span.w')) {
    if (s.classList.contains('lnk')) continue;
    const url = urlOf(s.textContent);
    if (!url) continue;
    s.classList.add('lnk');
    s.dataset.url = url;
    s.title = url;
    s.prepend(lantern());
  }
}

const isVideo = (url) => /^https:\/\/(?:www\.|m\.)?(?:youtube\.com\/watch|youtu\.be\/|twitch\.tv\/)/i.test(String(url ?? ''));
const okImg = (s) => typeof s === 'string' && /^data:image\/[\w.+-]+;base64,[\w+/=]+$/.test(s) && s.length < 400_000;

/** The video, as it first looked: its picture, one big play key over it. A click anywhere on it opens Samara. */
export function videoShot(about, onLink) {
  const shot = T('div', 'vshot');
  if (okImg(about?.thumb)) shot.style.backgroundImage = `url("${about.thumb}")`;
  else shot.classList.add('nopic');
  shot.append(playButton());
  shot.title = about?.title ?? '';
  shot.addEventListener('click', (e) => {
    e.stopPropagation();
    shot.classList.add('pressed');
    setTimeout(() => shot.classList.remove('pressed'), 160);
    onLink(about.url);
  });
  return shot;
}

/**
 * Sheet 48 (his pick, 2026-10-21: "I like the different paper with a hover over to see the little label"): each kind
 * of row on its own tinted slip, and a little carved label that shows only under the mouse. The kind comes from what
 * the brain marked (extra.kind, from 2026-10-21) or from what the row already is (a video, the brief, a yes); never
 * from its words. Old chat rows have no mark and stay plain parchment, the same as talking with Aang.
 *
 * Returns { k, label } or null: k is the paper ('claude', 'action', 'video', 'brief'; research shares the brief's
 * honey), label what the hover says. A plan has a label but keeps the plain slip.
 */
export function kindOf(t) {
  if (!t || t.who === 'you') return null;
  const x = t.extra && typeof t.extra === 'object' ? t.extra : {};
  if (x.kind === 'claude') {
    const p = typeof x.project === 'string' ? x.project.trim() : '';
    return { k: 'claude', label: ('CLAUDE' + (p ? ' · ' + p : '')).toUpperCase().slice(0, 40) };
  }
  const s = shapeOf(t);
  if (x.kind === 'action' || s.type === 'yes') return { k: 'action', label: 'DONE FOR YOU' };
  if (s.type === 'video') return { k: 'video', label: 'VIDEO' };
  if (s.type === 'brief') return { k: 'brief', label: 'BRIEF' };
  if (s.type === 'research') return { k: 'brief', label: 'RESEARCH' };
  if (s.type === 'plan') return { k: '', label: 'PLAN' };
  return null;
}

/**
 * The small gold key for "done for you" rows, lifted pixel for pixel from sheet 48's picture maker (kinds-shots.ts
 * KEY_SVG): a 10 x 10 grid at 2 CSS px per art pixel, crisp edges. Built as elements, never as markup.
 */
const KEY_PX = [['#7a4e12', [[1, 2, 4, 4], [5, 3, 4, 2], [7, 5, 1, 2], [5, 5, 1, 1]]], ['#ffc43c', [[2, 3, 2, 2], [5, 3, 3, 1]]], ['#2a1a10', [[2, 3, 1, 1]]]];
function goldKey() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', '20'); svg.setAttribute('height', '20'); svg.setAttribute('viewBox', '0 0 10 10');
  svg.setAttribute('shape-rendering', 'crispEdges'); svg.setAttribute('class', 'pix lb-key'); svg.setAttribute('aria-hidden', 'true');
  for (const [fill, rects] of KEY_PX) {
    const g = document.createElementNS(NS, 'g'); g.setAttribute('fill', fill);
    for (const [x, y, w, h] of rects) {
      const r = document.createElementNS(NS, 'rect');
      r.setAttribute('x', String(x)); r.setAttribute('y', String(y)); r.setAttribute('width', String(w)); r.setAttribute('height', String(h));
      g.append(r);
    }
    svg.append(g);
  }
  return svg;
}

/** What a stored row is, for drawing. */
function shapeOf(t) {
  const x = t.extra && typeof t.extra === 'object' ? t.extra : {};
  if (t.who === 'you') return { type: 'mine' };
  if (t.kind === 'yes' && x.yes) return { type: 'yes', yes: x.yes };
  if (t.kind === 'plan' && x.plan) return { type: 'plan', plan: x.plan, x };
  if (x.brief && typeof x.brief === 'object') return { type: 'brief', brief: x.brief };
  if (x.research && typeof x.research === 'object') return { type: 'research', research: x.research };
  if (x.about && typeof x.about.url === 'string' && /^https?:\/\//.test(x.about.url)) return { type: isVideo(x.about.url) ? 'video' : 'about', about: x.about, face: x.face };
  return { type: 'talk', links: Array.isArray(x.links) ? x.links : [] };
}

/**
 * Draw the whole scroll-back into `box`.
 *
 * `ctx`: { onLink(url), onReply(turn), onUndo(turn), onFull(turn), replying: id|null, open: id|null, setOpen(id),
 *          older: 'more'|'loading'|'start' }
 */
export function paintLookback(box, turns, ctx) {
  box.replaceChildren();
  const head = T('div', 'lt-top lb-top');
  const date = T('div', 'lt-date');
  date.append(T('small', '', 'EVERYTHING I SHOWED YOU'), T('b', '', 'Looking back'), T('span', '', 'Scroll up for older. Click anything to open it.'));
  head.append(date);
  box.append(head);

  const list = T('div', 'lb-list');
  list.id = 'lblist';
  box.append(list);
  const older = T('div', 'lb-older' + (ctx.older === 'loading' ? ' loading' : ''));
  if (ctx.older === 'start') older.append(T('span', '', 'THE BEGINNING'));
  else { older.append(chevronUp(), T('span', '', 'OLDER')); }
  list.append(older);

  if (!turns.length) {
    list.append(T('p', 'empty-line', 'No history yet. Everything I show you will be here to look back through.'));
    return list;
  }
  let slip = null, slipKey = '';
  for (const t of turns) {
    const d = whenOf(t.ts);
    const key = slipName(d);
    if (!slip || key !== slipKey) {
      slip = T('div', 'lt-slip');
      if (key) slip.append(T('h3', '', key));
      list.append(slip);
      slipKey = key;
    }
    slip.append(rowOf(t, d, ctx));
  }
  // The row he was over when the conversation was redrawn (a click opening it, a new message) keeps its label open,
  // without playing the opening again; if the mouse has gone by the time things settle, it closes as usual.
  const again = list.querySelector('.lt-item[data-reshow]');
  if (again) {
    delete again.dataset.reshow;
    showKind(again, true, true);
    setTimeout(() => { if (!again.matches(':hover')) showKind(again, false); }, 300);
  }
  return list;
}

// ---- the label opening under the mouse (his correction, 2026-10-21) --------------------------------------------------
// Only the row under the mouse opens, and only after the mouse has rested on it a moment (80 ms): sweeping across the
// conversation must not set off a ripple of rows opening and closing. Leaving closes it at once.
const INTENT_MS = 80, OPEN_MS = 300;
/** The row whose label is open, by its turn id, so a redraw keeps it. */
let shownId = null;
// The conversation stays where he is reading it. If it was scrolled to the newest, it stays pinned there while the row
// opens (the rows above slide up, the hovered words stay under the mouse); otherwise the row stays put and the rows
// below slide down. Pinning follows the row's own size every frame, before it is painted, so nothing jumps.
const pinnedRows = new Set();
const pinWatch = typeof ResizeObserver === 'function'
  ? new ResizeObserver((es) => { for (const e of es) { const l = pinnedRows.has(e.target) ? e.target.closest('.lb-list') : null; if (l) l.scrollTop = l.scrollHeight; } })
  : null;
function follow(item, on) {
  if (!pinWatch) return;
  if (on) { pinnedRows.add(item); pinWatch.observe(item); setTimeout(() => follow(item, false), OPEN_MS + 120); }
  else if (pinnedRows.delete(item)) pinWatch.unobserve(item);
}

function hoverKind(item) {
  let wait = 0;
  item.addEventListener('mouseenter', () => { clearTimeout(wait); wait = setTimeout(() => showKind(item, true), INTENT_MS); });
  item.addEventListener('mouseleave', () => { clearTimeout(wait); showKind(item, false); });
}

/**
 * Open (or close) one row's label. `instant` skips the motion, for a redraw or a measurement.
 *
 * The conversation is held at the height it has before the row opens: the bubble around it was sized for the rows at
 * rest, so growing the list itself would push the typing area out of the frame. Inside that held height the list
 * scrolls instead (bubble.js fitCockpit sets the height afresh whenever it measures).
 */
export function showKind(item, on, instant = false) {
  if (!item?.isConnected || item.classList.contains('kshow') === on) return;
  const list = item.closest('.lb-list');
  if (instant) item.classList.add('know');
  if (on) {
    shownId = item.dataset.id ?? null;
    let atBottom = false;
    if (list) {
      if (!list.style.maxHeight || list.style.maxHeight === 'none') {
        const cs = getComputedStyle(list);
        list.style.maxHeight = (cs.boxSizing === 'border-box' ? list.offsetHeight : list.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)) + 'px';
      }
      atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 2;
    }
    item.classList.add('kshow');
    if (list && atBottom) { if (instant) list.scrollTop = list.scrollHeight; else follow(item, true); }
  } else {
    if (shownId === (item.dataset.id ?? null)) shownId = null;
    follow(item, false);
    item.classList.remove('kshow');
  }
  if (instant) { void item.offsetHeight; item.classList.remove('know'); }
}

/**
 * For bubble.js's measuring: the conversation measured at rest. Any open label folds at once (no motion), and the
 * returned function opens it again the same way once the sizes are set, so a label open under the mouse never makes
 * the cockpit taller than its rows really are.
 */
export function restKinds(list) {
  const open = list ? [...list.querySelectorAll('.lt-item.kshow')] : [];
  const keep = shownId;
  for (const r of open) { r.classList.add('know'); r.classList.remove('kshow'); }
  if (open.length) void list.offsetHeight;
  return () => { for (const r of open) { r.classList.remove('know'); showKind(r, true, true); } if (keep !== null) shownId = keep; };
}

function chevronUp() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', '30'); svg.setAttribute('height', '19'); svg.setAttribute('viewBox', '0 0 30 19'); svg.setAttribute('aria-hidden', 'true');
  for (const [stroke, w] of [['#120A05', 7], ['#C98C14', 3.5]]) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', 'M3 16 L15 5 L27 16'); p.setAttribute('fill', 'none'); p.setAttribute('stroke', stroke); p.setAttribute('stroke-width', String(w));
    p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round');
    svg.append(p);
  }
  return svg;
}

function tile(kind, src) {
  const t = T('span', 'lt-tile' + (kind === 'face' || kind === 'aang' ? ' round' : ''));
  if (kind === 'aang') { const i = document.createElement('img'); i.src = 'art/aang-face.png'; i.alt = ''; i.className = 'lb-aang'; t.append(i); return t; }
  if (kind === 'face' && okImg(src)) { const i = document.createElement('img'); i.src = src; i.alt = ''; i.className = 'lb-face'; t.append(i); return t; }
  if (kind === 'art') { const i = document.createElement('img'); i.src = src; i.alt = ''; i.className = 'lt-art'; t.append(i); return t; }
  // Sheet 48: Claude's own icon on its rows, the gold key on what Aang did for him.
  if (kind === 'claude') { const i = document.createElement('img'); i.src = 'art/claude-icon.png'; i.alt = ''; i.className = 'lb-claude'; t.append(i); return t; }
  if (kind === 'did') { t.append(goldKey()); return t; }
  const icon = pixIcon(kind === 'face' ? 'video' : kind); if (icon) t.append(icon);
  return t;
}

function replyKey(t, ctx) {
  const k = T('button', 'lb-rep', 'REPLY');
  k.type = 'button';
  k.addEventListener('click', (e) => { e.stopPropagation(); ctx.onReply(t); });
  return k;
}

function key(label, cls, fn) {
  const k = T('button', 'key sm' + (cls ? ' ' + cls : ''), label);
  k.type = 'button';
  k.addEventListener('click', (e) => { e.stopPropagation(); fn(k); });
  return k;
}

/** One row: a head (tile, words, time) and, for anything rich, what opens under it. */
function rowOf(t, d, ctx) {
  const s = shapeOf(t);
  if (s.type === 'mine') {
    const m = T('div', 'lb-mine' + (ctx.replying === t.id ? ' replying' : ''));
    m.dataset.id = String(t.id);
    // C4 (2026-10-21): words he sent a Claude session carry Claude's icon and the project tag (sheet 46's "TO WAYMARK").
    const to = t.extra && typeof t.extra.to === 'string' ? t.extra.to : '';
    if (to) {
      m.classList.add('toclaude');
      const tag = T('span', 'to'), img = document.createElement('img');
      img.src = 'art/claude-icon.png'; img.alt = '';
      tag.append(img, document.createTextNode(('TO ' + to + (typeof t.extra.when === 'string' ? ' · ' + t.extra.when : '')).toUpperCase().slice(0, 60)));
      m.append(tag);
    }
    textWithLinks(m, t.text);
    m.append(replyKey(t, ctx));
    return m;
  }
  const item = T('div', 'lt-item' + (ctx.replying === t.id ? ' replying' : ''));
  item.dataset.id = String(t.id);
  const head = T('div', 'lt-head');
  const txt = T('span', 'lt-txt');
  const b = T('b'), sub = T('span');
  let tl = null, small = '', open = null;
  const when = clock(d);

  const kind = kindOf(t);
  if (s.type === 'talk') {
    item.classList.add('talk');
    tl = tile(kind?.k === 'claude' ? 'claude' : kind?.k === 'action' ? 'did' : 'aang');
    textWithLinks(b, t.text);
    if (s.links.length) open = () => { const o = T('div', 'lb-links'); for (const l of s.links) if (/^https?:\/\//.test(l.url ?? '')) o.append(linkEl(l.url, l.label)); return o; };
  } else if (s.type === 'video' || s.type === 'about') {
    tl = s.face && okImg(s.face.img) ? tile('face', s.face.img) : tile(s.type === 'video' ? 'video' : 'globe');
    b.textContent = t.text;
    if (s.about.title) sub.textContent = s.about.title;
    open = () => s.type === 'video' ? videoShot(s.about, ctx.onLink) : (() => { const o = T('div', 'lb-links'); o.append(linkEl(s.about.url, s.about.title || undefined)); return o; })();
  } else if (s.type === 'brief') {
    tl = tile('sun');
    b.textContent = 'Your morning brief';
    const br = s.brief;
    const n = (a) => Array.isArray(a) ? a.length : 0;
    const bits = [n(br.events) && `${n(br.events)} event${n(br.events) > 1 ? 's' : ''}`, n(br.unread) && `${n(br.unread)} waiting on a reply`, br.jobsNew > 0 && `${br.jobsNew} new job${br.jobsNew > 1 ? 's' : ''}`].filter(Boolean);
    sub.textContent = bits.join(' · ') || String(br.day ?? '');
    open = () => {
      const o = T('div', '');
      for (const e of (br.events ?? []).slice(0, 3)) o.append(T('p', '', `${e.start ?? ''} ${e.title ?? ''}`.trim()));
      for (const u of (br.unread ?? []).slice(0, 2)) o.append(T('p', '', `${u.from} is waiting on you`));
      o.append(keys(key('Open the whole brief', 'primary', () => ctx.onFull(t))));
      return o;
    };
  } else if (s.type === 'research') {
    tl = tile('scroll');
    b.textContent = 'This week’s research';
    const r = s.research;
    sub.textContent = Array.isArray(r.finds) ? `${r.finds.length} finds` : '';
    open = () => {
      const o = T('div', '');
      for (const f of (r.finds ?? []).slice(0, 3)) { const p = T('p', ''); if (/^https:\/\//.test(f.url ?? '')) p.append(linkEl(f.url, f.title)); else p.textContent = f.title ?? ''; o.append(p); }
      o.append(keys(key('Open it', 'primary', () => ctx.onFull(t))));
      return o;
    };
  } else if (s.type === 'plan') {
    tl = tile('art', 'art/samara/samara-lantern-32.png');
    const p = s.plan;
    b.textContent = t.text;
    if (s.x.remembered && !s.x.takenBack) { const pl = T('em', 'said-yes', 'YOU SAID YES'); sub.append(pl); }
    else if (s.x.takenBack) { item.classList.add('undone'); sub.append(T('em', 'said-yes back', 'TAKEN BACK')); }
    const steps = Array.isArray(p.steps) ? p.steps : [];
    const sites = Array.isArray(p.sites) ? p.sites : [];
    sub.append(document.createTextNode([sites.length && `${sites.length} site${sites.length > 1 ? 's' : ''}`, steps.length && `${steps.length} step${steps.length > 1 ? 's' : ''}`, p.done ? 'done' : ''].filter(Boolean).join(' · ')));
    open = () => {
      const o = T('div', 'lb-steps');
      for (const st of steps.slice(0, 8)) { const r = T('div', ''); r.append(T('i', p.done ? 'tq' : 'tq off'), document.createTextNode(String(st))); o.append(r); }
      if (sites.length) o.append(T('p', 'lb-note', 'Sites: ' + sites.join(', ')));
      // He allowed this plan, so it will not ask again. Take it back: it asks him next time.
      if (s.x.takenBack) o.append(T('p', 'lb-said', String(s.x.takenBack.said ?? 'Claude asks you again next time.')));
      else if (s.x.remembered) {
        const kb = keys(key('Take it back', 'burnt', () => {
          kb.replaceChildren(T('p', 'lb-ask', 'Have Claude ask you again before it does this plan?'),
            key('Take it back', 'burnt', (k) => { k.disabled = true; ctx.onForgetPlan(t); }), key('Leave it', '', () => ctx.setOpen(t.id, true)));
        }));
        o.append(kb);
      }
      return o;
    };
  } else if (s.type === 'yes') {
    const y = s.yes;
    item.classList.add('yes');
    const undone = y.undone && typeof y.undone === 'object';
    if (undone) item.classList.add('undone');
    tl = tile(undone ? 'undo' : y.choice === 'always' ? 'key' : 'yes');
    b.textContent = String(y.did ?? t.text).replace(/^\w/, (c) => c.toUpperCase());
    const plaque = T('em', 'said-yes' + (undone ? ' back' : y.cant ? ' gone' : ''),
      undone ? (y.undone.revoked ? 'TAKEN BACK' : 'UNDONE') + ' ' + clock(whenOf(String(y.undone.at ?? '').replace('T', ' ').slice(0, 19))).toUpperCase()
        : y.cant ? 'CAN’T UNDO' : y.choice === 'always' ? 'YOU SAID ALWAYS' : 'YOU SAID YES');
    sub.append(plaque, document.createTextNode(undone ? String(y.undone.said ?? '') : String(y.note ?? '')));
    if (y.ok === false) small = 'FAILED';
    open = () => {
      const o = T('div', '');
      if (y.question) o.append(T('p', '', `You were asked: ${y.question}`));
      if (undone) { o.append(T('p', '', String(y.undone.said ?? 'Undone.'))); return o; }
      if (y.cant) { o.append(T('p', '', String(y.cant))); return o; }
      const canUndo = Number.isFinite(y.undo) || (y.choice === 'always' && y.kindKey);
      if (!canUndo) { o.append(T('p', '', 'This one can’t be undone from here.')); return o; }
      const label = Number.isFinite(y.undo) ? 'Undo' : 'Take it back';
      const ask = Number.isFinite(y.undo) ? `Undo this: ${y.did}?` : `Have me ask you again before I ${String(y.kindKey)}?`;
      const kb = keys(key(label, 'burnt', () => {
        // Asks once, in the row itself: the question, then the same key to mean it, or Leave it.
        kb.replaceChildren(T('p', 'lb-ask', ask), key(label, 'burnt', (k) => { k.disabled = true; ctx.onUndo(t); }), key('Leave it', '', () => ctx.setOpen(t.id, true)));
      }));
      o.append(kb);
      return o;
    };
  }
  head.append(tl ?? tile('aang'), txt);
  txt.append(b);
  if (sub.childNodes.length) txt.append(sub);
  const w = T('span', 'lt-when', when);
  if (t.extra?.away) small = small || 'TO YOUR PHONE';
  if (small) w.append(T('small', '', small));
  head.append(w);
  item.append(head, replyKey(t, ctx));
  // Sheet 48: the kind's paper, and its little label right above the words, which the row opens to show under the
  // mouse (his correction, 2026-10-21: the row grows, the label is not laid on top of it). bubble.css .lb-kind.
  if (kind) {
    if (kind.k) item.classList.add('k-' + kind.k);
    txt.prepend(T('i', 'lb-kind', kind.label));
    hoverKind(item);
    if (shownId === String(t.id)) item.dataset.reshow = '1';
  }
  if (open) {
    item.classList.add('can');
    const body = T('div', 'lt-open');
    const isOpen = ctx.open === t.id;
    body.hidden = !isOpen;
    if (isOpen) { item.classList.add('open'); body.append(open()); }
    // What the brain said when he pressed Undo, right where he pressed it.
    if (isOpen && t.said) body.append(T('p', 'lb-said', t.said));
    head.addEventListener('click', (e) => {
      if (e.target.closest('.lnk')) return;
      ctx.setOpen(ctx.open === t.id ? null : t.id);
    });
    item.append(body);
  } else if (s.type === 'talk') {
    // A long answer folds to three lines; a click shows all of it.
    head.addEventListener('click', (e) => { if (!e.target.closest('.lnk')) item.classList.toggle('full'); });
  }
  return item;
}

const keys = (...ks) => { const k = T('div', 'lt-keys'); k.append(...ks); return k; };

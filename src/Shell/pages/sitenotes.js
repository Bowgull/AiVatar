// Sheet 60 section 4 (his pick, 2026-10-22): "Notes for this site". Nothing in the band, nothing always visible: a row
// in Samara's ... menu opens a RIGHT RAIL. It comes in on a spring (0.42 s, damping 0.82, the sheet's numbers) and is a
// column of the recess, so the page narrows beside it and nothing is covered. It lists the notes that came from this
// site (a note's `src`, kept by "Keep as a note" or written here) on their category paper, and "+ note for this site".
// A click on a note opens it where notes open (Aang's bubble). Its x, or Esc (here or in the page), closes it.
import { previewLines, cleanHtml } from './notepaper.js';
import { paintCat, catColour, ribbon, setOwnCats } from './notecats.js';

const WIDTH = 330;                        // the panel (300) and its wood margin
let rail = null, list = null, siteEl = null;
let open = false, url = '', notes = [], drafting = null;
/** The spring: where the rail's width is, how fast it is moving, where it is going. */
let x = 0, v = 0, goal = 0, raf = 0, last = 0;

const hostOf = (u) => { try { const h = new URL(u).hostname.replace(/^www\./, ''); return /^https?:$/.test(new URL(u).protocol) ? h : ''; } catch { return ''; } };
const day = (t) => new Date(t).toLocaleDateString('en-CA', { day: 'numeric', month: 'short' }).toUpperCase();
const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

function build() {
  if (rail) return;
  const recess = document.querySelector('.recess');
  if (!recess) return;
  rail = mk('aside', 'siterail'); rail.id = 'siterail'; rail.setAttribute('aria-label', 'Notes for this site');
  const panel = mk('div', 'sr-panel');
  const head = mk('div', 'sr-head');
  const x = mk('button', 'sr-x'); x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.title = 'Close (Esc)';
  x.innerHTML = '<svg viewBox="0 0 7 7" width="14" height="14" shape-rendering="crispEdges" aria-hidden="true"><path d="M0 0h2v1H0zM5 0h2v1H5zM0 1h3v1H0zM4 1h3v1H4zM1 2h5v1H1zM2 3h3v1H2zM1 4h5v1H1zM0 5h3v1H0zM4 5h3v1H4zM0 6h2v1H0zM5 6h2v1H5z" fill="#efe6ff"/></svg>';
  x.addEventListener('click', () => closeRail());
  head.append(mk('div', 'sr-title', 'Notes for this site'), x);
  siteEl = mk('div', 'sr-site');
  list = mk('div', 'sr-list');
  const add = mk('button', 'sr-add', '+ note for this site'); add.type = 'button';
  add.addEventListener('click', () => draft());
  const foot = mk('div', 'sr-foot'); foot.innerHTML = '<b>ESC</b> OR <b>X</b> CLOSES IT';
  panel.append(head, siteEl, list, add, foot);
  rail.append(panel);
  recess.append(rail);
}

/** This site's notes, newest first. */
function mine() {
  const h = hostOf(url);
  if (!h) return [];
  return notes.filter((n) => n.src && (hostOf(n.src.url) === h || String(n.src.site ?? '').toLowerCase() === h)).sort((a, b) => b.updated - a.updated);
}
function paint() {
  if (!rail) return;
  const here = mine();
  const h = hostOf(url);
  siteEl.textContent = h ? `${h} · ${here.length}` : 'Not a website';
  const keep = drafting && list.contains(drafting.card) ? drafting.card : null;
  list.replaceChildren(...(keep ? [keep] : []));
  if (!here.length && !keep) list.append(mk('div', 'sr-none', h ? 'No notes for this site yet.' : 'Notes for a site live on its pages.'));
  for (const n of here) list.append(card(n));
}
function card(n) {
  const c = mk('div', 'sr-card npaper');
  paintCat(c, n.cat);
  const inner = mk('div', 'np-in');
  const title = n.title && n.title !== 'Note' && n.title !== n.src?.site ? n.title : '';
  if (title) inner.append(mk('div', 'sr-t', title));
  if (n.cat) { const chip = mk('span', 'np-chip'); chip.innerHTML = '<i>#</i>'; chip.append(document.createTextNode(n.cat)); inner.append(chip); }
  const lines = previewLines(n.html).map((l) => l.t).filter((t) => t !== n.src?.url).slice(0, 3);
  inner.append(mk('div', 'sr-l', lines.join(' ') || '(empty)'));
  inner.append(mk('div', 'sr-m', `Written here · ${day(n.updated)}`));
  c.append(mk('div', 'np-edge'), mk('div', 'np-fill'), ribbon(catColour(n.cat).deep), inner);
  c.title = 'Open this note';
  c.addEventListener('click', () => window.aang?.browserNoteOpen?.(n.id));
  return c;
}
/** "+ note for this site": a fresh plain note at the top of the rail, ready to type. Enter keeps it, Esc lets it go. */
function draft() {
  if (drafting && list.contains(drafting.card)) { drafting.body.focus(); return; }
  const id = 'n' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
  const c = mk('div', 'sr-card npaper new');
  paintCat(c, '');
  const inner = mk('div', 'np-in');
  const body = mk('div', 'nbody'); body.contentEditable = 'true'; body.spellcheck = false; body.dataset.ph = 'A note for this site...';
  inner.append(body, mk('div', 'sr-m', 'Enter keeps it · Esc lets it go'));
  c.append(mk('div', 'np-edge'), mk('div', 'np-fill'), ribbon(catColour('').deep), inner);
  drafting = { id, card: c, body };
  list.querySelector('.sr-none')?.remove();
  list.prepend(c);
  const keep = () => {
    const words = (body.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!drafting || drafting.card !== c) return;
    drafting = null;
    if (!words) { c.remove(); paint(); return; }
    const html = cleanHtml(body.innerHTML);
    window.aang?.browserNoteSave?.({ id, title: words.split(' ').slice(0, 4).join(' '), html, cat: '' });
    // It shows as a note at once; the brain's list brings it back with its date.
    notes = [{ id, title: words.split(' ').slice(0, 4).join(' '), html, src: { url, site: hostOf(url) }, updated: Date.now() }, ...notes.filter((n) => n.id !== id)];
    paint();
  };
  body.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); keep(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); body.textContent = ''; keep(); }
  });
  body.addEventListener('paste', (e) => { e.preventDefault(); document.execCommand('insertText', false, (e.clipboardData?.getData('text/plain') ?? '').slice(0, 5000)); });
  body.addEventListener('blur', () => setTimeout(keep, 0));
  setTimeout(() => body.focus(), 30);
}

// ---------------------------------------------------------------- the spring (0.42 s, damping 0.82)
const OMEGA = 4 / (0.82 * 0.42), ZETA = 0.82;
function step(t) {
  const dt = Math.min(0.032, (t - last) / 1000 || 0.016); last = t;
  const a = -OMEGA * OMEGA * (x - goal) - 2 * ZETA * OMEGA * v;
  v += a * dt; x += v * dt;
  if (Math.abs(x - goal) < 0.5 && Math.abs(v) < 4) { x = goal; v = 0; }
  rail.style.width = Math.max(0, Math.round(x)) + 'px';
  if (x === goal) { raf = 0; if (!goal) rail.classList.remove('on'); return; }
  raf = requestAnimationFrame(step);
}
function springTo(w) {
  goal = w;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { x = w; v = 0; rail.style.width = w + 'px'; if (!w) rail.classList.remove('on'); return; }
  if (!raf) { last = performance.now(); raf = requestAnimationFrame(step); }
}

export function openRail() {
  build();
  if (!rail) return;
  open = true;
  rail.classList.add('on');
  paint();
  springTo(WIDTH);
  window.aang?.browserAct?.('siterail-on');
}
export function closeRail() {
  if (!open || !rail) return;
  open = false;
  if (drafting) drafting.body.blur();
  springTo(0);
  window.aang?.browserAct?.('siterail-off');
}
export const railOpen = () => open;
/** The tab in front changed: the rail follows the site. */
export function railTabs(state) {
  const t = state && Array.isArray(state.tabs) ? state.tabs.find((x) => x.id === state.active) : null;
  const next = t ? String(t.url ?? '') : '';
  if (next === url) return;
  const moved = hostOf(next) !== hostOf(url);
  url = next;
  if (open && moved) paint();
}
window.aang?.onBrowserNotes?.((s) => {
  if (!s || !Array.isArray(s.notes)) return;
  setOwnCats(s.cats);
  notes = s.notes;
  if (open) paint();
});
window.aang?.onBrowserRailClose?.(() => closeRail());
// Esc in the frame closes it too (a draft's own Esc lets the draft go first).
window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open && !(/** @type {HTMLElement} */ (e.target)).closest?.('.sr-card.new')) { e.preventDefault(); e.stopImmediatePropagation(); closeRail(); } }, true);

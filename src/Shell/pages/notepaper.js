// Sheet 17's sticky notes (approved 2026-10-12): one paper, used both in the bubble's board and on his screen.
// Free text with a title. Right-click for the rest: bold, italic, underline, strike, header, ticks, bullets,
// numbers, size, font, and on the screen see-through and pin.
// Sheet 60 (2026-10-22): look B. The colour comes from the CATEGORY (notecats.js), never picked on its own, so the
// colour row is gone from the menu; the ribbon tab replaced the pin; and every note carries the same control row
// (# category, checklist, "Aang can bring this up"), quick or not.
//
// A note's HTML is only ever what this editor makes. It is cleaned here before it is shown (and again by the
// brain on every save), and a paste goes in as plain text, so nothing from a web page can ride in on one.
import { paintCat, catColour, ribbon, controls, openPicker, closePicker, toggleChecklist } from './notecats.js';

/** Sheet 17's colours, kept only so an old page or test still finds the names. A note's colour is its category now. */
export const SCHEMES = {
  parchment: { name: 'Parchment', a: '#F6E6C6', b: '#E6CFA2', pin: '#C98C14', pinL: '#FFE096', ink: '#2a1c10', sub: '#7a6440' },
  sage: { name: 'Sage', a: '#E3ECCF', b: '#C9D8AE', pin: '#3E7A4E', pinL: '#8CCB8F', ink: '#1f2a14', sub: '#55663f' },
  rose: { name: 'Rose', a: '#F6D9CC', b: '#E9BBA7', pin: '#9c3a26', pinL: '#E48468', ink: '#2e140c', sub: '#7d4a3a' },
  sky: { name: 'Sky', a: '#DCE7F0', b: '#BDD0E0', pin: '#365f88', pinL: '#86AEDA', ink: '#13202e', sub: '#4c6278' },
  plum: { name: 'Plum', a: '#E9DDF3', b: '#D2BCE6', pin: '#4A2C6E', pinL: '#A784D8', ink: '#211431', sub: '#5f4a7a' },
  stone: { name: 'Stone', a: '#E8E6E1', b: '#D2CEC5', pin: '#5d574c', pinL: '#A9A398', ink: '#22201b', sub: '#5f594e' },
};
/** Key, the name on the menu, and the real family (a CSS variable would not survive the brain's cleaning). */
export const FONTS = {
  figtree: ['Plain', 'Figtree'], caveat: ['Handwritten', 'Caveat'], patrick: ['Marker', 'Patrick Hand'], cinzel: ['Fancy', 'Cinzel'],
  fell: ['Storybook', 'IM Fell English'], elite: ['Typewriter', 'Special Elite'], silk: ['Pixel', 'Silkscreen'], vt: ['Terminal', 'VT323'], arcade: ['Arcade', 'Press Start 2P'],
};
export const SIZES = { s: 13, m: 15, l: 18 };
/** A note's size, in px: the old S/M/L names, or any number from 10 to 28 (his ask: finer than three sizes). */
export const sizePx = (s) => SIZES[s] ?? Math.max(10, Math.min(28, Number(s) || 15));
const FAMILIES = new Set(Object.values(FONTS).map((f) => f[1].toLowerCase()));

/** Paint a note's colours (from its category), font and size onto an element as CSS variables. */
export function paintNote(el, n) {
  const c = paintCat(el, n.cat);
  const set = (k, v) => el.style.setProperty(k, v);
  // The older names too, for anything still drawn with them: the same category colour.
  set('--pa', c.paper); set('--pb', c.paper); set('--pin', c.deep); set('--pinl', c.paper); set('--ink2', '#2a1c10'); set('--sub2', '#6b5236');
  set('--nf', `'${(FONTS[n.font] ?? FONTS.figtree)[1]}'`);
  set('--ns', sizePx(n.size) + 'px');
  // The title's own font and size (his ask: the title should change like the rest). Unset: the Cinzel heading.
  if (n.tfont && FONTS[n.tfont]) set('--tf', `'${FONTS[n.tfont][1]}'`); else el.style.removeProperty('--tf');
  if (n.tsize) set('--ts', sizePx(n.tsize) + 'px'); else el.style.removeProperty('--ts');
}

const KEEP = new Set(['DIV', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'H3', 'UL', 'OL', 'LI', 'SPAN']);
/** The note's HTML, rebuilt node by node from an inert parse: only the editor's own tags and styles survive. */
export function cleanHtml(html) {
  const doc = new DOMParser().parseFromString(`<body>${String(html ?? '')}</body>`, 'text/html');
  const out = document.createElement('div');
  const copy = (from, to) => {
    for (const node of [...from.childNodes]) {
      if (node.nodeType === 3) { to.append(node.textContent ?? ''); continue; }
      if (node.nodeType !== 1) continue;
      const el = /** @type {HTMLElement} */ (node);
      if (!KEEP.has(el.tagName)) { if (el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE') copy(el, to); continue; }
      const tag = el.tagName === 'STRONG' ? 'b' : el.tagName === 'EM' ? 'i' : el.tagName === 'STRIKE' ? 's' : el.tagName.toLowerCase();
      const made = document.createElement(tag);
      if (tag === 'div' && el.classList.contains('cl')) { made.className = el.classList.contains('done') ? 'cl done' : 'cl'; }
      if (tag === 'span') {
        const fam = (el.style.fontFamily || '').split(',')[0].replace(/["']/g, '').trim();
        if (fam && FAMILIES.has(fam.toLowerCase())) made.style.fontFamily = `'${fam}'`;
        const px = parseInt(el.style.fontSize || '', 10);
        if (px >= 10 && px <= 28) made.style.fontSize = px + 'px';
      }
      to.append(made);
      if (tag !== 'br') copy(el, made);
    }
  };
  copy(doc.body, out);
  return out.innerHTML;
}

/** The note's text as a few short preview lines for the board, with which ones are ticked. */
export function previewLines(html) {
  const box = document.createElement('div');
  box.innerHTML = cleanHtml(html);
  return [...box.querySelectorAll('div,li,h3')].filter((e) => !e.querySelector('div,li,h3')).map((e) => ({ t: (e.textContent ?? '').trim(), done: e.classList.contains('done') })).filter((l) => l.t)
    .concat(box.querySelector('div,li,h3') ? [] : [{ t: (box.textContent ?? '').trim(), done: false }]).filter((l) => l.t);
}
export function tickCount(html) { return { all: (html.match(/class="cl/g) ?? []).length, done: (html.match(/class="cl done"/g) ?? []).length }; }

/**
 * Make `root` hold an editable note (sheet 60 look B): the ribbon, the title, the free body and the control row.
 * `onChange(note)` is called, a little after he stops typing (at once for a control), with the note as it now is.
 * opts: `quick` (the quick note: no title line, "A thought, a to-do, anything..."), `controls` (default true),
 * `pickHost` (where the category list opens), `onPicker(open, at)` (a note window grows while the list is open; it
 * may return a promise for when there is room).
 */
export function buildPaper(root, n, onChange, opts = {}) {
  root.replaceChildren();
  root.classList.add('npaper');
  const edge = document.createElement('div'); edge.className = 'np-edge';
  const fill = document.createElement('div'); fill.className = 'np-fill';
  const inner = document.createElement('div'); inner.className = 'np-in';
  // "Note" is what the brain calls a note with no title: shown as no title, with the hint.
  const title = document.createElement('div'); title.className = 'ntitle'; title.contentEditable = 'true'; title.spellcheck = false; title.textContent = n.title === 'Note' ? '' : (n.title ?? ''); title.dataset.ph = 'Title';
  const body = document.createElement('div'); body.className = 'nbody'; body.contentEditable = 'true'; body.spellcheck = false; body.innerHTML = cleanHtml(n.html); body.dataset.ph = opts.quick ? 'A thought, a to-do, anything...' : 'Write here...';
  if (opts.quick) title.hidden = true;
  inner.append(title, body);
  let rib = ribbon(catColour(n.cat).deep);
  root.append(edge, fill, rib, inner);
  paintNote(root, n);
  let timer = 0;
  const read = () => { n.title = (title.textContent ?? '').trim().slice(0, 60); n.html = cleanHtml(body.innerHTML); };
  const changed = () => { clearTimeout(timer); timer = window.setTimeout(() => { read(); onChange(n); }, 600); };
  const now = () => { clearTimeout(timer); read(); onChange(n); };
  /** The control row, drawn again after any change to what it shows. */
  let ctl = null;
  const drawControls = () => {
    if (opts.controls === false) return;
    const next = controls(n, (what, v) => {
      if (what === 'cat') {
        const host = opts.pickHost ?? root.parentElement ?? document.body;
        if (closePicker(host)) return;
        const cr = /** @type {HTMLElement} */ (v).getBoundingClientRect();
        const open = () => {
          const hr = host.getBoundingClientRect(), c2 = /** @type {HTMLElement} */ (v).getBoundingClientRect();
          const p = openPicker(host, { x: c2.left - hr.left, y: c2.bottom - hr.top + 6 }, n.cat ?? '', (cat) => setCat(cat));
          const watch = new MutationObserver(() => { if (!host.contains(p)) { watch.disconnect(); opts.onPicker?.(false); } });
          watch.observe(host, { childList: true });
        };
        const room = opts.onPicker?.(true, { x: cr.left, y: cr.bottom + 6 });
        if (room && typeof room.then === 'function') room.then(open); else open();
      } else if (what === 'check') { toggleChecklist(body); now(); drawControls(); }
      else if (what === 'notice') { if (v) delete n.notice; else n.notice = false; now(); drawControls(); }
    });
    if (ctl) ctl.replaceWith(next); else inner.append(next);
    ctl = next;
  };
  /** A category picked: the paper cross-fades to its colour (notecats.css), the ribbon follows, saved at once. */
  const setCat = (cat) => {
    if (cat) n.cat = cat; else delete n.cat;
    paintNote(root, n);
    const r2 = ribbon(catColour(n.cat).deep); rib.replaceWith(r2); rib = r2;
    now(); drawControls();
  };
  drawControls();
  title.addEventListener('input', changed);
  body.addEventListener('input', changed);
  title.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); body.focus(); } });
  // A paste goes in as plain text: whatever was on the clipboard, only its words.
  for (const el of [title, body]) el.addEventListener('paste', (e) => { e.preventDefault(); const t = e.clipboardData?.getData('text/plain') ?? ''; document.execCommand('insertText', false, t.slice(0, 5000)); });
  // A tick: the box at the start of a tick line.
  body.addEventListener('pointerdown', (e) => {
    const line = /** @type {HTMLElement|null} */ ((/** @type {HTMLElement} */ (e.target)).closest?.('.cl'));
    if (!line) return;
    const r = line.getBoundingClientRect();
    if (e.clientX - r.left < 22) { e.preventDefault(); line.classList.toggle('done'); changed(); }
  });
  return { root, title, body, flush: now, setCat, redraw: drawControls };
}

/**
 * The right-click menu. `where` is 'board' (in the bubble) or 'screen' (stuck on his screen); the last part of
 * the menu differs. `act(name, value)` is called for the things the page around it has to do: 'out', 'back',
 * 'pin', 'delete', 'opacity'. Formatting is done here, on the highlighted words when there are any.
 */
export function openMenu(host, at, paper, n, where, act, part = 'body') {
  closeMenu(host);
  const sel = getSelection();
  let saved = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
  const savedSet = (r) => { saved = r; };
  const menu = document.createElement('div'); menu.className = 'nmenu'; menu.id = 'nmenu';
  const row = (cls = 'nm-row') => { const d = document.createElement('div'); d.className = cls; menu.append(d); return d; };
  const btn = (to, cls, html, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.innerHTML = html; b.addEventListener('mousedown', (e) => e.preventDefault()); b.addEventListener('click', () => { fn(); }); to.append(b); return b; };
  const lab = (t) => { const d = document.createElement('div'); d.className = 'nm-lab'; d.textContent = t; menu.append(d); };

  // Sheet 60: no colour row. The colour is the category's (the # chip on the note).
  const fmt = row();
  for (const [cmd, html] of [['bold', '<b>B</b>'], ['italic', '<i>I</i>'], ['underline', '<u>U</u>'], ['strikeThrough', '<s>S</s>']]) btn(fmt, 'nb', html, () => { restore(); document.execCommand(cmd); done(); });
  const lists = row();
  btn(lists, 'nb', '<span class="li-box"><i></i></span>', () => { restore(); toggleTicks(paper.body); done(); }).title = 'Tick boxes';
  btn(lists, 'nb', '<span class="li-dot"></span>', () => { restore(); document.execCommand('insertUnorderedList'); done(); }).title = 'Bullets';
  btn(lists, 'nb', '123', () => { restore(); document.execCommand('insertOrderedList'); done(); }).title = 'Numbers';
  // Size: a pixel at a time, 10 to 28. The highlighted words if any, the whole note otherwise. The menu stays
  // open so he can press it a few times and watch it change.
  lab('SIZE');
  const sizes = row('nm-row nm-size');
  const sizeNow = () => {
    if (inTitle()) return sizePx(n.tsize ?? 18);
    if (picked()) { const el = saved.startContainer.nodeType === 1 ? saved.startContainer : saved.startContainer.parentElement; return Math.round(parseFloat(getComputedStyle(el).fontSize)) || sizePx(n.size); }
    return sizePx(n.size);
  };
  // A box he can type a size into (his ask): type it, press Enter. A- and A+ still step one pixel.
  const shown = document.createElement('input'); shown.className = 'nm-px'; shown.type = 'number'; shown.min = '10'; shown.max = '28'; shown.value = String(sizeNow());
  shown.title = 'Type a size from 10 to 28, then Enter';
  shown.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); setTo(Number(shown.value)); } e.stopPropagation(); });
  shown.addEventListener('change', () => setTo(Number(shown.value)));
  const step = (d) => setTo(sizeNow() + d);
  function setTo(want) {
    if (!Number.isFinite(want)) return;
    const px = Math.max(10, Math.min(28, Math.round(want)));
    if (inTitle()) { n.tsize = String(px); paintNote(paper.root, n); }
    else if (picked()) { restore(); wrap(`font-size:${px}px`); const s = getSelection(); if (s && s.rangeCount) savedSet(s.getRangeAt(0).cloneRange()); }
    else { n.size = String(px); paintNote(paper.root, n); }
    shown.value = String(px);
    paper.flush();
  }
  btn(sizes, 'nb', 'A\u2212', () => step(-1)).title = 'Smaller';
  sizes.append(shown);
  btn(sizes, 'nb', 'A+', () => step(1)).title = 'Bigger';
  lab('FONT');
  const fonts = row('nm-fonts');
  for (const [k, f] of Object.entries(FONTS)) {
    // Just the font's name, written in that font (his ask: the "Aa 123" samples crowded the buttons).
    // What he is pointing at changes, nothing else: the highlighted words, else the title if he right-clicked
    // the title, else the whole body.
    const current = inTitle() ? (n.tfont ?? '') : (n.font ?? 'figtree');
    const b = btn(fonts, 'fnt' + (k === current ? ' on' : ''), '<b></b>', () => {
      if (inTitle()) { n.tfont = k; paintNote(paper.root, n); }
      else if (picked()) wrap(`font-family:'${f[1]}'`);
      else { n.font = k; paintNote(paper.root, n); }
      done(b);
    });
    const name = /** @type {HTMLElement} */ (b.querySelector('b'));
    name.textContent = f[0];
    name.style.fontFamily = `'${f[1]}'`;
    // Arcade is very wide and Terminal very small at the same size; their names are sized to sit like the rest.
    if (k === 'arcade') name.style.fontSize = '7px';
    if (k === 'vt') name.style.fontSize = '17px';
    if (k === 'silk') name.style.fontSize = '9px';
    if (k === 'elite') name.style.fontSize = '11px';
  }
  if (where === 'screen') {
    lab('SEE-THROUGH');
    const sl = row('nm-slide');
    const r = document.createElement('input'); r.type = 'range'; r.min = '25'; r.max = '100'; r.value = String(Math.round((n.out?.opacity ?? 1) * 100));
    const v = document.createElement('span'); v.textContent = r.value + '%';
    r.addEventListener('input', () => { v.textContent = r.value + '%'; act('opacity', Number(r.value) / 100); });
    sl.append(r, v);
  }
  const sep = document.createElement('div'); sep.className = 'nm-sep'; menu.append(sep);
  if (where === 'screen') { btn(menu, 'mrow2', 'Pin', () => { closeMenu(host); act('pin'); }); btn(menu, 'mrow2', 'Click through', () => { closeMenu(host); act('through'); }); btn(menu, 'mrow2', 'Back to board', () => { closeMenu(host); act('back'); }); }
  else btn(menu, 'mrow2', 'Stick on screen', () => { closeMenu(host); act('out'); });
  btn(menu, 'mrow2 warn', 'Delete', () => { closeMenu(host); act('delete'); });

  host.append(menu);
  const hw = host.clientWidth || innerWidth, hh = host.clientHeight || innerHeight;
  // On the screen the window grows to make room, so the menu opens exactly where he clicked.
  menu.style.left = (where === 'screen' ? Math.max(4, at.x) : Math.max(4, Math.min(at.x, hw - menu.offsetWidth - 4))) + 'px';
  menu.style.top = (where === 'screen' ? Math.max(4, at.y) : Math.max(4, Math.min(at.y, hh - menu.offsetHeight - 4))) + 'px';
  setTimeout(() => document.addEventListener('pointerdown', away, true), 0);

  function away(e) { if (!menu.contains(e.target)) closeMenu(host); }
  function restore() { paper.body.focus(); if (saved && paper.body.contains(saved.startContainer)) { const s = getSelection(); s?.removeAllRanges(); s?.addRange(saved); } }
  function picked() { return !!saved && !saved.collapsed && paper.body.contains(saved.commonAncestorContainer); }
  function inTitle() { return part === 'title' || (!!saved && paper.title.contains(saved.commonAncestorContainer)); }
  function wrap(css) {
    const sp = document.createElement('span'); sp.setAttribute('style', css);
    sp.append(saved.extractContents()); saved.insertNode(sp);
    const s = getSelection(); s?.removeAllRanges(); const r = document.createRange(); r.selectNodeContents(sp); s?.addRange(r);
  }
  /**
   * A formatting pick keeps the menu open (his ask: picking a font closed it). The change is saved, the same words
   * stay picked so the next pick lands on them too, and the button he pressed lights up.
   */
  function done(pressed) {
    paper.flush();
    const s = getSelection();
    if (s && s.rangeCount && paper.root.contains(s.anchorNode)) savedSet(s.getRangeAt(0).cloneRange());
    if (pressed && pressed.parentElement) for (const b of pressed.parentElement.children) b.classList.toggle('on', b === pressed);
  }
  menu.__away = away;
  return menu;
}
export function closeMenu(host) {
  const m = /** @type {any} */ (host.querySelector('#nmenu'));
  if (!m) return;
  document.removeEventListener('pointerdown', m.__away, true);
  m.remove();
}

/** Ticks on the line the caret is on (or every highlighted line); off again if they are already ticks. */
function toggleTicks(body) {
  document.execCommand('formatBlock', false, 'div');
  const s = getSelection();
  if (!s || !s.rangeCount) return;
  const r = s.getRangeAt(0);
  const lines = [...body.children].filter((el) => r.intersectsNode(el));
  const on = !lines.every((el) => el.classList.contains('cl'));
  for (const el of lines) { if (el.tagName !== 'DIV') continue; el.classList.toggle('cl', on); if (!on) el.classList.remove('done'); }
}

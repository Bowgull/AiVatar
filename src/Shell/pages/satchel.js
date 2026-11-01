// The Satchel (sheet 116 v2.4, approved 2026-11-01), the real one. The sheet's code, minus its demo desk: the clips come
// from satchel.ts over the preload's doors, and every action goes back by the clip's id. His picks: click a clip to copy
// it (the Satchel stays); type to find, arrows, Enter copies and closes; Esc, a click outside, the hotkey again or the
// mouse wandering off closes it; pinned on top, filter by type; keys sit on the hovered clip's top edge like tabs.
import { P, rr, fills, spr, mix, paperAt, loadTex, paper, satchelIcon } from './satchelpix.js';

const $ = (s, r = document) => r.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
await loadTex('band.png', 'tray.png');
await document.fonts.ready;

// ---------------------------------------------------------------- springs as CSS linear() (no JavaScript per frame)
function spring({ response, damping, v0 = 0, cut = false }) {
  const w = (2 * Math.PI) / response, dt = 1 / 600; let x = 0, v = v0, t = 0; const pts = [[0, 0]];
  while (t < 3) {
    v += (-(w * w) * (x - 1) - 2 * damping * w * v) * dt; x += v * dt; t += dt;
    if (cut && x >= 1) { pts.push([t, 1]); break; }
    if (Math.abs(1 - x) < 0.0015 && Math.abs(v) < 0.02) { pts.push([t, 1]); break; }
    if (Math.round(t * 600) % 12 === 0) pts.push([t, x]);
  }
  const T = pts[pts.length - 1][0];
  return { css: 'linear(' + pts.map(([tt, xx]) => `${xx.toFixed(3)} ${(100 * tt / T).toFixed(1)}%`).join(', ') + ')', ms: Math.round(T * 1000) };
}
const root = document.documentElement.style;
const SPRINGS = { open: spring({ response: 0.38, damping: 0.86, v0: 0.6, cut: true }), close: spring({ response: 0.24, damping: 1 }), drop: spring({ response: 0.42, damping: 0.72 }) };
for (const [k, s] of Object.entries(SPRINGS)) { root.setProperty(`--${k}-ease`, s.css); root.setProperty(`--${k}-ms`, s.ms + 'ms'); }

// ---------------------------------------------------------------- the keys: cream keycaps, crisp glyphs (sheet 116 v2.1)
const INK = '#2c1c10';
const GLYPH = {
  copy: spr(['...OOOOOOO.', '...OWWWWWO.', '...OWKKKWO.', 'OOOOOOOWWO.', 'OWWWWWOKWO.', 'OWKKKWOWWO.', 'OWWWWWOOOO.', 'OWKKKWO....', 'OWWWWWO....', 'OWKKWWO....', 'OOOOOOO....'], { O: INK, W: '#fffaf0', K: '#a07a48' }),
  pin: spr(['..OOOOOOO..', '..OLGGGGO..', '..OGGGGSO..', '..OGGGGSO..', '..OGGGGSO..', '..OGGGGSO..', '..OGGGGSO..', '..OGGOGSO..', '..OGO.OSO..', '..OO...OO..'], { O: INK, L: '#ffe9a8', G: '#e8b440', S: '#b97a22' }),
  note: spr(['OOOOOOOOOOO', 'OYYYYYYYYYO', 'OYKKKKKKYYO', 'OYYYYYYYYYO', 'OYKKKKKYYYO', 'OYYYYYYYYYO', 'OYKKKKKKKYO', 'OYYYYYYYYYO', 'OSSSSSSSSSO', 'OOOOOOOOOOO'], { O: INK, Y: '#f8dc8e', K: '#a07a48', S: '#d9b25a' }),
  bin: spr(['....OOO....', '.OOOOOOOOO.', 'OLLLLLLLLLO', 'OOOOOOOOOOO', '.ORRRRRRRO.', '.ORSRSRSRO.', '.ORSRSRSRO.', '.ORSRSRSRO.', '.ORSRSRSRO.', '.ORRRRRRRO.', '..OOOOOOO..'], { O: INK, L: '#e79c7b', R: '#c4572f', S: '#8a3e1c' }),
};
const clone = (c) => { const k = document.createElement('canvas'); k.width = c.width; k.height = c.height; k.getContext('2d').drawImage(c, 0, 0); k.style.cssText = c.style.cssText; return k; };
function keycap(dark) {
  return rr(16, 14, 4, { band: 'edge', shadow: 1, shadowCol: [40, 22, 8, 255], fill: (x, y, c) => {
    let p = dark ? mix('#6a3fa0', '#4A2C6E', y / 14) : paperAt(y / 14);
    if (c.d === 0 && c.lit > 0.3) p = mix(p, '#ffffff', dark ? 0.25 : 0.55);
    if (y === 12) p = mix(p, dark ? '#24123c' : '#b8955e', 0.6);
    return p; } });
}
const CAP = clone(keycap(false)), CAP_ASK = clone(keycap(true));

// ---------------------------------------------------------------- the Satchel
const sat = $('#sat');
const wood = rr(392 / P, 580 / P, 4, { band: 's2', E: 4, shadow: 0, fill: fills.wood(1) }); wood.classList.add('board'); sat.append(wood);
const hd = el('div', 'hd'); hd.append(satchelIcon(), el('span', 'ttl', 'Satchel')); sat.append(hd);
const search = el('input', 'search'); search.placeholder = 'Type to find a clip'; search.spellcheck = false; sat.append(search);
const chips = el('div', 'chips'); sat.append(chips);
const list = el('div', 'list'); sat.append(list);
const FILTERS = [['All', null], ['Words', ['text', 'code', 'color']], ['Links', ['link']], ['Pictures', ['pic']], ['Snips', ['snip']], ['Files', ['file']]];
let filterAt = 0;
FILTERS.forEach(([t], i) => { const c = el('span', 'chip' + (i ? '' : ' on'), t); c.onclick = () => { filterAt = i; chips.querySelectorAll('.chip').forEach((x, k) => x.classList.toggle('on', k === i)); draw(); }; chips.append(c); });

let clips = [], can = { note: false, ask: false }, isOpen = false, sel = -1, entered = false, wander = null;
const WORDS = { copy: 'Copy', pin: 'Pin to the top', unpin: 'Unpin', note: 'Keep as a note', ask: 'Ask Aang about it', bin: 'Bin', noteOff: 'Keep as a note (needs Aang)', askOff: 'Ask Aang (needs Aang)' };
function keyIcon(wordKey, glyph, act, { dark = false, off = false } = {}) {
  const s = el('span', 'ik' + (off ? ' off' : '')); const cap = clone(dark ? CAP_ASK : CAP); cap.classList.add('cap'); glyph.classList.add('glyph'); s.append(cap, glyph);
  s.addEventListener('mouseenter', () => { const w = s.parentElement?.querySelector('.word'); if (w) w.textContent = WORDS[wordKey]; });
  s.addEventListener('mouseleave', () => { const w = s.parentElement?.querySelector('.word'); if (w) w.textContent = ''; });
  s.addEventListener('click', (e) => { e.stopPropagation(); if (!off) act(); });
  return s;
}
function acts(c) {
  const a = el('div', 'acts'); a.append(el('span', 'word', ''));
  const face = el('img'); face.src = 'art/aang-face.png'; face.alt = '';
  a.append(keyIcon('copy', clone(GLYPH.copy), () => copy(c.id)),
    keyIcon(c.pinned ? 'unpin' : 'pin', clone(GLYPH.pin), () => window.satchel?.pin(c.id)),
    keyIcon(can.note ? 'note' : 'noteOff', clone(GLYPH.note), () => window.satchel?.note(c.id), { off: !can.note }),
    keyIcon(can.ask ? 'ask' : 'askOff', face, () => window.satchel?.ask(c.id), { dark: true, off: !can.ask }),
    keyIcon('bin', clone(GLYPH.bin), () => window.satchel?.bin(c.id)));
  return a;
}
const FILEICON = { pdf: 'file_pdf.png', zip: 'file_zip.png', rar: 'file_zip.png', '7z': 'file_zip.png', exe: 'file_exe.png', msi: 'file_exe.png', png: 'file_img.png', jpg: 'file_img.png', jpeg: 'file_img.png', gif: 'file_img.png', webp: 'file_img.png', mp4: 'file_av.png', mkv: 'file_av.png', mp3: 'file_av.png', wav: 'file_av.png', doc: 'file_doc.png', docx: 'file_doc.png', txt: 'file_doc.png', md: 'file_doc.png' };
const LINK_COL = ['#2f78b8', '#c4372f', '#3f8a4e', '#9a4478', '#c98c14', '#4A2C6E'];
function when(at) {
  const d = new Date(at), now = new Date(), t = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
  const day = (x) => Math.floor((x.getTime() - x.getTimezoneOffset() * 60000) / 86400000);
  const ago = day(now) - day(d);
  return ago === 0 ? t : ago === 1 ? 'yesterday ' + t : d.toLocaleDateString('en-US', { weekday: 'short' }) + ' ' + t;
}
function card(c) {
  const e = el('div', 'card ' + c.kind); e.dataset.id = c.id;
  const cin = el('div', 'cin');
  if (c.kind === 'text') cin.append(el('div', 'txt', esc(c.text)));
  if (c.kind === 'code') cin.append(el('div', 'code', esc(c.text)));
  if (c.kind === 'link') {
    let host = '', rest = c.text; try { const u = new URL(c.text); host = u.hostname.replace(/^www\./, ''); rest = (u.pathname + u.search).replace(/\/$/, '') || '/'; } catch { /* as written */ }
    const f = el('span', 'fav', esc((host[0] ?? '?').toUpperCase())); f.style.background = LINK_COL[(host.length + (host.charCodeAt(0) || 0)) % LINK_COL.length];
    const r = el('div', 'row'); r.append(f, el('div', 'ln', `<b>${esc(host || c.text)}</b><span>${esc(rest)}</span>`)); cin.append(r);
  }
  if ((c.kind === 'pic' || c.kind === 'snip') && c.thumb) { const p = el('div', 'pic'); const i = el('img'); i.src = c.thumb; i.alt = ''; p.append(i); cin.append(p); }
  if (c.kind === 'file') {
    const name = c.text.split(/[\\/]/).pop() ?? c.text, ext = (name.split('.').pop() ?? '').toLowerCase();
    const i = el('img'); i.src = 'art/browser/' + (FILEICON[ext] ?? 'file_file.png'); i.alt = '';
    const r = el('div', 'row file'); r.append(i, el('div', 'ln', `<b>${esc(name)}</b><span>${esc(c.text)}</span>`)); cin.append(r);
  }
  if (c.kind === 'color') { const r = el('div', 'row'); const s = el('span', 'sw'); s.style.background = c.text; r.append(s, el('div', 'ln', `<b>${esc(c.text)}</b><span>a colour</span>`)); cin.append(r); }
  const meta = el('div', 'meta', esc(`${c.pinned ? 'pinned' : when(c.at)}${c.from ? ' · ' + c.from : ''}`));
  if (c.mac) meta.append(el('span', 'mac', 'from the Mac'));
  cin.append(meta); e.append(cin, acts(c));
  e._c = c; e._words = [c.text, c.from, c.kind].join(' ').toLowerCase();
  // Pictures, snips and files drag out into any app (Edge-Drop's: the drag starts while the button is still down)
  if (c.kind === 'pic' || c.kind === 'snip' || c.kind === 'file') {
    e.draggable = true;
    e.addEventListener('dragstart', (ev) => { ev.preventDefault(); dragging = true; window.satchel?.drag(c.id); setTimeout(() => { dragging = false; }, 400); });
  }
  return e;
}
let dragging = false;
function dress(e) {
  if (e.querySelector(':scope > canvas.paper') || !e.offsetHeight) return;
  const col = e._c.kind === 'snip' ? '#d3e9f8' : e._c.mac ? '#e6dcf2' : '#f3e2a6';
  const pp = paper(e.offsetWidth / P, Math.max(24, Math.ceil((e.offsetHeight - (e.matches(':hover') ? 24 : 0)) / P)), col, { small: true, lifted: true });
  pp.classList.add('paper'); e.prepend(pp);
}
const dayOf = (at) => { const d = new Date(at); return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000); };
function draw() {
  const q = search.value.trim().toLowerCase(), want = FILTERS[filterAt][1];
  const shown = clips.filter((c) => (!want || want.includes(c.kind)) && (!q || [c.text, c.from, c.kind].join(' ').toLowerCase().includes(q)));
  const keep = new Map([...list.querySelectorAll('.card')].map((e) => [e.dataset.id, e]));
  list.replaceChildren();
  const today = dayOf(Date.now());
  let lastSec = '';
  for (const c of shown) {
    const sec = c.pinned ? 'PINNED' : dayOf(c.at) === today ? 'TODAY' : dayOf(c.at) === today - 1 ? 'YESTERDAY' : 'EARLIER';
    if (sec !== lastSec) { list.append(el('div', 'sec', sec)); lastSec = sec; }
    const old = keep.get(c.id);
    const fresh = old && old._c.pinned === c.pinned && old._c.at === c.at && old._c.thumb === c.thumb && old._acts === `${can.note}${can.ask}`;
    const e = fresh ? old : card(c); e._acts = `${can.note}${can.ask}`; list.append(e);
  }
  if (!shown.length) list.append(el('div', 'none', clips.length ? 'Nothing in your Satchel matches that.' : 'Nothing here yet. Copy something and it lands here.'));
  requestAnimationFrame(() => list.querySelectorAll('.card').forEach(dress));
  select(sel >= 0 ? Math.min(sel, cards().length - 1) : -1);
}
const cards = () => [...list.querySelectorAll('.card')];
function select(i) { cards().forEach((c, k) => c.classList.toggle('sel', k === i)); sel = i; cards()[i]?.scrollIntoView({ block: 'nearest' }); }
function copy(id, andClose = false) {
  const e = cards().find((x) => x.dataset.id === id); if (!e) return;
  window.satchel?.copy(id);
  e.append(el('div', 'ripple'));
  const r = e.getBoundingClientRect(), s = sat.getBoundingClientRect();
  const t = el('div', 'toast', 'Copied'); t.style.left = r.left - s.left + 150 + 'px'; t.style.top = r.top - s.top - 4 + 'px'; sat.append(t);
  setTimeout(() => { e.querySelector('.ripple')?.remove(); t.remove(); }, 1150);
  if (andClose) setTimeout(() => window.satchel?.close(), 380);
}
list.addEventListener('click', (ev) => { const e = ev.target.closest('.card'); if (e && !ev.target.closest('.acts')) copy(e.dataset.id); });
search.addEventListener('input', () => { sel = 0; draw(); });
document.addEventListener('keydown', (e) => {
  if (!isOpen) return;
  if (e.key === 'Escape') { window.satchel?.close(); return; }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); select(Math.max(0, Math.min(cards().length - 1, sel + (e.key === 'ArrowDown' ? 1 : -1)))); return; }
  if (e.key === 'Enter' && sel >= 0) { e.preventDefault(); copy(cards()[sel].dataset.id, true); }
});
// Closing when the mouse wanders off: only once he has really been in it (the Satchel opening under a resting mouse is not him)
sat.addEventListener('mousemove', () => { if (isOpen) entered = true; clearTimeout(wander); });
sat.addEventListener('mouseleave', () => { if (isOpen && entered && !dragging) wander = setTimeout(() => window.satchel?.close(), 900); });
// Things dropped on the Satchel are kept (his pick)
sat.addEventListener('dragover', (e) => { e.preventDefault(); sat.classList.add('dropping'); });
sat.addEventListener('dragleave', () => sat.classList.remove('dropping'));
sat.addEventListener('drop', (e) => { e.preventDefault(); sat.classList.remove('dropping'); window.satchel?.drop(e.dataTransfer?.files, e.dataTransfer?.getData('text/plain')); });

window.satchel?.onData((d) => {
  const before = new Set(clips.map((c) => c.id));
  clips = Array.isArray(d?.clips) ? d.clips : []; can = { note: d?.can?.note === true, ask: d?.can?.ask === true };
  draw();
  if (isOpen) for (const c of clips) if (!before.has(c.id)) cards().find((x) => x.dataset.id === c.id)?.classList.add('entering');
});
window.satchel?.onOpen((how) => {
  isOpen = true; entered = false;
  search.value = ''; filterAt = 0; chips.querySelectorAll('.chip').forEach((x, k) => x.classList.toggle('on', k === 0)); sel = how === 'key' ? 0 : -1; draw();
  setTimeout(() => search.focus({ preventScroll: true }), 80);
});
window.satchel?.onClose(() => {
  if (!isOpen) return; isOpen = false; clearTimeout(wander); search.blur();
});

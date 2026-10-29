// Sheet 102 (his pick, 2026-10-29): the address bar's list on its own layer. It draws what the bar sends: his own line,
// his past searches, his tabs, bookmarks and history, then his engine's guesses. Rows stay where they are and only their
// words change; the list never gets shorter while he types (empty rows hold its height until the bar closes).
const box = document.getElementById('box'), rowsEl = document.getElementById('rows'), mark = document.getElementById('mark');
const SVGNS = 'http://www.w3.org/2000/svg';
// One small glyph per kind, on the band's own 7 by 7 grid (sheet 19 A); the clock is his past search (sheet 102).
const GLASS = ['0 0 7 7', 'M1 0h3v1H1zM0 1h1v3H0zM4 1h1v3H4zM1 4h3v1H1zM4 5h2v1H4zM5 6h2v1H5z'];
const CLOCK = ['0 0 7 7', 'M1 0h5v1H1zM0 1h1v5H0zM6 1h1v5H6zM3 1h1v3H3zM4 3h1v1H4zM1 6h5v1H1z'];
const GLYPH = {
  search: GLASS, guess: GLASS, past: CLOCK,
  go: ['0 0 7 7', 'M1 0h1v1H1zM2 0h1v1H2zM2 1h1v1H2zM3 1h1v1H3zM3 2h1v1H3zM4 2h1v1H4zM4 3h1v1H4zM5 3h1v1H5zM3 4h1v1H3zM4 4h1v1H4zM2 5h1v1H2zM3 5h1v1H3zM1 6h1v1H1zM2 6h1v1H2z'],
  tab: ['0 0 7 7', 'M1 0h3v1H1zM0 1h7v1H0zM0 2h1v4H0zM6 2h1v4H6zM0 6h7v1H0z'],
  mark: ['0 0 9 8', 'M1 0h2v1H1zM6 0h2v1H6zM0 1h4v4H0zM5 1h4v4H5zM0 5h1v1H0zM8 5h1v1H8zM0 6h4v1H0zM5 6h4v1H5zM3 7h3v1H3z'],
  closed: ['0 0 7 7', 'M2 0h1v1H2zM1 1h2v1H1zM0 2h7v1H0zM1 3h2v1H1zM6 3h1v3H6zM2 4h1v1H2zM2 6h4v1H2z'],
};
GLYPH.history = GLYPH.go;
const ACT = { search: 'Search', guess: 'Search', past: 'Search', go: 'Go', tab: 'Switch to tab', mark: 'Open', history: 'Open', closed: 'Reopen' };
let hold = 0, holdPx = 0, pick = -1, open = false;

function glyph(kind) {
  const [vb, d] = GLYPH[kind] ?? GLYPH.go, wide = vb === '0 0 9 8';
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('viewBox', vb); svg.setAttribute('width', wide ? '18' : '14'); svg.setAttribute('height', wide ? '16' : '14');
  svg.setAttribute('shape-rendering', 'crispEdges'); svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(SVGNS, 'path'); p.setAttribute('d', d); svg.append(p);
  return svg;
}
/** The title with what he has NOT typed in bold (Chrome's rule), text nodes only. */
function boldRest(span, text, typed) {
  span.replaceChildren();
  if (!typed) { span.textContent = text; return; }          // nothing typed yet: plain words
  const at = text.toLowerCase().indexOf(typed.toLowerCase());
  const b = (t) => { if (t) span.append(Object.assign(document.createElement('b'), { textContent: t })); };
  if (at < 0) { b(text); return; }
  b(text.slice(0, at));
  span.append(document.createTextNode(text.slice(at, at + typed.length)));
  b(text.slice(at + typed.length));
}
function makeRow(i) {
  const row = document.createElement('div');
  row.className = 'srow'; row.setAttribute('role', 'option');
  row.append(Object.assign(document.createElement('span'), { className: 'sg' }), Object.assign(document.createElement('span'), { className: 'st' }),
    Object.assign(document.createElement('span'), { className: 'su' }), Object.assign(document.createElement('span'), { className: 'sa' }));
  row.addEventListener('mousedown', (e) => { e.preventDefault(); if (!row.classList.contains('hold')) window.aangSuggest?.act('pick', i); });
  row.addEventListener('mouseenter', () => { if (row.classList.contains('hold') || pick === i) return; setPick(i); window.aangSuggest?.act('hover', i); });
  return row;
}
/** One row's words and glyph, changed in place (the row itself never moves). */
function fill(row, s, typed) {
  row.classList.remove('hold');
  const key = s.kind + '\n' + (s.favicon || '');
  const sg = row.children[0], st = row.children[1], su = row.children[2], sa = row.children[3];
  if (row.dataset.k !== key) {
    row.dataset.k = key;
    if (s.favicon && !['search', 'guess', 'past', 'go'].includes(s.kind)) {
      const img = Object.assign(document.createElement('img'), { alt: '', src: s.favicon });
      img.onerror = () => sg.replaceChildren(glyph(s.kind));
      sg.replaceChildren(img);
    } else sg.replaceChildren(glyph(s.kind));
  }
  const bare = String(s.url ?? '').replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
  const onlyUrl = !s.title || s.title === s.url;
  if (s.kind === 'search') st.textContent = typed;
  else if (s.kind === 'go') st.textContent = s.title || typed;
  else boldRest(st, s.kind === 'guess' || s.kind === 'past' ? String(s.title) : onlyUrl ? bare : String(s.title), typed);
  su.textContent = s.kind === 'search' ? 'Search the web' : s.kind === 'go' || s.kind === 'guess' || s.kind === 'past' || onlyUrl ? '' : bare;
  sa.textContent = ACT[s.kind] ?? 'Open';
}
function setPick(i, jump = false) {
  pick = i;
  [...rowsEl.querySelectorAll('.srow')].forEach((r, j) => { r.classList.toggle('on', j === i); r.setAttribute('aria-selected', String(j === i)); });
  const r = rowsEl.querySelectorAll('.srow')[i];
  mark.classList.toggle('on', Boolean(r) && i >= 0);
  if (!r) return;
  mark.classList.toggle('jump', jump);
  mark.style.transform = `translateY(${r.offsetTop + rowsEl.offsetTop}px)`;
}
function paint(m) {
  const typed = String(m.typed ?? '').trim();
  const list = Array.isArray(m.rows) ? m.rows : [];
  if (m.first) { hold = 0; holdPx = 0; rowsEl.style.minHeight = ''; }
  // Room for the guesses still on their way (the bar says how many), so the list opens at its full size once.
  hold = Math.min(14, Math.max(hold, list.length + (Number(m.expect) > 0 ? Math.min(4, Number(m.expect)) : 0)));
  // Where his own things end and the engine's guesses begin (or, before a letter, his searches and his sites).
  const split = list.findIndex((s, i) => i > 0 && (s.kind === 'guess' || (s.kind === 'history' && list[i - 1].kind === 'past')));
  const want = [];
  for (let i = 0; i < hold; i++) { if (i === split) want.push('gl'); want.push(i); }
  // Rows are kept by position: only their words change, so nothing slides or grows.
  const have = [...rowsEl.children];
  const kids = want.map((w, k) => {
    if (w === 'gl') return have[k]?.className === 'gl' ? have[k] : Object.assign(document.createElement('div'), { className: 'gl' });
    const old = have[k];
    return old?.classList.contains('srow') && Number(old.dataset.i) === w ? old : makeRow(w);
  });
  kids.forEach((r, k) => { if (r.classList.contains('srow')) { r.dataset.i = String(want[k]); } });
  if (kids.length !== have.length || kids.some((r, k) => r !== have[k])) rowsEl.replaceChildren(...kids);
  for (const r of rowsEl.querySelectorAll('.srow')) {
    const i = Number(r.dataset.i), s = list[i];
    if (s) fill(r, s, typed); else { r.classList.add('hold'); r.classList.remove('on'); }
  }
  setPick(Number.isInteger(m.pick) ? m.pick : -1, m.first === true);
  // Opens once: from the bar's width now to its full width, sliding down in four pixel steps.
  if (m.first || !open) {
    open = true;
    box.classList.remove('out', 'in');
    if (Number(m.from) > 0) { box.style.transition = 'none'; box.style.width = Math.round(m.from) + 'px'; void box.offsetWidth; box.style.transition = ''; }
    requestAnimationFrame(() => { box.style.width = '100%'; box.classList.add('in'); });
  }
  // Never shorter while it is open, whatever lines and dividers come and go.
  holdPx = Math.max(holdPx, rowsEl.offsetHeight);
  rowsEl.style.minHeight = holdPx + 'px';
  window.aangSuggest?.size(box.offsetHeight + 3);
}
window.aangSuggest?.on((m) => {
  if (!m) { open = false; hold = 0; holdPx = 0; box.classList.remove('in'); box.classList.add('out'); return; }
  paint(m);
});

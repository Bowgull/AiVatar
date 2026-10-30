// Sheet 109: the hand card. The Shell says what to show; Hand back sends his note (if any) and nothing else.
const $ = (id) => document.getElementById(id);
// Claude's mark: the white gem with its orange spark (sheet 106), 11 x 11 at 4x.
$('gem').innerHTML = '<svg viewBox="0 0 11 11" width="44" height="44" shape-rendering="crispEdges" aria-hidden="true"><path d="M3 0h5v1H3zM1 1h2v1H1zM8 1h2v1H8zM0 3h1v5H0zM10 3h1v5H10zM1 2h1v1H1zM9 2h1v1H9zM1 8h1v1H1zM9 8h1v1H9zM1 9h2v1H1zM8 9h2v1H8zM3 10h5v1H3z" fill="#120A05"/><path d="M3 1h5v1H3zM2 2h7v1H2zM1 3h9v5H1zM2 8h7v1H2zM3 9h5v1H3z" fill="#F6F2EA"/><path d="M3 1h3v1H3zM2 2h2v1H2zM1 3h1v2H1z" fill="#ffffff"/><path d="M8 8h1v1H8zM6 9h2v1H6zM9 6h1v2H9z" fill="#cfc6b6"/><path d="M5 2h1v2H5zM5 7h1v2H5zM2 5h2v1H2zM7 5h2v1H7zM3 3h1v1H3zM7 3h1v1H7zM3 7h1v1H3zM7 7h1v1H7zM4 4h3v3H4z" fill="#D97757"/></svg>';
let shown = '';
const size = () => requestAnimationFrame(() => { const r = $('hand').getBoundingClientRect(); window.aangHand?.size(Math.ceil(r.height)); });
window.aangHand?.on((m) => {
  const card = $('hand');
  if (!m) { card.hidden = true; shown = ''; return; }
  const key = `${m.kick}|${m.title}|${Array.isArray(m.rows)}`;
  $('kick').textContent = String(m.kick ?? '');
  $('title').textContent = String(m.title ?? '');
  const list = $('list');
  list.replaceChildren();
  list.hidden = !Array.isArray(m.rows);
  for (const [g, v] of Array.isArray(m.rows) ? m.rows : []) {
    list.append(Object.assign(document.createElement('div'), { className: 'grp', textContent: String(g) }), Object.assign(document.createElement('div'), { className: 'v', textContent: String(v) }));
  }
  // The note box and Hand back while he has the tab; a new hand starts with an empty box.
  $('note').hidden = $('foot').hidden = m.hand !== true;
  if (key !== shown) { if (m.hand === true) $('note').value = ''; card.hidden = false; card.classList.remove('show'); void card.offsetWidth; card.classList.add('show'); }
  shown = key;
  size();
});
$('back').addEventListener('click', () => window.aangHand?.back($('note').value));
$('note').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); $('back').click(); } });

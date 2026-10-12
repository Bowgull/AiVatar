// Your things: History and Downloads. Draws what the Shell sends (all text by textContent; titles and addresses
// are websites' own words) and sends back only: open this page in a new tab, take this off, clear a stretch, or
// open / show / drag a download by its number.
const $ = (s, r = document) => r.querySelector(s);
const T = window.things;
const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

// ---- sections: the glove points at the open one
let sec = 'history';
function show(s) {
  sec = s === 'downloads' ? 'downloads' : 'history';
  for (const el of document.querySelectorAll('section[data-sec]')) el.hidden = el.dataset.sec !== sec;
  for (const a of document.querySelectorAll('.side a[data-sec]')) a.classList.toggle('on', a.dataset.sec === sec);
  if (sec === 'history') { loadHistory(true); $('#q').focus(); } else loadDownloads();
}
for (const a of document.querySelectorAll('.side a')) a.addEventListener('click', (e) => { e.preventDefault(); if (a.dataset.go) T?.go(a.dataset.go); else show(a.dataset.sec); });
T?.onSection?.((s) => show(String(s)));
T?.onChanged?.((w) => { if (w === 'history' && sec === 'history') loadHistory(true); if (w === 'downloads' && sec === 'downloads') loadDownloads(); });

// ---- History: grouped by day, newest first, 100 at a time
let items = [], more = false, busy = false, qTimer = 0;
function dayName(t) {
  const d = new Date(t), today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((today - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86_400_000);
  if (diff === 0) return 'TODAY';
  if (diff === 1) return 'YESTERDAY';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase();
}
function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } }
async function loadHistory(fresh) {
  if (busy) return;
  busy = true;
  try {
    const r = await T?.history($('#q').value, fresh ? 0 : items.length);
    if (!r) return;
    items = fresh ? r.items : items.concat(r.items);
    more = r.more;
    paintHistory();
  } finally { busy = false; }
}
function paintHistory() {
  const box = $('#days');
  box.replaceChildren();
  let card = null, list = null, last = '';
  for (const v of items) {
    const day = dayName(v.at);
    if (day !== last) {
      last = day;
      card = mk('div', 'card'); card.append(mk('i', 'caps'), mk('h3', '', day));
      list = mk('div'); card.append(list); box.append(card);
    }
    const row = mk('div', 'hrow'); row.tabIndex = 0;
    row.append(mk('time', '', new Date(v.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })));
    const fav = mk('i', 'fav');
    if (typeof v.favicon === 'string' && v.favicon.startsWith('data:image/')) { const img = mk('img'); img.src = v.favicon; img.alt = ''; fav.append(img); }
    else fav.textContent = (hostOf(v.url)[0] || '?').toUpperCase();
    const host = hostOf(v.url);
    row.append(fav, mk('span', '', v.title || v.url), mk('small', '', host));
    const x = mk('button', 'x', 'x'); x.type = 'button'; x.title = 'Take this off your history';
    x.addEventListener('click', (e) => { e.stopPropagation(); T?.hist('forget', v.url, v.at); });
    row.append(x);
    row.title = v.url;
    row.addEventListener('click', () => T?.open(v.url));
    row.addEventListener('keydown', (e) => { if (e.key === 'Enter') T?.open(v.url); if (e.key === 'Delete') T?.hist('forget', v.url, v.at); });
    list.append(row);
  }
  const empty = $('#hempty');
  empty.hidden = items.length > 0;
  empty.textContent = $('#q').value.trim() ? 'Nothing in your history matches that.' : 'Nothing here yet. Pages you open show up here.';
  $('#older').hidden = !more;
  $('#clearbox').hidden = !items.length && !$('#q').value.trim();
}
$('#q').addEventListener('input', () => { clearTimeout(qTimer); qTimer = setTimeout(() => loadHistory(true), 150); });
$('#older').addEventListener('click', () => loadHistory(false));

// Clear history: one click shows the three stretches (FFX words), never clears by itself.
function clearAsk(open) {
  const box = $('#clearbox');
  box.replaceChildren();
  if (!open) {
    const b = mk('button', 'pick danger', 'Clear history'); b.type = 'button';
    b.addEventListener('click', () => clearAsk(true));
    box.append(b);
    return;
  }
  box.append(mk('b', '', 'CLEAR'));
  for (const [act, name] of [['clearhour', 'Last hour'], ['cleartoday', 'Today'], ['clearall', 'Everything']]) {
    const b = mk('button', 'pick danger', name); b.type = 'button';
    b.addEventListener('click', () => { T?.hist(act); clearAsk(false); });
    box.append(b);
  }
  const no = mk('button', 'pick', 'Cancel'); no.type = 'button';
  no.addEventListener('click', () => clearAsk(false));
  box.append(no);
}
clearAsk(false);

// ---- Downloads: every file kept (200), newest first
const SVG_FOLDER = '<svg viewBox="0 0 8 7" width="16" height="14" shape-rendering="crispEdges" aria-hidden="true"><path d="M0 0h3v1h5v6H0z"/></svg>';
const SVG_X = '<svg viewBox="0 0 7 7" width="12" height="12" shape-rendering="crispEdges" aria-hidden="true"><path d="M0 0h2v1H0zM5 0h2v1H5zM0 1h3v1H0zM4 1h3v1H4zM1 2h5v1H1zM2 3h3v1H2zM1 4h5v1H1zM0 5h3v1H0zM4 5h3v1H4zM0 6h2v1H0zM5 6h2v1H5z"/></svg>';
const EXT = { zip: 'ZIP', pdf: 'PDF', img: 'IMG', exe: 'EXE', doc: 'DOC', av: 'A/V', file: 'FILE' };
function mb(n) { return n >= 1e9 ? (n / 1e9).toFixed(1) + ' GB' : n >= 1e6 ? (n / 1e6).toFixed(1) + ' MB' : n >= 1e3 ? Math.round(n / 1e3) + ' KB' : (n || 0) + ' B'; }
function when(t) { const d = new Date(t); return dayName(t) === 'TODAY' ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
function iconBtn(svg, title, fn) { const b = mk('button', 'dx'); b.type = 'button'; b.title = title; b.innerHTML = svg; b.addEventListener('click', (e) => { e.stopPropagation(); fn(); }); return b; }
async function loadDownloads() {
  const list = await T?.downloads();
  if (!Array.isArray(list)) return;
  const box = $('#dlist');
  box.replaceChildren();
  for (const d of list) {
    const gone = d.gone || d.state === 'stopped' || d.state === 'failed';
    const row = mk('div', 'drow' + (gone ? ' gone' : ''));
    const b = mk('i', 'fb ' + (EXT[d.kind] ? d.kind : 'file')); b.append(mk('b', '', EXT[d.kind] ?? 'FILE'));
    const t = mk('span', 'dt'); t.append(mk('b', '', d.name));
    if (d.state === 'going') {
      const pct = d.total > 0 ? Math.min(100, Math.round((d.got / d.total) * 100)) : 30;
      const bar = mk('span', 'bar'); const fill = mk('i'); fill.style.width = pct + '%'; bar.append(fill);
      t.append(bar, mk('small', '', d.total > 0 ? `${pct}% · ${mb(d.got)} of ${mb(d.total)}` : `${mb(d.got)} so far`));
    } else {
      t.append(mk('small', '', d.gone ? 'Moved or deleted' : d.state === 'stopped' ? 'Stopped' : d.state === 'failed' ? 'Did not finish' : `${mb(d.size)}${d.site ? ' · ' + d.site : ''} · ${when(d.at)}`));
    }
    const act = mk('span', 'act');
    if (d.state === 'going') act.append(iconBtn(SVG_X, 'Stop', () => T?.dl('stop', d.id)));
    else {
      if (!gone) act.append(iconBtn(SVG_FOLDER, 'Show in folder', () => T?.dl('show', d.id)));
      act.append(iconBtn(SVG_X, 'Take it off this list (the file stays)', () => T?.dl('forget', d.id)));
    }
    row.append(b, t, act);
    if (!gone && d.state === 'done') {
      row.draggable = true;
      row.title = 'Click to open. Drag it into Claude, Aang, a folder or the desktop.';
      row.addEventListener('dragstart', (e) => { e.preventDefault(); T?.drag(d.id); });
      row.addEventListener('click', () => T?.dl('open', d.id));
    }
    box.append(row);
  }
  $('#dempty').hidden = list.length > 0;
}
$('#dfolder').addEventListener('click', () => T?.dl('folder', 0));

show(location.hash.slice(1));

// 9.D D3: draw one card from the JSON in the address's #fragment, then say its size in the title, which is how
// cardrender.ts knows it is ready. Everything from the data goes in as text, never as markup: a job title comes from
// a website.
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; };
const str = (v, n = 300) => String(v ?? '').slice(0, n);

function bars(steps, at, done) {
  const b = el('div', 'bars');
  const n = Math.max(1, Math.min(12, Number(steps) || 1));
  for (let i = 1; i <= n; i++) b.append(el('i', done || i < at ? 'done' : i === at ? 'now' : ''));
  return b;
}

const DRAW = {
  // A Claude job, live (sheet 15 board 2): plaque, headline, the step it is on, a bar per step, Aang.
  job(d) {
    const card = el('div', 'parch');
    const row = el('div', 'row'), col = el('div', 'col');
    col.append(el('div', 'plaque' + (d.done ? ' done' : ''), d.done ? 'DONE' : str(d.plaque || 'CLAUDE JOB', 30)));
    col.append(el('div', 'head', str(d.headline, 120)));
    if (d.sub) col.append(el('div', 'sub', str(d.sub, 160)));
    if (d.steps) col.append(bars(d.steps, Number(d.at) || 1, !!d.done));
    const img = el('img', 'sprite'); img.src = 'art/aang-face.png'; img.alt = '';
    row.append(col, img);
    card.append(row, el('div', 'drawn', 'DRAWN BY AANG'));
    return card;
  },
  // Something waiting on him (sheet 15 board 2, the second card).
  needs(d) {
    const card = el('div', 'parch'), col = el('div', 'col');
    col.style.gap = '6px';
    col.append(el('div', 'plaque warn', 'NEEDS YOU'), el('div', 'head', str(d.title, 140)));
    if (d.text) col.append(el('div', 'text', str(d.text, 400)));
    card.append(col, el('div', 'drawn', 'DRAWN BY AANG'));
    return card;
  },
  // The home card (sheet 15 board 4), on the browser's pixel wood.
  home(d) {
    const card = el('div', 'wood');
    const top = el('div', 'top');
    const face = el('img'); face.src = 'art/aang-face.png'; face.alt = '';
    top.append(face, el('b', null, 'HOME'), el('small', null, 'pinned, kept current'));
    const tiles = el('div', 'tiles');
    for (const t of (Array.isArray(d.tiles) ? d.tiles : []).slice(0, 6)) {
      const tile = el('div', 'tile');
      tile.append(el('div', 'k', str(t.k, 24)), el('div', 'v' + (t.tone === 'warn' ? ' warn' : t.tone === 'good' ? ' good' : ''), str(t.v, 40)));
      if (Number.isFinite(t.fill)) {
        const b = el('div', 'bars');
        const on = Math.round(Math.max(0, Math.min(1, t.fill)) * 10);
        for (let i = 0; i < 10; i++) b.append(el('i', i < on ? 'done' : ''));
        tile.append(b);
      }
      tiles.append(tile);
    }
    card.append(top, tiles, el('div', 'drawn', 'DRAWN BY AANG'));
    return card;
  },
};

try {
  const raw = decodeURIComponent(location.hash.slice(1));
  const msg = JSON.parse(raw);
  const draw = DRAW[msg.kind];
  if (!draw) throw new Error('no such card');
  document.getElementById('card').append(draw(msg.data || {}));
  // Wait for the fonts and pictures, then report its size in CSS pixels (cardrender.ts draws it at 2x).
  Promise.all([document.fonts.ready, ...[...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; })))]).then(() => {
    requestAnimationFrame(() => {
      const r = document.getElementById('card').getBoundingClientRect();
      document.title = `ready:${Math.ceil(r.width)}x${Math.ceil(r.height)}`;
    });
  });
} catch (e) {
  document.title = 'failed:' + String(e && e.message || e).slice(0, 80);
}

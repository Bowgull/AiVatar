// Sheet 100, the Mockups quest log (his pick, 2026-10-28). Everything drawn with textContent: titles are Claude's words.
// The tree comes from Samara (mocklog:get, then mocklog:data on every change); a click opens a version in its own tab.
const STG = { fix: ['FIX', 'chg'], ok: ['APPROVED', 'ok'], chat: ['APPROVED', 'ok'], built: ['✓ BUILT', 'built'], park: ['PARKED', 'park'] };
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
let tree = { projects: [] };
// What he has picked: a project, a topic (its id, or 'loose'), a sheet, a version. Kept while the data changes.
const pick = { p: null, t: null, s: null, v: null };

const topicsOf = (p) => [...(p.branches ?? []).map((b) => ({ id: b.id, name: b.name, sheets: b.mockups })), ...(p.loose?.length ? [{ id: 'loose', name: 'Other', sheets: p.loose }] : [])];
const flat = (sheets) => sheets.flatMap((n) => [{ n, kid: false }, ...(n.children ?? []).map((c) => ({ n: c, kid: true }))]);
const versions = (n) => {
  const seen = new Set();
  return [...(n.items ?? []), ...(n.older ?? [])].filter((x) => !x.same).sort((a, b) => a.v - b.v || a.at - b.at).filter((x) => (seen.has(x.v) ? false : (seen.add(x.v), true)));
};
const markOf = (n) => { const vs = versions(n); const d = vs.filter((x) => x.stage === 'ok' || x.stage === 'chat').at(-1) ?? vs.filter((x) => x.stage).at(-1); return d?.stage; };
const count = (list) => list.reduce((a, n) => a + 1 + (n.children?.length ?? 0), 0);

function chosen() {
  const ps = tree.projects ?? [];
  const p = ps.find((x) => x.name === pick.p) ?? ps[0];
  if (!p) return {};
  const ts = topicsOf(p);
  const t = ts.find((x) => x.id === pick.t) ?? ts[0];
  const rows = t ? flat(t.sheets) : [];
  const s = rows.find((r) => r.n.sheet === pick.s)?.n ?? rows[0]?.n;
  const vs = s ? versions(s) : [];
  const v = vs.find((x) => x.v === pick.v) ?? vs.filter((x) => x.stage === 'ok' || x.stage === 'chat').at(-1) ?? vs.at(-1);
  return { p, ts, t, rows, s, vs, v };
}

function draw() {
  const { p, ts, t, rows, s, vs, v } = chosen();
  const tr = document.getElementById('tree'); tr.replaceChildren();
  for (const q of tree.projects ?? []) {
    const open = q === p;
    const b = el('button', 'proj' + (open ? ' open' : '')); b.type = 'button';
    const em = el('span', 'em');
    if (q.em === 'lantern') { const i = el('img'); i.src = 'art/samara/samara-lantern-32.png'; i.alt = ''; em.append(i); } else em.append(el('b', '', q.em));
    b.append(em, el('span', 'pn', q.name), el('span', 'pc', String(topicsOf(q).reduce((a, x) => a + count(x.sheets), 0))), el('i', 'chev'));
    b.addEventListener('click', () => { pick.p = q.name; pick.t = pick.s = pick.v = null; draw(); });
    tr.append(b);
    if (!open) continue;
    for (const x of ts) {
      const tb = el('button', 'topic' + (x === t ? ' on' : '')); tb.type = 'button';
      tb.append(el('i', 'chev'), el('span', '', x.name), el('span', 'n', String(count(x.sheets))));
      tb.addEventListener('click', () => { pick.p = q.name; pick.t = x.id; pick.s = pick.v = null; draw(); });
      tr.append(tb);
    }
  }
  if (!tree.projects?.length) tr.append(el('div', 'empty', 'No mockups yet.'));

  document.getElementById('topic').textContent = t ? `${t.name} · ${count(t.sheets)}` : '';
  const sh = document.getElementById('sheets'); sh.replaceChildren();
  for (const r of rows) {
    const m = markOf(r.n);
    const b = el('button', 'sh' + (r.kid ? ' kid' : '') + (r.n === s ? ' on' : '') + (m === 'park' ? ' parked' : '')); b.type = 'button';
    if (r.n.num) b.append(el('span', 'num', r.n.num));
    b.append(el('span', 'nm', r.n.name));
    b.title = r.n.title ?? r.n.name;
    if (STG[m]) b.append(el('i', 'mk ' + STG[m][1], STG[m][0]));
    if (r.n.n > 1) b.append(el('span', 'vc', `${versions(r.n).length} v`));
    b.addEventListener('click', () => { pick.s = r.n.sheet; pick.v = null; draw(); });
    sh.append(b);
  }

  const dt = document.getElementById('detail'); dt.replaceChildren();
  if (!s || !v) return;
  const w = el('div', 'where'); w.append(`${p.name} › `, el('b', '', t.name)); dt.append(w);
  const h = el('div', 'dt'); if (s.num) h.append(el('span', 'num', s.num)); h.append(el('span', '', s.name));
  if (STG[v.stage]) h.append(el('i', 'mk ' + STG[v.stage][1], STG[v.stage][0]));
  dt.append(h);
  const big = el('span', 'big'); if (v.pic) big.style.backgroundImage = `url("${v.pic}")`;
  dt.append(big);
  if (v.said || v.note) dt.append(el('div', 'said', v.said ? `You said: "${v.said}"` : `To fix: ${v.note}`));
  const go = el('button', 'go', `Open v${v.v}`); go.type = 'button';
  go.addEventListener('click', () => window.mocklog?.show(v.id));
  dt.append(go);
  const strip = el('div', 'strip');
  for (const x of vs) {
    const b = el('button', 'vt' + (x === v ? ' on' : '') + (STG[x.stage] ? ' ' + STG[x.stage][1] : '')); b.type = 'button';
    const pic = el('span', 'pic'); if (x.pic) pic.style.backgroundImage = `url("${x.pic}")`;
    b.append(pic, el('span', 'v', 'V' + x.v));
    if (STG[x.stage]) b.append(el('i', 'mk ' + STG[x.stage][1], STG[x.stage][0]));
    b.addEventListener('click', () => { pick.v = x.v; draw(); });
    b.addEventListener('dblclick', () => window.mocklog?.show(x.id));
    strip.append(b);
  }
  dt.append(strip);
  pick.p = p.name; pick.t = t.id; pick.s = s.sheet; pick.v = v.v;
}

window.mocklog?.onData((d) => { if (d) { tree = d; draw(); } });
window.mocklog?.get().then((d) => { if (d) { tree = d; draw(); } });

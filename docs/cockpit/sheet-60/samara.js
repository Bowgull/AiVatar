// Sheet 60: Samara (its own markup and styles, scripts not run) with a page, the Notes panel and the clip chip.
import { P, rr, fills, art } from '../sheet-59/pix.js';
import { ready, el, at, NOTES, note, paper, woodPin, ribbon, dotOf, toggle, face, box } from './notes.js';

const Q = new URLSearchParams(location.search), LOOK = Q.get('look') || 'A', STATE = Q.get('state') || 'open';
window.__done = (async () => {
  const html = await (await fetch('browser.html')).text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script').forEach((s) => s.remove());
  document.body.prepend(...doc.body.children);
  document.getElementById('url').textContent = 'forever.warcraft.com/guides/molten-core';
  await ready();
  const page = document.getElementById('page');
  const a = el('div', 'art', `<div class="site">WoW Forever &middot; Raid guide</div><h1>Molten Core, the first night</h1>
    <p>Bring a full set of fire resistance if you can: twenty-five lets the healers breathe through Lucifron and Magmadar.</p>
    <p><mark>Ragnaros knocks back everyone in melee range at the start of each submerge, so tanks should stand with their backs to the wall.</mark></p>
    <p>Clear the trash in packs of two. Core hounds must die within ten seconds of each other or they rise again, so split the raid.</p>
    <p>Loot is council-run in most guilds this season; ask before you roll.</p>`);
  page.append(a);
  if (LOOK === 'B') { await siteNotes(page, a); await new Promise((r) => setTimeout(r, 200)); return true; }
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const pr = page.getBoundingClientRect(), rs = a.querySelector('mark').getClientRects(), mk = rs[rs.length - 1];
  const chip = el('span', 'clipchip', '&#10070; Clip to notes <small>CTRL *</small>');
  at(document.body, chip, Math.round(mk.right + 12), Math.round(mk.top + mk.height / 2 - 18), { zIndex: '6' });
  // the panel: the page's notes on the right of the page well
  const W = 320, H = Math.round((pr.height - 28) / 2) * 2, x = Math.round(pr.right - W - 14), y = Math.round(pr.top + 14);
  const p = at(document.body, el('div', 'panel'), x, y, { width: W + 'px', height: H + 'px' });
  const body = LOOK === 'A' ? rr(W / P, H / P, 8, { band: 's2', E: 4, fill: fills.paper(H / P) }) : LOOK === 'B' ? rr(W / P, H / P, 8, { band: 's2', E: 4, fill: fills.wood(1) }) : paper('C', W / P, H / P, 'B');
  body.style.position = 'absolute'; p.append(body);
  const ix = LOOK === 'C' ? 30 : 18;
  const head = at(p, el('div', 'ph'), ix, 18, { width: (W - ix - 18) + 'px' });
  head.append(el('span', 'pt' + (LOOK === 'B' ? ' w' : LOOK === 'C' ? ' c' : ''), 'Notes'), el('span', 'from', LOOK === 'B' ? '' : 'THIS PAGE &middot; 1'));
  head.lastChild.style.marginLeft = 'auto'; if (LOOK === 'B') { head.lastChild.innerHTML = 'THIS PAGE &middot; 1'; head.lastChild.style.color = '#bfae8a'; }
  // the clipped note, just made
  const clip = { title: 'Ragnaros knockback', tag: 'Reference', col: 'D', html: '<div class="quote">Ragnaros knocks back everyone in melee range at the start of each submerge, so tanks should stand with their backs to the wall.</div><div class="from">CLIPPED FROM <b>FOREVER.WARCRAFT.COM</b> &middot; JUST NOW</div>' };
  at(p, note(LOOK, clip, W - 2 * ix + (LOOK === 'C' ? 12 : 0), 214, { small: true }), LOOK === 'C' ? 24 : ix, 58);
  const sec = at(p, el('div', 'sec6' + (LOOK === 'B' ? ' d' : '')), ix, 296); sec.innerHTML = 'YOUR OTHER NOTES';
  let yy = 318;
  for (const n of [NOTES.todo, NOTES.ref, { title: 'Guild night', col: 'B' }]) {
    const r = at(p, el('div', ''), ix, yy, { width: (W - ix - 18) + 'px', display: 'flex', alignItems: 'center', gap: '10px', height: '34px',
      font: '700 14px Figtree,sans-serif', color: LOOK === 'B' ? '#f1e3c4' : '#2E2216' });
    const t = el('i'); t.style.cssText = `width:6px;height:20px;border-radius:2px;background:${dotOf(n.col)};box-shadow:0 0 0 2px rgba(42,26,16,.5)`;
    r.append(t, el('span', '', n.title)); yy += 38;
  }
  await new Promise((r) => setTimeout(r, 200));
  return true;
})();

// ---------------------------------------------------------------- v3 (2026-10-22, evening): notes for this site, on demand
// His call: NO automatic pop-up. A small notes key in Samara's own band (a real .rnd key, before the menu key) opens a
// little panel: this site's notes (a note kept with "Keep as a note" from a page carries its address) and "+ note for this
// site". Quiet when there are none: no count, at most a tiny dot when there are some.
async function siteNotes(page, art2) {
  art2.querySelector('mark')?.replaceWith(...art2.querySelector('mark').childNodes);
  const menu = document.getElementById('menukey');
  const key = document.createElement('button'); key.className = 'rnd dlkey'; key.type = 'button'; key.id = 'notekey';
  key.setAttribute('aria-label', 'Notes for this site'); key.setAttribute('aria-expanded', STATE === 'open' ? 'true' : 'false');
  // a pixel note: a page with two lines and a folded pin head, the band's own glyph colour
  key.innerHTML = '<svg viewBox="0 0 7 8" width="14" height="16" shape-rendering="crispEdges" aria-hidden="true"><path d="M3 0h1v1H3zM0 1h7v1H0zM0 2h1v6H0zM6 2h1v6H6zM1 7h5v1H1zM2 3h3v1H2zM2 5h3v1H2z" fill="#e8e0f5"/></svg>';
  key.style.position = 'relative';
  if (STATE !== 'none') { const dot = document.createElement('i'); dot.style.cssText = 'position:absolute;right:3px;top:3px;width:4px;height:4px;border-radius:1px;background:#ffd36a;box-shadow:0 0 0 1px #120a05'; key.append(dot); }
  menu.before(key);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  if (STATE !== 'open') return;
  const kr = key.getBoundingClientRect();
  const W = 340, H = 270, x = Math.round(kr.right - W + 30), y = Math.round(kr.bottom + 10);
  const p = at(document.body, el('div', 'panel'), x, y, { width: W + 'px', height: H + 'px' });
  const body = rr(W / P, H / P, 8, { band: 's2', E: 4, fill: fills.wood(1) }); body.style.position = 'absolute'; p.append(body);
  // a little tail up to the key
  const tail = art(8, 5, (put) => { for (let y2 = 0; y2 < 5; y2++) for (let x2 = 4 - y2; x2 <= 3 + y2; x2++) put(x2, y2, y2 === 4 ? '#4a2e18' : '#2c1c10'); });
  at(p, tail, Math.round(kr.left + kr.width / 2 - x - 8), -10, { zIndex: '3' });
  const head = at(p, el('div', 'ph'), 20, 18, { width: (W - 40) + 'px' });
  head.append(el('span', 'pt w', 'Notes for this site'));
  at(p, el('div', 'sec6 d', 'FOREVER.WARCRAFT.COM &middot; 2'), 20, 46);
  const rows = [
    { t: 'Ragnaros knockback', col: 'D', sub: 'KEPT FROM <b>/GUIDES/MOLTEN-CORE</b> &middot; TODAY' },
    { t: 'Arms rotation', col: 'B', sub: 'KEPT FROM <b>/PATCH-NOTES</b> &middot; 3 OCT' },
  ];
  let yy = 72;
  for (const r of rows) {
    const row = at(p, el('div', 'srow'), 16, yy, { width: (W - 32) + 'px' });
    const bar = el('i'); bar.style.background = dotOf(r.col);
    const tx = el('div', ''); tx.append(el('b', '', r.t), el('small', '', r.sub));
    row.append(bar, tx); yy += 64;
  }
  at(p, el('span', 'newkey', '+ note for this site'), 20, yy + 4);
  at(p, el('div', 'sec6 d', 'OPENS ONLY WHEN YOU CLICK THE KEY'), 20, H - 30);
}

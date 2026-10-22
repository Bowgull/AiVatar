// Sheet 60: Samara (its own markup and styles, scripts not run) with a page, the Notes panel and the clip chip.
import { P, rr, fills, art } from '../sheet-59/pix.js';
import { ready, el, at, NOTES, note, paper, woodPin, ribbon, dotOf, toggle, face, box } from './notes.js';

const Q = new URLSearchParams(location.search), LOOK = Q.get('look') || 'A', STATE = Q.get('state') || 'rail';
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

// ---------------------------------------------------------------- v4 (2026-10-22, night): notes for this site, from the ... menu
// His note: "how does this surface, is it always going to be there? I might prefer it as a right rail, opened when we activate
// it, probably in the ... menu." So: no key in the band any more. Samara's own menu (browser.html's #menu, browser.css) gets
// one row, "Notes for this site", in THIS PAGE. It opens a RIGHT RAIL: it slides in from Samara's right edge on a spring and
// the page narrows beside it (nothing is covered). x or Esc closes it. STATE: menu | rail | a number 0..1 (the rail part-way in).
const RAILW = 300;
function spring(t, response = 0.42, zeta = 0.82) {
  const w = 2 * Math.PI / response, wd = w * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * w * t) * (Math.cos(wd * t) + zeta / Math.sqrt(1 - zeta * zeta) * Math.sin(wd * t));
}
async function siteNotes(page, art2) {
  art2.querySelector('mark')?.replaceWith(...art2.querySelector('mark').childNodes);
  const menu = document.getElementById('menu');
  // the new row, in the real menu's THIS PAGE group, under Find
  const row = document.createElement('button'); row.type = 'button'; row.className = 'mrow'; row.id = 'm-sitenotes';
  row.innerHTML = '<span>Notes for this site</span>';
  document.getElementById('m-find').after(row);
  if (STATE === 'menu') {
    menu.hidden = false; document.getElementById('menukey').setAttribute('aria-expanded', 'true');
    row.classList.add('hov');
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return;
  }
  const p = STATE === 'rail' ? 1 : Number(STATE);
  // the page narrows as the rail comes in; the rail rides in from the right edge on the same spring
  const well = page.parentElement;
  const pr0 = page.getBoundingClientRect();
  page.style.marginRight = (30 + Math.round((RAILW + 14) * p)) + 'px';
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const pr = page.getBoundingClientRect();
  const H = Math.round(pr0.height / 2) * 2, x = Math.round(pr0.right - RAILW + (1 - p) * (RAILW + 44)), y = Math.round(pr0.top);
  const rail = at(document.body, el('div', 'panel rail'), x, y, { width: RAILW + 'px', height: H + 'px' });
  const body = rr(RAILW / P, H / P, 8, { band: 's2', E: 4, fill: fills.wood(1) }); body.style.position = 'absolute'; rail.append(body);
  const head = at(rail, el('div', 'ph'), 20, 18, { width: (RAILW - 40) + 'px' });
  head.append(el('span', 'pt w', 'Notes for this site'));
  const x2 = document.createElement('button'); x2.className = 'rnd'; x2.type = 'button'; x2.setAttribute('aria-label', 'Close');
  x2.innerHTML = '<svg viewBox="0 0 7 7" width="12" height="12" shape-rendering="crispEdges" aria-hidden="true"><path d="M0 0h1v1H0zM6 0h1v1H6zM1 1h1v1H1zM5 1h1v1H5zM2 2h1v1H2zM4 2h1v1H4zM3 3h1v1H3zM2 4h1v1H2zM4 4h1v1H4zM1 5h1v1H1zM5 5h1v1H5zM0 6h1v1H0zM6 6h1v1H6z" fill="#e8e0f5"/></svg>';
  at(rail, x2, RAILW - 54, 12, { width: '34px', height: '34px' });
  at(rail, el('div', 'sec6 d', 'FOREVER.WARCRAFT.COM &middot; 2'), 20, 52);
  // this site's notes, each on its own category paper (the colour is the category)
  const n1 = { title: 'Ragnaros knockback', cat: 'Reference', html: '<p>Tanks back to the wall at each submerge.</p><div class="from">KEPT FROM <b>/GUIDES/MOLTEN-CORE</b> &middot; TODAY</div>' };
  const n2 = { title: '', html: '<p>Ask the guild about fire resist before Friday.</p><div class="from">WRITTEN HERE &middot; 3 OCT</div>' };
  at(rail, note('B', n1, RAILW - 40, 128, { small: true, foot: false }), 20, 80);
  at(rail, note('B', n2, RAILW - 40, 104, { small: true, foot: false }), 20, 224);
  at(rail, el('span', 'newkey', '+ note for this site'), 20, 346);
  at(rail, el('div', 'sec6 d', '<b style="color:#ffd36a;font-weight:400">ESC</b> OR <b style="color:#ffd36a;font-weight:400">X</b> CLOSES IT'), 20, H - 30);
  if (STATE !== 'rail') { const t = el('div', 'railtag', Math.round(p * 100) + '% IN'); at(document.body, t, 20, 580, { zIndex: '9' }); }
}

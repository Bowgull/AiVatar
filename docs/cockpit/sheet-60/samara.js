// Sheet 60: Samara (its own markup and styles, scripts not run) with a page, the Notes panel and the clip chip.
import { P, rr, fills, art } from '../sheet-59/pix.js';
import { ready, el, at, NOTES, note, paper, woodPin, ribbon, dotOf, toggle, face, box } from './notes.js';

const LOOK = new URLSearchParams(location.search).get('look') || 'A';
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

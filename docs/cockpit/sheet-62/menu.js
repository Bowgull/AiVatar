// Sheet 62: one Send to Aang, reached five ways. The menu is pagemenu.js itself, fed items; the proposal is only WHICH
// items: "Send to Aang" in every menu, always first, with the product's separator under it.
import { cover } from '../sheet-59/pix.js';
const SCENE = new URLSearchParams(location.search).get('scene') || 'm-words';
const pg = document.getElementById('pg');
const SEND = { id: 'toaang', label: 'Send to Aang' }, SEP = { sep: true };
const TAIL = [{ id: 'back', label: 'Back', key: 'ALT ←' }, { id: 'reload', label: 'Reload', key: 'CTRL R' }];
const PAGE = '<div class="site">WoW Forever &middot; Raid guide</div><h1>Molten Core, the first night</h1>';
const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h !== undefined) e.innerHTML = h; return e; };
// the Windows arrow pointer, drawn at 2x so it stays crisp
function pointer(x, y) {
  const M = ['O..........', 'OO.........', 'OWO........', 'OWWO.......', 'OWWWO......', 'OWWWWO.....', 'OWWWWWO....', 'OWWWWWWO...', 'OWWWWWWWO..', 'OWWWWWOOOO.', 'OWWOWWO....', 'OWO.OWWO...', 'OO..OWWO...', 'O....OWWO..', '.....OWWO..', '......OO...'];
  const c = document.createElement('canvas'); c.width = 22; c.height = 32; const g = c.getContext('2d');
  M.forEach((r, yy) => [...r].forEach((ch, xx) => { if (ch !== '.') { g.fillStyle = ch === 'O' ? '#000' : '#fff'; g.fillRect(xx * 2, yy * 2, 2, 2); } }));
  c.className = 'ptr'; c.style.left = x + 'px'; c.style.top = y + 'px'; document.body.append(c);
}
function menuAt(items, x, y) {
  window.__menu(items);
  const pm = document.getElementById('pm'); pm.style.left = x + 'px'; pm.style.top = y + 'px';

}
window.__ready = (async () => {
  await document.fonts.ready;
  let hover = '#pm button:first-child', h = 370;
  if (SCENE === 'm-words') {
    pg.innerHTML = PAGE + '<p>Bring a full set of fire resistance if you can.</p><p><mark>Ragnaros knocks back everyone in melee range at the start of each submerge,</mark> so tanks should stand with their backs to the wall.</p><p>Clear the trash in packs of two.</p>';
    menuAt([SEND, SEP, { id: 'copy', label: 'Copy', key: 'CTRL C' }, { id: 'search', label: 'Search for "Ragnaros knocks back ev…"' }, SEP, ...TAIL], 290, 176);
  } else if (SCENE === 'm-image') {
    const pic = cover(64, 2, 'sea'); pic.className = 'pic';
    pg.innerHTML = PAGE; pg.append(pic);
    pg.insertAdjacentHTML('beforeend', '<p>The lava fields at the gate: the pull path in yellow, the wall to stand on in red.</p><p>Clear the trash in packs of two.</p>');
    menuAt([SEND, SEP, { id: 'imgsave', label: 'Save image' }, { id: 'imgcopy', label: 'Copy image' }, SEP, ...TAIL], 300, 150);
  } else if (SCENE === 'm-link') {
    pg.innerHTML = PAGE + '<p>Before you go in, read <a>the Ragnaros tank guide</a> and check your resistances.</p><p>Clear the trash in packs of two.</p>';
    menuAt([SEND, SEP, { id: 'linktab', label: 'Open link in new tab' }, { id: 'linkpop', label: 'Play in the pop-out' }, { id: 'linksave', label: 'Save link' }, { id: 'linkcopy', label: 'Copy link' }, SEP, ...TAIL], 250, 128);
  } else if (SCENE === 'm-page') {
    pg.innerHTML = PAGE + '<p>Bring a full set of fire resistance if you can.</p><p>Clear the trash in packs of two.</p>';
    menuAt([SEND, SEP, ...TAIL, SEP, { id: 'openother', label: 'Open on Mac' }], 300, 206);
  } else if (SCENE === 'm-snip') {
    // Ctrl + Shift + Plus: Snipit's own overlay, a box dragged round the map, anywhere on screen
    const pic = cover(64, 2, 'sea'); pic.className = 'pic';
    pg.innerHTML = PAGE; pg.append(pic); pg.insertAdjacentHTML('beforeend', '<p>The lava fields at the gate: the pull path in yellow, the wall to stand on in red.</p>');
    const css = el('link'); css.rel = 'stylesheet'; css.href = '../../../src/Shell/pages/snip.css';
    const loaded = new Promise((r) => { css.onload = r; }); document.head.append(css); await loaded;
    // snip.css is a whole-screen overlay; the stage keeps its desktop and lays the overlay over the page only
    const z = el('div', 'snipzone'); document.body.append(z);
    z.append(el('div', 'dim'));
    const r = pic.getBoundingClientRect();
    const box = el('div', 'box'); Object.assign(box.style, { left: (r.left - 20 - 6) + 'px', top: (r.top - 20 - 6) + 'px', width: (r.width + 12) + 'px', height: (r.height + 12) + 'px' });
    z.firstChild.remove(); z.append(box);
    const hint = el('div', 'hint', 'DRAG A BOX AROUND IT &middot; ESC TO CANCEL'); z.append(hint);
    pointer(r.right + 2, r.bottom + 2);
    const k = el('div', 'kc', '<kbd>CTRL</kbd><kbd>SHIFT</kbd><kbd>+</kbd>&nbsp; ANYWHERE ON SCREEN, A GAME TOO'); k.style.left = '22px'; k.style.top = '368px'; document.body.append(k);
    hover = null; h = 408; document.getElementById('pm').remove();
  }
  await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
  return { crop: { x: 0, y: 0, w: 560, h }, forceHover: hover };
})();

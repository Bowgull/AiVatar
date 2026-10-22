// Sheet 63 (2026-10-22): "Pull apart". The FLUSH family from sheet 59 (video pop-out, a Claude job as a tall column on
// its right, the mini player's strip under it), shown as a storyboard (f1..f6) and cut into single windows (s-...) for
// the sheet's moving preview. Sheet 59's drawn pieces are borrowed from sheet-59/stage.js itself (read as text, its
// scene runner left off, its helpers exported) so the pixels are the same ones he already approved. Mockup tooling.
import { loadTex } from '../sheet-59/pix.js';

const SCENE = new URLSearchParams(location.search).get('scene') || 'f1';
const B59 = new URL('../sheet-59/', import.meta.url).href;
async function lib59() {
  let src = await (await fetch(B59 + 'stage.js')).text();
  src = src.replace(/from '(\.\.?\/[^']+)'/g, (m, p) => `from '${new URL(p, B59).href}'`);
  src = src.slice(0, src.indexOf('window.__ready = '));
  src += '\nexport { shadeA, jobColumn, reBody, keycap, a2, AW, SH, fills, el, at, tag, big };\n';
  return import(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const loaded = (f) => new Promise((r) => { f.addEventListener('load', r, { once: true }); setTimeout(r, 5000); });

// the Windows arrow pointer at 2x (sheet 62's)
function pointer(parent, x, y) {
  const M = ['O..........', 'OO.........', 'OWO........', 'OWWO.......', 'OWWWO......', 'OWWWWO.....', 'OWWWWWO....', 'OWWWWWWO...', 'OWWWWWWWO..', 'OWWWWWOOOO.', 'OWWOWWO....', 'OWO.OWWO...', 'OO..OWWO...', 'O....OWWO..', '.....OWWO..', '......OO...'];
  const c = document.createElement('canvas'); c.width = 22; c.height = 32; const g = c.getContext('2d');
  M.forEach((r, yy) => [...r].forEach((ch, xx) => { if (ch !== '.') { g.fillStyle = ch === 'O' ? '#000' : '#fff'; g.fillRect(xx * 2, yy * 2, 2, 2); } }));
  c.className = 'ptr'; c.style.left = x + 'px'; c.style.top = y + 'px'; parent.append(c); return c;
}

window.__ready = (async () => {
  const L = await lib59();
  const { shadeA, jobColumn, reBody, keycap, a2, AW, SH, fills, el, at, big } = L;
  await loadTex('band.png', 'tray.png');
  await document.fonts.load('22px VT323'); await document.fonts.ready;
  const clear = SCENE.startsWith('s-');
  if (clear) document.documentElement.classList.add('clear'); else document.body.prepend(el('div', 'desk'));
  const stage = el('div'); stage.style.cssText = 'position:absolute;left:0;top:0;width:1600px;height:1000px'; document.body.append(stage);

  // ---- the pieces, sizes in CSS px
  const VW = a2(AW), VH = 236, JW = 152, PH = a2(SH + 1), JS = 50, G = 14;
  async function video(x, y, radius, cls = '', parent = stage) {
    const f = el('iframe', 'prod pc ' + cls); f.src = '../sheet-59/video.html';
    Object.assign(f.style, { left: x + 'px', top: y + 'px', width: VW + 'px', height: VH + 'px', zIndex: '3' }); parent.append(f);
    await loaded(f); await wait(150);
    const d = f.contentDocument; d.documentElement.style.background = 'transparent'; d.body.style.background = 'transparent';
    d.querySelector('.frame').style.borderRadius = radius;
    return f;
  }
  function column(x, y, corners, cls = '') { const j = jobColumn(JW / 2, VH / 2 - 1, corners); j.classList.add('pc'); if (cls) j.className += ' ' + cls; return at(stage, j, x, y, { zIndex: '3' }); }
  function strip(x, y, flush, cls = '') {
    const s = shadeA(true); if (flush) reBody(s, AW, SH, [0, 0, 10, 10], { band: 's2', E: 3, fill: fills.wood(1.05) });
    s.classList.add('pc'); if (cls) s.className += ' ' + cls; return at(stage, s, x, y, { zIndex: '3' });
  }
  async function jobStrip(x, y, flush, cls = '', parent = stage) {
    const f = el('iframe', 'prod pc ' + cls); f.src = '../sheet-59/job.html';
    Object.assign(f.style, { left: x + 'px', top: y + 'px', width: VW + 'px', height: (JS + 6) + 'px', zIndex: '3' }); parent.append(f);
    await loaded(f); await wait(300);
    const d = f.contentDocument, s = d.createElement('style');
    s.textContent = `.pw{left:3px;top:3px;width:${VW - 6}px}.pj{--w:${VW - 6}px;border-radius:${flush ? '0 0 12px 12px' : '12px'}}
      .pj::before{box-shadow:0 0 0 3px #4a2e18,0 4px 0 #2a1a0e,inset 0 2px 0 rgba(255,255,255,.55)}`;
    d.head.append(s);
    return f;
  }
  async function menu(x, y, what = 'menu') {
    const f = el('iframe', 'prod pc'); f.src = 'menu.html?what=' + what;
    Object.assign(f.style, { left: x - 24 + 'px', top: y - 16 + 'px', width: '400px', height: what === 'hint' ? '80px' : '320px', zIndex: '10' }); stage.append(f);
    await loaded(f); for (let i = 0; i < 40 && !f.contentWindow.__done; i++) await wait(50);
    await f.contentDocument.fonts.ready;
    const m = f.contentDocument.querySelector(what === 'hint' ? '.plate' : '.tabmenu').getBoundingClientRect();
    return { f, x: x - 24 + m.left, y: y - 16 + m.top, w: m.width, h: m.height, doc: f.contentDocument };
  }
  const num = (x, y, n, words) => big(stage, x, y, `<b>${n}</b> &middot; ${words}`);

  // ---- the storyboard: one panel 940 x 560, the group's top-left at (40, 110)
  const X = 40, Y = 110, PW = 1120, PHH = 560;
  let crop = { x: 0, y: 0, w: PW, h: PHH }, hover = null;
  const FREE = { x: 672, y: 120 };            // where he leaves the player he took out
  const flushGroup = async () => {
    const g = el('div'); g.style.cssText = `position:absolute;left:0;top:0;filter:drop-shadow(0 4px 7px rgba(0,0,0,.5))`; stage.append(g);
    return g;
  };
  if (SCENE === 'f1' || SCENE === 'f2') {
    const g = await flushGroup();
    await video(X, Y, '12px 0 0 0', '', g);
    g.append(column(X + VW, Y, [0, 12, 12, 12])); g.append(strip(X, Y + VH, true));
    if (SCENE === 'f1') num(X, 40, '1', 'TOGETHER, FLUSH &middot; DRAG ANY ONE AND THE WHOLE GROUP MOVES');
    else {
      num(X, 40, '2', 'RIGHT-CLICK ANY OF THEM &middot; ONE MENU FOR THE FAMILY');
      const px = X + VW + 70, py = Y + 96;
      const m = await menu(px + 2, py + 2);
      const r = m.doc.querySelector('button[data-id="apart"]').getBoundingClientRect();
      hover = { frame: 'menu.html', sel: 'button[data-id="apart"]' };
      pointer(stage, m.f.offsetLeft + r.left + 150, m.f.offsetTop + r.top + r.height / 2 - 2);
    }
  } else if (SCENE === 'f3' || SCENE === 'f4' || SCENE === 'f5') {
    const n = SCENE.at(-1);
    const v = await video(X + 1, Y, '12px', 'glow');
    if (n === '3') {
      num(X, 40, '3', 'PULL APART &middot; THEY SPREAD 14 PX AND WIGGLE');
      column(X + VW + G - 1, Y + 1, [12, 12, 12, 12], 'glow');
      strip(X, Y + VH + G - 1, false, 'glow');
      await menu(X + 120, Y - 14 - 40 + 6, 'hint');
    } else if (n === '4') {
      num(X, 40, '4', 'DRAG ONE OUT &middot; IT STOPS WIGGLING, IT IS FREE');
      column(X + VW + G - 1, Y + 1, [12, 12, 12, 12], 'glow');
      strip(FREE.x, FREE.y, false, 'held');
      pointer(stage, FREE.x + 334, FREE.y + 22);
      await menu(X + 40, Y + VH + G + 20, 'hint');
    } else {
      num(X, 40, '5', 'OR DRAG ONE TO A NEW SPOT &middot; THE GOLD SLOT SHOWS WHERE, AND ITS NEW SHAPE');
      strip(FREE.x, FREE.y, false, 'own');
      const sy = Y + VH;
      const sl = el('div', 'slot'); at(stage, sl, X, sy, { width: VW + 'px', height: JS + 'px', zIndex: '2' });
      await jobStrip(X, sy, true, 'ghost');
      column(X + VW + 60, Y + 150, [12, 12, 12, 12], 'held');
      pointer(stage, X + VW + 60 + 70, Y + 150 + 18);
      await menu(X + 40, Y + VH + JS + 34, 'hint');
    }
  } else if (SCENE === 'f6') {
    num(X, 40, '6', 'ESC &middot; THE REST SNAP BACK FLUSH, MINUS WHAT HE TOOK');
    const g = await flushGroup();
    await video(X, Y, '12px 12px 0 0', '', g);
    await jobStrip(X, Y + VH, true, '', g);
    strip(FREE.x, FREE.y, false, 'own');
    const k = keycap(24, 13, null, { r: 4, label: 'ESC', pressed: true }); at(stage, k, X + VW + 60, Y + VH - 6);
    big(stage, X + VW + 120, Y + VH + 4, 'OR RIGHT-CLICK, OR CLICK THE DESKTOP');
  } else if (clear) {
    // single windows on nothing, for the moving preview; each sits at (24, 24) and is cut out with its own size
    const s = SCENE.slice(2), O = 24;
    let w = VW, h = VH;
    if (s === 'video-free') await video(O, O, '12px');
    else if (s === 'video-tl') await video(O, O, '12px 0 0 0');
    else if (s === 'video-top') await video(O, O, '12px 12px 0 0');
    else if (s === 'col-free') { column(O, O, [12, 12, 12, 12]); w = JW; }
    else if (s === 'col-flush') { column(O, O, [0, 12, 12, 12]); w = JW; }
    else if (s === 'strip-free') { strip(O, O, false); h = PH; }
    else if (s === 'strip-flush') { strip(O, O, true); h = PH; }
    else if (s === 'job-free') { await jobStrip(O, O, false); h = JS + 4; }
    else if (s === 'job-flush') { await jobStrip(O, O, true); h = JS + 4; }
    else if (s === 'menu' || s === 'menu-hover') {
      const m = await menu(O + 8, O + 8);
      const r = m.doc.querySelector('button[data-id="apart"]').getBoundingClientRect();
      if (s === 'menu-hover') hover = { frame: 'menu.html', sel: 'button[data-id="apart"]' };
      crop = { x: O - 8, y: O - 8, w: Math.ceil(m.w) + 48, h: Math.ceil(m.h) + 48 };
    } else if (s === 'hint') {
      const m = await menu(O + 8, O + 8, 'hint');
      crop = { x: O - 8, y: O - 8, w: Math.ceil(m.w) + 32, h: Math.ceil(m.h) + 32 };
    } else throw new Error('no scene ' + SCENE);
    if (!s.startsWith('menu') && s !== 'hint') crop = { x: O, y: O, w, h };
  } else throw new Error('no scene ' + SCENE);
  await Promise.all([...document.images].map((i) => i.decode().catch(() => {})));
  await wait(300);
  return { crop, forceHoverFrame: hover };
})();

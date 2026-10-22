// Sheet 60: the global switch for "Aang notices things in your notes", in Hush (his real menu, the real Hush submenu
// opened by a click; one group added in the menu's own markup).
const P = 2;
const TICK = ['...........', '...........', '..........O', '.........OO', 'O.......OO.', 'OO.....OO..', '.OO...OO...', '..OO.OO....', '...OOO.....', '....O......', '...........'];
function icon(map, col) {
  const dpr = window.devicePixelRatio || 1, px = Math.max(1, Math.round(P * dpr)), sh = Math.max(1, Math.round(dpr));
  const c = document.createElement('canvas'); c.width = map[0].length * px + sh; c.height = map.length * px + sh;
  const g = c.getContext('2d');
  const put = (fill, o) => map.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === 'O') { g.fillStyle = fill; g.fillRect(x * px + o, y * px + o, px, px); } }));
  put('rgba(0,0,0,.65)', sh); put(col, 0);
  c.className = 'ic tk'; c.style.width = c.width / dpr + 'px'; c.style.height = c.height / dpr + 'px'; return c;
}
const h = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x !== undefined) e.textContent = x; return e; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
window.__ready = (async () => {
  await document.fonts.ready;
  for (let k = 0; k < 50 && !window.__menu; k++) await wait(40);
  const AX = 24, AY = 560;
  const sprite = new Image(); sprite.src = '../../../assets/aang/frames/idle_0.png'; sprite.className = 'stg'; Object.assign(sprite.style, { left: AX + 'px', top: AY + 'px', width: '224px', height: '224px' });
  await sprite.decode();
  window.__menu({ kind: 'show', x: AX + 134, y: AY + 150, avoid: { x: AX + 86, y: AY + 76, width: 56, height: 130 },
    state: { muted: false, quiet: 'auto', docked: false, model: 'auto', saving: true, hushedUntil: 0, jobsRunning: 2 } });
  await wait(100);
  document.body.prepend(sprite);
  document.querySelector('#main button[data-sub="hush"]').click();
  await wait(200);
  const sub = document.getElementById('sub');
  const row = h('button'); row.type = 'button'; row.dataset.id = 'notes.bringup';
  row.append(h('span', 'lab', 'Let Aang bring up my notes')); const t = icon(TICK, '#ffe28c'); row.append(t);
  const note = h('div', '', 'Each note also has its own switch.');
  note.style.cssText = 'font:500 13px var(--body);letter-spacing:0;color:#bfae8a;padding:0 12px 8px';
  sub.append(h('div', 'sep'), h('div', 'mhead', 'YOUR NOTES'), row, note);
  await wait(100);
  const m = document.getElementById('main').getBoundingClientRect(), s = sub.getBoundingClientRect();
  const x0 = AX, y0 = Math.min(m.top, s.top) - 24, x1 = Math.max(m.right, s.right) + 30, y1 = Math.max(AY + 214, m.bottom, s.bottom) + 20;
  return { crop: { x: x0, y: Math.floor(y0 / 2) * 2, w: Math.ceil((x1 - x0) / 2) * 2, h: Math.ceil((y1 - y0) / 2) * 2 }, forceHover: '#sub button[data-id="notes.bringup"]' };
})();

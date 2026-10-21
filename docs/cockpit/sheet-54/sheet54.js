// Sheet 54 helpers: every <div class="shot" data-s="name"> becomes that real render (sheet-54/name.png). The arrows land
// where the render says the bubble is (shots.js, written by rim-shots.ts); G is how far each rim reaches outside B's line.
const G = { R1: 10, R2: 10, R3: 12, R4: 8 };
const TEXT = {
  R1: [['Carved gold corner', 'plum gem, lit bevel, gold inlay'], ['Wood runs round the tail', 'to a gold tip']],
  R2: [['Brass bracket, rivets', 'warm glow on the inside edge'], ['Wood tail, brass tip', '']],
  R3: [['Rope knot and leaves', 'knots in the grain, cream margin'], ['Paper tail, out from under', '']],
  R4: [['Gold filigree curls', 'two engraved lines inside'], ['Paper tail, gold edge', '']],
};
const CALLS = {};
for (const t of Object.keys(G)) {
  const g = G[t];
  CALLS[`${t}-a-line`] = [
    { to: (S) => [S.bubble.x - g + 7, S.bubble.y - g + 7], at: [24, 150], text: TEXT[t][0][0], small: TEXT[t][0][1] },
    { to: (S) => [S.bubble.x + S.bubble.w + g - 34, S.bubble.y + S.bubble.h + g + 4], at: [250, 196], text: TEXT[t][1][0], small: TEXT[t][1][1] },
  ];
}
CALLS['B-a-line'] = [{ to: (S) => [S.bubble.x + 13, S.bubble.y + 13], at: [60, 150], text: 'Today: a smooth stroke', small: 'small gold studs' }];

const NS = 'http://www.w3.org/2000/svg';
function arrow(svg, x1, y1, x2, y2) {
  const ang = Math.atan2(y2 - y1, x2 - x1), back = 11;
  const ex = x2 - Math.cos(ang) * back, ey = y2 - Math.sin(ang) * back;
  const head = (col, grow) => {
    const p = document.createElementNS(NS, 'path'), a = 7 + grow, b = 13 + grow;
    const px = (dx, dy) => [x2 + dx * Math.cos(ang) - dy * Math.sin(ang), y2 + dx * Math.sin(ang) + dy * Math.cos(ang)];
    const [ax, ay] = px(-b, -a), [bx, by] = px(-b, a), [tx, ty] = px(grow ? 2 : 0, 0);
    p.setAttribute('d', `M${ax} ${ay} L${tx} ${ty} L${bx} ${by} Z`); p.setAttribute('fill', col);
    p.setAttribute('stroke', col); p.setAttribute('stroke-linejoin', 'round'); p.setAttribute('stroke-width', grow ? 3 : 1);
    return p;
  };
  for (const [col, wdt] of [['#120A05', 7], ['#fffaf0', 3]]) {
    const l = document.createElementNS(NS, 'line');
    Object.entries({ x1, y1, x2: ex, y2: ey, stroke: col, 'stroke-width': wdt, 'stroke-linecap': 'round' }).forEach(([k, v]) => l.setAttribute(k, v));
    svg.append(l, head(col, col === '#120A05' ? 2 : 0));
  }
}
function build(host) {
  const name = host.dataset.s, S = window.SHOTS?.[name];
  const img = new Image(); img.src = `sheet-54/${name}.png`; img.alt = host.dataset.alt || '';
  if (S) { img.width = S.w; img.height = S.h; }
  host.append(img);
  const calls = CALLS[name];
  if (!S || !calls || host.dataset.plain !== undefined) return;
  const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('class', 'arrows'); svg.setAttribute('width', S.w); svg.setAttribute('height', S.h);
  host.append(svg);
  for (const c of calls) {
    const lab = document.createElement('div'); lab.className = 'callout';
    lab.append(document.createTextNode(c.text));
    if (c.small) { const s = document.createElement('small'); s.textContent = c.small; lab.append(s); }
    lab.style.left = c.at[0] + 'px'; lab.style.top = c.at[1] + 'px';
    host.append(lab);
    requestAnimationFrame(() => {
      const [tx, ty] = c.to(S);
      const lw = lab.offsetWidth, lh = lab.offsetHeight, lx = c.at[0], ly = c.at[1];
      const sx = tx < lx ? lx : tx > lx + lw ? lx + lw : Math.max(lx, Math.min(lx + lw, tx));
      const sy = ty < ly ? ly : ty > ly + lh ? ly + lh : ly;
      arrow(svg, sx, sy, tx, ty);
    });
  }
}
document.addEventListener('DOMContentLoaded', () => document.querySelectorAll('.shot[data-s]').forEach(build));

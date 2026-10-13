// Sheet 17's hourglass, drawn by hand: one character per pixel (approved 2026-10-12).
// o outline, W wood light, w wood, d wood dark, p post, g glass edge. The sand is worked out from the glass inside,
// so how much is left on top is how much time is left: half the time gone, half the sand at the bottom.
const GLASS = [
  'ooooooooooooooo',
  'oWWWWWWWWWWWWWo',
  'owwwwwwwwwwwwwo',
  'odddddddddddddo',
  'ooooooooooooooo',
  '.po.........op.',
  '.po.........op.',
  '.po.........op.',
  '.pgo.......ogp.',
  '.p.go.....og.p.',
  '.p..go...og..p.',
  '.p...go.og...p.',
  '.p....gog....p.',
  '.p...go.og...p.',
  '.p..go...og..p.',
  '.p.go.....og.p.',
  '.pgo.......ogp.',
  '.po.........op.',
  '.po.........op.',
  '.po.........op.',
  'ooooooooooooooo',
  'oWWWWWWWWWWWWWo',
  'owwwwwwwwwwwwwo',
  'odddddddddddddo',
  'ooooooooooooooo'];
const COLOUR = { o: '#120A05', W: '#C68A4A', w: '#8E5A2E', d: '#5E3A1C', p: '#7A4A24', g: '#9fd0e0' };
export const GW = GLASS[0].length, GH = GLASS.length;
const INSIDE = GLASS.map((row, y) => {
  if (y < 5 || y > 19) return [];
  const walls = [];
  for (let x = 2; x < GW - 2; x++) if (row[x] === 'o' || row[x] === 'g') walls.push(x);
  if (walls.length < 2) return [];
  const xs = [];
  for (let x = walls[0] + 1; x < walls[walls.length - 1]; x++) if (row[x] === '.') xs.push(x);
  return xs;
});
const centreOut = (xs) => [...xs].sort((p, q) => Math.abs(p - 7) - Math.abs(q - 7));
const TOP = [11, 10, 9, 8, 7, 6, 5], BOTTOM = [19, 18, 17, 16, 15, 14, 13];
const count = (rows) => rows.reduce((n, y) => n + INSIDE[y].length, 0);
const TOPN = count(TOP), BOTN = count(BOTTOM);
const NS = 'http://www.w3.org/2000/svg';

/** An empty hourglass at `px` screen pixels per pixel; fill it with draw(). */
export function makeGlass(px) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${GW} ${GH}`);
  svg.setAttribute('width', String(GW * px));
  svg.setAttribute('height', String(GH * px));
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.classList.add('hgl');
  return svg;
}

/** `left` is the share of time left, 0..1. The falling stream only while it runs. */
export function draw(svg, left, running) {
  const rects = [];
  const px = (x, y, fill) => rects.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${fill}"/>`);
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) { const c = GLASS[y][x]; if (c !== '.' && COLOUR[c]) px(x, y, COLOUR[c]); }
  for (let y = 5; y < 20; y++) for (const x of INSIDE[y]) px(x, y, 'rgba(190,225,240,.18)');
  const grain = (x, y) => (x * 7 + y * 3) % 5 === 0 ? '#FFE096' : (x + y) % 2 ? '#F2C14E' : '#E0A43A';
  const pour = (rows, n) => { let left = n; for (const y of rows) for (const x of centreOut(INSIDE[y])) { if (left-- <= 0) return; px(x, y, grain(x, y)); } };
  const f = Math.max(0, Math.min(1, left));
  pour(TOP, Math.round(f * TOPN));
  pour(BOTTOM, Math.round((1 - f) * BOTN));
  if (running && f > 0) { const t = (Date.now() / 160) | 0; for (let y = 12; y < 19; y++) if ((y + t) % 2 === 0) px(7, y, '#FFE096'); }
  px(3, 6, 'rgba(255,255,255,.55)'); px(3, 7, 'rgba(255,255,255,.55)'); px(3, 17, 'rgba(255,255,255,.4)'); px(3, 18, 'rgba(255,255,255,.4)');
  svg.innerHTML = rects.join('');
}

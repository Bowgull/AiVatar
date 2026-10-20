// Samara's pixel-art kit, lifted from sheet 33 (palette, grids, outline, tile, leaf, lantern, paint). Used by sheet 36.

// ---- palettes: one short ramp per material, light to dark (Stardew-sized), outline is dark wood, never black
const C = {
  o: '#24140A',                                                    // outline
  w1: '#E3A868', w2: '#C08A52', w3: '#9C6A3A', w4: '#6E4422', w5: '#4A2C14',   // wood, light to dark
  d1: '#6A4426', d2: '#55351C', d3: '#3F2614', d4: '#2E1A0C',     // dark wood (the lit leaf's block)
  g0: '#FFF6D2', g1: '#FFE07A', g2: '#FFC43C', g3: '#E0961E', g4: '#A8630E',   // gold
  n1: '#35577A', n2: '#27415A', n3: '#1B2E42', n4: '#122030',     // evening blue
  p1: '#FFF0C8', p2: '#F5C66A', p3: '#D98A2E', p4: '#9A4E16',     // lit paper
  r1: '#E07A3A', r2: '#B8541E', r3: '#7A2E10',                    // ember (the lantern's leaf)
};
// ---- a maple leaf as points (tip up, stem down)
const PTS = [[0,-1],[.13,-.73],[.31,-.83],[.26,-.42],[.57,-.65],[.52,-.47],[.9,-.53],[.74,-.3],[1,-.08],[.58,.08],[.66,.3],[.18,.21],[.07,.46],[.07,.84],[-.07,.84],[-.07,.46],[-.18,.21],[-.66,.3],[-.58,.08],[-1,-.08],[-.74,-.3],[-.9,-.53],[-.52,-.47],[-.57,-.65],[-.26,-.42],[-.31,-.83],[-.13,-.73]];
function inPoly(x, y, poly) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; }
// The 16 px leaf, by hand: the LEFT half (column 7 is the middle), mirrored so it is exactly symmetric. '#' leaf.
const HALF16 = [
  '........',
  '.......#',
  '......##',
  '..#...##',
  '..##.###',
  '...#####',
  '#..#####',
  '########',
  '.#######',
  '..######',
  '.####.##',
  '.##....#',
  '.......#',
  '.......#',
  '.......#',
  '........',
];
const LEAF16 = HALF16.map((h) => {
  const row = [...h, ...[...h].reverse().slice(1), '.'];
  return row.map((ch, x) => (ch !== '#' ? '.' : x < 7 ? '+' : '#')).join('');
}).map((r, y) => [...r].map((ch, x) => (ch !== '.' && ((x === 7 && y >= 3) || ((y === 8 && (x === 6 || x === 8)) || (y === 7 && (x === 5 || x === 9)) || (y === 6 && (x === 4 || x === 10)))) ? 'v' : ch)).join(''));
function grid(n) { return Array.from({ length: n }, () => Array(n).fill(null)); }
const around = (g, x, y) => [[1,0],[-1,0],[0,1],[0,-1]].some(([dx, dy]) => g[y + dy]?.[x + dx]);
function outline(g, col) { const n = g.length, out = grid(n); for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) out[y][x] = g[y][x] ?? (around(g, x, y) ? col : null); return out; }
// A rounded tile: banded from light (top) to dark (bottom), 1 px outline, a top shine row, a few wood-grain lines.
function tile(n, ramp, grainCol) {
  const g = grid(n), r = Math.max(3, Math.round(n * 0.22));
  const inside = (x, y) => { const cx = Math.min(Math.max(x, r), n - 1 - r), cy = Math.min(Math.max(y, r), n - 1 - r); return (x - cx) ** 2 + (y - cy) ** 2 <= r * r + r * .2; };
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (inside(x, y)) {
    const t = y / (n - 1), band = Math.min(ramp.length - 1, Math.floor(t * ramp.length));
    // dither one row across each band edge, checkerboard: the pixel-art way to blend, no mud
    const edge = Math.floor(t * ramp.length * (n - 1) / (n - 1)), next = (t * ramp.length) % 1;
    g[y][x] = next < 1.2 / n * ramp.length && band > 0 && (x + y) % 2 ? ramp[band - 1] : ramp[band];
  }
  // grain: a few long streaks, each one run of the next darker shade, offset row to row like real planks
  if (grainCol) for (let k = 1; k < 4; k++) { const y = Math.round(n * (0.2 + k * 0.2)), len = Math.round(n * (k % 2 ? .3 : .45)), x0 = Math.round(n * [.12, .5, .25, .45][k]);
    for (let x = x0; x < Math.min(n - 2, x0 + len); x++) if (g[y]?.[x]) g[y][x] = grainCol; }
  for (let x = 0; x < n; x++) { const y = [...Array(n).keys()].find((yy) => g[yy][x]); if (y !== undefined && x > r - 1 && x < n - r) g[y + 1][x] = ramp[0]; }
  return outline(g, C.o);
}
// Put a leaf on a grid: light left half, dark right half, its own outline, a vein, a shine.
function leafOn(g, cx, cy, R, pal, glow) {
  const n = g.length, L = grid(n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const px = (x + .5 - cx) / R, py = (y + .5 - cy) / R; if (inPoly(px, py, PTS)) L[y][x] = x + .5 < cx ? pal.light : pal.main; }
  // vein: the midrib and two side veins
  const v = (x0, y0, x1, y1) => { const s = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)); for (let i = 0; i <= s; i++) { const x = Math.round(x0 + (x1 - x0) * i / s), y = Math.round(y0 + (y1 - y0) * i / s); if (L[y]?.[x]) L[y][x] = pal.vein; } };
  v(Math.floor(cx), Math.round(cy + R * .7), Math.floor(cx), Math.round(cy - R * .72)); v(Math.floor(cx), Math.round(cy + R * .15), Math.round(cx - R * .62), Math.round(cy - R * .42)); v(Math.floor(cx), Math.round(cy + R * .15), Math.round(cx + R * .62), Math.round(cy - R * .42));
  // shine: a few pixels near the top left
  for (const [dx, dy] of [[-.25, -.55], [-.32, -.48], [-.6, -.25]]) { const x = Math.round(cx + dx * R), y = Math.round(cy + dy * R); if (L[y]?.[x] && L[y][x] !== pal.vein) L[y][x] = pal.shine; }
  const Lo = outline(L, pal.edge);
  if (glow) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!Lo[y][x] && g[y][x] && g[y][x] !== C.o) {
    let d = 9; for (let yy = y - 2; yy <= y + 2; yy++) for (let xx = x - 2; xx <= x + 2; xx++) if (Lo[yy]?.[xx]) d = Math.min(d, Math.max(Math.abs(xx - x), Math.abs(yy - y)));
    if (d === 1) g[y][x] = glow[0]; else if (d === 2 && (x + y) % 2) g[y][x] = glow[1];
  }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (Lo[y][x]) g[y][x] = Lo[y][x];
  return g;
}
function leaf16(pal) {
  const g = grid(16);
  LEAF16.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '#') g[y][x] = pal.main; else if (ch === '+') g[y][x] = pal.light; else if (ch === 'v') g[y][x] = pal.vein; }));
  return outline(g, pal.edge);
}
// The hand-drawn 16 px leaf placed on a bigger tile (used at 24 px, where a drawn-by-rule leaf goes blobby).
function stamp16(g, pal) { const L = leaf16(pal), off = Math.floor((g.length - 16) / 2); L.forEach((row, y) => row.forEach((c, x) => { if (c) g[y + off][x + off + 0] = c; })); return g; }
const small = (n) => n <= 32;
const GOLD = { light: C.g1, main: C.g2, vein: C.g3, shine: C.g0, edge: C.g4 };
const EMBER = { light: C.r1, main: C.r2, vein: C.r3, shine: C.p2, edge: C.r3 };
const GOLD16 = { light: C.g1, main: C.g2, vein: C.g4, edge: C.o };

// Aang's own colours, read from his pages' CSS (2026-10-14): plum and ink nights, gold, wood, parchment, burnt orange,
// and the sky of his air glow (--avatar-glow).
Object.assign(C, { k1: '#4A2C6E', k2: '#3A2258', k3: '#2C1848', k4: '#1A1132', k5: '#100A22',   // plum to ink
  e1: '#4A2E1A', e2: '#3A2414', e3: '#24160D', e4: '#1A0F09',                                         // the browser's dark wood
  sky: '#C8E8FF', sky2: '#8FB8E0', bo1: '#FF8040', bo2: '#C95E28', bo3: '#8A3A14' });
// The lantern, by rule but in clean shapes on a 32 grid, scaled to n: a wooden cap and hook, a round paper body lit
// from inside (brightest upper left), two ribs, an ember maple in the light, a base and a gold tassel.
function lantern(g, n, opt) {
  const s = n / 32, R = (v) => Math.round(v * s);
  const set = (x, y, c) => { if (y >= 0 && y < n && x >= 0 && x < n) g[y][x] = c; };
  const box = (x0, y0, x1, y1, c) => { for (let y = R(y0); y < Math.max(R(y0) + 1, R(y1)); y++) for (let x = R(x0); x < Math.max(R(x0) + 1, R(x1)); x++) set(x, y, c); };
  const cx = 16 * s, cy = (opt.cy ?? 17) * s, rx = (opt.rx ?? 10.5) * s, ry = (opt.ry ?? 9.5) * s;
  // glow ring on the night (dithered, never a gradient)
  if (opt.glow) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const d = Math.hypot((x + .5 - cx) / (rx + 3.5 * s), (y + .5 - cy) / (ry + 3.5 * s)); if (d <= 1 && g[y][x] && g[y][x] !== C.o && (d < .93 || (x + y) % 2)) g[y][x] = opt.glow; }
  const P = grid(n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = (x + .5 - cx) / rx, dy = (y + .5 - cy) / ry;
    if (dx * dx + dy * dy <= 1) { const k = Math.hypot(dx + .35, dy + .35); P[y][x] = k < .55 ? C.p1 : k < 1.0 ? C.p2 : C.p3; }
  }
  // ribs: the paper's folds
  if (n >= 32) for (const fx of [-.5, .5]) { for (let y = 0; y < n; y++) { const dy = (y + .5 - cy) / ry; if (Math.abs(dy) >= .92) continue; const x = Math.round(cx + fx * rx * Math.sqrt(1 - dy * dy) - .5); if (P[y][x]) P[y][x] = C.p3; } }
  const Po = outline(P, C.p4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (Po[y][x]) g[y][x] = Po[y][x];
  if (opt.leaf && n >= 32) leafOn(g, cx, cy + .5 * s, 5.6 * s, { light: C.bo1, main: C.bo2, vein: C.bo3, shine: C.p1, edge: C.bo3 }, null);
  else if (opt.leaf) { set(Math.floor(cx) - 1, Math.floor(cy), C.bo2); set(Math.floor(cx), Math.floor(cy) - 1, C.bo2); set(Math.floor(cx), Math.floor(cy), C.bo2); set(Math.floor(cx), Math.floor(cy) + 1, C.bo3); set(Math.floor(cx) - 1 + 2, Math.floor(cy), C.bo2); }
  // cap, hook, base, tassel (wood and gold), each with its outline
  const W = grid(n);
  const wbox = (x0, y0, x1, y1, c) => { for (let y = R(y0); y < Math.max(R(y0) + 1, R(y1)); y++) for (let x = R(x0); x < Math.max(R(x0) + 1, R(x1)); x++) if (y >= 0 && y < n) W[y][x] = c; };
  const top = cy / s - (opt.ry ?? 9.5), bot = cy / s + (opt.ry ?? 9.5);
  wbox(15, top - 6, 17, top - 3, C.w4); wbox(11, top - 3, 21, top + .5, C.w3); wbox(11, top - 3, 21, top - 2, C.w2);
  wbox(11, bot - .5, 21, bot + 2, C.w3); wbox(11, bot + 1, 21, bot + 2, C.w4);
  wbox(15, bot + 2, 17, bot + 5, C.g2); wbox(15, bot + 4, 17, bot + 5, C.g3);
  const Wo = outline(W, C.o);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (Wo[y][x] && !(Po[y][x] && !W[y][x])) g[y][x] = Wo[y][x];
  // a few sky pixels: Aang's air (stars, or a wisp of wind)
  if (opt.sky && n >= 32) for (const [x, y] of opt.sky) set(R(x), R(y), C.sky);
  return g;
}
// The 16 px lantern, by hand (a rule-drawn one goes lopsided this small). Light from the upper left, a tiny ember maple.
// 2026-10-20 (his ask): the mark in the glass is a maple leaf, not a plus: a top point, two side points, a stem.
const LANTERN16 = [
  '......####......',
  '......#VV#......',
  '...##########...',
  '...#WWWWWWWW#...',
  '...4112222224...',
  '..41111le22334..',
  '..411l2le2e334..',
  '..411llleee334..',
  '..4122llee3334..',
  '..42222EE33334..',
  '...4223333334...',
  '...#VVVVVVVV#...',
  '...##########...',
  '.......gG.......',
  '.......gG.......',
  '................',
];
function onTile24(g) { const L = lantern16(); L.forEach((r, y) => r.forEach((c, x) => { if (c && g[y + 4]) g[y + 4][x + 4] = c; })); return g; }
function lantern16() { const K = { '#': C.o, V: C.w4, W: C.w2, '1': C.p1, '2': C.p2, '3': C.p3, '4': C.p4, l: C.bo1, e: C.bo2, E: C.bo3, g: C.g2, G: C.g3 }; return LANTERN16.map((r) => [...r].map((ch) => K[ch] ?? null)); }
const STARS = [[6, 7], [25, 5], [27, 13], [5, 20]];
const ICONS = [
  { tag: 'L1 - THE PLUM NIGHT', name: 'Samara', why: "Aang's own night: plum fading to ink (his panels' colours), the gold-lit lantern, the burnt-orange maple in its light, a few stars in his sky blue. The most Aang. One honest risk: warm light on purple is Firefox's pair. It is a square, a lantern and gold, not an orange swirl on a purple ball, which is what people recognise as Firefox.",
    art(n) { if (n === 16) return lantern16(); const g = tile(n, [C.k2, C.k3, C.k4, C.k5], null); if (n === 24) return onTile24(g); return lantern(g, n, { leaf: true, glow: C.k1, sky: STARS }); } },
  { tag: 'L2 - THE WOOD NIGHT', name: 'Samara', why: "The browser's own dark wood behind the lantern, so the icon matches the window it opens. No purple at all, so nothing like Firefox. Warmer, a little less contrast.",
    art(n) { if (n === 16) return lantern16(); const g = tile(n, [C.e1, C.e2, C.e3, C.e4], C.e4); if (n === 24) return onTile24(g); return lantern(g, n, { leaf: true, glow: C.e1 }); } },
  { tag: 'L3 - THE INK NIGHT, AIR', name: 'Samara', why: "Ink night (his darkest panel colour), the lantern, and a curl of his sky-blue air drifting past it: Aang's element. The brightest contrast of the three.",
    art(n) { if (n === 16) return lantern16(); const g = tile(n, [C.k4, C.k5, C.k5, C.k5], null); if (n === 24) return onTile24(g); lantern(g, n, { leaf: true, glow: C.k3 });
      if (n >= 32) { const s = n / 32; for (const [x, y] of [[4, 24], [5, 23], [6, 23], [7, 23], [8, 24], [25, 9], [26, 8], [27, 8], [28, 9], [27, 10]]) { const X = Math.round(x * s), Y = Math.round(y * s); for (let a = 0; a < Math.max(1, s); a++) for (let b = 0; b < Math.max(1, s); b++) if (g[Y + a]?.[X + b]) g[Y + a][X + b] = C.sky; } }
      return g; } },
];
function paint(g, scale) {
  const n = g.length, c = document.createElement('canvas'); c.width = c.height = n * scale; c.style.width = c.style.height = n * scale + 'px';
  const x = c.getContext('2d'); for (let y = 0; y < n; y++) for (let xx = 0; xx < n; xx++) if (g[y][xx]) { x.fillStyle = g[y][xx]; x.fillRect(xx * scale, y * scale, scale, scale); }
  return c;
}

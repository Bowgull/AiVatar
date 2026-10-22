// Sheet 59 v4 (2026-10-22): the four scenes for the player's screen, 56 x 30 art pixels, 6 frames each.
// His notes on v3: skate okay but the skater needs fixing; the drive gone; rain and campfire redone; one new scene.
// What the pixel-loop masters do, applied here (not copied): one small palette per scene with hue-shifted ramps;
// ONE strong light source and everything else in shadow; figures lit on the side facing the light (a rim) so they
// read; light as two or three flat bands, never noisy dither at this size; colour cycling for water, rain and fire;
// 2-4 frame secondary motion (steam, a tail, a bobber) so the picture breathes while the big shapes stay still.
// Backgrounds that scroll are tiling strips (they move continuously in the product); the 6 frames are one loop of
// the moving figure. Mockup art only.
export const SW = 56, SH = 30;
const mod = (a, n) => ((a % n) + n) % n;
const TAU = Math.PI * 2;

// ================================================================ 1 · SKATING DOWN THE BOULEVARD (side view)
// The background is v3's (the sun lifted two pixels); the skater is redrawn from scratch: a cream hoodie lit on its
// sun side, denim legs (the far leg a tone lighter so the two never merge) that read against the plum road, a real
// push cycle (ride, lift, plant, push, recover, step back on), the body dipping a pixel on the push, and a board with a
// kicked tail and nose and two cream wheels. A tall palm slides past in front of the sun.
const SKY = ['#1a1230', '#22163a', '#2e1c46', '#40224f', '#562a58', '#70325e', '#8c3c5e', '#a8485c', '#c4585a', '#da6c52', '#ea844c', '#f49e4c', '#fbb854', '#ffcd6c'];
const SUN = ['#fff3d8', '#ffe8b0', '#ffdc8a', '#ffcc66', '#ffb84e', '#ffa244', '#f88a40', '#ee7444'];
const HAZE = '#6a2f5c', CITY = '#4c2252', CITY2 = '#3a1a46', LIT = '#ffc46a', SIL = '#1c0f22';
// sky as flat bands, one checker step only on the line where two bands meet
function skyBands(put, top, hy) {
  for (let y = top; y < hy; y++) for (let x = 0; x < SW; x++) {
    const v = (y - top) / (hy - top) * (SKY.length - 1), i = Math.floor(v), fr = v - i;
    put(x, y, fr > 0.75 && (x + y) % 2 === 0 && i + 1 < SKY.length ? SKY[i + 1] : SKY[i]);
  }
}
function sun(put, sx, sy, r) {
  const GAPS = new Set([Math.floor(sy) + 3, Math.floor(sy) + 5, Math.floor(sy) + 6]);
  for (let y = Math.floor(sy - r); y <= sy + r; y++) for (let x = Math.floor(sx - r); x <= sx + r; x++) {
    const dx = x + 0.5 - sx, dy = y + 0.5 - sy;
    if (dx * dx + dy * dy > r * r) continue;
    put(x, y, GAPS.has(y) ? '#c4585a' : SUN[Math.min(SUN.length - 1, Math.floor((y - (sy - r)) / (2 * r) * SUN.length))]);
  }
}
function hills(put, hy, shift) {
  for (let x = 0; x < SW; x++) {
    const wx = x + shift;
    const far = Math.round(2.5 + 1.6 * Math.sin(wx * TAU * 3 / 112) + 0.9 * Math.sin(wx * TAU * 8 / 112 + 1));
    const near = Math.round(1.2 + 1.2 * Math.sin(wx * TAU * 2 / 112 + 2) + 0.6 * Math.sin(wx * TAU * 11 / 112));
    for (let y = hy - far; y <= hy; y++) put(x, y, y === hy - far ? '#7a3660' : HAZE);
    for (let y = hy - near; y <= hy; y++) put(x, y, CITY);
    if (near >= 1 && mod(wx * 7, 13) === 0) put(x, hy - near + 1, LIT);
  }
}
const CROWN = { m: ['.x.x.', 'xxxxx', 'x.x.x'], l: ['..xx.xx..', '.xxxxxxx.', 'xx..x..xx', 'x..x.x..x'] };
function smallPalm(put, bx, by, h, col) {
  const c = h < 7 ? CROWN.m : CROWN.l, top = by - Math.round(h * 0.8);
  for (let y = by; y >= top; y--) put(bx, y, col);
  c.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === 'x') put(bx - (c[0].length >> 1) + x, top - 1 + y, col); }));
}
/** A tall palm, hand-drawn crown on a slightly curved trunk. */
const PALM = [
  '...xx.....xxx...',
  '.xxxxx..xxxxxxx.',
  'xx...xxxxx....xx',
  'x...xxxxxxx....x',
  '...xx.xxx.xx....',
  '..xx..x.x..xx...',
  '..x...x.x...x...',
  '......x.x.......',
];
function bigPalm(put, bx, by, col) {
  for (let y = by; y > by - 20; y--) { const k = Math.round(Math.pow((by - y) / 20, 2) * 2); put(bx + k, y, col); put(bx + k + 1, y, col); }
  PALM.forEach((r, y) => [...r].forEach((c, x) => { if (c === 'x') put(bx + 2 - 7 + x, by - 22 + y, col); }));
}
function lampPost(put, bx, by, col) {
  for (let y = by; y >= by - 18; y--) put(bx, y, col);
  for (let i = 1; i <= 3; i++) put(bx + i, by - 18, col);
  put(bx + 3, by - 17, '#fff3d8'); put(bx + 2, by - 17, '#ffc46a'); put(bx + 4, by - 17, '#ffc46a'); put(bx + 3, by - 16, '#ffc46a');
}

// The skater, facing right, built from parts so every pose shares one body: a cap with a brim, a face, a cream hoodie
// lit on its sun side, denim legs, white shoes, a board with a kicked tail and nose and two cream wheels.
// Coordinates inside a 14 x 18 box; row 15 is the deck, 16 the wheels.
const SKC = { k: '#1e1428', h: '#1a0e18', S: '#e09a70', J: '#d8b498', L: '#fff0d8', a: '#a87a70', P: '#3c4c90', p: '#6474b4', s: '#fff6e0', D: '#8a4422', d: '#c06a34', w: '#ffe0a0' };
const UPPER = ['.....kkk....', '....kkkkkk..', '....hSSS....', '....hSSS....', '....JJJJL...', '....JJJJL...', '.....JJJL...', '.....JJJL...', '.....PPPP...'];
// per frame: upper body offset, far arm, near arm (shoulder -> hand), back leg (hip -> knee -> foot), front knee dip
const POSE = [
  { name: 'ride', dx: 0, dy: 0, far: [[5, 5], [3, 7], [2, 9]], near: [[8, 5], [10, 7], [12, 8]], back: [[5, 9], [4, 12], [3, 14]], fk: 0 },
  { name: 'lift', dx: 0, dy: 0, far: [[5, 5], [3, 7], [2, 8]], near: [[8, 5], [10, 7], [12, 7]], back: [[5, 9], [4, 11], [3, 13]], fk: 0 },
  { name: 'plant', dx: 1, dy: 1, far: [[7, 6], [6, 8], [6, 10]], near: [[9, 6], [10, 8], [11, 9]], back: [[6, 10], [5, 13], [4, 16]], fk: 1 },
  { name: 'push', dx: 1, dy: 1, far: [[7, 6], [10, 7], [12, 7]], near: [[7, 6], [5, 8], [3, 9]], back: [[6, 10], [3, 13], [0, 16]], fk: 1 },
  { name: 'recover', dx: 1, dy: 1, far: [[7, 6], [8, 8], [9, 9]], near: [[8, 6], [7, 8], [6, 10]], back: [[6, 10], [3, 12], [1, 13]], fk: 1 },
  { name: 'step', dx: 0, dy: 0, far: [[5, 5], [3, 7], [3, 9]], near: [[8, 5], [10, 7], [11, 9]], back: [[5, 9], [3, 11], [2, 13]], fk: 0 },
];
function line(a, b, cb) { let [x0, y0] = a; const [x1, y1] = b, dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let e = dx + dy;
  for (;;) { cb(x0, y0); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } } }
const poly = (pts, cb) => { for (let i = 1; i < pts.length; i++) line(pts[i - 1], pts[i], cb); };
function drawSkater(put, ox, oy, f) {
  const P = POSE[f], q = (x, y, c) => put(ox + x, oy + y, SKC[c]);
  const shift = ([x, y]) => [x + P.dx - (P.dx ? 1 : 0), y + P.dy - (P.dy ? 1 : 0)];
  // board: tail and nose kicked up a pixel, two wheels
  for (let x = 2; x <= 11; x++) q(x, 15, x > 7 ? 'd' : 'D');
  q(1, 14, 'D'); q(12, 14, 'd');
  q(3, 16, 'w'); q(4, 16, 'w'); q(9, 16, 'w'); q(10, 16, 'w');
  // far arm behind everything, a hand at its end
  const fr = P.far.map(shift);
  poly(fr, (x, y) => q(x, y, 'a')); q(...fr[fr.length - 1], 'S');
  // front leg (far, lighter): hip -> knee -> foot on the nose end of the deck
  poly([[7 + P.dx, 9 + P.dy], [9, 11 + P.fk], [10, 14]], (x, y) => q(x, y, 'p'));
  q(10, 14, 's'); q(11, 14, 's');
  // back leg (near, darker denim), a shoe on its end
  poly(P.back, (x, y) => q(x, y, 'P'));
  const [fx, fy] = P.back[P.back.length - 1];
  q(fx, fy, 's'); q(fx - 1, fy, 's');
  // the upper body
  UPPER.forEach((r, y) => [...r].forEach((c, x) => { if (c !== '.') q(x + P.dx, y + P.dy, c); }));
  // near arm over the body, lit, a hand at its end
  const nr = P.near.map(shift);
  poly(nr, (x, y) => q(x, y, 'L')); q(...nr[nr.length - 1], 'S');
}

export function skate(f) {
  return (put) => {
    skyBands(put, 0, 20);
    sun(put, 38, 9, 9);
    hills(put, 19, f);                                                   // far town: 1 px a frame
    for (let x = 0; x < SW; x++) put(x, 20, CITY2);
    for (let k = -1; k < 4; k++) smallPalm(put, mod(k * 22 + 4 - 2 * f, 88) - 10, 20, 9, CITY2);  // far side: 2 px
    // the road, the sun's sheen laid on it in three flat steps, the centre line at 3 px a frame
    for (let y = 21; y < 25; y++) for (let x = 0; x < SW; x++) {
      let col = ['#5a2a50', '#3e1e40', '#301834', '#2a1530'][y - 21];
      const ax = Math.abs(x + 0.5 - 39);
      if (ax < 7 - (y - 21) * 1.6) col = y === 21 ? '#f49e4c' : y === 22 ? '#c4585a' : '#8c3c5e';
      put(x, y, col);
    }
    for (let x = 0; x < SW; x++) if (mod(x + 3 * f, 12) < 6) put(x, 23, '#c98a6a');
    // near pavement, the kerb lit warm, joints at 4 px a frame
    for (let y = 25; y < SH; y++) for (let x = 0; x < SW; x++) {
      let col = y === 25 ? '#b86a5a' : y === 26 ? '#5a2a4e' : y < 28 ? '#4a2244' : '#3c1c38';
      if (y > 26 && mod(x + 4 * f, 16) === 0) col = '#2a1228';
      put(x, y, col);
    }
    // near side: a tall palm (it crosses the sun) and a streetlight, 4 px a frame, kept clear of him
    for (let k = -1; k < 2; k++) { bigPalm(put, mod(k * 112 + 70 - 4 * f, 112) - 20, 26, SIL); lampPost(put, mod(k * 112 + 20 - 4 * f, 112) - 20, 26, SIL); }
    // the skater, his shadow stretched behind him on the pavement
    const sx = 14, sy = 11;
    for (let x = sx - 5; x < sx + 11; x++) put(x, 28, '#2a1228');
    drawSkater(put, sx, sy, f);
  };
}

// ---------------------------------------------------------------- shared: a sprite from a string map, rim-lit on one side
/** Draw a mask (rows of 'x' and '.') at ox, oy in col; a pixel whose neighbour on side `from` is empty gets the rim. */
function rimSprite(put, rows, ox, oy, col, rim, from = 1, rim2 = null) {
  rows.forEach((r, y) => [...r].forEach((c, x) => {
    if (c === '.') return;
    const n = r[x + from], edge = n === undefined || n === '.';
    const n2 = r[x + 2 * from], edge2 = !edge && (n2 === undefined || n2 === '.');
    put(ox + x, oy + y, edge ? rim : edge2 && rim2 ? rim2 : col);
  }));
}

// ================================================================ 2 · RAIN ON THE WINDOW (night, inside)
// Warm against cold, Waneella-style: across the wet street a block of flats with its windows lit amber (one blue with
// a TV), the only bright things in the picture, and the cat on our sill sits right in front of them so its silhouette
// reads. Inside, a candle in a jar on the sill rims the cat's near side. Rain shows as thin cold lines, brighter where
// they cross the lit block; two drops slide down the glass and leave a trail; the mug steams; the tail swings; one
// window across the street goes dark halfway through the loop. Flat bands of colour, no noise.
const R = {
  wall: '#120c09', wood: '#2e1c10', woodD: '#1c1009', woodLit: '#7a4e2a', woodHi: '#c88a4a',
  sky: ['#0c1122', '#10182c', '#152036', '#1b2a44'], far: '#0e1426', blk: '#161d33', blkD: '#10162a', roof: '#0a0e1c',
  win: '#ffc46a', winL: '#c98a3a', off: '#1f2740', tv: '#6ab8c8', tvL: '#3a7a90',
  rain: '#2a3a62', rainHi: '#a8bce0', bead: '#8fa4d8', beadD: '#070a14',
  cat: '#06040a', catRim: '#6a4428', jar: '#4a3a30', jarHi: '#a08a70', wax: '#f6e6c4', fl: '#fff3d8', fl2: '#ffc46a', glass: '#1a1a26',
  mug: '#c9a888', mugD: '#7a6050', steam: '#3a3a4a',
};
export function rain(f) {
  return (put) => {
    const GX0 = 3, GX1 = 52, GY0 = 2, GY1 = 22, MX = 27;
    for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) put(x, y, R.wall);
    // outside: sky bands, a far roofline on the left, the block of flats across the street on the right
    for (let y = GY0; y <= GY1; y++) for (let x = GX0; x <= GX1; x++) put(x, y, R.sky[Math.min(3, Math.floor((y - GY0) / 5))]);
    const far = [3, 3, 3, 5, 5, 5, 2, 2, 6, 6, 6, 6, 4, 4, 4, 3, 3, 7, 7, 3, 3, 3, 5, 5, 5, 5, 2, 2];
    for (let x = GX0; x < 31; x++) for (let y = 17 - far[(x - GX0) % far.length]; y <= GY1; y++) put(x, y, R.far);
    for (let y = 5; y <= GY1; y++) for (let x = 31; x <= GX1; x++) put(x, y, x === 31 ? R.blkD : R.blk);
    for (let x = 30; x <= GX1; x++) put(x, 4, R.roof);
    const OFF = new Set(['0,2', '3,1', '4,3']), DARK = '2,0', TV = '1,2';
    for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) {
      const x = 33 + c * 4, y = 7 + r * 4, k = `${c},${r}`;
      let a = R.win, b = R.winL;
      if (OFF.has(k) || (k === DARK && f >= 3)) a = b = R.off;
      if (k === TV) { a = f % 2 ? R.tv : R.tvL; b = R.tvL; }
      put(x, y, a); put(x + 1, y, a); put(x, y + 1, b); put(x + 1, y + 1, b);
    }
    // rain: lines three long, five a frame (a 30-row loop = 6 frames), a pixel left every six rows, bright over the block
    for (let k = 0; k < 22; k++) {
      const x0 = GX0 + 2 + mod(k * 19 + (k >> 1), GX1 - GX0), y0 = mod(k * 7 + 5 * f, 30) - 6;
      for (let t = 0; t < 3; t++) { const y = y0 + t, x = x0 - Math.floor((y + 6) / 6);
        if (x >= GX0 && x <= GX1 && y >= GY0 && y <= GY1 && x !== MX && x !== MX + 1) put(x, y, x > 31 && y > 5 ? R.rainHi : R.rain); }
    }
    // beads on the glass and two drops sliding down, each leaving a trail
    for (const [x, y] of [[7, 5], [20, 8], [45, 3]]) { put(x, y, R.bead); put(x, y + 1, R.beadD); }
    for (const [x, ph] of [[13, 0], [49, 3]]) {
      const y = GY0 + mod(ph * 3 + f * 3, 18);
      for (let t = 1; t <= 3; t++) if (y - t >= GY0) put(x, y - t, R.sky[1]);
      put(x, y, R.bead); put(x, y + 1, R.beadD);
    }
    // the frame and the middle bar, lit on the candle's side
    for (let y = GY0; y <= GY1; y++) { put(MX, y, R.woodLit); put(MX + 1, y, R.wood); }
    for (let x = GX0 - 2; x <= GX1 + 2; x++) { put(x, GY0 - 1, R.wood); put(x, GY0 - 2, R.woodD); }
    for (let y = GY0 - 2; y <= GY1; y++) { put(GX0 - 1, y, R.woodLit); put(GX0 - 2, y, R.wood); put(GX1 + 1, y, R.wood); put(GX1 + 2, y, R.woodD); }
    // the sill, lit near the candle
    for (let x = 0; x < SW; x++) { put(x, 23, Math.abs(x - 9) < 9 ? R.woodHi : R.woodLit); put(x, 24, R.wood); put(x, 25, R.woodD); }
    // the cat, from behind, in front of the lit block; the candle rims its left side
    const CAT = ['.x...x.', '.xx.xx.', '.xxxxx.', '.xxxxx.', '..xxx..', '..xxxx.', '.xxxxx.', '.xxxxxx', 'xxxxxxx', 'xxxxxxx', 'xxxxxxx'];
    rimSprite(put, CAT.slice(0, 5), 37, 12, R.cat, R.catRim, -1);
    rimSprite(put, CAT.slice(5), 37, 17, R.cat, R.cat, -1);
    const TAIL = [[[44, 22], [45, 22], [46, 21], [47, 20]], [[44, 22], [45, 22], [46, 22], [47, 21]], [[44, 22], [45, 22], [46, 22], [47, 22]]][[0, 0, 1, 2, 2, 1][f]];
    for (const [x, y] of TAIL) put(x, y, R.cat);
    // the candle in its jar, the flame flickering, its light a soft ring on the glass
    for (const [dx, dy] of [[-2, -1], [2, -1], [-3, 1], [3, 1], [-1, -3], [1, -3]]) put(8 + dx, 19 + dy, R.glass);
    for (let y = 19; y <= 22; y++) for (let x = 6; x <= 10; x++) put(x, y, x === 6 || x === 10 ? R.jar : y > 20 ? R.wax : '#2a1a10');
    put(7, 19, R.jarHi);
    put(8 + [0, 0, 0, 1, 0, -1][f], [17, 17, 16, 17, 16, 17][f], R.fl2); put(8, 18, R.fl); put(8, 19, R.fl2);
    // the mug, steam in two wisps climbing a pixel a frame
    for (let y = 20; y <= 22; y++) for (let x = 15; x <= 17; x++) put(x, y, x === 17 ? R.mugD : R.mug);
    put(18, 21, R.mugD);
    for (let k = 0; k < 2; k++) { const s = mod(f + k * 3, 6); if (s < 5) put(16 + [0, 1, 1, 0, -1, -1][s], 19 - s, R.steam); }
  };
}

// ================================================================ 3 · CAMPFIRE (night, a clearing)
// The fire is the only light. The sky is lightest at the treeline so the pines read as shapes; everything the fire
// can see gets one rim of light on the side facing it (the tent, the traveller, the kettle), everything else is night.
// The flame is six hand-drawn frames (white core, gold, orange, red tips that break away), the light pool breathes by a
// pixel, embers climb and fade.
const C = {
  sky: ['#08081a', '#0c0c22', '#121230', '#1a1a3e', '#26264e'], star: '#d8d0f0', star2: '#5a5880', moon: '#f6e6c4',
  pine: '#06060e', ground: '#0b090c', g1: '#1c100c', g2: '#3e2112', g3: '#6a3618',
  stone: '#2e2626', stoneLit: '#a8704a', log: '#2e1a10', logLit: '#a05a28', ember: '#ffb040',
  fW: '#fff6dc', fY: '#ffd860', fO: '#ff9a30', fR: '#e0502a', fD: '#9a2a20',
  dark: '#07050a', man: '#1c1424', rim: '#f08a3a', rim2: '#8a4422', tent: '#140e0e',
};
const FLAME = [
  ['....R....', '....O....', '...ROR...', '...OYO.R.', '..ROYO.O.', '..OYYYOO.', '.ROYWYYOR', '.OYWWWYO.', 'ROYWWWYOR', 'OYWWWWWYO', '.OYWWWYO.'],
  ['.....R...', '....RO...', '....OO...', '...OYOR..', '.R.OYYO..', '.OROYWYOR', '.OYYWWYO.', 'ROYWWWYOR', 'OYYWWWYYO', 'OYWWWWWYO', '.OYWWWYO.'],
  ['...R.....', '...OR....', '..ROO..R.', '..OYO..O.', '..OYYOROR', '.ROYWYYO.', '.OYWWWYOR', 'ROYWWWYO.', 'OYWWWWWYO', 'OYWWWWWYO', '.OYWWWYO.'],
  ['....D....', '....R....', '...ROR...', '...OYO...', '..OYYOR..', '.ROYWYO..', '.OYWWYYOR', 'ROYWWWYO.', 'OYYWWWYYO', 'OYWWWWWYO', '.OYWWWYO.'],
  ['......R..', '.....RO..', '..R..OO..', '..O.OYOR.', '..OOYYO..', '.ROYWYYOR', '.OYYWWYO.', 'ROYWWWYOR', 'OYWWWWWYO', 'OYWWWWWYO', '.OYWWWYO.'],
  ['...R.....', '...OR....', '...OOR...', '..ROYO.R.', '..OYYO.O.', '.ROYWYOOR', '.OYWWWYO.', 'ROYWWWYOR', 'OYYWWWYYO', 'OYWWWWWYO', '.OYWWWYO.'],
];
/** A pine as stacked tiers: a stepped triangle with a little notch every few rows. */
function pineShape(put, px, base, h, col) {
  for (let y = 0; y < h; y++) { const w = Math.floor(y * 0.36) + (y % 3 === 2 ? 1 : 0); for (let x = -w; x <= w; x++) put(px + x, base - h + y, col); }
  put(px, base - h - 1, col);
}
export function campfire(f) {
  return (put) => {
    const FX = 24, FY = 24, br = [0, 1, 0, 0, 1, 0][f];
    for (let y = 0; y < 20; y++) for (let x = 0; x < SW; x++) put(x, y, C.sky[Math.min(4, Math.floor(y / 4))]);
    [[3, 2], [9, 6], [16, 1], [21, 4], [30, 2], [36, 7], [41, 3], [53, 6], [26, 8], [6, 10]].forEach(([x, y], i) => put(x, y, i === f || i === f + 5 ? C.star2 : C.star));
    for (const [x, y] of [[47, 2], [48, 1], [49, 1], [46, 3], [46, 4], [47, 5], [48, 6], [49, 6]]) put(x, y, C.moon);
    // the treeline: pines of many heights, one flat colour against the lighter sky
    for (const [x, h] of [[1, 13], [5, 10], [8, 15], [12, 9], [15, 12], [19, 8], [29, 7], [45, 12], [49, 16], [53, 11], [56, 14]]) pineShape(put, x, 20, h, C.pine);
    for (let x = 0; x < SW; x++) { put(x, 19, C.pine); put(x, 20, C.pine); }
    // the ground and the light pool: flat stepped ellipses that breathe
    for (let y = 21; y < SH; y++) for (let x = 0; x < SW; x++) {
      const d = Math.hypot((x - FX) / (2.6 + br * 0.15), (y - FY) * 1.0);
      put(x, y, d < 2.6 ? C.g3 : d < 4.6 ? C.g2 : d < 7 ? C.g1 : C.ground);
    }
    // the tent at the left, its face toward the fire lit
    const TENT = ['.....x.....', '....xxx....', '...xxxxx...', '...xx.xxx..', '..xx...xxx.', '.xx.....xxx', 'xxx.....xxx'];
    rimSprite(put, TENT, 3, 16, C.tent, C.rim2, 1);
    TENT.forEach((r, y) => [...r].forEach((c, x) => { if (c === '.' && y >= 3 && x > 1 && x < 9 && r.indexOf('x') < x && r.lastIndexOf('x') > x) put(3 + x, 16 + y, '#3a1a0a'); }));
    // the traveller on a log, facing the fire, rim-lit on the front
    const MAN = ['...xxx...', '..xxxxx..', '.xxxxxx..', '..xxxxxx.', '..xxxxxxx', 'xxxxxxxxx', '..xxxxxxx', '..xxxxxxx', 'xxxxxxxx.', 'x.....xx.', 'x.....xx.'];
    rimSprite(put, MAN, 32, 13, C.man, f % 3 === 1 ? '#ffb860' : C.rim, -1, C.rim2);
    for (let x = 32; x <= 43; x++) { put(x, 24, x < 35 ? C.logLit : C.log); put(x, 25, C.log); }
    // stones and logs
    for (const [x, y] of [[FX - 5, FY], [FX - 3, FY + 1], [FX + 3, FY + 1], [FX + 5, FY], [FX, FY + 2]]) { put(x, y, C.stoneLit); put(x + 1, y, C.stone); }
    for (let k = -3; k <= 3; k++) { put(FX + k, FY, C.logLit); put(FX + k, FY + 1, C.log); }
    // the flame
    FLAME[f].forEach((r, y) => [...r].forEach((c, x) => { const col = { W: C.fW, Y: C.fY, O: C.fO, R: C.fR, D: C.fD }[c]; if (col) put(FX - 4 + x, FY - 11 + y, col); }));
    // embers climb two a frame, drift, and go dark at the top
    for (const [x0, ph] of [[FX - 1, 0], [FX + 2, 2], [FX, 4]]) { const s = mod(f + ph, 6), y = FY - 12 - s * 2; put(x0 + [0, 1, 1, 0, -1, 0][s], y, s < 4 ? C.ember : C.fD); }
  };
}

// ================================================================ 4 · THE PIER AT DUSK (new)
// Why this one: it is the only still scene. Blue hour, the sun just gone, someone in a straw hat fishing off the end
// of a wooden pier under a hanging lantern. A cold world and one warm light, outdoors; water is where colour cycling
// shines (Ferrari's lakes), so the sea and the lantern's broken reflection shimmer while the bobber dips and sends one
// ring out. The fishing spot from every cosy game, and quiet enough to sit behind music.
const D = {
  sky: ['#181a36', '#1e2142', '#272a50', '#35325c', '#4a3a66', '#6a466a', '#94566a', '#c46e62', '#e8945e'],
  isl: '#3a3060', islHi: '#4a3a6a', win: '#ffc46a',
  sea: ['#5a3c64', '#2a2a52', '#22244a', '#1c1e40', '#171a38', '#131530'], sh1: '#7a4e6e', sh2: '#3a3a66', sh3: '#c46e62',
  wood: '#140e14', wood2: '#24181c', woodLit: '#8a5a32', man: '#0c0810', rim: '#ffb860', rim2: '#7a4a2a',
  lan: '#fff3d8', lan2: '#ffc46a', glow: '#4a3448', refl: '#ffc46a', refl2: '#9a6a3a', line: '#6a5a80', bob: '#ff6a4a', bobW: '#f6e6c4', star: '#c8c0e8', bird: '#141530',
};
const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
export function pier(f) {
  return (put) => {
    const HZ = 14, SKYROWS = [0, 0, 1, 1, 2, 2, 3, 3, 4, 5, 5, 6, 7, 8];
    for (let y = 0; y < HZ; y++) for (let x = 0; x < SW; x++) put(x, y, D.sky[SKYROWS[y]]);
    [[6, 1], [13, 3], [24, 1], [52, 2], [33, 2], [41, 4]].forEach(([x, y], i) => put(x, y, (i + f) % 6 === 0 ? D.sky[2] : D.star));
    // a far island, pale with distance, one window lit
    const isl = [1, 1, 2, 2, 3, 3, 3, 4, 4, 4, 3, 3, 2, 2, 2, 1, 1];
    isl.forEach((h, i) => { for (let y = HZ - h; y < HZ; y++) put(37 + i, y, y === HZ - h ? D.islHi : D.isl); });
    put(45, HZ - 2, D.win);
    // two birds heading home
    const bx = 12 + Math.floor(f / 2), flap = f % 2;
    for (const [x, y] of [[0, 0], [1, 1], [2, 0], [5, 2], [6, 3], [7, 2]]) put(bx + x, 5 + y - (flap && (x === 0 || x === 2 || x === 5 || x === 7) ? 1 : 0), D.bird);
    // the sea: the sky's warm band mirrored just under the horizon, then darker flat bands
    const SEAROWS = [0, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 5];
    for (let y = HZ; y < SH; y++) for (let x = 0; x < SW; x++) put(x, y, D.sea[SEAROWS[y - HZ]]);
    // shimmer: short dashes at scattered places per row, sliding a pixel a frame (rows alternate direction)
    for (let y = HZ + 1; y < SH; y++) {
      const dir = y % 2 ? 1 : -1, len = 1 + Math.floor((y - HZ) / 5);
      for (let k = 0; k < 4; k++) { const x = mod(Math.floor(hash(y, k) * SW) + dir * f, SW);
        for (let t = 0; t < (y < HZ + 3 ? 1 : len + (k % 2)); t++) put(mod(x + t, SW), y, y < HZ + 3 ? D.sh3 : y < HZ + 7 ? D.sh1 : D.sh2); }
    }
    if (f % 3 !== 2) put(45, HZ + 2, D.refl2);
    put(45 + (f % 2), HZ + 4, D.refl2);
    // the pier from the left: plank deck, posts, wobbling post reflections
    const DY = 18, END = 27;
    for (let x = 0; x <= END; x++) { put(x, DY, x % 4 === 3 ? D.wood : x > END - 7 ? D.woodLit : D.wood2); put(x, DY + 1, D.wood); }
    for (const px of [3, 13, 23]) {
      for (let y = DY + 2; y <= DY + 4; y++) { put(px, y, D.wood); put(px + 1, y, D.wood); }
      for (let y = DY + 5; y < SH; y += 2) put(px + (mod(y + f, 4) < 2 ? 0 : 1), y, D.wood2);
    }
    // the lantern on its post at the end
    for (let y = 16; y < DY; y++) { put(END + 1, y, D.wood); put(END + 2, y, D.wood); }
    for (const [x, y] of [[END, 14], [END + 3, 14], [END, 13], [END + 3, 13]]) put(x, y, D.glow);
    put(END + 1, 13, D.lan); put(END + 2, 13, D.lan2); put(END + 1, 14, f % 3 === 1 ? D.lan2 : D.lan); put(END + 2, 14, D.lan2);
    put(END + 1, 15, D.wood); put(END + 2, 15, D.wood); put(END + 1, 12, D.wood); put(END + 2, 12, D.wood);
    // its broken reflection, shimmering
    for (let y = DY + 2; y < SH; y++) {
      if (mod(y + f, 3) === 0) continue;
      const w = 1 + Math.floor((y - DY) / 4), off = [0, 1, 0, -1, 0, 1][mod(y + f, 6)];
      for (let k = 0; k < w; k++) put(END + 2 + off + k - (w >> 1), y, y < DY + 6 ? D.refl : D.refl2);
    }
    // the fisher in a straw hat, sitting at the end, legs over the edge; the lantern rims the right side
    const MAN = ['..xxx..', 'xxxxxxx', '..xxx..', '..xxxx.', '.xxxxxx', '.xxxxx.', '.xxxxx.', 'xxxxxxx'];
    rimSprite(put, MAN, 18, DY - 8, D.man, D.rim, 1);
    for (let y = DY + 1; y <= DY + 3; y++) { put(23, y, D.man); put(24, y, y === DY + 3 ? D.man : D.rim2); }
    // the rod, the line, the bobber dipping and a ring going out
    const hand = [24, DY - 5], tip = [46, 4];
    for (let i = 0; i <= 24; i++) { const t = i / 24; put(Math.round(hand[0] + (tip[0] - hand[0]) * t), Math.round(hand[1] + (tip[1] - hand[1]) * t - Math.sin(t * Math.PI) * 1.5), D.man); }
    const bobY = 23 + [0, 0, 1, 1, 0, 0][f];
    for (let y = tip[1] + 1; y < bobY - 1; y++) put(tip[0], y, D.line);
    put(tip[0], bobY - 1, D.bobW); put(tip[0], bobY, D.bob);
    const ring = [0, 0, 1, 2, 3, 4][f];
    if (ring) for (const dx of [-ring - 1, ring + 1]) put(tip[0] + dx, 24, ring > 3 ? D.sh2 : D.sh1);
  };
}

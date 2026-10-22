// Sheet 59 v3 (2026-10-22): the two boulevard scenes for the player's screen, 56 x 30 art pixels, 4 frames each.
// Hand-placed pixels from one sunset palette (his plum, gold and ember), dithered with a 4x4 Bayer grid, never smoothed.
// The sun sits ahead of us, so everything near is a silhouette with a warm rim. Mockup art only.
export const SW = 56, SH = 30;

// ---- one palette for both scenes
const SKY = ['#1a1230', '#22163a', '#2e1c46', '#40224f', '#562a58', '#70325e', '#8c3c5e', '#a8485c', '#c4585a', '#da6c52', '#ea844c', '#f49e4c', '#fbb854', '#ffcd6c'];
const SUN = ['#fff3d8', '#ffe8b0', '#ffdc8a', '#ffcc66', '#ffb84e', '#ffa244', '#f88a40', '#ee7444', '#e0604a'];
const HAZE = '#6a2f5c', CITY = '#4c2252', CITY2 = '#3a1a46', LIT = '#ffc46a';
const SIL = '#1c0f22', SIL2 = '#2a1632', RIM = '#ffb860', RIM2 = '#e07a4a';
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
const dith = (x, y, t) => (BAYER[y & 3][x & 3] + 0.5) / 16 < t;
/** A colour from a ramp at 0..1, stepped with the Bayer grid between neighbours (no in-between colours). */
function ramp(cols, t, x, y) {
  const v = Math.max(0, Math.min(0.9999, t)) * (cols.length - 1), i = Math.floor(v);
  return dith(x, y, v - i) && i + 1 < cols.length ? cols[i + 1] : cols[i];
}
const mod = (a, n) => ((a % n) + n) % n;

/** The sky with a big low sun, three gaps cut across its lower half (2, 1 and 1 rows of sky, widening downward). */
function skyAndSun(put, { hy, sx, sy, r, top = 0 }) {
  for (let y = top; y < hy; y++) for (let x = 0; x < SW; x++) {
    const d = Math.hypot(x + 0.5 - sx, (y + 0.5 - sy));
    let t = (y - top) / (hy - top);
    if (d < r + 5) t += (1 - (d - r) / 5) * 0.12;          // a little warmth round the sun
    put(x, y, ramp(SKY, t, x, y));
  }
  const cy = Math.floor(sy), GAPS = new Set([cy + 1, cy + 3, cy + 4]);
  for (let y = Math.floor(sy - r); y < hy; y++) for (let x = Math.floor(sx - r); x <= sx + r; x++) {
    const dx = x + 0.5 - sx, dy = y + 0.5 - sy;
    if (dx * dx + dy * dy > r * r) continue;
    if (GAPS.has(y)) { put(x, y, '#b8505a'); continue; }
    put(x, y, SUN[Math.min(SUN.length - 1, Math.floor((y - (sy - r)) / (2 * r) * SUN.length))]);
  }
}
/** Low hills along the horizon in two tones, the near ones with a few windows lit. */
function hills(put, hy, shift, f) {
  for (let x = 0; x < SW; x++) {
    const wx = x + shift;
    const far = Math.round(2.5 + 1.6 * Math.sin(wx * 0.19) + 0.9 * Math.sin(wx * 0.47 + 1));
    const near = Math.round(1.2 + 1.2 * Math.sin(wx * 0.13 + 2) + 0.6 * Math.sin(wx * 0.61));
    for (let y = hy - far; y <= hy; y++) put(x, y, y === hy - far ? '#7a3660' : HAZE);
    for (let y = hy - near; y <= hy; y++) put(x, y, CITY);
    if (near >= 1 && mod(wx * 7, 13) === 0) put(x, hy - near + 1, (wx + f) % 5 ? LIT : '#c98a4a');
  }
}

// ---------------------------------------------------------------- 1 · DRIVING DOWN THE BOULEVARD (from behind)
const HY = 14, VX = 28;
const hwOf = (d) => d * 1.72;                 // the road's half width, d rows under the horizon
const CAR = [
  '....hh.......hh......',
  '...hhhh.....hhhhLL...',
  '...hhhh.....hhhhLLL..',
  '.GGsssssGGGGsssssGGG.',
  '.rRRRRRRRRRRRRRRRRRr.',
  'rbbbbbbbbbbbbbbbbbbbr',
  'rTTTTbbbbbbbbbbbTTTTr',
  'rbbbbbbbbpppbbbbbbbbr',
  'cCCCCCCCCCCCCCCCCCCCc',
  '.KKK.............KKK.',
];
const CARPAL = { s: '#170b12', h: '#170b12', L: '#3a1820', w: '#2a1218', G: '#f6c08a', r: '#7a2a34', R: '#b85450', b: '#4a1824', T: '#ff5a3a', p: '#e9d3a6', c: '#3a2a38', C: '#b88a8a', K: '#0e0709' };

/** A palm as a silhouette, h pixels tall, leaning away from the road (lean = -1 left, +1 right). */
function palm(put, bx, by, h, lean, col, rim = null) {
  if (h < 2) { put(bx, by, col); return; }
  const th = Math.max(1, Math.round(h / 13)), top = by - Math.round(h * 0.82);
  let cx = bx, cy = top;
  for (let y = by; y >= top; y--) {
    const t = (by - y) / (by - top), x = Math.round(bx + lean * t * t * h * 0.14);
    for (let k = 0; k < th; k++) put(x + k, y, col);
    if (rim && th > 1 && (by - y) % 3 !== 0) put(x + th - 1 + (lean > 0 ? 0 : 0), y, rim);
    cx = x + (th >> 1); cy = y;
  }
  const L = Math.max(2, h * 0.36);
  // fronds: angle in degrees from the right, how far they droop
  const FR = [[18, 1.1], [52, 0.8], [90, 0.25], [128, 0.8], [162, 1.1], [198, 1.5], [-18, 1.5]];
  for (const [a, droop] of FR) {
    const ca = Math.cos(a * Math.PI / 180), sa = Math.sin(a * Math.PI / 180), n = Math.ceil(L * 1.3);
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = Math.round(cx + ca * L * t), y = Math.round(cy - sa * L * t * 0.75 + droop * t * t * L * 0.55);
      put(x, y, col);
      if (h > 14 && t > 0.1 && t < 0.6) put(x, y + 1, col);
      if (h > 24 && t > 0.1 && t < 0.35) put(x, y - 1, col);      // big palms get thick leaves
    }
  }
  put(cx, cy, col); put(cx - 1, cy, col); put(cx + 1, cy, col);
}
/** A streetlight, h tall, its arm reaching over the road, the lamp lit (a head pixel or two and a soft four-pixel glow). */
function lamp(put, bx, by, h, toRoad, col) {
  const top = by - Math.round(h);
  for (let y = by; y >= top; y--) put(bx, y, col);
  const arm = Math.max(1, Math.round(h * 0.2));
  for (let i = 1; i <= arm; i++) put(bx + toRoad * i, top, col);
  const lx = bx + toRoad * arm, ly = top + 1;
  if (h > 8) for (const [dx, dy] of [[-1, 0], [1, 0], [0, 1], [0, 2]]) put(lx + dx, ly + dy, '#ffc46a', dy === 2 ? 0.3 : 0.55);
  if (h > 16) for (const [dx, dy] of [[-2, 1], [2, 1], [-1, 2], [1, 2], [0, 3]]) put(lx + dx, ly + dy, '#ffc46a', 0.25);
  put(lx, ly, '#fff3d8'); if (h > 16) put(lx + toRoad, ly, '#ffe096');
}
/** Small palms are hand-drawn crowns on a stick; big ones grow fronds (palm above). */
const CROWN = {
  s: ['x.x', '.x.'],
  m: ['.x.x.', 'xxxxx', 'x.x.x'],
  l: ['..xx.xx..', '.xxxxxxx.', 'xx..x..xx', 'x..x.x..x'],
};
function smallPalm(put, bx, by, h, lean, col) {
  const c = h < 4 ? CROWN.s : h < 7 ? CROWN.m : CROWN.l, top = by - Math.round(h * 0.8);
  for (let y = by; y >= top; y--) put(bx + (h > 6 && (by - y) > h * 0.55 ? lean : 0), y, col);
  const tx = bx + (h > 6 ? lean : 0) - (c[0].length >> 1);
  c.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === 'x') put(tx + x, top - 1 + y, col); }));
}

export function drive(f) {
  return (put) => {
    skyAndSun(put, { hy: HY + 1, sx: 28, sy: 9, r: 8 });
    hills(put, HY, 0, f);
    // the ground and the road, one row at a time: flat bands, Bayer steps only where two bands meet
    for (let y = HY + 1; y < SH; y++) {
      const d = y - HY, hw = hwOf(d), sw = Math.max(1, d * 0.42), z = 24 / d;
      for (let x = 0; x < SW; x++) {
        const dx = x + 0.5 - VX, ax = Math.abs(dx);
        let col;
        if (ax < hw) {
          col = ramp(['#7a3560', '#4a2448', '#34193a', '#2a1530', '#241229'], d / 15, x, y);
          if (d <= 5 && ax < 2.2 - d * 0.3) col = d < 3 ? '#e0604a' : '#a8485c';  // the sun's sheen on the road, near the horizon only
          if (ax > hw - 1) col = '#c98a6a';                                   // the edge line, warm
          if (ax < 0.6 && mod(z + f * 0.5, 2) < 1) col = d > 8 ? '#e9b070' : '#ffd38a'; // the centre dashes, coming at us
        } else if (ax < hw + sw) col = ax < hw + 1 ? '#8a4458' : '#46203f';   // kerb, pavement
        else col = d < 6 ? '#2e1636' : '#221028';                             // verges
        put(x, y, col);
      }
    }
    // palms and streetlights both sides, alternating: one every unit of depth, rolling 0.5 a frame (loops in 4 frames)
    const things = [];
    for (let k = 0; k < 12; k++) {
      const z = k + 0.3 - f * 0.5;
      things.push({ z, side: k % 2 ? -1 : 1, kind: 'palm' }, { z, side: k % 2 ? 1 : -1, kind: 'lamp' });
    }
    things.filter((t) => t.z > 1.25 && t.z < 10).sort((a, b) => b.z - a.z).forEach(({ z, side, kind }) => {
      const d = 24 / z, by = Math.round(HY + d), x = Math.round(VX + side * (hwOf(d) + Math.max(1, d * 0.42) * 0.7));
      const col = z > 6 ? '#331a3c' : z > 3.5 ? SIL2 : SIL;
      if (kind === 'palm') { const h = d * 2.3; if (h < 11) smallPalm(put, x, by, h, side, col); else palm(put, x, by, h, side, col); }
      else lamp(put, x, by, d * 1.6, -side, col);
    });
    // our car, right lane, a one-pixel bump on frame 3
    const bob = f === 2 ? 1 : 0, cx = 30, cy = 19 + bob;
    for (let x = cx + 1; x < cx + 20; x++) { put(x, 29, '#0e0709', 0.7); put(x, 28, '#0e0709', 0.35); }
    // taillights paint the road
    for (const tx of [cx + 2, cx + 18]) for (let y = 27; y < SH; y++) for (let x = tx - 3; x <= tx + 3; x++) if (dith(x, y, 0.35 - Math.abs(x - tx) * 0.08)) put(x, y, '#ff5a3a', 0.6);
    CAR.forEach((row, y) => [...row].forEach((c, x) => {
      let col = CARPAL[c]; if (!col) return;
      if (c === 'L' && (x + y + f) % 2 === 0) return;                         // her hair flutters
      if (c === 'G' && (x + f) % 6 === 0) col = '#ffe8b0';                     // the windscreen glints
      put(cx + x, cy + y, col);
    }));
  };
}

// ---------------------------------------------------------------- 2 · SKATING DOWN THE BOULEVARD (from the side)
// Four layers sliding left at 1, 2, 3 and 4 pixels a frame; the skater pushes once over the loop.
const SK = [
  // frame 1: rolling, both feet on, knees soft, arms loose
  ['.....hhh....', '....hhhhhh..', '....hhhh....', '.....hh.....', '....cccc....', '...cccccc...', '..c.cccc.c..', '.c..cccc..c.', '....cccc....', '....jj.jj...', '...jj...jj..', '...j.....j..', '..jj.....jj.', '.BBBBBBBBBBB', '..w......w..'],
  // frame 2: the back foot lifts off, he leans in
  ['......hhh...', '.....hhhhhh.', '.....hhhh...', '......hh....', '.....cccc...', '....cccccc..', '...c.cccc.c.', '..c..cccc...', '.....cccc...', '....jj.jj...', '...jj...jj..', '..jj.....j..', '..j......jj.', '.BBBBBBBBBBB', '..w......w..'],
  // frame 3: the push, the back foot on the ground behind the board
  ['......hhh...', '.....hhhhhh.', '.....hhhh...', '......hh....', '.....cccc...', '....cccccc..', '...c.cccc.c.', '..c..cccc...', '.....cccc...', '....jj.jj...', '...jj...jj..', '..jj.....j..', '.jj......jj.', 'jjBBBBBBBBBB', 'j.w......w..'],
  // frame 4: the foot swings back up
  ['.....hhh....', '....hhhhhh..', '....hhhh....', '.....hh.....', '....cccc....', '...cccccc...', '..c.cccc.c..', '.c..cccc..c.', '....cccc....', '...jj..jj...', '..jj....jj..', '..j......j..', '..jj.....jj.', '.BBBBBBBBBBB', '..w......w..'],
];
const SKPAL = { h: '#150a12', c: '#24102a', j: '#150a1e', B: '#7a3a1c', w: '#e9d3a6' };

export function skate(f) {
  return (put) => {
    skyAndSun(put, { hy: 20, sx: 38, sy: 11, r: 8 });
    // layer 1, the far hills and town: one pixel a frame
    hills(put, 19, f, f);
    // layer 2, the far side of the street: a low wall and small palms, two pixels a frame
    for (let x = 0; x < SW; x++) put(x, 20, CITY2);
    for (let k = -1; k < 4; k++) { const x = mod(k * 22 + 4 - 2 * f, 88) - 10; smallPalm(put, x, 20, 9, 0, CITY2); }
    // the road: flat bands, the sun's sheen under it, the centre line sliding three pixels a frame
    for (let y = 21; y < 25; y++) for (let x = 0; x < SW; x++) {
      let col = ['#5a2a50', '#3e1e40', '#301834', '#2a1530'][y - 21];
      const ax = Math.abs(x + 0.5 - 39);
      if (ax < 6 - (y - 21) * 1.5) col = y === 21 ? '#f49e4c' : y === 22 ? '#c4585a' : '#8c3c5e';
      put(x, y, col);
    }
    for (let x = 0; x < SW; x++) if (mod(x + 3 * f, 12) < 6) put(x, 23, '#c98a6a');
    // the near pavement, its kerb lit warm, slab joints four pixels a frame
    for (let y = 25; y < SH; y++) for (let x = 0; x < SW; x++) {
      let col = y === 25 ? '#b86a5a' : y === 26 ? '#5a2a4e' : y < 28 ? '#4a2244' : '#3c1c38';
      if (y > 26 && mod(x + 4 * f, 16) === 0) col = '#2a1228';
      put(x, y, col);
    }
    // layer 3, the near side: one tall palm and one streetlight in each 48 px, three pixels a frame (behind the skater)
    for (let k = -1; k < 3; k++) {
      palm(put, mod(k * 48 + 40 - 3 * f, 96) - 20, 26, 26, 0, SIL);
      lamp(put, mod(k * 48 + 16 - 3 * f, 96) - 20, 26, 20, 1, SIL);
    }
    // the skater, the sun ahead of him: a silhouette, the gold rim only on his front (cap, face, chest)
    const sx = 14, sy = 11, S = SK[f];
    for (let x = sx + 1; x < sx + 12; x++) put(x, 26, '#1a0c18', 0.55);
    S.forEach((row, y) => [...row].forEach((c, x) => {
      let col = SKPAL[c]; if (!col) return;
      const right = row[x + 1];
      if (y < 6 && 'hc'.includes(c) && (!right || right === '.')) col = y < 4 ? RIM : RIM2;
      if (c === 'B' && x > 8) col = '#b8643a';
      put(sx + x, sy + y, col);
    }));
  };
}

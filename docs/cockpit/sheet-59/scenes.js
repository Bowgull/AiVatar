// Sheet 59 v5 (2026-10-22): the four scenes for the player's ONE picture spot (his note: "shouldn't it just be one?").
// The cover's square well is the only picture: the cover by default, the scene cross-fading in over it in SCENE mode.
// So every scene is now square, 34 x 34 art pixels, exactly the cover's size. 8 drawn frames each (f), plus a running
// tick (t) for the slow things that must never visibly repeat (parallax, mist, fireflies, the wait between casts).
// His notes on v4: the campfire as a dark fantasy forest in Waymark's language; the skater a Black man; the fourth
// scene a Caribbean sunset fishing spot; everything moving. Rules kept from the pixel-loop masters (Waneella,
// Kirokaze, Mark Ferrari), applied not copied: a small palette per scene, ONE light source, figures rimmed on the side
// that faces it, light as flat bands (no noisy dither), 2-4 pixel secondary motions layered over a calm picture.
// Mockup art only.
export const SW = 34, SH = 34;
const mod = (a, n) => ((a % n) + n) % n;
const TAU = Math.PI * 2;
const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function line(a, b, cb) { let [x0, y0] = a; const [x1, y1] = b, dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let e = dx + dy;
  for (;;) { cb(x0, y0); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } } }
const poly = (pts, cb) => { for (let i = 1; i < pts.length; i++) line(pts[i - 1], pts[i], cb); };
/** Paint a string map: each character looks up a colour in pal ('.' and unknown = nothing). */
const stamp = (put, rows, ox, oy, pal) => rows.forEach((r, y) => [...r].forEach((c, x) => { const col = pal[c]; if (col) put(ox + x, oy + y, col); }));

// ================================================================ 1 · SKATING THE BOULEVARD (side view, sunset)
// The boulevard he liked, squared: banded sunset sky, the striped sun, a far town, palms. The street slides in four
// layers at four speeds. The skater is redrawn as a Black man: deep brown skin in three tones (lit by the sun ahead
// of him, a shadow tone under the jaw), short locs falling out the back of a plum cap, cream hoodie, denim, white
// shoes. He pushes once (lift, plant, push, push off, recover, step on) and then rides, so the loop is 8 drawn frames
// of push and a ride while the street keeps moving.
const SKY = ['#1a1230', '#22163a', '#2e1c46', '#40224f', '#562a58', '#70325e', '#8c3c5e', '#a8485c', '#c4585a', '#da6c52', '#ea844c', '#f49e4c', '#fbb854', '#ffcd6c'];
const SUN = ['#fff3d8', '#ffe8b0', '#ffdc8a', '#ffcc66', '#ffb84e', '#ffa244', '#f88a40'];
const HAZE = '#6a2f5c', CITY = '#4c2252', CITY2 = '#3a1a46', LIT = '#ffc46a', SIL = '#1c0f22';
const SKC = {
  c: '#3a2a5e', C: '#5e4a8e', b: '#221838',                         // cap, its lit top, the brim
  l: '#140a06', L: '#3a2414',                                       // locs, their lit twists
  s: '#6a3a20', S: '#9a5a30', d: '#43220f', e: '#120806', R: '#d88a4c', // skin: mid, lit, shadow; the eye; the sun's rim
  h: '#ead2ae', H: '#fff2d8', k: '#b8977a', K: '#8a6c58',           // hoodie: base, lit, shade, far side
  j: '#3c4c90', J: '#5a6cb4', n: '#29346c',                         // jeans, lit, the far leg
  o: '#f6eee2', O: '#a49c9c', D: '#7a3a1c', E: '#c06a34', w: '#ffe0a0', g: '#2a1a26',
};
const HEAD = ['.ccc..', 'cccCbb', 'lsSeR.', 'lsSSSR', 'LdsSd.', 'l.....'];   // at x 5: cap, locs out the back, profile to the right
const TORSO = ['kkhhH.', 'kkhhHH', '.khhHH', '.khhhH', '.njjjJ'];  // at x 5, rows 5-9; the hood bump behind the neck
// per pose: body shift (dx, dy), far arm and near arm (shoulder > elbow > hand), the pushing leg (hip > knee > foot),
// the standing leg's knee, and whether the pushing foot is on the deck
const POSES = [
  { dx: 0, dy: 0, far: [[6, 6], [5, 8], [4, 9]], near: [[8, 6], [10, 8], [11, 9]], back: [[6, 10], [5, 12], [4, 14]], knee: [10, 12], on: true },  // ride
  { dx: 0, dy: 0, far: [[6, 6], [5, 8], [4, 9]], near: [[8, 6], [10, 8], [11, 8]], back: [[6, 10], [5, 12], [5, 13]], knee: [10, 12], on: false }, // lift
  { dx: 1, dy: 1, far: [[7, 7], [6, 9], [6, 10]], near: [[9, 7], [10, 9], [11, 10]], back: [[7, 11], [7, 13], [7, 16]], knee: [11, 13], on: false }, // plant
  { dx: 1, dy: 1, far: [[7, 7], [9, 8], [10, 9]], near: [[9, 7], [8, 9], [7, 10]], back: [[7, 11], [5, 13], [4, 16]], knee: [11, 13], on: false },  // push
  { dx: 1, dy: 1, far: [[7, 7], [9, 8], [11, 8]], near: [[9, 7], [7, 9], [6, 10]], back: [[7, 11], [4, 13], [1, 15]], knee: [11, 13], on: false },  // push off
  { dx: 1, dy: 0, far: [[7, 6], [8, 8], [9, 9]], near: [[9, 6], [8, 8], [8, 10]], back: [[7, 10], [4, 12], [2, 13]], knee: [10, 12], on: false },  // recover
  { dx: 0, dy: 0, far: [[6, 6], [6, 8], [5, 9]], near: [[8, 6], [9, 8], [10, 9]], back: [[6, 10], [5, 12], [4, 13]], knee: [10, 12], on: false },  // swing in
  { dx: 0, dy: 0, far: [[6, 6], [5, 8], [4, 9]], near: [[8, 6], [10, 8], [11, 9]], back: [[6, 10], [5, 12], [4, 14]], knee: [10, 12], on: true },  // step on
];
function drawSkater(put, ox, oy, pose) {
  const P = POSES[pose], q = (x, y, c) => put(ox + x, oy + y, SKC[c]);
  const sh = ([x, y]) => [x + P.dx, y + P.dy];
  for (let x = 2; x <= 12; x++) q(x, 15, x > 8 ? 'E' : 'D');
  q(1, 14, 'D'); q(13, 14, 'E'); q(3, 16, 'w'); q(4, 16, 'g'); q(10, 16, 'w'); q(11, 16, 'g');
  const fa = P.far.map(sh); poly(fa, (x, y) => q(x, y, 'K')); q(...fa[2], 'd');
  const bk = P.back.map((p, i) => (i === 0 ? sh(p) : p));
  poly(bk, (x, y) => { q(x, y, 'n'); q(x + 1, y, 'n'); });
  const [fx, fy] = bk[2]; q(fx, fy, 'o'); q(fx + 1, fy, 'O'); if (fy >= 15 || !P.on) q(fx - 1, fy, 'o');
  poly([sh([8, 10]), P.knee, [10, 14]], (x, y) => { q(x, y, 'j'); q(x + 1, y, 'J'); });
  q(10, 14, 'o'); q(11, 14, 'o'); q(12, 14, 'O');
  stamp(put, TORSO, ox + 5 + P.dx, oy + 5 + P.dy, SKC);
  stamp(put, HEAD, ox + 5 + P.dx, oy + P.dy, SKC);
  const na = P.near.map(sh); poly(na, (x, y) => q(x, y, 'k')); q(...na[2], 'S');
}
function skyBands(put, top, hy) {
  for (let y = top; y < hy; y++) for (let x = 0; x < SW; x++) {
    const v = (y - top) / (hy - top) * (SKY.length - 1), i = Math.floor(v), fr = v - i;
    put(x, y, fr > 0.8 && (x + y) % 2 === 0 && i + 1 < SKY.length ? SKY[i + 1] : SKY[i]);
  }
}
const PALM = ['..xx...xxx..', 'xxxxx.xxxxxx', 'x...xxxx...x', '...xxxxxx...', '..x..xx.x...', '..x..x.x.x..', '.....x.x....'];
function bigPalm(put, bx, by, sway) {
  for (let y = by; y > by - 19; y--) { const k = Math.round(Math.pow((by - y) / 19, 2) * 2); put(bx + k, y, SIL); put(bx + k + 1, y, SIL); }
  PALM.forEach((r, y) => [...r].forEach((c, x) => { if (c === 'x') put(bx - 3 + x + (y > 3 ? sway : 0), by - 21 + y, SIL); }));
}
function lampPost(put, bx, by) {
  for (let y = by; y >= by - 17; y--) put(bx, y, SIL);
  for (let i = 1; i <= 3; i++) put(bx + i, by - 17, SIL);
  put(bx + 3, by - 16, '#fff3d8'); put(bx + 2, by - 16, '#ffc46a'); put(bx + 4, by - 16, '#ffc46a');
}
export function skate(f, t = f) {
  return (put) => {
    const HY = 21;
    skyBands(put, 0, HY);
    const sx = 23, sy = 12, r = 7;
    for (let y = sy - r; y <= sy + r; y++) for (let x = sx - r; x <= sx + r; x++) {
      const dx = x + 0.5 - sx, dy = y + 0.5 - sy; if (dx * dx + dy * dy > r * r) continue;
      put(x, y, [sy + 2, sy + 4, sy + 5].includes(y) ? '#c4585a' : SUN[Math.min(SUN.length - 1, Math.floor((y - sy + r) / (2 * r) * SUN.length))]);
    }
    const hs = Math.floor(t / 2);
    for (let x = 0; x < SW; x++) {
      const wx = x + hs, far = Math.round(2.5 + 1.6 * Math.sin(wx * TAU * 3 / 102) + 0.9 * Math.sin(wx * TAU * 8 / 102 + 1));
      const near = Math.round(1.2 + 1.2 * Math.sin(wx * TAU * 2 / 102 + 2) + 0.6 * Math.sin(wx * TAU * 11 / 102));
      for (let y = HY - far; y <= HY; y++) put(x, y, y === HY - far ? '#7a3660' : HAZE);
      for (let y = HY - near; y <= HY; y++) put(x, y, CITY);
      if (near >= 1 && mod(wx * 7, 13) === 0) put(x, HY - near + 1, LIT);
    }
    for (let k = 0; k < 3; k++) { const bx = mod(k * 17 + 6 - t, 51) - 8, top = HY - 7;
      for (let y = HY; y >= top; y--) put(bx, y, CITY2);
      for (const [dx, dy] of [[-2, 0], [-1, -1], [0, -1], [1, -1], [2, 0], [-1, 0], [1, 0]]) put(bx + dx, top + dy, CITY2); }
    for (let y = HY + 1; y < HY + 6; y++) for (let x = 0; x < SW; x++) {
      let col = ['#5a2a50', '#44203f', '#361a3a', '#2e1634', '#2a1530'][y - HY - 1];
      if (Math.abs(x + 0.5 - sx) < 6 - (y - HY - 1) * 1.4) col = ['#f49e4c', '#c4585a', '#8c3c5e', '#6a3058', '#5a2a50'][y - HY - 1];
      put(x, y, col);
    }
    for (let x = 0; x < SW; x++) if (mod(x + 2 * t, 10) < 5) put(x, HY + 4, '#c98a6a');
    for (let y = HY + 6; y < SH; y++) for (let x = 0; x < SW; x++) {
      let col = y === HY + 6 ? '#b86a5a' : y === HY + 7 ? '#5a2a4e' : y < HY + 10 ? '#4a2244' : '#3c1c38';
      if (y > HY + 7 && mod(x + 3 * t, 14) === 0) col = '#2a1228';
      put(x, y, col);
    }
    const pose = mod(t, 16) < 8 ? mod(t, 8) : 0, ox = 6, oy = 14;
    for (let x = ox - 4; x < ox + 13; x++) put(x, oy + 17, '#2a1228');
    drawSkater(put, ox, oy, pose);
    const sway = mod(Math.floor(t / 4), 4) === 1 ? 1 : 0;
    for (let k = -1; k < 2; k++) { bigPalm(put, mod(k * 102 + 70 - 3 * t, 102) - 14, SH - 4, sway); lampPost(put, mod(k * 102 + 20 - 3 * t, 102) - 14, SH - 4); }
  };
}

// ================================================================ 2 · RAIN ON THE WINDOW (night, inside)
// Squared from v4 (he kept it): across the wet street a block of flats with amber windows (one a blue TV), the cat on
// our sill right in front of them so it reads, a candle in a jar rimming the cat's near side, cold rain streaks
// (brighter over the lit block), drops sliding down the glass, a swinging tail, steam off the mug, one window going
// dark halfway.
const R = {
  wall: '#120c09', wood: '#2e1c10', woodD: '#1c1009', woodLit: '#7a4e2a', woodHi: '#c88a4a',
  sky: ['#0c1122', '#10182c', '#152036', '#1b2a44'], far: '#0e1426', blk: '#161d33', blkD: '#10162a', roof: '#0a0e1c',
  win: '#ffc46a', winL: '#c98a3a', off: '#1f2740', tv: '#6ab8c8', tvL: '#3a7a90',
  rain: '#2a3a62', rainHi: '#a8bce0', bead: '#8fa4d8', beadD: '#070a14',
  cat: '#06040a', catRim: '#7a4e2c', jar: '#4a3a30', jarHi: '#a08a70', wax: '#f6e6c4', fl: '#fff3d8', fl2: '#ffc46a', glass: '#1a1a26',
  mug: '#c9a888', mugD: '#7a6050', steam: '#3a3a4a', floor: '#0c0806',
};
export function rain(f, t = f) {
  return (put) => {
    const GX0 = 2, GX1 = 31, GY0 = 2, GY1 = 24, MX = 13;
    for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) put(x, y, y > 28 ? R.floor : R.wall);
    for (let y = GY0; y <= GY1; y++) for (let x = GX0; x <= GX1; x++) put(x, y, R.sky[Math.min(3, Math.floor((y - GY0) / 6))]);
    const far = [3, 3, 5, 5, 5, 2, 2, 6, 6, 6, 4, 4];
    for (let x = GX0; x < 16; x++) for (let y = 19 - far[(x - GX0) % far.length]; y <= GY1; y++) put(x, y, R.far);
    for (let y = 6; y <= GY1; y++) for (let x = 16; x <= GX1; x++) put(x, y, x === 16 ? R.blkD : R.blk);
    for (let x = 15; x <= GX1; x++) put(x, 5, R.roof);
    const OFF = new Set(['0,2', '2,3']), DARK = '1,0', TV = '2,1';
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      const x = 18 + c * 4, y = 8 + r * 4, k = `${c},${r}`;
      let a = R.win, b = R.winL;
      if (OFF.has(k) || (k === DARK && mod(t, 16) >= 8)) a = b = R.off;
      if (k === TV) { a = mod(t, 3) ? R.tv : R.tvL; b = R.tvL; }
      put(x, y, a); put(x + 1, y, a); put(x, y + 1, b); put(x + 1, y + 1, b);
    }
    for (let k = 0; k < 16; k++) {
      const x0 = GX0 + 2 + mod(k * 11 + (k >> 1) * 3, GX1 - GX0), y0 = mod(k * 7 + 4 * t, 32) - 5;
      for (let s = 0; s < 3; s++) { const y = y0 + s, x = x0 - Math.floor((y + 5) / 5);
        if (x >= GX0 && x <= GX1 && y >= GY0 && y <= GY1 && x !== MX && x !== MX + 1) put(x, y, x > 16 && y > 6 ? R.rainHi : R.rain); }
    }
    for (const [x, y] of [[5, 6], [10, 12], [28, 3]]) { put(x, y, R.bead); put(x, y + 1, R.beadD); }
    for (const [x, ph] of [[7, 0], [30, 9]]) {
      const y = GY0 + mod(ph + t * 2, 22);
      for (let s = 1; s <= 3; s++) if (y - s >= GY0) put(x, y - s, R.sky[1]);
      put(x, y, R.bead); put(x, y + 1, R.beadD);
    }
    for (let y = GY0; y <= GY1; y++) { put(MX, y, R.woodLit); put(MX + 1, y, R.wood); }
    for (let x = GX0 - 2; x <= GX1 + 2; x++) { put(x, GY0 - 1, R.wood); put(x, GY0 - 2, R.woodD); }
    for (let y = GY0 - 2; y <= GY1; y++) { put(GX0 - 1, y, R.woodLit); put(GX0 - 2, y, R.wood); put(GX1 + 1, y, R.wood); put(GX1 + 2, y, R.woodD); }
    for (let x = 0; x < SW; x++) { put(x, 25, Math.abs(x - 6) < 6 ? R.woodHi : R.woodLit); put(x, 26, R.wood); put(x, 27, R.woodD); put(x, 28, R.woodD); }
    const CAT = ['.x...x.', '.xx.xx.', '.xxxxx.', '.xxxxx.', '..xxx..', '..xxxx.', '.xxxxx.', '.xxxxxx', 'xxxxxxx', 'xxxxxxx', 'xxxxxxx'];
    CAT.forEach((r, y) => [...r].forEach((c, x) => { if (c !== 'x') return; const edge = x === 0 || r[x - 1] !== 'x'; put(20 + x, 14 + y, edge && y > 1 ? R.catRim : R.cat); }));
    const TAILS = [[[27, 24], [28, 25], [29, 26], [29, 27]], [[27, 24], [28, 25], [28, 26], [28, 27]], [[27, 24], [27, 25], [27, 26], [28, 27]]];
    for (const [x, y] of TAILS[[0, 0, 1, 2, 2, 2, 1, 0][f % 8]]) put(x, y, R.cat);
    for (const [dx, dy] of [[-2, -1], [2, -1], [-3, 1], [3, 1], [-1, -3], [1, -3]]) put(6 + dx, 21 + dy, R.glass);
    for (let y = 21; y <= 24; y++) for (let x = 4; x <= 8; x++) put(x, y, x === 4 || x === 8 ? R.jar : y > 22 ? R.wax : '#2a1a10');
    put(5, 21, R.jarHi);
    put(6 + [0, 0, 1, 0, 0, -1, 0, 0][f % 8], [19, 19, 18, 19, 18, 19, 19, 18][f % 8], R.fl2); put(6, 20, R.fl); put(6, 21, R.fl2);
    for (let y = 22; y <= 24; y++) for (let x = 10; x <= 12; x++) put(x, y, x === 12 ? R.mugD : R.mug);
    put(13, 23, R.mugD);
    for (let k = 0; k < 2; k++) { const s = mod(t + k * 4, 8); if (s < 6) put(11 + [0, 1, 1, 0, -1, -1][s], 21 - s, R.steam); }
  };
}

// ================================================================ 3 · CAMPFIRE IN THE DARK FOREST (Waymark's world)
// Waymark's night clearing (pages 14 and 33: tall pale trunks in green-black fog, the rune arch at the end of the
// red-dirt path with vines on it, moss, mist, fireflies and Kokiri motes), drawn as pixels. The campfire is the one
// warm light: it lights a pool of moss and path, rims the hooded traveller and the near sides of the trunks, and
// throws sparks. The arch's runes breathe a faint teal (Waymark's done-week light); everything else is the fog's cold
// green.
const CF = {
  fog: ['#030807', '#050d0a', '#08130f', '#0b1914', '#0f2019', '#13281f', '#173024'],
  far: '#173329', farLit: '#21453a', farTex: '#1b3a2f',
  mid: '#0a1512', midLit: '#163028', midMoss: '#15301f',
  near: '#020504', nearRim: '#3a1e10', moss: '#0f2a1a', mossHi: '#24482a',
  arch: '#3a4842', archLit: '#6e8076', portal: '#0b1a15', portal2: '#16302a',
  rune: ['#1d6050', '#2f9a80', '#4fd0b0', '#9af4dc'], vine: '#25451f',
  gnd: '#06100b', gnd2: '#0a1810', grass: '#12301c', path: ['#1c0e0a', '#28120c', '#34170e', '#401c10'],
  lit: ['#141a0d', '#2a2611', '#463614', '#6a4a1a'], pathLit: ['#2e150c', '#46200f', '#7a3414', '#b04e1c'],
  mist: '#1e3d33', mist2: '#2c5044',
  stone: '#2a221d', stoneLit: '#8a5a38', stoneHi: '#c4844c',
  log: '#26160c', logLit: '#7a4418', logEnd: '#b46c2c',
  cloak: '#18261f', cloak2: '#2c3428', cool: '#2a4a3e', hood: '#040706', rim: '#ee8a3a', rim2: '#9a4a1e', face: '#e8a066', staff: '#2e1c10',
  fW: '#fff6dc', fY: '#ffd860', fO: '#ff9a30', fR: '#e0502a', fD: '#8a2a1c',
  fly: '#eeffa0', flyD: '#7e9a3c', spore: '#6ae0c8', spore2: '#2a8070',
};
const FLAME8 = [
  ['...R...', '...O.R.', '..ROR..', '..OYO..', '.ROYOR.', '.OYWYO.', 'ROYWYOR', 'OYWWWYO', 'OYWWWYO'],
  ['....R..', '...RO..', '...OO..', '..OYOR.', 'R.OYYO.', 'OROYWYO', '.OYWWYO', 'OYWWWYO', 'OYWWWYO'],
  ['..R....', '..OR...', '.ROO.R.', '.OYO.O.', '.OYYOOR', 'ROYWYO.', 'OYWWYOR', 'OYWWWYO', 'OYWWWYO'],
  ['...D...', '...R...', '..ROR..', '..OYO.R', '.OYYOR.', 'ROYWYO.', 'OYWWWYO', 'OYWWWYO', 'OYWWWYO'],
  ['.....R.', '....RO.', '.R..OO.', '.O.OYOR', '.OOYYO.', 'ROYWYYO', '.OYWWYO', 'OYWWWYO', 'OYWWWYO'],
  ['..R....', '..OR...', '..OOR..', '.ROYO..', '.OYYO.R', 'ROYWYOO', 'OYWWWYO', 'OYWWWYO', 'OYWWWYO'],
  ['.......', '...R...', '..ROR..', '.ROYOR.', '.OYYYO.', 'ROYWYOR', 'OYWWWYO', 'OYWWWYO', 'OYWWWYO'],
  ['...R...', '..RO...', '..OOR..', '..OYO..', '.OYYOR.', 'ROYWYO.', 'OYWWWYO', 'OYWWWYO', 'OYWWWYO'],
];
const FLICK = [1, 0.85, 1, 0.8, 0.95, 1, 0.82, 0.92];
export function campfire(f, t = f) {
  return (put) => {
    const FX = 15, FY = 30, I = FLICK[f % 8], hot = I > 0.9, GY = 22;
    const FOGROW = [0, 0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 6, 6, 6, 5];
    for (let y = 0; y < GY; y++) for (let x = 0; x < SW; x++) put(x, y, CF.fog[FOGROW[y]]);
    for (let y = 6; y < GY; y++) for (let x = 14; x < SW; x++) { const d = Math.hypot((x - 26) / 1.8, y - 17); if (d < 5.5) put(x, y, d < 3.5 ? CF.fog[6] : CF.fog[5]); }
    for (const [x0, w] of [[7, 2], [12, 3], [19, 2], [30, 2]]) for (let y = 0; y < GY; y++) for (let x = x0; x < x0 + w; x++)
      put(x, y, x === x0 ? CF.farLit : (y + x) % 4 === 0 ? CF.farTex : CF.far);
    const AX = 21, AY = 11;
    const ARCH = ['....aaa....', '..aAAAAaa..', '.aA.....aa.', 'aA.......aa', 'AA.......aa', 'rA.......ar', 'AA.......aa', 'Ar.......aa', 'AA.......ra', 'AA.......aa', 'AAA.....aaa'];
    ARCH.forEach((r, y) => [...r].forEach((c, x) => {
      const px = AX + x, py = AY + y;
      if (c === '.') { if (y >= 1 && r.indexOf('A') < x && Math.max(r.lastIndexOf('a'), r.lastIndexOf('r')) > x) put(px, py, y > 6 ? CF.portal2 : CF.portal); return; }
      if (c === 'r') { put(px, py, CF.rune[[1, 2, 3, 3, 2, 1, 0, 0][mod(Math.floor(t / 3) + y, 8)]]); return; }
      put(px, py, c === 'A' ? CF.archLit : CF.arch);
    }));
    for (const [x, y] of [[2, 1], [1, 2], [0, 3], [0, 4], [9, 6], [10, 7], [8, 1], [9, 2]]) put(AX + x, AY + y, CF.vine);
    for (let y = 0; y < GY + 1; y++) { const fl = y >= GY - 1 ? 1 : 0;
      for (let x = 0; x <= 2 + fl; x++) { let c = x === 0 ? CF.midLit : (x * 3 + y) % 7 === 0 && y > 3 ? CF.midMoss : CF.mid; put(x, y, c); } }
    for (let y = GY; y < SH; y++) for (let x = 0; x < SW; x++) put(x, y, (x * 5 + y * 3) % 11 === 0 ? CF.gnd2 : CF.gnd);
    const pathC = (y) => 26.5 + (y - GY) * 0.35 - Math.sin((y - GY) / 12 * Math.PI) * 2.5, pathW = (y) => 0.8 + (y - GY) * 0.27;
    const onPath = (x, y) => y >= GY && Math.abs(x + 0.5 - pathC(y)) <= pathW(y);
    for (let y = GY; y < SH; y++) for (let x = 0; x < SW; x++) if (onPath(x, y)) put(x, y, CF.path[Math.min(3, Math.floor((y - GY) / 3))]);
    for (let y = GY - 3; y < GY + 1; y++) for (let x = 0; x < SW; x++) {
      const u = x + Math.floor(t / 3), v = Math.sin(u * 0.29 + y * 0.9) + Math.sin(u * 0.11 - y) * 0.9;
      if (v > (y === GY - 2 ? 0.9 : 1.3)) put(x, y, y === GY - 2 && v > 1.25 ? CF.mist2 : CF.mist);
    }
    for (let y = GY; y < SH; y++) for (let x = 0; x < SW; x++) {
      const d = Math.hypot((x - FX - 0.5) / 3.0, (y + 0.5 - FY)) / (0.9 + 0.1 * I);
      const k = d < 1.4 ? 3 : d < 2.4 ? 2 : d < 3.4 ? 1 : d < 4.3 ? 0 : -1;
      if (k >= 0) put(x, y, onPath(x, y) ? CF.pathLit[k] : CF.lit[k]);
    }
    for (let x = 0; x < SW; x++) if ((x * 7) % 5 === 0 && !onPath(x, GY)) put(x, GY, CF.grass);
    const MAN = ['..cccr..', '.ccccdr.', '.cccckf.', '.cccckfr', '..ccddr.', '.cccccdr', 'cccccdhh', 'ccccccdr', 'cccccccr', 'cccccccr'];
    const MX = 3, MY = 19;
    for (let y = 14; y < 31; y++) put(MX + (y < 19 ? 1 : 2), y, CF.staff);
    put(MX + 1, 14, CF.rim2);
    MAN.forEach((r, y) => [...r].forEach((c, x) => {
      if (c === '.') return;
      const left = x === 0 || r[x - 1] === '.';
      put(MX + x, MY + y, { c: left ? CF.cool : CF.cloak, d: CF.cloak2, k: CF.hood, f: hot ? CF.face : CF.rim, h: hot ? CF.face : CF.rim, r: hot ? CF.rim : CF.rim2 }[c]);
    }));
    for (let x = MX - 3; x <= MX + 8; x++) { put(x, 29, (x * 3) % 4 ? CF.moss : CF.mossHi); put(x, 30, x > MX + 6 ? CF.logLit : CF.log); put(x, 31, CF.log); }
    put(MX + 8, 30, CF.logEnd); put(MX + 8, 31, CF.logLit);
    for (const [x, y] of [[FX - 4, FY], [FX - 3, FY + 1], [FX - 1, FY + 1], [FX + 2, FY + 1], [FX + 4, FY], [FX + 5, FY - 1]]) { put(x, y, hot ? CF.stoneHi : CF.stoneLit); put(x + 1, y, CF.stone); }
    for (let k = -3; k <= 3; k++) put(FX + k + 1, FY, k % 2 ? CF.logLit : CF.log);
    put(FX - 2, FY - 1, CF.logLit); put(FX + 4, FY - 1, CF.logLit);
    FLAME8[f % 8].forEach((r, y) => [...r].forEach((c, x) => { const col = { W: CF.fW, Y: CF.fY, O: CF.fO, R: CF.fR, D: CF.fD }[c]; if (col) put(FX - 2 + x, FY - 9 + y, col); }));
    for (let k = 0; k < 4; k++) {
      const age = mod(t + k * 5, 14); if (age > 10) continue;
      const sx = FX + 1 + Math.round(Math.sin((t + k * 5 - age) * 1.7 + age * 0.45) * (age / 4)) + (k % 2 ? 1 : -1) * Math.floor(age / 5);
      put(sx, FY - 9 - age, age < 4 ? CF.fY : age < 8 ? CF.fO : CF.fR);
    }
    for (let y = 0; y < SH; y++) for (let x = 32; x < SW; x++) put(x, y, x === 32 && y > 18 ? CF.nearRim : CF.near);
    const CANOPY = [4, 3, 3, 2, 2, 3, 2, 1, 1, 1, 2, 2, 1, 0, 1, 1, 2, 1, 1, 0, 0, 1, 1, 2, 2, 1, 1, 0, 1, 2, 3, 4, 5, 5];
    CANOPY.forEach((d, x) => { for (let y = 0; y <= d; y++) put(x, y, CF.near); });
    for (const [x, len, ph] of [[2, 5, 0], [9, 4, 2], [16, 6, 4], [24, 3, 6], [29, 5, 3]]) {
      const sway = [0, 0, 1, 1, 1, 0, 0, -1][mod(Math.floor(t / 3) + ph, 8)];
      for (let y = 1; y <= len; y++) put(x + (y > len - 2 ? sway : 0), CANOPY[x] + y, y === len ? CF.mossHi : CF.moss);
    }
    for (const [x0, col] of [[0, [32, 31, 32, 33]], [29, [33, 32, 31, 30, 31]]]) col.forEach((y0, i) => { for (let y = y0; y < SH; y++) put(x0 + i, y, CF.near); });
    for (let k = 0; k < 6; k++) {
      const bx = [10, 18, 27, 5, 29, 21][k], by = [9, 6, 8, 14, 20, 24][k], p = [64, 48, 56, 40, 72, 52][k];
      const a = (t + k * 11) / p * TAU, x = Math.round(bx + Math.sin(a) * 2.5), y = Math.round(by + Math.sin(a * 2 + k) * 1.4);
      const blink = mod(t + k * 7, 24); if (blink > 18) continue;
      put(x, y, blink < 3 || blink > 15 ? CF.flyD : CF.fly);
    }
    for (let k = 0; k < 3; k++) {
      const age = mod(t + k * 13, 40), x = AX + 3 + k + Math.round(Math.sin((age + k * 9) / 6)), y = AY + 9 - Math.floor(age / 4);
      put(x, y, age > 30 ? CF.spore2 : CF.spore);
    }
  };
}

// ================================================================ 4 · CARIBBEAN SUNSET, FISHING (new)
// A Caribbean jetty at sunset: a pink-to-gold sky, the sun sinking into the sea, the water gold at the horizon and
// turquoise in close with the sun's glitter path sparkling down it, a coconut palm leaning in from the left, a small
// painted wooden boat (turquoise, yellow and red, like the island pirogues) bobbing in the shallows, waves lapping the
// sand. At the end of the jetty a fisher in a straw hat, standing right in front of the sun so he reads as a clean
// silhouette, casts: rod back, whip forward, the line flies out, the lure lands with a ring; then he waits while the
// bobber rides the swell, and casts again.
const CB = {
  sky: ['#2c1c4c', '#3c2258', '#562a66', '#74326e', '#963c72', '#b84a72', '#d45a6c', '#e87262', '#f48e5a', '#f8aa56', '#fcc45e', '#ffda78'],
  sun: ['#fff8dc', '#fff0b0', '#ffe28a', '#ffd070'], cloud: '#e07a86', cloud2: '#9a4278',
  sea: ['#f4b468', '#e49478', '#b06a86', '#3ab0aa', '#2aa0a4', '#20909e', '#1a8096', '#15708a'],
  glit: '#ffe08a', glitW: '#fff8e0', glitT: '#8ae0d4',
  sand: '#eeb07c', sandLit: '#f8c896', sandD: '#c4805e', wet: '#b86e6e', foam: '#fff4e4', foam2: '#a8e4dc',
  palm: '#2a1230', palmLit: '#6a2a4a', jetty: '#3a1a2c', jettyLit: '#d07a4e', post: '#2a1222',
  man: '#22102a', hat: '#3a1c30', hatRim: '#f0a060', rod: '#2a1428', line: '#fff0d0', bob: '#ff4a3a', bobW: '#fff4e0',
  hullT: '#2ab8b8', hullT2: '#1a8a90', hullY: '#ffd040', hullR: '#d8402c', hullD: '#14505a', bird: '#3a1a40',
};
const FISHER = ['..hhh..', 'HHHHHHH', '..mm...', '..mmm..', '.mmmm..', '..mmm..', '..mmm..', '..m.m..', '..m.m..'];
const ROD = [[6, -5], [7, -3], [3, -7], [-4, -5], [-7, -2], [-7, -1], [-7, 0], [-7, 1]];
export function fishing(f, t = f) {
  return (put) => {
    const HZ = 17, ph = mod(t, 40), cast = ph < 8 ? ph : -1;
    for (let y = 0; y < HZ; y++) for (let x = 0; x < SW; x++) {
      const v = y / HZ * (CB.sky.length - 1), i = Math.floor(v);
      put(x, y, v - i > 0.8 && (x + y) % 2 === 0 ? CB.sky[i + 1] : CB.sky[i]);
    }
    const sx = 21, r = 6;
    for (let y = HZ - r; y < HZ; y++) for (let x = sx - r; x <= sx + r; x++) {
      const dx = x + 0.5 - sx - 0.5, dy = y + 0.5 - HZ; if (dx * dx + dy * dy > r * r) continue;
      put(x, y, CB.sun[Math.min(3, Math.floor((y - HZ + r) / r * 4))]);
    }
    const cd = Math.floor(t / 8);
    for (const [y, x0, len, c] of [[HZ - 4, 8, 11, CB.cloud], [HZ - 2, 20, 9, CB.cloud], [5, 2, 7, CB.cloud2], [7, 22, 8, CB.cloud2]])
      for (let k = 0; k < len; k++) put(mod(x0 + k + cd, SW + 10) - 5, y, c);
    const bx = mod(Math.floor(t / 2), SW + 12) - 6, flap = mod(t, 4) < 2;
    for (const [ox, oy] of [[0, 0], [5, 2]]) { put(bx + ox, 4 + oy, CB.bird); put(bx + ox - 1, 4 + oy - (flap ? 1 : 0), CB.bird); put(bx + ox + 1, 4 + oy - (flap ? 1 : 0), CB.bird); }
    const SEA = [0, 1, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 7, 7, 7, 7];
    for (let y = HZ; y < SH; y++) for (let x = 0; x < SW; x++) put(x, y, CB.sea[SEA[y - HZ]]);
    for (let y = HZ + 3; y < SH; y++) { const dir = y % 2 ? 1 : -1;
      for (let k = 0; k < 3; k++) { const x = mod(Math.floor(hash(y, k) * SW) + dir * Math.floor(t / 2), SW); put(x, y, CB.glitT); if (y > HZ + 7) put(mod(x + 1, SW), y, CB.glitT); } }
    for (let y = HZ + 1; y < SH; y++) { const w = 1 + Math.floor((y - HZ) / 3), n = (y - HZ) % 2 ? 1 : 0;
      for (let k = 0; k < n; k++) { const h = hash(y * 7 + k, Math.floor(t / 2) + k * 3), x0 = sx - w + Math.floor(h * (2 * w + 1)), len = 1 + (y > HZ + 6 ? Math.floor(hash(k, y) * 2) : 0);
        for (let q = 0; q < len; q++) put(x0 + q, y, h < 0.15 && q === 0 ? CB.glitW : CB.glit); } }
    const lap = [0, 0, 1, 1, 2, 2, 1, 1][mod(Math.floor(t / 2), 8)];
    const shore = (x) => 27 + Math.round(x * 0.12 + Math.sin(x * 0.4) * 0.6);
    for (let x = 0; x < 22; x++) { const s = shore(x);
      for (let y = s - 1; y < SH; y++) put(x, y, y === s - 1 ? (x + lap) % 3 ? CB.foam2 : CB.foam : y <= s + lap - 1 ? CB.wet : y < s + 2 ? CB.sandLit : y < SH - 2 ? CB.sand : CB.sandD); }
    const JY = 23, JX = 18;
    for (let x = JX; x < SW; x++) { put(x, JY, CB.jettyLit); put(x, JY + 1, CB.jetty); }
    for (const px of [JX + 1, JX + 7, JX + 13]) for (let y = JY + 2; y < SH; y++) put(px + (y > JY + 4 && mod(y + Math.floor(t / 2), 3) === 0 ? 1 : 0), y, y < JY + 5 ? CB.post : CB.hullD);
    const by = 26;   // pulled up on the sand, the water lapping round it
    const BOAT = ['R..........R', 'RyyyyyyyyyyR', 'tTTTTTTTTTTt', '.TTTTTTTTTT.', '..dddddddd..'];
    stamp(put, BOAT, 4, by, { R: CB.hullR, y: CB.hullY, T: CB.hullT, t: CB.hullT2, d: CB.hullD });
    const sw = [0, 0, 1, 1, 1, 0, 0, 0][mod(Math.floor(t / 3), 8)];
    for (let y = SH - 1; y > 5; y--) { const k = Math.round(Math.pow((SH - 1 - y) / 28, 1.6) * 6); put(1 + k, y, y % 3 ? CB.palm : '#1a0a20'); put(2 + k, y, y % 3 ? CB.palmLit : CB.palm); }
    const FROND = ['....x.x.....', '..xxxxxxx...', '.xx.xxx.xxx.', 'x..x.x.x..xx', '..x..x..x...', '.x...x...x..'];
    FROND.forEach((r, y) => [...r].forEach((c, x) => { if (c === 'x') put(2 + x + (y > 2 ? sw : 0) - (x < 3 && y > 3 ? sw : 0), 2 + y, CB.palm); }));
    put(7, 6, CB.palmLit); put(8, 6, CB.palmLit);
    const FX = 19, FYp = JY - 9;
    stamp(put, FISHER, FX, FYp, { h: CB.hat, H: CB.hat, m: CB.man });
    put(FX, FYp + 1, CB.hatRim); put(FX + 6, FYp + 1, CB.hatRim); put(FX + 4, FYp, CB.hatRim);
    const hand = [FX + 2, FYp + 4], tipD = ROD[cast < 0 ? 7 : cast], tip = [hand[0] + tipD[0], hand[1] + tipD[1]];
    line(hand, tip, (x, y) => put(x, y, CB.rod));
    const bobX = 6, bobY = 21 + (cast < 0 && mod(Math.floor(t / 3), 4) === 1 ? 1 : 0);
    if (cast >= 0 && cast < 4) {
      put(tip[0] + (cast < 2 ? 1 : -1), tip[1] + 1, CB.line); put(tip[0] + (cast < 2 ? 1 : -1), tip[1] + 2, CB.bob);
    } else if (cast >= 4 && cast < 6) {
      const lx = tip[0] - (cast === 4 ? 6 : 11), ly = tip[1] - (cast === 4 ? 2 : 0);
      for (let i = 0; i <= 10; i++) { const s = i / 10; put(Math.round(tip[0] + (lx - tip[0]) * s), Math.round(tip[1] + (ly - tip[1]) * s - Math.sin(s * Math.PI) * 2), CB.line); }
      put(lx, ly, CB.bob);
    } else {
      for (let i = 0; i <= 12; i++) { const s = i / 12; put(Math.round(tip[0] + (bobX - tip[0]) * s), Math.round(tip[1] + (bobY - 1 - tip[1]) * s + Math.sin(s * Math.PI) * 1.5), CB.line); }
      put(bobX, bobY - 1, CB.bobW); put(bobX, bobY, CB.bob);
      const ring = cast === 6 ? 1 : cast === 7 ? 2 : ph < 14 ? 3 : 0;
      if (ring) { put(bobX - ring - 1, 22, CB.foam); put(bobX + ring + 1, 22, CB.foam); }
    }
  };
}

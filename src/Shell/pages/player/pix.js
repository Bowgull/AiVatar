// The mini player's pixel kit (2026-10-22), lifted from sheet 59's own (docs/cockpit/sheet-59/pix.js), so the player is
// drawn by exactly the code that drew the approved sheet.
//
// Everything is pixel art at P = 2 (one art pixel = 2 x 2 CSS pixels, like his sprite and the bubble's rim), placed on
// whole pixels and shown with image-rendering:pixelated. The wood is Samara's own art (art/browser/band.png for the rim's
// grain, tray.png for a wood surface), sampled pixel for pixel. The rim is sheet 55's S2 recipe, lifted from
// src/Shell/pages/balloon.js s2(): a soft dark-wood outer edge one art pixel deep, three rows of band.png's grain running
// along the edge, lit top/left, a shade darker bottom/right, a one art pixel contact shadow.
export const P = 2;
const ART = new URL('../art/browser/', import.meta.url).href;
const TEX = {};
export async function loadTex(...names) {
  await Promise.all(names.map(async (n) => {
    if (TEX[n]) return;
    const img = new Image(); img.src = ART + n; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    TEX[n] = { w: img.width, h: img.height, d: g.getImageData(0, 0, img.width, img.height).data };
  }));
}
export const hex = (h) => { if (Array.isArray(h)) return h; const n = h.replace('#', ''); return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16), n.length > 6 ? parseInt(n.slice(6, 8), 16) : 255]; };
export const mix = (a, b, k) => { a = hex(a); b = hex(b); return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * k)).concat(255); };
export const mul = (a, k) => { a = hex(a); return [0, 1, 2].map((i) => Math.max(0, Math.min(255, Math.round(a[i] * k)))).concat(255); };
export const tx = (n, x, y) => { const t = TEX[n]; x = ((Math.floor(x) % t.w) + t.w) % t.w; y = ((Math.floor(y) % t.h) + t.h) % t.h; const i = (y * t.w + x) * 4; return [t.d[i], t.d[i + 1], t.d[i + 2], 255]; };
const lit3 = (l, a, b, c) => (l > 0.3 ? a : l < -0.3 ? c : b);

// ---------------------------------------------------------------- shapes (masks at art resolution, no anti-aliasing)
/** A rounded rectangle w x h art pixels, corner radius r (pixel centres, so the staircase is even on all four corners). */
export function rrMask(w, h, r) {
  const m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const px = x + 0.5, py = y + 0.5;
    const cx = Math.max(r, Math.min(w - r, px)), cy = Math.max(r, Math.min(h - r, py));
    m[y * w + x] = Math.hypot(px - cx, py - cy) <= r + 0.01 ? 1 : 0;
  }
  return m;
}
/** Any Path2D-drawable shape (fn gets a 2d context in art pixels). */
export function drawMask(w, h, fn) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.fillStyle = '#000'; fn(g);
  const a = g.getImageData(0, 0, w, h).data, m = new Uint8Array(w * h);
  for (let i = 0; i < m.length; i++) m[i] = a[i * 4 + 3] >= 128 ? 1 : 0;
  return m;
}
export function dilate(m, w, h, E) {
  const o = new Uint8Array(m), off = [], R = E + 0.45;
  for (let dy = -E; dy <= E; dy++) for (let dx = -E; dx <= E; dx++) if (dx * dx + dy * dy <= R * R) off.push([dx, dy]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (m[i]) continue;
    for (const [dx, dy] of off) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < w && Y < h && m[Y * w + X]) { o[i] = 1; break; } }
  }
  return o;
}
export const invert = (m) => m.map((v) => 1 - v);
/** Round off concave joins (a fillet of radius E): grow, then shrink back. */
export function close(m, w, h, E) {
  // worked out on a canvas E pixels bigger all round, so the picture's own edge never flattens the shape
  const W = w + 2 * E, H = h + 2 * E, big = new Uint8Array(W * H);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) big[(y + E) * W + x + E] = m[y * w + x];
  const c = invert(dilate(invert(dilate(big, W, H, E)), W, H, E)), o = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) o[y * w + x] = c[(y + E) * W + x + E];
  return o;
}
/** Chamfer distance to the nearest outside pixel (1 for the outermost ring). */
export function dist(m, w, h) {
  const D = new Float32Array(w * h), S = Math.SQRT2;
  for (let i = 0; i < D.length; i++) D[i] = m[i] ? 1e9 : 0;
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : D[y * w + x]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (!D[i]) continue;
    D[i] = Math.min(D[i], at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + S, at(x + 1, y - 1) + S); }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) { const i = y * w + x; if (!D[i]) continue;
    D[i] = Math.min(D[i], at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + S, at(x - 1, y + 1) + S); }
  return D;
}
const depth = (v) => Math.ceil(v - 1e-4) - 1;
const LX = -0.5, LY = -0.866;   // light from the top-left, mostly top (the rim engine's)

// ---------------------------------------------------------------- fills
const PAPER = [[0, '#FBF0D8'], [0.45, '#F2E0BC'], [1, '#E6CD9C']];   // the bubble's look B paper
export function paperAt(t, stops = PAPER) {
  t = Math.max(0, Math.min(1, t));
  for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) { const [a, ca] = stops[i - 1], [b, cb] = stops[i]; return mix(ca, cb, (t - a) / (b - a)); }
  return hex(stops[stops.length - 1][1]);
}
/** Samara's tray wood (tray.png, 1 tray pixel = 1 art pixel, as browser.css draws it at 128x256). */
export const trayAt = (x, y, k = 1) => (k === 1 ? tx('tray.png', x, y) : mul(tx('tray.png', x, y), k));

/**
 * Paint a shape: S2's wood band round the outside (E art pixels), then the fill. Returns a canvas element sized w x
 * (h + shadow) art pixels and shown at P. `fill(x, y, c)` gives the inside colour (c.d = depth past the band, c.lit).
 * band: 's2' (Samara's wood band), 'edge' (only the soft dark-wood edge, 1 px), 'recess' (a sunken window), 'none'.
 */
export function shape(mask, w, h, { band = 's2', E = 4, fill = null, shadow = 1, shadowCol = [12, 6, 2, 90], under = null } = {}) {
  const D = dist(mask, w, h);
  const H = h + shadow;
  const img = new ImageData(w, H), px = img.data;
  const put = (i, v) => { if (!v) return; v = hex(v); const a = (v[3] ?? 255) / 255; if (a >= 1 || !px[i * 4 + 3]) { px[i * 4] = v[0]; px[i * 4 + 1] = v[1]; px[i * 4 + 2] = v[2]; px[i * 4 + 3] = v[3] ?? 255; return; }
    for (let k = 0; k < 3; k++) px[i * 4 + k] = Math.round(v[k] * a + px[i * 4 + k] * (1 - a)); px[i * 4 + 3] = 255; };
  const g = (X, Y) => (X < 0 || Y < 0 || X >= w || Y >= h ? 0 : D[Y * w + X]);
  const lightOf = (x, y) => { const nx = g(x - 1, y) - g(x + 1, y), ny = g(x, y - 1) - g(x, y + 1), k = Math.hypot(nx, ny); return k ? (nx * LX + ny * LY) / k : 0; };
  // which edge of the bounding box a pixel is nearest: the grain runs along it
  for (let y = 0; y < H; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (y >= h || !mask[i]) { if (shadow && y >= shadow && mask[(y - shadow) * w + x] && (y >= h || !mask[i])) put(i, shadowCol); continue; }
    const d = depth(D[i]), lit = lightOf(x, y);
    const dl = x, dr = w - 1 - x, dt = y, db = h - 1 - y, m = Math.min(dl, dr, dt, db);
    const u = m === dt || m === db ? x : y;
    let v;
    if (band === 's2') {
      if (d === 0) v = lit3(lit, '#422a18', '#3a2516', '#2c1c10');
      else if (d < E) { const wd = tx('band.png', u, 2 + (d - 1) * 4); v = d === 1 && lit > 0.3 ? mix(wd, '#6e4a2a', 0.65) : mul(wd, lit3(lit, 1.08, 1.0, 0.86)); }
    } else if (band === 'edge') {
      if (d === 0) v = lit3(lit, '#4a301b', '#3a2516', '#2c1c10');
    } else if (band === 'recess') {   // sunken: dark on the top/left inner side, a lit lip on the bottom/right
      if (d === 0) v = lit3(lit, '#2c1c10', '#3a2516', '#7a5532');
      else if (d === 1) v = lit3(lit, '#0d0703', '#1a100a', '#2a1a10');
    }
    if (!v) v = fill ? fill(x, y, { d: band === 's2' ? d - E : band === 'edge' ? d - 1 : band === 'recess' ? d - 2 : d, lit, D: d }) : null;
    put(i, v);
  }
  if (under) under(px, w, H);
  const c = document.createElement('canvas'); c.width = w; c.height = H; c.getContext('2d').putImageData(img, 0, 0);
  return show(c);
}
/** A canvas shown at exactly P. */
export function show(c, s = P) {
  c.style.width = c.width * s + 'px'; c.style.height = c.height * s + 'px'; c.style.imageRendering = 'pixelated'; c.style.display = 'block';
  return c;
}
/** The usual fills, ready to pass to shape(). */
export const fills = {
  /** the bubble's parchment, with the rim's soft shade one pixel in under the top/left wood */
  paper: (h) => (x, y, c) => { const p = paperAt(y / h); return c.d === 0 && c.lit > 0.3 ? mix(p, '#966e3c', 0.22) : p; },
  /** Samara's dark tray wood, a touch warmer where the light falls */
  wood: (k = 1) => (x, y, c) => { const t = trayAt(x, y, k); return c.d === 0 && c.lit > 0.3 ? mix(t, '#120a05', 0.45) : t; },
  flat: (col) => () => hex(col),
};
export function rr(w, h, r, opts) { return shape(rrMask(w, h, r), w, h, opts); }

// ---------------------------------------------------------------- sprites (palette letter maps, like ClaudeMarks.cs)
export function spr(map, pal, { s = P, drop = null } = {}) {
  const h = map.length, w = Math.max(...map.map((r) => r.length));
  const c = document.createElement('canvas'); c.width = w + (drop ? 1 : 0); c.height = h + (drop ? 1 : 0);
  const g = c.getContext('2d');
  if (drop) { g.fillStyle = drop; map.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch]) g.fillRect(x + 1, y + 1, 1, 1); })); }
  map.forEach((r, y) => [...r].forEach((ch, x) => { const col = pal[ch]; if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); } }));
  return show(c, s);
}
/** A canvas the caller paints pixel by pixel (art pixels), shown at P. */
export function art(w, h, paint, s = P) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); const put = (x, y, col, a = 1) => { g.globalAlpha = a; g.fillStyle = Array.isArray(col) ? `rgb(${col[0]},${col[1]},${col[2]})` : col; g.fillRect(x, y, 1, 1); g.globalAlpha = 1; };
  paint(put, g);
  return show(c, s);
}

// ---------------------------------------------------------------- shared glyphs (hand-placed, 9 x 9 unless noted)
export const GLYPH = {
  play: ['..O......', '..OO.....', '..OOO....', '..OOOO...', '..OOOOO..', '..OOOO...', '..OOO....', '..OO.....', '..O......'],
  pause: ['.OO..OO..', '.OO..OO..', '.OO..OO..', '.OO..OO..', '.OO..OO..', '.OO..OO..', '.OO..OO..', '.OO..OO..', '.OO..OO..'],
  next: ['.O.....O.', '.OO....O.', '.OOO...O.', '.OOOO..O.', '.OOOOO.O.', '.OOOO..O.', '.OOO...O.', '.OO....O.', '.O.....O.'],
  prev: ['.O.....O.', '.O....OO.', '.O...OOO.', '.O..OOOO.', '.O.OOOOO.', '.O..OOOO.', '.O...OOO.', '.O....OO.', '.O.....O.'],
  stop: ['.........', '.OOOOOOO.', '.OOOOOOO.', '.OOOOOOO.', '.OOOOOOO.', '.OOOOOOO.', '.OOOOOOO.', '.OOOOOOO.', '.........'],
  pause7: ['OO.OO', 'OO.OO', 'OO.OO', 'OO.OO', 'OO.OO', 'OO.OO', 'OO.OO'],
  prev7: ['O...O..', 'O..OO..', 'O.OOO..', 'OOOOO..', 'O.OOO..', 'O..OO..', 'O...O..'],
  next7: ['..O...O', '..OO..O', '..OOO.O', '..OOOOO', '..OOO.O', '..OO..O', '..O...O'],
  play7: ['O....', 'OO...', 'OOO..', 'OOOO.', 'OOO..', 'OO...', 'O....'],
  shade: ['.......', '.......', '.......', 'OOOOOOO', 'OOOOOOO', '.......', '.......'],
  full: ['OOOOOOO', 'O.....O', 'O.....O', 'O.....O', 'O.....O', 'O.....O', 'OOOOOOO'],
  close: ['O.....O', '.O...O.', '..O.O..', '...O...', '..O.O..', '.O...O.', 'O.....O'],
  vol: ['....O....', '...OO..O.', 'OOOOO...O', 'OOOOO.O.O', 'OOOOO.O.O', 'OOOOO.O.O', 'OOOOO...O', '...OO..O.', '....O....'],
  bars: ['......O..', '......O..', '...O..O..', '...O..O.O', '.O.O..O.O', '.O.O.OO.O', '.O.OOOO.O', 'OOOOOOOOO', '.........'],
  shuffle: ['......O..', 'OO...OOO.', '..O.O.O..', '...O.....', '..O.O.O..', 'OO...OOO.', '......O..'],
  repeat: ['...O.....', 'OOOOO....', 'O..O....O', 'O.......O', 'O.......O', 'O....O..O', '....OOOOO', '.....O...'],
};
/** The job pop-out's pin, verbatim (src/Shell/pages/jobpop.js PIN / pinArt): every pop-out shares it. */
export const PIN = ['..OOOOO..', '..OHFFO..', '..OHFSO..', '..OHFSO..', '.OOHFSOO.', 'OHHFFFFSO', 'OSSSSSSSO', 'OOOOOOOOO', '....O....', '....O....', '....O....', '....O....'];
export function pin(on = false, s = P) {
  const F = on ? '#c4532a' : '#f1e3c4';
  const pal = on ? { O: '#2a1a10', H: '#e2a995', F, S: '#8f4422' } : { O: '#9a7c58', H: '#fffaf0', F, S: '#d6bd90' };
  return spr(PIN, pal, { s, drop: on ? 'rgba(0,0,0,.35)' : null });
}

// ---------------------------------------------------------------- the album cover (hand-made pixels, no real artwork)
/** A small painted cover: dusk over water, a low sun, two hills, a palm. n x n art pixels. */
export function cover(n = 32, s = P, look = 'dusk') {
  return art(n, n, (put) => {
    const sky = look === 'dusk' ? ['#2b1d3f', '#4a2c6e', '#8a3e6a', '#c95e48', '#f0a64a', '#ffd38a'] : ['#10242e', '#1d4050', '#2f6f66', '#58b0a3', '#b2e6dd', '#e9f7f2'];
    const horizon = Math.round(n * 0.62);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      let col;
      if (y < horizon) { const t = y / horizon; col = sky[Math.min(sky.length - 1, Math.floor(t * sky.length))];
        // dither the band edges every other pixel, like a 16-bit sky
        const f = t * sky.length - Math.floor(t * sky.length); if (f > 0.8 && (x + y) % 2 === 0) col = sky[Math.min(sky.length - 1, Math.floor(t * sky.length) + 1)]; }
      else { const t = (y - horizon) / (n - horizon); col = t < 0.34 ? '#3a2a5a' : t < 0.7 ? '#2b1d3f' : '#1a1230';
        if ((x * 7 + y * 3) % 11 === 0 && Math.abs(x - n * 0.62) < n * 0.18) col = '#f0a64a'; }   // the sun's glints on the water
      put(x, y, col);
    }
    const sx = Math.round(n * 0.62), sy = horizon - Math.round(n * 0.06), R = Math.round(n * 0.16);
    for (let y = -R; y <= 0; y++) for (let x = -R; x <= R; x++) if (x * x + y * y <= R * R + 1) put(sx + x, sy + y, y > -R / 3 ? '#ffd38a' : '#fff0c8');
    // two hills
    for (let x = 0; x < n; x++) { const h1 = Math.round(n * 0.1 + Math.sin(x / n * 3.1) * n * 0.09); for (let y = horizon - h1; y < horizon; y++) if (x < n * 0.55) put(x, y, '#2b1d3f'); }
    // a palm on the left
    const px = Math.round(n * 0.22);
    for (let y = Math.round(n * 0.28); y < horizon; y++) put(px + Math.round((horizon - y) / 9), y, '#1a1230');
    const top = Math.round(n * 0.28), tx0 = px + Math.round((horizon - top) / 9);
    for (let k = 1; k < Math.round(n * 0.16); k++) { put(tx0 - k, top + Math.round(k * k / 9), '#1a1230'); put(tx0 + k, top + Math.round(k * k / 9), '#1a1230'); put(tx0 - Math.round(k / 2), top - 1 + Math.round(k / 3), '#1a1230'); put(tx0 + Math.round(k / 2), top - 1 + Math.round(k / 3), '#1a1230'); }
  }, s);
}

/** A spectrum (Winamp's bars): `n` bars of `bw` art pixels with a 1 px gap, `h` tall, blocks of 2, gold up to ember. */
export function spectrum(n, bw, h, { seed = 3, gap = 1, block = 2, cols = ['#f0a64a', '#ffc43c', '#ffe096', '#ff8040'], peak = '#fff3d8', bg = null, level = 1 } = {}) {
  let r = seed; const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  const W = n * (bw + gap) - gap;
  return art(W, h, (put) => {
    if (bg) for (let y = 0; y < h; y++) for (let x = 0; x < W; x++) put(x, y, bg);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), shape = Math.max(0.12, Math.min(1, (0.95 - t * 0.55) * (0.55 + rnd() * 0.6) + (i < 3 ? 0.08 : 0))) * level;
      const top = Math.round(h - shape * h); const pk = Math.max(0, top - 2 - Math.round(rnd() * 2));
      for (let y = h - 1; y >= top; y--) {
        if (block > 1 && (h - 1 - y) % block === block - 1) continue;   // the gaps between blocks
        const q = 1 - y / h; const col = q > 0.82 ? cols[3] : q > 0.6 ? cols[2] : q > 0.3 ? cols[1] : cols[0];
        for (let x = 0; x < bw; x++) put(i * (bw + gap) + x, y, col);
      }
      for (let x = 0; x < bw; x++) put(i * (bw + gap) + x, pk, peak, 0.9);
    }
  });
}

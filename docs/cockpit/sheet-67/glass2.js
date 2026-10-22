// Sheet 67 v2 (2026-10-22): the new hourglass art and the sand engine that drives it. Mockup code, not product code.
//
// His note on v1: "The timer itself looks like shit... the shit design makes the sands hard to see as they move." v1 used
// sheet 17's 15x25 glass: pale see-through glass behind gold sand (low contrast), straight X-shaped walls, 43 grains.
// v2 draws a bigger 27x35 hourglass with the rules that make sand read in game art:
//   - DARK glass inside (deep blue-grey, lighter down the middle where a round bulb catches light), LIGHT warm sand on it.
//     Sand is 4 shades from cream to amber; the darkest sand is still brighter than the lightest glass.
//   - Round onion bulbs, not straight walls, so the funnel dip in the top sand and the hill in the bottom read as shapes.
//   - The stream is the brightest thing in the picture, one pixel wide, colour-cycled.
//   - Glass edge is a cool grey-teal with a rim light on the right and a specular streak on the left that sits OVER the
//     sand (real glass is in front of the sand), so the glass reads as glass even when full.
//   - Frame in his language: dark pixel wood from Samara's own art (band.png / tray.png ramps), a dark-wood edge, never
//     black; gold only as small accents. Three frames: A walnut posts, B brass-banded, C lantern (no posts).
//   - 85 grains (v1: 43), so the sand moves twice as often and in smaller steps.
//
// Engine rules are v1's (docs/TIMER-RESEARCH.md): the brain owns the time; grains landed = floor(elapsed/total x N); a
// tiny canvas painted only when something changes; asleep between grains; nothing while hidden. New in v2:
//   - Pause turns the glass on its side with a spring (about half a second). Pixel-crisp rotation: the art is upscaled 8x
//     with Scale2x (the RotSprite idea), rotated, then sampled back on the art grid, so every frame is whole art pixels in
//     the palette, never a blur. Gravity turns with the glass, so the sand slides as it tips.
//   - Restart (hold) turns the glass right over (180 degrees) with the same spring; the fallen sand pours back into the top.

// ------------------------------------------------------------------ the shape (shared by all three frames)
export const W = 27, H = 35, CX = 13, NY = 17;
/** Inside half-width by distance from the neck (0 = the neck itself). Rows NY-12 .. NY+12 are glass. */
const HW = [0, 1, 2, 3, 4, 5, 5, 6, 6, 6, 6, 5, 4];
const hwAt = (y) => { const d = Math.abs(y - NY); return d < HW.length ? HW[d] : -1; };
export const TOP = NY - (HW.length - 1), BOT = NY + (HW.length - 1);   // first and last inside rows: 5 and 29
/** The square the glass turns in: big enough for the diagonal (sqrt(27^2+35^2) = 44.2), with even margins. */
export const S = 45;

const ZONE = new Int8Array(W * H);   // 1 top bulb, 2 bottom bulb, 3 the neck
for (let y = TOP; y <= BOT; y++) {
  const hw = hwAt(y);
  for (let x = CX - hw; x <= CX + hw; x++) ZONE[y * W + x] = y < NY ? 1 : y > NY ? 2 : 3;
}
const FILL_ROWS = 9;   // the top bulb starts full to 9 rows above the neck; the rows above stay air
export const N = (() => { let n = 0; for (let y = NY - FILL_ROWS; y < NY; y++) n += 2 * hwAt(y) + 1; return n; })();   // 85

// ------------------------------------------------------------------ colours
const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (h, a = 255) => { const [r, g, b] = hex(h); return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0; };
// Samara's wood (band.png / tray.png), darkest to lightest, plus one lit step for top faces
const WOOD = ['#120a05', '#1a1009', '#26180d', '#311f11', '#3e2816', '#54371f', '#6e4a2a', '#8a5e34'];
const GOLD = ['#6b4316', '#C98C14', '#FFC43C', '#FFE096'];
// the glass: inside (dark, a bulb is lighter down its middle), its wall, its lights
const GLASS = { deep: '#0d1317', in: '#131b21', mid: '#18232a', core: '#1d2a32', wallL: '#2c424c', wallR: '#3f5f6b', rim: '#7fb2c0', lip: '#4f7684', lipHi: '#9fd0dd' };
const SPEC = rgba('#e6f7fc', 200), SPEC2 = rgba('#bfe6f0', 120);
// sand, light to deep; one ramp per timer so two timers read apart
export const RAMPS = {
  gold: ['#FFF4D2', '#F9DA92', '#EDBD62', '#CF9645'],
  sea: ['#DDFBF4', '#9BE7D8', '#5CC4B3', '#3A9688'],
  plum: ['#F4E4FF', '#D3B0F5', '#AC82DE', '#8460B4'],
};
const STREAM = { gold: ['#FFFBEA', '#FFEBA8', '#F9DA92', '#FFEBA8'], sea: ['#F2FFFC', '#BFF3E8', '#9BE7D8', '#BFF3E8'], plum: ['#FCF5FF', '#E3CBFA', '#D3B0F5', '#E3CBFA'] };
const GLINT = rgba('#FFFFFF');

// ------------------------------------------------------------------ the three frames
/** Paint helper over a W x H Uint32 picture. */
function painter(px) {
  const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < W && y < H) px[y * W + x] = typeof c === 'string' ? rgba(c) : c; };
  const row = (y, x0, x1, c) => { for (let x = x0; x <= x1; x++) set(x, y, c); };
  return { set, row };
}

/** The glass itself: wall, lips, the dark inside (the inside is repainted by the engine; this is its empty colour). */
function paintGlass(px, inside) {
  const { set, row } = painter(px);
  for (let y = TOP; y <= BOT; y++) {
    const hw = hwAt(y);
    set(CX - hw - 1, y, GLASS.wallL); set(CX + hw + 1, y, GLASS.wallR);   // one-pixel steps: clean diagonals
  }
  // the lips where the glass meets the frame
  row(TOP - 1, CX - 5, CX + 5, GLASS.lip); row(BOT + 1, CX - 5, CX + 5, GLASS.lip);
  set(CX - 3, TOP - 1, GLASS.lipHi); set(CX - 2, TOP - 1, GLASS.lipHi); set(CX - 3, BOT + 1, GLASS.lipHi);
  // rim light: the right shoulder of each bulb catches the light from the room
  for (const y of [TOP + 1, TOP + 2, TOP + 3, BOT - 5, BOT - 4]) set(CX + hwAt(y) + 1, y, GLASS.rim);
  // the inside, empty
  for (let i = 0; i < W * H; i++) if (ZONE[i]) px[i] = inside[i];
}

/** The empty inside: dark, a little lighter down the middle of each bulb (it is round), darkest against the wall. */
function insideColours() {
  const c = new Uint32Array(W * H);
  for (let y = TOP; y <= BOT; y++) {
    const hw = hwAt(y);
    for (let x = CX - hw; x <= CX + hw; x++) {
      const d = Math.abs(x - CX), e = hw - d;
      c[y * W + x] = rgba(e === 0 && hw > 1 ? GLASS.deep : d <= Math.max(0, hw / 3 - 0.5) && hw > 2 ? GLASS.core : d <= hw / 2 + 0.5 ? GLASS.mid : GLASS.in);
    }
  }
  return c;
}

/** The specular streaks that sit OVER the sand (glass is in front of it): [x, y, colour]. */
function specular() {
  const out = [];
  for (const y of [TOP + 2, TOP + 3, TOP + 4, TOP + 5]) out.push([CX - hwAt(y) + 1, y, y === TOP + 2 ? SPEC : SPEC2]);
  out.push([CX - hwAt(TOP + 7) + 1, TOP + 7, SPEC2]);
  for (const y of [BOT - 6, BOT - 5, BOT - 4]) out.push([CX - hwAt(y) + 1, y, y === BOT - 6 ? SPEC : SPEC2]);
  return out;
}

// Wood and brass, as caps: edge (dark wood, never black), face (lit top), face highlight, body, body lit/shade, underside.
const WOODCAP = { e: WOOD[1], face: WOOD[6], hi: WOOD[7], body: WOOD[5], lit: WOOD[6], shade: WOOD[4], under: WOOD[3], grain: WOOD[4] };
const BRASSCAP = { e: WOOD[1], face: GOLD[2], hi: GOLD[3], body: GOLD[1], lit: GOLD[2], shade: '#9a6a12', under: GOLD[0], grain: '#b07c12' };

/** A cap: a pillow-shaped slab (ends rounded off by a pixel each row), light from above. `down` = the bottom cap. */
function cap(px, y0, down, opt) {
  const { set, row } = painter(px), p = opt.pal ?? WOODCAP;
  const x0 = opt.x0 ?? 0, x1 = opt.x1 ?? W - 1, rows = opt.rows ?? 4;
  const kinds = rows === 4 ? ['edge', 'face', 'body', 'under'] : ['edge', 'face', 'under'];
  const order = down ? (rows === 4 ? ['face', 'body', 'under', 'edge'] : ['face', 'under', 'edge']) : kinds;
  order.forEach((kind, i) => {
    const y = y0 + i;
    if (kind === 'edge') { row(y, x0 + 2, x1 - 2, p.e); return; }
    const inset = kind === 'body' ? 0 : 1;
    const a = x0 + inset, b = x1 - inset;
    row(y, a, b, kind === 'face' ? p.face : kind === 'body' ? p.body : p.under);
    set(a, y, p.e); set(b, y, p.e);
    if (kind === 'face') { for (let x = a + 2; x <= a + 7; x++) set(x, y, p.hi); set(b - 1, y, p.body); }
    if (kind === 'body') { set(a + 1, y, p.lit); set(b - 1, y, p.shade); for (let x = a + 10; x <= b - 5; x += 6) set(x, y, p.grain); }
    if (kind === 'under') { set(a + 1, y, p.shade); }
  });
}

/** A turned post, 4 wide: dark-wood edge, lit side, shade side, dark-wood edge. Beads stand one pixel proud each side. */
function post(px, x, opt) {
  const { set } = painter(px), pb = opt.beadPal ?? WOODCAP;
  for (let y = 4; y <= H - 5; y++) { set(x, y, WOOD[1]); set(x + 1, y, WOOD[6]); set(x + 2, y, WOOD[4]); set(x + 3, y, WOOD[1]); }
  for (const by of opt.beads ?? []) {
    set(x - 1, by, WOOD[1]); set(x, by, pb.hi); set(x + 1, by, pb.hi); set(x + 2, by, pb.body); set(x + 3, by, pb.shade); set(x + 4, by, WOOD[1]);
    // the post narrows into the bead: a lit pixel above, a shade pixel below
    set(x + 1, by - 1, pb.lit); set(x + 1, by + 1, pb.shade);
  }
}
const PL = 1, PR = W - 5;   // the posts' left columns

export const DESIGNS = {
  /** A: walnut. Dark wood caps that overhang turned posts; one small brass bead at each post's waist. Calm. */
  walnut: {
    name: 'Walnut', build(px) {
      cap(px, 0, false, {}); cap(px, H - 4, true, {});
      post(px, PL, { beads: [NY], beadPal: BRASSCAP }); post(px, PR, { beads: [NY], beadPal: BRASSCAP });
    },
  },
  /** B: brass caps. The same wooden posts, the caps in brass with brass beads. Dressier. */
  brass: {
    name: 'Brass caps', build(px) {
      cap(px, 0, false, { pal: BRASSCAP }); cap(px, H - 4, true, { pal: BRASSCAP });
      post(px, PL, { beads: [NY], beadPal: BRASSCAP }); post(px, PR, { beads: [NY], beadPal: BRASSCAP });
    },
  },
  /** C: lantern. No posts: a narrower wooden disc top and bottom, a brass knob on top, two small feet. The glass is it. */
  lantern: {
    name: 'Lantern', build(px) {
      const { set, row } = painter(px);
      row(0, CX - 1, CX + 1, GOLD[1]); set(CX - 1, 0, GOLD[3]); set(CX, 0, GOLD[2]); set(CX - 2, 0, WOOD[1]); set(CX + 2, 0, WOOD[1]);
      cap(px, 1, false, { x0: CX - 9, x1: CX + 9, rows: 3 });
      cap(px, H - 4, true, { x0: CX - 9, x1: CX + 9, rows: 3 });
      for (const x of [CX - 7, CX - 6, CX + 6, CX + 7]) set(x, H - 1, WOOD[1]);
    },
  },
};

/** The fixed picture of one frame (wood + glass + empty inside), and its specular overlay. Built once per design. */
export function buildArt(design) {
  const px = new Uint32Array(W * H), inside = insideColours();
  (DESIGNS[design] ?? DESIGNS.walnut).build(px);
  paintGlass(px, inside);
  // the lantern's disc sits on row 1-4: re-close the top lip over it
  return { px, inside, spec: specular() };
}

function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ------------------------------------------------------------------ the sand (no DOM: usable from node for pictures)
export class Sand {
  constructor(o = {}) {
    this.seed = o.seed ?? 1; this.rampName = RAMPS[o.ramp] ? o.ramp : 'gold';
    this.ramp = RAMPS[this.rampName].map((h) => rgba(h)); this.streamCols = STREAM[this.rampName].map((h) => rgba(h));
    this.art = buildArt(o.design ?? 'walnut');
    this.g = [0, 1];   // gravity in grid cells
    this.reset(0);
  }
  reset(released) {
    this.cells = new Uint8Array(W * H); this.rand = mulberry(this.seed);
    this.flying = []; this.released = 0; this.landed = 0;
    for (let y = NY - FILL_ROWS; y < NY; y++) for (let x = CX - hwAt(y); x <= CX + hwAt(y); x++) this.cells[y * W + x] = this.shade();
    for (let k = 0; k < released; k++) this.release(true);
    this.settle();
  }
  shade() { const r = this.rand(); return r < 0.16 ? 1 : r < 0.62 ? 2 : r < 0.9 ? 3 : 4; }
  count(z) { let n = 0; for (let i = 0; i < W * H; i++) if (ZONE[i] === z && this.cells[i]) n++; return n; }
  /** The grain nearest the neck in the top bulb leaves (the funnel dip forms above it as the rest tumbles in). */
  release(instant) {
    // Real sand leaves at the neck, and what you SEE is the surface sinking in the middle: a crater. So take the top
    // grain of the column that stands highest above a gentle V centred on the neck (a falling-sand rule alone digs from
    // the sides instead). The grain shown falling is drawn from the neck.
    const best = this.surface(1);
    if (best < 0) return;
    const s = this.cells[best]; this.cells[best] = 0; this.released++;
    if (instant) { this.land(s); this.settle(); } else this.flying.push({ y: NY, v: 1, s, up: false });
  }
  unrelease(instant) {
    let best = -1, by = 99;
    for (let y = NY + 1; y <= BOT; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (ZONE[i] === 2 && this.cells[i] && (y < by || (y === by && Math.abs(x - CX) < Math.abs((best % W) - CX)))) { by = y; best = i; } }
    if (best < 0) return;
    const s = this.cells[best]; this.cells[best] = 0; this.landed = Math.max(0, this.landed - 1); this.released = Math.max(0, this.released - 1);
    if (instant) { this.putTop(s); this.settle(); } else this.flying.push({ y: (best / W) | 0, v: -1, s, up: true });
  }
  /** The top bulb's surface: dir 1 = the top grain standing highest above the crater's V (the next to go), dir -1 = the
   *  empty cell just above the surface sitting lowest under it (where a returning grain goes). */
  surface(dir) {
    let best = -1, bs = -1e9;
    const side = this.rand() < 0.5 ? 1 : -1;
    for (let x = 0; x < W; x++) {
      let yt = -1; for (let y = TOP; y < NY; y++) if (ZONE[y * W + x] === 1 && this.cells[y * W + x]) { yt = y; break; }
      let yb = NY - 1; while (yb >= TOP && !ZONE[yb * W + x]) yb--;   // the column's lowest inside row
      if (yb < TOP) continue;
      if (dir > 0 && yt < 0) continue;
      const cell = dir > 0 ? yt : (yt < 0 ? yb : yt - 1);
      if (cell < TOP || ZONE[cell * W + x] !== 1) continue;
      const height = NY - cell, dx = Math.abs(x - CX);
      const sc = (height - dx * 0.45) * dir - dx * 0.01 + (x - CX) * side * 0.001;
      if (sc > bs) { bs = sc; best = cell * W + x; }
    }
    return best;
  }
  putTop(s) { const i = this.surface(-1); if (i >= 0) this.cells[i] = s; }
  floorBelow() { let y = NY + 1; while (y + 1 <= BOT && !this.cells[(y + 1) * W + CX]) y++; return y; }
  land(s) { const y = this.floorBelow(), i = y * W + CX; if (!this.cells[i]) this.cells[i] = s; else this.putBottom(s); this.landed++; }
  putBottom(s) { for (let y = BOT; y > NY; y--) for (const dx of [0, -1, 1, -2, 2, -3, 3, -4, 4, -5, 5, -6, 6]) { const i = y * W + CX + dx; if (ZONE[i] === 2 && !this.cells[i]) { this.cells[i] = s; return; } } }
  /** One falling-sand step with the current gravity (down, else diagonally down; sides in random order). */
  step() {
    const [gx, gy] = this.g, px = gy !== 0 ? 1 : 0, py = gx !== 0 ? 1 : 0;
    let moved = 0;
    const flip = this.rand() < 0.5;
    const xs = [], ys = [];
    for (let x = 0; x < W; x++) xs.push(gx > 0 ? W - 1 - x : gx < 0 ? x : (flip ? W - 1 - x : x));
    for (let y = 0; y < H; y++) ys.push(gy > 0 ? H - 1 - y : y);
    const c = this.cells;
    const free = (x, y, z) => x >= 0 && y >= 0 && x < W && y < H && ZONE[y * W + x] === z && !c[y * W + x];
    for (const y of ys) for (const x of xs) {
      const i = y * W + x, s = c[i]; if (!s) continue;
      const z = ZONE[i]; if (z === 3) continue;
      if (free(x + gx, y + gy, z)) { c[(y + gy) * W + x + gx] = s; c[i] = 0; moved++; continue; }
      const sgn = this.rand() < 0.5 ? 1 : -1;
      let done = false;
      for (const k of [sgn, -sgn]) {
        const ax = x + gx + px * k, ay = y + gy + py * k;
        if (free(ax, ay, z)) { c[ay * W + ax] = s; c[i] = 0; moved++; done = true; break; }
      }
      if (done) continue;
      // sand's slope: a grain on a slope steeper than 1 in 2 slides one cell sideways (it then tumbles down next step),
      // so piles settle at a sand-like angle instead of the falling-sand rule's 45 degrees
      for (const k of [sgn, -sgn]) {
        const sx = x + px * k, sy = y + py * k, fx = x + gx + 2 * px * k, fy = y + gy + 2 * py * k;
        if (free(sx, sy, z) && free(fx, fy, z)) { c[sy * W + sx] = s; c[i] = 0; moved++; break; }
      }
    }
    return moved;
  }
  settle() { for (let k = 0; k < 80 && this.step(); k++); }
  /** Turned right over: the picture at 180 degrees is the grid read backwards, so the fallen sand is now on top. Any sand
   *  that hadn't fallen yet is now in the bottom: it stays there, counted as landed, and the glass pours it back up the
   *  stream (a quick rewind) instead of jumping. */
  turnOver() {
    const c = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) c[W * H - 1 - i] = this.cells[i];
    for (let i = 0; i < W * H; i++) if (ZONE[i] === 3) c[i] = 0;
    this.cells = c;
    const down = this.count(2);
    let n = this.count(1) + down; while (n < N) { this.putTop(this.shade()); n++; }
    this.released = down; this.landed = down; this.flying = [];
    return down;
  }

  /** Compose the upright picture into `out` (W x H, Uint32 RGBA). phase = stream colour step, or -1 for no stream. */
  compose(out, o = {}) {
    const { px, inside, spec } = this.art, c = this.cells;
    out.set(px);
    for (let i = 0; i < W * H; i++) {
      if (!ZONE[i]) continue;
      const s = c[i];
      if (!s) { out[i] = inside[i]; continue; }
      // a grain with open glass above it catches the light (one shade lighter); against the wall, one darker
      const y = (i / W) | 0, x = i % W;
      const up = i - W, lit = up >= 0 && ZONE[up] === ZONE[i] && !c[up];
      const wall = !ZONE[i - 1] || !ZONE[i + 1];
      out[i] = this.ramp[Math.max(0, Math.min(3, s - 1 - (lit ? 1 : 0) + (wall && !lit ? 1 : 0)))];
      void x; void y;
    }
    if (o.phase >= 0 && this.released < N) {
      const fl = this.floorBelow();
      for (let y = NY; y <= fl; y++) out[y * W + CX] = this.streamCols[(y - o.phase + 400) % 4];
    }
    for (const g of this.flying) { const y = Math.max(TOP, Math.min(BOT, g.y)); out[y * W + CX] = this.streamCols[0]; }
    if (o.glint > 0) {
      const k = 14 - o.glint;
      for (let y = NY + 1; y <= BOT; y++) for (let x = 0; x < W; x++) { const i = y * W + x, d = x - (y - NY) - k + 4; if (ZONE[i] === 2 && c[i] && (d === 0 || d === 1)) out[i] = d === 0 ? GLINT : this.streamCols[1]; }
    }
    for (const [x, y, col] of spec) { const i = y * W + x; out[i] = blend(out[i], col); }
    return out;
  }
}
function blend(under, over) {
  const a = (over >>> 24) / 255; if (a >= 1) return over;
  const r = Math.round((over & 255) * a + (under & 255) * (1 - a)), g = Math.round(((over >> 8) & 255) * a + ((under >> 8) & 255) * (1 - a)), b = Math.round(((over >> 16) & 255) * a + ((under >> 16) & 255) * (1 - a));
  return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

// ------------------------------------------------------------------ crisp rotation (RotSprite, simplified)
/** Scale2x (EPX) on a Uint32 picture: edges stay sharp and diagonals stay smooth, no new colours. */
function scale2x(src, w, h) {
  const out = new Uint32Array(w * h * 4), W2 = w * 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const P = src[y * w + x], A = y > 0 ? src[(y - 1) * w + x] : P, B = x < w - 1 ? src[y * w + x + 1] : P, C = x > 0 ? src[y * w + x - 1] : P, D = y < h - 1 ? src[(y + 1) * w + x] : P;
    const o = (y * 2) * W2 + x * 2;
    out[o] = C === A && C !== D && A !== B ? A : P;
    out[o + 1] = A === B && A !== C && B !== D ? B : P;
    out[o + W2] = D === C && D !== B && C !== A ? C : P;
    out[o + W2 + 1] = B === D && B !== A && D !== C ? D : P;
  }
  return out;
}
/** Turn the W x H picture by `deg` (clockwise) into an S x S picture on the same art grid. */
export function rotate(src, deg, dst) {
  dst.fill(0);
  const ox = (S - W) / 2, oy = (S - H) / 2;
  const a = ((deg % 360) + 360) % 360;
  if (a === 0) { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) dst[(y + oy) * S + x + ox] = src[y * W + x]; return dst; }
  let up = src, w = W, h = H;
  for (let k = 0; k < 3; k++) { up = scale2x(up, w, h); w *= 2; h *= 2; }   // 8x
  const r = (a * Math.PI) / 180;
  let cs = Math.cos(r), sn = Math.sin(r);
  if (Math.abs(cs) < 1e-9) cs = 0; if (Math.abs(sn) < 1e-9) sn = 0;
  for (let oy2 = 0; oy2 < S; oy2++) for (let ox2 = 0; ox2 < S; ox2++) {
    const px = ox2 + 0.5 - S / 2, py = oy2 + 0.5 - S / 2;
    const sx = cs * px + sn * py + W / 2, sy = -sn * px + cs * py + H / 2;
    if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
    dst[oy2 * S + ox2] = up[Math.floor(sy * 8 + 1e-6) * w + Math.floor(sx * 8 + 1e-6)];
  }
  return dst;
}

// ------------------------------------------------------------------ the live glass (DOM)
export class Glass {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{ scale?: number, design?: string, ramp?: string, seed?: number, clock?: { now(): number, rate?: number }, onEnd?: () => void }} o
   */
  constructor(canvas, o = {}) {
    this.c = canvas; this.scale = o.scale ?? 2; this.o = o;
    this.sand = new Sand({ seed: o.seed, ramp: o.ramp, design: o.design });
    this.clock = o.clock ?? { now: () => Date.now() }; this.frameMs = 100; this.onEnd = o.onEnd ?? null;
    this.t = null; this.calmOn = false; this.phase = 0; this.ended = false; this.glint = 0;
    this.angle = 0; this.target = 0; this.vel = 0; this.raf = 0; this.timer = 0; this.afterTurn = null;
    this.stats = { paints: 0 };
    this.pic = new Uint32Array(W * H); this.rot = new Uint32Array(S * S);
    this.hidden = document.visibilityState === 'hidden';
    this.onVis = () => { this.hidden = document.visibilityState === 'hidden'; if (this.hidden) this.sleep(); else this.resync(); };
    document.addEventListener('visibilitychange', this.onVis);
    this.fit(); this.paint();
  }
  setDesign(d) { this.sand.art = buildArt(d); this.paint(); }
  set(t) {
    const old = this.t; this.t = t ? { ...t } : null;
    if (!this.rewinding && (!old || !t || Math.abs(this.targetLanded() - this.sand.landed - this.sand.flying.length) > 8)) this.resync(); else this.wake();
  }
  calm(on) { this.calmOn = !!on; this.wake(); }
  left() { if (!this.t) return 0; return this.t.paused ? this.t.paused : Math.max(0, this.t.end - this.clock.now()); }
  running() { return !!this.t && !this.t.paused && this.left() > 0; }
  targetLanded() { if (!this.t || !this.t.total) return 0; return Math.max(0, Math.min(N, Math.floor((1 - this.left() / this.t.total) * N + 1e-9))); }
  fallMs() { const d = this.sand.floorBelow() - NY; return (1 + Math.ceil(Math.max(0, d - 1) / 2)) * this.frameMs; }
  targetReleased() { if (!this.t || !this.t.total) return 0; return Math.max(0, Math.min(N, Math.floor((1 - Math.max(0, this.left() - this.fallMs()) / this.t.total) * N + 1e-9))); }
  resync() { this.sand.reset(this.targetLanded()); this.ended = false; this.paint(); this.wake(); }
  destroy() { this.sleep(); cancelAnimationFrame(this.raf); document.removeEventListener('visibilitychange', this.onVis); }

  // ---- turning: pause (on its side), go on (upright), restart (right over)
  /** Lay it on its side (true) or stand it up (false). The sand slides as it turns. */
  tip(on) { this.landFlying(); this.turnTo(on ? 90 : 0); }
  /** Turn it right over; `done` runs when it has landed upright (the sand is in the top again). */
  turnOver(done) { this.landFlying(); this.afterTurn = () => { this.rewinding = this.sand.turnOver() > 0; this.angle = 0; this.target = 0; this.vel = 0; this.ended = false; this.glint = 0; this.paint(); done?.(); }; this.turnTo(180); }
  landFlying() { for (const g of this.sand.flying) { if (g.up) this.sand.putTop(g.s); else this.sand.land(g.s); } this.sand.flying = []; }
  turnTo(deg) {
    this.target = deg; this.sleep();
    if (this.raf) return;
    let last = performance.now(), n = 0;
    const tick = (now) => {
      const dt = Math.min(0.034, (now - last) / 1000); last = now;
      // a spring: about half a second, a hair of overshoot, then still
      const k = 160, damp = 19;
      this.vel += (k * (this.target - this.angle) - damp * this.vel) * dt; this.angle += this.vel * dt;
      const done = Math.abs(this.target - this.angle) < 0.4 && Math.abs(this.vel) < 6;
      if (done) this.angle = this.target;
      // gravity follows the screen's "down" as it turns
      const r = (this.angle * Math.PI) / 180, gx = Math.sin(r), gy = Math.cos(r);
      this.sand.g = Math.abs(gx) > Math.abs(gy) ? [Math.sign(gx), 0] : [0, Math.sign(gy)];
      this.sand.step(); n++;
      this.paint();
      if (!done) { this.raf = requestAnimationFrame(tick); return; }
      this.raf = 0;
      if (this.afterTurn) { const f = this.afterTurn; this.afterTurn = null; this.sand.g = [0, 1]; f(); }
      this.wake();
    };
    this.raf = requestAnimationFrame(tick);
  }

  // ---- the loop (sand only; turning has its own frames above)
  sleep() { clearTimeout(this.timer); this.timer = 0; }
  wake() { if (this.hidden || this.raf) return; this.sleep(); this.timer = setTimeout(() => this.frame(), 0); }
  frame() {
    this.timer = 0;
    const sd = this.sand; let busy = false, dirty = false;
    const upright = this.angle === 0;
    if (upright) sd.g = [0, 1];
    if (this.t && upright) {
      const want = this.running() ? this.targetReleased() : sd.released;
      let n = 0;
      while (sd.released < want && n++ < 3) sd.release(false);
      while (sd.released > want && sd.landed > 0 && n++ < (this.rewinding ? 7 : 3)) sd.unrelease(false);
      if (this.rewinding && sd.released <= want && !sd.flying.length) this.rewinding = false;
      if (sd.released < want || (sd.released > want && sd.landed > 0)) busy = true;
    }
    for (const g of sd.flying) {
      if (g.up) { g.y -= 2; if (g.y <= NY) { g.done = true; sd.putTop(g.s); } continue; }
      g.y += g.v; g.v = Math.min(2, g.v + 1);
      const fl = sd.floorBelow(); if (g.y >= fl) { g.done = true; sd.land(g.s); }
    }
    if (sd.flying.length) { sd.flying = sd.flying.filter((g) => !g.done); dirty = busy = true; }
    if (sd.step() + sd.step()) dirty = busy = true;   // two steps a frame: a slope settles in about a second
    if (this.streaming() && !this.calmOn) { this.phase++; dirty = busy = true; }
    if (this.t && !this.ended && this.left() <= 0 && sd.landed >= N && !sd.flying.length) { this.ended = true; this.glint = 14; this.onEnd?.(); }
    if (this.glint > 0) { this.glint--; dirty = busy = true; }
    if (dirty) this.paint();
    if (this.hidden) return;
    let next = busy ? this.frameMs : Infinity;
    if (!busy && this.running() && sd.released < N && upright) {
      const per = this.t.total / N, k = sd.released + 1;
      const leaveAt = this.t.end - this.t.total + k * per - this.fallMs();
      next = Math.max(this.frameMs, (leaveAt - this.clock.now()) / (this.clock.rate ?? 1) + 2);
    }
    if (next !== Infinity) this.timer = setTimeout(() => this.frame(), next);
  }
  streaming() { return this.running() && this.angle === 0 && this.sand.released < N; }

  // ---- painting: whole device pixels per art pixel, always
  fit() {
    const dpr = (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1;
    const k = Math.max(1, Math.round(this.scale * dpr));
    this.k = k; this.c.width = S * k; this.c.height = S * k;
    this.c.style.width = (S * k) / dpr + 'px'; this.c.style.height = (S * k) / dpr + 'px';
    this.ctx = this.c.getContext('2d'); this.img = this.ctx.createImageData(S * k, S * k);
    this.u32 = new Uint32Array(this.img.data.buffer);
  }
  paint() {
    this.stats.paints++;
    this.sand.compose(this.pic, { phase: this.streaming() ? (this.calmOn ? 0 : this.phase) : -1, glint: this.glint });
    rotate(this.pic, this.angle, this.rot);
    const k = this.k, Wd = S * k, u = this.u32;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const v = this.rot[y * S + x];
      for (let j = 0; j < k; j++) { let o = (y * k + j) * Wd + x * k; for (let i = 0; i < k; i++) u[o++] = v; }
    }
    this.ctx.putImageData(this.img, 0, 0);
  }
}

/** One clock line per second, on the second. Returns a stop function. */
export function secondly(fn, clock = { now: () => Date.now() }, endOf = () => 0) {
  let t = 0, stopped = false;
  const tick = () => {
    if (stopped) return;
    fn();
    const end = endOf(), now = clock.now();
    const ms = end ? ((end - now) % 1000 + 1000) % 1000 || 1000 : 1000 - (now % 1000);
    t = setTimeout(tick, ms / (clock.rate ?? 1) + 4);
  };
  tick();
  return () => { stopped = true; clearTimeout(t); };
}
export const fmt = (ms) => {
  ms = Math.max(0, Math.ceil(ms / 1000) * 1000);
  const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
};

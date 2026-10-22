// The balloon's shape: a soft-edged rectangle whose outline opens into a comic tail and closes again,
// as ONE path.
//
// Why a path and not CSS. A tail built as a second element always shows a seam where it meets the
// body, because the body's own border runs straight across the join. Drawing both as one closed path
// and stroking it once is the only way the ink line carries round the body and out along the tail.
// CSS clip-path can make the same silhouette, but it discards the stroke and the drop shadow, and
// its "border" is an inset copy of the shape which thins away to nothing at a sharp tail tip.
//
// Why it is regenerated rather than scaled. Stretching a fixed viewBox to fit a longer reply distorts
// the corner radii and the tail along with it, so a one-line and a twenty-line balloon would not look
// like the same object. `vector-effect: non-scaling-stroke` fixes the line width and nothing else, so
// it does not help. Every balloon library worth reading regenerates the path, and so does this.
//
// The one real rule comic lettering states (Blambot): a tail follows an imaginary line to the CENTRE
// of the balloon. It is not placed at a chosen angle. `mouthOn` is what enforces that.

/**
 * The ink line. Was 5; the Smoother look he picked on sheet 13 (2026-10-10) is 4, with corners of 19
 * instead of 15 and a soft shadow under the hard one. Colours and the carve are unchanged.
 */
export const OW = 4;
/** Corner radius, Smoother look. */
export const RADIUS = 19;
/**
 * How far along the line to his head the tail stops.
 *
 * Comic lettering says 50 to 60 per cent of the way, and never touching him. On the real desktop he
 * is much closer to the balloon's corner than the sheet assumed, so 0.62 of a short distance is a
 * short tail - which is correct. The first build used 0.62 of a GUESSED 96px and came out 80px past
 * his head, like a wire. The distance now comes from the Shell, which knows where he actually is.
 */
export const REACH = 0.75;   // 2026-10-12: was .55; with the panel moved in, the tail now meets his head

const n = (v) => (Math.round(v * 10) / 10);

/** The shortest and longest a tail may be, measured from the edge it leaves. */
export const TAIL_MIN = 26, TAIL_MAX = 58;   // was 46; still inside the 62 px of tail room under the panel

/**
 * The balloon outline, body and tail, as one closed path.
 *
 * `head` is where Aang's head is, in the balloon's own coordinates (0,0 is its top-left), and
 * everything about the tail follows from it:
 *
 *   - IT PICKS ITS EDGE. Whichever edge the ray from the balloon's centre to his head crosses is the
 *     one the tail leaves from. Pinning it to the right edge drew a tail running straight down the
 *     side like a hook when he was standing below the balloon, which is where he usually is.
 *   - It leaves at the point where that ray crosses, which is Blambot's rule, verbatim from their
 *     lettering guide: a tail follows an imaginary line to the centre of the balloon. Extend any
 *     tail here backwards and it runs through the middle.
 *   - Its length is a fraction of the distance to him, clamped. He stands about 14px from the
 *     balloon's edge, so unclamped it computes to 7px and vanishes; a guessed 96px drew a wire past
 *     his head.
 *   - Its base scales with its length, so a short tail is a stub and a long one is a taper.
 *
 * @param {number} w @param {number} h  the drawn size, ink line included
 * @param {{x:number,y:number}} head  his head, in this balloon's coordinates
 * @param {{r?:number}} [opt]
 */
export function balloonPath(w, h, head, opt = {}) {
  const { x0, y0, x1, y1, r, side, A, B, tip, c1, c2 } = tailGeom(w, h, head, opt);
  const tail = `L ${n(A.x)} ${n(A.y)} Q ${n(c1.x)} ${n(c1.y)} ${n(tip.x)} ${n(tip.y)} `
    + `Q ${n(c2.x)} ${n(c2.y)} ${n(B.x)} ${n(B.y)} `;

  // The four edges clockwise from the top-left corner, each with the tail spliced in if it is theirs.
  const corner = (x, y, ax, ay) => `Q ${n(x)} ${n(y)} ${n(ax)} ${n(ay)} `;
  let d = `M ${n(x0 + r)} ${n(y0)} `;
  d += side === 'top' ? tail : '';
  d += `L ${n(x1 - r)} ${n(y0)} ` + corner(x1, y0, x1, y0 + r);
  d += side === 'right' ? tail : '';
  d += `L ${n(x1)} ${n(y1 - r)} ` + corner(x1, y1, x1 - r, y1);
  d += side === 'bottom' ? tail : '';
  d += `L ${n(x0 + r)} ${n(y1)} ` + corner(x0, y1, x0, y1 - r);
  d += side === 'left' ? tail : '';
  d += `L ${n(x0)} ${n(y0 + r)} ` + corner(x0, y0, x0 + r, y0) + 'Z';
  return d;
}

// 2026-10-21: the tail's working-out, pulled out of balloonPath unchanged so the wood rim can ask where the tail goes
// without re-reading the path string. balloonPath draws exactly what it drew before.
function tailGeom(w, h, head, opt = {}) {
  const x0 = OW / 2, y0 = OW / 2, x1 = w - OW / 2, y1 = h - OW / 2;
  const r = Math.min(opt.r ?? RADIUS, (y1 - y0) / 2, (x1 - x0) / 2);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const dx = head.x - cx, dy = head.y - cy;

  // Which edge does the centre-to-head ray leave by? Compare how far the ray must travel to reach
  // each side; the smaller one is the side it crosses.
  const tX = dx !== 0 ? (dx > 0 ? x1 - cx : x0 - cx) / dx : Infinity;
  const tY = dy !== 0 ? (dy > 0 ? y1 - cy : y0 - cy) / dy : Infinity;
  const side = tX <= tY ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'bottom' : 'top');
  const horizontal = side === 'right' || side === 'left';

  // Where it crosses, kept inside the straight run so the mouth never opens on a rounded corner.
  const t = Math.min(tX, tY);
  const ex = horizontal ? (side === 'right' ? x1 : x0)
    : Math.max(x0 + r + 4, Math.min(x1 - r - 4, cx + t * dx));
  const ey = horizontal ? Math.max(y0 + r + 4, Math.min(y1 - r - 4, cy + t * dy))
    : (side === 'bottom' ? y1 : y0);

  const away = Math.hypot(head.x - ex, head.y - ey) || 1;
  const len = Math.max(TAIL_MIN, Math.min(TAIL_MAX, away * REACH));
  const tip = { x: ex + ((head.x - ex) / away) * len, y: ey + ((head.y - ey) / away) * len };
  const mouth = Math.max(20, Math.min(46, len * 0.8));

  // The two points the tail leaves and returns by, along the edge, in clockwise order.
  const lo = horizontal ? Math.max(y0 + r + 2, ey - mouth / 2) : Math.max(x0 + r + 2, ex - mouth / 2);
  const hi = horizontal ? Math.min(y1 - r - 2, ey + mouth / 2) : Math.min(x1 - r - 2, ex + mouth / 2);
  const A = horizontal ? { x: ex, y: side === 'right' ? lo : hi } : { x: side === 'bottom' ? hi : lo, y: ey };
  const B = horizontal ? { x: ex, y: side === 'right' ? hi : lo } : { x: side === 'bottom' ? lo : hi, y: ey };
  // A near-straight taper with only a slight bow. Control points past the midpoint put a kink in it.
  const c1 = { x: (A.x + tip.x) / 2, y: (A.y + tip.y) / 2 };
  const c2 = { x: (B.x + tip.x) / 2, y: (B.y + tip.y) / 2 };
  return { x0, y0, x1, y1, r, side, A, B, tip, c1, c2 };
}

/**
 * Paint that path as one of his carved panels.
 *
 * A CSS panel gets its lit top lip and shaded bottom from inset box-shadows, and inset shadows only
 * follow a rectangle. This shape has a tail, so the same carve is built from the path itself: five
 * passes, each clipped to the shape and nudged a few pixels. The carve then follows the tail for
 * free, because the tail is part of the same path.
 */
// `wood` (sheet 24, the Lantern brief): the browser's dark tray wood instead of parchment, the same tail and ink line.
//
// Sheet 53 (2026-10-21): every piece is named (the paper's three stops p1-p3, the hard shadow, the ink) so the look is
// set from bubble.css's custom properties (.rimB: --paper-1..3, --rim-ink, --rim-w) and not baked in here. `g.rim` sits
// under the ink line; sheet 55's wood rim (his pick S2, 2026-10-21, no studs) is drawn into it, see the end of this file.
// 2026-10-21, sheet 55 S2: `rim` ({ w, h, head }, the body's size and his head in its coordinates) puts his chosen wood
// rim into `g.rim`. It sits OUTSIDE the paper, so the group is no longer clipped to the shape, the ink line and the hard
// shadow step aside (bubble.css #skin.rimmed), and the paper gets a 3 px stroke of itself so its round corners leave
// no dark speck between paper and wood. Nothing inside the paper changes.
export function paintBalloon(svg, w, h, d, uid, wood = false, rim = null) {
  const rimmed = Boolean(rim && !wood && RIM.ready);
  const rimArt = rimmed ? rimMarkup(svg, Math.round(rim.w), Math.round(rim.h), rim.head, d) : '';
  svg.classList.toggle('rimmed', rimmed);
  svg.setAttribute('viewBox', `0 0 ${n(w)} ${n(h)}`);
  svg.setAttribute('width', String(Math.ceil(w)));
  svg.setAttribute('height', String(Math.ceil(h)));
  svg.innerHTML =
    `<defs>`
    + `<linearGradient id="bg${uid}" x1="0" y1="0" x2="0" y2="1">`
    + `<stop class="p1" offset="0" stop-color="#F6E6C6"/><stop class="p2" offset=".45" stop-color="#ECD5A8"/>`
    + `<stop class="p3" offset="1" stop-color="#DEC28C"/></linearGradient>`
    + `<clipPath id="bc${uid}"><path d="${d}"/></clipPath>`
    + (wood ? `<pattern id="wd${uid}" patternUnits="userSpaceOnUse" width="128" height="256"><image href="art/browser/tray.png" width="128" height="256" style="image-rendering:pixelated"/></pattern>` : '')
    + `</defs>`
    + `<filter id="sf${uid}" x="-20%" y="-20%" width="140%" height="160%"><feGaussianBlur stdDeviation="7"/></filter>`
    // 1. a soft shadow far under it, then the hard contact shadow (Smoother look, sheet 13)
    + `<path d="${d}" fill="rgba(10,5,20,.45)" transform="translate(0,9)" filter="url(#sf${uid})"/>`
    + `<path class="hard" d="${d}" fill="rgba(0,0,0,.42)" transform="translate(0,3)"/>`
    // 2. the parchment
    + `<path class="paper" d="${d}" fill="url(#${wood ? 'wd' : 'bg'}${uid})"${rimmed ? ` stroke="url(#bg${uid})" stroke-width="3"` : ''}/>`
    // 3 and 4. the lit top lip and the shaded bottom, clipped so they stay inside the edge
    + `<g clip-path="url(#bc${uid})">`
    + `<path d="${d}" fill="none" stroke="${wood ? 'rgba(255,224,150,.10)' : 'rgba(255,255,255,.5)'}" stroke-width="12" transform="translate(0,6)"/>`
    + `<path d="${d}" fill="none" stroke="${wood ? 'rgba(0,0,0,.35)' : 'rgba(150,110,60,.26)'}" stroke-width="12" transform="translate(0,-6)"/>`
    + `</g>`
    // 4b. the rim (sheet 55 S2): pixel wood round the outside of the paper and its tail; empty on the Lantern
    + (rimmed ? `<g class="rim">${rimArt}</g>` : `<g class="rim" clip-path="url(#bc${uid})"></g>`)
    // 5. the ink line, last, so nothing is drawn across it
    + `<path class="ink" d="${d}" fill="none" stroke="#120A05" stroke-width="${OW}" stroke-linejoin="round"/>`;
}

/**
 * How much room the tail needs beyond the body, to the right and underneath.
 *
 * His head sits 96px right and 58px below the balloon's bottom-right corner (anchor.ts: the corner is
 * sprite.left + 16, sprite.top + 38, and his head is at 112,96 inside the 224 sprite). The tail stops
 * REACH of the way along that line, plus a little slack for the ink line and the shadow.
 */
/**
 * The room the tail is allowed to hang in, right of the body and under it.
 *
 * A budget, not a measurement: the Shell says where his head is and the tail is clipped to this so a
 * freak position cannot push it off the window. The window reserves exactly this much (bubble.css
 * `.wrap`, and reportSize in bubble.js), so the two have to agree.
 */
export const PAD_R = 70, PAD_B = 46;
/** Where to aim when the Shell has not said yet: just past the corner, which is where he usually is. */
/** Where to aim before the Shell has said: just off the right edge, level with the middle. */
export const DEFAULT_AIM = { x: 40, y: 0, flip: false };
/**
 * 2026-10-22, comic lettering (docs/POPOUTS-NOTES-RESEARCH.md section 1): the tail aims at his MOUTH, not his head's
 * centre. The Shell sends the head (frame 112, 96); his mouth is 26 px below it on every idle frame (idle_0.png: the
 * mouth line runs x 109..117 at y 122), times the pet's scale. The reach stays REACH (0.75, his 2026-10-12 call).
 */
export const MOUTH_FROM_HEAD = { x: 0, y: 26 };

/**
 * The third width.
 *
 * Width grows BEFORE height, because a balloon pinned to one width can only grow downward and a long
 * reply becomes a tall narrow chimney running up the screen: unreadable, and nothing like a balloon.
 * The first two steps already exist and are the painted original's, so they are kept rather than
 * replaced: 256 normally, 416 once a reply needs more than one line (BubbleView WideExtra = 160).
 * This adds the third, 556, which is also already in the C# as ScrollbackExtra = 300, for a reply so
 * long that even 416 would run off the top. Same three widths Aang has always had, used for one more
 * thing.
 */
export const WIDEST_AFTER_LINES = 18;

// ---------------------------------------------------------------- the wood rim (sheet 55, his pick S2, 2026-10-21)
// A slim band of Samara's own pixel wood (art/browser/band.png, its real grain) round the outside of the paper and on
// round the tail. No studs, no caps, no gold line: he threw those out on sheet 54 as "way too over the top".
//
// It is pixel art, so it is never a vector stroke: every art pixel is 2 x 2 screen pixels, placed on whole pixels and
// drawn with image-rendering:pixelated. The colours are the sheet's own, lifted from its picture maker
// (test/electron/rim-engine.js + quiet-takes.js S2): a dark-wood outer edge one art pixel deep, then three rows of the
// band's grain running along the edge, lit on the top and left, a shade darker on the bottom and right, and a one art
// pixel contact shadow under it.
//
// Why it is cheap enough to redraw on every frame of the 520 ms grow. The sheet's engine works out every pixel of the
// whole bubble each time (rasterise, grow, measure depth, paint, encode): fine for a picture, far too slow for a
// bubble that changes size 30 times in half a second. A rounded rectangle's rim is the same four corners and four
// straight runs at any size, so those are worked out ONCE (with the sheet's own maths, on a sample bubble) and each
// frame only places eight ready pieces. The tail is the one part whose shape changes, so only a small patch round it is
// worked out, and remembered for the next time the tail lands in the same place.
/** The band: 4 art pixels of 2 screen pixels, so the bubble sits 8 px further from Aang (bubble.css .wrap.rimB). */
export const RIM_P = 2, RIM_E = 4, RIM_G = RIM_P * RIM_E;
const RIM = { ready: false, tex: null, tails: new Map(), stops: null, scratch: null };
/** The tiles cut from the sample: 20 art pixels square at each corner (the whole curve), 64 = one band.png repeat. */
const RM = 8, RREF = 200, RCUT = 20, RREP = 64;

const rhex = (h) => { if (Array.isArray(h)) return h; const v = h.replace('#', ''); return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16), 255]; };
const rmix = (a, b, k) => { a = rhex(a); b = rhex(b); return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * k)).concat(255); };
const rmul = (a, k) => { a = rhex(a); return [0, 1, 2].map((i) => Math.max(0, Math.min(255, Math.round(a[i] * k)))).concat(255); };
/** band.png, grain running along the edge: u along it, v across it. */
function grain(u, v) {
  const t = RIM.tex; u = ((Math.floor(u) % t.w) + t.w) % t.w; v = ((v % t.h) + t.h) % t.h;
  const i = (v * t.w + u) * 4; return [t.d[i], t.d[i + 1], t.d[i + 2], 255];
}
const lit3 = (l, a, b, c) => (l > 0.3 ? a : l < -0.3 ? c : b);
// S2's colours, parsed once (this runs per pixel of the tail's patch on every frame of a grow)
const EDGE = ['#422a18', '#3a2516', '#2c1c10'].map(rhex), LIT = rhex('#6e4a2a'), SHADE = rhex('#966e3c');
/** S2's colour for one art pixel, verbatim from quiet-takes.js. null = the SVG paper shows through. */
function s2(c) {
  if (c.d === 0) return lit3(c.lit, EDGE[0], EDGE[1], EDGE[2]);                      // soft dark-wood edge, not black
  if (c.d < RIM_E) {
    const w = grain(c.u, 2 + (c.d - 1) * 4);                                           // band.png's grain rows, along the edge
    if (c.d === 1 && c.lit > 0.3) return rmix(w, LIT, 0.65);                           // lit top / left
    return rmul(w, lit3(c.lit, 1.08, 1.0, 0.86));                                      // bottom / right a shade darker
  }
  // past the band: the body's own SVG paper, except in the tail and over its mouth, where the paper is painted with
  // B's own bottom shade so the mouth has no seam
  if (!c.tail && c.dB - RIM_E >= 0 && !(c.d > c.dB && c.dB - RIM_E < 3)) return null;
  return rmix(c.paper(), SHADE, 0.26);
}
const SHADOW = [12, 6, 2, 80];

/** The body outline balloonPath draws, without a tail (inset by the ink line, corners of RADIUS). */
function bodyPath(w, h) {
  const x0 = OW / 2, y0 = OW / 2, x1 = w - OW / 2, y1 = h - OW / 2, r = Math.min(RADIUS, (y1 - y0) / 2, (x1 - x0) / 2);
  const q = (x, y, ax, ay) => `Q ${n(x)} ${n(y)} ${n(ax)} ${n(ay)} `;
  return `M ${n(x0 + r)} ${n(y0)} L ${n(x1 - r)} ${n(y0)} ` + q(x1, y0, x1, y0 + r) + `L ${n(x1)} ${n(y1 - r)} ` + q(x1, y1, x1 - r, y1)
    + `L ${n(x0 + r)} ${n(y1)} ` + q(x0, y1, x0, y1 - r) + `L ${n(x0)} ${n(y0 + r)} ` + q(x0, y0, x0 + r, y0) + 'Z';
}
/** A path filled at art scale with no anti-aliasing: (sx, sy) is the screen point that lands on art pixel (0, 0). */
function artMask(d, cw, ch, sx, sy) {
  const c = RIM.scratch || (RIM.scratch = document.createElement('canvas'));
  if (c.width < cw) c.width = cw;
  if (c.height < ch) c.height = ch;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cw, ch);
  g.setTransform(1 / RIM_P, 0, 0, 1 / RIM_P, -sx / RIM_P, -sy / RIM_P); g.fill(new Path2D(d));
  const a = g.getImageData(0, 0, cw, ch).data, m = new Uint8Array(cw * ch);
  for (let i = 0; i < m.length; i++) m[i] = a[i * 4 + 3] >= 128 ? 1 : 0;
  return m;
}
/**
 * Grown by E art pixels with a round brush (the sheet's dilate, same pixels). Done row by row: each pixel's distance along
 * its row to the nearest set pixel is found once, then a brush row dy only has to ask whether that distance fits its
 * half-width, so it checks 2E+1 rows instead of every brush pixel (it is per frame for the tail's patch).
 */
function grow(m, cw, ch, E) {
  const H = new Int16Array(cw * ch), BIG = 32000, R = E + 0.45;
  for (let y = 0; y < ch; y++) {
    let last = -BIG; const row = y * cw;
    for (let x = 0; x < cw; x++) { if (m[row + x]) last = x; H[row + x] = Math.min(BIG, x - last); }
    last = BIG;
    for (let x = cw - 1; x >= 0; x--) { if (m[row + x]) last = x; const v = last - x; if (v < H[row + x]) H[row + x] = v; }
  }
  const half = []; for (let dy = -E; dy <= E; dy++) half.push(Math.floor(Math.sqrt(Math.max(0, R * R - dy * dy))));
  const o = new Uint8Array(cw * ch);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const i = y * cw + x; if (m[i]) { o[i] = 1; continue; }
    for (let k = 0; k <= 2 * E; k++) { const Y = y + k - E; if (Y >= 0 && Y < ch && H[Y * cw + x] <= half[k]) { o[i] = 1; break; } }
  }
  return o;
}
/** Chamfer distance to the nearest pixel outside the mask (1 for the outermost ring), the sheet's (anything past the
 *  edge counts as outside). Written without helper calls: it runs on every frame of a grow for the tail's patch. */
function depthMap(m, cw, ch) {
  const D = new Float32Array(cw * ch), S = Math.SQRT2;
  for (let i = 0; i < D.length; i++) D[i] = m[i] ? 1e9 : 0;
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const i = y * cw + x; let v = D[i]; if (!v) continue;
    const l = x > 0 ? D[i - 1] : 0, u = y > 0 ? D[i - cw] : 0;
    const ul = x > 0 && y > 0 ? D[i - cw - 1] : 0, ur = x < cw - 1 && y > 0 ? D[i - cw + 1] : 0;
    if (l + 1 < v) v = l + 1; if (u + 1 < v) v = u + 1; if (ul + S < v) v = ul + S; if (ur + S < v) v = ur + S;
    D[i] = v;
  }
  for (let y = ch - 1; y >= 0; y--) for (let x = cw - 1; x >= 0; x--) {
    const i = y * cw + x; let v = D[i]; if (!v) continue;
    const r = x < cw - 1 ? D[i + 1] : 0, b = y < ch - 1 ? D[i + cw] : 0;
    const br = x < cw - 1 && y < ch - 1 ? D[i + cw + 1] : 0, bl = x > 0 && y < ch - 1 ? D[i + cw - 1] : 0;
    if (r + 1 < v) v = r + 1; if (b + 1 < v) v = b + 1; if (br + S < v) v = br + S; if (bl + S < v) v = bl + S;
    D[i] = v;
  }
  return D;
}
const depthOf = (v) => Math.ceil(v - 1e-4) - 1;
/** How much this pixel's edge faces the light (top-left, mostly top): -1..1. */
function litOf(D, cw, ch, x, y) {
  const g = (X, Y) => (X < 0 || Y < 0 || X >= cw || Y >= ch ? 0 : D[Y * cw + X]);
  const nx = g(x - 1, y) - g(x + 1, y), ny = g(x, y - 1) - g(x, y + 1), k = Math.hypot(nx, ny);
  return k ? (nx * -0.5 + ny * -0.866) / k : 0;
}
/** Wood u for a body pixel, on the same phase the straight runs use (screen x or y, +16, in art pixels). */
function bodyU(label, sx, sy) { return label === 'T' || label === 'B' ? Math.floor((sx + 16) / RIM_P) : Math.floor((sy + 16) / RIM_P); }

/**
 * Once: the sheet's maths on a 400 x 400 sample bubble, cut into four corners and four straight runs.
 * A straight run is one 64-art-pixel repeat of the grain, laid end to end as a pattern, so it fits any length.
 */
async function buildRim() {
  const img = new Image(); img.src = 'art/browser/band.png'; await img.decode();
  const tc = document.createElement('canvas'); tc.width = img.width; tc.height = img.height;
  const tg = tc.getContext('2d'); tg.drawImage(img, 0, 0);
  RIM.tex = { w: img.width, h: img.height, d: tg.getImageData(0, 0, img.width, img.height).data };
  const S = RREF * RIM_P, cw = RREF + 2 * RM, ch = cw;
  const BM = grow(artMask(bodyPath(S, S), cw, ch, -RM * RIM_P, -RM * RIM_P), cw, ch, RIM_E);
  const D = depthMap(BM, cw, ch);
  const L = RM, R = RM + RREF - 1, T = RM, B = RM + RREF - 1;
  const out = new ImageData(cw, ch), px = out.data;
  const put = (i, v) => { if (!v) return; px[i * 4] = v[0]; px[i * 4 + 1] = v[1]; px[i * 4 + 2] = v[2]; px[i * 4 + 3] = v[3]; };
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const i = y * cw + x;
    if (!BM[i]) { if (y >= 1 && BM[i - cw]) put(i, SHADOW); continue; }
    const dl = x - L, dr = R - x, dt = y - T, db = B - y, m = Math.min(dl, dr, dt, db);
    const label = m === dt ? 'T' : m === db ? 'B' : m === dl ? 'L' : 'R';
    const d = depthOf(D[i]);
    put(i, s2({ d, dB: d, tail: false, lit: litOf(D, cw, ch, x, y), u: label === 'T' || label === 'B' ? x : y, paper: () => [0, 0, 0, 0] }));
  }
  const ref = document.createElement('canvas'); ref.width = cw; ref.height = ch; ref.getContext('2d').putImageData(out, 0, 0);
  const cut = (x, y, w, h) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(ref, x, y, w, h, 0, 0, w, h);
    return c.toDataURL('image/png');
  };
  // The pieces live ONCE in a hidden SVG of their own and the bubble's skin only points at them (<use>, pattern fills),
  // so the outline's per-frame rebuild carries a few short tags, not the images. (The page's CSP allows data: images.)
  const far = RM + RREF - (RCUT - RM);   // the far corners' cut starts here (12 art pixels inside the far edge)
  const C = RCUT * RIM_P, Q = RREP * RIM_P, st = 'preserveAspectRatio="none" style="image-rendering:pixelated"';
  const piece = (id, x, y) => `<image id="${id}" href="${cut(x, y, RCUT, RCUT)}" width="${C}" height="${C}" ${st}/>`;
  // A straight run's pattern starts 40 px before the run itself (which starts 24 px in), i.e. at -16, where the
  // top-left corner's grain starts, so the grain carries on from the corner (the sample's own layout).
  const runX = (id, y) => `<pattern id="${id}" patternUnits="userSpaceOnUse" x="${-C}" y="0" width="${Q}" height="${C}">`
    + `<image href="${cut(RREP, y, RREP, RCUT)}" width="${Q}" height="${C}" ${st}/></pattern>`;
  const runY = (id, x) => `<pattern id="${id}" patternUnits="userSpaceOnUse" x="0" y="${-C}" width="${C}" height="${Q}">`
    + `<image href="${cut(x, RREP, RCUT, RREP)}" width="${C}" height="${Q}" ${st}/></pattern>`;
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  defs.id = 'rimdefs';
  defs.setAttribute('aria-hidden', 'true');
  defs.setAttribute('width', '0'); defs.setAttribute('height', '0');
  defs.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';   // not display:none: patterns inside one stop painting
  defs.innerHTML = '<defs>' + piece('rim-tl', 0, 0) + piece('rim-tr', far, 0) + piece('rim-bl', 0, far) + piece('rim-br', far, far)
    + runX('rim-top', 0) + runX('rim-bottom', far) + runY('rim-left', 0) + runY('rim-right', far) + '</defs>';
  document.body.append(defs);
  RIM.ready = true;
  return true;
}
/** Resolves once the rim's pieces are cut (band.png loaded); the bubble redraws then. False where there is no page. */
export const rimReady = typeof document === 'undefined' ? Promise.resolve(false) : buildRim().catch((e) => { console.error('rim: ' + (e?.message ?? e)); return false; });

/**
 * The patch round the tail: the sheet's maths on just that corner of the bubble, so the band bends round the tail and
 * opens into it. Remembered by size and aim, so a bubble that sits still costs nothing.
 */
function tailPatch(svg, w, h, head, d) {
  const key = `${w}x${h}:${Math.round(head.x)},${Math.round(head.y)}`;
  const hit = RIM.tails.get(key);
  if (hit !== undefined) { RIM.tails.delete(key); RIM.tails.set(key, hit); return hit; }
  const g = RIM_G, P = RIM_P, gw = w + 2 * g, gh = h + 2 * g, aim = { x: head.x + g, y: head.y + g };
  // The rim's outer edge is the REAL balloon outline for a body g bigger all round, aimed at the same head, so the tail
  // keeps its own rules (edge, length, taper). Its points, back in the body's coordinates:
  const G = tailGeom(gw, gh, aim);
  const pts = [G.A, G.B, G.tip].map((q) => ({ x: q.x - g, y: q.y - g }));
  const pad = 24;   // 12 art pixels: the 7 painted round the tail plus room for the depth to come out right
  const minX = Math.min(...pts.map((q) => q.x)) - pad, maxX = Math.max(...pts.map((q) => q.x)) + pad;
  const minY = Math.min(...pts.map((q) => q.y)) - pad, maxY = Math.max(...pts.map((q) => q.y)) + pad;
  // On the same pixel grid as the straight run it leaves from (the bottom run is laid from x 0 and y h, the right from x w)
  const ax = G.side === 'right' ? w : 0, ay = G.side === 'bottom' ? h : 0;
  const ox = ax + P * Math.floor((minX - ax) / P), oy = ay + P * Math.floor((minY - ay) / P);
  const cw = Math.ceil((maxX - ox) / P), ch = Math.ceil((maxY - oy) / P);
  const O1 = artMask(balloonPath(gw, gh, aim), cw, ch, ox + g, oy + g);
  const O0 = artMask(bodyPath(gw, gh), cw, ch, ox + g, oy + g);
  const BM = grow(artMask(bodyPath(w, h), cw, ch, ox, oy), cw, ch, RIM_E);
  const TL = new Uint8Array(cw * ch); for (let i = 0; i < TL.length; i++) TL[i] = O1[i] && !O0[i] ? 1 : 0;
  const F = grow(TL, cw, ch, 2);   // a touch thicker, so the tail has room for its edge and wood (the sheet's tailGrow)
  for (let i = 0; i < F.length; i++) if (BM[i]) F[i] = 1;
  // Only the pixels near the tail are painted; the straight run already under them is right everywhere else.
  const near = grow(TL, cw, ch, 7);
  const DF = depthMap(F, cw, ch), DB = depthMap(BM, cw, ch);
  const L = -ox / P, R = (w - ox) / P - 1, T = -oy / P, Bt = (h - oy) / P - 1;
  let tip = null; const mouth = { x: 0, y: 0, n: 0 };
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) { const i = y * cw + x; if (!F[i] || BM[i]) continue;
    const far = (x - (L + R) / 2) ** 2 + (y - (T + Bt) / 2) ** 2; if (!tip || far > tip.f) tip = { x, y, f: far };
    if (BM[i - cw] || BM[i - 1] || BM[i + 1] || BM[i + cw]) { mouth.x += x; mouth.y += y; mouth.n++; } }
  if (mouth.n) { mouth.x /= mouth.n; mouth.y /= mouth.n; }
  let tx = 0, ty = 1; if (tip && mouth.n) { const k = Math.hypot(tip.x - mouth.x, tip.y - mouth.y) || 1; tx = (tip.x - mouth.x) / k; ty = (tip.y - mouth.y) / k; }
  // B's paper, row by row: its gradient runs down the paper path's own box, tail included (as the SVG fills it)
  const ys = (d.match(/-?\d+(\.\d+)?/g) || []).map(Number).filter((_, i) => i % 2 === 1);
  const py0 = Math.min(...ys), py1 = Math.max(...ys);
  const stops = RIM.stops || (RIM.stops = [1, 2, 3].map((k) => rhex(getComputedStyle(svg).getPropertyValue('--paper-' + k).trim() || ['#FBF0D8', '#F2E0BC', '#E6CD9C'][k - 1])));
  const paperAt = (sy) => {
    const t = Math.max(0, Math.min(1, (sy - py0) / ((py1 - py0) || 1)));
    return t <= 0.45 ? rmix(stops[0], stops[1], t / 0.45) : rmix(stops[1], stops[2], (t - 0.45) / 0.55);
  };
  const out = new ImageData(cw, ch), px = out.data;
  let any = false;
  const put = (i, v) => { if (!v) return; px[i * 4] = v[0]; px[i * 4 + 1] = v[1]; px[i * 4 + 2] = v[2]; px[i * 4 + 3] = v[3]; any = true; };
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const i = y * cw + x;
    if (!near[i]) continue;
    const sx = ox + x * P, sy = oy + y * P;
    if (!F[i]) { if (y >= 1 && F[i - cw] && !BM[i - cw]) put(i, SHADOW); continue; }
    const inB = !!BM[i];
    let u;
    if (inB) {
      const dl = x - L, dr = R - x, dt = y - T, db = Bt - y, m = Math.min(dl, dr, dt, db);
      u = bodyU(m === dt ? 'T' : m === db ? 'B' : m === dl ? 'L' : 'R', sx, sy);
    } else u = Math.round(x * tx + y * ty);
    put(i, s2({ d: depthOf(DF[i]), dB: inB ? depthOf(DB[i]) : -1, tail: !inB, lit: litOf(DF, cw, ch, x, y), u, paper: () => paperAt(sy) }));
  }
  let patch = null;
  if (any) {
    // a software canvas (willReadFrequently): encoding a GPU canvas reads it back first, which was most of the cost
    const c = RIM.enc || (RIM.enc = document.createElement('canvas'));
    c.width = cw; c.height = ch; c.getContext('2d', { willReadFrequently: true }).putImageData(out, 0, 0);
    patch = { url: c.toDataURL(), x: ox, y: oy, w: cw * P, h: ch * P };
  }
  RIM.tails.set(key, patch);
  if (RIM.tails.size > 48) RIM.tails.delete(RIM.tails.keys().next().value);
  return patch;
}

/** The rim's SVG: four corners, four straight runs clipped to length, and the tail's patch on top. */
function rimMarkup(svg, w, h, head, d) {
  const C = RCUT * RIM_P, N = (RCUT - RM) * RIM_P, O = -RM * RIM_P;
  const run = (x, y, rw, rh, id) => `<rect transform="translate(${x} ${y})" width="${rw}" height="${rh}" fill="url(#${id})"/>`;
  let m = '';
  if (w > 2 * N) m += run(N, O, w - 2 * N, C, 'rim-top') + run(N, h - N, w - 2 * N, C, 'rim-bottom');
  if (h > 2 * N) m += run(O, N, C, h - 2 * N, 'rim-left') + run(w - N, N, C, h - 2 * N, 'rim-right');
  m += `<use href="#rim-tl" x="${O}" y="${O}"/><use href="#rim-tr" x="${w - N}" y="${O}"/>`
    + `<use href="#rim-bl" x="${O}" y="${h - N}"/><use href="#rim-br" x="${w - N}" y="${h - N}"/>`;
  const t = tailPatch(svg, w, h, head, d);
  if (t) m += `<image href="${t.url}" x="${t.x}" y="${t.y}" width="${t.w}" height="${t.h}" preserveAspectRatio="none" style="image-rendering:pixelated"/>`;
  return m;
}


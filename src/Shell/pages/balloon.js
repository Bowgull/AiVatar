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

/** The ink line. 4 would land on whole device pixels at 125%; 5 reads better against 15px text. */
export const OW = 5;
/**
 * How far along the line to his head the tail stops.
 *
 * Comic lettering says 50 to 60 per cent of the way, and never touching him. On the real desktop he
 * is much closer to the balloon's corner than the sheet assumed, so 0.62 of a short distance is a
 * short tail - which is correct. The first build used 0.62 of a GUESSED 96px and came out 80px past
 * his head, like a wire. The distance now comes from the Shell, which knows where he actually is.
 */
export const REACH = 0.55;

const n = (v) => (Math.round(v * 10) / 10);

/** The shortest and longest a tail may be, measured from the edge it leaves. */
export const TAIL_MIN = 26, TAIL_MAX = 46;

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
  const x0 = OW / 2, y0 = OW / 2, x1 = w - OW / 2, y1 = h - OW / 2;
  const r = Math.min(opt.r ?? 15, (y1 - y0) / 2, (x1 - x0) / 2);
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

/**
 * Paint that path as one of his carved panels.
 *
 * A CSS panel gets its lit top lip and shaded bottom from inset box-shadows, and inset shadows only
 * follow a rectangle. This shape has a tail, so the same carve is built from the path itself: five
 * passes, each clipped to the shape and nudged a few pixels. The carve then follows the tail for
 * free, because the tail is part of the same path.
 */
export function paintBalloon(svg, w, h, d, uid) {
  svg.setAttribute('viewBox', `0 0 ${n(w)} ${n(h)}`);
  svg.setAttribute('width', String(Math.ceil(w)));
  svg.setAttribute('height', String(Math.ceil(h)));
  svg.innerHTML =
    `<defs>`
    + `<linearGradient id="bg${uid}" x1="0" y1="0" x2="0" y2="1">`
    + `<stop offset="0" stop-color="#F6E6C6"/><stop offset=".45" stop-color="#ECD5A8"/>`
    + `<stop offset="1" stop-color="#DEC28C"/></linearGradient>`
    + `<clipPath id="bc${uid}"><path d="${d}"/></clipPath>`
    + `</defs>`
    // 1. the hard contact shadow: the same shape, near-black, dropped 4px
    + `<path d="${d}" fill="rgba(0,0,0,.62)" transform="translate(0,4)"/>`
    // 2. the parchment
    + `<path d="${d}" fill="url(#bg${uid})"/>`
    // 3 and 4. the lit top lip and the shaded bottom, clipped so they stay inside the edge
    + `<g clip-path="url(#bc${uid})">`
    + `<path d="${d}" fill="none" stroke="rgba(255,255,255,.62)" stroke-width="9" transform="translate(0,5)"/>`
    + `<path d="${d}" fill="none" stroke="rgba(150,110,60,.38)" stroke-width="9" transform="translate(0,-6)"/>`
    + `</g>`
    // 5. the ink line, last, so nothing is drawn across it
    + `<path d="${d}" fill="none" stroke="#120A05" stroke-width="${OW}" stroke-linejoin="round"/>`;
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

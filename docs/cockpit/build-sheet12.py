# Sheet 12: the balloon as decided in the interview.
#   - soft-edged RECTANGLE, not an oval            (his words: "no round ballon soft edge rectangle")
#   - his design language kept, not flattened      ("dont change design lanaguge")
#   - a real comic tail, no beads                  ("everything we have now fucking sucks")
#   - sentence case, one shape always, warm cream
#   - grows to fit the whole reply, no twelve-line cap
#
# The carve on an arbitrary outline is the interesting part. A CSS box gets its lit top lip and
# shaded bottom from inset box-shadows, which only work on a rectangle. Here the shape includes a
# tail, so the same effect is built out of the path itself: the path is drawn four times, each time
# clipped to itself, offset a few pixels. That gives a lit top edge, a shaded bottom edge and a hard
# contact shadow that all follow the tail as well as the body.
import io, math

INK = "#120A05"
OW = 5            # the ink line. 4 would smear less at 125% but 5 reads better against 15px text.
LIT = "rgba(255,255,255,.62)"
SHADE = "rgba(150,110,60,.38)"
LINE_H = 23       # measured line height of the real reply text
PAD_Y = 13        # top and bottom padding inside the balloon
PAD_X = 15


def f(v):
    return f"{v:.1f}".rstrip("0").rstrip(".")


def balloon_path(w, h, tip, r=15, mouth=40):
    """A soft-edged rectangle whose RIGHT edge opens into a tapered tail and closes again, as ONE
    path. The mouth is centred on the ray from the balloon's middle to the tip, which is Blambot's
    rule: a tail follows an imaginary line to the centre of the balloon."""
    x0, y0, x1, y1 = OW / 2, OW / 2, w - OW / 2, h - OW / 2
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    r = min(r, (y1 - y0) / 2, (x1 - x0) / 2)
    # where the centre-to-tip ray crosses the right edge
    t = (x1 - cx) / (tip[0] - cx) if tip[0] != cx else 1
    ey = cy + t * (tip[1] - cy)
    a = max(y0 + r + 2, ey - mouth / 2)
    b = min(y1 - r - 2, ey + mouth / 2)
    if b - a < 12:                       # a mouth too small to see; push it inside the straight run
        a, b = min(y1 - r - 14, max(y0 + r + 2, ey - 7)), min(y1 - r - 2, max(y0 + r + 16, ey + 7))
    # A lettered tail is a near-straight taper, very slightly bowed. Putting the control points close
    # to the midpoint of each straight edge keeps it clean; further out and it kinks, which is what
    # made the first version look like a shard rather than a tail.
    c1 = ((x1 + tip[0]) / 2, (a + tip[1]) / 2 - 3)
    c2 = ((x1 + tip[0]) / 2, (b + tip[1]) / 2 + 4)
    return (f"M {f(x0 + r)} {f(y0)} "
            f"L {f(x1 - r)} {f(y0)} Q {f(x1)} {f(y0)} {f(x1)} {f(y0 + r)} "
            f"L {f(x1)} {f(a)} "
            f"Q {f(c1[0])} {f(c1[1])} {f(tip[0])} {f(tip[1])} "
            f"Q {f(c2[0])} {f(c2[1])} {f(x1)} {f(b)} "
            f"L {f(x1)} {f(y1 - r)} Q {f(x1)} {f(y1)} {f(x1 - r)} {f(y1)} "
            f"L {f(x0 + r)} {f(y1)} Q {f(x0)} {f(y1)} {f(x0)} {f(y1 - r)} "
            f"L {f(x0)} {f(y0 + r)} Q {f(x0)} {f(y0)} {f(x0 + r)} {f(y0)} Z")


def carved_svg(w, h, d, uid, pad_r, pad_b, scale=1.0):
    """The one path, drawn as a carved panel:
         1. the same path filled near-black and dropped 4px  - the hard contact shadow
         2. the path filled with the parchment gradient
         3. the path stroked wide in white, nudged DOWN and clipped to itself - a lit top lip
         4. the path stroked wide in brown, nudged UP and clipped - the shaded bottom
         5. the path stroked near-black - the ink line, drawn last so nothing crosses it
       Clipping each pass to the shape is what keeps the lip inside the edge, and it follows the
       tail for free because the tail is part of the same path."""
    s = f' transform="scale({f(scale)})"' if scale != 1 else ""
    return (
        f'<svg class="shape" viewBox="0 0 {f(w)} {f(h)}" width="{f(w*scale)}" height="{f(h*scale)}" '
        f'aria-hidden="true" style="--pad-r:{f(pad_r*scale)}px;--pad-b:{f(pad_b*scale)}px">'
        f'<defs>'
        f'<linearGradient id="g{uid}" x1="0" y1="0" x2="0" y2="1">'
        f'<stop offset="0" stop-color="#F6E6C6"/><stop offset=".45" stop-color="#ECD5A8"/>'
        f'<stop offset="1" stop-color="#DEC28C"/></linearGradient>'
        f'<clipPath id="c{uid}"><path d="{d}"/></clipPath>'
        f'</defs>'
        f'<g{s}>'
        f'<path d="{d}" fill="rgba(0,0,0,.62)" transform="translate(0,4)"/>'
        f'<path d="{d}" fill="url(#g{uid})"/>'
        f'<g clip-path="url(#c{uid})">'
        f'<path d="{d}" fill="none" stroke="{LIT}" stroke-width="9" transform="translate(0,5)"/>'
        f'<path d="{d}" fill="none" stroke="{SHADE}" stroke-width="9" transform="translate(0,-6)"/>'
        f'</g>'
        f'<path d="{d}" fill="none" stroke="{INK}" stroke-width="{OW}" stroke-linejoin="round"/>'
        f'</g></svg>')

# Builds sheet 11: comic balloons whose body AND tail are ONE path.
#
# Sheet 10 drew the tail as a second SVG laid over the body. Wherever they met you could see the
# seam, which is what made them look stuck together rather than drawn. Every shape here is a single
# closed path, filled once and stroked once, so the ink line runs round the whole balloon and out
# along the tail without a join anywhere.
#
# This is the same conclusion the CSS literature reaches (Smashing's tooltip article builds body and
# tail as one clip-path polygon); SVG is used instead of clip-path because clip-path discards the
# stroke and the drop shadow, and this balloon needs both.
import io, math

INK, CREAM, SW = "#120A05", "#F3E3C0", 5


def pt(cx, cy, rx, ry, deg):
    a = math.radians(deg)
    return (cx + rx * math.cos(a), cy + ry * math.sin(a))


def f(v):
    return f"{v:.1f}".rstrip("0").rstrip(".")


def oval_with_tail(w, h, tip, half=17):
    """A true ellipse. Blambot's rule, verbatim from their own lettering guide: "balloon tails should
    follow an imaginary line to the CENTER of the balloon regardless of tail". So the tail is not
    placed at a chosen angle; it is placed on the ray from the balloon's centre to the tip, and its
    two base points straddle that ray. Extend the tail backwards and it runs through the middle.
    The outline then arcs the long way round and runs straight out into the tail, so the tail's edges
    are the balloon's own edge carrying on."""
    cx, cy, rx, ry = w / 2, h / 2, w / 2 - SW, h / 2 - SW
    aim = math.degrees(math.atan2(tip[1] - cy, tip[0] - cx))
    p1, p2 = pt(cx, cy, rx, ry, aim - half), pt(cx, cy, rx, ry, aim + half)
    # Only a slight bow, so the taper stays near-straight the way a lettered tail does.
    c1 = (p1[0] + (tip[0] - p1[0]) * 0.5, p1[1] + (tip[1] - p1[1]) * 0.32)
    c2 = (p2[0] + (tip[0] - p2[0]) * 0.32, p2[1] + (tip[1] - p2[1]) * 0.5)
    return (f"M {f(p1[0])} {f(p1[1])} "
            f"A {f(rx)} {f(ry)} 0 1 0 {f(p2[0])} {f(p2[1])} "
            f"Q {f(c2[0])} {f(c2[1])} {f(tip[0])} {f(tip[1])} "
            f"Q {f(c1[0])} {f(c1[1])} {f(p1[0])} {f(p1[1])} Z")


def rounded_with_tail(w, h, tip, r=46, ty1=None, ty2=None, spike=False):
    """A rounded balloon. The tail is cut into the RIGHT edge and the path simply continues into it,
    so there is no separate shape. `spike` gives the straight-sided pointed tail instead of a
    curved sweep."""
    x0, y0, x1, y1 = SW, SW, w - SW, h - SW
    r = min(r, (y1 - y0) / 2, (x1 - x0) / 2)
    # Same centre rule: the tail leaves the right edge where the ray from the balloon's centre to the
    # tip crosses it, with its base straddling that point, so the tail aims back through the middle.
    cx, cy = w / 2, h / 2
    t = (x1 - cx) / (tip[0] - cx) if tip[0] != cx else 1
    ey = cy + t * (tip[1] - cy)
    halfb = 15
    ty1 = ty1 if ty1 is not None else max(y0 + r, ey - halfb)
    ty2 = ty2 if ty2 is not None else min(y1 - r, ey + halfb)
    if spike:
        out = f"L {f(tip[0])} {f(tip[1])} L {f(x1)} {f(ty2)} "
    else:
        c1 = (x1 + (tip[0] - x1) * 0.5, ty1 + (tip[1] - ty1) * 0.3)
        c2 = (x1 + (tip[0] - x1) * 0.3, ty2 + (tip[1] - ty2) * 0.5)
        out = (f"Q {f(c1[0])} {f(c1[1])} {f(tip[0])} {f(tip[1])} "
               f"Q {f(c2[0])} {f(c2[1])} {f(x1)} {f(ty2)} ")
    return (f"M {f(x0 + r)} {f(y0)} "
            f"L {f(x1 - r)} {f(y0)} A {f(r)} {f(r)} 0 0 1 {f(x1)} {f(y0 + r)} "
            f"L {f(x1)} {f(ty1)} " + out +
            f"L {f(x1)} {f(y1 - r)} A {f(r)} {f(r)} 0 0 1 {f(x1 - r)} {f(y1)} "
            f"L {f(x0 + r)} {f(y1)} A {f(r)} {f(r)} 0 0 1 {f(x0)} {f(y1 - r)} "
            f"L {f(x0)} {f(y0 + r)} A {f(r)} {f(r)} 0 0 1 {f(x0 + r)} {f(y0)} Z")


def cloud(w, h, bump=17):
    """The thought cloud as ONE path: a ring of outward semicircular arcs round a rectangle. Each
    arc starts where the last ended, so it is one continuous scalloped outline with no circles
    overlapping and no internal lines to hide."""
    x0, y0 = SW + bump, SW + bump
    x1, y1 = w - SW - bump, h - SW - bump
    nx = max(2, round((x1 - x0) / (2 * bump)))
    ny = max(1, round((y1 - y0) / (2 * bump)))
    pts = []
    for i in range(nx):
        pts.append((x0 + (x1 - x0) * i / nx, y0))
    for i in range(ny):
        pts.append((x1, y0 + (y1 - y0) * i / ny))
    for i in range(nx):
        pts.append((x1 - (x1 - x0) * i / nx, y1))
    for i in range(ny):
        pts.append((x0, y1 - (y1 - y0) * i / ny))
    d = f"M {f(pts[0][0])} {f(pts[0][1])} "
    for i in range(1, len(pts) + 1):
        a, b = pts[i - 1], pts[i % len(pts)]
        rad = math.hypot(b[0] - a[0], b[1] - a[1]) / 2
        d += f"A {f(rad)} {f(rad)} 0 0 1 {f(b[0])} {f(b[1])} "
    return d + "Z"


def beads(spec):
    return "".join(
        f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="{CREAM}" stroke="{INK}" '
        f'stroke-width="{SW}"/>' for x, y, r in spec)


def svg(w, h, body, extra="", cls="shape"):
    return (f'<svg class="{cls}" viewBox="0 0 {f(w)} {f(h)}" width="{f(w)}" height="{f(h)}" '
            f'aria-hidden="true">'
            f'<path d="{body}" fill="{CREAM}" stroke="{INK}" stroke-width="{SW}" '
            f'stroke-linejoin="round"/>{extra}</svg>')


# ---------------------------------------------------------------- the four balloons
# His head centre sits 96px right and 58px below the balloon's bottom-right corner (measured off the
# real sprite in sheet 9). Comic lettering says a tail reaches 50 to 60 per cent of the way to the
# speaker and stops, so every tip below is at about 62 right and 38 down from that corner.
HEAD = (96, 58)
REACH = (62, 38)

def place(bw, bh, padx, pady, over_w, over_h):
    """Returns the css that puts the BODY's bottom-right corner on the real anchor, with the tail
    hanging into the extra room on the right and underneath."""
    return (f"right:{238 - over_w}px;bottom:{196 - over_h}px",
            f"left:{padx}px;top:{pady}px;width:{bw - 2*padx}px;height:{bh - 2*pady}px")

OPTS = []

# A - true oval
bw, bh = 320, 182
w, h = bw + 74, bh + 50
OPTS.append(dict(
    key="A", title="The true oval",
    note="A real ellipse. The outline arcs the long way round and then runs straight out into the "
         "tail, so the tail's two edges are the balloon's own edge carrying on. The honest cost is "
         "that an ellipse wastes its corners, so it has to be much bigger to hold the same words.",
    svg=svg(w, h, oval_with_tail(bw, bh, (bw + REACH[0], bh + REACH[1]))),
    css=place(bw, bh, 62, 46, 74, 50)))

# B - modern balloon
bw, bh = 272, 116
w, h = bw + 74, bh + 50
OPTS.append(dict(
    key="B", title="The modern balloon",
    note="The oval flattened until it holds a paragraph without swelling. One path again: the right "
         "edge simply bulges out into the tail and comes back. This is the shape most modern comics "
         "actually use, and it is the best behaved as a reply gets longer.",
    svg=svg(w, h, rounded_with_tail(bw, bh, (bw + REACH[0], bh + REACH[1]))),
    css=place(bw, bh, 26, 18, 74, 50)))

# C - thought cloud
bw, bh = 284, 132
w, h = bw + 94, bh + 60
OPTS.append(dict(
    key="C", title="The thought cloud",
    note="Scalloped the whole way round, as ONE path: a ring of outward arcs, each starting where "
         "the last ended. No overlapping circles and no internal lines to hide. The three beads are "
         "meant to be separate shapes, so they keep their own outlines.",
    svg=svg(w, h, cloud(bw, bh),
            beads([(bw + 29, bh + 17, 13), (bw + 56, bh + 34, 9), (bw + 80, bh + 48, 6)])),
    css=place(bw, bh, 38, 32, 94, 60)))

# D - the pointed spike
bw, bh = 272, 116
w, h = bw + 74, bh + 50
OPTS.append(dict(
    key="D", title="The pointed spike",
    note="The same balloon with a straight-sided tail instead of a curved sweep. Sharper and more "
         "cartoon than comic, which is the Paper Mario end of the range. Still one path.",
    svg=svg(w, h, rounded_with_tail(bw, bh, (bw + REACH[0], bh + REACH[1]), spike=True)),
    css=place(bw, bh, 26, 18, 74, 50)))

Q = '<p class="q">two short sentences about tea</p>'
A = '<p>Leaves brewed in hot water. Different kinds, all soothing.</p>'
SPR = '<div class="sprite" aria-hidden="true"></div>'

figs = []
for o in OPTS:
    pos, inset = o["css"]
    figs.append(
        '<figure><div class="scene"><div class="balloon" style="' + pos + '">' + o["svg"]
        + '<div class="txt" style="' + inset + '">' + Q + A + '</div></div>' + SPR
        + '</div><figcaption><b>' + o["key"] + ' &middot; ' + o["title"] + '</b>' + o["note"]
        + '</figcaption></figure>')

HTML = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
  '<title>Aang &middot; One-path balloons</title>\n'
  '<link href="https://fonts.googleapis.com/css2?family=Figtree:ital,wght@0,400;0,500;0,600;0,700;1,500&amp;family=Silkscreen&amp;display=swap" rel="stylesheet">\n'
  '<link rel="stylesheet" href="sheet-11.css">\n</head>\n<body>\n<div class="wrap">\n'
  '<h1>A A N G &middot; S H E E T 1 1</h1>\n'
  '<p class="sub">Balloons drawn as a single continuous outline, body and tail together.<br>'
  '1:1, his real sprite, placed by the real anchor.</p>\n'
  '<h2 class="part">WHAT WAS ACTUALLY WRONG</h2>\n'
  '<p class="why">Sheet 10 drew the tail as a second shape laid over the body. Wherever the two met '
  'you could see the seam, and that is what made them look stuck together instead of drawn. I told '
  'you that join was clean. It was not.</p>\n'
  '<p class="why">The fix is the one the CSS literature arrives at too: <b>the body and the tail are '
  'one shape</b>. Smashing Magazine builds both from a single clip-path polygon for exactly this '
  'reason. I have used SVG rather than clip-path because clip-path throws away the stroke and the '
  'shadow, and this balloon needs an ink line and a hard drop shadow. So each balloon below is one '
  'closed path, filled once and stroked once, and the ink runs round the body and out along the '
  'tail without a join anywhere.</p>\n'
  '<p class="why">The tails stop about <b>sixty per cent of the way</b> to him and point at his '
  'face, which is the one real rule comic lettering gives.</p>\n'
  '<h2 class="part">THE BALLOON <span class="pick">PICK ONE</span></h2>\n<div class="grid2">\n'
  + "\n".join(figs) + '\n</div>\n</div>\n</body>\n</html>\n')
io.open('sheet-11.html', 'w', encoding='utf-8').write(HTML)
print("sheet-11.html written,", len(OPTS), "options")

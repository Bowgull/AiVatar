# 2026-10-12: the site shield, detailed, from Avatar (his ask: "way more intricate", Zelda-shield patterns, Avatar
# elements). Drawn large with shapes, then snapped to a pixel grid with a fixed palette, so it is real pixel art.
# Three emblems (Air Nomad, four nations, White Lotus) x two edge patterns (cloud swirls, carved knotwork).
# Also a small bar version of each. Output: pix9/.
import math, os
from PIL import Image, ImageDraw
os.chdir(os.path.dirname(os.path.abspath(__file__)))
os.makedirs('pix9', exist_ok=True)

RIM = (30, 18, 10)
G0, G1, G2, G3 = (150, 100, 20), (201, 140, 20), (255, 196, 60), (255, 230, 160)
FIELD, FIELD_D, FIELD_L = (52, 34, 86), (34, 20, 58), (84, 56, 124)
CREAM = (250, 238, 210)
BLUE = (110, 150, 225)
RED, GREEN, WATER = (214, 82, 54), (96, 150, 70), (80, 140, 210)
PINK, PINK_D = (236, 172, 192), (150, 80, 100)
PALETTE = [RIM, G0, G1, G2, G3, FIELD, FIELD_D, FIELD_L, CREAM, BLUE, RED, GREEN, WATER, PINK, PINK_D]

S = 10                    # drawing scale: draw at 10x, then snap
GW, GH = 48, 56           # the grid of the large shield, in art pixels


def shield_poly(w, h, inset=0.0):
    """A heater shield: flat top with notched corners, straight sides, a point at the bottom."""
    i = inset
    pts = [(0.10 + i, 0.03 + i), (0.30 + i * .5, 0.0 + i), (0.70 - i * .5, 0.0 + i), (0.90 - i, 0.03 + i), (1.0 - i, 0.10 + i * .6),
           (1.0 - i, 0.50), (0.93 - i, 0.70), (0.75 - i * .8, 0.87 - i * .3), (0.5, 1.0 - i * 1.25), (0.25 + i * .8, 0.87 - i * .3),
           (0.07 + i, 0.70), (0.0 + i, 0.50), (0.0 + i, 0.10 + i * .6)]
    return [(x * w, y * h) for x, y in pts]


def spiral(d, cx, cy, r, turns, width, color, start=0.0, flip=1):
    pts = []
    n = int(60 * turns)
    for k in range(n + 1):
        t = k / n
        a = start + flip * t * turns * 2 * math.pi
        rr = r * (1 - t * 0.85)
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    d.line(pts, fill=color, width=width, joint='curve')


def air_emblem(d, cx, cy, r, color, field):
    """The Air Nomad symbol, in spirit: a ring, three curls turning inward, and a curl hanging below."""
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=color, width=int(r * .16))
    for k in range(3):
        a = -math.pi / 2 + k * 2 * math.pi / 3
        spiral(d, cx + r * .42 * math.cos(a), cy + r * .42 * math.sin(a), r * .40, 1.2, int(r * .13), color, start=a + math.pi, flip=1)
    spiral(d, cx, cy + r * 1.35, r * .38, 1.1, int(r * .13), color, start=-math.pi / 2, flip=-1)


def flame(d, cx, cy, s, color):
    d.polygon([(cx, cy - s), (cx + s * .55, cy + s * .2), (cx + s * .25, cy + s * .7), (cx - s * .25, cy + s * .7), (cx - s * .55, cy + s * .2)], fill=color)
    d.polygon([(cx, cy - s * .3), (cx + s * .25, cy + s * .35), (cx - s * .25, cy + s * .35)], fill=G3)


def water(d, cx, cy, s, color):
    d.ellipse([cx - s, cy - s, cx + s, cy + s], fill=color)
    d.ellipse([cx - s * .55, cy - s * 1.15, cx + s * 1.15, cy + s * .45], fill=FIELD)   # crescent moon
    d.arc([cx - s * .9, cy - s * .2, cx + s * .2, cy + s * .9], 200, 340, fill=CREAM, width=int(s * .22))


def earth(d, cx, cy, s, color):
    d.rectangle([cx - s, cy - s, cx + s, cy + s], fill=color)
    d.rectangle([cx - s * .55, cy - s * .55, cx + s * .55, cy + s * .55], fill=FIELD)
    d.rectangle([cx - s * .25, cy - s * .25, cx + s * .25, cy + s * .25], fill=color)


def lotus(d, cx, cy, s):
    """The White Lotus Pai Sho tile: an eight-petal flower in a round tile."""
    d.ellipse([cx - s, cy - s, cx + s, cy + s], fill=CREAM)
    d.ellipse([cx - s * .9, cy - s * .9, cx + s * .9, cy + s * .9], outline=G1, width=int(s * .09))
    for k in range(8):
        a = k * math.pi / 4 + math.pi / 8
        px, py = cx + s * .48 * math.cos(a), cy + s * .48 * math.sin(a)
        pr = s * .30
        d.ellipse([px - pr, py - pr, px + pr, py + pr], fill=PINK if k % 2 else CREAM, outline=PINK_D, width=int(s * .07))
    d.ellipse([cx - s * .22, cy - s * .22, cx + s * .22, cy + s * .22], fill=G2, outline=G0, width=int(s * .04))


def edge(d, w, h, style):
    """The pattern on the gold band between the rim and the field."""
    outer = shield_poly(w, h, 0.035)
    inner = shield_poly(w, h, 0.115)
    d.polygon(outer, fill=G2)
    if style == 'clouds':
        # cloud curls marching round the band
        path = outer + [outer[0]]
        for a, b in zip(path, path[1:]):
            L = math.dist(a, b); n = max(1, int(L / (w * .14)))
            for k in range(n):
                t = (k + .5) / n
                x, y = a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
                mx, my = w / 2 - x, h * .45 - y; m = math.hypot(mx, my) or 1
                cx, cy = x + mx / m * w * .04, y + my / m * w * .04
                spiral(d, cx, cy, w * .036, 1.15, int(w * .024), G0, start=math.atan2(my, mx))
    else:
        # carved knotwork: a running zigzag over-under between two lines

        mid = shield_poly(w, h, 0.075)
        path = mid + [mid[0]]
        for a, b in zip(path, path[1:]):
            L = math.dist(a, b); n = max(1, int(L / (w * .07)))
            for k in range(n):
                t0, t1 = k / n, (k + 1) / n
                p0 = (a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0)
                p1 = (a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1)
                nx, ny = -(b[1] - a[1]) / L, (b[0] - a[0]) / L
                o = w * .024 * (1 if k % 2 else -1)
                d.line([(p0[0] + nx * o, p0[1] + ny * o), (p1[0] - nx * o, p1[1] - ny * o)], fill=G0, width=int(w * .022))
    d.polygon(inner, fill=FIELD)
    # rivets: top corners and the point
    for (x, y) in ((w * .17, h * .07), (w * .83, h * .07), (w * .5, h * .90)):
        r = w * .026
        d.ellipse([x - r, y - r, x + r, y + r], fill=G3, outline=RIM, width=int(w * .008))


def snap(img, gw, gh):
    """Big drawing to real pixel art: average each cell, then the nearest colour in the palette."""
    from collections import Counter
    W, H = img.size
    cw, ch = W / gw, H / gh
    src = img.load()
    out = Image.new('RGBA', (gw, gh), (0, 0, 0, 0))
    q = out.load()
    for y in range(gh):
        for x in range(gw):
            cnt = Counter()
            for sy in range(int(y * ch), int((y + 1) * ch)):
                for sx in range(int(x * cw), int((x + 1) * cw)):
                    c = src[sx, sy]
                    cnt[c[:3] if c[3] > 128 else None] += 1
            # a line colour wins a cell when it covers a fair share of it, not only the majority: keeps lines unbroken
            best, n = cnt.most_common(1)[0]
            total = sum(cnt.values())
            for c, k in cnt.most_common():
                if c is not None and c not in (FIELD, G2, RIM) and k >= total * .28:
                    best = c; break
            if best is None:
                continue
            q[x, y] = min(PALETTE, key=lambda c: sum((a - b) ** 2 for a, b in zip(c, best))) + (255,)
    # a clean one-pixel dark rim round the shape
    m = out.copy(); mp = m.load()
    for y in range(gh):
        for x in range(gw):
            if mp[x, y][3] and any(not (0 <= x + dx < gw and 0 <= y + dy < gh) or not mp[x + dx, y + dy][3] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                q[x, y] = RIM + (255,)
    return out


def big(emblem, style):
    w, h = GW * S, GH * S
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.polygon(shield_poly(w, h), fill=RIM)
    edge(d, w, h, style)
    cx, cy = w / 2, h * .42
    if emblem == 'air':
        air_emblem(d, cx, cy, w * .20, G3, FIELD)
    elif emblem == 'nations':
        air_emblem(d, cx, cy + h * .02, w * .13, G3, FIELD)
        water(d, cx - w * .24, cy - h * .02, w * .07, WATER)
        earth(d, cx + w * .24, cy - h * .02, w * .06, GREEN)
        flame(d, cx, cy + h * .30, w * .085, RED)
        d.line([(cx, cy - h * .25), (cx, cy - h * .17)], fill=BLUE, width=int(w * .03))       # Aang's arrow tip at the top
        d.polygon([(cx - w * .05, cy - h * .19), (cx + w * .05, cy - h * .19), (cx, cy - h * .13)], fill=BLUE)
    else:
        lotus(d, cx, cy + h * .04, w * .24)
    return snap(im, GW, GH)


def small(emblem, gw=11, gh=13):
    """The bar version: the shape, the gold band and one bold mark. Detail would only turn to mush here."""
    w, h = gw * 40, gh * 40
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.polygon(shield_poly(w, h), fill=RIM)
    d.polygon(shield_poly(w, h, 0.06), fill=G2)
    d.polygon(shield_poly(w, h, 0.17), fill=FIELD)
    cx, cy = w / 2, h * .44
    if emblem == 'lotus':
        d.ellipse([cx - w * .22, cy - w * .22, cx + w * .22, cy + w * .22], fill=CREAM)
        d.ellipse([cx - w * .09, cy - w * .09, cx + w * .09, cy + w * .09], fill=G2)
    elif emblem == 'nations':
        d.polygon([(cx - w * .2, cy - h * .12), (cx + w * .2, cy - h * .12), (cx, cy + h * .2)], fill=BLUE)
    else:
        d.ellipse([cx - w * .24, cy - w * .24, cx + w * .24, cy + w * .24], outline=G3, width=int(w * .1))
        d.ellipse([cx - w * .07, cy - w * .07, cx + w * .07, cy + w * .07], fill=G3)
    return snap(im, gw, gh)


for e in ('air', 'nations', 'lotus'):
    for st in ('clouds', 'knots'):
        big(e, st).save(f'pix9/shield_{e}_{st}.png')
    small(e).save(f'pix9/shield_{e}_small.png')
    small(e, 15, 18).save(f'pix9/shield_{e}_medium.png')
print('ok')

# 2026-10-12: the address-bar shield, placed pixel by pixel (no shrinking): Air Nomad emblem, carved-knot edge.
# His pick from the big designs; this is its small twin. 24 x 28 art pixels, shown 1:1. Output: pix10/.
import math, os
from PIL import Image
os.chdir(os.path.dirname(os.path.abspath(__file__)))
os.makedirs('pix10', exist_ok=True)
RIM = (30, 18, 10); G0, G1, G2, G3 = (150, 100, 20), (201, 140, 20), (255, 196, 60), (255, 230, 160)
FIELD, FIELD_L = (52, 34, 86), (74, 50, 112); CREAM = (250, 238, 210)
W, H = 24, 28
# the shield's outline: flat top with clipped corners, straight sides, a point at the bottom
POLY = [(2.5, 0.5), (21.5, 0.5), (23.5, 2.5), (23.5, 14), (21.5, 19), (17, 24), (12, 27.5), (7, 24), (2.5, 19), (0.5, 14), (0.5, 2.5)]


def inside(px, py):
    c = False
    for (x1, y1), (x2, y2) in zip(POLY, POLY[1:] + POLY[:1]):
        if (y1 > py) != (y2 > py) and px < x1 + (py - y1) * (x2 - x1) / (y2 - y1):
            c = not c
    return c


mask = [[inside(x + .5, y + .5) for x in range(W)] for y in range(H)]
m = lambda x, y: 0 <= x < W and 0 <= y < H and mask[y][x]
depth = [[0] * W for _ in range(H)]
for y in range(H):
    for x in range(W):
        if not m(x, y):
            continue
        d = 0
        while all(m(x + dx, y + dy) for dx in range(-d - 1, d + 2) for dy in range(-d - 1, d + 2)) and d < 6:
            d += 1
        depth[y][x] = d
im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
p = im.load()
for y in range(H):
    for x in range(W):
        if not m(x, y):
            continue
        d = depth[y][x]
        if d == 0:
            c = RIM
        elif d in (1, 2):
            # the carved knots: a woven over-under along the band
            c = G0 if (x - y) % 4 == 0 else (G3 if d == 1 and (x - y) % 4 == 1 else G2)   # a twisted rope
        elif d == 3:
            c = RIM                       # the inner edge of the band
        else:
            c = FIELD_L if d == 4 and (x < 12 and y < 12) else FIELD
        p[x, y] = c + (255,)
for (x, y) in ((4, 3), (19, 3)):          # rivets
    p[x, y] = G3 + (255,); p[x + 1, y] = G1 + (255,); p[x, y + 1] = G1 + (255,); p[x + 1, y + 1] = G0 + (255,)
# the Air Nomad emblem, placed by hand: a ring, three commas turning the same way, a curl hanging below
EMBLEM = [
    "....XXXX....",
    "..XX....XX..",
    ".X...XX...X.",
    ".X...XX...X.",
    "X..X...X...X",
    "X..XX......X",
    "X..XX..XX..X",
    "X......XX..X",
    ".X...X....X.",
    ".X........X.",
    "..XX....XX..",
    "....XXXX....",
    ".....X......",
    ".....X..X...",
    "......XX....",
]
for j, row in enumerate(EMBLEM):
    for i, ch in enumerate(row):
        if ch == 'X':
            p[6 + i, 4 + j] = CREAM + (255,)
im.save('pix10/shield_bar.png')
print('ok')

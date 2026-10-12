# 2026-10-12: the browser's frame, thicker AND better made (his ask: "a mix of both"). Three 9-slice frames for the
# page plus a bigger carved drawer handle. Same palette and light as pixart.py (tone A, light from the top-left).
# One art pixel = 2 CSS px. Output: pix6/.
import os, random
from PIL import Image
os.chdir(os.path.dirname(os.path.abspath(__file__)))
os.makedirs('pix6', exist_ok=True)
OUT = (18, 10, 5)
W0, W1, W2, W3, W4 = (36, 22, 13), (52, 33, 19), (66, 42, 24), (84, 55, 31), (110, 74, 42)
G0, G1, G2 = (150, 100, 20), (201, 140, 20), (255, 224, 150)
SH = (14, 8, 4)
MID = 40          # the part of each side that repeats: long enough that the grain does not stripe


def streaks(n, seed, base, alt):
    r = random.Random(seed)
    out = []
    while len(out) < n:
        c = base if r.random() < .6 else r.choice(alt)
        out += [c] * r.randrange(3, 14)
    return out[:n]


def frame(name, rings):
    """Rings outside in. A ring is ('flat', c), ('bevel', lit, shade) (lit on top and left), or
    ('wood', base, alts) (grain running along each side). The centre stays see-through for the page."""
    k = len(rings)
    n = 2 * k + MID
    im = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    px = im.load()
    for d, ring in enumerate(rings):
        lo, hi = d, n - 1 - d
        along = streaks(n, d * 31 + 7, *ring[1:]) if ring[0] == 'wood' else None
        for i in range(lo, hi + 1):
            for (x, y, side) in ((i, lo, 'top'), (i, hi, 'bottom'), (lo, i, 'left'), (hi, i, 'right')):
                if ring[0] == 'flat':
                    c = ring[1]
                elif ring[0] == 'bevel':
                    c = ring[1] if side in ('top', 'left') else ring[2]
                    if (x, y) in ((hi, lo), (lo, hi)):
                        c = ring[2]                      # the two corners where light meets shade
                else:
                    c = along[i]
                if side in ('top', 'left') and (x, y) in ((hi, lo), (lo, hi)) and ring[0] == 'bevel':
                    c = ring[2]
                px[x, y] = c + (255,)
    for (x, y) in ((0, 0), (n - 1, 0), (0, n - 1), (n - 1, n - 1)):
        px[x, y] = (0, 0, 0, 0)
    im.save(f'pix6/{name}.png')
    return k


WOOD = ('wood', W3, (W2, W4))
DARK = ('wood', W2, (W1, W3))
# A: CARVED MOULDING. A raised lit rail with grain, a dark groove, then a lip that steps down into the page.
ka = frame('frame_a', [('flat', OUT), ('bevel', W4, W1), WOOD, WOOD, DARK, ('bevel', W1, W4), ('flat', OUT),
                       ('bevel', W0, W3), ('bevel', SH, W2), ('flat', OUT)])
# B: BRASS BEAD. The same raised rail, then a thin brass bead round the page (sheet 3's gold accent).
kb = frame('frame_b', [('flat', OUT), ('bevel', W4, W1), WOOD, WOOD, DARK, DARK, ('flat', OUT),
                       ('bevel', G2, G0), ('flat', G1), ('flat', OUT)])
# C: DEEP WELL. A wide rail and a deep stepped shadow: the page sits sunk into the desk (moody light).
kc = frame('frame_c', [('flat', OUT), ('bevel', W4, W1), WOOD, WOOD, DARK, DARK, ('bevel', W1, W3),
                       ('bevel', W0, W2), ('bevel', SH, W1), ('bevel', SH, W0), ('flat', OUT)])
print('rings', ka, kb, kc)

# The bigger carved handle: 16 x 64. A wood tab out of the left rail, rounded on its outer end, vertical grain,
# two brass rivets, a gold chevron on a sunk plate. Light from the top-left.
w, h = 16, 64
hd = Image.new('RGBA', (w, h), (0, 0, 0, 0))
p = hd.load()
cols = [streaks(h, 100 + x, W3, (W2, W4)) for x in range(w)]
for y in range(h):
    for x in range(w):
        if x >= w - 2 and (y < 2 or y > h - 3):
            continue                                         # rounded outer corners
        if x == w - 1 or y == 0 or y == h - 1 or (x == w - 2 and y in (1, h - 2)):
            c = OUT
        elif y in (1, 2) or x == 0:
            c = W4
        elif x == w - 2 or y in (h - 3, h - 2):
            c = W1
        else:
            c = cols[x][y]
        p[x, y] = c + (255,)
for y in range(22, 42):                                      # the sunk plate
    for x in range(3, 13):
        p[x, y] = (W0 if x == 3 or y == 22 else W3 if x == 12 or y == 41 else W1) + (255,)
for i in range(5):                                           # a clean pixel chevron, 2 px thick
    for (x, y) in ((6 + i, 27 + i), (7 + i, 27 + i), (6 + i, 36 - i), (7 + i, 36 - i)):
        p[x, y] = G2 + (255,)
for (x, y) in ((6, 8), (6, 54)):
    p[x, y] = G2 + (255,); p[x + 1, y] = G1 + (255,); p[x, y + 1] = G1 + (255,); p[x + 1, y + 1] = G0 + (255,)
hd.save('pix6/handle2.png')
print('ok')

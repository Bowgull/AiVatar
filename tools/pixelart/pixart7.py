# 2026-10-12, round 2 of the browser frame ("wtf it all looks the same"): three options that are clearly
# different at full size. D a big picture frame with brass corner blocks, E a velvet-lined tray, F (CSS) a
# page floating on wide wood. Tone A palette, light from the top-left, 1 art px = 2 CSS px. Output: pix7/.
import os, random
from PIL import Image
os.chdir(os.path.dirname(os.path.abspath(__file__)))
os.makedirs('pix7', exist_ok=True)
OUT = (18, 10, 5)
W0, W1, W2, W3, W4 = (36, 22, 13), (52, 33, 19), (66, 42, 24), (84, 55, 31), (110, 74, 42)
G0, G1, G2 = (150, 100, 20), (201, 140, 20), (255, 224, 150)
V0, V1, V2, V3 = (22, 12, 30), (32, 18, 44), (44, 26, 60), (74, 46, 102)
SH = (14, 8, 4)
MID = 40


def streaks(n, seed, base, alt):
    r = random.Random(seed)
    out = []
    while len(out) < n:
        c = base if r.random() < .6 else r.choice(alt)
        out += [c] * r.randrange(3, 14)
    return out[:n]


def frame(rings):
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
                    c = ring[2] if side in ('bottom', 'right') or (x, y) in ((hi, lo), (lo, hi)) else ring[1]
                else:
                    c = along[i]
                px[x, y] = c + (255,)
    for (x, y) in ((0, 0), (n - 1, 0), (0, n - 1), (n - 1, n - 1)):
        px[x, y] = (0, 0, 0, 0)
    return im, k, n


WOOD = ('wood', W3, (W2, W4))
DARK = ('wood', W2, (W1, W3))

# D: PICTURE FRAME, 18 art px (36 CSS px). Thick moulding, a gold bead at the page, and a brass corner block with
# a rivet in every corner, so it reads as a real frame from across the room.
im, k, n = frame([('flat', OUT), ('bevel', W4, W1), WOOD, WOOD, WOOD, ('bevel', W1, W4), ('flat', OUT), ('bevel', W4, W1),
                  DARK, DARK, DARK, ('bevel', W1, W3), ('flat', OUT), ('bevel', G2, G0), ('flat', G1), ('bevel', G0, G2),
                  ('flat', OUT), ('flat', SH)])
px = im.load()
for (cx, cy) in ((0, 0), (n - k, 0), (0, n - k), (n - k, n - k)):
    # the corner block: a raised brass square over the moulding's corner
    for y in range(k - 6):
        for x in range(k - 6):
            X, Y = cx + 3 + x, cy + 3 + y
            if x in (0, k - 7) or y in (0, k - 7):
                c = OUT
            elif x == 1 or y == 1:
                c = G2
            elif x == k - 8 or y == k - 8:
                c = G0
            else:
                c = G1
            px[X, Y] = c + (255,)
    m = cx + k // 2, cy + k // 2
    for (dx, dy, c) in ((-1, -1, OUT), (0, -1, OUT), (-2, 0, OUT), (1, 0, OUT), (-2, -1, OUT), (1, -1, OUT), (-1, 1, OUT), (0, 1, OUT),
                        (-1, 0, G2), (0, 0, G0)):
        px[m[0] + dx, m[1] + dy - 1] = c + (255,)
im.save('pix7/frame_d.png')
print('D', k)

# E: VELVET-LINED TRAY, 14 art px. A wood rim, then a wide band of the plum velvet from the bookmark shelf, a gold
# thread, and the page sitting in it like something laid in a case.
im, k, n = frame([('flat', OUT), ('bevel', W4, W1), WOOD, WOOD, DARK, ('flat', OUT), ('bevel', V0, V3), ('flat', V2),
                  ('wood', V2, (V1, V3)), ('wood', V2, (V1, V3)), ('wood', V2, (V1, V3)), ('wood', V2, (V1, V3)),
                  ('wood', V2, (V1, V3)), ('wood', V2, (V1, V3)), ('flat', V1), ('bevel', G2, G0), ('flat', OUT), ('flat', SH)])
im.save('pix7/frame_e.png')
print('E', k)

# The big handle again for every option (from pixart6).

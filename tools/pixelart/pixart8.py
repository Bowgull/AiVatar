# 2026-10-12: the drawer handle, softened (his words: "soften the edges and the arrow as well"). No hard black
# outline: a dark-wood edge, stepped round corners on the outer end, a rounded chevron with blunt tips on a soft
# sunk oval, soft rivets. Tone A, light from the top-left, 1 art px = 2 CSS px. Output: pix8/handle3.png.
import os, random
from PIL import Image
os.chdir(os.path.dirname(os.path.abspath(__file__)))
os.makedirs('pix8', exist_ok=True)
W0, W1, W2, W3, W4 = (36, 22, 13), (52, 33, 19), (66, 42, 24), (84, 55, 31), (110, 74, 42)
G0, G1, G2 = (150, 100, 20), (201, 140, 20), (255, 224, 150)
EDGE = (30, 18, 10)


def streaks(n, seed, base, alt):
    r = random.Random(seed)
    out = []
    while len(out) < n:
        c = base if r.random() < .6 else r.choice(alt)
        out += [c] * r.randrange(4, 16)
    return out[:n]


w, h = 16, 64
im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
p = im.load()
# Outer-end rounding: how many pixels to cut from the right on the first rows (a radius of about 5).
cut = [5, 3, 2, 1, 1]
cols = [streaks(h, 200 + x, W3, (W2, W4)) for x in range(w)]


def inside(x, y):
    for i, c in enumerate(cut):
        if (y == i or y == h - 1 - i) and x >= w - c:
            return False
    return True


for y in range(h):
    for x in range(w):
        if not inside(x, y):
            continue
        edge = not inside(x + 1, y) or x == w - 1 or not (0 < y < h - 1) or not inside(x, y - 1) or not inside(x, y + 1)
        if edge:
            c = EDGE
        elif y <= 2 or x == 0 or not inside(x, y - 2):
            c = W4                                           # soft light along the top
        elif x >= w - 2 or y >= h - 3 or not inside(x + 2, y) or not inside(x, y + 2):
            c = W1                                           # soft shade on the outer side and bottom
        else:
            c = cols[x][y]
        p[x, y] = c + (255,)

# A soft sunk oval for the arrow (rounded ends), darker at the top-left where the light cannot reach.
cx, top, bot = 7, 21, 42
for y in range(top, bot + 1):
    half = 4 if top + 2 <= y <= bot - 2 else 3 if y in (top + 1, bot - 1) else 2
    for x in range(cx - half, cx + half + 2):
        shade = W0 if (y <= top + 1 or x <= cx - half) else W2 if (y >= bot - 1 or x >= cx + half + 1) else W1
        p[x, y] = shade + (255,)

# The rounded chevron: 2 px thick, blunt tips, its corner softened with a half-tone.
pts = [(6, 26), (7, 27), (8, 28), (9, 29), (9, 30), (10, 31), (10, 32), (9, 33), (9, 34), (8, 35), (7, 36), (6, 37)]
for (x, y) in pts:
    p[x, y] = G2 + (255,)
    p[x - 1, y] = G2 + (255,)
for (x, y) in ((6, 25), (5, 25), (6, 38), (5, 38), (11, 31), (11, 32)):
    p[x, y] = G1 + (255,)                                 # blunt, softened tips and nose
# soft rivets: a round 2x2 with a lit pixel
for (x, y) in ((6, 8), (6, 54)):
    p[x, y] = G2 + (255,); p[x + 1, y] = G1 + (255,); p[x, y + 1] = G1 + (255,); p[x + 1, y + 1] = G0 + (255,)
im.save('pix8/handle3.png')
print('ok')

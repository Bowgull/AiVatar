# Hand-made pixel-art pieces for the V3 "pixel art" board. One art pixel = 2 CSS px on the page.
import os, random
from PIL import Image
os.chdir(os.path.dirname(os.path.abspath(__file__)))
os.makedirs('pix', exist_ok=True)
random.seed(7)
OUT = (18, 10, 5)
W0, W1, W2, W3, W4 = (36, 22, 13), (52, 33, 19), (66, 42, 24), (84, 55, 31), (110, 74, 42)
G0, G1, G2 = (150, 100, 20), (201, 140, 20), (255, 224, 150)


def plank(w, h, base=W2):
    """Horizontal wood grain: long streaks of darker and lighter pixels, a knot now and then."""
    im = Image.new('RGB', (w, h), base)
    px = im.load()
    for y in range(h):
        row = base if random.random() < .7 else random.choice([W1, W3]) if base == W2 else random.choice([W2, W4])
        for x in range(w):
            px[x, y] = row
    for _ in range(w * h // 45):
        x, y, n = random.randrange(w), random.randrange(h), random.randrange(3, 12)
        c = random.choice([W1, W3]) if base == W2 else random.choice([W2, W4])
        for i in range(n):
            px[(x + i) % w, y] = c
    return im


# 1. The band: a plank 64x26, top lit edge, bottom shadow, repeat-x.
b = plank(64, 26, W3)
p = b.load()
for x in range(64):
    p[x, 0] = W4; p[x, 1] = W4; p[x, 24] = W1; p[x, 25] = OUT
b.save('pix/band.png')

# 2. The frame wood (rail/drawer/window body): a tile 48x48, vertical grain for the drawer.
t = plank(48, 48, W2).rotate(90, expand=True)
t.save('pix/wood.png')

# 3. A raised 9-slice frame, 12x12, slice 4: outline, lit top-left, shaded bottom-right, a brass rivet in each corner.
f = Image.new('RGBA', (12, 12), (0, 0, 0, 0))
q = f.load()
for y in range(12):
    for x in range(12):
        edge = x in (0, 11) or y in (0, 11)
        if edge:
            q[x, y] = OUT + (255,)
        elif x == 1 or y == 1:
            q[x, y] = W4 + (255,)
        elif x == 10 or y == 10:
            q[x, y] = W1 + (255,)
        else:
            q[x, y] = W2 + (255,)
for cx, cy in ((2, 2), (9, 2), (2, 9), (9, 9)):
    q[cx, cy] = G1 + (255,)
for cx, cy in ((2, 2), (9, 2)):
    pass
q[0, 0] = q[11, 0] = q[0, 11] = q[11, 11] = (0, 0, 0, 0)  # one-pixel rounded corner
f.save('pix/frame.png')

# 4. A carved recess 9-slice, 12x12, slice 4: shaded top-left, lit bottom-right (light from top-left).
r = Image.new('RGBA', (12, 12), (0, 0, 0, 0))
s = r.load()
for y in range(12):
    for x in range(12):
        if x in (0, 11) or y in (0, 11):
            s[x, y] = OUT + (255,)
        elif x in (1, 2) or y in (1, 2):
            s[x, y] = W0 + (255,)
        elif x in (9, 10) or y in (9, 10):
            s[x, y] = W4 + (255,)
        else:
            s[x, y] = (0, 0, 0, 0)
s[0, 0] = s[11, 0] = s[0, 11] = s[11, 11] = (0, 0, 0, 0)
r.save('pix/recess.png')

# 5. The drawer handle: 10x48 tab, outline, lit top, pixel chevron centred, rivet top and bottom.
hnd = Image.new('RGBA', (10, 48), (0, 0, 0, 0))
h = hnd.load()
for y in range(48):
    for x in range(10):
        if x == 9 or y in (0, 47) or (x == 8 and y in (1, 46)):
            h[x, y] = OUT + (255,)
        elif y in (1, 2):
            h[x, y] = W4 + (255,)
        elif x == 8 or y in (45, 46):
            h[x, y] = W1 + (255,)
        else:
            h[x, y] = W3 + (255,)
h[8, 0] = h[8, 47] = OUT + (255,)
h[9, 0] = h[9, 47] = (0, 0, 0, 0)
for (x, y) in ((3, 20), (4, 20), (4, 21), (5, 21), (5, 22), (6, 22), (5, 23), (6, 23), (4, 24), (5, 24), (3, 25), (4, 25)):
    h[x, y] = G2 + (255,)
for (x, y) in ((4, 6), (4, 41)):
    h[x, y] = G1 + (255,); h[x + 1, y] = G0 + (255,)
hnd.save('pix/handle.png')
print('ok')

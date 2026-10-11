# Round 5: dark trays. Same grain recipe as the band (pixart.py), run vertically, in four dark tones,
# each with its own accent metal for the hand-made fittings. One art pixel = 2 CSS px. Light from the top-left.
import os, random
from PIL import Image
os.chdir(os.path.dirname(os.path.abspath(__file__)))
os.makedirs('pix3', exist_ok=True)
T = (0, 0, 0, 0)
OUT = (14, 8, 4, 255)

TONES = {
    # name: five wood steps dark->light, accent metal (dark, mid, light)
    'a_band_darker': ([(26, 16, 9), (38, 24, 13), (49, 31, 17), (62, 40, 22), (82, 55, 31)], [(110, 74, 24), (170, 122, 44), (226, 186, 98)]),
    'b_cabinet': ([(14, 9, 6), (21, 13, 8), (28, 18, 11), (36, 24, 15), (50, 34, 21)], [(90, 66, 30), (150, 112, 52), (205, 170, 100)]),
    'c_plum_stain': ([(22, 12, 18), (32, 18, 27), (42, 25, 36), (54, 33, 46), (72, 46, 62)], [(110, 74, 24), (170, 122, 44), (226, 186, 98)]),
    'd_walnut_verdigris': ([(22, 15, 10), (32, 22, 14), (42, 29, 18), (54, 38, 24), (72, 52, 33)], [(40, 78, 68), (66, 122, 104), (120, 178, 150)]),
}


def planks(steps, w=64, h=128, seed=3):
    random.seed(seed)
    W0, W1, W2, W3, W4 = [c + (255,) for c in steps]
    im = Image.new('RGBA', (w, h), W2)
    p = im.load()
    x = 0
    while x < w:
        pw = random.choice([10, 12, 13, 15])
        base = random.choice([W1, W2, W2, W2])
        for xx in range(x, min(w, x + pw)):
            for y in range(h):
                p[xx, y] = base
        # grain: sparse streaks along the plank (the band recipe, turned upright)
        for _ in range(pw * h // 40):
            gx, gy, n = random.randrange(x, min(w, x + pw)), random.randrange(h), random.randrange(4, 14)
            c = random.choice([W1, W3]) if base != W1 else random.choice([W0, W2])
            for i in range(n):
                p[gx, (gy + i) % h] = c
        # seam: dark line on the right, a faint lit line on the left
        for y in range(h):
            if x + pw - 1 < w: p[x + pw - 1, y] = W0
            if x < w and random.random() < .7: p[x, y] = W3
        # wear: a few nicks
        for _ in range(random.randint(1, 3)):
            nx, ny = random.randrange(x, min(w, x + pw)), random.randrange(h)
            p[nx, ny] = W0
            if ny + 1 < h: p[nx, ny + 1] = W4
        x += pw
    return im


def frame(steps, metal):
    """Raised frame, 12x12, slice 4, NO solid centre (the grain shows through). Hand-made: chipped corner pixels,
    an iron or brass nail head in each corner, the edge lit top-left and shaded bottom-right."""
    W0, W1, W2, W3, W4 = [c + (255,) for c in steps]
    M0, M1, M2 = [c + (255,) for c in metal]
    f = Image.new('RGBA', (12, 12), T)
    q = f.load()
    for i in range(12):
        q[i, 0] = q[i, 11] = q[0, i] = q[11, i] = OUT
        q[i, 1] = q[1, i] = W4
        q[i, 10] = q[10, i] = W0
    for (x, y) in ((1, 10), (10, 1)):
        q[x, y] = W2
    for cx, cy in ((2, 2), (8, 2), (2, 8), (8, 8)):  # nail heads, 2x2, lit corner
        q[cx, cy] = M2; q[cx + 1, cy] = M1; q[cx, cy + 1] = M1; q[cx + 1, cy + 1] = M0
    q[0, 0] = q[11, 0] = q[0, 11] = q[11, 11] = T
    q[1, 0] = T  # a chip
    return f


def groove(steps, w=32):
    """A carved groove to run across the tray: dark cut, lit lower lip."""
    W0, W1, W2, W3, W4 = [c + (255,) for c in steps]
    g = Image.new('RGBA', (w, 4), T)
    q = g.load()
    for x in range(w):
        q[x, 0] = OUT; q[x, 1] = W0; q[x, 2] = W0 if x % 7 else W1; q[x, 3] = W4
    return g


def sunk(steps):
    """A sunk shelf 9-slice, 12x12, slice 4: shaded top-left, lit bottom-right, no centre."""
    W0, W1, W2, W3, W4 = [c + (255,) for c in steps]
    r = Image.new('RGBA', (12, 12), T)
    s = r.load()
    for i in range(12):
        s[i, 0] = s[i, 11] = s[0, i] = s[11, i] = OUT
    for i in range(1, 11):
        s[i, 1] = s[1, i] = (8, 5, 3, 255); s[i, 2] = s[2, i] = W0
        s[i, 10] = s[10, i] = W4
    s[0, 0] = s[11, 0] = s[0, 11] = s[11, 11] = T
    return r


for name, (steps, metal) in TONES.items():
    planks(steps).save(f'pix3/{name}_wood.png')
    frame(steps, metal).save(f'pix3/{name}_frame.png')
groove(TONES['a_band_darker'][0]).save('pix3/groove.png')
sunk(TONES['a_band_darker'][0]).save('pix3/sunk.png')
print('ok')

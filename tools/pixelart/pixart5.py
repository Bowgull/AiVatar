# Round 7: five plum backings for the bookmark shelf. Pixel art, light from the top-left, 1 art px = 2 CSS px.
import os, random
from PIL import Image
os.chdir(os.path.dirname(os.path.abspath(__file__)))
os.makedirs('pix5', exist_ok=True)
random.seed(9)
T = (0, 0, 0, 0)
OUT = (14, 8, 4, 255)
PL = [(22, 12, 30, 255), (32, 18, 44, 255), (44, 26, 60, 255), (58, 35, 80, 255), (74, 46, 102, 255), (96, 64, 130, 255)]
GOLD = [(110, 74, 24, 255), (170, 122, 44, 255), (226, 186, 98, 255), (255, 228, 150, 255)]


def nine(edge_fn, name):
    f = Image.new('RGBA', (12, 12), T)
    q = f.load()
    edge_fn(q)
    q[0, 0] = q[11, 0] = q[0, 11] = q[11, 11] = T
    f.save(f'pix5/{name}')


# 1. Velvet: deep plum pile with a soft dithered sheen falling from the top-left; gold-thread stitched edge.
v = Image.new('RGBA', (48, 48), PL[2]); p = v.load()
for y in range(48):
    for x in range(48):
        d = (x + y) / 96
        r = random.random()
        if d < .35 and r < .55 - d: p[x, y] = PL[3]
        elif d > .6 and r < d - .45: p[x, y] = PL[1]
        elif r < .06: p[x, y] = PL[1]
v.save('pix5/velvet.png')
def velvet_edge(q):
    for i in range(12):
        q[i, 0] = q[i, 11] = q[0, i] = q[11, i] = OUT
        q[i, 1] = q[1, i] = PL[4]; q[i, 10] = q[10, i] = PL[0]
    for i in range(2, 10, 2):
        q[i, 2] = q[2, i] = q[i, 9] = q[9, i] = GOLD[2]
nine(velvet_edge, 'velvet_f.png')

# 2. Plum-stained inset wood: the tray's own grain, stained plum, carved in.
w = Image.open('pix3/a_band_darker_wood.png').convert('RGBA'); p = w.load()
for y in range(w.height):
    for x in range(w.width):
        r, g, b, a = p[x, y]
        lum = (r + g + b) / 3
        p[x, y] = (int(lum * .55 + 14), int(lum * .32 + 6), int(lum * .75 + 22), a)
w.save('pix5/stain.png')
def sunk_edge(q):
    for i in range(12):
        q[i, 0] = q[i, 11] = q[0, i] = q[11, i] = OUT
    for i in range(1, 11):
        q[i, 1] = q[1, i] = (8, 4, 10, 255); q[i, 2] = q[2, i] = PL[0]
        q[i, 10] = q[10, i] = PL[4]
nine(sunk_edge, 'sunk_f.png')

# 3. Enamel: a smooth plum enamel plate (like the plum keycaps, laid flat) in a brass rim with rivets.
e = Image.new('RGBA', (16, 16), PL[3]); p = e.load()
for y in range(16):
    for x in range(16):
        if y < 2: p[x, y] = PL[4]
        elif y > 13: p[x, y] = PL[2]
e.save('pix5/enamel.png')
def brass_edge(q):
    for i in range(12):
        q[i, 0] = q[i, 11] = q[0, i] = q[11, i] = OUT
        q[i, 1] = q[1, i] = GOLD[2]; q[i, 2] = q[2, i] = GOLD[1]
        q[i, 10] = q[10, i] = GOLD[0]; q[i, 9] = q[9, i] = GOLD[1]
    for c in ((1, 1), (10, 1), (1, 10), (10, 10)):
        q[c] = GOLD[3]
nine(brass_edge, 'brass_f.png')

# 4. Filigree: dark plum with a faint embossed diamond pattern, like tooled book leather.
fi = Image.new('RGBA', (16, 16), PL[1]); p = fi.load()
pts = [(8, 1), (7, 2), (9, 2), (6, 3), (10, 3), (5, 4), (11, 4), (6, 5), (10, 5), (7, 6), (9, 6), (8, 7)]
for x, y in pts:
    p[x, y] = PL[3]; p[x, y + 1] = PL[0]
for x, y in ((0, 9), (1, 10), (15, 9), (14, 10), (0, 15), (15, 15)):
    p[x, y] = PL[2]
fi.save('pix5/filigree.png')
def gold_line_edge(q):
    for i in range(12):
        q[i, 0] = q[i, 11] = q[0, i] = q[11, i] = OUT
        q[i, 1] = q[1, i] = PL[3]; q[i, 10] = q[10, i] = PL[0]
    for i in range(3, 9):
        q[i, 3] = q[3, i] = q[i, 8] = q[8, i] = GOLD[1]
    q[3, 3] = q[8, 3] = q[3, 8] = q[8, 8] = GOLD[2]
nine(gold_line_edge, 'filigree_f.png')

# 5. Banner: a plum cloth hung from a brass rod, the bottom edge cut in a swallowtail (top piece is the rod).
rod = Image.new('RGBA', (8, 6), T); p = rod.load()
for x in range(8):
    p[x, 0] = OUT; p[x, 1] = GOLD[3]; p[x, 2] = GOLD[2]; p[x, 3] = GOLD[1]; p[x, 4] = GOLD[0]; p[x, 5] = OUT
rod.save('pix5/rod.png')
cl = Image.new('RGBA', (16, 16), PL[2]); p = cl.load()
for y in range(16):
    for x in range(16):
        if x % 8 == 0: p[x, y] = PL[1]       # soft folds
        elif x % 8 == 1: p[x, y] = PL[3]
cl.save('pix5/cloth.png')
print('ok')

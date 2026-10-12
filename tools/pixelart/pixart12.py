# 2026-10-12, the green panels made by hand like the wood (his note: "they feel cheap and slapped on"), the corner
# caps with a second gold arrow nested inside, and icon options for New trail and Tidy. 1 art px = 2 CSS px.
# Output: pix12/.
import os, random
from PIL import Image
os.chdir(os.path.dirname(os.path.abspath(__file__)))
os.makedirs('pix12', exist_ok=True)
random.seed(12)
T = (0, 0, 0, 0)
K = (14, 12, 10)
G, g, o = (255, 226, 140), (214, 170, 72), (120, 88, 30)
# jade slate, hue-shifted: shadows lean blue-green, lights lean yellow-green (pixel-art ramp rule)
S0, S1, S2, S3, S4 = (20, 30, 30), (30, 42, 40), (40, 55, 50), (52, 70, 62), (72, 92, 78)


def grid(rows, key, name):
    im = Image.new('RGBA', (len(rows[0]), len(rows)), T)
    p = im.load()
    for y, r in enumerate(rows):
        for x, c in enumerate(r):
            if c in key:
                p[x, y] = key[c] + (255,)
    im.save(f'pix12/{name}.png')
    return im


# 1. Caps with a second gold arrow nested inside (the first mockup's cap, plus one).
CAP = [
    "....kkkkkk",
    "...kGGGGGg",
    "..kGokkkkk",
    ".kGok.....",
    "kGok..kkkk",
    "kgk..kGGGg",
    "kgk.kGokkk",
    "kgk.kgk...",
    "kgk.kgk...",
    "kgk.kgk...",
]
key = {'G': G, 'g': g, 'o': o, 'k': K}
grid(CAP, key, 'cap2_tl')
grid([r[::-1] for r in CAP], key, 'cap2_tr')
grid(CAP[::-1], key, 'cap2_bl')
grid([r[::-1] for r in CAP[::-1]], key, 'cap2_br')

# 2. The slate itself: a tile of hand-flecked jade stone (like the wood is hand-grained), and a carved 9-slice edge:
# dark line, a lit bevel on the top and left, a shade on the bottom and right, stepped round corners.
W = H = 48
t = Image.new('RGBA', (W, H), S2 + (255,))
p = t.load()
for _ in range(W * H // 3):
    x, y = random.randrange(W), random.randrange(H)
    p[x, y] = random.choice([S1, S1, S3, S2]) + (255,)
for _ in range(14):                                   # little veins of lighter stone, 3 to 6 pixels long
    x, y = random.randrange(W), random.randrange(H)
    for i in range(random.randrange(3, 7)):
        p[(x + i) % W, (y + (i // 3)) % H] = S3 + (255,)
for _ in range(10):                                   # pits
    x, y = random.randrange(W), random.randrange(H)
    p[x, y] = S0 + (255,)
t.save('pix12/slate.png')

F = [
    "...kkkkkk...",
    ".kkLLLLLLkk.",
    ".kLLlllllLk.",
    "kLll....lsdk",
    "kLl......sdk",
    "kLl......sdk",
    "kLl......sdk",
    "kLl......sdk",
    "kLs......sdk",
    ".kssssssssk.",
    ".kkddddddkk.",
    "...kkkkkk...",
]
grid(F, {'k': K, 'L': S4, 'l': S3, 's': S1, 'd': S0}, 'slateframe')

# 3. Icons, 9 x 9, gold. TIDY: A a gust of three air curls, B a broom, C a swirl with sparkles.
# NEW TRAIL: A footprints with a plus, B a signpost with a plus, C a path branching.
ICONS = {
    'tidy_gust': [
        ".GGGGG...",
        "G.....G..",
        "...GG..G.",
        "GGGG.G.G.",
        ".....G.G.",
        "GGGGGG.G.",
        "......G..",
        "GGGGGG...",
        ".........",
    ],
    'tidy_broom': [
        ".......Gg",
        "......Gg.",
        ".....Gg..",
        "....Gg...",
        "..oGg....",
        ".oGGGo...",
        "oGgGgGo..",
        "GgGgGgG..",
        ".G.G.G...",
    ],
    'tidy_swirl': [
        "G...GGG..",
        "...G...G.",
        "..G.GG..G",
        "..G.G.G.G",
        "..G..G..G",
        "...G...G.",
        "G...GGG..",
        ".......G.",
        "G.......G",
    ],
    'trail_steps': [
        "......GG.",
        "......GG.",
        ".GG...G..",
        ".GG......",
        ".G...G...",
        ".........",
        ".......G.",
        "......GGG",
        ".......G.",
    ],
    'trail_post': [
        "...G.....",
        ".GGGGGG..",
        ".GGGGGGG.",
        ".GGGGGG..",
        "...G.....",
        "...G..G..",
        "...G.GGG.",
        "...G..G..",
        ".GGGGG...",
    ],
    'trail_branch': [
        "G.......G",
        ".G.....G.",
        "..G...G..",
        "...G.G...",
        "....G....",
        "....G..G.",
        "....G.GGG",
        "....G..G.",
        "....G....",
    ],
}
for n, rows in ICONS.items():
    grid(rows, {'G': G, 'g': g, 'o': o}, n)
print('ok')

# The icons, finished the way the research says small pixel icons read: a dark outline all round, then a two-tone
# gold (lit on the top-left edge of each shape, mid gold inside). 11 x 11 with the outline.
def finish(rows, name):
    h, w = len(rows) + 2, len(rows[0]) + 2
    on = lambda x, y: 0 <= y - 1 < len(rows) and 0 <= x - 1 < len(rows[0]) and rows[y - 1][x - 1] in 'Gg'
    im = Image.new('RGBA', (w, h), T)
    p = im.load()
    for y in range(h):
        for x in range(w):
            if on(x, y):
                lit = not on(x - 1, y) or not on(x, y - 1)
                p[x, y] = (G if lit else g) + (255,)
            elif any(on(x + dx, y + dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1)):
                p[x, y] = K + (255,)
    im.save(f'pix12/{name}_f.png')


for n, rows in ICONS.items():
    finish(rows, n)
print('finished')

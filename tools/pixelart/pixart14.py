# 2026-10-12: three ways to give the tab plaques a made-by-hand feel (his ask, after the slate panels).
# B (recommended): a carved pixel EDGE only, lit top-left and shaded bottom-right, the middle left calm for the title.
import os, random
from PIL import Image
os.chdir(os.path.dirname(os.path.abspath(__file__)))
os.makedirs('pix14', exist_ok=True)
random.seed(14)
T = (0, 0, 0, 0)
K = (18, 10, 5)
P0, P1, P2, P3, P4 = (30, 16, 48), (44, 24, 72), (60, 36, 96), (78, 50, 120), (112, 84, 160)
W0, W1, W2, W3, W4 = (36, 22, 13), (52, 33, 19), (66, 42, 24), (84, 55, 31), (110, 74, 42)


def nine(rows, key, name):
    im = Image.new('RGBA', (len(rows[0]), len(rows)), T)
    p = im.load()
    for y, r in enumerate(rows):
        for x, c in enumerate(r):
            if c in key:
                p[x, y] = key[c] + (255,)
    im.save(f'pix14/{name}.png')


EDGE = [
    "..kkkkkkkk..",
    ".kLLLLLLLLk.",
    "kLllllllllsk",
    "kLl......sdk",
    "kLl......sdk",
    "kLl......sdk",
    "kLl......sdk",
    "kLl......sdk",
    "kLl......sdk",
    "kLssssssssdk",
    ".kdddddddddk",
    "..kkkkkkkk..",
]
# B: plum, carved edge, calm middle (filled flat by the page)
nine(EDGE, {'k': K, 'L': P4, 'l': P3, 's': P1, 'd': P0}, 'tab_edge')
# A: a soft hand-flecked plum, low contrast so titles stay readable
t = Image.new('RGBA', (32, 32), P2 + (255,))
p = t.load()
for _ in range(32 * 32 // 4):
    p[random.randrange(32), random.randrange(32)] = random.choice([P1, P3, P2]) + (255,)
t.save('pix14/tab_fleck.png')
# C: wood plaques with the same carved edge in wood, and a short grain tile
nine(EDGE, {'k': K, 'L': W4, 'l': W3, 's': W1, 'd': W0}, 'tab_wood_edge')
g = Image.new('RGBA', (64, 16), W2 + (255,))
q = g.load()
for y in range(16):
    c = W2 if random.random() < .6 else random.choice([W1, W3])
    for x in range(64):
        q[x, y] = c + (255,)
for _ in range(40):
    x, y, n = random.randrange(64), random.randrange(16), random.randrange(4, 14)
    c = random.choice([W1, W3])
    for i in range(n):
        q[(x + i) % 64, y] = c + (255,)
g.save('pix14/tab_wood.png')
print('ok')

# 2026-10-12: (1) the corner cap with a solid gold arrow inside, pointing into the corner, lit on the top half and
# shaded on the other so it has depth (his ask); (2) a clearer Tidy icon: a real broom in wood, binding and straw.
import os
from PIL import Image
os.chdir(os.path.dirname(os.path.abspath(__file__)))
os.makedirs('pix13', exist_ok=True)
T = (0, 0, 0, 0)
K = (14, 12, 10, 255)
G, g, o = (255, 226, 140, 255), (214, 170, 72, 255), (150, 104, 34, 255)
OUTER = [
    "....kkkkkkk",
    "...kGGGGGGg",
    "..kGokkkkkk",
    ".kGok......",
    "kGok.......",
    "kgk........",
    "kgk........",
    "kgk........",
    "kgk........",
    "kgk........",
    "kgk........",
]
N = len(OUTER)
im = Image.new('RGBA', (N, N), T)
p = im.load()
for y, r in enumerate(OUTER):
    for x, c in enumerate(r):
        p[x, y] = {'k': K, 'G': G, 'g': g, 'o': o}.get(c, T)
# the solid arrowhead: a right triangle tucked into the corner, its right angle pointing at the corner
ax, ay, s = 4, 4, 5
inside = lambda x, y: x >= ax and y >= ay and (x - ax) + (y - ay) <= s
for y in range(N):
    for x in range(N):
        if not inside(x, y):
            continue
        edge = not (inside(x + 1, y) and inside(x, y + 1) and inside(x - 1, y) and inside(x, y - 1))
        dx, dy = x - ax, y - ay
        if edge and (dx + dy == s):
            p[x, y] = K                                   # the long side: a dark line
        elif dx > dy:
            p[x, y] = G                                   # the top half catches the light
        elif dx == dy:
            p[x, y] = g
        else:
            p[x, y] = o                                   # the left half is in shade
im.save('pix13/cap3_tl.png')
im.transpose(Image.FLIP_LEFT_RIGHT).save('pix13/cap3_tr.png')
im.transpose(Image.FLIP_TOP_BOTTOM).save('pix13/cap3_bl.png')
im.transpose(Image.ROTATE_180).save('pix13/cap3_br.png')

# The broom, 13 x 13: a wooden handle on the diagonal, a red binding, a fan of straw with dark straw lines,
# all with a dark outline. Drawn in the colours of a real broom so it reads as one.
W1, W2 = (150, 96, 50, 255), (98, 60, 30, 255)          # handle: lit, shade
R1 = (200, 60, 50, 255)                                  # binding
S1, S2, S3 = (255, 222, 120, 255), (222, 176, 70, 255), (160, 116, 40, 255)  # straw: light, mid, line
BROOM = [
    "...........hH",
    "..........hH.",
    ".........hH..",
    "........hH...",
    ".......hH....",
    "......hH.....",
    "....rrr......",
    "...rrrr......",
    "..SSSSSS.....",
    ".SLSLSLSL....",
    "SLSLSLSLS....",
    "SLSLSLSL.....",
    ".L.L.L.L.....",
]
key = {'h': W1, 'H': W2, 'r': R1, 'S': S1, 's': S2, 'L': S3}
h, w = len(BROOM) + 2, len(BROOM[0]) + 2
b = Image.new('RGBA', (w, h), T)
q = b.load()
on = lambda x, y: 0 <= y - 1 < len(BROOM) and 0 <= x - 1 < len(BROOM[0]) and BROOM[y - 1][x - 1] in key
for y in range(h):
    for x in range(w):
        if on(x, y):
            q[x, y] = key[BROOM[y - 1][x - 1]]
        elif any(on(x + dx, y + dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1)):
            q[x, y] = K
b.save('pix13/tidy_broom2.png')
print('ok')

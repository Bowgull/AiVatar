# 2026-10-12: panel frames for the browser's Settings, from his games (N64 Zelda, FFX, Stardew). 9-slice pieces,
# 1 art px = 2 CSS px. Output: pix11/.
import os
from PIL import Image
os.chdir(os.path.dirname(os.path.abspath(__file__)))
os.makedirs('pix11', exist_ok=True)


def grid(rows, key, name):
    h, w = len(rows), len(rows[0])
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    p = im.load()
    for y, r in enumerate(rows):
        for x, c in enumerate(r):
            if c in key:
                p[x, y] = key[c] + (255,)
    im.save(f'pix11/{name}.png')


# STARDEW: a chunky wood frame round a warm parchment. Outline, lit wood, wood, dark wood, then the paper with a
# soft inner shade on the top and left. 16 x 16, slice 6.
SD = {'k': (61, 30, 10), 'l': (220, 150, 80), 'w': (180, 104, 48), 'd': (126, 66, 28), 's': (232, 196, 140), 'p': (250, 226, 172)}
rows = []
for y in range(16):
    r = ''
    for x in range(16):
        d = min(x, y, 15 - x, 15 - y)
        if d == 0:
            c = 'k'
        elif d == 1:
            c = 'l' if (x == 1 or y == 1) and not (x == 14 or y == 14) else 'd'
        elif d == 2:
            c = 'w'
        elif d == 3:
            c = 'd'
        elif d == 4:
            c = 'k'
        elif d == 5:
            c = 's' if (x == 5 or y == 5) and not (x == 10 or y == 10) else 'p'
        else:
            c = 'p'
        r += c
    rows.append(r)
for (x, y) in ((0, 0), (15, 0), (0, 15), (15, 15)):
    rows[y] = rows[y][:x] + '.' + rows[y][x + 1:]
grid(rows, SD, 'stardew')

# OCARINA: the pause-screen window: a dark slate panel with a double gold line and a gold diamond on each corner.
OT = {'k': (14, 12, 10), 'g': (214, 170, 72), 'G': (255, 226, 140), 'o': (120, 88, 30), 'f': (30, 40, 38), 'F': (40, 54, 50)}
base = [
    "....kkkkkkkk....",
    "...kGgggggggk...",
    "..kGokkkkkkogk..",
    ".kGokffffffkogk.",
    "kGokfFFFFFFfkogk",
    "kgkfFFFFFFFFfkgk",
    "kgkfFFFFFFFFfkgk",
    "kgkfFFFFFFFFfkgk",
    "kgkfFFFFFFFFfkgk",
    "kgkfFFFFFFFFfkgk",
    "kgkfFFFFFFFFfkgk",
    "kgokfFFFFFFfkogk",
    ".kgokffffffkogk.",
    "..kgokkkkkkogk..",
    "...kgggggggok...",
    "....kkkkkkkk....",
]
grid(base, OT, 'ocarina')

# The FFX-style pointing hand cursor, 12 x 9: white glove, dark outline, a grey shade under the fingers.
HAND = [
    "..kkkkkk....",
    ".kwwwwwwkkk.",
    "kwwwwwwwwwwk",
    "kwwwwwkkkkk.",
    "kwwwwwwwwk..",
    "kwwwwwkkk...",
    "kgwwwwwwk...",
    ".kggggkk....",
    "..kkkk......",
]
grid(HAND, {'k': (20, 24, 40), 'w': (250, 250, 255), 'g': (170, 176, 200)}, 'hand')
print('ok')

# OCARINA, rounded (his note, 2026-10-12: the square frame let the green poke out past the corners). The panel's
# shape now comes from the page (round corners, a double gold line); these are only the gold corner ornaments,
# one curl per corner, set just inside the line. 9 x 9, mirrored for the other three corners.
CORNER = [
    "GGGGGg...",
    "Gookkk...",
    "Gok......",
    "Gk..GGg..",
    "gk..Go...",
    ".k..g....",
    ".........",
    ".........",
    ".........",
]
key = {'G': (255, 226, 140), 'g': (214, 170, 72), 'o': (120, 88, 30), 'k': (14, 12, 10)}
grid(CORNER, key, 'oot_tl')
grid([r[::-1] for r in CORNER], key, 'oot_tr')
grid(CORNER[::-1], key, 'oot_bl')
grid([r[::-1] for r in CORNER[::-1]], key, 'oot_br')
print('corners ok')

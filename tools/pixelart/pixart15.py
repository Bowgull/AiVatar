# 2026-10-12: the shield calmed down (research: browsers keep the address-bar site icon small and one colour, and
# use colour only for trouble: Chrome's 2023 "tune" icon, Firefox's grey shield, Safari's grey lock), and a quieter
# broom in the drawer's own dim gold. Options:
#  A: one-colour gold shield outline + arrow, 16 x 18
#  B: the full-colour shield one more size down, 20 x 23 (built at that size)
#  C: A at rest; the full-colour one only while you point at it or its panel is open; red when something is wrong
import os
from PIL import Image
os.chdir(os.path.dirname(os.path.abspath(__file__)))
os.makedirs('pix15', exist_ok=True)
T = (0, 0, 0, 0)
DIM, DIMD = (191, 174, 138, 255), (120, 104, 76, 255)      # the drawer's label gold, and its shade
SHIELD16 = [
    "..XXXXXXXXXXXX..",
    ".X............X.",
    "X..............X",
    "X......aa......X",
    "X......aa......X",
    "X......aa......X",
    "X......aa......X",
    "X....aaaaaa....X",
    "X.....aaaa.....X",
    "X......aa......X",
    ".X............X.",
    ".X............X.",
    "..X..........X..",
    "...X........X...",
    "....X......X....",
    ".....X....X.....",
    "......XXXX......",
    "................",
]
def draw(rows, key, name):
    im = Image.new('RGBA', (len(rows[0]), len(rows)), T)
    p = im.load()
    for y, r in enumerate(rows):
        for x, c in enumerate(r):
            if c in key:
                p[x, y] = key[c]
    im.save(f'pix15/{name}.png')
    assert all(r == r[::-1] for r in rows), 'not mirror-symmetric'
draw(SHIELD16, {'X': DIM, 'a': DIM}, 'shield_mono')
# the quieter broom: same drawing, in the drawer's dim gold ramp only (no bright straw, no red)
src = Image.open('pix13/tidy_broom2.png').convert('RGBA')
p = src.load()
for y in range(src.height):
    for x in range(src.width):
        r, g, b, a = p[x, y]
        if not a or (r, g, b) == (14, 12, 10):
            continue
        lum = (r * 3 + g * 6 + b) / 10
        p[x, y] = DIM if lum > 150 else DIMD
src.save('pix15/tidy_broom_dim.png')
print('ok')

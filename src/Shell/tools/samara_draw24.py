# Samara's 24 px lantern, drawn for 24 (his ask, 2026-10-20): it fills the square like Aang's face does, instead of the
# 16 px drawing floating in a 24 px tile. Used by samara-icons-leaf.py; run on its own it prints the drawing.
import sys
from PIL import Image

# left halves, mirrored to make each 24-wide row ('#' outline, W dark wood, w light wood, F frame, G glass, j/k gold)
HALF = [
    '...........#',
    '..........#W',
    '.......####W',
    '......#wwwww',
    '......#WWWWW',
    '.....FGGGGGG',
    '....FGGGGGGG',
    '...FGGGGGGGG',
    '...FGGGGGGGG',
    '..FGGGGGGGGG',
    '..FGGGGGGGGG',
    '..FGGGGGGGGG',
    '..FGGGGGGGGG',
    '..FGGGGGGGGG',
    '..FGGGGGGGGG',
    '...FGGGGGGGG',
    '...FGGGGGGGG',
    '....FGGGGGGG',
    '.....FGGGGGG',
    '......#WWWWW',
    '......######',
    '..........#j',
    '..........#k',
    '..........##',
]
LEAF = [
    '...LM...',
    '..LLMM..',
    'L.LLMM.M',
    'LLLLMMMM',
    '.LLLMMM.',
    '..LLMM..',
    '.L.LM.M.',
    '...DD...',
]
LEAF_AT = (8, 8)    # top-left column, row

def rows():
    out = []
    for y, h in enumerate(HALF):
        r = list(h + h[::-1])
        # the gold knob is two tones: light on the left, dark on the right
        r = ['k' if (c in 'jk' and x >= 12) else ('j' if c in 'jk' else c) for x, c in enumerate(r)]
        for x, c in enumerate(r):
            if c != 'G': continue
            # the glass: a big pale highlight top-left, warm light across, deeper toward the bottom-right
            if y <= 5: r[x] = '2'
            elif x <= 8 and y <= 14: r[x] = '1'
            # one checkered column between the highlight and the warm light: pixel art blends by dithering, not gradients
            elif x == 9 and 6 <= y <= 14: r[x] = '1' if y % 2 else '2'
            elif x + y >= 34 or (y >= 16 and x >= 8): r[x] = '3'
            else: r[x] = '2'
        out.append(r)
    lx, ly = LEAF_AT
    for dy, row in enumerate(LEAF):
        for dx, c in enumerate(row):
            if c != '.': out[ly + dy][lx + dx] = c
    return [''.join(r) for r in out]

LIT = {'#': '24140a', 'W': '6e4422', 'w': 'c08a52', 'F': '9a4e16', '1': 'fff0c8', '2': 'f5c66a', '3': 'd98a2e',
       'L': 'ff8040', 'M': 'c95e28', 'D': '8a3a14', 'j': 'ffc43c', 'k': 'e0961e'}
UNLIT = {'#': '24140a', 'W': '6e4422', 'w': 'c08a52', 'F': '4e3b26', '1': 'b9a483', '2': '9c8664', '3': '7e6747',
         'L': '7a4a30', 'M': '5e3c28', 'D': '3e2618', 'j': '8c7a4e', 'k': '6e5c38'}

def render(pal, scale=1):
    g = rows()
    im = Image.new('RGBA', (24 * scale, 24 * scale), (0, 0, 0, 0))
    px = im.load()
    for y, r in enumerate(g):
        for x, c in enumerate(r):
            if c in pal:
                col = tuple(int(pal[c][i:i + 2], 16) for i in (0, 2, 4)) + (255,)
                for sy in range(scale):
                    for sx in range(scale): px[x * scale + sx, y * scale + sy] = col
    return im

if __name__ == '__main__':
    for r in rows(): print(r)
    out = sys.argv[1] if len(sys.argv) > 1 else None
    if out:
        render(LIT).save(out + '/samara-lit-24.png'); render(LIT, 2).save(out + '/samara-lit-48.png')
        render(UNLIT).save(out + '/samara-unlit-24.png'); render(UNLIT, 2).save(out + '/samara-unlit-48.png')

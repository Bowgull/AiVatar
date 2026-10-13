# The address-bar shield, redrawn at its real size (sheet 20, his pick C, 2026-10-13: "the arrow is impossible to
# read"). The old 32x36 art was squeezed into 20x23 and the arrow smeared. This is a 10x12 grid, 2 screen pixels per
# pixel, exactly like the band's keys (7x7 at 2), so every pixel lands on a pixel. Symmetric; a clear pixel of field
# on every side of Aang's arrow. Writes shield_rest.png, shield_hover.png and shield_popup.png (20x24).
import sys
from PIL import Image

SHAPE = [
    'oooooooooo',
    'offffffffo',
    'offfaafffo',
    'offfaafffo',
    'offfaafffo',
    'ofaaaaaafo',
    'offaaaaffo',
    '.offaaffo.',
    '.offffffo.',
    '..offffo..',
    '...offo...',
    '....oo....',
]
LOOKS = {
    # C: today's colours, crisp. Quiet at rest, lit on hover, solid blue when it caught a popup.
    'rest':  {'o': '#8a7448', 'f': '#18225C', 'a': '#8FB4F2'},
    'hover': {'o': '#FFC43C', 'f': '#22307A', 'a': '#C8DCFF'},
    'popup': {'o': '#FFC43C', 'f': '#2F5FD0', 'a': '#FFFFFF'},
}
assert all(r == r[::-1] for r in SHAPE), 'not symmetric'
out = sys.argv[1] if len(sys.argv) > 1 else '.'
for name, pal in LOOKS.items():
    im = Image.new('RGBA', (20, 24), (0, 0, 0, 0))
    for y, row in enumerate(SHAPE):
        for x, ch in enumerate(row):
            if ch == '.':
                continue
            c = tuple(int(pal[ch][i:i + 2], 16) for i in (1, 3, 5)) + (255,)
            for dy in (0, 1):
                for dx in (0, 1):
                    im.putpixel((x * 2 + dx, y * 2 + dy), c)
    im.save(f'{out}/shield_{name}.png')
print('ok')

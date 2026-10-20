# Two things for Samara's small icons (his asks, 2026-10-20), run after any regeneration of the lit/unlit PNGs:
#
#  1. The mark in the lantern's glass is a maple leaf at the small sizes, not the "plus" the generator's rule-drawn leaf
#     shrinks into below 64 px. Hand-laid per size: 16 and 24 share one drawing (24 is the 16 on a bigger tile), 48 is
#     the 24 at 2x, 32 has its own. The old mark is painted out with the glass colour beside it, then the leaf stamped.
#  2. The pop-out's own taskbar icon (sheet 42, his pick A): Samara's lit lantern with its light in the turquoise of the
#     update glow, a palette swap colour for colour at every size, so no pixel moves and nothing is resampled.
#
# Run: python src/Shell/tools/samara-icons-leaf.py   (writes into src/Shell/pages/art/samara/)
import colorsys, io, os, struct
from PIL import Image

ART = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'pages', 'art', 'samara')

MARK = {(0xc9, 0x5e, 0x28), (0x8a, 0x3a, 0x14)}
KEY = {'L': (0xff, 0x80, 0x40), 'M': (0xc9, 0x5e, 0x28), 'D': (0x8a, 0x3a, 0x14)}
LEAF16 = ['..LM..', 'L.LM.M', 'LLLMMM', '.LLMM.', '..DD..']
LEAF32 = ['....LM....', '...LLMM...', 'L..LLMM..M', 'LL.LLMM.MM', 'LLLLLMMMMM', '.LLLLMMMM.', '..LLLMMM..', '.LL.LM.MM.', '....DD....', '....DD....']
# where the glass is (to paint out the old mark) and where the leaf goes, per size
# 24 and 48 are not stamped: they are drawn whole for 24 (samara_draw24.py, his ask 2026-10-20: the taskbar at 100%
# shows the 24, and the 16 floating in a 24 tile looked small beside Aang's face). 48 is that drawing at 2x.
PLACE = {16: ((3, 4, 13, 11), LEAF16, 5, 5, 1), 32: ((7, 9, 25, 25), LEAF32, 11, 11, 1)}


def clean(im, box):
    x0, y0, x1, y1 = box
    px = im.load()
    for y in range(y0, y1):
        for x in range(x0, x1):
            if px[x, y][3] > 200 and px[x, y][:3] in MARK:
                for d in range(1, 8):
                    hit = next((xx for xx in (x - d, x + d) if x0 <= xx < x1 and px[xx, y][3] > 200 and px[xx, y][:3] not in MARK), None)
                    if hit is not None: px[x, y] = px[hit, y]; break


def stamp(im, leaf, ox, oy, k):
    px = im.load()
    for y, row in enumerate(leaf):
        for x, ch in enumerate(row):
            if ch in KEY:
                for sy in range(k):
                    for sx in range(k): px[ox + x * k + sx, oy + y * k + sy] = KEY[ch] + (255,)


def has_leaf(im, n):
    """Already done: the light ember of the new leaf sits where the drawing puts it."""
    box, leaf, ox, oy, k = PLACE[n]
    return im.getpixel((ox + 2 * k, oy + 2 * k))[:3] == KEY['L']


def ico(path, pngs):
    head = struct.pack('<HHH', 0, 1, len(pngs))
    off, dirs, blobs = 6 + 16 * len(pngs), b'', b''
    for size, data in pngs:
        dirs += struct.pack('<BBBBHHII', 0 if size >= 256 else size, 0 if size >= 256 else size, 0, 0, 1, 32, len(data), off)
        off += len(data); blobs += data
    open(path, 'wb').write(head + dirs + blobs)


def png(im):
    b = io.BytesIO(); im.save(b, 'PNG'); return b.getvalue()


LIGHT = {'ff802b', 'ff8d28', 'ff9f32', 'ffc53c', 'fff0c8', 'f5c66a', 'ffc43c', 'e0961e', 'd98a2e'}


def turquoise(p):
    if p[3] == 0 or '%02x%02x%02x' % p[:3] not in LIGHT: return p
    h, s, v = colorsys.rgb_to_hsv(*(c / 255 for c in p[:3]))
    r, g, b = colorsys.hsv_to_rgb((h + 0.43) % 1, min(1, s * 0.9), v)
    return (round(r * 255), round(g * 255), round(b * 255), p[3])


SIZES = [16, 24, 32, 48, 64, 256]
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from samara_draw24 import LIT, UNLIT, render
for k, pal in (('samara-lit', LIT), ('samara-unlit', UNLIT)):
    render(pal).save(os.path.join(ART, f'{k}-24.png'))
    render(pal, 2).save(os.path.join(ART, f'{k}-48.png'))
for name in ('samara-lit', 'samara-unlit'):
    for n in PLACE:
        f = os.path.join(ART, f'{name}-{n}.png')
        im = Image.open(f).convert('RGBA')
        if has_leaf(im, n): continue
        box, leaf, ox, oy, k = PLACE[n]
        clean(im, box); stamp(im, leaf, ox, oy, k); im.save(f)
    # New file names, not samara-lit.ico / samara-unlit.ico: Windows caches a taskbar icon by its path, so the same name
    # with new pixels kept showing the old lantern (his report, 2026-10-20). open = lit, closed = unlit.
    ico(os.path.join(ART, {'samara-lit': 'samara-open.ico', 'samara-unlit': 'samara-closed.ico'}[name]), [(n, png(Image.open(os.path.join(ART, f'{name}-{n}.png')).convert('RGBA'))) for n in SIZES])

# the pop-out's lantern: the leaf keeps its own ember colours, only the lantern's light turns turquoise
pop = []
for n in SIZES:
    im = Image.open(os.path.join(ART, f'samara-lit-{n}.png')).convert('RGBA')
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            px[x, y] = turquoise(px[x, y])
    im.save(os.path.join(ART, f'samara-popout-{n}.png'))
    pop.append((n, png(im)))
ico(os.path.join(ART, 'samara-popout.ico'), pop)
print('ok')

# 3. The taskbar light-up (his ask, 2026-10-20): ten frames from the closed lantern to the open one, at every taskbar size.
#    The two are the same drawing in two palettes, so each frame blends them pixel by pixel: nothing moves, nothing is
#    resampled, it stays as crisp as the icons themselves. Eased out, so it catches quickly and settles into the light.
FRAMES = 10
for i in range(FRAMES):
    t = 1 - (1 - i / (FRAMES - 1)) ** 2
    entries = []
    for n in (16, 24, 32, 48):
        a = Image.open(os.path.join(ART, f'samara-unlit-{n}.png')).convert('RGBA')
        b = Image.open(os.path.join(ART, f'samara-lit-{n}.png')).convert('RGBA')
        entries.append((n, png(Image.blend(a, b, t))))
    ico(os.path.join(ART, f'samara-lightup-{i}.ico'), entries)
print('light-up frames ok')

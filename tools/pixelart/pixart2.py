# Round 4 pixel art: the tray in a warmer, hand-made Ghibli wood; the drawer tab and its arrow; new-tab options.
# One art pixel = 2 CSS px. Light from the top-left everywhere.
import os, random
from PIL import Image
os.chdir(os.path.dirname(os.path.abspath(__file__)))
os.makedirs('pix2', exist_ok=True)
random.seed(11)
T = (0, 0, 0, 0)
OUT = (26, 14, 8, 255)
# warm, sunlit wood (Howl's castle timber, Mononoke forest): reds and ambers, not grey-brown
WD = [(58, 32, 18, 255), (78, 45, 24, 255), (98, 60, 32, 255), (120, 76, 40, 255), (146, 96, 52, 255), (176, 124, 70, 255)]
MOSS = [(58, 82, 40, 255), (86, 116, 52, 255), (128, 156, 72, 255)]
BR = [(110, 74, 24, 255), (170, 122, 44, 255), (226, 186, 98, 255), (255, 232, 160, 255)]
GLOW = (255, 214, 140, 255)


def warm_planks(w, h, vertical=True):
    """Planks of different widths, each with its own tone, soft grain lines and the odd knot. Organic, not noise."""
    im = Image.new('RGBA', (w, h), WD[2])
    p = im.load()
    x = 0
    while x < w:
        pw = random.choice([9, 11, 12, 14])
        tone = random.choice([2, 3, 3, 2, 4])
        for xx in range(x, min(w, x + pw)):
            for y in range(h):
                p[xx, y] = WD[tone]
        # grain: long gentle wavy lines running down the plank
        for g in range(random.randint(2, 3)):
            gx = x + random.randint(2, pw - 3)
            for y in range(h):
                if random.random() < .85:
                    xx = gx + (1 if (y // 9) % 2 else 0)
                    if xx < min(w, x + pw) - 1:
                        p[xx, y] = WD[tone - 1]
        # a lit edge on the left of each plank, a dark seam on the right
        for y in range(h):
            if x < w: p[x, y] = WD[min(5, tone + 1)]
            if x + pw - 1 < w: p[x + pw - 1, y] = WD[0]
        # a knot
        if random.random() < .6:
            kx, ky = x + pw // 2, random.randint(6, h - 7)
            for dx, dy in ((0, 0), (1, 0), (0, 1), (1, 1), (-1, 0), (2, 1), (0, -1), (1, 2)):
                if 0 <= kx + dx < w and 0 <= ky + dy < h: p[kx + dx, ky + dy] = WD[1]
            if 0 <= kx < w: p[kx, ky] = WD[0]
        x += pw
    if not vertical:
        im = im.rotate(90, expand=True)
    return im


warm_planks(64, 96).save('pix2/tray.png')


def ivy(w, h):
    """A trailing vine of moss and leaves to sit along the tray's top edge."""
    im = Image.new('RGBA', (w, h), T)
    p = im.load()
    y = 2
    for x in range(w):
        if random.random() < .25: y = max(1, min(h - 3, y + random.choice([-1, 1])))
        p[x, y] = MOSS[0]
        if random.random() < .18:
            ly = y + random.choice([1, 2])
            for dx, dy, c in ((0, 0, 1), (1, 0, 2), (0, 1, 1), (1, 1, 1)):
                if x + dx < w and ly + dy < h: p[x + dx, ly + dy] = MOSS[c]
    return im


ivy(64, 8).save('pix2/ivy.png')

# Raised tray frame, 12x12 9-slice, slice 4: dark outline, warm lit top-left, brass corner caps.
f = Image.new('RGBA', (12, 12), T)
q = f.load()
for y in range(12):
    for x in range(12):
        if x in (0, 11) or y in (0, 11): q[x, y] = OUT
        elif x == 1 or y == 1: q[x, y] = WD[5]
        elif x == 10 or y == 10: q[x, y] = WD[1]
        else: q[x, y] = WD[3]
for cx, cy in ((1, 1), (2, 1), (1, 2), (10, 1), (9, 1), (10, 2), (1, 10), (2, 10), (1, 9), (10, 10), (9, 10), (10, 9)):
    q[cx, cy] = BR[2]
q[1, 1] = q[10, 1] = BR[3]
q[0, 0] = q[11, 0] = q[0, 11] = q[11, 11] = T
f.save('pix2/trayframe.png')


def handle(h=48, ring=False, count=True):
    """The drawer tab: 11 px wide (22 CSS), a brass hinge strap top and bottom, the arrow dead centre.
    The arrow is a 4x7 chevron with a 1px shadow, centred on the tab's face (the face is columns 1..8)."""
    w = 11
    im = Image.new('RGBA', (w, h), T)
    p = im.load()
    for y in range(h):
        for x in range(w):
            if x == w - 1 or y in (0, h - 1): p[x, y] = OUT
            elif y == 1: p[x, y] = WD[5]
            elif x == w - 2 or y == h - 2: p[x, y] = WD[1]
            else: p[x, y] = WD[3] if (x + y // 7) % 5 else WD[2]
    p[w - 1, 0] = p[w - 1, h - 1] = T
    p[w - 2, 0] = p[w - 2, h - 1] = OUT
    for sy in (4, h - 6):  # brass hinge straps
        for x in range(0, w - 2):
            p[x, sy] = BR[2]; p[x, sy + 1] = BR[1]
        p[w - 4, sy] = BR[3]
    cy = h // 2 - 3  # chevron, face centre is x=4.5 -> occupy x 3..6
    pts = [(3, 0), (4, 1), (5, 2), (6, 3), (5, 4), (4, 5), (3, 6)]
    for dx, dy in pts:
        p[dx + 1, cy + dy + 1] = WD[0]       # shadow down-right
    for dx, dy in pts:
        p[dx, cy + dy] = BR[3]
        p[dx - 1, cy + dy] = BR[2]           # 2px thick stroke
    if ring:  # a brass pull ring below the arrow
        ry = cy + 11
        for dx, dy in ((3, 0), (4, 0), (5, 0), (2, 1), (6, 1), (2, 2), (6, 2), (3, 3), (4, 3), (5, 3)):
            p[dx, ry + dy] = BR[2]
    return im


handle(48).save('pix2/handle_a.png')
handle(64, ring=True).save('pix2/handle_c.png')
handle(30).save('pix2/handle_s.png')

# New-tab option A: an empty bag slot, 18x18 — a sunk dark square, lit bottom-right lip, a brass + in the middle.
s = Image.new('RGBA', (18, 18), T)
q = s.load()
for y in range(18):
    for x in range(18):
        if x in (0, 17) or y in (0, 17): q[x, y] = OUT
        elif x in (1, 2) or y in (1, 2): q[x, y] = (20, 12, 8, 255)
        elif x in (15, 16) or y in (15, 16): q[x, y] = WD[3]
        else: q[x, y] = (40, 24, 14, 255)
for i in range(5, 13):
    q[i, 8] = BR[2]; q[i, 9] = BR[2]; q[8, i] = BR[2]; q[9, i] = BR[2]
for i in range(5, 13):
    q[i, 10] = BR[0] if q[i, 10] != BR[2] else q[i, 10]
q[0, 0] = q[17, 0] = q[0, 17] = q[17, 17] = T
s.save('pix2/slot.png')
print('ok')

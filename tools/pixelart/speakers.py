# 9.D D4 (2026-10-13): the avatars for Aang's separate speakers in Discord, Claude and Job Hunt, hand-placed pixel art
# in the same style as Aang's face (16x16 grid, dark outline, 8x scale = 128x128, which Discord rounds into a circle).
# Writes src/Core/assets/speakers/claude.png and jobhunt.png.
import os, sys
from PIL import Image

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'Core', 'assets', 'speakers')
os.makedirs(OUT, exist_ok=True)

# Claude: a warm clay starburst on parchment.
CLAUDE = [
    '................',
    '.......oo.......',
    '.......cco......',
    '...o...cc...o...',
    '...occ.cc.cco...',
    '....occccccc....',
    '.....oCCCCo.....',
    '.occcccCCcccccco',
    'occccccCCccccco.',
    '.....oCCCCo.....',
    '....ccccccco....',
    '...occ.cc.cco...',
    '...o...cc...o...',
    '......occ.......',
    '.......oo.......',
    '................',
]
# Job Hunt: a leather briefcase with a gold clasp.
JOBS = [
    '................',
    '................',
    '.....oooooo.....',
    '.....o....o.....',
    '..oooooooooooo..',
    '.obbbbbbbbbbbbo.',
    '.oBBBBBBBBBBBBo.',
    '.obbbbbggbbbbbo.',
    '.ooooooggoooooo.',
    '.obbbbbbbbbbbbo.',
    '.obbbbbbbbbbbbo.',
    '.oBbbbbbbbbbbBo.',
    '.oooooooooooooo.',
    '................',
    '................',
    '................',
]
PAL = {
    'o': (18, 10, 5), 'c': (217, 119, 87), 'C': (245, 176, 140),
    'b': (138, 90, 46), 'B': (198, 138, 74), 'g': (255, 196, 60),
}
BG = (236, 213, 168)          # parchment, so the circle Discord cuts reads as a token

def draw(grid, name):
    im = Image.new('RGB', (128, 128), BG)
    for y, row in enumerate(grid):
        for x, ch in enumerate(row):
            if ch in PAL:
                for dy in range(8):
                    for dx in range(8):
                        im.putpixel((x * 8 + dx, y * 8 + dy), PAL[ch])
    im.save(os.path.join(OUT, name))

draw(CLAUDE, 'claude.png')
draw(JOBS, 'jobhunt.png')
print('ok')

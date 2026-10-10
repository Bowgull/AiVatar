import io
from importlib.machinery import SourceFileLoader
B = SourceFileLoader("b", "build-sheet12.py").load_module()
f, balloon_path, carved_svg = B.f, B.balloon_path, B.carved_svg
LINE_H, PAD_Y, PAD_X, OW = B.LINE_H, B.PAD_Y, B.PAD_X, B.OW

# The sprite, and where the balloon hangs off it (anchor.ts, read out of the C#).
SPRITE = 224
ANCHOR_R, ANCHOR_B = 16, 38       # balloon bottom-right = sprite.left + 16, sprite.top + 38
HEAD_DX, HEAD_DY = 96, 58         # his head, measured from that corner
REACH = 0.62                      # how far along to him the tail stops (comic rule: 50-60%)
BODY_W = 300                      # a touch wider than today's 256: 20 lines in a narrow column is a chimney

uid = [0]

def balloon(lines, body_w=BODY_W, scale=1.0, text=None):
    """A balloon sized to hold `lines` lines, with the tail aimed at his head."""
    uid[0] += 1
    bw, bh = body_w, lines * LINE_H + PAD_Y * 2
    tip = (bw + HEAD_DX * REACH, bh + HEAD_DY * REACH)
    pad_r, pad_b = bw + HEAD_DX * REACH + 10 - bw, HEAD_DY * REACH + 10
    w, h = bw + pad_r, bh + pad_b
    d = balloon_path(bw, bh, tip)
    svg = carved_svg(w, h, d, uid[0], pad_r, pad_b, scale)
    txt = ""
    if text:
        txt = (f'<div class="txt" style="left:{f(PAD_X*scale)}px;top:{f(PAD_Y*scale)}px;'
               f'width:{f((bw-2*PAD_X)*scale)}px;height:{f((bh-2*PAD_Y)*scale)}px">{text}</div>')
    return (f'<div class="balloon" style="width:{f(w*scale)}px;height:{f(h*scale)}px">'
            f'{svg}{txt}</div>', w * scale, h * scale, pad_r * scale, pad_b * scale)


def scene(lines, text, scale=1.0, screen_h=None, label=""):
    """One scene: Discord behind, Aang standing, the balloon hung off him by the real anchor."""
    sp = SPRITE * scale
    b, bw, bh, pr, pb = balloon(lines, scale=scale, text=text)
    # Where he stands, in SCREEN pixels, so it scales with everything else. Hardcoding the sprite at
    # right:30 bottom:10 while scaling the balloon put him in the wrong place in the scaled views.
    sx, sy = 30 * scale, 10 * scale
    # the balloon's BODY bottom-right sits on the anchor; the svg hangs past it by pr/pb
    right = (sx + sp - ANCHOR_R * scale) - pr
    # ANCHOR_B is measured from the sprite's TOP, not its bottom. Getting that wrong put the
    # balloon 186px low, with the tail aiming at his knees. Measured in the page, not guessed.
    bottom = (sy + (SPRITE - ANCHOR_B) * scale) - pb
    h = screen_h or max(300, bh + 120)
    # The size diagram uses a FLAT screen, not the Discord screenshot. At a fifth size the screenshot
    # is just noise and the balloon disappears into it; the point of these three is the balloon's
    # height against the screen, nothing else.
    wide = f';width:{f(1920*scale)}px;margin:0 auto' if screen_h else ''
    cls = 'scene flat' if screen_h else 'scene'
    return (f'<div class="{cls}" style="height:{f(h)}px{wide}">'
            f'<div class="hold" style="right:{f(right)}px;bottom:{f(bottom)}px">{b}</div>'
            f'<div class="sprite" style="width:{f(sp)}px;height:{f(sp)}px;'
            f'right:{f(sx)}px;bottom:{f(sy)}px"></div>'
            f'{label}</div>')


SHORT = '<p class="q">two short sentences about tea</p><p>Leaves brewed in hot water. Different kinds, all soothing.</p>'
LONG = ('<p class="q">how does the apothecary diaries scrobbling work</p><p>When you ask me to put '
        'something on, I look it up on Simkl first, then start a scrobble so it shows as watching. '
        'While it plays I send progress as a percentage, not seconds, because that is what the API '
        'wants. When you get past eighty per cent I send a stop, and Simkl marks the episode watched '
        'and moves you to the next one.</p>')

# ---------------------------------------------------------------- the screen-scale view
# His screen is 1920x1080. At 0.33 the whole thing fits on this sheet and the proportions are honest.
S = 0.2
SCREEN_H = 1080 * S
usable_lines = int((1080 - 10 - 38 - 90) / LINE_H)   # floor to the top of the screen, with a margin

rows = []
for n, cap in [(3, "A three line reply"), (12, "Twelve lines, which is where it stops today"),
               (int(usable_lines), f"{int(usable_lines)} lines, which is the tallest that fits")]:
    rows.append('<figure>' + scene(n, "", scale=S, screen_h=SCREEN_H)
                + f'<figcaption><b>{cap}</b>{n} lines, drawn at a fifth size, so this is the whole '
                  f'1920 by 1080 screen, in proportion.</figcaption></figure>')

HTML = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
 '<title>Aang &middot; The balloon, as decided</title>\n'
 '<link href="https://fonts.googleapis.com/css2?family=Figtree:ital,wght@0,400;0,500;0,600;0,700;1,500&amp;family=Silkscreen&amp;display=swap" rel="stylesheet">\n'
 # A version on the stylesheet. Without it the browser serves a cached copy and a CSS change looks
 # like a CSS bug, which cost a round of debugging on 2026-10-04.
 f'<link rel="stylesheet" href="sheet-12.css?v={int(__import__("time").time())}">\n</head>\n<body>\n<div class="wrap">\n'
 '<h1>A A N G &middot; S H E E T 1 2</h1>\n'
 '<p class="sub">The balloon as you settled it: a soft-edged rectangle, your design language kept, '
 'a real comic tail, no beads.<br>And how big it actually gets.</p>\n'

 '<h2 class="part">WHAT YOU DECIDED</h2>\n'
 '<p class="why">A <b>soft-edged rectangle</b>, not an oval. <b>Your design language unchanged</b>: '
 'parchment, the lit top lip, the shaded bottom, the near-black line, the hard shadow. One shape '
 'always, sentence case, warm cream. A <b>real comic tail</b>, drawn as part of the same outline so '
 'there is no seam, aimed back through the centre of the balloon. And it <b>grows to fit the whole '
 'reply</b>: the twelve-line cap is gone.</p>\n'
 '<p class="why">The carve is the part that needed solving. Your panels get their lit lip and shaded '
 'bottom from inset shadows, which only work on a rectangle, and this shape has a tail. So the '
 'outline is drawn five times, each pass clipped to itself and nudged a few pixels: shadow, fill, '
 'lit lip, shade, then the ink line last. The carve follows the tail for free, because the tail is '
 'part of the same path.</p>\n'

 '<h2 class="part">AT FULL SIZE</h2>\n'
 '<figure>' + scene(3, SHORT) + '<figcaption><b>A short reply</b>1:1. The tail stops about sixty per '
 'cent of the way to him and points at his face.</figcaption></figure>\n'
 '<div class="gap"></div>\n'
 '<figure>' + scene(12, LONG) + '<figcaption><b>A longer one</b>Still one balloon, still one '
 'outline.</figcaption></figure>\n'

 '<h2 class="part">HOW BIG IT GETS</h2>\n'
 '<p class="why">You asked to see it. This is your whole 1920 by 1080 screen at a fifth size, so the '
 'proportions are honest. With the cap removed, a reply grows until it runs out of screen. '
 f'<b>{int(usable_lines)} lines is the tallest that fits</b> above him with a margin at the top, which '
 'is roughly 400 words. Past that it has to scroll, because there is nowhere left to go.</p>\n'
 '<div class="grid3">\n' + "\n".join(rows) + '\n</div>\n'
 '<p class="why">So the honest answer to your question is that the choice only matters past about '
 f'{int(usable_lines)} lines, and almost nothing Aang says is that long. I would let it grow freely '
 'to the top of the screen and scroll only there, which is the first option, and you would likely '
 'never see it.</p>\n'
 '</div>\n</body>\n</html>\n')
io.open('sheet-12.html', 'w', encoding='utf-8').write(HTML)
print("sheet-12.html written; tallest that fits =", int(usable_lines), "lines")

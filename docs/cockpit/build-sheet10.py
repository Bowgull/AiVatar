import io
sh = io.open('_shapes.html', encoding='utf-8').read()
def get(tag): return sh.split('<!--'+tag+'-->')[1].split('<!--')[0].strip()
CLOUD, BEADS, TAIL = get('CLOUD'), get('BEADS'), get('TAIL')
Q = '<p class="q">two short sentences about tea</p>'
A = '<p>Leaves brewed in hot water. Different kinds, all soothing.</p>'
SPR = '<div class="sprite" aria-hidden="true"></div>'
TYPE1 = ('<div class="typing"><div class="box"><div class="field">put the next episode on'
  '<span class="caret"></span></div></div><div class="strip"><span class="pill">Auto</span>'
  '<span class="segs"><i class="on"></i><i class="on"></i><i class="on"></i><i class="on"></i>'
  '<i></i><i></i><i></i><i></i><i></i><i></i></span></div></div>')
TYPE2 = TYPE1.replace('class="field"', 'class="field grown"').replace(
  'put the next episode on',
  'put the next episode of apothecary diaries on over my game, and tell me if it ticked off properly this time')
def scene(inner): return '<div class="scene">' + inner + SPR + '</div>'
def fig(inner, title, text):
    return ('<figure>' + scene(inner) + '<figcaption><b>' + title + '</b>' + text
            + '</figcaption></figure>')
parts = []
parts.append('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
  '<title>Aang &middot; The comic book balloon</title>\n'
  '<link href="https://fonts.googleapis.com/css2?family=Figtree:ital,wght@0,400;0,500;0,600;0,700;1,500&amp;family=Silkscreen&amp;display=swap" rel="stylesheet">\n'
  '<link rel="stylesheet" href="sheet-10.css">\n</head>\n<body>\n<div class="wrap">\n')
parts.append('<h1>A A N G &middot; S H E E T 1 0</h1>\n<p class="sub">'
  'A comic book balloon this time, not a game dialogue box with beads stuck on it.<br>'
  'Drawn 1:1 with his real sprite, placed by the real anchor.</p>')
parts.append('<h2 class="part">WHAT I HAD WRONG</h2>\n<p class="why">'
  'Sheet 9 kept the rectangular game panel and added comic beads to it, which is why it read as '
  'neither one thing nor the other. <b>A comic balloon is not a rounded rectangle.</b> It is an '
  'organic shape, with an even bold ink line all the way round, a near-white fill, <b>centred</b> '
  'lettering, and a tail that tapers to a point.</p>\n<p class="why">'
  'The lettering trade only specifies two numbers and both are used here: the air round the text is '
  '<b>about one letter width</b>, and the tail reaches <b>half to sixty per cent of the way</b> to '
  'the speaker, with a line continued past its tip landing on his mouth. There is no standard ink '
  'weight anywhere in that literature, so it is 5px against 15px type.<br><br>'
  'The tail is drawn <i>in front of</i> the balloon and overlapping it, so its fill covers the '
  "balloon's own ink line and the two edges carry on from it. That open join is what makes a tail "
  'look part of the balloon rather than glued to it.</p>')
parts.append('<h2 class="part">THE BALLOON <span class="pick">PICK ONE</span></h2>\n<div class="grid2">')
parts.append(fig('<div class="balloon"><div class="body b-oval">' + Q + A + '</div>' + TAIL + '</div>',
  'A &middot; The true oval',
  'A real ellipse with a tapered tail. The most unmistakably comic of the four. The cost is honest: '
  'an ellipse wastes a lot of room at the corners, so a long reply makes it very large.'))
parts.append(fig('<div class="balloon"><div class="body b-soft">' + Q + A + '</div>' + TAIL + '</div>',
  'B &middot; The modern balloon',
  'The oval flattened until it holds a paragraph without ballooning. Still clearly a comic shape and '
  'far better behaved as the reply gets longer. This is what most modern comics actually use.'))
parts.append(fig('<div class="balloon"><div class="body b-cloud">' + CLOUD
  + '<div class="cloudtext">' + A + '</div></div>' + BEADS + '</div>',
  'C &middot; The thought cloud',
  'Scalloped the whole way round with three beads trailing to him. A thought balloon properly: the '
  'scallops are the half I left out last time, which is why beads on a rectangle looked wrong.'))
parts.append(fig('<div class="balloon"><div class="body b-soft">' + Q + A + '</div>' + BEADS + '</div>',
  'D &middot; Balloon with beads',
  'The speech shape with the thought tail. Strictly not a thing comics do: a smooth edge means '
  'speaking and a scalloped edge means thinking, so the beads and the edge disagree.'))
parts.append('</div>')
parts.append('<h2 class="part">THE TYPING BOX &middot; MIX 1 <span class="pick done">LOCKED</span></h2>\n'
  '<p class="why">Wood frame, plum field, gold caret, as picked, with your two corrections: '
  '<b>the field dominates the bar</b>, which was the wrong way round and read as two equal halves, '
  'and <b>it grows as the prompt gets longer</b>, three lines at rest up to six, then it scrolls. '
  'The real box already grows by measuring your text, so the drawing now matches what it does.</p>\n'
  '<div class="grid2">')
parts.append(fig(TYPE1, 'At rest',
  'Three lines of room to type in. The bar takes as little height as it can and stay legible.'))
parts.append(fig(TYPE2, 'Grown',
  'A longer prompt pushes it to six lines. Past that it scrolls rather than growing without end.'))
parts.append('</div>\n</div>\n</body>\n</html>\n')
io.open('sheet-10.html','w',encoding='utf-8').write('\n'.join(parts))
print('sheet-10.html written')

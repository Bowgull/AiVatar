// Aang's pixel icons (sheet 24, his pick 2026-10-14: "pixel art kinda Stardew Valley, not too real"). Chunky shapes,
// coloured outlines instead of black, two or three tones each, light from the top-left. Each icon is layers of small
// grids; a later layer paints over an earlier one. Drawn as SVG at 2 CSS px per art pixel.

const C = {
  o: '#9C4A16', s: '#F0901E', y: '#FFCB3A', h: '#FFF2A0',
  c: '#46587C', w: '#FFFFFF', g: '#DCE6F4', d: '#A8B9D6',
  k: '#2E3248', G: '#A2AAC0', D: '#767F99', E: '#5A6280',
  b: '#2B78D0', B: '#8ED2FF',
  l: '#FFE04A', L: '#FFF7BE',
  f: '#FFFFFF', F: '#B9E3FF',
  n: '#8A5E1E', m: '#FFE6A0', M: '#E8B64A', t: '#FFF6C8',
  v: '#9AA8C4', V: '#C9D3E6',
  r: '#C8402E', R: '#F06A50', p: '#FFFFFF', q: '#D8CFC0', e: '#6A4A22',
  a: '#B06A10', A: '#FFD24A', Z: '#FFF2A0',
  x: '#7A5530', X: '#F6EBD3', Y: '#E0CCA4', W: '#C8402E',
  K: '#D97757',
};
const SUN = ['...oooo...', '.oohhyyoo.', '.ohhyyyyo.', 'ohhyyyyyso', 'ohyyyyyyso', 'oyyyyyyyso', 'osyyyyysso', '.ossssssoo', '..oooooo..'];
const RAYS = ['.......ss.......', '..s....oo....s..', '...o........o...', '', '', '', '', 'so............os', 'so............os', '', '', '', '', '...o........o...', '..s....oo....s..', '.......ss.......'];
const CLOUD = ['.....ccc.......', '....cwwwc.ccc..', '..cccwwwwcwwwc.', '.cwwwwwwwwwwwwc', 'cwwwwwwwwwwwwwc', 'cwwwwwwwwwwwwgc', 'cgwwwwwwwwwwggc', 'cdggggggggggddc', '.cdddddddddddc.', '..ccccccccccc..'];
const DARK = CLOUD.map((r) => r.replace(/c/g, 'k').replace(/w/g, 'G').replace(/g/g, 'D').replace(/d/g, 'E'));
const DROPS = ['.B...B...B', '.b...b...b', 'bb..bb..bb', '', '...B...B..', '...b...b..', '..bb..bb..'];
const BOLT = ['..oooo', '.olLlo', 'ollloo', 'ooolllo', '..ollo.', '.olo...', '.oo....'];
const FLAKES = ['.F...F...F.', 'FfF.FfF.FfF', '.F...F...F.', '', '...F...F...', '..FfF.FfF..', '...F...F...'];
const FOG = ['..VVVVVVVVV...', '.vvvvvvvvvvv..', '', 'VVVVVVVVVVVV..', 'vvvvvvvvvvvvv.', '', '...VVVVVVVVVVV', '...vvvvvvvvvvv', '', '.VVVVVVVV.....', '.vvvvvvvv.....'];
const MOON = ['...nnnn....', '..nmmmmn...', '.nmmmmn....', '.nmmmn.....', 'nmmmn......', 'nmmmn......', 'nmmmmn.....', 'nMmmmmnnnn.', '.nMmmmmmmmn', '..nMMMMMMn.', '...nnnnnn..'];
const STARS = ['....t', '...tLt', '....t', '', '', 't....'];

const ICONS = {
  sun: [[RAYS, 0, 0], [SUN, 3, 3]],
  partly: [[SUN, 0, 0], [CLOUD, 2, 5]],
  cloud: [[CLOUD, 0, 3]],
  rain: [[CLOUD, 0, 0], [DROPS, 3, 10]],
  storm: [[DARK, 0, 0], [BOLT, 5, 9]],
  snow: [[CLOUD, 0, 0], [FLAKES, 2, 10]],
  fog: [[FOG, 1, 2]],
  moon: [[MOON, 1, 3], [STARS, 9, 0]],
  cal: [[['.e..e..e..', 'rRRRRRRRRr', 'rrrrrrrrrr', 'qpppppppq.', 'qpepepepq.', 'qpppppppq.', 'qpepWWppq.', 'qpppWWppq.', 'qqqqqqqqq.'], 0, 0]],
  star: [[['....a.....', '...aAa....', '...aZa....', 'aaaaZAaaaa', '.aAZAAAAa.', '..aAAAAa..', '..aAAaAa..', '.aAa..aAa.', '.aa....aa.'], 0, 0]],
  letter: [[['xxxxxxxxxx', 'xWXXXXXXWx', 'xXWXXXXWXx', 'xXXWXXWXXx', 'xXXXWWXXXx', 'xYXXXXXXYx', 'xYYYYYYYYx', 'xxxxxxxxxx'], 0, 1]],
  claude: [[['....K....', '.K..K..K.', '..K.K.K..', '...KKK...', 'KKKKKKKKK', '...KKK...', '..K.K.K..', '.K..K..K.', '....K....'], 0, 0]],
};

// Sheet 37 (his picks, 2026-10-14): the site-rule icons, with their own few colours.
const C2 = {
  o: '#9C4A16', k: '#2E3248', G: '#A2AAC0', D: '#767F99', b: '#2B78D0', B: '#8ED2FF', l: '#6CC46A',
  a: '#B06A10', A: '#FFD24A', Z: '#FFF2A0', r: '#C8402E', R: '#F06A50', c: '#46587C', w: '#FFFFFF', g: '#DCE6F4', d: '#A8B9D6',
};
const ICONS2 = {
  ai: ['....bb....', '....bB....', '....bB....', '....bB....', '....bB....', '.bb.bB.bb.', '..bbbBbb..', '...bBBb...', '....bb....'],
  key: ['.aaaa.....', 'aAZZAa....', 'aZ..Aaaaaa', 'aA..AAAAAa', 'aAAAAaaAaa', '.aaaa.aa.a'],
  camera: ['..kkk.....', 'kkkGGkkkkk', 'kGGGGGGGGk', 'kGGbbbGGGk', 'kGbBBbbGDk', 'kGbBbbbGDk', 'kGGbbbGGDk', 'kDDDDDDDDk', 'kkkkkkkkkk'],
  mic: ['...kkkk...', '..kGGGDk..', '..kGGGDk..', '..kGGGDk..', '..kGGGDk..', 'k.kGGGDk.k', 'k..kDDk..k', '.k......k.', '..kkkkkk..', '....kk....', '..kkkkkk..'],
  popup: ['....ccccccc', '....cBBBBBc', 'cccccwwwwwc', 'cBBBcwwwwwc', 'cwwwcwwwwwc', 'cwwwccccccc', 'cwwwwwwc...', 'cggggggc...', 'cccccccc...'],
  globe: ['...bbbb...', '.bbBlBBbb.', '.bBllBBBb.', 'bBBlllBBBb', 'bBBBllBlBb', 'bBBBBBllBb', '.bBBBBlBb.', '.bbBBBBbb.', '...bbbb...'],
  ads: ['........r.', '......rrR.', 'r...rrRRR.', 'rrrrRRRRR.', 'rRRRRRRRR.', 'rrrrRRRRR.', 'r...rrRRR.', '.r....rrR.', '.r......r.'],
};

/** An icon as an SVG element, or null for a name it does not know. */
export function pixIcon(name, scale = 2) {
  const own = ICONS2[name];
  const layers = own ? [[own, 0, 0]] : ICONS[name];
  if (!layers) return null;
  const PAL = own ? C2 : C;
  let w = 0, h = 0;
  for (const [g, dx, dy] of layers) { w = Math.max(w, dx + Math.max(0, ...g.map((r) => r.length))); h = Math.max(h, dy + g.length); }
  const px = new Map();
  for (const [g, dx, dy] of layers) g.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.' && PAL[ch]) px.set(`${x + dx},${y + dy}`, PAL[ch]); }));
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', String(w * scale)); svg.setAttribute('height', String(h * scale));
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`); svg.setAttribute('shape-rendering', 'crispEdges'); svg.setAttribute('class', 'pix');
  svg.setAttribute('aria-hidden', 'true');
  for (const [k, col] of px) {
    const [x, y] = k.split(',');
    const r = document.createElementNS(NS, 'rect');
    r.setAttribute('x', x); r.setAttribute('y', y); r.setAttribute('width', '1'); r.setAttribute('height', '1'); r.setAttribute('fill', col);
    svg.append(r);
  }
  return svg;
}
export const SKIES = ['sun', 'moon', 'partly', 'cloud', 'fog', 'rain', 'snow', 'storm'];

// Sheet 37 v2: new pixel icons in pixicons.js's own style (Stardew: chunky, coloured outlines, two or three tones, light
// from the top-left), drawn with the same renderer. If he picks them, they move into src/Shell/pages/pixicons.js.
export { pixIcon as basePix } from '../../../src/Shell/pages/pixicons.js';

const C = {
  o: '#9C4A16', s: '#F0901E', y: '#FFCB3A', h: '#FFF2A0',
  c: '#46587C', w: '#FFFFFF', g: '#DCE6F4', d: '#A8B9D6',
  k: '#2E3248', G: '#A2AAC0', D: '#767F99',
  b: '#2B78D0', B: '#8ED2FF', l: '#6CC46A',
  n: '#7A4A1C', m: '#C98A3E', M: '#A86A2A',
  a: '#B06A10', A: '#FFD24A', Z: '#FFF2A0',
  r: '#C8402E', R: '#F06A50', T: '#3FBFAE', t: '#9FF0E6',
};
const ICONS = {
  job: ['...nnnn...', '...n..n...', 'nnnnnnnnnn', 'nmmmmmmmMn', 'nmmmmmmmMn', 'nnnnaannnn', 'nmmmAammMn', 'nMMMMMMMMn', 'nnnnnnnnnn'],
  key: ['.aaaa.....', 'aAZZAa....', 'aZ..Aaaaaa', 'aA..AAAAAa', 'aAAAAaaAaa', '.aaaa.aa.a'],
  camera: ['..kkk.....', 'kkkGGkkkkk', 'kGGGGGGGGk', 'kGGbbbGGGk', 'kGbBBbbGDk', 'kGbBbbbGDk', 'kGGbbbGGDk', 'kDDDDDDDDk', 'kkkkkkkkkk'],
  mic: ['...kkkk...', '..kGGGDk..', '..kGGGDk..', '..kGGGDk..', '..kGGGDk..', 'k.kGGGDk.k', 'k..kDDk..k', '.k......k.', '..kkkkkk..', '....kk....', '..kkkkkk..'],
  noads: ['........r..', '......rrR..', 'G...rrRRR..', 'GGGGRRRRR..', 'GDDDRRRRR..', 'GGGGRRRRR..', 'G...rrRRR..', '.G....rrR..', '.G......r..'],
  popup: ['....ccccccc', '....cBBBBBc', 'cccccwwwwwc', 'cBBBcwwwwwc', 'cwwwcwwwwwc', 'cwwwccccccc', 'cwwwwwwc...', 'cggggggc...', 'cccccccc...'],
  ads: ['........r.', '......rrR.', 'r...rrRRR.', 'rrrrRRRRR.', 'rRRRRRRRR.', 'rrrrRRRRR.', 'r...rrRRR.', '.r....rrR.', '.r......r.'],
  ai: ['....bb....', '....bB....', '....bB....', '....bB....', '....bB....', '.bb.bB.bb.', '..bbbBbb..', '...bBBb...', '....bb....'],
  globe: ['...bbbb...', '.bbBlBBbb.', '.bBllBBBb.', 'bBBlllBBBb', 'bBBBllBlBb', 'bBBBBBllBb', '.bBBBBlBb.', '.bbBBBBbb.', '...bbbb...'],
  wont: ['cccccccc', 'cgggggdc', 'cgrggrdc', 'cggrrgdc', 'cggrrgdc', 'cgrggrdc', '.cgggdc.', '..cgdc..', '...cc...'],
  play: ['rr........', 'rRrr......', 'rRRRrr....', 'rRRRRRrr..', 'rRRRRRRRr.', 'rRRRRRrr..', 'rRRRrr....', 'rRrr......', 'rr........'],
  dark: ['...kkkk...', '.kkGGGGkk.', '.kGGkkkkk.', 'kGGk......', 'kGk.......', 'kGGk......', '.kGGkkkkk.', '.kkGGGGkk.', '...kkkk...'],
};

/** An icon as an SVG element (2 CSS px per art pixel), or null. */
export function pix(name, scale = 2) {
  const g = ICONS[name];
  if (!g) return null;
  const w = Math.max(...g.map((r) => r.length)), h = g.length;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', String(w * scale)); svg.setAttribute('height', String(h * scale));
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`); svg.setAttribute('shape-rendering', 'crispEdges'); svg.setAttribute('class', 'pix');
  g.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.' || !C[ch]) return;
    const r = document.createElementNS(NS, 'rect');
    r.setAttribute('x', String(x)); r.setAttribute('y', String(y)); r.setAttribute('width', '1'); r.setAttribute('height', '1'); r.setAttribute('fill', C[ch]);
    svg.append(r);
  }));
  return svg;
}
/** Every <i data-pix="name"> on the page becomes its icon. */
export function paintIcons(root = document) {
  for (const el of root.querySelectorAll('[data-pix]')) { if (el.firstChild) continue; const s = pix(el.dataset.pix, Number(el.dataset.scale) || 2); if (s) el.append(s); }
}

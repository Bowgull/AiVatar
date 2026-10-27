// Sheet 97 (2026-10-27, his "up the quality of the Samara icon and the Claude rune ... redraw at the same size"): both
// hand-placed on the keys' own grid, 18 x 18 art pixels at 2x (a 36 px key), light from the top-left, outlines dark
// brown, never black. The lantern: a hook ring, a wooden cap with a gold rim, ribbed paper lit from inside, a three-point
// maple leaf with its stem, a gold base and a red tassel. The rune: rune.js's stone and starburst, kept to the shape he
// called perfect, with a fourth stone tone, a chipped corner, a glint, and the starburst cut in (a darker underside).
export const LANTERN = [
  '........ooo.......',
  '........o.o.......',
  '.....ooooooooo....',
  '....oWWWWWWwwwo...',
  '...ogggggggggGGo..',
  '...o11111122334o..',
  '..o1112hhlhh2334o.',
  '.o111rlhhLhhlr334o',
  '.o111rLLhLhLLr334o',
  '.o111rhLLLLdhr334o',
  '.o111rdLLLLLdr334o',
  '.o111rhhdLdhhr334o',
  '..o1112hhsh33334o.',
  '...o11222223334o..',
  '...ogggggggggGGo..',
  '....oWWWWWWwwwo...',
  '.....ooooooooo....',
  '.........T........',
];
// '.' inside the leaf rows is the leaf's notch: filled with the paper around it
export const LANTERN_COL = { o: '#2a1508', W: '#8a5a30', w: '#5e3a1c', g: '#ffc43c', G: '#b8780e', '1': '#fff3d0', h: '#ffe49a', '2': '#f7c768', r: '#e2a24a',
  '3': '#df8e30', '4': '#a2521a', L: '#c63e1c', l: '#ee6a34', d: '#86260e', s: '#6a2a10', t: '#c63e1c', T: '#ffc43c' };
export const STONE = [
  '...OOOOOO...',
  '..OHHHHHLO..',
  '.OHHKLLLLSO.',
  'OHKLLLLLLLSO',
  'OHLLLLLLLLSO',
  'OHLLLLLLLLSO',
  'OLLLLLLLLLSO',
  'OLLLLLLLLSSO',
  'OLLLLLLLSSDO',
  '.OSLLLLSSDO.',
  '..OSSSDDO...',
  '...OOOO.....'];
export const STONE_COL = { O: '#2a1a10', H: '#fffaf0', K: '#ffffff', L: '#f0e3c8', S: '#cdb48c', D: '#a88f68' };
export const GLYPH = ['...G...', 'G..G.G.', '.G.GG..', '..GGGGG', 'GGGG...', '..G.GG.', '.G..G.G'];
export const STATE = { working: '#f0a64a', needs: '#7cc4ff', complete: '#3fc4b4' };
/** Paint the lantern at (x, y) in art pixels with P(x, y, colour). */
export function lantern(P, x = 0, y = 0) {
  LANTERN.forEach((r, j) => [...r].forEach((c, i) => {
    let k = c;
    if (LANTERN_COL[k]) P(x + i, y + j, LANTERN_COL[k]);
  }));
}
/** The rune: a ring lit to p in the state's colour (18 x 18), the stone set in it, the starburst cut in. */
export function rune(P, x = 0, y = 0, state = 'working', p = 0.4, ring = true) {
  if (ring) for (let j = 0; j < 18; j++) for (let i = 0; i < 18; i++) {
    const d = Math.hypot(i - 8.5, j - 8.5); if (Math.abs(d - 8.2) > 0.62) continue;
    let a = Math.atan2(i - 8.5, -(j - 8.5)) / (2 * Math.PI); if (a < 0) a += 1;
    P(x + i, y + j, a <= p ? STATE[state] : 'rgba(18,10,5,.75)');
  }
  const o = ring ? 3 : 0;
  STONE.forEach((r, j) => [...r].forEach((c, i) => { if (c !== '.') P(x + o + i, y + o + j, STONE_COL[c]); }));
  const on = (i, j) => GLYPH[j]?.[i] === 'G';
  GLYPH.forEach((r, j) => [...r].forEach((c, i) => {
    if (c === 'G') P(x + o + i + 2, y + o + j + 2, '#d97757');
  }));
  GLYPH.forEach((r, j) => [...r].forEach((c, i) => { if (c === 'G') P(x + o + i + 2, y + o + j + 2, '#d97757'); }));
}

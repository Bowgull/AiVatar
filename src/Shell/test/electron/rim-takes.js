// Sheet 54: the four rim takes, each a recipe for rim-engine.js. Every ornament is a palette letter map, hand placed,
// drawn whole-pixel at P = 2 and mirrored for the other corners (top-left is the one drawn here).
// Depth: c.d counts art pixels in from the rim's outer edge (0 = the dark-wood outline). The bubble's own outline is E
// pixels in; c.dB - E counts on inward from there, over B's paper.
(() => {
  // Gold, Samara's family (#FFC43C, deeper #C98C14), outlined in dark wood, never black. P/Q/H: the plum gem.
  const GOLD = { O: '#3a1e08', S: '#7a4a0c', D: '#C98C14', G: '#FFC43C', L: '#FFE28C', W: '#FFF7DA', P: '#966EC8', Q: '#4A2C6E', H: '#E2D0FF', x: [70, 36, 0, 70] };
  const BRASS = { O: '#24140a', S: '#6a4614', D: '#a87424', G: '#d8a444', L: '#f2d27a', W: '#fff0c0' };
  const lit3 = (l, a, b, c) => (l > 0.3 ? a : l < -0.3 ? c : b);

  // ---------------------------------------------------------------- R1 carved frame
  const R1E = 5;
  const R1 = {
    tex: 'band.png', E: R1E, capOverTail: true,
    color(c, k) {
      if (c.d === 0) return '#2b1608';
      const q = c.tail ? -1 : c.dB - R1E;
      if (q >= 0) {
        if (q === 0) return lit3(c.litB, '#3a1d0a', '#4a2810', '#5a3418');      // the carved groove
        if (q === 1) return lit3(c.litB, '#FFE28C', '#FFC43C', '#C98C14');       // the gold inlay
        if (q === 2) return lit3(c.litB, '#4a2810', '#8a5a2c', '#d8a868');       // the step down to the paper (lit inner bevel)
        if (q === 3) return lit3(c.litB, [70, 35, 5, 96], [70, 35, 5, 40], [255, 252, 240, 170]);
        return null;
      }
      if (c.tail && c.tipIn >= 0 && c.tipIn <= 4) {                              // the rim runs on round the tail to a gold tip
        if (c.tipIn === 4) return '#3a1e08';
        if (c.d === 0) return '#3a1e08';
        return lit3(c.lit, '#FFE28C', '#FFC43C', '#C98C14');
      }
      const w = k.wood(c.u, c.d + 5);
      if (c.tail) return c.d === 1 ? lit3(c.lit, k.mix(w, '#ffd98a', 0.6), k.mul(w, 1.15), k.mul(w, 0.7)) : k.mul(w, lit3(c.lit, 1.25, 1.12, 0.95));
      if (c.d === 1) return lit3(c.lit, k.mix(w, '#ffd98a', 0.5), k.mul(w, 1.02), k.mul(w, 0.6));
      return k.mul(w, lit3(c.lit, 1.1, 0.98, 0.82));
    },
    corners: { off: 0, pal: GOLD, map: [
      '....OOOOOOOOOOOOOO',
      '..OOLLLLLLLLLLLLLO',
      '.OLLWGGGGGGGGGGGDO',
      '.OLWGDDDDDDDDDDDSO',
      'OLLGDOOOOOOOOOOOO.',
      'OLGDOOOOOOOOOOOO..',
      'OLGDOOLLLLLLLLGO..',
      'OLGDOLWGGGGGGDO...',
      'OLGDOLGGOOODDO....',
      'OLGDOLGOHPQOO.....',
      'OLGDOLGOPPQO......',
      'OLGDOLDOQQO.......',
      'OLGDOLDDOO........',
      'OLGDOLDSO.........',
      'OLGDOGSO..........',
      'OLGDOOO...........',
      'OSDSO.............',
      'OOOO..............',
    ] },
  };

  // ---------------------------------------------------------------- R2 lantern brass
  const R2E = 5;
  const RIVET = ['.OO.', 'OLGO', 'OGDO', '.OO.'];
  const R2 = {
    tex: 'tray.png', E: R2E, capOverTail: true,
    color(c, k) {
      if (c.d === 0) return '#1a0d06';
      const q = c.tail ? -1 : c.dB - R2E;
      if (q >= 0) {
        if (q === 0) return lit3(c.litB, '#120904', '#24140a', '#3a2412');       // dark lip
        if (q === 1) return [255, 178, 80, 190];                                  // the warm glow, fading into the paper
        if (q === 2) return [255, 192, 104, 105];
        if (q === 3) return [255, 204, 128, 44];
        return null;
      }
      if (c.tail && c.tipIn >= 0 && c.tipIn <= 4) {                              // a brass cap on the tail's tip
        if (c.tipIn === 4 || c.d === 0) return '#24140a';
        return lit3(c.lit, '#f2d27a', '#d8a444', '#a87424');
      }
      const w = k.wood(c.u, c.d + 7);
      if (c.tail) return c.d === 1 ? lit3(c.lit, k.mix(w, '#d8a070', 0.55), k.mul(w, 1.3), k.mul(w, 0.75)) : k.mul(w, lit3(c.lit, 1.4, 1.25, 1.05));
      if (c.d === 1) return lit3(c.lit, k.mix(w, '#d8a070', 0.42), k.mul(w, 1.08), k.mul(w, 0.62));
      return k.mul(w, lit3(c.lit, 1.2, 1.06, 0.88));
    },
    extra(a) {
      // brass rivets along the straight runs, in the middle of the rim, kept clear of the brackets and the tail
      const step = 16, clear = 19, y0 = a.T - a.E + 1, y1 = a.B + a.E - 4, x0 = a.L - a.E + 1, x1 = a.R + a.E - 4;
      const span = (from, to) => { const n = Math.max(0, Math.floor((to - from) / step)); const pad = Math.floor(((to - from) - n * step) / 2); const o = []; for (let i = 0; i <= n; i++) o.push(from + pad + i * step); return o; };
      for (const x of span(a.L - a.E + clear, a.R + a.E - clear - 3)) {
        a.stamp(RIVET, BRASS, x, y0);
        if (!a.nearTail(x + 2, y1 + 2, 5)) a.stamp(RIVET, BRASS, x, y1);
      }
      for (const y of span(a.T - a.E + clear, a.B + a.E - clear - 3)) {
        a.stamp(RIVET, BRASS, x0, y);
        if (!a.nearTail(x1 + 2, y + 2, 5)) a.stamp(RIVET, BRASS, x1, y);
      }
    },
    corners: { off: -1, pal: BRASS, map: [
      'OOOOOOOOOOOOOO..',
      'OLLLLLLLLLLLLLO.',
      'OLWGGGGGGGOOGGDO',
      'OLGGGGGGGOLWOGDO',
      'OLGGOOOGGOGDOGDO',
      'OLGOLWGOGGOOGDSO',
      'OLGOWGDOGGGGDSO.',
      'OLGOGDSOGDDDSOO.',
      'OLGGOOOGDSOOO...',
      'OLGGGGGDSO......',
      'OLGOOGDSO.......',
      'OLOLWODO........',
      'OLOGDOSO........',
      'OLGOOSO.........',
      'OLGDSO..........',
      '.OOOO...........',
    ] },
  };

  // ---------------------------------------------------------------- R3 storybook / Stardew
  const R3E = 6;
  const KNOT = ['.SSSS.', 'SDOODS', '.SSSS.'];
  const KNOT90 = ['.S.', 'SDS', 'SOS', 'SOS', 'SDS', '.S.'];
  const KNOTPAL = { O: '#3a1a08', D: '#5a2e14', S: '#7a4422' };
  const LEAF = { O: '#203a14', K: '#3d6b2a', N: '#5f9a3a', H: '#a8d860', R: '#b8361e', r: '#ff8a5a', T: '#ecd09a', t: '#a87a40', o: '#4a2c10' };
  const R3 = {
    tex: 'band.png', E: R3E, tailBehind: true,
    color(c, k) {
      if (c.d === 0) return '#3b1e0c';
      if (c.tail) return c.d === 1 ? lit3(c.lit, '#FFF8E6', '#F3E2BC', '#c9a06a') : '#F6E6C4';   // a paper tail, out from under the rim
      const q = c.dB - R3E;
      if (q >= 0) {
        if (q === 0) return '#4a2810';
        if (q === 1 || q === 2) return lit3(c.litB, '#f3e2bc', '#FFF3D6', '#FFF8E6');   // the cream margin
        if (q === 3) return '#c9a06a';                                                     // a tan line, then the paper
        return null;
      }
      const w = k.wood(c.u, c.d + 2);
      if (c.d === 1) return lit3(c.lit, k.mix(w, '#ffd090', 0.6), k.mix(w, '#ffd090', 0.25), k.mul(w, 0.7));
      if (c.d === 2 && c.lit > 0.3) return k.mix(w, '#ffd090', 0.22);
      return k.mul(w, lit3(c.lit, 1.2, 1.12, 0.94));
    },
    extra(a) {
      // knots in the grain, placed by a fixed hash so they never line up
      const h = (n) => ((n * 2654435761) >>> 0) % 997;
      for (let x = a.L + 16; x <= a.R - 18; x += 25 + (h(x) % 11)) {
        a.stamp(KNOT, KNOTPAL, x, a.T - a.E + 2);
        if (!a.nearTail(x + 10, a.B + a.E - 3, 7)) a.stamp(KNOT, KNOTPAL, x + 8, a.B + a.E - 5);
      }
      for (let y = a.T + 16; y <= a.B - 18; y += 29 + (h(y) % 7)) {
        a.stamp(KNOT90, KNOTPAL, a.L - a.E + 2, y);
        if (!a.nearTail(a.R + a.E - 3, y + 6, 7)) a.stamp(KNOT90, KNOTPAL, a.R + a.E - 5, y + 6);
      }
    },
    corners: { off: -1, pal: LEAF, map: [
      '..................',
      '........o..OOOO...',
      '.......oTo.OHHHNOO',
      '......oTTtOHNNNNKKO',
      '.....oTTtoTOKKKKOO.',
      '....oTTtoTTtOOOO...',
      '...oTTtoTTtoTo.....',
      '..oTTtoTTtoTTto....',
      '.oTTtoTTtoTTRRO....',
      '..otoTTtoTTtRrO....',
      '.OOOTTtoTTtoOO.....',
      'OHHOtoTTto.........',
      'OHNKOTTRRO.........',
      'OHNKOotRrO.........',
      'OHNKO.oOO..........',
      'ONNKO..............',
      '.OKKO..............',
      '.OKO...............',
      '..O................',
    ] },
  };

  // ---------------------------------------------------------------- R4 Zelda / LOTR filigree
  const R4E = 4;
  const R4 = {
    tex: 'tray.png', E: R4E, tailBehind: true,
    color(c, k) {
      if (c.d === 0) return '#1a0d06';
      if (c.tail) return c.d === 1 ? lit3(c.lit, '#FFE28C', '#FFC43C', '#C98C14') : '#EEDAB2';   // a paper tail edged in gold, out from under the rim
      const q = c.dB - R4E;
      if (q >= 0) {
        if (q === 0) return lit3(c.litB, '#FFE28C', '#FFC43C', '#C98C14');        // first engraved line, gold
        if (q === 2) return '#a8741a';                                             // second engraved line, deep gold
        return null;                                                               // the paper between and inside
      }
      const w = k.wood(c.u, c.d + 9);
      if (c.d === 1) return lit3(c.lit, k.mix(w, '#c89a68', 0.45), k.mul(w, 1.05), k.mul(w, 0.6));
      return k.mul(w, lit3(c.lit, 1.15, 1.02, 0.84));
    },
    corners: { off: 0, pal: GOLD, map: [
      '........................',
      '.....O........OOOOO.....',
      '....OGO......OLLGLGO....',
      '...OLGGO....OLDDOGDGO...',
      '..OLHPGGO..OLDOOOOOGO...',
      '.OGGPQQGGOOOLDOLGOOLGO..',
      '..OGGQGDGLLLGGLGDOOGO...',
      '...OGGDOGDDDDDDDGLLDO...',
      '....OGGGOOOOOOOOGDDO....',
      '.....OLDOLGO....OOO.....',
      '.....OLDOGDO............',
      '....OOLDOOOGO...........',
      '...OLLGDO..OGO..........',
      '..OLDDGDO...O...........',
      '.OLDOOLDO...............',
      '.OLDOLGDO...............',
      '.OGOOGDGGO..............',
      '.OLGOOOLDO..............',
      '.OGDOOOLDO..............',
      '..OGGLGDO...............',
      '...OOGOO................',
      '.....O..................',
      '........................',
      '........................',
    ] },
  };

  window.__TAKES = { R1, R2, R3, R4 };
})();

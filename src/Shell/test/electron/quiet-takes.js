// Sheet 55 (2026-10-21): three QUIET rims for rim-engine.js. He threw out sheet 54 ("way too over the top, too much"),
// kept look B and disliked its studs. So: no ornaments, no caps, no studs, no rivets, no gems. Soft, rounded, wood only.
// Wood colours are Samara's band.png, sampled: #6e4a2a (its lit top row), #54371f (body), #422a18 (grain), #342113 (shade).
// Depth c.d counts art pixels in from the rim's outer edge, over the WHOLE outline (body + tail), so the band runs round
// the tail and opens into it; past the band it is paper again (B's own gradient, worked out per row).
(() => {
  const lit3 = (l, a, b, c) => (l > 0.3 ? a : l < -0.3 ? c : b);
  const STOPS = [[0, '#FBF0D8'], [0.45, '#F2E0BC'], [1, '#E6CD9C']];
  /** B's paper at art row y (the gradient runs top to bottom of the balloon's own box, tail included). */
  function paper(y, k) {
    const [y0, y1] = window.__paperY || [0, 1];
    const t = Math.max(0, Math.min(1, (y - y0) / ((y1 - y0) || 1)));
    for (let i = 1; i < STOPS.length; i++) if (t <= STOPS[i][0]) {
      const [a, ca] = STOPS[i - 1], [b, cb] = STOPS[i];
      return k.mix(ca, cb, (t - a) / (b - a));
    }
    return k.hex(STOPS[2][1]);
  }
  // past the band: in the body B's own SVG paper shows (null); round the tail's mouth and in the tail, paint the paper with
  // B's own bottom shade on it (balloon.js: rgba(150,110,60,.26) along the lower edge), so the mouth has no seam
  // (the body's last couple of rows over the mouth too: the SVG's own soft edge would show there as a thin line)
  const inside = (c, k, E) => (!c.tail && c.dB - E >= 0 && !(c.d > c.dB && c.dB - E < 3) ? null : k.mix(paper(c.y, k), '#966e3c', 0.26));

  // ---------------------------------------------------------------- S1 a wood line (2 art px), nothing else
  const S1 = {
    tex: 'band.png', E: 2, shadow: 1, shadowCol: [12, 6, 2, 80],
    color(c, k) {
      if (c.d === 0) return lit3(c.lit, '#54371f', '#4a301b', '#342113');
      if (c.d === 1) return lit3(c.lit, '#6e4a2a', '#5a3c22', '#422a18');
      return inside(c, k, 2);
    },
  };

  // ---------------------------------------------------------------- S2 a slim band of Samara's wood (4 art px)
  const band = (c, k, E) => {
    if (c.d === 0) return lit3(c.lit, '#422a18', '#3a2516', '#2c1c10');                // soft dark-wood edge, not black
    if (c.d < E) {
      const w = k.wood(c.u, 2 + (c.d - 1) * 4);                                        // band.png's grain rows, along the edge
      if (c.d === 1 && c.lit > 0.3) return k.mix(w, '#6e4a2a', 0.65);                  // lit top / left
      return k.mul(w, lit3(c.lit, 1.08, 1.0, 0.86));                                   // bottom / right a shade darker
    }
    return undefined;
  };
  const S2 = {
    tex: 'band.png', E: 4, shadow: 1, shadowCol: [12, 6, 2, 80],
    color(c, k) { const b = band(c, k, 4); return b !== undefined ? b : inside(c, k, 4); },
  };

  // ---------------------------------------------------------------- S3 S2 + the faintest gold hairline just inside
  const S3 = {
    tex: 'band.png', E: 4, shadow: 1, shadowCol: [12, 6, 2, 80],
    color(c, k) {
      const b = band(c, k, 4); if (b !== undefined) return b;
      if (c.d === 4) return k.mix(c.tail || c.dB - 4 < 0 ? k.mix(paper(c.y, k), '#966e3c', 0.26) : paper(c.y, k), '#C98C14', 0.42);                     // #C98C14 at ~40-50% over the paper
      return inside(c, k, 4);
    },
  };

  window.__TAKES = { S1, S2, S3 };
})();

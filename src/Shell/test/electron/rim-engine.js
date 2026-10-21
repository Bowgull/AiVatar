// Sheet 54 (2026-10-21): the wood rim, drawn as pixel art that follows the REAL balloon outline. Page-side code, injected
// by rim-shots.ts into the real bubble page (a picture maker, not product code).
//
// How it works. balloon.js draws the balloon as one SVG path (body + tail). Each time it does, this:
//   1. rasterises that exact path at ART resolution (1 art pixel = P screen pixels, P = 2, whole-number), thresholded so
//      there is no anti-aliasing: the outline becomes a clean pixel staircase, corners and tail included;
//   2. grows it outward by E art pixels (the rim sits partly outside, so the paper inside keeps B's exact room);
//   3. measures every pixel's depth from the edge (chamfer distance) and which way the edge faces (for top-left light);
//   4. paints each depth band from the take's recipe: outline, lit bevel, Samara's own wood art sampled pixel for pixel
//      along the edge (band.png / tray.png), groove, gold inlay, inner bevel onto the paper;
//   5. stamps the take's hand-pixelled ornaments (palette letter maps, like src/Body/ClaudeMarks.cs): corner caps,
//      rivets, knots, filigree, mirrored per corner.
// The result is one canvas laid over the SVG (under the words) and scaled by exactly P with image-rendering:pixelated.
(() => {
  const P = 2, M = 14;
  const hex = (h) => { if (Array.isArray(h)) return h; const n = h.replace('#', ''); return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16), n.length > 6 ? parseInt(n.slice(6, 8), 16) : 255]; };
  const mix = (a, b, k) => { a = hex(a); b = hex(b); return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * k)).concat(255); };
  const mul = (a, k) => { a = hex(a); return [0, 1, 2].map((i) => Math.max(0, Math.min(255, Math.round(a[i] * k)))).concat(255); };
  const TEX = {};
  async function loadTex(name) {
    if (TEX[name]) return;
    const img = new Image(); img.src = 'art/browser/' + name; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    TEX[name] = { w: img.width, h: img.height, d: g.getImageData(0, 0, img.width, img.height).data };
  }
  const tx = (name, x, y) => { const t = TEX[name]; x = ((x % t.w) + t.w) % t.w; y = ((y % t.h) + t.h) % t.h; const i = (y * t.w + x) * 4; return [t.d[i], t.d[i + 1], t.d[i + 2], 255]; };
  /** Samara's wood, grain running ALONG the edge: u along the edge, v across it (depth). */
  const wood = (name, u, v) => (name === 'band.png' ? tx(name, u, v) : tx(name, v, u));

  function maskOf(d, cw, ch, shift = 0) {
    const c = document.createElement('canvas'); c.width = cw; c.height = ch;
    const g = c.getContext('2d'); g.setTransform(1 / P, 0, 0, 1 / P, M + shift / P, M + shift / P); g.fill(new Path2D(d));
    const a = g.getImageData(0, 0, cw, ch).data, m = new Uint8Array(cw * ch);
    for (let i = 0; i < m.length; i++) m[i] = a[i * 4 + 3] >= 128 ? 1 : 0;
    return m;
  }
  function dilate(m, cw, ch, E) {
    if (!E) return m;
    const o = new Uint8Array(m), off = [], R = E + 0.45;
    for (let dy = -E; dy <= E; dy++) for (let dx = -E; dx <= E; dx++) if (dx * dx + dy * dy <= R * R) off.push([dx, dy]);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const i = y * cw + x; if (m[i]) continue;
      for (const [dx, dy] of off) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < cw && Y < ch && m[Y * cw + X]) { o[i] = 1; break; } }
    }
    return o;
  }
  /** Chamfer distance to the nearest outside pixel (1 for the outermost ring). */
  function dist(m, cw, ch) {
    const D = new Float32Array(cw * ch), S = Math.SQRT2;
    for (let i = 0; i < D.length; i++) D[i] = m[i] ? 1e9 : 0;
    const at = (x, y) => (x < 0 || y < 0 || x >= cw || y >= ch ? 0 : D[y * cw + x]);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) { const i = y * cw + x; if (!D[i]) continue;
      D[i] = Math.min(D[i], at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + S, at(x + 1, y - 1) + S); }
    for (let y = ch - 1; y >= 0; y--) for (let x = cw - 1; x >= 0; x--) { const i = y * cw + x; if (!D[i]) continue;
      D[i] = Math.min(D[i], at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + S, at(x - 1, y + 1) + S); }
    return D;
  }
  const depth = (v) => Math.ceil(v - 1e-4) - 1;

  /** A palette letter map stamped at art pixel (x, y), mirrored for the corner it sits in. */
  function stamp(px, cw, ch, map, pal, x, y, fx, fy, skip) {
    const h = map.length, w = Math.max(...map.map((r) => r.length));
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
      const ch2 = map[fy ? h - 1 - r : r][fx ? w - 1 - c : c] ?? '.'; const col = pal[ch2]; if (!col) continue;
      const X = x + c, Y = y + r; if (X < 0 || Y < 0 || X >= cw || Y >= ch || (skip && skip(X, Y))) continue;
      const v = hex(col), i = (Y * cw + X) * 4;
      if (v[3] === 255) { px[i] = v[0]; px[i + 1] = v[1]; px[i + 2] = v[2]; px[i + 3] = 255; }
      else { const a = v[3] / 255, b = px[i + 3] / 255, oa = a + b * (1 - a);
        for (let k = 0; k < 3; k++) px[i + k] = Math.round((v[k] * a + px[i + k] * b * (1 - a)) / (oa || 1)); px[i + 3] = Math.round(oa * 255); }
    }
  }

  function bodyPath(bw, bh) {
    const x0 = 2, y0 = 2, x1 = bw - 2, y1 = bh - 2, r = Math.min(19, (y1 - y0) / 2, (x1 - x0) / 2);
    const q = (x, y, ax, ay) => `Q ${x} ${y} ${ax} ${ay} `;
    return `M ${x0 + r} ${y0} L ${x1 - r} ${y0} ` + q(x1, y0, x1, y0 + r) + `L ${x1} ${y1 - r} ` + q(x1, y1, x1 - r, y1)
      + `L ${x0 + r} ${y1} ` + q(x0, y1, x0, y1 - r) + `L ${x0} ${y0 + r} ` + q(x0, y0, x0 + r, y0) + 'Z';
  }

  /**
   * Paint the take's rim for this outline. `T` is the take: { tex, E, Et, color(c), corners?, extra?(api) }.
   * c = { x, y, d (depth from the whole outline), dB (depth from the body's outline, -1 in the tail), tail, lit (-1..1, how
   * much this edge faces the top-left light), litB (the same for the body edge), label (T/B/L/R/tail), u (along the edge) }.
   */
  function paint(T, svg, d, bubble) {
    const wrap = svg.parentElement;
    const b = bubble.getBoundingClientRect(), s = svg.getBoundingClientRect();
    const bw = Math.round(b.width), bh = Math.round(b.height);
    const sw = Math.ceil(s.width), sh = Math.ceil(s.height);
    const cw = Math.ceil(sw / P) + 2 * M, ch = Math.ceil(sh / P) + 2 * M;
    // The rim's outer edge is the REAL balloon outline (balloon.js balloonPath) for a body E art pixels bigger all
    // round, aimed at the same head: so the tail keeps its own rules (edge, length, taper) instead of being swallowed.
    const g = T.E * P, head = window.__rimHead(b);
    // Only its TAIL is taken (with B's own corner radius, so the mouth is B's mouth); the body is B's outline grown by E.
    const outer = window.__rim.balloonPath(bw + 2 * g, bh + 2 * g, { x: head.x + g, y: head.y + g });
    const O1 = maskOf(outer, cw, ch, -g), O0 = maskOf(bodyPath(bw + 2 * g, bh + 2 * g), cw, ch, -g), body0 = maskOf(bodyPath(bw, bh), cw, ch);
    const BM = dilate(body0, cw, ch, T.E);
    const TL = new Uint8Array(cw * ch); for (let i = 0; i < TL.length; i++) TL[i] = O1[i] && !O0[i] ? 1 : 0;
    const F = dilate(TL, cw, ch, T.tailGrow ?? 2);   // a touch thicker, so the tail has room for its outline and wood
    for (let i = 0; i < F.length; i++) if (BM[i]) F[i] = 1;
    const TO = new Uint8Array(cw * ch); for (let i = 0; i < TO.length; i++) TO[i] = F[i] && !BM[i] ? 1 : 0;
    // DF: depth from the whole outline (the rim runs on round the tail); DB: from the body only; DT: from the tail only
    // (a take with tailBehind closes the rim across the mouth and the tail comes out from under it).
    const DF = dist(F, cw, ch), DB = dist(BM, cw, ch), DT = dist(TO, cw, ch);
    // the body's rectangle in art pixels (outer edge of the undilated body)
    const L = M, R = M + bw / P - 1, Tp = M, Bt = M + bh / P - 1;
    // the tail's axis: from the body's bottom-right-ish mouth to the farthest tail pixel
    let tip = null, mouth = { x: 0, y: 0, n: 0 };
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) { const i = y * cw + x; if (!F[i] || BM[i]) continue;
      const far = (x - (L + R) / 2) ** 2 + (y - (Tp + Bt) / 2) ** 2; if (!tip || far > tip.f) tip = { x, y, f: far };
      if (BM[i - cw] || BM[i - 1] || BM[i + 1] || BM[i + cw]) { mouth.x += x; mouth.y += y; mouth.n++; } }
    if (mouth.n) { mouth.x /= mouth.n; mouth.y /= mouth.n; }
    let ax = 0, ay = 1; if (tip && mouth.n) { const k = Math.hypot(tip.x - mouth.x, tip.y - mouth.y) || 1; ax = (tip.x - mouth.x) / k; ay = (tip.y - mouth.y) / k; }
    const LX = -0.5, LY = -0.866;   // light from the top-left, mostly top
    const lightOf = (D, x, y) => { const g = (X, Y) => (X < 0 || Y < 0 || X >= cw || Y >= ch ? 0 : D[Y * cw + X]);
      const nx = g(x - 1, y) - g(x + 1, y), ny = g(x, y - 1) - g(x, y + 1), k = Math.hypot(nx, ny); return k ? (nx * LX + ny * LY) / k : 0; };
    const img = new ImageData(cw, ch), px = img.data;
    const put = (i, v) => { if (!v) return; v = hex(v); px[i * 4] = v[0]; px[i * 4 + 1] = v[1]; px[i * 4 + 2] = v[2]; px[i * 4 + 3] = v[3]; };
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const i = y * cw + x;
      if (!F[i]) {   // the hard contact shadow, two art pixels under the whole rim
        const sh2 = T.shadow ?? 2; if (y >= sh2 && F[i - sh2 * cw]) put(i, T.shadowCol ?? [12, 6, 2, 120]);
        continue;
      }
      const inB = !!BM[i], tail = !inB;
      let label = 'tail', u = Math.round(x * ax + y * ay);
      if (inB) { const dl = x - L, dr = R - x, dt = y - Tp, db = Bt - y, m = Math.min(dl, dr, dt, db);
        label = m === dt ? 'T' : m === db ? 'B' : m === dl ? 'L' : 'R'; u = label === 'T' || label === 'B' ? x : y; }
      const DD = T.tailBehind ? (inB ? DB : DT) : DF;
      const c = { x, y, d: depth(DD[i]), dB: inB ? depth(DB[i]) : -1, tail, label, u, lit: lightOf(DD, x, y), litB: inB ? lightOf(DB, x, y) : 0,
        tipIn: tail && tip ? Math.round((tip.x - x) * ax + (tip.y - y) * ay) : -1,
        // local corner coordinates: distance in from the nearest vertical / horizontal outer edge of the body (+E)
        lx: Math.min(x - (L - T.E), (R + T.E) - x), ly: Math.min(y - (Tp - T.E), (Bt + T.E) - y),
        tailIn: tail ? Math.round((x - mouth.x) * ax + (y - mouth.y) * ay) : 0 };
      put(i, T.color(c, { wood: (u2, v2) => wood(T.tex, u2, v2), mix, mul, hex }));
    }
    const api = { px, cw, ch, L, R, T: Tp, B: Bt, E: T.E, F, BM, DF, DB, mouth, tip, ax, ay,
      stamp: (map, pal, x, y, fx = false, fy = false, skip = null) => stamp(px, cw, ch, map, pal, x, y, fx, fy, skip),
      inTail: (x, y) => { const i = y * cw + x; return F[i] && !BM[i]; },
      nearTail: (x, y, r) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < cw && Y < ch && F[Y * cw + X] && !BM[Y * cw + X]) return true; } return false; } };
    if (T.extra) T.extra(api);
    if (T.corners) {
      const { map, pal, off = 0 } = T.corners, h = map.length, w = Math.max(...map.map((r) => r.length));
      const x0 = L - T.E + off, y0 = Tp - T.E + off, x1 = R + T.E - off - w + 1, y1 = Bt + T.E - off - h + 1;
      // the tail comes out OVER a corner piece it meets: the piece is cut where the tail's wood is
      const under = (X, Y) => { const i = Y * cw + X; return F[i] && !BM[i]; };
      api.stamp(map, pal, x0, y0, false, false, under); api.stamp(map, pal, x1, y0, true, false, under);
      api.stamp(map, pal, x0, y1, false, true, T.capOverTail ? null : under); api.stamp(map, pal, x1, y1, true, true, T.capOverTail ? null : under);
    }
    const c = document.createElement('canvas'); c.width = cw; c.height = ch; c.getContext('2d').putImageData(img, 0, 0);
    wrap.querySelector('.rimimg')?.remove();
    const im = document.createElement('img'); im.className = 'rimimg'; im.src = c.toDataURL();
    Object.assign(im.style, { position: 'absolute', left: (-M * P) + 'px', top: (-M * P) + 'px', width: (cw * P) + 'px', height: (ch * P) + 'px',
      imageRendering: 'pixelated', zIndex: '0', pointerEvents: 'none' });
    svg.after(im);
  }
  window.__rim = { paint, loadTex, mix, mul, hex, P, M, balloonPath: null };
  import('./balloon.js').then((m) => { window.__rim.balloonPath = m.balloonPath; });
})();

// Omashu remote copy of Couch Mode's forest.js (sheet 11). Added: drawForest(c, tick, level), level 0 = embers (fire out), 1 = full fire, between = catching.
// Dark forest campfire for sheet 11. A 320×180 grid (6× on a 1080p TV), every pixel on the grid.
// drawForest(c, tick) draws one frame. drawMenu(c, tick, kind, pick) draws the menus on a 480×270 grid (4×).
(function () {
  const W = 320, H = 180, FX = 160, FY = 146;
  let seed; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const px = (c, x, y, col) => { c.fillStyle = col; c.fillRect(x, y, 1, 1) };
  const hash = (x, y) => { let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295 };
  const noise = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), u = (x - xi) ** 2 * (3 - 2 * (x - xi)), v = (y - yi) ** 2 * (3 - 2 * (y - yi));
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v };
  let flick = 1, LEVEL = 1;                                    // the fire's flicker, shared by everything it lights
  const warm = (x, y, r = 110) => Math.max(0, 1 - Math.hypot((x - FX) * .62, (y - FY + 8) * 1.25) / (r * flick));
  const ring = (c, cx, cy, rx, ry, col, a) => { c.fillStyle = `rgba(${col},${a})`; for (let y = Math.ceil(cy - ry); y <= Math.floor(cy + ry); y++) { const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - ((y - cy) / ry) ** 2))); if (w > 0) c.fillRect(Math.round(cx - w), y, w * 2, 1) } };
  const LOGO = [[24, 30, 100, 68], [196, 30, 100, 68]];
  const inLogo = (x, y) => LOGO.some(([lx, ly, lw, lh]) => x >= lx && x < lx + lw && y >= ly && y < ly + lh);

  // ---------- sky ----------
  function sky(c, tick) {
    const B = ['#03050b', '#04070e', '#050911', '#060b15', '#080e19', '#09111d', '#0b1421', '#0d1725', '#0f1a28', '#111d2b', '#13202d', '#142230'];
    B.forEach((col, i) => { c.fillStyle = col; c.fillRect(0, i * 11, W, i === 11 ? H : 11) });
    seed = 7; for (let i = 0; i < 120; i++) { const x = Math.floor(rnd() * W), y = Math.floor(rnd() * 96), a = .2 + rnd() * .6, big = rnd() < .08, tw = i % 5 === 0 && ((tick >> 4) + i) % 3 === 0;
      c.fillStyle = `rgba(220,236,255,${tw ? a * .25 : a})`; c.fillRect(x, y, 1, 1); if (big && !tw) { c.fillStyle = `rgba(220,236,255,${a * .35})`; c.fillRect(x - 1, y, 3, 1); c.fillRect(x, y - 1, 1, 3) } }
    // moon behind thin cloud
    const mx = 160, my = 24;
    ring(c, mx, my, 30, 26, '150,180,215', .035); ring(c, mx, my, 19, 17, '170,200,230', .05); ring(c, mx, my, 12, 12, '200,220,240', .07);
    ring(c, mx, my, 8, 8, '226,231,212', 1);
    c.fillStyle = '#f4f6e6'; c.fillRect(mx - 6, my - 6, 4, 1); c.fillRect(mx - 7, my - 5, 2, 1); c.fillRect(mx - 8, my - 4, 1, 3);
    [[2, -3, 2], [-2, 1, 3], [3, 3, 2], [-4, -2, 1], [0, 5, 1]].forEach(([dx, dy, s]) => { c.fillStyle = '#c9ceb8'; c.fillRect(mx + dx, my + dy, s, s - (s > 1 ? 1 : 0) || 1) });
    // a slow thin cloud across the moon
    for (let r = 0; r < 4; r++) { const y = my + 4 + r * 2, off = Math.floor(tick / 12) % 160; c.fillStyle = `rgba(28,40,58,${.5 - r * .1})`; for (let x = -160 + off + r * 9; x < W; x += 160) c.fillRect(x, y, 52 - r * 8, 1) }
  }

  // ---------- far forest: three depths of trunks fading into mist ----------
  function farForest(c, tick) {
    const layers = [
      { n: 46, col: '#122434', hi: '#172c3d', w: [1, 3], top: 60, base: 132, seed: 3 },
      { n: 28, col: '#0e1c29', hi: '#13253a', w: [3, 5], top: 44, base: 134, seed: 9 },
      { n: 14, col: '#0a1520', hi: '#101f2e', w: [5, 8], top: 30, base: 136, seed: 17 }];
    layers.forEach((L, li) => {
      seed = L.seed;
      // the canopy of this layer: soft lumpy band
      for (let x = 0; x < W; x++) { const h = Math.round(L.top + 10 * noise(x / 14, li * 5) + 4 * noise(x / 4, li * 9)); c.fillStyle = L.col; c.fillRect(x, 0, 1, Math.max(0, h - 30 + li * 6)) }
      for (let i = 0; i < L.n; i++) {
        const x = Math.floor(rnd() * W), w = L.w[0] + Math.floor(rnd() * (L.w[1] - L.w[0] + 1)), top = L.top - 10 + Math.floor(rnd() * 20);
        if (li === 2 && x > 110 && x < 210) continue;          // keep the fire's clearing open
        c.fillStyle = L.col; c.fillRect(x, top, w, L.base - top);
        c.fillStyle = L.hi; c.fillRect(x, top, 1, L.base - top);   // moonlit edge
        // a few branches
        for (let b = 0; b < 2 + li; b++) { const by = top + 6 + Math.floor(rnd() * (L.base - top - 30)), dir = rnd() < .5 ? -1 : 1, len = 3 + Math.floor(rnd() * (4 + li * 3));
          c.fillStyle = L.col; for (let k = 0; k < len; k++) c.fillRect(x + (dir > 0 ? w - 1 + k : -k), by - Math.floor(k / 2), 1, 1) }
      }
      mist(c, tick, 100 + li * 9, 9, .07 + li * .015, li);
    });
  }
  function mist(c, tick, y0, rows, alpha, k = 0) {
    for (let r = 0; r < rows; r++) { const y = y0 + r, a = alpha * (1 - Math.abs(r - (rows - 1) / 2) / (rows / 2 + .5)); c.fillStyle = `rgba(150,185,200,${a.toFixed(3)})`;
      const off = Math.floor(tick / (10 + k * 3) + r * 13 + k * 40) % 90; for (let x = -90 + off; x < W; x += 90) c.fillRect(x + (r % 2), y, 58 - Math.abs(r - rows / 2) * 4, 1) }
  }

  // ---------- the ground ----------
  function ground(c, tick) {
    for (let y = 128; y < H; y++) { const t = (y - 128) / 52; c.fillStyle = t < .1 ? '#0c1b16' : t < .4 ? '#0a1711' : '#08130e'; c.fillRect(0, y, W, 1) }
    c.fillStyle = '#132a20'; c.fillRect(0, 128, W, 1);
    // packed earth round the fire, lit
    for (let y = 136; y < 172; y++) { const w = Math.round(74 * Math.sqrt(Math.max(0, 1 - ((y - 154) / 18) ** 2)));
      for (let x = FX - w; x < FX + w; x++) { const n = noise(x / 3, y / 2), wm = warm(x, y, 80); const edge = Math.abs(x - FX) > w - 6 && n < .55; if (edge) continue;
        px(c, x, y, wm > .55 ? (n > .6 ? '#4a3420' : '#3a2818') : wm > .3 ? (n > .6 ? '#30231a' : '#261c14') : (n > .6 ? '#1e1912' : '#18140f')) } }
    // pebbles
    seed = 41; for (let i = 0; i < 40; i++) { const a = rnd() * 6.28, r = .5 + rnd() * .5, x = Math.round(FX + Math.cos(a) * 66 * r), y = Math.round(154 + Math.sin(a) * 15 * r); if (Math.abs(x - FX) < 26 && Math.abs(y - 150) < 10) continue;
      const wm = warm(x, y); px(c, x, y, wm > .45 ? '#7a6250' : '#3a3632'); px(c, x + 1, y, '#1c1a18') }
  }
  // grass: thousands of thin blades, taller toward you, lit by the fire, swaying a pixel
  const BLADES = []; { seed = 77; for (let i = 0; i < 2600; i++) { const x = Math.floor(rnd() * W), y = 129 + Math.floor(rnd() ** .8 * 51); const inClear = ((x - FX) / 74) ** 2 + ((y - 154) / 18) ** 2 < 1; if (inClear && rnd() < .9) continue; BLADES.push([x, y, 2 + Math.floor(rnd() * 3 + (y - 128) / 9), rnd() * 6.28, rnd()]) } BLADES.sort((a, b) => a[1] - b[1]) }
  function grass(c, tick, from, to) {
    for (const [x, y, h, ph, v] of BLADES) { if (y < from || y >= to) continue;
      const wm = warm(x, y - h, 62), lean = Math.round(Math.sin(tick / 20 + ph + x / 30) * .8 * (h / 6));
      const deep = (y - 128) / 52, base = v < .33 ? ['#0b1d16', '#12291d', '#1b3a28'] : v < .66 ? ['#0d2218', '#15301f', '#21442c'] : ['#0a1913', '#10251a', '#183424'];
      const lit = wm > .55 ? ['#3a3418', '#6a5a24', '#9a7e34'] : wm > .3 ? ['#1e2e1a', '#34441e', '#546028'] : wm > .12 ? ['#14281a', '#22401f', '#3a5a2c'] : base;
      for (let k = 0; k < h; k++) { const t = k / h, xx = x + Math.round(lean * t * t); px(c, xx, y - k, k === h - 1 ? lit[2] : t > .5 ? lit[1] : lit[0]) }
      if (deep < .2) continue;
    }
  }
  function fern(c, tick, x, y, s, flip) {
    const fronds = [[-2.6, 1], [-2.1, 1.15], [-1.6, 1.25], [-1.1, 1.15], [-.6, 1], [-3.0, .8]];
    fronds.forEach(([a0, l], i) => {
      const len = Math.round(16 * s * l), sway = Math.sin(tick / 24 + i + x) * .05;
      for (let k = 0; k < len; k++) {
        const t = k / len, a = (flip ? Math.PI - a0 : a0) + (flip ? -1 : 1) * (t * t * .9) + sway;
        const fx = Math.round(x + Math.cos(a) * k), fy = Math.round(y + Math.sin(a) * k * .8 + t * t * 6 * s);
        const wm = warm(fx, fy, 70), P = wm > .45 ? ['#3e3a18', '#7a6a28', '#a88c36'] : wm > .25 ? ['#1e3418', '#3a5222', '#5a6e2c'] : ['#0e2618', '#18402a', '#2a5c38'];
        px(c, fx, fy, P[1]);
        if (k % 2 === 0 && k > 1 && k < len - 1) { const ll = Math.max(1, Math.round((1 - t) * 3 * s)); for (let j = 1; j <= ll; j++) { px(c, fx + Math.round(Math.cos(a - 1.4) * j), fy + Math.round(Math.sin(a - 1.4) * j), j === ll ? P[2] : P[1]); px(c, fx + Math.round(Math.cos(a + 1.4) * j), fy + Math.round(Math.sin(a + 1.4) * j), P[0]) } }
      }
    });
  }
  function bush(c, x, y, r) {
    seed = x * 7 + y; for (let i = 0; i < 14; i++) { const bx = x + Math.round((rnd() - .5) * r * 2), by = y - Math.round(rnd() * r), br = 2 + Math.floor(rnd() * 3);
      for (let dy = -br; dy <= br; dy++) { const w = Math.round(br * Math.sqrt(1 - (dy / br) ** 2)); for (let dx = -w; dx <= w; dx++) { const wm = warm(bx + dx, by + dy, 70), top = dy < -br / 2 && dx < 1;
        px(c, bx + dx, by + dy, wm > .4 ? (top ? '#6a6026' : '#3a3a1a') : top ? '#1e4428' : (hash(bx + dx, by + dy) > .7 ? '#12301e' : '#0c2216')) } } }
  }
  function mushrooms(c, tick, list) {
    list.forEach(([x, y, s], i) => { const on = ((tick >> 4) + i * 3) % 7 !== 0;
      ring(c, x + 1, y, 6, 4, '110,215,255', on ? .1 : .05); ring(c, x + 1, y, 3, 2, '150,230,255', on ? .14 : .07);
      c.fillStyle = '#8fa3a8'; c.fillRect(x + 1, y + 1, 1, s + 1);
      c.fillStyle = on ? '#8ee0fb' : '#5fb2cc'; c.fillRect(x - 1, y, 5, 1); c.fillStyle = on ? '#d8f8ff' : '#9ad8ea'; c.fillRect(x, y - 1, 3, 1); px(c, x + 1, y - 2, on ? '#ffffff' : '#c6eef8') });
  }
  function flowers(c, tick, list) {   // little moonbells
    list.forEach(([x, y], i) => { c.fillStyle = '#1e3a26'; c.fillRect(x, y - 3, 1, 3); const on = ((tick >> 5) + i) % 6 !== 0;
      px(c, x - 1, y - 4, on ? '#b9c8ff' : '#8090c0'); px(c, x + 1, y - 4, on ? '#b9c8ff' : '#8090c0'); px(c, x, y - 4, on ? '#eef2ff' : '#b0bce0'); if (on) { c.fillStyle = 'rgba(180,200,255,.15)'; c.fillRect(x - 2, y - 5, 5, 3) } });
  }

  // ---------- the old willows (trunks from A) ----------
  function trunk(c, cx, base, top, wB, wT, lean, fireRight) {
    for (let y = top; y < base; y++) {
      const k = (y - top) / (base - top), flare = y > base - 10 ? ((y - (base - 10)) / 10) ** 2 * 18 : 0, bulge = Math.sin(y / 13) * 1.5;
      const w = Math.round(wT + (wB - wT) * k ** 1.6 + flare + bulge), x0 = Math.round(cx + lean * (1 - k) ** 2 - w / 2);
      for (let x = x0; x < x0 + w; x++) {
        const i = x - x0, u = i / w, g = Math.sin(i * 1.7 + Math.sin(y / 9) * 2 + y / 40) + noise(i / 2, y / 6) * .9;
        let col = g > 1.2 ? '#33261b' : g > .6 ? '#271d14' : g > -.4 ? '#1d150e' : '#0f0a07';
        if ((fireRight ? u < .14 : u > .86)) col = g > .6 ? '#2a3240' : '#1c2028';     // moon on the far side
        if (i === 0 || i === w - 1) col = '#080504';
        px(c, x, y, col);
      }
      // knots
      if ((y * 7 + cx) % 53 === 0 && y > top + 20) { const kx = x0 + Math.round(w * .45); c.fillStyle = '#0a0705'; c.fillRect(kx - 1, y - 1, 4, 3); px(c, kx, y, '#3a2a1c') }
      // firelight on the near side, three pixels deep
      const side = fireRight ? x0 + w - 1 : x0, d = fireRight ? -1 : 1, wm = warm(side, y, 150);
      if (wm > .05) ['#b0682c', '#7a4620', '#4a2c16'].forEach((col, j) => { if (wm > .1 + j * .08) px(c, side + d * j, y, wm > .32 ? col : ['#6a3e1c', '#4a2c16', '#2c1c10'][j]) });
    }
    // roots across the ground
    [[1, 12, 2], [1, 26, 1], [-1, 14, 1]].forEach(([dir, len, th], r) => { const sx = cx + (fireRight ? 1 : -1) * -dir * 6 + (fireRight ? 12 : -12) * (r === 0 ? 0 : 0);
      for (let k = 0; k < len; k++) { const x = Math.round(cx + (fireRight ? -1 : 1) * (14 + k) * (dir > 0 ? 1 : -.4)), y = base - 1 + Math.round(k * .25 + Math.sin(k / 3) * .8);
        const t = Math.max(1, Math.round(th + 1.5 - k / len * 2)); c.fillStyle = '#1d150e'; c.fillRect(x, y - t + 1, 1, t); const wm = warm(x, y); px(c, x, y - t + 1, wm > .2 ? '#6a4020' : '#33261b') } });
  }
  // canopy across the top, deep at the sides, open over the moon
  const edgeY = x => { const e = Math.min(x, W - 1 - x); return Math.round(6 + Math.max(0, 70 - e) * .42 + 3 * Math.sin(x / 9) + 2 * noise(x / 3, 1)) };
  function canopy(c) {
    for (let x = -6; x < W + 6; x += 6) { const cy = edgeY(x) - 4, r = 5 + Math.floor(hash(x, 3) * 3);
      for (let y = -r; y <= r; y++) { const w = Math.round(r * Math.sqrt(1 - (y / r) ** 2)); for (let dx = -w; dx <= w; dx++) { const top = y < -r * .4 && dx < r * .3, n = hash(x + dx, cy + y);
        px(c, x + dx, cy + y, top && n > .45 ? '#1c4434' : n > .82 ? '#123326' : '#091a14') } }
      c.fillStyle = '#091a14'; c.fillRect(x - r, 0, r * 2 + 1, Math.max(0, cy - r + 1)) }
  }
  // a lock of willow leaves, with the little glow dots from C
  const PAL = { back: ['#0a1d18', '#0f2a22', '#16382b'], front: ['#0f281c', '#183e2a', '#2a5a3c'], warm: ['#3a3218', '#6a5426', '#a8803a'] };
  function lock(c, ax, ay, len, tick, ph, amp, layer, glow) {
    for (let k = 0; k < len; k++) {
      const t = k / len, y = ay + k; if (y >= H) break;
      const sway = Math.round(amp * t * t * Math.sin(tick / 28 + ph) + (t > .5 ? Math.sin(tick / 12 + ph * 2) * .7 * t : 0));
      const w = k > len - 5 ? Math.max(1, 3 - Math.floor((k - (len - 5)) / 2)) : 3, x0 = ax + sway - 1;
      const wm = warm(x0 + 1, y) * (layer === 'front' ? 1 : .6);
      const P = wm > .42 ? PAL.warm : wm > .24 ? [PAL[layer][0], PAL.warm[1], PAL.warm[2]] : PAL[layer];
      const lit = (k + Math.round(ph * 5)) % 5 > 1;
      for (let i = 0; i < w; i++) px(c, x0 + i, y, i === 0 ? (lit ? P[2] : P[1]) : i === w - 1 ? P[0] : P[1]);
      const n = (k + Math.round(ph * 3)) % 6; if (n === 0) px(c, x0 - 1, y, P[1]); else if (n === 3) px(c, x0 + w, y, P[0]);
      if (glow && k > 4 && k % 11 === 5) { const on = ((tick >> 4) + k + Math.round(ph * 7)) % 7 !== 0; if (on) { c.fillStyle = 'rgba(120,225,255,.14)'; c.fillRect(x0 - 2, y - 1, 7, 3); c.fillRect(x0, y - 2, 3, 5); px(c, x0 + 1, y, '#b2f4ff') } else px(c, x0 + 1, y, '#3c8ca0') }
    }
  }
  function curtains(c, tick, glow) {
    seed = 13; const G = glow || [.25, .45];
    const room = (ax, ay, want) => { for (let k = 0; k < want; k++) if (inLogo(ax, ay + k) || inLogo(ax - 2, ay + k) || inLogo(ax + 2, ay + k)) return Math.max(0, k - 2); return want };
    for (let ax = 1; ax < W; ax += 5) { const e = Math.min(ax, W - 1 - ax), ay = edgeY(ax) - 1;
      let len = e < 26 ? (e > 6 && e < 20 ? 40 + rnd() * 20 : 90 + rnd() * 50) : e < 130 ? 8 + rnd() * 14 : 6 + rnd() * 26;
      len = room(ax, ay, Math.round(len)); if (len > 2) lock(c, ax, ay, len, tick, rnd() * 6.28, 2, 'back', rnd() < G[0]) }
    for (let ax = 3; ax < W; ax += 6) { const e = Math.min(ax, W - 1 - ax), ay = edgeY(ax);
      let len = e < 22 ? (e > 6 && e < 18 ? 30 + rnd() * 24 : 100 + rnd() * 50) : e < 40 ? 50 + rnd() * 50 : e < 130 ? 6 + rnd() * 12 : 10 + rnd() * 30;
      len = room(ax, ay, Math.round(len)); if (len > 2) lock(c, ax, ay, len, tick, rnd() * 6.28, 2.5, 'front', rnd() < G[1]) }
  }
  function moss(c, tick, x, y, len, ph) { for (let k = 0; k < len; k++) { const xx = x + Math.round(Math.sin(tick / 30 + ph + k / 6) * (k / len) * 1.5); px(c, xx, y + k, k % 3 === 2 ? '#41544a' : '#2c3a33'); if (k % 4 === 1) px(c, xx + 1, y + k, '#23302a'); if (k % 5 === 3) px(c, xx - 1, y + k, '#2c3a33') } }
  function fireflies(c, tick, n, area) {
    seed = 99; const N = n; for (let i = 0; i < n; i++) {
      const bx = area[0] + rnd() * area[2], by = area[1] + rnd() * area[3], ph = rnd() * 6.28, sp = .6 + rnd() * .6;
      const x = Math.round(bx + 9 * Math.sin(tick / 44 * sp + ph)), y = Math.round(by + 5 * Math.sin(tick / 31 * sp + ph * 2));
      const blink = (Math.floor(tick / 6) + i * 5) % 16; if (blink > 10) continue;
      c.fillStyle = 'rgba(210,255,120,.12)'; c.fillRect(x - 2, y - 1, 5, 3); c.fillRect(x - 1, y - 2, 3, 5); c.fillStyle = 'rgba(210,255,120,.25)'; c.fillRect(x - 1, y, 3, 1); c.fillRect(x, y - 1, 1, 3); px(c, x, y, blink > 8 ? '#a8c860' : '#f4ffc0');
    }
  }

  // Eyes in the dark, between the far trunks in the mist. open: 0 nothing, .5 a slit, 1 open. Dim, so it's a
  // "did I see that?" moment, never a jump scare. The caller decides when (rarely) and where.
  function eyes(c, list) {
    for (const e of list) { if (!e || !e.open) continue; const x = Math.round(e.x), y = Math.round(e.y);
      c.fillStyle = 'rgba(190,210,110,.08)'; c.fillRect(x - 3, y - 1, 11, 3);
      for (const dx of [0, 5]) { if (e.open >= 1) { c.fillStyle = '#9fb060'; c.fillRect(x + dx, y - 1, 2, 1); c.fillStyle = '#e4f29a'; c.fillRect(x + dx, y, 2, 1); px(c, x + dx + 1, y, '#f8ffd0') }
        else { c.fillStyle = '#8c9c54'; c.fillRect(x + dx, y, 2, 1) } } }
  }

  // ---------- the fire ----------
  // stones on an oval round the fire: rounded, shaded, lit on the side facing the flames, moss on the outside
  const STONES = []; { seed = 5; const n = 13; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + .12; STONES.push({ a, x: FX + Math.cos(a) * 27, y: FY + 6 + Math.sin(a) * 9, w: 9 + Math.floor(rnd() * 4), h: 6 + Math.floor(rnd() * 2), m: rnd() }) } }
  function stone(c, s) {
    const x0 = Math.round(s.x - s.w / 2), y0 = Math.round(s.y - s.h / 2), toFire = Math.atan2(FY - 4 - s.y, FX - s.x);
    for (let dy = 0; dy < s.h; dy++) for (let dx = 0; dx < s.w; dx++) {
      const nx = (dx + .5) / s.w * 2 - 1, ny = (dy + .5) / s.h * 2 - 1, r = nx * nx + ny * ny * 1.1; if (r > 1) continue;
      const lit = Math.cos(Math.atan2(ny, nx) - toFire) * Math.sqrt(r), top = -ny;
      const edge = r > .72;
      let col = lit > .45 ? '#b48a62' : lit > .15 ? '#7e6650' : top > .3 ? '#4a4a4e' : ny > .45 ? '#1e1e22' : '#35363a';
      if (edge && lit < .3) col = '#151518';
      if (!edge && s.m > .5 && lit < -.2 && hash(dx + x0, dy) > .55) col = '#2c4a2a';
      if (!edge && hash(x0 + dx, y0 + dy) > .9 && lit < .2) col = '#56565c';
      px(c, x0 + dx, y0 + dy, col);
    }
  }
  function logs(c, tick, which) {
    const L = [[136, 152, 154, 138, 4], [184, 152, 166, 138, 4], [146, 154, 152, 136, 3], [174, 154, 168, 136, 3], [140, 155, 182, 153, 5]];
    L.forEach(([x1, y1, x2, y2, th], li) => { if ((which === 'back') !== (li < 4)) return;
      const len = Math.hypot(x2 - x1, y2 - y1);
      for (let k = 0; k <= len; k++) { const t = k / len, x = Math.round(x1 + (x2 - x1) * t), y = Math.round(y1 + (y2 - y1) * t);
        for (let j = 0; j < th; j++) { const yy = y - j, n = hash(x, yy + li * 50), burn = (li < 4 ? t > .55 : Math.abs(x - FX) < 12) && j > 0 && j < th - 1;
          let col = j === th - 1 ? '#7a4a26' : j === 0 ? '#150c06' : n > .65 ? '#4a2c16' : '#331e0f';
          if (burn) { const e = (n + ((tick >> 2) * .17 + k * .07)) % 1; col = LEVEL > .5 ? (e > .78 ? '#ffb24a' : e > .5 ? '#e8602c' : e > .3 ? '#8a2a14' : '#2a140a') : (e > .9 ? '#e8602c' : e > .7 ? '#8a2a14' : e > .45 ? '#4a1a0c' : '#2a140a') }
          px(c, x, yy, col) } }
      // the cut end, with rings
      if (li < 2 || li === 4) { const ex = li === 4 ? (x1 < x2 ? x1 : x2) : x1, ey = y1; c.fillStyle = '#8a6a44'; c.fillRect(ex - 1, ey - th + 1, 2, th); px(c, ex - 1, ey - Math.floor(th / 2), '#5a3e24'); px(c, ex, ey - Math.floor(th / 2), '#a8865a') }
      if (li === 4) { const ex = x2; c.fillStyle = '#8a6a44'; c.fillRect(ex, y2 - th + 1, 2, th); px(c, ex + 1, y2 - Math.floor(th / 2), '#5a3e24') }
    });
  }
  // flames: a heat field rising through noise, cut into five colour bands
  function flames(c, tick) {
    const t = tick * .26, bandCol = ['#7a2410', '#c8401c', '#f07a2c', '#ffb84a', '#ffe9a0', '#fffbe6'];
    for (let y = 104; y < 154; y++) for (let x = 136; x < 185; x++) {
      const h = (154 - y) / 46, dx = (x - FX) / (19 * Math.max(.12, 1 - h) ** .7 + 1);
      let heat = 1.08 - Math.abs(dx) ** 1.8 - h * 1.0;
      if (h > .6) heat -= (h - .6) * 2.6;
      heat += (noise(x * .2, y * .16 + t) - .5) * (.55 + h * .8) + (noise(x * .45 + 9, y * .35 + t * 1.8) - .5) * .35;
      if (y > 148) heat -= (y - 148) * .08;            // the logs hide the very bottom
      const b = heat > .95 ? 5 : heat > .78 ? 4 : heat > .58 ? 3 : heat > .4 ? 2 : heat > .26 ? 1 : heat > .17 ? 0 : -1;
      if (h > LEVEL * 1.05) continue;
      if (b >= 0 && !(b === 0 && h > .45)) px(c, x, y, bandCol[b]);
    }
  }
  const SPARKS = []; { seed = 61; for (let i = 0; i < 14; i++) SPARKS.push({ x: FX - 6 + rnd() * 12, p: Math.floor(rnd() * 60), s: 40 + Math.floor(rnd() * 30), d: (rnd() - .5) * 14 }) }
  function sparks(c, tick) {
    SPARKS.forEach(s => { const t = (tick + s.p) % s.s, f = t / s.s, y = Math.round(128 - t * 1.6), x = Math.round(s.x + s.d * f + Math.sin(t / 5 + s.p) * 2);
      if (y < 40) return; c.fillStyle = f < .35 ? '#ffe9a0' : f < .7 ? '#ffb24a' : '#e8602c'; c.globalAlpha = 1 - f * .9; c.fillRect(x, y, 1, 1); c.globalAlpha = 1 });
    // smoke
    for (let i = 0; i < 6; i++) { const t = ((tick >> 1) + i * 13) % 80, y = 104 - t, x = Math.round(FX + Math.sin(t / 9 + i) * (2 + t / 10)); c.fillStyle = `rgba(120,130,140,${(.09 * (1 - t / 80)).toFixed(3)})`; c.fillRect(x - 1 - (t >> 4), y, 3 + (t >> 3), 2) }
  }
  function firelight(c, tick) {
    ring(c, FX, FY + 4, 120 * flick, 36 * flick, '255,140,50', .025); ring(c, FX, FY + 4, 84 * flick, 26 * flick, '255,150,60', .04);
    ring(c, FX, FY + 4, 60 * flick, 18 * flick, '255,160,70', .06); ring(c, FX, FY + 2, 30 * flick, 10 * flick, '255,190,100', .08);
  }

  window.drawForest = function (c, tick, level, opts) {
    LEVEL = level === undefined ? 1 : level; const NOPIT = !!(opts && opts.noPit);
    flick = (1 + (noise(tick * .15, 3) - .5) * .12) * (.35 + .65 * LEVEL);
    sky(c, tick); farForest(c, tick); ground(c, tick);
    grass(c, tick, 0, 140);
    trunk(c, 22, 136, 0, 36, 20, -10, true); trunk(c, 298, 136, 0, 36, 20, 10, false);
    canopy(c);
    moss(c, tick, 46, edgeY(46) - 2, 14, 1); moss(c, tick, 272, edgeY(272) - 2, 18, 2.5); moss(c, tick, 60, edgeY(60) - 2, 9, 4);
    curtains(c, tick, opts && opts.glow);
    bush(c, 60, 140, 12); bush(c, 262, 141, 13); bush(c, 100, 134, 7); bush(c, 228, 135, 8);
    mushrooms(c, tick, [[44, 141, 2], [50, 143, 1], [38, 145, 2], [276, 142, 2], [282, 145, 1], [118, 137, 1]]);
    flowers(c, tick, [[86, 146], [92, 150], [236, 147], [244, 151], [210, 140], [112, 141]]);
    if (LEVEL > .05 && !NOPIT) firelight(c, tick);
    if (!NOPIT) {
    STONES.filter(s => s.y < FY + 6).forEach(s => stone(c, s));
    logs(c, tick, 'back'); if (LEVEL > .05) flames(c, tick); logs(c, tick, 'front');
    STONES.filter(s => s.y >= FY + 6).forEach(s => stone(c, s));
    }
    if (NOPIT) {}
    else if (LEVEL > .3) sparks(c, tick);
    else for (let i = 0; i < 5; i++) { const t = ((tick >> 1) + i * 17) % 90, y = 140 - t, x = Math.round(FX + Math.sin(t / 10 + i) * (2 + t / 12)); c.fillStyle = `rgba(150,155,165,${(.16 * (1 - t / 90)).toFixed(3)})`; c.fillRect(x - 1, y, 3, 2) }
    grass(c, tick, 140, 168);
    fern(c, tick, 76, 160, 1.1, false); fern(c, tick, 246, 162, 1.2, true); fern(c, tick, 34, 152, .9, false); fern(c, tick, 290, 154, .9, true);
    grass(c, tick, 168, 181);
    // dark foreground fronds in the corners
    fern(c, tick, -4, 186, 2.2, false); fern(c, tick, 324, 188, 2.2, true);
    c.fillStyle = 'rgba(2,6,8,.55)'; for (let y = 160; y < H; y++) { const w = Math.round((y - 160) * 2.2); c.fillRect(0, y, w, 1); c.fillRect(W - w, y, w, 1) }
    mist(c, tick, 156, 8, .05, 3);
    if (!(opts && opts.liveFlies)) fireflies(c, tick, (opts && opts.flies) || 16, [40, 96, 240, 50]);
    if (opts && opts.eyes) eyes(c, opts.eyes);
  };
  // Live fireflies, drawn every frame like the fire (t in seconds). The dot sits on the pixel grid, but its
  // glow and brightness ease smoothly, and each one fades in and out over a second instead of switching.
  // Slow: a drift takes about 20 s, a glow lasts about 10 s with 5 s dark, each on its own clock.
  window.drawFireflies = function (c, t, n, area) {
    seed = 99; area = area || [40, 96, 240, 50];
    for (let i = 0; i < (n || 16); i++) {
      const bx = area[0] + rnd() * area[2], by = area[1] + rnd() * area[3], ph = rnd() * 6.28, sp = .6 + rnd() * .6, per = 12 + rnd() * 6;
      const x = Math.round(bx + 9 * Math.sin(t / 3.3 * sp + ph)), y = Math.round(by + 5 * Math.sin(t / 2.3 * sp + ph * 2));
      const cyc = ((t + ph * 2) % per) / per, lit = cyc < .68 ? 1 : cyc < .75 ? 1 - (cyc - .68) / .07 : cyc > .93 ? (cyc - .93) / .07 : 0;   // on, fade out, dark, fade in
      if (lit <= 0) continue;
      const b = lit * (.75 + .25 * Math.sin(t * 2.2 * sp + ph));   // a slow breath while lit
      c.fillStyle = `rgba(210,255,120,${(.12 * b).toFixed(3)})`; c.fillRect(x - 2, y - 1, 5, 3); c.fillRect(x - 1, y - 2, 3, 5);
      c.fillStyle = `rgba(210,255,120,${(.25 * b).toFixed(3)})`; c.fillRect(x - 1, y, 3, 1); c.fillRect(x, y - 1, 1, 3);
      c.fillStyle = `rgba(244,255,192,${Math.min(1, b + .15).toFixed(3)})`; c.fillRect(x, y, 1, 1);
    }
  };

  // ---------- menus, on a finer 480×270 grid ----------
  // hand-made font: caps 9 rows, small letters 6 rows tall, descenders 3
  const F = {
    // added for the Buttons screen (2026-11-08), same 9-row caps
    A: [".####.", "#....#", "#....#", "#....#", "######", "#....#", "#....#", "#....#", "#....#"],
    C: [".####.", "#....#", "#.....", "#.....", "#.....", "#.....", "#.....", "#....#", ".####."],
    D: ["#####.", "#....#", "#....#", "#....#", "#....#", "#....#", "#....#", "#....#", "#####."],
    E: ["######", "#.....", "#.....", "#.....", "#####.", "#.....", "#.....", "#.....", "######"],
    G: [".####.", "#....#", "#.....", "#.....", "#..###", "#....#", "#....#", "#....#", ".####."],
    H: ["#....#", "#....#", "#....#", "#....#", "######", "#....#", "#....#", "#....#", "#....#"],
    I: ["###", ".#.", ".#.", ".#.", ".#.", ".#.", ".#.", ".#.", "###"],
    Q: [".####.", "#....#", "#....#", "#....#", "#....#", "#....#", "#..#.#", "#...#.", ".###.#"],
    R: ["#####.", "#....#", "#....#", "#....#", "#####.", "#..#..", "#...#.", "#....#", "#....#"],
    T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
    U: ["#....#", "#....#", "#....#", "#....#", "#....#", "#....#", "#....#", "#....#", ".####."],
    X: ["#....#", "#....#", ".#..#.", ".#..#.", "..##..", ".#..#.", ".#..#.", "#....#", "#....#"],
    "-": ["...", "...", "...", "...", "...", "###", "...", "...", "..."],
    "+": [".....", ".....", ".....", "..#..", "..#..", "#####", "..#..", "..#..", "....."],
    B: ["#####.", "#....#", "#....#", "#....#", "#####.", "#....#", "#....#", "#....#", "#####."],
    S: [".####.", "#....#", "#.....", "#.....", ".####.", ".....#", ".....#", "#....#", ".####."],
    P: ["#####.", "#....#", "#....#", "#....#", "#####.", "#.....", "#.....", "#.....", "#....."],
    Y: ["#.....#", "#.....#", ".#...#.", "..#.#..", "...#...", "...#...", "...#...", "...#...", "...#..."],
    M: ["#.....#", "##...##", "##...##", "#.#.#.#", "#.#.#.#", "#..#..#", "#..#..#", "#.....#", "#.....#"],
    N: ["#....#", "##...#", "##...#", "#.#..#", "#.#..#", "#..#.#", "#...##", "#...##", "#....#"],
    "?": [".####.", "#....#", ".....#", "....#.", "...#..", "...#..", "......", "...#..", "...#.."],
    W: ["#.....#", "#.....#", "#.....#", "#..#..#", "#..#..#", "#..#..#", "#.#.#.#", "##...##", "#.....#"],
    J: ["..####", "....#.", "....#.", "....#.", "....#.", "....#.", "#...#.", "#...#.", ".###.."],
    L: ["#.....", "#.....", "#.....", "#.....", "#.....", "#.....", "#.....", "#.....", "######"],
    Z: ["######", ".....#", "....#.", "...#..", "..#...", ".#....", "#.....", "#.....", "######"],
    O: [".####.", "#....#", "#....#", "#....#", "#....#", "#....#", "#....#", "#....#", ".####."],
    z: [".....", ".....", ".....", "#####", "....#", "...#.", "..#..", ".#...", "#####"],
    f: ["..##.", ".#...", ".#...", "####.", ".#...", ".#...", ".#...", ".#...", ".#..."],
    l: ["#.", "#.", "#.", "#.", "#.", "#.", "#.", "#.", ".#"],
    v: [".....", ".....", ".....", "#...#", "#...#", "#...#", ".#.#.", ".#.#.", "..#.."],
    y: [".....", ".....", ".....", "#...#", "#...#", "#...#", "#...#", ".####", "....#", "....#", ".###."],
    p: [".....", ".....", ".....", "####.", "#...#", "#...#", "#...#", "####.", "#....", "#....", "#...."],
    b: ["#....", "#....", "#....", "####.", "#...#", "#...#", "#...#", "#...#", "####."],
    x: [".....", ".....", ".....", "#...#", ".#.#.", "..#..", "..#..", ".#.#.", "#...#"],
    j: ["..", ".#", "..", ".#", ".#", ".#", ".#", ".#", ".#", ".#", "#."],
    q: [".....", ".....", ".....", ".####", "#...#", "#...#", "#...#", ".####", "....#", "....#", "....#"],
    "?": [".###.", "#...#", "....#", "...#.", "..#..", "..#..", ".....", "..#..", "..#.."],
    "'": ["#", "#", ".", ".", ".", ".", ".", ".", "."],
    ":": [".", ".", ".", "#", ".", ".", ".", "#", "."],
    "0": [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", "#...#", "#...#", ".###."],
    "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", "..#..", "..#..", ".###."],
    "2": [".###.", "#...#", "....#", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
    "3": [".###.", "#...#", "....#", "....#", "..##.", "....#", "....#", "#...#", ".###."],
    "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#.", "...#.", "...#."],
    "5": ["#####", "#....", "#....", "####.", "....#", "....#", "....#", "#...#", ".###."],
    "6": [".###.", "#...#", "#....", "#....", "####.", "#...#", "#...#", "#...#", ".###."],
    "7": ["#####", "....#", "....#", "...#.", "...#.", "..#..", "..#..", ".#...", ".#..."],
    "8": [".###.", "#...#", "#...#", "#...#", ".###.", "#...#", "#...#", "#...#", ".###."],
    "9": [".###.", "#...#", "#...#", "#...#", ".####", "....#", "....#", "#...#", ".###."],
    a: [".....", ".....", ".....", ".###.", "....#", ".####", "#...#", "#..##", ".##.#"],
    c: [".....", ".....", ".....", ".####", "#....", "#....", "#....", "#....", ".####"],
    d: ["....#", "....#", "....#", ".####", "#...#", "#...#", "#...#", "#...#", ".####"],
    e: [".....", ".....", ".....", ".###.", "#...#", "#####", "#....", "#....", ".####"],
    g: [".....", ".....", ".....", ".####", "#...#", "#...#", "#...#", "#...#", ".####", "....#", "....#", ".###."],
    h: ["#....", "#....", "#....", "#.##.", "##..#", "#...#", "#...#", "#...#", "#...#"],
    i: [".", "#", ".", "#", "#", "#", "#", "#", "#"],
    k: ["#....", "#....", "#....", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
    m: [".......", ".......", ".......", "###.##.", "#..#..#", "#..#..#", "#..#..#", "#..#..#", "#..#..#"],
    n: [".....", ".....", ".....", "#.##.", "##..#", "#...#", "#...#", "#...#", "#...#"],
    o: [".....", ".....", ".....", ".###.", "#...#", "#...#", "#...#", "#...#", ".###."],
    r: ["....", "....", "....", "#.##", "##..", "#...", "#...", "#...", "#..."],
    s: [".....", ".....", ".....", ".####", "#....", ".###.", "....#", "....#", "####."],
    t: ["....", ".#..", ".#..", "####", ".#..", ".#..", ".#..", ".#..", "..##"],
    u: [".....", ".....", ".....", "#...#", "#...#", "#...#", "#...#", "#..##", ".##.#"],
    w: [".......", ".......", ".......", "#.....#", "#.....#", "#..#..#", "#..#..#", "#.#.#.#", ".#...#."],
    " ": ["...", "..."]
  };
  const tw = s => [...s].reduce((w, ch) => w + F[ch][0].length + 1, 0) - 1;
  function text(c, s, x, y, col, out) {
    for (const ch of s) { const g = F[ch];
      if (out) { c.fillStyle = out; g.forEach((row, ry) => [...row].forEach((p, rx) => { if (p === '#') { c.fillRect(x + rx - 1, y + ry, 3, 1); c.fillRect(x + rx, y + ry - 1, 1, 3); c.fillRect(x + rx + 1, y + ry + 1, 1, 1) } })) }
      c.fillStyle = col; g.forEach((row, ry) => [...row].forEach((p, rx) => { if (p === '#') c.fillRect(x + rx, y + ry, 1, 1) }));
      x += g[0].length + 1 }
  }
  // dark firelit wood, finer: 6-pixel rim with grain, bevel, inner panel
  const Wd = { out: '#120803', w1: '#9a5a2c', w2: '#71401f', w3: '#4a2711', hi: '#c27a3e', in: '#24140a', in2: '#1a0e06', edge: '#3a2212', txt: '#efdcb4', sel: '#ffd36b', dim: '#9c8460' };
  function frame(c, x, y, w, h) {
    c.fillStyle = Wd.out; c.fillRect(x + 3, y, w - 6, h); c.fillRect(x, y + 3, w, h - 6); c.fillRect(x + 1, y + 1, w - 2, h - 2);
    c.fillStyle = Wd.w2; c.fillRect(x + 3, y + 1, w - 6, h - 2); c.fillRect(x + 1, y + 3, w - 2, h - 6); c.fillRect(x + 2, y + 2, w - 4, h - 4);
    c.fillStyle = Wd.hi; c.fillRect(x + 4, y + 1, w - 8, 1); c.fillRect(x + 1, y + 4, 1, h - 8);
    c.fillStyle = Wd.w3; c.fillRect(x + 4, y + h - 2, w - 8, 1); c.fillRect(x + w - 2, y + 4, 1, h - 8);
    for (let gx = x + 8; gx < x + w - 10; gx += 11) { c.fillStyle = Wd.w1; c.fillRect(gx, y + 3, 5, 1); c.fillRect(gx + 4, y + h - 4, 4, 1); c.fillStyle = Wd.w3; c.fillRect(gx + 6, y + 4, 2, 1) }
    for (let gy = y + 9; gy < y + h - 9; gy += 9) { c.fillStyle = Wd.w1; c.fillRect(x + 3, gy, 1, 3); c.fillRect(x + w - 4, gy + 4, 1, 3) }
    [[x + 3, y + 3], [x + w - 4, y + 3], [x + 3, y + h - 4], [x + w - 4, y + h - 4]].forEach(([a, b]) => { c.fillStyle = '#d9a25a'; c.fillRect(a, b, 1, 1) });   // brass pins
    c.fillStyle = Wd.edge; c.fillRect(x + 6, y + 6, w - 12, h - 12);
    c.fillStyle = Wd.in; c.fillRect(x + 7, y + 7, w - 14, h - 14);
    c.fillStyle = Wd.in2; c.fillRect(x + 7, y + h - 8, w - 14, 1); c.fillRect(x + w - 8, y + 7, 1, h - 14);
    return { x: x + 7, y: y + 7, w: w - 14, h: h - 14 };
  }
  const HAND = ["..kkk.........", ".kwwwk........", ".kwwwkkkkkkkk.", "kwwwwwwwwwwwwk", "kwwwwwkkkkkkk.", "kwwwwwk.......", "kswwwwk.......", "kswwwk........", ".kssk.........", "..kk.........."], HC = { k: '#120803', w: '#fff1d6', s: '#d3b17e' };
  const hand = (c, x, y) => HAND.forEach((r, ry) => [...r].forEach((ch, rx) => { if (HC[ch]) { c.fillStyle = HC[ch]; c.fillRect(x + rx, y + ry, 1, 1) } }));
  window.CM = { text, tw, frame, hand, Wd, F };
  window.drawMenu = function (c, tick, kind, pick) {
    c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(0, 0, 480, 270);
    const bob = (tick >> 3) % 2;
    if (kind === 'pause') {
      const items = ['Back to game', 'Shut down', 'Menu'], w = 150, h = 92, x = (480 - w) / 2, y = (270 - h) / 2, r = frame(c, x, y, w, h);
      items.forEach((s, i) => { const ty = r.y + 11 + i * 22; text(c, s, r.x + 30, ty, i === pick ? Wd.sel : Wd.dim, '#0a0402'); if (i === pick) hand(c, r.x + 10 - bob, ty) });
    } else if (kind === 'camp') {
      const items = ['Back', 'Shut down'], w = 120, h = 70, x = (480 - w) / 2, y = (270 - h) / 2, r = frame(c, x, y, w, h);
      items.forEach((s, i) => { const ty = r.y + 11 + i * 22; text(c, s, r.x + 30, ty, i === pick ? Wd.sel : Wd.dim, '#0a0402'); if (i === pick) hand(c, r.x + 10 - bob, ty) });
    } else {
      const w = 152, h = 72, x = (480 - w) / 2, y = (270 - h) / 2, r = frame(c, x, y, w, h), q = 'Shut down?';
      text(c, q, r.x + Math.round((r.w - tw(q)) / 2), r.y + 10, Wd.txt, '#0a0402');
      const ys = r.y + 34, yx = r.x + 38, nx = r.x + 86;
      text(c, 'Yes', yx, ys, pick === 0 ? Wd.sel : Wd.dim, '#0a0402'); text(c, 'No', nx, ys, pick === 1 ? Wd.sel : Wd.dim, '#0a0402');
      hand(c, (pick === 0 ? yx : nx) - 18 - bob, ys);
    }
  };
})();

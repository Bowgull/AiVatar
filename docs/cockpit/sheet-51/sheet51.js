// Sheet 51 helpers: pixel gloves and gems (palette-letter maps, drawn whole-pixel), the aura takes, the contrast ratios,
// and the choice rows' pointer (mouse and arrow keys). Mockup only.

// ---------------------------------------------------------------- pixel maps
// TODAY: src/Shell/pages/art/browser/hand.png read pixel by pixel (12 x 9). A navy outline, B white, C shade.
const GLOVES = {
  today: { name: 'TODAY · hand.png', size: '12 × 9, navy outline. In the bubble it is drawn at 26 × 20: 2.17×, so some art pixels come out 2 px and some 3 px, which smudges it and makes it look chubbier.',
    pal: { A: '#141828', B: '#fafaff', C: '#aab0c8' },
    map: ['..AAAAAA....', '.ABBBBBBAAA.', 'ABBBBBBBBBBA', 'ABBBBBAAAAA.', 'ABBBBBBBBA..', 'ABBBBBAAA...', 'ACBBBBBBA...', '.ACCCCAA....', '..AAAA......'] },
  g1: { name: 'G1 · SLIM INDEX (RECOMMENDED)', size: '14 × 9. A fist two pixels narrower, a longer two-pixel finger with a shaded underside, a small cream cuff with a gold band. Dark-wood outline.',
    pal: { O: '#2a1a10', W: '#fffaf0', L: '#d9d2e4', S: '#9f97b4', C: '#f3e2b8', K: '#c98c14' },
    map: ['....OOOO......', '...OWWWWOOOOO.', '.OOOWWWWWWWWWO', 'OCCKWWWLLLLLLO', 'OCCKWWWSOOOOO.', 'OCCKWWWWLO....', '.OOOLWWSO.....', '...OOLLO......', '....OOO.......'] },
  g2: { name: 'G2 · SAME BOX', size: '12 × 9, exactly today\'s footprint, so it drops in without moving a row. Slimmer fist, two-pixel finger, no cuff.',
    pal: { O: '#2a1a10', W: '#fffaf0', L: '#d9d2e4', S: '#9f97b4' },
    map: ['...OOOO.....', '..OWWWWOOOO.', '.OWWWWWWWWWO', 'OWWWWWLLLLLO', 'OWWWWSOOOOO.', 'OWWWWWO.....', 'OLWWSWO.....', '.OLLLO......', '..OOO.......'] },
  g3: { name: 'G3 · FINE FINGER, FFX CUFF', size: '15 × 9. Closest to FFX: a one-pixel finger, the thumb on top, a flared white cuff. The finest, the least weight.',
    pal: { O: '#2a1a10', W: '#fffaf0', L: '#d9d2e4', S: '#9f97b4' },
    map: ['.....OOO.......', 'OO..OWWWO......', 'OWO.OWWWWOOOOO.', 'OWWOWWWWWWWWWWO', 'OWLOWWWLOOOOOO.', 'OWWOWWWWO......', 'OWLOLWWSO......', 'OO..OLLO.......', '.....OO........'] },
};
const GEM = ['...O...', '..OHO..', '.OHFFO.', 'OHFFFSO', '.OFFSO.', '..OSO..', '...O...'];
const mix = (h, t, k) => { const a = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); return a.map((v, i) => Math.round(v + (t[i] - v) * k)); };
const rgb = (a) => `rgb(${a.join(',')})`;

function pixCanvas(map, pal, px) {
  const w = map[0].length, h = map.length;
  const cv = Object.assign(document.createElement('canvas'), { width: w * px, height: h * px });
  const g = cv.getContext('2d');
  map.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch]) { g.fillStyle = pal[ch]; g.fillRect(x * px, y * px, px, px); } }));
  return cv;
}
function gemPal(col) { return { O: '#2a1a10', H: rgb(mix(col, [255, 255, 255], 0.6)), F: col, S: rgb(mix(col, [40, 20, 10], 0.4)) }; }

const root = document.documentElement.style;
root.setProperty('--glove', `url(${pixCanvas(GLOVES.g1.map, GLOVES.g1.pal, 2).toDataURL()})`);
for (const [k, c] of Object.entries({ dim: '#b49a6c', gold: '#ffc43c', teal: '#58b0a3', plum: '#9a6ad0' }))
  root.setProperty(`--gem-${k}`, `url(${pixCanvas(GEM, gemPal(c), 2).toDataURL()})`);

// ---------------------------------------------------------------- section 1: the pointer follows the mouse and the arrow keys
for (const list of document.querySelectorAll('.opts:not(.static)')) {
  const rows = [...list.querySelectorAll('.opt')];
  const set = (r) => rows.forEach((x) => x.classList.toggle('on', x === r));
  list.tabIndex = 0;
  rows.forEach((r) => {
    r.addEventListener('mouseenter', () => set(r));
    r.addEventListener('click', () => { if (r.querySelector('.mk')) r.classList.toggle('picked'); syncSend(list); });
  });
  list.addEventListener('keydown', (e) => {
    const i = rows.findIndex((x) => x.classList.contains('on'));
    if (e.key === 'ArrowDown') { set(rows[Math.min(rows.length - 1, i + 1)]); e.preventDefault(); }
    if (e.key === 'ArrowUp') { set(rows[Math.max(0, i - 1)]); e.preventDefault(); }
    if (e.key === ' ' && rows[i]?.querySelector('.mk')) { rows[i].classList.toggle('picked'); syncSend(list); e.preventDefault(); }
  });
}
function syncSend(list) {
  const key = list.parentElement.querySelector('[data-send]'); if (!key) return;
  const n = list.querySelectorAll('.opt.picked').length;
  key.textContent = n ? `Send ${n} pick${n > 1 ? 's' : ''}` : 'Pick at least one';
}

// ---------------------------------------------------------------- section 2: the gloves, one per row
// TODAY's card (the stretched hand.png) | arrow lane | the new hand in a B card at 2x | close-up: today vs new, both at 4x their bubble size
const GLOVE_ROWS = [
  { k: 'g1', L: 'G1', nm: 'Slim finger, small gold cuff', mine: true, call: 'Longer, slimmer finger|drawn at exactly 2×',
    cap: 'The fist is two pixels narrower, the finger longer with a shaded underside, a cream cuff with a gold band.' },
  { k: 'g2', L: 'G2', nm: 'Same size as today', call: 'Slimmer hand, same box|drawn at exactly 2×',
    cap: 'Fits exactly where today\'s hand sits, so no row moves. Slimmer fist, two-pixel finger, no cuff.' },
  { k: 'g3', L: 'G3', nm: 'Fine finger, Final Fantasy cuff', call: 'One-pixel finger, flared cuff|drawn at exactly 2×',
    cap: 'Closest to Final Fantasy X: a one-pixel finger, the thumb on top, a flared white cuff. The lightest.' },
];
const gHost = document.getElementById('gloves');
const todayTwoRows = () => `<div class="card k-q today"><p class="q">Which layout?</p><div class="opts vT static">
  <div class="opt on"><span class="tx"><b>Full-screen map</b></span><span class="kc">1</span></div>
  <div class="opt"><span class="tx"><b>Split: map and list</b></span><span class="kc">2</span></div></div></div>`;
function smearToday(scale) {   // what the bubble really draws today: 12 x 9 stretched to 26 x 20, then magnified by whole pixels
  const smear = Object.assign(document.createElement('canvas'), { width: 26, height: 20 });
  const g = smear.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(pixCanvas(GLOVES.today.map, GLOVES.today.pal, 1), 0, 0, 26, 20);
  const out = Object.assign(document.createElement('canvas'), { width: 26 * scale, height: 20 * scale });
  const g2 = out.getContext('2d'); g2.imageSmoothingEnabled = false; g2.drawImage(smear, 0, 0, 26 * scale, 20 * scale);
  return out;
}
if (gHost) for (const r of GLOVE_ROWS) {
  const gl = GLOVES[r.k], w = gl.map[0].length * 2, h = gl.map.length * 2;
  const url = pixCanvas(gl.map, gl.pal, 2).toDataURL();
  const row = document.createElement('div'); row.className = 'orow';
  row.innerHTML = `<div class="ohead"><span class="L">${r.L}</span><span class="nm">${r.nm}</span>${r.mine ? '<span class="pick">MY PICK</span>' : ''}<span class="cap2">${r.cap}</span></div>
  <div class="ogrid" data-callouts>
    <div class="col"><div class="ctg">TODAY &middot; stretched 2.17&times;</div><div class="big">${todayTwoRows()}</div></div>
    <div class="lane"></div>
    <div class="col"><div class="ctg">${r.L}</div><div class="big"><div class="card k-q fingers"><p class="q">Which layout?</p><div class="opts vB static">
      <div class="opt on"><i class="gfing" data-call="${r.call}" style="width:${w}px;height:${h}px;left:${-4 - w}px;top:50%;margin-top:${-h / 2}px;background:url(${url}) 0 0/${w}px ${h}px"></i><span class="tx"><b>Full-screen map</b></span></div>
      <div class="opt"><span class="tx"><b>Split: map and list</b></span></div></div></div></div></div>
    <div class="col"><div class="ctg">CLOSE-UP &middot; BOTH 4&times;</div><div class="zbox" style="height:250px"><div class="gzoom"></div></div></div>
  </div>`;
  const z = row.querySelector('.gzoom');
  const f1 = document.createElement('figure'); f1.append(smearToday(4)); f1.append(Object.assign(document.createElement('figcaption'), { textContent: 'TODAY' }));
  const f2 = document.createElement('figure'); f2.append(pixCanvas(gl.map, gl.pal, 8)); f2.append(Object.assign(document.createElement('figcaption'), { textContent: r.L }));
  z.append(f1, f2);
  gHost.append(row);
}


// ---------------------------------------------------------------- section 3: the aura
// One distance field from his silhouette (how far each pixel is from his nearest pixel), worked out once. Every take
// is then just "alpha as a function of distance", which is exactly what the pet gets by stamping N silhouette rings
// with falling alpha and caching them per frame size.
const AURA = document.getElementById('aura');
const COLS = [
  { k: 'needs', name: 'Needs you', c: '#7cc4ff', sub: 'blue: Claude is waiting for your OK' },
  { k: 'question', name: 'Question', c: '#b07cff', sub: 'violet: Claude asks you something' },
  { k: 'complete', name: 'Job complete', c: '#3fc4b4', sub: 'teal: a job finished' },
  { k: 'warm', name: 'Warm', c: '#ffb35a', sub: "orange: Aang's own news" },
];
const TAKES = [
  { k: 'today', name: 'TODAY', sub: 'A hard ring that fades on and off' },
  { k: 'B', name: 'B · Warm bloom', sub: 'Thin white rim, then soft warm haze', mine: true },
  { k: 'A', name: 'A · Soft haze', sub: 'Haze only, no edge at all' },
  { k: 'C', name: 'C · Embers', sub: 'Soft haze plus slow rising sparks' },
];
const PAD = 22, SW = 224;
if (AURA) {
  const sprite = new Image(); sprite.src = '../../assets/aang/frames/idle_0.png';
  sprite.onload = () => {
    const W = SW + PAD * 2;
    const tmp = Object.assign(document.createElement('canvas'), { width: W, height: W });
    const tg = tmp.getContext('2d'); tg.drawImage(sprite, PAD, PAD);
    let data; try { data = tg.getImageData(0, 0, W, W).data; } catch (e) { AURA.append('(the aura needs the sheet served over http)'); return; }
    const INF = 1e9, d = new Float32Array(W * W);
    for (let i = 0; i < W * W; i++) d[i] = data[i * 4 + 3] > 20 ? 0 : INF;
    const R2 = Math.SQRT2;
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) { const i = y * W + x; let v = d[i];
      if (x > 0) v = Math.min(v, d[i - 1] + 1); if (y > 0) { v = Math.min(v, d[i - W] + 1); if (x > 0) v = Math.min(v, d[i - W - 1] + R2); if (x < W - 1) v = Math.min(v, d[i - W + 1] + R2); } d[i] = v; }
    for (let y = W - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) { const i = y * W + x; let v = d[i];
      if (x < W - 1) v = Math.min(v, d[i + 1] + 1); if (y < W - 1) { v = Math.min(v, d[i + W] + 1); if (x < W - 1) v = Math.min(v, d[i + W + 1] + R2); if (x > 0) v = Math.min(v, d[i + W - 1] + R2); } d[i] = v; }
    // where motes may start: a few pixels off his edge, upper two thirds
    const spots = []; for (let y = PAD; y < PAD + 150; y++) for (let x = 0; x < W; x++) { const v = d[y * W + x]; if (v > 3 && v < 6) spots.push([x, y]); }
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const motes = Array.from({ length: 7 }, (_, i) => ({ s: spots[Math.floor(rnd() * spots.length)], life: 3.6 + rnd() * 2, off: rnd() * 6, rise: 14 + rnd() * 14, sway: rnd() * 6.28 }));
    let x0 = W, y0 = W, x1 = 0, y1 = 0;
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) if (d[y * W + x] === 0) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const M = 20, BX = x0 - M, BY = y0 - M - 10, BW = x1 - x0 + 1 + M * 2, BH = y1 - y0 + 1 + M * 2 + 10;
    const cells = [];
    for (const col of COLS) {
      const row = Object.assign(document.createElement('div'), { className: 'arow', innerHTML: `<div class="ahead"><span class="sw2" style="background:${col.c}"></span>${col.name}<small>${col.sub}</small></div>` });
      const tiles = Object.assign(document.createElement('div'), { className: 'atiles' }); row.append(tiles); AURA.append(row);
      for (const t of TAKES) {
        const cv = Object.assign(document.createElement('canvas'), { width: BW, height: BH });
        cv.style.width = BW * 3 + 'px'; cv.style.height = BH * 3 + 'px';   // 3x, whole pixels
        const tile = Object.assign(document.createElement('div'), { className: 'atile' + (t.k === 'today' ? ' today' : '') + (t.mine ? ' mine' : ''),
          innerHTML: `<div class="an">${t.name}${t.mine ? '<span class="pick">MY PICK</span>' : ''}</div><div class="as">${t.sub}</div>` });
        tile.append(cv); tiles.append(tile); cells.push({ cv, g: cv.getContext('2d'), t: t.k, c: mix(col.c, [0, 0, 0], 0), img: new ImageData(W, W) });
      }
    }
    relayout();   // the page grew: redo the arrows
    const LUTN = 80, STEP = 0.25;   // alpha per quarter pixel of distance
    function lut(take, ph) {
      const a = new Float32Array(LUTN), hot = new Float32Array(LUTN);
      for (let i = 1; i < LUTN; i++) { const r = i * STEP;
        if (take === 'today') { const a1 = r <= 3.3 ? (95 + 90 * ph) / 255 : 0, a2 = r <= 6.3 ? 0.32 * ph * ph : 0; a[i] = a1 + a2 * (1 - a1); }
        if (take === 'A') { const R = 8 + 4 * ph, I = 0.55 + 0.35 * ph; a[i] = r < R ? I * Math.pow(1 - r / R, 1.8) : 0; }
        if (take === 'B') { const R = 10 + 5 * ph; a[i] = r < R ? (0.6 + 0.3 * ph) * Math.pow(1 - r / R, 1.6) : 0; hot[i] = r <= 1.5 ? 0.7 + 0.25 * ph : r <= 2.5 ? 0.25 + 0.1 * ph : 0; }
        if (take === 'C') { const R = 8 + 4 * ph; a[i] = r < R ? (0.55 + 0.3 * ph) * Math.pow(1 - r / R, 2) : 0; }
      }
      return { a, hot };
    }
    const start = performance.now();
    let last = 0;
    function frame(now) {
      requestAnimationFrame(frame);
      if (now - last < 33) return; last = now;
      const s = (now - start) / 1000, ph = (1 - Math.cos(2 * Math.PI * s / 4)) / 2;   // a 4 s breath, ease-in-out, never off
      const L = { today: lut('today', ph), A: lut('A', ph), B: lut('B', ph), C: lut('C', ph) };
      for (const cell of cells) {
        const { a, hot } = L[cell.t], px = cell.img.data;
        const base = cell.t === 'C' ? mix(`#${cell.c.map((v) => v.toString(16).padStart(2, '0')).join('')}`, [255, 176, 96], 0.3) : cell.c;
        const white = mix(`#${cell.c.map((v) => v.toString(16).padStart(2, '0')).join('')}`, [255, 250, 235], 0.7);
        for (let i = 0; i < W * W; i++) {
          const dist = d[i]; const j = i * 4;
          if (dist === 0 || dist >= (LUTN - 1) * STEP) { px[j + 3] = 0; continue; }
          const q = Math.round(dist / STEP), al = a[q], ht = hot[q];
          if (ht > 0) { const t2 = ht + al * (1 - ht); px[j] = (white[0] * ht + base[0] * al * (1 - ht)) / t2; px[j + 1] = (white[1] * ht + base[1] * al * (1 - ht)) / t2; px[j + 2] = (white[2] * ht + base[2] * al * (1 - ht)) / t2; px[j + 3] = t2 * 255; }
          else { px[j] = base[0]; px[j + 1] = base[1]; px[j + 2] = base[2]; px[j + 3] = al * 255; }
        }
        const g = cell.g; g.clearRect(0, 0, BW, BH);
        g.save(); g.translate(-BX, -BY);
        tg.putImageData(cell.img, 0, 0); g.drawImage(tmp, 0, 0);
        g.drawImage(sprite, PAD, PAD);
        if (cell.t === 'C') for (const m of motes) {
          const k = ((s + m.off) % m.life) / m.life, al = Math.sin(Math.PI * k);
          const x = Math.round(m.s[0] + Math.sin(m.sway + s * 0.8) * 2), y = Math.round(m.s[1] - k * m.rise);
          const mc = mix(`#${cell.c.map((v) => v.toString(16).padStart(2, '0')).join('')}`, [255, 240, 210], 0.55);
          g.fillStyle = `rgba(${mc.join(',')},${0.28 * al})`; g.fillRect(x - 1, y - 1, 4, 4);
          g.fillStyle = `rgba(${mc.join(',')},${0.95 * al})`; g.fillRect(x, y, 2, 2);
        }
        g.restore();
      }
    }
    requestAnimationFrame(frame);
  };
}

// ---------------------------------------------------------------- section 4: contrast ratios, worked out on the page
const lum = (hex) => { const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const PARCH = '#efd9a6', WOOD = '#3e2816', PLUM = '#45295f';   // the darkest parchment, the wood's lightest 5 percent, his paper
for (const el of document.querySelectorAll('[data-ratio]')) {
  const [fg, bgName, large] = el.dataset.ratio.split(','), bg = { p: PARCH, w: WOOD, u: PLUM }[bgName] || bgName;
  const r = ratio(fg, bg), need = large === 'L' ? 3 : 4.5;
  el.textContent = `${r.toFixed(1)} : 1 ${r >= need ? (r >= 7 ? 'AAA' : 'AA') : 'FAIL'}`;
  el.className = 'r ' + (r >= need ? 'ok' : 'bad');
}

// ---------------------------------------------------------------- close-ups and callouts (v2 presentation)
// Close-up: the option's card is cloned into the window at a whole-number zoom (text re-laid out, pixel art stays
// crisp), centred on the element marked data-zoom (data-zx / data-zy pick the spot inside it, 0..1).
function buildZooms() {
  for (const zb of document.querySelectorAll('.zbox[data-z]')) {
    zb.querySelectorAll('.pos').forEach((e) => e.remove());
    const grid = zb.closest('.ogrid'), t = grid && grid.querySelector('[data-zoom]'); if (!t) continue;
    const card = t.closest('.card'), cr = card.getBoundingClientRect(), s = cr.width / 300;
    const tr = t.getBoundingClientRect(), fx = t.dataset.zx ? +t.dataset.zx : 0.5, fy = t.dataset.zy ? +t.dataset.zy : 0.5;
    const cx = (tr.left + tr.width * fx - cr.left) / s, cy = (tr.top + tr.height * fy - cr.top) / s;
    const Z = +zb.dataset.z, clone = card.cloneNode(true);
    clone.querySelectorAll('[data-call],[data-zoom]').forEach((e) => { e.removeAttribute('data-call'); e.removeAttribute('data-zoom'); });
    Object.assign(clone.style, { zoom: Z, margin: 0, width: '300px' });
    const pos = Object.assign(document.createElement('div'), { className: 'pos' }); pos.append(clone); zb.append(pos);
    pos.style.left = Math.round(zb.clientWidth / 2 - cx * Z) + 'px'; pos.style.top = Math.round(zb.clientHeight / 2 - cy * Z) + 'px';
  }
}
// Callouts: every [data-call="Label|small line"] in a [data-callouts] grid gets a white label in that grid's lane.
// Option rows: a white arrow (cased in near-black, so it shows on parchment and on dark) to the thing's near edge.
// Paired bubbles: nothing is drawn over the words. A word or a tab gets an underline whose leader runs in the gap under
// its line out to the card edge; a block gets a bracket just outside the card's right edge. Labels sit level with what
// they name, pushed apart only as much as needed, and the stack is centred on the things it names.
const SVGNS = 'http://www.w3.org/2000/svg';
function layoutCallouts() {
  document.querySelectorAll('.callout, svg.arrows').forEach((e) => e.remove());
  for (const grid of document.querySelectorAll('[data-callouts]')) {
    const lane = grid.querySelector(':scope > .lane'); if (!lane) continue;
    grid.style.minHeight = '';
    const pair = grid.classList.contains('pair');
    const G = grid.getBoundingClientRect(), Ln = lane.getBoundingClientRect();
    const items = [...grid.querySelectorAll('[data-call]')].filter((el) => !el.closest('.zbox'))
      .map((el) => {
        const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
        const it = { el, rl: r.left - G.left, rr: r.right - G.left, rt: r.top - G.top, rb: r.bottom - G.top, w: r.width + r.height };
        it.inline = pair && (cs.display.startsWith('inline') || cs.position === 'absolute');
        it.ty = it.inline ? it.rb + 2.5 : (it.rt + it.rb) / 2;
        return it;
      }).filter((i) => i.w).sort((a, b) => a.ty - b.ty);
    for (const it of items) {
      const [main, sub] = it.el.dataset.call.split('|');
      it.lab = Object.assign(document.createElement('div'), { className: 'callout', innerHTML: main + (sub ? `<small>${pair ? '· ' : ''}${sub}</small>` : '') });
      grid.append(it.lab); it.lw = it.lab.offsetWidth; it.lh = it.lab.offsetHeight;
    }
    // stack: level with the target where possible, never overlapping; then slide the whole stack to centre on its targets
    let floor = -1e9;
    for (const it of items) { it.top = Math.max(it.ty - it.lh / 2, floor); floor = it.top + it.lh + 8; }
    if (items.length > 1) {
      const want = items.reduce((t, i) => t + i.ty - i.lh / 2, 0) / items.length, got = items.reduce((t, i) => t + i.top, 0) / items.length;
      const shift = Math.max(want - got, -items[0].top);   // never above the grid's top
      for (const it of items) it.top += shift;
    }
    let bottom = G.height;
    const svg = document.createElementNS(SVGNS, 'svg'); svg.classList.add('arrows');
    for (const it of items) {
      const { lab, lw, lh, rl, rr, rt, rb, ty, top } = it;
      const leftLane = Ln.left + Ln.width / 2 - G.left < (rl + rr) / 2;   // lane left of the thing: point right
      const lx = leftLane ? Ln.right - G.left - lw : Ln.left - G.left;
      lab.style.left = lx + 'px'; lab.style.top = top + 'px'; bottom = Math.max(bottom, top + lh + 4);
      const shapes = [], y0 = top + lh / 2;
      if (pair) {
        const cardR = it.el.closest('.card').getBoundingClientRect().right - G.left, x0 = lx - 2;
        if (it.inline) shapes.push([`M${x0},${y0} L${cardR + 16},${ty} L${rr + 1},${ty} L${rl - 1},${ty}`, false]);
        else { const bx = cardR + 9; shapes.push([`M${bx - 5},${rt + 2} L${bx},${rt + 2} L${bx},${rb - 2} L${bx - 5},${rb - 2}`, false], [`M${x0},${y0} L${bx + 10},${ty} L${bx},${ty}`, false]); }
      } else {
        const x0 = leftLane ? lx + lw + 2 : lx - 2, x1 = leftLane ? rl - 3 : rr + 3, y1 = ty;
        const ang = Math.atan2(y1 - y0, x1 - x0), A = 12, hw = 0.5;
        shapes.push([`M${x0},${y0} L${x1 - 6 * Math.cos(ang)},${y1 - 6 * Math.sin(ang)}`, false],
          [`M${x1},${y1} L${x1 - A * Math.cos(ang - hw)},${y1 - A * Math.sin(ang - hw)} L${x1 - A * Math.cos(ang + hw)},${y1 - A * Math.sin(ang + hw)} Z`, true]);
      }
      for (const [d, fill] of shapes) {
        for (const [col, wd] of [['#120A05', 5.5], ['#fffaf0', 2.5]]) {
          const p = document.createElementNS(SVGNS, 'path'); p.setAttribute('d', d);
          p.setAttribute('stroke', col); p.setAttribute('stroke-width', fill ? wd - 1.5 : wd); p.setAttribute('stroke-linejoin', 'round'); p.setAttribute('stroke-linecap', 'round');
          p.setAttribute('fill', fill ? col : 'none'); svg.append(p);
        }
      }
    }
    if (bottom > G.height) grid.style.minHeight = Math.ceil(bottom) + 'px';   // the row grows to hold its labels
    svg.setAttribute('width', G.width); svg.setAttribute('height', Math.max(bottom, G.height)); grid.append(svg);
  }
}
function relayout() { try { buildZooms(); layoutCallouts(); } catch (e) { console.error('relayout', e && e.stack || e); } }
window.addEventListener('load', () => (document.fonts ? document.fonts.ready : Promise.resolve()).then(relayout));
window.addEventListener('resize', relayout);

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
for (const list of document.querySelectorAll('.opts')) {
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

// ---------------------------------------------------------------- section 2: the gloves
const gHost = document.getElementById('gloves');
if (gHost) for (const [k, gl] of Object.entries(GLOVES)) {
  const cell = document.createElement('div'); cell.className = 'gcell' + (k === 'g1' ? ' mine' : '');
  cell.innerHTML = `<div class="nm2">${gl.name}</div><div class="sz">${gl.size}</div>`;
  const big = document.createElement('div'); big.className = 'big';
  big.append(pixCanvas(gl.map, gl.pal, 1), pixCanvas(gl.map, gl.pal, 2));
  if (k !== 'today') big.append(pixCanvas(gl.map, gl.pal, 4));
  big.append(pixCanvas(gl.map, gl.pal, k === 'today' ? 6 : 8));
  if (k === 'today') {   // what the bubble really does today: 12 x 9 stretched to 26 x 20
    const smear = document.createElement('canvas'); smear.width = 26; smear.height = 20;
    const g = smear.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(pixCanvas(gl.map, gl.pal, 1), 0, 0, 26, 20);
    const s4 = document.createElement('canvas'); s4.width = 104; s4.height = 80;
    const g4 = s4.getContext('2d'); g4.imageSmoothingEnabled = false; g4.drawImage(smear, 0, 0, 104, 80);
    s4.title = 'as the bubble draws it (26 x 20), magnified';
    big.append(s4);
  }
  cell.append(big);
  const lab = document.createElement('div'); lab.className = 'why';
  lab.innerHTML = k === 'today' ? '1×, 2×, 6×, and <b>as the bubble draws it</b> (26 × 20, magnified 4×): uneven pixels.' : '1×, 2× (what the bubble would use), 4×, 8×.';
  cell.append(lab);
  const ctx = document.createElement('div'); ctx.className = 'ctx';
  const url = k === 'today' ? null : pixCanvas(gl.map, gl.pal, 2).toDataURL();
  const w = gl.map[0].length * 2, h = gl.map.length * 2;
  ctx.innerHTML = `<div class="card k-q" style="padding:8px 8px 6px"><div class="opts vB" style="margin:0 -2px">
    <div class="opt on" style="${url ? `--glove:url(${url})` : ''}"><span class="tx"><b>Full-screen map<span class="rec">BEST</span></b></span></div>
    <div class="opt"><span class="tx"><b>Split: map and list</b></span></div></div></div>`;
  const on = ctx.querySelector('.opt.on');
  if (k === 'today') { on.style.setProperty('--glove', `url(${new URL('../../src/Shell/pages/art/browser/hand.png', location.href).href})`); on.classList.add('todayglove'); }
  else { const st = document.createElement('style'); st.textContent = `#gl-${k} .opt.on::before{width:${w}px;height:${h}px;background-size:${w}px ${h}px;left:${-4 - w}px;top:${(36 - h) / 2}px}`; document.head.append(st); }
  ctx.id = 'gl-' + k;
  cell.append(ctx);
  gHost.append(cell);
}
{ const st = document.createElement('style'); st.textContent = '.todayglove::before{width:26px!important;height:20px!important;background-size:26px 20px!important;left:-30px!important;top:8px!important}'; document.head.append(st); }

// ---------------------------------------------------------------- section 3: the aura
// One distance field from his silhouette (how far each pixel is from his nearest pixel), worked out once. Every take
// is then just "alpha as a function of distance", which is exactly what the pet gets by stamping N silhouette rings
// with falling alpha and caching them per frame size.
const AURA = document.getElementById('aura');
const COLS = [
  { k: 'needs', name: 'NEEDS YOU', c: '#7cc4ff', sub: 'permission, blocking' },
  { k: 'question', name: 'QUESTION', c: '#b07cff', sub: 'Claude asks' },
  { k: 'complete', name: 'JOB COMPLETE', c: '#3fc4b4', sub: 'all done' },
  { k: 'warm', name: 'WARM', c: '#ffb35a', sub: 'Aang\'s own news, ambient' },
];
const TAKES = [
  { k: 'today', name: 'TODAY', sub: 'a hard 3 px ring, alpha 95→185 on a 4 s sine, plus a faint 6 px ring' },
  { k: 'B', name: 'B · WARM BLOOM', sub: 'white-hot 1 px rim, soft coloured haze 10→15 px' },
  { k: 'A', name: 'A · SOFT FALLOFF', sub: 'no edge at all: alpha fades with distance, 8→12 px' },
  { k: 'C', name: 'C · EMBER', sub: 'warm haze, plus slow light motes drifting up' },
];
const PAD = 22, SW = 224;
if (AURA) {
  AURA.append(Object.assign(document.createElement('div')));
  for (const t of TAKES) AURA.append(Object.assign(document.createElement('div'), { className: 'colh', innerHTML: `${t.name}<small>${t.sub}</small>` }));
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
      AURA.append(Object.assign(document.createElement('div'), { className: 'rowh', innerHTML: `<span class="sw" style="background:${col.c}"></span>${col.name}<small>${col.c} · ${col.sub}</small>` }));
      for (const t of TAKES) {
        const cv = Object.assign(document.createElement('canvas'), { width: BW, height: BH });
        cv.style.width = BW * 2 + 'px'; cv.style.height = BH * 2 + 'px';
        AURA.append(cv); cells.push({ cv, g: cv.getContext('2d'), t: t.k, c: mix(col.c, [0, 0, 0], 0), img: new ImageData(W, W) });
      }
    }
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

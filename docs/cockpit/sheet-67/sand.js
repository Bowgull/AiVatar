// Sheet 67 (2026-10-22): the proposed sand engine for the timer, running live in the mockup so the motion is real and
// can be measured. Mockup code, not product code: the product would lift this file into src/Shell/pages/.
//
// The rules (docs/TIMER-RESEARCH.md):
//  - Time is exact and comes from outside (the brain's end time). The sand never keeps time; it SHOWS it. How many
//    grains have landed is always floor(elapsed / total * N), so the last grain lands on 0:00 exactly.
//  - Sheet 17's hand-drawn hourglass, unchanged. Each grain is one art pixel; grains tumble by the falling-sand rule
//    (down, else diagonally down, sides in a seeded random order) on the glass's own 15 x 25 grid.
//  - Paints only when a pixel changes. A tiny canvas (putImageData), never DOM rebuilt per frame. 10 frames a second
//    while something moves (the stream, a falling or tumbling grain); asleep between grain events when calm.
//  - Hidden (minimised, covered, screen locked) = no timers at all. Coming back, it jumps straight to the right picture.
//  - Calm (a game in front, or reduced motion): the stream stands still; grains still drop, once per grain.

// ---- sheet 17's hourglass, one character per pixel (approved 2026-10-12) ----
const GLASS = [
  'ooooooooooooooo',
  'oWWWWWWWWWWWWWo',
  'owwwwwwwwwwwwwo',
  'odddddddddddddo',
  'ooooooooooooooo',
  '.po.........op.',
  '.po.........op.',
  '.po.........op.',
  '.pgo.......ogp.',
  '.p.go.....og.p.',
  '.p..go...og..p.',
  '.p...go.og...p.',
  '.p....gog....p.',
  '.p...go.og...p.',
  '.p..go...og..p.',
  '.p.go.....og.p.',
  '.pgo.......ogp.',
  '.po.........op.',
  '.po.........op.',
  '.po.........op.',
  'ooooooooooooooo',
  'oWWWWWWWWWWWWWo',
  'owwwwwwwwwwwwwo',
  'odddddddddddddo',
  'ooooooooooooooo'];
const ART = { o: '#120A05', W: '#C68A4A', w: '#8E5A2E', d: '#5E3A1C', p: '#7A4A24', g: '#9fd0e0' };
export const GW = 15, GH = 25;
const NECK_X = 7, NECK_Y = 12;

// Sand ramps, 4 shades each, light to deep (Stardew-sized). One colour per timer, so two timers read apart.
export const RAMPS = {
  gold: ['#FFE9A8', '#F2C14E', '#E0A43A', '#B47A26'],
  sea:  ['#C9F4EC', '#7FD6C8', '#4FB3A6', '#2F7F76'],
  plum: ['#EBD3FF', '#C59BF0', '#9C6FD0', '#6B479C'],
};
const GLINT = '#FFF6D8';

// Inside cells: 1 = top bulb, 2 = bottom bulb. Worked out from the art like sheet 17's draw().
const ZONE = new Int8Array(GW * GH);
for (let y = 5; y <= 19; y++) {
  if (y === NECK_Y) continue;
  const row = GLASS[y], walls = [];
  for (let x = 2; x < GW - 2; x++) if (row[x] === 'o' || row[x] === 'g') walls.push(x);
  if (walls.length < 2) continue;
  for (let x = walls[0] + 1; x < walls[walls.length - 1]; x++) if (row[x] === '.') ZONE[y * GW + x] = y < NECK_Y ? 1 : 2;
}
export const N = ZONE.reduce((n, z) => n + (z === 1 ? 1 : 0), 0);   // 43 grains: the top bulb, full

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const BASE = GLASS.map((r) => [...r].map((c) => (ART[c] ? hex(ART[c]) : null)));
const GLASSBACK = [190, 225, 240, 46];   // the faint blue of the empty glass, as sheet 17 has it

function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export class SandGlass {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{ scale?: number, ramp?: keyof RAMPS, seed?: number, clock?: { now(): number }, fps?: number, onEnd?: () => void }} o
   */
  constructor(canvas, o = {}) {
    this.c = canvas; this.scale = o.scale ?? 2; this.ramp = (RAMPS[o.ramp ?? 'gold'] ?? RAMPS.gold).map(hex);
    this.seed = o.seed ?? 1; this.clock = o.clock ?? { now: () => Date.now() }; this.frameMs = 1000 / (o.fps ?? 10);
    this.onEnd = o.onEnd ?? null;
    this.stats = { paints: 0, wakes: 0, steps: 0 };
    this.t = null;            // { total, end, paused }  (paused = ms left while paused, 0 when running)
    this.calmOn = false; this.tipped = false; this.phase = 0; this.ended = false; this.glint = 0;
    this.timer = 0; this.hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
    this.onVis = () => { this.hidden = document.visibilityState === 'hidden'; if (this.hidden) this.sleep(); else this.resync(); };
    document.addEventListener('visibilitychange', this.onVis);
    this.fit();
    this.reset(0);
  }

  // ------------------------------------------------------------------ outside world
  /** The brain's timer. Re-sent on every change (+1, pause, resume); the picture follows. */
  set(t) {
    const old = this.t; this.t = t ? { ...t } : null;
    if (!old || !t || Math.abs(this.targetLanded() - this.landed - this.flying.length) > 6) this.resync();
    else this.wake();
  }
  calm(on) { this.calmOn = !!on; this.dirty = true; this.wake(); }
  /** Paused like a real hourglass: laid on its side. The sand slides over in each bulb. */
  tip(on) { if (this.tipped === !!on) return; this.tipped = !!on; this.fit(); this.dirty = true; this.wake(); }
  /** Again: turn it over. Laid on its side for a moment, then upside down, so the pile becomes the top and falls. */
  flip(done) {
    this.sleep(); this.tipped = true; this.fit(); this.dirty = true; this.paint();
    setTimeout(() => {
      const c = new Uint8Array(this.cells.length);
      for (let i = 0; i < c.length; i++) c[c.length - 1 - i] = this.cells[i];   // the glass is symmetric both ways
      for (let i = 0; i < c.length; i++) if (!ZONE[i]) c[i] = 0;
      for (let i = 0; i < c.length; i++) if (ZONE[i] === 2 && c[i]) { c[i] = 0; }   // any stragglers
      let n = 0; for (let i = 0; i < c.length; i++) if (ZONE[i] === 1 && c[i]) n++;
      for (; n < N; n++) { for (let i = 0; i < c.length; i++) if (ZONE[i] === 1 && !c[i]) { c[i] = this.shade(); break; } }
      this.cells = c; this.released = 0; this.landed = 0; this.flying = []; this.ended = false; this.glint = 0;
      this.tipped = false; this.fit(); this.dirty = true; this.wake(); done?.();
    }, 180);
  }
  destroy() { this.sleep(); document.removeEventListener('visibilitychange', this.onVis); }

  /** Ms left, exact. */
  left() { if (!this.t) return 0; return this.t.paused ? this.t.paused : Math.max(0, this.t.end - this.clock.now()); }
  running() { return !!this.t && !this.t.paused && this.left() > 0; }
  targetLanded() { if (!this.t || !this.t.total) return 0; const f = 1 - this.left() / this.t.total; return Math.max(0, Math.min(N, Math.floor(f * N + 1e-9))); }
  /** A grain leaves the neck FALL ms before it is due to land, so it lands on time. */
  targetReleased() { if (!this.t || !this.t.total) return 0; const f = 1 - Math.max(0, this.left() - this.fallMs()) / this.t.total; return Math.max(0, Math.min(N, Math.floor(f * N + 1e-9))); }
  /** How long the fall from the neck to the pile takes (1 row, then 2 a frame), so the grain lands on its moment. */
  fallMs() { const d = this.floorBelow() - NECK_Y; return (1 + Math.ceil(Math.max(0, d - 1) / 2)) * this.frameMs; }

  // ------------------------------------------------------------------ the grid
  reset(released) {
    this.cells = new Uint8Array(GW * GH);   // 0 empty, 1..4 a grain's shade
    this.rand = mulberry(this.seed);
    this.flying = []; this.released = 0; this.landed = 0; this.ended = false;
    // the top bulb, full and settled, shades scattered
    for (let i = 0; i < this.cells.length; i++) if (ZONE[i] === 1) this.cells[i] = this.shade();
    // fast-forward: release and land `released` grains with no painting, so the same timer always looks the same
    for (let k = 0; k < released; k++) { this.release(true); }
    this.settleAll();
    this.dirty = true;
  }
  shade() { const r = this.rand(); return r < 0.14 ? 1 : r < 0.6 ? 2 : r < 0.9 ? 3 : 4; }
  resync() { this.reset(this.targetLanded()); this.paint(); this.wake(); }

  /** Take the grain at the bottom of the top bulb (nearest the neck) and drop it through. */
  release(instant) {
    let best = -1, bd = 1e9;
    for (let i = 0; i < this.cells.length; i++) if (ZONE[i] === 1 && this.cells[i]) { const x = i % GW, y = (i / GW) | 0; const d = (NECK_Y - y) * 4 + Math.abs(x - NECK_X); if (d < bd) { bd = d; best = i; } }
    if (best < 0) return;
    const s = this.cells[best]; this.cells[best] = 0; this.released++;
    if (instant) { this.land(NECK_X, this.floorBelow(), s); this.settleAll(); }
    else this.flying.push({ y: NECK_Y, v: 1, s, up: false });
  }
  /** +1 minute: a grain goes back up the stream into the top bulb. */
  unrelease(instant) {
    let best = -1, by = 99;
    for (let y = 13; y <= 19; y++) for (let x = 0; x < GW; x++) { const i = y * GW + x; if (ZONE[i] === 2 && this.cells[i] && (y < by || (y === by && Math.abs(x - NECK_X) < Math.abs((best % GW) - NECK_X)))) { by = y; best = i; } }
    if (best < 0) return;
    const s = this.cells[best]; this.cells[best] = 0; this.landed = Math.max(0, this.landed - 1); this.released = Math.max(0, this.released - 1);
    if (instant) { this.putTop(s); this.settleAll(); } else this.flying.push({ y: (best / GW) | 0, v: -1, s, up: true });
  }
  putTop(s) { for (let y = 5; y < NECK_Y; y++) for (const dx of [0, -1, 1, -2, 2, -3, 3, -4, 4]) { const i = y * GW + NECK_X + dx; if (ZONE[i] === 1 && !this.cells[i]) { this.cells[i] = s; return; } } }
  floorBelow() { let y = NECK_Y + 1; while (y + 1 <= 19 && ZONE[(y + 1) * GW + NECK_X] === 2 && !this.cells[(y + 1) * GW + NECK_X]) y++; return y; }
  land(x, y, s) { const i = y * GW + x; if (ZONE[i] === 2 && !this.cells[i]) this.cells[i] = s; else this.putBottomNear(s); this.landed++; }
  putBottomNear(s) { for (let y = 19; y >= 13; y--) for (const dx of [0, -1, 1, -2, 2, -3, 3, -4, 4, -5, 5]) { const i = y * GW + NECK_X + dx; if (ZONE[i] === 2 && !this.cells[i]) { this.cells[i] = s; return; } } }

  /** One falling-sand step. Gravity is down on the screen: grid +y upright, grid +x when laid on its side. */
  step() {
    const [gx, gy] = this.tipped ? [1, 0] : [0, 1];
    const px = gy, py = gx;   // across gravity
    let moved = 0;
    const flip = this.rand() < 0.5;
    // scan from the side gravity pulls toward, so a grain moves at most one cell per step
    const xs = [], ys = [];
    for (let x = 0; x < GW; x++) xs.push(gx > 0 ? GW - 1 - x : x);
    for (let y = 0; y < GH; y++) ys.push(gy > 0 ? GH - 1 - y : y);
    const free = (i, z) => i >= 0 && i < this.cells.length && ZONE[i] === z && !this.cells[i];
    for (const y of ys) for (const x0 of xs) {
      const x = flip && !gx ? GW - 1 - x0 : x0;
      const i = y * GW + x, s = this.cells[i];
      if (!s) continue;
      const z = ZONE[i];
      const d = (y + gy) * GW + x + gx;
      if (free(d, z)) { this.cells[d] = s; this.cells[i] = 0; moved++; continue; }
      const a = (y + gy + py) * GW + x + gx + px, b = (y + gy - py) * GW + x + gx - px;
      const [p, q] = this.rand() < 0.5 ? [a, b] : [b, a];
      if (free(p, z)) { this.cells[p] = s; this.cells[i] = 0; moved++; }
      else if (free(q, z)) { this.cells[q] = s; this.cells[i] = 0; moved++; }
    }
    this.stats.steps++;
    return moved;
  }
  settleAll() { for (let k = 0; k < 60 && this.step(); k++); }

  // ------------------------------------------------------------------ the loop
  sleep() { clearTimeout(this.timer); this.timer = 0; }
  wake() { if (this.hidden) return; this.sleep(); this.timer = setTimeout(() => this.frame(), 0); }
  frame() {
    this.timer = 0; this.stats.wakes++;
    let busy = false;
    if (this.t && !this.tipped) {
      // grains due to leave (several at once for a short timer, or after +/-)
      const want = this.running() ? this.targetReleased() : this.released;
      let n = 0;
      while (this.released < want && n++ < 3) this.release(false);
      while (this.released > want && this.landed > 0 && n++ < 3) this.unrelease(false);
      if (this.released < want || (this.released > want && this.landed > 0)) busy = true;
    }
    // falling grains: speed 1, then 2 cells a frame
    for (const g of this.flying) {
      if (g.up) { g.y--; if (g.y <= NECK_Y) { g.done = true; this.putTop(g.s); } continue; }
      g.y += g.v; g.v = Math.min(2, g.v + 1);
      const fl = this.floorBelow();
      if (g.y >= fl) { g.done = true; this.land(NECK_X, fl, g.s); }
    }
    if (this.flying.length) { this.flying = this.flying.filter((g) => !g.done); this.dirty = true; busy = true; }
    if (this.step()) { this.dirty = true; busy = true; }
    const streaming = this.streaming();
    if (streaming && !this.calmOn) { this.phase++; this.dirty = true; busy = true; }
    // the end: the last grain has landed
    if (this.t && !this.ended && this.left() <= 0 && this.landed >= N && !this.flying.length) { this.ended = true; this.glint = 12; this.onEnd?.(); }
    if (this.glint > 0) { this.glint--; this.dirty = true; busy = true; }
    if (this.dirty) this.paint();
    if (this.hidden) return;
    // next wake: a frame if anything moves, else the moment the next grain is due to leave (or never)
    let next = busy ? this.frameMs : Infinity;
    if (!busy && this.running() && this.released < N) {
      const per = this.t.total / N, k = this.released + 1;
      const leaveAt = this.t.end - this.t.total + k * per - this.fallMs();
      next = Math.max(this.frameMs, (leaveAt - this.clock.now()) / (this.clock.rate ?? 1) + 2);
    }
    if (next !== Infinity) this.timer = setTimeout(() => this.frame(), next);
  }
  streaming() { return this.running() && !this.tipped && this.released < N; }

  // ------------------------------------------------------------------ painting
  fit() {
    const dpr = (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1;
    const k = Math.max(1, Math.round(this.scale * dpr));   // whole device pixels per art pixel, always
    const w = this.tipped ? GH : GW, h = this.tipped ? GW : GH;
    this.k = k; this.c.width = w * k; this.c.height = h * k;
    this.c.style.width = (w * k) / dpr + 'px'; this.c.style.height = (h * k) / dpr + 'px';
    this.ctx = this.c.getContext('2d', { alpha: true });
    this.img = this.ctx.createImageData(this.c.width, this.c.height);
  }
  paint() {
    this.dirty = false; this.stats.paints++;
    const k = this.k, W = this.c.width, d = this.img.data;
    const put = (x, y, rgb, a = 255) => {
      // grid -> screen: laid on its side = turned a quarter clockwise
      const sx = this.tipped ? GH - 1 - y : x, sy = this.tipped ? x : y;
      for (let j = 0; j < k; j++) { let o = ((sy * k + j) * W + sx * k) * 4; for (let i = 0; i < k; i++, o += 4) { d[o] = rgb[0]; d[o + 1] = rgb[1]; d[o + 2] = rgb[2]; d[o + 3] = a; } }
    };
    d.fill(0);
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      const i = y * GW + x;
      if (ZONE[i]) {
        const s = this.cells[i];
        if (s) {
          // a grain with open glass above it catches the light: one shade lighter
          const up = this.tipped ? i - 1 : i - GW;
          const lit = !this.cells[up] && ZONE[up] === ZONE[i];
          put(x, y, this.ramp[Math.max(0, s - 1 - (lit ? 1 : 0))]);
        } else put(x, y, GLASSBACK.slice(0, 3), GLASSBACK[3]);
      } else if (BASE[y][x]) put(x, y, BASE[y][x]);
    }
    // the stream: colour cycling down the neck column, still when calm
    if (this.streaming()) {
      const fl = this.floorBelow();
      for (let y = NECK_Y; y <= fl; y++) { const c = [0, 1, 2, 1][(y - this.phase + 400) % 4]; put(NECK_X, y, this.ramp[c]); }
    }
    for (const g of this.flying) put(NECK_X, Math.max(5, Math.min(19, g.y)), this.ramp[Math.max(0, g.s - 2)]);
    // the end: a glint runs over the settled pile, then it is still
    if (this.glint > 0) {
      // a diagonal band of light crossing the pile's surface, left to right, once
      const k = 12 - this.glint;
      for (let y = 13; y <= 19; y++) for (let x = 0; x < GW; x++) {
        const i = y * GW + x, d = x - (y - 13) - k + 2;
        if (ZONE[i] === 2 && this.cells[i] && (d === 0 || d === 1)) put(x, y, d === 0 ? hex(GLINT) : this.ramp[0]);
      }
    }
    // glass shine, as sheet 17
    const shine = [[3, 6, 140], [3, 7, 140], [3, 17, 100], [3, 18, 100]];
    for (const [x, y, a] of shine) put(x, y, [255, 255, 255], a);
    this.ctx.putImageData(this.img, 0, 0);
  }
}

/** One clock line per second, on the second (not every 200 ms). Returns a stop function. */
export function secondly(fn, clock = { now: () => Date.now() }, endOf = () => 0) {
  let t = 0, stopped = false;
  const tick = () => {
    if (stopped) return;
    fn();
    // the next whole second of time LEFT, so 12:40 turns to 12:39 exactly when it should
    const end = endOf(), now = clock.now();
    const ms = end ? ((end - now) % 1000 + 1000) % 1000 || 1000 : 1000 - (now % 1000);
    t = setTimeout(tick, ms / (clock.rate ?? 1) + 4);
  };
  tick();
  const vis = () => { if (document.visibilityState === 'hidden') clearTimeout(t); else { clearTimeout(t); tick(); } };
  document.addEventListener('visibilitychange', vis);
  return () => { stopped = true; clearTimeout(t); document.removeEventListener('visibilitychange', vis); };
}

export const fmt = (ms) => {
  ms = Math.max(0, Math.ceil(ms / 1000) * 1000);
  const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
};

// Sheet 101 (2026-10-28): Aang himself on the Mac, the part the C# pet (src/Body) plays on the PC. This page only draws
// and reports: his real frames at their real size (Anim.cs timings), the Claude marks from the pet's own pixel maps
// (ClaudeMarks.cs, verbatim), and what the mouse does on him. Where he is, how much of him shows and when he slides is
// decided by the main process (macaang.ts), which places the window.
//
// The window is MARK above, then his whole frame. Only the top `show` pixels of his art are drawn: the rest of him is
// below the screen's edge, or behind the Dock when it is up (his pick: he rides on top of it).

const MARK = 60;                 // room for a mark: the tallest (16 rows at 3 px) + the 9 px gap + its shadow
const ART_TOP = 78, ART_X = 88, ART_W = 50;
const cv = document.getElementById('pet');
const g = cv.getContext('2d');
g.imageSmoothingEnabled = false;

// Anim.cs: frames a second, and whether it loops.
const SPEC = { idle: [6, true], talk: [10, true], think: [8, true], nap: [3, true], walk: [8, true], scooter: [10, true], look: [10, false], hello: [10, false], spin: [12, false], zip: [12, false] };
const frames = {};               // state -> [ImageBitmap]
let state = 'idle', frame = 0, due = 0, rest = 'idle';
let show = 34, mark = null, flash = null, flashUntil = 0;

// ClaudeMarks.cs, verbatim (O outline, H light, F face, S shade).
const SHAPES = {
  working: ['..OOOOOOOOO..', '.OHHHHHFFFSO.', 'OHFFFFFFFFFSO', 'OHFOFFOFFOFSO', 'OHFFFFFFFFFSO', '.OFFFFFFFFSO.', '..OOOFSOOOO..', '....OSO......', '....OO.......'],
  permission: ['.OOOOO..........', 'OHHHFSO.........', 'OHO.OFSOOOOOOOO.', 'OHO.OFFHHHHHHFSO', 'OFO.OFSSSSSSSSSO', 'OFFFFSOOOOOOSOSO', '.OSSSO.....OSOSO', '..OOO......OOOOO'],
  question: ['...OOOOO...', '..OHHHFFO..', '.OHFFFFFSO.', '.OHFOOOFSO.', '.OOO..OFSO.', '......OFSO.', '.....OFFSO.', '....OFFSO..', '....OFSO...', '....OFSO...', '....OOOO...', '...........', '....OOOO...', '....OHSO...', '....OSSO...', '....OOOO...'],
  plan: ['.OOOOOOOOOO.', 'OHHHHHHHFFSO', 'OSSSSSSSSSSO', '.OFFFFFFFSO.', '.OFOOOOFFSO.', '.OFFFFFFFSO.', '.OFOOOOOFSO.', '.OFFFFFFFSO.', 'OHHHHHHHFFSO', 'OSSSSSSSSSSO', '.OOOOOOOOOO.'],
  paused: ['OOOOOOOOO', 'OHHHHFFSO', '.OHFFFSO.', '..OHFSO..', '...OSO...', '..OF.SO..', '.OF...SO.', 'OHFFFFFSO', 'OOOOOOOOO'],
  step: ['........OOO', '.......OHHO', '......OHFSO', '.OOO.OHFSO.', 'OHHOOHFSO..', 'OFHHHFSO...', '.OFFFSO....', '..OSSO.....', '...OO......'],
  complete: ['..........OOO', '.........OHHO', '........OHHFO', '.......OHHFSO', '.OOO..OHHFSO.', 'OHHHOOHHFSO..', 'OFHHHHHFSO...', '.OFFHHFSO....', '..OFFFSO.....', '...OSSO......', '....OO.......'],
  failed: ['..OOOOOOO..', '.OHHHHFFFO.', 'OHHFFFFFFSO', 'OHOOFFFOOSO', 'OFOOFFFOOSO', 'OFFFFOFFFSO', '.OFFFFFFSO.', '..OFOFOFO..', '..OOOOOOO..'],
};
SHAPES.done = SHAPES.complete;
const COLOR = { working: '#f0a64a', permission: '#7cc4ff', question: '#b07cff', plan: '#f3e2b8', step: '#ffc8a8', complete: '#3fc4b4', done: '#3fc4b4', paused: '#6f7787', failed: '#e8443a' };
const mix = (h, t, k) => { const a = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); return 'rgb(' + a.map((v, i) => Math.round(v + (t[i] - v) * k)).join(',') + ')'; };
const markArt = {};
function markOf(kind) {
  if (markArt[kind]) return markArt[kind];
  const map = SHAPES[kind], F = COLOR[kind], px = 3;
  const c = document.createElement('canvas'); c.width = (map[0].length + 1) * px; c.height = (map.length + 1) * px;
  const m = c.getContext('2d');
  const pal = { O: '#2a1a10', H: mix(F, [255, 255, 255], 0.55), F, S: mix(F, [40, 20, 10], 0.35) };
  map.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '.') { m.fillStyle = 'rgba(0,0,0,.4)'; m.fillRect((x + 1) * px, (y + 1) * px, px, px); } }));
  map.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch]) { m.fillStyle = pal[ch]; m.fillRect(x * px, y * px, px, px); } }));
  return (markArt[kind] = { c, w: map[0].length * px, h: map.length * px });
}

// ---------------------------------------------------------------- his aura (Aura.cs, sheet 51 "A · soft falloff")
// Pure haze: alpha falls off with distance from his silhouette, I * (1 - d/R)^1.8, breathing R 9..13 and I 0.68..1 on a
// slow 4 s ease, never off. A new mark that wants him starts with the burst: out to 18 px, a soft ~9 Hz flicker for
// 650 ms, then it eases into the calm breath. Only the marks that glow (ClaudeMarks.Glows) and a timer that went off.
const GLOWS = new Set(['permission', 'question', 'plan', 'complete', 'failed']);
const AVATAR = '#c8e8ff';                       // Theme.AvatarGlow: a timer that ran out (sheet 17)
const REACH = 18;
const near = new Map();                         // frame image -> { idx: Int32Array, d: Float32Array } (pixels within REACH)
function fieldOf(img) {
  let f = near.get(img); if (f) return f;
  const c = document.createElement('canvas'); c.width = 224; c.height = 224; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
  const a = x.getImageData(0, 0, 224, 224).data, N = 224 * 224, INF = 1e9, d = new Float32Array(N);
  for (let i = 0; i < N; i++) d[i] = a[i * 4 + 3] > 20 ? 0 : INF;
  // Two-pass chamfer distance (1, sqrt 2): near enough to the sheet's own field for a haze.
  const R2 = Math.SQRT2;
  for (let y = 0; y < 224; y++) for (let x0 = 0; x0 < 224; x0++) { const i = y * 224 + x0; if (!d[i]) continue;
    let v = d[i]; if (x0 > 0) v = Math.min(v, d[i - 1] + 1); if (y > 0) { v = Math.min(v, d[i - 224] + 1); if (x0 > 0) v = Math.min(v, d[i - 225] + R2); if (x0 < 223) v = Math.min(v, d[i - 223] + R2); } d[i] = v; }
  for (let y = 223; y >= 0; y--) for (let x0 = 223; x0 >= 0; x0--) { const i = y * 224 + x0; if (!d[i]) continue;
    let v = d[i]; if (x0 < 223) v = Math.min(v, d[i + 1] + 1); if (y < 223) { v = Math.min(v, d[i + 224] + 1); if (x0 < 223) v = Math.min(v, d[i + 225] + R2); if (x0 > 0) v = Math.min(v, d[i + 223] + R2); } d[i] = v; }
  const idx = [], dist = [];
  for (let i = 0; i < N; i++) if (d[i] > 0 && d[i] <= REACH) { idx.push(i); dist.push(d[i]); }
  f = { idx: Int32Array.from(idx), d: Float32Array.from(dist) };
  near.set(img, f);
  return f;
}
let glow = null, glowAt = 0, lastGlow = 0;                    // the colour, and when its burst began
const halo = document.createElement('canvas'); halo.width = 224; halo.height = 224;
const hg = halo.getContext('2d');
let haloData = hg.createImageData(224, 224);
function breath(sec) { const ph = (1 - Math.cos(2 * Math.PI * sec / 4)) / 2; return [9 + 4 * ph, 0.68 + 0.32 * ph]; }
function auraNow(now) {
  const t = now - glowAt, sec = now / 1000;
  if (t < 650) {
    const snap = Math.max(0, Math.min(1, t < 150 ? t / 150 : t < 320 ? 1 - (t - 150) / 170 : 0));
    return [12 + 6 * snap, Math.floor(t / 56) % 2 === 0 ? 1 : 0.5];
  }
  const [r, i] = breath(sec), u0 = Math.max(0, Math.min(1, (t - 650) / 700)), u = u0 * u0 * (3 - 2 * u0);
  return [12 + (r - 12) * u, 0.95 + (i - 0.95) * u];
}
function drawHalo(img, now) {
  const f = fieldOf(img), [R, I] = auraNow(now);
  const c = parseInt(glow.slice(1), 16), r = c >> 16, g2 = (c >> 8) & 255, b = c & 255;
  const data = haloData.data; data.fill(0);
  for (let k = 0; k < f.idx.length; k++) {
    const dd = f.d[k]; if (dd > R) continue;
    const a = I * Math.pow(1 - dd / R, 1.8), j = f.idx[k] * 4;
    data[j] = r; data[j + 1] = g2; data[j + 2] = b; data[j + 3] = Math.round(a * 255);
  }
  hg.putImageData(haloData, 0, 0);
  g.drawImage(halo, 0, MARK - ART_TOP);
}

function play(s) { if (!SPEC[s] || !frames[s]?.length) s = 'idle'; if (s === state) return; state = s; frame = 0; due = 0; }

function draw() {
  g.clearRect(0, 0, cv.width, cv.height);
  const f = frames[state]?.[frame];
  if (f && show > 0) {
    // Only the top `show` pixels of his art: the rest is under the edge.
    g.save();
    // Nothing above his head is cut: his frames bob and some reach above row 78 (2026-10-28, his head was clipped). Only
    // the bottom is clipped, at the edge he stands or docks on.
    g.beginPath(); g.rect(0, 0, 224, MARK + show); g.clip();
    if (glow) drawHalo(f, performance.now());
    g.drawImage(f, 0, MARK - ART_TOP);
    g.restore();
  }
  const kind = flash && performance.now() < flashUntil ? flash : mark;
  if (kind && SHAPES[kind] && show > 0) {
    const a = markOf(kind);
    g.drawImage(a.c, Math.round(ART_X + ART_W / 2 - a.w / 2), MARK - 9 - a.h);
  }
}

function tick(now) {
  const spec = SPEC[state], list = frames[state];
  if (list?.length && now >= due) {
    due = now + 1000 / spec[0];
    if (frame + 1 >= list.length) { if (spec[1]) frame = 0; else { state = rest; frame = 0; } }
    else frame++;
    draw();
  } else if (flash && now >= flashUntil) { flash = null; draw(); }
  // The haze breathes between frames too, at 20 a second: a 4 s breath needs no more, and this Mac is old (60 a second
  // cost ~20% of a core, 2026-10-28).
  else if (glow && now - lastGlow >= 50) { lastGlow = now; draw(); }
  requestAnimationFrame(tick);
}

// ---------------------------------------------------------------- what the main process tells us
window.pet?.onFrames(async (all) => {
  for (const [name, list] of Object.entries(all)) {
    frames[name] = await Promise.all(list.map((src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = src; })));
  }
  draw();
  requestAnimationFrame(tick);
});
window.pet?.onState((s) => {
  if (Number.isFinite(s.show)) {
    show = Math.max(0, Math.min(126, Math.round(s.show)));
    // The window is MARK plus what shows (macaang.ts placePet); the canvas follows it, one to one.
    const h = MARK + Math.max(1, show);
    if (cv.height !== h) { cv.height = h; g.imageSmoothingEnabled = false; }
  }
  if (typeof s.anim === 'string') { rest = s.anim; play(s.anim); }
  if ('mark' in s) {
    const was = mark;
    mark = SHAPES[s.mark] ? s.mark : null;
    // One aura (his call, 2026-10-21): a mark that wants him glows in its own colour, with the burst when it is new.
    if (mark && GLOWS.has(mark)) { if (mark !== was || !glow) glowAt = performance.now(); glow = COLOR[mark]; }
    else if (glow !== AVATAR) glow = null;
  }
  if (s.glow === 'timer') { glow = AVATAR; glowAt = performance.now(); }
  if (s.glow === 'off') glow = mark && GLOWS.has(mark) ? COLOR[mark] : null;
  if (s.flash && SHAPES[s.flash]) { flash = s.flash; flashUntil = performance.now() + (s.flash === 'step' ? 1800 : 4000); }
  draw();
});

// ---------------------------------------------------------------- the mouse on him
// The window ignores the mouse except over his drawn pixels (the main process turns that on and off from here).
let solid = false, down = null, dragging = false, holding = false, holdTimer = 0;
/** PetWindow.cs: holding still on him for 300 ms opens the wheel; moving first is a drag. */
const HOLD_MS = 300;
function isSolid(x, y) {
  if (x < 0 || y < 0 || x >= cv.width || y >= cv.height) return false;
  return g.getImageData(x, y, 1, 1).data[3] > 20;
}
document.addEventListener('mousemove', (e) => {
  const now = isSolid(e.offsetX, e.offsetY) || dragging;
  if (now !== solid) { solid = now; window.pet?.solid(now); }
  if (down && !dragging && !holding && Math.hypot(e.screenX - down.x, e.screenY - down.y) > 4) { clearTimeout(holdTimer); dragging = true; window.pet?.drag('start', e.screenX, e.screenY); }
  if (dragging) window.pet?.drag('move', e.screenX, e.screenY);
});
document.addEventListener('mouseleave', () => { if (!dragging && solid) { solid = false; window.pet?.solid(false); } });
document.addEventListener('mousedown', (e) => {
  if (e.button !== 0 || !solid) return;
  down = { x: e.screenX, y: e.screenY };
  clearTimeout(holdTimer);
  holdTimer = setTimeout(() => { if (down && !dragging) { holding = true; window.pet?.hold('open', down.x, down.y); } }, HOLD_MS);
});
document.addEventListener('mouseup', (e) => {
  if (e.button !== 0) return;
  clearTimeout(holdTimer);
  if (holding) { holding = false; down = null; window.pet?.hold('release', e.screenX, e.screenY); return; }
  if (dragging) window.pet?.drag('end', e.screenX, e.screenY);
  else if (down && solid) window.pet?.click(e.offsetY < MARK ? 'mark' : 'aang');
  down = null; dragging = false;
});
document.addEventListener('contextmenu', (e) => { e.preventDefault(); if (solid) window.pet?.context(e.screenX, e.screenY); });

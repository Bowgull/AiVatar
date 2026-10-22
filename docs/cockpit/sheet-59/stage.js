// Sheet 59 (2026-10-22): the Spotify mini player, three looks, each FULL (visualizer on and off) and SHADE. Every
// surface is hand-placed pixels at exactly 2x: Samara's wood (band.png rim, tray.png surface), the bubble's paper, the
// job pop-out's pin, the product's own pill bar for the seek bar. Coordinates are CSS pixels, always even.
import { P, loadTex, rr, rrMask, shape, drawMask, close, fills, spr, art, GLYPH, pin, cover, spectrum, mix, hex, paperAt, trayAt } from './pix.js';
import { pill, SEA } from '../../../src/Shell/pages/claudejobs.js';

const SCENE = new URLSearchParams(location.search).get('scene') || 'A-full';
const GOLD = ['#fff3d8', '#ffe7b0', '#ffd88a', '#ffc96a', '#f0b04a', '#d9952f', '#b97a22', '#8f5a16'];
const SONG = { t: 'Maria También', a: 'Khruangbin', al: 'Con Todo El Mundo', at: '1:42', len: '4:01', p: 0.42 };

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
function at(parent, e, x, y, extra = {}) { e.style.position = 'absolute'; e.style.left = x + 'px'; e.style.top = y + 'px'; if (!e.style.zIndex) e.style.zIndex = '2'; Object.assign(e.style, extra); parent.append(e); return e; }
function box(w, h) { const d = el('div', 'pl'); d.style.width = w + 'px'; d.style.height = h + 'px'; return d; }
function bodyOf(pl, canvas) { canvas.classList.add('body'); pl.prepend(canvas); }
const seek = (wArt, p = SONG.p, ht = 9) => pill(wArt, ht, P, [1], p, -1, GOLD, false);

// ---------------------------------------------------------------- shared parts
/** A parchment keycap: dark-wood edge, the bubble's paper, a one-pixel lip under it; pressed = sunk, no lip. */
function keycap(wA, hA, glyph, { pressed = false, ink = '#3a2a18', r = 3, label = null, led = null } = {}) {
  const k = el('div'); k.style.width = wA * P + 'px'; k.style.height = (hA + 1) * P + 'px'; k.style.position = 'absolute';
  const body = rr(wA, hA, r, { band: 'edge', shadow: pressed ? 0 : 1, shadowCol: [40, 22, 8, 255],
    fill: (x, y, c) => { let p = paperAt(y / hA); if (pressed) p = mix(p, '#c9a46a', 0.35); if (c.d === 0 && c.lit > 0.3) p = pressed ? mix(p, '#7a5532', 0.45) : mix(p, '#ffffff', 0.55); if (!pressed && y === hA - 2) p = mix(p, '#b8955e', 0.5); return p; } });
  body.style.position = 'absolute'; body.style.top = (pressed ? P : 0) + 'px'; k.append(body);
  if (glyph) { const g = spr(GLYPH[glyph], { O: ink }); g.style.position = 'absolute'; const gw = GLYPH[glyph][0].length, gh = GLYPH[glyph].length;
    g.style.left = Math.round((wA - gw) / 2) * P + (led ? -4 : 0) + 'px'; g.style.top = (Math.round((hA - gh) / 2) + (pressed ? 1 : 0)) * P + 'px'; k.append(g); }
  if (label) { const l = el('span', '', label); Object.assign(l.style, { position: 'absolute', left: 0, right: led ? '8px' : 0, top: (pressed ? 1 : 0) * P + Math.round(hA * P / 2 - 5) + 'px', textAlign: 'center', font: '400 8px Silkscreen,monospace', letterSpacing: '1px', color: ink }); k.append(l); }
  if (led) { const on = led === 'on'; const L = art(3, 3, (put) => { for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) put(x, y, on ? (x === 0 && y === 0 ? '#fff3d8' : '#ffc43c') : (x === 0 && y === 0 ? '#8f7458' : '#5a4834')); });
    Object.assign(L.style, { position: 'absolute', right: '8px', top: (Math.round(hA / 2) - 1 + (pressed ? 1 : 0)) * P + 'px', boxShadow: on ? '0 0 6px 1px rgba(255,180,60,.75)' : 'none' }); k.append(L); }
  return k;
}
/** A wood key (look B's piano keys): Samara's tray wood, a lit top lip, cream glyph; pressed = shorter, gold glyph. */
function woodkey(wA, hA, glyph, { pressed = false } = {}) {
  const k = el('div'); k.style.width = wA * P + 'px'; k.style.height = (hA + 2) * P + 'px'; k.style.position = 'absolute';
  const h2 = pressed ? hA - 2 : hA;
  const body = rr(wA, h2, 3, { band: 'edge', shadow: pressed ? 0 : 2, shadowCol: [18, 10, 5, 255],
    fill: (x, y, c) => { let t = trayAt(x + wA * 3, y, pressed ? 0.85 : 1.1); if (c.d === 0 && c.lit > 0.3) t = mix(t, pressed ? '#2a1a10' : '#8a6038', 0.7); return t; } });
  body.style.position = 'absolute'; body.style.top = (pressed ? 2 * P : 0) + 'px'; k.append(body);
  const g = spr(GLYPH[glyph], { O: pressed ? '#ffc43c' : '#f1e3c4' }, { drop: 'rgba(0,0,0,.55)' }); g.style.position = 'absolute';
  g.style.left = Math.round((wA - 10) / 2) * P + 'px'; g.style.top = ((pressed ? 2 : 0) + Math.round((h2 - 10) / 2)) * P + 'px';
  if (pressed) g.style.filter = 'drop-shadow(0 0 3px rgba(255,180,60,.6))';
  k.append(g);
  return k;
}
/** The see-through slider's little sister: a groove with the plum gem knob (jobpop.js vslider), lying down. */
function hslider(wA, frac) {
  const H = 8, K = ['.OOO.', 'OHHFO', 'OHFFO', 'OHFFO', 'OFFSO', 'OFFSO', 'OFSSO', '.OOO.'];
  const kx = Math.round(1 + frac * (wA - 7));
  return art(wA, H, (put) => {
    for (let x = 1; x < wA - 1; x++) { put(x, 2, '#6a4628'); put(x, 3, '#0d0703'); put(x, 4, '#0d0703'); put(x, 5, '#3a2414'); }
    for (let x = 2; x < kx; x++) { put(x, 3, '#e9d3a6'); put(x, 4, '#c9ad78'); }
    K.forEach((r, y) => [...r].forEach((c, x) => { const col = { O: '#120a05', H: '#d9c2ff', F: '#8a5cc4', S: '#4A2C6E' }[c]; if (col) put(kx + x, y, col); }));
  });
}
function pinBtn(on = false) { const d = el('div'); d.style.width = '18px'; d.style.height = '24px'; const p = pin(on); d.append(p); return d; }
function aang(parent, x, y) { const i = new Image(); i.src = '../../../assets/aang/frames/idle_0.png'; i.className = 'stg aang'; at(parent, i, x, y, { zIndex: '1' }); return i; }
function tag(parent, x, y, text) { const t = el('div', 'dtag'); t.innerHTML = text; return at(parent, t, x, y); }
/** A circle mask cut out of a canvas (pixels outside radius r from the middle go clear). */
function circleCut(c, r) {
  const g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height), m = c.width / 2;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (Math.hypot(x + 0.5 - m, y + 0.5 - m) > r) d.data[(y * c.width + x) * 4 + 3] = 0;
  g.putImageData(d, 0, 0); return c;
}
const circle = (n, r) => drawMask(n, n, (g) => { g.beginPath(); g.arc(n / 2, n / 2, r, 0, Math.PI * 2); g.fill(); });

// ---------------------------------------------------------------- A: Winamp in wood (v2, 2026-10-22: soft corners, big targets)
// His notes on v1: "everything sharp cornered", "hard to click". Every part is now a rounded pixel shape (rrMask: a
// hand-even staircase on all four corners, whole art pixels, shown at exactly 2x): frame r 12, screen r 7, cover r 6,
// keys r 6, title keys r 5, the seek and volume grooves are the product's own round pill. Hit targets at 1x: transport
// keys 38 px tall, the seek bead 18 px, the volume groove 14 px with an 18 px knob, pin / fold / close 28 px.
const AW = 212, AH = 104, SH = 26;            // the full player and the shade are the same width, so the fold is height only
const a2 = (n) => n * P;                       // art pixels to CSS pixels
const KNOB = ['..OOOOO..', '.OHHHFFO.', 'OHHFFFFSO', 'OHFFFFFSO', 'OHFFFFFSO', 'OFFFFFSSO', 'OFFFFSSSO', '.OFSSSSO.', '..OOOOO..'];
const GOLDK = { O: '#2a1a10', H: '#fff3d8', F: '#ffc43c', S: '#b97a22' };
const PLUMK = { O: '#120a05', H: '#d9c2ff', F: '#8a5cc4', S: '#4A2C6E' };
const CREAM = ['#fffaf0', '#fff3d8', '#f6e6c4', '#ecd5a8', '#e2c592', '#d6b47c', '#c9a46a', '#b8955e'];
/** Cut a canvas to a rounded rectangle (same staircase as rrMask), so the cover has soft corners too. */
function roundCut(c, r) {
  const g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height), m = rrMask(c.width, c.height, r);
  for (let i = 0; i < m.length; i++) if (!m[i]) d.data[i * 4 + 3] = 0;
  g.putImageData(d, 0, 0); return c;
}
/** A title key (pin, fold, close): dark wood like the video pop-out's keys, rounded, a cream glyph in the middle. */
function tkey(glyph, { hot = false, size = 14 } = {}) {
  const k = el('div'); k.style.cssText = `position:absolute;width:${a2(size)}px;height:${a2(size + 1)}px`;
  const body = rr(size, size, 5, { band: 'edge', shadow: 1, shadowCol: [8, 4, 2, 230], fill: (x, y, c) => {
    // the video pop-out's own key colours (popout.css .key): plum, a lit top row, a darker foot
    let t = hex(y < 2 ? '#6a4a9a' : y > size - 3 ? '#3a2258' : hot ? '#5a3a86' : '#4A2C6E'); if (c.d === 0 && c.lit > 0.3) t = hex('#7a5aaa'); return t; } });
  body.style.position = 'absolute'; k.append(body);
  const g = glyph === 'pin' ? pin(false) : spr(GLYPH[glyph], { O: '#f1e3c4' }, { drop: 'rgba(0,0,0,.55)' });
  const gw = glyph === 'pin' ? 9 : GLYPH[glyph][0].length, gh = glyph === 'pin' ? 12 : GLYPH[glyph].length;
  g.style.position = 'absolute'; g.style.left = a2(Math.floor((size - gw) / 2)) + 'px'; g.style.top = a2(Math.floor((size - gh) / 2)) + 'px'; k.append(g);
  return k;
}
const bead = (pal) => spr(KNOB, pal, { drop: 'rgba(0,0,0,.45)' });
/** Winamp's bars at an exact moment: heights 0..1 per bar, a peak cap per bar (that falls slower than the bar). */
function bars(levels, peaks, { bw = 2, h = 10, gap = 1 } = {}) {
  const n = levels.length, W = n * (bw + gap) - gap, cols = ['#f0a64a', '#ffc43c', '#ffe096', '#ff8040'];
  return art(W, h, (put) => levels.forEach((lv, i) => {
    const top = Math.round(h - lv * h);
    for (let y = h - 1; y >= top; y--) { if ((h - 1 - y) % 2 === 1) continue; const q = 1 - y / h; const col = q > 0.82 ? cols[3] : q > 0.6 ? cols[2] : q > 0.3 ? cols[1] : cols[0]; for (let x = 0; x < bw; x++) put(i * (bw + gap) + x, y, col); }
    const pk = Math.min(top - 1, Math.round(h - peaks[i] * h) - 1); if (pk >= 0) for (let x = 0; x < bw; x++) put(i * (bw + gap) + x, pk, '#fff3d8', 0.95);
  }));
}
const LV = [0.9, 0.8, 0.95, 0.7, 0.62, 0.75, 0.5, 0.58, 0.44, 0.36, 0.48, 0.3, 0.22, 0.28];
/**
 * The full player. mode: 'bars' (visualizer), 'scene' (a little looping picture in the screen), 'off'.
 * opts: scene (a canvas 56 x 30 art pixels), p (song position), off (title marquee offset in CSS px), pressPlay.
 */
function playerA(mode = 'bars', { scene = null, p = SONG.p, off = 0, pressed = 'none', grab = false } = {}) {
  if (mode === true) mode = 'bars'; if (mode === false) mode = 'off';
  const W = AW, H = AH, pl = box(a2(W), a2(H + 1));
  bodyOf(pl, rr(W, H, 12, { band: 's2', E: 4, fill: fills.wood(1.05) }));
  // the title strip: where it comes from on the left, pin / fold to the strip / close on the right (28 px each)
  const lab = at(pl, el('span', 'lab d'), a2(10), a2(10)); lab.innerHTML = 'SPOTIFY &nbsp;&middot;&nbsp; LIKED SONGS';
  at(pl, tkey('pin'), a2(W - 59), a2(5)); at(pl, tkey('shade'), a2(W - 43), a2(5)); at(pl, tkey('close'), a2(W - 27), a2(5));
  // the cover in a soft sunken frame, its own corners cut round
  at(pl, rr(38, 38, 6, { band: 'recess', fill: fills.flat('#1a100a'), shadow: 0 }), a2(8), a2(21));
  at(pl, roundCut(cover(34), 4), a2(10), a2(23));
  // the screen: warm dark glass, rounded, two panes (time + visualizer or scene | the song)
  const LX = 50, LY = 21, lw = W - LX - 8, lh = 38;
  at(pl, rr(lw, lh, 7, { band: 'recess', shadow: 0, fill: (x, y) => (x === 61 && y > 4 && y < lh - 5 ? '#2c1a0e' : y % 2 ? mix('#1c110a', '#120a05', y / lh) : mix('#20140b', '#150c06', y / lh)) }), a2(LX), a2(LY));
  const lcd = at(pl, el('div', 'lcd'), a2(LX + 2), a2(LY + 2), { width: a2(lw - 4) + 'px', height: a2(lh - 4) + 'px', borderRadius: '10px' });
  if (mode === 'bars') { at(lcd, el('span', 'time', SONG.at), 12, 4); at(lcd, bars(LV, LV.map((v, i) => Math.min(1, v + 0.12 + (i % 3) * 0.05))), 12, 44); }
  if (mode === 'off') { const t = at(lcd, el('span', 'time', SONG.at), 10, 14); t.style.fontSize = '42px'; }
  if (mode === 'scene' && scene) { roundCut(scene, 3); at(lcd, scene, 2, 2); }
  at(lcd, el('span', 'scroll', `${SONG.t.toUpperCase()}  ·  ${SONG.a.toUpperCase()}  ·  ${SONG.t.toUpperCase()}`), 128 - off, 6);
  at(lcd, el('span', 'sub', SONG.al), 128, 30);
  const tg = at(lcd, el('span', 'tags'), 128, 52); tg.innerHTML = mode === 'scene' ? `<i>${SONG.at}</i> / ${SONG.len}&nbsp;&nbsp;&middot;&nbsp;&nbsp;3 / 11` : '<i>LIKED</i>&nbsp;&nbsp;3 / 11';
  // the seek: the product's round pill in gold, an 18 px bead to grab, the times either side
  const sx = 30, sw = W - sx - 30;
  at(pl, el('span', 'tm d', mode === 'x' ? '' : SONG.at), a2(9), a2(66));
  at(pl, seek(sw, p, 6), a2(sx), a2(66));
  const kb = at(pl, bead(GOLDK), a2(sx + Math.round(sw * p) - 4), a2(64), { zIndex: '3' });
  if (grab) kb.style.filter = 'drop-shadow(0 0 5px rgba(255,196,60,.9))';
  at(pl, el('span', 'tm d', SONG.len), a2(W - 25), a2(66));
  // the keys, 38 px tall: prev, play/pause (down while playing), next; volume; the VIS key (BARS / SCENE / OFF)
  at(pl, keycap(26, 19, 'prev', { r: 6, pressed: pressed === 'prev' }), a2(8), a2(78));
  at(pl, keycap(32, 19, 'pause', { r: 6, pressed: pressed !== 'up', ink: '#8a3e1c' }), a2(38), a2(78));
  at(pl, keycap(26, 19, 'next', { r: 6, pressed: pressed === 'next' }), a2(74), a2(78));
  at(pl, spr(GLYPH.vol, { O: '#d8c8a8' }, { drop: 'rgba(0,0,0,.6)' }), a2(106), a2(84));
  const vx = 119, vw = 48;
  at(pl, pill(vw, 7, P, [1], 0.7, -1, CREAM, false), a2(vx), a2(84));
  at(pl, bead(PLUMK), a2(vx + Math.round(vw * 0.7) - 4), a2(83), { zIndex: '3' });
  at(pl, keycap(32, 19, null, { r: 6, label: mode === 'bars' ? 'BARS' : mode === 'scene' ? 'SCENE' : 'OFF', pressed: mode !== 'off' }), a2(W - 40), a2(78));
  return pl;
}
/** The shade: same width, 52 px tall. Play, the scrolling title over a thin progress line, small bars, back to full, pin. */
function shadeA(vis = true, { off = 0 } = {}) {
  const W = AW, H = SH, pl = box(a2(W), a2(H + 1));
  bodyOf(pl, rr(W, H, 10, { band: 's2', E: 3, fill: fills.wood(1.05) }));
  at(pl, keycap(20, 17, 'pause7', { r: 6, pressed: true, ink: '#8a3e1c' }), a2(5), a2(4));
  const lw = vis ? 112 : 132, lh = 16, LX = 29;
  at(pl, rr(lw, lh, 5, { band: 'recess', shadow: 0, fill: (x, y) => (y === lh - 4 ? (x < Math.round(lw * SONG.p) ? '#ffc43c' : '#3a2414') : y % 2 ? '#1a100a' : '#20140b') }), a2(LX), a2(5));
  const lcd = at(pl, el('div', 'lcd'), a2(LX + 2), a2(7), { width: a2(lw - 4) + 'px', height: a2(lh - 7) + 'px', borderRadius: '6px' });
  const s = at(lcd, el('span', 'scroll', `${SONG.t.toUpperCase()}  ·  ${SONG.a.toUpperCase()}  ·  ${SONG.t.toUpperCase()}`), 6 - off, -2); s.style.fontSize = '21px';
  const t = at(lcd, el('span', 'scroll', SONG.at), 0, -2); t.style.left = 'auto'; t.style.right = '0'; t.style.fontSize = '21px'; t.style.background = '#1d120a'; t.style.padding = '0 6px 0 6px'; t.style.boxShadow = '-8px 0 6px #1d120a';
  if (vis) at(pl, bars([0.9, 0.7, 0.8, 0.5, 0.6, 0.35], [1, 0.85, 0.9, 0.7, 0.7, 0.5], { h: 12 }), a2(LX + lw + 3), a2(7));
  at(pl, tkey('full', { size: 14 }), a2(W - 40), a2(5)); at(pl, tkey('pin', { size: 14 }), a2(W - 24), a2(5));
  return pl;
}

// ---------------------------------------------------------------- SCENES: little looping pictures for the screen
// 56 x 30 art pixels each, 4 frames, hand-placed palettes, meant to loop at 8-12 fps (and stop when the player is hidden).
const SCW = 56, SCH = 30;
function rng(seed) { let r = seed; return () => ((r = (r * 9301 + 49297) % 233280) / 233280); }
const SCENES = {
  /** Dusk over the water: the air temple on its cliff, lanterns drifting up, glints on the water. */
  temple: (f) => (put) => {
    const sky = ['#2b1d3f', '#3d2556', '#5a2e64', '#8a3e6a', '#b8504e', '#e07a4a', '#f0a64a'];
    for (let y = 0; y < SCH; y++) for (let x = 0; x < SCW; x++) {
      let col;
      if (y < 20) { const t = y / 20 * sky.length, i = Math.floor(t); col = sky[i]; if (t - i > 0.7 && (x + y) % 2 === 0 && i < sky.length - 1) col = sky[i + 1]; }
      else { col = y < 23 ? '#4a2c5a' : y < 26 ? '#3a2250' : '#2a1a3e'; if ((x * 5 + y * 3 + f * 2) % 13 === 0 && x > 10 && x < 30) col = '#f0a64a'; }
      put(x, y, col);
    }
    for (let y = -4; y <= 0; y++) for (let x = -4; x <= 4; x++) if (x * x + y * y <= 17) put(20 + x, 19 + y, y > -2 ? '#ffd38a' : '#fff0c8');
    // the cliff and the temple: towers with pointed roofs, one tall
    const sil = '#1e1230';
    for (let x = 36; x < SCW; x++) { const top = 14 + Math.round(Math.abs(x - 46) / 4); for (let y = top; y < 22; y++) put(x, y, sil); }
    for (const [tx, h] of [[40, 5], [45, 9], [50, 6]]) { for (let y = 14 - h; y < 15; y++) for (let x = tx - 1; x <= tx + 1; x++) put(x, y, sil); put(tx, 14 - h - 1, sil); put(tx, 14 - h - 2, sil); for (let x = tx - 2; x <= tx + 2; x++) put(x, 14 - h + 1, sil); }
    put(45, 8, '#ffc46a'); put(40, 12, '#ffc46a');
    // lanterns: rise one pixel every frame, sway a pixel, glow
    const L = [[8, 17], [14, 11], [27, 15], [32, 7], [5, 5]];
    L.forEach(([lx, ly], k) => { const y = ly - f - (k % 2 ? 0 : Math.floor(f / 2)), x = lx + ((f + k) % 4 === 3 ? 1 : 0); if (y < 1) return;
      put(x - 1, y, '#ff9a3c', 0.35); put(x + 2, y, '#ff9a3c', 0.35); put(x, y - 1, '#ff9a3c', 0.35); put(x + 1, y + 2, '#ff9a3c', 0.3);
      put(x, y, '#ffe096'); put(x + 1, y, '#ffc43c'); put(x, y + 1, '#ff8040'); put(x + 1, y + 1, '#e0602a');
      put(x, 26 + (k % 3) - 0, '#f0a64a', 0.55); });
  },
  /** Rain on a window: a warm room, the lamp, a night street outside, drops running down the glass. */
  rain: (f) => (put) => {
    const R = rng(4);
    for (let y = 0; y < SCH; y++) for (let x = 0; x < SCW; x++) put(x, y, '#24160e');
    // the window: two panes in a wood frame
    for (let y = 2; y < 27; y++) for (let x = 6; x < 50; x++) {
      const frame = y < 4 || y > 24 || x < 8 || x > 47 || (x >= 27 && x <= 28);
      put(x, y, frame ? (y < 4 || x < 8 ? '#6a4628' : '#4a2e1a') : y < 17 ? mix('#1a2440', '#2c3a5a', y / 17) : '#1a1e30');
    }
    // the street outside: rooftops, warm windows
    for (const [x0, w, h] of [[8, 7, 6], [16, 6, 9], [29, 8, 7], [38, 9, 5]]) for (let y = 24 - h; y < 25; y++) for (let x = x0; x < x0 + w; x++) if (x < 27 || x > 28) put(x, y, '#131624');
    for (const [x, y] of [[10, 20], [18, 17], [20, 21], [31, 19], [34, 21], [41, 21]]) put(x, y, (x + f) % 7 === 0 ? '#8a6a3a' : '#ffc46a');
    // rain: short slanted streaks, moved 2 down 1 left per frame
    for (let k = 0; k < 26; k++) { const x0 = Math.floor(R() * 44) + 8, y0 = Math.floor(R() * 24); const y = 4 + ((y0 + f * 3) % 20), x = x0 - Math.floor(((y0 + f * 3) % 20) / 3);
      if (x > 8 && x < 47 && (x < 27 || x > 28)) { put(x, y, '#7a8ab8', 0.8); if (y + 1 < 24) put(x - 1, y + 1, '#5a6a98', 0.6); } }
    // drops on the glass, sliding a pixel a frame and leaving a faint trail
    for (const [x, y0] of [[13, 6], [22, 10], [34, 5], [43, 12]]) { const y = y0 + f; for (let t = 1; t < 4; t++) put(x, y - t, '#9aaad0', 0.25); put(x, y, '#d8e4ff'); put(x, y + 1, '#8a9ac8'); }
    // the lamp glow in the room, bottom left, and the sill
    for (let y = 22; y < SCH; y++) for (let x = 0; x < 14; x++) { const d = Math.hypot(x - 3, y - 27); if (d < 9) put(x, y, '#ffc46a', (9 - d) / 9 * 0.35); }
    for (let x = 4; x < 52; x++) { put(x, 27, '#8a6038'); put(x, 28, '#5a3a20'); }
    for (let y = 22; y < 27; y++) { put(2, y, '#ffe096'); put(3, y, '#ffc43c'); } put(1, 21, '#c98c14'); put(2, 21, '#c98c14'); put(3, 21, '#c98c14'); put(4, 21, '#c98c14');
  },
  /** A campfire at night: flames that flicker, sparks floating up, the trees lit underneath. */
  campfire: (f) => (put) => {
    const R = rng(7);
    for (let y = 0; y < SCH; y++) for (let x = 0; x < SCW; x++) put(x, y, y < 18 ? mix('#0f0c1e', '#1e1430', y / 18) : '#140e0a');
    for (let k = 0; k < 18; k++) { const x = Math.floor(R() * SCW), y = Math.floor(R() * 12); put(x, y, (k + f) % 5 === 0 ? '#6a6488' : '#d8d0f0'); }
    // pines
    for (const [px, h] of [[4, 11], [11, 8], [44, 10], [51, 13], [38, 6]]) for (let y = 0; y < h; y++) { const w = Math.floor(y / 2); for (let x = -w; x <= w; x++) put(px + x, 19 - h + y, '#0a0814'); }
    // the light on the ground, dithered
    for (let y = 18; y < SCH; y++) for (let x = 0; x < SCW; x++) { const d = Math.hypot((x - 28) / 1.8, y - 25); if (d < 10 && (x + y) % 2 === 0) put(x, y, '#5a2e14', (10 - d) / 10); if (d < 6) put(x, y, '#7a3e18', (6 - d) / 6 * 0.7); }
    // logs
    for (let k = -6; k <= 6; k++) { put(28 + k, 26 + Math.round(k / 4), '#4a2e1a'); put(28 + k, 27 + Math.round(k / 4), '#2c1c10'); put(28 + k, 26 - Math.round(k / 4), '#6a4628'); }
    // the flame: column heights jitter per frame
    const H = [[3, 6, 9, 11, 8, 5, 3], [4, 7, 10, 9, 10, 6, 2], [2, 6, 8, 12, 9, 6, 4], [3, 5, 11, 10, 7, 7, 3]][f % 4];
    H.forEach((h, i) => { const x = 25 + i; for (let y = 0; y < h; y++) { const q = y / h; put(x, 25 - y, q > 0.75 ? '#ff6a2a' : q > 0.45 ? '#ff9a3c' : q > 0.2 ? '#ffc43c' : '#fff0c8'); } });
    // sparks
    for (const [sx, sy] of [[27, 12], [30, 8], [24, 4], [33, 14]]) { const y = sy - f * 2, x = sx + ((f + sx) % 3) - 1; if (y > 0) put(x, y, '#ffc43c'); }
  },
  /** Appa in the clouds: the sky bison drifting, clouds sliding past, a slow bob. */
  appa: (f) => (put) => {
    for (let y = 0; y < SCH; y++) for (let x = 0; x < SCW; x++) { const t = y / SCH; let col = t < 0.35 ? '#5a8ac4' : t < 0.6 ? '#7aa6d4' : t < 0.8 ? '#b8cce0' : '#f2d6b4'; if ((x + y) % 2 === 0 && [10, 18, 24].includes(y)) col = t < 0.6 ? '#7aa6d4' : '#b8cce0'; put(x, y, col); }
    const cloud = (cx, cy, w, back) => { for (let y = -4; y <= 2; y++) for (let x = -w; x <= w; x++) { const r = (x / w) ** 2 + ((y + 1) / 3.6) ** 2 + 0.25 * Math.sin(x * 0.9); if (r < 1) put(cx + x, cy + y, y > 0 ? (back ? '#c8d4e6' : '#dce4f0') : (back ? '#e6ecf4' : '#ffffff')); } };
    cloud(((14 - f) % 70 + 70) % 70 - 6, 9, 9, true); cloud(((46 - f) % 70 + 70) % 70 - 6, 6, 7, true);
    // Appa, 18 x 9, bobbing a pixel
    const A = ['.Y................', 'YY..OOOOOOOOOO....', '..OOWWWWBBBWWWWOO.', '.OWWWWWWWBWWWWWWWO', 'OWOWWWWWWWWWWWWWWO', 'OWWWWWWWWWWWWWWWWO', '.OSWWWWWWWWWWWWWO.', '..OOWWO.OWWO.OWO..', '....OO...OO...OO..'];
    const ay = 11 + (f === 1 || f === 2 ? -1 : 0), ax = 18;
    A.forEach((r, y) => [...r].forEach((c, x) => { const col = { O: '#4a3a30', W: '#f6f0e4', B: '#8a5a30', S: '#d8ccb8', Y: '#c8a070' }[c]; if (col) put(ax + x, ay + y, col); }));
    cloud(((30 - f * 2) % 76 + 76) % 76 - 8, 27, 12, false); cloud(((66 - f * 2) % 76 + 76) % 76 - 8, 26, 10, false);
  },
};
const scene = (name, f, s = P) => art(SCW, SCH, SCENES[name](f), s);

// ---------------------------------------------------------------- B: a Walkman on parchment
function reelsWindow(wA, hA, spin = 0) {
  return rr(wA, hA, 5, { band: 'recess', shadow: 0, fill: (x, y) => {
    const cy = Math.round(hA / 2), L = { x: 15, pack: 10.6 }, R = { x: wA - 16, pack: 8.2 };
    for (const q of [L, R]) {
      const dx = x - q.x, dy = y - cy, d = Math.hypot(dx, dy);
      if (d <= 2.2) return d <= 1.2 ? '#2a1a10' : '#c98c14';                                   // the hub, gold
      if (d <= 4.6) { const a = (Math.atan2(dy, dx) + spin + Math.PI * 2) % (Math.PI * 2 / 3); return a < 0.5 ? '#3a2416' : '#f1e3c4'; } // three spokes
      if (d <= 5.4) return '#c9ad78';
      if (d <= q.pack) return d > q.pack - 1 ? '#6a4628' : (Math.round(d * 1.5) % 2 ? '#553620' : '#4a2e1a'); // the wound tape
    }
    // the cassette's paper label between the reels, two ruled lines
    const lx0 = L.x + 14, lx1 = R.x - 14;
    if (x >= lx0 && x <= lx1 && y >= 4 && y <= hA - 6) {
      if (x === lx0 || x === lx1 || y === 4 || y === hA - 6) return '#b8955e';
      if (y === hA - 10 || y === hA - 13) return '#d9bf8c';
      return paperAt((y - 4) / (hA - 10), [[0, '#fbf0d8'], [1, '#ecd5a8']]);
    }
    if (y === hA - 4 && x > L.x && x < R.x) return '#6a4628';                                   // tape running across
    return (y % 2 ? '#24160c' : '#2a1a10');
  } });
}
function vu(wA, hA, level, label) {
  return rr(wA, hA, 4, { band: 'edge', shadow: 1, shadowCol: [40, 22, 8, 160], fill: (x, y, c) => {
    const px = Math.round(wA / 2), py = hA - 4, dx = x - px, dy = y - py, d = Math.hypot(dx, dy), ang = Math.atan2(-dy, dx);
    let col = paperAt(0.1 + y / hA * 0.5, [[0, '#fff8e8'], [1, '#f2e0bc']]);
    if (c.d === 0 && c.lit > 0.3) col = mix(col, '#966e3c', 0.25);
    // the scale arc, ticks every 0.18 rad, the red zone at the right end
    if (d >= 13.4 && d <= 14.6 && ang > 0.55 && ang < 2.6) col = ang < 1.0 ? '#c4453a' : '#5a4834';
    if (d > 14.6 && d <= 16.4 && ang > 0.55 && ang < 2.6 && Math.abs(((ang - 0.55) / 0.205) - Math.round((ang - 0.55) / 0.205)) < 0.1) col = ang < 1.0 ? '#c4453a' : '#5a4834';
    // the needle
    const na = 2.55 - level * 1.9; const along = dx * Math.cos(na) - dy * Math.sin(na), across = Math.abs(dx * Math.sin(na) + dy * Math.cos(na));
    if (along > 0 && along < 16 && across < 0.6) col = '#2E2216';
    if (d < 2.2 && y <= py) col = '#2E2216';
    return col;
  } });
}
function playerB(vis) {
  const W = 200, H = 106, pl = box(W * P, H * P);
  bodyOf(pl, rr(W, H, 10, { band: 's2', E: 4, fill: fills.paper(H) }));
  at(pl, rr(38, 38, 2, { band: 'edge', fill: fills.flat('#2c1c10'), shadow: 1, shadowCol: [90, 60, 25, 120] }), 12, 12);
  at(pl, cover(36), 14, 14);
  const t = at(pl, el('div', 'ttl', SONG.t), 102, 16); t.style.width = '250px';
  const a = at(pl, el('div', 'art2', `${SONG.a}  ·  ${SONG.al}`), 102, 38); a.style.width = '252px';
  at(pl, pinBtn(false), 366, 14);
  at(pl, el('span', 'tm', SONG.at), 102, 66);
  at(pl, seek(108), 134, 62);
  at(pl, el('span', 'tm', SONG.len), 356, 66);
  const ww = vis ? 106 : 186;
  at(pl, reelsWindow(ww, 26, 0.5), 12, 98);
  const side = at(pl, el('span', 'lab', 'SIDE A  ·  1:42'), 0, 108); side.style.transform = 'translateX(-50%)'; side.style.left = (12 + ww) + 'px'; side.style.color = '#6b5236';
  if (vis) { at(pl, vu(36, 26, 0.62), 238, 98); at(pl, vu(36, 26, 0.74), 314, 98);
    at(pl, el('span', 'lab', 'L'), 248, 104); at(pl, el('span', 'lab', 'R'), 324, 104); }
  at(pl, woodkey(28, 14, 'prev'), 12, 164);
  at(pl, woodkey(28, 14, 'play', { pressed: true }), 72, 164);
  at(pl, woodkey(28, 14, 'stop'), 132, 164);
  at(pl, woodkey(28, 14, 'next'), 192, 164);
  // the volume thumbwheel, ridged, a gold notch on it
  at(pl, rr(24, 14, 3, { band: 'edge', shadow: 1, shadowCol: [40, 22, 8, 255], fill: (x, y, c) => { if (x === 15) return '#ffc43c'; const base = x % 3 === 0 ? '#2a1a10' : x % 3 === 1 ? '#6a4628' : '#4a2e1a'; return c.d === 0 && c.lit > 0.3 ? mix(base, '#8a6038', 0.4) : base; } }), 256, 166);
  at(pl, spr(GLYPH.vol, { O: '#5A4834' }), 308, 174);
  at(pl, keycap(16, 14, null, { label: 'VU', pressed: vis, led: null }), 340, 164);
  return pl;
}
function shadeB(vis) {
  const W = 176, H = 20, pl = box(W * P, H * P);
  bodyOf(pl, rr(W, H, 8, { band: 's2', E: 3, fill: fills.paper(H) }));
  // a tiny reel, turning
  at(pl, art(13, 13, (put) => { for (let y = 0; y < 13; y++) for (let x = 0; x < 13; x++) { const d = Math.hypot(x - 6, y - 6), a = (Math.atan2(y - 6, x - 6) + 7) % (Math.PI * 2 / 3);
    if (d <= 1.5) put(x, y, '#2a1a10'); else if (d <= 2.6) put(x, y, '#c98c14'); else if (d <= 4.6) put(x, y, a < 0.5 ? '#5a4834' : '#e9d3a6'); else if (d <= 6.5) put(x, y, d > 5.6 ? '#2a1a10' : '#3a2416'); } }), 10, 7);
  at(pl, keycap(15, 12, 'pause7', { pressed: true, ink: '#8a3e1c' }), 40, 7);
  const t = at(pl, el('div', 'ttl fade'), 76, 7); t.style.width = (vis ? 218 : 252) + 'px'; t.style.fontSize = '14px';
  t.innerHTML = `${SONG.t} <span style="font-weight:600;color:#5A4834">&nbsp;·&nbsp; ${SONG.a}</span>`;
  at(pl, seek(vis ? 110 : 126, SONG.p, 5), 74, 26);
  if (vis) { // two tiny VU bars, stereo
    at(pl, art(18, 9, (put) => { for (const [y0, n] of [[1, 12], [5, 14]]) for (let x = 0; x < 18; x++) for (let y = y0; y < y0 + 3; y++) put(x, y, x < n ? (x > 13 ? '#c4453a' : x > 9 ? '#d9952f' : '#5a8a3a') : '#d9c49a'); }), 298, 13);
  }
  at(pl, pinBtn(false), 328, 8);
  return pl;
}

// ---------------------------------------------------------------- C: an organic skin (WMP 7-9) in wood
function organicMask(W, H, cx, cy, R, cap) {
  const m = drawMask(W, H, (g) => { g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill(); g.beginPath(); g.roundRect(cap.x, cap.y, cap.w, cap.h, cap.r); g.fill(); });
  return close(m, W, H, 6);
}
function pebble(dA, glyph, { pressed = false, ink = '#3a2a18', big = false } = {}) {
  const k = el('div'); k.style.width = dA * P + 'px'; k.style.height = (dA + 1) * P + 'px'; k.style.position = 'absolute';
  const body = shape(circle(dA, dA / 2 - 0.2), dA, dA, { band: 'edge', shadow: pressed ? 0 : 1, shadowCol: [18, 10, 5, 255],
    fill: (x, y, c) => { let p = paperAt(y / dA); if (pressed) p = mix(p, '#c9a46a', 0.35); if (c.d === 0 && c.lit > 0.3) p = pressed ? mix(p, '#7a5532', 0.45) : mix(p, '#ffffff', 0.55); return p; } });
  body.style.position = 'absolute'; body.style.top = (pressed ? P : 0) + 'px'; k.append(body);
  const map = GLYPH[glyph], gw = map[0].length, gh = map.length; const g = spr(map, { O: ink }); g.style.position = 'absolute';
  g.style.left = Math.floor((dA - gw) / 2 + (glyph === 'play' ? 1 : 0)) * P + 'px'; g.style.top = (Math.floor((dA - gh) / 2) + (pressed ? 1 : 0)) * P + 'px'; k.append(g);
  return k;
}
function knob(dA, frac) {
  return shape(circle(dA, dA / 2 - 0.2), dA, dA, { band: 'edge', shadow: 1, shadowCol: [18, 10, 5, 255], fill: (x, y, c) => {
    const m = dA / 2, dx = x + 0.5 - m, dy = y + 0.5 - m, a = Math.atan2(dy, dx), want = Math.PI * (0.75 + frac * 1.5);
    const da = Math.abs(((a - want + Math.PI * 3) % (Math.PI * 2)) - Math.PI), d = Math.hypot(dx, dy);
    if (da < 0.28 && d > 2 && d < m - 1.5) return '#ffc43c';
    let t = trayAt(x + 9, y + 40, 1.25); if (c.d === 0 && c.lit > 0.3) t = mix(t, '#8a6038', 0.6); if ((x + y) % 7 === 0 && c.d >= 1) t = mix(t, '#120a05', 0.2); return t; } });
}
function playerC(vis) {
  const W = 204, H = 84, cx = 42, cy = 42, R = 40, pl = box(W * P, (H + 1) * P);
  const cap = { x: 46, y: 12, w: 156, h: 60, r: 24 };
  bodyOf(pl, shape(organicMask(W, H, cx, cy, R, cap), W, H, { band: 's2', E: 4, fill: fills.wood(1.05) }));
  // the porthole: a round sunken window, the cover inside it
  const ring = 50; at(pl, shape(circle(ring, 24.6), ring, ring, { band: 'recess', fill: fills.flat('#1a100a'), shadow: 0 }), (cx - ring / 2) * P, (cy - ring / 2) * P);
  at(pl, circleCut(cover(44), 21.6), (cx - 22) * P, (cy - 22) * P);
  if (vis) { // the visualizer: bars standing out round the porthole, like WMP's ambience
    at(pl, art(80, 80, (put) => {
      let r0 = 9; const rnd = () => ((r0 = (r0 * 9301 + 49297) % 233280) / 233280);
      for (let k = 0; k < 30; k++) {
        const a = k / 30 * Math.PI * 2 - Math.PI / 2, len = 2 + Math.round((0.35 + 0.65 * Math.abs(Math.sin(k * 0.9)) * (0.6 + rnd() * 0.5)) * 7);
        for (let r = 27; r < 27 + len; r++) { const q = (r - 27) / 9; put(Math.round(40 + Math.cos(a) * r), Math.round(40 + Math.sin(a) * r), q > 0.75 ? '#ff8040' : q > 0.45 ? '#ffe096' : q > 0.2 ? '#ffc43c' : '#f0a64a'); }
      }
    }), (cx - 40) * P, (cy - 40) * P);
  }
  // the plaque: parchment set into the wood, the times in its corner
  at(pl, rr(92, 23, 6, { band: 'edge', shadow: 1, shadowCol: [12, 6, 2, 150], fill: fills.paper(23) }), 176, 30);
  const t = at(pl, el('div', 'ttl', SONG.t), 190, 36); t.style.width = '160px'; t.style.fontSize = '15px';
  const a = at(pl, el('div', 'art2', SONG.a), 190, 56); a.style.width = '110px'; a.style.fontSize = '12.5px';
  const tt = at(pl, el('span', 'tm', `${SONG.at} / ${SONG.len}`), 0, 61); tt.style.left = 'auto'; tt.style.right = (W * P - 352) + 'px';
  at(pl, pinBtn(false), 368, 60);
  at(pl, seek(90), 178, 86);
  at(pl, pebble(15, 'prev7'), 180, 108);
  at(pl, pebble(19, 'pause', { pressed: true, ink: '#8a3e1c' }), 214, 104);
  at(pl, pebble(15, 'next7'), 256, 108);
  at(pl, knob(15, 0.7), 296, 108);
  at(pl, pebble(15, 'bars', { pressed: vis, ink: vis ? '#8a3e1c' : '#5a4834' }), 334, 108);
  return pl;
}
function shadeC(vis) {
  const W = 176, H = 24, pl = box(W * P, (H + 1) * P);
  const m = drawMask(W, H, (g) => { g.beginPath(); g.arc(12, 12, 12, 0, Math.PI * 2); g.fill(); g.beginPath(); g.roundRect(8, 3, 168, 18, 9); g.fill(); });
  bodyOf(pl, shape(close(m, W, H, 3), W, H, { band: 's2', E: 3, fill: fills.wood(1.05) }));
  at(pl, shape(circle(18, 9), 18, 18, { band: 'recess', fill: fills.flat('#1a100a'), shadow: 0 }), 6, 6);
  at(pl, circleCut(cover(14), 7), 10, 10);
  at(pl, pebble(13, 'pause7', { pressed: true, ink: '#8a3e1c' }), 50, 10);
  const t = at(pl, el('div', 'ttl fade'), 82, 13); t.style.width = (vis ? 196 : 228) + 'px'; t.style.fontSize = '13.5px'; t.style.color = '#f1e3c4'; t.style.textShadow = '0 2px 0 rgba(0,0,0,.6)';
  t.innerHTML = `${SONG.t} <span style="font-weight:600;color:#bfae8a">&nbsp;·&nbsp; ${SONG.a}</span>`;
  at(pl, art(vis ? 98 : 114, 2, (put) => { const n = vis ? 98 : 114; for (let x = 0; x < n; x++) { put(x, 0, x < n * SONG.p ? '#ffc43c' : '#120a05'); put(x, 1, x < n * SONG.p ? '#c98c14' : '#3a2414'); } }), 82, 34);
  if (vis) at(pl, spectrum(5, 2, 9, { seed: 4 }), 284, 13);
  at(pl, pinBtn(false), 318, 12);
  return pl;
}


// ---------------------------------------------------------------- snapped: GAP or FLUSH (asked 2026-10-22)
/** A rounded rectangle with its own radius per corner [top-left, top-right, bottom-right, bottom-left]; 0 = square. */
function rrMask4(w, h, [tl, tr, br, bl]) {
  const m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const px = x + 0.5, py = y + 0.5, left = px < w / 2, top = py < h / 2, r = top ? (left ? tl : tr) : (left ? bl : br);
    if (!r) { m[y * w + x] = 1; continue; }
    const cx = left ? Math.max(r, px) : Math.min(w - r, px), cy = top ? Math.max(r, py) : Math.min(h - r, py);
    m[y * w + x] = Math.hypot(px - cx, py - cy) <= r + 0.01 ? 1 : 0;
  }
  return m;
}
function reBody(pl, w, h, corners, opts) { const b = shape(rrMask4(w, h, corners), w, h, opts); b.classList.add('body'); pl.querySelector('canvas.body').replaceWith(b); }
/** The Claude job reshaped as a tall column for the video's right side: stacked, never rotated; the product's own
 *  pill bar (SEA), Claude mark, words in the job pop-out's colours, the % in Figtree bold with tabular figures. */
function jobColumn(wA, hA, corners) {
  const d = box(a2(wA), a2(hA + 1));
  d.append(Object.assign(shape(rrMask4(wA, hA, corners), wA, hA, { band: 's2', E: 3, fill: fills.paper(hA) }), { className: 'body' }));
  const ic = new Image(); ic.src = '../../../src/Shell/pages/art/claude-icon.png'; ic.style.cssText = 'width:22px;height:22px;image-rendering:pixelated';
  at(d, ic, 14, 14); at(d, pinBtn(false), a2(wA) - 30, 12);
  const t = (txt, css) => { const e = el('div', '', txt); e.style.cssText = css; return e; };
  at(d, t('Waymark', 'font:700 15px Figtree,sans-serif;color:#8a3e1c;white-space:nowrap'), 14, 44);
  at(d, t('48%', 'font:700 30px/1 Figtree,sans-serif;font-variant-numeric:tabular-nums;color:#3a2a18'), 14, 70);
  at(d, pill(wA - 14, 9, P, [0.2, 0.4, 0.6, 0.8, 1], 0.48, 2, SEA, false), 14, 110);
  at(d, t('Folding the route list to one line', `font:600 13px/1.4 Figtree,sans-serif;color:#3a2a18;width:${a2(wA) - 28}px`), 14, 136);
  at(d, t('7 min left', 'font:600 12.5px Figtree,sans-serif;color:#6b5236'), 14, a2(hA) - 30);
  return d;
}
async function snapGroup(stage, X, Y, mode) {
  const gap = mode === 'gap' ? 6 : 0, VW = a2(AW), VH = 236, JW = 76, flush = mode === 'flush';
  const shadow = 'drop-shadow(0 4px 7px rgba(0,0,0,.5))';
  const wrap = el('div'); wrap.style.cssText = `position:absolute;left:${X}px;top:${Y}px;width:${VW + gap + a2(JW)}px;height:${VH + gap + a2(SH + 1)}px;${flush ? 'filter:' + shadow : ''}`; stage.append(wrap);
  const vid = el('iframe', 'prod'); vid.src = 'video.html'; Object.assign(vid.style, { left: '0px', top: '0px', width: VW + 'px', height: VH + 'px', zIndex: '1', filter: flush ? 'none' : shadow }); wrap.append(vid);
  await new Promise((r) => { vid.onload = r; setTimeout(r, 4000); });
  const fr = vid.contentDocument.querySelector('.frame'); fr.style.borderRadius = flush ? '12px 0 0 0' : '12px';
  const job = jobColumn(JW, VH / P - 1, flush ? [0, 12, 12, 12] : [12, 12, 12, 12]); at(wrap, job, VW + gap, 0, { filter: flush ? 'none' : shadow });
  const strip = shadeA(true); at(wrap, strip, 0, VH + gap, { filter: flush ? 'none' : shadow });
  if (flush) reBody(strip, AW, SH, [0, 0, 10, 10], { band: 's2', E: 3, fill: fills.wood(1.05) });
  return wrap;
}

const BUILD = { A: [playerA, shadeA], B: [playerB, shadeB], C: [playerC, shadeC] };

// ---------------------------------------------------------------- scenes
const big = (parent, x, y, text) => { const t = el('div', 'ftag'); t.innerHTML = text; return at(parent, t, x, y); };
/** A spring (Apple's response / dampingFraction form): where it is, 0..1, at t seconds. */
function spring(t, response = 0.5, zeta = 0.825) {
  const w = 2 * Math.PI / response, wd = w * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * w * t) * (Math.cos(wd * t) + zeta / Math.sqrt(1 - zeta * zeta) * Math.sin(wd * t));
}
/** The player caught part-way through folding: the same body at an in-between height, what does not fit tucked away. */
function foldAt(hArt) {
  if (hArt <= SH + 1) return shadeA(true);
  const pl = playerA('bars'); pl.style.height = a2(hArt + 1) + 'px'; pl.style.overflow = 'hidden';
  pl.querySelector('canvas.body').replaceWith(Object.assign(rr(AW, hArt, Math.min(12, Math.floor(hArt / 2) - 1), { band: 's2', E: 4, fill: fills.wood(1.05) }), { className: 'body' }));
  for (const c of [...pl.children]) { if (c.classList.contains('body')) continue; const top = parseInt(c.style.top) || 0, h = parseInt(c.style.height) || 40; if (top + h > a2(hArt - 4)) c.remove(); }
  return pl;
}
window.__ready = (async () => {
  await loadTex('band.png', 'tray.png');
  await document.fonts.load('22px VT323'); await document.fonts.ready;
  const stage = el('div'); stage.style.cssText = 'position:absolute;left:0;top:0;width:2000px;height:1400px'; document.body.append(stage);
  const [L, kind] = SCENE.split('-');
  let crop;
  if (SCENE === 'A-full') {
    const on = playerA('bars'), off = playerA('off');
    const h = a2(AH + 1), H = 40 + 2 * h + 64 + 30;
    aang(stage, 6, H - 214);
    at(stage, on, 220, 40); tag(stage, 222, 16, 'VISUALIZER <b>BARS</b>');
    at(stage, off, 220, 40 + h + 64); tag(stage, 222, 40 + h + 40, 'VISUALIZER <b>OFF</b> &middot; THE BIG TIME INSTEAD');
    crop = { x: 0, y: 0, w: 220 + a2(AW) + 36, h: H };
  } else if (SCENE === 'A-shade') {
    const H = 210; aang(stage, 6, H - 214);
    at(stage, shadeA(true), 220, 40); tag(stage, 222, 16, 'SHADE &middot; BARS <b>ON</b>');
    at(stage, shadeA(false), 220, 128); tag(stage, 222, 104, 'SHADE &middot; BARS <b>OFF</b>');
    crop = { x: 0, y: 0, w: 220 + a2(AW) + 36, h: H };
  } else if (SCENE === 'A-scene') {
    const H = 290;
    at(stage, playerA('scene', { scene: scene('temple', 1) }), 30, 44); tag(stage, 32, 20, 'SCENE <b>DUSK AT THE TEMPLE</b>');
    at(stage, playerA('scene', { scene: scene('campfire', 2) }), 30 + a2(AW) + 40, 44); tag(stage, 32 + a2(AW) + 40, 20, 'CLICK THE SCREEN &rarr; <b>CAMPFIRE</b>');
    big(stage, 32, 44 + a2(AH) + 26, 'THE VIS KEY GOES <b>BARS &rarr; SCENE &rarr; OFF</b>. IN SCENE, A CLICK ON THE SCREEN GOES TO THE NEXT SCENE. IT REMEMBERS.');
    crop = { x: 0, y: 0, w: 30 + a2(AW) * 2 + 40 + 30, h: H };
  } else if (SCENE === 'scenes') {
    const NAMES = [['temple', 'DUSK AT THE TEMPLE', 'LANTERNS RISE 1 PX A FRAME, WATER GLINTS'], ['rain', 'RAIN ON THE WINDOW', 'STREAKS FALL, DROPS SLIDE, A LIGHT GOES OUT'], ['campfire', 'CAMPFIRE', 'FLAMES FLICKER, SPARKS FLOAT UP, STARS TWINKLE'], ['appa', 'APPA IN THE CLOUDS', 'CLOUDS DRIFT PAST, APPA BOBS A PIXEL']];
    const S = 4, fw = SCW * S, fh = SCH * S, x0 = 24;
    NAMES.forEach(([n, title, how], row) => {
      const y = 22 + row * (fh + 64);
      big(stage, x0, y, `<b>${title}</b> &middot; ${how}`);
      for (let f = 0; f < 4; f++) {
        const c = roundCut(scene(n, f, S), 3); c.style.boxShadow = '0 0 0 4px #120a05, 0 0 0 6px #4a2e18'; c.style.borderRadius = '10px';
        at(stage, c, x0 + f * (fw + 26), y + 24);
        tag(stage, x0 + f * (fw + 26) + 4, y + 24 + fh + 8, `FRAME ${f + 1} &middot; ${f * 100} MS`);
      }
    });
    crop = { x: 0, y: 0, w: x0 + 4 * (fw + 26) + 4, h: 22 + 4 * (fh + 64) - 10 };
  } else if (SCENE === 'motion') {
    const x0 = 24, gap = 30; let y = 20;
    // 1 the marquee
    big(stage, x0, y, '<b>1 &middot; TITLE MARQUEE</b> &middot; 1 PIXEL EVERY 60 MS, A 1.5 S REST AT THE START, ONLY WHEN THE TITLE IS TOO LONG');
    [0, 60, 120].forEach((o, i) => { const s = shadeA(false, { off: o }); const w = el('div'); w.style.cssText = `position:absolute;width:${a2(AW)}px;height:${a2(SH + 1)}px`; w.append(s); s.style.left = '0'; s.style.top = '0';
      if (i < 3) at(stage, w, x0 + i * (a2(AW) + gap), y + 26); else at(stage, w, x0 + i * (a2(AW) + gap), y + 26);
      tag(stage, x0 + i * (a2(AW) + gap) + 4, y + 26 + a2(SH) + 10, ['0 S', '+3.6 S', '+7.2 S'][i]); });
    y += 26 + a2(SH) + 46;
    // 2 the bars with falling peaks
    big(stage, x0, y, '<b>2 &middot; BARS WITH FALLING PEAKS</b> &middot; 16 BARS AT 30 FPS; A BAR DROPS FAST, ITS PEAK CAP HANGS 300 MS THEN FALLS SLOWLY');
    let lv = [0.95, 0.85, 1, 0.8, 0.7, 0.85, 0.55, 0.6, 0.5, 0.4, 0.5, 0.35, 0.3, 0.3, 0.2, 0.15], pk = lv.slice();
    for (let f = 0; f < 4; f++) {
      const holder = rr(80, 22, 6, { band: 'recess', shadow: 0, fill: (x, yy) => (yy % 2 ? '#1a100a' : '#20140b') });
      at(stage, holder, x0 + f * (a2(80) + gap), y + 26);
      at(stage, bars(lv, pk, { h: 16, bw: 3 }), x0 + f * (a2(80) + gap) + a2(9), y + 26 + a2(3));
      tag(stage, x0 + f * (a2(80) + gap) + 4, y + 26 + a2(22) + 10, `${f * 100} MS`);
      pk = pk.map((p, i) => Math.max(lv[i] * 0.45, p - (f === 0 ? 0 : 0.12))); lv = lv.map((v, i) => Math.max(0.08, v * (0.45 + ((i * 7 + f * 3) % 5) * 0.06)));
    }
    y += 26 + a2(22) + 46;
    // 3 the key press
    big(stage, x0, y, '<b>3 &middot; A SOFT PRESS</b> &middot; THE KEY SINKS 2 PX AND ITS LIP HIDES (60 MS); LET GO AND IT SPRINGS BACK (0.25 S, A LITTLE BOUNCE)');
    [['REST', false], ['PRESSED &middot; DOWN 2 PX', true], ['LET GO &middot; 120 MS', false]].forEach(([t, down], i) => {
      const k = keycap(32, 19, i === 1 ? 'play' : 'play', { r: 6, pressed: down, ink: down ? '#8a3e1c' : '#3a2a18' });
      if (i === 2) k.style.filter = 'drop-shadow(0 0 5px rgba(255,196,60,.55))';
      at(stage, k, x0 + i * 190, y + 30); tag(stage, x0 + i * 190, y + 30 + a2(20) + 10, t);
    });
    y += 30 + a2(20) + 46;
    big(stage, x0, y, '<b>4 &middot; SCRUB</b> &middot; POINT AT THE BAR: THE BEAD LIGHTS. DRAG: THE BIG TIME FOLLOWS IN THE SCREEN. LET GO: THE BEAD SETTLES WITH ONE SMALL BOUNCE');
    [['REST', 0.42, false], ['GRABBED &middot; 2:30 IN THE SCREEN', 0.62, true], ['LET GO &middot; SETTLES', 0.62, false]].forEach(([t, p, g], i) => {
      const w = a2(140), holder = el('div'); holder.style.cssText = `position:absolute;width:${w}px;height:${a2(12)}px`;
      at(holder, seek(140, p, 6), 0, a2(2)); const kb = at(holder, bead(GOLDK), a2(Math.round(140 * p) - 4), 0, { zIndex: '3' });
      if (g) kb.style.filter = 'drop-shadow(0 0 5px rgba(255,196,60,.9))';
      at(stage, holder, x0 + i * (w + gap + 10), y + 32); tag(stage, x0 + i * (w + gap + 10), y + 32 + a2(12) + 10, t);
    });
    y += 32 + a2(12) + 40;
    crop = { x: 0, y: 0, w: x0 + 3 * (a2(AW) + gap), h: y };
  } else if (SCENE === 'fold') {
    // double-click: the player folds to the shade on a spring (response 0.5 s, damping 0.825), height only
    const T = [0, 0.1, 0.2, 0.5], x0 = 24, colW = a2(AW) + 60;
    T.forEach((t, i) => {
      const hArt = Math.round(AH - (AH - SH) * spring(t));
      const cx = x0 + (i % 2) * colW, cy = 44 + Math.floor(i / 2) * (a2(AH) + 66);
      at(stage, foldAt(hArt), cx, cy);
      tag(stage, cx + 2, cy - 22, `<b>${Math.round(t * 1000)} MS</b> &middot; ${hArt === SH ? 'THE SHADE, SETTLED' : i === 0 ? 'FULL, DOUBLE-CLICKED' : a2(hArt) + ' PX TALL'}`);
    });
    big(stage, x0, 44 + a2(AH) + 66 + 110, 'SPRING: RESPONSE 0.5 S, DAMPING 0.825 &middot; UNDER 1% OVERSHOOT &middot; DOUBLE-CLICK AGAIN AND IT OPENS THE SAME WAY');
    crop = { x: 0, y: 0, w: x0 + 2 * colW, h: 44 + a2(AH) + 66 + 140 };
  } else if (SCENE === 'snap') {
    const GW = a2(AW) + 6 + a2(76);
    tag(stage, 40, 18, '<b>GAP</b> &middot; 6 PX APART, EACH KEEPS ITS ROUND CORNERS AND SHADOW');
    tag(stage, 40 + GW + 90, 18, '<b>FLUSH</b> &middot; WINAMP STYLE, THE JOINED SIDES GO SQUARE, ONE SHADOW');
    await snapGroup(stage, 40, 44, 'gap'); await snapGroup(stage, 40 + GW + 90, 44, 'flush');
    await new Promise((r) => setTimeout(r, 500));
    crop = { x: 0, y: 0, w: 40 + 2 * GW + 90 + 40, h: 44 + 236 + 6 + a2(SH + 1) + 40 };
  } else if (SCENE === 'family') {
    const H = 470, X = 40, Y = 30, VW = a2(AW);
    const vid = el('iframe', 'prod'); vid.src = 'video.html'; Object.assign(vid.style, { left: X + 'px', top: Y + 'px', width: VW + 'px', height: '236px', zIndex: '1' }); stage.append(vid);
    const pl = playerA('bars'); at(stage, pl, X, Y + 236);
    const job = el('iframe', 'prod'); job.src = 'job.html'; Object.assign(job.style, { left: (X + VW - 16) + 'px', top: (Y + 236 - 36) + 'px', width: '420px', height: '120px', zIndex: '3' }); stage.append(job);
    at(stage, el('div', 'seam'), X + 18, Y + 235, { width: (VW - 36) + 'px', height: '2px' });
    at(stage, el('div', 'seam'), X + VW - 1, Y + 252, { width: '2px', height: '30px' });
    aang(stage, 840, H - 214);
    tag(stage, X, Y + 470, 'SNAPPED: VIDEO ON TOP, THE PLAYER UNDER IT, A CLAUDE JOB ON ITS RIGHT &middot; THEY DRAG AS ONE');
    await Promise.all([vid, job].map((f) => new Promise((r) => { f.onload = r; setTimeout(r, 4000); })));
    await new Promise((r) => setTimeout(r, 600));
    crop = { x: 0, y: 0, w: 1060, h: H + 50 };
  }
  await Promise.all([...document.images].map((i) => i.decode().catch(() => {})));
  return { crop };
})();

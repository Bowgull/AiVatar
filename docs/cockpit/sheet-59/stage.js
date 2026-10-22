// Sheet 59 (2026-10-22): the Spotify mini player, three looks, each FULL (visualizer on and off) and SHADE. Every
// surface is hand-placed pixels at exactly 2x: Samara's wood (band.png rim, tray.png surface), the bubble's paper, the
// job pop-out's pin, the product's own pill bar for the seek bar. Coordinates are CSS pixels, always even.
import { P, loadTex, rr, shape, drawMask, close, fills, spr, art, GLYPH, pin, cover, spectrum, mix, hex, paperAt, trayAt } from './pix.js';
import { pill } from '../../../src/Shell/pages/claudejobs.js';

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

// ---------------------------------------------------------------- A: Winamp in wood
function playerA(vis) {
  const W = 196, H = 80, pl = box(W * P, H * P);
  bodyOf(pl, rr(W, H, 9, { band: 's2', E: 4, fill: fills.wood(1.05) }));
  // the cover in a little sunken frame
  at(pl, rr(36, 36, 3, { band: 'recess', fill: fills.flat('#1a100a'), shadow: 0 }), 12, 12);
  at(pl, cover(32), 16, 16);
  // the LCD: a sunken window of warm dark glass
  const lw = 126, lh = 34;
  at(pl, rr(lw, lh, 4, { band: 'recess', shadow: 0, fill: (x, y) => (y % 2 ? mix('#1c110a', '#120a05', y / lh) : mix('#20140b', '#150c06', y / lh)) }), 92, 12);
  const lcd = at(pl, el('div', 'lcd'), 96, 16, { width: (lw - 4) * P + 'px', height: (lh - 4) * P + 'px' });
  const time = at(lcd, el('span', 'time', SONG.at), 8, vis ? 3 : 14);
  if (!vis) time.style.fontSize = '42px';
  if (vis) at(lcd, spectrum(13, 2, 10, { seed: 7 }), 8, 38);
  at(lcd, el('span', 'scroll', `${SONG.t.toUpperCase()}  ·  ${SONG.a.toUpperCase()}  ·`), 98, 6);
  at(lcd, el('span', 'sub', SONG.al), 98, 29);
  const tg = at(lcd, el('span', 'tags'), 98, 48); tg.innerHTML = '<i>SPOTIFY</i>&nbsp;&nbsp;LIKED&nbsp;&nbsp;3 / 11';
  // the pop-out family's pin, then shade and close
  at(pl, pinBtn(false), 358, 14);
  at(at(pl, keycap(14, 10, null), 354, 46), spr(GLYPH.shade, { O: '#3a2a18' }), 8, 6);
  at(at(pl, keycap(14, 10, null), 354, 70), spr(GLYPH.close, { O: '#3a2a18' }), 8, 6);
  // the seek bar with its times
  at(pl, el('span', 'tm d', SONG.at), 14, 94);
  at(pl, seek(147), 50, 90);
  at(pl, el('span', 'tm d', SONG.len), 352, 94);
  // the keys: prev, play (down: it is playing), next; the volume; the visualizer switch
  at(pl, keycap(22, 15, 'prev'), 12, 114);
  at(pl, keycap(28, 15, 'pause', { pressed: true, ink: '#8a3e1c' }), 60, 114);
  at(pl, keycap(22, 15, 'next'), 120, 114);
  at(pl, spr(GLYPH.vol, { O: '#d8c8a8' }, { drop: 'rgba(0,0,0,.6)' }), 178, 122);
  at(pl, hslider(60, 0.7), 202, 120);
  at(pl, keycap(26, 15, null, { label: 'VIS', led: vis ? 'on' : 'off', pressed: vis }), 332, 114);
  return pl;
}
function shadeA(vis) {
  const W = 176, H = 20, pl = box(W * P, H * P);
  bodyOf(pl, rr(W, H, 8, { band: 's2', E: 3, fill: fills.wood(1.05) }));
  at(pl, keycap(15, 12, 'pause7', { pressed: true, ink: '#8a3e1c' }), 8, 6);
  const lw = vis ? 112 : 132, lh = 12;
  at(pl, rr(lw, lh, 3, { band: 'recess', shadow: 0, fill: (x, y) => (y === lh - 3 ? (x < Math.round(lw * SONG.p) ? '#ffc43c' : '#3a2414') : y % 2 ? '#1a100a' : '#20140b') }), 42, 8);
  const lcd = at(pl, el('div', 'lcd'), 46, 10, { width: (lw - 4) * P + 'px', height: (lh - 5) * P + 'px' });
  const s = at(lcd, el('span', 'scroll', `${SONG.t.toUpperCase()}  ·  ${SONG.a.toUpperCase()}  ·  ${SONG.t.toUpperCase()}`), 4, -3); s.style.fontSize = '19px';
  const t = at(lcd, el('span', 'scroll', SONG.at), 0, -3); t.style.left = 'auto'; t.style.right = '0'; t.style.fontSize = '19px'; t.style.background = '#1d120a'; t.style.padding = '0 4px 0 6px'; t.style.boxShadow = '-8px 0 6px #1d120a';
  if (vis) at(pl, spectrum(6, 2, 10, { seed: 11, gap: 1 }), 42 + lw * 2 + 8, 10);
  at(pl, pinBtn(false), 322, 8);
  return pl;
}

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

const BUILD = { A: [playerA, shadeA], B: [playerB, shadeB], C: [playerC, shadeC] };

// ---------------------------------------------------------------- scenes
window.__ready = (async () => {
  await loadTex('band.png', 'tray.png');
  await document.fonts.load('22px VT323'); await document.fonts.ready;
  const stage = el('div'); stage.style.cssText = 'position:absolute;left:0;top:0;width:1600px;height:1000px'; document.body.append(stage);
  const [L, kind] = SCENE.split('-');
  let crop;
  if (kind === 'full') {
    const on = BUILD[L][0](true), off = BUILD[L][0](false);
    const w = parseInt(on.style.width), h = parseInt(on.style.height), H = 40 + 2 * h + 64 + 30;
    aang(stage, 6, H - 214);
    at(stage, on, 220, 40); tag(stage, 222, 16, 'VISUALIZER <b>ON</b>');
    at(stage, off, 220, 40 + h + 64); tag(stage, 222, 40 + h + 40, 'VISUALIZER <b>OFF</b>');
    crop = { x: 0, y: 0, w: 220 + w + 36, h: H };
  } else if (kind === 'shade') {
    const H = 200; aang(stage, 6, H - 214);
    const on = BUILD[L][1](true), off = BUILD[L][1](false);
    const w = parseInt(on.style.width);
    at(stage, on, 220, 40); tag(stage, 222, 16, 'SHADE &middot; VISUALIZER <b>ON</b>');
    at(stage, off, 220, 124); tag(stage, 222, 100, 'SHADE &middot; VISUALIZER <b>OFF</b>');
    crop = { x: 0, y: 0, w: 220 + w + 36, h: H };
  } else if (SCENE === 'family') {
    const H = 470, X = 40, Y = 30;
    const vid = el('iframe', 'prod'); vid.src = 'video.html'; Object.assign(vid.style, { left: X + 'px', top: Y + 'px', width: '392px', height: '230px', zIndex: '1' }); stage.append(vid);
    const pl = playerA(true); at(stage, pl, X, Y + 230);
    const job = el('iframe', 'prod'); job.src = 'job.html'; Object.assign(job.style, { left: (X + 392 - 16) + 'px', top: (Y + 230 - 36) + 'px', width: '420px', height: '120px', zIndex: '3' }); stage.append(job);
    // where they touch: the snap, a soft warm line
    at(stage, el('div', 'seam'), X + 14, Y + 229, { width: '364px', height: '2px' });
    at(stage, el('div', 'seam'), X + 391, Y + 240, { width: '2px', height: '30px' });
    aang(stage, 800, H - 214);
    tag(stage, X, Y + 404, 'SNAPPED: VIDEO ON TOP, THE PLAYER UNDER IT, A CLAUDE JOB ON ITS RIGHT &middot; THEY DRAG AS ONE');
    await Promise.all([vid, job].map((f) => new Promise((r) => { f.onload = r; setTimeout(r, 4000); })));
    await new Promise((r) => setTimeout(r, 600));
    crop = { x: 0, y: 0, w: 1000, h: H };
  }
  await Promise.all([...document.images].map((i) => i.decode().catch(() => {})));
  return { crop };
})();

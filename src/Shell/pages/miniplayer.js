// Sheet 59, the Spotify mini player (2026-10-22): the page. Look A, drawn by the sheet's own pixel kit (player/pix.js)
// at exactly 2x: Samara's wood body with soft pixel-stepped corners, the amber screen (big time in Figtree bold, the
// bars, the scrolling title clipped on whole pixels with a soft fade), ONE picture (the album cover, or a looping scene
// cross-faded into the same spot), the gold seek bead, the cream keys that sink 2 px and spring back, the volume groove
// with its round plum knob. Double-click (or the fold key) folds it to the thin shade strip.
// 2026-10-22 (his report, using it: "the bars / scene thing is so confusing"): the VIS key, click-the-picture and the
// four dots are gone. The face stays simple; the picture and the bars are chosen in its own menu, the ··· key by the
// pin (playermenu.html, its own small window). Joined in a family a right-click is the family's menu, so ··· stays.
//
// Cheap on purpose: nothing ticks unless something moves (bars only while playing and on, a scene at 10 fps only while
// it is the picture, the marquee only when the title is too long), and everything stops while the window is hidden, minimised or
// covered (WoW in front): the page's own visibility plus the main process's word.
import { P, loadTex, rr, rrMask, fills, spr, art, GLYPH, pin, cover, mix, hex, paperAt } from './player/pix.js';
import * as S from './player/scenes.js';
import { Timeline, fmtTime, marqueeOffset, barLevels, Peaks, pictureName, sliderAt } from './playerstate.js';

const api = window.player;
const H = 104, SH = 26;                          // art pixels; the window is twice that
// The shape the family gives it (familywin.ts SHAPE API): free (212 art wide), wide (a strip as wide as its neighbour,
// its own height) or tall (a column, 100 art wide: the picture on top, then the screen, then the keys).
let W = 212, HT = H, TALL = false;
const a2 = (n) => n * P;
const SHADE_PX = a2(SH);
const SKATER = 'mustard';                        // his pick: mustard hoodie + dark jeans (sun-side edge, legs rimmed)

const KNOB = ['..OOOOO..', '.OHHHFFO.', 'OHHFFFFSO', 'OHFFFFFSO', 'OHFFFFFSO', 'OFFFFFSSO', 'OFFFFSSSO', '.OFSSSSO.', '..OOOOO..'];
const GOLDK = { O: '#2a1a10', H: '#fff3d8', F: '#ffc43c', S: '#b97a22' };
const PLUMK = { O: '#120a05', H: '#d9c2ff', F: '#8a5cc4', S: '#4A2C6E' };
const GOLD = ['#fff3d8', '#ffe7b0', '#ffd88a', '#ffc96a', '#f0b04a', '#d9952f', '#b97a22', '#8f5a16'];
const CREAM = ['#fffaf0', '#fff3d8', '#f6e6c4', '#ecd5a8', '#e2c592', '#d6b47c', '#c9a46a', '#b8955e'];
const PLUMS = ['#d9c2ff', '#c4a4f0', '#b08ce0', '#9a74d0', '#8a5cc4', '#7a4cb0', '#62409a', '#4A2C6E'];
// Spotify's mark, pixel for pixel (his ask: the icon wherever Spotify is named)
const SPOT = ['..GGGGG..', '.GGGGGGG.', 'GKKKKKGGG', 'GGGGGGKGG', 'GGKKKKGGG', 'GGGGGKGGG', 'GGGKKKGGG', '.GGGGGGG.', '..GGGGG..'];

// ---------------------------------------------------------------- small makers
/** Pointer capture, never fatal (a made-up pointer cannot be captured). */
const cap = (e, id) => { try { e.setPointerCapture(id); } catch { /* not a live pointer */ } };
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
function at(parent, e, x, y, extra = {}) { e.style.left = x + 'px'; e.style.top = y + 'px'; if (!e.style.position) e.style.position = 'absolute'; Object.assign(e.style, extra); parent.append(e); return e; }

/** The product's round pill bar (claudejobs.js pill), still, at p 0..1: dark groove, filled from the left. */
function pillCanvas(w, ht, p, pal, c = null) {
  c ??= document.createElement('canvas');
  c.width = w; c.height = ht; c.style.width = w * P + 'px'; c.style.height = ht * P + 'px';
  const g = c.getContext('2d'), r = Math.floor(ht / 2);
  g.clearRect(0, 0, w, ht);
  const put = (x, y, col, a = 1) => { g.globalAlpha = a; g.fillStyle = col; g.fillRect(x, y, 1, 1); g.globalAlpha = 1; };
  const inside = (x, y) => { const cx = x < r ? r - 0.5 : x > w - 1 - r ? w - 1 - r + 0.5 : x, cy = y < r ? r - 0.5 : y > ht - 1 - r ? ht - 1 - r + 0.5 : y; return Math.hypot(x - cx, y - cy) <= r + 0.15; };
  for (let y = 0; y < ht; y++) for (let x = 0; x < w; x++) { if (!inside(x, y)) continue; const rim = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1); put(x, y, rim ? (y < ht / 2 ? '#6a4628' : '#3a2414') : y === 1 ? '#1a100a' : '#2a1a10'); }
  const fw = sliderAt(w, p).fill;           // the same sum as the knob's place (playerstate.js sliderAt)
  for (let x = 1; x < 1 + fw; x++) for (let y = 1; y < ht - 1; y++) { if (!(inside(x, y) && inside(x - 1, y) && inside(x + 1, y) && inside(x, y - 1) && inside(x, y + 1))) continue; put(x, y, pal[Math.min(7, Math.round((y - 1) / (ht - 3) * 7))]); }
  for (let x = 2; x < fw; x++) if (inside(x, 2)) put(x, 2, '#fff', 0.45);
  if (fw > 1) for (let y = 1; y < ht - 1; y++) { if (inside(fw, y)) put(fw, y, '#fffaf0'); if (inside(fw + 1, y)) put(fw + 1, y, '#fff3d8', 0.5); }
  c.dataset.fw = String(fw);
  return c;
}

/** A parchment keycap canvas set (the sheet's keycap): rest (with its lip) or pressed (sunk, no lip, a touch darker). */
function capFace(wA, hA, glyph, { pressed = false, ink = '#3a2a18', r = 6, label = null } = {}) {
  const k = el('div', pressed ? 'dn' : 'up'); k.style.cssText = `position:absolute;left:0;top:0;width:${a2(wA)}px;height:${a2(hA + 1)}px`;
  const body = rr(wA, hA, r, { band: 'edge', shadow: pressed ? 0 : 1, shadowCol: [40, 22, 8, 255],
    fill: (x, y, c) => { let p = paperAt(y / hA); if (pressed) p = mix(p, '#c9a46a', 0.35); if (c.d === 0 && c.lit > 0.3) p = pressed ? mix(p, '#7a5532', 0.45) : mix(p, '#ffffff', 0.55); if (!pressed && y === hA - 2) p = mix(p, '#b8955e', 0.5); return p; } });
  body.style.position = 'absolute'; body.style.top = (pressed ? P : 0) + 'px'; k.append(body);
  if (glyph) {
    const g = spr(GLYPH[glyph], { O: ink }); g.style.position = 'absolute';
    const gw = GLYPH[glyph][0].length, gh = GLYPH[glyph].length;
    g.style.left = a2(Math.round((wA - gw) / 2)) + 'px'; g.style.top = a2(Math.round((hA - gh) / 2) + (pressed ? 1 : 0)) + 'px'; k.append(g);
  }
  if (label) { const l = el('span', 'klab', label); l.style.top = (pressed ? P : 0) + Math.round(a2(hA) / 2 - 5) + 'px'; k.append(l); }
  return k;
}
/** A key he presses: sinks 2 px at once, springs back with a little bounce (sheet 59 motion 3). */
function makeKey(wA, hA, onPress, cls = '') {
  const k = el('div', 'key ' + cls); k.style.width = a2(wA) + 'px'; k.style.height = a2(hA + 1) + 'px';
  k.draw = (glyph, o = {}) => { k.replaceChildren(capFace(wA, hA, glyph, o), capFace(wA, hA, glyph, { ...o, pressed: true })); };
  k.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || k.classList.contains('off')) return;
    e.stopPropagation(); cap(k, e.pointerId); k.classList.add('down');
  });
  const up = (e, go) => {
    if (!k.classList.contains('down')) return;
    k.classList.remove('down');
    // let go: the rest face starts 2 px down and springs up
    k.classList.add('release'); void k.offsetWidth; k.classList.remove('release');
    if (go) onPress(e);
  };
  k.addEventListener('pointerup', (e) => { const r = k.getBoundingClientRect(); up(e, e.clientX >= r.left && e.clientX < r.right && e.clientY >= r.top && e.clientY < r.bottom); });
  k.addEventListener('pointercancel', (e) => up(e, false));
  k.addEventListener('dblclick', (e) => e.stopPropagation());
  return k;
}
/** A title key (pin, fold, close): plum, rounded, 28 px (the video pop-out's keys). */
function tkey(glyph, onPress, { on = false, size = 14 } = {}) {
  const k = el('div', 'tkey'); k.style.width = a2(size) + 'px'; k.style.height = a2(size + 1) + 'px';
  k.draw = (g2, on2) => {
    const body = rr(size, size, 5, { band: 'edge', shadow: 1, shadowCol: [8, 4, 2, 230], fill: (x, y, c) => {
      let t = hex(y < 2 ? '#6a4a9a' : y > size - 3 ? '#3a2258' : on2 ? '#6a3a96' : '#4A2C6E'); if (c.d === 0 && c.lit > 0.3) t = hex('#7a5aaa'); return t; } });
    body.style.position = 'absolute';
    const g = g2 === 'pin' ? pin(on2) : spr(GLYPH[g2], { O: '#f1e3c4' }, { drop: 'rgba(0,0,0,.55)' });
    const gw = g2 === 'pin' ? 9 : GLYPH[g2][0].length, gh = g2 === 'pin' ? 12 : GLYPH[g2].length;
    g.style.position = 'absolute'; g.style.left = a2(Math.floor((size - gw) / 2)) + 'px'; g.style.top = a2(Math.floor((size - gh) / 2)) + 'px';
    k.replaceChildren(body, g);
    k.classList.toggle('on', !!on2);
  };
  k.draw(glyph, on);
  k.addEventListener('pointerdown', (e) => e.stopPropagation());
  k.addEventListener('dblclick', (e) => e.stopPropagation());
  k.addEventListener('click', (e) => { e.stopPropagation(); onPress(e); });
  return k;
}
const bead = (pal) => spr(KNOB, pal, { drop: 'rgba(0,0,0,.45)' });

/** Winamp's bars into a canvas: levels 0..1, peak caps, blocks of 2 (sheet 59 motion 2). */
function drawBars(c, levels, peaks, { bw = 2, h = 10, gap = 1 } = {}) {
  const n = levels.length, Wd = n * (bw + gap) - gap, cols = ['#f0a64a', '#ffc43c', '#ffe096', '#ff8040'];
  if (c.width !== Wd || c.height !== h) { c.width = Wd; c.height = h; c.style.width = a2(Wd) + 'px'; c.style.height = a2(h) + 'px'; }
  const g = c.getContext('2d'); g.clearRect(0, 0, Wd, h);
  levels.forEach((lv, i) => {
    const top = Math.round(h - lv * h);
    for (let y = h - 1; y >= top; y--) { if ((h - 1 - y) % 2 === 1) continue; const q = 1 - y / h; g.fillStyle = q > 0.82 ? cols[3] : q > 0.6 ? cols[2] : q > 0.3 ? cols[1] : cols[0]; g.fillRect(i * (bw + gap), y, bw, 1); }
    const pk = Math.min(top - 1, Math.round(h - peaks[i] * h) - 1);
    if (pk >= 0) { g.globalAlpha = 0.95; g.fillStyle = '#fff3d8'; g.fillRect(i * (bw + gap), pk, bw, 1); g.globalAlpha = 1; }
  });
}

// ---------------------------------------------------------------- the one picture
const ROUND34 = rrMask(34, 34, 4);
const RGB = new Map();
const rgb = (c) => { let v = RGB.get(c); if (!v) { v = hex(c); RGB.set(c, v); } return v; };
function drawScene(c, name, f, t) {
  const g = c.getContext('2d'), im = g.createImageData(S.SW, S.SH), d = im.data;
  S[name](f, t, SKATER)((x, y, col) => { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= S.SW || y >= S.SH || !col) return; const i = (y * S.SW + x) * 4, v = rgb(col); d[i] = v[0]; d[i + 1] = v[1]; d[i + 2] = v[2]; d[i + 3] = 255; });
  for (let i = 0; i < ROUND34.length; i++) if (!ROUND34[i]) d[i * 4 + 3] = 0;
  g.putImageData(im, 0, 0);
}
/** The cover into its 68 px canvas: the real picture smoothed down, its corners cut on the same pixel staircase. */
function drawCover(c, img) {
  const g = c.getContext('2d'), n = Number(c.dataset.px) || 68, k = n / 34;
  c.width = n; c.height = n;
  g.clearRect(0, 0, n, n);
  if (img) { g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, n, n); }
  else { const pc = cover(34, 1); g.imageSmoothingEnabled = false; g.drawImage(pc, 0, 0, n, n); }
  const d = g.getImageData(0, 0, n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!ROUND34[Math.floor(y / k) * 34 + Math.floor(x / k)]) d.data[(y * n + x) * 4 + 3] = 0;
  g.putImageData(d, 0, 0);
}

// ---------------------------------------------------------------- state
const tl = new Timeline();
let ui = { picture: 'cover', bars: true, menu: false, shade: false, pinned: false, opacity: 1, through: false };
const isScene = () => ui.picture !== 'cover';
let awake = true;
let coverImg = null;
const peaks = new Peaks(14), peaks6 = new Peaks(6);
const root = document.getElementById('mp');
const F = {}, Sh = {};           // the full layout's and the shade's live parts
const bodies = new Map();

function bodyAt(hArt, shade) {
  const key = (shade ? 's' : 'f') + W + 'x' + hArt;
  let b = bodies.get(key);
  if (!b) { b = rr(W, hArt, 5, { band: 's2', E: shade ? 3 : 4, fill: fills.wood(1.05), shadow: 0 }); b.classList.add('body'); bodies.set(key, b); }
  return b;
}

// ---------------------------------------------------------------- the full player
function buildFull() {
  const L = el('div', 'lay full'); L.style.height = a2(HT) + 'px'; L.style.width = a2(W) + 'px';
  F.L = L; F.bodyHost = el('div'); L.append(F.bodyHost); F.bodyHost.append(bodyAt(HT, false));
  F.parts = [];
  const put = (e, x, y, h = 0) => { at(L, e, x, y); F.parts.push({ e, bottom: y + (h || e.offsetHeight || 20) }); return e; };
  // the title strip: Spotify's mark and name, or the app's; pin, fold, close (28 px). The column has room for the mark only.
  F.mark = put(spr(SPOT, { G: '#1ed760', K: '#0b2a14' }, { drop: 'rgba(0,0,0,.5)' }), a2(9), a2(8), 20);
  F.mark.classList.add('at');
  F.lab = put(el('span', 'lab at'), a2(21), a2(10), 22);
  F.lab.hidden = TALL;
  F.fade = put(fadeSlider(), a2(9), a2(7), 24);
  // his own menu: what the picture is, the bars on or off (the one door to them)
  F.more = put(tkey('more', () => { const r = F.more.getBoundingClientRect(); api.menu({ x: r.left, y: r.top, width: r.width, height: r.height }); }), a2(W - (TALL ? 59 : 75)), a2(5), 30);
  F.more.title = 'Picture and bars';
  F.pin = put(tkey('pin', () => api.pin(), {}), a2(W - (TALL ? 43 : 59)), a2(5), 30);
  F.pin.title = 'Pin on top (every pop-out follows)';
  F.pin.addEventListener('pointerenter', () => showFade(true));
  // the fold only where there is a strip to fold to (not as a column)
  if (!TALL) { F.fold = put(tkey('shade', () => api.shade()), a2(W - 43), a2(5), 30); F.fold.title = 'Fold to the strip (or double-click)'; }
  F.close = put(tkey('close', () => api.close()), a2(W - 27), a2(5), 30); F.close.title = 'Close';
  // the one picture in its sunken frame: 2 px a scene pixel, 4 px in a tall enough column
  const big = TALL && HT >= 192, R = big ? 72 : 38, px = big ? 136 : 68;
  const rx = TALL ? Math.round((W - R) / 2) : 8;
  put(rr(R, R, big ? 10 : 6, { band: 'recess', fill: fills.flat('#1a100a'), shadow: 0 }), a2(rx), a2(21), a2(R)).classList.add('at');
  const pic = el('div', 'pic'); F.pic = put(pic, a2(rx + 2), a2(23), px);
  pic.style.width = pic.style.height = px + 'px';
  F.cov = el('canvas', 'cov'); F.cov.dataset.px = String(px); F.scn = el('canvas', 'scn'); F.scn.width = S.SW; F.scn.height = S.SH;
  for (const c of [F.cov, F.scn]) { c.style.width = c.style.height = px + 'px'; }
  pic.append(F.cov, F.scn);
  drawCover(F.cov, coverImg);
  // the amber screen. Free or wide: time + bars | the song. A column: time + bars over the scrolling song.
  const LX = TALL ? 8 : 50, LY = TALL ? 21 + R + 5 : 21, lw = W - LX - 8, lh = TALL ? 30 : 38, div = TALL ? -1 : 61;
  put(rr(lw, lh, 7, { band: 'recess', shadow: 0, fill: (x, y) => (x === div && y > 4 && y < lh - 5 ? '#2c1a0e' : y % 2 ? mix('#1c110a', '#120a05', y / lh) : mix('#20140b', '#150c06', y / lh)) }), a2(LX), a2(LY), a2(lh)).classList.add('at');
  const lcd = el('div', 'lcd'); F.lcd = put(lcd, a2(LX + 2), a2(LY + 2), a2(lh - 4));
  const lcdW = a2(lw - 4);
  lcd.style.width = lcdW + 'px'; lcd.style.height = a2(lh - 4) + 'px';
  F.nb = TALL ? 10 : 14;
  F.time = at(lcd, el('span', 'time', '0:00'), TALL ? 6 : 12, TALL ? 2 : 6);
  F.bars = at(lcd, el('canvas'), TALL ? lcdW - 58 - 6 : 12, TALL ? 10 : 44);
  if (TALL) {
    F.pane = at(lcd, el('div', 'pane'), 2, 32, { width: lcdW - 4 + 'px', height: '20px' });
    F.scroll = at(F.pane, el('span', 'scroll'), 0, 0, { fontSize: '19px' });
    F.sub = el('span'); F.tags = el('span');
  } else {
    F.pane = at(lcd, el('div', 'pane'), 124, 6, { width: lcdW - 130 + 'px', height: '24px' });
    F.scroll = at(F.pane, el('span', 'scroll'), 0, 0);
    F.sub = at(lcd, el('span', 'sub'), 128, 30, { width: lcdW - 134 + 'px' });
    F.tags = at(lcd, el('span', 'tags'), 128, 52);
  }
  lcd.append(el('div', 'scan'));
  // the seek: the gold pill, an 18 px bead, the times (Figtree bold, readable). A column puts the times above the bar.
  const yb = TALL ? HT - 66 : 0;
  const sx = TALL ? 8 : 30, sw = TALL ? W - 16 : W - sx - 30, sy = TALL ? yb + 8 : 66;
  F.sw = sw; F.sx = sx;
  F.tPos = put(el('span', 'tm'), a2(8), TALL ? a2(yb) : a2(66) - 1, 14);
  F.seek = put(pillCanvas(sw, 6, 0, GOLD), a2(sx), a2(sy), 12); F.seek.classList.add('at');
  F.seekGrab = put(el('div', 'grab'), a2(sx) - 8, a2(sy - 4), 26);
  F.seekGrab.style.width = a2(sw) + 16 + 'px'; F.seekGrab.style.height = '26px';
  F.seekBead = put(bead(GOLDK), a2(sx - 4), a2(sy - 2), 20); F.seekBead.classList.add('bead', 'seekb');
  F.tLen = put(el('span', 'tm'), a2(W - 26), TALL ? a2(yb) : a2(66) - 1, 14);
  // the keys, 38 px tall
  const ky = TALL ? yb + 17 : 78, kx = TALL ? [7, 34, 67] : [8, 38, 74];
  F.prev = put(makeKey(26, 19, () => api.cmd('prev')), a2(kx[0]), a2(ky), a2(20)); F.prev.draw('prev'); F.prev.title = 'Previous';
  F.play = put(makeKey(32, 19, () => api.cmd('toggle')), a2(kx[1]), a2(ky), a2(20)); F.play.title = 'Play / pause';
  F.next = put(makeKey(26, 19, () => api.cmd('next')), a2(kx[2]), a2(ky), a2(20)); F.next.draw('next'); F.next.title = 'Next';
  const vy = TALL ? yb + 44 : 84, gx = TALL ? 8 : 106, vx = TALL ? 21 : 119, vw = W - vx - 12;
  F.volIcon = put(spr(GLYPH.vol, { O: '#d8c8a8' }, { drop: 'rgba(0,0,0,.6)' }), a2(gx), a2(vy), 20); F.volIcon.classList.add('at');
  F.vx = vx; F.vw = vw;
  F.vol = put(pillCanvas(vw, 7, 0, CREAM), a2(vx), a2(vy), 14); F.vol.classList.add('at', 'volp');   // empty until the volume is known
  F.volGrab = put(el('div', 'grab'), a2(vx) - 8, a2(vy - 4), 26);
  F.volGrab.style.width = a2(vw) + 16 + 'px'; F.volGrab.style.height = '26px'; F.volGrab.title = 'Spotify’s volume';
  F.volBead = put(bead(PLUMK), a2(vx + sliderAt(vw, 0).center - 4), a2(vy - 1), 20); F.volBead.classList.add('bead', 'volb');
  slider(F.seekGrab, (f, phase) => scrub(f, phase));
  slider(F.volGrab, (f, phase) => volume(f, phase));
  root.append(L);
}

// ---------------------------------------------------------------- the shade strip
function buildShade() {
  const L = el('div', 'lay shade'); L.style.height = a2(SH) + 'px'; L.style.width = a2(W) + 'px'; L.hidden = true;
  Sh.L = L; L.append(bodyAt(SH, true));
  Sh.play = at(L, makeKey(20, 17, () => api.cmd('toggle')), a2(5), a2(4)); Sh.play.title = 'Play / pause';
  Sh.recess = el('div'); at(L, Sh.recess, a2(29), a2(5), { zIndex: 1 });
  const lcd = el('div', 'lcd'); Sh.lcd = at(L, lcd, a2(31), a2(7), { borderRadius: '6px' });
  Sh.pane = at(lcd, el('div', 'pane'), 0, 0);
  Sh.scroll = at(Sh.pane, el('span', 'scroll'), 0, -2, { fontSize: '21px' });
  Sh.time = at(lcd, el('span', 'scroll'), 0, -2, { left: 'auto', right: '0', fontSize: '21px', background: '#1d120a', padding: '0 6px', boxShadow: '-8px 0 6px #1d120a' });
  Sh.line = at(L, el('canvas'), 0, 0, { zIndex: 2 });
  Sh.bars = at(L, el('canvas'), 0, a2(7), { zIndex: 2 });
  Sh.full = at(L, tkey('full', () => api.shade()), a2(W - 40), a2(5)); Sh.full.title = 'Back to full size (or double-click)';
  Sh.pin = at(L, tkey('pin', () => api.pin()), a2(W - 24), a2(5)); Sh.pin.title = 'Pin on top (every pop-out follows)';
  root.append(L);
}
let shadeKey = '';
function layShade() {
  // as wide as the strip allows: the screen takes whatever the player's width adds
  const bars = ui.bars, lw = (bars ? 112 : 132) + Math.max(0, W - 212), lh = 16, LX = 29, key = `${lw}`;
  if (key !== shadeKey) {
    shadeKey = key;
    Sh.recess.replaceChildren(rr(lw, lh, 5, { band: 'recess', shadow: 0, fill: (x, y) => (y % 2 ? '#1a100a' : '#20140b') }));
    Sh.lcd.style.width = a2(lw - 4) + 'px'; Sh.lcd.style.height = a2(lh - 7) + 'px';
    Sh.pane.style.width = a2(lw - 4) - 64 + 'px'; Sh.pane.style.height = a2(lh - 7) + 'px';
    Sh.line.style.left = a2(LX + 4) + 'px'; Sh.line.style.top = a2(5 + lh - 4) + 'px'; Sh.line.dataset.w = String(lw - 8);
    Sh.bars.style.left = a2(LX + lw + 3) + 'px';
  }
  Sh.bars.hidden = !bars;
}

// ---------------------------------------------------------------- the see-through slider (by the pin)
function fadeSlider() {
  const box = el('div', 'fade'); box.style.height = '24px';
  const wA = 44;
  const c = pillCanvas(wA, 7, 1, PLUMS); c.style.position = 'absolute'; c.style.left = '0'; c.style.top = '5px';
  const b = bead(PLUMK); b.style.position = 'absolute'; b.style.top = '3px'; b.classList.add('bead');
  const pct = el('span', '', '100%'); pct.style.cssText = 'position:absolute;left:' + (a2(wA) + 12) + 'px;top:5px';
  const g = el('div', 'grab'); g.style.cssText = `left:-6px;top:0;width:${a2(wA) + 12}px;height:24px`;
  box.append(c, g, b, pct);
  box.set = (v) => { const f = (v - 0.3) / 0.7; pillCanvas(wA, 7, f, PLUMS, c); b.style.left = a2(sliderAt(wA, f).center - 4) + 'px'; pct.textContent = Math.round(v * 100) + '%'; };
  box.set(1);
  slider(g, (f, phase) => { const v = 0.3 + 0.7 * f; box.set(v); if (phase !== 'start') api.opacity(v); });
  box.addEventListener('pointerleave', () => { if (!sliding) showFade(false); });
  return box;
}
let fadeT = 0;
function showFade(on) {
  clearTimeout(fadeT);
  F.fade.classList.toggle('show', on);
  F.lab.style.visibility = on ? 'hidden' : ''; F.mark.style.visibility = on ? 'hidden' : '';
  if (on) fadeT = setTimeout(() => { if (!F.fade.matches(':hover') && !F.pin.matches(':hover') && !sliding) showFade(false); else showFade(true); }, 2200);
}

// ---------------------------------------------------------------- sliders (seek, volume, see-through): grab anywhere
let sliding = false;
function slider(g, fn) {
  const frac = (e) => { const r = g.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left - 8) / (r.width - 16))); };
  g.addEventListener('pointerdown', (e) => { if (e.button !== 0 || g.classList.contains('off')) return; e.stopPropagation(); cap(g, e.pointerId); sliding = true; fn(frac(e), 'start'); });
  g.addEventListener('pointermove', (e) => { if (sliding && g.hasPointerCapture(e.pointerId)) fn(frac(e), 'move'); });
  const end = (e) => { if (!g.hasPointerCapture(e.pointerId)) return; sliding = false; fn(frac(e), 'end'); };
  g.addEventListener('pointerup', end); g.addEventListener('pointercancel', end);
  g.addEventListener('dblclick', (e) => e.stopPropagation());
}
let scrubbing = null;
function scrub(f, phase) {
  const s = tl.state;
  if (!(s.canSeek && s.duration > 0)) return;
  scrubbing = phase === 'end' ? null : f * s.duration;
  F.seekBead.classList.toggle('hot', phase !== 'end');
  if (phase === 'end') {
    const p = tl.seekTo(f * s.duration, Date.now());
    api.cmd('seek', p);
    F.seekBead.classList.add('settle'); setTimeout(() => F.seekBead.classList.remove('settle'), 320);
  }
  paintTime(true);
}
let volSent = 0, volHold = null;
function volume(f, phase) {
  if (tl.state.volume === null || tl.state.volume === undefined) return;
  paintVol(f);
  // what he set stays on the slider for a moment, so a late update still carrying the old volume does not snap it back
  volHold = { v: f, until: Date.now() + 1500 };
  const now = Date.now();
  if (phase === 'end' || now - volSent > 90) { api.cmd('volume', Math.round(f * 100) / 100); volSent = now; }
}

// ---------------------------------------------------------------- painting what changed
/** The picture and the bars, as chosen in the menu: a scene cross-fades in over the cover (and back out to it). */
function paintMode() {
  const sc = isScene();
  F.pic.classList.toggle('scene', sc);
  F.pic.title = sc ? pictureName(ui.picture) : '';
  F.pic.dataset.picture = ui.picture;
  if (sc) drawScene(F.scn, ui.picture, frame % 8, frame);
  F.bars.style.display = ui.bars ? '' : 'none';
  F.time.classList.toggle('big', !ui.bars);
  F.time.style.top = ui.bars ? '6px' : '14px';
  if (ui.bars) drawBars(F.bars, new Array(F.nb).fill(0.08), new Array(F.nb).fill(0.12));
  F.more.draw('more', !!ui.menu);
  layShade();
  wake();
}
function paintSong() {
  const s = tl.state, has = !!s.app;
  const spot = has && s.spotify;
  F.mark.style.display = spot ? '' : 'none';
  F.lab.style.left = a2(spot ? 21 : 9) + 'px';
  F.lab.innerHTML = '';
  const b = el('b', '', spot ? 'SPOTIFY' : has ? String(s.app).toUpperCase().slice(0, 16) : 'MUSIC');
  F.lab.append(b, document.createTextNode(has ? '' : '  ·  NOTHING PLAYING'));
  const words = has ? [s.title, s.artist].filter(Boolean).join('  ·  ').toUpperCase() : 'NOTHING PLAYING';
  for (const sc of [F.scroll, Sh.scroll]) { sc.textContent = words; sc.dataset.w = '0'; }
  F.sub.textContent = has ? (s.album || s.artist || '') : 'Play something in Spotify';
  if (note) paintNote();
  marqueeT0 = performance.now();
  paintStatus();
}
function paintStatus() {
  const s = tl.state, playing = tl.playing;
  F.play.draw(playing ? 'pause' : 'play', { ink: '#8a3e1c' });
  F.play.classList.toggle('held', playing);
  Sh.play.draw(playing ? 'pause7' : 'play7', { ink: '#8a3e1c', r: 6 });
  Sh.play.classList.toggle('held', playing);
  F.tags.innerHTML = '';
  const i = el('i', '', !s.app ? 'IDLE' : playing ? 'PLAYING' : s.status === 'paused' ? 'PAUSED' : s.status.toUpperCase());
  F.tags.append(i);
  const seekOk = s.canSeek && s.duration > 0;
  F.seekGrab.classList.toggle('off', !seekOk); F.seekBead.classList.toggle('dim', !seekOk);
  F.seekGrab.title = seekOk ? 'Grab and drag to move in the song' : '';
  const volOk = s.volume !== null && s.volume !== undefined;
  F.volGrab.classList.toggle('off', !volOk); F.volBead.classList.toggle('dim', !volOk);
  F.volGrab.title = volOk ? (s.device ? s.device.name + '’s volume' : 'Spotify’s volume') : '';
  // the knob and the fill always from the same number: the real volume, what he just set, or 0 while it is not known
  if (!sliding) paintVol(volOk ? (volHold && Date.now() < volHold.until ? volHold.v : s.volume) : 0);
  paintDevice();
  paintTime(true);
  wake();
}
function paintVol(f) {
  const at = sliderAt(F.vw, f);
  if (F.vol.dataset.fw !== String(at.fill)) pillCanvas(F.vw, 7, f, CREAM, F.vol);
  F.volBead.style.left = a2(F.vx + at.center - 4) + 'px';
  F.volBead.dataset.v = String(Math.round((Number(f) || 0) * 100));
}
// Spotify Connect (2026-10-22): which device it is playing on when that is not this PC ("iPhone", "Kitchen speaker"),
// a pixel icon and the name on the screen's status line; and one plain line when Spotify cannot be reached.
const DEV = {
  phone: ['OOOO', 'O..O', 'O..O', 'O..O', 'OOOO', 'OOOO'],
  computer: ['.OOOOO.', '.O...O.', '.O...O.', '.OOOOO.', 'OOOOOOO'],
  speaker: ['OOOOO', 'OO.OO', 'O...O', 'O.O.O', 'O...O', 'OOOOO'],
  tv: ['OOOOOOO', 'O.....O', 'O.....O', 'OOOOOOO', '..O.O..', '.OOOOO.'],
  car: ['..OOO..', '.O...O.', 'OOOOOOO', 'OOOOOOO', '.O...O.'],
  other: ['..OOO', '..O.O', '..O..', 'OOO..', 'OOO..', '.O...'],
};
let note = null;
function paintDevice() {
  const d = tl.state.app ? tl.state.device : null;
  F.tags.querySelector('.dev')?.remove();
  if (d) {
    const chip = el('span', 'dev'); chip.title = 'Playing on ' + d.name;
    chip.dataset.kind = d.kind;
    const ic = spr(DEV[d.kind] ?? DEV.other, { O: '#ffc43c' }); ic.classList.add('devic');
    chip.append(ic, el('b', '', d.name.toUpperCase().slice(0, 18)));
    F.tags.append(chip);
  }
  F.lcd.dataset.device = d ? d.name : '';
}
function paintNote() {
  F.sub.classList.toggle('note', !!note);
  if (note) F.sub.textContent = note;
  F.lcd.dataset.note = note ?? '';
  F.lcd.title = note ?? '';
}
let lastTime = '', lastPx = -1;
function paintTime(force = false) {
  const s = tl.state, now = Date.now();
  const pos = scrubbing ?? tl.shown(now), dur = s.duration;
  const t = fmtTime(pos);
  if (t !== lastTime || force) { lastTime = t; F.time.textContent = t; Sh.time.textContent = t; F.tPos.textContent = t; F.tLen.textContent = dur > 0 ? fmtTime(dur) : '-:--'; }
  const f = dur > 0 ? Math.min(1, pos / dur) : 0;
  const px = sliderAt(F.sw, f).center;
  if (px !== lastPx || force) {
    lastPx = px;
    pillCanvas(F.sw, 6, f, GOLD, F.seek);
    F.seekBead.style.left = a2(F.sx + px - 4) + 'px';
    const lw = Number(Sh.line.dataset.w) || 104;
    Sh.line.width = lw; Sh.line.height = 1; Sh.line.style.width = a2(lw) + 'px'; Sh.line.style.height = a2(1) + 'px';
    const g = Sh.line.getContext('2d'); const fx = Math.round(lw * f);
    g.fillStyle = '#3a2414'; g.fillRect(0, 0, lw, 1); g.fillStyle = '#ffc43c'; g.fillRect(0, 0, fx, 1);
  }
}

// ---------------------------------------------------------------- the clock: ticks only while something moves
let frame = 0, timer = 0, marqueeT0 = performance.now(), lastScene = 0, lastBars = 0, lastClock = 0, barT = 0;
const isAwake = () => awake && document.visibilityState === 'visible';
function needs() {
  if (!isAwake()) return 0;
  let ms = 0;
  const want = (n) => { ms = ms ? Math.min(ms, n) : n; };
  if (tl.playing || scrubbing !== null) want(100);
  if (isScene() && !shadeShown()) want(100);
  if (ui.bars && tl.playing) want(33);
  if (marqueeLive()) want(60);
  return ms;
}
function marqueeLive() {
  const sc = shadeShown() ? Sh.scroll : F.scroll, pane = shadeShown() ? Sh.pane : F.pane;
  return sc.offsetWidth > pane.clientWidth;
}
function wake() { if (!timer && needs()) timer = setTimeout(tick, 0); }
function tick() {
  timer = 0;
  if (!isAwake()) return;
  const now = performance.now();
  // the time and the bead, smoothly between the brain's updates
  if (now - lastClock >= 95) { lastClock = now; paintTime(); }
  // the marquee: whole pixels, a soft fade at the pane's edges (CSS mask)
  const sc = shadeShown() ? Sh.scroll : F.scroll, pane = shadeShown() ? Sh.pane : F.pane;
  const tw = sc.offsetWidth, bw = pane.clientWidth;
  if (tw > bw) {
    const off = marqueeOffset(now - marqueeT0, tw, bw);
    const lap = tw + 36;
    if (!sc.dataset.loop) { sc.dataset.loop = '1'; }
    sc.style.transform = `translateX(${-off}px)`;
    // the title comes round again behind itself
    if (!sc.nextSibling || !sc.nextSibling.classList?.contains('again')) { const c2 = el('span', 'scroll again'); c2.style.cssText = sc.style.cssText; pane.append(c2); }
    const again = sc.nextSibling; again.textContent = sc.textContent; again.style.transform = `translateX(${lap - off}px)`; again.style.top = sc.style.top; again.style.fontSize = sc.style.fontSize;
  } else { sc.style.transform = ''; if (sc.nextSibling?.classList?.contains('again')) sc.nextSibling.remove(); }
  // the bars, 30 fps, only while playing and on (the screen and the shade alike)
  if (ui.bars && tl.playing && now - lastBars >= 30) {
    const dt = lastBars ? Math.min(0.1, (now - lastBars) / 1000) : 0.03; lastBars = now; barT += dt;
    const lv = barLevels(barT);
    if (!shadeShown()) { const l = lv.slice(0, F.nb); drawBars(F.bars, l, peaks.step(l, dt)); }
    else { const l6 = [lv[0], lv[2], lv[4], lv[6], lv[9], lv[12]]; drawBars(Sh.bars, l6, peaks6.step(l6, dt), { h: 12 }); }
  }
  // the scene, 10 fps
  if (isScene() && !shadeShown() && now - lastScene >= 100) { lastScene = now; frame++; drawScene(F.scn, ui.picture, frame % 8, frame); }
  const ms = needs();
  if (ms) timer = setTimeout(tick, Math.max(16, ms - ((performance.now() - now) | 0)));
}
document.addEventListener('visibilitychange', () => { if (isAwake()) { lastBars = 0; wake(); } });

// ---------------------------------------------------------------- folding and reshaping
// The fold: the main process springs the window's height; the body is redrawn at each height and what no longer fits is
// tucked away, the strip taking over at the end. The shapes (family part 2): the family holds the panel (.mp) at
// --fam-w x --fam-h and says data-fam-shape; the player is rebuilt at that size. A column never folds.
const shadeShown = () => !!Sh.L && !Sh.L.hidden;
function shapeNow() {
  const h = document.documentElement, cs = getComputedStyle(h);
  const shape = h.dataset.famShape, fw = parseFloat(cs.getPropertyValue('--fam-w')), fh = parseFloat(cs.getPropertyValue('--fam-h'));
  if (shape === 'tall' && fw > 0) return { W: Math.round(fw / P), HT: Math.max(160, Math.round((fh > 0 ? fh : window.innerHeight) / P)), TALL: true };
  if (shape === 'wide' && fw > 0) return { W: Math.max(212, Math.round(fw / P)), HT: H, TALL: false };
  return { W: 212, HT: H, TALL: false };
}
function reshape() {
  const n = shapeNow();
  if (n.W === W && n.HT === HT && n.TALL === TALL) return false;
  W = n.W; HT = n.HT; TALL = n.TALL;
  F.L?.remove(); Sh.L?.remove(); shadeKey = ''; lastPx = -1;
  buildFull(); buildShade();
  layShade(); paintMode(); paintSong(); paintStatus();
  F.pin.draw('pin', ui.pinned); Sh.pin.draw('pin', ui.pinned); F.fade.set(ui.opacity);
  return true;
}
function fit() {
  if (!F.L) return;                // not built yet: the build fits itself
  reshape();
  const h = window.innerHeight;
  const shadeNow = !TALL && ui.shade && h <= SHADE_PX + 4;
  F.L.hidden = shadeNow; Sh.L.hidden = !shadeNow;
  if (!shadeNow) {
    const hArt = TALL ? HT : Math.max(SH, Math.min(H, Math.round(h / P)));
    const b = bodyAt(hArt, false);
    if (F.bodyHost.firstChild !== b) F.bodyHost.replaceChildren(b);
    F.L.style.height = a2(hArt) + 'px';
    for (const p of F.parts) p.e.style.visibility = !TALL && p.bottom > h - 6 && hArt < H ? 'hidden' : (p.e === F.mark || p.e === F.lab) && F.fade.classList.contains('show') ? 'hidden' : '';
  }
  wake();
}
window.addEventListener('resize', fit);
window.addEventListener('famshape', fit);

// ---------------------------------------------------------------- dragging and the double-click fold
let press = null;
root.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  press = { x: e.screenX, y: e.screenY, id: e.pointerId, moving: false };
  cap(root, e.pointerId);
});
root.addEventListener('pointermove', (e) => {
  if (!press || e.pointerId !== press.id) return;
  const dx = e.screenX - press.x, dy = e.screenY - press.y;
  if (!press.moving && Math.hypot(dx, dy) < 4) return;
  if (!press.moving) { press.moving = true; api.drag({ phase: 'start' }); }
  api.drag({ phase: 'move', dx, dy });
});
const letGo = (e) => {
  if (!press || e.pointerId !== press.id) return;
  if (press.moving) api.drag({ phase: e.type === 'pointercancel' ? 'cancel' : 'end', dx: e.screenX - press.x, dy: e.screenY - press.y });
  press = null;
};
root.addEventListener('pointerup', letGo); root.addEventListener('pointercancel', letGo);
root.addEventListener('dblclick', () => { if (!TALL) api.shade(); });

// ---------------------------------------------------------------- the main process (heard once the player is built)
function listen() {
api.onMedia((m) => {
  const what = tl.take(m, Date.now());
  if (m && 'thumb' in m) {
    if (typeof m.thumb === 'string' && m.thumb.startsWith('data:image/')) {
      const img = new Image(); img.onload = () => { coverImg = img; drawCover(F.cov, img); }; img.src = m.thumb;
    } else { coverImg = null; drawCover(F.cov, null); }
  }
  if (what === 'song') paintSong(); else if (what === 'status') paintStatus(); else paintTime();
  wake();
});
api.onUi((u) => {
  if (!u || typeof u !== 'object') return;
  const modeChanged = u.picture !== ui.picture || u.bars !== ui.bars || u.menu !== ui.menu, shadeChanged = u.shade !== ui.shade;
  ui = { ...ui, ...u };
  F.pin.draw('pin', ui.pinned); Sh.pin.draw('pin', ui.pinned);
  F.fade.set(ui.opacity);
  if (modeChanged) paintMode();
  if (shadeChanged) { marqueeT0 = performance.now(); fit(); }
  document.documentElement.classList.toggle('fam-through', !!ui.through);
});
api.onAwake((on) => { awake = on !== false; if (awake) { lastBars = 0; wake(); } });
api.onNote?.((t) => { const was = note; note = typeof t === 'string' && t ? t.slice(0, 80) : null; paintNote(); if (was && !note) paintSong(); });
}

window.__ready = (async () => {
  await loadTex('band.png', 'tray.png');
  try { await document.fonts.load('22px VT323'); await document.fonts.load('800 32px Figtree'); await document.fonts.ready; } catch { /* system fonts */ }
  buildFull(); buildShade();
  layShade(); paintMode(); paintSong(); fit();
  listen();
  api.ready();
  return true;
})();

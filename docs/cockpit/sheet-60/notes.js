// Sheet 60 (2026-10-22): the notes, three looks. Builders shared by the desktop stage (stage.js) and the Samara frame
// (samara.html). A picture maker. Every paper, rim, pin, box and switch is hand-placed pixels at exactly 2x (pix.js),
// the wood is Samara's own art, the words are Aang's three faces (Figtree, Cinzel, Silkscreen) plus the note fonts he
// already has (Patrick Hand, from sheet 17).
import { P, loadTex, rr, rrMask, dilate, show, shape, drawMask, fills, spr, art, pin as popPin, cover, mix, hex, paperAt, trayAt } from '../sheet-59/pix.js';

export const ROOT = new URL('../../../', import.meta.url).href;
export async function ready() {
  await loadTex('band.png', 'tray.png');
  await document.fonts.ready;
  await AANG_FACE;
}
export const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
export function at(parent, e, x, y, extra = {}) { e.style.position = 'absolute'; e.style.left = x + 'px'; e.style.top = y + 'px'; if (!e.style.zIndex) e.style.zIndex = '2'; Object.assign(e.style, extra); parent.append(e); return e; }

// ---------------------------------------------------------------- the notes (his four uses: to-do, thought, reference, for Claude)
export const NOTES = {
  // v2: the DEFAULT note is a plain note: no category, no title needed, just words and a colour
  plain: { title: '', col: 'B', html: '<p>Dentist moved to <b>Thu 3pm</b>.</p><p>Oat milk, bin bags, the good coffee.</p><p>That song from the café — Khruangbin?</p>' },
  plain2: { title: '', col: 'E', html: '<p>Momo hates the new food. Go back to the blue bag.</p>' },
  todo: { title: 'Before Friday', tag: 'To-do', cat: 'To-do', col: 'F', html:
    '<ul class="chk"><li class="done">Book the vet for Momo</li><li class="done">Passport photos</li><li>Call the bank</li><li>Renew the passport <b>(Fri)</b></li><li>Order Mom\'s gift</li></ul>' },
  thought: { title: 'Route list idea', tag: 'Idea', cat: 'Idea', col: 'C', html:
    '<p>Waymark: let the route list fold to <b>one line</b> while driving. Big next-turn only.</p><p class="dim">Thought of it on the 401.</p>' },
  ref: { title: 'Arms rotation', tag: 'Reference', cat: 'Reference', col: 'D', html:
    '<h4>Single target</h4><p><b>Colossus Smash</b> first, then Mortal Strike on cooldown.</p><div class="snip"></div><p><a>forever.warcraft.com/patch-notes</a></p>' },
  claude: { title: 'Samara bookmarks', tag: 'For Claude', cat: 'For Claude', col: 'E', html: '<p>Bookmarks shelf should open on hover, not click.</p>' },
  gift: { title: 'Gift ideas', tag: 'Idea', cat: 'Idea', col: 'A', html: '<ul><li>Pottery class</li><li>The blue teapot</li></ul>' },
  wifi: { title: '', col: 'C', html: '<p>Network: <b>Burrow-5G</b></p><p class="dim">Password in Bitwarden</p>' },
};
export const TAGS = [['To-do', 'B'], ['Idea', 'C'], ['Reference', 'D'], ['For Claude', 'E']];

// ---------------------------------------------------------------- per look: the colours
// A parchment, B colour papers, C journal pages. Colour keys: A gold, B butter, C mint, D peach/sky, E lilac.
const STICKY = { A: '#f3e2a6', B: '#f2df9a', C: '#cfe3c0', D: '#f2cfb4', E: '#dccff0', F: '#c9dcee' };
const DOT = { A: '#d9a83a', B: '#d9a83a', C: '#58a070', D: '#d07a4a', E: '#8a5cc4', F: '#4a8ac4' };
export const dotOf = (k) => DOT[k];

/** The paper of one note, w x h art pixels, in a look. */
export function paper(look, w, h, colKey = 'B', { lifted = true, small = false } = {}) {
  if (look === 'A' && small) return rr(w, h, 6, { band: 'edge', shadow: 1, shadowCol: [90, 60, 25, 110], fill: (x, y, c) => { const p = paperAt(y / h, [[0, '#fffaf0'], [1, '#f6e8c8']]); return c.d === 0 && c.lit > 0.3 ? mix(p, '#ffffff', 0.5) : p; } });
  if (look === 'A') return rr(w, h, 7, { band: 's2', E: 4, fill: fills.paper(h), shadow: 1 });
  if (look === 'B') {
    // v2 (his note "no harsh edges"): soft corners drawn as a pixel staircase (r 9, 7 on the board), a dark-wood edge not a black
    // line, no folded corner, and a soft shadow made of four stepped layers (whole pixels, never blurred)
    const base = hex(STICKY[colKey] ?? STICKY.B), r = small ? 7 : 9, m = rrMask(w, h, r);
    const paperC = shape(m, w, h, { band: 'edge', shadow: 0, fill: (x, y, c) => {
      let p = mix(base, '#ffffff', 0.16 * (1 - y / h));
      if (y < 6) p = mix(p, '#000000', 0.035);
      if (c.d === 0 && c.lit > 0.3) p = mix(p, '#ffffff', 0.4);
      if (c.d === 0 && c.lit < -0.3) p = mix(base, '#7a5532', 0.22);
      return p;
    } });
    const W = w + 4, H = h + 5, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'), img = g.createImageData(W, H);
    const layers = [[1, 0, 0.30], [2, 0, 0.20], [3, 1, 0.12], [4, 1, 0.06]];
    for (const [dy, grow, al] of layers) {
      const lm = grow ? dilate(m, w, h, grow) : m;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { if (!lm[y * w + x]) continue; const X = x + 2, Y = y + dy; if (Y >= H) continue;
        const i = (Y * W + X) * 4; if (img.data[i + 3] < al * 255) { img.data[i] = 18; img.data[i + 1] = 10; img.data[i + 2] = 6; img.data[i + 3] = Math.round(al * 255); } }
    }
    g.putImageData(img, 0, 0); g.drawImage(paperC, 2, 0);
    const out = show(c); out.style.marginLeft = -2 * P + 'px'; return out;
  }
  // C: a journal page: cream, ruled, a dark-wood spine down the left with gold stitches
  return rr(w, h, 4, { band: 'edge', shadow: 1, shadowCol: [10, 6, 3, 120], fill: (x, y, c) => {
    if (x < 9) { const t = trayAt(x + 20, y, 1.15); if (x === 4 && y % 6 < 3 && y > 4 && y < h - 4) return '#c98c14'; return x === 8 ? mix(t, '#120a05', 0.5) : t; }
    let p = paperAt(y / h, [[0, '#fbf3df'], [1, '#efdfbc']]);
    if (y > 28 && (y - 29) % 12 === 0 && x > 13 && x < w - 5) p = mix(p, '#b8955e', 0.32);
    if (x === 9) p = mix(p, '#7a5532', 0.35);
    if (c.d === 0 && c.lit > 0.3) p = mix(p, '#ffffff', 0.4);
    return p;
  } });
}

/** B's wood push-pin: a round wood head (Samara's tray colours), a gold glint, a short brass point. */
export function woodPin() {
  return spr(['...OOOOO...', '..OHHWWWO..', '.OHWWWWWSO.', 'OHWWWWWWWSO', 'OWWWWWWWWSO', 'OWWWWWWWSSO', '.OSWWWWSSO.', '..OOSSSOO..', '....OOO....', '.....Y.....', '.....Y.....', '.....Y.....'],
    { O: '#2c1c10', H: '#ffe096', W: '#7a5532', S: '#4a2e1a', Y: '#c98c14' }, { drop: 'rgba(0,0,0,.45)' });
}
/** C's ribbon bookmark (pinned), plum like the bubble's pointed-at answer. */
export function ribbon(len = 22) {
  const m = []; for (let y = 0; y < len; y++) m.push(y < len - 3 ? 'OHFFSO' : y === len - 3 ? 'OHFFSO' : y === len - 2 ? 'OHOOSO' : 'OO..OO');
  return spr(m, { O: '#2C1848', H: '#9a6ad8', F: '#6a3fa0', S: '#4A2C6E' }, { drop: 'rgba(0,0,0,.4)' });
}
export function pinFor(look, on = true) {
  if (look === 'A') return popPin(on);
  if (look === 'B') return woodPin();
  return ribbon();
}

/** A tick box, 7 x 7 art pixels: the job pop-out's teal done box, drawn as pixels. */
export function box(done, look) {
  const edge = look === 'C' ? '#7a5532' : '#6b5236';
  return art(7, 7, (put) => { for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
    const rim = x === 0 || y === 0 || x === 6 || y === 6, corner = (x === 0 || x === 6) && (y === 0 || y === 6);
    if (corner) continue;
    put(x, y, rim ? (done ? '#2f6f66' : edge) : done ? '#58b0a3' : 'rgba(255,255,255,.55)');
  }
  if (done) [[1, 3], [2, 4], [3, 5], [4, 4], [5, 3], [5, 2]].forEach(([x, y]) => put(x, y, '#ffffff')); });
}
/** "Aang can bring this up": a small switch, gold track and the plum gem when on. */
export function toggle(on) {
  return art(14, 8, (put) => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 14; x++) {
      const inside = Math.hypot(Math.max(0, Math.abs(x + 0.5 - 7) - 3), y + 0.5 - 4) <= 3.9; if (!inside) continue;
      const edge = Math.hypot(Math.max(0, Math.abs(x + 0.5 - 7) - 3), y + 0.5 - 4) > 3.0;
      put(x, y, edge ? '#4a2e1a' : on ? (y < 3 ? '#ffe096' : '#e9b949') : (y < 3 ? '#8a7a62' : '#6f6455'));
    }
    const kx = on ? 9 : 4;
    for (let y = 1; y < 7; y++) for (let x = kx - 3; x <= kx + 2; x++) { const d = Math.hypot(x + 0.5 - (kx + 0), y + 0.5 - 4); if (d > 3) continue;
      put(x, y, d > 2.3 ? '#120a05' : y < 3 ? '#d9c2ff' : y < 5 ? '#8a5cc4' : '#4A2C6E'); }
  });
}
// Aang's face for "Ask Aang": his idle frame's head, one art pixel each (whole-number, crisp)
let faceData = null;
const AANG_FACE = (async () => {
  const i = new Image(); i.src = ROOT + 'assets/aang/frames/idle_0.png'; await i.decode();
  const c = document.createElement('canvas'); c.width = 224; c.height = 224; const g = c.getContext('2d'); g.drawImage(i, 0, 0);
  faceData = g.getImageData(0, 0, 224, 224);
})();
export function face() {
  const W = 26, H = 26, x0 = 88, y0 = 78;
  return art(W, H, (put) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const k = ((y0 + y * 2) * 224 + x0 + x * 2) * 4, d = faceData.data; if (d[k + 3] > 128) put(x, y, [d[k], d[k + 1], d[k + 2]]); } }, 1);
}
export function askChip(look, label = 'Ask Aang') { const c = el('span', 'ask'); c.append(face(), el('span', '', label)); return c; }
/** The pasted snip: a picture with Snipit's dashed frame and its time. */
export function snipPic(wA = 60, hA = 24) {
  const d = el('div', 'snipbox'); const pic = cover(wA, P, 'sea');
  const crop = el('div', 'snipcrop'); crop.style.height = hA * P + 'px'; crop.style.width = wA * P + 'px'; crop.append(pic); pic.style.marginTop = -Math.round((wA - hA) / 2) * P + 'px';
  d.append(crop, el('div', 'sniptag', 'SNIP &middot; 14:02 &middot; FOREVER.WARCRAFT.COM'));
  return d;
}

/**
 * One note on the desktop: its paper, the pin, the words, and its foot (the switch and "Ask Aang").
 * size in CSS px (even numbers). opts: foot (default true), small (board card), pinned.
 */
export function note(look, n, w, h, { foot = true, small = false, pinned = false, bringUp = true, hover = false } = {}) {
  const d = el('div', `note lk${look}${small ? ' small' : ''}`); d.style.width = w + 'px'; d.style.height = h + 'px';
  const body = paper(look, w / P, h / P, n.col, { small }); body.classList.add('paper'); d.append(body);
  const inX = look === 'A' ? (small ? 14 : 18) : look === 'B' ? 14 : 28, inY = look === 'A' ? (small ? 12 : 16) : look === 'B' ? 20 : 12;
  const inner = at(d, el('div', 'inner'), inX, inY, { width: (w - inX - (look === 'A' ? 18 : 16)) + 'px', height: (h - inY - (foot ? 46 : 14)) + 'px' });
  const head = el('div', 'nhead');
  head.append(el('span', 'ndot'), el('span', 'nt', n.title));
  head.querySelector('.ndot').style.background = DOT[n.col];
  if (n.title) inner.append(head); else inner.classList.add('plain');
  if (look === 'B' && n.cat) inner.append(el('div', 'cats', `<span class="cat">${n.cat}</span>`));
  const later = look === 'B' && !n.cat && foot && !small;
  const nb = el('div', 'nb', n.html); inner.append(nb);
  nb.querySelectorAll('ul.chk li').forEach((li) => { li.prepend(box(li.classList.contains('done'), look)); });
  if (later) inner.append(el('div', 'cats', '<span class="cat ghost">+ category</span>'));
  const sn = nb.querySelector('.snip'); if (sn) sn.replaceWith(snipPic(small ? 44 : 68, small ? 16 : 24));
  if (look === 'A' && (pinned || !small)) at(d, pinFor('A', pinned), w - 34, small ? 8 : 14, { zIndex: '3' });
  if (look === 'B') at(d, woodPin(), w / 2 - 12, -10, { zIndex: '3' });
  if (look === 'C' && pinned) at(d, ribbon(small ? 16 : 22), w - 84, -4, { zIndex: '3' });
  // "Ask Aang about this note": his face, by the pin (a tip says it in full when pointed at)
  if (foot) { const ask = at(d, el('span', 'askf' + (hover ? ' hot' : '')), w - (look === 'A' ? 70 : 44), look === 'B' ? 22 : (small ? 8 : 14), { zIndex: '3' }); ask.append(face()); }
  if (hover) at(d, el('span', 'tip', 'Ask Aang about this note'), w - 196, look === 'B' ? -22 : -30, { zIndex: '4' });
  if (foot) {
    const f = at(d, el('div', 'nfoot'), inX, h - 40, { width: (w - inX - (look === 'A' ? 18 : 16)) + 'px' });
    const tg = el('span', 'bring'); tg.append(toggle(bringUp), el('span', '', bringUp ? 'Aang can bring this up' : 'Aang keeps this one to himself'));
    f.append(tg);
  }
  return d;
}

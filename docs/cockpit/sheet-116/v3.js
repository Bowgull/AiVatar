// Sheet 116 v3 (2026-11-01): the Satchel, redone after his "cheap, AI slop, not smooth". v1/v2 were a web page dressed in
// wood (cards, pills, Figtree); this is built from the parts of the look he approved (sheet 59's player): the beveled
// wood body, recessed amber displays (VT323), cream keycaps, Silkscreen labels, hand-placed pixel items. Three
// directions, live: A an inventory, B the bag itself, C a journal page.
//
// MOTION, one system for all three (his "they should lend to each other"): real springs stepped every frame, so anything
// can be interrupted mid-move and keeps its speed. BotW's quick slide with a soft settle (the panel), Stardew's crisp
// pops (items landing), FFX's calm glide (the cursor), the iPhone's flow (everything shuffling to make room, a new item
// flying in from where it came). Moves are big and a third of a second or more, because his screen is a video stream of
// the Shadow PC, where small fast motion smears.
import { P, rr, fills, cover, spr, art, mix, paperAt } from '../sheet-59/pix.js';
import { ready, el, face } from '../sheet-60/notes.js';

await ready();
const $ = (s, r = document) => r.querySelector(s);
const a2 = (n) => n * P;

// ---------------------------------------------------------------- the spring engine (one ticker, interruptible)
const live = new Set();
let slowK = 1;
/** A value that moves toward its target like a spring. response: seconds per swing; damping: 1 = no overshoot. */
function sv(v, response = 0.4, damping = 0.8, apply = () => {}) {
  const s = { v, t: v, vel: 0, response, damping, apply,
    to(t, o = {}) { this.t = t; if (o.response) this.response = o.response; if (o.damping !== undefined) this.damping = o.damping; if (o.kick) this.vel += o.kick; live.add(this); kick(); return this; },
    set(t) { this.v = this.t = t; this.vel = 0; this.apply(t); return this; } };
  apply(v); return s;
}
let ticking = false, last = 0;
function kick() { if (!ticking) { ticking = true; last = performance.now(); requestAnimationFrame(tick); } }
function tick(now) {
  const dt = Math.min(1 / 30, (now - last) / 1000) / slowK; last = now;
  for (const s of live) {
    const w = (2 * Math.PI) / s.response, steps = 4, h = dt / steps;
    for (let i = 0; i < steps; i++) { s.vel += (-(w * w) * (s.v - s.t) - 2 * s.damping * w * s.vel) * h; s.v += s.vel * h; }
    if (Math.abs(s.v - s.t) < 0.002 && Math.abs(s.vel) < 0.01) { s.v = s.t; s.vel = 0; live.delete(s); }
    s.apply(s.v);
  }
  if (live.size) requestAnimationFrame(tick); else ticking = false;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms * slowK));
// the four feels, named for where they come from
const FEEL = { slide: [0.42, 0.78], out: [0.3, 1], pop: [0.3, 0.52], glide: [0.2, 0.92], flow: [0.36, 0.82], fly: [0.55, 0.74], peek: [0.32, 0.6] };

// ---------------------------------------------------------------- pixel items (16 x 16, hand-placed, shown 2x)
const O = '#2c1c10';
const ITEM = {
  text: ['................', '..OOOOOOOOOOOO..', '.OHPPPPPPPPPPPO.', '.OPPPPPPPPPPPSO.', '..OOOOOOOOOOOO..', '...OLLLLLLLLO...', '...OLKKKKKKLO...', '...OLLLLLLLLO...', '...OLKKKKLLLO...', '...OLLLLLLLLO...', '...OLKKKKKKLO...', '...OLLLLLLLLO...', '..OOOOOOOOOOOO..', '.OHPPPPPPPPPPPO.', '.OPPPPPPPPPPPSO.', '..OOOOOOOOOOOO..'],
  link: ['................', '.OOOOOOOOOOOOOO.', '.OLLLLFLLLLFLLO.', '.OLLRLFLLLLFLLO.', '.OLRLRFLLLLFLLO.', '.OLLLLRLLLLFLLO.', '.OLLLLFRRLLFLLO.', '.OLLLLFLLRLFLLO.', '.OLLLLFLLLRFLLO.', '.OLLLLFLLXLXLLO.', '.OLLLLFLLLXFLLO.', '.OLLLLFLLXLXLLO.', '.OLLLLFLLLLFLLO.', '.OSSSSSSSSSSSSO.', '.OOOOOOOOOOOOOO.', '................'],
  file: ['................', '..OOOOOOOOO.....', '..OLLLLLLLOO....', '..OLLLLLLLOLO...', '..OLKKKKKLOOOO..', '..OLLLLLLLLLLO..', '..OLKKKKKKKKLO..', '..OLLLLLLLLLLO..', '..OLKKKKKKKLLO..', '..OLLLLLLLLLLO..', '..OLKKKKKLLRRO..', '..OLLLLLLLRDDRO.', '..OLLLLLLRDDDRO.', '..OLLLLLLLRRRO..', '..OOOOOOOOOOOO..', '................'],
  gem: ['................', '................', '.....OOOOOO.....', '....OHHAAAAO....', '...OHAAAAAAAO...', '..OHAAAAAAAAAO..', '..OOOOOOOOOOOO..', '...OAAAAAAAAO...', '....OAAAAAAO....', '.....OAAAAO.....', '......OAAO......', '.......OO.......', '................', '................', '................', '................'],
  code: ['................', '..OOOOOOOOOOOO..', '.OGGGGGGGGGGGGO.', '.OGHGGGGGGGGGDO.', '.OGCGGGGGGGGGDO.', '.OGGCGGGGGGGGDO.', '.OGGGCGGGGGGGDO.', '.OGGCGGGGGGGGDO.', '.OGCGGGCCCCGGDO.', '.OGGGGGGGGGGGDO.', '.OGDDDDDDDDDDDO.', '..OOOOOOOOOOOO..', '................', '................', '................', '................'],
};
const PAL = {
  text: { O, H: '#fff3d6', P: '#e9d3a6', S: '#b8955e', L: '#f6e7c4', K: '#a07a48' },
  link: { O, L: '#efdcae', F: '#d7c08e', R: '#c4372f', X: '#8a1f1a', S: '#b8955e' },
  file: { O, L: '#f6e7c4', K: '#a07a48', R: '#8a1f1a', D: '#c4372f' },
  code: { O, G: '#6e6a7c', H: '#a29eb4', D: '#4e4a5c', C: '#7fe3ff' },
};
const gemPal = (hex) => ({ O, A: hex, H: mix(hex, '#ffffff', 0.6) });
function itemIcon(it) { return spr(ITEM[it.kind === 'color' ? 'gem' : it.kind], it.kind === 'color' ? gemPal(it.hex) : PAL[it.kind], { drop: 'rgba(0,0,0,.45)' }); }
const SATCHEL = ['.....OOOOOO.....', '....OBBBBBBO....', '...OBO....OBO...', '...OB......BO...', '.OOOOOOOOOOOOOO.', 'OLLLLLLLLLLLLLLO', 'OHLLLLLGGGLLLLSO', 'OHLLLLLGYGLLLLSO', 'OOOOOOOGGGOOOOOO', 'OLLLLLLLLLLLLLLO', 'OHLLLLLLLLLLLLSO', 'OHLLLLLLLLLLLLSO', 'OSSSSSSSSSSSSSSO', '.OOOOOOOOOOOOOO.'];
const satchel = (s = P) => spr(SATCHEL, { O, B: '#6a4422', L: '#a8743c', H: '#c08a4c', S: '#7a5030', G: '#c98c14', Y: '#ffe096' }, { s, drop: 'rgba(0,0,0,.45)' });
// keycap glyphs, 9 x 9, one ink (the player's GLYPH style)
const GL = {
  copy: ['..OOOOOO.', '..O....O.', 'OOOOOO.O.', 'O....O.O.', 'O....O.O.', 'O....OOO.', 'O....O...', 'O....O...', 'OOOOOO...'],
  pin: ['.OOOOOOO.', '.O.....O.', '.O.....O.', '.O.....O.', '.O.....O.', '.O.....O.', '.O..O..O.', '.O.O.O.O.', '.OO...OO.'],
  note: ['OOOOOOOOO', 'O.......O', 'O.OOOOO.O', 'O.......O', 'O.OOOO..O', 'O.......O', 'O.OOO...O', 'O.......O', 'OOOOOOOOO'],
  bin: ['...OOO...', 'OOOOOOOOO', '.........', '.OOOOOOO.', '.O.O.O.O.', '.O.O.O.O.', '.O.O.O.O.', '.O.O.O.O.', '.OOOOOOO.'],
};

// ---------------------------------------------------------------- the player's parts
function keycap(wA, hA, glyph, { ink = '#3a2a18', down = false } = {}) {
  const k = el('div', 'kc3'); k.style.width = a2(wA) + 'px'; k.style.height = a2(hA + 1) + 'px';
  const body = rr(wA, hA, 5, { band: 'edge', shadow: down ? 0 : 1, shadowCol: [40, 22, 8, 255],
    fill: (x, y, c) => { let p = paperAt(y / hA); if (down) p = mix(p, '#c9a46a', 0.35); if (c.d === 0 && c.lit > 0.3) p = down ? mix(p, '#7a5532', 0.45) : mix(p, '#ffffff', 0.55); return p; } });
  body.classList.add('cap'); k.append(body);
  const g = glyph === 'ask' ? face() : spr(GL[glyph], { O: ink }); g.classList.add('gl'); k.append(g);
  return k;
}
const recess = (wA, hA, r = 6) => rr(wA, hA, r, { band: 'recess', shadow: 0, fill: (x, y) => (y % 2 ? mix('#1c110a', '#120a05', y / hA) : mix('#20140b', '#150c06', y / hA)) });
function slotArt(gold = false) {
  const s = rr(32, 32, 6, { band: 'recess', shadow: 0, fill: (x, y) => mix('#24170d', '#140b06', y / 32) });
  if (!gold) return s;
  const g = rr(32, 32, 6, { band: 'edge', shadow: 0, fill: (x, y, c) => (c.d <= 1 ? (c.lit > 0 ? '#ffe096' : '#c98c14') : 'rgba(0,0,0,0)') });
  const d = el('div', 'goldslot'); d.append(s, g); return d;
}
function thumb(it, n) {
  if (it.kind === 'pic' || it.kind === 'snip') {
    const w = el('div', 'thumb' + (it.kind === 'snip' ? ' snip' : '')); const c = cover(n, P, it.kind === 'snip' ? 'sea' : 'dusk'); w.append(c); return w;
  }
  return itemIcon(it);
}

// ---------------------------------------------------------------- the things in it (made up)
const ITEMS = [
  { kind: 'link', pinned: true, name: 'Forever 1.4 patch notes', from: 'Samara', at: 'pinned', body: 'forever.warcraft.com/patch-notes' },
  { kind: 'text', pinned: true, name: 'Molten Core, Fri 8pm', from: 'Discord', at: 'pinned', body: 'Molten Core, Fri 8pm. Bring fire resist.' },
  { kind: 'snip', name: 'A snip', from: 'Snipit', at: '8:58 pm', body: 'snip of forever.warcraft.com' },
  { kind: 'pic', name: 'A picture', from: 'the Mac', at: '8:31 pm', body: 'copied on the MacBook' },
  { kind: 'file', name: 'Lease renewal.pdf', from: 'Explorer', at: '7:05 pm', body: '412 KB. Drag it anywhere.' },
  { kind: 'color', hex: '#A970FF', name: '#A970FF', from: 'a colour', at: '6:50 pm', body: 'Qwen purple' },
  { kind: 'code', name: 'git push --follow-tags', from: 'Terminal', at: '6:12 pm', body: 'git push origin main --follow-tags' },
];
const NEWS = [
  { kind: 'text', name: 'the blue bag coffee', from: 'Notepad', at: 'just now', body: 'the good coffee is the one in the blue bag' },
  { kind: 'link', name: 'Tiny Desk, full set', from: 'Samara', at: 'just now', body: 'youtube.com/watch?v=tinydesk' },
  { kind: 'pic', name: 'Raid comp.png', from: 'dragged in', at: 'just now', body: '1.2 MB picture' },
];
const KIND = { text: 'WORDS', link: 'LINK', file: 'FILE', color: 'COLOUR', code: 'COMMAND', pic: 'PICTURE', snip: 'SNIP' };
const WORDS = { copy: 'COPY IT', pin: 'PIN TO THE TOP', note: 'KEEP AS A NOTE', ask: 'ASK AANG ABOUT IT', bin: 'BIN IT' };

// ---------------------------------------------------------------- a stage: his main screen, the hover spot, the tab
function stage(host, name) {
  const d = el('div', 'stage116'); host.append(d);
  d.append(el('div', 'wall', name));
  const zone = el('div', 'zone'); d.append(zone);
  const tab = el('div', 'tab3'); const tw = rr(24, 34, 7, { band: 's2', E: 3, fill: fills.wood(1.05) }); tw.classList.add('tw'); tab.append(tw); const ic = satchel(); ic.classList.add('ti'); tab.append(ic); d.append(tab);
  const tx = sv(60, ...FEEL.peek, (v) => { tab.style.transform = `translateX(${v}px)`; });
  let hide = null, game = false;
  const on = () => { if (game || d.classList.contains('open')) return; clearTimeout(hide); tx.to(0, { response: FEEL.peek[0], damping: FEEL.peek[1] }); };
  const off = () => { clearTimeout(hide); hide = setTimeout(() => tx.to(60, { response: 0.26, damping: 1 }), 650); };
  for (const t of [zone, tab]) { t.addEventListener('mouseenter', on); t.addEventListener('mouseleave', off); }
  return { d, tab, tx, setGame: (g) => { game = g; if (g) tx.to(60); } };
}

// ================================================================ A · THE INVENTORY
function inventory(host) {
  const S = stage(host, 'A · THE INVENTORY');
  const W = 200, H = 284;
  const pnl = el('div', 'pnl'); pnl.style.width = a2(W) + 'px'; pnl.style.height = a2(H + 1) + 'px'; S.d.append(pnl);
  const body = rr(W, H, 12, { band: 's2', E: 4, fill: fills.wood(1.05) }); body.classList.add('body'); pnl.append(body);
  const head = el('div', 'phead'); const hi = satchel(); head.append(hi, el('span', 'lab d', 'SATCHEL'), el('span', 'lab cnt', '')); pnl.append(head);
  // the find box: a strip of the same amber glass
  const fb = el('div', 'find'); fb.append(recess(W - 16, 15, 5)); const inp = el('input', 'fin'); inp.placeholder = 'TYPE TO FIND'; fb.append(inp); pnl.append(fb);
  const filt = el('div', 'filt'); ['ALL', 'WORDS', 'LINKS', 'PICTURES', 'SNIPS', 'FILES'].forEach((t, i) => filt.append(el('span', i ? '' : 'on', t))); pnl.append(filt);
  // the slots: 5 across, pinned first in gold
  const grid = el('div', 'grid'); pnl.append(grid);
  const COLS = 5, SZ = a2(32), GAP = 8, OX = 0;
  const cursor = el('div', 'cur'); grid.append(cursor);
  const cx = sv(0, ...FEEL.glide, (v) => { cursor.style.left = v + 'px'; }), cy = sv(0, ...FEEL.glide, (v) => { cursor.style.top = v + 'px'; });
  const cs = sv(0, ...FEEL.pop, (v) => { cursor.style.transform = `scale(${v})`; });
  // the display: what the cursor is on, in amber; the keys under it; the word of the key under the mouse in its last line
  const lcdBox = el('div', 'lcdbox'); lcdBox.append(recess(W - 16, 58, 7)); const lcd = el('div', 'lcd3'); lcdBox.append(lcd); pnl.append(lcdBox);
  const keys = el('div', 'keys3'); pnl.append(keys);
  const hint = el('div', 'hint3');
  for (const k of ['copy', 'pin', 'note', 'ask', 'bin']) {
    const kc = keycap(30, 17, k, { ink: k === 'bin' ? '#8a3e1c' : k === 'ask' ? '#4A2C6E' : '#3a2a18' }); keys.append(kc);
    kc.addEventListener('mouseenter', () => { hint.textContent = WORDS[k]; }); kc.addEventListener('mouseleave', () => { hint.textContent = ''; });
    kc.addEventListener('pointerdown', () => { kc.classList.add('down'); }); kc.addEventListener('pointerup', () => { kc.classList.remove('down'); if (k === 'copy') copied(); });
  }
  const items = [];
  function place(i) { return { x: OX + (i % COLS) * (SZ + GAP), y: Math.floor(i / COLS) * (SZ + GAP) }; }
  function slotFor(it) {
    const s = el('div', 'slot'); s.append(slotArt(it.pinned)); const t = thumb(it, 26); t.classList.add('it'); s.append(t);
    const o = { it, s, x: sv(0, ...FEEL.flow, (v) => { s.style.left = v + 'px'; }), y: sv(0, ...FEEL.flow, (v) => { s.style.top = v + 'px'; }),
      k: sv(1, ...FEEL.pop, (v) => { s.style.transform = `scale(${v})`; }), lift: sv(0, 0.2, 0.6, (v) => { t.style.transform = `translateY(${-v}px) scale(${1 + v / 40})`; }) };
    s.addEventListener('mouseenter', () => { o.lift.to(4); select(items.indexOf(o)); });
    s.addEventListener('mouseleave', () => o.lift.to(0));
    s.addEventListener('click', () => { select(items.indexOf(o)); copied(); });
    grid.append(s); return o;
  }
  for (const it of ITEMS) items.push(slotFor(it));
  function layout(snap = false) { items.forEach((o, i) => { const p = place(i); if (snap) { o.x.set(p.x); o.y.set(p.y); } else { o.x.to(p.x); o.y.to(p.y); } }); head.querySelector('.cnt').textContent = `${items.length} THINGS`; }
  layout(true);
  let sel = 0;
  function select(i) {
    if (i < 0 || i >= items.length) return; sel = i; const p = place(i);
    cx.to(p.x - 6); cy.to(p.y - 6);
    const it = items[i].it;
    lcd.innerHTML = `<div class="l1">${it.name.toUpperCase()}</div><div class="l2">${KIND[it.kind]} &middot; ${it.from.toUpperCase()} &middot; ${it.at.toUpperCase()}</div><div class="l3">${it.body}</div>`;
    lcd.append(hint);
  }
  function copied() { const t = el('div', 'copied', 'COPIED'); lcdBox.append(t); setTimeout(() => t.remove(), 1100 * slowK); const o = items[sel]; o.k.to(1, { kick: -4 }); }
  // opening: the panel slides in from the edge with a soft settle (BotW), the slots pop in one after another (Stardew)
  const px = sv(a2(W) + 40, ...FEEL.slide, (v) => { pnl.style.transform = `translateX(${v}px)`; });
  let isOpen = false;
  async function setOpen(v) {
    if (v === isOpen) return; isOpen = v; S.d.classList.toggle('open', v);
    if (v) {
      S.tx.to(60, { response: 0.22, damping: 1 }); px.to(0, { response: FEEL.slide[0], damping: FEEL.slide[1] });
      items.forEach((o, i) => { o.k.set(0.3); setTimeout(() => o.k.to(1, { response: FEEL.pop[0], damping: FEEL.pop[1] }), (90 + i * 26) * slowK); });
      cs.set(0); setTimeout(() => cs.to(1), 260 * slowK); select(0); inp.value = '';
      // ready to type, without the browser scrolling the scene sideways to show the box mid-slide (that shifted the tab)
      setTimeout(() => { inp.focus({ preventScroll: true }); S.d.scrollLeft = 0; }, 120);
    } else { entered = false; clearTimeout(wander); px.to(a2(W) + 40, { response: FEEL.out[0], damping: FEEL.out[1] }); inp.blur(); }
  }
  S.tab.addEventListener('click', () => setOpen(true));
  S.d.addEventListener('pointerdown', (e) => { if (isOpen && !pnl.contains(e.target)) setOpen(false); });
  // "wandered off" counts only once he has really been in it: the panel sliding in under a resting mouse is not him
  let entered = false, wander = null;
  pnl.addEventListener('mousemove', () => { if (isOpen && Math.abs(px.v) < 3) entered = true; clearTimeout(wander); });
  pnl.addEventListener('mouseleave', () => { if (entered && isOpen) wander = setTimeout(() => { entered = false; setOpen(false); }, 900); });
  pnl.addEventListener('keydown', (e) => {
    const m = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: COLS, ArrowUp: -COLS }[e.key];
    if (m) { e.preventDefault(); select(Math.max(0, Math.min(items.length - 1, sel + m))); }
    if (e.key === 'Enter') { copied(); setTimeout(() => setOpen(false), 380 * slowK); }
    if (e.key === 'Escape') setOpen(false);
  });
  inp.addEventListener('input', () => { const q = inp.value.trim().toLowerCase(); items.forEach((o) => { const hit = !q || `${o.it.name} ${o.it.body} ${o.it.from} ${KIND[o.it.kind]}`.toLowerCase().includes(q); o.k.to(hit ? 1 : 0.55); o.s.classList.toggle('dim', !hit); }); });
  // a new copy flies in from where it was made (the iPhone's flow), the rest make room
  let n = 0;
  async function arrive(from) {
    if (!isOpen) { setOpen(true); await wait(380); }
    const it = NEWS[n++ % NEWS.length]; const firstToday = items.findIndex((o) => !o.it.pinned);
    const o = slotFor(it); items.splice(firstToday, 0, o);
    const gr = grid.getBoundingClientRect(), fr = from.getBoundingClientRect();
    o.x.set(fr.left - gr.left); o.y.set(fr.top - gr.top); o.k.set(0.5);
    const p = place(firstToday);
    o.x.to(p.x, { response: FEEL.fly[0], damping: FEEL.fly[1] }); o.y.to(p.y, { response: FEEL.fly[0], damping: FEEL.fly[1], kick: -900 }); o.k.to(1, { response: 0.5, damping: 0.6 });
    items.forEach((q, i) => { if (q !== o) { const pp = place(i); q.x.to(pp.x); q.y.to(pp.y); } });
    head.querySelector('.cnt').textContent = `${items.length} THINGS`;
    await wait(420); select(firstToday);
  }
  return { setOpen, arrive, isOpen: () => isOpen, S };
}

// ================================================================ B · THE BAG
function bag(host) {
  const S = stage(host, 'B · THE BAG');
  const pnl = el('div', 'bagp'); S.d.append(pnl);
  // a big leather satchel, hand-placed; its flap is its own layer so it can swing open
  const W = 110, H = 70;
  const leather = (x, y, top) => { const g = ((x * 7 + y * 13) % 11 === 0) ? 0.08 : ((x * 5 + y * 3) % 17 === 0 ? -0.06 : 0); const base = mix('#8a5a2a', '#3e2412', Math.min(1, y / H * 0.85 + g)); return top ? mix(base, '#a8743c', 0.18) : base; };
  const bodyC = rr(W, H, 10, { band: 'edge', shadow: 2, shadowCol: [10, 6, 3, 160], fill: (x, y, c) => { let p = leather(x, y); if (c.d === 0 && c.lit > 0.3) p = mix(p, '#e0a868', 0.5); if ((c.d === 3) && ((x + y) % 4 < 2)) p = '#d9b07a'; return p; } });
  bodyC.classList.add('bagbody'); pnl.append(bodyC);
  const strap = art(W, 26, (put) => { for (let x = 18; x < W - 18; x++) { const yy = Math.round(22 - 20 * Math.sin(Math.PI * (x - 18) / (W - 36))); for (let k = 0; k < 4; k++) put(x, yy + k, k === 0 ? '#c08a4c' : k === 3 ? '#4a2e1a' : '#7a5030'); } });
  strap.classList.add('strap'); pnl.append(strap);
  const inside = el('div', 'inside'); pnl.append(inside);
  const flap = el('div', 'flap'); const fc = rr(W - 4, 34, 10, { band: 'edge', shadow: 1, shadowCol: [10, 6, 3, 180], fill: (x, y, c) => { let p = leather(x, y, true); if (c.d === 0 && c.lit > 0.3) p = mix(p, '#e8b070', 0.5); if (c.d === 3 && ((x + y) % 4 < 2)) p = '#e0bc86'; if (y === 30) p = mix(p, '#2a1708', 0.5); return p; } });
  flap.append(fc); const buckle = spr(['OOOOOOO', 'OGGGGGO', 'OGYYYGO', 'OGY.YGO', 'OGYYYGO', 'OGGGGGO', 'OOOOOOO'], { O, G: '#c98c14', Y: '#ffe096' }, { drop: 'rgba(0,0,0,.5)' }); buckle.classList.add('buckle'); flap.append(buckle); pnl.append(flap);
  const fr = sv(0, 0.5, 0.62, (v) => { flap.style.transform = `perspective(500px) rotateX(${v}deg)`; });
  const py = sv(a2(H) + 120, ...FEEL.slide, (v) => { pnl.style.transform = `translateY(${v}px)`; });
  const outs = ITEMS.slice(0, 7).map((it) => { const o = el('div', 'bagitem'); const t = thumb(it, 22); o.append(t, el('span', 'nm', it.name)); inside.append(o);
    return { o, x: sv(0, ...FEEL.fly, (v) => { o.style.setProperty('--x', v + 'px'); }), y: sv(0, ...FEEL.fly, (v) => { o.style.setProperty('--y', v + 'px'); }), k: sv(0, ...FEEL.pop, (v) => { o.style.setProperty('--k', v); }) }; });
  let isOpen = false;
  async function setOpen(v) {
    if (v === isOpen) return; isOpen = v; S.d.classList.toggle('open', v);
    if (v) {
      S.tx.to(60); py.to(0);
      await wait(260); fr.to(-120, { response: 0.5, damping: 0.62 });
      await wait(140);
      // the things come out in a fan, one after another, and settle on the arc above the bag
      outs.forEach((q, i) => { const a = Math.PI * (0.9 - i * 0.133), R = 150; setTimeout(() => { q.k.to(1); q.x.to(Math.cos(a) * R * 1.15); q.y.to(-Math.sin(a) * R - 30); }, i * 55 * slowK); });
    } else {
      outs.forEach((q) => { q.x.to(0, { response: 0.3, damping: 1 }); q.y.to(0, { response: 0.3, damping: 1 }); q.k.to(0, { response: 0.3, damping: 1 }); });
      await wait(200); fr.to(0, { response: 0.3, damping: 0.9 }); await wait(160); py.to(a2(H) + 120, { response: FEEL.out[0], damping: 1 });
    }
  }
  S.tab.addEventListener('click', () => setOpen(true));
  S.d.addEventListener('pointerdown', (e) => { if (isOpen && !pnl.contains(e.target)) setOpen(false); });
  return { setOpen, isOpen: () => isOpen, S };
}

// ================================================================ C · THE JOURNAL
function journal(host) {
  const S = stage(host, 'C · THE JOURNAL');
  const W = 190, H = 300;
  const pnl = el('div', 'jpnl'); pnl.style.width = a2(W) + 'px'; pnl.style.height = a2(H) + 'px'; S.d.append(pnl);
  const cover = rr(W, H, 8, { band: 's2', E: 4, fill: fills.wood(1.0) }); cover.classList.add('body'); pnl.append(cover);
  const page = rr(W - 16, H - 16, 5, { band: 'edge', shadow: 1, shadowCol: [10, 6, 3, 140], fill: (x, y, c) => { let p = paperAt(y / (H - 16), [[0, '#fbf3df'], [1, '#efdfbc']]); if (y > 34 && (y - 35) % 22 === 0 && x > 6 && x < W - 22) p = mix(p, '#b8955e', 0.28); if (c.d === 0 && c.lit > 0.3) p = mix(p, '#ffffff', 0.4); return p; } });
  page.classList.add('page'); pnl.append(page);
  const rib = spr(Array.from({ length: 30 }, (_, y) => (y < 27 ? 'OHFFSO' : y === 27 ? 'OHOOSO' : 'OO..OO')), { O: '#2C1848', H: '#9a6ad8', F: '#6a3fa0', S: '#4A2C6E' }, { drop: 'rgba(0,0,0,.4)' }); rib.classList.add('ribbon'); pnl.append(rib);
  const t = el('div', 'jt', 'Satchel'); pnl.append(t);
  const rows = ITEMS.map((it) => { const r = el('div', 'jrow'); const i = thumb(it, 18); r.append(i, el('div', 'jw', `<b>${it.name}</b><span>${KIND[it.kind].toLowerCase()} · ${it.from} · ${it.at}</span>`)); pnl.append(r);
    return { r, k: sv(0, ...FEEL.glide, (v) => { r.style.opacity = String(v); r.style.transform = `translateX(${(1 - v) * 24}px)`; }) }; });
  rows.forEach((q, i) => { q.r.style.top = 92 + i * 44 + 'px'; });
  const turn = sv(90, 0.5, 0.8, (v) => { pnl.style.transform = `perspective(900px) rotateY(${v}deg)`; pnl.style.opacity = String(Math.max(0, 1 - Math.abs(v) / 90)); });
  let isOpen = false;
  async function setOpen(v) {
    if (v === isOpen) return; isOpen = v; S.d.classList.toggle('open', v);
    if (v) { S.tx.to(60); turn.to(0); rows.forEach((q, i) => { q.k.set(0); setTimeout(() => q.k.to(1), (240 + i * 60) * slowK); }); }
    else { rows.forEach((q) => q.k.to(0, { response: 0.2, damping: 1 })); turn.to(90, { response: 0.32, damping: 1 }); }
  }
  S.tab.addEventListener('click', () => setOpen(true));
  S.d.addEventListener('pointerdown', (e) => { if (isOpen && !pnl.contains(e.target)) setOpen(false); });
  return { setOpen, isOpen: () => isOpen, S };
}

// ---------------------------------------------------------------- build the three, and their keys
const A = inventory($('#optA')), B = bag($('#optB')), C = journal($('#optC'));
function keyRow(host, keys) { for (const [label, fn, cls] of keys) { const b = el('button', cls ?? '', label); b.onclick = fn; host.append(b); } }
const src = el('div', 'srcdoc', 'Notepad'); $('#optA .stage116').append(src);
keyRow($('#keysA'), [['Open / close (Ctrl + Alt + V)', () => A.setOpen(!A.isOpen())], ['You copy something', () => A.arrive(src)]]);
keyRow($('#keysB'), [['Open / close', () => B.setOpen(!B.isOpen())]]);
keyRow($('#keysC'), [['Open / close', () => C.setOpen(!C.isOpen())]]);
document.addEventListener('keydown', (e) => { if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'v') { e.preventDefault(); A.setOpen(!A.isOpen()); } });
const slowB = $('#slow'); slowB.onclick = () => { slowK = slowK === 1 ? 4 : 1; slowB.classList.toggle('on', slowK !== 1); };
const gameB = $('#game'); let game = false; gameB.onclick = () => { game = !game; for (const o of [A, B, C]) o.S.setGame(game); gameB.classList.toggle('on', game); gameB.textContent = game ? 'Game running: no tab' : 'A game is running'; };

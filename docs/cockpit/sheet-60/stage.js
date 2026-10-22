// Sheet 60 (2026-10-22): notes, three looks (A parchment + slim wood rim, B colour paper + wood pin, C journal). Scenes:
//   {L}-sticky   three notes stuck on the desktop beside Aang (a to-do, a thought, a reference with a snip and a link)
//   {L}-board    the notes board: search, tags, pinned, everything
//   {L}-capture  the quick-capture box (Ctrl+*), small, over a game
import { P, rr, shape, drawMask, fills, spr, art, mix, hex, paperAt, trayAt, cover } from '../sheet-59/pix.js';
import { ready, el, at, NOTES, TAGS, note, paper, woodPin, ribbon, pinFor, dotOf, toggle, askChip, box, CATS, CATKEY, paperOf } from './notes.js';
/** A category's paper swatch: a little square of its paper with a dark-wood edge (the colour IS the category). */
function swatch(k, size = 12) { const s = el('i', 'sw6'); s.style.background = paperOf(k); s.style.width = s.style.height = size + 'px'; return s; }

const SCENE = new URLSearchParams(location.search).get('scene') || 'A-sticky';
const [L, KIND] = SCENE.split('-');
function tag(parent, x, y, html) { return at(parent, el('div', 'dtag', html), x, y); }
function aang(parent, x, y) { const i = new Image(); i.src = '../../../assets/aang/frames/idle_0.png'; i.className = 'stg aang'; at(parent, i, x, y, { zIndex: '1' }); return i; }
function win(w, h, look) {
  const d = el('div', 'win'); d.style.width = w + 'px'; d.style.height = h + 'px';
  const W = w / P, H = h / P;
  const body = look === 'A' ? rr(W, H, 9, { band: 's2', E: 4, fill: fills.paper(H) }) : rr(W, H, 9, { band: 's2', E: 4, fill: fills.wood(1.0) });
  body.classList.add('body'); d.append(body); return d;
}
function chips(look, dark) {
  const c = el('div', 'chips');
  const all = el('span', 'chip2 on' + (dark ? ' dark' : ''), 'All'); c.append(all);
  for (const [t, k] of TAGS) { const s = el('span', 'chip2' + (dark ? ' dark' : '')); const i = el('i'); i.style.background = dotOf(k); s.append(i, t); c.append(s); }
  return c;
}

// ---------------------------------------------------------------- the board
function boardA() {
  const w = 900, h = 560, d = win(w, h, 'A');
  at(d, el('div', 'bt', 'Notes'), 26, 22);
  const s = at(d, el('div', 'search', '&#9906;&nbsp; Search your notes &nbsp;<span style="opacity:.6">(title, words, tags)</span>'), 120, 20, { width: '440px' });
  at(d, el('span', 'newkey', '+ New note'), 760, 20);
  at(d, chips('A'), 26, 70);
  at(d, el('div', 'sec', 'PINNED'), 28, 116);
  at(d, note('A', NOTES.todo, 260, 236, { small: true, pinned: true }), 24, 134);
  at(d, note('A', NOTES.ref, 260, 236, { small: true, pinned: true, bringUp: false }), 298, 134);
  at(d, el('div', 'sec', 'EVERYTHING &middot; 14'), 576, 116);
  at(d, note('A', NOTES.thought, 290, 120, { small: true, foot: false }), 572, 134);
  at(d, note('A', NOTES.claude, 290, 104, { small: true, foot: false }), 572, 266);
  at(d, note('A', NOTES.wifi, 260, 120, { small: true, foot: false }), 24, 390);
  at(d, note('A', NOTES.gift, 260, 120, { small: true, foot: false }), 298, 390);
  at(d, note('A', { title: 'Guild night', tag: 'To-do', col: 'B', html: '<p>Molten Core, Fri 8pm. Bring fire resist.</p>' }, 290, 140, { small: true, foot: false }), 572, 390);
  return d;
}
function boardB() {
  // v2: chips filter by category; "Just notes" are the plain ones; his own categories sit beside the four starters
  const w = 900, h = 560, d = win(w, h, 'B');
  at(d, el('div', 'bt w', 'Notes'), 26, 22);
  at(d, el('div', 'search dark', '&#9906;&nbsp; Search your notes'), 120, 20, { width: '440px' });
  at(d, el('span', 'newkey', '+ New note'), 760, 20);
  const c = at(d, el('div', 'chips'), 26, 70);
  // v4: every chip carries its category's paper colour (the colour IS the category)
  [['All &middot; 14', 'on', null], ['Just notes &middot; 6', '', 'B'], ['To-do', '', 'F'], ['Idea', '', 'C'], ['Reference', '', 'D'], ['For Claude', '', 'E'], ['Recipes', '', 'G'], ['+ Category', 'ghost', null]].forEach(([t, k, key]) => {
    const e = el('span', 'chip2 dark' + (k === 'on' ? ' on' : ''), t); if (key) e.prepend(swatch(key, 11));
    if (k === 'ghost') { e.style.background = 'transparent'; e.style.color = '#bfae8a'; e.style.boxShadow = '0 0 0 2px rgba(191,174,138,.35)'; } c.append(e); });
  at(d, el('div', 'sec d', 'PINNED'), 28, 118);
  at(d, note('B', NOTES.plain, 250, 262, { small: true }), 26, 146);
  at(d, note('B', NOTES.todo, 250, 262, { small: true }), 298, 146);
  at(d, el('div', 'sec d', 'EVERYTHING &middot; 14'), 572, 118);
  at(d, note('B', NOTES.thought, 286, 150, { small: true, foot: false }), 572, 146);
  at(d, note('B', NOTES.claude, 286, 170, { small: true, foot: false }), 572, 330);
  at(d, note('B', NOTES.plain2, 250, 112, { small: true, foot: false }), 26, 430);
  at(d, note('B', NOTES.wifi, 250, 112, { small: true, foot: false }), 298, 430);
  return d;
}
function boardC() {
  // a journal open on the desk: wood covers, the index on the left page, the open note on the right page
  const w = 900, h = 560, d = win(w, h, 'C');
  const pw = 412, ph = 500;
  const pageL = rr(pw / P, ph / P, 5, { band: 'edge', shadow: 1, shadowCol: [10, 6, 3, 140], fill: (x, y, c) => { let p = paperAt(y / (ph / P), [[0, '#fbf3df'], [1, '#efdfbc']]); if (x > pw / P - 8) p = mix(p, '#966e3c', (x - (pw / P - 8)) / 8 * 0.35); if (c.d === 0 && c.lit > 0.3) p = mix(p, '#ffffff', 0.4); return p; } });
  const pageR = rr(pw / P, ph / P, 5, { band: 'edge', shadow: 1, shadowCol: [10, 6, 3, 140], fill: (x, y, c) => { let p = paperAt(y / (ph / P), [[0, '#fbf3df'], [1, '#efdfbc']]); if (x < 8) p = mix(p, '#966e3c', (8 - x) / 8 * 0.35); if (y > 34 && (y - 34) % 12 === 0 && x > 10 && x < pw / P - 8) p = mix(p, '#b8955e', 0.3); if (c.d === 0 && c.lit > 0.3) p = mix(p, '#ffffff', 0.4); return p; } });
  at(d, pageL, 32, 30); at(d, pageR, 456, 30);
  // the spine's stitches between the pages
  at(d, art(4, ph / P, (put) => { for (let y = 2; y < ph / P - 2; y++) { put(0, y, '#2c1c10'); put(3, y, '#2c1c10'); if (y % 6 < 3) { put(1, y, '#c98c14'); put(2, y, '#c98c14'); } } }), 444, 30);
  at(d, el('div', 'bt', 'Notes'), 54, 46).style.fontFamily = 'Cinzel,Georgia,serif';
  at(d, el('div', 'search', '&#9906;&nbsp; Search'), 170, 44, { width: '250px', height: '30px' });
  const tabs = at(d, el('div', 'chips'), 54, 90, { width: '360px' });
  tabs.append(...chips('C').children);
  const idx = at(d, el('div', ''), 54, 172, { width: '360px' });
  const rows = [['Before Friday', 'B', '2 of 5', true, true], ['Arms rotation', 'D', 'snip', true, false], ['Route list idea', 'C', 'idea', false, false], ['For Claude: Samara', 'E', 'Claude', false, false], ['Guest Wi-Fi', 'D', 'ref', false, false], ['Gift ideas', 'A', 'idea', false, false], ['Guild night', 'B', 'Fri', false, false]];
  idx.append(el('div', 'sec', 'PINNED'));
  rows.forEach(([t, k, r, pinned, open], i) => {
    if (i === 2) { const s = el('div', 'sec', 'EVERYTHING &middot; 14'); s.style.marginTop = '12px'; idx.append(s); }
    const row = el('div', ''); row.style.cssText = `display:flex;align-items:center;gap:10px;height:36px;padding:0 10px;margin:2px 0;border-radius:7px;font:${open ? 800 : 600} 15px Figtree,sans-serif;color:${open ? '#fff' : '#2E2216'};background:${open ? '#4A2C6E' : 'transparent'}`;
    const tab = el('i'); tab.style.cssText = `width:6px;height:22px;border-radius:2px;background:${dotOf(k)};box-shadow:0 0 0 2px rgba(42,26,16,.5)`;
    const rt = el('span', '', r); rt.style.cssText = `margin-left:auto;font:400 9px Silkscreen,monospace;letter-spacing:1px;color:${open ? '#d9c2ff' : '#8a6a3e'}`;
    row.append(tab, el('span', '', t), rt); idx.append(row);
  });
  // the open note on the right page
  const r = at(d, el('div', 'note lkC'), 456, 30, { width: pw + 'px', height: ph + 'px' });
  const inner = at(r, el('div', 'inner'), 30, 22, { width: (pw - 60) + 'px' });
  inner.innerHTML = `<div class="nhead"><span class="nt" style="font-size:20px">${NOTES.todo.title}</span></div>`;
  const nb = el('div', 'nb', NOTES.todo.html); inner.append(nb);
  nb.querySelectorAll('ul.chk li').forEach((li) => li.prepend(box(li.classList.contains('done'), 'C')));
  at(r, ribbon(30), pw - 50, -6, { zIndex: '3' });
  const f = at(r, el('div', 'nfoot'), 30, ph - 52, { width: (pw - 60) + 'px' });
  const tg = el('span', 'bring'); tg.append(toggle(true), el('span', '', 'Aang can bring this up')); f.append(tg, askChip('C'));
  return d;
}

// ---------------------------------------------------------------- the game behind the quick-capture box
function gameScene(wA, hA) {
  return art(wA, hA, (put) => {
    let r = 5; const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
    const sky = ['#1b1430', '#2a1d46', '#40285a', '#5e3460', '#8a4458', '#b8604a', '#d98a4a'];
    for (let y = 0; y < hA; y++) for (let x = 0; x < wA; x++) {
      const t = y / (hA * 0.62); let col = sky[Math.min(sky.length - 1, Math.floor(t * sky.length))];
      if (y > hA * 0.62) col = '#141018';
      put(x, y, col);
    }
    for (let k = 0; k < 40; k++) put(Math.floor(rnd() * wA), Math.floor(rnd() * hA * 0.3), '#d8c8f0');
    const ridge = (base, amp, f, col, ph) => { for (let x = 0; x < wA; x++) { const top = Math.round(base - amp * (0.5 + 0.5 * Math.sin(x / f + ph)) - amp * 0.4 * Math.sin(x / (f * 0.37) + ph * 2)); for (let y = top; y < hA; y++) put(x, y, col); } };
    ridge(hA * 0.62, 26, 23, '#2c2040', 0.4); ridge(hA * 0.7, 18, 15, '#211830', 1.7);
    // a keep on the hill
    const kx = Math.round(wA * 0.7), ky = Math.round(hA * 0.5);
    for (let y = ky; y < hA * 0.72; y++) for (let x = kx; x < kx + 22; x++) put(x, y, '#181225');
    for (let y = ky - 16; y < ky; y++) for (let x = kx + 4; x < kx + 10; x++) put(x, y, '#181225');
    for (let x = kx; x < kx + 22; x += 3) put(x, ky - 1, '#181225');
    put(kx + 6, ky - 10, '#ffc46a'); put(kx + 14, ky + 6, '#ffc46a'); put(kx + 15, ky + 6, '#ffc46a');
    for (let y = Math.round(hA * 0.72); y < hA; y++) for (let x = 0; x < wA; x++) put(x, y, (x + y) % 5 ? '#16121c' : '#1d1726');
    // the game's own bars: health and an action bar of twelve slots
    for (let y = 6; y < 12; y++) for (let x = 6; x < 70; x++) put(x, y, y === 6 || y === 11 || x === 6 || x === 69 ? '#0a0806' : x < 58 ? '#2f9a3a' : '#1a2a1a');
    for (let y = 13; y < 17; y++) for (let x = 6; x < 70; x++) put(x, y, y === 13 || y === 16 || x === 6 || x === 69 ? '#0a0806' : x < 40 ? '#c7432f' : '#2a1414');
    const sx = Math.round(wA / 2 - 6 * 11);
    const icons = ['#c7432f', '#d98a2b', '#8a5cc4', '#3f8ac4', '#c7432f', '#6aa04a', '#d9c49a', '#c98c14', '#4a7ac4', '#a8352b', '#7a5532', '#58b0a3'];
    for (let i = 0; i < 12; i++) for (let y = hA - 14; y < hA - 3; y++) for (let x = sx + i * 11; x < sx + i * 11 + 10; x++) {
      const e = y === hA - 14 || y === hA - 4 || x === sx + i * 11 || x === sx + i * 11 + 9;
      put(x, y, e ? '#5a4a2a' : mix(icons[i], '#000000', (y - (hA - 14)) / 14 * 0.5));
    }
  });
}
/** v3: the quick note IS a note: the same paper, pin, face and control row, opened small with an empty body. */
export const QUICK = { title: '', col: 'B', html: '<p class="cap"><span class="caret"></span><span class="ph">A thought, a to-do, anything&hellip;</span></p>' };
function capture(look) {
  if (look === 'B') return note('B', QUICK, 280, 196);
  const w = 440, h = 132;
  const d = el('div', 'note lk' + look); d.style.width = w + 'px'; d.style.height = h + 'px';
  const body = look === 'A' ? rr(w / P, h / P, 8, { band: 's2', E: 4, fill: fills.paper(h / P) }) : paper(look, w / P, h / P, 'B');
  body.classList.add('paper'); d.append(body);
  const x0 = look === 'C' ? 34 : 22, y0 = look === 'B' ? 24 : 18;
  at(d, el('div', 'sec', 'QUICK NOTE'), x0, y0);
  const dots = at(d, el('div', ''), w - 120, y0 - 3, { display: 'flex', gap: '7px' });
  ['B', 'C', 'D', 'E'].forEach((k, i) => { const s = el('i'); s.style.cssText = `display:block;width:12px;height:12px;border-radius:3px;background:${dotOf(k)};box-shadow:0 0 0 2px ${i === 0 ? '#2E2216' : 'rgba(42,26,16,.4)'}`; dots.append(s); });
  if (look === 'B') {   // v2: a quick note is a plain note; a #word is optional and files it under a category
    at(d, el('div', 'cap', 'Ask the guild about Molten Core on Friday<span class="caret"></span>'), x0, y0 + 24);
    at(d, el('div', 'hintline', '<b>ENTER</b> SAVES &nbsp;&middot;&nbsp; <b>ESC</b> CLOSES &nbsp;&middot;&nbsp; <b>#WORD</b> = CATEGORY, OPTIONAL'), x0, h - 34);
  } else {
  at(d, el('div', 'cap', 'Ask the guild about Molten Core on Friday <span style="color:#8a3e1c">#to-do</span><span class="caret"></span>'), x0, y0 + 24);
  at(d, el('div', 'hintline', '<b>ENTER</b> SAVES &nbsp;&middot;&nbsp; <b>ESC</b> CLOSES &nbsp;&middot;&nbsp; <b>#</b> FILES IT &nbsp;&middot;&nbsp; GAME KEEPS RUNNING'), x0, h - 34);
  }
  if (look === 'B') at(d, woodPin(), w / 2 - 12, -10, { zIndex: '3' });
  return d;
}

window.__ready = (async () => {
  await ready();
  const stage = el('div'); stage.style.cssText = 'position:absolute;left:0;top:0;width:1600px;height:1000px'; document.body.append(stage);
  let crop;
  if (KIND === 'sticky') {
    const H = 470; aang(stage, 0, H - 214);
    if (L === 'B') {   // v2: the plain note first (the default), then two with a category
      at(stage, note('B', NOTES.plain, 264, 262), 200, 40);
      at(stage, note('B', NOTES.todo, 264, 300, { pinned: true }), 488, 40);
      at(stage, note('B', NOTES.thought, 264, 262, { hover: true }), 776, 40);
    } else {
      const hs = L === 'C' ? [254, 196, 318] : [252, 196, 318];
      at(stage, note(L, NOTES.todo, 264, hs[0] - 20, { pinned: true }), 200, 40);
      at(stage, note(L, NOTES.thought, 256, hs[1], { hover: true }), 492, 40);
      at(stage, note(L, NOTES.ref, 270, hs[2], { pinned: L !== 'A' }), 776, 40);
    }
    crop = { x: 0, y: 0, w: 1070, h: H };
  } else if (KIND === 'board') {
    const b = L === 'A' ? boardA() : L === 'B' ? boardB() : boardC();
    at(stage, b, 24, 24); crop = { x: 0, y: 0, w: 948, h: 612 };
  } else if (SCENE === 'B-menu' || SCENE === 'B-rail') {
    // v4: Samara's real ... menu with the new row, and the right rail it opens (samara.js siteNotes)
    const f = el('iframe'); f.src = 'samara.html?look=B&state=' + (SCENE === 'B-menu' ? 'menu' : 'rail'); Object.assign(f.style, { position: 'absolute', left: '0px', top: '0px', width: '1040px', height: '620px', border: '0' });
    stage.append(f); await new Promise((r) => { f.onload = r; }); await f.contentWindow.__done;
    crop = SCENE === 'B-menu' ? { x: 520, y: 0, w: 520, h: 470 } : { x: 0, y: 0, w: 1040, h: 620 };
  } else if (SCENE === 'B-railmotion') {
    // the rail coming in on a spring (response 0.42 s, damping 0.82): four moments, the page narrowing with it
    const spring = (t, response = 0.42, zeta = 0.82) => { const w = 2 * Math.PI / response, wd = w * Math.sqrt(1 - zeta * zeta); return 1 - Math.exp(-zeta * w * t) * (Math.cos(wd * t) + zeta / Math.sqrt(1 - zeta * zeta) * Math.sin(wd * t)); };
    const T = [0.06, 0.14, 0.24, 0.6], S = 0.4, fw = Math.round(1040 * S), fh = Math.round(620 * S);
    for (let i = 0; i < 4; i++) {
      const p = Math.min(1, spring(T[i])).toFixed(3);
      const f = el('iframe'); f.src = 'samara.html?look=B&state=' + p;
      const gx = 20 + (i % 2) * (fw + 24), gy = 20 + Math.floor(i / 2) * (fh + 44);
      Object.assign(f.style, { position: 'absolute', left: gx / S + 'px', top: gy / S + 'px', width: '1040px', height: '620px', border: '0' });
      const holder = el('div'); holder.style.cssText = 'position:absolute;left:0;top:0;transform:scale(' + S + ');transform-origin:0 0';
      holder.append(f); stage.append(holder);
      await new Promise((r) => { f.onload = r; }); await f.contentWindow.__done;
      tag(stage, gx + 2, gy + fh + 10, '<b>' + Math.round(T[i] * 1000) + ' MS</b>' + (i === 3 ? ' &middot; SETTLED' : ''));
    }
    crop = { x: 0, y: 0, w: 20 + 2 * (fw + 24), h: 20 + 2 * (fh + 44) };
  } else if (KIND === 'samara') {
    const f = el('iframe'); f.src = 'samara.html?look=' + L; Object.assign(f.style, { position: 'absolute', left: '0px', top: '0px', width: '1040px', height: '620px', border: '0' });
    stage.append(f);
    await new Promise((r) => { f.onload = r; });
    await f.contentWindow.__done;
    crop = { x: 0, y: 0, w: 1040, h: 620 };
  // v4: the in-game mark is gone (his call: while a game runs, noticing is off entirely, nothing shown)
  } else if (SCENE === 'B-cats') {
    // v4: no colour picker. The # chip opens the category list, each with its paper colour beside its name; picking one
    // recolours the note on a soft cross-fade. Left: the list open on a plain note. Right: the same note, three moments.
    const H = 470;
    const n = note('B', NOTES.plain2, 300, 196); at(stage, n, 24, 40);
    const ghost = n.querySelector('.hcat.ghost'); ghost.classList.remove('ghost'); ghost.classList.add('on');
    const pop = el('div', 'note lkB'); pop.style.width = '236px'; pop.style.height = '262px';
    const pb = rr(118, 131, 8, { band: 's2', E: 4, fill: fills.paper(131) }); pb.classList.add('paper'); pop.append(pb);
    at(pop, el('div', 'sec', 'CATEGORY = ITS COLOUR'), 20, 18);
    const list = at(pop, el('div', ''), 16, 40, { display: 'flex', flexDirection: 'column', gap: '4px', width: '204px' });
    CATS.forEach(([c, k, label], i) => { const row = el('span', 'catrow' + (i === 1 ? ' hov' : '')); row.append(swatch(k, 14), el('span', '', label ?? c)); list.append(row); });
    const mk = el('span', 'catrow ghost'); mk.append(el('span', 'plus', '+'), el('span', '', 'New category <small>gets the next colour</small>')); list.append(mk);
    at(stage, pop, 36, 200, { zIndex: '5' });
    // the cross-fade: butter (plain) -> half-way -> sky (To-do)
    const hx = (a) => '#' + a.slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join('');
    const T = [['0 MS &middot; PLAIN', null, ''], ['120 MS', 'mid', 'To-do'], ['250 MS &middot; TO-DO', null, 'To-do']];
    T.forEach(([t, k, cat], i) => {
      const nn = { ...NOTES.plain2, cat: cat || undefined };
      if (k === 'mid') nn.mix = hx(mix(paperOf('B'), paperOf('F'), 0.5));
      const x = 340 + i * 214; at(stage, note('B', nn, 196, 160, { foot: false, small: true }), x, 56);
      tag(stage, x + 2, 232, '<b>' + t + '</b>');
      if (i < 2) at(stage, el('div', 'dtag', '&rarr;'), x + 202, 130);
    });
    tag(stage, 340, 270, 'PICK <b>TO-DO</b>: THE PAPER CROSS-FADES TO TO-DO&rsquo;S COLOUR (0.25 S).');
    tag(stage, 340, 292, 'NOTHING ELSE TO CHOOSE. TAKE THE CATEGORY OFF AND IT FADES BACK TO PLAIN.');
    crop = { x: 0, y: 0, w: 1000, h: H };
  } else if (SCENE === 'B-fasten') {
    // v4: the pushpin is gone. Three ways to hold a note up, each on the same note, with the top corner blown up 2x more
    const rows = [['A', 'tab', 'RIBBON TAB', 'A SLIM RIBBON OVER THE TOP EDGE, CATEGORY COLOUR, GOLD FOLD', 'RECOMMENDED'],
      ['B', 'tape', 'WASHI TAPE', 'PIXEL TAPE ACROSS THE CORNER, TINTED BY THE CATEGORY', ''],
      ['C', 'stud', 'NO FASTENER, A GOLD STUD', 'NOTHING HOLDING IT, THE PAPER LIFTED, ONE TINY GOLD STUD', '']];
    rows.forEach(([L2, kind, name, words, rec], i) => {
      const y = 30 + i * 250;
      tag(stage, 24, y - 4, '<b>' + L2 + ' &middot; ' + name + '</b>' + (rec ? ' &middot; <b style="color:#ffd36a">' + rec + '</b>' : ''));
      tag(stage, 24, y + 14, words);
      const n = note('B', NOTES.todo, 250, 186, { fast: kind, foot: false }); at(stage, n, 40, y + 54);
      const zoomBox = el('div'); zoomBox.style.cssText = 'position:absolute;overflow:hidden;width:320px;height:176px;border-radius:10px;box-shadow:0 0 0 2px #4a2e18;background:#1a1c25';
      const clone = note('B', NOTES.todo, 250, 186, { fast: kind, foot: false }); clone.style.transform = 'scale(2)'; clone.style.transformOrigin = '0 0';
      at(zoomBox, clone, kind === 'stud' ? -200 : 50, 40);
      at(stage, zoomBox, 340, y + 40);
      tag(stage, 344, y + 224, 'THE CORNER, 2&times; MORE');
    });
    crop = { x: 0, y: 0, w: 690, h: 30 + 3 * 250 - 10 };
  } else if (SCENE === 'B-same') {
    // v3: the quick note and a note opened from the board, side by side: the same paper, the same row of controls
    const H = 470;
    tag(stage, 40, 18, '<b>QUICK NOTE</b> &middot; CTRL + * &middot; SMALL, EMPTY, READY');
    at(stage, note('B', QUICK, 280, 214), 40, 56);
    tag(stage, 420, 18, '<b>A NOTE FROM THE BOARD</b> &middot; SAME NOTE, WORDS IN IT');
    at(stage, note('B', NOTES.todo, 300, 300, { pinned: true }), 420, 56);
    // gold marks under both control rows: one row, two places
    for (const [x, y, w] of [[54, 56 + 214 - 70, 252], [434, 56 + 300 - 70, 270]]) at(stage, el('div', 'seam6'), x, y, { width: w + 'px' });
    tag(stage, 40, 56 + 300 + 30, '<b>THE SAME ROW ON BOTH</b>: # CATEGORY &middot; COLOUR &middot; CHECKLIST &middot; AANG CAN BRING THIS UP');
    tag(stage, 40, 56 + 300 + 52, 'PIN AND AANG&rsquo;S FACE ON TOP OF BOTH &middot; ENTER SAVES THE QUICK ONE, THEN IT IS A NOTE LIKE ANY OTHER');
    crop = { x: 0, y: 0, w: 780, h: 440 };
  } else if (KIND === 'capture') {
    const g = gameScene(470, 230); g.classList.add('game'); stage.append(g);
    if (L === 'B') { at(stage, capture(L), 330, 92); const t = at(stage, el('div', 'dtag', '<b>ENTER</b> SAVES &middot; <b>ESC</b> CLOSES &middot; THE GAME KEEPS RUNNING'), 330, 312); t.style.color = '#f1e3c4'; t.style.textShadow = '0 1px 0 #000'; }
    else at(stage, capture(L), 250, 120);
    crop = { x: 0, y: 0, w: 940, h: 460 };
  }
  await Promise.all([...document.images].map((i) => i.decode().catch(() => {})));
  return { crop };
})();

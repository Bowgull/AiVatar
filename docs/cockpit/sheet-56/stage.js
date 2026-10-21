// Sheet 56 stage: Aang on a dark desktop, right-clicked, his new menu open with Hush > open. Builds the markup the
// product's own menus use (A: browser.js tabMenu/expander; B: bubble.js turnmenu rows) and lets the product CSS draw it.
// shots.mjs moves the real mouse over one row so the glove is the product's own :hover, not a fake class.
(() => {
  const LOOK = document.documentElement.className === 'lookB' ? 'B' : 'A';
  const P = 2; // one art pixel = 2 screen pixels, whole-number

  // ---------------------------------------------------------------- hand-placed 9x9 icons (palette letters)
  const ICONS = {
    back: ['..OOOOO..', '.O.....O.', 'O...O...O', 'O...O...O', 'O...OO..O', 'O.......O', 'A.O...O..', 'AA.OOO...', 'AAA......'],
    jobs: ['...OOO...', '..O...O..', 'OOOOOOOOO', 'O.......O', 'O...O...O', 'OOOOOOOOO', 'O.......O', 'O.......O', 'OOOOOOOOO'],
    hunt: ['..OOO....', '.O...O...', 'O.....O..', 'O.....O..', 'O.....O..', '.O...O...', '..OOOOO..', '......OO.', '.......OO'],
    hush: ['..OOOO...', '.OO......', 'OO.......', 'OO.......', 'OO.......', 'OO......O', '.OO....O.', '..OOOOO..', '.........'],
    dock: ['....O....', '....O....', '....O....', '..O.O.O..', '...OOO...', '....O....', '.........', 'OOOOOOOOO', 'OOOOOOOOO'],
    back2: ['OOOOOOOOO', 'OOOOOOOOO', '.........', '....O....', '...OOO...', '..O.O.O..', '....O....', '....O....', '....O....'],
    hide: ['O........', '.O.......', '..OOOOO..', '.O.O...O.', 'O...O...O', '.O...O.O.', '..OOOOO..', '.......O.', '........O'],
    model: ['....O....', '....O....', '...OOO...', '..OOOOO..', 'OOOOOOOOO', '..OOOOO..', '...OOO...', '....O....', '....O....'],
    quota: ['OOOOOOOOO', '.O.....O.', '..OAAAO..', '...OAO...', '....O....', '...O.O...', '..O.A.O..', '.OAAAAAO.', 'OOOOOOOOO'],
    quit: ['OO.....OO', 'OOO...OOO', '.OOO.OOO.', '..OOOOO..', '...OOO...', '..OOOOO..', '.OOO.OOO.', 'OOO...OOO', 'OO.....OO'],
    claude: ['....O....', '.O..O..O.', '..O.O.O..', '...OOO...', 'OOOOOOOOO', '...OOO...', '..O.O.O..', '.O..O..O.', '....O....'],
    tick: ['.........', '........O', '.......OO', 'O.....OO.', 'OO...OO..', '.OO.OO...', '..OOO....', '...O.....', '.........'],
  };
  const TONE = LOOK === 'A'
    ? { O: '#d8c8a8', A: '#a8946e', sh: 'rgba(0,0,0,.65)', red: '#ff9a8a', tick: '#ffe28c', claude: '#E88A6A' }
    : { O: '#5A4834', A: '#9a7a48', sh: null, red: '#a3301e', tick: '#4A2C6E', claude: '#c4603e' };
  function icon(name, tone = {}) {
    const map = ICONS[name], pal = { O: tone.O ?? TONE.O, A: tone.A ?? TONE.A };
    const c = document.createElement('canvas'); c.width = 10 * P; c.height = 10 * P;
    const g = c.getContext('2d');
    const put = (col, ox, oy) => map.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch]) { g.fillStyle = col ?? pal[ch]; g.fillRect((x + ox) * P, (y + oy) * P, P, P); } }));
    if (TONE.sh) put(TONE.sh, 0.5, 0.5);       // a 1-screen-pixel drop, like the words' text-shadow
    put(null, 0, 0);
    const i = new Image(); i.src = c.toDataURL(); i.className = 'ic'; i.alt = '';
    return i;
  }

  // ---------------------------------------------------------------- the menus (his picks, 2026-10-21)
  const MAIN = [
    { ic: 'back', t: 'Look back' },
    { ic: 'claude', t: 'Claude jobs', tag: '2 RUNNING' },
    { ic: 'hunt', t: 'Job hunt now' },
    '-',
    { ic: 'hush', t: 'Hush', tag: 'UNTIL 7:40', sub: true, on: true },
    '-',
    { ic: 'dock', t: 'Dock', sub: true },
    { ic: 'back2', t: 'Come back', off: true },
    { ic: 'hide', t: 'Hide' },
    '-',
    { ic: 'model', t: 'Model', tag: 'AUTO', sub: true },
    { ic: 'quota', t: 'Save quota', tick: true },
    '-',
    { ic: 'quit', t: 'Quit Aang', danger: true },
  ];
  const HUSH = [
    { t: 'For 15 minutes' },
    { t: 'For 1 hour', hover: true },
    { t: 'For 4 hours' },
    { t: 'Until tomorrow' },
    { t: 'Stop hushing now' },
    '-',
    { t: 'Mute: nothing unprompted' },
    '-',
    { head: 'QUIET IN GAMES' },
    { t: 'Auto: while WoW is in front', tick: true },
    { t: 'Always' },
    { t: 'Never' },
  ];

  function row(r, inSub) {
    const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'menuitem');
    if (LOOK === 'B') b.classList.add('mrow');
    if (r.danger && LOOK === 'A') b.classList.add('danger');
    if (r.on) b.classList.add('on');
    if (r.hover) b.dataset.hover = '1';
    b.disabled = !!r.off;
    const lab = document.createElement('span'); lab.className = 'lab';
    if (!inSub) lab.append(icon(r.ic, r.danger ? { O: TONE.red, A: TONE.red } : r.ic === 'claude' ? { O: TONE.claude } : {}));
    lab.append(r.t);
    b.append(lab);
    if (r.tag || r.sub) {
      const i = document.createElement('i'); if (r.tag) { i.className = 'st'; i.append(r.tag); }
      if (r.sub) i.append(Object.assign(document.createElement('b'), { className: 'ar', textContent: '▸' }));
      b.append(i);
    }
    if (r.tick) { const t = icon('tick', { O: TONE.tick }); t.classList.add('tk'); b.append(t); }
    return b;
  }
  function menu(rows, inSub) {
    const m = document.createElement('div'); m.setAttribute('role', 'menu');
    m.className = (LOOK === 'A' ? 'tabmenu' : 'wood turnmenu') + (inSub ? ' submenu' : '');
    for (const [k, r] of rows.entries()) {
      // the bubble's own menu sets its last row apart with its own top line, so B needs no separator before Quit
      if (r === '-' && LOOK === 'B' && rows[k + 1]?.danger) continue;
      if (r === '-') m.append(Object.assign(document.createElement('div'), { className: 'sep' }));
      else if (r.head) m.append(Object.assign(document.createElement('div'), { className: 'mhead', textContent: r.head }));
      else m.append(row(r, inSub));
    }
    return m;
  }

  // ---------------------------------------------------------------- the stage
  const host = LOOK === 'A' ? document.body : Object.assign(document.createElement('div'), { className: 'wrap rimB' });
  if (LOOK === 'B') document.body.append(host);
  const sprite = new Image(); sprite.src = '../../../assets/aang/frames/idle_0.png'; sprite.className = 'stg aang';
  sprite.style.left = '24px'; sprite.style.top = (520 - 224 - 8) + 'px';
  document.body.append(sprite);
  const click = { x: 24 + 134, y: 520 - 224 - 8 + 150 };   // his chest
  const CURSOR = ['O...........', 'OO..........', 'OWO.........', 'OWWO........', 'OWWWO.......', 'OWWWWO......', 'OWWWWWO.....', 'OWWWWWWO....',
    'OWWWWWWWO...', 'OWWWWWWWWO..', 'OWWWWWOOOOO.', 'OWWOWWO.....', 'OWO.OWWO....', 'OO..OWWO....', 'O....OWWO...', '.....OWWO...', '......OO....'];
  { const c = document.createElement('canvas'); c.width = 12; c.height = CURSOR.length; const g = c.getContext('2d');
    CURSOR.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '.') { g.fillStyle = ch === 'O' ? '#000' : '#fff'; g.fillRect(x, y, 1, 1); } }));
    const i = new Image(); i.src = c.toDataURL(); i.className = 'stg cursor'; i.style.left = click.x + 'px'; i.style.top = click.y + 'px'; i.style.width = '12px';
    document.body.append(i); }

  const main = menu(MAIN, false), sub = menu(HUSH, true);
  host.append(main, sub);
  const even = (el) => { const r = el.getBoundingClientRect(); el.style.width = (Math.ceil(r.width / P) * P) + 'px'; };

  window.__ready = (async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((i) => i.decode().catch(() => {})));
    for (const m of [main, sub]) { m.style.position = 'fixed'; m.style.left = '0px'; m.style.top = '0px'; }
    even(main); even(sub);
    const rim = LOOK === 'B' ? 8 : 0;   // the wood band sits outside the paper
    // A right-click near the bottom of the screen: the menu opens UP from the pointer, to its right.
    const mr = main.getBoundingClientRect();
    const mx = click.x + 2 + rim, my = Math.round((click.y - mr.height - rim) / P) * P;
    main.style.left = mx + 'px'; main.style.top = my + 'px';
    const hushRow = main.querySelector('button.on').getBoundingClientRect();
    const sx = mx + mr.width + (LOOK === 'A' ? -4 : rim * 2 - 2);
    const pad = LOOK === 'A' ? 9 : 8;
    sub.style.left = sx + 'px'; sub.style.top = (Math.round((hushRow.top - pad) / P) * P) + 'px';
    if (LOOK === 'B') { await paintRim(main); await paintRim(sub); }
    const h = sub.querySelector('[data-hover]').getBoundingClientRect();
    // the picture: everything on the stage plus a margin of desktop
    const boxes = [main, sub, ...document.querySelectorAll('.rimc')].map((e) => e.getBoundingClientRect());
    const right = Math.max(...boxes.map((b) => b.right)), top = Math.min(...boxes.map((b) => b.top));
    return { hover: { x: h.left + 60, y: h.top + h.height / 2 }, crop: { x: 0, y: Math.max(0, Math.floor(top) - 28), w: Math.ceil(right) + 30, h: 520 - Math.max(0, Math.floor(top) - 28) } };
  })();

  // ---------------------------------------------------------------- B: sheet 55's S2 slim wood band, round a menu
  // Same recipe as quiet-takes.js S2: 1 art px of dark wood edge, 3 art px of Samara's band.png grain running along the
  // edge (lit top/left, a shade darker bottom/right), then the bubble's paper (.wrap.rimB --paper-1..3), corners round.
  let BAND = null;
  async function band() {
    if (BAND) return BAND;
    const img = new Image(); img.src = '../../../src/Shell/pages/art/browser/band.png'; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    return (BAND = { w: img.width, h: img.height, d: g.getImageData(0, 0, img.width, img.height).data });
  }
  const hex = (h) => { const n = h.trim().replace('#', ''); return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16)); };
  const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
  const mul = (a, k) => a.map((v) => Math.max(0, Math.min(255, Math.round(v * k))));
  async function paintRim(el) {
    const B = await band();
    const cs = getComputedStyle(document.querySelector('.wrap.rimB'));
    const stops = [[0, hex(cs.getPropertyValue('--paper-1'))], [0.45, hex(cs.getPropertyValue('--paper-2'))], [1, hex(cs.getPropertyValue('--paper-3'))]];
    const r = el.getBoundingClientRect();
    const E = 4, R = 7, SH = 2;
    const aw = Math.round(r.width / P) + 2 * E, ah = Math.round(r.height / P) + 2 * E;
    const c = document.createElement('canvas'); c.width = aw; c.height = ah + SH; const g = c.getContext('2d');
    const im = g.createImageData(aw, ah + SH);
    // depth of art pixel (x,y) inside a rounded rect of aw x ah, radius R (-1 = outside)
    const depth = (x, y) => {
      if (x < 0 || y < 0 || x >= aw || y >= ah) return -1;
      const cx = x < R ? R : x >= aw - R ? aw - R : null, cy = y < R ? R : y >= ah - R ? ah - R : null;
      if (cx !== null && cy !== null) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = R - Math.hypot(dx, dy);
        return d < 0.0 ? -1 : Math.floor(d);
      }
      return Math.min(x, y, aw - 1 - x, ah - 1 - y);
    };
    const paper = (y) => {
      const t = Math.max(0, Math.min(1, (y - E) / ((ah - 2 * E) || 1)));
      for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) return mix(stops[i - 1][1], stops[i][1], (t - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]));
      return stops[2][1];
    };
    const tex = (u, v) => { const x = ((u % B.w) + B.w) % B.w, i = (v * B.w + x) * 4; return [B.d[i], B.d[i + 1], B.d[i + 2]]; };
    const set = (x, y, rgb, a = 255) => { const i = (y * aw + x) * 4; im.data[i] = rgb[0]; im.data[i + 1] = rgb[1]; im.data[i + 2] = rgb[2]; im.data[i + 3] = a; };
    // the hard shadow first (2 art px down), then the menu over it
    for (let y = 0; y < ah; y++) for (let x = 0; x < aw; x++) if (depth(x, y) >= 0) set(x, y + SH, [12, 6, 2], 110);
    for (let y = 0; y < ah; y++) for (let x = 0; x < aw; x++) {
      const d = depth(x, y); if (d < 0) continue;
      // which way this edge faces: top/left lit, bottom/right in shade
      const near = Math.min(x, y, aw - 1 - x, ah - 1 - y);
      const lit = near === x || near === y ? 1 : -1;
      const L = (a, b2, c2) => (lit > 0 ? a : lit < 0 ? c2 : b2);
      let col;
      if (d === 0) col = hex(L('#422a18', '#3a2516', '#2c1c10'));
      else if (d < E) {
        const u = near === y || near === ah - 1 - y ? x : y + 17;
        const w = tex(u, 2 + (d - 1) * 4);
        col = d === 1 && lit > 0 ? mix(w, hex('#6e4a2a'), 0.65) : mul(w, L(1.08, 1.0, 0.86));
      } else col = paper(y);
      set(x, y, col);
    }
    g.putImageData(im, 0, 0);
    const out = new Image(); out.src = c.toDataURL(); out.className = 'rimc';
    out.style.left = (r.left - E * P) + 'px'; out.style.top = (r.top - E * P) + 'px';
    out.style.width = aw * P + 'px'; out.style.height = (ah + SH) * P + 'px';
    await out.decode();
    el.before(out);
  }
})();

// Sheet 50 helpers (a mockup, not product code). The marks are the pet's own maps, verbatim from src/Body/ClaudeMarks.cs
// (O outline, H light, F face, S shade), drawn the way the pet draws them: outline #2a1a10, H = mix white .55,
// S = mix dark .35, a soft shadow one art pixel down and right. The rune and the soft pill are drawn here too.
window.S50 = (() => {
  const MAPS = {
    working: ["..OOOOOOOOO..", ".OHHHHHFFFSO.", "OHFFFFFFFFFSO", "OHFOFFOFFOFSO", "OHFFFFFFFFFSO", ".OFFFFFFFFSO.", "..OOOFSOOOO..", "....OSO......", "....OO......."],
    needs: [".OOOOO..........", "OHHHFSO.........", "OHO.OFSOOOOOOOO.", "OHO.OFFHHHHHHFSO", "OFO.OFSSSSSSSSSO", "OFFFFSOOOOOOSOSO", ".OSSSO.....OSOSO", "..OOO......OOOOO"],
    question: ["...OOOOO...", "..OHHFFSO..", ".OHFOOOFSO.", ".OHO...OFSO", "..O....OFSO", "......OFFSO", ".....OFFSO.", "....OFFSO..", "....OFSO...", "....OFSO...", "....OOOO...", "...........", "....OOOO...", "...OHFFSO..", "...OFFSSO..", "....OOOO..."],
    plan: [".OOOOOOOOOO.", "OHHHHHHHFFSO", "OSSSSSSSSSSO", ".OFFFFFFFSO.", ".OFOOOOFFSO.", ".OFFFFFFFSO.", ".OFOOOOOFSO.", ".OFFFFFFFSO.", "OHHHHHHHFFSO", "OSSSSSSSSSSO", ".OOOOOOOOOO."],
    step: ["........OOO", ".......OHHO", "......OHFSO", ".OOO.OHFSO.", "OHHOOHFSO..", "OFHHHFSO...", ".OFFFSO....", "..OSSO.....", "...OO......"],
    complete: ["..........OOO", ".........OHHO", "........OHHFO", ".......OHHFSO", ".OOO..OHHFSO.", "OHHHOOHHFSO..", "OFHHHHHFSO...", ".OFFHHFSO....", "..OFFFSO.....", "...OSSO......", "....OO......."],
    paused: ["OOOOOOOOO", "OHHHHFFSO", ".OHFFFSO.", "..OHFSO..", "...OSO...", "..OF.SO..", ".OF...SO.", "OHFFFFFSO", "OOOOOOOOO"],
    failed: ["..OOOOOOO..", ".OHHHHFFFO.", "OHHFFFFFFSO", "OHOOFFFOOSO", "OFOOFFFOOSO", "OFFFFOFFFSO", ".OFFFFFFSO.", "..OFOFOFO..", "..OOOOOOO.."],
  };
  const ORDER = ['working', 'needs', 'question', 'plan', 'step', 'complete', 'paused', 'failed'];
  const GLOWS = new Set(['needs', 'question', 'plan', 'complete', 'failed']);
  const NAMES = { working: 'WORKING', needs: 'NEEDS YOU', question: 'QUESTION', plan: 'PLAN READY', step: 'STEP DONE', complete: 'JOB COMPLETE', paused: 'PAUSED', failed: 'FAILED' };
  const COL = { working: '#f0a64a', needs: '#7cc4ff', question: '#b07cff', plan: '#f3e2b8', complete: '#3fc4b4', paused: '#6f7787', failed: '#e8443a' };
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const mix = (h, t, k) => `rgb(${rgb(h).map((v, i) => Math.round(v + (t[i] - v) * k)).join(',')})`;

  function mark(kind, col, px = 3) {
    const map = MAPS[kind], w = map[0].length, h = map.length;
    const cv = Object.assign(document.createElement('canvas'), { width: (w + 1) * px, height: (h + 1) * px, className: 'mk' });
    const g = cv.getContext('2d');
    const fill = { O: '#2a1a10', H: mix(col, [255, 255, 255], 0.55), F: col, S: mix(col, [40, 20, 10], 0.35), W: '#fffaf0' };
    g.fillStyle = 'rgba(0,0,0,.4)';
    map.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '.') g.fillRect((x + 1) * px, (y + 1) * px, px, px); }));
    map.forEach((r, y) => [...r].forEach((ch, x) => { if (fill[ch]) { g.fillStyle = fill[ch]; g.fillRect(x * px, y * px, px, px); } }));
    return cv;
  }

  // ---- the rune: a small rounded stone tablet (RuneScape's pebble runes), Claude's sunburst carved in and lit in the
  // job's colour. 12 x 12 art pixels; 2 screen px per art pixel in the band (the band's own art scale), 6 when zoomed.
  const STONE = [
    '...OOOOOO...',
    '..OHHHHHLO..',
    '.OHHLLLLLSO.',
    'OHLLLLLLLLSO',
    'OHLLLLLLLLSO',
    'OHLLLLLLLLSO',
    'OLLLLLLLLLSO',
    'OLLLLLLLLSSO',
    'OLLLLLLLLSSO',
    '.OSLLLLLSSO.',
    '..OSSSSSSO..',
    '...OOOOOO...'];
  const SPECK = [[3, 4], [8, 3], [5, 8], [9, 6], [2, 7], [7, 9]];
  const GLYPH = ['...G...', '.G.G.G.', '..GGG..', 'GGGGGGG', '..GGG..', '.G.G.G.', '...G...'];
  const TICK = ['......G', '.....GG', 'G...GG.', 'GG.GG..', '.GGG...', '..G....', '.......'];
  const STONE_COL = { O: '#2a1a10', H: '#c9b99a', L: '#9c8b70', S: '#6a5a45' };
  function rune(col, px = 2, glyph = 'sun') {
    const n = 12, cv = Object.assign(document.createElement('canvas'), { width: (n + 1) * px, height: (n + 1) * px, className: 'rn' });
    const g = cv.getContext('2d'), P = (x, y, c) => { g.fillStyle = c; g.fillRect(x * px, y * px, px, px); };
    g.fillStyle = 'rgba(0,0,0,.4)';
    STONE.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '.') g.fillRect((x + 1) * px, (y + 1) * px, px, px); }));
    STONE.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '.') P(x, y, STONE_COL[ch]); }));
    for (const [x, y] of SPECK) P(x, y, '#8a7a60');
    const G = glyph === 'tick' ? TICK : GLYPH;
    // carved: a dark groove one pixel down-right, then the lit glyph, its centre brightest
    G.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === 'G') P(x + 3, y + 3, '#3a2a1c'); }));
    G.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === 'G') P(x + 2, y + 2, (x === 3 && y === 3 && glyph !== 'tick') ? mix(col, [255, 255, 255], 0.6) : col); }));
    return cv;
  }
  // the thin pixel ring for take B: whole art pixels on a circle round the stone, lit up to the job's progress
  function ring(col, p, px = 2) {
    const n = 18, c = (n - 1) / 2, R = 8.2;
    const cv = Object.assign(document.createElement('canvas'), { width: n * px, height: n * px, className: 'rg' });
    const g = cv.getContext('2d');
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const d = Math.hypot(x - c, y - c); if (Math.abs(d - R) > 0.62) continue;
      let a = Math.atan2(x - c, -(y - c)) / (2 * Math.PI); if (a < 0) a += 1;
      g.fillStyle = a <= p ? col : 'rgba(18,10,5,.75)';
      g.fillRect(x * px, y * px, px, px);
    }
    return cv;
  }

  // ---- 45f's soft pill bar, lifted from sheet-45g/stage.html (round ends, dark-wood rim, sea fill, a notch per task,
  // the current task softly glowing)
  const SEA = ['#d9f3ee', '#b2e6dd', '#8ad5c9', '#6cc3b6', '#58b0a3', '#479a8e', '#3a857a', '#2f6f66'];
  const SEA_NOW = ['#f4fcfa', '#e2f6f1', '#cdeee6', '#b8e5db', '#a4dbcf', '#90cfc2', '#7fc2b5', '#6fb3a6'];
  const TEAL = ['#c8f4ee', '#9ee8dc', '#6fd8ca', '#3fc4b4', '#34b0a1', '#2b9a8d', '#238478', '#1c6e64'];
  const anims = []; let tk = 0;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduce) setInterval(() => { tk++; for (const a of anims) a(tk); }, 90);
  function pill(w, h, s, bounds, p, cur, pal = SEA) {
    const c = document.createElement('canvas'); c.className = 'jpill'; c.width = w; c.height = h; c.style.width = w * s + 'px'; c.style.height = h * s + 'px';
    const g = c.getContext('2d'), r = Math.floor(h / 2);
    const P = (x, y, col, a = 1) => { g.globalAlpha = a; g.fillStyle = col; g.fillRect(x, y, 1, 1); g.globalAlpha = 1; };
    const inside = (x, y) => { const cx = x < r ? r - .5 : x > w - 1 - r ? w - 1 - r + .5 : x, cy = y < r ? r - .5 : y > h - 1 - r ? h - 1 - r + .5 : y; return Math.hypot(x - cx, y - cy) <= r + .15; };
    const draw = (t) => {
      g.clearRect(0, 0, w, h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { if (!inside(x, y)) continue; const rim = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1); P(x, y, rim ? (y < h / 2 ? '#6a4628' : '#3a2414') : y === 1 ? '#1a100a' : '#2a1a10'); }
      const inner = w - 2, fw = Math.round(inner * p), a = cur > 0 ? bounds[cur - 1] : 0, b = bounds[cur] ?? 1;
      const paint = (x0, x1, pl, al) => { for (let x = x0; x < x1; x++) for (let y = 1; y < h - 1; y++) { if (!inside(x, y) || !(inside(x - 1, y) && inside(x + 1, y) && inside(x, y - 1) && inside(x, y + 1))) continue; P(x, y, pl[Math.min(7, Math.round((y - 1) / (h - 3) * 7))], al); } };
      if (p < 1) paint(1 + Math.round(inner * a), 1 + Math.round(inner * b), SEA_NOW, .7 + .2 * Math.sin(t / 7));
      paint(1, 1 + fw, pal, 1);
      for (let x = 2; x < fw; x++) if (inside(x, 2)) P(x, 2, '#fff', .45);
      for (const q of bounds.slice(0, -1)) { const x = 1 + Math.round(inner * q); for (let y = 2; y < h - 2; y++) P(x, y, '#2a1a10', .45); }
      if (p < 1) for (let y = 1; y < h - 1; y++) { P(fw, y, '#fffaf0'); P(fw + 1, y, '#fff3d8', .5); }
    };
    if (p < 1) anims.push(draw); draw(0); return c;
  }

  // the job everyone draws: Waymark's coach brain (45g's example)
  const JOB = { sess: 'Waymark', name: 'Coach brain', p: .62, left: 'about 38 min left', cur: 3,
    tasks: [['Replay harness', 'done'], ['Athlete model', 'done'], ['Rules-only brain', 'done'], ['AI joins in', '48%'], ['Readiness meter', '20 min'], ['Test week', '10 min']], mins: [12, 18, 40, 25, 20, 10] };
  const JOB2 = { sess: 'Samara', name: 'Tab drawer polish', p: .15, left: 'about 50 min left', cur: 1,
    tasks: [['Read the drawer code', 'done'], ['Round the plaques', '30%'], ['Hover sounds', '15 min'], ['Test it', '10 min']], mins: [8, 20, 15, 10] };
  const boundsOf = (j) => { const tot = j.mins.reduce((a, b) => a + b, 0); let acc = 0; return j.mins.map((m) => (acc += m) / tot); };
  const MSG = '<svg viewBox="0 0 10 9" shape-rendering="crispEdges"><path d="M1 0h8v1H1zM0 1h1v5H0zM9 1h1v5H9zM1 6h3v1H1zM6 6h3v1H6zM3 7h2v1H3zM3 8h1v1H3zM2 2h6v1H2zM2 4h4v1H2z" fill="#efe6ff"/></svg>';
  const tasksHTML = (j) => j.tasks.map(([n, r], k) => `<div class="ob ${k < j.cur ? 'done' : k === j.cur ? 'now' : ''}"><i></i><span class="tx">${n}</span><span class="r">${r}</span></div>`).join('');

  return { MAPS, ORDER, GLOWS, NAMES, COL, mix, mark, rune, ring, pill, TEAL, JOB, JOB2, boundsOf, MSG, tasksHTML, reduce };
})();

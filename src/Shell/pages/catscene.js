// Sheet 91 v2 (his pick, 2026-10-30: "Sheet 91 v2 looks good, build the cat page"): Jiji on the unplugged cord, for a page
// that did not load. Drawn pixel by pixel at 5x, the same steps as the sheet; the eyes glance at the plug and back, a blink,
// the tail swishes. Runs only while the page shows it.
const CAT = [
  '...K..............K.....',
  '...KK............KK.....',
  '...KiK..........KiK.....',
  '...KiiK........KiiK.....',
  '..KKiiKK......KKiiKK....',
  '..KKKiKKKKKKKKKKiKKK....',
  '.KKKKKKKKKKKKKKKKKKKK...',
  '.KKKKKKKKKKKKKKKKKKKK...',
  'KKKKWWWKKKKKKKKWWWKKKK..',
  'KKKWWWWWKKKKKKWWWWWKKK..',
  'KKKWWWWWKKKKKKWWWWWKKK..',
  'KKKWWWWWKKKKKKWWWWWKKK..',
  'KKKWWWWWKKKKKKWWWWWKKK..',
  'KKKsWWWsKKKKKKsWWWsKKK..',
  '.KKKsssKKKKKKKKsssKKK...',
  '.KKKKKKKKKKKKKKKKKKKK...',
  '..KKKKKKKKKKKKKKKKKK....',
  '...KKKKKKKKKKKKKKKK.....',
  '.....KKKKKKKKKKKK.......',
  '......KKKKKKKKKK........',
  '......KKKKKKKKKKK.......',
  '.....KKKKKKKKKKKKK......',
  '.....KKKKKKKKKKKKK......',
  '.....KKK.KKKKKKKKKK.....',
  '.....KKK.KKKKKKKKKK.....',
  '.....KKK.KKKKKKKKKK.....',
  '.....KKK.KKKKKKKKKK.....',
  '....KKKK.KKKKKKKKKK.....',
  '....KKKKKKKKKKKKKKK.....',
  '....KKKK.KKKKKKKKK......',
];
const PAL = { K: '#141118', h: '#3d3850', H: '#5a5470', W: '#F6F2EA', s: '#C9C2D8', P: '#141118', i: '#6b4a92' };
// The tail: from the back of the hip, out and up, the tip curling; two poses.
const TAIL = [[[18, 27], [20, 27], [22, 26], [23, 24], [23, 21], [22, 18], [22, 16], [23, 15]], [[18, 27], [20, 27], [22, 26], [23, 24], [24, 21], [24, 18], [25, 16], [26, 16]]];
function drawCat(put, ox, oy, t) {
  const look = t % 16 < 4 ? -1 : 0;           // glances at the plug (to its left), then back at you
  const blink = t % 16 === 9;
  const at = (x, y) => y >= 0 && y < CAT.length && x >= 0 && CAT[y][x] && CAT[y][x] !== '.';
  CAT.forEach((r, y) => [...r].forEach((ch, x) => {
    if (ch === '.') return;
    let c = ch;
    if (ch === 'K' && !at(x, y - 1)) c = 'H';
    else if (ch === 'K' && !at(x - 1, y) && y > 6) c = 'h';
    if (blink && (ch === 'W' || ch === 's')) c = y === 12 ? 'h' : 'K';
    put(ox + x, oy + y, PAL[c]);
  }));
  if (!blink) for (const ex of [5, 16]) { const px = ex + look; for (const y of [10, 11, 12]) put(ox + px, oy + y, PAL.P); put(ox + px - 1 + 0, oy + 9, PAL.W); put(ox + px + 1, oy + 9, '#ffffff'); }
  const tail = TAIL[(t >> 1) % 2];
  for (let i = 0; i < tail.length - 1; i++) {
    const [x1, y1] = tail[i], [x2, y2] = tail[i + 1], n = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
    for (let k = 0; k <= n; k++) { const x = Math.round(x1 + (x2 - x1) * k / n), y = Math.round(y1 + (y2 - y1) * k / n); put(ox + x, oy + y, PAL.K); put(ox + x + 1, oy + y, i > 3 ? PAL.h : PAL.K); }
  }
}

/** The scene on `canvas` (640 x 320). Returns start and stop: nothing draws while it is hidden. */
export function catScene(canvas) {
  const g = canvas.getContext('2d'); g.imageSmoothingEnabled = false; g.setTransform(5, 0, 0, 5, 0, 0);
  const put = (x, y, col) => { if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); } };
  const lantern = new Image(); lantern.src = 'art/samara/samara-lantern-32.png';
  const line = (pts, col) => { for (let i = 0; i < pts.length - 1; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[i + 1]; const n = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1), 1); for (let k = 0; k <= n; k++) put(Math.round(x1 + (x2 - x1) * k / n), Math.round(y1 + (y2 - y1) * k / n), col); } };
  const frame = (t) => {
    g.clearRect(0, 0, 128, 64);
    // a warm pool of light on the floor, in whole pixels, fading out in steps (no blur)
    for (let y = 30; y < 52; y++) for (let x = 0; x < 128; x++) { const d = Math.hypot((x - 62) / 1.6, (y - 52) * 1.4); if (d < 40) put(x, y, d < 18 ? '#2a1e18' : d < 30 ? '#1f1714' : '#17110f'); }
    for (let x = 0; x < 128; x++) { const e = Math.min(x, 127 - x); if (e < 4) continue; put(x, 52, '#120A05'); put(x, 53, e < 12 ? '#4a3020' : '#7a5230'); for (let y = 54; y < 60; y++) put(x, y, e < 12 ? '#2e1d12' : (x + (y > 56 ? 11 : 0)) % 24 === 0 ? '#3b2414' : '#5c3a20'); }
    // the wall on the left, side on, and the socket on it facing the plug: two dark slots at the prongs' height
    for (let y = 16; y < 53; y++) for (let x = 4; x < 9; x++) { if (y < 22 && (y - 16) < (9 - x)) continue; put(x, y, x === 8 ? '#120A05' : y < 26 ? '#2e1d12' : (x + y) % 7 === 0 ? '#3b2414' : '#4a3020'); }
    const SOCK = ['oooo.', 'oWWo.', 'oWWWo', 'oWWko', 'oWWWo', 'oWWWo', 'oWWWo', 'oWWko', 'oWWWo', 'oWWo.', 'oooo.'];
    SOCK.forEach((r, y) => [...r].forEach((ch, x) => put(8 + x, 42 + y, { o: '#120A05', W: '#e2d4b4', k: '#2a1a0e' }[ch])));
    // the plug, pulled out, lying on the floor: two metal prongs point left at the socket, the cord leaves from its back
    const PLUG = ['......ooooooo...', 'oooo.oWWWWWWWo..', 'SSSSooWWWWWWWWo.', 'oooo.oWWWWWWWWooo', '.....oWWWWWWWWOOO', 'oooo.oWWWWWWWWooo', 'SSSSooWWWWWWWWo..', 'oooo.oYWWWWWWo...', '......ooooooo....'];
    PLUG.forEach((r, y) => [...r].forEach((ch, x) => put(19 + x, 43 + y, { o: '#120A05', W: '#efe6d2', Y: '#cdbb9a', S: '#d9dde6', O: '#a07a2c' }[ch])));
    // the cord: from the plug's back, under the cat's paws, to the lantern (dark)
    line([[36, 48], [44, 51], [70, 51], [96, 51], [106, 50]], '#120A05');
    line([[36, 47], [44, 50], [70, 50], [96, 50], [106, 49]], '#a07a2c');
    line([[36, 46], [44, 49]], '#120A05');
    if (lantern.complete) { g.save(); g.filter = 'brightness(.35) saturate(.4)'; g.drawImage(lantern, 98, 22, 32, 32); g.restore(); }
    drawCat(put, 48, 22, t);
  };
  let t = 0, timer = 0;
  lantern.onload = () => frame(t);
  return {
    start() { if (timer) return; frame(t); timer = setInterval(() => frame(++t), 220); },
    stop() { clearInterval(timer); timer = 0; },
  };
}

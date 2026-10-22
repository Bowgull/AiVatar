// Sheet 60 B (his pick, 2026-10-22): "Aang holds it up". A little paper in the note's category colour with two ruled
// lines and the noticed one marked in gold, his hands on its bottom corners: the sheet's own drawing (peek.js held()),
// 17 x 14 art pixels, drawn at a whole-number scale so it stays crisp beside his sprite. A click opens the note.
import { mix } from './notecats.js';

const cv = /** @type {HTMLCanvasElement} */ (document.getElementById('held'));
const W = 17, H = 14;
/** @param {{ paper?: string, deep?: string, px?: number }} d */
function draw(d) {
  const paper = d.paper || '#f8dc8e', deep = d.deep || '#d9a83a', px = Math.max(1, Math.round(Number(d.px) || 2));
  const edge = '#3a2a1e', skin = '#f2c49a', skinD = '#c98e66', ink = mix(deep, '#1a0e06', 0.35);
  cv.width = W * px; cv.height = H * px;
  const g = cv.getContext('2d');
  if (!g) return;
  g.clearRect(0, 0, cv.width, cv.height);
  const put = (x, y, c) => { g.fillStyle = c; g.fillRect(x * px, y * px, px, px); };
  for (let y = 0; y < 12; y++) for (let x = 1; x < 16; x++) {
    const e = y === 0 || y === 11 || x === 1 || x === 15, corner = (y === 0 || y === 11) && (x === 1 || x === 15);
    if (corner) continue;
    put(x, y, e ? edge : y < 3 ? mix(paper, '#ffffff', 0.35) : paper);
  }
  for (let x = 3; x < 12; x++) put(x, 3, ink);
  for (let x = 3; x < 14; x++) { put(x, 6, '#ffc43c'); put(x, 7, '#e0a020'); }
  for (let x = 3; x < 10; x++) put(x, 9, ink);
  put(3, 6, '#2a1c10'); put(4, 6, '#2a1c10');
  for (const [hx, hy] of [[0, 9], [0, 10], [1, 10], [1, 11], [2, 11], [16, 9], [16, 10], [15, 10], [15, 11], [14, 11]]) put(hx, hy, hy === 11 ? skinD : skin);
  put(0, 11, skinD); put(16, 11, skinD);
}
window.aang?.onHeldData?.((d) => { if (d && typeof d === 'object') draw(d); });
cv.addEventListener('click', () => window.aang?.heldOpen?.());
cv.addEventListener('mouseenter', () => window.aang?.heldHover?.(true));
cv.addEventListener('mouseleave', () => window.aang?.heldHover?.(false));
draw({});

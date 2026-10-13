// Sheet 17's wheel, where the discs go. Pure, so every docked spot can be tested without a screen.
//
// The discs fan out from Aang toward the middle of his screen, 150 degrees wide. Then, if any disc (with its
// name above it) would still hang off an edge, the whole fan slides back on until every one is fully visible.
// That covers him docked on any edge at any point along it, tucked in a corner, and peeking out from under the
// taskbar (his test, 2026-10-12: docked, part of the wheel was cut off).

export const RADIUS = 150;
/** A disc is 62 px across; its name sits 15 px above it. */
const HALF = 31, LABEL = 17, PAD = 8;

/**
 * @param {{cx:number, cy:number, w:number, h:number, n:number}} s  Aang's point and the screen's size, in the
 *   wheel window's own pixels (the window covers the whole screen).
 * @returns {{x:number, y:number}[]} the centre of each disc
 */
export function layoutWheel(s) {
  const towards = Math.atan2(-(s.h / 2 - s.cy), s.w / 2 - s.cx);      // y points up, as the angles are drawn
  const spread = 150 * Math.PI / 180;
  const out = [];
  for (let i = 0; i < s.n; i++) {
    const a = towards + spread / 2 - i * (spread / Math.max(1, s.n - 1));
    out.push({ x: s.cx + RADIUS * Math.cos(a), y: s.cy - RADIUS * Math.sin(a) });
  }
  // Away (was Quiet) always goes at the bottom end (his ask): the last disc is the lower end of the fan.
  if (out.length > 1 && out[0].y > out[out.length - 1].y) out.reverse();
  // Slide the fan back on screen if any part of it is off.
  const left = Math.min(...out.map((p) => p.x - HALF)), right = Math.max(...out.map((p) => p.x + HALF));
  const top = Math.min(...out.map((p) => p.y - HALF - LABEL)), bottom = Math.max(...out.map((p) => p.y + HALF));
  let dx = 0, dy = 0;
  if (left < PAD) dx = PAD - left; else if (right > s.w - PAD) dx = s.w - PAD - right;
  if (top < PAD) dy = PAD - top; else if (bottom > s.h - PAD) dy = s.h - PAD - bottom;
  return out.map((p) => ({ x: p.x + dx, y: p.y + dy }));
}

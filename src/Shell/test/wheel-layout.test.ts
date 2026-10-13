import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutWheel } from '../pages/wheellayout.js';

// Every disc, with its name above it, must be fully on the screen: Aang docked on each edge at every point along
// it, in every corner, and peeking out from under the taskbar, on the screen sizes he might use.
const SCREENS = [[1920, 1080], [2560, 1440], [1280, 720], [3440, 1440], [1366, 768]];

function inside(w: number, h: number, cx: number, cy: number) {
  const discs = layoutWheel({ cx, cy, w, h, n: 6 }) as { x: number; y: number }[];
  for (const d of discs) {
    if (d.x - 31 < 0 || d.x + 31 > w || d.y - 31 - 17 < 0 || d.y + 31 > h) return `disc at ${Math.round(d.x)},${Math.round(d.y)} is off a ${w}x${h} screen when Aang is at ${cx},${cy}`;
  }
  // and no two discs on top of each other
  for (let i = 0; i < discs.length; i++) for (let j = i + 1; j < discs.length; j++) {
    if (Math.hypot(discs[i]!.x - discs[j]!.x, discs[i]!.y - discs[j]!.y) < 50) return `discs ${i} and ${j} overlap at ${cx},${cy}`;
  }
  return '';
}

test('sheet 17: the wheel is fully on screen wherever Aang is docked', () => {
  const problems: string[] = [];
  for (const [w, h] of SCREENS) {
    for (let f = 0; f <= 1.0001; f += 0.02) {
      const along = (len: number) => Math.round(f * len);
      // His head on each edge (0 to 40 px in), anywhere along it, and right on the edge itself.
      for (const inset of [0, 6, 20, 40]) {
        for (const [cx, cy] of [[inset, along(h)], [w - inset, along(h)], [along(w), inset], [along(w), h - inset]] as const) {
          const p = inside(w!, h!, cx, cy);
          if (p) problems.push(p);
        }
      }
    }
  }
  assert.deepEqual(problems.slice(0, 5), []);
});

test('the wheel opens toward the middle of the screen', () => {
  const [d] = layoutWheel({ cx: 1900, cy: 540, w: 1920, h: 1080, n: 6 }) as { x: number; y: number }[];
  assert.ok(d!.x < 1900, 'docked on the right, the discs go left');
});

test('Quiet, the last disc, is at the bottom end of the wheel', () => {
  for (const [cx, cy] of [[1900, 540], [20, 540], [960, 1070], [960, 10], [1900, 1060], [20, 20]]) {
    const d = layoutWheel({ cx, cy, w: 1920, h: 1080, n: 6 }) as { x: number; y: number }[];
    assert.ok(d[5]!.y >= d[0]!.y, `Aang at ${cx},${cy}: Quiet at ${Math.round(d[5]!.y)}, Timer at ${Math.round(d[0]!.y)}`);
  }
});

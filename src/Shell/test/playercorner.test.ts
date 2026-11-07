// Sheet 119 B: the mini player's window is cut along the wood's own pixel staircase (family.ts artCornerSteps), so the
// region and the page's drawing (pages/player/pix.js rrMask) must agree pixel for pixel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { artCornerSteps, bodyCornerArt, PLAYER_CORNER_ART } from '../src/family.ts';

/** pix.js rrMask's corner, copied: the first inside pixel of each art row of the top-left corner. */
function maskRow(r: number): number[] {
  const out: number[] = [];
  for (let y = 0; y < r; y++) { let x = 0; while (x < r && Math.hypot(x + 0.5 - r, y + 0.5 - r) > r + 0.01) x++; out.push(x); }
  return out;
}

test('the corner is 13 art px, clamped to just under half the body (the shade strip, the fold)', () => {
  assert.equal(PLAYER_CORNER_ART, 13);
  assert.equal(bodyCornerArt(13, 212, 104), 13);   // full player
  assert.equal(bodyCornerArt(13, 212, 26), 12);    // shade strip
  assert.equal(bodyCornerArt(13, 212, 10), 4);     // mid-fold, very thin
  assert.equal(bodyCornerArt(13, 100, 300), 13);   // column
});

test('at 100% each art row is two screen rows with twice the inset', () => {
  const art = maskRow(13).filter((x) => x > 0);
  const s = artCornerSteps(13, 2);
  assert.equal(s.length, art.length * 2);
  art.forEach((x, i) => { assert.equal(s[2 * i], 2 * x); assert.equal(s[2 * i + 1], 2 * x); });
  assert.ok(s[0]! >= 14 && s[0]! <= 18, `top row inset ${s[0]}`);
});

test('steps only ever shrink going inwards, at 125% and 150% too', () => {
  for (const px of [2, 2.5, 3]) {
    const s = artCornerSteps(13, px);
    for (let i = 1; i < s.length; i++) assert.ok(s[i]! <= s[i - 1]!, `px ${px} row ${i}`);
    assert.ok(s.every((v) => Number.isInteger(v) && v > 0));
  }
  assert.deepEqual(artCornerSteps(0, 2), []);
});

test('the corner helper takes the steps at every scale up to 300%', () => {
  for (const scale of [1, 1.25, 1.5, 2, 2.5, 3]) {
    const s = artCornerSteps(13, 2 * scale);
    assert.ok(s.length <= 160 && Math.max(...s) <= 160, `scale ${scale}: ${s.length} rows, top ${s[0]}`);
  }
});

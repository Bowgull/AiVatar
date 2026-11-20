// Sheet 121 (4): the side-by-side sums the Shell and the band share (src/splitview.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPLIT_GAP, SPLIT_MIN, clampSplit, splitLeftWidth } from '../src/splitview.ts';

test('a share stays between the limits, and nonsense is half', () => {
  assert.equal(clampSplit(0.5), 0.5);
  assert.equal(clampSplit(0), SPLIT_MIN);
  assert.equal(clampSplit(1), 1 - SPLIT_MIN);
  assert.equal(clampSplit(Number.NaN), 0.5);
  assert.equal(clampSplit(Infinity), 0.5);
});

test('the two pages and the gap fill the page area exactly', () => {
  for (const [w, r] of [[1360, 0.5], [1361, 0.37], [900, 0.8], [721, 0.2]] as const) {
    const lw = splitLeftWidth(w, r), rw = w - lw - SPLIT_GAP;
    assert.ok(lw > 0 && rw > 0, `${w} ${r}`);
    assert.equal(lw + SPLIT_GAP + rw, w);
  }
  assert.equal(splitLeftWidth(1022, 0.5), 500);
  assert.equal(splitLeftWidth(0, 0.5), 0);
});

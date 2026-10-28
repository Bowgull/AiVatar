// 2026-10-28, his "it's not worth waiting that long for what's 6 times 7": plain sums in plain code, nothing else.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quickMath } from '../src/quickmath.ts';

test('plain sums are answered exactly', () => {
  for (const [q, a] of [['whats 6 times 7', '42'], ['what is 6x7?', '42'], ['12 divided by 5', '2.4'], ['(3+4)*2', '14'], ['15% of 80', '12'],
    ['2 to the power of 10', '1024'], ['9 squared', '81'], ['1,250 + 3,400', '4650'], ['hey what is 7 * 8', '56'], ['12500 * 3', '37,500']])
    assert.equal(quickMath(q), a, q);
});

test('anything that is not a plain sum is left to the model', () => {
  for (const q of ['what time is it', 'what is the capital of france', '6 apples times 7', 'what is 10 / 0', 'set a timer for 5 minutes', 'x times y', 'is 6 times 7 more than 40', 'call mom'])
    assert.equal(quickMath(q), null, q);
});

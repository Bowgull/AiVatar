import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickLane } from '../src/route.ts';

test('casual chat stays on Quick', () => {
  assert.deepEqual(pickLane('whats the time', 'auto', false, false), { lane: 'quick', needsConsent: false });
  assert.equal(pickLane('i had a rough week', 'auto', false, false).lane, 'quick');
});

test('hard or long work escalates to Smart in Auto', () => {
  assert.equal(pickLane('can you debug this function for me', 'auto', false, false).lane, 'smart');
  assert.equal(pickLane('compare the two approaches step by step', 'auto', false, false).lane, 'smart');
  assert.equal(pickLane('x'.repeat(600), 'auto', false, false).lane, 'smart');
});

test('saving quota keeps Auto on Quick even for hard work', () => {
  assert.equal(pickLane('debug this in detail', 'auto', true, false).lane, 'quick');
});

test('explicit bigger models need consent while saving, and once grants it', () => {
  assert.deepEqual(pickLane('hi', 'smart', true, false), { lane: 'smart', needsConsent: true });
  assert.deepEqual(pickLane('hi', 'deep', true, true), { lane: 'deep', needsConsent: false });
  assert.deepEqual(pickLane('hi', 'smart', false, false), { lane: 'smart', needsConsent: false });
});

test('explicit Quick is always allowed', () => {
  assert.deepEqual(pickLane('debug it', 'quick', true, false), { lane: 'quick', needsConsent: false });
});

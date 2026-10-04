// Step 6.12b: Up and Down, ported from InputHistory.cs. His hands already know these, so the rules are
// checked one by one rather than "it recalls something".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { History, MAX, MODES, modeForKey } from '../pages/history.js';

test('Up walks back through what he sent, newest first', () => {
  const h = new History(['one', 'two', 'three']);
  assert.equal(h.prev(''), 'three');
  assert.equal(h.prev(''), 'two');
  assert.equal(h.prev(''), 'one');
  assert.equal(h.prev(''), 'one', 'and stops at the oldest rather than wrapping');
});

test('WHAT HE WAS TYPING IS KEPT, and Down past the newest gives it back', () => {
  // The rule that matters: pressing Up to check something must not cost him a half-written message.
  const h = new History(['one', 'two']);
  assert.equal(h.prev('half a thought'), 'two');
  assert.equal(h.prev('two'), 'one');
  assert.equal(h.next(), 'two');
  assert.equal(h.next(), 'half a thought');
  assert.equal(h.browsing, false);
  assert.equal(h.next(), null, 'Down when not browsing does nothing');
});

test('sending adds it, once, and stops browsing', () => {
  const h = new History(['one']);
  h.prev('');
  h.add('two');
  assert.equal(h.browsing, false);
  h.add('two');
  assert.deepEqual(h.items, ['one', 'two'], 'the same message twice in a row is kept once');
  h.add('   ');
  assert.deepEqual(h.items, ['one', 'two'], 'and blank is never history');
});

test('at most fifty, the oldest dropped first', () => {
  const h = new History(Array.from({ length: 60 }, (_, i) => 'm' + i));
  assert.equal(h.items.length, MAX);
  assert.equal(h.items[0], 'm10');
  h.add('new');
  assert.equal(h.items.length, MAX);
  assert.equal(h.items[MAX - 1], 'new');
});

test('a damaged history file never breaks the box', () => {
  // It is shared with the old box and could hold anything.
  for (const bad of [null, 'text', { a: 1 }, [1, null, '', '  ', 'ok']]) {
    const h = new History(bad as never);
    assert.ok(Array.isArray(h.items));
  }
  assert.deepEqual(new History([1, null, '', 'ok'] as never).items, ['ok']);
});

test('Up with no history at all does nothing', () => {
  assert.equal(new History([]).prev('draft'), null);
});

test('Ctrl+1 to 4 are Auto, Quick, Smart, Deep, as on ModelChip', () => {
  assert.deepEqual(MODES, ['auto', 'quick', 'smart', 'deep']);
  assert.equal(modeForKey('1'), 'auto');
  assert.equal(modeForKey('4'), 'deep');
  assert.equal(modeForKey('5'), null);
});

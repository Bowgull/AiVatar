// Step 6.12: the reply arrives at the pace he chose, whatever Claude does.
//
// The behaviour being protected is the one that was already got wrong once and fixed deliberately: the
// pace must NOT depend on how fast the answer arrives. A clock that can be wound by hand, so the pace
// is measured rather than waited for.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHARS_PER_SECOND, COLLAPSED_LINES, EXPANDED_LINES, PER_TICK, Reveal, TICK_MS,
  hasMore, linesShown, scrolls,
} from '../pages/reveal.js';

/** A clock under the test's control. */
function clock() {
  let t = 1000;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

test('the pace is his: 2 characters every 50ms, which is 40 a second', () => {
  assert.equal(PER_TICK, 2);
  assert.equal(TICK_MS, 50);
  assert.equal(CHARS_PER_SECOND, 40);

  const c = clock();
  const r = new Reveal(c.now);
  r.start('abcdefghij', false);
  assert.equal(r.text, '', 'nothing before the first tick');
  c.advance(50); r.tick();
  assert.equal(r.text, 'ab');
  c.advance(50); r.tick();
  assert.equal(r.text, 'abcd');
  c.advance(1000); r.tick();
  assert.equal(r.text, 'abcdefghij', 'and it stops at the end rather than running on');
});

test('A REPLY THAT ARRIVES ALL AT ONCE READS AT THE SAME PACE AS A SLOW ONE', () => {
  // The whole reason this file exists. The old code was Math.Max(2, backlog / 6), which dumped an
  // instant reply at about 2,000 characters a second, so the same bubble read as typing or as a flash
  // depending on how fast Claude happened to answer. Never again.
  const text = 'x'.repeat(400);

  const fast = clock(); const a = new Reveal(fast.now);
  a.start(text, false);                       // the whole thing, instantly
  fast.advance(500); a.tick();

  const slow = clock(); const b = new Reveal(slow.now);
  b.start('x'.repeat(40), true);              // dribbling in
  slow.advance(250); b.tick();
  b.append('x'.repeat(200), true);
  slow.advance(250); b.tick();

  assert.equal(a.text.length, 20, '500ms is 20 characters, no matter how much is waiting');
  assert.equal(b.text.length, 20, 'and exactly the same for the slow one');
});

test('more arriving never speeds it up or restarts it', () => {
  const c = clock();
  const r = new Reveal(c.now);
  r.start('abcdefghij', true);
  c.advance(100); r.tick();
  assert.equal(r.text, 'abcd');
  r.append('abcdefghijklmnopqrst', true);     // twice as much to say now
  r.tick();
  assert.equal(r.text, 'abcd', 'the backlog does not move it along');
  c.advance(50); r.tick();
  assert.equal(r.text, 'abcdef', 'it carries on at the same pace');
});

test('a dropped frame catches up rather than falling behind', () => {
  // Counted tick by tick, a hidden or throttled window would reveal slower than promised and a long
  // reply would still be crawling minutes later. Worked out from the clock instead.
  const c = clock();
  const r = new Reveal(c.now);
  r.start('x'.repeat(100), false);
  c.advance(1000);                            // a whole second missed
  r.tick();
  assert.equal(r.text.length, 40, 'exactly where it should be, not one tick in');
});

test('a click shows the rest, and says whether there was anything to show', () => {
  const c = clock();
  const r = new Reveal(c.now);
  r.start('abcdefghij', false);
  c.advance(50); r.tick();
  assert.equal(r.skip(), true);
  assert.equal(r.text, 'abcdefghij');
  // Said NO the second time, because the same click means "expand" once there is nothing left to
  // reveal, and doing both would expand a bubble he was only trying to finish.
  assert.equal(r.skip(), false);
});

test('copying takes the whole message, never the half that is on screen', () => {
  const c = clock();
  const r = new Reveal(c.now);
  r.start('the whole sentence', false);
  c.advance(50); r.tick();
  assert.equal(r.text, 'th');
  assert.equal(r.whole, 'the whole sentence');
});

test('"finished" means nothing more is coming AND all of it is shown', () => {
  const c = clock();
  const r = new Reveal(c.now);
  r.start('abcd', true);
  c.advance(500); r.tick();
  assert.equal(r.revealing, false, 'all of it is on screen');
  assert.equal(r.done, false, 'but the brain has not finished talking');
  r.append('abcdef', false);
  c.advance(500); r.tick();
  assert.equal(r.done, true);
});

test('six lines, then twelve, then it scrolls', () => {
  assert.equal(COLLAPSED_LINES, 6);
  assert.equal(EXPANDED_LINES, 12);

  assert.equal(linesShown(3, false), 3, 'a short reply is just itself');
  assert.equal(hasMore(3, false), false, 'and has no arrow');

  assert.equal(linesShown(9, false), 6, 'a long one collapses to six');
  assert.equal(hasMore(9, false), true, 'with the arrow');
  assert.equal(linesShown(9, true), 9, 'and a click shows all nine');
  assert.equal(hasMore(9, true), false);
  assert.equal(scrolls(9, true), false, 'nine fits in twelve, so no scrolling');

  assert.equal(linesShown(30, true), 12, 'past twelve it stops growing');
  assert.equal(scrolls(30, true), true, 'and scrolls instead');
  assert.equal(hasMore(30, true), true);
});

test('clearing leaves nothing behind for the next message to inherit', () => {
  const c = clock();
  const r = new Reveal(c.now);
  r.start('something', true);
  c.advance(100); r.tick();
  r.clear();
  assert.equal(r.text, '');
  assert.equal(r.whole, '');
  assert.equal(r.done, true);
  r.tick();
  assert.equal(r.text, '', 'and a stray tick afterwards does not resurrect it');
});

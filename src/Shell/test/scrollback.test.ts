// Step 6.12: scrolling up pulls older turns, with no limit.
//
// The behaviour being protected is the one that makes it feel bottomless: ask for turns older than the
// oldest already shown, and ask again every time he reaches the top. The guards matter as much as the
// feature - a scroll at the top fires many times a second, and asking for ever at the beginning of his
// history would be a loop.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scrollback, atTop } from '../pages/scrollback.js';

const turn = (id: number) => ({ id, ts: '2026-10-04T00:00:00Z', who: 'you' as const, text: 't' + id });

test('at the top it asks for turns older than the oldest it has', () => {
  const s = new Scrollback();
  s.add(turn(50));
  s.add(turn(51));
  assert.deepEqual(s.wants(true), { before: 50 }, 'older than the OLDEST, not the newest');
});

test('with nothing yet, it asks for the most recent page', () => {
  const s = new Scrollback();
  assert.deepEqual(s.wants(true), {}, 'no `before` at all');
});

test('IT DOES NOT ASK AGAIN WHILE A PAGE IS ALREADY COMING', () => {
  // A scroll at the top fires many times a second. Without this it would ask dozens of times for the
  // same page, which is what `awaitingOlder` guards in the C#.
  const s = new Scrollback();
  s.add(turn(50));
  assert.ok(s.wants(true));
  assert.equal(s.wants(true), null);
  assert.equal(s.wants(true), null);
  s.older([turn(49)]);
  assert.deepEqual(s.wants(true), { before: 49 }, 'and it asks again once the page has landed');
});

test('an empty page means the beginning, and it never asks again', () => {
  const s = new Scrollback();
  s.wants(true);
  assert.equal(s.older([]), 0);
  assert.equal(s.reachedTheStart, true);
  assert.equal(s.wants(true), null, 'asking for ever at the top of his history would be a loop');
});

test('a page of only things it already has also means the beginning', () => {
  const s = new Scrollback();
  s.add(turn(10));
  s.wants(true);
  assert.equal(s.older([turn(10)]), 0);
  assert.equal(s.reachedTheStart, true);
});

test('older turns go in front, in order, and never twice', () => {
  const s = new Scrollback();
  s.add(turn(30));
  s.wants(true);
  // Deliberately out of order and overlapping, which is what two overlapping requests look like.
  s.older([turn(28), turn(27), turn(30)]);
  assert.deepEqual(s.turns.map(t => t.id), [27, 28, 30]);
  assert.equal(s.oldestId, 27);
});

test('it only asks when he is actually at the top', () => {
  const s = new Scrollback();
  assert.equal(s.wants(false), null);
  assert.equal(atTop(0), true);
  assert.equal(atTop(3), true, 'a trackpad rarely lands exactly on zero');
  assert.equal(atTop(40), false);
});

test('a page that never arrives does not lock him out of his own history', () => {
  const s = new Scrollback();
  s.wants(true);
  assert.equal(s.wants(true), null);
  s.gaveUp();
  assert.ok(s.wants(true), 'he can try again');
});

test('forgetting one removes it, and clearing forgets the beginning too', () => {
  const s = new Scrollback();
  s.add(turn(1)); s.add(turn(2));
  s.forget(1);
  assert.deepEqual(s.turns.map(t => t.id), [2]);
  s.wants(true); s.older([]);
  assert.equal(s.reachedTheStart, true);
  s.clear();
  // Deliberate: he may have said more since, so the beginning is not a permanent fact.
  assert.equal(s.reachedTheStart, false);
  assert.deepEqual(s.turns, []);
});

test('a page of rubbish does not become rubbish on screen', () => {
  const s = new Scrollback();
  s.wants(true);
  assert.equal(s.older([{ id: NaN } as never, null as never, turn(5)]), 1);
  assert.deepEqual(s.turns.map(t => t.id), [5]);
});

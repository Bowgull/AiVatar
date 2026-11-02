// The loop catcher (2026-11-02): the same step with the same answer warns, then stops; a changing page never does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LoopCatch, LOOP_STOP } from '../src/loopcatch.ts';

const click = { page: 1, n: 4 };
const same = { ok: true, title: 'Jobs', url: 'https://x.test/a', changed: ['nothing visible changed'] };

test('three of the same step with the same answer warns, the next loop asks him, only the third stops for good', () => {
  const l = new LoopCatch();
  assert.equal(l.after(7, 'click', click, same), null);
  assert.equal(l.after(7, 'click', click, { ...same, waited: 300 }), null);
  assert.equal(l.after(7, 'click', click, { ...same, waited: 900 }), 'warn');
  assert.equal(l.before(7, 'click', click), null);
  for (let i = 0; i < 2; i++) assert.equal(l.after(7, 'click', click, same), null);
  assert.equal(l.after(7, 'click', click, same), 'ask');
  assert.equal(l.before(7, 'click', click), null);
  for (let i = 0; i < 2; i++) assert.equal(l.after(7, 'click', click, same), null);
  assert.equal(l.after(7, 'click', click, same), 'stop');
  assert.equal(l.before(7, 'click', click), LOOP_STOP);
  assert.equal(l.before(7, 'click', { ...click, allowed: true }), LOOP_STOP);
  assert.equal(l.before(7, 'click', { page: 1, n: 5 }), null);
  assert.equal(l.before(8, 'click', click), null);
  l.end(7);
  assert.equal(l.before(7, 'click', click), null);
});

test('the same button over different pages is not a loop', () => {
  const l = new LoopCatch();
  for (let p = 1; p <= 6; p++) assert.equal(l.after(1, 'click', click, { ...same, url: `https://x.test/?page=${p}` }), null);
});

test('two steps taking turns with the same answers is a loop', () => {
  const l = new LoopCatch();
  const open = { page: 1, n: 2 }, shut = { page: 1, n: 3 };
  assert.equal(l.after(1, 'click', open, { ...same, changed: ['menu opened'] }), null);
  assert.equal(l.after(1, 'click', shut, same), null);
  assert.equal(l.after(1, 'click', open, { ...same, changed: ['menu opened'] }), null);
  assert.equal(l.after(1, 'click', shut, same), 'warn');
});

test('scrolling, status checks and steps waiting for his yes never count', () => {
  const l = new LoopCatch();
  for (let i = 0; i < 5; i++) {
    assert.equal(l.after(1, 'scroll', { page: 1 }, { ok: true }), null);
    assert.equal(l.after(1, 'jobstate', { job: 1 }, { ok: true }), null);
    assert.equal(l.after(1, 'click', click, { ok: false, needs: 'lever', what: 'press Send' }), null);
  }
  assert.equal(l.after(undefined, 'click', click, same), null);
});

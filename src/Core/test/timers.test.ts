import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseTimerCommand, parseDuration, sayDuration, Timers, DONE_KEEP_MS, MAX_TIMERS } from '../src/timers.ts';

const MIN = 60_000;

test('sheet 17: timers said loosely are understood without a model', () => {
  assert.deepEqual(parseTimerCommand('hey set a timer for 25 minutes for the pizza'), { op: 'start', ms: 25 * MIN, label: 'Pizza' });
  assert.deepEqual(parseTimerCommand('set a timer for 10 minutes'), { op: 'start', ms: 10 * MIN, label: '' });
  assert.deepEqual(parseTimerCommand('10m food'), { op: 'start', ms: 10 * MIN, label: 'Food' });
  assert.deepEqual(parseTimerCommand('timer 1h tea'), { op: 'start', ms: 60 * MIN, label: 'Tea' });
  assert.deepEqual(parseTimerCommand('can you set a timer for an hour'), { op: 'start', ms: 60 * MIN, label: '' });
  assert.deepEqual(parseTimerCommand('start a 15 minute timer for laundry'), { op: 'start', ms: 15 * MIN, label: 'Laundry' });
  assert.deepEqual(parseTimerCommand('set a timer for 1 hour 20 minutes'), { op: 'start', ms: 80 * MIN, label: '' });
  assert.deepEqual(parseTimerCommand('set a timer for 90 seconds'), { op: 'start', ms: 90_000, label: '' });
  assert.deepEqual(parseTimerCommand('set a timer'), { op: 'setup' });
  assert.deepEqual(parseTimerCommand('cancel the timer'), { op: 'stop' });
});

test('sheet 17: things that are not timers stay with Aang', () => {
  assert.equal(parseTimerCommand('remind me in 10 minutes to check the oven'), null);
  assert.equal(parseTimerCommand('I waited 10 minutes for food and it was cold'), null);
  assert.equal(parseTimerCommand('how do timers work in wow'), null);
  assert.equal(parseTimerCommand('set a timer for 3 days'), null);
});

test('durations', () => {
  assert.equal(parseDuration('half an hour'), 30 * MIN);
  assert.equal(parseDuration('1h30'), 90 * MIN);
  assert.equal(parseDuration('an hour and a half'), 90 * MIN);
  assert.equal(sayDuration(25 * MIN), '25 minutes');
  assert.equal(sayDuration(65 * MIN), '1 hour 5 minutes');
});

const tmp = () => path.join(mkdtempSync(path.join(os.tmpdir(), 'timers-')), 't.json');

test('timers survive a restart, and +1 / pause / stop do what the keys say', () => {
  const file = tmp();
  const a = new Timers(file);
  const t = a.start(10 * MIN, 'Food', 1000)!;
  assert.equal(new Timers(file).list().length, 1);
  assert.equal(a.act(t.id, 'add', 1000)!.end, 1000 + 11 * MIN);
  assert.equal(a.act(t.id, 'pause', 2000)!.paused, 11 * MIN - 1000);
  assert.deepEqual(a.due(1000 + 20 * MIN), []);                  // paused: never due
  a.act(t.id, 'pause', 5000);
  assert.equal(a.due(5000 + 11 * MIN - 1000).length, 1);
  assert.equal(a.act(t.id, 'stop'), null);
  assert.equal(a.list().length, 0);
});

test('sheet 67 v2: pause holds the time exactly, go on carries on from it', () => {
  const a = new Timers(tmp());
  const t = a.start(5 * MIN, 'Tea', 0)!;
  const p = a.act(t.id, 'pause', 2 * MIN)!;
  assert.equal(p.paused, 3 * MIN);
  const r = a.act(t.id, 'pause', 50 * MIN)!;                      // 48 minutes later, still 3 left
  assert.equal(r.paused, 0);
  assert.equal(r.end, 53 * MIN);
});

test('sheet 67 v2: add and take away time (scroll, +1, +5), never under 10 seconds, paused too', () => {
  const a = new Timers(tmp());
  const t = a.start(5 * MIN, '', 0)!;
  assert.equal(a.act(t.id, 'add', 0, { ms: 5 * MIN })!.end, 10 * MIN);
  assert.equal(a.list()[0]!.total, 10 * MIN);
  assert.equal(a.act(t.id, 'add', 0, { ms: -MIN })!.end, 9 * MIN);
  const floor = a.act(t.id, 'add', 0, { ms: -60 * MIN })!;
  assert.equal(floor.end, 10_000);                                  // floor: 10 s left
  assert.ok(floor.total >= 10_000);
  a.act(t.id, 'pause', 0);
  assert.equal(a.act(t.id, 'add', 0, { ms: MIN })!.paused, 70_000);
  assert.equal(a.act(t.id, 'add', 0, { ms: 'lots' })!.paused, 70_000); // junk is ignored
});

test('sheet 67 v2: a finished timer is kept (done), rings once, then Again / +5 / X; it goes by itself after 10 min', () => {
  const a = new Timers(tmp());
  const t = a.start(MIN, 'Pizza', 0)!;
  assert.deepEqual(a.due(MIN - 1), []);                              // not a millisecond early
  const d = a.due(MIN);
  assert.equal(d.length, 1);
  assert.equal(d[0]!.done, MIN);
  assert.deepEqual(a.due(MIN + 5000), []);                           // rings once
  assert.equal(a.list().length, 1);                                  // still on screen to show the end
  assert.equal(a.act(t.id, 'pause', MIN + 1)!.paused, 0);            // pause does nothing to a finished one
  const again = a.act(t.id, 'again', 2 * MIN)!;
  assert.equal(again.done, undefined);
  assert.equal(again.end, 3 * MIN);
  a.due(3 * MIN);
  const five = a.act(t.id, 'again', 4 * MIN, { ms: 5 * MIN })!;
  assert.equal(five.total, 5 * MIN);
  assert.equal(five.end, 9 * MIN);
  a.due(9 * MIN);
  assert.equal(a.expire(9 * MIN + DONE_KEEP_MS - 1), false);
  assert.equal(a.expire(9 * MIN + DONE_KEEP_MS), true);
  assert.equal(a.list().length, 0);
});

test('sheet 67 v2: the brain knows exactly when to look next', () => {
  const a = new Timers(tmp());
  assert.equal(a.nextAt(), null);
  const x = a.start(3 * MIN, 'x', 0)!;
  a.start(2 * MIN, 'y', 0);
  assert.equal(a.nextAt(), 2 * MIN);
  a.act(x.id, 'pause', 0);
  a.due(2 * MIN);
  assert.equal(a.nextAt(), 2 * MIN + DONE_KEEP_MS);                  // only the finished one's going is left
});

test('sheet 67b: blue first, then the next free colour; rename and recolour; finished ones make room', () => {
  const a = new Timers(tmp());
  const cols = Array.from({ length: MAX_TIMERS }, (_, i) => a.start(MIN, 'n' + i, i)!.colour);
  assert.deepEqual(cols, ['blue', 'gold', 'rose', 'jade', 'violet']);
  assert.equal(a.start(MIN, 'too many', 10), null);
  const first = a.list()[0]!;
  assert.equal(a.act(first.id, 'rename', 0, { label: '  Raid   pull  ' })!.label, 'Raid pull');
  assert.equal(a.act(first.id, 'colour', 0, { colour: 'violet' })!.colour, 'violet');
  assert.equal(a.act(first.id, 'colour', 0, { colour: 'mauve' })!.colour, 'violet');
  a.due(MIN + 10);                                                    // all five finish
  const fresh = a.start(MIN, 'new', MIN + 20);
  assert.ok(fresh, 'a finished plate never blocks a new timer');
  assert.equal(a.start(MIN, 'p', 0, 'jade')!.colour, 'jade');
});

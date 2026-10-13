import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseTimerCommand, parseDuration, sayDuration, Timers } from '../src/timers.ts';

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

test('timers survive a restart, and +1 / pause / stop do what the keys say', () => {
  const file = path.join(mkdtempSync(path.join(os.tmpdir(), 'timers-')), 't.json');
  const a = new Timers(file);
  const t = a.start(10 * MIN, 'Food', 1000)!;
  assert.equal(new Timers(file).list().length, 1);
  assert.equal(a.act(t.id, 'add', 1000)!.end, 1000 + 11 * MIN);
  assert.equal(a.act(t.id, 'pause', 2000)!.paused, 11 * MIN - 1000);
  assert.deepEqual(a.due(1000 + 20 * MIN), []);                  // paused: never due
  a.act(t.id, 'pause', 5000);
  assert.equal(a.due(5000 + 11 * MIN).length, 1);
  assert.equal(a.list().length, 0);
});

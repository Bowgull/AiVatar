import './_env.ts';
// A write that fails must say so. Once, loudly, then quietly.
//
// WHY THIS EXISTS: on 2026-10-01 a routine measurement found that `turns.jsonl` had recorded
// nothing since 2026-09-24, and `sessions.json` had stopped within a minute of it. Six days of
// metrics gone, and six days of lane sessions not persisting on a machine that restarts about
// six times a day. Nothing anywhere said so.
//
// Both sat behind a bare `catch {}` commented "best effort". That is a fair description of ONE
// write: a metrics line is not worth crashing a turn over. It is not a fair description of a
// week of them. The bug was not the failure, it was the silence.
//
// The opposite mistake is just as bad: a line per failed turn on a hot path is a log nobody
// reads and the next person disables. So the contract tested here is loud once, then a pulse at
// each power of ten, carrying the running count.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reportWriteFailure, writeFailureCount } from '../src/atomic.ts';

function captureErrors(fn: () => void): string[] {
  const lines: string[] = [];
  const real = console.error;
  console.error = (...a: unknown[]) => { lines.push(a.join(' ')); };
  try { fn(); } finally { console.error = real; }
  return lines;
}

test('the first failure is reported, and says the file will not fix itself', () => {
  const file = 'C:/nowhere/first-' + Math.random() + '/turns.jsonl';
  const out = captureErrors(() => reportWriteFailure(file, Object.assign(new Error('no such dir'), { code: 'ENOENT' })));
  assert.equal(out.length, 1, 'a failed write must be reported the first time, not swallowed');
  assert.match(out[0]!, /turns\.jsonl/, 'it must name the file, since the whole point is knowing which one died');
  assert.match(out[0]!, /ENOENT/, 'it must carry the reason, or the next person is guessing again');
  assert.match(out[0]!, /will not fix itself/, 'the first line must say this is persistent, not a blip');
});

test('it does not log once per turn, which is how logging gets turned off', () => {
  const file = 'C:/nowhere/quiet-' + Math.random() + '/turns.jsonl';
  const out = captureErrors(() => { for (let i = 0; i < 9; i++) reportWriteFailure(file, new Error('x')); });
  assert.equal(out.length, 1, 'nine failures in a row must produce one line, not nine');
});

test('a persistent failure keeps a pulse, at each power of ten, with the count', () => {
  const file = 'C:/nowhere/pulse-' + Math.random() + '/turns.jsonl';
  const out = captureErrors(() => { for (let i = 0; i < 100; i++) reportWriteFailure(file, new Error('x')); });
  assert.equal(out.length, 3, 'expected a line at the 1st, 10th and 100th failure');
  assert.match(out[1]!, /10x/, 'the repeat lines must carry the running total');
  assert.match(out[2]!, /100x/);
});

test('each file is counted on its own, so one dead file does not mask another', () => {
  const a = 'C:/nowhere/a-' + Math.random() + '/turns.jsonl';
  const b = 'C:/nowhere/b-' + Math.random() + '/sessions.json';
  const out = captureErrors(() => { reportWriteFailure(a, new Error('x')); reportWriteFailure(b, new Error('y')); });
  assert.equal(out.length, 2, 'two different files failing must both be reported');
  assert.equal(writeFailureCount(a), 1);
  assert.equal(writeFailureCount(b), 1);
});

test('a file that has never failed reports zero, so a health check can trust it', () => {
  assert.equal(writeFailureCount('C:/nowhere/never-touched/turns.jsonl'), 0);
});

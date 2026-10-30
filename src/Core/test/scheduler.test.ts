// The scheduler engine (2026-10-30): quiet skip and resume, catch-up after a restart, no overlap, one-shots. Fake clock.
import './_env.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describeJobs, Scheduler, type SchedClock } from '../src/scheduler.ts';

/** A clock that only moves when told to. Timers fire in order as it passes them. */
class FakeClock implements SchedClock {
  t = 1_000_000;
  private timers: { at: number; fn: () => void; id: number }[] = [];
  private id = 0;
  now(): number { return this.t; }
  setTimeout(fn: () => void, ms: number): unknown { const id = ++this.id; this.timers.push({ at: this.t + ms, fn, id }); return id; }
  clearTimeout(h: unknown): void { this.timers = this.timers.filter((x) => x.id !== h); }
  get pending(): number { return this.timers.length; }
  advance(ms: number): void {
    const end = this.t + ms;
    for (;;) {
      this.timers.sort((a, b) => a.at - b.at || a.id - b.id);
      const next = this.timers[0];
      if (!next || next.at > end) break;
      this.timers.shift();
      this.t = Math.max(this.t, next.at);
      next.fn();
    }
    this.t = end;
  }
}
const MIN = 60_000;
const flushMicro = () => new Promise((r) => setImmediate(r));

test('every() runs on its beat, first after one interval or after `first`', () => {
  const c = new FakeClock(), s = new Scheduler({ clock: c });
  const a: number[] = [], b: number[] = [];
  s.every('a', 10 * MIN, () => a.push(c.now()));
  s.every('b', 10 * MIN, () => b.push(c.now()), { first: 30_000 });
  c.advance(30 * MIN);
  assert.equal(a.length, 3);
  assert.equal(b.length, 3);                    // 0:30, 10:30, 20:30
  assert.equal(b[0], 1_000_000 + 30_000);
  s.stop();
  assert.equal(c.pending, 0);
});

test('a quiet job waits while he is busy, then runs ONCE when quiet ends (wake), and keeps its beat after', () => {
  const c = new FakeClock();
  let busy = '';
  const s = new Scheduler({ clock: c, quietNow: () => busy });
  let runs = 0, loud = 0;
  s.every('feeds', 20 * MIN, () => { runs++; }, { quiet: true });
  s.every('checkpoint', 5 * MIN, () => { loud++; });
  c.advance(20 * MIN);
  assert.equal(runs, 1);
  busy = 'game';
  c.advance(90 * MIN);                           // four beats missed in the game
  assert.equal(runs, 1);
  assert.equal(loud, 22);                       // a job without quiet never waits
  const info = s.list().find((j) => j.name === 'feeds')!;
  assert.equal(info.waiting, 'quiet');
  assert.equal(info.heldQuiet, 1);              // one hold, not one per recheck
  busy = '';
  s.wake();
  assert.equal(runs, 2);                        // once, not four times
  c.advance(19 * MIN);
  assert.equal(runs, 2);
  c.advance(1 * MIN);
  assert.equal(runs, 3);
  s.stop();
});

test('without a wake() a held job still looks again on its own (recheck)', () => {
  const c = new FakeClock();
  let busy = true;
  const s = new Scheduler({ clock: c, quietNow: () => busy, recheckMs: MIN });
  let runs = 0;
  s.every('notes', 60 * MIN, () => { runs++; }, { quiet: true });
  c.advance(60 * MIN);
  assert.equal(runs, 0);
  busy = false;
  c.advance(MIN);
  assert.equal(runs, 1);
  s.stop();
});

test('idleOnly waits until he has been away long enough', () => {
  const c = new FakeClock();
  let idle = 0;
  const s = new Scheduler({ clock: c, idleSeconds: () => idle });
  let runs = 0;
  s.every('swap', 10 * MIN, () => { runs++; }, { idleOnly: 1800 });
  c.advance(10 * MIN);
  assert.equal(runs, 0);
  assert.equal(s.list()[0]!.waiting, 'idle');
  idle = 1800;
  s.wake();
  assert.equal(runs, 1);
  s.stop();
});

test('catch-up: a restart neither repeats a job early nor forgets one that came due while off', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'aang-sched-'));
  const file = path.join(dir, 'scheduler.json');
  const c = new FakeClock();
  let s = new Scheduler({ clock: c, file });
  let runs = 0;
  s.every('backup', 60 * MIN, () => { runs++; }, { catchUp: true, first: 0 });
  c.advance(0);
  assert.equal(runs, 1);                         // never run before: runs at start
  s.stop();
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).backup, 1_000_000);

  // Restarted 10 minutes later: the hour is not up, so it waits the other 50 minutes.
  c.advance(10 * MIN);
  s = new Scheduler({ clock: c, file });
  s.every('backup', 60 * MIN, () => { runs++; }, { catchUp: true, first: 0 });
  c.advance(49 * MIN);
  assert.equal(runs, 1);
  c.advance(1 * MIN);
  assert.equal(runs, 2);
  s.stop();

  // Off for three hours: it runs soon after start (after `first`), once.
  c.advance(3 * 60 * MIN);
  s = new Scheduler({ clock: c, file });
  s.every('backup', 60 * MIN, () => { runs++; }, { catchUp: true, first: 30_000 });
  c.advance(29_000);
  assert.equal(runs, 2);
  c.advance(1000);
  assert.equal(runs, 3);
  s.stop();
});

test('a job never runs twice at once: a beat during a slow run is skipped and counted', async () => {
  const c = new FakeClock();
  const s = new Scheduler({ clock: c });
  let started = 0, finish: () => void = () => {};
  s.every('slow', MIN, () => { started++; return new Promise<void>((r) => { finish = r; }); });
  c.advance(MIN);
  assert.equal(started, 1);
  c.advance(3 * MIN);                            // three beats while the first is still going
  assert.equal(started, 1);
  assert.equal(s.list()[0]!.overlapped, 3);
  assert.equal(s.list()[0]!.running, true);
  finish();
  await flushMicro();
  assert.equal(s.list()[0]!.running, false);
  c.advance(MIN);
  assert.equal(started, 2);
  s.runNow('slow');                              // runNow respects it too
  assert.equal(started, 2);
  s.stop();
});

test('a failing job is logged once and keeps its beat', async () => {
  const c = new FakeClock(), lines: string[] = [];
  const s = new Scheduler({ clock: c, log: (l) => lines.push(l) });
  let runs = 0;
  s.every('flaky', MIN, () => { runs++; throw new Error('offline'); });
  s.every('flakyAsync', MIN, async () => { throw new Error('offline'); });
  c.advance(3 * MIN);
  await flushMicro();
  assert.equal(runs, 3);
  assert.equal(lines.filter((l) => l.includes('flaky failed')).length, 1);
  assert.equal(lines.filter((l) => l.includes('flakyAsync failed')).length, 1);
  assert.equal(s.list()[0]!.error, 'offline');
  s.stop();
});

test('at() fires on the dot, past moments at once, cancel works, and far moments re-arm instead of overflowing', () => {
  const c = new FakeClock(), s = new Scheduler({ clock: c });
  const got: string[] = [];
  s.at(c.now() + 90_000, () => got.push('a'));
  s.at(c.now() - 5_000, () => got.push('late'));
  const cancel = s.at(c.now() + 60_000, () => got.push('cancelled'));
  cancel();
  s.at(new Date(c.now() + 40 * 24 * 3_600_000), () => got.push('far'), { name: 'far' });
  c.advance(0);
  assert.deepEqual(got, ['late']);
  c.advance(89_999);
  assert.deepEqual(got, ['late']);
  c.advance(1);
  assert.deepEqual(got, ['late', 'a']);
  c.advance(39 * 24 * 3_600_000);
  assert.ok(s.has('far'));
  c.advance(24 * 3_600_000);
  assert.deepEqual(got, ['late', 'a', 'far']);
  assert.ok(!s.has('far'));
  assert.equal(c.pending, 0);
  s.stop();
});

test('a quiet at() waits for quiet to end; the same name replaces the old one', () => {
  const c = new FakeClock();
  let busy = 'call';
  const s = new Scheduler({ clock: c, quietNow: () => busy });
  const got: string[] = [];
  s.at(c.now() + MIN, () => got.push('one'), { name: 'x', quiet: true });
  s.at(c.now() + MIN, () => got.push('two'), { name: 'x', quiet: true });
  c.advance(5 * MIN);
  assert.deepEqual(got, []);
  busy = '';
  s.wake();
  assert.deepEqual(got, ['two']);
  s.stop();
});

test('list() and describeJobs say what runs when', () => {
  const c = new FakeClock(), s = new Scheduler({ clock: c });
  s.every('hourly', 60 * MIN, () => {}, { quiet: true, catchUp: true });
  s.every('soon', MIN, () => {});
  const l = s.list();
  assert.deepEqual(l.map((j) => j.name), ['soon', 'hourly']);
  assert.deepEqual(l[1]!.flags, ['quiet', 'catch-up']);
  const lines = describeJobs(l, c.now());
  assert.match(lines[1]!, /^hourly: every 1 h, quiet catch-up; next in 1 h; ran 0x$/);
  s.stop();
});

test('after the computer sleeps, a job due meanwhile runs within a minute of waking, not an hour late', () => {
  const c = new FakeClock(), s = new Scheduler({ clock: c });
  const got: number[] = [];
  s.at(c.now() + 2 * 60 * MIN, () => got.push(c.now()), { name: 'reminder' });
  c.advance(30 * MIN);
  c.t += 2 * 60 * MIN;                           // asleep: the wall clock moved, no timer ran
  c.advance(MIN);
  assert.equal(got.length, 1);
  s.stop();
});

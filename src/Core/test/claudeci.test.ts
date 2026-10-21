// CI as a first-class job (2026-10-21, claudeci.ts): parsing gh's own output (fixtures in its real shape), the
// step-weighted bar from history, the run-as-one fallback, queued runs, and the watcher's polling rules (only after a
// push or while a run is in flight; never without gh or a GitHub remote; one gh at a time).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CiTracker, parseJobs, parseRemote, parseRuns, runModel } from '../src/claudeci.ts';
import type { Runner } from '../src/claudeci.ts';
import { ProgressHistory } from '../src/progresshistory.ts';
import { barNow } from '../src/progressmath.ts';

const T0 = Date.parse('2026-10-21T22:23:47Z');
const iso = (ms: number) => new Date(T0 + ms).toISOString().replace('.000', '');
const run = (id: string, status: string, conclusion: string, start: number, end: number, extra: Record<string, unknown> = {}) => ({
  conclusion, createdAt: iso(start), databaseId: Number(id), displayTitle: 'iOS build', event: 'push', headBranch: 'main',
  startedAt: iso(start), status, updatedAt: iso(end), url: `https://github.com/Bowgull/Waymark/actions/runs/${id}`, workflowName: 'iOS build', ...extra,
});
const step = (name: string, status: string, start: number | null, end: number | null, conclusion = status === 'completed' ? 'success' : '') =>
  ({ completedAt: end === null ? '0001-01-01T00:00:00Z' : iso(end), conclusion, name, number: 1, startedAt: start === null ? '0001-01-01T00:00:00Z' : iso(start), status });
const jobs = (steps: unknown[], status = 'in_progress') => JSON.stringify({ jobs: [{ completedAt: '0001-01-01T00:00:00Z', conclusion: '', databaseId: 1, name: 'build', startedAt: iso(0), status, steps }] });

test('parsing: remotes, runs and jobs as gh prints them; anything odd is skipped', () => {
  assert.equal(parseRemote('https://github.com/Bowgull/AiVatar.git\n'), 'Bowgull/AiVatar');
  assert.equal(parseRemote('git@github.com:Bowgull/Waymark.git'), 'Bowgull/Waymark');
  assert.equal(parseRemote('https://gitlab.com/x/y.git'), null);
  const runs = parseRuns(JSON.stringify([run('39686176431', 'completed', 'success', 0, 206_000), { databaseId: 'nope' }]));
  assert.equal(runs.length, 1);
  assert.equal(runs[0]!.workflow, 'iOS build');
  assert.equal(runs[0]!.updatedAt! - runs[0]!.startedAt!, 206_000);
  assert.deepEqual(parseRuns('not json'), []);
  const j = parseJobs(jobs([step('Set up job', 'completed', 0, 1000), step('Build app (unsigned)', 'queued', null, null)]));
  assert.equal(j[0]!.steps[1]!.startedAt, null, "gh's year-1 dates mean not started");
});

test('the bar: step-weighted from each step\'s own history, the running step by its overrun curve', () => {
  const h = new ProgressHistory(null);
  for (let i = 0; i < 3; i++) for (const [s, ms] of [['Install', 25_000], ['Build web app', 20_000], ['Build app (unsigned)', 133_000]] as const)
    h.add({ at: 0, src: 'ci-step', p: 'Bowgull/Waymark', k: 'iOS build', key: `build|${s}`, ms, ok: true });
  const r = parseRuns(JSON.stringify([run('5', 'in_progress', '', 0, 0)]))[0]!;
  const js = parseJobs(jobs([step('Install', 'completed', 0, 25_000), step('Build web app', 'in_progress', 25_000, null), step('Build app (unsigned)', 'queued', null, null)]));
  const m = runModel(h, 'Bowgull/Waymark', r, js, T0 + 35_000);
  assert.ok(m.progress);
  assert.equal(m.step, 'Build web app'); assert.equal(m.stepNo, 2); assert.equal(m.steps, 3);
  const b = barNow(m.progress!, true, T0 + 35_000);
  assert.ok(b.p > 0.15 && b.p < 0.3, `a long build still ahead: ${b.p}`);
  assert.ok(b.left > 120_000 && b.left < 200_000, `left ${b.left}`);
  assert.equal(m.progress!.earned, true);
  // A step never seen before: the run as one item, once the workflow has 3 runs behind it; with fewer, no bar.
  const js2 = parseJobs(jobs([step('Brand new step', 'in_progress', 0, null)]));
  assert.equal(runModel(h, 'Bowgull/Waymark', r, js2, T0 + 10_000).progress, null);
  for (let i = 0; i < 3; i++) h.add({ at: 0, src: 'ci-run', p: 'Bowgull/Waymark', k: 'iOS build', key: 'push', ms: 200_000, ok: true, id: `x${i}` });
  const whole = runModel(h, 'Bowgull/Waymark', r, js2, T0 + 100_000).progress!;
  const wb = barNow(whole, true, T0 + 100_000);
  assert.ok(wb.p > 1 / 3, 'a run measured whole is not held to the first-third cap');
  // Queued: no bar at all.
  assert.equal(runModel(h, 'Bowgull/Waymark', { ...r, status: 'queued' }, [], T0).progress, null);
});

test('the watcher: backfill once, look after a push, poll only while a run is in flight, learn it when it ends', async () => {
  const calls: string[] = [];
  let now = T0 + 1_000_000;
  let phase: 'none' | 'queued' | 'running' | 'done' = 'none';
  const run: Runner = async (cmd, args) => {
    calls.push(`${cmd} ${args.slice(0, 2).join(' ')}`);
    if (cmd === 'gh' && args[0] === '--version') return 'gh version 2.101.0';
    if (cmd === 'git') return 'https://github.com/Bowgull/Waymark.git\n';
    if (args[0] === 'run' && args[1] === 'list') {
      const past = [run1('100', 0), run1('101', 300_000)];
      const cur = phase === 'none' ? [] : [{ ...run1('200', 900_000), status: phase === 'done' ? 'completed' : phase === 'queued' ? 'queued' : 'in_progress', conclusion: phase === 'done' ? 'success' : '', updatedAt: iso(phase === 'done' ? 1_100_000 : 900_000) }];
      return JSON.stringify([...cur, ...past]);
    }
    if (args[0] === 'run' && args[1] === 'view') {
      // Past runs are finished; the new one (200) is running until phase says done.
      const done = args[2] !== '200' || phase === 'done';
      return jobs([step('Install', 'completed', 900_000, 925_000), step('Build', done ? 'completed' : 'in_progress', 925_000, done ? 1_100_000 : null)], done ? 'completed' : 'in_progress');
    }
    return null;
  };
  function run1(id: string, start: number) { return { ...runShape(id, start), status: 'completed', conclusion: 'success' }; }
  function runShape(id: string, start: number) { return { databaseId: Number(id), workflowName: 'iOS build', displayTitle: 'x', event: 'push', headBranch: 'main', url: '', createdAt: iso(start), startedAt: iso(start), updatedAt: iso(start + 200_000) }; }
  const h = new ProgressHistory(null);
  let changes = 0;
  const ci = new CiTracker(h, { run, now: () => now, onChange: () => changes++ });
  try {
    ci.watch('C:\\code\\Waymark');
    for (let i = 0; i < 50 && !h.hasRun('Bowgull/Waymark', '101'); i++) await new Promise(r => setTimeout(r, 5));
    assert.equal(h.hasRun('Bowgull/Waymark', '100'), true, 'past runs learned once');
    assert.ok(h.stat('s|Bowgull/Waymark|iOS build|build|Build'), 'their steps too');
    const after = calls.length;
    // Nothing in flight, no push: no polling at all.
    await ci.tick();
    assert.equal(calls.length, after, 'idle: no gh at all');
    // A push: the next look finds the new run, queued then running.
    phase = 'queued';
    ci.pushed('C:\\code\\Waymark');
    await ci.tick();
    assert.equal(ci.rows('C:\\code\\Waymark')[0]!.status, 'queued');
    assert.equal(ci.rows('C:\\code\\Waymark')[0]!.progress, null, 'waiting for a runner: no bar');
    phase = 'running'; now += 5000;
    await ci.tick();
    const row = ci.rows('C:\\code\\Waymark')[0]!;
    assert.equal(row.status, 'in_progress');
    assert.equal(row.step, 'Build');
    assert.ok(row.progress, 'steps with history: a bar');
    phase = 'done'; now = T0 + 1_100_000;
    await ci.tick();
    assert.equal(ci.rows('C:\\code\\Waymark', now)[0]!.conclusion, 'success');
    assert.equal(h.hasRun('Bowgull/Waymark', '200'), true, 'the finished run is history now');
    assert.equal(ci.rows('C:\\code\\Waymark', now + 3 * 60_000).length, 0, 'gone from the card two minutes later');
    assert.ok(changes > 0);
  } finally { ci.close(); }
  // No gh here: nothing is ever run but the version check.
  const none: string[] = [];
  const off = new CiTracker(new ProgressHistory(null), { run: async (c, a) => { none.push(`${c} ${a[0]}`); return null; } });
  off.watch('C:\\x'); await new Promise(r => setTimeout(r, 20)); off.pushed('C:\\x'); await off.tick(); off.close();
  assert.deepEqual(none, ['gh --version']);
});

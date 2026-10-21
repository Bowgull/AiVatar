// How long things take here (2026-10-21, progresshistory.ts): the kind table, keys with nothing secret in them, the
// narrow-to-broad lookups with their fallbacks, the earned rule, only good samples teaching, the per-model multiplier,
// the file surviving a restart and staying small, and the plans store.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PlanStore, ProgressHistory, SEED, cmdKey, historyFile, kindOf, labelKey, plansFile } from '../src/progresshistory.ts';
import { stripSecrets } from '../src/claudeprogress.ts';

const MIN = 60_000;

test('kinds: a small keyword table picks the prior', () => {
  assert.equal(kindOf('Write tests for the parser'), 'test');
  assert.equal(kindOf('Commit and push'), 'commit');
  assert.equal(kindOf('Fix the login bug'), 'implement');
  assert.equal(kindOf('Type-check Core and Shell'), 'build');
  assert.equal(kindOf('Research the CI timings'), 'research');
  assert.equal(kindOf('Mockup sheet 57'), 'mockup');
  assert.equal(kindOf('Wait for the CI'), 'ci-wait');
  assert.equal(kindOf('Tea'), 'other');
});

test('keys: lower case, five words, masked, cut; a command to its first 40 masked characters', () => {
  assert.equal(labelKey('Fix the Login bug in bubble.js today please', stripSecrets), 'fix the login bug in');
  assert.ok(!labelKey('Rotate sk-ant-api03-ABCDEFGHIJKLMNOPQRST now', stripSecrets).includes('ABCDEFGH'));
  assert.ok(labelKey('x'.repeat(200), stripSecrets).length <= 60);
  assert.equal(cmdKey('npm   test -- --run   src/Core/test/claudeprogress.test.ts', stripSecrets), 'npm test -- --run src/Core/test/claudepr');
  assert.ok(!cmdKey('curl -H "Authorization: Bearer abcdefghijkl12345" x', stripSecrets).includes('abcdefghijkl12345'));
});

test('lookups: label in project, then project + kind, then kind everywhere, then the seed prior', () => {
  const h = new ProgressHistory(null);
  const seed = h.task('Waymark', 'Fix the login bug', stripSecrets);
  assert.equal(seed.n, 0); assert.equal(seed.earned, false);
  assert.ok(Math.abs(Math.exp(seed.mu) - SEED.implement!) < 1);
  // Other projects' "implement" items took about 10 min: the kind everywhere moves it.
  for (let i = 0; i < 5; i++) h.add({ at: i, src: 'task', p: 'Other', k: 'implement', key: `make thing ${i}`, ms: 10 * MIN, ok: true });
  const kindAll = h.task('Waymark', 'Fix the login bug', stripSecrets);
  assert.ok(Math.exp(kindAll.mu) > 7 * MIN, `kind everywhere ${Math.exp(kindAll.mu)}`);
  assert.equal(kindAll.earned, true, 'a key on the chain has 3+ samples');
  // This project's own implement items are quick (1 min): project + kind beats the kind everywhere.
  for (let i = 0; i < 4; i++) h.add({ at: i, src: 'task', p: 'Waymark', k: 'implement', key: `wire thing ${i}`, ms: MIN, ok: true });
  const proj = h.task('Waymark', 'Fix the login bug', stripSecrets);
  assert.ok(Math.exp(proj.mu) < Math.exp(kindAll.mu) * 0.6, 'the project leans quick');
  // The very label, seen before at 20 s: narrowest of all, leaning on the project's kind.
  for (let i = 0; i < 3; i++) h.add({ at: i, src: 'task', p: 'Waymark', k: 'implement', key: 'fix the login bug', ms: 20_000, ok: true });
  const label = h.task('Waymark', 'Fix the login bug', stripSecrets);
  assert.ok(Math.exp(label.mu) < Math.exp(proj.mu), 'its own history wins');
  assert.equal(label.n, 3);
});

test('only finished, successful samples teach; a failed CI run is kept apart', () => {
  const h = new ProgressHistory(null);
  h.add({ at: 0, src: 'cmd', p: 'P', k: 'Running the tests', key: 'npm test', ms: 3_600_000, ok: false });
  assert.equal(h.cmd('P', 'npm test', 'Running the tests', stripSecrets), null, 'no history yet: no sub-bar');
  for (const ms of [80_000, 90_000, 100_000]) h.add({ at: 0, src: 'cmd', p: 'P', k: 'Running the tests', key: 'npm test', ms, ok: true });
  const c = h.cmd('P', 'npm test', 'Running the tests', stripSecrets)!;
  assert.ok(Math.exp(c.mu) > 60_000 && Math.exp(c.mu) < 100_000, `${Math.exp(c.mu)}`);
  assert.equal(c.earned, true);
  // Another command of the same family in the same project borrows the family's numbers.
  assert.ok(h.cmd('P', 'npm test -- --run x', 'Running the tests', stripSecrets)!.n >= 3);
  h.add({ at: 0, src: 'ci-run', p: 'o/r', k: 'build', key: 'push', ms: 99 * MIN, ok: false, id: '1' });
  assert.equal(h.ciRun('o/r', 'build', 'push'), null);
  assert.equal(h.hasRun('o/r', '1'), true, 'a failed run is still known, so it is never learned twice');
});

test('agents: type + task kind, then type, then every agent, then 3 min', () => {
  const h = new ProgressHistory(null);
  assert.ok(Math.abs(Math.exp(h.agent('Explore', 'Map the code').mu) - 3 * MIN) < 1);
  for (let i = 0; i < 4; i++) h.add({ at: 0, src: 'agent', k: 'Explore', key: 'research', ms: 40_000, ok: true });
  const e = h.agent('Explore', 'Map the code');
  assert.ok(Math.exp(e.mu) < 90_000); assert.equal(e.earned, true);
  assert.ok(Math.exp(h.agent('Plan', 'x').mu) < 3 * MIN, 'every agent moves the others a little');
});

test('model multiplier: a family that runs slow nudges fresh estimates up, shrunk hard until it has data', () => {
  const h = new ProgressHistory(null);
  const base = h.task('P', 'Fix it', stripSecrets, 'opus');
  for (let i = 0; i < 10; i++) h.add({ at: 0, src: 'task', p: 'Q', k: 'review', key: `r${i}`, ms: MIN, ok: true, m: 'opus', x: Math.log(2) });
  const slow = h.task('P', 'Fix it', stripSecrets, 'opus');
  assert.ok(slow.mu > base.mu + 0.3, 'opus runs twice as long here');
  assert.equal(h.task('P', 'Fix it', stripSecrets, 'haiku').mu, base.mu, 'other families untouched');
});

test('the file: survives a restart, skips torn lines, stays small, keeps nothing but labels', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'aang-hist-'));
  try {
    const f = historyFile(dir);
    const a = new ProgressHistory(f);
    a.add({ at: 1, src: 'task', p: 'P', k: 'test', key: labelKey('Run the tests with token=abc123def456ghi789', stripSecrets), ms: 90_000, ok: true });
    a.add({ at: 2, src: 'phase', p: 'P', key: 'phase 1', ms: 3 * 3_600_000, est: 2 * 3_600_000, ok: true });
    await a.flush();
    writeFileSync(f, readFileSync(f, 'utf8') + '{"at":3,"s":"task","key":"half a li', 'utf8');
    const b = new ProgressHistory(f);
    assert.ok(b.stat('t|P|*test'), 'learned again from the file');
    assert.deepEqual(b.phaseRatios('P'), [1.5]);
    const text = readFileSync(f, 'utf8');
    assert.ok(!text.includes('abc123def456ghi789'));
    assert.ok(text.split('\n')[0]!.length < 140, 'about 100 bytes a line');
    // Bounded: past 6,000 lines it is cut back to the newest 5,000.
    const c = new ProgressHistory(f);
    for (let i = 0; i < 6100; i++) c.add({ at: i, src: 'cmd', p: 'P', k: 'Building', key: 'npm run build', ms: 1000 + i, ok: true });
    await c.flush();
    const lines = readFileSync(f, 'utf8').split('\n').filter(Boolean).length;
    assert.ok(lines <= 6000 && lines >= 5000, `${lines} lines`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('plans: kept per project on disk, at most 40', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'aang-plans-'));
  try {
    const s = new PlanStore(plansFile(dir));
    s.set('Waymark', { phases: [{ label: 'P1', hours: 3, status: 'running', workMs: 1000 }], updatedAt: 1 });
    assert.equal(new PlanStore(plansFile(dir)).get('Waymark')!.phases[0]!.workMs, 1000);
    for (let i = 0; i < 45; i++) s.set(`p${i}`, { phases: [{ label: 'x', hours: 1, status: 'todo', workMs: 0 }], updatedAt: 10 + i });
    assert.equal(s.get('Waymark'), null, 'the oldest went');
    assert.ok(s.get('p44'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

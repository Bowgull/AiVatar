// The progress engine and the live description (2026-10-21, claudeprogress.ts): only real events move a bar, never
// backwards except a rewrite (and that is flagged), the creep stays inside the task's slot, no list = no percent,
// time left only from a real pace, and the plain line with secrets masked and helper agents counted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ActivityKeeper, DEFAULT_PACE_MS, ProgressKeeper, SLOT_CAP, barAt, describeTool, etaOf, percentOf, stripSecrets } from '../src/claudeprogress.ts';
import { JobTracker } from '../src/claudelink.ts';

const list = (...s: string[]) => s.map((st, i) => ({ text: 'task ' + i, status: st }));

test('progress: no list = no percent, no time left (never a fake 0%)', () => {
  const k = new ProgressKeeper();
  assert.equal(k.snapshot(0), null);
  assert.equal(percentOf(k.snapshot(0)), null);
  assert.equal(etaOf(k.snapshot(0)), null);
  assert.equal(barAt(k.snapshot(0), true, 0), null);
});

test('progress: pace is the median time per task; time left only once there is one', () => {
  const k = new ProgressKeeper();
  k.todos(list('in_progress', 'pending', 'pending', 'pending'), 0);
  assert.equal(etaOf(k.snapshot(10_000)), null, 'no task finished yet: no time left');
  k.todos(list('completed', 'in_progress', 'pending', 'pending'), 60_000);
  k.todos(list('completed', 'completed', 'in_progress', 'pending'), 180_000);   // 120 s
  k.todos(list('completed', 'completed', 'completed', 'in_progress'), 210_000); // 30 s
  const p = k.snapshot(210_000)!;
  assert.equal(p.paceMs, 60_000, 'median of 60, 120 and 30 s');
  assert.equal(etaOf(p), 60_000);
  assert.equal(percentOf(p), 75);
  // Three ticked in one go share the time: not three ticks at "0 s".
  const b = new ProgressKeeper();
  b.todos(list('in_progress', 'pending', 'pending'), 0);
  b.todos(list('completed', 'completed', 'completed'), 90_000);
  assert.equal(b.snapshot(90_000)!.paceMs, 30_000);
  assert.equal(etaOf(b.snapshot(90_000)), 0, 'all ticked: done');
});

test('progress: the creep is monotonic and never leaves the task\'s slot', () => {
  const k = new ProgressKeeper();
  k.todos(list('completed', 'in_progress', 'pending', 'pending'), 0);
  const p = k.snapshot(0)!;
  let last = -1;
  for (let t = 0; t <= 20 * DEFAULT_PACE_MS; t += 5_000) {
    const v = barAt(p, true, t)!;
    assert.ok(v >= last, `never backwards at ${t}`);
    assert.ok(v < 0.25 + SLOT_CAP * 0.25 + 1e-9, `inside task 2's slot at ${t}: ${v}`);
    last = v;
  }
  assert.ok(last > 0.25 + 0.85 * 0.25, 'it does get close to the cap');
  assert.equal(barAt(p, false, 999_999), 0.25, 'not working: no creep');
});

test('progress: idle time between turns does not count as slow work', () => {
  const k = new ProgressKeeper();
  k.todos(list('in_progress', 'pending'), 0);
  k.stop(10_000);                 // the turn ended after 10 s of work
  k.go(3_610_000);                // an hour later he answers
  k.todos(list('completed', 'in_progress'), 3_620_000);
  assert.equal(k.snapshot(3_620_000)!.paceMs, 20_000);
});

test('progress: a rewrite may drop the bar, bumps rev and is flagged once; status ticks never drop it', () => {
  const k = new ProgressKeeper();
  k.todos(list('completed', 'completed', 'in_progress', 'pending'), 0);
  const a = k.snapshot(0)!;
  k.todos(list('completed', 'completed', 'completed', 'in_progress'), 1000);
  const b = k.snapshot(1000)!;
  assert.equal(b.rev, a.rev, 'a tick is no rewrite');
  assert.equal(b.rewroteAt, null);
  assert.ok(b.done / b.total >= a.done / a.total);
  // Claude rewrites its list: more tasks, so the bar drops.
  k.todos([...list('completed', 'completed', 'completed', 'in_progress'), { text: 'new 1', status: 'pending' }, { text: 'new 2', status: 'pending' }], 2000);
  const c = k.snapshot(2000)!;
  assert.equal(c.rev, b.rev + 1);
  assert.equal(c.rewroteAt, 2000);
  assert.ok(c.done / c.total < b.done / b.total);
  // A task un-ticked is a drop too: a rewrite, never a silent step back.
  k.todos([...list('completed', 'completed', 'in_progress', 'pending'), { text: 'new 1', status: 'pending' }, { text: 'new 2', status: 'pending' }], 3000);
  assert.equal(k.snapshot(3000)!.rev, c.rev + 1);
});

test('description: a small table of plain words, secrets masked', () => {
  assert.equal(describeTool('Bash', { cmd: 'npm test -- --run' }), 'Running the tests · npm test -- --run');
  assert.equal(describeTool('Bash', { cmd: 'git push', desc: 'Push' }), 'Pushing to GitHub · git push');
  assert.equal(describeTool('Bash', { cmd: 'frobnicate --all', desc: 'Tidy the cache.' }), 'Tidy the cache · frobnicate --all');
  assert.equal(describeTool('Edit', { file: 'C:\\x\\pages\\bubble.js' }), 'Editing bubble.js');
  assert.equal(describeTool('Grep', { pattern: 'pill(', where: 'src/Shell/pages' }), 'Searching the code for "pill(" in pages');
  assert.equal(describeTool('WebFetch', { site: 'github.com' }), 'Reading a web page · github.com');
  assert.equal(describeTool('mcp__aang-browser__browser_read', {}), 'Using Samara · browser read');
  assert.equal(describeTool('Agent', { agent: 'Review the diff' }), 'Handing work to a helper agent · Review the diff');
  const leak = describeTool('Bash', { cmd: 'API_TOKEN=abc123def456 curl https://u:pw@x.io?key=zzz' });
  for (const bad of ['abc123def456', 'pw@', 'zzz']) assert.ok(!leak.includes(bad), `${bad} masked in ${leak}`);
  assert.ok(!stripSecrets('sk-ant-api03-AAAAAAAAAAAAAAAA and ghp_BBBBBBBBBBBBBBBBBBBBBB').match(/sk-ant|ghp_/));
  assert.equal(stripSecrets('npm test -- --run src/Core'), 'npm test -- --run src/Core', 'ordinary commands untouched');
});

test('activity: the tool running now, "Thinking" between tools, helper agents start and end, waiting beats all', () => {
  const a = new ActivityKeeper();
  a.turnStart(0);
  assert.deepEqual(a.snapshot('working', null, 100), { now: 'Thinking', since: 0, agents: [] });
  a.toolStart('t1', 'Bash', { cmd: 'npm test' }, 1000);
  assert.equal(a.snapshot('working', null, 2000).now, 'Running the tests · npm test');
  assert.equal(a.snapshot('working', null, 2000).since, 1000);
  a.toolEnd('t1', 5000);
  assert.deepEqual(a.snapshot('working', null, 6000), { now: 'Thinking', since: 5000, agents: [] });
  a.agentStart('g1', 'Explore', 'Find the progress bars', 7000);
  a.agentStart('g2', 'general-purpose', 'Review the diff', 8000);
  assert.deepEqual(a.snapshot('working', null, 9000).agents.map(x => x.what), ['Find the progress bars', 'Review the diff']);
  a.agentEnd('g1');
  assert.deepEqual(a.snapshot('working', null, 9000).agents.map(x => x.kind), ['general-purpose']);
  a.toolStart('t2', 'Bash', { cmd: 'rm -rf build' }, 9500);
  assert.equal(a.snapshot('working', 'permission', 9600).now, 'Waiting for your OK');
  assert.equal(a.snapshot('paused', null, 9600).now, 'Paused');
  a.clearTools(10_000);
  assert.equal(a.snapshot('idle', null, 10_100).now, '');
});

test('tracker: a job carries the engine numbers and the live line, from the mod\'s events', () => {
  const t = new JobTracker();
  t.event({ session: 's1', type: 'turn.start', cwd: 'C:\\code\\Waymark', prompt: 'go' }, 0);
  t.event({ session: 's1', type: 'todos', todos: [{ text: 'A', status: 'in_progress' }, { text: 'B', status: 'pending' }] }, 0);
  t.event({ session: 's1', type: 'tool.start', id: 'x1', tool: 'Edit', detail: { file: 'C:\\code\\Waymark\\app.ts' } }, 1000);
  t.event({ session: 's1', type: 'agent.start', id: 'g1', kind: 'Explore', what: 'Map the code' }, 1500);
  let [j] = t.list(2000);
  assert.equal(j!.activity.now, 'Editing app.ts');
  assert.equal(j!.activity.agents.length, 1);
  assert.equal(j!.progress!.total, 2);
  assert.equal(j!.progress!.elapsedMs, 2000);
  assert.equal(j!.progress!.at, 2000);
  assert.equal(j!.percent, 0);
  t.event({ session: 's1', type: 'tool.end', id: 'x1' }, 3000);
  t.event({ session: 's1', type: 'agent.end', id: 'g1' }, 3000);
  [j] = t.list(3500);
  assert.deepEqual([j!.activity.now, j!.activity.agents.length], ['Thinking', 0]);
  // No list: no progress at all.
  t.event({ session: 's2', type: 'turn.start', cwd: 'C:\\code\\Other' }, 0);
  assert.equal(t.list(10).find(x => x.id === 's2')!.progress, null);
});

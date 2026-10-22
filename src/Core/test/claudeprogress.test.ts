// The progress engine v3 (2026-10-21, claudeprogress.ts + the tracker in claudelink.ts; the research is
// docs/PROGRESS-RESEARCH.md): time-weighted bars from his own history, the speed factor, never backwards (the squeeze
// and its "Claude added 3 steps"), the clock stopping while he is asked, stalls from silence with heartbeats waking
// them, the command and agent histories with their sub-bars and floors, event times over arrival times, numbered
// events, the plan behind OVERALL, and the plain live line with secrets masked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ActivityKeeper, ProgressKeeper, describeTool, etaOf, memoryCtx, percentOf, stripSecrets } from '../src/claudeprogress.ts';
import { JobTracker } from '../src/claudelink.ts';
import { ProgressHistory } from '../src/progresshistory.ts';
import { barNow, medianOf } from '../src/progressmath.ts';

const MIN = 60_000;
const list = (...s: string[]) => s.map((st, i) => ({ text: ['Write the parser', 'Run the tests', 'Commit', 'Update the docs', 'Review the diff', 'Ship it'][i] ?? `step ${i}`, status: st }));
const snap = (k: ProgressKeeper, now: number) => k.snapshot(now, now, 60_000)!;

test('keeper: no list = no progress at all; slices are each item\'s usual time, not equal shares', () => {
  const k = new ProgressKeeper(memoryCtx('P'));
  assert.equal(k.snapshot(0, 0, 60_000), null);
  assert.equal(percentOf(null, true, 0), null);
  k.todos(list('in_progress', 'pending', 'pending'), 0);
  const p = snap(k, 0);
  // Implement (4 min) in hand, then a test run (90 s) and a commit (30 s): the first item is most of the bar.
  assert.ok(Math.abs(medianOf(p.curEst!) - 4 * MIN) < 1);
  assert.deepEqual(p.pend.map(x => Math.round(medianOf(x))), [90_000, 30_000]);
  k.todos(list('completed', 'in_progress', 'pending'), 4 * MIN);
  const b = barNow(snap(k, 4 * MIN), true, 4 * MIN);
  assert.ok(b.p > 0.6, `the big item done is most of the bar (${b.p}), not a third`);
});

test('keeper: the speed factor learns from finished items and scales what is still to come', () => {
  const k = new ProgressKeeper(memoryCtx('P'));
  k.todos(list('in_progress', 'pending', 'pending', 'pending'), 0);
  // The 4-minute item took 12: this session runs slow today.
  k.todos(list('completed', 'in_progress', 'pending', 'pending'), 12 * MIN);
  const p = snap(k, 12 * MIN);
  assert.ok(p.r > 1.3, `r ${p.r}`);
  assert.equal(p.earned, true, 'an item of this job finished');
  assert.equal(p.doneW, 12 * MIN);
});

test('keeper: idle and waiting on him are not working time', () => {
  const k = new ProgressKeeper(memoryCtx('P'));
  k.todos(list('in_progress', 'pending'), 0);
  k.stop(10_000);                 // the turn ended after 10 s of work
  k.go(3_610_000);                // an hour later he answers
  k.block(true, 3_615_000);       // a permission is up for 20 min
  k.block(false, 4_815_000);
  k.todos(list('completed', 'in_progress'), 4_820_000);
  assert.equal(snap(k, 4_820_000).doneW, 20_000, '10 + 5 + 5 s of real work');
});

test('keeper: a rewrite never pulls the bar back; it squeezes, and the time left says why once', () => {
  const k = new ProgressKeeper(memoryCtx('P'));
  k.todos(list('completed', 'completed', 'in_progress', 'pending'), 0);
  k.todos(list('completed', 'completed', 'completed', 'in_progress'), 2 * MIN);
  const before = barNow(snap(k, 2 * MIN), true, 2 * MIN);
  // Claude adds three more steps.
  k.todos([...list('completed', 'completed', 'completed', 'in_progress'), { text: 'Write more tests', status: 'pending' }, { text: 'Build the docs site', status: 'pending' }, { text: 'Implement the import', status: 'pending' }], 2 * MIN + 1);
  const p = snap(k, 2 * MIN + 1);
  const after = barNow(p, true, 2 * MIN + 1);
  assert.ok(p.sq, 'a squeeze is set');
  assert.ok(after.p >= before.p - 1e-9, `no drop: ${before.p} -> ${after.p}`);
  assert.ok(after.left > before.left * 1.25, 'the time left went up instead');
  assert.equal(p.note?.text, 'Claude added 3 steps');
  assert.equal(p.rev, 1);
  // It fills the rest as the work goes, reaching 1 only at the end.
  let last = after.p;
  for (let t = 3 * MIN; t < 30 * MIN; t += MIN) { const v = barNow({ ...snap(k, t), aliveAt: t }, true, t).p; assert.ok(v >= last - 1e-9); last = v; }
  k.todos([...list('completed', 'completed', 'completed', 'completed'), { text: 'Write more tests', status: 'completed' }, { text: 'Build the docs site', status: 'completed' }, { text: 'Implement the import', status: 'completed' }], 31 * MIN);
  assert.equal(barNow(snap(k, 31 * MIN), true, 31 * MIN).p, 1);
  // A tick is not a rewrite; an un-tick is (and still never drops the bar).
  const k2 = new ProgressKeeper(memoryCtx('P'));
  k2.todos(list('completed', 'in_progress'), 0);
  k2.todos(list('completed', 'completed'), 1000);
  assert.equal(snap(k2, 1000).rev, 0);
  k2.todos(list('in_progress', 'pending'), 2000);
  assert.equal(snap(k2, 2000).rev, 1);
});

test('keeper: a lone tick teaches the history; several ticked at once do not', () => {
  const hist = new ProgressHistory(null);
  const k = new ProgressKeeper({ hist, project: () => 'P', model: () => 'claude-opus-5-5' });
  k.todos(list('in_progress', 'pending', 'pending', 'pending'), 0);
  k.todos(list('completed', 'in_progress', 'pending', 'pending'), 7 * MIN);
  assert.equal(hist.stat('t|P|write the parser')!.n, 1);
  k.todos(list('completed', 'completed', 'completed', 'in_progress'), 9 * MIN);
  assert.equal(hist.stat('t|P|run the tests'), null);
  // The next job here sizes "Write the parser" from what it took.
  const k2 = new ProgressKeeper({ hist, project: () => 'P', model: () => '' });
  k2.todos(list('in_progress', 'pending'), 0);
  assert.ok(medianOf(snap(k2, 0).curEst!) > 4 * MIN, 'leaning towards the 7 minutes it took');
});

test('earned time left: real data, 20 s in, not stalled; 0 when all done', () => {
  const t = new JobTracker();
  t.event({ session: 's', type: 'turn.start', cwd: 'C:\\code\\P' }, 0);
  t.event({ session: 's', type: 'todos', todos: list('in_progress', 'pending') }, 0);
  assert.equal(t.list(10_000)[0]!.etaMs, null, 'seed priors only: no time left');
  t.event({ session: 's', type: 'todos', todos: list('completed', 'in_progress') }, 15_000);
  t.event({ session: 's', type: 'tool.start', id: 'x', tool: 'Read', detail: {} }, 15_000);
  assert.equal(t.list(15_000)[0]!.etaMs, null, 'under 20 s in');
  t.event({ session: 's', type: 'tool.end', id: 'x' }, 25_000);
  assert.ok(t.list(25_000)[0]!.etaMs! > 0);
  t.event({ session: 's', type: 'todos', todos: list('completed', 'completed') }, 40_000);
  assert.equal(t.list(40_000)[0]!.etaMs, 0);
  assert.equal(etaOf(null, true, 0), null);
});

test('stalls: silence past the limit freezes the bar; a heartbeat wakes it; waiting on him is no stall', () => {
  const t = new JobTracker();
  t.event({ session: 's', type: 'turn.start', cwd: 'C:\\code\\P' }, 0);
  t.event({ session: 's', type: 'todos', todos: list('in_progress', 'pending') }, 0);
  const j0 = t.list(0)[0]!;
  assert.equal(j0.progress!.stallMs, 60_000, 'between steps: a minute');
  const at = (now: number) => { const j = t.list(now)[0]!; return barNow(j.progress!, j.phase === 'working', now); };
  assert.equal(at(30_000).stalled, false);
  const st = at(5 * MIN);
  assert.equal(st.stalled, true);
  assert.equal(at(9 * MIN).p, st.p, 'frozen');
  // The model streams again: alive.
  t.event({ session: 's', type: 'alive', outTok: 100 }, 9 * MIN);
  assert.equal(at(9 * MIN + 1000).stalled, false);
  assert.equal(t.list(9 * MIN)[0]!.progress!.stallMs, 90_000, 'streaming: 90 s');
  // A helper agent's tool calls are heartbeats too.
  t.event({ session: 's', type: 'agent.start', id: 'g', kind: 'Explore', what: 'Map the code' }, 10 * MIN);
  t.event({ session: 's', type: 'agent.tool', id: 'g' }, 12 * MIN);
  assert.equal(at(12 * MIN + 30_000).stalled, false);
  assert.equal(t.list(12 * MIN)[0]!.activity.agents[0]!.calls, 1);
  // 2026-10-21 (sheet 58 C): its own to-do list, as counts, for its own bar; nonsense is ignored.
  t.event({ session: 's', type: 'agent.todos', id: 'g', done: 2, total: 5 }, 12 * MIN);
  assert.deepEqual([t.list(12 * MIN)[0]!.activity.agents[0]!.done, t.list(12 * MIN)[0]!.activity.agents[0]!.total], [2, 5]);
  t.event({ session: 's', type: 'agent.todos', id: 'g', done: 'x', total: -1 }, 12 * MIN);
  assert.equal(t.list(12 * MIN)[0]!.activity.agents[0]!.total, 5);
  // An ask: the clock stops, and silence while he decides is not a stall.
  t.event({ session: 's', type: 'ask', id: 'q1', kind: 'permission', tool: 'Bash', summary: 'rm', input: '{}' }, 13 * MIN);
  const j = t.list(30 * MIN)[0]!;
  assert.equal(j.progress!.running, false);
  assert.equal(barNow(j.progress!, true, 30 * MIN).stalled, false);
  assert.equal(j.activity.now, 'Waiting for your OK');
});

test('commands: history gives a sub-bar ("usually"), a running tool\'s stall limit, and only clean runs teach', () => {
  const t = new JobTracker();
  t.event({ session: 's', type: 'turn.start', cwd: 'C:\\code\\P' }, 0);
  for (let i = 0; i < 3; i++) {
    t.event({ session: 's', type: 'tool.start', id: `n${i}`, tool: 'Bash', detail: { cmd: 'npm test' } }, i * 10 * MIN);
    t.event({ session: 's', type: 'tool.end', id: `n${i}`, ok: true }, i * 10 * MIN + 5 * MIN);
  }
  t.event({ session: 's', type: 'tool.start', id: 'n9', tool: 'Bash', detail: { cmd: 'npm test' } }, 40 * MIN);
  const j = t.list(40 * MIN + 1000)[0]!;
  assert.ok(j.activity.tool, 'a sub-bar');
  assert.ok(Math.abs(j.activity.tool!.usual - 5 * MIN) < 30_000, `usually ${j.activity.tool!.usual}`);
  assert.ok(j.activity.stallMs! >= 10 * MIN, 'twice its p90 before it counts as stalled');
  // A failed run and a run he was asked about in the middle teach nothing.
  t.event({ session: 's', type: 'tool.end', id: 'n9', ok: false }, 41 * MIN);
  t.event({ session: 's', type: 'tool.start', id: 'n10', tool: 'Bash', detail: { cmd: 'npm test' } }, 42 * MIN);
  t.event({ session: 's', type: 'ask', id: 'q', kind: 'permission', tool: 'Bash', summary: '', input: '{}' }, 42 * MIN);
  t.event({ session: 's', type: 'resolved', id: 'q' }, 60 * MIN);
  t.event({ session: 's', type: 'tool.end', id: 'n10', ok: true }, 61 * MIN);
  assert.equal(t.hist.stat('c|P|npm test')!.n, 3);
});

test('agents: a row with its type\'s history, tool calls counted; a foreground one floors the item; a failed one shows red', () => {
  const t = new JobTracker();
  t.event({ session: 's', type: 'turn.start', cwd: 'C:\\code\\P' }, 0);
  t.event({ session: 's', type: 'todos', todos: [{ text: 'Commit', status: 'in_progress' }, { text: 'Ship it', status: 'pending' }] }, 0);
  t.event({ session: 's', type: 'agent.start', id: 'g1', kind: 'Explore', what: 'Map the code' }, 0);
  t.event({ session: 's', type: 'agent.start', id: 'g2', kind: 'general-purpose', what: 'Background sweep', bg: true }, 0);
  const j = t.list(1000)[0]!;
  const [g1, g2] = j.activity.agents;
  assert.equal(g1!.fg, true); assert.equal(g2!.fg, false);
  assert.ok(g1!.est && Math.abs(medianOf(g1!.est) - 3 * MIN) < 1, 'the 3 min seed');
  t.event({ session: 's', type: 'agent.end', id: 'g2', ok: false }, 2000);
  const f = t.list(3000)[0]!.activity.agents.find(a => a.id === 'g2')!;
  assert.equal(f.failed, true);
  assert.equal(t.list(40_000)[0]!.activity.agents.some(a => a.id === 'g2'), false, 'gone after half a minute');
  t.event({ session: 's', type: 'agent.end', id: 'g1', ok: true }, 50_000);
  assert.equal(t.hist.stat('a|Explore')!.n, 1, 'a good run teaches its type');
});

test('event times, not arrival times; numbered events: a double is dropped, a gap asks for a snapshot', async () => {
  const t = new JobTracker();
  t.event({ session: 's', type: 'turn.start', cwd: 'C:\\code\\P', gen: 'g1', sq: 1, t: 1000 }, 1000);
  t.event({ session: 's', type: 'todos', todos: list('in_progress', 'pending'), gen: 'g1', sq: 2, t: 1000 }, 1000);
  // A batch replayed late: both events happened 10 s apart, both arrive at 60 s.
  t.event({ session: 's', type: 'todos', todos: list('completed', 'in_progress'), gen: 'g1', sq: 3, t: 11_000 }, 60_000);
  assert.equal(t.list(60_000)[0]!.progress!.doneW, 10_000, 'timed when it happened');
  // The same event twice (a retry that got through): applied once.
  t.event({ session: 's', type: 'todos', todos: list('in_progress', 'pending'), gen: 'g1', sq: 3, t: 11_000 }, 60_100);
  assert.equal(t.list(60_100)[0]!.progress!.done, 1);
  // A gap: the brain asks the mod for everything again.
  t.event({ session: 's', type: 'tool.start', id: 'x', tool: 'Read', detail: {}, gen: 'g1', sq: 7, t: 61_000 }, 61_000);
  const items = await t.waitOutbox('s', 10);
  assert.deepEqual(items.map(i => i.kind), ['resync']);
  // A new load of the mod starts its own count.
  t.event({ session: 's', type: 'tool.end', id: 'x', gen: 'g2', sq: 1, t: 62_000 }, 62_000);
  assert.deepEqual((await t.waitOutbox('s', 10)).map(i => i.kind), []);
});

test('plan: Claude\'s phases become OVERALL; working time builds up on the running phase; a done phase teaches R', () => {
  const t = new JobTracker();
  t.event({ session: 's', type: 'turn.start', cwd: 'C:\\code\\Waymark' }, 0);
  t.event({ session: 's', type: 'plan', phases: [{ label: 'P1 engine', hours: 1, status: 'running' }, { label: 'P2 sync', hours: 2, status: 'todo' }] }, 0);
  let j = t.list(30 * MIN)[0]!;
  assert.equal(j.plan!.phases.length, 2);
  assert.equal(j.plan!.runE, 30 * MIN, 'live working time on the running phase');
  assert.equal(j.plan!.running, true);
  t.event({ session: 's', type: 'turn.end' }, 90 * MIN);
  t.event({ session: 's', type: 'turn.start' }, 200 * MIN);       // idle time between turns does not count
  t.event({ session: 's', type: 'plan', phases: [{ label: 'P1 engine', hours: 1, status: 'done' }, { label: 'P2 sync', hours: 2, status: 'running' }] }, 200 * MIN);
  j = t.list(200 * MIN)[0]!;
  assert.deepEqual(t.hist.phaseRatios('Waymark'), [1.5], 'an hour planned, an hour and a half worked');
  assert.ok(j.plan!.R > 1 && j.plan!.R < 1.5, `R shrunk towards 1: ${j.plan!.R}`);
  // A different session in the same project shares the plan.
  t.event({ session: 's2', type: 'turn.start', cwd: 'C:\\code\\Waymark' }, 201 * MIN);
  assert.ok(t.list(202 * MIN).find(x => x.id === 's2')!.plan);
  // Secrets in a label are masked.
  t.event({ session: 's', type: 'plan', phases: [{ label: 'Rotate ghp_abcdefghijklmnopqrstuv', hours: 1, status: 'todo' }] }, 203 * MIN);
  assert.ok(!t.list(203 * MIN)[0]!.plan!.phases[0]!.label.includes('ghp_'));
});

test('compaction: a known pause, "Tidying its memory", not working time', () => {
  const t = new JobTracker();
  t.event({ session: 's', type: 'turn.start', cwd: 'C:\\code\\P' }, 0);
  t.event({ session: 's', type: 'todos', todos: list('in_progress', 'pending') }, 0);
  t.event({ session: 's', type: 'compact', on: true }, 10_000);
  t.event({ session: 's', type: 'compact', on: false }, 70_000);
  const p = t.list(80_000)[0]!.progress!;
  assert.equal(p.e, 20_000);
  assert.equal(p.note?.text, 'Tidying its memory');
});

test('a turn that ends in an error is failed (red) until the next turn', () => {
  const t = new JobTracker();
  t.event({ session: 's', type: 'turn.start', cwd: 'C:\\code\\P' }, 0);
  t.event({ session: 's', type: 'turn.end', reason: 'error' }, 1000);
  assert.equal(t.list(1000)[0]!.failed, true);
  assert.equal(t.list(1000)[0]!.finished, false);
  t.event({ session: 's', type: 'turn.start' }, 2000);
  assert.equal(t.list(2000)[0]!.failed, false);
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

test('activity: the tool running now, "Thinking" between tools, helper agents start and end, waiting beats all, pips count', () => {
  const a = new ActivityKeeper();
  a.turnStart(0);
  assert.equal(a.snapshot('working', null, 100).now, 'Thinking');
  a.toolStart('t1', 'Bash', { cmd: 'npm test' }, 1000);
  assert.equal(a.snapshot('working', null, 2000).now, 'Running the tests · npm test');
  assert.equal(a.snapshot('working', null, 2000).since, 1000);
  a.toolEnd('t1', 5000);
  assert.deepEqual([a.snapshot('working', null, 6000).now, a.snapshot('working', null, 6000).since, a.snapshot('working', null, 6000).pips], ['Thinking', 5000, 1]);
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

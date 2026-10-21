// The supercharged progress engine (2026-10-21, his "as fast as when Claude gets a reply"): the engine's numbers over
// real event orders, the live line while Claude streams, the push that no longer waits 80 ms, and one end-to-end timing:
// a signed event from a pretend mod -> the real HookServer door -> the tracker -> the pusher -> a real WebSocket, as
// the Shell would hear it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { HookServer } from '../src/hooks.ts';
import { JobTracker, LinkDoor, LinkPusher, linkMac } from '../src/claudelink.ts';
import { ActivityKeeper } from '../src/claudeprogress.ts';
import { barNow } from '../src/progressmath.ts';

type T = { text: string; status: 'pending' | 'in_progress' | 'completed' };
const list = (...s: string[]): T[] => s.map((x, i) => ({ text: `Task ${i + 1}`, status: x === 'd' ? 'completed' : x === 'n' ? 'in_progress' : 'pending' }));
const job = (t: JobTracker, now: number, id = 's1') => t.list(now).find(j => j.id === id)!;
const bar = (t: JobTracker, now: number, id = 's1') => { const j = job(t, now, id); return j.progress ? barNow(j.progress, j.phase === 'working', now).p : null; };

test('engine: a real session order - list written, quick flips, several at once, the last tick is 100% at once', () => {
  const t = new JobTracker();
  t.event({ session: 's1', type: 'turn.start', cwd: 'C:\\code\\Waymark', prompt: 'build it' }, 0);
  // Before any list: no percent at all (the still, empty bar and "Working").
  assert.equal(job(t, 10).progress, null);
  assert.equal(job(t, 10).percent, null);
  t.event({ session: 's1', type: 'todos', todos: list('n', 'p', 'p', 'p') }, 1000);
  assert.equal(job(t, 1000).percent, 0);
  // v3: the creep inside task 1 is time-based, and before the first tick it cannot pass a third.
  const mid = bar(t, 30_000)!;
  assert.ok(mid > 0 && mid <= 1 / 3 + 1e-9, `creep ${mid}`);
  // Task 1 done and task 2 started within milliseconds of each other (two TodoWrites back to back).
  t.event({ session: 's1', type: 'todos', todos: list('d', 'p', 'p', 'p') }, 40_000);
  t.event({ session: 's1', type: 'todos', todos: list('d', 'n', 'p', 'p') }, 40_005);
  assert.equal(job(t, 40_005).progress!.done, 1);
  assert.equal(job(t, 40_005).progress!.cur, 1);
  assert.ok(bar(t, 40_005)! >= mid, 'never below where it was');
  // Two ticked in one go.
  t.event({ session: 's1', type: 'todos', todos: list('d', 'd', 'd', 'n') }, 60_000);
  assert.equal(job(t, 60_000).progress!.done, 3);
  // The last tick: exactly 100% on that very event, no creep left to wait for.
  t.event({ session: 's1', type: 'todos', todos: list('d', 'd', 'd', 'd') }, 70_000);
  assert.equal(job(t, 70_000).percent, 100);
  assert.equal(bar(t, 70_000), 1);
  assert.equal(job(t, 70_000).etaMs, 0);
});

test('engine: a rewritten list never drops the bar (v3 squeeze); a status tick is no rewrite', () => {
  const t = new JobTracker();
  t.event({ session: 's1', type: 'turn.start', cwd: 'C:\\x' }, 0);
  t.event({ session: 's1', type: 'todos', todos: list('d', 'n') }, 1000);
  const rev0 = job(t, 1000).progress!.rev;
  t.event({ session: 's1', type: 'todos', todos: list('d', 'n') }, 2000);
  assert.equal(job(t, 2000).progress!.rev, rev0, 'the same list is not a rewrite');
  const was = bar(t, 3000)!;
  t.event({ session: 's1', type: 'todos', todos: [...list('d', 'n'), { text: 'Task 3', status: 'pending' as const }, { text: 'Task 4', status: 'pending' as const }] }, 3000);
  const p = job(t, 3000).progress!;
  assert.equal(p.rev, rev0 + 1);
  assert.ok(bar(t, 3000)! >= was - 1e-9, 'squeezed, not dropped');
});

test('engine: the Task tools build the list one task at a time without a false "rewrote its list"', () => {
  const t = new JobTracker();
  t.event({ session: 's1', type: 'turn.start', cwd: 'C:\\x' }, 0);
  t.event({ session: 's1', type: 'todos', todos: [{ text: 'A', status: 'pending' }] }, 100);
  t.event({ session: 's1', type: 'todos', todos: [{ text: 'A', status: 'pending' }, { text: 'B', status: 'pending' }] }, 200);
  t.event({ session: 's1', type: 'todos', todos: [{ text: 'A', status: 'in_progress' }, { text: 'B', status: 'pending' }] }, 300);
  assert.equal(job(t, 300).progress!.rewroteAt, null);
  t.event({ session: 's1', type: 'todos', todos: [{ text: 'A', status: 'completed' }, { text: 'B', status: 'in_progress' }] }, 5000);
  assert.equal(job(t, 5000).progress!.done, 1);
});

test('engine: a one-step turn with no list is complete when it ends; a stopped one is not; the next turn starts empty', () => {
  const t = new JobTracker();
  t.event({ session: 's1', type: 'turn.start', cwd: 'C:\\x' }, 0);
  assert.equal(job(t, 1).finished, false);
  t.event({ session: 's1', type: 'turn.end', aborted: false }, 5000);
  assert.equal(job(t, 5000).finished, true);
  assert.equal(job(t, 5000).progress, null);
  t.event({ session: 's1', type: 'turn.start' }, 6000);
  assert.equal(job(t, 6000).finished, false);
  t.event({ session: 's1', type: 'turn.end', aborted: true }, 7000);
  assert.equal(job(t, 7000).finished, false, 'stopped is not done');
  // A list that was all ticked last turn does not sit at 100% through the next one.
  t.event({ session: 's1', type: 'turn.start' }, 8000);
  t.event({ session: 's1', type: 'todos', todos: list('d', 'd') }, 9000);
  t.event({ session: 's1', type: 'turn.end', aborted: false }, 9500);
  assert.equal(job(t, 9500).finished, false, 'it had a list: the list says it is done');
  assert.equal(job(t, 9500).percent, 100);
  t.event({ session: 's1', type: 'turn.start' }, 20_000);
  assert.equal(job(t, 20_000).progress, null);
  assert.deepEqual(job(t, 20_000).tasks, []);
});

test('live line: Claude writing, thinking, or streaming a tool call counts as something happening', () => {
  const a = new ActivityKeeper();
  a.turnStart(0);
  a.step('thinking', '', 100);
  assert.equal(a.snapshot('working', null, 200).now, 'Thinking');
  a.step('tool', 'Write', 300);
  assert.equal(a.snapshot('working', null, 400).now, 'Writing a file');
  a.toolStart('w1', 'Write', { file: 'C:\\x\\notes.md' }, 2000);
  assert.equal(a.snapshot('working', null, 2100).now, 'Writing notes.md');
  a.toolEnd('w1', 2500);
  a.step('text', '', 2600);
  assert.deepEqual([a.snapshot('working', null, 2700).now, a.snapshot('working', null, 2700).since], ['Writing the reply', 2600]);
  // Through the tracker, from the mod's `step` events.
  const t = new JobTracker();
  t.event({ session: 's1', type: 'turn.start', cwd: 'C:\\x' }, 0);
  t.event({ session: 's1', type: 'step', what: 'text' }, 50);
  assert.equal(job(t, 60).activity.now, 'Writing the reply');
  t.event({ session: 's1', type: 'turn.end' }, 900);
  assert.equal(job(t, 950).activity.now, '');
});

test('push: a to-do tick or a turn never waits; tool chatter is spaced one frame apart, never more', async () => {
  const sent: number[] = [];
  const p = new LinkPusher(() => sent.push(performance.now()), 16);
  // Counted in turns of the event loop, not wall time (a busy test machine stretches wall time, not the order):
  // one setImmediate later the push has gone, so no timer was waited on.
  p.ask(false);
  await new Promise(r => setImmediate(r));
  assert.equal(sent.length, 1, 'the first change goes on the next turn of the event loop');
  // A burst of tool starts and ends right after: held for the rest of the 16 ms gap...
  for (let i = 0; i < 20; i++) p.ask(false);
  await new Promise(r => setImmediate(r));
  assert.equal(sent.length, 1, 'chatter inside the gap waits');
  // ...but a tick in the middle of it does not wait for the gap.
  p.ask(true);
  await new Promise(r => setImmediate(r));
  assert.equal(sent.length, 2, 'the urgent one went at once');
  p.ask(false);
  await new Promise(r => setTimeout(r, 60));
  assert.equal(sent.length, 3, 'twenty asks in the gap were one push');
  assert.ok(sent[2]! - sent[1]! >= 14, `chatter spaced ${sent[2]! - sent[1]!} ms`);
  p.close();
});

// ---------------------------------------------- end to end: mod event -> door -> tracker -> push -> Shell socket

const PORT = 48421, WS_PORT = 48422;
const KEY = 'e'.repeat(43);
function post(body: string) {
  const ts = String(Date.now());
  const headers = { host: `127.0.0.1:${PORT}`, 'content-type': 'application/json', 'x-aang-link-ts': ts, 'x-aang-link-sig': linkMac(KEY, 'req', ts, 'POST', '/link/event', body) };
  return new Promise<number>((done, fail) => {
    const r = http.request({ host: '127.0.0.1', port: PORT, path: '/link/event', method: 'POST', headers, agent: false }, res => { res.resume(); done(res.statusCode ?? 0); });
    r.on('error', fail); r.end(body);
  });
}

test('end to end: an event leaves the brain for the Shell within 30 ms, a batch is one push, the trace rides along', async () => {
  const tracker = new JobTracker();
  const server = new HookServer(PORT, () => {}, null);
  server.link = new LinkDoor(KEY, tracker);
  const wss = new WebSocketServer({ port: WS_PORT, host: '127.0.0.1' });
  const shell = new WebSocket(`ws://127.0.0.1:${WS_PORT}`);
  const got: { at: number; m: any }[] = [];
  shell.on('message', d => got.push({ at: Date.now(), m: JSON.parse(String(d)) }));
  await server.start();
  await new Promise<void>(r => wss.once('connection', s => { (wss as any).peer = s; r(); }));
  const peer = (wss as any).peer as WebSocket;
  // The Core's own wiring, in miniature: a change asks the pusher; the push is the jobs list with the trace.
  const pusher = new LinkPusher(() => {
    const tr = tracker.trace, tx = Date.now();
    peer.send(JSON.stringify({ t: 'claude.jobs', jobs: tracker.list(tx), lat: tr ? { ev: tr.ev, rx: tr.rx, tx, type: tr.type } : null }));
  });
  tracker.onChange = (_w, urgent) => pusher.ask(urgent);
  const until = async (n: number) => { for (let i = 0; i < 200 && got.length < n; i++) await new Promise(r => setTimeout(r, 5)); };
  try {
    const hops: number[] = [];
    // Warm the sockets once, as a session's first event does.
    assert.equal(await post(JSON.stringify({ session: 's1', cwd: 'C:\\code\\Waymark', type: 'turn.start', t: Date.now() })), 204);
    await until(1);
    for (const [i, type] of (['todos', 'tool.start', 'tool.end', 'todos'] as const).entries()) {
      const ev = type === 'todos'
        ? { session: 's1', cwd: 'C:\\code\\Waymark', type, t: Date.now(), todos: [{ text: 'A', status: i === 0 ? 'in_progress' : 'completed' }, { text: 'B', status: 'pending' }] }
        : { session: 's1', cwd: 'C:\\code\\Waymark', type, t: Date.now(), id: 'x1', tool: 'Bash', detail: { cmd: 'npm test' } };
      const before = got.length;
      assert.equal(await post(JSON.stringify(ev)), 204);
      await until(before + 1);
      const last = got[got.length - 1]!;
      assert.equal(last.m.lat.type, type);
      assert.ok(last.m.lat.tx - last.m.lat.rx < 30, `${type}: brain held it ${last.m.lat.tx - last.m.lat.rx} ms`);
      hops.push(last.at - ev.t);
      // Spaced like real tool chatter, so each push is its own.
      await new Promise(r => setTimeout(r, 20));
    }
    const lastJob = got[got.length - 1]!.m.jobs[0];
    assert.equal(lastJob.progress.done, 1);
    for (const h of hops) assert.ok(h < 150, `event -> Shell socket took ${h} ms`);
    console.log(`  end to end (event -> Shell socket): ${hops.map(h => h + ' ms').join(', ')}`);

    // A batch from a mod whose last post was still out: one post, every event applied in order, one push.
    const before = got.length;
    const t = Date.now();
    assert.equal(await post(JSON.stringify({ session: 's1', cwd: 'C:\\code\\Waymark', events: [
      { type: 'tool.start', t, id: 'r1', tool: 'Read', detail: { file: 'a.ts' } },
      { type: 'tool.end', t, id: 'r1' },
      { type: 'todos', t, todos: [{ text: 'A', status: 'completed' }, { text: 'B', status: 'completed' }] },
    ] })), 204);
    await until(before + 1);
    await new Promise(r => setTimeout(r, 30));
    assert.equal(got.length, before + 1, 'one push for the batch');
    assert.equal(got[got.length - 1]!.m.jobs[0].percent, 100);
  } finally {
    pusher.close(); tracker.close(); shell.close(); wss.close(); await server.stop();
  }
});

// C1/C2 (2026-10-21): the brain's half of the aang-link mod. The job tracker (progress, the waiting queue, "after
// this task"), the lock (signed requests, MACs on everything handed back), and the long polls.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { HookServer } from '../src/hooks.ts';
import { JobTracker, LinkDoor, linkMac } from '../src/claudelink.ts';

test('tracker: to-do progress, the task in hand, and a time left from the pace', () => {
  const t = new JobTracker();
  t.event({ session: 's1', type: 'start', cwd: 'C:\\code\\Waymark', model: 'sonnet' }, 0);
  t.event({ session: 's1', type: 'todos', todos: [
    { text: 'Read', status: 'in_progress', active: 'Reading' }, { text: 'Fix', status: 'pending' }, { text: 'Test', status: 'pending' }, { text: 'Ship', status: 'pending' },
  ] }, 1000);
  t.event({ session: 's1', type: 'todos', todos: [
    { text: 'Read', status: 'completed' }, { text: 'Fix', status: 'in_progress', active: 'Fixing' }, { text: 'Test', status: 'pending' }, { text: 'Ship', status: 'pending' },
  ] }, 61_000);
  const [j] = t.list(61_000);   // the time left is as of the moment it is sent (claudeprogress.ts)
  assert.equal(j!.project, 'Waymark');
  assert.equal(j!.model, 'sonnet');
  // v3 (2026-10-21): the bar is time-weighted, so one quick item ticked of four is well under a quarter; the time left
  // is earned (an item finished, a minute in) and covers the three left at their kinds' usual times, sped up by r.
  assert.equal(j!.progress!.done, 1);
  assert.ok(j!.percent! > 3 && j!.percent! < 25, `time-weighted percent ${j!.percent}`);
  assert.equal(j!.current, 'Fixing');
  assert.ok(j!.etaMs! > 4 * 60_000 && j!.etaMs! < 12 * 60_000, `time left ${j!.etaMs}`);
  assert.equal(j!.open, null);   // no Claude app record for a made-up session: no link (claudenames.ts)
});

test('tracker: the waiting queue is permissions, then questions, then plans; answers are checked', () => {
  const t = new JobTracker();
  t.event({ session: 's1', type: 'ask', id: 'p1', kind: 'plan', tool: 'ExitPlanMode', plan: 'do it' }, 1);
  t.event({ session: 's1', type: 'ask', id: 'q1', kind: 'question', tool: 'AskUserQuestion', questions: [{ question: 'Which?', options: [{ label: 'A' }, { label: 'B' }] }] }, 2);
  t.event({ session: 's1', type: 'ask', id: 'b1', kind: 'permission', tool: 'Bash', summary: 'run npm test', canAlways: false }, 3);
  assert.deepEqual(t.waiting().map(w => w.id), ['b1', 'q1', 'p1']);
  assert.equal(t.answer('b1', { decision: 'always' }), 'Claude did not offer "always" for this one.');
  assert.equal(t.answer('q1', { decision: 'allow' }), 'A question needs an answer, not a yes.');
  assert.equal(t.answer('q1', { answers: { 'Not asked?': 'A' } }), 'No answer was given.');
  assert.equal(t.answer('b1', { decision: 'deny-message' }), 'Say what Claude should do instead.');
  assert.equal(t.answer('q1', { answers: { 'Which?': 'B' } }), null);
  assert.equal(t.answer('q1', { answers: { 'Which?': 'B' } }), 'That is no longer waiting.', 'answered once only');
  // The turn ending clears whatever of it was still waiting.
  t.event({ session: 's1', type: 'turn.end' }, 4);
  assert.deepEqual(t.waiting(), []);
});

test('tracker: "after this task" is held until that task is ticked, "now" goes at once', async () => {
  const t = new JobTracker();
  t.event({ session: 's1', type: 'turn.start', prompt: 'go' }, 0);
  t.event({ session: 's1', type: 'todos', todos: [{ text: 'A', status: 'in_progress' }, { text: 'B', status: 'pending' }] }, 0);
  assert.equal(t.send('s1', 'then do C', 'after'), null);
  assert.equal(t.list()[0]!.held, 1);
  assert.deepEqual(await t.waitOutbox('s1', 1), [], 'nothing yet');
  t.event({ session: 's1', type: 'todos', todos: [{ text: 'A', status: 'completed' }, { text: 'B', status: 'in_progress' }] }, 1);
  const got = await t.waitOutbox('s1', 1);
  assert.deepEqual(got.map(o => [o.kind, JSON.parse(o.body).text]), [['inbox', 'then do C']]);
  assert.equal(t.send('s1', 'stop that', 'now'), null);
  assert.equal((await t.waitOutbox('s1', 1))[0]!.kind, 'inbox');
  assert.equal(t.send('nope', 'x', 'now'), 'That session is not running.');
  assert.equal(t.setModel('s1', 'sonnet; rm -rf'), 'That is not a model name.');
});

test('long poll: a waiting poll is handed the item the moment it exists', async () => {
  const t = new JobTracker();
  t.event({ session: 's1', type: 'start' }, 0);
  const pending = t.waitOutbox('s1', 5000);
  t.pause('s1');
  const got = await pending;
  assert.equal(got[0]!.kind, 'pause');
  t.event({ session: 's1', type: 'ask', id: 'b1', kind: 'permission', tool: 'Bash' }, 1);
  const answer = t.waitAnswer('s1', 'b1', 5000);
  t.answer('b1', { decision: 'allow' });
  assert.deepEqual(JSON.parse((await answer)!.body), { decision: 'allow' });
  // Answered in Claude itself first: the poll is told it is gone, so the mod stops waiting.
  t.event({ session: 's1', type: 'ask', id: 'b2', kind: 'permission', tool: 'Bash' }, 2);
  const gone = t.waitAnswer('s1', 'b2', 5000);
  t.event({ session: 's1', type: 'resolved', id: 'b2' }, 3);
  assert.equal((await gone)!.kind, 'gone');
  assert.equal(await t.waitAnswer('s1', 'b3', 10).then(o => o?.kind), 'gone', 'an id it never had');
});

// ---------------------------------------------- the door, over a real socket

const PORT = 48419;
const KEY = 'k'.repeat(43);
const NONCE = 'ab'.repeat(16);
function call(method: string, path: string, body = '', opts: { key?: string; origin?: string; ts?: number } = {}) {
  const ts = String(opts.ts ?? Date.now());
  const headers: Record<string, string> = { host: `127.0.0.1:${PORT}`, 'x-aang-link-ts': ts, 'x-aang-link-sig': linkMac(opts.key ?? KEY, 'req', ts, method, path, body) };
  if (opts.origin) headers.origin = opts.origin;
  return new Promise<{ code: number; text: string }>((done, fail) => {
    const r = http.request({ host: '127.0.0.1', port: PORT, path, method, headers, agent: false }, res => {
      let text = ''; res.on('data', d => { text += d; }); res.on('end', () => done({ code: res.statusCode ?? 0, text }));
    });
    r.on('error', fail); r.end(body || undefined);
  });
}

test('door: unsigned, wrongly signed, stale or web-page requests are refused; the right key is proven both ways', async () => {
  const tracker = new JobTracker();
  const s = new HookServer(PORT, () => {}, null);
  s.link = new LinkDoor(KEY, tracker, () => 'C:\\aang-self');
  await s.start();
  try {
    assert.equal((await call('GET', `/link/hello?n=${NONCE}`, '', { key: 'x'.repeat(43) })).code, 403, 'wrong key');
    assert.equal((await call('GET', `/link/hello?n=${NONCE}`, '', { ts: Date.now() - 10 * 60_000 })).code, 403, 'stale');
    assert.equal((await call('GET', `/link/hello?n=${NONCE}`, '', { origin: 'https://evil.example' })).code, 403, 'a web page');
    const hello = await call('GET', `/link/hello?n=${NONCE}`);
    assert.equal(JSON.parse(hello.text).proof, linkMac(KEY, 'hello', NONCE));

    const ev = JSON.stringify({ session: 's1', type: 'ask', id: 'b1', kind: 'permission', tool: 'Bash', cwd: 'C:\\code\\x' });
    assert.equal((await call('POST', '/link/event', ev)).code, 204);
    assert.equal((await call('POST', '/link/event', JSON.stringify({ session: 's9', type: 'start', cwd: 'C:\\aang-self' }))).code, 204);
    assert.deepEqual(tracker.list().map(j => j.id), ['s1'], "Aang's own lanes are not his sessions");
    // A signature covers the body: the same headers with another body are refused.
    const ts = String(Date.now());
    const forged = await new Promise<number>((done, fail) => {
      const r = http.request({ host: '127.0.0.1', port: PORT, path: '/link/event', method: 'POST', agent: false, headers: {
        host: `127.0.0.1:${PORT}`, 'x-aang-link-ts': ts, 'x-aang-link-sig': linkMac(KEY, 'req', ts, 'POST', '/link/event', '{}') } }, res => { res.resume(); done(res.statusCode ?? 0); });
      r.on('error', fail); r.end(ev);
    });
    assert.equal(forged, 403);

    const polled = call('GET', `/link/answer?s=s1&r=b1&n=${NONCE}`);
    await new Promise(r => setTimeout(r, 50));
    assert.equal(tracker.answer('b1', { decision: 'deny-message', message: 'use pnpm' }), null);
    const [item] = JSON.parse((await polled).text).items;
    assert.equal(item.kind, 'answer');
    assert.equal(item.mac, linkMac(KEY, NONCE, 's1', 'b1', 'answer', item.body), 'the answer carries a MAC over this poll\'s nonce');
    assert.deepEqual(JSON.parse(item.body), { decision: 'deny-message', message: 'use pnpm' });
  } finally { tracker.close(); await s.stop(); }
});

test('door: shut when the brain has no key', async () => {
  const s = new HookServer(PORT, () => {}, null);
  await s.start();
  try { assert.equal((await call('GET', `/link/hello?n=${NONCE}`)).code, 403); }
  finally { await s.stop(); }
});

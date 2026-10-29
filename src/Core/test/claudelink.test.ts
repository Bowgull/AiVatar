// C1/C2 (2026-10-21): the brain's half of the aang-link mod. The job tracker (progress, the waiting queue, "after
// this task"), the lock (signed requests, MACs on everything handed back), and the long polls.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { HookServer } from '../src/hooks.ts';
import { JobTracker, LinkDoor, linkMac, MAX_UNREAD } from '../src/claudelink.ts';
import { claudeBusy, steadyMark } from '../src/claudemark.ts';

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

// 2026-10-22, his words: "If I act on something Aang is surfacing, like a question, in Claude without clicking on Aang,
// it should disappear." Every way an ask can end outside Aang takes it off the waiting list (and so off the card, the
// pinned question and the mark), and a held poll for its answer is told it is gone.
test('answered outside Aang: every path takes the ask down, and a late or older event never does it wrongly', async () => {
  const t = new JobTracker();
  const ask = (id: string, at: number, more: Record<string, unknown> = {}) => t.event({ session: 's1', type: 'ask', id, kind: 'question', tool: 'AskUserQuestion', t: at, ...more }, at);
  const ids = () => t.waiting().map(w => w.id);
  let waitPushes = 0;
  t.onChange = (what) => { if (what === 'wait') waitPushes++; };
  t.event({ session: 's1', type: 'turn.start', t: 1 }, 1);
  // 1. The mod's own 'resolved' (Claude's dialog answered, the request abandoned, or the tool call ended).
  ask('a1', 10);
  const gone = t.waitAnswer('s1', 'a1', 5000);
  waitPushes = 0;
  t.event({ session: 's1', type: 'resolved', id: 'a1', t: 11 }, 11);
  assert.deepEqual(ids(), []);
  assert.equal((await gone)!.kind, 'gone', "the mod's held poll ends at once");
  assert.ok(waitPushes > 0, 'the Shell is told at once');
  // 2. Safety net: the very tool call it was for ended, even though 'resolved' never came.
  ask('a2', 20, { toolUseId: 'tu2' });
  t.event({ session: 's1', type: 'tool.end', id: 'tu-other', t: 21 }, 21);
  assert.deepEqual(ids(), ['a2'], 'another call ending says nothing about it');
  t.event({ session: 's1', type: 'tool.end', id: 'tu2', t: 22 }, 22);
  assert.deepEqual(ids(), []);
  // 3. Safety net: the main loop is writing again, so every tool of its last step has its result.
  ask('a3', 30);
  ask('h3', 30, { agentId: 'agent-1' });
  t.event({ session: 's1', type: 'step', what: 'text', t: 29 }, 31);
  assert.deepEqual(ids().sort(), ['a3', 'h3'], 'a step from before the ask, arriving late, takes nothing down');
  t.event({ session: 's1', type: 'step', what: 'text', t: 32 }, 32);
  assert.deepEqual(ids(), ['h3'], "a helper agent's ask is its own: the main loop moving on does not answer it");
  // 4. Safety net: a new message (typed in Claude) starts a new turn.
  t.event({ session: 's1', type: 'turn.start', prompt: 'never mind, do B', t: 40 }, 40);
  assert.deepEqual(ids(), []);
  // 5. Esc / an error: the turn ends.
  ask('a5', 50);
  t.event({ session: 's1', type: 'turn.end', aborted: true, t: 51 }, 51);
  assert.deepEqual(ids(), []);
  // 6. 'resolved' overtook its own ask on the way (the ask is posted alone, the end rides the queue): it never shows.
  t.event({ session: 's1', type: 'resolved', id: 'a6', t: 61 }, 61);
  ask('a6', 60);
  assert.deepEqual(ids(), []);
  // 7. A snapshot (a brain restart, a lost event) is the whole truth: what it no longer lists was answered.
  ask('a7', 70); ask('b7', 70);
  t.event({ session: 's1', type: 'snapshot', phase: 'working', asks: [{ id: 'b7', kind: 'permission', tool: 'Bash' }], t: 71 }, 71);
  assert.deepEqual(ids(), ['b7']);
  // 8. The session ended (closed, /clear).
  t.event({ session: 's1', type: 'end', t: 80 }, 80);
  assert.deepEqual(ids(), []);
  // Another session's 'resolved' never takes this one's ask.
  t.event({ session: 's2', type: 'turn.start', t: 90 }, 90);
  t.event({ session: 's2', type: 'ask', id: 'x9', kind: 'permission', tool: 'Bash', t: 91 }, 91);
  t.event({ session: 's3', type: 'resolved', id: 'x9', t: 92 }, 92);
  assert.deepEqual(ids(), ['x9']);
  // And the way back still works: answered in Aang, the mod's poll gets his answer.
  const ans = t.waitAnswer('s2', 'x9', 5000);
  assert.equal(t.answer('x9', { decision: 'allow' }), null);
  assert.equal((await ans)!.kind, 'answer');
  t.close();
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
    // 2026-10-22: a bench ran in src/Core/test (or a temp folder): not his job either.
    assert.equal((await call('POST', '/link/event', JSON.stringify({ session: 's8', type: 'start', cwd: 'C:\\Users\\Shadow\\Documents\\AangApp\\src\\Core\\test' }))).code, 204);
    assert.equal((await call('POST', '/link/event', JSON.stringify({ session: 's7', type: 'start', cwd: 'C:\\Users\\Shadow\\AppData\\Local\\Temp\\aang-x' }))).code, 204);
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

test('tracker: a turn that ends with background helpers still running stays working until the last one ends (2026-10-22)', () => {
  const t = new JobTracker();
  const now = Date.now();
  t.event({ session: 'b1', type: 'turn.start', cwd: 'C:\code\Aang', prompt: 'mockups' }, now);
  t.event({ session: 'b1', type: 'agent.start', id: 'a1', kind: 'general-purpose', what: 'Mockups', bg: true }, now + 1000);
  t.event({ session: 'b1', type: 'agent.start', id: 'a2', kind: 'general-purpose', what: 'Research', bg: true }, now + 1100);
  t.event({ session: 'b1', type: 'turn.end', aborted: false }, now + 2000);
  let [j] = t.list(now + 2000);
  assert.equal(j!.phase, 'working', 'helpers still at work');
  assert.equal(j!.finished, false);
  assert.equal(j!.activity.now, 'Helpers still at work');
  t.event({ session: 'b1', type: 'agent.end', id: 'a1', ok: true }, now + 60_000);
  [j] = t.list(now + 60_000);
  assert.equal(j!.phase, 'working', 'one helper left');
  t.event({ session: 'b1', type: 'agent.end', id: 'a2', ok: true }, now + 90_000);
  [j] = t.list(now + 90_000);
  assert.equal(j!.phase, 'idle', 'the last helper ended');
  // A new turn and an end with no helpers: idle at once, as before.
  t.event({ session: 'b1', type: 'turn.start' }, now + 100_000);
  t.event({ session: 'b1', type: 'turn.end' }, now + 101_000);
  [j] = t.list(now + 101_000);
  assert.equal(j!.phase, 'idle');
  // A brain meeting the session fresh: a snapshot with a background helper and no turn is working.
  const t2 = new JobTracker();
  t2.event({ session: 'b2', type: 'snapshot', phase: 'idle', agents: [{ id: 'x', kind: 'Explore', what: 'look', bg: true }] }, now);
  assert.equal(t2.list(now)[0]!.phase, 'working');
  t2.event({ session: 'b2', type: 'agent.end', id: 'x' }, now + 5000);
  assert.equal(t2.list(now + 5000)[0]!.phase, 'idle');
});

// 2026-10-22, his words: "do done jobs disappear? i dont want them to". Finished and unread until he X's or opens it.
test('unread: a turn that ends on its own is done and unread until acked or a new turn; stopped and failed are not', async () => {
  const { mkdtempSync, readFileSync, rmSync } = await import('node:fs');
  const os = await import('node:os'), path = await import('node:path');
  const dir = mkdtempSync(path.join(os.tmpdir(), 'aang-unread-'));
  try {
    const t = new JobTracker();
    t.useData(dir, { ci: false });
    const B = Date.now() - 600_000;
    const of = (id: string, now = B + 10_000) => t.list(now).find(j => j.id === id);
    t.event({ session: 'a', type: 'turn.start', cwd: 'C:\code\Waymark', prompt: 'fix the map' }, B + 1000);
    t.event({ session: 'a', type: 'turn.end' }, B + 2000);
    assert.equal(of('a')!.unread, true);
    assert.equal(of('a')!.doneAt, B + 2000);
    // Stopped by him, or an error: not done.
    t.event({ session: 'b', type: 'turn.start', cwd: 'C:\code\Coach' }, B + 1000);
    t.event({ session: 'b', type: 'turn.end', aborted: true }, B + 2000);
    t.event({ session: 'c', type: 'turn.start', cwd: 'C:\code\Notes' }, B + 1000);
    t.event({ session: 'c', type: 'turn.end', reason: 'error' }, B + 2000);
    assert.equal(of('b')!.unread, undefined);
    assert.equal(of('c')!.unread, undefined);
    // Helpers still at work: not done until the last one ends.
    t.event({ session: 'd', type: 'turn.start', cwd: 'C:\code\Rune' }, B + 1000);
    t.event({ session: 'd', type: 'agent.start', id: 'g1', kind: 'Explore', bg: true }, B + 1500);
    t.event({ session: 'd', type: 'turn.end' }, B + 2000);
    assert.equal(of('d')!.phase, 'working');
    assert.equal(of('d')!.unread, undefined);
    t.event({ session: 'd', type: 'agent.end', id: 'g1' }, B + 3000);
    assert.equal(of('d')!.phase, 'idle');
    assert.equal(of('d')!.unread, true);
    // A new turn clears it; so does his ack.
    t.event({ session: 'd', type: 'turn.start' }, B + 4000);
    assert.equal(of('d')!.unread, undefined);
    // The session ends: a light record stays on the list until acked.
    t.event({ session: 'a', type: 'end' }, B + 5000);
    const gone = of('a')!;
    assert.equal(gone.phase, 'ended');
    assert.equal(gone.unread, true);
    assert.equal(gone.prompt, 'fix the map');
    // On disk, so a fresh brain keeps it.
    assert.deepEqual(JSON.parse(readFileSync(path.join(dir, 'claude-unread.json'), 'utf8')).map((u: { id: string }) => u.id), ['a']);
    const t2 = new JobTracker();
    t2.useData(dir, { ci: false });
    assert.equal(t2.list(B + 10_000).find(j => j.id === 'a')?.unread, true);
    let changed = 0;
    t2.onChange = () => { changed++; };
    assert.equal(t2.ack('a'), true);
    assert.equal(t2.ack('a'), false);
    assert.equal(changed, 1);
    assert.equal(t2.list(B + 10_000).find(j => j.id === 'a'), undefined);
    assert.deepEqual(JSON.parse(readFileSync(path.join(dir, 'claude-unread.json'), 'utf8')), []);
    // Twelve hours on, an unread one goes by itself.
    t.event({ session: 'e', type: 'turn.start', cwd: 'C:\code\Old' }, B + 1000);
    t.event({ session: 'e', type: 'turn.end' }, B + 2000);
    t.event({ session: 'e', type: 'end' }, B + 2500);
    assert.equal(t.list(B + 2000 + 12 * 3600_000 + 1).some(j => j.id === 'e'), false);
    t.close(); t2.close();
    await Promise.all([t.hist.flush(), t2.hist.flush()]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// 2026-10-22 (his yes): at most three finished jobs; a fourth reads the oldest by itself, and the tick follows the rest.
test('unread: at most three finished jobs; the fourth drops the oldest, on disk too, and the tick stays for the rest', async () => {
  const { mkdtempSync, readFileSync, writeFileSync, rmSync } = await import('node:fs');
  const os = await import('node:os'), path = await import('node:path');
  const dir = mkdtempSync(path.join(os.tmpdir(), 'aang-unread3-'));
  try {
    assert.equal(MAX_UNREAD, 3);
    const t = new JobTracker();
    t.useData(dir, { ci: false });
    const B = Date.now() - 600_000;
    const finish = (id: string, at: number) => { t.event({ session: id, type: 'turn.start', cwd: 'C:/code/' + id, prompt: id }, at); t.event({ session: id, type: 'turn.end' }, at + 500); };
    const unread = () => t.list(B + 60_000).filter(j => j.unread).map(j => j.id).sort();
    finish('j1', B + 1000); finish('j2', B + 2000); finish('j3', B + 3000);
    assert.deepEqual(unread(), ['j1', 'j2', 'j3']);
    finish('j4', B + 4000);
    assert.deepEqual(unread(), ['j2', 'j3', 'j4'], 'the oldest went by itself');
    assert.deepEqual(JSON.parse(readFileSync(path.join(dir, 'claude-unread.json'), 'utf8')).map((u: { id: string }) => u.id).sort(), ['j2', 'j3', 'j4']);
    const jobs = t.list(B + 60_000);
    assert.equal(steadyMark(jobs, []).mark, 'done');
    assert.equal(claudeBusy({ jobs, waits: [], now: B + 60_000 }).filter(s => s.phase === 'done').length, 3);
    // Acking the three leaves no tick.
    for (const id of ['j2', 'j3', 'j4']) t.ack(id);
    assert.equal(steadyMark(t.list(B + 60_000), []).mark, 'none');
    t.close();
    await t.hist.flush();
    // An older file with five: a fresh brain keeps the newest three.
    const note = (id: string, at: number) => ({ id, project: id, title: id, open: null, task: id, doneAt: at });
    writeFileSync(path.join(dir, 'claude-unread.json'), JSON.stringify([note('o1', B + 1), note('o2', B + 2), note('o3', B + 3), note('o4', B + 4), note('o5', B + 5)]));
    const t2 = new JobTracker();
    t2.useData(dir, { ci: false });
    assert.deepEqual(t2.list(B + 60_000).filter(j => j.unread).map(j => j.id).sort(), ['o3', 'o4', 'o5']);
    t2.close();
    await t2.hist.flush();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// 2026-10-29, his pick: Claude in front for 5 s means he has seen them, so every done tick goes at once.
test('unread: ackAll reads every finished job and says which', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const os = await import('node:os'), path = await import('node:path');
  const dir = mkdtempSync(path.join(os.tmpdir(), 'aang-ackall-'));
  try {
    const t = new JobTracker();
    t.useData(dir, { ci: false });
    const B = Date.now() - 600_000;
    for (const s of ['a', 'b']) { t.event({ session: s, type: 'turn.start', cwd: '/code/' + s }, B + 1000); t.event({ session: s, type: 'turn.end' }, B + 2000); }
    assert.equal(t.list(B + 3000).filter(j => j.unread).length, 2);
    assert.deepEqual(t.ackAll().sort(), ['a', 'b']);
    assert.equal(t.list(B + 3000).filter(j => j.unread).length, 0);
    assert.deepEqual(t.ackAll(), []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

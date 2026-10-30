// The sessions engine (2026-10-30): one list of Claude sessions from every source, with machine and state.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { DeskJobs, STALE_MS, WAIT_STALE_MS, sessionList, stillWaiting, type DeskJobLike, type HookLike, type SessionInput } from '../src/sessionlist.ts';
import { claudeNow, MarkDeriver } from '../src/claudemark.ts';
import { HookTracker } from '../src/hooks.ts';
import type { Job, WaitItem } from '../src/claudelink.ts';

const NOW = 1_800_000_000_000;
const job = (id: string, phase: Job['phase'], extra: Partial<Job> = {}): Job => ({
  id, machine: 'pc', cwd: '/code/' + id, project: id, model: 'sonnet', phase, startedAt: 0, lastActivity: 0, prompt: '',
  tasks: [], current: null, percent: null, etaMs: null, progress: null, activity: { now: '', since: 0, agents: [] }, usage: null, title: id,
  open: '', held: 0, finished: false, source: 'link', ...extra,
});
const wait = (session: string, kind: WaitItem['kind'], extra: Partial<WaitItem> = {}): WaitItem =>
  ({ id: 'w-' + session, session, project: session, kind, tool: 'Bash', summary: 'run the build', input: '{}', canAlways: false, at: NOW, ...extra });
const hook = (id: string, phase: HookLike['phase'], changedAt = NOW, extra: Partial<HookLike> = {}): HookLike =>
  ({ id, project: id, phase, changedAt, prompt: 'fix the bug', waitingFor: '', ...extra });
const desk = (session: string, state: DeskJobLike['state'], updatedAt = NOW, extra: Partial<DeskJobLike> = {}): DeskJobLike =>
  ({ session, cwd: '/Users/j/Aang Jobs/' + session, title: 'Desk ' + session, at: updatedAt - 1000, updatedAt, state, last: 'it wants Bash', ...extra });
const list = (i: Partial<SessionInput>) => sessionList({ jobs: [], waits: [], now: NOW, here: 'mac', ...i });

test('the same session from every source is ONE row, the best source saying its state, every source kept', () => {
  const rows = list({
    jobs: [job('S', 'working', { title: 'Resume rewrite', current: 'Writing the summary' })],
    hooks: [hook('S', 'idle')],
    launched: [{ name: 'job hunt', state: 'working', sessionId: 'S', startedAt: 0, updatedAt: NOW }],
    desk: [desk('S', 'done')],
  });
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], { id: 'S', machine: 'mac', name: 'Resume rewrite', state: 'working', what: 'Writing the summary', sources: ['link', 'hook', 'launched', 'desk'] });
  // A hook-only row takes Aang's own name for a job he launched.
  const h = list({ hooks: [hook('H', 'working')], launched: [{ name: 'job hunt', state: 'working', sessionId: 'H', startedAt: 0, updatedAt: NOW }] });
  assert.deepEqual([h[0]!.name, h[0]!.sources], ['job hunt', ['hook', 'launched']]);
  // His name from the Claude app beats the folder for rows no job names.
  assert.equal(list({ hooks: [hook('N', 'working')], nameOf: () => 'Samara speed' })[0]!.name, 'Samara speed');
});

test('a link job that says idle wins over a hook still saying working: nothing is live', () => {
  assert.deepEqual(list({ jobs: [job('S', 'idle')], hooks: [hook('S', 'working')] }), []);
  assert.deepEqual(list({ jobs: [job('S', 'ended')], launched: [{ name: 'x', state: 'working', sessionId: 'S', startedAt: 0, updatedAt: NOW }] }), []);
});

test('machine: from where the news came, not where the brain runs', () => {
  // A Mac brain: its own link jobs and hooks are the Mac; a hook that came over the tailnet says the PC.
  const mac = list({ here: 'mac', jobs: [job('L', 'working')], hooks: [hook('H', 'working'), hook('P', 'working', NOW, { machine: 'pc' })], desk: [desk('D', 'working')] });
  assert.deepEqual(Object.fromEntries(mac.map(s => [s.id, s.machine])), { L: 'mac', H: 'mac', P: 'pc', D: 'mac' });
  // A PC brain: the old `host` flag still means the MacBook; the desk is always the Mac.
  const pc = list({ here: 'pc', jobs: [job('L', 'working')], hooks: [hook('M', 'working', NOW, { host: 'mac' })], desk: [desk('D', 'working')] });
  assert.deepEqual(Object.fromEntries(pc.map(s => [s.id, s.machine])), { L: 'pc', M: 'mac', D: 'mac' });
  // The card's routing flag (Open on the MacBook) only on a PC brain, for a Mac session.
  const card = (here: 'mac' | 'pc', hooks: HookLike[]) => claudeNow({ jobs: [], waits: [], hooks, now: NOW, here }).sessions[0]!;
  assert.equal(card('pc', [hook('M', 'working', NOW, { host: 'mac' })]).host, 'mac');
  assert.equal(card('mac', [hook('M', 'working')]).host, undefined);
  assert.equal(card('mac', [hook('P', 'working', NOW, { machine: 'pc' })]).machine, 'pc');
});

test('state changes, fed by the real hook tracker: working, waiting on him (with what), answered, idle, gone', () => {
  const t = new HookTracker(() => '');
  const st = () => list({ hooks: t.sessions.values(), now: Date.now() });
  t.handle({ hook_event_name: 'UserPromptSubmit', session_id: 'A', cwd: '/code/Waymark', prompt: 'ship it' });
  assert.deepEqual(st().map(s => [s.state, s.what]), [['working', 'ship it']]);
  t.handle({ hook_event_name: 'Notification', session_id: 'A', cwd: '/code/Waymark', message: 'Claude needs your permission to use Bash' });
  assert.deepEqual(st()[0]!.waitingOn, { kind: 'ok', what: 'Claude needs your permission to use Bash' });
  assert.equal(stillWaiting(st(), 'A'), true);
  // He answered it in Claude: the next prompt (or tool) runs, so it no longer waits.
  t.handle({ hook_event_name: 'UserPromptSubmit', session_id: 'A', cwd: '/code/Waymark', prompt: 'yes' });
  assert.equal(stillWaiting(st(), 'A'), false);
  t.handle({ hook_event_name: 'Stop', session_id: 'A', cwd: '/code/Waymark' });
  assert.deepEqual(st(), []);
  t.handle({ hook_event_name: 'SessionEnd', session_id: 'A' });
  assert.deepEqual(st(), []);
});

test('link states: question, plan, a reply question, paused, failed, done (unread), most pressing first', () => {
  const rows = list({
    jobs: [job('P', 'paused'), job('F', 'idle', { failed: true }), job('D', 'idle', { unread: true }), job('W', 'working'), job('Q', 'working'), job('R', 'idle')],
    waits: [wait('Q', 'question', { plain: 'Which colour?' }), wait('R', 'question', { reply: true })],
  });
  assert.deepEqual(rows.map(s => [s.id, s.state]), [['Q', 'waiting'], ['R', 'waiting'], ['W', 'working'], ['F', 'failed'], ['D', 'done'], ['P', 'paused']]);
  assert.deepEqual(rows[0]!.waitingOn, { kind: 'question', what: 'Which colour?' });
  assert.equal(rows[1]!.waitingOn!.kind, 'reply');
  // A wait that came before its job still counts, under his name for it.
  assert.deepEqual(list({ waits: [wait('X', 'plan')], nameOf: () => 'Samara' }).map(s => [s.name, s.state, s.waitingOn?.kind]), [['Samara', 'waiting', 'plan']]);
});

test('answered elsewhere: one answer, whichever source heard it', () => {
  // Linked: the mod's wait went (he answered in Claude, or on the other machine). A hook still saying "waiting" does not hold it.
  const before = list({ jobs: [job('S', 'working')], waits: [wait('S', 'permission')], hooks: [hook('S', 'waiting', NOW, { waitingFor: 'Claude needs your permission to use Bash' })] });
  assert.equal(stillWaiting(before, 'S'), true);
  const after = list({ jobs: [job('S', 'working')], waits: [], hooks: [hook('S', 'waiting', NOW, { waitingFor: 'Claude needs your permission to use Bash' })] });
  assert.equal(stillWaiting(after, 'S'), false);
  // Claude Code's idle nudge is not a question: nothing waits.
  assert.equal(stillWaiting(list({ hooks: [hook('I', 'waiting', NOW, { waitingFor: 'Claude is waiting for your input' })] }), 'I'), false);
  // From his phone: the desk job went from needs-you to done.
  assert.equal(stillWaiting(list({ desk: [desk('D', 'waiting')] }), 'D'), true);
  assert.equal(stillWaiting(list({ desk: [desk('D', 'done')] }), 'D'), false);
  // A session the list never heard of waits on nothing.
  assert.equal(stillWaiting(list({}), 'nobody'), false);
});

test('stale cleanup: silent hooks, old waits, launch records and desk jobs let go', () => {
  assert.deepEqual(list({ hooks: [hook('H', 'working', NOW - STALE_MS - 1)] }), []);
  assert.equal(list({ hooks: [hook('H', 'working', NOW - 3 * STALE_MS, { transcriptPath: 't.jsonl' })], lastWrite: () => NOW - 1000 }).length, 1, 'a quiet tool still writing is alive');
  assert.equal(list({ hooks: [hook('H', 'waiting', NOW - 3 * STALE_MS, { waitingFor: 'Claude needs your permission to use Bash' })] }).length, 1, 'a real prompt waits for hours');
  assert.deepEqual(list({ hooks: [hook('H', 'waiting', NOW - WAIT_STALE_MS - 1, { waitingFor: 'Claude needs your permission to use Bash' })] }), [], 'closed without a SessionEnd');
  assert.deepEqual(list({ launched: [{ name: 'x', state: 'working', sessionId: 'L', startedAt: 0, updatedAt: NOW - STALE_MS - 1 }] }), []);
  assert.deepEqual(list({ launched: [{ name: 'x', state: 'waiting', sessionId: 'L', startedAt: 0, updatedAt: NOW }] }), [], 'typed, Enter not pressed');
  assert.deepEqual(list({ desk: [desk('D', 'working', NOW - STALE_MS - 1)] }), []);
  assert.deepEqual(list({ desk: [desk('D', 'waiting', NOW - WAIT_STALE_MS - 1)] }), []);
  // An old desk record with no updatedAt goes by when it was made.
  assert.deepEqual(list({ desk: [{ session: 'D', cwd: '/x', title: 'x', at: NOW - STALE_MS - 1, state: 'working' }] }), []);
});

test('the mark and the mark-click card read the same list, desk and other machine included', () => {
  const i = { jobs: [], waits: [], now: NOW, here: 'mac' as const, desk: [desk('D', 'waiting')], hooks: [hook('P', 'working', NOW, { machine: 'pc' as const })] };
  const st = claudeNow(i);
  // A desk job waiting on him: needs-you, named, not honey.
  assert.deepEqual(st.mark, { mark: 'question', what: 'Desk D' });
  assert.equal(new MarkDeriver().now(i.jobs, i.waits, st.alsoWorking).mark, 'question', 'the pushed mark says the same');
  // The click card: exactly these, in the Shell's shape, with machine, sources and what it waits for.
  assert.deepEqual(st.sessions.map(s => ({ id: s.id, project: s.project, phase: s.phase, source: s.source, machine: s.machine })),
    [{ id: 'D', project: 'Desk D', phase: 'waiting', source: 'desk', machine: 'mac' }, { id: 'P', project: 'P', phase: 'working', source: 'hook', machine: 'pc' }]);
  assert.deepEqual(st.sessions[0]!.waitingOn, { kind: 'ok', what: 'it wants Bash' });
  assert.deepEqual(st.list.map(s => s.id), st.sessions.map(s => s.id), 'askOver and the card read one list');
  // He answered on his phone: the mark and the card let go together.
  const later = claudeNow({ ...i, desk: [desk('D', 'done')], hooks: [] });
  assert.deepEqual([later.mark.mark, later.sessions.length], ['none', 0]);
});

test('the desk file reader: missing, broken and good files', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'desk-'));
  const f = path.join(dir, 'jobs.json');
  assert.deepEqual(new DeskJobs(f).list(), []);
  assert.deepEqual(new DeskJobs('').list(), [], "'' turns it off");
  writeFileSync(f, '{nope');
  assert.deepEqual(new DeskJobs(f).list(), []);
  writeFileSync(f, JSON.stringify([desk('A', 'working'), { junk: true }, desk('B', 'done')]));
  const d = new DeskJobs(f);
  assert.deepEqual(d.list().map(j => j.session), ['A', 'B']);
  assert.equal(d.list(), d.list(), 'unchanged file: read once');
});

// The brain end to end: the mark-click answer carries the engine's rows, the desk's and the hooks' alike.
test('brain: a mark click lists a hook session and a desk job, each with its machine and source', async (t) => {
  const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'sessions-'));
  const deskFile = path.join(tmp(), 'jobs.json');
  writeFileSync(deskFile, JSON.stringify([{ session: 'desk-1', cwd: '/x/Aang Jobs/report', thread: 't', title: 'Weekly report', at: Date.now(), updatedAt: Date.now(), state: 'waiting', last: 'it wants Bash' }]));
  const was = process.env.AANG_DESK_JOBS;
  process.env.AANG_DESK_JOBS = deskFile;
  const { Core } = await import('../src/core.ts');
  const core = new Core({ testDoor: true, port: 48740, dataDir: tmp(), stateDir: tmp(), warm: false });
  if (was === undefined) delete process.env.AANG_DESK_JOBS; else process.env.AANG_DESK_JOBS = was;
  await core.start();
  t.after(() => core.stop());
  const c = new WebSocket('ws://127.0.0.1:48740/body');
  const inbox: any[] = [];
  c.on('message', d => inbox.push(JSON.parse(String(d))));
  await new Promise<void>(r => c.once('open', () => r()));
  t.after(() => c.close());
  c.send(JSON.stringify({ t: 'hello', v: 1, client: 'desktop', shell: true }));
  await new Promise(r => setTimeout(r, 150));
  await fetch('http://127.0.0.1:48741/hook', { method: 'POST', body: JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: 'h-live', cwd: path.join(os.homedir(), 'projects', 'Waymark'), prompt: 'fix the build' }) });
  await new Promise(r => setTimeout(r, 300));
  c.send(JSON.stringify({ t: 'mark.click' }));
  await new Promise(r => setTimeout(r, 200));
  const click = inbox.filter(m => m.t === 'mark.click').at(-1);
  assert.ok(click, 'the brain answers the click');
  const here = process.platform === 'darwin' ? 'mac' : 'pc';
  assert.deepEqual(click.sessions.map((s: any) => [s.id, s.phase, s.source, s.machine]), [['desk-1', 'waiting', 'desk', 'mac'], ['h-live', 'working', 'hook', here]]);
  assert.notEqual(inbox.filter(m => m.t === 'claude.mark').at(-1)?.mark ?? 'none', 'none', 'the mark is lit for them');
});

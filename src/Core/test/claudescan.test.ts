// Running Claude sessions picked up from their transcripts (2026-10-21, his "pick up any running sessions in Claude,
// even if I restart him"). Fixtures written the way Claude Code writes its .jsonl: one entry per line, the main loop
// and helper agents (isSidechain) mixed, the app's own lanes and Aang's lanes beside his sessions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TranscriptScan, readTranscript } from '../src/claudescan.ts';
import { JobTracker } from '../src/claudelink.ts';

const S = '11111111-2222-3333-4444-555555555555';
let n = 0;
const base = (extra: Record<string, unknown>) => JSON.stringify({ sessionId: S, cwd: 'C:\\code\\Waymark', entrypoint: 'claude-desktop', isSidechain: false, uuid: `u${++n}`, ...extra });
const prompt = (text: string) => base({ type: 'user', message: { role: 'user', content: text } });
const use = (id: string, name: string, input: unknown, stop = 'tool_use') => base({ type: 'assistant', message: { model: 'claude-opus-5-5', stop_reason: stop, content: [{ type: 'tool_use', id, name, input }] } });
const result = (id: string, extra: Record<string, unknown> = {}) => base({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'ok' }] }, ...extra });
const answer = (text: string) => base({ type: 'assistant', message: { model: 'claude-opus-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text }] } });
const todos = (...s: string[]) => ({ todos: s.map((x, i) => ({ content: `Task ${i + 1}`, activeForm: `Doing task ${i + 1}`, status: x === 'd' ? 'completed' : x === 'n' ? 'in_progress' : 'pending' })) });
const read = (lines: string[], now = Date.now()) => readTranscript(lines.join('\n') + '\n', true, now, '', now);

test('transcript: a list mid-way, the tool running now, a turn under way', () => {
  const s = read([
    prompt('fix the login bug'),
    use('t1', 'TodoWrite', todos('n', 'p', 'p')), result('t1'),
    use('t2', 'TodoWrite', todos('d', 'n', 'p')), result('t2'),
    use('t3', 'Bash', { command: 'npm test -- --token=abcd1234efgh5678ijkl', description: 'Run the tests' }),
  ])!;
  assert.equal(s.session, S);
  assert.equal(s.cwd, 'C:\\code\\Waymark');
  assert.equal(s.working, true);
  assert.equal(s.prompt, 'fix the login bug');
  assert.deepEqual(s.tasks.map(t => t.status), ['completed', 'in_progress', 'pending']);
  assert.equal(s.tasks[1]!.active, 'Doing task 2');
  assert.equal(s.tool?.name, 'Bash');
  assert.equal(s.tool?.detail.desc, 'Run the tests');
});

test('transcript: all done and answered = idle, the list ticked off', () => {
  const s = read([prompt('go'), use('t1', 'TodoWrite', todos('d', 'd')), result('t1'), answer('All done.')])!;
  assert.equal(s.working, false);
  assert.equal(s.answered, true);
  assert.deepEqual(s.tasks.map(t => t.status), ['completed', 'completed']);
  assert.equal(s.tool, null);
});

test('transcript: a rewritten list replaces the old one; the Task tools keep their order through real ids', () => {
  const s = read([prompt('go'), use('t1', 'TodoWrite', todos('d', 'n', 'p', 'p')), result('t1'), use('t2', 'TodoWrite', todos('d', 'n')), result('t2')])!;
  assert.equal(s.tasks.length, 2);
  const k = read([
    prompt('go'),
    use('c1', 'TaskCreate', { subject: 'Build', description: 'x', activeForm: 'Building' }), result('c1', { toolUseResult: { task: { id: '7', subject: 'Build' } } }),
    use('c2', 'TaskCreate', { subject: 'Test', description: 'y' }), result('c2', { toolUseResult: { task: { id: '8', subject: 'Test' } } }),
    use('u1', 'TaskUpdate', { taskId: '7', status: 'completed' }), result('u1'),
    use('u2', 'TaskUpdate', { taskId: '8', status: 'in_progress' }), result('u2'),
  ])!;
  assert.deepEqual(k.tasks.map(t => `${t.text}:${t.status}`), ['Build:completed', 'Test:in_progress']);
  // The mod's own progress tool, in the desktop app's sessions.
  const p = read([prompt('go'), use('p1', 'mcp__aang-link__progress', { tasks: [{ text: 'Plan', status: 'completed' }, { text: 'Ship', status: 'in_progress' }] }), result('p1')])!;
  assert.deepEqual(p.tasks.map(t => t.status), ['completed', 'in_progress']);
});

test("transcript: a helper agent's entries (sidechain) never touch the session's list or state", () => {
  const side = (line: string) => line.replace('"isSidechain":false', '"isSidechain":true');
  const s = read([
    prompt('go'), use('t1', 'TodoWrite', todos('n', 'p')), result('t1'),
    side(use('x1', 'TodoWrite', todos('d', 'd', 'd'))), side(result('x1')), side(answer('helper done')),
    use('a1', 'Agent', { description: 'Map the code', subagent_type: 'Explore', prompt: 'x' }),
  ])!;
  assert.deepEqual(s.tasks.map(t => t.status), ['in_progress', 'pending']);
  assert.equal(s.working, true);
  assert.equal(s.tool?.name, 'Agent');
});

test("transcript: Aang's own lanes and Agent SDK sessions are skipped; an interruption ends the turn", () => {
  const self = [prompt('hi')].map(l => l.replace('C:\\\\code\\\\Waymark', 'C:\\\\Users\\\\T\\\\Documents\\\\Aang\\\\.aang-self'));
  assert.equal(read(self), null);
  assert.equal(read([prompt('hi').replace('claude-desktop', 'sdk-ts')]), null);
  const i = read([prompt('go'), use('t1', 'Bash', { command: 'sleep 100' }), result('t1'), base({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: '[Request interrupted by user]' }] } })])!;
  assert.equal(i.working, false);
  assert.equal(i.answered, false);
  // The app's next-step box ends a turn with its result, no answer after it.
  const w = read([prompt('go'), use('w1', 'mcp__ccd_turn__wrap_up', { recap: 'x' }), result('w1')])!;
  assert.equal(w.working, false);
  // A tail cut mid-line starts at the next whole line.
  const cut = readTranscript('rtial line"}\n' + prompt('cut') + '\n', false, Date.now())!;
  assert.equal(cut.prompt, 'cut');
});

test('scan: fresh transcripts become read-only jobs; the mod takes over; quiet ones drop off', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'scan-'));
  const dir = path.join(root, 'C--code-Waymark');
  mkdirSync(dir);
  const file = path.join(dir, `${S}.jsonl`);
  writeFileSync(file, [prompt('build it'), use('t1', 'TodoWrite', todos('d', 'n', 'p', 'p')), result('t1'), use('t2', 'Edit', { file_path: 'C:\\code\\Waymark\\app.ts' })].join('\n') + '\n');
  // An old one, untouched for an hour: never read.
  const old = path.join(dir, '99999999-2222-3333-4444-555555555555.jsonl');
  writeFileSync(old, prompt('old').replace(S, '99999999-2222-3333-4444-555555555555') + '\n');
  const hourAgo = (Date.now() - 3600_000) / 1000; utimesSync(old, hourAgo, hourAgo);
  const t = new JobTracker();
  const pushes: boolean[] = [];
  t.onChange = (_w, urgent) => pushes.push(!!urgent);
  const scan = new TranscriptScan(t, { root });
  await scan.scan();
  let jobs = t.list();
  assert.equal(jobs.length, 1);
  const j = jobs[0]!;
  assert.equal(j.source, 'transcript');
  assert.equal(j.phase, 'working');
  assert.equal(j.percent, 25);
  assert.equal(j.activity.now, 'Editing app.ts');
  assert.ok(pushes.length >= 1, 'the Shell is told at once');
  // Read-only: no messages, no pause, no answers.
  assert.match(t.send(S, 'hello', 'now') ?? '', /Open it in Claude/);
  assert.match(t.pause(S) ?? '', /Open it in Claude/);
  // Unchanged: not read again, nothing pushed.
  const before = pushes.length;
  await scan.scan();
  assert.equal(pushes.length, before);
  // The session's mod reaches the brain: same id, it takes over, and the transcript no longer steers it.
  t.event({ session: S, type: 'snapshot', cwd: 'C:\\code\\Waymark', phase: 'working', todos: [{ text: 'Task 1', status: 'completed' }, { text: 'Task 2', status: 'completed' }, { text: 'Task 3', status: 'in_progress' }, { text: 'Task 4', status: 'pending' }], tools: [], agents: [], asks: [] });
  jobs = t.list();
  assert.equal(jobs[0]!.source, 'link');
  assert.equal(jobs[0]!.percent, 50);
  writeFileSync(file, prompt('again') + '\n', { flag: 'a' });
  await scan.scan();
  assert.equal(t.list()[0]!.percent, 50, 'the link wins over the transcript');
  // Gone quiet for over 30 minutes with no turn under way: a transcript-only job drops off.
  const t2 = new JobTracker();
  const scan2 = new TranscriptScan(t2, { root });
  writeFileSync(file, [prompt('go'), answer('Done.')].join('\n') + '\n');
  await scan2.scan();
  assert.equal(t2.list()[0]!.phase, 'idle');
  await scan2.scan(Date.now() + 31 * 60_000);
  assert.equal(t2.list().length, 0);
});

test('snapshot: a restarted brain learns the whole session at once; a wait from before is shown but read-only', () => {
  const t = new JobTracker();
  t.event({ session: S, type: 'snapshot', cwd: 'C:\\code\\Waymark', phase: 'working',
    todos: [{ text: 'A', status: 'completed' }, { text: 'B', status: 'in_progress', active: 'Doing B' }],
    tools: [{ id: 'x1', tool: 'Bash', detail: { cmd: 'npm test' } }],
    agents: [{ id: 'g1', kind: 'Explore', what: 'Map the code' }],
    asks: [{ id: 'q1', kind: 'permission', tool: 'Bash', summary: 'Run rm -rf build', input: '{}', readonly: true }] }, 1000);
  const [j] = t.list(1000);
  assert.equal(j!.phase, 'working');
  assert.equal(j!.percent, 50);
  assert.equal(j!.current, 'Doing B');
  assert.equal(j!.activity.agents.length, 1);
  const [w] = t.waiting();
  assert.equal(w!.readonly, true);
  assert.match(t.answer('q1', { decision: 'allow' }) ?? '', /Open it in Claude/);
});

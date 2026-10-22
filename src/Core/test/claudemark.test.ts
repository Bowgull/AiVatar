// C5 (2026-10-21): the mark over Aang's head and its chime, worked out from claude.jobs / claude.wait.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MarkDeriver, steadyMark, claudeNow, HOOK_STALE_MS, type HookLike, type BusyInput } from '../src/claudemark.ts';
import type { Job, WaitItem, TaskStatus } from '../src/claudelink.ts';

const job = (id: string, phase: Job['phase'], tasks: TaskStatus[] = [], extra: Partial<Job> = {}): Job => ({
  id, machine: 'pc', cwd: 'C:\\code\\' + id, project: id, model: 'sonnet', phase, startedAt: 0, lastActivity: 0, prompt: '',
  tasks: tasks.map((status, i) => ({ text: 'task ' + i, status })), current: null, percent: null, etaMs: null, progress: null, activity: { now: '', since: 0, agents: [] }, usage: null, title: id,
  open: '', held: 0, finished: false, source: 'link', ...extra,
});
const wait = (id: string, kind: WaitItem['kind'], project = 'Waymark'): WaitItem =>
  ({ id, session: 's', project, kind, tool: 'Bash', summary: '', input: '{}', canAlways: false, at: 0 });

test('steady mark: permission, then question, then plan, then working, then paused', () => {
  const working = job('Waymark', 'working'), paused = job('Coach', 'paused');
  assert.equal(steadyMark([working, paused], [wait('a', 'plan'), wait('b', 'question'), wait('c', 'permission')]).mark, 'permission');
  assert.equal(steadyMark([working], [wait('a', 'plan'), wait('b', 'question')]).mark, 'question');
  assert.equal(steadyMark([working], [wait('a', 'plan')]).mark, 'plan');
  assert.equal(steadyMark([paused, working], []).mark, 'working');
  assert.equal(steadyMark([paused], []).mark, 'paused');
  assert.equal(steadyMark([job('x', 'idle')], []).mark, 'none');
  // The older signal (a session Aang launched, the MacBook) still shows honey when nothing linked says so.
  assert.equal(steadyMark([], [], true).mark, 'working');
  // The failed hook: nothing sets it today, but when something does, the skull shows (under working).
  assert.equal(steadyMark([job('x', 'idle', [], { failed: true } as Partial<Job>)], []).mark, 'failed');
  assert.equal(steadyMark([job('x', 'idle', [], { failed: true } as Partial<Job>), working], []).mark, 'working');
});

test('first look only learns: no chime for what was already there', () => {
  const d = new MarkDeriver();
  const m = d.update([job('W', 'working', ['completed', 'in_progress'])], [wait('p1', 'permission')]);
  assert.deepEqual(m, { t: 'claude.mark', mark: 'permission', what: 'Waymark' });
  // Nothing changed: nothing sent.
  assert.equal(d.update([job('W', 'working', ['completed', 'in_progress'])], [wait('p1', 'permission')]), null);
});

test('a new waiting item rings the one needs-you chime, whatever its kind; the most pressing names it', () => {
  const d = new MarkDeriver();
  d.update([job('W', 'working')], []);
  assert.equal(d.update([job('W', 'working')], [wait('q1', 'question')])!.sound, 'needs-you');
  const m = d.update([job('W', 'working')], [wait('q1', 'question'), wait('pl', 'plan'), wait('p1', 'permission')])!;
  assert.equal(m.mark, 'permission'); assert.equal(m.sound, 'needs-you');
  // Answered: back to honey, quietly.
  const back = d.update([job('W', 'working')], [])!;
  assert.equal(back.mark, 'working'); assert.equal(back.sound, undefined);
  assert.equal(d.update([job('W', 'working')], [wait('x', 'plan')])!.sound, 'needs-you');
});

test('a ticked task is a small SILENT step; the last one ticked is JOB COMPLETE with the done chime', () => {
  const d = new MarkDeriver();
  d.update([job('W', 'working', ['in_progress', 'pending', 'pending'])], []);
  const step = d.update([job('W', 'working', ['completed', 'in_progress', 'pending'])], [])!;
  assert.equal(step.flash, 'step'); assert.equal(step.sound, undefined, 'no step chime (2026-10-22)'); assert.equal(step.mark, 'working');
  // Same list again: no second tick.
  assert.equal(d.update([job('W', 'working', ['completed', 'in_progress', 'pending'])], []), null);
  // The last two ticked in one go: the whole job.
  const done = d.update([job('W', 'working', ['completed', 'completed', 'completed'])], [])!;
  assert.equal(done.flash, 'complete'); assert.equal(done.sound, 'done');
  // A turn ending with no list moved is not a completion.
  const idle = d.update([job('W', 'idle', ['completed', 'completed', 'completed'])], [])!;
  assert.equal(idle.mark, 'none'); assert.equal(idle.flash, undefined); assert.equal(idle.sound, undefined);
});

test('no to-do list never completes a job, and a rewritten shorter list is not progress', () => {
  const d = new MarkDeriver();
  d.update([job('W', 'working')], []);
  assert.equal(d.update([job('W', 'idle')], [])!.flash, undefined);
  d.update([job('W', 'working', ['completed', 'completed', 'in_progress', 'pending'])], []);
  assert.equal(d.update([job('W', 'working', ['completed', 'in_progress'])], []), null);
});

test('a question landing with a tick: the question wins the chime, the tick still shows', () => {
  const d = new MarkDeriver();
  d.update([job('W', 'working', ['in_progress', 'pending'])], []);
  const m = d.update([job('W', 'working', ['completed', 'in_progress'])], [wait('q', 'question')])!;
  assert.equal(m.mark, 'question'); assert.equal(m.flash, 'step'); assert.equal(m.sound, 'needs-you');
});

test('failed: the skull and its chime once, from the hook', () => {
  const d = new MarkDeriver();
  d.update([job('W', 'working')], []);
  const f = d.update([job('W', 'idle', [], { failed: true } as Partial<Job>)], [])!;
  assert.equal(f.mark, 'failed'); assert.equal(f.sound, 'failed');
  assert.equal(d.update([job('W', 'idle', [], { failed: true } as Partial<Job>)], []), null);
});

test('paused is slate, and a connecting pet gets the mark without a chime', () => {
  const d = new MarkDeriver();
  assert.equal(d.update([job('W', 'paused')], [])!.mark, 'paused');
  assert.deepEqual(d.now([job('W', 'working')], [wait('q', 'question')]), { t: 'claude.mark', mark: 'question', what: 'Waymark' });
});

// 2026-10-21 (his report: the honey mark was up, and clicking it said Claude was not working). One list for the mark,
// the old claude.working and the card: for every source, the mark is up exactly when the card has a session to name.
const hook = (id: string, phase: HookLike['phase'], changedAt: number, extra: Partial<HookLike> = {}): HookLike =>
  ({ id, project: id, phase, changedAt, prompt: 'build it', waitingFor: '', ...extra });
const NOW = 10_000_000;
function agree(name: string, i: BusyInput, want: { mark: string; ids: string[] }) {
  const s = claudeNow({ now: NOW, ...i });
  assert.equal(s.mark.mark, want.mark, name + ': mark');
  assert.deepEqual(s.sessions.map(x => x.id).sort(), [...want.ids].sort(), name + ': card');
  assert.equal(s.mark.mark !== 'none', s.sessions.length > 0, name + ': mark and card agree');
  // What the pet draws: the mark, else (an old brain) claude.working. With the mark none, that must be off too.
  if (s.mark.mark === 'none') assert.equal(s.working.working, false, name + ': no fallback honey');
  // The MarkDeriver the brain pushes with says the same.
  assert.equal(new MarkDeriver().now(i.jobs, i.waits, s.alsoWorking).mark, s.mark.mark, name + ': pushed mark');
}

test('mark and card agree: link jobs', () => {
  agree('working', { jobs: [job('A', 'working')], waits: [] }, { mark: 'working', ids: ['A'] });
  agree('paused', { jobs: [job('A', 'paused')], waits: [] }, { mark: 'paused', ids: ['A'] });
  agree('idle', { jobs: [job('A', 'idle')], waits: [] }, { mark: 'none', ids: [] });
  agree('ended', { jobs: [job('A', 'ended')], waits: [] }, { mark: 'none', ids: [] });
  agree('waiting on him', { jobs: [job('s', 'idle')], waits: [wait('w', 'question')] }, { mark: 'question', ids: ['s'] });
  agree('a wait before its job', { jobs: [], waits: [wait('w', 'permission')] }, { mark: 'permission', ids: ['s'] });
  agree('failed', { jobs: [job('A', 'idle', [], { failed: true } as Partial<Job>)], waits: [] }, { mark: 'failed', ids: ['A'] });
});

test('mark and card agree: transcript jobs', () => {
  agree('working', { jobs: [job('T', 'working', ['in_progress'], { source: 'transcript' })], waits: [] }, { mark: 'working', ids: ['T'] });
  agree('gone quiet', { jobs: [job('T', 'idle', [], { source: 'transcript' })], waits: [] }, { mark: 'none', ids: [] });
  // A transcript job that is idle says it better than a hook still saying working for the same session.
  agree('job beats hook', { jobs: [job('T', 'idle', [], { source: 'transcript' })], waits: [], hooks: [hook('T', 'working', NOW)] }, { mark: 'none', ids: [] });
});

test('mark and card agree: hook sessions, with the stale rule', () => {
  agree('working, fresh', { jobs: [], waits: [], hooks: [hook('H', 'working', NOW - 60_000)] }, { mark: 'working', ids: ['H'] });
  agree('working, silent 11 min', { jobs: [], waits: [], hooks: [hook('H', 'working', NOW - HOOK_STALE_MS - 60_000)] }, { mark: 'none', ids: [] });
  // A long quiet tool still writes the transcript: not stale.
  agree('silent hooks, live transcript', { jobs: [], waits: [], hooks: [hook('H', 'working', NOW - 3 * HOOK_STALE_MS, { transcriptPath: 'x.jsonl' })],
    lastWrite: () => NOW - 30_000 }, { mark: 'working', ids: ['H'] });
  agree('silent hooks, dead transcript', { jobs: [], waits: [], hooks: [hook('H', 'working', NOW - 3 * HOOK_STALE_MS, { transcriptPath: 'x.jsonl' })],
    lastWrite: () => NOW - 2 * HOOK_STALE_MS }, { mark: 'none', ids: [] });
  agree('a permission prompt', { jobs: [], waits: [], hooks: [hook('H', 'waiting', NOW - 3 * HOOK_STALE_MS, { waitingFor: 'Claude needs your permission to use Bash' })] }, { mark: 'working', ids: ['H'] });
  // Claude Code's idle reminder after a finished turn: not work, not a question.
  agree('idle reminder', { jobs: [], waits: [], hooks: [hook('H', 'waiting', NOW, { waitingFor: 'Claude is waiting for your input' })] }, { mark: 'none', ids: [] });
  agree('idle', { jobs: [], waits: [], hooks: [hook('H', 'idle', NOW)] }, { mark: 'none', ids: [] });
  // The same session known both ways is named once.
  agree('hook and job', { jobs: [job('X', 'working')], waits: [], hooks: [hook('X', 'working', NOW)] }, { mark: 'working', ids: ['X'] });
  const mac = claudeNow({ now: NOW, jobs: [], waits: [], hooks: [hook('M', 'working', NOW, { host: 'mac' })] });
  assert.deepEqual(mac.working, { working: true, what: 'M', host: 'mac' });
});

test('mark and card agree: launched sessions, and a brain restart mid-turn', () => {
  const l = (state: string, updatedAt: number, sessionId: string | null = 'L') => ({ name: 'job hunt', state, sessionId, updatedAt, startedAt: 0 });
  agree('launched working', { jobs: [], waits: [], launched: [l('working', NOW - 60_000)] }, { mark: 'working', ids: ['L'] });
  agree('typed, not started', { jobs: [], waits: [], launched: [l('waiting', NOW)] }, { mark: 'none', ids: [] });
  // launched.json said "working" when the brain went down mid-turn; nothing has been heard since: it lets go.
  agree('stale after restart', { jobs: [], waits: [], launched: [l('working', NOW - HOOK_STALE_MS - 1)] }, { mark: 'none', ids: [] });
  agree('launched + hook, once', { jobs: [], waits: [], hooks: [hook('L', 'working', NOW)], launched: [l('working', NOW)] }, { mark: 'working', ids: ['L'] });
  // A fresh brain knows no hooks and no link jobs: nothing is left up from before it.
  agree('fresh brain', { jobs: [], waits: [], hooks: [], launched: [] }, { mark: 'none', ids: [] });
});

// 2026-10-22 (his pick): the teal tick stays while a finished job is unread; under failed, over paused; the card lists it.
test('done: the unread tick sits under working and failed, over paused, and the card names it', () => {
  const done = job('Waymark', 'idle', [], { unread: true, doneAt: 5, title: 'Waymark refresh' });
  assert.deepEqual(steadyMark([done], []), { mark: 'done', what: 'Waymark refresh' });
  assert.equal(steadyMark([done, job('Coach', 'paused')], []).mark, 'done');
  assert.equal(steadyMark([done, job('Coach', 'working')], []).mark, 'working');
  assert.equal(steadyMark([done, job('x', 'idle', [], { failed: true })], []).mark, 'failed');
  assert.equal(steadyMark([done], [wait('a', 'question')]).mark, 'question');
  // A gone session's light record (phase ended) still counts.
  assert.equal(steadyMark([job('Gone', 'ended', [], { unread: true })], []).mark, 'done');
  const now = claudeNow({ jobs: [done], waits: [] });
  assert.equal(now.mark.mark, 'done');
  assert.deepEqual(now.sessions.map(s => [s.id, s.phase]), [['Waymark', 'done']]);
  assert.equal(now.working.working, false);   // done is not working: the old signal stays off
  assert.equal(claudeNow({ jobs: [job('Waymark', 'idle')], waits: [] }).mark.mark, 'none');
});

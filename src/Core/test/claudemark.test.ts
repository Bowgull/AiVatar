// C5 (2026-10-21): the mark over Aang's head and its chime, worked out from claude.jobs / claude.wait.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MarkDeriver, steadyMark } from '../src/claudemark.ts';
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

test('a new waiting item chimes by its kind; the most pressing wins', () => {
  const d = new MarkDeriver();
  d.update([job('W', 'working')], []);
  assert.equal(d.update([job('W', 'working')], [wait('q1', 'question')])!.sound, 'question');
  const m = d.update([job('W', 'working')], [wait('q1', 'question'), wait('pl', 'plan'), wait('p1', 'permission')])!;
  assert.equal(m.mark, 'permission'); assert.equal(m.sound, 'permission');
  // Answered: back to honey, quietly.
  const back = d.update([job('W', 'working')], [])!;
  assert.equal(back.mark, 'working'); assert.equal(back.sound, undefined);
  assert.equal(d.update([job('W', 'working')], [wait('x', 'plan')])!.sound, 'plan-ready');
});

test('a ticked task is a small step; the last one ticked is JOB COMPLETE', () => {
  const d = new MarkDeriver();
  d.update([job('W', 'working', ['in_progress', 'pending', 'pending'])], []);
  const step = d.update([job('W', 'working', ['completed', 'in_progress', 'pending'])], [])!;
  assert.equal(step.flash, 'step'); assert.equal(step.sound, 'step'); assert.equal(step.mark, 'working');
  // Same list again: no second tick.
  assert.equal(d.update([job('W', 'working', ['completed', 'in_progress', 'pending'])], []), null);
  // The last two ticked in one go: the whole job.
  const done = d.update([job('W', 'working', ['completed', 'completed', 'completed'])], [])!;
  assert.equal(done.flash, 'complete'); assert.equal(done.sound, 'job-complete');
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
  assert.equal(m.mark, 'question'); assert.equal(m.flash, 'step'); assert.equal(m.sound, 'question');
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

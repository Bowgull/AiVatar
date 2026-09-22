import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AANG_REPO, asksSomething, brief, folderFor, frameJob, isFrom, lastAssistantText, newSessionLink, newsFor, nextState } from '../src/claude.ts';
import type { Launched } from '../src/claude.ts';
import { kindOf } from '../src/trust.ts';
import { describeCall } from '../src/tools.ts';

const jobs = path.join(os.homedir(), 'job-hunt-data');
test('a browsing job goes through Claude in Chrome and asks before anything that commits him', () => {
  const f = frameJob('browse', 'find the cheapest flight to Montreal on Friday');
  assert.match(f.prompt, /^find the cheapest flight/);
  assert.match(f.prompt, /Claude in Chrome/);
  assert.match(f.prompt, /Ask me before you submit a form, buy or pay/);
});

test('a change to Aang himself is made in his repo, on a branch, tested, and never merged by the session', () => {
  const f = frameJob('self', 'add a pomodoro timer to yourself');
  assert.equal(f.cwd, AANG_REPO);
  assert.match(f.prompt, /new git branch named aang\//);
  assert.match(f.prompt, /never on main, and do not merge it/);
  assert.match(f.prompt, /npm test/);
});

test('a job hunt keeps his words and runs in the job-hunt folder; a plain task in the folder he named', () => {
  assert.equal(frameJob('job hunt', 'Run my job search for today.').prompt, 'Run my job search for today.');
  assert.match(frameJob('job hunt', 'x').cwd, /job-hunt-data$/);
  assert.equal(frameJob('task', 'x').cwd, os.homedir());
});

test('a job moves through waiting, working, needs you and done from its hook events', () => {
  assert.equal(nextState({ hook_event_name: 'UserPromptSubmit' }, null, 'waiting'), 'working');
  assert.equal(nextState({ hook_event_name: 'Notification' }, 'Need input in Claude on the task.', 'working'), 'needs you');
  assert.equal(nextState({ hook_event_name: 'Stop' }, 'Task done. It worked.', 'working'), 'done');
  assert.equal(nextState({ hook_event_name: 'Stop' }, 'Need input in Claude on the task: which one?', 'working'), 'needs you');
  assert.equal(nextState({ hook_event_name: 'SessionEnd' }, null, 'done'), 'ended');
  assert.equal(nextState({ hook_event_name: 'Something' }, null, 'done'), 'done');
});

const launched = (): Launched => ({ name: 'job hunt', cwd: jobs, sessionId: null, startedAt: 0 });

function transcript(...assistant: string[]): string {
  const f = path.join(mkdtempSync(path.join(os.tmpdir(), 'aang-tr-')), 't.jsonl');
  const lines = [JSON.stringify({ type: 'user', message: { content: 'run my job search' } })];
  for (const a of assistant) lines.push(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: a }] } }));
  lines.push(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'x' }] } }));   // no text: skipped
  writeFileSync(f, lines.join('\n'));
  return f;
}

test('the job search is recognised by name and runs in its data folder', () => {
  assert.equal(folderFor('job hunt'), jobs);
  assert.equal(folderFor(undefined), os.homedir());
  assert.equal(folderFor('C:/somewhere'), 'C:/somewhere');
});

test('the Claude app link opens a new Code session with the request typed in and the folder set', () => {
  const link = newSessionLink('Run my job search for today.', 'C:\\Users\\Shadow\\job-hunt-data');
  assert.equal(link, 'claude://code/new?q=Run%20my%20job%20search%20for%20today.&folder=C%3A%5CUsers%5CShadow%5Cjob-hunt-data');
});

test('the session is recognised by its folder, then held to its own id', () => {
  const l = launched();
  assert.equal(isFrom(l, { session_id: 'a1', cwd: jobs.toUpperCase() + '\\' }), true, 'same folder, any case, trailing slash');
  assert.equal(isFrom(l, { session_id: 'b2', cwd: 'C:\\Users\\Shadow\\Documents\\AangApp' }), false, 'another session');
  l.sessionId = 'a1';
  assert.equal(isFrom(l, { session_id: 'c3', cwd: jobs }), false, 'a second session in the same folder is not this one');
  assert.equal(isFrom(l, { session_id: 'a1', cwd: jobs }), true);
});

test('a finished run is summed up from what Claude last wrote, and says where the detail is', () => {
  const t = transcript('Starting.', 'Sweep done. Applied to 4 roles: Wealthsimple, Shopify, Float and Clio. Skipped 3 for salary. Nothing needs you.');
  const n = newsFor(launched(), { hook_event_name: 'Stop', transcript_path: t })!;
  assert.match(n, /^Job hunt done\. Sweep done\. Applied to 4 roles/);
  assert.match(n, /Details in Claude\.$/);
});

test('when Claude ends on a question, it is "need input", not "done"', () => {
  const t = transcript('Found a Greenhouse form asking for salary expectations. What number should I put?');
  const n = newsFor(launched(), { hook_event_name: 'Stop', transcript_path: t })!;
  assert.match(n, /^Need input in Claude on the job hunt: /);
  assert.match(n, /salary expectations/);
});

test('a blocked session (permission or idle) says it needs input, with its reason', () => {
  const n = newsFor(launched(), { hook_event_name: 'Notification', message: 'Claude needs your permission to use Claude in Chrome' });
  assert.equal(n, 'Need input in Claude on the job hunt. It wants permission to use Claude in Chrome');
});

test('other events say nothing', () => {
  assert.equal(newsFor(launched(), { hook_event_name: 'UserPromptSubmit' }), null);
  assert.equal(newsFor(launched(), { hook_event_name: 'SessionStart' }), null);
});

test('questions are told apart from statements', () => {
  assert.equal(asksSomething('All done.'), false);
  assert.equal(asksSomething('Should I apply to the Clio role too'), true);
  assert.equal(asksSomething('Here is the list. Let me know which ones to skip.'), true);
  assert.equal(asksSomething(''), false);
});

test('summaries fit a bubble: markdown stripped, cut at a sentence', () => {
  const b = brief('## Results\n- **Applied**: 4\n- Skipped: 3\n\nThe [Shopify](https://x) form was long. '.repeat(10), 120);
  assert.ok(b.length <= 123, `${b.length}`);
  assert.doesNotMatch(b, /[#*[\]]/);
  assert.equal(lastAssistantText('C:/no/such/file.jsonl'), '');
  assert.equal(brief('Logged in job_pipeline.md and _very_ carefully.'), 'Logged in job_pipeline.md and very carefully.', 'file names keep their underscores');
});

test('starting Claude is asked once, in plain words', () => {
  assert.deepEqual(kindOf('mcp__aang__start_claude', { task: 'x', name: 'job hunt' }), { kind: 'start Claude sessions', says: 'start Claude sessions for you' });
  assert.equal(describeCall('mcp__aang__start_claude', { task: 'Run my job search for today.', name: 'job hunt' }), 'start Claude on the job hunt');
});

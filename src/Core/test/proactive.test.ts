import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { HookTracker, LONG_TURN_MS, projectName } from '../src/hooks.ts';
import { Reminders, describeWhen, dueAt } from '../src/reminders.ts';
import { Core } from '../src/core.ts';

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'aang-pro-'));
const ev = (hook_event_name: string, extra: Record<string, unknown> = {}) =>
  ({ hook_event_name, session_id: 's1', cwd: 'C:\\Users\\Shadow\\Documents\\AangApp', ...extra });

// ---------------------------------------------------------------- session status

test('a turn Joshua sat through is not announced, a long one is', () => {
  const h = new HookTracker();
  let t = 1_000_000;
  assert.equal(h.handle(ev('SessionStart'), t), null);
  assert.equal(h.handle(ev('UserPromptSubmit', { prompt: 'fix the bubble' }), t), null);
  assert.equal(h.handle(ev('Stop'), t + 5_000), null, 'a five second turn is not news');

  h.handle(ev('UserPromptSubmit', { prompt: 'rebuild everything' }), t + 10_000);
  const said = h.handle(ev('Stop'), t + 10_000 + LONG_TURN_MS + 1);
  assert.equal(said?.kind, 'finished');
  assert.match(said!.text, /AangApp/);
});

test('being blocked for an answer is announced, and not repeated in a loop', () => {
  const h = new HookTracker();
  const t = 2_000_000;
  const first = h.handle(ev('Notification', { message: 'Claude needs your permission to run git push' }), t);
  assert.equal(first?.kind, 'waiting');
  assert.match(first!.text, /waiting on you in AangApp/);
  assert.equal(h.handle(ev('Notification', { message: 'still waiting' }), t + 1_000), null, 'no nagging');
  assert.ok(h.handle(ev('Notification', { message: 'again' }), t + 120_000), 'but it may speak again much later');
});

test('answering a blocked session is worth saying even if the turn was short', () => {
  const h = new HookTracker();
  const t = 3_000_000;
  h.handle(ev('Notification', { message: 'needs permission' }), t);
  const said = h.handle(ev('Stop'), t + 2_000);
  assert.equal(said?.kind, 'finished');
});

test('status reads back what each session is doing', () => {
  const h = new HookTracker();
  const t = 4_000_000;
  h.handle(ev('UserPromptSubmit', { prompt: 'write the tests' }), t);
  h.handle({ hook_event_name: 'UserPromptSubmit', session_id: 's2', cwd: 'D:\\code\\cerebro', prompt: 'x' }, t);
  h.handle({ hook_event_name: 'Notification', session_id: 's2', cwd: 'D:\\code\\cerebro', message: 'needs permission' }, t + 1000);
  const text = h.status(t + 61_000);
  assert.match(text, /AangApp: working on "write the tests"/);
  assert.match(text, /cerebro: waiting for Joshua \(needs permission\)/);
});

test('a session that ends disappears, and junk events are ignored', () => {
  const h = new HookTracker();
  h.handle(ev('SessionStart'));
  h.handle(ev('SessionEnd'));
  assert.match(h.status(), /No Claude Code sessions/);
  for (const junk of [null, {}, { hook_event_name: 'Stop' }, { session_id: 'x' }, { hook_event_name: 'Weird', session_id: 'x' }]) {
    assert.equal(h.handle(junk), null);
  }
});

test('the project name is the folder, whichever slash is used', () => {
  assert.equal(projectName('C:\\Users\\Shadow\\Documents\\AangApp'), 'AangApp');
  assert.equal(projectName('/home/me/code/thing/'), 'thing');
  assert.equal(projectName(''), 'a project');
});

// ---------------------------------------------------------------- reminders

test('a reminder fires once, at the right time, and is then gone', async () => {
  const dir = tmp();
  const r = new Reminders(dir);
  const fired: string[] = [];
  r.onDue = x => fired.push(x.text);
  const now = Date.now();
  r.add('take the pizza out', now + 60);
  r.start();
  await new Promise(res => setTimeout(res, 300));
  assert.deepEqual(fired, ['take the pizza out']);
  assert.equal(r.list().length, 0);
  r.stop();
});

test('reminders survive a restart, and one that came due while the Core was off fires at once', async () => {
  const dir = tmp();
  const first = new Reminders(dir);
  first.add('stretch', Date.now() + 50_000);
  first.add('water', Date.now() + 40_000);
  first.stop();
  // the Core is off, and the clock keeps going: "water" comes due while nothing is listening
  const saved = JSON.parse(readFileSync(path.join(dir, 'reminders.json'), 'utf8'));
  saved.find((r: any) => r.text === 'water').at = Date.now() - 1000;
  writeFileSync(path.join(dir, 'reminders.json'), JSON.stringify(saved));

  const second = new Reminders(dir);
  const fired: string[] = [];
  second.onDue = x => fired.push(x.text);
  second.start();
  await new Promise(res => setTimeout(res, 100));
  assert.deepEqual(fired, ['water'], 'the overdue one is delivered late rather than lost');
  assert.deepEqual(second.list().map(x => x.text), ['stretch'], 'the future one is still waiting');
  second.stop();
});

test('a corrupt reminders file does not stop the Core', () => {
  const dir = tmp();
  writeFileSync(path.join(dir, 'reminders.json'), '{ not json');
  const r = new Reminders(dir);
  assert.deepEqual(r.list(), []);
  assert.ok(r.add('still works', Date.now() + 10_000));
  r.stop();
});

test('cancelling matches on a few words, and reminders can be listed', () => {
  const dir = tmp();
  const r = new Reminders(dir);
  r.add('call mum back', Date.now() + 600_000);
  r.add('raid at 9', Date.now() + 1_200_000);
  assert.deepEqual(r.list().map(x => x.text), ['call mum back', 'raid at 9'], 'soonest first');
  assert.equal(r.cancel('mum')?.text, 'call mum back');
  assert.equal(r.cancel('nothing like this'), null);
  assert.deepEqual(r.list().map(x => x.text), ['raid at 9']);
  r.stop();
});

test('times that make no sense are refused rather than guessed at', () => {
  const now = 1_700_000_000_000;
  assert.equal(dueAt(20, undefined, now), now + 1_200_000);
  assert.equal(dueAt(undefined, new Date(now + 5000).toISOString(), now), now + 5000);
  assert.equal(dueAt(-5, undefined, now), null);
  assert.equal(dueAt(60 * 24 * 40, undefined, now), null, 'more than a month out');
  assert.equal(dueAt(undefined, 'sometime next tuesday', now), null);
  assert.equal(dueAt(undefined, undefined, now), null);
  assert.equal(describeWhen(now + 60_000, now), 'in a minute');
  assert.equal(describeWhen(now + 20 * 60_000, now), 'in 20 minutes');
});

// ---------------------------------------------------------------- quiet and mute

async function connected(port: number) {
  const c = new WebSocket(`ws://127.0.0.1:${port}/body`);
  const inbox: any[] = [];
  c.on('message', d => inbox.push(JSON.parse(String(d))));
  await new Promise<void>(r => c.once('open', () => r()));
  return { c, inbox, bubbles: () => inbox.filter(m => m.t === 'bubble') };
}

test('nothing unprompted arrives while the game has focus; it waits and is delivered after', async () => {
  const core = new Core({ port: 47981, dataDir: tmp(), stateDir: tmp(), warm: false });
  await core.start();
  const { c, bubbles } = await connected(47981);

  c.send(JSON.stringify({ t: 'presence', quiet: true, foreground: 'Wow' }));
  await new Promise(r => setTimeout(r, 100));
  core.announce('Claude Code is waiting on you in AangApp.');
  core.announce('Reminder: raid at 9');
  await new Promise(r => setTimeout(r, 200));
  assert.equal(bubbles().length, 0, 'silent while he is in the game');
  assert.equal(core.pendingCount, 2);

  c.send(JSON.stringify({ t: 'presence', quiet: false, foreground: 'explorer' }));
  await new Promise(r => setTimeout(r, 300));
  assert.deepEqual(bubbles().map(b => b.text), ['Claude Code is waiting on you in AangApp.'], 'the first one comes straight away');
  assert.equal(core.pendingCount, 0);
  c.close();
  await core.stop();
});

test('muting silences unprompted messages until it is turned off', async () => {
  const core = new Core({ port: 47982, dataDir: tmp(), stateDir: tmp(), warm: false });
  await core.start();
  const { c, bubbles } = await connected(47982);

  c.send(JSON.stringify({ t: 'mute', on: true }));
  await new Promise(r => setTimeout(r, 100));
  core.announce('Reminder: stretch');
  await new Promise(r => setTimeout(r, 200));
  assert.equal(bubbles().length, 0);

  c.send(JSON.stringify({ t: 'mute', on: false }));
  await new Promise(r => setTimeout(r, 300));
  assert.deepEqual(bubbles().map(b => b.text), ['Reminder: stretch']);
  c.close();
  await core.stop();
});

test('a hook posted over HTTP reaches the bubble', async () => {
  const core = new Core({ port: 47983, dataDir: tmp(), stateDir: tmp(), warm: false });
  await core.start();
  const { c, bubbles } = await connected(47983);
  const post = (body: unknown) => fetch('http://127.0.0.1:47984/hook', { method: 'POST', body: JSON.stringify(body) });

  const res = await post({ hook_event_name: 'Notification', session_id: 'h1', cwd: 'C:\\code\\AangApp', message: 'needs permission' });
  assert.equal(res.status, 204, 'hooks get an immediate, empty answer');
  await new Promise(r => setTimeout(r, 200));
  assert.deepEqual(bubbles().map(b => [b.text, b.proactive]), [['Claude Code is waiting on you in AangApp.', true]]);

  await post('not an object');
  await fetch('http://127.0.0.1:47984/hook', { method: 'GET' }).catch(() => {});
  await new Promise(r => setTimeout(r, 100));
  assert.equal(bubbles().length, 1, 'junk changes nothing and nothing crashed');
  c.close();
  await core.stop();
});

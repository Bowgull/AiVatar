import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { WebSocket } from 'ws';
import { HookTracker, LONG_TURN_MS, projectName, tailnetAddress } from '../src/hooks.ts';
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
  const core = new Core({ testDoor: true, port: 48080, dataDir: tmp(), stateDir: tmp(), warm: false });
  await core.start();
  const { c, bubbles } = await connected(48080);

  c.send(JSON.stringify({ t: 'presence', quiet: true, foreground: 'Wow' }));
  await new Promise(r => setTimeout(r, 100));
  core.announce('Claude Code is waiting on you in AangApp.');
  core.announce('Reminder: raid at 9');
  await new Promise(r => setTimeout(r, 200));
  assert.equal(bubbles().length, 0, 'silent while he is in the game');
  assert.equal(core.pendingCount, 2);

  c.send(JSON.stringify({ t: 'presence', quiet: false, foreground: 'explorer' }));
  await new Promise(r => setTimeout(r, 300));
  // Two or more come out as ONE bubble with a row each, not a drip (2026-10-29, fix 9).
  assert.deepEqual(bubbles().map(b => b.text), ['While you were busy:'], 'both at once, in one bubble');
  assert.equal((bubbles()[0] as { list?: { items: unknown[] } }).list?.items.length, 2);
  assert.equal(core.pendingCount, 0);
  c.close();
  await core.stop();
});

test('a message held during the game comes back whole: its links and its row, so he can reply to it (2026-10-28)', async (t) => {
  const core = new Core({ testDoor: true, port: 48098, dataDir: tmp(), stateDir: tmp(), warm: false });
  await core.start();
  t.after(() => core.stop());
  const { c, bubbles } = await connected(48098);
  t.after(() => c.close());

  c.send(JSON.stringify({ t: 'presence', quiet: true, foreground: 'Wow' }));
  await new Promise(r => setTimeout(r, 100));
  core.announce('New video from his channel', { links: [{ label: 'Watch', url: 'https://www.youtube.com/watch?v=x' }] });
  await new Promise(r => setTimeout(r, 200));
  assert.equal(bubbles().length, 0);

  c.send(JSON.stringify({ t: 'presence', quiet: false, foreground: 'explorer' }));
  await new Promise(r => setTimeout(r, 300));
  const b = bubbles()[0];
  assert.equal(b?.text, 'New video from his channel');
  assert.deepEqual(b?.links, [{ label: 'Watch', url: 'https://www.youtube.com/watch?v=x' }], 'the link is not lost');
  assert.equal(typeof b?.turn, 'number', 'stored when he saw it, so a reply has something to point at');
});

test('typing "brb" sends what comes next to Discord, with no Claude turn (2026-10-28)', async (t) => {
  const core = new Core({ testDoor: true, port: 48086, dataDir: tmp(), stateDir: tmp(), warm: false });
  await core.start();
  t.after(() => core.stop());
  const desk = await connected(48086);
  t.after(() => desk.c.close());
  const phone = await connected(48086);
  t.after(() => phone.c.close());
  phone.c.send(JSON.stringify({ t: 'hello', v: 1, client: 'discord' }));
  desk.c.send(JSON.stringify({ t: 'hello', v: 1 }));
  await new Promise(r => setTimeout(r, 100));

  desk.c.send(JSON.stringify({ t: 'submit', id: 'b1', text: 'brb grabbing food' }));
  await new Promise(r => setTimeout(r, 200));
  assert.equal(desk.bubbles().find(b => b.id === 'b1')?.text, 'Okay. Everything goes to Discord until you are back.');
  assert.ok(desk.inbox.some(m => m.t === 'away.set'), 'the pet is told, so his next touch brings him back');

  core.announce('Reminder: call the bank');
  await new Promise(r => setTimeout(r, 200));
  assert.ok(phone.bubbles().some(b => b.text === 'Reminder: call the bank'), 'it goes to Discord');
  assert.ok(!desk.bubbles().some(b => b.text === 'Reminder: call the bank'), 'not to the bubble as well');
});

test('muting silences unprompted messages until it is turned off', async () => {
  const core = new Core({ testDoor: true, port: 48082, dataDir: tmp(), stateDir: tmp(), warm: false });
  await core.start();
  const { c, bubbles } = await connected(48082);

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
  const core = new Core({ testDoor: true, port: 48084, dataDir: tmp(), stateDir: tmp(), warm: false });
  await core.start();
  const { c, bubbles } = await connected(48084);
  const post = (body: unknown) => fetch('http://127.0.0.1:48085/hook', { method: 'POST', body: JSON.stringify(body) });

  const res = await post({ hook_event_name: 'Notification', session_id: 'h1', cwd: 'C:\\code\\AangApp', message: 'needs permission' });
  assert.equal(res.status, 204, 'hooks get an immediate, empty answer');
  await new Promise(r => setTimeout(r, 200));
  assert.deepEqual(bubbles().map(b => [b.text, b.proactive]), [['Claude Code is waiting on you in AangApp.', true]]);

  await post('not an object');
  await fetch('http://127.0.0.1:48085/hook', { method: 'GET' }).catch(() => {});
  await new Promise(r => setTimeout(r, 100));
  assert.equal(bubbles().length, 1, 'junk changes nothing and nothing crashed');
  c.close();
  await core.stop();
});

test('over Tailscale, a hook needs the key; a MacBook session says where it is', async (t) => {
  const ts = tailnetAddress();
  if (!ts) { t.skip('this machine is not on a tailnet'); return; }
  const dataDir = tmp();
  const core = new Core({ testDoor: true, port: 48092, dataDir, stateDir: tmp(), warm: false });
  await core.start();
  // Always shut down, even after a failed assert: a Core left running kept the whole file from ever ending (it hung
  // for 25 minutes on the MacBook, 2026-10-28).
  t.after(() => core.stop());
  const { c, bubbles } = await connected(48092);
  t.after(() => c.close());
  const key = readFileSync(path.join(dataDir, 'hook.key'), 'utf8').trim();
  const body = JSON.stringify({ hook_event_name: 'Notification', session_id: 'm1', cwd: '/Users/josh/code/site', message: 'needs permission' });

  const without = await fetch(`http://${ts}:48093/hook?e=Notification`, { method: 'POST', body });
  assert.equal(without.status, 403, 'no key, no entry');
  const wrong = await fetch(`http://${ts}:48093/hook?e=Notification`, { method: 'POST', headers: { 'x-aang-key': 'nope' }, body });
  assert.equal(wrong.status, 403);
  const inAddress = await fetch(`http://${ts}:48093/hook?e=Notification&k=${key}`, { method: 'POST', body });
  assert.equal(inAddress.status, 403, 'the right key in the address is refused: header only');
  await new Promise(r => setTimeout(r, 150));
  assert.equal(bubbles().length, 0);

  const ok = await fetch(`http://${ts}:48093/hook?e=Notification`, { method: 'POST', headers: { 'x-aang-key': key }, body });
  assert.equal(ok.status, 204);
  await new Promise(r => setTimeout(r, 200));
  const b = bubbles()[0];
  // Named for the OTHER machine: the MacBook on the PC's brain, the PC on the Mac's (2026-10-29).
  assert.equal(b?.text, `Claude Code on the ${process.platform === 'darwin' ? 'PC' : 'MacBook'} is waiting on you in site.`);
  assert.equal(b?.blocking, true);
  assert.equal(b?.focus, undefined, 'no window on this PC to bring forward');
  assert.equal(b?.host, 'mac');

  // A click on its icon: the Core asks the Mac's one-job listener (played here by a fake) to bring Claude forward.
  const got: string[] = [];
  const fake = http.createServer((req, res) => { got.push(`${req.method} ${req.url} ${String(req.headers['x-aang-key'] ?? '')}`); res.writeHead(204).end(); });
  // On the MacBook itself the real listener already holds 47840, so the fake cannot stand in for it there.
  const listening = await new Promise<boolean>(r => { fake.once('error', () => r(false)); fake.listen(47840, ts, () => r(true)); });
  if (!listening) { t.skip('the real Mac listener holds 47840 on this machine'); return; }
  c.send(JSON.stringify({ t: 'claude.front', host: 'mac' }));
  await new Promise(r => setTimeout(r, 300));
  const frontKey = readFileSync(path.join(dataDir, 'mac-front.key'), 'utf8').trim();
  assert.deepEqual(got, [`POST /front ${frontKey}`], 'the key as a header, never in the address');
  assert.notEqual(frontKey, key, 'a different key from the one the hooks send');
  await new Promise<void>(r => fake.close(() => r()));
});

test('the MacBook setup script is served once, for its code, with both keys in it', async (t) => {
  const ts = tailnetAddress();
  if (!ts) { t.skip('this machine is not on a tailnet'); return; }
  const dataDir = tmp();
  const core = new Core({ testDoor: true, port: 48096, dataDir, stateDir: tmp(), warm: false });
  await core.start();
  const url = (c: string) => `http://${ts}:48097/mac-setup?c=${c}`;
  assert.equal((await fetch(url('whatever'))).status, 404, 'no code file, nothing to fetch');
  writeFileSync(path.join(dataDir, 'mac-setup.code'), 'k7p2x9');
  assert.equal((await fetch(url('wrong1'))).status, 404);
  const res = await fetch(url('k7p2x9'));
  assert.equal(res.status, 200);
  const script = await res.text();
  assert.equal((await fetch(url('k7p2x9'))).status, 404, 'a used code works no more');
  assert.ok(script.includes(readFileSync(path.join(dataDir, 'hook.key'), 'utf8').trim()));
  assert.ok(script.includes(readFileSync(path.join(dataDir, 'mac-front.key'), 'utf8').trim()));
  assert.ok(script.includes(`SHADOW='${ts}'`));
  writeFileSync(path.join(dataDir, 'mac-setup.sh'), script);
  await core.stop();
});

test('a session he started himself gets the same two tiers, even while the game has focus', async () => {
  const core = new Core({ testDoor: true, port: 48088, dataDir: tmp(), stateDir: tmp(), warm: false });
  await core.start();
  const { c, bubbles } = await connected(48088);
  const post = (body: unknown) => fetch('http://127.0.0.1:48089/hook', { method: 'POST', body: JSON.stringify(body) });

  c.send(JSON.stringify({ t: 'presence', quiet: true, foreground: 'Wow' }));
  await new Promise(r => setTimeout(r, 100));

  await post({ hook_event_name: 'Notification', session_id: 'h2', cwd: 'C:\\code\\AangApp', message: 'needs permission' });
  await new Promise(r => setTimeout(r, 200));
  const waiting = bubbles().find(b => /waiting on you/.test(b.text));
  assert.ok(waiting, 'reaches him live, not held for the quiet-hold - it is not routine chatter');
  assert.equal(waiting.blocking, true);
  assert.equal(waiting.jobCwd, undefined, 'no Panel tab for a session Aang did not launch');

  await post({ hook_event_name: 'Stop', session_id: 'h2', cwd: 'C:\\code\\AangApp' });
  // 2026-10-21: every turn end is now the "<title> replied" line (claudereplies.ts), said after a short settle.
  await new Promise(r => setTimeout(r, 2000));
  const finished = bubbles().find(b => /AangApp replied/.test(b.text));
  assert.ok(finished, 'a Stop also reaches him live');
  assert.equal(finished.done, true);
  assert.equal(finished.blocking, undefined, 'done and blocking are never both set');

  c.close();
  await core.stop();
});

test('"it finished" can be followed by "what did it say" - the transcript is kept, not dropped', () => {
  // 2026-09-22, Joshua: "it told me claude was done running but then said it couldnt even tell me what was
  // spat out". Every hook event carries transcript_path; it was being thrown away, so claude_code_status
  // could only ever answer idle/working/waiting and the answer genuinely did not exist anywhere.
  const h = new HookTracker(() => 'Renamed 14 files and fixed the failing test in dock.spec.ts.');
  let t = 2_000_000;
  h.handle(ev('SessionStart', { transcript_path: 'C:/t/x.jsonl' }), t);
  h.handle(ev('UserPromptSubmit', { prompt: 'tidy the tests' }), t);
  const said = h.handle(ev('Stop', { transcript_path: 'C:/t/x.jsonl' }), t + LONG_TURN_MS + 1);
  assert.match(said!.text, /Renamed 14 files/, 'the announcement says what it actually did');
  assert.match(h.status(t + LONG_TURN_MS + 2), /It finished by saying: Renamed 14 files/, 'and it can still be asked afterwards');
});

test('a turn too short to announce is still one he can ask about afterwards', () => {
  const h = new HookTracker(() => 'Nothing needed changing, the test already passed.');
  let t = 3_000_000;
  h.handle(ev('SessionStart', { transcript_path: 'C:/t/y.jsonl' }), t);
  h.handle(ev('UserPromptSubmit', { prompt: 'check it' }), t);
  assert.equal(h.handle(ev('Stop', { transcript_path: 'C:/t/y.jsonl' }), t + 5_000), null, 'still not announced');
  assert.match(h.status(t + 6_000), /Nothing needed changing/, 'but it was kept, so he can still ask');
});

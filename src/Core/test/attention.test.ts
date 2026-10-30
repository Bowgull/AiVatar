// The attention engine (attention.ts, 2026-10-30): one presence rule for both machines, one hold queue, one routing
// table, one place for the cards that wait on him.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { AWAY_AFTER_S, Asks, Buzz, HoldQueue, Presence, busyWhy, readingOf, releaseTo, route, type Gates, type Reading } from '../src/attention.ts';
import { Budget } from '../src/discord-logic.ts';
import type { ToBody } from '../src/protocol.ts';

const pc = (x: Partial<Reading> = {}): Reading => ({ front: 'explorer', idle: 1, mic: false, cam: false, full: false, focus: null, games: ['Wow'], ...x });
const mac = (x: Partial<Reading> = {}): Reading => ({ front: 'Samara', bundle: 'com.aang.browser', idle: 1, mic: false, cam: false, full: false, focus: null, ...x });

// ------------------------------------------------------------------ presence

test('busy is one list on both machines: a game, a call, the Shadow window, full screen, Focus (his pick)', () => {
  for (const r of [pc, mac]) {
    assert.equal(busyWhy(r()), '');
    assert.equal(busyWhy(r({ mic: true })), 'call');
    assert.equal(busyWhy(r({ cam: true })), 'call');
    assert.equal(busyWhy(r({ full: true })), 'full screen');
    assert.equal(busyWhy(r({ focus: true })), 'focus');
    assert.equal(busyWhy(r({ focus: null })), '', 'Focus unknown is not Focus on');
    assert.equal(busyWhy(r({ front: 'Wow' })), 'game');
  }
  assert.equal(busyWhy(mac({ front: 'Shadow PC', bundle: 'com.electron.shadow' })), 'shadow');
  assert.equal(busyWhy(pc({ front: 'WowClassic' })), 'game', 'his list is process name starts');
  assert.equal(busyWhy(pc({ front: 'eldenring', games: ['eldenring', 'Wow'] })), 'game', 'his own game list from the pet');
  assert.equal(busyWhy(pc({ front: 'Wow', games: [] })), '', 'an empty list means no games');
});

test('the PC tray\'s Quiet mode still wins: always is busy, never is never busy', () => {
  assert.equal(busyWhy(pc({ forced: 'always' })), 'set');
  assert.equal(busyWhy(pc({ front: 'Wow', mic: true, forced: 'never' })), '');
  assert.equal(busyWhy(pc({ front: 'Wow', forced: 'auto' })), 'game');
});

test('a reading is checked before it is used', () => {
  assert.equal(readingOf(null), null);
  assert.equal(readingOf({ idle: 3 }), null, 'no front app');
  assert.deepEqual(readingOf({ front: 'Wow', idle: 2, mic: 'yes', games: ['Wow', 7, ''], forced: 'sometimes' }),
    { front: 'Wow', idle: 2, mic: false, cam: false, full: false, focus: null, games: ['Wow'] });
  assert.equal(readingOf({ front: 'x', idle: -4 })!.idle, undefined, 'a negative idle is not a reading');
});

test('presence: busy and desk changes are reported once each; "brb" holds until input comes back', () => {
  let now = 1_000_000;
  const busy: string[] = [], desk: boolean[] = [];
  const p = new Presence({ presence: x => busy.push(x.why), desk: a => desk.push(a), now: () => now });
  p.take(pc());
  p.take(pc());
  p.take(pc({ front: 'Wow' }));
  p.take(pc({ front: 'Wow', idle: 40 }));
  assert.deepEqual(busy, ['', 'game']);
  assert.deepEqual(desk, [true]);
  p.take(pc({ front: 'Wow', idle: AWAY_AFTER_S + 1 }));
  assert.deepEqual(desk, [true, false], 'away after five minutes idle');
  p.take(pc({ idle: 1 }));
  assert.deepEqual(desk, [true, false, true]);
  p.awaySet();
  assert.deepEqual(desk, [true, false, true, false], 'brb: away at once');
  now += 2_000; p.take(pc({ idle: 0 }));
  assert.equal(desk.at(-1), false, 'the Enter that said it, inside the grace');
  now += 60_000; p.take(pc({ idle: 30 }));
  assert.equal(desk.at(-1), true, 'input after it: back');
});

test('presence: an older pet with no idle in its reading leaves the desk alone', () => {
  const desk: boolean[] = [];
  const p = new Presence({ presence: () => {}, desk: a => desk.push(a) });
  p.take({ front: 'Wow' });
  assert.deepEqual(desk, []);
  assert.equal(p.why, 'game');
});

// ------------------------------------------------------------------ the hold queue

test('queue: holds whole lines with their time and tier, and gives them back most important first', () => {
  let t = 0;
  const q = new HoldQueue(8, () => t);
  q.hold('A creator posted', { about: 'x' } as never, 'busy');
  t = 10;
  q.hold('Waymark needs your OK', { blocking: true, session: 's1', claude: 'Waymark' }, 'busy', true);
  t = 20;
  q.hold('Your job is done', { asked: true, done: true }, 'busy', true);
  const links = [{ label: 'Join call', url: 'https://meet.example/x' }];
  q.hold('Your call starts', { asked: true, links } as never, 'hush');
  assert.equal(q.size, 4);
  const out = q.take();
  assert.deepEqual(out.map(h => h.say!.text), ['Waymark needs your OK', 'Your job is done', 'Your call starts', 'A creator posted']);
  assert.deepEqual((out[2]!.say!.opts as { links?: unknown }).links, links, 'its links come back with it');
  assert.equal(out[0]!.say!.opts.session, 's1', 'and its Claude session');
  assert.equal(q.size, 0, 'taken once, never twice');
});

test('queue: past its tier\'s age it is dropped; a reminder never goes stale; the brief lives an hour', () => {
  let t = 0;
  const q = new HoldQueue(8, () => t);
  q.hold('A creator posted', {}, 'busy');
  q.hold('Reminder: stretch', { reminder: 'r1' }, 'busy');
  q.hold('Your brief', { brief: {} }, 'busy');
  q.hold('A job you asked about finished', { asked: true }, 'busy');
  t = 90 * 60_000;
  assert.deepEqual(q.take().map(h => h.say!.text), ['Reminder: stretch', 'A job you asked about finished']);
});

test('queue: a line held again keeps the time it first came', () => {
  let t = 5_000;
  const q = new HoldQueue(8, () => t);
  q.hold('again', { heldAt: 1_000 }, 'muted');
  assert.equal(q.list()[0]!.at, 1_000);
});

test('queue: full, the least important goes first, never the brief for a video post; nothing else is lost', () => {
  const q = new HoldQueue(3);
  q.hold('brief', { brief: {} }, 'busy');
  q.hold('video 1', {}, 'busy');
  q.hold('reminder', { reminder: 'r' }, 'busy');
  assert.equal(q.hold('video 2', {}, 'busy'), 1);
  assert.deepEqual(q.take().map(h => h.say!.text), ['reminder', 'brief', 'video 2']);
});

test('queue: only the latest "now playing" line, and only for five minutes', () => {
  let t = 0;
  const q = new HoldQueue(8, () => t);
  q.holdMsg({ t: 'whisper', text: 'Now playing: a' }, 'claude');
  q.holdMsg({ t: 'whisper', text: 'Now playing: b' }, 'claude');
  assert.equal(q.size, 1);
  t = 6 * 60_000;
  assert.deepEqual(q.take(), []);
});

test('queue: what he dealt with is left out (`over`); away, only lines leave and built messages wait (`which`)', () => {
  const q = new HoldQueue();
  q.hold('answered in Claude', { blocking: true, session: 'done-one' }, 'busy');
  q.hold('still news', { asked: true }, 'busy');
  q.holdMsg({ t: 'bubble', text: 'note notice', stream: false, proactive: true } as ToBody, 'claude');
  const away = q.take(h => h.say?.opts.session === 'done-one', h => !!h.say);
  assert.deepEqual(away.map(h => h.say!.text), ['still news']);
  assert.equal(q.size, 1, 'the note notice waits for the desk');
  assert.equal((q.take()[0]!.msg as { text: string }).text, 'note notice');
});

test('queue: Claude news he saw in Claude goes from the hold; the marker counts what he asked about', () => {
  const q = new HoldQueue();
  q.hold('Waymark finished', { asked: true, done: true, session: 'w1', claude: 'Waymark' }, 'busy', true);
  q.hold('Aang needs your OK', { blocking: true, session: 'a1', claude: 'Aang' }, 'busy', true);
  q.hold('A creator posted', {}, 'busy');
  assert.deepEqual(q.marker(), { count: 2, tier: 1, blocking: true, done: true });
  assert.equal(q.dropSessions(['a1']), 1);
  assert.deepEqual(q.marker(), { count: 1, tier: 2, blocking: false, done: true });
  q.take();
  assert.deepEqual(q.marker(), { count: 0, tier: 3, blocking: false, done: false });
});

// ------------------------------------------------------------------ routing

const g = (x: Partial<Gates> = {}): Gates => ({ hushed: false, muted: false, busy: false, inClaude: false, where: 'desktop', ...x });

test('routing: hush, away, nowhere, mute, busy, Claude in front, then the bubble', () => {
  assert.deepEqual(route({}, g()), { to: 'bubble' });
  assert.deepEqual(route({ asked: true }, g({ hushed: true, where: 'discord' })), { to: 'hold', why: 'hush', marker: false }, 'hush holds even away');
  assert.deepEqual(route({}, g({ where: 'discord', muted: true, busy: true })), { to: 'discord' }, 'away: Discord, mute or not');
  assert.deepEqual(route({}, g({ where: null })), { to: 'hold', why: 'nowhere', marker: false });
  assert.deepEqual(route({ asked: true }, g({ muted: true })), { to: 'hold', why: 'muted', marker: false }, 'mute: nothing at all, no marker');
  assert.deepEqual(route({}, g({ busy: true })), { to: 'hold', why: 'busy', marker: false });
  assert.deepEqual(route({ asked: true }, g({ busy: true })), { to: 'hold', why: 'busy', marker: true }, 'busy: what he asked about waits with a marker (his pick)');
  assert.deepEqual(route({ blocking: true }, g({ busy: true })), { to: 'hold', why: 'busy', marker: true });
  assert.deepEqual(route({ asked: true }, g({ inClaude: true })), { to: 'hold', why: 'claude', marker: false });
});

test('routing: held lines come out only once nothing is in the way', () => {
  assert.equal(releaseTo(g()), 'desktop');
  assert.equal(releaseTo(g({ hushed: true })), null);
  assert.equal(releaseTo(g({ where: null })), null);
  assert.equal(releaseTo(g({ busy: true })), null);
  assert.equal(releaseTo(g({ inClaude: true })), null);
  assert.equal(releaseTo(g({ muted: true })), null);
  assert.equal(releaseTo(g({ where: 'discord', busy: true })), 'discord');
});

test('routing: the brain says whether his phone buzzes', () => {
  const day = new Date(2026, 9, 30, 14), night = new Date(2026, 9, 30, 2);
  const b = new Buzz(new Budget({ fromHour: 22, toHour: 7, perDay: 1 }));
  assert.equal(b.of({ text: 'Reminder: stretch', proactive: true }, night), true, 'a reminder he set always buzzes');
  assert.equal(b.of({ text: 'x', proactive: true, blocking: true }, night), true, 'a session stuck on him always buzzes');
  assert.equal(b.of({ text: 'x', proactive: true, asked: true }, night), false, 'what he asked about is silent at night');
  assert.equal(b.of({ text: 'x', proactive: true, asked: true }, day), true);
  assert.equal(b.of({ text: 'video', proactive: true }, day), true);
  assert.equal(b.of({ text: 'video', proactive: true }, day), false, 'the day\'s few are used up');
});

// ------------------------------------------------------------------ asks

test('asks: his answer settles the card; a second answer does nothing', async () => {
  const expired: unknown[] = [];
  const a = new Asks(id => expired.push(id));
  const p = a.wait<string>('permission', 'perm1', 10_000, () => 'no');
  assert.equal(a.waiting('permission'), 'perm1');
  assert.equal(a.has('plan', 'perm1'), false);
  assert.equal(a.answer('perm1', 'once'), true);
  assert.equal(await p, 'once');
  assert.equal(a.answer('perm1', 'always'), false);
  assert.equal(a.waiting('permission'), null);
  assert.deepEqual(expired, []);
});

test('asks: run out, the card is taken down and the wait ends with its "no"', async () => {
  const expired: unknown[] = [];
  const a = new Asks(id => expired.push(id));
  let why = '';
  const p = a.wait<number>('choice', 'choice1', 30, () => { why = 'he did not pick'; return -2; });
  const f = a.wait<boolean | null>('fact', 7, 30, () => null);
  assert.equal(await p, -2);
  assert.equal(await f, null);
  assert.equal(why, 'he did not pick');
  assert.deepEqual(expired.sort(), [7, 'choice1'].sort());
  assert.equal(a.answer('choice1', 0), false, 'too late');
});

// ------------------------------------------------------------------ the brain, end to end

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'aang-attn-'));
async function pet(port: number) {
  const c = new WebSocket(`ws://127.0.0.1:${port}/body`);
  const inbox: any[] = [];
  c.on('message', d => inbox.push(JSON.parse(String(d))));
  await new Promise<void>(r => c.once('open', () => r()));
  return { c, inbox, of: (t: string) => inbox.filter(m => m.t === t) };
}
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

test('brain: a pet\'s raw readings decide busy; what he asked about waits with a marker, then comes out as one bundle', async (t) => {
  const { Core } = await import('../src/core.ts');
  const core = new Core({ testDoor: true, port: 48630, dataDir: tmp(), stateDir: tmp(), warm: false });
  await core.start();
  t.after(() => core.stop());
  const p = await pet(48630);
  t.after(() => p.c.close());

  // On a call: the pet only says the mic is on; the brain says busy.
  p.c.send(JSON.stringify({ t: 'presence', quiet: false, foreground: 'explorer', reading: { front: 'explorer', idle: 2, mic: true, games: ['Wow'] } }));
  await wait(150);
  assert.deepEqual(p.of('presence.verdict').at(-1), { t: 'presence.verdict', quiet: true, why: 'call' });

  core.announce('Waymark finished the build.', { asked: true, done: true, claude: 'Waymark', session: 'sess-waymark-1' });
  core.announce('A creator you follow just posted a video.');
  await wait(150);
  assert.equal(p.of('bubble').length, 0, 'nothing pops up on a call, even what he asked about');
  assert.equal(core.pendingCount, 2);
  assert.deepEqual(p.of('held').at(-1), { t: 'held', count: 1, tier: 2, blocking: false, done: true }, 'a marker for the one he asked about');

  // The call ends (a periodic reading, nothing in front changed): one bundle, most important first, marker gone.
  p.c.send(JSON.stringify({ t: 'reading', reading: { front: 'explorer', idle: 2, games: ['Wow'] } }));
  await wait(300);
  assert.deepEqual(p.of('presence.verdict').at(-1), { t: 'presence.verdict', quiet: false, why: '' });
  const b = p.of('bubble');
  assert.equal(b.length, 1, 'one bubble, not a drip');
  assert.equal(b[0].text, 'While you were busy:');
  assert.deepEqual(b[0].list.held.map((m: { text: string }) => m.text), ['Waymark finished the build.', 'A creator you follow just posted a video.']);
  assert.equal(b[0].list.held[0].session, 'sess-waymark-1', 'its Claude session is not lost');
  assert.equal(typeof b[0].list.held[0].turn, 'number', 'stored when he saw it, so it is in Look back');
  assert.equal(p.of('held').at(-1).count, 0);
  assert.equal(core.pendingCount, 0);
});

test('brain: clicking the marker shows what waits now, busy or not', async (t) => {
  const { Core } = await import('../src/core.ts');
  const core = new Core({ testDoor: true, port: 48632, dataDir: tmp(), stateDir: tmp(), warm: false });
  await core.start();
  t.after(() => core.stop());
  const p = await pet(48632);
  t.after(() => p.c.close());
  p.c.send(JSON.stringify({ t: 'presence', quiet: false, foreground: 'Wow', reading: { front: 'Wow', idle: 1, games: ['Wow'] } }));
  await wait(150);
  core.announce('The job hunt job is done.', { asked: true, done: true });
  await wait(100);
  assert.equal(p.of('bubble').length, 0);
  p.c.send(JSON.stringify({ t: 'held.open' }));
  await wait(200);
  const b = p.of('bubble');
  assert.equal(b.length, 1);
  assert.equal(b[0].text, 'The job hunt job is done.');
  assert.equal(b[0].proactive, false, 'shown like a reply: he asked for it');
  assert.equal(core.pendingCount, 0);
});

test('brain: idle in the pet\'s readings sends him away to Discord on the PC too, and the pet\'s own desk is ignored', async (t) => {
  const { Core } = await import('../src/core.ts');
  const core = new Core({ testDoor: true, port: 48634, dataDir: tmp(), stateDir: tmp(), warm: false });
  await core.start();
  t.after(() => core.stop());
  const desk = await pet(48634);
  t.after(() => desk.c.close());
  const phone = new WebSocket("ws://127.0.0.1:48634/body");
  const posts: any[] = [];
  phone.on('message', d => { const m = JSON.parse(String(d)); if (m.t === 'bubble') posts.push(m); });
  await new Promise<void>(r => phone.once('open', () => r()));
  t.after(() => phone.close());
  phone.send(JSON.stringify({ t: 'hello', v: 1, client: 'discord' }));
  await wait(100);
  desk.c.send(JSON.stringify({ t: 'presence', quiet: false, foreground: 'explorer', reading: { front: 'explorer', idle: 1 } }));
  desk.c.send(JSON.stringify({ t: 'reading', reading: { front: 'explorer', idle: AWAY_AFTER_S + 5 } }));
  desk.c.send(JSON.stringify({ t: 'desk', active: true }));             // an older pet's own word: ignored now
  await wait(150);
  core.announce('Reminder: take the bins out', { reminder: 'r9' });
  await wait(150);
  assert.equal(desk.of('bubble').length, 0);
  assert.equal(posts.length, 1, 'away: it went to his phone');
  assert.equal(posts[0].buzz, true, 'and the brain said it buzzes (a reminder he set)');
});

// 2026-10-30, his report on the Mac: a waiting Claude session lit the "?" mark, yet a click on it said "Claude isn't
// working on anything", and its line had no way to reach Claude. The brain is the one source for both.
test('brain: a session waiting on him lights the mark, and a click on the mark gets that same session back', async (t) => {
  const { Core } = await import('../src/core.ts');
  const core = new Core({ testDoor: true, port: 48636, dataDir: tmp(), stateDir: tmp(), warm: false });
  await core.start();
  t.after(() => core.stop());
  const shell = await pet(48636);
  t.after(() => shell.c.close());
  shell.c.send(JSON.stringify({ t: 'hello', v: 1, client: 'desktop', shell: true }));
  await wait(150);
  await fetch('http://127.0.0.1:48637/hook', { method: 'POST', body: JSON.stringify({ hook_event_name: 'Notification', session_id: 'w-live', cwd: path.join(os.homedir(), 'projects', 'Waymark'), message: 'needs permission to run the build' }) });
  await wait(400);
  assert.notEqual(shell.of('claude.mark').at(-1)?.mark ?? 'none', 'none', 'the mark is lit');
  const line = shell.of('bubble').find(b => /^Waymark wants your OK/.test(b.text));
  assert.ok(line, 'the waiting line reached the bubble');
  assert.equal(line.kind, 'claude');
  assert.equal(line.focus, 'Claude', 'its Open Claude key has a window to bring forward');
  shell.c.send(JSON.stringify({ t: 'mark.click' }));
  await wait(200);
  const click = shell.of('mark.click').at(-1);
  assert.ok(click, 'the brain answers the click');
  assert.deepEqual(click.sessions.map((s: { project: string }) => s.project), ['Waymark'], 'the same session the mark is lit for, never an empty list');
});

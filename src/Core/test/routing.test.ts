// One message, one place (Joshua, 2026-09-21): "aang never ever needs to double reply". A reply goes back only to
// where he asked; what Aang says on his own goes to the desktop while he is at the PC and to Discord when not.
// Tested without the model: the lane is replaced by a stub and its result is fed in by hand.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { Core } from '../src/core.ts';
import { SWEEP_REQUEST } from '../src/jobs.ts';

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'aang-route-'));
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

async function client(port: number, kind?: 'discord') {
  const c = new WebSocket(`ws://127.0.0.1:${port}/body`);
  const inbox: any[] = [];
  c.on('message', d => inbox.push(JSON.parse(String(d))));
  await new Promise<void>(r => c.once('open', () => r()));
  c.send(JSON.stringify({ t: 'hello', v: 1, ...(kind ? { client: kind } : {}) }));
  return { c, inbox, of: (t: string) => inbox.filter(m => m.t === t) };
}

async function setup(port: number) {
  const core: any = new Core({ port, dataDir: tmp(), stateDir: tmp(), warm: false, consolidate: false });
  core.lane = () => ({ send: () => {}, interrupt: async () => {} });       // no model in these tests
  await core.start();
  const desk = await client(port), phone = await client(port, 'discord');
  await wait(100);
  return { core, desk, phone, done: async () => { desk.c.close(); phone.c.close(); await core.stop(); } };
}

test('a question asked in Discord is answered in Discord only, and the desktop shows nothing', async () => {
  const { core, desk, phone, done } = await setup(48132);
  phone.c.send(JSON.stringify({ t: 'submit', id: 'd1', text: 'what can you do?' }));
  await wait(100);
  const lane = core.active.lane;
  core.onLaneEvent(lane, { t: 'delta', text: 'I can' });
  await wait(200);
  core.onLaneEvent(lane, { t: 'result', ok: true, text: 'I can look things up.', tools: [], ms: 5 });
  await wait(100);
  assert.deepEqual(phone.of('bubble').filter(b => !b.stream).map(b => b.text), ['I can look things up.']);
  assert.deepEqual(desk.inbox.filter(m => ['bubble', 'bubble.dots', 'state', 'tool', 'error'].includes(m.t)), [], 'no bubble, dots or animation on the desktop');
  await done();
});

test('a question asked on the desktop is answered there only', async () => {
  const { core, desk, phone, done } = await setup(48134);
  desk.c.send(JSON.stringify({ t: 'submit', id: 'b1', text: 'hi' }));
  await wait(100);
  core.onLaneEvent(core.active.lane, { t: 'result', ok: true, text: 'Hey.', tools: [], ms: 5 });
  await wait(100);
  assert.deepEqual(desk.of('bubble').map(b => b.text), ['Hey.']);
  assert.equal(phone.of('bubble').length, 0);
  await done();
});

test('"where" means the desktop as a whole: a second desktop window (the Body) sees what the first one asked', async () => {
  const { core, desk, phone, done } = await setup(48144);
  const body = await client(48130);                                // the Body, next to a client that submits
  await wait(100);
  desk.c.send(JSON.stringify({ t: 'submit', id: 'b9', text: 'open paint' }));
  await wait(100);
  const asked = core.askPermission('mcp__aang__open', { what: 'paint' });
  await wait(100);
  assert.equal(body.of('permission').length, 1, 'the Body shows the question');
  assert.equal(desk.of('permission').length, 1);
  assert.equal(phone.of('permission').length, 0, 'Discord does not');
  body.c.send(JSON.stringify({ t: 'permission.reply', id: body.of('permission')[0].id, choice: 'no' }));
  assert.equal(await asked, false);
  body.c.close();
  await done();
});

test('present_list rides the reply\'s own bubble message, and clears once it has', async () => {
  // 2026-09-24: the bubble redesign needs the Core to say WHAT KIND of reply this is, not just send prose.
  // present_list sets a per-turn field the same way turnActions already does; this checks it actually reaches
  // the bubble message the reply goes out on, and that a later turn which never called it gets none.
  const { core, desk, done } = await setup(48140);
  desk.c.send(JSON.stringify({ t: 'submit', id: 'a', text: 'any jobs worth it' }));
  await wait(100);
  core.pendingList = { icon: 'job', items: [{ title: 'Senior CSM', subtitle: 'Shopify', chipText: '82', chipTone: 'good' }] };
  core.onLaneEvent(core.active.lane, { t: 'result', ok: true, text: 'Three worth your time.', tools: [], ms: 5 });
  await wait(100);
  const first = desk.of('bubble').find((b: any) => !b.stream);
  assert.deepEqual(first?.list, { icon: 'job', items: [{ title: 'Senior CSM', subtitle: 'Shopify', chipText: '82', chipTone: 'good' }] });

  desk.c.send(JSON.stringify({ t: 'submit', id: 'b', text: 'what time is it' }));
  await wait(100);
  core.onLaneEvent(core.active.lane, { t: 'result', ok: true, text: 'It is 3pm.', tools: [], ms: 5 });
  await wait(100);
  const second = desk.of('bubble').filter((b: any) => !b.stream).at(-1);
  assert.equal(second?.list, undefined, 'a turn that never called present_list carries no list');
  await done();
});

test('a yes/no question goes where the request came from', async () => {
  const { core, desk, phone, done } = await setup(48136);
  phone.c.send(JSON.stringify({ t: 'submit', id: 'd2', text: 'read my screen' }));
  await wait(100);
  const asked = core.askPermission('mcp__aang__read_window', { app: 'firefox' });
  await wait(100);
  assert.equal(phone.of('permission').length, 1);
  assert.equal(desk.of('permission').length, 0);
  phone.c.send(JSON.stringify({ t: 'permission.reply', id: phone.of('permission')[0].id, choice: 'no' }));
  assert.equal(await asked, false);
  await done();
});

test('unprompted messages: desktop while he is at the PC, Discord when he is away, never both', async () => {
  const { core, desk, phone, done } = await setup(48138);
  core.announce('Job hunt done.');
  await wait(100);
  assert.deepEqual([desk.of('bubble').length, phone.of('bubble').length], [1, 0], 'at the PC: the bubble only');

  desk.c.send(JSON.stringify({ t: 'desk', active: false }));
  await wait(100);
  core.announce('Reminder: stretch');
  await wait(100);
  assert.deepEqual([desk.of('bubble').length, phone.of('bubble').length], [1, 1], 'away: Discord only');
  assert.equal(core.whereHeIs(), 'discord');

  desk.c.send(JSON.stringify({ t: 'desk', active: true }));
  await wait(100);
  assert.equal(core.whereHeIs(), 'desktop');
  await done();
});

test('switching lane mid-conversation carries a recap; staying on the same lane does not', async () => {
  // Each of Quick/Smart/Deep is its own persistent session with its own history (2026-09-22): a handoff used
  // to arrive with no idea what was just said. Now the lane that is being switched TO gets a short recap of
  // the last exchange, and only on a genuine switch - not on every turn.
  const port = 48128;
  const core: any = new Core({ port, dataDir: tmp(), stateDir: tmp(), warm: false, consolidate: false });
  const sent: { name: string; text: string }[] = [];
  core.lane = (name: string) => ({ send: (text: string) => sent.push({ name, text }), interrupt: async () => {} });
  await core.start();
  try {
    const desk = await client(port);

    desk.c.send(JSON.stringify({ t: 'submit', id: 'a', text: 'hi' }));            // -> quick
    await wait(100);
    assert.equal(sent[0]!.name, 'quick');
    assert.ok(!sent[0]!.text.includes('<recap>'), 'nothing to recap on the very first turn');
    core.onLaneEvent('quick', { t: 'result', ok: true, text: 'Hey.', tools: [], ms: 5 });
    await wait(100);

    desk.c.send(JSON.stringify({ t: 'submit', id: 'b', text: 'open notepad' }));  // ACT -> smart: a real switch
    await wait(100);
    assert.equal(sent[1]!.name, 'smart');
    assert.match(sent[1]!.text, /<recap>[\s\S]*hi[\s\S]*Hey\.[\s\S]*<\/recap>/);
    core.onLaneEvent('smart', { t: 'result', ok: true, text: 'Opened.', tools: ['open'], ms: 5 });
    await wait(100);

    desk.c.send(JSON.stringify({ t: 'submit', id: 'c', text: 'write a short poem' })); // HARD -> smart again: no switch
    await wait(100);
    assert.equal(sent[2]!.name, 'smart');
    assert.ok(!sent[2]!.text.includes('<recap>'), 'still on Smart: its own session already has this');

    desk.c.close();
  } finally { await core.stop(); }
});

test('a job-hunt STATUS QUESTION does not launch a new sweep; a real request still does', async () => {
  // 2026-09-22: JOB_HUNT_RE matched "job hunt" anywhere, so "how's the job hunt going" launched a whole new
  // Mac sweep instead of just being answered. JOB_HUNT_QUESTION_RE excludes question-shaped phrasing.
  const port = 48126;
  const core: any = new Core({ port, dataDir: tmp(), stateDir: tmp(), warm: false, consolidate: false });
  const macRuns: string[] = [];
  core.runOnMac = async (text: string) => { macRuns.push(text); return true; };
  core.lane = () => ({ send: () => {}, interrupt: async () => {} });   // the question path must not reach here for real
  await core.start();
  try {
    const desk = await client(port);

    desk.c.send(JSON.stringify({ t: 'submit', id: 'a', text: "how's the job hunt going" }));
    await wait(100);
    assert.equal(macRuns.length, 0, 'a question about it is not a request to run it');

    desk.c.send(JSON.stringify({ t: 'submit', id: 'b', text: 'run my job search for today' }));
    await wait(100);
    assert.equal(macRuns.length, 1, 'a real request still launches the sweep');

    desk.c.close();
  } finally { await core.stop(); }
});

test('"job scan" is job-hunt-shaped too, and the local fallback is Claude, not the worker', async () => {
  // 2026-09-23, live: "run a job scan" did not match JOB_HUNT_RE at all (only "job hunt"/"job search" did), so
  // it fell through to the model, which called start_claude on its own - a real session, but none of this
  // block's reliability. Separately, the local (Mac-unreachable) fallback used to be do_task, the background
  // worker - real evidence it cannot do this job at all (tasks.json: "Dropped, no job search run", it has no
  // Claude in Chrome). start_claude is the one path with real browser access, so that is the fallback now.
  const port = 48124;
  const core: any = new Core({ port, dataDir: tmp(), stateDir: tmp(), warm: false, consolidate: false });
  core.runOnMac = async () => false;                        // Mac unreachable: force the local fallback
  const started: any[] = [];
  core.startClaude = async (...args: any[]) => { started.push(args); return 'opened'; };
  await core.start();
  try {
    const desk = await client(port);

    desk.c.send(JSON.stringify({ t: 'submit', id: 'a', text: 'run a job scan' }));
    await wait(100);
    assert.equal(started.length, 1, '"job scan" is recognised and the deterministic path is taken');
    assert.equal(started[0][0], SWEEP_REQUEST);
    const said = desk.of('bubble').find(b => b.id === 'a');
    assert.match(said!.text, /Press Enter there to start it/, 'he is told up front, not left to notice a window himself');

    desk.c.close();
  } finally { await core.stop(); }
});

test('a Claude session that goes quiet after starting is followed up on, once', async () => {
  // The 90-second "press Enter" check only ever catches a session that NEVER got a session id. One that did
  // - Enter was pressed, or it got past the folder-trust prompt - and then produced no further hook events
  // was invisible: nothing was watching it again (2026-09-23, live: exactly this happened on a job hunt).
  const core: any = new Core({ port: 48142, dataDir: tmp(), stateDir: tmp(), warm: false, consolidate: false });
  await core.start();
  try {
    const desk = await client(48142);
    const now = Date.now();
    core.launched.push({ name: 'job hunt', cwd: 'C:\\Users\\Shadow\\job-hunt-data', sessionId: 'abc123', state: 'working', startedAt: now - 10 * 60_000, updatedAt: now - 6 * 60_000 });

    core.checkStaleLaunches(now);
    await wait(50);
    const nudge = desk.of('bubble').find((b: any) => /No word from the job hunt/.test(b.text));
    assert.ok(nudge, 'a session gone quiet for 6 minutes is followed up on');
    assert.equal(core.launched[0].staleNudged, true);

    core.checkStaleLaunches(now + 1000);
    await wait(50);
    assert.equal(desk.of('bubble').filter((b: any) => /No word from the job hunt/.test(b.text)).length, 1, 'said once, not every sweep');

    desk.c.close();
  } finally { await core.stop(); }
});

test('a continuous "Claude is working" signal reaches the desktop, once per real change', async () => {
  // 2026-09-23, Joshua: asked for a job search, could not tell it was doing anything - point-in-time messages
  // are not the same as a live state the Body can render continuously (the glow/eyes). A fresh connection
  // gets told where things stand right now; an already-connected one hears again only when it changes.
  const port = 48122;
  const core: any = new Core({ port, dataDir: tmp(), stateDir: tmp(), warm: false, consolidate: false });
  await core.start();
  try {
    // client() resolves once the socket is OPEN and 'hello' is sent, not once the server has replied -
    // an assertion right after connecting was checking before the reply could possibly have arrived. A
    // missing `await wait()` here is exactly what turned an assertion failure into a 14-MINUTE hang
    // (2026-09-23, live): the throw skipped the cleanup line at the bottom, so core.stop() never ran and
    // the WebSocket/HTTP servers this test opened were never closed. try/finally now guarantees cleanup
    // regardless of which assertion fails.
    const desk1 = await client(port);
    await wait(80);
    assert.equal(desk1.of('claude.working').at(-1)?.working, false, 'nothing running yet, told so on connect');

    // 'waiting' means typed in, Enter not pressed yet (JobState's own doc comment) - it must NEVER count as
    // working, however tempting that was before the fix (2026-09-23, approved: "only count it once it's
    // really running"). It was live-observed on 2026-09-23: the glow turned on the moment startClaude() opened
    // the window, well before anything had actually started.
    core.launched.push({ name: 'job hunt', cwd: 'C:\\jobs', sessionId: null, state: 'waiting', startedAt: Date.now(), updatedAt: Date.now() });
    core.pushClaudeWorking();
    await wait(80);
    assert.equal(desk1.of('claude.working').at(-1)?.working, false, 'typed in but not started yet is not working');

    core.launched[0].state = 'working'; core.launched[0].sessionId = 'sess1';   // Enter pressed, a real hook fired
    core.pushClaudeWorking();
    await wait(80);
    assert.equal(desk1.of('claude.working').at(-1)?.working, true, 'a session that has really started is working');

    // a second desktop connecting now hears the CURRENT state immediately, not just future changes
    const desk2 = await client(port);
    await wait(80);
    assert.equal(desk2.of('claude.working').at(-1)?.working, true);

    const before = desk1.of('claude.working').length;            // already 2: the connect reply, then the real change
    core.pushClaudeWorking();                                    // nothing changed: no repeat
    await wait(80);
    assert.equal(desk1.of('claude.working').length, before, 'a no-op check adds nothing');

    core.launched[0].state = 'done';
    core.pushClaudeWorking();
    await wait(80);
    assert.equal(desk1.of('claude.working').at(-1)?.working, false, 'and again once it is actually done');

    desk1.c.close(); desk2.c.close();
  } finally { await core.stop(); }
});

test('a reply to something Aang said unprompted carries what was actually said, once, while it is fresh', async () => {
  // 2026-09-23, live: told "you're at 50% of your week", replied "the week is almost over, that's fine", and
  // got nothing useful back - announce() text is UI-only, never in any lane's own conversation, so the model
  // genuinely had nothing to go on. withAnnounced() gives the next reply that context.
  const port = 48120;
  const core: any = new Core({ port, dataDir: tmp(), stateDir: tmp(), warm: false, consolidate: false });
  const sent: string[] = [];
  core.lane = () => ({ send: (text: string) => sent.push(text), interrupt: async () => {} });
  await core.start();
  try {
    const desk = await client(port);
    core.announce("You're at 50% of your week. Want me to save quota?");

    desk.c.send(JSON.stringify({ t: 'submit', id: 'a', text: 'the week is almost over, that is fine' }));
    await wait(100);
    assert.match(sent[0]!, /<just said>[\s\S]*50% of your week[\s\S]*<\/just said>/, 'the reply carries what it is replying to');
    // The mocked lane never finishes a turn on its own (found 2026-09-24: this test alone was missing the
    // onLaneEvent pattern every other mocked-lane test in this file uses), so without this, this.active never
    // clears, every later submit just queues, and the turn's watchdog timer eventually stalls the whole run
    // for minutes rather than failing fast - the actual cause of a hang once attributed to a missing cleanup.
    core.onLaneEvent(core.active.lane, { t: 'result', ok: true, text: 'ok', tools: [], ms: 5 });

    desk.c.send(JSON.stringify({ t: 'submit', id: 'b', text: 'anyway, what time is it' }));
    await wait(100);
    assert.ok(!sent[1]!.includes('<just said>'), 'used once: an unrelated later message does not get it too');
    core.onLaneEvent(core.active.lane, { t: 'result', ok: true, text: 'ok', tools: [], ms: 5 });

    // stale: an announcement from long ago should not be forced onto a reply that may be about something else
    core.lastAnnounced = { text: 'Reminder: stretch', at: Date.now() - 20 * 60_000 };
    desk.c.send(JSON.stringify({ t: 'submit', id: 'c', text: 'ok' }));
    await wait(100);
    assert.ok(!sent[2]!.includes('<just said>'), 'too old: not assumed to be what this reply is about');
    core.onLaneEvent(core.active.lane, { t: 'result', ok: true, text: 'ok', tools: [], ms: 5 });

    desk.c.close();
  } finally { await core.stop(); }
});

test('away but Discord is not connected: the desktop still gets it rather than nobody', async () => {
  const core: any = new Core({ port: 48146, dataDir: tmp(), stateDir: tmp(), warm: false, consolidate: false });
  await core.start();
  const desk = await client(48140);
  desk.c.send(JSON.stringify({ t: 'desk', active: false }));
  await wait(100);
  core.announce('Reminder: stretch');
  await wait(100);
  assert.equal(desk.of('bubble').length, 1);
  desk.c.close();
  await core.stop();
});

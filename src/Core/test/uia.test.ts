import './_env.ts';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { Core } from '../src/core.ts';
import { kindOf } from '../src/trust.ts';
import { describeCall, TOOL_NAMES, ABILITIES } from '../src/tools.ts';
import { describeMatches, isBrowser, isRisky, listControlsText, needsCare, pickControl } from '../src/uia.ts';
import type { ActArgs, ActReply, Control } from '../src/uia.ts';

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'aang-uia-'));
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const C = (i: number, name: string, type = 'button', extra: Partial<Control> = {}): Control => ({ i, name, type, password: false, enabled: true, ...extra });

test('what counts as risky: things that cannot be taken back or that speak for him', () => {
  for (const n of ['Send', 'Send message', 'Pay now', 'Submit application', 'Delete', 'Place order', 'Sign in', 'Log in', 'Yes', 'OK', 'Accept all', 'Publish', 'Apply', 'Transfer funds', 'Reply all', 'Uninstall', 'Close Tab', 'Exit']) assert.equal(isRisky(n), true, n);
  for (const n of ['Save', 'Cancel', 'Say hello', 'Search', 'Bold', 'New tab', 'Settings', 'Play', 'Next', 'Copy', 'Open', 'Add New Tab']) assert.equal(isRisky(n), false, n);
  assert.equal(isRisky('Cookies'), false, 'a word that only contains "ok" is not "OK"');
});

test('browsers are always careful, other apps only for risky controls', () => {
  assert.equal(isBrowser('chrome'), true); assert.equal(isBrowser('Firefox'), true); assert.equal(isBrowser('notepad'), false);
  assert.equal(needsCare('chrome', 'Search').care, true);
  assert.match(needsCare('chrome', 'Search').why, /web page/);
  assert.equal(needsCare('notepad', 'Save').care, false);
  assert.equal(needsCare('notepad', 'Send').care, true);
});

test('the control he meant: exact name, then a single partial match, and clear help when it is ambiguous or missing', () => {
  const ms = [C(0, 'Save'), C(1, 'Save as'), C(2, 'Cancel'), C(3, 'Twin'), C(4, 'Twin')];
  assert.equal((pickControl(ms, 'save') as any).control.i, 0, 'exact beats partial');
  assert.equal((pickControl(ms, 'Cancel') as any).control.i, 2);
  assert.equal((pickControl(ms, 'can') as any).control.i, 2, 'a single partial match');
  assert.match((pickControl(ms, 'Twin') as any).error, /2 controls called "Twin".*"Twin" \(button\)/);
  assert.match((pickControl(ms, 'sa') as any).error, /matches 2 controls.*"Save".*"Save as"/);
  assert.match((pickControl(ms, 'nothing') as any).error, /no control called "nothing"/);
  assert.match(describeMatches(Array.from({ length: 12 }, (_, i) => C(i, 'b' + i))), /and 4 more\.$/);
});

test('the list of controls reads plainly: grouped, passwords and greyed items marked, honest when empty', () => {
  const r: ActReply = { ok: true, window: { title: 'Form', process: 'notepad' }, total: 3, matches: [C(0, 'Say hello'), C(1, 'Secret', 'edit', { password: true }), C(2, 'Greyed', 'button', { enabled: false })] };
  const t = listControlsText(r);
  assert.match(t, /Window "Form" of notepad/);
  assert.match(t, /buttons: "Say hello", "Greyed" \(greyed out\)/);
  assert.match(t, /edits: "Secret" \(password, never filled\)/);
  assert.match(listControlsText({ ok: true, window: { title: 'Game', process: 'wow' }, matches: [] }), /shows no controls I can use/);
  assert.equal(listControlsText({ ok: false, error: 'I could not find an open window for "zzz".' }), 'I could not find an open window for "zzz".');
});

test('trust: asked once per app, every time when careful, and reading the controls is reading windows', () => {
  assert.deepEqual(kindOf('mcp__aang__press_control', { app: 'Notepad', name: 'Save', careful: false }), { kind: 'act in notepad', says: 'press buttons and fill fields in Notepad' });
  assert.equal(kindOf('mcp__aang__fill_control', { app: 'Notepad', name: 'Name' })!.kind, 'act in notepad');
  assert.equal(kindOf('mcp__aang__press_control', { app: 'chrome', name: 'Send', careful: true }), null);
  assert.equal(kindOf('mcp__aang__press_control', { name: 'Save' }), null, 'no app: asked');
  assert.equal(kindOf('mcp__aang__list_controls', { app: 'notepad' })!.kind, 'read windows');
});

test('the questions say exactly what will happen, including what will be typed', () => {
  assert.equal(describeCall('mcp__aang__press_control', { app: 'notepad', name: 'Save' }), 'press "Save" in notepad');
  assert.match(describeCall('mcp__aang__press_control', { app: 'chrome', name: 'Send', careful: true }), /^press "Send" in chrome \(I ask every time for this\)$/);
  assert.equal(describeCall('mcp__aang__fill_control', { app: 'notepad', name: 'Name field', text: 'Josh' }), 'type "Josh" into "Name field" in notepad');
  for (const t of ['list_controls', 'press_control', 'fill_control']) assert.ok(TOOL_NAMES.includes('mcp__aang__' + t), t);
  assert.match(ABILITIES, /press or fill them by name/);
  assert.match(ABILITIES, /Never a password field/);
});

// ---------------------------------------------------------------- the rules in the Core, against a pretend Windows

const running: (() => Promise<void>)[] = [];
after(async () => { for (const stop of running) await stop().catch(() => {}); });

/** A fake window world: what `find` returns, and a record of every real press and fill. */
function world(controls: Control[], proc = 'Notepad') {
  const calls: ActArgs[] = [];
  const runner = async (a: ActArgs): Promise<ActReply> => {
    calls.push(a);
    const window = { title: `${proc} window`, process: proc };
    if (a.do === 'find') { const hits = a.name ? controls.filter(c => c.name.toLowerCase().includes(a.name!.toLowerCase())) : controls; return { ok: true, window, matches: hits, total: hits.length }; }
    return { ok: true, window, done: true, detail: a.do === 'press' ? `Pressed "${a.name}".` : `Filled "${a.name}" (${a.text?.length} characters).` };
  };
  return { calls, runner, acts: () => calls.filter(c => c.do !== 'find') };
}

async function rig(port: number) {                                        // ports two apart: a Core also listens on port + 1
  const core: any = new Core({ port, dataDir: tmp(), stateDir: tmp(), warm: false, consolidate: false });
  await core.start();
  const c = new WebSocket(`ws://127.0.0.1:${port}/body`); const inbox: any[] = [];
  let answer = true;
  c.on('message', d => { const m = JSON.parse(String(d)); inbox.push(m); if (m.t === 'permission') c.send(JSON.stringify({ t: 'permission.reply', id: m.id, allow: answer })); });
  await new Promise<void>(r => c.once('open', () => r()));
  await wait(80);
  const done = async () => { c.close(); await core.stop(); };
  running.push(done);
  return { core, questions: () => inbox.filter(m => m.t === 'permission').map(m => String(m.question)), say: (yes: boolean) => { answer = yes; }, done };
}

test('pressing asks once per app, uses the app name Windows reports, and sends the exact control it found', async () => {
  const { core, questions, done } = await rig(47900);
  const w = world([C(0, 'Say hello'), C(1, 'Save')], 'Notepad');
  core.actRunner = w.runner;
  const doers = core.doers();
  const r1 = await doers.uiPress('notepad', 'say hello');                  // the model's spelling differs
  assert.equal(r1.ok, true, r1.detail);
  assert.match(r1.detail, /Pressed "Say hello"\. \(in Notepad\)/);
  assert.deepEqual(questions(), ['press "Say hello" in Notepad'], 'asked in plain words');
  assert.deepEqual(w.acts()[0], { app: 'Notepad', do: 'press', name: 'Say hello', index: 0 }, 'canonical app and name, and the index it saw');
  assert.equal(core.trust.allowed('act in notepad'), true);
  await doers.uiPress('notepad', 'Save');
  assert.equal(questions().length, 1, 'trusted for Notepad now');
  await done();
});

test('a control that sends, pays or deletes asks every time, even in a trusted app', async () => {
  const { core, questions, done } = await rig(47902);
  core.trust.allow('act in notepad', 'test');
  const w = world([C(0, 'Send'), C(1, 'Save')], 'Notepad');
  core.actRunner = w.runner;
  const doers = core.doers();
  await doers.uiPress('notepad', 'Save');
  assert.equal(questions().length, 0, 'ordinary control: trusted');
  await doers.uiPress('notepad', 'Send');
  await doers.uiPress('notepad', 'Send');
  assert.equal(questions().length, 2, 'Send asked about both times');
  assert.match(questions()[0]!, /\(I ask every time for this\)/);
  await done();
});

test('in a web browser every action asks, and afterwards even a trusted app asks again for the rest of the turn', async () => {
  const { core, questions, done } = await rig(47904);
  core.trust.allow('act in notepad', 'test');
  core.trust.allow('act in chrome', 'a stale grant that must not be honoured');
  const web = world([C(0, 'Search')], 'chrome');
  core.actRunner = web.runner;
  const doers = core.doers();
  await doers.uiPress('chrome', 'Search'); await doers.uiPress('chrome', 'Search');
  assert.equal(questions().length, 2, 'asked each time, whatever is remembered');
  assert.equal(core.tainted, true);
  core.actRunner = world([C(0, 'Save')], 'Notepad').runner;
  await doers.uiPress('notepad', 'Save');
  assert.equal(questions().length, 3, 'a page was read this turn, so a remembered yes is not used');
  await done();
});

test('refused without asking: a password field, a greyed-out control, a missing or ambiguous name', async () => {
  const { core, questions, done } = await rig(47906);
  const w = world([C(0, 'Secret', 'edit', { password: true }), C(1, 'Greyed', 'button', { enabled: false }), C(2, 'Twin'), C(3, 'Twin'), C(4, 'Save')]);
  core.actRunner = w.runner;
  const doers = core.doers();
  assert.match((await doers.uiFill('notepad', 'Secret', 'hunter2')).detail, /password field, and I never fill/);
  assert.match((await doers.uiPress('notepad', 'Greyed')).detail, /greyed out/);
  assert.match((await doers.uiPress('notepad', 'Twin')).detail, /2 controls called "Twin"/);
  const missing = await doers.uiPress('notepad', 'Nope');
  assert.match(missing.detail, /no control called "Nope"|nothing called "Nope"/);
  assert.match(missing.detail, /They are: "Secret" \(edit\), "Greyed" \(button\), "Twin" \(button\)/, 'and what is there is listed');
  assert.equal(questions().length, 0, 'never asked about any of these');
  assert.equal(w.acts().length, 0, 'and nothing was pressed or typed');
  await done();
});

test('a no does nothing, and filling says what will be typed and passes exactly that text', async () => {
  const { core, questions, say, done } = await rig(47908);
  const w = world([C(0, 'Name field', 'edit')]);
  core.actRunner = w.runner;
  const doers = core.doers();
  say(false);
  const no = await doers.uiFill('notepad', 'Name field', 'Josh Bocas');
  assert.equal(no.ok, false);
  assert.equal(w.acts().length, 0);
  assert.equal(questions()[0], 'type "Josh Bocas" into "Name field" in Notepad');
  say(true);
  const yes = await doers.uiFill('notepad', 'Name field', 'Josh Bocas');
  assert.equal(yes.ok, true);
  assert.deepEqual(w.acts()[0], { app: 'Notepad', do: 'fill', name: 'Name field', index: 0, text: 'Josh Bocas' });
  assert.equal((await doers.uiFill('notepad', 'Name field', undefined as any)).ok, false, 'no text: refused');
  await done();
});

test('looking at an app is reading windows: asked once, and a browser page taints the turn', async () => {
  const { core, questions, done } = await rig(47910);
  core.actRunner = world([C(0, 'Save')], 'Notepad').runner;
  const doers = core.doers();
  assert.match(await doers.uiList('notepad'), /buttons: "Save"/);
  assert.equal(core.trust.allowed('read windows'), true);
  assert.equal(core.tainted, false);
  await doers.uiList('notepad');
  assert.equal(questions().length, 1);
  core.actRunner = world([C(0, 'Search')], 'firefox').runner;
  await doers.uiList('firefox');
  assert.equal(core.tainted, true);
  await done();
});

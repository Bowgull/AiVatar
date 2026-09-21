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
  const { core, desk, phone, done } = await setup(47991);
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
  const { core, desk, phone, done } = await setup(47992);
  desk.c.send(JSON.stringify({ t: 'submit', id: 'b1', text: 'hi' }));
  await wait(100);
  core.onLaneEvent(core.active.lane, { t: 'result', ok: true, text: 'Hey.', tools: [], ms: 5 });
  await wait(100);
  assert.deepEqual(desk.of('bubble').map(b => b.text), ['Hey.']);
  assert.equal(phone.of('bubble').length, 0);
  await done();
});

test('a yes/no question goes where the request came from', async () => {
  const { core, desk, phone, done } = await setup(47993);
  phone.c.send(JSON.stringify({ t: 'submit', id: 'd2', text: 'read my screen' }));
  await wait(100);
  const asked = core.askPermission('mcp__aang__read_window', { app: 'firefox' });
  await wait(100);
  assert.equal(phone.of('permission').length, 1);
  assert.equal(desk.of('permission').length, 0);
  phone.c.send(JSON.stringify({ t: 'permission.reply', id: phone.of('permission')[0].id, allow: false }));
  assert.equal(await asked, false);
  await done();
});

test('unprompted messages: desktop while he is at the PC, Discord when he is away, never both', async () => {
  const { core, desk, phone, done } = await setup(47994);
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

test('away but Discord is not connected: the desktop still gets it rather than nobody', async () => {
  const core: any = new Core({ port: 47995, dataDir: tmp(), stateDir: tmp(), warm: false, consolidate: false });
  await core.start();
  const desk = await client(47995);
  desk.c.send(JSON.stringify({ t: 'desk', active: false }));
  await wait(100);
  core.announce('Reminder: stretch');
  await wait(100);
  assert.equal(desk.of('bubble').length, 1);
  desk.c.close();
  await core.stop();
});

import './_env.ts';
// The safety basics: a record of what he did, undo, a permissions review with revoke, and hush. No model involved:
// the Core is driven through its own connection and its tool handlers are called directly.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { DatabaseSync } from 'node:sqlite';
import { Core } from '../src/core.ts';
import { writeWhole } from '../src/files.ts';
import { ActionLog, UndoStack, formatAction } from '../src/actionlog.ts';

process.env.AANG_UNDO_DIR = mkdtempSync(path.join(os.tmpdir(), 'aang-undo2-'));
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'aang-safe-'));

test('the record keeps what happened, newest last, survives a restart, and a failure says why', () => {
  const dir = tmp();
  const log = new ActionLog(dir);
  const t0 = new Date('2026-09-22T18:31:00Z');
  log.add({ tool: 'write_file', did: 'write to …/notes.txt', ok: true, note: '' }, t0);
  log.add({ tool: 'close_app', did: 'close spotify', ok: false, note: 'Nothing called spotify is open.' }, new Date(t0.getTime() + 60_000));
  const lines = new ActionLog(dir).text().split('\n');
  assert.equal(lines.length, 2);
  assert.match(lines[0]!, /^2:31 p\.m\.\s+write to …\/notes\.txt$/);
  assert.match(lines[1]!, /close spotify\s+\(failed: Nothing called spotify is open\.\)$/);
  assert.match(new ActionLog(tmp()).text(), /not done anything/);
  assert.match(formatAction({ ts: t0.toISOString(), tool: 'x', did: 'did x', ok: true, note: '' }, true), /^2026-09-22 /);
});

test('undo: last in, first out, and an empty stack says so', () => {
  const u = new UndoStack();
  assert.equal(u.pop(), null);
  u.push('a', () => 'A'); u.push('b', () => 'B');
  assert.equal(u.pop()!.run(), 'B');
  assert.equal(u.pop()!.label, 'a');
  for (let i = 0; i < 30; i++) u.push('n' + i, () => '');
  assert.equal(u.size, 20, 'only the last twenty');
});

// A Core also listens on port + 1 for hooks, so the ports below are two apart. Whatever a failing test leaves running is stopped here.
const running: (() => Promise<void>)[] = [];
after(async () => { for (const stop of running) await stop().catch(() => {}); });

async function rig(port: number) {
  const dataDir = tmp();
  const db = new DatabaseSync(path.join(dataDir, 'aang.db'));   // Memory opens an existing database; it does not build the tables
  db.exec('CREATE TABLE facts (id INTEGER PRIMARY KEY, ts TEXT NOT NULL, text TEXT NOT NULL UNIQUE, source TEXT, last_seen TEXT, times_seen INTEGER DEFAULT 1, retired INTEGER DEFAULT 0); CREATE TABLE turns (id INTEGER PRIMARY KEY, ts TEXT NOT NULL, role TEXT NOT NULL, tier TEXT, text TEXT NOT NULL);');
  db.close();
  const core: any = new Core({ port, dataDir, stateDir: tmp(), warm: false, consolidate: false });
  await core.start();
  const conn = async (k?: 'discord') => {
    const c = new WebSocket(`ws://127.0.0.1:${port}/body`); const inbox: any[] = [];
    c.on('message', d => inbox.push(JSON.parse(String(d))));
    await new Promise<void>(r => c.once('open', () => r()));
    c.send(JSON.stringify({ t: 'hello', v: 1, ...(k ? { client: k } : {}) }));
    return { c, inbox, of: (t: string) => inbox.filter(m => m.t === t) };
  };
  const desk = await conn(), phone = await conn('discord');
  await wait(100);
  const done = async () => { desk.c.close(); phone.c.close(); await core.stop(); };
  running.push(done);
  return { core, desk, phone, done };
}

test('what he does is recorded with what really happened, and a receipt goes to Discord only', async () => {
  const { core, desk, phone, done } = await rig(47930);
  core.reportAction('write_file', { file: 'C:\\a\\b\\c\\notes.txt' }, false, 'Created');
  core.reportAction('close_app', { what: 'spotify' }, true, 'Nothing called spotify is open.');
  await wait(100);
  assert.equal(core.actions.recent().length, 2);
  assert.match(core.actions.text(), /write to …\/c\/notes\.txt/);
  assert.match(core.actions.text(), /close spotify\s+\(failed: Nothing called spotify/);
  assert.equal(phone.of('action').length, 2, 'receipts in #log');
  assert.equal(desk.of('action').length, 0, 'not on the desktop');
  phone.c.send(JSON.stringify({ t: 'actions' })); await wait(100);
  assert.match(phone.of('actions.reply')[0].text, /close spotify/);
  await done();
});

test('undo puts back a file change, something remembered, something forgotten, and a reminder', async () => {
  const { core, done } = await rig(47932);
  // a file, through the real change path (he says yes)
  core.trust.allow('write files', 'test');
  const file = path.join(tmp(), 'n.txt'); writeFileSync(file, 'one');
  await core.changeFile('mcp__aang__write_file', { file }, () => writeWhole(file, 'two', { stateDir: core.cfg.stateDir, dataDir: core.cfg.dataDir }));
  // memory and reminders through the tool handlers
  const doers = core.doers();
  const { fact } = core.memory.remember('He likes green tea');
  doers.pushUndo(`remembering "${fact.text}"`, () => { core.memory.forget(fact.text); return 'forgot it again'; });
  const r = core.reminders.add('stretch', Date.now() + 3600_000);
  doers.pushUndo('the reminder "stretch"', () => { core.reminders.cancel(r.id); return 'cancelled'; });

  assert.match(doers.undoLast().detail, /^Undid the reminder "stretch"/);
  assert.equal(core.reminders.list().length, 0);
  assert.match(doers.undoLast().detail, /^Undid remembering "He likes green tea"/);
  assert.equal(core.memory.list().some((f: any) => /green tea/.test(f.text)), false);
  assert.match(doers.undoLast().detail, /^Undid the change to /);
  assert.equal(readFileSync(file, 'utf8'), 'one', 'the file is back');
  const none = doers.undoLast();
  assert.equal(none.ok, false);
  assert.match(none.detail, /nothing to undo/);
  await done();
});

test('permissions can be reviewed and taken back, from the phone, and are asked about again afterwards', async () => {
  const { core, desk, phone, done } = await rig(47934);
  core.trust.allow('open apps', 'open Paint');
  core.trust.allow('write files', 'write to notes.txt');
  phone.c.send(JSON.stringify({ t: 'trust' })); await wait(100);
  const items = phone.of('trust.reply')[0].items;
  assert.deepEqual(items.map((i: any) => i.kind), ['open apps', 'write files']);
  assert.equal(items[0].example, 'open Paint');

  phone.c.send(JSON.stringify({ t: 'revoke', kind: 'write files' })); await wait(100);
  assert.equal(core.trust.allowed('write files'), false);
  assert.equal(core.trust.allowed('open apps'), true);
  assert.deepEqual(phone.of('trust.reply').at(-1).items.map((i: any) => i.kind), ['open apps'], 'the updated list comes back');
  assert.match(core.actions.text(), /took back a permission: write files/);

  // asked again now
  let asked = 0;
  desk.c.on('message', d => { const m = JSON.parse(String(d)); if (m.t === 'permission') { asked++; desk.c.send(JSON.stringify({ t: 'permission.reply', id: m.id, allow: false })); } });
  const r = await core.changeFile('mcp__aang__write_file', { file: path.join(tmp(), 'x.txt') }, () => ({ ok: true, detail: 'x' }));
  assert.equal(r.ok, false);
  assert.equal(asked, 1, 'it asks again');

  const doers = core.doers();
  assert.match(doers.revoke('open'), /^Done\. I will ask again before I open apps/, 'a piece of the name is enough when it is unique');
  assert.match(doers.revoke('nonsense'), /no permission called "nonsense"/);
  assert.match(doers.permissions(), /not let me do anything without asking/);
  await done();
});

test('hush holds everything unprompted, even what he asked to hear, and delivers it when it ends', async () => {
  const { core, desk, phone, done } = await rig(47936);
  phone.c.send(JSON.stringify({ t: 'hush', minutes: 30 })); await wait(100);
  assert.match(phone.of('hush.reply')[0].text, /^Hushed for 30 minutes \(until [^)]+\)\. I will hold/);
  core.announce('Reminder: stretch');
  core.announce('Need input in Claude on the job hunt.', { asked: true });
  await wait(150);
  assert.equal(desk.of('bubble').length + phone.of('bubble').length, 0, 'nothing got through');
  assert.equal(core.pendingCount, 2);
  phone.c.send(JSON.stringify({ t: 'status' })); await wait(100);
  assert.match(phone.of('status.reply')[0].text, /Hushed \(until /);

  phone.c.send(JSON.stringify({ t: 'hush', minutes: 0 })); await wait(150);
  assert.match(phone.of('hush.reply')[1].text, /Hush is off/);
  assert.equal(desk.of('bubble').length, 1, 'the first held one comes straight away');
  assert.equal(core.pendingCount, 0);
  phone.c.send(JSON.stringify({ t: 'hush', minutes: 0 })); await wait(100);
  assert.match(phone.of('hush.reply')[2].text, /not hushed/);
  await done();
});

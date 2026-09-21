// What goes to his phone: the status card, and the rules for what may leave the machine. No model involved.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { Core } from '../src/core.ts';
import { span, statusText, whyNotSend } from '../src/phone.ts';

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'aang-phone-'));

test('durations read the way he would say them', () => {
  assert.equal(span(30_000), '1 min'.replace('1', '1'));
  assert.equal(span(5 * 60_000), '5 min');
  assert.equal(span(90 * 60_000), '1 h 30 min');
  assert.equal(span(3 * 3600_000), '3 h');
  assert.equal(span(72 * 3600_000), '3 days');
});

test('the status card says what is true, and says so when there is nothing yet', () => {
  const now = new Date('2026-09-21T18:00:00Z');
  const base = { now, startedAt: new Date('2026-09-21T16:00:00Z'), desktop: true, atDesk: false, discord: true, working: false, muted: false, quota: null, claudeSessions: '', reminders: 0 };
  const t = statusText(base);
  assert.match(t, /^Aang is up \(since [^)]+\)\.$/m);
  assert.match(t, /away from it/);
  assert.match(t, /no usage reading yet/);
  assert.match(t, /No Claude Code sessions are running/);
  assert.match(t, /No reminders waiting/);
  const withQuota = statusText({ ...base, atDesk: true, working: true, muted: true, reminders: 2, claudeSessions: 'job hunt is working', quota: { five: 0.12, week: 0.344, fiveResetsAt: now.getTime() / 1000 + 3 * 3600, weekResetsAt: now.getTime() / 1000 + 2 * 86400 } });
  assert.match(withQuota, /at the PC/);
  assert.match(withQuota, /Working on something right now/);
  assert.match(withQuota, /Muted/);
  assert.match(withQuota, /Your week: 34% used, resets in 2 days\. Last 5 hours: 12%, resets in 3 h\./);
  assert.match(withQuota, /Reminders waiting: 2/);
  assert.match(statusText({ ...base, desktop: false }), /not connected/);
});

test('files that hold secrets, and his own settings and memory, are never sent', () => {
  const state = 'C:\\Users\\Shadow\\AppData\\Roaming\\Aang';
  const guard = [state, 'C:\\Users\\Shadow\\Documents\\Aang\\aang.db'];
  for (const f of [
    state + '\\discord.token', state + '\\trust.json', 'C:\\Users\\Shadow\\Documents\\Aang\\aang.db',
    'C:\\Users\\Shadow\\.ssh\\id_ed25519', 'C:\\Users\\Shadow\\.aws\\credentials', 'C:\\proj\\.env', 'C:\\proj\\.env.local', 'C:\\x\\server.pem',
    'C:\\Users\\Shadow\\.claude.json', 'C:\\Users\\Shadow\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Login Data',
    'C:\\Users\\Shadow\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Cookies',
  ]) assert.notEqual(whyNotSend(f, guard), null, f);
  assert.match(whyNotSend('resume.pdf', guard)!, /full path/);
  for (const f of ['C:\\Users\\Shadow\\Documents\\resume.pdf', 'C:\\Users\\Shadow\\Documents\\notes.txt', 'D:\\pics\\holiday.jpg', 'C:\\Users\\Shadow\\Documents\\environment-notes.txt']) {
    assert.equal(whyNotSend(f, guard), null, f);
  }
});

async function desktop(port: number, kind?: 'discord') {
  const core: any = new Core({ port, dataDir: tmp(), stateDir: tmp(), warm: false, consolidate: false });
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
  return { core, desk, phone, kind, done: async () => { desk.c.close(); phone.c.close(); await core.stop(); } };
}

test('status: the Core answers the one who asked, from what it knows, without any model', async () => {
  const { core, desk, phone, done } = await desktop(47960);
  phone.c.send(JSON.stringify({ t: 'status' }));
  await wait(150);
  assert.equal(phone.of('status.reply').length, 1);
  assert.match(phone.of('status.reply')[0].text, /^Aang is up/);
  assert.equal(desk.of('status.reply').length, 0, 'only whoever asked');
  assert.equal(core.lanes.size, 0, 'no model session was even started');
  await done();
});

test('send_to_phone: a file goes only to Discord, after a yes, and a secret is refused before any question', async () => {
  const { core, desk, phone, done } = await desktop(47961);
  const file = path.join(tmp(), 'plan.txt'); writeFileSync(file, 'the plan');
  desk.c.on('message', d => { const m = JSON.parse(String(d)); if (m.t === 'permission') desk.c.send(JSON.stringify({ t: 'permission.reply', id: m.id, allow: true })); });

  const secret = await core.sendToPhone(path.join(core.cfg.stateDir, 'discord.token'));
  assert.equal(secret.ok, false);
  assert.match(secret.detail, /never leave/);
  assert.equal(desk.of('permission').length, 0, 'never asked about a secret');

  const r = await core.sendToPhone(file, 'here');
  assert.equal(r.ok, true);
  await wait(100);
  const a = phone.of('attach');
  assert.equal(a.length, 1);
  assert.deepEqual([a[0].name, a[0].caption, Buffer.from(a[0].data, 'base64').toString()], ['plan.txt', 'here', 'the plan']);
  assert.equal(desk.of('attach').length, 0, 'the desktop is not sent it');
  assert.equal(desk.of('permission').length, 1);
  assert.equal(core.trust.allowed('send to Discord'), true);
  await done();
});

test('send_to_phone: a no sends nothing; a missing file, a folder and a huge file are refused plainly', async () => {
  const { core, desk, phone, done } = await desktop(47962);
  desk.c.on('message', d => { const m = JSON.parse(String(d)); if (m.t === 'permission') desk.c.send(JSON.stringify({ t: 'permission.reply', id: m.id, allow: false })); });
  const file = path.join(tmp(), 'a.txt'); writeFileSync(file, 'x');
  assert.equal((await core.sendToPhone(file)).ok, false);
  assert.equal(phone.of('attach').length, 0);
  assert.match((await core.sendToPhone(path.join(tmp(), 'nope.txt'))).detail, /no file at/);
  assert.match((await core.sendToPhone(tmp())).detail, /folder/);
  const big = path.join(tmp(), 'big.bin'); writeFileSync(big, Buffer.alloc(9 * 1024 * 1024));
  assert.match((await core.sendToPhone(big)).detail, /8 MB/);
  await done();
});

test('send_to_phone with no Discord connected says there is nowhere to send it', async () => {
  const core: any = new Core({ port: 47963, dataDir: tmp(), stateDir: tmp(), warm: false, consolidate: false });
  await core.start();
  const r = await core.sendToPhone('C:\\Users\\Shadow\\Documents\\a.txt');
  assert.match(r.detail, /nowhere to send/);
  await core.stop();
});


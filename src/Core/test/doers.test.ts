import './_env.ts';
// The tools that change things: files (with undo) and windows (close, force quit, move, media).
// Joshua's rules (2026-09-21): writing files and closing apps are asked once and then trusted; force quit asks every
// time; his own settings, memory and Windows are never written, and that is decided before he is ever asked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { Core } from '../src/core.ts';
import { kindOf } from '../src/trust.ts';
import { describeCall, TOOL_NAMES, BUILTIN_WRITE } from '../src/tools.ts';

process.env.AANG_UNDO_DIR = mkdtempSync(path.join(os.tmpdir(), 'aang-undo-'));
const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'aang-doers-'));
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

test('trust kinds: files and windows are asked once, force quit every time', () => {
  assert.equal(kindOf('mcp__aang__write_file', { file: 'C:\\x.txt' })?.kind, 'write files');
  assert.equal(kindOf('mcp__aang__edit_file', { file: 'C:\\x.txt' })?.kind, 'write files');
  assert.equal(kindOf('mcp__aang__undo_file_change', {})?.kind, 'write files');
  assert.equal(kindOf('mcp__aang__close_app', { what: 'chrome' })?.kind, 'close apps');
  assert.equal(kindOf('mcp__aang__arrange_window', { what: 'chrome', how: 'left' })?.kind, 'arrange windows');
  assert.equal(kindOf('mcp__aang__media_key', { key: 'mute' })?.kind, 'control media');
  assert.equal(kindOf('mcp__aang__force_quit', { what: 'chrome' }), null, 'never trusted in advance');
});

test('every new tool is allowed to the model, and the built-in writers are not', () => {
  for (const t of ['write_file', 'edit_file', 'undo_file_change', 'close_app', 'force_quit', 'arrange_window', 'media_key']) {
    assert.ok(TOOL_NAMES.includes('mcp__aang__' + t), t);
  }
  assert.deepEqual(BUILTIN_WRITE, ['Write', 'Edit', 'NotebookEdit']);
});

test('the question says what will happen, and force quit says what it costs', () => {
  assert.match(describeCall('mcp__aang__force_quit', { what: 'chrome' }), /FORCE QUIT chrome.*unsaved/);
  assert.match(describeCall('mcp__aang__close_app', { what: 'spotify' }), /^close spotify$/);
  assert.match(describeCall('mcp__aang__write_file', { file: 'C:\\a\\b\\c\\notes.txt' }), /^write to …\/c\/notes\.txt$/);
});

async function withCore(port: number, fn: (core: any, desk: { c: WebSocket; inbox: any[] }) => Promise<void>) {
  const core: any = new Core({ port, dataDir: tmp(), stateDir: tmp(), warm: false, consolidate: false });
  await core.start();
  const c = new WebSocket(`ws://127.0.0.1:${port}/body`);
  const inbox: any[] = [];
  c.on('message', d => inbox.push(JSON.parse(String(d))));
  await new Promise<void>(r => c.once('open', () => r()));
  try { await fn(core, { c, inbox }); } finally { c.close(); await core.stop(); }
}

test('writing a file asks once, and the second write is trusted', async () => {
  await withCore(47996, async (core, desk) => {
    const file = path.join(tmp(), 'notes.txt');
    writeFileSync(file, 'one');
    // He answers the first question with yes.
    desk.c.on('message', d => { const m = JSON.parse(String(d)); if (m.t === 'permission') desk.c.send(JSON.stringify({ t: 'permission.reply', id: m.id, choice: 'always' })); });
    const r1 = await core.changeFile('mcp__aang__write_file', { file }, () => ({ ok: true, detail: 'x' }));
    assert.equal(r1.ok, true);
    assert.equal(desk.inbox.filter(m => m.t === 'permission').length, 1);
    assert.equal(core.trust.allowed('write files'), true);
    await core.changeFile('mcp__aang__write_file', { file }, () => ({ ok: true, detail: 'x' }));
    assert.equal(desk.inbox.filter(m => m.t === 'permission').length, 1, 'trusted now: not asked again');
  });
});

test('his settings, memory and Windows are refused without ever asking him', async () => {
  await withCore(47997, async (core, desk) => {
    for (const file of [path.join(core.cfg.stateDir, 'trust.json'), path.join(core.cfg.dataDir, 'aang.db'), 'C:\\Windows\\System32\\drivers\\etc\\hosts', 'relative.txt']) {
      const r = await core.changeFile('mcp__aang__write_file', { file }, () => { throw new Error('must not run'); });
      assert.equal(r.ok, false, file);
      assert.match(r.detail, /^Not done:/);
    }
    assert.equal(desk.inbox.filter(m => m.t === 'permission').length, 0, 'never asked');
  });
});

test('after reading outside content, a remembered yes is not used to write a file', async () => {
  await withCore(47998, async (core, desk) => {
    core.trust.allow('write files', 'test');
    core.tainted = true;
    let asked = 0;
    desk.c.on('message', d => { const m = JSON.parse(String(d)); if (m.t === 'permission') { asked++; desk.c.send(JSON.stringify({ t: 'permission.reply', id: m.id, choice: 'no' })); } });
    const file = path.join(tmp(), 'leak.txt');
    const r = await core.changeFile('mcp__aang__write_file', { file }, () => { writeFileSync(file, 'x'); return { ok: true, detail: 'x' }; });
    assert.equal(r.ok, false);
    assert.equal(asked, 1, 'asked again');
    assert.equal(existsSync(file), false);
  });
});

test('windows: the request reaches the desktop, its answer comes back, and force quit asks even when trusted', async () => {
  await withCore(47999, async (core, desk) => {
    core.trust.allow('close apps', 'test');
    desk.c.on('message', d => {
      const m = JSON.parse(String(d));
      if (m.t === 'hands.request') desk.c.send(JSON.stringify({ t: 'hands', id: m.id, ok: true, detail: `did ${m.action} ${m.what}` }));
      if (m.t === 'permission') desk.c.send(JSON.stringify({ t: 'permission.reply', id: m.id, choice: 'no' }));
    });
    const closed = await core.hands('close', 'notepad');
    assert.deepEqual(closed, { ok: true, detail: 'did close notepad' });
    assert.equal(desk.inbox.filter(m => m.t === 'permission').length, 0, 'close was trusted');

    const quit = await core.hands('forcequit', 'notepad');
    assert.equal(quit.ok, false, 'he said no');
    assert.equal(desk.inbox.filter(m => m.t === 'permission').length, 1, 'force quit asked');
    assert.equal(desk.inbox.filter(m => m.t === 'hands.request').length, 1, 'and was never sent');
  });
});

test('with no desktop connected, a window action says so instead of hanging', async () => {
  const core: any = new Core({ port: 47990, dataDir: tmp(), stateDir: tmp(), warm: false, consolidate: false });
  await core.start();
  core.trust.allow('close apps', 'test');
  const r = await core.hands('close', 'notepad');
  assert.equal(r.ok, false);
  assert.match(r.detail, /not connected/);
  await core.stop();
  assert.ok(readFileSync);
});

// P1 (2026-11-17): Samara on its own on the PC. main.ts follows the pet's answer only; a quit or an update leaves a mark;
// Aang tells him about a Samara that is gone without one (his call: it stays closed), and never about one he never saw.
// The connector on the PC starts Samara through the pet's launcher, and says so plainly when there is none.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { SamaraWatch, launcherEnv, readExitMark, samaraApart, samaraLauncher, writeExitMark } from '../src/samaramode.ts';
import { askFrom } from '../pages/asks.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

test('main.ts goes apart only when the pet says so', () => {
  assert.equal(samaraApart({ AANG_SAMARA_APART: '1' }), true);
  assert.equal(samaraApart({ AANG_SAMARA_APART: '0' }), false);
  // An older pet says nothing: the old setup, where main.ts holds the browser.
  assert.equal(samaraApart({}), false);
});

test('the launcher decides afresh: our copy of the answer is not passed on', () => {
  const e = launcherEnv({ AANG_SAMARA_APART: '1', PATH: 'x' });
  assert.equal(e.AANG_SAMARA_APART, undefined);
  assert.equal(e.PATH, 'x');
});

test('phase 5: Samara.exe starts Samara when it is known, else the pet\'s Aang.exe, never a missing or odd file', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'launcher-'));
  const there = new Set(['C:\\s\\Samara.exe', 'C:\\a\\Aang.exe']);
  const exists = (f: string) => there.has(f);
  assert.equal(samaraLauncher(dir, exists), null);
  writeFileSync(path.join(dir, 'body-exe.txt'), 'C:\\a\\Aang.exe');
  assert.equal(samaraLauncher(dir, exists), 'C:\\a\\Aang.exe');
  writeFileSync(path.join(dir, 'samara-exe.txt'), 'C:\\s\\Samara.exe\r\n');
  assert.equal(samaraLauncher(dir, exists), 'C:\\s\\Samara.exe');
  writeFileSync(path.join(dir, 'samara-exe.txt'), 'C:\\gone\\Samara.exe');
  assert.equal(samaraLauncher(dir, exists), 'C:\\a\\Aang.exe', 'a Samara.exe that moved: the pet\'s launcher');
  writeFileSync(path.join(dir, 'samara-exe.txt'), 'C:\\s\\Samara.cmd');
  assert.equal(samaraLauncher(dir, (f) => f.endsWith('.cmd') || exists(f)), 'C:\\a\\Aang.exe', 'only an .exe');
});

test('the clean-exit mark round-trips, and a bad one is nothing', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'samaramode-'));
  assert.equal(readExitMark(dir), null);
  writeExitMark(dir, 4242, 'update');
  assert.deepEqual(readExitMark(dir), { pid: 4242, how: 'update' });
  writeFileSync(path.join(dir, 'samara-exit.json'), '{"pid":"x","how":"quit"}');
  assert.equal(readExitMark(dir), null);
});

function watcher() {
  const live = new Set<number>();
  let pidFile: number | null = null, mark: { pid: number } | null = null;
  const told: number[] = [];
  const w = new SamaraWatch({ pid: () => pidFile, alive: (p) => live.has(p), mark: () => mark, crashed: (p) => told.push(p) });
  return { w, told, live, set: (p: number | null) => { pidFile = p; }, mark: (p: number | null) => { mark = p === null ? null : { pid: p }; } };
}

test('a Samara seen running that is gone without its mark is told, once', () => {
  const s = watcher();
  s.set(10); s.live.add(10); s.w.tick();
  s.live.delete(10); s.w.tick(); s.w.tick();
  assert.deepEqual(s.told, [10]);
});

test('a quit or an update (its mark) is not a crash', () => {
  const s = watcher();
  s.set(10); s.live.add(10); s.w.tick();
  s.live.delete(10); s.set(null); s.mark(10); s.w.tick();
  assert.deepEqual(s.told, []);
});

test('a mark from an older Samara does not cover this one', () => {
  const s = watcher();
  s.mark(9); s.set(10); s.live.add(10); s.w.tick();
  s.live.delete(10); s.w.tick();
  assert.deepEqual(s.told, [10]);
});

test('a Samara restarted in its place (a new pid) is followed, not told', () => {
  const s = watcher();
  s.set(10); s.live.add(10); s.w.tick();
  s.live.delete(10); s.set(11); s.live.add(11); s.w.tick();
  assert.deepEqual(s.told, []);
});

test('a Samara that closed before Aang started says nothing', () => {
  const s = watcher();
  s.set(10); s.w.tick(); s.w.tick();
  assert.deepEqual(s.told, []);
});

test('the bubble card: Samara closed unexpectedly, Reopen or Not now', () => {
  const a = askFrom({ t: 'samara.down', id: 'samara-down-10' });
  assert.equal(a?.question, 'Samara closed unexpectedly.');
  assert.deepEqual(a?.keys.map((k) => `${k.label}${k.key}${k.choice}`), ['ReopenAreopen', 'Not nowZno']);
});

test('the connector on the PC, with Samara off and no launcher, says so plainly', { skip: process.platform !== 'win32' }, async () => {
  // A door file naming a port nothing listens on, and no body-exe.txt beside it.
  const file = path.join(mkdtempSync(path.join(os.tmpdir(), 'door-nolaunch-')), 'claude-door.json');
  writeFileSync(file, JSON.stringify({ port: 9, key: 'k' }));
  const c = spawn(process.execPath, [path.join(HERE, '..', 'src', 'claude-door-mcp.mjs')], { env: { ...process.env, AANG_DOOR_FILE: file }, stdio: ['pipe', 'pipe', 'ignore'] });
  try {
    const got = new Promise<any>((ok) => readline.createInterface({ input: c.stdout! }).on('line', (l) => { try { const m = JSON.parse(l); if (m.id === 1) ok(m); } catch { /* not ours */ } }));
    c.stdin!.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'browser_history', arguments: { query: 'x' } } }) + '\n');
    const text = ((await got).result?.content ?? []).map((x: any) => x.text).join('\n');
    assert.match(text, /launcher was not found/);
    assert.doesNotMatch(text, /start Aang/);
  } finally { c.kill(); }
});

// Reading what is in a window: the parts that do not need a real window.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { lastAnswer, looksVisual, readWindow, READER } from '../src/screen.ts';
import { ActivityLog } from '../src/activity.ts';
import { kindOf } from '../src/trust.ts';
import { describeCall } from '../src/tools.ts';

test('the last complete answer the reader printed is the one kept', () => {
  const out = [
    '{"ok":true,"kind":"document","app":"MozillaWindowClass","text":"whole page","nodes":89,"ms":300}',
    '{"ok":true,"kind":"visible","app":"MozillaWindowClass","text":"the part on screen","nodes":89,"ms":420}',
  ].join('\r\n');
  assert.equal(lastAnswer(out)?.kind, 'visible');
});

test('a line cut off by a crash does not throw away the answer before it', () => {
  // The reason the reader is a separate process: a UI Automation call can crash it part way.
  const out = '{"ok":true,"kind":"document","app":"Notepad","text":"const x = 1","nodes":9,"ms":200}\n{"ok":true,"kind":"vis';
  assert.equal(lastAnswer(out)?.text, 'const x = 1');
  assert.equal(lastAnswer(''), null);
  assert.equal(lastAnswer('Fatal error.\n0xC0000005'), null);
});

test('games and streaming video are known to be pictures, not text', () => {
  assert.equal(looksVisual('WowB', 'World of Warcraft'), 'game');
  assert.equal(looksVisual('firefox', 'Daemons S1E7 - Netflix — Mozilla Firefox'), 'video');
  assert.equal(looksVisual('firefox', 'CN Tower - Wikipedia — Mozilla Firefox'), null);
  assert.equal(looksVisual('notepad', 'core.ts - Notepad'), null);
});

test('the window handle is kept, and updated when the same window comes back with a new one', () => {
  const a = new ActivityLog();
  a.record('notepad', 'core.ts - Notepad', 1000, 330486);
  assert.equal(a.current()?.hwnd, 330486);
  a.record('notepad', 'core.ts - Notepad', 2000, 555);          // same title, window reopened
  assert.equal(a.current()?.hwnd, 555);
  a.record('Aang', '', 3000, 999);                               // his own window never replaces it
  assert.equal(a.current()?.hwnd, 555);
});

test('reading windows is one kind of thing he says yes to once, in plain words', () => {
  assert.deepEqual(kindOf('mcp__aang__read_window', { app: 'firefox (CN Tower - Wikipedia)' }), { kind: 'read windows', says: 'read what is in your windows' });
  assert.equal(describeCall('mcp__aang__read_window', { app: 'notepad (core.ts - Notepad)' }), 'read what is in notepad (core.ts - Notepad)');
});

test('a window that is gone gives a plain failure, not a hang', { timeout: 15_000 }, async () => {
  if (!existsSync(READER)) { console.log('      (reader not built: skipped)'); return; }
  const t0 = Date.now();
  const r = await readWindow(0x7ffffff0, 'no such window');
  assert.equal(r.ok, false);
  assert.ok(Date.now() - t0 < 6000, `answered in ${Date.now() - t0} ms`);
});

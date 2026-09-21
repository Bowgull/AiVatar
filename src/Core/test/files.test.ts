import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = (p: string) => mkdtempSync(path.join(os.tmpdir(), p));
process.env.AANG_UNDO_DIR = tmp('aang-undo-');
const { editExact, refusal, undoLast, writeWhole } = await import('../src/files.ts');

const guard = { stateDir: tmp('aang-state-'), dataDir: tmp('aang-data-') };

test('a new file is created, an existing one is replaced, and both say which happened', () => {
  const f = path.join(tmp('aang-files-'), 'notes', 'raid.txt');
  assert.match(writeWhole(f, 'tuesday\n', guard).detail, /^Created/);
  assert.equal(readFileSync(f, 'utf8'), 'tuesday\n');
  assert.match(writeWhole(f, 'wednesday\n', guard).detail, /can be undone/);
  assert.equal(readFileSync(f, 'utf8'), 'wednesday\n');
});

test('an edit replaces exactly one piece of text, or nothing at all', () => {
  const f = path.join(tmp('aang-files-'), 'a.ts');
  writeFileSync(f, 'const a = 1;\nconst b = 1;\n');
  assert.equal(editExact(f, 'const a = 1;', 'const a = 2;', guard).ok, true);
  assert.equal(readFileSync(f, 'utf8'), 'const a = 2;\nconst b = 1;\n');
  const twice = editExact(f, 'const', 'let', guard);
  assert.equal(twice.ok, false); assert.match(twice.detail, /2 times/);
  const missing = editExact(f, 'const c', 'x', guard);
  assert.equal(missing.ok, false); assert.match(missing.detail, /not in the file/);
  assert.equal(readFileSync(f, 'utf8'), 'const a = 2;\nconst b = 1;\n', 'a failed edit changes nothing');
});

test('a Windows file with CRLF endings is matched from text written with plain newlines', () => {
  const f = path.join(tmp('aang-files-'), 'crlf.txt');
  writeFileSync(f, 'line one\r\nline two\r\nline three\r\n');
  assert.equal(editExact(f, 'line one\nline two', 'line 1\nline 2', guard).ok, true);
  assert.equal(readFileSync(f, 'utf8'), 'line 1\r\nline 2\r\nline three\r\n', 'and the file keeps its own line endings');
});

test('every change can be undone, one step at a time', () => {
  const f = path.join(tmp('aang-files-'), 'u.txt');
  writeFileSync(f, 'v1');
  writeWhole(f, 'v2', guard);
  writeWhole(f, 'v3', guard);
  assert.equal(undoLast(f).ok, true); assert.equal(readFileSync(f, 'utf8'), 'v2');
  assert.equal(undoLast(f).ok, true); assert.equal(readFileSync(f, 'utf8'), 'v1');
  assert.equal(undoLast(f).ok, false, 'and then there is nothing further back');
});

test('his own permissions, his memory and Windows are never his to write', () => {
  assert.match(refusal(path.join(guard.stateDir, 'trust.json'), guard)!, /permissions/);
  assert.match(refusal(path.join(guard.dataDir, 'aang.db'), guard)!, /memory/);
  assert.match(refusal('C:\\Windows\\System32\\drivers\\etc\\hosts', guard)!, /Windows/);
  assert.match(refusal('C:\\Program Files\\Google\\Chrome\\x.txt', guard)!, /installed program/);
  assert.match(refusal('notes.txt', guard)!, /full path/);
  const trust = path.join(guard.stateDir, 'trust.json');
  assert.equal(writeWhole(trust, '{"run rm": {}}', guard).ok, false);
  assert.equal(existsSync(trust), false, 'nothing was written');
  assert.equal(refusal(path.join(os.homedir(), 'Documents', 'notes.txt'), guard), null, 'his own documents are fine');
});

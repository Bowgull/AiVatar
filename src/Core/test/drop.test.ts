// 6.17: what a dropped file may be. The refusals are the point: plain, and no override.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { checkDrop, firstPart, summaryPrompt } from '../src/drop.ts';

const dir = mkdtempSync(path.join(tmpdir(), 'drop-'));
const own = path.join(dir, 'aang-state');
mkdirSync(own);
const make = (name: string, body = 'hello') => { const f = path.join(dir, name); writeFileSync(f, body); return f; };

test('an ordinary file may be read, and its start is what Qwen sees', () => {
  const f = make('notes.md', '# Raid night\nBring flasks.');
  assert.equal(checkDrop(f, own).ok, true);
  assert.match(String(firstPart(f)), /Raid night/);
  assert.equal(firstPart(make('offer.pdf')), null, 'a PDF is not read as text');
  assert.match(summaryPrompt('offer.pdf', 212, null), /only the name/i);
});

test('keys, .env and his own memory are refused outright', () => {
  for (const name of ['.env', 'id_rsa', 'server.pem', 'vault.kdbx']) {
    const c = checkDrop(make(name), own);
    assert.equal(c.ok, false, name);
    assert.ok(c.why && c.why.length > 10, 'with a plain reason');
  }
  const mem = path.join(own, 'aang.db'); writeFileSync(mem, 'x');
  assert.equal(checkDrop(mem, own).ok, false, 'his memory is not something to drop');
});

test('a folder is recognised as a folder', () => {
  const d = path.join(dir, 'WoW guide notes'); mkdirSync(d);
  assert.equal(checkDrop(d, own).kind, 'folder');
});

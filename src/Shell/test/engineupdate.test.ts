// 6.28 the update key: which engine is offered, and the fingerprint check.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newer, pick, shaFor } from '../src/engineupdate.ts';

test('only a newer plain release of the same major is offered, never one that failed before', () => {
  const all = ['44.5.1', '44.7.0', '44.8.0', '44.8.1', '44.9.0-beta.2', '45.0.0', '43.9.9'];
  assert.equal(pick(all, '44.7.0', new Set()), '44.8.1');
  assert.equal(pick(all, '44.7.0', new Set(['44.8.1'])), '44.8.0');
  assert.equal(pick(all, '44.8.1', new Set()), null, 'a new major (45) is never prepared by itself');
  assert.equal(pick(['44.10.0', '44.9.0'], '44.8.1', new Set()), '44.10.0', 'numbers, not letters');
  assert.ok(newer('44.10.0', '44.9.9') && !newer('44.7.0', '44.7.0'));
});

test('the zip must match the hash Electron lists for exactly that file', () => {
  const list = 'aaaa'.repeat(16) + ' *electron-v44.8.1-win32-ia32.zip\n' + 'BBBB'.repeat(16) + ' *electron-v44.8.1-win32-x64.zip\n';
  assert.equal(shaFor(list, 'electron-v44.8.1-win32-x64.zip'), 'bbbb'.repeat(16));
  assert.equal(shaFor(list, 'electron-v44.8.1-win32-arm64.zip'), null);
});

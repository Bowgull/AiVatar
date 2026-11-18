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

// Phase 2 (2026-11-17): blocking and look checks, a failure remembered for the day, and the security tier.
import { LOOK_ONLY, dayOf, failedToday, readRun } from '../src/engineupdate.ts';
import { closesGap } from '../src/enginerelease.ts';

test('only blocking checks stop an engine; look failures are kept for the key', () => {
  const out = 'ENGINE chrome=142.0.7444.59 electron=44.11.4 castlabs=false\nPASS  a public page loads\nFAIL  [look] hovering it says what it is, briefly  -- Update ready\nFAIL  [look] after 3 days it is red\n\n27/29 passed (0 blocking, 2 look)\n';
  assert.deepEqual(readRun(LOOK_ONLY, out), { ok: true, look: ['hovering it says what it is, briefly', 'after 3 days it is red'], chrome: '142.0.7444.59' });
  assert.equal(readRun(1, 'FAIL  a public page loads\n').ok, false, 'a blocking failure');
  assert.equal(readRun(null, '').ok, false, 'it could not start');
  assert.equal(readRun(3, 'HARNESS TIMEOUT').ok, false, 'it hung');
  assert.equal(readRun(0, 'ALL PASS').ok, true);
});

test('a version that failed today is not tested again until tomorrow', () => {
  const list = '44.11.4 2026-11-17\n44.9.9 2026-11-16\n';
  assert.ok(failedToday(list, '44.11.4', '2026-11-17'));
  assert.ok(failedToday(list, '44.11.4+wvcus', '2026-11-17'), 'a build tag is the same version');
  assert.ok(!failedToday(list, '44.11.4', '2026-11-18'), 'tomorrow it is tried again');
  assert.ok(!failedToday(list, '44.9.9', '2026-11-17'));
  assert.equal(dayOf(new Date(2026, 10, 7, 23, 59)), '2026-11-07', 'his own date, not UTC');
});

test('security tier: a newer engine that closes a gap in Chrome\'s security fixes', () => {
  const stable = [{ version: '142.0.7444.59', time: 1 }, { version: '142.0.7444.134', time: 2 }, { version: '142.0.7444.175', time: 3 }];
  assert.ok(closesGap('142.0.7444.59', '142.0.7444.134', stable), 'it carries a Chrome release the running engine lacks');
  assert.ok(closesGap('140.0.7339.80', '142.0.7444.200', stable));
  assert.ok(!closesGap('142.0.7444.175', '142.0.7444.200', stable), 'nothing to close: already up to date');
  assert.ok(!closesGap('142.0.7444.59', '142.0.7444.100', stable), 'newer, but still short of the next Chrome fix');
  assert.ok(!closesGap('142.0.7444.59', '142.0.7444.175', []), 'Chrome\'s list could not be read');
  assert.ok(!closesGap('142.0.7444.59', '', stable), 'the engine\'s Chromium is not known');
});

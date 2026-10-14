// Samara's engine switches: our dependency-free code agrees with Electron's own @electron/fuses, on a copy of the
// real castLabs engine (the engine in use is never touched).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { readFuses, samaraFuses, setFuses, FUSE } from '../src/fusewire.ts';

const exe = path.join(import.meta.dirname, '..', 'engines', 'castlabs-44.5.1', 'electron.exe');
test('the login lock and closed backdoors, set the way Electron itself reads them', async (t) => {
  const copy = path.join(mkdtempSync(path.join(os.tmpdir(), 'fuse-')), 'electron.exe');
  try { copyFileSync(exe, copy); } catch { t.skip('no engine here'); return; }
  const before = readFuses(copy);
  assert.equal(before[FUSE.EnableCookieEncryption], '0', 'the lock is off in a stock engine');
  const after = setFuses(copy, samaraFuses({ lock: true, closeBackdoors: true }));
  assert.equal(after.slice(0, 4), '0100', 'run-as-Node off, lock on, NODE_OPTIONS off, inspector off');
  assert.equal(after.slice(4), before.slice(4), 'nothing else touched');
  const { getCurrentFuseWire } = createRequire(import.meta.url)('@electron/fuses');
  const official = await getCurrentFuseWire(copy);
  assert.equal(official[1], 0x31); assert.equal(official[0], 0x30); assert.equal(official[2], 0x30); assert.equal(official[3], 0x30);
  assert.equal(setFuses(copy, samaraFuses({ lock: false, closeBackdoors: true })).slice(0, 4), '0000', 'and he can leave the lock off');
});

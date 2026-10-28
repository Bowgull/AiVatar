// The Mac's own key and system places (2026-10-28). Before this, the safety rules only knew Windows paths, so on the
// MacBook Aang's settings folder, the Keychain, Chrome's profile and macOS itself were not guarded.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { offLimits, refusal } = await import('../src/files.ts');
const mac = process.platform === 'darwin';
const home = os.homedir();
const guard = { stateDir: mkdtempSync(path.join(os.tmpdir(), 'aang-state-')), dataDir: mkdtempSync(path.join(os.tmpdir(), 'aang-data-')) };

test('on the Mac, keys are never read: his settings, the Keychain, browser profiles', { skip: !mac && 'Mac only' }, () => {
  for (const p of [
    'Library/Application Support/Aang/Cookies',
    'Library/Application Support/AangListener/discord.token',
    'Library/Keychains/login.keychain-db',
    'Library/Application Support/Google/Chrome/Default/Login Data',
    'Library/Application Support/Firefox/Profiles/x.default/logins.json',
  ]) assert.ok(offLimits(path.join(home, p)), `${p} must be off limits`);
});

test('on the Mac, macOS, installed programs and start-up places are never written', { skip: !mac && 'Mac only' }, () => {
  for (const p of ['/System/Library/x', '/Applications/Samara.app/Contents/Info.plist', '/usr/local/bin/node', '/private/etc/hosts',
    path.join(home, 'Library/LaunchAgents/com.evil.plist'), path.join(home, '.zshrc'), path.join(home, 'projects/AiVatar/src/Core/src/files.ts')])
    assert.ok(refusal(p, guard), `${p} must be refused`);
});

test('on the Mac, his own files and temp files can still be written', { skip: !mac && 'Mac only' }, () => {
  assert.equal(refusal(path.join(home, 'Documents', 'notes.txt'), guard), null);
  assert.equal(refusal(path.join(os.tmpdir(), 'scratch.txt'), guard), null);
});

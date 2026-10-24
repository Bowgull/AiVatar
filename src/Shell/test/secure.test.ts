import { test } from 'node:test';
import assert from 'node:assert/strict';
import { failureWords, isLocal, isRisky, upgrade } from '../src/secure.ts';

test('plain web addresses are tried secure first', () => {
  const none = new Set<string>();
  assert.equal(upgrade('http://example.com/a?b=1', none), 'https://example.com/a?b=1');
  assert.equal(upgrade('http://www.wowhead.com:80/', none), 'https://www.wowhead.com/');
  assert.equal(upgrade('http://8.8.8.8/', none), 'https://8.8.8.8/');
});

test('his own network, secure pages, odd ports and sites he allowed are left alone', () => {
  const ok = new Set(['old.example.org']);
  for (const u of ['https://example.com/', 'http://192.168.1.1/', 'http://10.0.0.5/admin', 'http://router/', 'http://localhost:5173/',
    'http://nas.local/', 'http://[::1]/', 'http://172.20.1.1/', 'http://example.com:8080/', 'http://old.example.org/page']) assert.equal(upgrade(u, ok), null, u);
  assert.equal(isLocal('172.32.0.1'), false);
  assert.equal(isLocal('google.com'), false);
});

test('programs and scripts are risky, documents and pictures are not', () => {
  for (const f of ['setup.exe', 'Installer.MSI', 'run.bat', 'x.ps1', 'game.iso', 'a.tar.js']) assert.equal(isRisky(f), true, f);
  for (const f of ['resume.pdf', 'photo.jpg', 'notes.txt', 'exe', 'readme']) assert.equal(isRisky(f), false, f);
  // 2026-10-24 (security check, finding 8): a zip can carry an app or a program, so it asks like one.
  assert.equal(isRisky('music.zip'), true);
});

test('failed pages say what happened in plain words', () => {
  assert.match(failureWords(-106, 'x.com').title, /offline/);
  assert.equal(failureWords(-202, 'x.com').retry, false);
  assert.match(failureWords(-999, '').text, /this address/);
});

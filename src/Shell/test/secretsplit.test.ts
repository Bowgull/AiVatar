// The secret window as its own program on the Mac (his pick, 2026-11-19). These pin the split: the app's front door picks
// one program, normal Samara only starts the secret one (and never builds it), the secret program has its own data folder
// and lock, its media controls off, no log, and no line back to normal Samara.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SECRET_APP_DIR, SECRET_FLAG, isSecretRun } from '../src/secretguard.ts';
import { launchSecret, moveProfile, secretArgs } from '../src/secretlaunch.ts';

const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
const code = (f: string) => src(f).replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

test('the flag picks the secret program, on the Mac only', () => {
  assert.equal(SECRET_FLAG, '--samara-secret');
  assert.equal(isSecretRun(['/A/Aang', SECRET_FLAG], 'darwin'), true);
  assert.equal(isSecretRun(['/A/Aang'], 'darwin'), false);
  assert.equal(isSecretRun(['C:/Samara.exe', SECRET_FLAG], 'win32'), false, 'never on the PC, even asked');
  const door = code('macmain.ts');
  assert.match(door, /if \(isSecretRun\(process\.argv, process\.platform\)\) await import\('\.\/secretmain\.ts'\);\s*else await import\('\.\/macsamara\.ts'\);/);
  assert.ok(!/from '\.\/(macsamara|secretmain|browser)\.ts'/.test(door), 'the front door loads neither program up front');
});

test('normal Samara only starts it: the same app, the flag, detached, nothing passed back and forth', () => {
  assert.deepEqual(secretArgs(['/A/Aang.app/Contents/MacOS/Aang', '-psn_0_123']), [SECRET_FLAG]);
  assert.deepEqual(secretArgs(['/x/electron', 'src/macmain.ts', SECRET_FLAG]), ['src/macmain.ts', SECRET_FLAG], 'a dev run keeps its entry, never a doubled flag');
  const calls: any[] = [];
  const start: any = (exec: string, args: string[], o: any) => { calls.push({ exec, args, o }); const c: any = new EventEmitter(); c.unref = () => { c.unrefd = true; }; calls.push(c); return c; };
  assert.equal(launchSecret({ platform: 'darwin', exec: '/A/Aang', argv: ['/A/Aang'], start }), true);
  assert.deepEqual(calls[0], { exec: '/A/Aang', args: [SECRET_FLAG], o: { detached: true, stdio: 'ignore' } });
  assert.equal(calls[1].unrefd, true, 'normal Samara does not wait on it');
  assert.equal(launchSecret({ platform: 'win32', start }), false, 'never on the PC');
  assert.equal(calls.length, 2);
  const normal = code('macsamara.ts');
  assert.match(normal, /secretLaunch: \(\) => launchSecret\(\)/);
  assert.ok(!/secretmain|SealedDir|SecretLogins|aang-secret/.test(normal), 'nothing of the secret window in normal Samara');
});

test('the secret program: its own data folder and lock, same Keychain name, media off, no log, no line out', () => {
  const s = code('secretmain.ts');
  const order = ["app.setName('Aang')", "app.setPath('userData', MINE)", "app.commandLine.appendSwitch('disable-features', MAC_MEDIA_OFF)", 'moveProfile(AANG, MINE)', 'app.requestSingleInstanceLock()', 'app.whenReady()'];
  let at = -1;
  for (const w of order) { const i = s.indexOf(w); assert.ok(i > at, `${w} in order`); at = i; }
  assert.match(s, /const MINE = path\.join\(AANG, SECRET_APP_DIR\)/);
  assert.equal(SECRET_APP_DIR, 'secret-app');
  assert.match(s, /console\.log = \(\) => \{\}; console\.info = \(\) => \{\}; console\.warn = \(\) => \{\}; console\.error = \(\) => \{\};/);
  assert.match(s, /stateDir: path\.join\(AANG, 'secret'\), sharedDir: AANG, secret: true/);
  assert.match(s, /app\.on\('second-instance', \(\) => s\.open\(\)\)/);
  assert.match(s, /s\.onLastClosed = end;/, 'closing its window ends the program');
  assert.match(s, /s\.whenSaved\(\)\.then\(\(\) => \{ saved = true; pages\.close\(\); app\.quit\(\); \}\)/, 'only once its last save is written and its folder shut');
  for (const bad of ['claudedoor', 'bsync', 'plandoor', 'link.ts', "'ws'", 'popout', 'drmrunner', 'sendtoaang', 'mockupdoor', 'boot.ts', 'openLog', 'WebSocket', 'startSync', 'onSendToAang', 'onAskClaude', 'net.fetch'])
    assert.ok(!s.includes(bad), `the secret program has no ${bad}`);
});

test('its kept profile moves once from where normal Samara held it, never over one already there', () => {
  const aang = mkdtempSync(path.join(os.tmpdir(), 'split-')), mine = path.join(aang, SECRET_APP_DIR);
  const old = path.join(aang, 'Partitions', 'aang-secret');
  mkdirSync(old, { recursive: true }); writeFileSync(path.join(old, 'Cookies'), 'c');
  assert.equal(moveProfile(aang, mine), true);
  assert.ok(!existsSync(old));
  assert.equal(readFileSync(path.join(mine, 'Partitions', 'aang-secret', 'Cookies'), 'utf8'), 'c');
  mkdirSync(old, { recursive: true });
  assert.equal(moveProfile(aang, mine), false, 'the one already moved wins');
  assert.equal(moveProfile(mkdtempSync(path.join(os.tmpdir(), 'split-')), mine), false, 'nothing to move');
});

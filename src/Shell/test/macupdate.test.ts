import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { macUpdateScript } from '../src/macupdate.ts';

const ok = { bundle: "/Users/x/Library/Application Support/AangListener/browser/github/samara-1.0.0.tgz", version: '1.0.0', commit: 'a'.repeat(40) };

test('only a release makes a script', () => {
  assert.throws(() => macUpdateScript({ ...ok, version: '1.0' }));
  assert.throws(() => macUpdateScript({ ...ok, version: '1.0.0; rm -rf ~' }));
  assert.throws(() => macUpdateScript({ ...ok, commit: 'abc' }));
  assert.throws(() => macUpdateScript({ ...ok, bundle: '/tmp/x.sh' }));
});

test('the script is valid bash, and a path with spaces or a quote stays one word', () => {
  const s = macUpdateScript({ ...ok, bundle: "/tmp/it's here/samara-1.0.0.tgz" });
  const f = path.join(mkdtempSync(path.join(os.tmpdir(), 'mu-')), 'u.sh');
  writeFileSync(f, s);
  execFileSync('bash', ['-n', f]);
  assert.match(s, /BUNDLE='\/tmp\/it'\\''s here\/samara-1\.0\.0\.tgz'/);
  assert.match(s, /"status":"trial"/);
});

test('a phase it does not know does nothing', () => {
  const f = path.join(mkdtempSync(path.join(os.tmpdir(), 'mu-')), 'u.sh');
  writeFileSync(f, macUpdateScript(ok));
  let code = 0; try { execFileSync('bash', [f, 'post'], { stdio: 'ignore' }); } catch (e) { code = (e as { status: number }).status; }
  assert.equal(code, 2);
});

// Oct 29 on his Mac: `open -a` said -600 while the old Samara was still closing, and Samara never came back.
test('when macOS will not open Samara, its own program is started instead, and the script goes on', () => {
  const s = macUpdateScript(ok);
  const fn = s.slice(s.indexOf('launch() {'), s.indexOf('running() {'));
  const d = mkdtempSync(path.join(os.tmpdir(), 'mu-'));
  const app = path.join(d, 'Samara.app'), mark = path.join(d, 'started');
  execFileSync('mkdir', ['-p', path.join(app, 'Contents/MacOS')]);
  writeFileSync(path.join(app, 'Contents/MacOS/Electron'), `#!/bin/bash\ntouch '${mark}'\n`, { mode: 0o755 });
  const out = execFileSync('bash', ['-c', `open() { return 1; }; sleep() { :; }; APP='${app}'\n${fn}\nlaunch; echo after`]).toString();
  assert.match(out, /after/);
  for (let i = 0; i < 50 && !existsSync(mark); i++) execFileSync('bash', ['-c', 'command sleep 0.1']);
  assert.ok(existsSync(mark), 'the program itself was started');
});

test('the old Samara is closed for sure before its insides move, and every reopen goes through launch', () => {
  const s = macUpdateScript(ok);
  assert.ok(s.indexOf('pkill -KILL') < s.indexOf('mv "$APP/Contents"'));
  assert.equal(s.match(/^\s*open -a "\$APP"\s*$/gm), null);
  assert.doesNotMatch(s, /trap 'open -a/);
});

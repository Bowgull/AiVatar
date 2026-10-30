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

// Oct 30 on his Mac: the new Samara took ~50 s to appear under load, the check at 40 s saw nothing and put it back.
test('a slow start is kept; only a start that dies, or none at all in four minutes, goes back', () => {
  const s = macUpdateScript(ok);
  const watch = s.slice(s.indexOf('seen=0'), s.lastIndexOf('exit 0'));
  const run = (alive: string) => {
    const d = mkdtempSync(path.join(os.tmpdir(), 'mu-'));
    execFileSync('mkdir', ['-p', path.join(d, 'RB/Samara.app/Contents'), path.join(d, 'APP/Contents'), path.join(d, 'BR')]);
    writeFileSync(path.join(d, 'BR/installed.json'), '{"status":"trial"}');
    // alive: one letter per check, y = running, n = not; the check after the last letter repeats it.
    const out = execFileSync('bash', ['-c', `n=0; sleep() { n=$((n+1)); }; running() { c='${alive}'; i=$(( n <= \${#c} ? n : \${#c} )); [ "\${c:i-1:1}" = y ]; }
      launch() { echo launched; }; BR='${d}/BR'; RB='${d}/RB'; APP='${d}/APP'; VERSION=1.0.0
      ${watch}
      echo kept`]).toString();
    return out.includes('putting the old one back') ? 'back' : 'kept';
  };
  assert.equal(run('nny'), 'kept', 'appeared at the third look (~60 s): kept');
  assert.equal(run('nnyyn'), 'back', 'started, then died before it was good: back');
  assert.equal(run('n'), 'back', 'never started in four minutes: back');
});

// Oct 30 on his Mac: macOS refused to delete an old staged copy, prepare stopped half way, and a near-empty copy was left
// marked as the new version. The old copy is moved aside (to the Trash) and the mark goes first.
test('an old staged copy is moved aside, never half-deleted and left marked ready', () => {
  const s = macUpdateScript(ok);
  const prep = s.slice(s.indexOf('if [ "$PHASE" = "prepare" ]'), s.indexOf('# swap'));
  assert.ok(prep.indexOf('rm -f "$STAGE/version"') < prep.indexOf('aside "$STAGE" staged'), 'the ready mark goes before anything else');
  assert.match(prep, /aside "\$STAGE" staged/);
  assert.match(s, /aside\(\) \{[^\n]*\.Trash/);
  // the swap and the way back never delete inside an app bundle either
  const swap = s.slice(s.indexOf('# swap'));
  assert.doesNotMatch(swap, /rm -rf "\$(RB|APP|STAGE)/);
  assert.match(prep, /could not be moved out of the way/);
  assert.doesNotMatch(prep, /^\s*rm -rf "\$STAGE"; mkdir/m);
});

// The Mac listener's /sound door (2026-11-13): the Shrine mixer's sound picker.
//
// Like macopen.test.ts, these run the REAL Perl shipped in macsetup.ts, so the rules tested are the rules his Mac runs.
// The Swift helper itself can only be built on a Mac; here we check what the setup does with it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { macSetupScript } from '../src/macsetup.ts';

const source = readFileSync(path.resolve(import.meta.dirname, '..', 'src', 'macsetup.ts'), 'utf8');
function listener(): string {
  const i = source.indexOf('#!/usr/bin/perl');
  return source.slice(i, source.indexOf('`;', i));
}
const havePerl = (() => { try { execFileSync('perl', ['-e', 'print 1']); return true; } catch { return false; } })();

/** The listener's own sound_args, cut out and run on one body. Empty: refused. */
function args(body: string): string {
  const sub = /sub sound_args \{[\s\S]*?\n\}/.exec(listener());
  assert.ok(sub, 'sound_args should be in the listener');
  return execFileSync('perl', ['-e', `${sub[0]}\nprint join('|', sound_args($ARGV[0]));`, '--', body], { encoding: 'utf8' });
}

test('the listener is still valid Perl', t => {
  if (!havePerl) { t.skip('no perl'); return; }
  execFileSync('perl', ['-c', '-'], { input: listener(), stdio: ['pipe', 'pipe', 'pipe'] });
});

test('the three questions are understood', t => {
  if (!havePerl) { t.skip('no perl'); return; }
  assert.equal(args('list'), 'list');
  assert.equal(args(' list\n'), 'list');
  assert.equal(args('out BuiltInSpeakerDevice'), 'out|BuiltInSpeakerDevice');
  assert.equal(args('out AC-1F-6B-00-11-22:output'), 'out|AC-1F-6B-00-11-22:output');
  assert.equal(args('bt AC-1F-6B-00-11-22 on'), 'bt|ac-1f-6b-00-11-22|on');
  assert.equal(args('bt ac-1f-6b-00-11-22 off'), 'bt|ac-1f-6b-00-11-22|off');
});

test('anything else is refused, even with the key', t => {
  if (!havePerl) { t.skip('no perl'); return; }
  for (const b of ['', 'lists', 'out', 'out a b', 'out -a', 'out --args', 'out ' + 'x'.repeat(201), 'out café',
    'bt ac-1f-6b-00-11 on', 'bt ac-1f-6b-00-11-22 maybe', 'bt ac:1f:6b:00:11:22 on', 'bt ac-1f-6b-00-11-22 on; rm -rf ~', 'list\nout x'])
    assert.equal(args(b), '', `refused: ${JSON.stringify(b)}`);
});

test('the helper is started through open with a list, never a shell string', () => {
  const l = listener();
  assert.match(l, /system\('\/usr\/bin\/open', '-W', '-g', '-j', '-n', '--stdout', \$tmp, '-a', \$app, '--args', @args\)/);
  assert.match(l, /m\{\^POST \(\/front\|\/run\|\/open\|\/sound\) HTTP\/\}/);
  assert.match(l, /\$path eq '\/sound' && time - \$lastSound < 1\) \{ \$ok = 0 \}/, 'once a second at most');
});

test('the setup builds the helper only with Apple\'s tools there, and never pops their install window', () => {
  const s = macSetupScript('100.64.0.1', 47832, 'h'.repeat(24), 'm'.repeat(24));
  assert.match(s, /NSBluetoothAlwaysUsageDescription/);
  assert.match(s, /LSBackgroundOnly/);
  assert.match(s, /cat > "\$DIR\/AangSound\.swift" <<'SOUNDSWIFT'\nimport Foundation/);
  const guard = s.indexOf('xcode-select -p'), build = s.indexOf('xcrun swiftc');
  assert.ok(guard > 0 && build > guard, 'checks for the tools before calling xcrun');
  assert.equal((s.match(/\/usr\/bin\/xcrun/g) || []).length, 1, 'xcrun is called once, inside the check');
  assert.match(s, /deviceClassMajor == 0x04/, 'only audio devices, never keyboards or mice');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
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

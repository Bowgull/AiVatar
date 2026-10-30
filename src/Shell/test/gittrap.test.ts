// Security check 2026-10-24, finding 10: a repo whose own git settings run a program (fsmonitor; a hook) must not run it
// when Samara (Shell) or the brain (Core) looks at a mockup in it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { git } from '../src/mockups.ts';
import { dropMockup } from '../../Core/src/mockupdrop.ts';

function trapRepo() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'gittrap-'));
  const fired = path.join(dir, 'FIRED');
  const run = (...a: string[]) => execFileSync('git', ['-C', dir, ...a], { stdio: 'ignore' });
  run('init', '-q'); run('config', 'user.email', 't@t'); run('config', 'user.name', 't');
  mkdirSync(path.join(dir, 'docs'));
  writeFileSync(path.join(dir, 'docs', 'sheet-1-x.html'), '<title>1 · X</title>');
  run('add', '.'); run('commit', '-qm', 'one');
  // Git runs the trap through sh on Windows too, where a backslash is an escape: forward slashes on every machine.
  const fwd = (p: string) => p.replace(/\\/g, '/');
  writeFileSync(path.join(dir, 'trap.sh'), `#!/bin/sh\ntouch "${fwd(fired)}"\nexit 0\n`); chmodSync(path.join(dir, 'trap.sh'), 0o755);
  run('config', 'core.fsmonitor', fwd(path.join(dir, 'trap.sh')));
  writeFileSync(path.join(dir, 'docs', 'sheet-1-x.html'), '<title>1 · X changed</title>');   // dirty, so git would look
  return { dir, fired };
}

test('the trap fires for plain git status (so this test can see it)', () => {
  const { dir, fired } = trapRepo();
  try { execFileSync('git', ['-C', dir, 'status', '--porcelain'], { stdio: 'ignore' }); } catch { /* fine */ }
  assert.ok(existsSync(fired));
});
test('Samara asking git about a mockup never fires it', async () => {
  const { dir, fired } = trapRepo();
  for (const a of [['rev-parse', '--verify', 'HEAD'], ['cat-file', '-t', 'HEAD:docs/sheet-1-x.html'], ['status', '--porcelain']]) await git(dir, a);
  assert.ok(!existsSync(fired));
});
test('the brain showing a mockup never fires it, and still says it has changes', async () => {
  const { dir, fired } = trapRepo();
  const state = mkdtempSync(path.join(os.tmpdir(), 'gittrap-s-'));
  const r = await dropMockup(state, { cwd: dir, path: 'docs/sheet-1-x.html', title: '1 · X', branch: 'X' }, '/nonexistent');
  assert.ok(r.ok, r.message);
  assert.match(r.message, /not committed/);
  assert.ok(!existsSync(fired));
});

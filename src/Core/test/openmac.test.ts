// The Mac half of open (2026-10-28, the Mac is Aang's home): apps from the Applications folders, open(1) for
// everything, and the Mac's own kinds of runnable file still ask every time.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { RUNNABLE } from '../src/trust.ts';

const mac = process.platform === 'darwin';

test('on the Mac, apps are found by name in the Applications folders; WoW is not looked for', { skip: !mac && 'Mac only' }, async () => {
  const { resolve } = await import('../src/open.ts');
  const term = resolve('terminal');
  assert.ok(!('error' in term) && term.kind === 'app' && term.target.endsWith('/Terminal.app'), JSON.stringify(term));
  const finder = resolve('Finder');
  assert.ok(!('error' in finder) && finder.target.endsWith('Finder.app'));
  const docs = resolve('~/Documents');
  assert.ok(!('error' in docs) && docs.kind === 'path' && docs.target === path.join(os.homedir(), 'Documents'));
  assert.ok('error' in resolve('notepad') && /Applications folders/.test((resolve('notepad') as { error: string }).error));
  assert.ok('error' in resolve('wow'), 'no Battle.net recipe on the Mac');
  const link = resolve('youtube.com');
  assert.ok(!('error' in link) && link.kind === 'link' && link.target === 'https://youtube.com');
});

test('the Mac\'s runnable kinds ask every time, like .exe on the PC', () => {
  for (const f of ['/Users/j/Downloads/Evil.app', '/Users/j/Downloads/Evil.app/', 'run.command', 'Setup.pkg', 'Thing.dmg', 'x.scpt', 'go.workflow', 'a.zsh'])
    assert.ok(RUNNABLE.test(f), f);
  for (const f of ['/Users/j/Documents/notes.txt', 'photo.png', 'report.pdf', 'apple'])
    assert.ok(!RUNNABLE.test(f), f);
});

test('on the Mac, administrator, start-up, Keychain and system commands are never trusted in advance', async () => {
  const { kindOf } = await import('../src/trust.ts');
  for (const c of ['sudo rm -rf /tmp/x', 'launchctl load ~/Library/LaunchAgents/x.plist', 'osascript -e "tell app \\"Finder\\" to quit"',
    'defaults write com.apple.dock autohide -bool true', 'security find-generic-password -s x', 'xattr -d com.apple.quarantine x.app',
    'brew install wget', 'zsh -c "ls"', 'killall Finder'])
    assert.equal(kindOf('mcp__aang__run', { command: c }), null, c);
  assert.deepEqual(kindOf('mcp__aang__run', { command: 'git status' })?.kind, 'run git', 'a plain program can still be trusted once');
});

test('on the Mac a command runs in zsh with no profile', { skip: !mac && 'Mac only' }, async () => {
  const { runCommand } = await import('../src/run.ts');
  const r = await runCommand('echo $ZSH_VERSION; echo "$0"', os.tmpdir(), 10_000);
  assert.equal(r.ok, true);
  assert.match(r.output, /^\d+\.\d+/);
});

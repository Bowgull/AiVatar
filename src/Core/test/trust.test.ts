import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TrustStore, kindOf, programOf } from '../src/trust.ts';
import { classify, findApp, openedText, resolve } from '../src/open.ts';
import { isLauncher, tidyPaths } from '../src/tools.ts';

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'aang-trust-'));

test('agreeing once is remembered, and survives a restart', () => {
  const dir = tmp();
  const t = new TrustStore(dir);
  assert.equal(t.allowed('run git'), false);
  t.allow('run git', 'run git status --short');
  assert.equal(t.allowed('run git'), true);
  assert.equal(new TrustStore(dir).allowed('run git'), true, 'still trusted after a restart');
});

test('agreeing to one program says nothing about another', () => {
  const t = new TrustStore(tmp());
  t.allow('run git', 'run git status');
  assert.equal(t.allowed('run dotnet'), false, 'yes to git is not yes to everything');
});

test('he can take it back, one kind or all of it', () => {
  const dir = tmp();
  const t = new TrustStore(dir);
  t.allow('run git', 'x'); t.allow('open apps', 'y');
  assert.equal(t.revoke('run git'), true);
  assert.equal(t.allowed('run git'), false);
  assert.equal(t.allowed('open apps'), true);
  t.revokeAll();
  assert.deepEqual(t.list(), []);
  assert.deepEqual(new TrustStore(dir).list(), [], 'and it stays revoked');
});

test('an unreadable trust file trusts nothing', () => {
  const dir = tmp();
  writeFileSync(path.join(dir, 'trust.json'), '{ broken');
  const t = new TrustStore(dir);
  assert.deepEqual(t.list(), [], 'the safe direction is to ask again');
});

test('the program is the first word, whatever is wrapped round it', () => {
  assert.equal(programOf('git status --short'), 'git');
  assert.equal(programOf('cd C:/work && git rev-parse HEAD'), 'git');
  assert.equal(programOf('"C:/Program Files/Git/bin/git.exe" log'), 'git');
  assert.equal(programOf('dotnet.exe build'), 'dotnet');
  assert.equal(programOf(''), '');
});

test('deleting and installing are never trusted in advance, however often he says yes', () => {
  for (const command of ['rm -rf build', 'del /f file', 'rmdir /s x', 'winget install thing', 'npm install left-pad',
                         'pip install requests', 'reg add HKLM\\x', 'shutdown /s', 'curl http://x']) {
    assert.equal(kindOf('Bash', { command }), null, `${command} must ask every time`);
  }
});

test('ordinary commands are trusted by program', () => {
  assert.deepEqual(kindOf('PowerShell', { command: 'git status' })?.kind, 'run git');
  assert.deepEqual(kindOf('Bash', { command: 'dotnet build' })?.kind, 'run dotnet');
  assert.match(kindOf('Bash', { command: 'git status' })?.says ?? '', /run git commands/);
});

test('opening is trusted in three coarse kinds', () => {
  assert.equal(kindOf('mcp__aang__open', { what: 'firefox' })?.kind, 'open apps');
  assert.equal(kindOf('mcp__aang__open', { what: 'https://example.com' })?.kind, 'open links');
  assert.equal(kindOf('mcp__aang__open', { what: 'C:/Users/Shadow/notes.txt' })?.kind, 'open files');
  assert.equal(kindOf('mcp__aang__read_clipboard', {})?.kind, 'read clipboard');
});

test('writing and editing files always ask', () => {
  assert.equal(kindOf('Write', { file_path: 'x' }), null);
  assert.equal(kindOf('Edit', { file_path: 'x' }), null);
});

test('what to open is worked out from what he said', () => {
  assert.equal(classify('firefox'), 'app');
  assert.equal(classify('https://anthropic.com'), 'link');
  assert.equal(classify('C:/Users/Shadow/Documents'), 'path');
  assert.equal(classify('youtube.com/watch?v=1'), 'link', 'a link he did not type https:// for');
  assert.deepEqual(resolve('https://example.com'), { target: 'https://example.com', kind: 'link', app: undefined });
  assert.equal((resolve('www.youtube.com') as any).target, 'https://www.youtube.com');
});

// Against the apps really installed here. It used to resolve "chrome" to a bare chrome.exe, which is not on
// PATH, so opening Chrome by name could never work (2026-09-21) - and this test asserted exactly that.
const installed = (p: string) => existsSync(p);
test('installed apps are found the way the Start menu finds them', { skip: !installed('C:/Program Files/Google/Chrome/Application/chrome.exe') && 'Chrome not installed here' }, () => {
  assert.match(findApp('chrome')!.target, /Google\\Chrome\\Application\\chrome\.exe$/i, 'from App Paths, not PATH');
  assert.match(findApp('Google Chrome')!.target, /chrome/i);
  assert.equal(findApp('chrome')!.name, 'Chrome');
});

test('a name that looks like a website is the app when the app is installed', { skip: !existsSync('C:/ProgramData/Microsoft/Windows/Start Menu/Programs/Battle.net') && 'Battle.net not installed here' }, () => {
  assert.equal((resolve('battle.net') as any).kind, 'app');
  assert.equal((resolve('www.youtube.com') as any).kind, 'link');
});

test('an app only the Start menu knows is found too', { skip: !existsSync(path.join(process.env.APPDATA ?? '', 'Spotify', 'Spotify.exe')) && 'Spotify not installed here' }, () => {
  assert.match(findApp('spotify')!.target, /spotify/i);
});

test('a link can be opened in a named app, and that app is checked for, not assumed', { skip: !installed('C:/Program Files/Google/Chrome/Application/chrome.exe') && 'Chrome not installed here' }, () => {
  const r = resolve('https://www.youtube.com/results?search_query=foo+fighters+live+wembley', 'chrome') as any;
  assert.equal(r.kind, 'link');
  assert.equal(r.app.name, 'Chrome');
  assert.equal(openedText(r), 'Opened https://www.youtube.com/results?search_query=foo+fighters+live+wembley in Chrome.');
  assert.match((resolve('https://example.com', 'definitely-not-a-browser-xyz') as any).error, /not installed/);
  assert.match((resolve('definitely-not-an-app-xyz') as any).error, /not installed.*Start menu/);
});

test('a link with no app named says which browser it really went to', () => {
  const text = openedText({ target: 'https://example.com', kind: 'link' });
  assert.match(text, /in \S+.*default browser/);
  assert.doesNotMatch(text, /undefined/);
});

test('a link that is not a web link, and a path that is not there, are refused with a reason', () => {
  assert.match((resolve('file:///C:/secrets') as any).error, /http/);
  assert.match((resolve('javascript:alert(1)') as any).error ?? '', /http|not a link/);
  assert.match((resolve('C:/definitely/not/here.txt') as any).error, /nothing at/);
  assert.match((resolve('  ') as any).error, /Nothing to open/);
});

test('launching through the shell is recognised, so open gets used instead', () => {
  for (const c of ['mspaint.exe', 'start notepad', 'explorer C:/Users', 'Invoke-Item "C:/x"', 'ii C:/x',
                   'cmd /c start https://example.com', 'C:/Windows/notepad.exe']) {
    assert.equal(isLauncher(c), true, `${c} is a launch`);
  }
  for (const c of ['git status --short', 'dotnet build', 'npm test', 'explorerthing --x',
                   'git log --oneline | head -3', 'node script.js']) {
    assert.equal(isLauncher(c), false, `${c} is a real command`);
  }
});


test('long paths in a question are trimmed to the part that means something', () => {
  assert.equal(tidyPaths('dotnet build C:/Users/Shadow/Documents/AangApp/src/Body/Body.csproj -c Release'), 'dotnet build …/Body/Body.csproj -c Release');
  assert.equal(tidyPaths('git status --short'), 'git status --short', 'no path, nothing changed');
  assert.equal(tidyPaths('open C:/Users/Shadow/AppData/Local/Temp/open-me-x'), 'open …/Temp/open-me-x');
  assert.equal(tidyPaths('cat src/Core/x.ts'), 'cat src/Core/x.ts', 'a short relative path is left alone');
});


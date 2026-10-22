// Samara's taskbar right-click list (2026-10-21): only the five known tasks are ever acted on, from the lock's data or
// one --samara-task=... on the command line; each item starts this same Shell with exactly that one argument.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SAMARA_TASKS, jumpList, taskFromArgv, taskFromLockData } from '../src/jumplist.ts';

test('the known tasks come through, from the command line and from the lock', () => {
  for (const t of SAMARA_TASKS) {
    assert.equal(taskFromArgv(['C:\\e\\electron.exe', 'C:\\s\\src\\main.ts', `--samara-task=${t}`]), t);
    // Chromium may put its own switches round it: still found.
    assert.equal(taskFromArgv(['electron.exe', '--allow-file-access-from-files', 'main.ts', `--samara-task=${t}`, '--original-process-start-time=1']), t);
    assert.equal(taskFromLockData({ samaraTask: t }), t);
  }
});

test('anything else does nothing', () => {
  for (const argv of [[], ['main.ts'], ['--samara-task='], ['--samara-task=New-Tab'], ['--samara-task=new-tab '], ['--samara-task=new-tab;calc'],
    ['--samara-task=open', 'x'], ['--samara-task', 'new-tab'], ['--samara-task=new-tab', '--samara-task=settings'], ['--SAMARA-TASK=new-tab'], 'new-tab', null, [5]]) {
    assert.equal(taskFromArgv(argv), null, JSON.stringify(argv));
  }
  for (const d of [null, undefined, 'new-tab', {}, { samaraTask: 'url' }, { samaraTask: ['new-tab'] }, { samaraTask: 'settings\n' }]) assert.equal(taskFromLockData(d), null, JSON.stringify(d));
});

test('the list: one Tasks group, each item this Shell with one task', () => {
  const l = jumpList({ exe: 'C:\\e\\electron.exe', main: 'C:\\s\\src\\main.ts', dir: 'C:\\s', icon: 'C:\\s\\samara-open.ico' });
  assert.equal(l.length, 1);
  assert.equal(l[0]!.type, 'tasks');
  const items = l[0]!.items as Electron.JumpListItem[];
  assert.deepEqual(items.map((i) => i.title), ['New tab', 'New window', 'Reopen closed tab', 'Mockups', 'Settings']);
  for (const i of items) {
    assert.equal(i.program, 'C:\\e\\electron.exe');
    assert.equal(i.workingDirectory, 'C:\\s');
    assert.match(i.args!, /^"C:\\s\\src\\main\.ts" --samara-task=[a-z-]+$/);
    assert.equal(taskFromArgv(i.args!.split(' ')), i.args!.split('=')[1]);
  }
});

test('sheet 66 A: a Pop-outs section above the Tasks; New note, Timer, Music only while Aang runs; removed items left out', () => {
  const base = { exe: 'C:\\e\\electron.exe', main: 'C:\\s\\src\\main.ts', dir: 'C:\\s', icon: 'C:\\s\\samara-open.ico' };
  const on = jumpList({ ...base, popouts: { aang: true, icons: { 'popouts-gather': 'C:\\a\\aang.ico' } } });
  assert.equal(on.length, 2);
  assert.equal(on[0]!.type, 'custom');
  assert.equal(on[0]!.name, 'Pop-outs');
  const items = on[0]!.items as Electron.JumpListItem[];
  assert.deepEqual(items.map((i) => i.title), ['Show all pop-outs', 'Hide all pop-outs', 'Gather them by Aang', 'New note', 'Timer', 'Music player']);
  assert.deepEqual(items.map((i) => i.iconPath), [base.icon, base.icon, 'C:\\a\\aang.ico', base.icon, base.icon, base.icon]);
  for (const i of items) assert.ok(taskFromArgv(i.args!.split(' ')), i.args);
  assert.equal(on[1]!.type, 'tasks');
  const off = jumpList({ ...base, popouts: { aang: false, icons: {} } });
  assert.deepEqual((off[0]!.items as Electron.JumpListItem[]).map((i) => i.title), ['Show all pop-outs', 'Hide all pop-outs', 'Gather them by Aang']);
  const gone = jumpList({ ...base, popouts: { aang: true, icons: {}, removed: (a) => a.endsWith('=timer') } });
  assert.ok(!(gone[0]!.items as Electron.JumpListItem[]).some((i) => i.title === 'Timer'));
  for (const t of ['popouts-show', 'popouts-hide', 'popouts-gather', 'new-note', 'timer', 'player']) assert.equal(taskFromLockData({ samaraTask: t }), t);
});

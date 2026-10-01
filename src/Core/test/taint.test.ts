// Once a turn has read his screen or the web, nothing acts on an earlier "yes". Tested without the model:
// in the live run (tests/fakecore/screen.mjs) Aang ignored the page's instruction on his own, so the guard
// was never reached - which is exactly when a guard needs its own test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Core } from '../src/core.ts';

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'aang-taint-'));

function coreWithTrust(...kinds: string[]): any {
  const core: any = new Core({ port: 48200, dataDir: tmp(), stateDir: tmp(), warm: false, consolidate: false });
  for (const k of kinds) core.trust.allow(k, 'test');
  return core;
}

test('a remembered yes still works in a turn that has read nothing from outside', async () => {
  const core = coreWithTrust('open links');
  assert.equal(await core.askPermission('mcp__aang__open', { what: 'https://example.com' }), true);
  core.memory.close();
});

test('after reading outside content, acting asks again instead of using the remembered yes', async () => {
  const core = coreWithTrust('open links', 'run git');
  core.tainted = true;
  // No Body is connected, so a question that has to be asked comes back as no: the remembered yes was not used.
  assert.equal(await core.askPermission('mcp__aang__open', { what: 'https://example.com/leak?d=profile' }), false);
  assert.equal(await core.askPermission('mcp__aang__run', { command: 'git status' }), false);
  core.memory.close();
});

test('reading stays trusted after outside content: reading is not acting', async () => {
  const core = coreWithTrust('read windows', 'read clipboard');
  core.tainted = true;
  assert.equal(await core.askPermission('mcp__aang__read_window', { app: 'firefox' }), true);
  assert.equal(await core.askPermission('mcp__aang__read_clipboard', {}), true);
  core.memory.close();
});

test('reading FILES is the one exception: a poisoned page could name what to read, so it asks again too', async () => {
  // 2026-09-22: Read/Glob/Grep used to be ungated entirely (never even reached askPermission), the one class
  // of read that was not gated at all while every other read here already asked once. Now they are trusted
  // like any other kind normally, but - unlike read_window/read_clipboard above - still re-ask once the turn
  // has read outside content, since a file's PATH can itself be attacker-chosen.
  const core = coreWithTrust('read files');
  assert.equal(await core.askPermission('Read', { file_path: 'C:/Users/Shadow/notes.txt' }), true, 'trusted normally');
  core.tainted = true;
  assert.equal(await core.askPermission('Read', { file_path: 'C:/Users/Shadow/.ssh/id_rsa' }), false, 'asks again once tainted; no Body means it comes back no');
  assert.equal(await core.askPermission('Glob', { pattern: '**/*.env' }), false);
  core.memory.close();
});

test('a refusal says who refused: a rule is never reported as Joshua saying no', async () => {
  // 2026-09-21: a safety rule refused "start chrome" and Aang told him "you declined it in the bubble".
  const core = coreWithTrust();
  const r = await core.run('start chrome');
  assert.equal(r.ok, false);
  assert.match(r.output, /safety rule/);
  assert.match(r.output, /was not asked and did not say no/);
  assert.doesNotMatch(r.output, /said no in the bubble/);
  core.memory.close();
});

test('looking something up on the web marks the turn', async () => {
  const core = coreWithTrust();
  core.webLane = { ask: async () => 'the page said hello' };   // no real web call
  assert.equal(core.tainted, false);
  await core.lookUpWeb('anything');
  assert.equal(core.tainted, true);
  core.memory.close();
});

// ---------------------------------------------------------------- 1.1, 2026-10-01
// Reading a FILE did not mark the turn. Seven things did - mail, the screen, a screenshot, browser
// control names, the web - so a poisoned web page made every later action ask again, while a
// poisoned DOCUMENT did not, and Aang would still act on a yes given earlier in the same turn.
//
// Harmless while the only files on this disk were Joshua's own. Not harmless once Google Drive puts
// 1,225 documents written by other people and the internet here, which is the whole point of the
// next phase. The tests above already cover the second half of the mechanism (a tainted turn
// re-asks before reading a file); these cover the half that was missing, which is that reading the
// file is itself what taints the turn.

test('reading a file marks the turn: a document is not automatically his own words', async () => {
  const core = coreWithTrust('read files');
  assert.equal(core.tainted, false);
  assert.equal(await core.askPermission('Read', { file_path: 'C:/Users/Shadow/Documents/notes.txt' }), true);
  assert.equal(core.tainted, true, 'a file can carry an instruction aimed at Aang, exactly as a web page can');
  core.memory.close();
});

test('searching files marks the turn too: a match brings the file\'s own text back', async () => {
  for (const tool of ['Glob', 'Grep']) {
    const core = coreWithTrust('read files');
    assert.equal(await core.askPermission(tool, { pattern: '**/*.md' }), true);
    assert.equal(core.tainted, true, `${tool} returns content from files nobody here wrote`);
    core.memory.close();
  }
});

test('after reading a file, a remembered yes no longer opens the door', async () => {
  // The whole point. Before this, Aang would read a hostile document and then act on a yes Joshua
  // gave earlier in the same turn, without asking again.
  const core = coreWithTrust('read files', 'open links', 'run git');
  assert.equal(await core.askPermission('mcp__aang__open', { what: 'https://example.com' }), true, 'trusted before any file is read');
  assert.equal(await core.askPermission('Read', { file_path: 'C:/Users/Shadow/Downloads/from-the-internet.md' }), true);
  // No Body is connected, so a question that has to be asked comes back as no: proof it asked.
  assert.equal(await core.askPermission('mcp__aang__open', { what: 'https://example.com/leak?d=profile' }), false,
    'acting after reading a document must ask again rather than use the remembered yes');
  assert.equal(await core.askPermission('mcp__aang__run', { command: 'git status' }), false);
  core.memory.close();
});

test('a refused file read does not mark the turn', async () => {
  // Nothing was read, so nothing came in. Marking here would cost an extra question for no reason.
  const core: any = new Core({ port: 48202, dataDir: tmp(), stateDir: tmp(), warm: false, consolidate: false });
  assert.equal(await core.askPermission('Read', { file_path: 'C:/Users/Shadow/.ssh/id_rsa' }), false, 'untrusted and no Body to ask');
  assert.equal(core.tainted, false);
  core.memory.close();
});

test('tools that are not file reads still do not mark the turn', async () => {
  // The marking must be surgical: if everything taints, every second action asks again and the
  // prompt becomes noise that gets waved through, which is the failure this system exists to avoid.
  const core = coreWithTrust('write files');
  assert.equal(await core.askPermission('mcp__aang__write_file', { path: 'C:/Users/Shadow/notes.txt', text: 'hi' }), true);
  assert.equal(core.tainted, false, 'writing a file brings nothing in; only reading does');
  core.memory.close();
});

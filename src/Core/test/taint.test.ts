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
  const core: any = new Core({ port: 47981, dataDir: tmp(), stateDir: tmp(), warm: false, consolidate: false });
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

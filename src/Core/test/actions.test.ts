// 9.A0 (built 2026-10-13): one list of everything Aang can do, calling the SAME wrapped actions the model calls.
import './_env.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { Core } from '../src/core.ts';
import { TOOL_NAMES } from '../src/tools.ts';

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'aang-act-'));
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

async function withCore(port: number, fn: (core: any, c: WebSocket, inbox: any[]) => Promise<void>) {
  const core: any = new Core({ port, dataDir: tmp(), stateDir: tmp(), warm: false, consolidate: false });
  await core.start();
  const c = new WebSocket(`ws://127.0.0.1:${port}/body`);
  const inbox: any[] = [];
  c.on('message', d => inbox.push(JSON.parse(String(d))));
  await new Promise<void>(r => c.once('open', () => r()));
  try { await fn(core, c, inbox); } finally { c.close(); await core.stop(); }
}
const until = async (inbox: any[], pick: (m: any) => boolean, ms = 3000) => {
  for (let t = 0; t < ms; t += 25) { const m = inbox.find(pick); if (m) return m; await wait(25); }
  return null;
};

test('9.A0: every action the model has is on the one list, with a label and its parameters', async () => {
  await withCore(48601, async core => {
    const list = core.registry.list();
    const names = new Set(list.map((a: any) => a.name));
    for (const full of TOOL_NAMES) assert.ok(names.has(full.replace(/^mcp__aang__/, '')), `${full} is on the list`);
    for (const a of list) {
      assert.ok(a.label && a.description, `${a.name} has words`);
      assert.equal((a.params as any).type, 'object', `${a.name} has a parameter schema`);
    }
  });
});

test('9.A0: an action runs by name; unknown names and wrong parameters are refused before anything runs', async () => {
  await withCore(48603, async core => {
    const t = await core.registry.run('get_time', {});
    assert.equal(t.ok, true);
    assert.match(t.text, /\d/);
    assert.equal((await core.registry.run('format_my_disk', {})).ok, false);
    const missing = await core.registry.run('search_memory', {});
    assert.equal(missing.ok, false, 'a required parameter missing');
    assert.match(missing.text, /query/);
    const extra = await core.registry.run('get_time', { sneaky: 'x' });
    assert.equal(extra.ok, false, 'nothing the schema does not allow, the same as for the model');
  });
});

test('9.A0: the gates are the same: after old words come back, a change asks first, and a no means nothing happens', async () => {
  await withCore(48605, async (core, c, inbox) => {
    c.on('message', d => { const m = JSON.parse(String(d)); if (m.t === 'permission') c.send(JSON.stringify({ t: 'permission.reply', id: m.id, choice: 'no' })); });
    c.send(JSON.stringify({ t: 'action.run', id: 'a1', name: 'search_memory', args: { query: 'pelican' } }));
    assert.ok(await until(inbox, m => m.t === 'action.result' && m.id === 'a1'), 'reading old words answers');
    c.send(JSON.stringify({ t: 'action.run', id: 'a2', name: 'remember', args: { fact: 'likes pelicans' } }));
    const r = await until(inbox, m => m.t === 'action.result' && m.id === 'a2');
    assert.ok(inbox.some(m => m.t === 'permission'), 'he was asked first, exactly as when the model does it');
    assert.equal(r?.ok, false, 'and his no stopped it');
  });
});

test('9.A0: his own clients can ask for the list over the socket', async () => {
  await withCore(48607, async (_core, c, inbox) => {
    c.send(JSON.stringify({ t: 'action.list' }));
    const m = await until(inbox, x => x.t === 'action.list');
    assert.ok(m && m.actions.length >= 40, `the list arrives (${m?.actions.length})`);
  });
});

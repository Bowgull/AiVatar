import './_env.ts';
// Phase 2 (2026-11-12): Samara as its own program on the PC. The brain passes `relay` messages between Shells (Samara
// and Aang's windows), never to the pet and never back to the sender, and Samara's hello never releases Aang's held lines.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { Core } from '../src/core.ts';

const PORT = 48810;
const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'aang-relay-'));
const pause = (ms: number) => new Promise(r => setTimeout(r, ms));

test('a relay goes from one Shell to the other, and nowhere else', async () => {
  const core = new Core({ testDoor: true, port: PORT, dataDir: tmp(), stateDir: tmp(), warm: false });
  await core.start();
  const open = () => { const w = new WebSocket(`ws://127.0.0.1:${PORT}/body`); const inbox: any[] = []; w.on('message', d => inbox.push(JSON.parse(String(d)))); return { w, inbox, ready: new Promise<void>(r => w.once('open', () => r())) }; };
  const samara = open(), aang = open(), pet = open();
  try {
    await Promise.all([samara.ready, aang.ready, pet.ready]);
    samara.w.send(JSON.stringify({ t: 'hello', v: 1, client: 'desktop', shell: true, role: 'samara' }));
    aang.w.send(JSON.stringify({ t: 'hello', v: 1, client: 'desktop', shell: true }));
    pet.w.send(JSON.stringify({ t: 'hello', v: 1 }));
    await pause(200);

    samara.w.send(JSON.stringify({ t: 'relay', m: { t: 'samara.task', task: 'note' } }));
    aang.w.send(JSON.stringify({ t: 'relay', m: { t: 'samara.open', url: 'https://example.com/' } }));
    await pause(200);
    assert.ok(aang.inbox.some(m => m.t === 'relay' && m.m?.t === 'samara.task' && m.m.task === 'note'), 'Aang\'s windows got Samara\'s task');
    assert.ok(samara.inbox.some(m => m.t === 'relay' && m.m?.t === 'samara.open'), 'Samara got Aang\'s page');
    assert.equal(samara.inbox.filter(m => m.t === 'relay' && m.m?.t === 'samara.task').length, 0, 'never back to the sender');
    assert.equal(pet.inbox.filter(m => m.t === 'relay').length, 0, 'never to the pet');

    // Not from anything but a Shell, and nothing malformed or huge.
    pet.w.send(JSON.stringify({ t: 'relay', m: { t: 'samara.open', url: 'https://evil.example/' } }));
    samara.w.send(JSON.stringify({ t: 'relay', m: 'not an object' }));
    samara.w.send(JSON.stringify({ t: 'relay', m: { t: 'x'.repeat(41) } }));
    samara.w.send(JSON.stringify({ t: 'relay', m: { t: 'big', s: 'y'.repeat(70_000) } }));
    await pause(200);
    assert.equal(samara.inbox.filter(m => m.t === 'relay' && m.m?.url === 'https://evil.example/').length, 0, 'the pet cannot relay');
    assert.equal(aang.inbox.filter(m => m.t === 'relay').length, 1, 'only the one good relay reached Aang');
  } finally {
    for (const c of [samara, aang, pet]) c.w.close();
    await core.stop();
  }
});

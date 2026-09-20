import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { Core } from '../src/core.ts';

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'aang-life-'));

test('the Core stops promptly even while a client is still connected', async () => {
  const core = new Core({ port: 47971, dataDir: tmp(), stateDir: tmp(), warm: false });
  await core.start();
  const client = new WebSocket('ws://127.0.0.1:47971/body');
  await new Promise<void>(r => client.once('open', () => r()));
  const t0 = Date.now();
  await Promise.race([core.stop(), new Promise((_, rej) => setTimeout(() => rej(new Error('stop() hung with a client connected')), 3000))]);
  assert.ok(Date.now() - t0 < 3000);
});

test('the port is free again after stop, so a restarted Core can bind it', async () => {
  const first = new Core({ port: 47972, dataDir: tmp(), stateDir: tmp(), warm: false });
  await first.start();
  await first.stop();
  const second = new Core({ port: 47972, dataDir: tmp(), stateDir: tmp(), warm: false });
  await second.start();
  await second.stop();
});

test('garbage from a client never crashes the Core', async () => {
  const core = new Core({ port: 47973, dataDir: tmp(), stateDir: tmp(), warm: false });
  await core.start();
  const c = new WebSocket('ws://127.0.0.1:47973/body');
  await new Promise<void>(r => c.once('open', () => r()));
  for (const junk of ['not json', '{}', '{"t":42}', '[]', '{"t":"submit"}', '{"t":"from-the-future"}']) c.send(junk);
  await new Promise(r => setTimeout(r, 200));
  assert.equal(c.readyState, WebSocket.OPEN, 'still connected after junk');
  const pong = new Promise<boolean>(r => { c.once('message', () => r(true)); setTimeout(() => r(false), 500); });
  c.send(JSON.stringify({ t: 'hello', v: 1 }));
  await pong; // hello with no quota yet sends nothing; the point is that we got here alive
  c.close();
  await core.stop();
});

test('a rating is written to ratings.jsonl and a malformed one is ignored', async () => {
  const state = tmp();
  const core = new Core({ port: 47974, dataDir: tmp(), stateDir: state, warm: false });
  await core.start();
  const c = new WebSocket('ws://127.0.0.1:47974/body');
  await new Promise<void>(r => c.once('open', () => r()));
  for (const m of [{ t: 'rate', id: 'u1', value: 'up' }, { t: 'rate', id: 'u2', value: 'sideways' }, { t: 'rate', value: 'up' }, { t: 'rate', id: 'u3', value: 'none' }]) c.send(JSON.stringify(m));
  await new Promise(r => setTimeout(r, 300));
  c.close();
  await core.stop();
  const lines = readFileSync(path.join(state, 'ratings.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
  assert.deepEqual(lines.map(l => [l.id, l.value]), [['u1', 'up'], ['u3', 'none']]);
});

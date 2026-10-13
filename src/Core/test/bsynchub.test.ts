// M6: the brain passes browser changes between the PC's browser and the Mac's. Only the Mac, only with the key,
// never a web page; and it only passes them on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { WebSocket } from 'ws';
import { BrowserSyncHub } from '../src/bsynchub.ts';

const KEY = 's'.repeat(24);
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const open = (ws: WebSocket) => new Promise<boolean>(r => { ws.once('open', () => r(true)); ws.once('error', () => r(false)); ws.once('unexpected-response', () => r(false)); });

test('M6: the Mac with the key gets in; a wrong key or a web page does not; messages pass both ways', async () => {
  const toShell: any[] = [];
  let shell = true;
  const hub = new BrowserSyncHub({ key: () => KEY, macAddr: () => '127.0.0.1', toShell: m => toShell.push(m), shellUp: () => shell, log: () => {} });
  const srv = http.createServer((_q, r) => r.writeHead(404).end());
  srv.on('upgrade', (q, s, h) => hub.upgrade(q, s, h));
  await new Promise<void>(r => srv.listen(48660, '127.0.0.1', () => r()));
  try {
    assert.equal(await open(new WebSocket('ws://127.0.0.1:48660/bsync', { headers: { 'x-aang-key': 'wrong'.repeat(5) } })), false, 'a wrong key');
    assert.equal(await open(new WebSocket('ws://127.0.0.1:48660/bsync', { headers: { 'x-aang-key': KEY, origin: 'https://evil.example' } })), false, 'a web page');
    assert.equal(await open(new WebSocket('ws://127.0.0.1:48660/other', { headers: { 'x-aang-key': KEY } })), false, 'any other path');
    const mac = new WebSocket('ws://127.0.0.1:48660/bsync', { headers: { 'x-aang-key': KEY } });
    const got: any[] = [];
    mac.on('message', d => got.push(JSON.parse(String(d))));
    assert.equal(await open(mac), true);
    await wait(50);
    assert.deepEqual(got.map(m => m.t), ['bsync.hello'], 'both told to catch up');
    assert.deepEqual(toShell.map(m => m.t), ['bsync.hello']);
    mac.send(JSON.stringify({ t: 'bsync.marks', at: 1, list: [] }));
    mac.send(JSON.stringify({ t: 'not.sync', x: 1 }));
    hub.fromShell({ t: 'bsync.prefs', at: 2, data: {} });
    await wait(50);
    assert.deepEqual(toShell.map(m => m.t), ['bsync.hello', 'bsync.marks'], 'only sync messages pass');
    assert.equal(got[1].t, 'bsync.prefs');
    // Open on PC (from the Mac) and Open on Mac (from the PC): a full tab on the other side.
    mac.send(JSON.stringify({ t: 'open.onpc', url: 'https://www.twitch.tv/' }));
    mac.send(JSON.stringify({ t: 'open.onpc', url: 'javascript:alert(1)' }));
    assert.equal(hub.openOnMac('https://www.youtube.com/'), true);
    await wait(50);
    assert.deepEqual(toShell.filter(m => m.t === 'browser.open').map(m => m.url), ['https://www.twitch.tv/'], 'web addresses only');
    assert.equal(got.find(m => m.t === 'tab.open')?.url, 'https://www.youtube.com/');
    const n = got.length;
    shell = false; hub.shellChanged(false);
    await wait(30);
    assert.equal(got[n].t, 'bsync.down', 'the Mac is told the PC browser went away');
    mac.close();
  } finally { hub.close(); srv.close(); }
});

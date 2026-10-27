// Google TV's remote service against the pretend TV (test/faketv.ts), never his real one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { KEY, ensureCert, remote, startPairing } from '../src/tvremote.ts';
import { FakeTv } from './faketv.ts';

const fresh = () => ensureCert(mkdtempSync(path.join(os.tmpdir(), 'tvr-')));

test('linking: the code on the TV links Samara, and a wrong one is caught before it is sent', async () => {
  const tv = await new FakeTv().start();
  try {
    const me = fresh(), t = { host: '127.0.0.1', pairPort: tv.pairPort, port: tv.remotePort, ...me };
    const p = await startPairing(t);
    assert.match(tv.shownCode ?? '', /^[0-9A-F]{6}$/);
    const wrong = (tv.shownCode!.slice(0, 2) === '00' ? '01' : '00') + tv.shownCode!.slice(2);
    await assert.rejects(p.finish(wrong), /does not look right/);
    await p.finish(tv.shownCode!.toLowerCase());
    assert.equal(tv.isLinked(me.cert), true);
  } finally { tv.stop(); }
});

test('an unlinked Samara is turned away at the door', async () => {
  const tv = await new FakeTv().start();
  try {
    const t = { host: '127.0.0.1', pairPort: tv.pairPort, port: tv.remotePort, ...fresh() };
    await assert.rejects(remote(t, [{ link: 'https://www.youtube.com/watch?v=x' }]), /turned Samara away|did not answer/);
    assert.deepEqual(tv.links, []);
  } finally { tv.stop(); }
});

test('linked, it opens a link and presses keys, in order and on time', async () => {
  const tv = await new FakeTv().start();
  try {
    const t = { host: '127.0.0.1', pairPort: tv.pairPort, port: tv.remotePort, ...fresh() };
    const p = await startPairing(t); await p.finish(tv.shownCode!);
    const t0 = Date.now();
    await remote(t, [{ key: KEY.WAKEUP }, { key: KEY.HOME, at: 200 }, { link: 'https://www.netflix.com/title/80057281?source=30', at: 400 }, { key: KEY.PAUSE, at: 700 }]);
    assert.deepEqual(tv.keys, [KEY.WAKEUP, KEY.HOME, KEY.PAUSE]);
    assert.deepEqual(tv.links, ['https://www.netflix.com/title/80057281?source=30']);
    assert.ok(Date.now() - t0 >= 700);
  } finally { tv.stop(); }
});

test('a TV that is asleep is reported, never waited on forever', async () => {
  const tv = await new FakeTv().start();
  try {
    const t = { host: '127.0.0.1', pairPort: tv.pairPort, port: tv.remotePort, ...fresh() };
    const p = await startPairing(t); await p.finish(tv.shownCode!);
    tv.asleep = true;
    await assert.rejects(remote(t, [{ link: 'https://www.youtube.com/watch?v=x' }], 1500));
  } finally { tv.stop(); }
});

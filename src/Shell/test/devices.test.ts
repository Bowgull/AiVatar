// Sheet 69: a site keeps the keyboard he picked for it, only that one, only that site, until he forgets it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DeviceOk, deviceName } from '../src/devices.ts';

const KB = { vendorId: 3141, productId: 65278, name: '2.4G Wireless Receiver' };
const OTHER = { vendorId: 1452, productId: 591, name: 'Some mouse' };

test('remembered per site and per device, kept across restarts, forgotten on Forget', () => {
  const file = path.join(mkdtempSync(path.join(os.tmpdir(), 'dev-')), 'device-ok.json');
  const a = new DeviceOk(file);
  assert.equal(a.allowed('hub.epomaker.com', KB), false);
  a.add('hub.epomaker.com', KB);
  assert.equal(a.allowed('hub.epomaker.com', KB), true);
  assert.equal(a.allowed('hub.epomaker.com', OTHER), false);          // only the device he picked
  assert.equal(a.allowed('evil.example', KB), false);                 // only on that site
  const b = new DeviceOk(file);                                       // a restart
  assert.deepEqual(b.list('hub.epomaker.com').map((d) => d.name), ['2.4G Wireless Receiver']);
  b.forget('hub.epomaker.com', b.list('hub.epomaker.com')[0]!.key);
  assert.equal(new DeviceOk(file).allowed('hub.epomaker.com', KB), false);
});

test('a damaged or hostile file is ignored, names are tidied', () => {
  const file = path.join(mkdtempSync(path.join(os.tmpdir(), 'dev-')), 'device-ok.json');
  writeFileSync(file, JSON.stringify({ '../x': [{ key: '1:2:', name: 'x' }], 'ok.example': [{ key: 'nope', name: 'y' }] }));
  const a = new DeviceOk(file);
  assert.deepEqual(a.list('../x'), []);
  assert.deepEqual(a.list('ok.example'), []);
  assert.equal(deviceName({ vendorId: 1, productId: 2, name: '  \u0007 ' }), 'Keyboard or mouse');
});

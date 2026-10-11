// Sender logos for the morning brief (6.15). The rules that protect him: never a private address,
// once per company and kept, only real images, people always get the letter.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Logos, brandDomain, isPersonal, publicAddress, publicName, senderDomain } from '../src/logos.ts';

const PNG = Buffer.alloc(300, 1);
const ok = (type = 'image/png', body = PNG) => ({ ok: true, headers: { get: () => type }, arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.length) });

test('the domain comes out of the From line, and a company is its own domain', () => {
  assert.equal(senderDomain('Blizzard <noreply@news.blizzard.com>'), 'news.blizzard.com');
  assert.equal(brandDomain('news.blizzard.com'), 'blizzard.com');
  assert.equal(brandDomain('mail.bbc.co.uk'), 'bbc.co.uk');
  assert.equal(senderDomain('no address here'), null);
  assert.ok(isPersonal('gmail.com'), 'a person gets the letter, never a lookup');
});

test('NEVER A PRIVATE ADDRESS: a From line cannot make Aang knock on his own network', () => {
  for (const bad of ['localhost', 'printer.local', 'nas.lan', '192.168.1.5', 'router', 'x.internal']) assert.equal(publicName(bad), false, bad);
  for (const ip of ['127.0.0.1', '10.0.0.4', '192.168.1.1', '172.16.3.3', '169.254.1.1', '::1', 'fd00::1', '::ffff:10.0.0.1']) assert.equal(publicAddress(ip), false, ip);
  assert.equal(publicAddress('140.82.112.3'), true);
});

test('a name that RESOLVES to a private address is refused before any request is made', async () => {
  let fetched = 0;
  const l = new Logos(mkdtempSync(path.join(tmpdir(), 'logos-')),
    async () => { fetched++; return ok(); },
    async () => { throw new Error('no bimi'); },
    async () => [{ address: '192.168.0.10' }]);
  await l.ensure(['evil.example.com']);
  assert.equal(fetched, 0, 'nothing was fetched');
  assert.equal(l.get('evil.example.com'), null);
});

test('once per company, kept: a second morning asks nothing', async () => {
  let fetched = 0;
  const dir = mkdtempSync(path.join(tmpdir(), 'logos-'));
  const make = () => new Logos(dir, async () => { fetched++; return ok(); }, async () => { throw new Error('none'); }, async () => [{ address: '140.82.112.3' }]);
  await make().ensure(['blizzard.com']);
  const first = fetched;
  assert.ok(first >= 1);
  const again = make();
  assert.match(String(again.get('blizzard.com')), /^data:image\/png;base64,/);
  await again.ensure(['blizzard.com']);
  assert.equal(fetched, first, 'kept on this PC, not fetched again');
});

test('only real images: an HTML page answering for the icon is not a logo', async () => {
  const l = new Logos(mkdtempSync(path.join(tmpdir(), 'logos-')),
    async () => ok('text/html'), async () => { throw new Error('none'); }, async () => [{ address: '140.82.112.3' }]);
  await l.ensure(['example.com']);
  assert.equal(l.get('example.com'), null);
});

// Send to Aang and Send mockup to Aang over the brain's relay (2026-11-20, his "Fix it now"): Samara's side builds the
// message (sendrelay.ts), Aang's side checks it (sendtoaang.ts cleanMockRelay, relayFile). The relay itself carries at
// most 64 000 characters (core.ts), so pictures ride as file names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { Answers, RELAY_MAX, mockRelay, pictureName, sendRelay } from '../src/sendrelay.ts';
import { cleanMockRelay, relayFile } from '../src/sendtoaang.ts';
import type { MockSendItem } from '../src/mockups.ts';

const item = (n: number, notes = 'x'.repeat(1500)): MockSendItem => ({ kind: 'mockup', title: `Sheet ${n}`, version: `v${n}`, branch: 'Top bar', sheet: `sheets/${n}.html`,
  commit: 'a'.repeat(40), url: 'https://github.com/x/y', notes, picture: 'data:image/png;base64,AAAA' });

test('a send never carries a picture or a path, and fits the relay', () => {
  const m = sendRelay('s1', { kind: 'image', site: 'x.com', url: 'https://x.com', file: 'C:\\evil.png', thumb: 'data:image/png;base64,AA' }, pictureName())!;
  const j = JSON.parse(JSON.stringify(m));
  assert.equal(j.t, 'samara.send'); assert.equal(j.id, 's1');
  assert.equal(j.sent.file, undefined); assert.equal(j.sent.thumb, undefined);
  assert.match(j.picture, /^\d{10,16}-[0-9a-f]{8}\.png$/);
  const long = sendRelay('s2', { kind: 'page', text: 'w'.repeat(70_000) }, null)!;
  assert.ok(JSON.stringify(long).length <= RELAY_MAX, 'a page too long is cut to fit');
});

test('a branch of mockups fits the relay: notes are cut, then dropped; too many is refused', () => {
  const one = mockRelay('m1', item(1), ['1700000000000-0123abcd.png'])!;
  assert.equal((one.m as { pictureFile: string }).pictureFile, '1700000000000-0123abcd.png');
  assert.equal((one.m as { picture: unknown }).picture, null, 'never the picture itself');
  const many = mockRelay('m2', { kind: 'mockups', branch: 'Top bar', items: Array.from({ length: 30 }, (_x, i) => item(i)) }, [])!;
  assert.ok(JSON.stringify(many).length <= RELAY_MAX);
  assert.equal(mockRelay('m3', { kind: 'mockups', branch: 'b', items: Array.from({ length: 2000 }, (_x, i) => item(i, '')) }, []), null);
});

test("Aang's side takes only a plain picture name inside its own folder", () => {
  const dir = path.join('C:', 'state', 'sent-pictures');
  assert.equal(relayFile(dir, '1700000000000-0123abcd.png'), path.join(dir, '1700000000000-0123abcd.png'));
  for (const bad of ['..\\..\\x.png', '/etc/passwd', 'C:\\x\\1700000000000-0123abcd.png', '1700000000000-0123abcd.png.exe', 'a.png', 12, null]) assert.equal(relayFile(dir, bad), null, String(bad));
});

test("Aang's side checks a mockup send field by field", () => {
  const ok = cleanMockRelay({ ...item(1), picture: null, pictureFile: '1700000000000-0123abcd.png', url: 'javascript:alert(1)' });
  assert.ok(ok && ok.kind === 'mockup');
  assert.equal(ok.url, '', 'only http(s) addresses');
  assert.equal(cleanMockRelay({ ...item(1), commit: 'not a commit' }), null);
  assert.equal(cleanMockRelay({ kind: 'mockups', branch: 'b', items: [] }), null);
  const br = cleanMockRelay({ kind: 'mockups', branch: 'Top bar', items: [{ ...item(1), pictureFile: '../x.png' }, 'junk'] });
  assert.ok(br && br.kind === 'mockups' && br.items.length === 1 && br.items[0]!.pictureFile === null);
});

test('an ask is answered by id, gives up in time, and says so at once when the relay is down', async () => {
  const a = new Answers<boolean>('t');
  const id = a.newId();
  const p = a.ask(id, () => true, 1000);
  assert.equal(a.got('someone else', true), false);
  assert.equal(a.got(id, true), true);
  assert.equal(await p, true);
  assert.equal(await a.ask(a.newId(), () => true, 20), null, 'no answer in time');
  assert.equal(await a.ask(a.newId(), () => false, 1000), null, 'not sent at all');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RELEASE_KEY, checkManifest, download, latest, listen, newer } from '../src/ghrelease.ts';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const PUB = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const BUNDLE = Buffer.from('pretend bundle bytes');
const make = (o: Record<string, unknown> = {}) => {
  const text = JSON.stringify({ v: 1, app: 'samara', version: '1.2.3', commit: 'a'.repeat(40), at: '2026-10-29', notes: ['New search bar'],
    bundle: { file: 'samara-bundle.tgz', sha256: createHash('sha256').update(BUNDLE).digest('hex'), bytes: BUNDLE.length }, ...o }, null, 1);
  return { text, sig: sign(null, Buffer.from(text), privateKey).toString('base64') };
};
const res = (body: string | Buffer, ok = true) => ({ ok, status: ok ? 200 : 404, text: async () => String(body), arrayBuffer: async () => Buffer.from(body).buffer,
  body: new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array(Buffer.from(body))); c.close(); } }) });

test('the key Samara carries is the one in release-key.pub', () => {
  assert.equal(RELEASE_KEY.trim(), readFileSync(new URL('../release-key.pub', import.meta.url), 'utf8').replace(/\r/g, '').trim());
});

test('a manifest is used only with his seal on exactly its text', () => {
  const { text, sig } = make();
  assert.equal(checkManifest(text, sig, PUB)?.version, '1.2.3');
  assert.equal(checkManifest(text + ' ', sig, PUB), null);
  assert.equal(checkManifest(text, sig, RELEASE_KEY), null);                 // someone else's seal
  assert.equal(checkManifest(text, 'AAAA', PUB), null);
});

test('a sealed manifest still has to say what a Samara release says', () => {
  for (const o of [{ app: 'other' }, { version: '1.2' }, { commit: 'abc' }, { bundle: { file: '../x', sha256: '0'.repeat(64), bytes: 1 } }, { bundle: { file: 'samara-bundle.tgz', sha256: '0'.repeat(64), bytes: 999e9 } }]) {
    const { text, sig } = make(o);
    assert.equal(checkManifest(text, sig, PUB), null, JSON.stringify(o));
  }
});

test('versions: x.y.z by number; a hand install or a fingerprint is older than any release', () => {
  assert.ok(newer('1.10.0', '1.9.9'));
  assert.ok(!newer('1.2.3', '1.2.3'));
  assert.ok(!newer('1.2.3', '1.3.0'));
  assert.ok(newer('1.0.0', 'manual-01b3f87906f5'));
  assert.ok(newer('1.0.0', '1544b2a99cbd4e34'));
  assert.ok(!newer('nope', '1.0.0'));
});

test('latest() reads the release and checks the seal; anything odd is no release', async () => {
  const { text, sig } = make();
  const files: Record<string, string> = { 'manifest.json': text, 'manifest.sig': sig };
  const f = async (u: string) => (files[u.split('/').pop()!] ? res(files[u.split('/').pop()!]!) : res('', false));
  assert.equal((await latest(f, 'https://x/', PUB))?.version, '1.2.3');
  files['manifest.sig'] = make({ version: '9.9.9' }).sig;
  assert.equal(await latest(f, 'https://x/', PUB), null);
  assert.equal(await latest(async () => { throw new Error('offline'); }, 'https://x/', PUB), null);
});

test('the bundle is kept only when it matches the sealed size and fingerprint', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ghr-'));
  const m = checkManifest(make().text, make().sig, PUB)!;
  assert.ok(await download(async () => res(BUNDLE), m, path.join(dir, 'good.tgz'), 'https://x/'));
  assert.deepEqual(readFileSync(path.join(dir, 'good.tgz')), BUNDLE);
  assert.ok(!(await download(async () => res(Buffer.from('tampered bundle bytes')), m, path.join(dir, 'bad.tgz'), 'https://x/')));
  assert.ok(!existsSync(path.join(dir, 'bad.tgz')) && !existsSync(path.join(dir, 'bad.tgz.part')));
});

test('a nudge makes one check, and a flood of them is still one', async () => {
  let n = 0;
  const body = '{"event":"open"}\n{"event":"message","message":"check"}\n{"event":"message","message":"check"}\n{"event":"keepalive"}\n';
  let calls = 0;
  const stop = listen(async () => { calls++; if (calls > 1) await new Promise(() => {}); return res(body); }, () => n++, 'https://x/json');
  await new Promise((r) => setTimeout(r, 50));
  stop();
  assert.equal(n, 1);
});

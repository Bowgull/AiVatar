import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SamaraUpdates } from '../src/pcupdate.ts';

// Windows' own tar (bsdtar), as pcupdate.ts uses: Git's GNU tar reads "C:" as a remote host.
const TAR = process.platform === 'win32' ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
// A pretend GitHub: a real little bundle (src/main.ts and a lock file), sealed with a test key.
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
function release(version: string, lock = 'lock-1') {
  const src = mkdtempSync(path.join(os.tmpdir(), 'pcu-src-'));
  mkdirSync(path.join(src, 'src'));
  writeFileSync(path.join(src, 'src', 'main.ts'), `// samara ${version}`);
  writeFileSync(path.join(src, 'package-lock.json'), lock);
  const tgz = path.join(src, 'b.tgz');
  execFileSync(TAR, ['-czf', tgz, '-C', src, 'src', 'package-lock.json']);
  const bytes = readFileSync(tgz);
  const text = JSON.stringify({ v: 1, app: 'samara', version, name: 'Gojo', commit: 'b'.repeat(40), at: '2026-10-29T12:00:00Z', notes: [`What ${version} brings`],
    bundle: { file: 'samara-bundle.tgz', sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length } });
  const sig = sign(null, Buffer.from(text), privateKey).toString('base64');
  return async (u: string) => {
    const f = u.split('/').pop()!, body = /api\.github\.com/.test(u) ? Buffer.from(JSON.stringify({ tag_name: `samara-v${version}` })) : f === 'manifest.json' ? Buffer.from(text) : f === 'manifest.sig' ? Buffer.from(sig) : f === 'samara-bundle.tgz' ? bytes : null;
    if (!body) return { ok: false, status: 404, text: async () => '', arrayBuffer: async () => new ArrayBuffer(0), body: null };
    return { ok: true, status: 200, text: async () => body.toString(), arrayBuffer: async () => body.buffer as ArrayBuffer,
      body: new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array(body)); c.close(); } }) };
  };
}
const PUB = publicKey.export({ type: 'spki', format: 'pem' }).toString();

let npmRuns = 0;
const run = async (cmd: string, args: string[], cwd: string) => {
  if (/tar(\.exe)?$/.test(cmd)) { try { execFileSync(cmd, args); return 0; } catch { return 1; } }
  npmRuns++; mkdirSync(path.join(cwd, 'node_modules'), { recursive: true }); writeFileSync(path.join(cwd, 'node_modules', 'x'), 'lib'); return 0;
};
const setup = (fetch: ReturnType<typeof release>, codeDir?: string) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'pcu-root-'));
  let changed = 0;
  const su = new SamaraUpdates({ root, codeDir: codeDir ?? mkdtempSync(path.join(os.tmpdir(), 'pcu-code-')), fetch: fetch as never, changed: () => changed++, run, pub: PUB });
  return { root, su, changed: () => changed };
};
const ptr = (root: string) => JSON.parse(readFileSync(path.join(root, 'current.json'), 'utf8'));

test('a newer sealed release is unpacked whole into its own folder, then the key lights up', async () => {
  const { root, su, changed } = setup(release('1.0.0'));
  await su.check('test');
  assert.equal(su.ready?.version, '1.0.0');
  assert.deepEqual(su.ready?.notes, ['What 1.0.0 brings']);
  assert.ok(existsSync(path.join(root, 'versions', '1.0.0', 'src', 'main.ts')));
  assert.ok(existsSync(path.join(root, 'versions', '1.0.0', 'node_modules', 'x')), 'its libraries are in');
  assert.ok(!existsSync(path.join(root, 'versions', '1.0.0.part')) && !existsSync(path.join(root, 'samara-1.0.0.tgz')), 'nothing left over');
  assert.equal(changed(), 1);
  assert.ok(!existsSync(path.join(root, 'current.json')), 'nothing points at it before Restart now');
});

test('Restart now points the pet at it as a trial, in exactly the shape the pet reads', async () => {
  const { root, su } = setup(release('1.0.0'));
  await su.check('test');
  assert.ok(su.go());
  const p = ptr(root);
  assert.equal(p.version, '1.0.0'); assert.equal(p.dir, 'versions/1.0.0'); assert.equal(p.status, 'trial'); assert.equal(p.previous, null);
});

test('running five minutes on the trial marks it good; the next release remembers it as the one before', async () => {
  const first = setup(release('1.0.0'));
  await first.su.check('test'); first.su.go();
  const onIt = new SamaraUpdates({ root: first.root, codeDir: path.join(first.root, 'versions', '1.0.0'), fetch: release('1.1.0', 'lock-1') as never, changed: () => {}, run, pub: PUB });
  onIt.markGood();
  assert.equal(ptr(first.root).status, 'good');
  npmRuns = 0;
  await onIt.check('test');
  assert.equal(onIt.ready?.version, '1.1.0');
  assert.equal(npmRuns, 0, 'same lock file: its libraries are copied, not installed again');
  onIt.go();
  assert.deepEqual(ptr(first.root).previous, { version: '1.0.0', dir: 'versions/1.0.0' });
});

test('a trial is not marked good by a Samara that is not running it', async () => {
  const { root, su } = setup(release('1.0.0'));
  await su.check('test'); su.go();
  su.markGood();
  assert.equal(ptr(root).status, 'trial');
});

test('go back: to the version before, and the one he left is not offered again until he checks', async () => {
  const first = setup(release('1.0.0'));
  await first.su.check('test'); first.su.go();
  const onIt = new SamaraUpdates({ root: first.root, codeDir: path.join(first.root, 'versions', '1.0.0'), fetch: release('1.1.0') as never, changed: () => {}, run, pub: PUB });
  onIt.markGood(); await onIt.check('test'); onIt.go();
  assert.ok(onIt.goBack());
  assert.equal(ptr(first.root).version, '1.0.0'); assert.equal(ptr(first.root).status, 'good');
  const again = new SamaraUpdates({ root: first.root, codeDir: path.join(first.root, 'versions', '1.0.0'), fetch: release('1.1.0') as never, changed: () => {}, run, pub: PUB });
  await again.check('test');
  assert.equal(again.ready, null);
  again.checkNow();
  await new Promise((r) => setTimeout(r, 300));
  assert.equal((again.ready as { version: string } | null)?.version, '1.1.0');
});

test('skip for good, and put away; an older or equal release is never offered', async () => {
  const a = setup(release('1.0.0'));
  await a.su.check('test'); a.su.skip();
  const b = new SamaraUpdates({ root: a.root, codeDir: mkdtempSync(path.join(os.tmpdir(), 'pcu-code-')), fetch: release('1.0.0') as never, changed: () => {}, run, pub: PUB });
  await b.check('test');
  assert.equal(b.ready, null);
  const c = setup(release('1.0.0'), undefined);
  await c.su.check('test'); c.su.go();
  const d = new SamaraUpdates({ root: c.root, codeDir: path.join(c.root, 'versions', '1.0.0'), fetch: release('1.0.0') as never, changed: () => {}, run, pub: PUB });
  await d.check('test');
  assert.equal(d.ready, null);
});

test('a bundle that is not a Samara release leaves nothing behind', async () => {
  const bad = release('2.0.0');
  const { root, su } = setup(bad);
  const failing = async (cmd: string, args: string[], cwd: string) => (/tar/.test(cmd) ? 1 : run(cmd, args, cwd));
  const s2 = new SamaraUpdates({ root, codeDir: mkdtempSync(path.join(os.tmpdir(), 'pcu-code-')), fetch: bad as never, changed: () => {}, run: failing, pub: PUB });
  await s2.check('test');
  assert.equal(s2.ready, null);
  assert.ok(!existsSync(path.join(root, 'versions', '2.0.0')) && !existsSync(path.join(root, 'versions', '2.0.0.part')));
  void su;
});

// Aang's brain updates from GitHub (2026-10-30): sealed, ready beside the running brain, swapped in only while he is
// away and not in a call, a trial that marks itself good, and a watchdog that puts the old brain back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BrainUpdates, RELEASE_KEY, checkBrain, newer, watchdogScript, type Run } from '../src/brainupdate.ts';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const PUB = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const TGZ = Buffer.from('pretend brain');
const manifest = (o: object = {}) => {
  const text = JSON.stringify({ v: 1, app: 'samara', version: '1.24.0', name: 'Gojo', commit: 'a'.repeat(40), at: '', notes: [], items: [],
    bundle: { file: 'samara-bundle.tgz', sha256: '0'.repeat(64), bytes: 1 }, brain: { file: 'aang-brain.tgz', sha256: createHash('sha256').update(TGZ).digest('hex'), bytes: TGZ.length }, ...o });
  return { text, sig: sign(null, Buffer.from(text), privateKey).toString('base64') };
};
const res = (body: string | Buffer, ok = true) => ({ ok, status: ok ? 200 : 404, text: async () => String(body),
  body: new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array(Buffer.from(body))); c.close(); } }) });

test('the brain carries the same release key as Samara', () => {
  assert.equal(RELEASE_KEY.trim(), readFileSync(new URL('../../Shell/release-key.pub', import.meta.url), 'utf8').replace(/\r/g, '').trim());
});

test('a brain is taken only from a sealed Samara release that carries one', () => {
  const m = manifest();
  assert.equal(checkBrain(m.text, m.sig, PUB)?.version, '1.24.0');
  assert.equal(checkBrain(m.text + ' ', m.sig, PUB), null);
  assert.equal(checkBrain(m.text, m.sig, RELEASE_KEY), null);
  for (const o of [{ brain: undefined }, { brain: { file: '../x.tgz', sha256: '0'.repeat(64), bytes: 1 } }, { app: 'engine' }, { version: '1.24' }]) {
    const b = manifest(o); assert.equal(checkBrain(b.text, b.sig, PUB), null, JSON.stringify(o));
  }
  assert.ok(newer('1.10.0', '1.9.0') && !newer('1.2.3', '1.2.3') && newer('1.0.0', ''));
});

const home = () => {
  const h = mkdtempSync(path.join(os.tmpdir(), 'bu-'));
  mkdirSync(path.join(h, 'core', 'src'), { recursive: true }); mkdirSync(path.join(h, 'core', 'node_modules', 'x'), { recursive: true });
  writeFileSync(path.join(h, 'core', 'package-lock.json'), 'lock'); writeFileSync(path.join(h, 'core', 'brain.json'), JSON.stringify({ version: '1.23.1', commit: 'b'.repeat(12), status: 'good' }));
  return h;
};
/** A pretend tar that unpacks a brain with the same lock file. */
const run: Run = async (cmd, args) => {
  if (cmd === 'tar') { const into = args[args.indexOf('-C') + 1]!; mkdirSync(path.join(into, 'src'), { recursive: true }); writeFileSync(path.join(into, 'src', 'index.ts'), '// new'); writeFileSync(path.join(into, 'package-lock.json'), 'lock'); return 0; }
  return 1;   // npm must not be needed: the lock is the same
};
const fetchFor = (m: { text: string; sig: string }, tag = 'samara-v1.24.0') => (async (url: string) => url.includes('api.github.com') ? res(JSON.stringify({ tag_name: tag }))
  : url.endsWith('manifest.json') ? res(m.text) : url.endsWith('manifest.sig') ? res(m.sig) : url.endsWith('aang-brain.tgz') ? res(TGZ) : res('', false)) as never;

test('a new brain is made ready beside the running one, its libraries copied when the lock is the same', async () => {
  const h = home();
  const bu = new BrainUpdates({ home: h, fetch: fetchFor(manifest()), away: () => null, log: () => {}, exit: () => {}, run, pub: PUB });
  await bu.check();
  assert.equal(bu.ready, '1.24.0');
  assert.ok(existsSync(path.join(h, 'core.next', 'src', 'index.ts')) && existsSync(path.join(h, 'core.next', 'node_modules', 'x')));
  assert.deepEqual(JSON.parse(readFileSync(path.join(h, 'core.next', 'brain.json'), 'utf8')), { version: '1.24.0', commit: 'a'.repeat(12), status: 'trial', said: false });
  assert.ok(existsSync(path.join(h, 'core', 'src')) && !existsSync(path.join(h, 'core', 'src', 'index.ts')), 'the running brain is untouched');
});

test('it goes in only when he is away half an hour and not in a call; then the old one is kept and a watchdog runs', async () => {
  const h = home(); let away = { idle: 60, call: false }; let exits = 0; const dogs: string[] = [];
  const bu = new BrainUpdates({ home: h, fetch: fetchFor(manifest()), away: () => away, log: () => {}, exit: () => exits++, run, pub: PUB, watchdog: (s) => dogs.push(s) });
  await bu.check();
  assert.equal(bu.swapIfQuiet(), false, 'at the keyboard');
  away = { idle: 3600, call: true }; assert.equal(bu.swapIfQuiet(), false, 'in a call');
  away = { idle: 3600, call: false }; assert.equal(bu.swapIfQuiet(), true);
  assert.equal(exits, 1); assert.equal(dogs.length, 1);
  assert.ok(existsSync(path.join(h, 'core', 'src', 'index.ts')) && existsSync(path.join(h, 'core.prev', 'brain.json')));
  assert.equal(bu.installed()?.status, 'trial');
});

test('a version that failed is not tried again; an older or same release is ignored', async () => {
  const h = home(); writeFileSync(path.join(h, 'brain-failed.txt'), '1.24.0\n');
  const bu = new BrainUpdates({ home: h, fetch: fetchFor(manifest()), away: () => null, log: () => {}, exit: () => {}, run, pub: PUB });
  await bu.check(); assert.equal(bu.ready, '');
  const h2 = home(); const old = manifest({ version: '1.23.1' });
  const bu2 = new BrainUpdates({ home: h2, fetch: fetchFor(old, 'samara-v1.23.1'), away: () => null, log: () => {}, exit: () => {}, run, pub: PUB });
  await bu2.check(); assert.equal(bu2.ready, '');
});

test('after the swap: it says so once, and the trial turns good after two minutes up', () => {
  const h = home(); writeFileSync(path.join(h, 'core', 'brain.json'), JSON.stringify({ version: '1.24.0', commit: 'a'.repeat(12), status: 'trial', said: false }));
  const bu = new BrainUpdates({ home: h, fetch: (async () => res('', false)) as never, away: () => null, log: () => {}, exit: () => {} });
  assert.equal(bu.started(), '1.24.0');
  assert.equal(bu.started(), '', 'once');
  bu.stop();
});

test('the watchdog: valid bash, puts the old brain back and remembers the version when the new one is not good', () => {
  const s = watchdogScript("/Users/x/Library/Application Support/AangListener", '1.24.0');
  const f = path.join(mkdtempSync(path.join(os.tmpdir(), 'bu-w-')), 'w.sh'); writeFileSync(f, s);
  execFileSync('bash', ['-n', f]);
  assert.match(s, /mv "\$H\/core\.prev" "\$H\/core"/);
  assert.match(s, /'1\.24\.0' >> "\$H\/brain-failed\.txt"/);
  assert.match(s, /launchctl kickstart -k "gui\/\$\(id -u\)\/com\.aang\.brain"/);
  assert.throws(() => watchdogScript('/x', '1.0; rm -rf ~'));
  // Run for real with the waits cut short: the new brain never got good, so the old one is back.
  const h = home(); writeFileSync(path.join(h, 'core', 'brain.json'), JSON.stringify({ version: '1.24.0', status: 'trial' })); mkdirSync(path.join(h, 'core.prev')); writeFileSync(path.join(h, 'core.prev', 'old'), '1');
  const fast = watchdogScript(h, '1.24.0').replace('for t in 60 90 150', 'for t in 0').replace(/launchctl.*\n/, '\n');
  writeFileSync(f, fast); execFileSync('bash', [f]);
  assert.ok(existsSync(path.join(h, 'core', 'old')) && readFileSync(path.join(h, 'brain-failed.txt'), 'utf8').includes('1.24.0'));
});

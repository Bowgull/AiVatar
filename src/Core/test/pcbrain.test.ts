// The PC's brain from its installed release (2026-11-01): made ready beside the running one, put in at the next start
// or while he is away (never in a call), a trial that goes back if it keeps dying, and nothing from before brain.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PcBrainUpdates, TRIAL_MS, markGood, pick, pointer, sayOnce } from '../src/pcbrain.ts';
import { Scheduler } from '../src/scheduler.ts';
import type { Run } from '../src/brainupdate.ts';

const root = () => mkdtempSync(path.join(os.tmpdir(), 'pcbrain-'));
const install = (r: string, v: string) => { const d = path.join(r, 'versions', v); mkdirSync(path.join(d, 'src'), { recursive: true }); mkdirSync(path.join(d, 'node_modules'), { recursive: true }); writeFileSync(path.join(d, 'src', 'brain.ts'), ''); writeFileSync(path.join(d, 'package-lock.json'), 'lock'); };
const point = (r: string, p: object) => writeFileSync(path.join(r, 'brain.json'), JSON.stringify(p));

test('no installed brain: the code folder', () => {
  assert.equal(pick(root()), null);
});

test('a ready brain goes in at the next start as a trial, and is good after five minutes', async () => {
  const r = root(); install(r, '1.33.1'); install(r, '1.33.2');
  point(r, { version: '1.33.1', status: 'good', previous: null, starts: [], said: true });
  writeFileSync(path.join(r, 'next.txt'), '1.33.2\n');
  assert.equal(pick(r, 1000)?.version, '1.33.2');
  assert.deepEqual(pointer(r), { version: '1.33.2', status: 'trial', previous: { version: '1.33.1' }, starts: [1000], said: false });
  assert.ok(!existsSync(path.join(r, 'next.txt')));
  assert.ok(sayOnce(r, '1.33.2') && !sayOnce(r, '1.33.2'), 'told once');
  install(r, '1.30.0');
  assert.ok(await markGood(r, '1.33.2'));
  assert.equal(pointer(r)?.status, 'good');
  assert.ok(existsSync(path.join(r, 'versions', '1.33.1')) && !existsSync(path.join(r, 'versions', '1.30.0')), 'this one and the one before are kept');
});

test('a trial that keeps dying goes back to the one before and is never tried again', () => {
  const r = root(); install(r, '1.33.1'); install(r, '1.33.2');
  point(r, { version: '1.33.2', status: 'trial', previous: { version: '1.33.1' }, starts: [], said: false });
  for (const t of [1000, 2000, 3000]) assert.equal(pick(r, t)?.version, '1.33.2');
  assert.equal(pick(r, 4000)?.version, '1.33.1');
  assert.equal(pointer(r)?.status, 'good');
  assert.match(readFileSync(path.join(r, 'failed.txt'), 'utf8'), /1\.33\.2/);
  writeFileSync(path.join(r, 'next.txt'), '1.33.2\n');
  assert.equal(pick(r, 5000)?.version, '1.33.1', 'a failed one is not put in again');
});

test('starts spread out over more than five minutes are not a crash loop', () => {
  const r = root(); install(r, '1.33.2');
  point(r, { version: '1.33.2', status: 'trial', previous: null, starts: [], said: false });
  for (let i = 0; i < 6; i++) assert.equal(pick(r, 1000 + i * (TRIAL_MS / 2 + 1))?.version, '1.33.2');
});

test('a first brain that keeps dying goes back to the code folder', () => {
  const r = root(); install(r, '1.33.2');
  point(r, { version: '1.33.2', status: 'trial', previous: null, starts: [], said: false });
  for (const t of [1, 2, 3]) pick(r, t);
  assert.equal(pick(r, 4), null);
  assert.equal(pointer(r), null);
});

// ---------------------------------------------------------------- made ready, then put in when quiet
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const PUB = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const TGZ = Buffer.from('pretend brain');
const manifest = (version: string) => {
  const text = JSON.stringify({ v: 1, app: 'samara', version, name: 'Gojo', commit: 'a'.repeat(40), at: '', notes: [], items: [],
    bundle: { file: 'samara-bundle.tgz', sha256: '0'.repeat(64), bytes: 1 }, brain: { file: 'aang-brain.tgz', sha256: createHash('sha256').update(TGZ).digest('hex'), bytes: TGZ.length } });
  return { text, sig: sign(null, Buffer.from(text), privateKey).toString('base64') };
};
const res = (body: string | Buffer, ok = true) => ({ ok, status: ok ? 200 : 404, text: async () => String(body),
  body: new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array(Buffer.from(body))); c.close(); } }) });
const fetchFor = (version: string) => async (url: string) => {
  const m = manifest(version);
  if (url.endsWith('/latest')) return res(JSON.stringify({ tag_name: `samara-v${version}` }));
  if (url.endsWith('manifest.json')) return res(m.text);
  if (url.endsWith('manifest.sig')) return res(m.sig);
  if (url.endsWith('aang-brain.tgz')) return res(TGZ);
  return res('', false);
};
/** A pretend tar (unpacks a brain, with brain.ts or not) and npm (libraries in). */
const runner = (withBrain = true): Run & { calls: string[] } => {
  const calls: string[] = [];
  const run = (async (cmd: string, args: string[], cwd: string) => {
    calls.push(path.basename(cmd) + ' ' + args.join(' '));
    if (cmd.endsWith('tar.exe')) { mkdirSync(path.join(cwd, 'src'), { recursive: true }); if (withBrain) writeFileSync(path.join(cwd, 'src', 'brain.ts'), ''); writeFileSync(path.join(cwd, 'package-lock.json'), 'lock'); }
    else mkdirSync(path.join(cwd, 'node_modules'), { recursive: true });
    return 0;
  }) as Run & { calls: string[] };
  run.calls = calls;
  return run;
};

test('a newer release is made ready, then goes in only when he has been away half an hour and is not in a call', async () => {
  const r = root(); let away = { idle: 0, call: false }; const n = { exits: 0 };
  const run = runner();
  const bu = new PcBrainUpdates({ root: r, running: '', fetch: fetchFor('1.33.2') as never, away: () => away, log: () => {}, exit: () => { n.exits++; }, run, pub: PUB, sched: new Scheduler() });
  await bu.check();
  assert.equal(bu.ready, '1.33.2');
  assert.ok(run.calls.some((c) => c.startsWith('cmd') || c.includes('npm ci')), 'its libraries installed');
  assert.ok(!existsSync(path.join(r, 'aang-brain-1.33.2.tgz')), 'the download is cleaned up');
  assert.equal(bu.swapIfQuiet(), false, 'he is here');
  away = { idle: 3600, call: true };
  assert.equal(bu.swapIfQuiet(), false, 'in a call');
  assert.equal(n.exits, 0);
  away = { idle: 3600, call: false };
  assert.equal(bu.swapIfQuiet(), true);
  assert.equal(n.exits, 1);
  assert.equal(pick(r)?.version, '1.33.2', 'the restart puts it in');
});

test('the same version again is not downloaded, and one older than the running brain never', async () => {
  const r = root(); install(r, '1.33.2'); point(r, { version: '1.33.2', status: 'good', previous: null, starts: [], said: true });
  const run = runner();
  const bu = new PcBrainUpdates({ root: r, running: '1.33.2', fetch: fetchFor('1.33.2') as never, away: () => ({ idle: 0, call: false }), log: () => {}, exit: () => {}, run, pub: PUB, sched: new Scheduler() });
  await bu.check();
  assert.equal(run.calls.length, 0);
  assert.equal(bu.ready, '');
});

test('a release from before brain.ts is not made ready', async () => {
  const r = root(), logs: string[] = [];
  const bu = new PcBrainUpdates({ root: r, running: '', fetch: fetchFor('1.33.1') as never, away: () => ({ idle: 9999, call: false }), log: (s) => logs.push(s), exit: () => {}, run: runner(false), pub: PUB, sched: new Scheduler() });
  await bu.check();
  assert.equal(bu.ready, '');
  assert.ok(!existsSync(path.join(r, 'versions', '1.33.1')) && !existsSync(path.join(r, 'versions', '1.33.1.part')));
  assert.ok(logs.some((l) => /before the PC ran its own release/.test(l)));
});

test('making a release ready never freezes the brain (node_modules copied off the event loop)', async () => {
  // 2026-11-03: "the brain's event loop stalled ... worst 15365 ms" while 1.45.0 was made ready: cpSync of node_modules.
  const r = root(); install(r, '1.33.1'); point(r, { version: '1.33.1', status: 'good', previous: null, starts: [], said: true });
  const mods = path.join(r, 'versions', '1.33.1', 'node_modules');
  for (let i = 0; i < 60; i++) { const d = path.join(mods, `lib${i}`); mkdirSync(d); for (let k = 0; k < 40; k++) writeFileSync(path.join(d, `f${k}.js`), 'x'.repeat(2000)); }
  const bu = new PcBrainUpdates({ root: r, running: '1.33.1', fetch: fetchFor('1.33.2') as never, away: () => ({ idle: 0, call: false }), log: () => {}, exit: () => {}, run: runner(), pub: PUB, sched: new Scheduler() });
  let last = Date.now(), worst = 0, ticks = 0;
  const beat = setInterval(() => { const n = Date.now(); worst = Math.max(worst, n - last); last = n; ticks++; }, 5);
  try { await bu.check(); } finally { clearInterval(beat); }
  assert.equal(bu.ready, '1.33.2');
  assert.ok(existsSync(path.join(r, 'versions', '1.33.2', 'node_modules', 'lib59', 'f39.js')), 'the libraries came along');
  assert.ok(ticks > 5, `the loop kept ticking during the copy (${ticks} beats)`);
  assert.ok(worst < 400, `the longest the loop stood still: ${worst} ms`);
});

test('a version made ready survives the running one turning good, and still goes in at the next start', async () => {
  // 2026-11-03: 1.45.0 was ready (next.txt) at 10:41; at 10:46 "1.42.0 is good" deleted its folder and its name went too.
  const r = root(); install(r, '1.42.0'); install(r, '1.40.0'); install(r, '1.45.0'); install(r, '1.30.0');
  mkdirSync(path.join(r, 'versions', '1.46.0.part'), { recursive: true });                  // one being made ready right now
  point(r, { version: '1.42.0', status: 'trial', previous: { version: '1.40.0' }, starts: [], said: true });
  writeFileSync(path.join(r, 'next.txt'), '1.45.0\n');
  assert.ok(await markGood(r, '1.42.0'));
  for (const v of ['1.42.0', '1.40.0', '1.45.0', '1.46.0.part']) assert.ok(existsSync(path.join(r, 'versions', v)), `${v} kept`);
  assert.ok(!existsSync(path.join(r, 'versions', '1.30.0')), 'an old one still goes');
  assert.equal(readFileSync(path.join(r, 'next.txt'), 'utf8').trim(), '1.45.0', 'still named');
  assert.equal(pick(r)?.version, '1.45.0', 'the next start takes it');
  assert.ok(!existsSync(path.join(r, 'next.txt')), 'and only then is next.txt cleared');
});

test('next.txt naming a version that is not whole yet is kept, not dropped', () => {
  const r = root(); install(r, '1.42.0'); point(r, { version: '1.42.0', status: 'good', previous: null, starts: [], said: true });
  writeFileSync(path.join(r, 'next.txt'), '1.45.0\n');
  assert.equal(pick(r)?.version, '1.42.0');
  assert.ok(existsSync(path.join(r, 'next.txt')), 'kept for when it is whole');
  writeFileSync(path.join(r, 'next.txt'), '1.41.0\n');
  pick(r);
  assert.ok(!existsSync(path.join(r, 'next.txt')), 'an older one is dropped');
});

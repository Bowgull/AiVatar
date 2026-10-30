// The update engine's install paths (2026-10-30): the Mac's one staged Samara (code, engine, or both), the PC's two
// sources, castLabs' signing and its Terminal sign-in, and the sealed engine releases.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { macUpdateScript } from '../src/macupdate.ts';
import { MacEngine, MacPaths, MacSamara, MacStage, type RunScript } from '../src/macsource.ts';
import { Evs, macSigninScript, pcSigninCommand, readSigning, type Run } from '../src/evs.ts';
import { behindMs, behindWords, checkEngineManifest, latestEngine } from '../src/enginerelease.ts';
import { engineGroups, pcEngine } from '../src/pcsource.ts';
import { UpdateEngine } from '../src/updateengine.ts';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const PUB = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const seal = (o: object) => { const text = JSON.stringify(o, null, 1); return { text, sig: sign(null, Buffer.from(text), privateKey).toString('base64') }; };
const ZIP = Buffer.from('pretend engine zip');
const engineManifest = (v = '44.9.3', extra: object = {}) => ({ v: 1, app: 'engine', version: v, castlabs: `v${v}+wvcus`, chrome: '152.0.7977.167', published: '2026-10-22T21:31:20Z', at: '2026-10-30T09:17:00Z',
  assets: [{ platform: 'darwin-x64', file: `castlabs-${v}-darwin-x64.zip`, sha256: createHash('sha256').update(ZIP).digest('hex'), bytes: ZIP.length }], ...extra });
const res = (body: string | Buffer, ok = true) => ({ ok, status: ok ? 200 : 404, text: async () => String(body),
  body: new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array(Buffer.from(body))); c.close(); } }) });

// ---------------------------------------------------------------- the Mac's script
const base = { bundle: '/x/samara-1.24.0.tgz', version: '1.24.0', commit: 'a'.repeat(40) };
const bashOk = (s: string) => { const f = path.join(mkdtempSync(path.join(os.tmpdir(), 'ip-')), 'u.sh'); writeFileSync(f, s); execFileSync('bash', ['-n', f]); return f; };

test('Mac script: code only, engine only, or both; anything else is refused', () => {
  const engine = { app: "/Users/x/Library/Application Support/AangListener/browser/engines/castlabs-44.9.3/Electron.app", version: '44.9.3' };
  const code = macUpdateScript(base), eng = macUpdateScript({ ...base, bundle: '', commit: 'b'.repeat(12), engine }), both = macUpdateScript({ ...base, engine });
  for (const s of [code, eng, both]) bashOk(s);
  assert.match(code, /VERSION='1\.24\.0'; BUNDLE='\/x\/samara-1\.24\.0\.tgz'; ENGINE=''/);
  assert.match(eng, /VERSION='1\.24\.0\+44\.9\.3'; BUNDLE=''; ENGINE='\/Users\/x\/Library\/Application Support/);
  assert.match(both, /"engine":"44\.9\.3"/);
  assert.throws(() => macUpdateScript({ ...base, bundle: '' }), 'no code and no engine is nothing to do');
  assert.throws(() => macUpdateScript({ ...base, engine: { app: '/tmp/evil.sh', version: '44.9.3' } }));
  assert.throws(() => macUpdateScript({ ...base, engine: { ...engine, version: '44.9.3; rm -rf ~' } }));
});

test('Mac script: an engine not signed for video is never put in; the video signature comes before the Mac\'s own', () => {
  const s = macUpdateScript({ ...base, engine: { app: '/e/Electron.app', version: '44.9.3' } });
  assert.match(s, /Electron Framework\.sig" \] \|\| \{ echo "The new engine is not signed for video\."; exit 1; \}/);
  assert.ok(s.indexOf('Electron Framework.sig') < s.indexOf('sign_app "$NEWAPP"'));
  // A failed trial puts the engine on its own list, the code on its own.
  assert.match(s, /\[ -n "\$EV" \] && echo "\$EV" >> "\$BR\/failed-engines\.txt"/);
});

test('Mac script with an engine: the stage refuses to build when the engine is not signed (run for real)', () => {
  const home = mkdtempSync(path.join(os.tmpdir(), 'ip-home-'));
  const app = path.join(home, 'castlabs', 'Electron.app'); mkdirSync(app, { recursive: true });
  const f = bashOk(macUpdateScript({ ...base, bundle: '', engine: { app, version: '44.9.3' } }));
  let out = ''; try { execFileSync('bash', [f, 'prepare'], { env: { ...process.env, HOME: home }, stdio: 'pipe' }); } catch (e) { out = String((e as { stdout: Buffer }).stdout); }
  assert.match(out, /not signed for video/);
});

// ---------------------------------------------------------------- the Mac's stage
const macHome = () => {
  const l = mkdtempSync(path.join(os.tmpdir(), 'ip-l-')); const p = new MacPaths(l);
  mkdirSync(p.br, { recursive: true });
  writeFileSync(p.installed, JSON.stringify({ version: '1.23.0', commit: 'c'.repeat(12), status: 'good' }));
  return p;
};
/** A pretend prepare: writes staged/version the way the script does. */
const fakeRun = (p: MacPaths, calls: string[], code = 0): RunScript => async (script, phase) => {
  calls.push(phase);
  if (phase === 'prepare' && code === 0) { const v = /VERSION='([^']+)'/.exec(readFileSync(script, 'utf8'))![1]!; mkdirSync(path.dirname(p.staged), { recursive: true }); writeFileSync(p.staged, v); }
  return code;
};

test('Mac stage: one build holds whatever is ready; a change rebuilds; swap only once ready', async () => {
  const p = macHome(), calls: string[] = [];
  const st = new MacStage(p, { run: fakeRun(p, calls), log: () => {}, changed: () => {} });
  assert.deepEqual(await st.swap(), { ok: false, why: 'The update is not ready yet. It will show up again when it is.' });
  st.engine = { version: '44.9.3', app: '/e/Electron.app' };
  await st.build();
  assert.equal(st.key(), '1.23.0+44.9.3', 'engine only: on the Samara he runs');
  assert.ok(st.ready());
  st.samara = { m: { version: '1.24.0', commit: 'd'.repeat(40), notes: [], at: '' } as never, bundle: '/x/samara-1.24.0.tgz' };
  assert.ok(!st.ready(), 'a new piece: not ready until rebuilt');
  await st.build();
  assert.equal(st.key(), '1.24.0+44.9.3'); assert.ok(st.ready());
  writeFileSync(p.script, '#!/bin/bash\necho changed');
  assert.ok(!st.ready(), 'a script changed after it was built is never run');
  await st.build(); assert.ok(!st.ready(), 'and not rebuilt over silently either (same key)');
  assert.deepEqual(calls, ['prepare', 'prepare']);
});

test('Mac stage: a failed build is not ready; a hand install (no release number) waits', async () => {
  const p = macHome(), calls: string[] = [];
  const st = new MacStage(p, { run: fakeRun(p, calls, 1), log: () => {}, changed: () => {} });
  st.engine = { version: '44.9.3', app: '/e/Electron.app' };
  await st.build(); assert.ok(!st.ready());
  writeFileSync(p.installed, JSON.stringify({ version: 'manual-01b3', commit: '', status: 'good' }));
  const logs: string[] = [];
  const st2 = new MacStage(p, { run: fakeRun(p, calls), log: (s) => logs.push(s), changed: () => {} });
  st2.engine = { version: '44.9.3', app: '/e/Electron.app' };
  await st2.build();
  assert.ok(!st2.ready() && /waits for the next Samara release/.test(logs.join()));
});

test('Mac engine: a sealed engine is downloaded, unpacked, signed for video, then staged; Restart now swaps once', async () => {
  const p = macHome(), calls: string[] = [];
  const st = new MacStage(p, { run: fakeRun(p, calls), log: () => {}, changed: () => {} });
  const m = seal(engineManifest());
  const fetch = async (url: string) => url.includes('api.github.com') ? res(JSON.stringify([{ tag_name: 'samara-v1.23.1' }, { tag_name: 'engine-v44.9.3' }, { tag_name: 'engine-v44.7.0' }]))
    : url.endsWith('engine.json') ? res(m.text) : url.endsWith('engine.sig') ? res(m.sig) : url.endsWith('.zip') ? res(ZIP) : url.includes('chromiumdash') ? res(JSON.stringify([{ version: '153.0.1.1', time: Date.now() - 42 * 86_400_000 }])) : res('', false);
  let signed = 0;
  const evs = { sign: async () => { signed++; return 'ok'; }, loginStamp: () => 0, openSignin: async () => true, watchSignin: () => () => {} } as unknown as Evs;
  const unzip = async (_zip: string, into: string) => { mkdirSync(path.join(into, 'Electron.app'), { recursive: true }); return true; };
  const e = new MacEngine(p, st, { fetch: fetch as never, log: () => {}, changed: () => {}, evs, unzip, have: () => '44.5.1', chrome: () => '150.0.1.1', pub: PUB });
  await e.check('test');
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(signed, 1);
  const o = e.ready()!;
  assert.equal(o.version, '44.9.3'); assert.equal(o.title, "Samara's engine 44.9.3");
  assert.equal(o.behind, "Your engine today is 6 weeks behind Chrome's security fixes. This one is 6 weeks behind.");
  assert.deepEqual(o.groups[0]!.items.map((i) => i.text), ["Chrome's newest security fixes.", 'Netflix and Prime keep playing in your tabs.']);
  const samara = new MacSamara(p, st, { fetch: fetch as never, log: () => {}, changed: () => {}, pub: PUB });
  const restarts: string[][] = [];
  const ue = new UpdateEngine({ sources: [samara, e], moment: () => ({ now: new Date(), idleSeconds: 0, inCall: false, inGame: false }), overnight: () => false, changed: () => {}, restart: (w) => restarts.push(w.sources) });
  assert.deepEqual(await ue.go(), { ok: true });
  assert.deepEqual(calls.filter((c) => c === 'swap'), ['swap'], 'one swap for one staged Samara');
});

test('Mac engine: when castLabs wants a sign-in, the key asks; Terminal opens; once he is in, it signs and stages', async () => {
  const p = macHome(), calls: string[] = [];
  const st = new MacStage(p, { run: fakeRun(p, calls), log: () => {}, changed: () => {} });
  const m = seal(engineManifest());
  const fetch = async (url: string) => url.includes('api.github.com') ? res(JSON.stringify([{ tag_name: 'engine-v44.9.3' }])) : url.endsWith('engine.json') ? res(m.text) : url.endsWith('engine.sig') ? res(m.sig) : url.endsWith('.zip') ? res(ZIP) : res('', false);
  let answer: 'signin' | 'ok' = 'signin', opened = 0, watcher: ((ok: boolean) => void) | null = null;
  const evs = { sign: async () => answer, loginStamp: () => 0, openSignin: async () => { opened++; return true; }, watchSignin: (_s: number, done: (ok: boolean) => void) => { watcher = done; return () => {}; } } as unknown as Evs;
  const unzip = async (_z: string, into: string) => { mkdirSync(path.join(into, 'Electron.app'), { recursive: true }); return true; };
  const e = new MacEngine(p, st, { fetch: fetch as never, log: () => {}, changed: () => {}, evs, unzip, have: () => '44.5.1', pub: PUB });
  await e.check('test');
  assert.equal(e.ready()?.signin, 'ask');
  const ue = new UpdateEngine({ sources: [e], moment: () => ({ now: new Date(), idleSeconds: 0, inCall: false, inGame: false }), overnight: () => true, changed: () => {}, restart: () => {} });
  assert.deepEqual(await ue.go(), { ok: false, why: 'Sign in to castLabs first, so the new engine plays video.' });
  assert.ok(await ue.signin()); assert.equal(opened, 1); assert.equal(e.ready()?.signin, 'waiting');
  answer = 'ok'; watcher!(true);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(e.ready()?.signin, undefined); assert.ok(st.ready(), 'signed and staged');
});

// ---------------------------------------------------------------- castLabs' tool
test('castLabs: its answers are read as signed, sign in, refused (switches) or failed', () => {
  assert.equal(readSigning(0, 'Signed'), 'ok');
  assert.equal(readSigning(1, 'ValidityError: Binary signature denied'), 'denied');
  assert.equal(readSigning(1, 'Authentication failed: token expired'), 'signin');
  assert.equal(readSigning(1, 'EOFError: EOF when reading a line'), 'signin', 'it asked for a password and got none');
  assert.equal(readSigning(1, 'No such file'), 'failed');
});

test('castLabs sign-in: the Terminal file types only the command, the password is never in it', () => {
  const py = "/Users/x/Library/Application Support/AangListener/evs/bin/python3";
  const s = macSigninScript(py);
  assert.match(s, /^#!\/bin\/bash/);
  assert.ok(s.includes(`'${py}' '-m' 'castlabs_evs.account' 'reauth'`));
  bashOk(s);
  assert.equal(pcSigninCommand("C:\\Users\\o'b\\evs\\python.exe").includes("& 'C:\\Users\\o''b\\evs\\python.exe' -m castlabs_evs.account reauth"), true);
});

test('castLabs\' tool is installed once, then signs; on the PC Terminal falls back to PowerShell', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ip-evs-'));
  const runs: string[] = []; let installed = false;
  const run: Run = async (cmd, args) => { runs.push([path.basename(cmd), ...args.slice(0, 3)].join(' ')); if (args.includes('import castlabs_evs')) return { code: installed ? 0 : 1, text: '' }; if (args.includes('pip')) installed = true; return { code: 0, text: '' }; };
  const opens: string[] = [];
  const evs = new Evs({ dir, platform: 'win32', run, open: async (cmd) => { opens.push(cmd); return cmd !== 'wt.exe'; }, log: () => {} });
  mkdirSync(path.join(dir, 'Scripts'), { recursive: true }); writeFileSync(path.join(dir, 'Scripts', 'python.exe'), '');
  assert.equal(await evs.sign('C:\\engines\\castlabs-44.9.3'), 'ok');
  assert.ok(runs.some((r) => r.startsWith('python -m venv')) && runs.some((r) => r.includes('pip install')));
  assert.ok(runs.at(-1)!.includes('-m castlabs_evs.vmp sign-pkg'));
  assert.ok(await evs.openSignin());
  assert.deepEqual(opens, ['wt.exe', 'powershell.exe']);
});

test('castLabs sign-in is noticed by its own file changing, never by reading it', async () => {
  const f = path.join(mkdtempSync(path.join(os.tmpdir(), 'ip-cfg-')), 'config.json'); writeFileSync(f, '{}');
  const evs = new Evs({ loginFile: f, log: () => {} });
  const since = evs.loginStamp();
  const got = await new Promise<boolean>((res) => { evs.watchSignin(since, res, 2000, 20); setTimeout(() => { const t = new Date(Date.now() + 5000); utimesSync(f, t, t); }, 60); });
  assert.equal(got, true);
  assert.equal(await new Promise<boolean>((res) => evs.watchSignin(evs.loginStamp(), res, 100, 20)), false, 'gives up after a while');
});

// ---------------------------------------------------------------- engine releases
test('an engine release is used only with his seal, and only as castLabs named it', () => {
  const ok = seal(engineManifest());
  assert.equal(checkEngineManifest(ok.text, ok.sig, PUB)?.version, '44.9.3');
  assert.equal(checkEngineManifest(ok.text + ' ', ok.sig, PUB), null);
  for (const bad of [{ app: 'samara' }, { castlabs: 'v44.9.4+wvcus' }, { chrome: '152' }, { assets: [{ platform: 'darwin-x64', file: '../evil.zip', sha256: '0'.repeat(64), bytes: 1 }] }, { assets: [{ platform: 'linux', file: 'castlabs-44.9.3-linux.zip', sha256: '0'.repeat(64), bytes: 1 }] }]) {
    const s = seal(engineManifest('44.9.3', bad));
    assert.equal(checkEngineManifest(s.text, s.sig, PUB), null, JSON.stringify(bad));
  }
});

test('the newest sealed engine newer than this one, with a download for this machine', async () => {
  const m = seal(engineManifest('44.9.3'));
  const fetch = async (url: string) => url.includes('api.github.com') ? res(JSON.stringify([{ tag_name: 'samara-v1.24.0' }, { tag_name: 'engine-v44.9.3' }, { tag_name: 'engine-v45.0.0', prerelease: true }])) : url.endsWith('engine.json') ? res(m.text) : res(m.sig);
  assert.equal((await latestEngine(fetch as never, '44.5.1', 'darwin-x64', undefined, PUB))?.m.version, '44.9.3');
  assert.equal(await latestEngine(fetch as never, '44.9.3', 'darwin-x64', undefined, PUB), null, 'already on it');
  assert.equal(await latestEngine(fetch as never, '44.5.1', 'win32-x64', undefined, PUB), null, 'nothing for this machine');
});

test('behind Chrome: since the first Chrome release newer than the engine\'s Chromium', () => {
  const now = Date.UTC(2026, 9, 30), day = 86_400_000;
  const list = [{ version: '152.0.7977.167', time: now - 60 * day }, { version: '152.0.7977.200', time: now - 42 * day }, { version: '153.0.1.1', time: now - 2 * day }];
  assert.equal(behindWords(behindMs('152.0.7977.167', list, now)), '6 weeks');
  assert.equal(behindWords(behindMs('152.0.7977.200', list, now)), '2 days');
  assert.equal(behindMs('153.0.1.1', list, now), 0);
  assert.equal(behindWords(0), 'less than a day');
});

// ---------------------------------------------------------------- the PC
test('PC engine: video wins, so no tick boxes; sign-in shows on the key; Restart now goes through the engine', async () => {
  assert.equal(engineGroups('44.9.3', Date.now(), 'PC')[0]!.items.some((i) => i.key), false);
  const calls: string[] = [];
  const eu = { signin: null as null | 'ask', signinFor: null as null | { version: string; since: number }, ready: { version: '44.9.3', since: 1 } as null | { version: string; since: number }, behind: 'x', canBack: () => false,
    restartNow: async (_b: boolean, _c: unknown, night?: { title: string }) => { calls.push('restart ' + (night?.title ?? '-')); return { ok: true }; }, openSignin: async () => { calls.push('signin'); return true; }, check: async () => {}, file() {}, skip() {}, goBack: () => false, checkNow: async () => {} };
  const src = pcEngine(eu as never, { browserOpen: () => true });
  assert.equal(src.ready()?.behind, 'x');
  const ue = new UpdateEngine({ sources: [src], moment: () => ({ now: new Date(2026, 9, 30, 3), idleSeconds: 3600, inCall: false, inGame: false }), overnight: () => true, changed: () => {}, beforeGo: (w) => { src.overnight = w.overnight ? { title: w.title, lines: w.lines } : null; }, restart: () => calls.push('exit') });
  await ue.tick();
  assert.deepEqual(calls, ["restart Samara's engine 44.9.3", 'exit']);
  eu.ready = null; eu.signin = 'ask'; eu.signinFor = { version: '44.9.3', since: 1 };
  assert.equal(src.ready()?.signin, 'ask');
  assert.ok(await ue.signin()); assert.equal(calls.at(-1), 'signin');
});

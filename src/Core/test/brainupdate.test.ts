// Aang's brain updates from GitHub (2026-10-30): sealed, ready beside the running brain, swapped in only while he is
// away and not in a call, a trial that marks itself good, and a watchdog that puts the old brain back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BrainUpdates, RELEASE_KEY, checkBrain, librariesMatch, newer, watchdogScript, type Run } from '../src/brainupdate.ts';

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

/** A pretend launchctl on PATH: `print` shows a pid only while `pet-up` exists; every call is written down. */
const fakeLaunchd = (petUp: boolean) => {
  const d = mkdtempSync(path.join(os.tmpdir(), 'bu-l-')), calls = path.join(d, 'calls');
  writeFileSync(path.join(d, 'launchctl'), `#!/bin/bash\necho "$*" >> '${calls}'\nif [ "$1" = print ] && [ -f '${d}/pet-up' ]; then printf '\\tstate = running\\n\\tpid = 4242\\n'; fi\nexit 0\n`, { mode: 0o755 });
  if (petUp) writeFileSync(path.join(d, 'pet-up'), '');
  return { env: { ...process.env, PATH: `${d}:${process.env.PATH}` }, calls: () => { try { return readFileSync(calls, 'utf8'); } catch { return ''; } } };
};
const fastDog = (s: string) => s.replace('for t in 60 90 150', 'for t in 0').replace('sleep 30;', 'sleep 0;').replace('sleep 60;', 'sleep 0;');

test('the watchdog: valid bash, puts the old brain back and remembers the version when the new one is not good', () => {
  const s = watchdogScript("/Users/x/Library/Application Support/AangListener", '1.24.0');
  const f = path.join(mkdtempSync(path.join(os.tmpdir(), 'bu-w-')), 'w.sh'); writeFileSync(f, s);
  execFileSync('bash', ['-n', f]);
  assert.match(s, /mv "\$H\/core\.prev" "\$H\/core"/);
  assert.match(s, /BRAIN='1\.24\.0'/); assert.match(s, /echo "\$BRAIN" >> "\$H\/brain-failed\.txt"/);
  assert.match(s, /launchctl kickstart -k "\$U\/com\.aang\.brain"/);
  assert.throws(() => watchdogScript('/x', '1.0; rm -rf ~'));
  assert.throws(() => watchdogScript('/x', '', ''));
  assert.throws(() => watchdogScript('/x', '', "1.0'; rm -rf ~"));
  // Run for real with the waits cut short: the new brain never got good, so the old one is back.
  const h = home(); writeFileSync(path.join(h, 'core', 'brain.json'), JSON.stringify({ version: '1.24.0', status: 'trial' })); mkdirSync(path.join(h, 'core.prev')); writeFileSync(path.join(h, 'core.prev', 'old'), '1');
  const l = fakeLaunchd(true);
  writeFileSync(f, fastDog(watchdogScript(h, '1.24.0'))); execFileSync('bash', [f], { env: l.env });
  assert.ok(existsSync(path.join(h, 'core', 'old')) && readFileSync(path.join(h, 'brain-failed.txt'), 'utf8').includes('1.24.0'));
  assert.match(l.calls(), /kickstart -k gui\/\d+\/com\.aang\.brain/);
});

test('the watchdog: after a brain update, Aang\'s app is started when it is not running, and left alone when it is', () => {
  for (const up of [false, true]) {
    const h = home(); mkdirSync(path.join(h, 'aang-app')); writeFileSync(path.join(h, 'core', 'brain.json'), JSON.stringify({ version: '1.24.0', status: 'good' }));
    const l = fakeLaunchd(up), f = path.join(h, 'w.sh');
    writeFileSync(f, fastDog(watchdogScript(h, '1.24.0'))); execFileSync('bash', [f], { env: l.env });
    assert.equal(/kickstart -k gui\/\d+\/com\.aang\.pet/.test(l.calls()), !up, up ? 'running: left alone' : 'not running: started');
    assert.ok(!/com\.aang\.brain/.test(l.calls()), 'a good brain is left alone');
  }
});

test('the watchdog: a new app is started at once, and put back when it does not stay up', () => {
  for (const up of [true, false]) {
    const h = home(); mkdirSync(path.join(h, 'aang-app')); writeFileSync(path.join(h, 'aang-app', 'new'), '1'); mkdirSync(path.join(h, 'aang-app.prev')); writeFileSync(path.join(h, 'aang-app.prev', 'old'), '1');
    const l = fakeLaunchd(up), f = path.join(h, 'w.sh');
    writeFileSync(f, fastDog(watchdogScript(h, '', '1.24.0'))); execFileSync('bash', ['-n', f]); execFileSync('bash', [f], { env: l.env });
    assert.match(l.calls(), /kickstart -k gui\/\d+\/com\.aang\.pet/);
    assert.equal(existsSync(path.join(h, 'aang-app', 'new')), up);
    assert.equal(existsSync(path.join(h, 'aang-app', 'old')), !up);
    assert.equal(existsSync(path.join(h, 'aang-app-failed.txt')), !up);
  }
});

// ---------------------------------------------------------------- Aang's Mac app
const APP_TGZ = Buffer.from('pretend app');
const withApp = (o: object = {}) => manifest({ aang: { file: 'aang-app.tgz', sha256: createHash('sha256').update(APP_TGZ).digest('hex'), bytes: APP_TGZ.length }, ...o });
const appFetch = (m: { text: string; sig: string }) => (async (url: string) => url.endsWith('aang-app.tgz') ? res(APP_TGZ) : (fetchFor(m) as unknown as (u: string) => Promise<unknown>)(url)) as never;
/** His app as tools/install-mac-aang.sh leaves it: code, libraries (electron 44.7.0), helpers built here. */
const withAppHome = () => {
  const h = home(), a = path.join(h, 'aang-app');
  for (const d of ['src', 'mac', 'bin', 'node_modules/electron', 'assets/frames']) mkdirSync(path.join(a, d), { recursive: true });
  writeFileSync(path.join(a, 'src', 'macaang.ts'), '// old'); writeFileSync(path.join(a, 'mac', 'clicks.swift'), 'clicks'); writeFileSync(path.join(a, 'mac', 'look.swift'), 'look');
  writeFileSync(path.join(a, 'bin', 'aang-clicks'), 'built'); writeFileSync(path.join(a, 'bin', 'aang-look'), 'built');
  writeFileSync(path.join(a, 'node_modules', 'electron', 'package.json'), JSON.stringify({ version: '44.7.0' }));
  return h;
};
/** A pretend tar for both parts: the brain, or the app (its art under assets/aang, as the release packs it). */
const appRun = (o: { electron?: string; look?: string } = {}, calls: string[] = []): Run => async (cmd, args, cwd, env) => {
  calls.push([path.basename(cmd), ...args.slice(0, 1)].join(' ') + (env ? ' +env' : ''));
  if (cmd === 'tar' && cwd.includes('aang-app')) {
    const into = args[args.indexOf('-C') + 1]!;
    for (const d of ['src', 'mac', 'assets/aang/frames', 'assets/aang/sfx']) mkdirSync(path.join(into, d), { recursive: true });
    writeFileSync(path.join(into, 'src', 'macaang.ts'), '// new'); writeFileSync(path.join(into, 'mac', 'clicks.swift'), 'clicks'); writeFileSync(path.join(into, 'mac', 'look.swift'), o.look ?? 'look');
    writeFileSync(path.join(into, 'assets', 'aang', 'frames', 'idle_0.png'), 'png');
    writeFileSync(path.join(into, 'package.json'), JSON.stringify({ dependencies: { electron: o.electron ?? '44.7.0' } }));
    writeFileSync(path.join(into, 'package-lock.json'), JSON.stringify({ packages: { 'node_modules/electron': { version: o.electron ?? '44.7.0' } } }));
    return 0;
  }
  if (cmd === '/bin/cp') { execFileSync('cp', args); return 0; }
  if (cmd === '/usr/bin/swiftc') { writeFileSync(args[args.indexOf('-o') + 1]!, 'rebuilt'); return 0; }
  if (cmd.endsWith('npm')) { mkdirSync(path.join(cwd, 'node_modules', 'electron'), { recursive: true }); return 0; }
  return run(cmd, args, cwd);
};

test('Aang\'s app is taken from the release when it carries it; a bad entry is left out, the brain still counts', () => {
  const m = withApp();
  assert.equal(checkBrain(m.text, m.sig, PUB)?.aang?.file, 'aang-app.tgz');
  assert.equal(checkBrain(manifest().text, manifest().sig, PUB)?.aang, undefined, 'older releases carry no app');
  const bad = withApp({ aang: { file: '../x.tgz', sha256: '0'.repeat(64), bytes: 1 } });
  assert.equal(checkBrain(bad.text, bad.sig, PUB)?.version, '1.24.0'); assert.equal(checkBrain(bad.text, bad.sig, PUB)?.aang, undefined);
});

test('Aang\'s app is made ready beside the running one: art in place, libraries cloned, helpers carried over', async () => {
  const h = withAppHome(), calls: string[] = [];
  const bu = new BrainUpdates({ home: h, fetch: appFetch(withApp()), away: () => null, log: () => {}, exit: () => {}, run: appRun({}, calls), pub: PUB });
  await bu.check();
  assert.equal(bu.readyApp, '1.24.0'); assert.equal(bu.ready, '1.24.0');
  const n = path.join(h, 'aang-app.next');
  assert.equal(readFileSync(path.join(n, 'src', 'macaang.ts'), 'utf8'), '// new');
  assert.ok(existsSync(path.join(n, 'assets', 'frames', 'idle_0.png')) && existsSync(path.join(n, 'assets', 'sfx')) && !existsSync(path.join(n, 'assets', 'aang')));
  assert.ok(existsSync(path.join(n, 'node_modules', 'electron', 'package.json')));
  assert.equal(readFileSync(path.join(n, 'bin', 'aang-clicks'), 'utf8'), 'built');
  assert.deepEqual(JSON.parse(readFileSync(path.join(n, 'app.json'), 'utf8')), { version: '1.24.0', commit: 'a'.repeat(12) });
  assert.ok(!calls.some((c) => /npm|swiftc/.test(c)), calls.join());
  assert.equal(readFileSync(path.join(h, 'aang-app', 'src', 'macaang.ts'), 'utf8'), '// old', 'the running app is untouched');
});

test('Aang\'s app: a changed helper is built here; new libraries are installed (with the engine\'s own step)', async () => {
  const h = withAppHome(), calls: string[] = [];
  const bu = new BrainUpdates({ home: h, fetch: appFetch(withApp()), away: () => null, log: () => {}, exit: () => {}, run: appRun({ look: 'look v2', electron: '44.8.0' }, calls), pub: PUB });
  await bu.check();
  assert.equal(bu.readyApp, '1.24.0');
  const n = path.join(h, 'aang-app.next');
  assert.equal(readFileSync(path.join(n, 'bin', 'aang-look'), 'utf8'), 'rebuilt'); assert.equal(readFileSync(path.join(n, 'bin', 'aang-clicks'), 'utf8'), 'built');
  assert.ok(calls.includes('npm ci +env'), calls.join());
  assert.ok(!librariesMatch(path.join(h, 'aang-app', 'node_modules'), n));
});

test('Aang\'s app: not on this Mac, already this version, or failed before: nothing is made ready', async () => {
  const none = home();
  const bu = new BrainUpdates({ home: none, fetch: appFetch(withApp()), away: () => null, log: () => {}, exit: () => {}, run: appRun(), pub: PUB });
  await bu.check(); assert.equal(bu.readyApp, ''); assert.equal(bu.ready, '1.24.0');
  const same = withAppHome(); writeFileSync(path.join(same, 'aang-app', 'app.json'), JSON.stringify({ version: '1.24.0' }));
  const bu2 = new BrainUpdates({ home: same, fetch: appFetch(withApp()), away: () => null, log: () => {}, exit: () => {}, run: appRun(), pub: PUB });
  await bu2.check(); assert.equal(bu2.readyApp, '');
  const failed = withAppHome(); writeFileSync(path.join(failed, 'aang-app-failed.txt'), '1.24.0\n');
  const bu3 = new BrainUpdates({ home: failed, fetch: appFetch(withApp()), away: () => null, log: () => {}, exit: () => {}, run: appRun(), pub: PUB });
  await bu3.check(); assert.equal(bu3.readyApp, '');
});

test('Aang\'s app goes in at the same quiet moment; alone it does not restart the brain', async () => {
  // App and brain together: one watchdog for both, the brain exits once.
  const h = withAppHome(); let exits = 0; const dogs: string[] = [];
  const bu = new BrainUpdates({ home: h, fetch: appFetch(withApp()), away: () => ({ idle: 3600, call: false }), log: () => {}, exit: () => exits++, run: appRun(), pub: PUB, watchdog: (s) => dogs.push(s) });
  await bu.check();
  assert.equal(bu.swapIfQuiet(), true);
  assert.equal(exits, 1); assert.equal(dogs.length, 1); assert.match(dogs[0]!, /BRAIN='1\.24\.0'; APP='1\.24\.0'/);
  assert.equal(readFileSync(path.join(h, 'aang-app', 'src', 'macaang.ts'), 'utf8'), '// new');
  assert.equal(readFileSync(path.join(h, 'aang-app.prev', 'src', 'macaang.ts'), 'utf8'), '// old');
  assert.equal(bu.appInstalled(), '1.24.0');
  // Only the app (the brain is already this version): the brain keeps running.
  const h2 = withAppHome(); writeFileSync(path.join(h2, 'core', 'brain.json'), JSON.stringify({ version: '1.24.0', commit: 'a'.repeat(12), status: 'good' }));
  let exits2 = 0; const dogs2: string[] = []; let away = { idle: 60, call: false };
  const bu2 = new BrainUpdates({ home: h2, fetch: appFetch(withApp()), away: () => away, log: () => {}, exit: () => exits2++, run: appRun(), pub: PUB, watchdog: (s) => dogs2.push(s) });
  await bu2.check();
  assert.equal(bu2.ready, ''); assert.equal(bu2.readyApp, '1.24.0');
  assert.equal(bu2.swapIfQuiet(), false, 'at the keyboard');
  away = { idle: 3600, call: false };
  assert.equal(bu2.swapIfQuiet(), true);
  assert.equal(exits2, 0); assert.match(dogs2[0]!, /BRAIN=''; APP='1\.24\.0'/);
  assert.equal(bu2.swapIfQuiet(), false, 'nothing left');
});

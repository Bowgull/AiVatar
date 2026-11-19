// The secret window's own logins (his ask, 2026-11-19: "save logins thats only stored on mac? in this vault?"): sealed in
// its folder, readable only after its PIN, and never a call to Bitwarden's tool from the secret window.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// A stand-in for Bitwarden's tool that leaves a mark if anything ever runs it (set before vault.ts is loaded): node itself,
// told to write the mark as it starts (only children get this setting).
const d = mkdtempSync(path.join(os.tmpdir(), 'slog-'));
const mark = path.join(d, 'bw-ran.txt');
const marker = path.join(d, 'mark.cjs');
writeFileSync(marker, `require('fs').appendFileSync(${JSON.stringify(mark)}, 'ran'); process.exit(0);`);
process.env.AANG_TEST_BW = process.execPath;
process.env.NODE_OPTIONS = `--require ${JSON.stringify(marker)}`;
const { SealedDir } = await import('../src/sealdir.ts');
const { SecretLogins } = await import('../src/secretlogins.ts');
const { Vault } = await import('../src/vault.ts');

const kc = { lock: (s: string) => 'k' + s, open: (s: string) => s.slice(1) };
const room = () => { const s = path.join(mkdtempSync(path.join(os.tmpdir(), 'slog-r-')), 'secret'); mkdirSync(s); return { s, r: new SealedDir(s, kc) }; };
const PASS = 'correct-horse-battery-staple-91';

test('saved and filled back, sealed on disk with nothing in plain text', async () => {
  const { s, r } = room();
  r.open();
  const v = new SecretLogins(path.join(s, 'secret-logins.json'), () => r.isOpen);
  assert.equal(await v.state(), 'unlocked');
  assert.ok(await v.create('www.hidden.example', 'josh@hidden.example', PASS));
  assert.ok(await v.create('hidden.example', 'josh@hidden.example', PASS + '-new'), 'same site and user: replaced');
  const list = await v.loginsFor('https://hidden.example/login');
  assert.equal(list?.length, 1);
  assert.equal(list![0]!.username, 'josh@hidden.example');
  assert.deepEqual(await v.secret(list![0]!.id), { username: 'josh@hidden.example', password: PASS + '-new' });
  assert.deepEqual(await v.loginsFor('https://forum.hidden.example/'), [], 'only the exact site');
  assert.deepEqual(await v.loginHosts(), ['hidden.example']);
  for (const f of readdirSync(s)) {
    const b = readFileSync(path.join(s, f), 'latin1');
    assert.ok(!b.includes(PASS) && !b.includes('josh@') && !b.includes('hidden.example'), `${f} holds nothing in plain text`);
  }
  // locked: no logins, nothing saved
  r.close();
  assert.equal(await v.state(), 'locked');
  assert.equal(v.current(), null);
  assert.equal(await v.loginsFor('https://hidden.example/'), null);
  assert.equal(await v.secret(list![0]!.id), null);
  assert.equal(await v.create('other.example', 'a', 'b'), false);
  // opened again (its PIN): still there
  r.open();
  assert.equal((await v.loginsFor('https://hidden.example/'))?.length, 1);
  r.close();
});

test('it never runs Bitwarden\'s tool: every question, locked and open', async () => {
  const { s, r } = room();
  const v = new SecretLogins(path.join(s, 'secret-logins.json'), () => r.isOpen);
  const ask = async () => {
    await v.state(); await v.unlock(); await v.useSession(); await v.loginsFor('https://a.example/'); await v.loginHosts();
    await v.secret('00000000-0000-0000-0000-000000000000'); await v.create('a.example', 'u', 'p'); v.lock(); v.lockHard(); await v.signOut(); v.setLockAfter();
  };
  await ask(); r.open(); await ask(); r.close();
  assert.equal(await v.unlock(), false, 'a master password never opens it');
  assert.ok(!existsSync(mark), 'the stand-in tool never ran');
  // the stand-in works: the Bitwarden vault (normal Samara's) does run it
  await new Vault().state();
  assert.ok(existsSync(mark), 'normal Samara\'s vault reaches the tool, so the check above means something');
});

test('the secret window gets its own logins, never Bitwarden or normal Samara\'s autofill PIN', () => {
  const b = readFileSync(new URL('../src/browser.ts', import.meta.url), 'utf8');
  assert.match(b, /this\.vault = o\.secret \? new SecretLogins\(path\.join\(o\.stateDir, 'secret-logins\.json'\), \(\) => this\.room\?\.isOpen === true\) : new Vault\(\);/);
  assert.match(b, /this\.pinSeal = new PinSeal\(path\.join\(own, 'autofill-pin\.json'\)\);/);
  assert.match(b, /this\.sitesFile = path\.join\(own, 'vault-sites\.json'\);/);
  assert.ok(!/private readonly vault = new Vault\(\)/.test(b));
  const src = readFileSync(new URL('../src/secretlogins.ts', import.meta.url), 'utf8');
  assert.ok(!/child_process|console\.|BW\b|execFile|spawn/.test(src.replace(/^\/\/.*$/gm, '')), 'no tool, no log in the login store');
});

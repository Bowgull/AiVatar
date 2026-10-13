// M2 (2026-10-13): the MacBook asks the Shadow PC "is the big brain up?" every 10 seconds. The answer says only
// that, and whether he is at this PC; from anywhere but this PC it needs the hook key, like every hook.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { HookServer } from '../src/hooks.ts';
import { macSetupScript } from '../src/macsetup.ts';

const KEY = 'k'.repeat(24);

test('M2: /alive says the brain is up and whether he is at this PC, nothing more', async () => {
  const s = new HookServer(48401, () => {}, KEY, null, () => ({ up: true, atDesk: false }));
  await s.start();
  try {
    const r = await fetch('http://127.0.0.1:48401/alive');
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { up: true, atDesk: false });
    // A web page on this PC cannot ask (the S1 rule: anything with an Origin is a page).
    assert.equal((await fetch('http://127.0.0.1:48401/alive', { headers: { Origin: 'https://evil.test' } })).status, 403);
    // Only GET, only that path.
    assert.equal((await fetch('http://127.0.0.1:48401/alive', { method: 'POST', body: '{}' })).status, 404);
    assert.equal((await fetch('http://127.0.0.1:48401/alive-ish')).status, 404);
    // Over Tailscale it needs the key, like a hook (only checkable when this PC is on the tailnet).
    if (s.tailnet) {
      assert.equal((await fetch(`http://${s.tailnet}:48401/alive`)).status, 403);
      assert.equal((await fetch(`http://${s.tailnet}:48401/alive?k=nope`)).status, 403);
      assert.equal((await fetch(`http://${s.tailnet}:48401/alive?k=${KEY}`)).status, 200);
    }
  } finally { await s.stop(); }
});

test('M2: without the door, /alive does not exist', async () => {
  const s = new HookServer(48403, () => {}, KEY);
  await s.start();
  try { assert.equal((await fetch('http://127.0.0.1:48403/alive')).status, 404); } finally { await s.stop(); }
});

const setup = macSetupScript('100.101.102.103', 47832, 'HOOKKEY_abcdefghijklmnop', 'FRONTKEY_abcdefghijklmnop');

test('M2: the heartbeat never puts the key on a command line', () => {
  const hb = /cat > "\$DIR\/heartbeat\.sh" <<'HEARTBEAT'\n([\s\S]*?)HEARTBEAT\n/.exec(setup)?.[1] ?? '';
  assert.match(hb, /curl -s -m 4 -K "\$DIR\/alive\.curl"/, 'the address and key come from a config file');
  assert.doesNotMatch(hb, /HOOKKEY|[?&]k=/, 'no key in the script itself');
  assert.match(setup, /umask 077; printf 'url = "http:\/\/%s:%s\/alive\?k=%s"/, 'the config file is written private');
  const plist = /<key>Label<\/key><string>com\.aang\.heartbeat<\/string>[\s\S]*?<\/array>/.exec(setup)?.[0] ?? '';
  assert.ok(plist.includes('heartbeat.sh'));
  assert.doesNotMatch(plist, /HOOKKEY|FRONTKEY/);
  assert.match(setup, /launchctl bootout "gui\/\$\(id -u\)\/com\.aang\.heartbeat"/, 'and the uninstaller removes it');
});

const haveBash = (() => { try { execFileSync('bash', ['-c', 'true']); return true; } catch { return false; } })();

test('M2: the whole Mac setup, heartbeat included, is valid bash', t => {
  if (!haveBash) { t.skip('no bash here'); return; }
  // A syntax error is not a failed test on his Mac, it is a setup that stops halfway.
  execFileSync('bash', ['-n'], { input: setup, stdio: ['pipe', 'pipe', 'pipe'] });
  const hb = /cat > "\$DIR\/heartbeat\.sh" <<'HEARTBEAT'\n([\s\S]*?)HEARTBEAT\n/.exec(setup)?.[1] ?? '';
  execFileSync('bash', ['-n'], { input: hb, stdio: ['pipe', 'pipe', 'pipe'] });
});

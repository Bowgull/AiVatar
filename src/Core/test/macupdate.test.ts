// The update key on the Mac (his yes, 2026-10-14): the Mac says which version it runs, the PC offers what is new,
// and Restart now runs the Mac setup's own steps from the PC, keeping the old Aang to put back if the new one fails.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { macSetupScript, macSourceVersion, FRONT_DESK_PORT } from '../src/macsetup.ts';
import { BrowserSyncHub } from '../src/bsynchub.ts';

const desk = { token: 'TOKEN.abc.def', key: 'K'.repeat(24), port: FRONT_DESK_PORT, files: { 'frontdesk.ts': 'x' },
  browser: { bundle: Buffer.from('tgz'), bsyncKey: 'b'.repeat(24), castlabsSig: Buffer.from('sig') } };
const release = { version: '0123456789abcdef', commit: 'abc123def456' };

test('the version changes when a file the Mac runs changes, and only then', () => {
  const shell = mkdtempSync(path.join(os.tmpdir(), 'ver-')), core = mkdtempSync(path.join(os.tmpdir(), 'verc-'));
  mkdirSync(path.join(shell, 'src')); mkdirSync(path.join(shell, 'pages'));
  writeFileSync(path.join(shell, 'src', 'a.ts'), 'one'); writeFileSync(path.join(shell, 'pages', 'b.js'), 'two'); writeFileSync(path.join(core, 'frontdesk.ts'), 'desk');
  const v1 = macSourceVersion(shell, core, ['frontdesk.ts']);
  assert.match(v1, /^[0-9a-f]{16}$/);
  assert.equal(macSourceVersion(shell, core, ['frontdesk.ts']), v1, 'the same files, the same version');
  writeFileSync(path.join(core, 'brain-only.ts'), 'not sent to the Mac');
  assert.equal(macSourceVersion(shell, core, ['frontdesk.ts']), v1, 'a brain-only file does not count');
  writeFileSync(path.join(shell, 'pages', 'b.js'), 'two!');
  assert.notEqual(macSourceVersion(shell, core, ['frontdesk.ts']), v1, 'a browser change does');
});

const update = macSetupScript('100.91.66.119', 47832, 'h'.repeat(24), 'm'.repeat(24), desk, { release, update: true });
const byHand = macSetupScript('100.91.66.119', 47832, 'h'.repeat(24), 'm'.repeat(24), desk, { release });

test('the update keeps the old Aang, says which version is installed, and puts the old one back if the new one fails', () => {
  assert.match(update, /mv "\$APP" "\$APP\.prev"/, 'the old Aang is kept');
  assert.match(update, /"version":"0123456789abcdef","commit":"abc123def456","status":"trial"/, 'on trial until it has run');
  assert.match(update, /trap 'open -a "\$HOME\/Applications\/Samara\.app"/, 'Aang always opens again');
  assert.match(update, /pgrep -f "Samara\.app\/Contents\/MacOS\/"[\s\S]*mv "\$APP\.prev" "\$APP"[\s\S]*failed-updates\.txt/, 'the old one goes back, and that version is not offered again');
  const end = update.search(/^exit 0$/m);
  assert.ok(end > 0 && end < update.indexOf('6/6  Checking the line back'), 'the update ends before the setup checks at the end');
  assert.match(byHand, /"status":"good"/, 'run by hand: installed as good');
  // Samara (2026-10-14): what he sees is Samara; inside it stays Aang, so his logins and default browser carry over.
  assert.match(byHand, /CFBundleName Aang" -c "Set :CFBundleIdentifier com\.aang\.browser"/, 'the inside name and id are unchanged');
  assert.match(byHand, /CFBundleDisplayName Samara/);
  assert.match(byHand, /mv "\$OLD" "\$APP\.prev"[\s\S]*rm -rf "\$OLD"/, 'the old Aang.app is moved aside, then gone');
  assert.match(byHand, /samara-\$s\.png/, 'the lantern icon, size by size');
  assert.doesNotMatch(byHand, /trap 'open -a/, 'by hand, nothing reopens by itself');
});

test('both scripts are valid bash', t => {
  try { execFileSync('bash', ['-c', 'true']); } catch { t.skip('no bash'); return; }
  execFileSync('bash', ['-n'], { input: update, stdio: ['pipe', 'pipe', 'pipe'] });
  execFileSync('bash', ['-n'], { input: byHand, stdio: ['pipe', 'pipe', 'pipe'] });
});

test('the hub passes the Mac\'s version and its Restart now to the brain, and the answer back', async () => {
  const KEY = 's'.repeat(24), seen: any[] = [];
  const hub = new BrowserSyncHub({ key: () => KEY, macAddr: () => '127.0.0.1', toShell: () => {}, shellUp: () => false, log: () => {},
    onUpdate: (m, reply) => { seen.push(m.t); if (m.t !== 'update.report') reply(m.t === 'update.have' ? { t: 'update.offer', version: 'f'.repeat(16), notes: ['A change'] } : { t: 'update.script', script: '#!/bin/bash' }); } });
  const srv = http.createServer((_q, r) => r.writeHead(404).end());
  srv.on('upgrade', (q, s, h) => hub.upgrade(q, s, h));
  await new Promise<void>(r => srv.listen(48671, '127.0.0.1', () => r()));
  try {
    const mac = new WebSocket('ws://127.0.0.1:48671/bsync', { headers: { 'x-aang-key': KEY } });
    const got: any[] = [];
    mac.on('message', d => got.push(JSON.parse(String(d))));
    await new Promise(r => mac.once('open', r));
    mac.send(JSON.stringify({ t: 'update.have', version: 'a'.repeat(16), commit: '' }));
    mac.send(JSON.stringify({ t: 'update.get', version: 'f'.repeat(16) }));
    mac.send(JSON.stringify({ t: 'update.report', ok: false, outcome: 'the new Aang did not start', updateLog: 'x' }));
    await new Promise(r => setTimeout(r, 100));
    assert.deepEqual(seen, ['update.have', 'update.get', 'update.report'], 'a failed update reports back to the brain');
    assert.deepEqual(got.map(m => m.t), ['update.offer', 'update.script']);
    mac.close();
  } finally { hub.close(); srv.close(); }
});

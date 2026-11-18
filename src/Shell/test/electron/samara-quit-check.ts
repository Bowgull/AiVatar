// Phase 5 (2026-11-18): Quit Samara from its taskbar list. Samara runs on its own (no Aang, no brain); a second start
// with --samara-task=quit, exactly what the list item runs, closes it with its clean-exit mark, so Aang would show no
// "closed unexpectedly" card. With no Samara running, the same item starts nothing and leaves no samara.pid.
//
// Everything is its own (state, profile, data, doors). Run on the hidden desktop, from src/Shell:
//   powershell -NoProfile -ExecutionPolicy Bypass -File tools/hidden-desktop-run.ps1 -Command "node --no-warnings test/electron/samara-quit-check.ts"
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHELL = path.join(HERE, '..', '..');
const ELECTRON = path.join(SHELL, 'node_modules', 'electron', 'dist', 'electron.exe');
let bad = 0;
const check = (what: string, ok: boolean, d: unknown = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d !== '' ? '  -- ' + JSON.stringify(d).slice(0, 300) : ''}`); if (!ok) bad++; };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (fn: () => boolean, ms: number) => { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await wait(250); } return fn(); };
const freePort = () => new Promise<number>((ok) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = (s.address() as net.AddressInfo).port; s.close(() => ok(p)); }); });
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };

const tmp = mkdtempSync(path.join(os.tmpdir(), 'samara-quit-'));
const state = path.join(tmp, 'state');
mkdirSync(state, { recursive: true });
const env = {
  ...process.env, AANG_TEST: '1', AANG_SAMARA_APART: '1', AANG_BODY_DIR: state, AANG_STATE_DIR: state, AANG_USER_DATA: path.join(tmp, 'user'),
  AANG_DATA_DIR: path.join(tmp, 'data'), AANG_PORT: String(await freePort()),
  AANG_TEST_CLAUDE_DOOR_PORT: String(await freePort()), AANG_TEST_MOCKUP_DOOR_PORT: String(await freePort()),
};
const run = (args: string[]) => spawn(ELECTRON, ['src/samara.ts', ...args], { cwd: SHELL, env, stdio: 'ignore' });
const pidNow = () => { try { return Number(readFileSync(path.join(state, 'samara.pid'), 'utf8').trim()); } catch { return 0; } };
const mark = () => { try { return JSON.parse(readFileSync(path.join(state, 'samara-exit.json'), 'utf8')); } catch { return null; } };

let s: ReturnType<typeof run> | null = null;
try {
  // 1. None running: the Quit item starts nothing.
  const q0 = run(['--samara-task=quit']);
  const gone0 = await new Promise<number | null>((ok) => { q0.on('exit', (c) => ok(c)); setTimeout(() => ok(-1), 30_000); });
  check('Quit with no Samara running starts nothing and leaves no samara.pid', gone0 === 0 && !existsSync(path.join(state, 'samara.pid')), { exit: gone0 });

  // 2. Samara on its own, quietly (only its doors), then Quit from the taskbar list.
  s = run(['--quiet']);
  const up = await until(() => pidNow() > 0 && alive(pidNow()), 45_000);
  const pid = pidNow();
  check('Samara runs on its own', up, { pid });
  await wait(3000);
  const q = run(['--samara-task=quit']);
  await new Promise((ok) => { q.on('exit', ok); setTimeout(ok, 20_000); });
  const closed = await until(() => !alive(pid), 20_000);
  check('Quit Samara from the taskbar list closes it', closed, { pid });
  const m = mark();
  check('it leaves its clean-exit mark, so Aang shows no crash card', m?.pid === pid && m?.how === 'quit', m);
  check('and takes its samara.pid with it', !existsSync(path.join(state, 'samara.pid')));
} finally {
  if (s?.pid && alive(s.pid)) try { process.kill(s.pid); } catch { /* gone */ }
}
console.log(bad ? `${bad} FAILED` : 'ALL PASS');
process.exit(bad ? 1 : 0);

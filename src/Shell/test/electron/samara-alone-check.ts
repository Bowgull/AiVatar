// P1 (2026-11-17): Samara on its own on the PC, with no brain and no pet at all. Claude's connector finds Samara off and
// starts it through the pet's launcher (this branch's Aang.exe --samara --quiet); Samara comes up with only its doors and
// answers; then it STAYS open with no window, no Aang and no brain (the old "no window and Aang is off: closing" rule is
// gone); killed, it leaves no clean-exit mark, so Aang would tell him it closed unexpectedly.
//
// Everything is its own: state, profile, data, release folder (never his installed releases), door ports. Build the Body
// first (dotnet build src/Body). Run it on the hidden desktop, from src/Shell:
//   powershell -NoProfile -ExecutionPolicy Bypass -File tools/hidden-desktop-run.ps1 -Command "node --no-warnings test/electron/samara-alone-check.ts"
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHELL = path.join(HERE, '..', '..');
const AANG = path.join(SHELL, '..', 'Body', 'bin', 'Debug', 'net10.0-windows', 'Aang.exe');
let bad = 0;
const check = (what: string, ok: boolean, d: unknown = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d !== '' ? '  -- ' + JSON.stringify(d).slice(0, 300) : ''}`); if (!ok) bad++; };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise<number>((ok) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = (s.address() as net.AddressInfo).port; s.close(() => ok(p)); }); });
// Any answer from Samara's own door counts (it refuses a history read without his OK, which is its answer); the
// connector's own "not running" or "did not start" lines do not.
const fromSamara = (t: string) => t.trim() !== '' && !/not running|did not start|launcher was not found|refused this connector/.test(t);
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };

if (!existsSync(AANG)) { console.log('FAIL  build the Body first: ' + AANG); process.exit(1); }
const tmp = mkdtempSync(path.join(os.tmpdir(), 'samara-alone-'));
const state = path.join(tmp, 'state');
mkdirSync(state, { recursive: true });
mkdirSync(path.join(tmp, 'releases'), { recursive: true });
writeFileSync(path.join(state, 'body-exe.txt'), AANG);
// No brain: the port the link tries is one nothing listens on. No pet: no body.pid.
const env = {
  ...process.env, AANG_TEST: '1', AANG_BODY_DIR: state, AANG_STATE_DIR: state, AANG_USER_DATA: path.join(tmp, 'user'),
  AANG_DATA_DIR: path.join(tmp, 'data'), AANG_SAMARA_ROOT: path.join(tmp, 'releases'), AANG_PORT: String(await freePort()),
  AANG_TEST_CLAUDE_DOOR_PORT: String(await freePort()), AANG_TEST_MOCKUP_DOOR_PORT: String(await freePort()),
  AANG_DOOR_FILE: path.join(state, 'claude-door.json'),
};
delete (env as Record<string, unknown>).AANG_SAMARA_APART;   // the launcher decides, from the (absent) setting: on

const c = spawn(process.execPath, [path.join(SHELL, 'src', 'claude-door-mcp.mjs')], { env, stdio: ['pipe', 'pipe', 'ignore'] });
const answers = new Map<number, (m: any) => void>();
readline.createInterface({ input: c.stdout! }).on('line', (l) => { try { const m = JSON.parse(l); answers.get(m.id)?.(m); } catch { /* not ours */ } });
const call = (id: number, name: string, args: unknown) => new Promise<string>((ok) => {
  answers.set(id, (m) => ok((m.result?.content ?? []).map((x: { text: string }) => x.text).join('\n')));
  c.stdin!.write(JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } }) + '\n');
});

let pid = 0;
try {
  const t0 = Date.now();
  const text = await call(1, 'browser_history', { query: 'nothing-here' });
  const pidNow = () => { try { return Number(readFileSync(path.join(state, 'samara.pid'), 'utf8').trim()); } catch { return 0; } };
  pid = pidNow();
  check('Claude\'s connector starts Samara through Aang.exe and is answered', fromSamara(text), { text: text.slice(0, 200), s: Math.round((Date.now() - t0) / 1000) });
  check('it is Samara\'s own program (samara.pid), with Aang off', pid > 0 && alive(pid) && !existsSync(path.join(state, 'body.pid')), { pid });
  const cmd = pid ? execFileSync('powershell', ['-NoProfile', '-Command', `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`], { encoding: 'utf8' }) : '';
  check('started quietly: only its doors, no window', /samara\.ts/.test(cmd) && /--quiet/.test(cmd), cmd.trim());
  console.log('waiting 35 s: no window, no Aang, no brain...');
  await wait(35_000);
  check('Samara stays open with no window, no Aang and no brain', pid > 0 && alive(pid));
  const again = await call(2, 'browser_history', { query: 'still' });
  check('and still answers Claude', fromSamara(again), again.slice(0, 200));
  check('no clean-exit mark while it runs', !existsSync(path.join(state, 'samara-exit.json')));
  if (pid) { try { process.kill(pid); } catch { /* gone */ } }
  await wait(1500);
  check('killed, it is gone and leaves no clean-exit mark (Aang would tell him)', !alive(pid) && !existsSync(path.join(state, 'samara-exit.json')));
} finally {
  c.kill();
  if (pid && alive(pid)) try { process.kill(pid); } catch { /* gone */ }
}
console.log(bad ? `${bad} FAILED` : 'ALL PASS');
process.exit(bad ? 1 : 0);

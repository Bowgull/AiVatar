// Phase 5 (2026-11-18): Samara.exe, Samara's own launcher. The pet's launcher is made unreachable here (body-exe.txt
// names a file that does not exist), so whatever starts Samara can only be Samara.exe: Claude's connector starts it
// quietly through Samara.exe; a link handed to Samara.exe while it runs reaches it; Samara.exe with no Samara running
// opens it; and Samara.exe writes samara-exe.txt so the others find it.
//
// Everything is its own (state, profile, data, releases, doors). Build first: dotnet build src/Samara -c Release.
// Run on the hidden desktop, from src/Shell:
//   powershell -NoProfile -ExecutionPolicy Bypass -File tools/hidden-desktop-run.ps1 -Command "node --no-warnings test/electron/samara-exe-check.ts"
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHELL = path.join(HERE, '..', '..');
const SAMARA_EXE = path.join(SHELL, '..', 'Samara', 'bin', 'Release', 'Samara.exe');
let bad = 0;
const check = (what: string, ok: boolean, d: unknown = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d !== '' ? '  -- ' + JSON.stringify(d).slice(0, 300) : ''}`); if (!ok) bad++; };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (fn: () => boolean, ms: number) => { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await wait(250); } return fn(); };
const freePort = () => new Promise<number>((ok) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = (s.address() as net.AddressInfo).port; s.close(() => ok(p)); }); });
const fromSamara = (t: string) => t.trim() !== '' && !/not running|did not start|launcher was not found|refused this connector/.test(t);
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const cmdOf = (pid: number) => { try { return execFileSync('powershell', ['-NoProfile', '-Command', `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`], { encoding: 'utf8' }).trim(); } catch { return ''; } };

if (!existsSync(SAMARA_EXE)) { console.log('FAIL  build Samara.exe first: ' + SAMARA_EXE); process.exit(1); }
const tmp = mkdtempSync(path.join(os.tmpdir(), 'samara-exe-'));
const state = path.join(tmp, 'state');
mkdirSync(state, { recursive: true });
mkdirSync(path.join(tmp, 'releases'), { recursive: true });
writeFileSync(path.join(state, 'body-exe.txt'), path.join(tmp, 'no-such-folder', 'Aang.exe'));
writeFileSync(path.join(state, 'samara-exe.txt'), SAMARA_EXE);
const env = {
  ...process.env, AANG_TEST: '1', AANG_BODY_DIR: state, AANG_STATE_DIR: state, AANG_USER_DATA: path.join(tmp, 'user'),
  AANG_DATA_DIR: path.join(tmp, 'data'), AANG_SAMARA_ROOT: path.join(tmp, 'releases'), AANG_PORT: String(await freePort()),
  AANG_TEST_CLAUDE_DOOR_PORT: String(await freePort()), AANG_TEST_MOCKUP_DOOR_PORT: String(await freePort()),
  AANG_DOOR_FILE: path.join(state, 'claude-door.json'),
};
delete (env as Record<string, unknown>).AANG_SAMARA_APART;
const pidNow = () => { try { return Number(readFileSync(path.join(state, 'samara.pid'), 'utf8').trim()); } catch { return 0; } };

const c = spawn(process.execPath, [path.join(SHELL, 'src', 'claude-door-mcp.mjs')], { env, stdio: ['pipe', 'pipe', 'ignore'] });
const answers = new Map<number, (m: any) => void>();
readline.createInterface({ input: c.stdout! }).on('line', (l) => { try { const m = JSON.parse(l); answers.get(m.id)?.(m); } catch { /* not ours */ } });
const call = (id: number, name: string, args: unknown) => new Promise<string>((ok) => {
  answers.set(id, (m) => ok((m.result?.content ?? []).map((x: { text: string }) => x.text).join('\n')));
  c.stdin!.write(JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } }) + '\n');
});

let pid = 0;
try {
  // 1. Claude's connector, with Samara off and the pet's launcher missing: only Samara.exe can start it.
  const text = await call(1, 'browser_history', { query: 'nothing-here' });
  pid = pidNow();
  check("Claude's connector starts Samara through Samara.exe (the pet's launcher is not there)", fromSamara(text) && pid > 0 && alive(pid), { text: text.slice(0, 120), pid });
  const cmd = cmdOf(pid);
  check('quietly: only its doors, no window', /samara\.ts/.test(cmd) && /--quiet/.test(cmd), cmd);

  // 2. A link from Windows handed to Samara.exe while Samara runs: queued for it, and Samara takes it.
  const urls = path.join(state, 'open-urls');
  const l = spawn(SAMARA_EXE, ['--url', '--', 'https://example.com/from-windows'], { env, stdio: 'ignore' });
  await new Promise((r) => { l.on('exit', r); setTimeout(r, 20_000); });
  const taken = await until(() => !existsSync(urls) || readdirSync(urls).filter((f) => f.endsWith('.url')).length === 0, 15_000);
  check('a link given to Samara.exe while Samara runs is taken by that Samara (no second one)', taken && pidNow() === pid && alive(pid), { left: existsSync(urls) ? readdirSync(urls) : [] });

  // 3. A bad link is refused by Samara.exe itself.
  const b = spawn(SAMARA_EXE, ['--url', '--', 'file:///C:/Windows/win.ini'], { env, stdio: 'ignore' });
  await new Promise((r) => { b.on('exit', r); setTimeout(r, 20_000); });
  check('a link that is not plain http(s) is refused', !existsSync(urls) || readdirSync(urls).filter((f) => f.endsWith('.url')).length === 0);

  // 4. Samara off: Samara.exe on its own opens it again.
  try { process.kill(pid); } catch { /* gone */ }
  await until(() => !alive(pid), 10_000);
  const s = spawn(SAMARA_EXE, ['--samara', '--quiet'], { env, stdio: 'ignore' });
  await new Promise((r) => { s.on('exit', r); setTimeout(r, 60_000); });
  const again = await until(() => pidNow() > 0 && pidNow() !== pid && alive(pidNow()), 45_000);
  const pid2 = pidNow();
  check('Samara.exe on its own starts Samara again', again, { pid2 });
  check('and Samara.exe keeps samara-exe.txt naming itself', readFileSync(path.join(state, 'samara-exe.txt'), 'utf8').trim().toLowerCase() === SAMARA_EXE.toLowerCase());
  pid = pid2;
} finally {
  c.kill();
  if (pid && alive(pid)) try { process.kill(pid); } catch { /* gone */ }
}
console.log(bad ? `${bad} FAILED` : 'ALL PASS');
process.exit(bad ? 1 : 0);

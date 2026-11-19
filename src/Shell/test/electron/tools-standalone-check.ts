// His rule (2026-11-18): "my music player isnt stand alone anymore ... the mini player the notes ... the timer ... are
// supposed to be seperate ... their own things that control their own pieces". The real programs, their own test
// profiles and state (never his), on the hidden desktop. This plays the brain; the pet is the built Aang.exe.
//   1. Aang's windows (main.ts, Samara apart) and Samara (samara.ts) run side by side.
//   2. `Aang.exe --open player` (the door any dock or list uses) opens the music player in Aang's windows, never Samara.
//   3. The player has its own taskbar button (app id Aang.Music), not Samara's lantern (Aang.Samara).
//   4. Samara crashes (killed): the player is still there, in a process that is still running.
//   5. Samara's list with Samara closed (samara.ts --samara-task=player): Samara does not open; it asks the pet's door.
// Run (from src/Shell, the pet built to AANG_PET_EXE):
//   powershell -File tools/hidden-desktop-run.ps1 -Command "node --no-warnings test/electron/tools-standalone-check.ts <pictures folder>"
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHELL = path.join(HERE, '..', '..');
const PET = process.env.AANG_PET_EXE ?? '';
const PICS = process.argv[2] ?? path.join(os.tmpdir(), 'tools-standalone-pics');
mkdirSync(PICS, { recursive: true });
const tmp = mkdtempSync(path.join(os.tmpdir(), 'tools-standalone-'));
const STATE = path.join(tmp, 'state'), BODY = path.join(tmp, 'body');
for (const d of [STATE, BODY, path.join(tmp, 'noroot')]) mkdirSync(d, { recursive: true });
writeFileSync(path.join(STATE, 'shell.token'), 'test-token-' + Date.now());
// Aang is "running" while this runs (body.pid names a live process from this boot: this one).
writeFileSync(path.join(STATE, 'body.pid'), String(process.pid));
writeFileSync(path.join(STATE, 'body-exe.txt'), PET);
writeFileSync(path.join(BODY, 'body.json'), JSON.stringify({ ShellDir: SHELL }));

let bad = 0;
const check = (what: string, ok: boolean, d: unknown = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d !== '' ? '  -- ' + (typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 400) : ''}`); if (!ok) bad++; };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (f: () => boolean, ms: number) => { const end = Date.now() + ms; while (Date.now() < end) { if (f()) return true; await wait(150); } return f(); };

const brain = new WebSocketServer({ host: '127.0.0.1', port: 0, path: '/body' });
await new Promise<void>((r) => brain.once('listening', () => r()));
const port = (brain.address() as { port: number }).port;
const got: { role: string; m: Record<string, unknown> }[] = [];
const socks = new Map<string, WebSocket>();
brain.on('connection', (ws) => {
  let role = '?';
  ws.on('message', (d) => {
    try {
      const m = JSON.parse(String(d)) as Record<string, unknown>;
      if (m.t === 'hello') { role = typeof m.role === 'string' ? m.role : 'aang'; socks.set(role, ws); }
      got.push({ role, m });
    } catch { /* not JSON */ }
  });
});

const electron = path.join(SHELL, 'node_modules', 'electron', 'dist', 'electron.exe');
const base: NodeJS.ProcessEnv = { ...process.env, AANG_PORT: String(port), AANG_STATE_DIR: STATE, AANG_DATA_DIR: path.join(tmp, 'data'), AANG_TEST_CLAUDE_DOOR_PORT: '47952', AANG_TEST_MOCKUP_DOOR_PORT: '47945' };
delete base.AANG_SAMARA_APART;
const logs: Record<string, string> = { aang: '', samara: '', list: '' };
function run(name: string, args: string[], env: NodeJS.ProcessEnv): ChildProcess {
  const c = spawn(electron, args, { cwd: SHELL, stdio: ['ignore', 'pipe', 'pipe'], env });
  c.stdout!.on('data', (d) => { logs[name] = (logs[name] ?? '') + d; }); c.stderr!.on('data', (d) => { logs[name] = (logs[name] ?? '') + d; });
  return c;
}
function windows(pids: number[], shot = ''): { pid: number; appId: string; box: string; title: string }[] {
  const r = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(HERE, 'winlist.ps1'), '-Pids', pids.join(','), ...(shot ? ['-Shot', shot] : [])], { encoding: 'utf8' });
  return (r.stdout ?? '').split(/\r?\n/).filter(Boolean).map((l) => { const [pid, appId, box, title] = l.split('\t'); return { pid: Number(pid), appId: appId ?? '', box: box ?? '', title: title ?? '' }; });
}
const alive = (c: ChildProcess) => c.exitCode === null && c.signalCode === null;
let holdOut = '';

const aangEnv = { ...base, AANG_SAMARA_APART: '1', AANG_USER_DATA: path.join(tmp, 'pet'), AANG_TEST: '1', AANG_TASKBAR_LOG: '1' };
const samaraEnv = { ...base, AANG_SAMARA_APART: '1', AANG_USER_DATA: path.join(tmp, 'samara'), AANG_TEST: '1' };
let aang: ChildProcess | null = null, samara: ChildProcess | null = null;
try {
  check('the pet (Aang.exe) is built', existsSync(PET), PET);
  aang = run('aang', ['src/main.ts'], aangEnv);
  samara = run('samara', ['src/samara.ts', '--quiet'], samaraEnv);
  check('Aang\'s windows and Samara both say hello to the brain', await until(() => socks.has('samara') && [...socks.keys()].some((k) => k !== 'samara'), 60_000), [...socks.keys()]);
  await wait(4000);

  // 2. The pet's door. Holding his mutex makes the pet think Aang runs, so it only hands the tool over.
  const mutex = spawn('powershell', ['-NoProfile', '-Command', "$m = New-Object System.Threading.Mutex($true, 'Local\\Aang.Body.Single'); [Console]::Out.WriteLine('held'); [Console]::Out.Flush(); Start-Sleep -Seconds 8; $m.ReleaseMutex()"], { stdio: ['ignore', 'pipe', 'ignore'] });
  mutex.stdout!.on('data', (d) => { holdOut += d; });
  await until(() => holdOut.includes('held'), 8000);
  const r = spawnSync(PET, ['--open', 'player'], { env: { ...base, AANG_BODY_DIR: BODY, AANG_SAMARA_ROOT: path.join(tmp, 'noroot'), AANG_USER_DATA: path.join(tmp, 'pet'), AANG_TEST: '1' }, encoding: 'utf8', timeout: 30_000 });
  check('Aang.exe --open player returns at once (Aang already running)', r.status === 0, r.status);
  const handed = await until(() => /taskbar task player/.test(logs.aang!), 15_000);
  check('Aang\'s windows got the player task', handed, logs.aang!.split('\n').filter((l) => /taskbar task|another one/.test(l)));
  check('Samara never heard of it', !/player/.test(logs.samara!), logs.samara!.split('\n').filter((l) => /player|task/.test(l)));
  // Something to show: the brain says what is playing.
  socks.get([...socks.keys()].find((k) => k !== 'samara')!)?.send(JSON.stringify({ t: 'media.now', v: 1, app: 'spotify', spotify: true, title: 'Maria También', artist: 'Khruangbin', album: 'Con Todo El Mundo', status: 'playing', position: 101, duration: 241, at: Date.now(), canSeek: true, volume: 0.7, thumb: null }));
  const music = () => windows([aang!.pid!]).filter((w) => w.appId === 'Aang.Music');
  check('3. the music player is on screen with its OWN taskbar id (Aang.Music)', await until(() => music().length > 0, 15_000), windows([aang.pid!]));
  check('   and no window of Aang\'s wears Samara\'s id', !windows([aang.pid!]).some((w) => w.appId === 'Aang.Samara'), windows([aang.pid!]));
  await wait(1500);
  windows([aang.pid!], path.join(PICS, 'before'));

  // 4. Samara crashes.
  samara.kill();
  await until(() => !alive(samara!), 10_000);
  await wait(3000);
  check('4. Samara is gone (killed, as in a crash)', !alive(samara));
  check('   Aang\'s windows are still running', alive(aang));
  check('   the music player is still there, on its own button', music().length > 0, windows([aang.pid!]));
  windows([aang.pid!], path.join(PICS, 'after-samara-crash'));

  // 5. Samara's list with Samara closed: Samara does not open for it; the pet's door does the rest.
  const before = (logs.aang!.match(/taskbar task player/g) ?? []).length;
  holdOut = '';
  const mutex2 = spawn('powershell', ['-NoProfile', '-Command', "$m = New-Object System.Threading.Mutex($true, 'Local\\Aang.Body.Single'); [Console]::Out.WriteLine('held'); [Console]::Out.Flush(); Start-Sleep -Seconds 10; $m.ReleaseMutex()"], { stdio: ['ignore', 'pipe', 'ignore'] });
  mutex2.stdout!.on('data', (d) => { holdOut += d; });
  await until(() => holdOut.includes('held'), 8000);
  // A fresh profile for this copy (the killed Samara's lock is gone, but its samara.pid stays, as after a real crash).
  try { unlinkSync(path.join(STATE, 'samara.pid')); } catch { /* none */ }
  const listEnv: NodeJS.ProcessEnv = { ...samaraEnv, AANG_USER_DATA: path.join(tmp, 'samara2'), AANG_BODY_DIR: BODY, AANG_SAMARA_ROOT: path.join(tmp, 'noroot') };
  delete listEnv.AANG_TEST;   // wakeAang stays quiet under AANG_TEST; without it Samara writes samara.log, not stdout
  const list = run('list', ['src/samara.ts', '--samara-task=player'], listEnv);
  await until(() => !alive(list), 20_000);
  const slog = () => { try { return readFileSync(path.join(STATE, 'samara.log'), 'utf8'); } catch { return ''; } };
  check("5. Samara's list, Samara closed: that copy hands it to Aang and leaves", !alive(list) && /player is Aang's; handed to him/.test(slog()) && /starting Aang for player/.test(slog()), slog().slice(-300));
  check('   no Samara opened for it (no samara.pid, no window)', !existsSync(path.join(STATE, 'samara.pid')) && windows([list.pid!]).length === 0);
  // The pet (started by that copy with --open player, Aang "running") handed the player on: its own log says so.
  const blog = () => { try { return readFileSync(path.join(BODY, 'body.log'), 'utf8'); } catch { return ''; } };
  check("   the pet's door took it: 'tool: player handed to Aang's windows' (twice: step 2 and now)", await until(() => (blog().match(/tool: player handed to Aang's windows/g) ?? []).length >= 2, 20_000), blog().split('\n').filter((l) => /tool:/.test(l)));
  // That hand-over runs with this copy's test profile (a real one has none), so it reaches a Shell of its own: put away.
  await wait(4000);
  spawnSync('powershell', ['-NoProfile', '-Command', "Get-CimInstance Win32_Process -Filter \"Name='electron.exe'\" | ? { $_.CommandLine -match 'samara-task=player' -and $_.CommandLine -notmatch '--type=' } | % { Stop-Process -Id $_.ProcessId -Force }"]);
  void mutex; void mutex2;
} finally {
  try { samara?.kill(); } catch { /* gone */ }
  try { aang?.kill(); } catch { /* gone */ }
  brain.close();
}
console.log('--- aang log (task lines) ---\n' + logs.aang!.split('\n').filter((l) => /task|taskbar: player|appwindow|another/.test(l)).slice(0, 20).join('\n'));
console.log(bad ? `${bad} FAILED` : 'ALL PASS');
process.exit(bad ? 1 : 0);

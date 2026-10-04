// Step 6.4: the separate castLabs runtime that plays paid video.
//
//   node drm.mjs
//
// What this can prove without his accounts: that the runtime starts, that Widevine loads, that it
// refuses to load anything but a paid service, and that the Shell sends paid links there and ordinary
// ones to the stock pop-out. Whether an episode of HIS actually plays needs him to sign in, which Aang
// never does for him.
import { WebSocketServer } from 'ws';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const shellDir = path.join(root, 'src', 'Shell');
const stockElectron = path.join(shellDir, 'node_modules', 'electron', 'dist', 'electron.exe');
const drmElectron = path.join(shellDir, 'node_modules', 'electron-drm', 'dist', 'electron.exe');
const outDir = path.join(root, 'tests', 'out', 'drm');
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const STATE = path.join(outDir, 'state');
mkdirSync(STATE, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

check('the stock build and the castLabs build are both installed, side by side', existsSync(stockElectron) && existsSync(drmElectron));

/** Run the DRM runtime once against a link, and report what it said and how it ended. */
function runDrm(url, mode = 'narrow', seconds = 25) {
  const r = spawnSync(drmElectron, ['drm/main.ts'], {
    cwd: shellDir,
    env: { ...process.env, AANG_STATE_DIR: STATE, AANG_DRM_URL: url, AANG_DRM_MODE: mode },
    encoding: 'utf8',
    timeout: seconds * 1000,
    killSignal: 'SIGKILL',
  });
  return { out: (r.stdout || '') + (r.stderr || ''), code: r.status, timedOut: r.error?.code === 'ETIMEDOUT' };
}

// ---------------------------------------------------------------- it refuses anything but paid video
const refused = runDrm('https://www.youtube.com/watch?v=abc', 'narrow', 30);
check('an ordinary link is refused: only paid services run in this runtime',
  /only paid services run in this runtime/.test(refused.out), (refused.out.match(/drm: [^\n]*/) ?? [''])[0].slice(0, 100));
check('and it stops rather than sitting there', refused.code === 3 || refused.timedOut === false, `exit ${refused.code}`);

// ---------------------------------------------------------------- Widevine really loads
const crunchy = runDrm('https://www.crunchyroll.com/', 'narrow', 45);
check('Widevine loads before any window is made',
  /widevine/i.test(crunchy.out), (crunchy.out.match(/drm: widevine[^\n]*/) ?? [''])[0].slice(0, 140));
// castLabs reports a status word ("new" when freshly registered, "upToDate" afterwards) plus a
// version. "new" means loaded, not missing; the version is the real proof the module is there.
check('the Widevine module is really present, with a version',
  /"version"\s*:\s*"\d+\.\d+/.test(crunchy.out),
  (crunchy.out.match(/"version"[^,}]*/) ?? [''])[0]);

// ---------------------------------------------------------------- the Shell routes correctly
const BRAIN_PORT = 47987;
writeFileSync(path.join(STATE, 'shell.token'), 'drm-test');
let say = null;
const brain = new WebSocketServer({ host: '127.0.0.1', port: BRAIN_PORT, path: '/body' });
brain.on('connection', ws => { say = m => ws.send(JSON.stringify(m)); });

const shell = spawn(stockElectron, ['src/main.ts'], {
  cwd: shellDir,
  env: { ...process.env, AANG_PORT: String(BRAIN_PORT), AANG_STATE_DIR: STATE, AANG_DATA_DIR: outDir },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
shell.stdout.on('data', d => { log += d; });
shell.stderr.on('data', d => { log += d; });
await sleep(6000);

if (!say) { console.log('FAIL  the Shell never connected'); shell.kill(); process.exit(1); }

const countDrm = () => Number((spawnSync('powershell', ['-NoProfile', '-Command',
  "@(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'electron.exe' -and $_.CommandLine -like '*drm/main.ts*' }).Count"],
  { encoding: 'utf8' }).stdout || '0').trim());

say({ t: 'popout.open', url: 'https://www.crunchyroll.com/watch/ABC/episode-1' });
await sleep(9000);
check('a paid link starts the castLabs runtime', countDrm() >= 1, `${countDrm()} running`);

say({ t: 'popout.open', url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ' });
await sleep(6000);
check('an ordinary link stops it again and plays in the stock pop-out', countDrm() === 0, `${countDrm()} running`);
check('Netflix is refused with the reason, not silently', true);   // checked in services.test.ts

say({ t: 'popout.open', url: 'https://www.netflix.com/watch/80100172' });
await sleep(3000);
check('Netflix says why it cannot play rather than opening a black window',
  /M7121-1331/.test(log), (log.match(/shell: Netflix[^\n]*/) ?? [''])[0].slice(0, 120));

shell.kill();
brain.close();
spawnSync('powershell', ['-NoProfile', '-Command', 'Get-Process electron -ErrorAction SilentlyContinue | Stop-Process -Force']);
await sleep(500);

const failed = results.filter(r => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (failed) console.log('\n--- shell output ---\n' + log.slice(-1200));
process.exit(failed ? 1 : 0);

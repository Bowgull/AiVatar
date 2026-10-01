// A Core that cannot stay up must stop being restarted, and Aang must say so.
//   node supervisor-burst.mjs      (real Body, real Core; takes a couple of minutes)
//
// WHY THIS EXISTS: the supervisor backed off from 2s to 30s but had no burst limit, and the backoff
// RESETS to 2s whenever a Core survived a minute. So a Core dying at 61 seconds restarted every ~63
// seconds, forever, for as long as the machine was on, while the pet looked completely normal. That
// is the same silent-failure shape as the write that died unnoticed for six days, and worse, because
// the thing that is broken is Aang himself.
//
// Kills the Core repeatedly and asserts the Body gives up and writes down that it did. Kills fast
// rather than at 61s: the window is ten minutes precisely so both speeds trip it, and a test that
// takes five minutes to run is a test nobody runs.
import { requireNoBody } from './guard.mjs';
import { spawn, execSync } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import fs from 'node:fs';

const root = path.resolve(import.meta.dirname, '..', '..');
const bodyExe = path.join(root, 'src', 'Body', 'bin', 'Release', 'net10.0-windows', 'Aang.exe');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };
const listening = () => new Promise(res => { const s = net.connect(47831, '127.0.0.1'); s.once('connect', () => { s.destroy(); res(true); }); s.once('error', () => res(false)); });
const until = async (f, ms) => { const d = Date.now() + ms; while (Date.now() < d) { if (await f()) return true; await sleep(300); } return false; };
const corePid = () => {
  try {
    const o = execSync('powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort 47831 -State Listen -ErrorAction SilentlyContinue).OwningProcess"', { encoding: 'utf8' }).trim();
    return Number(o.split(/\s+/)[0]) || 0;
  } catch { return 0; }
};

const BURST_LIMIT = 5;        // must match CoreSupervisor.BurstLimit

check('nothing is listening before the test', !(await listening()));
await requireNoBody();

// guard.mjs points AANG_BODY_DIR at a temp folder so a test never writes over Joshua's own settings,
// so the log to read is the test Body's, not the one in %APPDATA%. Resolved after requireNoBody().
const logPath = path.join(process.env.AANG_BODY_DIR, 'body.log');

const body = spawn(bodyExe, ['--quiet=never'], { stdio: 'ignore' });
check('the Body brings the Core up to begin with', await until(listening, 30000));

// One watch loop rather than kill, wait, kill: the supervisor's backoff grows between restarts, so
// any fixed per-kill timeout is either flaky or slow. Each new pid is killed exactly once.
let killed = 0;
let lastPid = 0;
const deadline = Date.now() + 240000;
while (killed < BURST_LIMIT && Date.now() < deadline) {
  const pid = corePid();
  if (!pid || pid === lastPid) { await sleep(500); continue; }
  try {
    execSync('taskkill /PID ' + pid + ' /T /F', { stdio: 'ignore' });
    lastPid = pid;
    killed++;
    console.log('      killed core #' + killed + ' (pid ' + pid + ')');
  } catch (e) {
    console.log('      could not kill pid ' + pid + ': ' + String(e.message).split('\n')[0]);
    await sleep(500);
  }
}
check('the Core was killed ' + BURST_LIMIT + ' times', killed === BURST_LIMIT, 'killed ' + killed);

// The decisive assertion: it must STAY down. Generous, because the old behaviour was to come back
// within at most 30 seconds, every time, forever.
const stayedDown = !(await until(listening, 45000));
check('the Body stops restarting the Core after a burst of crashes', stayedDown,
  stayedDown ? '' : 'it came back, so the loop is still unbounded');

// And it has to say so. A limit nobody is told about is just a quieter failure.
const said = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : '';
check('it writes down that it gave up', /gave up after \d+ crashes/i.test(said),
  said ? '' : 'nothing matching in ' + logPath);

try { body.kill(); } catch { /* already gone */ }
await until(async () => !(await listening()), 10000);
try { execSync('taskkill /IM Aang.exe /T /F', { stdio: 'ignore' }); } catch { /* already gone */ }

console.log('\n' + results.filter(Boolean).length + '/' + results.length + ' burst-limit checks passed');
process.exit(results.every(Boolean) ? 0 : 1);

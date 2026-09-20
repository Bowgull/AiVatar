// The Body alone must bring up the Core, restart it if it dies, and take it down when the Body goes.
//   node supervisor.mjs      (uses the real Core; a few seconds of warm-up, no chat turns)
import { requireNoBody } from './guard.mjs';
import { spawn, execSync } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..', '..');
const bodyExe = path.join(root, 'src', 'Body', 'bin', 'Release', 'net10.0-windows', 'Aang.exe');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };
const listening = () => new Promise(res => { const s = net.connect(47831, '127.0.0.1'); s.once('connect', () => { s.destroy(); res(true); }); s.once('error', () => res(false)); });
const until = async (f, ms) => { const d = Date.now() + ms; while (Date.now() < d) { if (await f()) return true; await sleep(300); } return false; };
const corePid = () => { try { const o = execSync('powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort 47831 -State Listen -ErrorAction SilentlyContinue).OwningProcess"', { encoding: 'utf8' }).trim(); return Number(o.split(/\s+/)[0]) || 0; } catch { return 0; } };

check('nothing is listening before the test', !(await listening()));
await requireNoBody();
const body = spawn(bodyExe, ['--quiet=never'], { stdio: 'ignore' });
check('the Body alone brings the Core up', await until(listening, 25000));
const pid1 = corePid();
console.log('      core pid', pid1);

execSync(`taskkill /PID ${pid1} /T /F`, { stdio: 'ignore' });
check('the Core is gone after being killed', await until(async () => !(await listening()), 5000));
check('the Body starts it again by itself', await until(listening, 30000));
const pid2 = corePid();
check('it is a new process', pid2 > 0 && pid2 !== pid1, `${pid1} -> ${pid2}`);

body.kill();
check('when the Body exits, the Core goes with it', await until(async () => !(await listening()), 10000));
console.log(`\n${results.filter(Boolean).length}/${results.length} supervisor checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);

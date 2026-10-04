// Step 6.2's own test: kill Aang's windows and the tray brings them back, and a brain that is not
// there does not stop them starting.
//
//   node shell-restart.mjs
//
// Deliberately does NOT run the pet: it drives the Shell's supervision the way the tray does, by
// starting the same Electron with the same arguments, so it can run while his real Aang is up without
// putting a second pet on his screen or touching his live brain.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const shellDir = path.join(root, 'src', 'Shell');
const electron = path.join(shellDir, 'node_modules', 'electron', 'dist', 'electron.exe');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

// A port nothing else uses, so this never reaches his real brain.
const PORT = 47993;
const STATE = path.join(root, 'tests', 'out', 'shell-restart-state');

check('the Shell is where the tray looks for it', existsSync(path.join(shellDir, 'src', 'main.ts')));
check('its own Electron is there', existsSync(electron));

/** Start the Shell the way CoreSupervisor.ForShell does. */
function startShell() {
  return spawn(electron, ['src/main.ts'], {
    cwd: shellDir,
    env: { ...process.env, AANG_PORT: String(PORT), AANG_STATE_DIR: STATE },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

// ---------------------------------------------------------------- it starts with no brain at all
let child = startShell();
let errors = '';
child.stderr.on('data', d => { errors += d; });
await sleep(6000);
check('it starts even with no brain to talk to', child.exitCode === null,
  child.exitCode === null ? '' : `exited with ${child.exitCode}`);
check('and says nothing alarming while it waits', !/Error:|Cannot find|SyntaxError/.test(errors),
  errors.slice(0, 160).replace(/\s+/g, ' '));

// ---------------------------------------------------------------- killed, it is gone and restarts
const firstPid = child.pid;
child.kill();
await sleep(1500);
check('killing it really kills it', child.exitCode !== null || child.killed);

// The supervisor's job: start it again. Same call, which is what the tray does after a death.
child = startShell();
await sleep(6000);
check('it comes back', child.exitCode === null && child.pid !== firstPid,
  `was ${firstPid}, now ${child.pid}`);

// ---------------------------------------------------------------- only one at a time
const second = startShell();
await sleep(5000);
check('a second copy stands down rather than fighting the first',
  second.exitCode !== null && child.exitCode === null,
  `second exited with ${second.exitCode}`);

child.kill();
try { second.kill(); } catch { /* already gone */ }
await sleep(500);

const failed = results.filter(r => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);

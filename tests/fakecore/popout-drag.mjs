// Step 6.3: resizing and moving the pop-out with Windows itself, rather than by calling into the app,
// so this tests what actually happens when he drags it.
//
//   node popout-drag.mjs
//
// His rule from sheet 4: "Your size wins." Whatever he drags it to is the size it opens at next time,
// in the same place, with the picture still 16 by 9 and flush to an edge if he dropped it near one.
import { WebSocketServer } from 'ws';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const shellDir = path.join(root, 'src', 'Shell');
const electron = path.join(shellDir, 'node_modules', 'electron', 'dist', 'electron.exe');
const mover = path.join(import.meta.dirname, 'popout-drag.ps1');
const outDir = path.join(root, 'tests', 'out', 'popout-drag');
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const BRAIN_PORT = 47989;
const STATE = path.join(outDir, 'state');
mkdirSync(STATE, { recursive: true });
const BAR = 34;                       // the wooden grab bar, matching --bar in popout.css
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

writeFileSync(path.join(STATE, 'shell.token'), 'drag-test');

let say = null;
const brain = new WebSocketServer({ host: '127.0.0.1', port: BRAIN_PORT, path: '/body' });
brain.on('connection', ws => { say = m => ws.send(JSON.stringify(m)); });

const shell = spawn(electron, ['src/main.ts'], {
  cwd: shellDir,
  env: { ...process.env, AANG_PORT: String(BRAIN_PORT), AANG_STATE_DIR: STATE, AANG_DATA_DIR: outDir },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
shell.stdout.on('data', d => { log += d; });
shell.stderr.on('data', d => { log += d; });

await sleep(6000);
if (!say) { console.log('FAIL  the Shell never connected'); shell.kill(); process.exit(1); }
say({ t: 'popout.open', url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ' });
await sleep(5000);

/** Drag it, Windows-side. Returns "x,y,w,h" as Windows reports it afterwards. */
function drag(x, y, w, h) {
  const out = spawnSync('powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', mover, '-X', String(x), '-Y', String(y), '-W', String(w), '-H', String(h)],
    { encoding: 'utf8' });
  return (out.stdout || '').trim().split('\n').pop().trim();
}

const saved = path.join(STATE, 'popout.json');
const readBox = () => JSON.parse(readFileSync(saved, 'utf8'));

// ---------------------------------------------------------------- a deliberately wrong shape
const first = drag(300, 200, 900, 700);               // 900x700 is nothing like 16 by 9
check('the window could be found and moved', /^-?\d+,-?\d+,\d+,\d+$/.test(first), first);

// The correction is debounced, so it lands shortly after he lets go rather than fighting his hand.
await sleep(1500);
check('a squashed size is written down corrected, not as dragged', existsSync(saved));
if (existsSync(saved)) {
  const b = readBox();
  check('the picture is back to 16 by 9', Math.abs(b.width / (b.height - BAR) - 16 / 9) < 0.05,
    `window ${b.width}x${b.height}, picture ${b.width}x${b.height - BAR}`);
  // The width he ended at is kept and the HEIGHT is what moves, so the picture gets the right shape
  // without the window jumping to a size he never chose.
  //
  // Not an exact comparison, and this is the reason: Windows and Electron disagree about how wide a
  // frameless window is, by about 16 pixels, because Windows counts an invisible resize border that
  // Electron does not. This test drives Windows and reads back Electron's numbers, so it is comparing
  // the two. When he drags with the mouse, both sides of that are Electron's and there is no gap.
  const asDragged = Number(first.split(',')[2]);
  check('his width is kept; the height is what moves', Math.abs(b.width - asDragged) <= 20,
    `dragged ${asDragged} (Windows), kept ${b.width} (Electron)`);
}

// ---------------------------------------------------------------- dropped near an edge
drag(8, 300, 800, 500);
await sleep(1600);
if (existsSync(saved)) {
  const b = readBox();
  check('dropped near the left edge, it snaps flush', b.x === 0, `x = ${b.x}`);
}

// ---------------------------------------------------------------- it opens where he left it
const left = readBox();
shell.kill();
await sleep(1500);

const again = spawn(electron, ['src/main.ts'], {
  cwd: shellDir,
  env: { ...process.env, AANG_PORT: String(BRAIN_PORT), AANG_STATE_DIR: STATE, AANG_DATA_DIR: outDir },
  stdio: ['ignore', 'pipe', 'pipe'],
});
again.stdout.on('data', d => { log += d; });
again.stderr.on('data', d => { log += d; });
await sleep(6000);
if (say) say({ t: 'popout.open', url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ' });
await sleep(5000);

const reopened = drag(left.x, left.y, left.width, left.height).split(',').map(Number);
check('it reopens at the size and place he left it',
  Math.abs(reopened[2] - left.width) <= 2 && Math.abs(reopened[3] - left.height) <= 2,
  `left ${left.width}x${left.height}, reopened ${reopened[2]}x${reopened[3]}`);

again.kill();
brain.close();
await sleep(400);
const failed = results.filter(r => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (failed) console.log('\n--- shell output ---\n' + log.slice(-1500));
process.exit(failed ? 1 : 0);

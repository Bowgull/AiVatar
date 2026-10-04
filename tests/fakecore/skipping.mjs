// Step 6.6: skipping, end to end, with real segments other viewers really marked.
//
//   node skipping.mjs
//
// This uses a real YouTube video that really has an intro marked on SponsorBlock (0 to 16.3 seconds),
// so the whole chain is exercised: the hashed lookup, the main process handing segments to the page,
// the player jumping, the plaque, and the undo. Nothing here is mocked.
//
// If it ever starts failing on the segment check, look at SponsorBlock first: these are community
// marks and they can be voted away.
import { WebSocketServer, WebSocket } from 'ws';
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const shellDir = path.join(root, 'src', 'Shell');
const electron = path.join(shellDir, 'node_modules', 'electron', 'dist', 'electron.exe');
const outDir = path.join(root, 'tests', 'out', 'skipping');
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const VIDEO = 'Ks-_Mh1QhMc';          // has an intro marked from 0 to about 16 seconds
const BRAIN_PORT = 47981;
const DEBUG_PORT = 47982;
const STATE = path.join(outDir, 'state');
mkdirSync(STATE, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

writeFileSync(path.join(STATE, 'shell.token'), 'skip-test');
let say = null;
const brain = new WebSocketServer({ host: '127.0.0.1', port: BRAIN_PORT, path: '/body' });
brain.on('connection', ws => { say = m => ws.send(JSON.stringify(m)); });

const shell = spawn(electron, [`--remote-debugging-port=${DEBUG_PORT}`, 'src/main.ts'], {
  cwd: shellDir,
  env: { ...process.env, AANG_PORT: String(BRAIN_PORT), AANG_STATE_DIR: STATE, AANG_DATA_DIR: outDir },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
shell.stdout.on('data', d => { log += d; });
shell.stderr.on('data', d => { log += d; });
await sleep(6000);
if (!say) { console.log('FAIL  the Shell never connected'); shell.kill(); process.exit(1); }

say({ t: 'popout.open', url: `https://www.youtube.com/watch?v=${VIDEO}` });
await sleep(12000);                   // the player loads, then the segments are looked up

const list = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
const target = list.find(x => x.type === 'page' && x.url.includes('popout.html'));
check('the pop-out is open', Boolean(target));
if (!target) { shell.kill(); process.exit(1); }

const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise(r => ws.once('open', r));
let id = 0; const waiting = new Map();
ws.on('message', d => { const m = JSON.parse(String(d)); if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m.result); waiting.delete(m.id); } });
const send = (method, params = {}) => new Promise(res => { const i = ++id; waiting.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ask = async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }))?.result?.value;

// ---------------------------------------------------------------- it really skipped
// The intro runs 0 to 16.3, and the video starts at 0, so by now it should have jumped past it.
const where = await ask(`document.getElementById('time').textContent`);
const seconds = (() => {
  const m = /^(\d+):(\d\d)/.exec(String(where ?? ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : -1;
})();
check('the player is running', seconds >= 0, String(where));
check('it jumped past the intro other viewers marked', seconds >= 16, `at ${where}, the intro ends at 0:16`);

// ---------------------------------------------------------------- and said so
const said = await ask(`document.getElementById('skipsaid').textContent`);
check('the plaque says what it skipped, rather than jumping silently', /SKIPPED THE/.test(String(said ?? '')), String(said));

const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(path.join(outDir, 'skipping.png'), Buffer.from(shot.data, 'base64'));

// ---------------------------------------------------------------- and it can be undone
const before = await ask(`document.getElementById('time').textContent`);
await ask(`document.getElementById('skipundo').click()`);
await sleep(2500);
const after = await ask(`document.getElementById('time').textContent`);
check('Undo puts him back where he was', after !== before, `${before} then ${after}`);
const backSaid = await ask(`document.getElementById('skipsaid').textContent`);
check('and says so', /PUT BACK/.test(String(backSaid ?? '')), String(backSaid));

// ---------------------------------------------------------------- it does not fight him
// Having been put back, it must not immediately skip again: he has said he wants to watch it.
await sleep(3000);
const stillBack = await ask(`document.getElementById('time').textContent`);
const stillSeconds = (() => {
  const m = /^(\d+):(\d\d)/.exec(String(stillBack ?? ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : -1;
})();
check('and it does not skip the same thing again', stillSeconds < 16, `at ${stillBack}`);

ws.close();
shell.kill();
brain.close();
await sleep(400);
const failed = results.filter(r => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (failed) console.log('\n--- shell output ---\n' + log.slice(-1200));
process.exit(failed ? 1 : 0);

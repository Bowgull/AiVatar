// Step 6.5: the controls, driving a real video.
//
//   node controls.mjs
//
// The question this answers is the one unit tests cannot: does pressing Aang's play button actually
// pause YouTube. Everything here talks to a real player over the same channel the page uses.
import { WebSocketServer, WebSocket } from 'ws';
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const shellDir = path.join(root, 'src', 'Shell');
const electron = path.join(shellDir, 'node_modules', 'electron', 'dist', 'electron.exe');
const outDir = path.join(root, 'tests', 'out', 'controls');
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const BRAIN_PORT = 47985;
const DEBUG_PORT = 47986;
const STATE = path.join(outDir, 'state');
mkdirSync(STATE, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

writeFileSync(path.join(STATE, 'shell.token'), 'controls-test');
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

say({ t: 'popout.open', url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ' });
await sleep(10000);                       // the player needs a moment to load and start reporting

async function page(match) {
  const list = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
  const t = list.find(x => x.type === 'page' && x.url.includes(match));
  if (!t) return null;
  const ws = new WebSocket(t.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
  await new Promise(r => ws.once('open', r));
  let id = 0; const waiting = new Map();
  ws.on('message', d => { const m = JSON.parse(String(d)); if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m.result); waiting.delete(m.id); } });
  const send = (method, params = {}) => new Promise(res => { const i = ++id; waiting.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  return {
    send,
    close: () => ws.close(),
    ask: async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }))?.result?.value,
    click: id2 => send('Runtime.evaluate', { expression: `document.getElementById('${id2}').click()` }),
  };
}

const p = await page('popout.html');
check('the pop-out is open', Boolean(p));
if (!p) { shell.kill(); process.exit(1); }

// ---------------------------------------------------------------- the strip is all there
const parts = await p.ask(`JSON.stringify(['play','scrub','time','mute','vol','see','seenum','mac','full'].map(i => Boolean(document.getElementById(i))))`);
check('every control from sheet 4 is on the strip', JSON.parse(parts).every(Boolean), parts);

// ---------------------------------------------------------------- YouTube really answers
const reported = await p.ask(`(() => {
  const t = document.getElementById('time').textContent;
  return t;
})()`);
check('the player reports its position, so the controls are really connected',
  /\d+:\d\d \/ \d+:\d\d/.test(reported) && !/0:00 \/ 0:00/.test(reported), reported);

// ---------------------------------------------------------------- play and pause
await p.click('play');
await sleep(2500);
const afterPause = await p.ask(`document.getElementById('playicon').firstElementChild.getAttribute('d')`);
check('pressing play changes it to the play triangle, so it really paused', afterPause === 'M4 3l9 5-9 5z', afterPause);

const stoppedAt = await p.ask(`document.getElementById('time').textContent`);
await sleep(3000);
const stillAt = await p.ask(`document.getElementById('time').textContent`);
check('and the video really stopped moving', stoppedAt === stillAt, `${stoppedAt} then ${stillAt}`);

await p.click('play');
await sleep(3000);
const movingAgain = await p.ask(`document.getElementById('time').textContent`);
check('pressing it again starts it moving', movingAgain !== stillAt, `${stillAt} then ${movingAgain}`);

// ---------------------------------------------------------------- see-through is the window's own
await p.send('Runtime.evaluate', { expression: `
  const t = document.getElementById('see');
  const r = t.getBoundingClientRect();
  t.dispatchEvent(new PointerEvent('pointerdown', { clientX: r.left + r.width * 0.5, bubbles: true, pointerId: 1 }));
` });
await sleep(900);
const seen = await p.ask(`document.getElementById('seenum').textContent`);
check('the see-through slider moves and shows a percentage', /^\d+%$/.test(seen) && seen !== '100%', seen);

// ---------------------------------------------------------------- the fade
const fadedWhilePlaying = await p.ask(`(async () => {
  // Nothing touches the mouse for longer than the two seconds sheet 4 asks for.
  await new Promise(r => setTimeout(r, 2600));
  return document.getElementById('frame').classList.contains('faded');
})()`);
check('the wood and the controls fade while it plays', fadedWhilePlaying === true, String(fadedWhilePlaying));

const backOnMove = await p.ask(`(async () => {
  window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
  await new Promise(r => setTimeout(r, 200));
  return !document.getElementById('frame').classList.contains('faded');
})()`);
check('and come back the moment the mouse moves, with no click', backOnMove === true, String(backOnMove));

const stayWhilePaused = await p.ask(`(async () => {
  document.getElementById('play').click();              // pause it
  await new Promise(r => setTimeout(r, 3200));
  return !document.getElementById('frame').classList.contains('faded');
})()`);
check('but they stay put while it is paused, as sheet 4 asks', stayWhilePaused === true, String(stayWhilePaused));

// The picture must fill the frame: no black bars. The chrome height is measured by the page and fed
// back, because it changes every time a control is added.
const shape = await p.ask(`(() => {
  document.getElementById('frame').classList.remove('faded');
  const s = document.querySelector('.stage').getBoundingClientRect();
  return JSON.stringify({ w: Math.round(s.width), h: Math.round(s.height) });
})()`);
const st = JSON.parse(shape);
check('the picture is 16 by 9, with the controls accounted for',
  Math.abs(st.w / st.h - 16 / 9) < 0.04, `${st.w}x${st.h} = ${(st.w / st.h).toFixed(2)}`);

const shot = await p.send('Page.captureScreenshot', { format: 'png' });
writeFileSync(path.join(outDir, 'controls.png'), Buffer.from(shot.data, 'base64'));

p.close();
shell.kill();
brain.close();
await sleep(400);
const failed = results.filter(r => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (failed) console.log('\n--- shell output ---\n' + log.slice(-1200));
process.exit(failed ? 1 : 0);

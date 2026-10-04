// Step 6.3's own test: a video really plays in the pop-out, and the window behaves.
//
//   node popout.mjs
//
// A fake brain tells the Shell to put something on, exactly as the real one will. Nothing here costs
// quota and nothing touches his real Aang: its own port, its own state folder.
import { WebSocketServer, WebSocket } from 'ws';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const shellDir = path.join(root, 'src', 'Shell');
const electron = path.join(shellDir, 'node_modules', 'electron', 'dist', 'electron.exe');
const outDir = path.join(root, 'tests', 'out', 'popout');
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const BRAIN_PORT = 47997;
const DEBUG_PORT = 47998;
const STATE = path.join(outDir, 'state');
mkdirSync(STATE, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

const token = 'popout-' + Math.random().toString(36).slice(2);
writeFileSync(path.join(STATE, 'shell.token'), token);

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
check('the Shell started', shell.exitCode === null);
check('its pages are served over http, not from a file', /pages on http:\/\/127\.0\.0\.1:\d+/.test(log),
  (log.match(/pages on \S+/) ?? [''])[0]);

// ---------------------------------------------------------------- the brain says "put this on"
if (!say) { console.log('FAIL  the Shell never connected'); process.exit(1); }
say({ t: 'popout.open', url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ' });
await sleep(6000);

/** Talk to a page over the DevTools protocol. */
async function page(match) {
  const list = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
  const t = list.find(x => x.type === 'page' && x.url.includes(match));
  if (!t) return null;
  const ws = new WebSocket(t.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
  await new Promise(r => ws.once('open', r));
  let id = 0; const waiting = new Map();
  ws.on('message', d => { const m = JSON.parse(String(d)); if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m.result); waiting.delete(m.id); } });
  return {
    send: (method, params = {}) => new Promise(res => { const i = ++id; waiting.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); }),
    close: () => ws.close(),
  };
}

const p = await page('popout.html');
check('the pop-out opened', Boolean(p));

if (p) {
  const got = await p.send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const f = document.getElementById('video');
      return {
        src: f ? f.src : '',
        shown: f ? !f.hidden : false,
        title: document.getElementById('what').textContent,
        label: document.getElementById('src').textContent,
        frames: window.length,
      };
    })()`,
  });
  const v = got?.result?.value ?? {};
  check('it is pointed at the YouTube embed, not the watch page', /youtube\.com\/embed\//.test(v.src || ''), v.src);
  check('the picture is showing', v.shown === true);
  check('the grab bar says what and where from', v.title === 'YouTube video' && v.label === 'YOUTUBE',
    `${v.title} / ${v.label}`);
  check('the video frame actually loaded', v.frames >= 1, `${v.frames} frame(s)`);

  // Error 153 is what a YouTube embed says when it was loaded from a file. If the page server is
  // doing its job, that message is nowhere.
  const errs = await p.send('Runtime.evaluate', { returnByValue: true, expression: 'document.body.innerText' });
  check('no Error 153 (the reason the page is served over http)', !/153/.test(String(errs?.result?.value ?? '')));

  const shot = await p.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path.join(outDir, 'popout.png'), Buffer.from(shot.data, 'base64'));
  p.close();
}

// ---------------------------------------------------------------- one at a time
say({ t: 'popout.open', url: 'https://www.twitch.tv/asmongold' });
await sleep(4000);
const list = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
check('a new video replaces the one playing, it does not open a second window',
  list.filter(t => t.type === 'page' && t.url.includes('popout.html')).length === 1);

const p2 = await page('popout.html');
if (p2) {
  const v = await p2.send('Runtime.evaluate', {
    returnByValue: true,
    expression: `({ src: document.getElementById('video').src, label: document.getElementById('src').textContent })`,
  });
  const got = v?.result?.value ?? {};
  check('Twitch is told which host is embedding it, or it refuses to play', /parent=127\.0\.0\.1/.test(got.src || ''), got.src);
  check('the plaque changed to the new source', got.label === 'TWITCH', got.label);

  // Twitch is fussier than YouTube: it refuses outright if the host is not named, and it will not play
  // under 400 by 300. So check it actually drew something rather than only that the address was right.
  await sleep(6000);
  const played = await p2.send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const f = document.getElementById('video');
      const r = f.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), frames: window.length };
    })()`,
  });
  const tw = played?.result?.value ?? {};
  check('the Twitch player is big enough for Twitch to play at all', tw.w >= 400 && tw.h >= 300, `${tw.w}x${tw.h}`);
  check('the Twitch frame loaded', tw.frames >= 1, `${tw.frames} frame(s)`);
  const shot2 = await p2.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path.join(outDir, 'popout-twitch.png'), Buffer.from(shot2.data, 'base64'));
  p2.close();
}

// ---------------------------------------------------------------- it remembers where it was
check('it wrote down its size and place', existsSync(path.join(STATE, 'popout.json')));
if (existsSync(path.join(STATE, 'popout.json'))) {
  const box = JSON.parse(readFileSync(path.join(STATE, 'popout.json'), 'utf8'));
  // 16 by 9 is held for THE PICTURE, not the window: the window is the picture plus the grab bar.
  // Checking the window instead is what hid the letterboxing on the first run.
  const BAR = 34;
  const ratio = box.width / (box.height - BAR);
  check('and the picture is 16 by 9', Math.abs(ratio - 16 / 9) < 0.03,
    `window ${box.width}x${box.height}, picture ${box.width}x${box.height - BAR}`);
}

shell.kill();
brain.close();
await sleep(500);
const failed = results.filter(r => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (failed) console.log('\n--- shell output ---\n' + log.slice(-1500));
process.exit(failed ? 1 : 0);

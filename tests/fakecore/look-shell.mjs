// Look at a Shell window, with a fake brain feeding it, and save a picture.
//
//   node look-shell.mjs [page] [outDir]
//   node look-shell.mjs hello.html
//
// WHY THIS EXISTS (step 6.2): the definition of done for every window in Phase 6 is the mockup and the
// build side by side, with every difference named. The existing look-*.mjs drivers only drive the C#
// windows. Without this, no side-by-side check in this phase can run at all, so it is built before the
// first window that needs it rather than after.
//
// It attaches over the Chrome DevTools Protocol rather than using Playwright's Electron launcher,
// which does not work on Electron 30 and later. The picture comes from Chromium itself, so it is the
// page exactly as drawn, with no window border or desktop behind it.
import { WebSocketServer, WebSocket } from 'ws';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const shellDir = path.join(root, 'src', 'Shell');
const electron = path.join(shellDir, 'node_modules', 'electron', 'dist', 'electron.exe');
const page = process.argv[2] ?? 'hello.html';
const outDir = process.argv[3] ?? path.join(root, 'tests', 'out', 'shell');
mkdirSync(outDir, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const BRAIN_PORT = 47994;      // a fake brain, so this costs no quota and needs nobody to type
const DEBUG_PORT = 47995;      // where Chromium listens for the driver
const STATE = path.join(outDir, 'state');
mkdirSync(STATE, { recursive: true });

// The Shell will not connect without the password, which is the whole point of the lock (S1), so the
// fake brain writes one exactly as the real Core does.
const token = 'look-shell-' + Math.random().toString(36).slice(2);
writeFileSync(path.join(STATE, 'shell.token'), token);

let connected = false;
const brain = new WebSocketServer({ host: '127.0.0.1', port: BRAIN_PORT, path: '/body' });
brain.on('connection', (ws, req) => {
  // Check the Shell really presented the password rather than sneaking in.
  connected = req.headers['x-aang-token'] === token;
  ws.on('message', () => { /* the hello */ });
  // Something to draw, so the page is not empty in the picture.
  setTimeout(() => ws.send(JSON.stringify({ t: 'claude.working', working: true, what: 'job hunt' })), 300);
});

const shell = spawn(electron, [`--remote-debugging-port=${DEBUG_PORT}`, 'src/main.ts'], {
  cwd: shellDir,
  env: { ...process.env, AANG_PORT: String(BRAIN_PORT), AANG_STATE_DIR: STATE, AANG_SHELL_PAGE: page },
  stdio: ['ignore', 'inherit', 'inherit'],
});

await sleep(6000);

/** Ask Chromium for its open pages and talk to the one we want. */
async function attach() {
  const list = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
  const target = list.find(t => t.type === 'page' && t.url.includes(page)) ?? list.find(t => t.type === 'page');
  if (!target) throw new Error('no page to look at; is the Shell running?');
  return new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
}

const cdp = await attach();
await new Promise(r => cdp.once('open', r));
let id = 0;
const waiting = new Map();
cdp.on('message', d => {
  const m = JSON.parse(String(d));
  if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m.result); waiting.delete(m.id); }
});
const send = (method, params = {}) => new Promise(res => { const i = ++id; waiting.set(i, res); cdp.send(JSON.stringify({ id: i, method, params })); });

// Let whatever the fake brain sent land before the picture is taken.
await sleep(800);
const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
const file = path.join(outDir, page.replace(/\.html$/, '') + '.png');
writeFileSync(file, Buffer.from(shot.data, 'base64'));

// What the page actually says, so a check can assert on words rather than pixels.
const text = await send('Runtime.evaluate', { expression: 'document.body.innerText', returnByValue: true });

// Ask the page itself what it can reach. This is the real proof that the sandbox and the isolation
// are on: the Electron audit can only read the source, and it could not see through the shared
// settings at all. If any of these is false the window is not locked down, whatever the source says.
const probe = await send('Runtime.evaluate', {
  returnByValue: true,
  expression: `(() => ({
    noRequire: typeof require === 'undefined',
    noProcess: typeof process === 'undefined',
    noModule:  typeof module === 'undefined',
    bridgeOnly: typeof window.aang === 'object' && Object.keys(window.aang).sort().join(',') === 'onConnected,onMessage,windowKind',
  }))()`,
});
const caged = probe?.result?.value ?? {};
const locked = Object.values(caged).every(Boolean);

console.log(`page:       ${page}`);
console.log(`password:   ${connected ? 'presented and accepted' : 'NOT presented'}`);
console.log(`picture:    ${file}`);
console.log(`says:       ${String(text?.result?.value ?? '').replace(/\s+/g, ' ').trim()}`);
console.log(`locked in:  ${locked ? 'yes' : 'NO'}  ${JSON.stringify(caged)}`);

cdp.close();
shell.kill();
brain.close();
await sleep(400);
process.exit(connected && locked ? 0 : 1);

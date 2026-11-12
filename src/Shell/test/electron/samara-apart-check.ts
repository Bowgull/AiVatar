// Phase 2: Samara as its own program (samara.ts) talks to Aang's brain. This plays the brain: Samara must say hello as
// role 'samara', answer a driving step, and take a relay from Aang's windows (open a page). Its own profile and state,
// never his. Run it on the hidden desktop: powershell -File tools/hidden-desktop-run.ps1 -Command "node --no-warnings test/electron/samara-apart-check.ts"
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHELL = path.join(HERE, '..', '..');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'samara-apart-'));
// The brain writes a fresh password at each start; the Shell's link waits for it (link.ts).
mkdirSync(path.join(tmp, 'state'), { recursive: true });
writeFileSync(path.join(tmp, 'state', 'shell.token'), 'test-token-' + Date.now());
let bad = 0;
const check = (what: string, ok: boolean, d: unknown = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d !== '' ? '  -- ' + JSON.stringify(d).slice(0, 200) : ''}`); if (!ok) bad++; };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const site = http.createServer((q, r) => r.writeHead(200, { 'content-type': 'text/html' }).end(`<!doctype html><title>page ${q.url}</title>`));
await new Promise<void>((r) => site.listen(0, '127.0.0.1', () => r()));
const pageUrl = `http://127.0.0.1:${(site.address() as { port: number }).port}/relayed`;

const brain = new WebSocketServer({ host: '127.0.0.1', port: 0, path: '/body' });
await new Promise<void>((r) => brain.once('listening', () => r()));
const port = (brain.address() as { port: number }).port;
const got: Record<string, unknown>[] = [];
let sock = null as import('ws').WebSocket | null;
brain.on('connection', (ws) => { sock = ws; ws.on('message', (d) => { try { got.push(JSON.parse(String(d))); } catch { /* not JSON */ } }); });

const electron = path.join(SHELL, 'node_modules', 'electron', 'dist', 'electron.exe');
const child = spawn(electron, ['src/samara.ts', '--quiet'], { cwd: SHELL, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, AANG_TEST: '1', AANG_PORT: String(port), AANG_STATE_DIR: path.join(tmp, 'state'), AANG_USER_DATA: path.join(tmp, 'user'), AANG_DATA_DIR: path.join(tmp, 'data') } });
let out = '';
child.stdout.on('data', (d) => { out += d; }); child.stderr.on('data', (d) => { out += d; });
const until = async (f: () => boolean, ms: number) => { const end = Date.now() + ms; while (Date.now() < end) { if (f()) return true; await wait(100); } return f(); };

try {
  const hello = await until(() => got.some((m) => m.t === 'hello'), 40_000);
  const h = got.find((m) => m.t === 'hello');
  check('Samara says hello to the brain as its own program', hello && h?.role === 'samara' && h?.shell === true && h?.bubble === false, h ?? out.slice(-400));
  check('it keeps its pid file where the pet looks for it', existsSync(path.join(tmp, 'state', 'samara.pid')) && readFileSync(path.join(tmp, 'state', 'samara.pid'), 'utf8').trim() === String(child.pid));
  await wait(3000);   // the browser comes up behind the hello
  sock?.send(JSON.stringify({ t: 'drive', id: 7, op: 'nosuchstep', a: {} }));
  const answered = await until(() => got.some((m) => m.t === 'drive.result' && m.id === 7), 15_000);
  check('it answers a driving step with the same id', answered, got.find((m) => m.t === 'drive.result') ?? '');
  sock?.send(JSON.stringify({ t: 'relay', m: { t: 'samara.open', url: pageUrl } }));
  await wait(5000);
  const tabs = (() => { try { return JSON.parse(readFileSync(path.join(tmp, 'state', 'browser-tabs.json'), 'utf8')); } catch { return null; } })();
  // The tabs file is written a moment after a change; ask the window list through a driving step as well.
  sock?.send(JSON.stringify({ t: 'drive', id: 8, op: 'tabs', a: {} }));
  await until(() => got.some((m) => m.t === 'drive.result' && m.id === 8), 10_000);
  const r8 = got.find((m) => m.t === 'drive.result' && m.id === 8);
  check('a page Aang hands over (relay) opens in Samara', JSON.stringify(tabs ?? '').includes('/relayed') || JSON.stringify(r8 ?? '').includes('/relayed'), { file: tabs?.tabs?.map((t: { url: string }) => t.url), drive: r8 });
  check('Samara never sent Aang\'s own messages', !got.some((m) => typeof m.t === 'string' && /^(bubble|input|pet)\./.test(m.t)));
} finally {
  child.kill();
  brain.close(); site.close();
}
console.log(bad ? `${bad} FAILED` : 'ALL PASS');
process.exit(bad ? 1 : 0);

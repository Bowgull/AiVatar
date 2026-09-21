// A right-click on Aang opens the same menu as the tray icon (real Body, pretend Core). Screenshot to tests/out/visual-rclick/.
import { WebSocketServer } from 'ws';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..', '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const out = path.join(root, 'tests', 'out', 'visual-rclick'); mkdirSync(out, { recursive: true });
function server(cmd, args) {
  const p = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'inherit'] });
  let buf = ''; const w = [];
  p.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); w.shift()?.(l); } });
  return { p, ask: line => new Promise(r => { w.push(r); p.stdin.write(line + '\n'); }), prime: () => w.push(() => {}) };
}
const ps = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File'];
const cap = server('powershell.exe', [...ps, path.join(root, 'tools', 'measure', 'Capture.ps1'), '-Serve']); cap.prime();
const keys = server('powershell.exe', [...ps, path.join(root, 'tools', 'measure', 'Keys.ps1'), '-Serve']); keys.prime();
await sleep(1500);
const bodyDir = mkdtempSync(path.join(os.tmpdir(), 'aang-rc-'));
const wss = new WebSocketServer({ host: '127.0.0.1', port: 47831, path: '/body' });
let sock = null; wss.on('connection', ws => { sock = ws; });
const body = spawn(path.join(root, 'src', 'Body', 'bin', 'Release', 'net10.0-windows', 'Aang.exe'), ['--quiet=never', '--no-core'], { stdio: 'ignore', env: { ...process.env, AANG_BODY_DIR: bodyDir } });
for (let i = 0; i < 100 && !sock; i++) await sleep(150);
await sleep(1500);
const log = readFileSync(path.join(bodyDir, 'body.log'), 'utf8');
const m = /shown at \{X=(-?\d+),Y=(-?\d+)\} (\d+)x(\d+)/.exec(log);
const [x, y, w, h] = [+m[1], +m[2], +m[3], +m[4]];
await keys.ask(`rclick ${x + w - 111} ${y + h - 90}`);
await sleep(600);
console.log(await cap.ask(`snap ${path.join(out, 'menu.png')}`));
await keys.ask(`move ${x + w - 111 - 190} ${y + h - 90 - 88}`);      // onto a row, for the hover look
await sleep(500);
console.log(await cap.ask(`snap ${path.join(out, 'menu-hover.png')}`));
body.kill(); wss.close(); keys.p.stdin.write('quit\n'); cap.p.stdin.write('quit\n');
process.exit(0);

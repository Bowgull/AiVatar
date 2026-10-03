// 4.3b: look at the desktop scrollback - the bubble showing the conversation instead of one reply.
//   node look-stack.mjs [outDir]
//
// Drives a real exchange through the fake Core so the Body remembers turns the way it does in life,
// then scrolls up over the bubble, which is the gesture that opens the stack.
import { requireNoBody } from './guard.mjs';
import { WebSocketServer } from 'ws';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const root = path.resolve(import.meta.dirname, '..', '..');
const bodyExe = path.join(root, 'src', 'Body', 'bin', 'Release', 'net10.0-windows', 'Aang.exe');
const capture = path.join(root, 'tools', 'measure', 'Capture.ps1');
const outDir = process.argv[2] ?? path.join(root, 'snaps-bubble', 'stack');
fs.mkdirSync(outDir, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const cap = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', capture, '-Serve'],
  { stdio: ['pipe', 'pipe', 'inherit'] });
let capLine = null;
cap.stdout.on('data', d => { const s = String(d).trim(); if (capLine) { const f = capLine; capLine = null; f(s); } });
const snap = async (name, window) => {
  const file = path.join(outDir, name + '.png');
  const reply = new Promise(res => { capLine = res; });
  cap.stdin.write(`snap ${file} ${window}\n`);
  const r = await reply;
  console.log((r.startsWith('ok') ? '  saved  ' : '  FAILED ') + name + (r.startsWith('ok') ? '' : '  ' + r));
};

const wss = new WebSocketServer({ host: '127.0.0.1', port: 47831, path: '/body' });
let ws = null;
const hello = new Promise(res => wss.on('connection', s => {
  ws = s; s.on('message', m => { const j = JSON.parse(String(m)); if (j.t === 'hello') res(j); });
}));
const send = o => ws.send(JSON.stringify(o));

await requireNoBody();
const body = spawn(bodyExe, ['--no-core', '--quiet=never', '--bubble-test=always-long'], { stdio: 'ignore' });
const h = await Promise.race([hello, sleep(20000).then(() => null)]);
if (!h) { console.error('the Body never connected'); body.kill(); cap.kill(); wss.close(); process.exit(1); }
console.log('Body connected, pid ' + h.pid);
await sleep(2500);

await sleep(4000);
await snap('71_alwayslong', 'Aang');


try { body.kill(); } catch { }
cap.stdin.write('quit\n');
await sleep(600);
try { cap.kill(); } catch { }
wss.close();
console.log('\nsnapshots in ' + outDir);

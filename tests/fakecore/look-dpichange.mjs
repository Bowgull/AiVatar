// 4.4: a blocked session leaves a quiet marker when he is at his desk.
//   node look-stuck.mjs
//
// Drives the REAL message path, not a test flag: a proactive blocking bubble with quiet off, which is
// exactly what the Core sends when a Claude session is waiting on him and no game has focus.
//
// Two captures. The first proves the bubble appears. The second is taken after it has faded, and is the
// point of the whole exercise: before today, that second frame was an ordinary pet with no sign that
// anything was waiting.
import { requireNoBody } from './guard.mjs';
import { WebSocketServer } from 'ws';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const root = path.resolve(import.meta.dirname, '..', '..');
const bodyExe = path.join(root, 'src', 'Body', 'bin', 'Release', 'net10.0-windows', 'Aang.exe');
const capture = path.join(root, 'tools', 'measure', 'Capture.ps1');
const outDir = path.join(root, 'snaps-bubble', 'stuck');
fs.mkdirSync(outDir, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const cap = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', capture, '-Serve'],
  { stdio: ['pipe', 'pipe', 'inherit'] });
let capLine = null;
cap.stdout.on('data', d => { const s = String(d).trim(); if (capLine) { const f = capLine; capLine = null; f(s); } });
const snap = async name => {
  const file = path.join(outDir, name + '.png');
  const reply = new Promise(res => { capLine = res; });
  cap.stdin.write(`snap ${file} Aang\n`);
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
const body = spawn(bodyExe, ['--no-core', '--quiet=never', '--dpi-change=150'], { stdio: 'ignore' });
const h = await Promise.race([hello, sleep(20000).then(() => null)]);
if (!h) { console.error('the Body never connected'); body.kill(); cap.kill(); wss.close(); process.exit(1); }
console.log('Body connected, pid ' + h.pid);
await sleep(2500);

// Short on purpose: the bubble's hold time scales with length, and this needs to fade inside the test.
console.log('sending a blocking message, quiet off (he is at his desk)');
send({ t: 'bubble', text: 'Need input on the job hunt.', stream: false, proactive: true, blocking: true, focus: 'Claude' });
await sleep(2500);
await snap('92_before_change');

console.log('waiting for the bubble to fade...');
await sleep(16000);
await snap('93_after_change');
console.log('  (81 is the one that matters: is anything still saying a session is waiting?)');

try { body.kill(); } catch { }
cap.stdin.write('quit\n');
await sleep(600);
try { cap.kill(); } catch { }
wss.close();
console.log('\nin ' + outDir);

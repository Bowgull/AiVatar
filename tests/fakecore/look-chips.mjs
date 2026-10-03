// Actually look at the entity chips in the Panel's history.
//   node look-chips.mjs        captures to the repo's snaps-jobs folder
//
// 4.5. Files and links in a message become small chips you can press to open the thing. The two risks a
// build cannot catch: a chip running past the edge of the message it belongs to, and an ordinary message
// with nothing in it changing height because of a feature that should not have touched it.
import { requireNoBody } from './guard.mjs';
import { WebSocketServer } from 'ws';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const root = path.resolve(import.meta.dirname, '..', '..');
const exeIn = c => path.join(root, 'src', 'Body', 'bin', c, 'net10.0-windows', 'Aang.exe');
const bodyExe = fs.existsSync(exeIn('Debug')) ? exeIn('Debug') : exeIn('Release');
const capture = path.join(root, 'tools', 'measure', 'Capture.ps1');
const outDir = process.argv[2] ?? path.join(root, 'snaps-jobs');
fs.mkdirSync(outDir, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const B = String.fromCharCode(92);                       // no shell or editor gets to eat these
const DOCS = `C:${B}Users${B}Shadow${B}Documents`;

const cap = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', capture, '-Serve'],
  { stdio: ['pipe', 'pipe', 'inherit'] });
let capLine = null;
cap.stdout.on('data', d => { const s = String(d).trim(); if (capLine) { const f = capLine; capLine = null; f(s); } });
const snap = async name => {
  const file = path.join(outDir, name + '.png');
  const reply = new Promise(res => { capLine = res; });
  cap.stdin.write(`snap ${file} Aang: Panel\n`);
  const r = await reply;
  console.log((r.startsWith('ok') ? '  saved  ' : '  FAILED ') + name + (r.startsWith('ok') ? '' : '  ' + r));
};

const wss = new WebSocketServer({ host: '127.0.0.1', port: 47831, path: '/body' });
let ws = null;
const seen = [];
const hello = new Promise(res => wss.on('connection', s => {
  ws = s;
  s.on('message', m => { const j = JSON.parse(String(m)); seen.push(j); if (j.t === 'hello') res(j); });
}));
const send = o => ws.send(JSON.stringify(o));

await requireNoBody();
const body = spawn(bodyExe, ['--no-core', '--quiet=never', '--panel=5'], { stdio: 'ignore' });
const h = await Promise.race([hello, sleep(20000).then(() => null)]);
if (!h) { console.error('the Body never connected'); body.kill(); cap.kill(); wss.close(); process.exit(1); }
console.log('Body connected, pid ' + h.pid);
await sleep(3000);

send({ t: 'history.reply', q: '', items: [
  { id: 1, ts: '2026-10-03 09:02:00', who: 'you',  text: 'whats my status with octup' },
  { id: 2, ts: '2026-10-03 09:02:04', who: 'Aang',
    text: `Interviewed 30 September, round three. I wrote it up in ${DOCS}${B}applications.md for you.` },
  { id: 3, ts: '2026-10-03 09:05:00', who: 'you',  text: 'whats trending on github this week' },
  { id: 4, ts: '2026-10-03 09:05:30', who: 'Aang',
    text: `One worth your time: a headless browser built for agents. I read https://github.com/lightpanda-io/browser and the writeup at https://lightpanda.io/docs, and saved my notes to ${DOCS}${B}notes.md.` },
  { id: 5, ts: '2026-10-03 09:08:00', who: 'Aang',
    text: 'Nothing else came up today. Everything on your list is still open, and nothing needs you before Monday.' },
] });
await sleep(2500);
await snap('04_chips');

body.kill(); cap.stdin.write('quit\n'); wss.close();
await sleep(600);
console.log('\nopen.thing messages sent: ' + JSON.stringify(seen.filter(m => m.t === 'open.thing')));
console.log('look at ' + outDir);
process.exit(0);

// 4.3: look at the conversation view in the Panel.
//   node look-panel.mjs [outDir]
//
// Drives the real Body with a fake Core, opens the Panel on its History tab, and answers the history
// request with a conversation that spans two days - so the time-gap divider has something to divide.
//
// The content is shaped like his real history on purpose: short pings ("morning", "test"), one long reply,
// and one turn with a path in it. His 207 real messages average 28 characters, so a view that only looks
// right with paragraphs would look wrong every day.
import { requireNoBody } from './guard.mjs';
import { WebSocketServer } from 'ws';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const root = path.resolve(import.meta.dirname, '..', '..');
const bodyExe = path.join(root, 'src', 'Body', 'bin', 'Release', 'net10.0-windows', 'Aang.exe');
const capture = path.join(root, 'tools', 'measure', 'Capture.ps1');
const outDir = process.argv[2] ?? path.join(root, 'snaps-bubble', 'panel');
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

// Two conversations, separated by a real gap, so the divider is exercised rather than assumed.
const ago = (mins) => {
  const d = new Date(Date.now() - mins * 60_000);
  return d.toISOString().replace('T', ' ').slice(0, 19);
};
const HISTORY = [
  { ts: ago(1500), who: 'user', text: 'morning' },
  { ts: ago(1499), who: 'aang', text: 'Morning. Quiet so far.' },
  { ts: ago(1495), who: 'user', text: 'whats my status with octup' },
  { ts: ago(1494), who: 'aang', text: 'Octup is the only one past first round. You interviewed on the 30th (Round 3) and are waiting on the outcome. You have got until the 7th to chase them if you do not hear back.' },
  { ts: ago(40), who: 'user', text: 'can you read G:\\My Drive\\Job Search 2026\\applications.md and tell me how many are still open' },
  { ts: ago(39), who: 'aang', text: 'Twenty are still waiting on a reply. Three follow-ups were due today: Deliverect, GreenShield and Litmus.' },
  { ts: ago(6), who: 'user', text: 'test' },
  { ts: ago(5), who: 'aang', text: 'Here.' },
];

const wss = new WebSocketServer({ host: '127.0.0.1', port: 47831, path: '/body' });
let ws = null;
const hello = new Promise(res => wss.on('connection', s => {
  ws = s;
  s.on('message', m => {
    const j = JSON.parse(String(m));
    if (j.t === 'hello') res(j);
    // The Panel asks for history when its tab is first opened; answer with the newest first, which is the
    // order the real Core returns.
    if (j.t === 'history') {
      const q = String(j.q ?? '').toLowerCase();
      const items = HISTORY.filter(h => !q || h.text.toLowerCase().includes(q)).slice().reverse();
      ws.send(JSON.stringify({ t: 'history.reply', q: j.q ?? '', items }));
    }
  });
}));
const send = o => ws.send(JSON.stringify(o));

await requireNoBody();
// --panel=4 opens the Panel on the History tab at start; the flag exists for exactly this.
const body = spawn(bodyExe, ['--no-core', '--quiet=never', '--panel=4'], { stdio: 'ignore' });
const h = await Promise.race([hello, sleep(20000).then(() => null)]);
if (!h) { console.error('the Body never connected'); body.kill(); cap.kill(); wss.close(); process.exit(1); }
console.log('Body connected, pid ' + h.pid);
await sleep(2500);

// The Panel is already open on History; give it a moment to ask for and receive the conversation.
await sleep(2500);
await snap('20_panel_history', 'Aang: Panel');

try { body.kill(); } catch { }
cap.stdin.write('quit\n');
await sleep(600);
try { cap.kill(); } catch { }
wss.close();
console.log('\nsnapshots in ' + outDir);

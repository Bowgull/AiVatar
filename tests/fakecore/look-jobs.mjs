// Actually look at the job card stack.
//   node look-jobs.mjs        captures to the repo's snaps-jobs folder
//
// 4.5. The stack is one card at a time with keycap buttons under it, and the thing most likely to be
// wrong is the thing a build cannot tell you: whether a real company name fits, whether the reason
// text overflows its box, and whether the buttons carry the weight Joshua said he wanted kept
// ("I LOVE the weight of the buttons currently they feel and look great").
//
// Real data, not lorem ipsum - a long company name, a card with no salary, and a skip verdict - because
// those are where layouts break.
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
const seen = [];
const hello = new Promise(res => wss.on('connection', s => {
  ws = s;
  s.on('message', m => { const j = JSON.parse(String(m)); seen.push(j); if (j.t === 'hello') res(j); });
}));
const send = o => ws.send(JSON.stringify(o));

const JOBS = [
  { id: 'j1', title: 'Customer Success Manager', company: 'Octup', location: 'Toronto (hybrid)',
    salary: '$95-120K', score: 88, verdict: 'apply', url: 'https://example.com/1',
    reason: 'Account management in a SaaS team, hybrid in Toronto, and the salary is in range. Closest match this week.' },
  { id: 'j2', title: 'Digital Project Coordinator', company: 'Constellation Dealer Group', location: 'Remote (Canada)',
    salary: '', score: 61, verdict: 'maybe', url: 'https://example.com/2',
    reason: 'Coordination rather than account work, and no salary is posted. Worth a look only if the week is thin.' },
  { id: 'j3', title: 'Bilingual Account Executive', company: 'GreenShield', location: 'Montreal',
    salary: '$70-80K + commission', score: 24, verdict: 'skip', url: 'https://example.com/3',
    reason: 'French required and the pay is quota-carrying commission. Both are on your dealbreaker list.' },
];

await requireNoBody();
const body = spawn(bodyExe, ['--no-core', '--quiet=never', '--panel=4'], { stdio: 'ignore' });
const h = await Promise.race([hello, sleep(20000).then(() => null)]);
if (!h) { console.error('the Body never connected'); body.kill(); cap.kill(); wss.close(); process.exit(1); }
console.log('Body connected, pid ' + h.pid);
await sleep(3000);

send({ t: 'panel.reply', facts: [], trust: [], actions: '', drafts: [], mail: false, sessions: [], jobs: JOBS });
await sleep(2500);
await snap('01_stack', 'Aang: Panel');

// Skip the first one: the count must fall to "1 of 2" and the next card must appear.
send({ t: 'panel.reply', facts: [], trust: [], actions: '', drafts: [], mail: false, sessions: [], jobs: JOBS.slice(1) });
await sleep(2000);
await snap('02_next_card', 'Aang: Panel');

// Nothing left. The empty state has to say where jobs come from, or it reads as broken.
send({ t: 'panel.reply', facts: [], trust: [], actions: '', drafts: [], mail: false, sessions: [], jobs: [] });
await sleep(2000);
await snap('03_empty', 'Aang: Panel');

console.log('\njob.act messages the Body sent: ' + JSON.stringify(seen.filter(m => m.t === 'job.act')));
body.kill(); cap.stdin.write('quit\n'); wss.close();
await sleep(600);
console.log('look at ' + outDir);
process.exit(0);

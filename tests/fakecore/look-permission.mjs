// Actually look at a permission question, with its plain-English footnote.
//   node look-permission.mjs        captures to the repo's snaps-permission folder
//
// Joshua, 2026-10-03: "im just seeing gibberish... i need them to surface as boomer proof easy to
// understand langauge but still very briefly explain the conctep of what hes doing". The wording is
// covered by permissions.mjs; this is the other half, because wording that is correct and unreadable
// on screen has not been fixed. A question that runs off the frame is still gibberish.
//
// Drives the real Body with a fake Core, so it costs no quota. It sends the real wire message, which
// means the `means` field is exercised end to end rather than through a test-only shortcut.
import { requireNoBody } from './guard.mjs';
import { WebSocketServer } from 'ws';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const root = path.resolve(import.meta.dirname, '..', '..');
const exeIn = c => path.join(root, 'src', 'Body', 'bin', c, 'net10.0-windows', 'Aang.exe');
const bodyExe = fs.existsSync(exeIn('Debug')) ? exeIn('Debug') : exeIn('Release');
const capture = path.join(root, 'tools', 'measure', 'Capture.ps1');
const outDir = process.argv[2] ?? path.join(root, 'snaps-permission');
fs.mkdirSync(outDir, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const cap = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', capture, '-Serve'],
  { stdio: ['pipe', 'pipe', 'inherit'] });
let capLine = null;
cap.stdout.on('data', d => { const s = String(d).trim(); if (capLine) { const f = capLine; capLine = null; f(s); } });
const snap = async name => {
  const file = path.join(outDir, name + '.png');
  const reply = new Promise(res => { capLine = res; });
  cap.stdin.write(`snap ${file} Aang Body\n`);
  const r = await reply;
  console.log((r.startsWith('ok') ? '  saved  ' : '  FAILED ') + name + (r.startsWith('ok') ? '' : '  ' + r));
};

const wss = new WebSocketServer({ host: '127.0.0.1', port: 47831, path: '/body' });
let ws = null;
const hello = new Promise(res => wss.on('connection', s => { ws = s; s.on('message', m => { const j = JSON.parse(String(m)); if (j.t === 'hello') res(j); }); }));
const send = o => ws.send(JSON.stringify(o));

await requireNoBody();
const body = spawn(bodyExe, ['--no-core', '--quiet=never'], { stdio: 'ignore' });
const h = await Promise.race([hello, sleep(20000).then(() => null)]);
if (!h) { console.error('the Body never connected'); body.kill(); cap.kill(); wss.close(); process.exit(1); }
console.log('Body connected, pid ' + h.pid);
await sleep(2500);

// 1. What he was actually seeing before any of this: a raw command as the whole question.
send({ t: 'permission', id: 'p1', tool: 'PowerShell',
  question: 'run Get-ChildItem -Path C:\\Users\\Shadow\\Documents -Recurse | Where-Object {$_.Length -gt 1mb}',
  remembers: 'run get-childitem commands' });
await sleep(2000);
await snap('01_before_gibberish');

// 2. The same thing, after: a question he can read, the concept under it, the exact command kept.
send({ t: 'permission', id: 'p2', tool: 'PowerShell',
  question: 'list what is in a folder',
  remembers: 'list what is in your folders',
  means: 'A command is an instruction typed straight to your computer, the way you would in a black terminal window. '
       + 'Exactly this: Get-ChildItem -Path C:\\Users\\Shadow\\Documents -Recurse' });
await sleep(2000);
await snap('02_after_plain');

// 3. A short one, to prove the footnote does not bloat a simple question.
send({ t: 'permission', id: 'p3', tool: 'mcp__aang__read_clipboard',
  question: 'read what you have copied',
  remembers: 'read your clipboard',
  means: 'Your clipboard is whatever you last copied. It might be a password, which is why I ask.' });
await sleep(2000);
await snap('03_short');

// 4. The longest explanation there is, against the longest button: if anything clips, it is here.
send({ t: 'permission', id: 'p4', tool: 'mcp__aang__mail_send',
  question: 'SEND this email to recruiter@constellationdealergroup.com. Subject: Following up on the Digital Project Coordinator role',
  remembers: 'send email',
  means: 'This actually sends it. Once it has gone it cannot be called back. The full wording is above.' });
await sleep(2200);
await snap('04_worst_case');

// 5. One with no explanation at all, which must look exactly as it did before.
send({ t: 'permission', id: 'p5', tool: 'mcp__aang__open', question: 'open Chrome', remembers: 'open apps' });
await sleep(1800);
await snap('05_no_explanation');

body.kill(); cap.stdin.write('quit\n'); wss.close();
await sleep(600);
console.log('\nlook at ' + outDir);
process.exit(0);

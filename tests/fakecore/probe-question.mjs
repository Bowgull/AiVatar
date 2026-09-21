import { requireNoBody } from './guard.mjs';
import { WebSocketServer } from 'ws';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..', '..');
const out = path.join(root, 'tests', 'out', 'actions'); mkdirSync(out, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const cap = spawn('powershell.exe', ['-NoProfile','-ExecutionPolicy','Bypass','-File', path.join(root,'tools','measure','Capture.ps1'), '-Serve'], { stdio:['pipe','pipe','inherit'] });
let b=''; const w=[]; cap.stdout.on('data',d=>{b+=d;let i;while((i=b.indexOf('\n'))>=0){const l=b.slice(0,i).trim();b=b.slice(i+1);w.shift()?.(l);}});
const ask=l=>new Promise(r=>{w.push(r);cap.stdin.write(l+'\n');}); w.push(()=>{}); await sleep(1200);
await requireNoBody();
const wss = new WebSocketServer({ host:'127.0.0.1', port:47831, path:'/body' });
let sock; const ready = new Promise(r => wss.on('connection', s => { sock = s; r(); }));
const body = spawn(path.join(root,'src','Body','bin','Release','net10.0-windows','Aang.exe'), ['--quiet=never','--no-core'], { stdio:'ignore' });
await ready; await sleep(2000);
const cases = [
  ['03_q_app',  'open paint', 'open apps'],
  ['04_q_run',  'run git status --short', 'run git commands'],
  ['05_q_long', 'run dotnet build …/Body/Body.csproj -c Release', 'run dotnet commands'],
  ['06_q_never','run rm -rf build', null],
];
let n = 0;
for (const [name, question, remembers] of cases) {
  sock.send(JSON.stringify({ t:'permission', id:'p'+(++n), tool:'x', question, ...(remembers ? { remembers } : {}) }));
  await sleep(900);
  console.log(name, (await ask(`snap ${path.join(out, name + '.png')} Aang Body`)).slice(0, 2));
  sock.send(JSON.stringify({ t:'bubble.clear' })); await sleep(300);
}
cap.stdin.write('quit\n'); body.kill(); wss.close(); process.exit(0);


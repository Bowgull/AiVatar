// Look at every bubble shape the user actually sees, for padding, overlap and alignment.
import { requireNoBody } from './guard.mjs';
import { WebSocketServer } from 'ws';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..', '..');
const outDir = path.join(root, 'tests', 'out', 'look');
mkdirSync(outDir, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const cap = spawn('powershell.exe', ['-NoProfile','-ExecutionPolicy','Bypass','-File', path.join(root,'tools','measure','Capture.ps1'), '-Serve'], { stdio:['pipe','pipe','inherit'] });
let b=''; const w=[]; cap.stdout.on('data',d=>{b+=d;let i;while((i=b.indexOf('\n'))>=0){const l=b.slice(0,i).trim();b=b.slice(i+1);w.shift()?.(l);}});
const ask=l=>new Promise(r=>{w.push(r);cap.stdin.write(l+'\n');}); w.push(()=>{});
await sleep(1200);
const wss = new WebSocketServer({ host:'127.0.0.1', port:47831, path:'/body' });
let sock=null; const ready = new Promise(res=>wss.on('connection',s=>{sock=s;res();}));
await requireNoBody();
const body = spawn(path.join(root,'src','Body','bin','Release','net10.0-windows','Aang.exe'), ['--quiet=never','--no-core'], { stdio:'ignore' });
await ready; await sleep(2000);
const send=o=>sock.send(JSON.stringify(o));
const cases = [
  ['01_one_short', 'pineapple'],
  ['02_one_full', 'The Bleeding Edge raids at nine.'],
  ['03_two_lines', 'Twenty two degrees and overcast in Toronto, wind is light right now.'],
  ['04_three_lines', 'I read package.json in src/Core and the version field says 0.1.0. Nothing else in there looks out of date.'],
  ['05_six_full', Array.from({length:12},(_,i)=>`Sentence number ${i+1} keeps going for a while so it wraps.`).join(' ')],
];
for (const [name, text] of cases) {
  send({ t:'bubble', text, stream:false, id:'x'+name });
  await sleep(900);
  console.log(name, (await ask(`snap ${path.join(outDir,name+'.png')} Aang Body`)).slice(0,2));
}
send({ t:'bubble.clear' }); await sleep(300);
send({ t:'permission', id:'p1', tool:'Bash', question:'run git status --short' });
await sleep(900); console.log('06_question', (await ask(`snap ${path.join(outDir,'06_question.png')} Aang Body`)).slice(0,2));
send({ t:'bubble.clear' }); await sleep(200);
send({ t:'bubble.dots' }); await sleep(600);
console.log('07_thinking', (await ask(`snap ${path.join(outDir,'07_thinking.png')} Aang Body`)).slice(0,2));
send({ t:'tool', id:'t', name:'WebSearch', phase:'start', label:'searching the web' }); await sleep(600);
console.log('08_receipt', (await ask(`snap ${path.join(outDir,'08_receipt.png')} Aang Body`)).slice(0,2));
cap.stdin.write('quit\n'); body.kill(); wss.close(); process.exit(0);

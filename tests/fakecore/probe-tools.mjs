// Against the LIVE Aang: does a normal answer show the copy/rate buttons without hovering?
import { WebSocket } from 'ws';
import { spawn } from 'node:child_process';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..', '..');
const cap = spawn('powershell.exe', ['-NoProfile','-ExecutionPolicy','Bypass','-File', path.join(root,'tools','measure','Capture.ps1'), '-Serve'], { stdio:['pipe','pipe','inherit'] });
let b=''; const w=[]; cap.stdout.on('data',d=>{b+=d;let i;while((i=b.indexOf('\n'))>=0){const l=b.slice(0,i).trim();b=b.slice(i+1);w.shift()?.(l);}});
const ask=l=>new Promise(r=>{w.push(r);cap.stdin.write(l+'\n');}); w.push(()=>{});
const sleep=ms=>new Promise(r=>setTimeout(r,ms)); await sleep(1200);
const c = new WebSocket('ws://127.0.0.1:47831/body'); const inbox=[];
c.on('message',d=>inbox.push(JSON.parse(String(d))));
await new Promise(r=>c.once('open',r));
c.send(JSON.stringify({ t:'submit', id:'probe1', text:'say hi in five words', mode:'quick' }));
const fin=await (async()=>{const d=Date.now()+60000;while(Date.now()<d){const m=inbox.find(x=>x.t==='bubble'&&x.stream===false&&x.id==='probe1');if(m)return m;await sleep(50);}return null;})();
console.log('reply:', JSON.stringify(fin?.text));
await sleep(800);
console.log(await ask(`snap ${path.join(root,'tests','out','live','02_answer_no_hover.png')} Aang Body`));
cap.stdin.write('quit\n'); c.close(); process.exit(0);

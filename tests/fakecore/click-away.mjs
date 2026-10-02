// 4.3b: PROVE the right-click menu opens on a message, with a real OS-level click.
//   node click-away.mjs
//
// Why a real click: the bug (2026-10-02) was that the bubble handled right-click on mouse DOWN while the
// tray menu opened on mouse UP, so both fired and the tray one won. A synthetic WinForms event would not
// have shown that; only a genuine click does.
import { requireNoBody } from './guard.mjs';
import { WebSocketServer } from 'ws';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const root = path.resolve(import.meta.dirname, '..', '..');
const bodyExe = path.join(root, 'src', 'Body', 'bin', 'Release', 'net10.0-windows', 'Aang.exe');
const capture = path.join(root, 'tools', 'measure', 'Capture.ps1');
const outDir = path.join(root, 'snaps-bubble', 'click');
fs.mkdirSync(outDir, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const cap = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', capture, '-Serve'],
  { stdio: ['pipe', 'pipe', 'inherit'] });
let waiting = null;
let buf = '';
cap.stdout.on('data', d => {
  buf += String(d);
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (waiting && line) { const f = waiting; waiting = null; f(line); }
  }
});
const ask = cmd => { const p = new Promise(res => { waiting = res; }); cap.stdin.write(cmd + '\n'); return p; };
const snap = async name => console.log('  ' + (await ask(`snap ${path.join(outDir, name + '.png')} Aang`)).split(' ')[0] + '  ' + name);

const wss = new WebSocketServer({ host: '127.0.0.1', port: 47831, path: '/body' });
const hello = new Promise(res => wss.on('connection', s => s.on('message', m => {
  const j = JSON.parse(String(m)); if (j.t === 'hello') res(j);
})));

await requireNoBody();
const body = spawn(bodyExe, ['--no-core', '--quiet=never', '--stack-test'], { stdio: 'ignore' });
const h = await Promise.race([hello, sleep(20000).then(() => null)]);
if (!h) { console.error('the Body never connected'); body.kill(); cap.kill(); wss.close(); process.exit(1); }
console.log('Body connected, pid ' + h.pid);
await sleep(3000);

const r = await ask('rect Aang');
if (!r.startsWith('rect')) { console.error('could not find the window: ' + r); process.exit(1); }
const [, wx, wy, ww, wh] = r.split(' ').map(Number);
console.log(`window at ${wx},${wy} ${ww}x${wh}`);

await snap('60_conversation_open');
// Far away from Aang, on the desktop. Joshua's rule: clicking outside puts everything away.
console.log('clicking well outside Aang');
await ask(`click left ${Math.max(20, wx - 300)} ${Math.max(20, wy + 60)}`);
await sleep(1200);
await snap('61_after_clicking_away');

try { body.kill(); } catch { }
cap.stdin.write('quit\n');
await sleep(600);
try { cap.kill(); } catch { }
wss.close();
console.log('\nin ' + outDir);

// End-to-end check of the Body over the real protocol. A fake Core drives it and a persistent capture
// process photographs the composited desktop (so the Body is seen over the game) at every step.
//   node scenario.mjs [outDir]
import { requireNoBody } from './guard.mjs';
import { WebSocketServer } from 'ws';
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const bodyExe = path.join(root, 'src', 'Body', 'bin', 'Release', 'net10.0-windows', 'Aang.exe');
const capture = path.join(root, 'tools', 'measure', 'Capture.ps1');
const outDir = process.argv[2] || path.join(root, 'tests', 'out');
mkdirSync(outDir, { recursive: true });
if (!existsSync(bodyExe)) { console.error('Body not built: ' + bodyExe); process.exit(2); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

// ---- persistent capture process
const cap = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', capture, '-Serve'], { stdio: ['pipe', 'pipe', 'inherit'] });
let capBuf = ''; const capWaiters = [];
cap.stdout.on('data', d => { capBuf += d; let i; while ((i = capBuf.indexOf('\n')) >= 0) { const line = capBuf.slice(0, i).trim(); capBuf = capBuf.slice(i + 1); capWaiters.shift()?.(line); } });
const capReply = () => new Promise(r => capWaiters.push(r));
await capReply(); // "ready"
async function snap(name) {
  const file = path.join(outDir, name + '.png');
  const reply = capReply();
  cap.stdin.write(`snap ${file} Aang Body\n`);
  const r = await reply;
  check('snapshot ' + name, r.startsWith('ok'), r);
}

// ---- fake Core
const wss = new WebSocketServer({ host: '127.0.0.1', port: 47831, path: '/body' });
let ws = null; const inbox = [];
const hello = new Promise(res => wss.on('connection', s => { ws = s; s.on('message', m => { const j = JSON.parse(String(m)); inbox.push(j); if (j.t === 'hello') res(j); }); }));
const send = o => ws.send(JSON.stringify(o));

await requireNoBody();
const body = spawn(bodyExe, ['--no-core'], { stdio: 'ignore' });
const h = await Promise.race([hello, sleep(20000).then(() => null)]);
check('Body connected and said hello', !!h && h.v === 1, h ? `pid ${h.pid}` : 'timeout');
if (!h) { body.kill(); cap.kill(); wss.close(); process.exit(1); }

await sleep(2500); // let the hello wave finish
await snap('01_idle');

// protocol round trip
inbox.length = 0; send({ t: 'ping' });
await sleep(400);
check('ping answered with pong', inbox.some(m => m.t === 'pong'));

// thinking dots
send({ t: 'bubble.dots' }); await sleep(700); await snap('02_dots');

// streaming reply, words arriving ~ every 70 ms
const reply = 'Quick version: the persistent session answered the second message in about two seconds, ' +
  'roughly half of what spawning a fresh process each time cost. It also stays warm between turns.';
const words = reply.split(' ');
let acc = '';
for (let i = 0; i < words.length; i++) {
  acc += (i ? ' ' : '') + words[i];
  send({ t: 'bubble', text: acc, stream: true });
  if (i === Math.floor(words.length * 0.45)) { await sleep(150); await snap('03_stream_mid'); }
  await sleep(70);
}
send({ t: 'bubble', text: acc, stream: false }); await sleep(500); await snap('04_final');

// long reply, more than six lines: newest lines must be shown
const long = Array.from({ length: 14 }, (_, i) => `Line ${i + 1} of a deliberately long answer to check scrolling.`).join(' ');
send({ t: 'bubble', text: long, stream: false }); await sleep(500); await snap('05_long_newest_lines');

send({ t: 'bubble.clear' }); await sleep(500); await snap('06_cleared');

// every animation state
for (const s of ['look', 'spin', 'zip', 'think', 'nap', 'scooter', 'walk', 'talk', 'hello']) {
  send({ t: 'state', state: s }); await sleep(450); await snap('07_state_' + s);
}
send({ t: 'state', state: 'idle' });

// quiet mode: a proactive message must be held, then delivered when quiet ends
send({ t: 'quiet', on: true }); await sleep(600);
inbox.length = 0;
send({ t: 'bubble', text: 'Reminder: stretch your legs.', proactive: true }); await sleep(700);
await snap('08_quiet_proactive_held');
send({ t: 'quiet', on: false }); await sleep(900);
await snap('09_quiet_released');
check('presence reported to the Core', inbox.some(m => m.t === 'presence'));

// unknown message types must be ignored, not crash the Body
send({ t: 'from-the-future', x: 1 }); await sleep(300);
send({ t: 'ping' }); inbox.length = 0; await sleep(400);
check('unknown message ignored, Body still responsive', inbox.some(m => m.t === 'pong'));

// tidy up
cap.stdin.write('quit\n');
body.kill(); wss.close();
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed; screenshots in ${outDir}`);
process.exit(failed.length ? 1 : 0);

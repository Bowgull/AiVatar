// The look pass, with a pretend Core (no model): a long reply streamed in lumps (the bubble should widen once and reveal
// evenly), a short reply (narrow), and the Panel's History and Settings tabs. Screenshots to tests/out/visual-look/.
import { WebSocketServer } from 'ws';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..', '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const out = path.join(root, 'tests', 'out', 'visual-look'); mkdirSync(out, { recursive: true });
function server(cmd, args) {
  const p = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'inherit'] });
  let buf = ''; const w = [];
  p.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); w.shift()?.(l); } });
  return { p, ask: line => new Promise(r => { w.push(r); p.stdin.write(line + '\n'); }), prime: () => w.push(() => {}) };
}
const cap = server('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'tools', 'measure', 'Capture.ps1'), '-Serve']); cap.prime();
await sleep(1500);
const snap = n => cap.ask(`snap ${path.join(out, n + '.png')}`);
const LONG = 'Here is the short version. Your week is fairly open: standup at 9:30 each morning, the dentist on Thursday at 2, and nothing booked for the weekend. Three emails are waiting, one from Sarah about lunch that probably wants an answer today. The job hunt found four new roles overnight and two of them look like a real fit, both in customer success at mid-sized software companies in Toronto with hybrid schedules and pay in your range. Want me to draft a reply to Sarah first, or look at the two good jobs?';

async function withBody(args, fn) {
  const wss = new WebSocketServer({ host: '127.0.0.1', port: 47831, path: '/body' });
  let sock = null; const got = [];
  wss.on('connection', ws => { sock = ws; ws.on('message', d => { const m = JSON.parse(String(d)); got.push(m);
    if (m.t === 'panel') ws.send(JSON.stringify({ t: 'panel.reply', mail: true, facts: [], trust: [], actions: '', drafts: [] }));
    if (m.t === 'history') ws.send(JSON.stringify({ t: 'history.reply', q: m.q ?? '', items: [
      { id: 4, ts: '2026-09-21 22:02:00', who: 'Aang', text: LONG },
      { id: 3, ts: '2026-09-21 22:01:50', who: 'you', text: 'what does my week look like' },
      { id: 2, ts: '2026-09-21 18:00:10', who: 'Aang', text: 'Sunny, 20 degrees.' },
      { id: 1, ts: '2026-09-21 18:00:00', who: 'you', text: 'weather?' }] }));
  }); });
  const body = spawn(path.join(root, 'src', 'Body', 'bin', 'Release', 'net10.0-windows', 'Aang.exe'), ['--quiet=never', '--no-core', ...args], { stdio: 'ignore', env: { ...process.env, AANG_BODY_DIR: mkdtempSync(path.join(os.tmpdir(), 'aang-look-')) } });
  for (let i = 0; i < 100 && !sock; i++) await sleep(150);
  await sleep(1200);
  try { await fn(m => sock.send(JSON.stringify(m)), got); } finally { body.kill(); wss.close(); await sleep(700); }
}

if (!process.argv.includes('--panel-only')) await withBody([], async send => {
  send({ t: 'bubble', text: 'Sunny, 20 degrees.', stream: false, id: 'r0' });
  await sleep(900); await snap('1_short_narrow');
  // the long one arrives in three lumps, as the Core flushes it
  const cuts = [60, 260, LONG.length];
  for (const c of cuts) { send({ t: 'bubble', text: LONG.slice(0, c), stream: true, id: 'r1' }); await sleep(250); }
  await snap('2_long_mid_reveal');
  send({ t: 'bubble', text: LONG, stream: false, id: 'r1' });
  await sleep(4000); await snap('3_long_wide_done');
});
await withBody(['--panel=4'], async () => { await sleep(900); await snap('4_history'); });
await withBody(['--panel=5'], async () => { await sleep(900); await snap('5_settings'); });
cap.p.stdin.write('quit\n');
console.log('done');
process.exit(0);

// The mode frames and the usage bars only, with a pretend Core (no model). Screenshots to tests/out/visual-modes/<dpi>/.
//   node visual-modes.mjs [dpi ...]        default 96
import { WebSocketServer } from 'ws';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const dpis = process.argv.slice(2).map(Number).filter(Boolean);
if (!dpis.length) dpis.push(96);
const sleep = ms => new Promise(r => setTimeout(r, ms));
function server(cmd, args) {
  const p = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'inherit'] });
  let buf = ''; const w = [];
  p.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); w.shift()?.(l); } });
  return { p, ask: line => new Promise(r => { w.push(r); p.stdin.write(line + '\n'); }), prime: () => w.push(() => {}) };
}
const ps = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File'];
const cap = server('powershell.exe', [...ps, path.join(root, 'tools', 'measure', 'Capture.ps1'), '-Serve']); cap.prime();
const keys = server('powershell.exe', [...ps, path.join(root, 'tools', 'measure', 'Keys.ps1'), '-Serve']); keys.prime();
await sleep(1500);

const EXTRA = 168;
const inDays = d => Math.floor(Date.now() / 1000 + d * 86400);
let failures = 0;
for (const dpi of dpis) {
  const out = path.join(root, 'tests', 'out', 'visual-modes', String(dpi));
  mkdirSync(out, { recursive: true });
  const wss = new WebSocketServer({ host: '127.0.0.1', port: 47831, path: '/body' });
  let sock = null; const got = [];
  wss.on('connection', ws => { sock = ws; ws.on('message', d => got.push(JSON.parse(String(d)))); });
  const body = spawn(path.join(root, 'src', 'Body', 'bin', 'Release', 'net10.0-windows', 'Aang.exe'), ['--quiet=never', '--no-core', `--dpi=${dpi}`], { stdio: 'ignore', env: { ...process.env, AANG_BODY_DIR: mkdtempSync(path.join(os.tmpdir(), 'aang-vm-')) } });
  for (let i = 0; i < 100 && !sock; i++) await sleep(150);
  if (!sock) { console.log(`dpi ${dpi}: the Body never connected`); failures++; body.kill(); wss.close(); continue; }
  await sleep(800);
  const s = dpi / 96;
  const send = m => sock.send(JSON.stringify(m));
  const snap = async name => { await sleep(600); const r = await cap.ask(`snap ${path.join(out, name + '.png')} Aang Body`); if (!r.startsWith('ok')) { failures++; console.log(`  ${name}: ${r}`); } };

  send({ t: 'quota', five: 0.12, week: 0.20, fiveResetsAt: inDays(0.1), weekResetsAt: inDays(3.5), level: 'ok' });
  const rect = (await keys.ask('rect Aang Body')).split(' ').map(Number);
  await keys.ask(`click ${Math.round(rect[0] + 360 * s)} ${Math.round(rect[1] + (EXTRA + 215) * s)}`); await sleep(700);   // a click on Aang opens the box
  await snap('01_auto_20pct_ok');

  // Quota levels, at the pace the week is at (3.5 of 7 days left puts the tick at the middle).
  send({ t: 'quota', five: 0.30, week: 0.44, fiveResetsAt: inDays(0.1), weekResetsAt: inDays(5), level: 'warn' }); await snap('02_44pct_warn_over_pace');
  send({ t: 'quota', five: 0.55, week: 0.56, fiveResetsAt: inDays(0.1), weekResetsAt: inDays(2), level: 'offer' }); await snap('03_56pct_offer');
  send({ t: 'quota', five: 0.95, week: 0.83, fiveResetsAt: inDays(0.1), weekResetsAt: inDays(1), level: 'offer' }); await snap('04_83pct_five_hour_red');
  send({ t: 'quota', five: 0.30, week: 0.44, fiveResetsAt: inDays(0.1), weekResetsAt: inDays(5), level: 'warn' });

  // The mode chip cycles Auto > Quick > Smart > Deep on a click; the frame around the box follows it.
  const chip = async () => {
    const r = (await keys.ask('rect Aang Input')).split(' ').map(Number);
    if (r.length < 4 || r.some(Number.isNaN)) { failures++; console.log('  no input window'); return; }
    await keys.ask(`click ${Math.round(r[0] + 35 * s)} ${Math.round(r[3] - 14.5 * s)}`); await sleep(400);
  };
  await snap('10_mode_auto');
  for (const m of ['quick', 'smart', 'deep']) { await chip(); await snap('11_mode_' + m); }
  await chip();                                                                               // back to Auto
  await keys.ask('send {ESC}');
  console.log(`dpi ${dpi}: captured to ${out}`);
  body.kill(); wss.close();
  await sleep(600);
}
keys.p.stdin.write('quit\n'); cap.p.stdin.write('quit\n');
process.exit(failures ? 1 : 0);

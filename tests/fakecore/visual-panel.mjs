// The Panel on the real Body with a pretend Core (no model): each tab is opened, photographed, and its buttons are
// checked by what the Body sends back. Screenshots to tests/out/visual-panel/.
//   node visual-panel.mjs
import { WebSocketServer } from 'ws';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const out = path.join(root, 'tests', 'out', 'visual-panel'); mkdirSync(out, { recursive: true });
function server(cmd, args) {
  const p = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'inherit'] });
  let buf = ''; const w = [];
  p.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); w.shift()?.(l); } });
  return { p, ask: line => new Promise(r => { w.push(r); p.stdin.write(line + '\n'); }), prime: () => w.push(() => {}) };
}
const ps = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File'];
const cap = server('powershell.exe', [...ps, path.join(root, 'tools', 'measure', 'Capture.ps1'), '-Serve']); cap.prime();
await sleep(1500);

const data = {
  t: 'panel.reply', mail: true,
  facts: [
    { id: 1, text: 'He raids on Tuesday and Thursday nights', seen: '2026-09-20 21:00:00', times: 4 },
    { id: 2, text: 'His dog is called Momo', seen: '2026-09-18 08:12:00', times: 1 },
    { id: 3, text: 'He prefers short, plain answers with no filler', seen: '2026-09-21 09:30:00', times: 7 },
  ],
  trust: [{ kind: 'open apps', example: 'open notepad', since: '2026-09-20' }, { kind: 'read email', example: 'look through your inbox', since: '2026-09-21' }],
  actions: '2:31 p.m.  open notepad\n2:40 p.m.  look through your inbox\n2:41 p.m.  draft an email to sarah@lee.com: Re: Lunch?',
  drafts: [
    { id: 'ab12cd34', hash: '0123456789abcdef', to: ['sarah@lee.com'], subject: 'Re: Lunch?', body: 'Thursday works. Noon at the usual place?', status: 'pending', newTo: [] },
    { id: 'ef56ab78', hash: 'fedcba9876543210', to: ['stranger@new.org'], subject: 'Hello', body: 'Hi there.', status: 'pending', newTo: ['stranger@new.org'] },
  ],
};
let failures = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + detail}`); if (!ok) failures++; };

for (const tab of [0, 1, 2, 3]) {
  const bodyDir = mkdtempSync(path.join(os.tmpdir(), 'aang-panel-'));
  const wss = new WebSocketServer({ host: '127.0.0.1', port: 47831, path: '/body' });
  const got = [];
  wss.on('connection', ws => ws.on('message', d => { const m = JSON.parse(String(d)); got.push(m); if (m.t === 'panel') ws.send(JSON.stringify(data)); }));
  const body = spawn(path.join(root, 'src', 'Body', 'bin', 'Release', 'net10.0-windows', 'Aang.exe'), ['--quiet=never', '--no-core', `--panel=${tab}`], { stdio: 'ignore', env: { ...process.env, AANG_BODY_DIR: bodyDir } });
  for (let i = 0; i < 60 && !got.some(m => m.t === 'panel'); i++) await sleep(150);
  check(`tab ${tab}: opening the Panel asks the Core for its data`, got.some(m => m.t === 'panel'));
  await sleep(900);
  const r = await cap.ask(`snap ${path.join(out, `tab${tab}.png`)}`);
  check(`tab ${tab}: screenshot taken`, r.startsWith('ok'), r);
  body.kill(); wss.close(); await sleep(600);
}
cap.p.stdin.write('quit\n');
console.log(failures ? `${failures} check(s) failed` : 'all panel checks passed');
process.exit(failures ? 1 : 0);

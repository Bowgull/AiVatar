// Docking the Rainmeter way, on the real Body with a pretend Core (no model). For each edge given:
// resting shows 34 px (forehead and eyes); hovering the edge brings him up with a hello; after 45 s untouched he tucks back.
//   node visual-rainmeter.mjs [edge ...]     default: bottom right
import { WebSocketServer } from 'ws';
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..', '..');
const edges = process.argv.slice(2).length ? process.argv.slice(2) : ['bottom', 'right'];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const out = path.join(root, 'tests', 'out', 'visual-rainmeter'); mkdirSync(out, { recursive: true });
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
const wa = JSON.parse(execSync(`powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; $w=[System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea; @{x=$w.X;y=$w.Y;w=$w.Width;h=$w.Height} | ConvertTo-Json -Compress"`, { encoding: 'utf8' }));
const WA = { l: wa.x, t: wa.y, r: wa.x + wa.w, b: wa.y + wa.h };
let failures = 0;
const check = (n, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  ' + d}`); if (!ok) failures++; };
const inter = (a) => { const l = Math.max(a.x, WA.l), t = Math.max(a.y, WA.t), r = Math.min(a.x + a.w, WA.r), b = Math.min(a.y + a.h, WA.b); return { w: Math.max(0, r - l), h: Math.max(0, b - t) }; };
await keys.ask(`move ${Math.round((WA.l + WA.r) / 2)} ${Math.round((WA.t + WA.b) / 2)}`);
for (const edge of edges) {
  const bodyDir = mkdtempSync(path.join(os.tmpdir(), 'aang-rm-'));
  const wss = new WebSocketServer({ host: '127.0.0.1', port: 47831, path: '/body' });
  let sock = null; wss.on('connection', ws => { sock = ws; });
  const body = spawn(path.join(root, 'src', 'Body', 'bin', 'Release', 'net10.0-windows', 'Aang.exe'), ['--quiet=never', '--no-core', `--dock=${edge}`], { stdio: 'ignore', env: { ...process.env, AANG_BODY_DIR: bodyDir } });
  for (let i = 0; i < 100 && !sock; i++) await sleep(150);
  await sleep(1200);
  const log = () => readFileSync(path.join(bodyDir, 'body.log'), 'utf8');
  const artrect = () => { const m = /artrect (\w+) (-?\d+),(-?\d+),(\d+),(\d+)/.exec(log().split(/\r?\n/).filter(l => l.includes('artrect')).at(-1) ?? ''); return m ? { why: m[1], x: +m[2], y: +m[3], w: +m[4], h: +m[5] } : null; };
  const a0 = artrect(); const s0 = a0 ? inter(a0) : { w: 0, h: 0 };
  const along = edge === 'left' || edge === 'right' ? s0.w : s0.h;
  check(`${edge}: resting, 34 px of him shows (forehead and eyes)`, !!a0 && Math.abs(along - 34) <= 2, JSON.stringify({ a0, along }));
  await cap.ask(`snap ${path.join(out, `${edge}_1_rest.png`)}`);
  // hover the part that shows, no click
  const hx = edge === 'right' ? WA.r - 10 : edge === 'left' ? WA.l + 10 : Math.round(Math.max(a0.x, WA.l) + s0.w / 2);
  const hy = edge === 'bottom' ? WA.b - 10 : edge === 'top' ? WA.t + 10 : Math.round(Math.max(a0.y, WA.t) + s0.h / 2);
  await keys.ask(`move ${hx} ${hy}`);
  await sleep(1400);
  const a1 = artrect();
  check(`${edge}: hovering (no click) brings him up`, !!a1 && a1.why === 'out', JSON.stringify(a1));
  await cap.ask(`snap ${path.join(out, `${edge}_2_up_hello.png`)}`);
  await keys.ask(`move ${Math.round((WA.l + WA.r) / 2)} ${Math.round((WA.t + WA.b) / 2)}`);
  await sleep(20000);
  check(`${edge}: still up 20 s later`, artrect()?.why === 'out', JSON.stringify(artrect()));
  await sleep(33000);
  const a3 = artrect();
  check(`${edge}: after about 45 s untouched he is back down in the same place`, a3?.why === 'peek' && a0 && a3.x === a0.x && a3.y === a0.y, JSON.stringify({ a0, a3 }));
  await cap.ask(`snap ${path.join(out, `${edge}_3_back_down.png`)}`);
  body.kill(); wss.close(); await sleep(700);
}
keys.p.stdin.write('quit\n'); cap.p.stdin.write('quit\n');
console.log(failures ? `${failures} check(s) failed` : 'all Rainmeter docking checks passed');
process.exit(failures ? 1 : 0);

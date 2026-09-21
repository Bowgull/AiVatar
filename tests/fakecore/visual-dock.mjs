// Edge docking on the real Body, checked by numbers as well as pictures, with a pretend Core (no model).
//   node visual-dock.mjs [edge ...]        default: left right top bottom     (dpi 96)
// For each edge: starts docked, checks exactly 56 px of him shows; sends a reminder and checks he peeks further out with a
// dot and says nothing; clicks his head and checks he stands out fully and shows the message; moves the mouse away and
// checks he tucks back to the identical place. Screenshots go to tests/out/visual-dock/.
import { WebSocketServer } from 'ws';
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const edges = process.argv.slice(2).length ? process.argv.slice(2) : ['left', 'right', 'top', 'bottom'];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const out = path.join(root, 'tests', 'out', 'visual-dock');
mkdirSync(out, { recursive: true });

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
console.log('work area', JSON.stringify(WA));

let failures = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + detail}`); if (!ok) failures++; };
const inter = (a, w) => { const l = Math.max(a.x, w.l), t = Math.max(a.y, w.t), r = Math.min(a.x + a.w, w.r), b = Math.min(a.y + a.h, w.b); return { w: Math.max(0, r - l), h: Math.max(0, b - t) }; };

for (const edge of edges) {
  const bodyDir = mkdtempSync(path.join(os.tmpdir(), 'aang-dock-'));
  const wss = new WebSocketServer({ host: '127.0.0.1', port: 47831, path: '/body' });
  let sock = null;
  wss.on('connection', ws => { sock = ws; });
  const body = spawn(path.join(root, 'src', 'Body', 'bin', 'Release', 'net10.0-windows', 'Aang.exe'), ['--quiet=never', '--no-core', `--dock=${edge}`], { stdio: 'ignore', env: { ...process.env, AANG_BODY_DIR: bodyDir } });
  for (let i = 0; i < 100 && !sock; i++) await sleep(150);
  if (!sock) { console.log(`${edge}: the Body never connected`); failures++; body.kill(); wss.close(); continue; }
  await sleep(1200);
  const send = m => sock.send(JSON.stringify(m));
  const artrect = () => {                                                       // the last "artrect" the Body logged
    const lines = readFileSync(path.join(bodyDir, 'body.log'), 'utf8').split(/\r?\n/).filter(l => l.includes('artrect'));
    const m = /artrect (\w+) (-?\d+),(-?\d+),(\d+),(\d+)/.exec(lines.at(-1) ?? '');
    return m ? { why: m[1], x: +m[2], y: +m[3], w: +m[4], h: +m[5] } : null;
  };
  const snap = async name => { await sleep(500); const r = await cap.ask(`snap ${path.join(out, `${edge}_${name}.png`)} Aang Body`); if (!r.startsWith('ok')) { failures++; console.log(`  ${edge} ${name}: ${r}`); } };

  const a0 = artrect();
  const shown0 = a0 ? inter(a0, WA) : { w: 0, h: 0 };
  const along = edge === 'left' || edge === 'right' ? shown0.w : shown0.h;
  check(`${edge}: docked, exactly 56 px of him shows`, !!a0 && Math.abs(along - 56) <= 2, JSON.stringify({ a0, shown0 }));
  await snap('1_peek');

  send({ t: 'bubble', text: 'Reminder: stretch', stream: false, proactive: true });
  await sleep(800);
  const a1 = artrect(); const shown1 = a1 ? inter(a1, WA) : { w: 0, h: 0 };
  const along1 = edge === 'left' || edge === 'right' ? shown1.w : shown1.h;
  check(`${edge}: with something to say he peeks further out`, along1 > along + 15, JSON.stringify({ along, along1 }));
  await snap('2_badge_no_bubble');

  // click his head: the middle of the part of him that shows
  const vis = a1 ?? a0;
  const cx = Math.round(Math.max(vis.x, WA.l) + Math.min(shown1.w || 1, vis.w) / 2), cy = Math.round(Math.max(vis.y, WA.t) + Math.min(shown1.h || 1, vis.h) / 2);
  await keys.ask(`click ${cx} ${cy}`);
  await sleep(900);
  const a2 = artrect();
  const full = a2 ? inter(a2, WA) : { w: 0, h: 0 };
  check(`${edge}: a click on his head brings him fully out`, !!a2 && a2.why === 'out' && full.w === a2.w && full.h === a2.h, JSON.stringify(a2));
  await snap('3_revealed_with_message');

  await keys.ask(`move ${Math.round((WA.l + WA.r) / 2)} ${Math.round((WA.t + WA.b) / 2)}`);   // the mouse leaves him
  await sleep(4500);                                                                      // the bubble finishes, then about a second
  const a3 = artrect();
  check(`${edge}: with the mouse away he tucks back to exactly where he was`, !!a3 && a3.why === 'peek' && a0 && a3.x === a0.x && a3.y === a0.y, JSON.stringify({ a0, a3 }));
  await snap('4_tucked_again');

  body.kill(); wss.close();
  await sleep(700);
}
keys.p.stdin.write('quit\n'); cap.p.stdin.write('quit\n');
console.log(failures ? `${failures} check(s) failed` : 'all docking checks passed');
process.exit(failures ? 1 : 0);

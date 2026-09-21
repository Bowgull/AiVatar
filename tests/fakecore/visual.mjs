// Every visual state of the real Body, at any scale, with a pretend Core: no model, so it costs nothing to run.
//   node visual.mjs [dpi ...]          e.g.  node visual.mjs 96 144 192   (default: 96)
// Screenshots go to tests/out/visual/<dpi>/. The window is drawn at that scale on any desktop (--dpi=), so 125/150/200%
// can be looked at without changing Windows settings.
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

const SHORT = "Notepad's open.";
const MEDIUM = "Quick version: the persistent session answered the second message in about two seconds, roughly half of what spawning a fresh process each time cost.";
const LONG = Array.from({ length: 5 }, (_, i) => `Point ${i + 1}: the reply keeps going so the bubble fills, cuts where the text runs out, and waits for the reader with a bobbing arrow.`).join(' ');
const CLAUDE = 'Need input in Claude on the job hunt. It wants permission to use Claude in Chrome.';

let failures = 0;
for (const dpi of dpis) {
  const out = path.join(root, 'tests', 'out', 'visual', String(dpi));
  mkdirSync(out, { recursive: true });
  const wss = new WebSocketServer({ host: '127.0.0.1', port: 47831, path: '/body' });
  let sock = null;
  const replies = [];
  wss.on('connection', ws => { sock = ws; ws.on('message', d => { const m = JSON.parse(String(d)); if (m.t === 'permission.reply') replies.push(m); }); });
  const body = spawn(path.join(root, 'src', 'Body', 'bin', 'Release', 'net10.0-windows', 'Aang.exe'), ['--quiet=never', '--no-core', `--dpi=${dpi}`], { stdio: 'ignore', env: { ...process.env, AANG_BODY_DIR: mkdtempSync(path.join(os.tmpdir(), 'aang-vis-')) } });
  for (let i = 0; i < 100 && !sock; i++) await sleep(150);
  if (!sock) { console.log(`dpi ${dpi}: the Body never connected`); failures++; body.kill(); wss.close(); continue; }
  await sleep(800);
  const send = m => sock.send(JSON.stringify(m));
  const snap = async name => { await sleep(700); const r = await cap.ask(`snap ${path.join(out, name + '.png')} Aang Body`); if (!r.startsWith('ok')) { failures++; console.log(`  ${name}: ${r}`); } };

  send({ t: 'bubble', text: SHORT, stream: false, id: 'a' }); await snap('01_short');
  send({ t: 'bubble', text: MEDIUM, stream: false, id: 'b' }); await snap('02_medium');
  send({ t: 'bubble', text: LONG, stream: false, id: 'c' }); await snap('03_long_more');
  send({ t: 'bubble', text: CLAUDE, stream: false, proactive: true, asked: true, focus: 'Claude', link: 'Claude' }); await snap('04_claude_link');
  send({ t: 'permission', id: 'p1', tool: 'mcp__aang__run', question: 'run git -C .../Documents/AangApp status --short', remembers: 'run git commands' }); await snap('05_permission');
  {
    // The buttons must be where they are drawn: click Yes, then No on a second question, and see what the Body reports.
    const s0 = dpi / 96, r0 = (await keys.ask('rect Aang Body')).split(' ').map(Number);
    const at = i => `click ${Math.round(r0[0] + (262 - 14 - (2 - i) * 76 + 34) * s0)} ${Math.round(r0[1] + (168 + 98) * s0)}`;
    replies.length = 0;
    await keys.ask(at(0)); await sleep(500);
    const yes = replies.find(m => m.id === 'p1');
    send({ t: 'permission', id: 'p2', tool: 'mcp__aang__run', question: 'run git status', remembers: 'run git commands' }); await sleep(700);
    await keys.ask(at(1)); await sleep(500);
    const no = replies.find(m => m.id === 'p2');
    const ok = yes?.allow === true && no?.allow === false;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  dpi ${dpi}: the Yes button answers yes and the No button answers no  ${JSON.stringify([yes?.allow, no?.allow])}`);
    if (!ok) failures++;
  }
  send({ t: 'permission.clear' }); send({ t: 'bubble.dots' }); send({ t: 'tool', id: 'x', name: 'get_weather', phase: 'start', label: 'checking the weather' }); await snap('06_receipt');
  send({ t: 'bubble', text: LONG, stream: false, id: 'd' });
  await sleep(500);
  const rect = (await keys.ask('rect Aang Body')).split(' ').map(Number);
  const s = dpi / 96;
  const EXTRA = 168;                                                       // PetWindow.Extra: headroom above the old window
  await keys.ask(`click ${Math.round(rect[0] + 120 * s)} ${Math.round(rect[1] + (EXTRA + 90) * s)}`);   // a click on the bubble expands it
  await snap('07_expanded');
  send({ t: 'bubble.clear' });
  send({ t: 'quota', five: 0.12, week: 0.44, fiveResetsAt: 0, weekResetsAt: 0, level: 'warn' });
  await keys.ask(`click ${Math.round(rect[0] + 360 * s)} ${Math.round(rect[1] + (EXTRA + 215) * s)}`); await sleep(600);   // a click on Aang opens the box
  await snap('08_input_warn');
  send({ t: 'quota', five: 0.3, week: 0.56, fiveResetsAt: 0, weekResetsAt: 0, level: 'offer' });
  await snap('09_input_offer');
  await keys.ask('send {ESC}');
  console.log(`dpi ${dpi}: captured to ${out}`);
  body.kill(); wss.close();
  await sleep(600);
}
keys.p.stdin.write('quit\n'); cap.p.stdin.write('quit\n');
process.exit(failures ? 1 : 0);

// Hidden means hidden. Clippy's real failure was coming back by itself after being dismissed, and
// OpenAI's pet has the same bug open today. Hide Aang, then throw at him everything that could bring him
// back, and check the window never reappears.
//   node hidden.mjs
import { requireNoBody, ensureForeground, releaseForeground } from './guard.mjs';
import { WebSocketServer } from 'ws';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const outDir = path.join(root, 'tests', 'out', 'hidden');
mkdirSync(outDir, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

for (const f of ['body.json', 'input-history.json']) { const p = path.join(process.env.AANG_BODY_DIR, f); if (existsSync(p)) rmSync(p); }

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
const snap = async name => { const r = await cap.ask(`snap ${path.join(outDir, name + '.png')} Aang Body`); console.log(`      snapshot ${name}: ${r.startsWith('ok') ? 'saved' : 'window not on screen'}`); };

await requireNoBody();
const wss = new WebSocketServer({ host: '127.0.0.1', port: 47831, path: '/body' });
let sock = null; const inbox = [];
const connected = new Promise(res => wss.on('connection', s => { sock = s; s.on('message', m => { inbox.push(JSON.parse(String(m))); }); res(); }));
const body = spawn(path.join(root, 'src', 'Body', 'bin', 'Release', 'net10.0-windows', 'Aang.exe'), ['--quiet=never', '--no-core'], { stdio: 'ignore' });
await Promise.race([connected, sleep(20000)]);
await sleep(2000);
const send = o => sock.send(JSON.stringify(o));
const visible = async () => (await keys.ask('rect Aang Body')) !== 'none';
const waitFor = async (f, ms = 4000) => { const d = Date.now() + ms; while (Date.now() < d) { const r = f(); if (r) return r; await sleep(50); } return null; };

await ensureForeground(keys.ask);
check('he starts out on screen', await visible());
await snap('01_before');

await keys.ask('hotkey Ctrl+NumLock');
await sleep(600);
check('Ctrl+NumLock hides him', !(await visible()));
await snap('02_hidden');

// everything that used to be able to bring him back
send({ t: 'bubble', text: 'Reminder: take the pizza out', stream: false, proactive: true });
await sleep(900);
check('an unprompted reminder does not bring him back', !(await visible()));

send({ t: 'state', state: 'hello' });
await sleep(700);
check('an animation change does not bring him back', !(await visible()));

send({ t: 'consent', id: 'k1', wanted: 'smart' });
await sleep(1200);
check('a consent question does not bring him back', !(await visible()));
check('and no input box was opened behind the scenes', (await keys.ask('rect Aang Input')) === 'none');

inbox.length = 0;
send({ t: 'permission', id: 'p1', tool: 'Bash', question: 'run git status --short' });
await sleep(1200);
check('a permission question does not bring him back', !(await visible()));
const reply = await waitFor(() => inbox.find(m => m.t === 'permission.reply' && m.id === 'p1'));
check('a permission he cannot see is answered no, straight away', reply?.allow === false, JSON.stringify(reply));

send({ t: 'bubble.dots' });
await sleep(700);
check('the thinking state does not bring him back', !(await visible()));
await snap('03_still_hidden');

// and he comes back when, and only when, Joshua asks
await keys.ask('hotkey Ctrl+NumLock');
await sleep(800);
check('Ctrl+NumLock brings him back when asked', await visible());
await snap('04_back');

await releaseForeground();
keys.p.stdin.write('quit\n'); cap.p.stdin.write('quit\n'); body.kill(); wss.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} hidden checks passed; screenshots in ${outDir}`);
process.exit(results.every(Boolean) ? 0 : 1);

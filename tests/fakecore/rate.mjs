// Copy and rate replies, for real: real hotkey, real keystrokes, real clicks, real mouse wheel, with WoW in front.
// A fake Core records what the Body sends and plays replies back, and screenshots are taken at each step.
//   node typing.mjs
import { requireNoBody, ensureForeground, releaseForeground } from './guard.mjs';
import { WebSocketServer } from 'ws';
import { spawn } from 'node:child_process';
import { execSync } from 'node:child_process';
import { mkdirSync, existsSync, rmSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const bodyExe = path.join(root, 'src', 'Body', 'bin', 'Release', 'net10.0-windows', 'Aang.exe');
const capture = path.join(root, 'tools', 'measure', 'Capture.ps1');
const keysPs = path.join(root, 'tools', 'measure', 'Keys.ps1');
const outDir = path.join(root, "tests", "out", "rate");
mkdirSync(outDir, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { if (!ok) console.log('   inbox:', JSON.stringify(inbox.map(m => m.t + ':' + (m.text ?? m.mode ?? m.on ?? ''))));  results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

// a clean Body state: no saved position or history
for (const f of ['body.json', 'input-history.json']) { const p = path.join(process.env.AANG_BODY_DIR, f); if (existsSync(p)) rmSync(p); }

function server(cmd, args) {
  const p = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'inherit'] });
  let buf = ''; const waiters = [];
  p.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); waiters.shift()?.(line); } });
  const next = () => new Promise(r => waiters.push(r));
  return { p, next, ask: async line => { const r = next(); p.stdin.write(line + '\n'); return r; } };
}
const ps = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File'];
const cap = server('powershell.exe', [...ps, capture, '-Serve']); await cap.next();
const keys = server('powershell.exe', [...ps, keysPs, '-Serve']); await keys.next();
const snap = async name => { const r = await cap.ask(`snap ${path.join(outDir, name + '.png')} Aang Body`); check('snapshot ' + name, r.startsWith('ok')); };

// ---- fake Core
const wss = new WebSocketServer({ host: '127.0.0.1', port: 47831, path: '/body' });
let sock = null; const inbox = [];
const connected = new Promise(res => wss.on('connection', s => { sock = s; s.on('message', m => { const j = JSON.parse(String(m)); j.at = Date.now(); inbox.push(j); if (j.t === 'hello') res(); }); }));
const send = o => sock.send(JSON.stringify(o));
const submits = () => inbox.filter(m => m.t === 'submit');
const waitFor = async (f, ms = 3000) => { const d = Date.now() + ms; while (Date.now() < d) { const r = f(); if (r) return r; await sleep(20); } return null; };

await requireNoBody();
const body = spawn(bodyExe, ['--quiet=never', '--no-core'], { stdio: 'ignore' });
await Promise.race([connected, sleep(20000)]);
check('Body connected', !!sock);
await sleep(1500);
const rect = (await keys.ask('rect Aang Body')).split(' ').map(Number);
const [L, T] = rect;
const spriteXY = [L + 360, T + 110 + 215];                       // a pixel on Aang himself

// ---- copy and rate a reply
await ensureForeground(keys.ask);
const REPLY = 'The chibi is the small pixel Aang on your desktop.';
send({ t: 'bubble', text: REPLY, stream: false, id: 'r1' });
await sleep(700);
await snap('01_no_hover');
await keys.ask(`move ${L + 120} ${T + 110 + 105}`); await sleep(300);
await snap('02_hover_tools');
const toolXY = i => [L + 218 + (i - 1) * 23, T + 110 + 69];         // copy, good, not good (centres)
const rated = () => inbox.filter(m => m.t === 'rate');
inbox.length = 0;
await keys.ask(`click ${toolXY(1)[0]} ${toolXY(1)[1]}`); await sleep(300);
check('the good button sends an "up" rating for that reply', rated().at(-1)?.value === 'up' && rated().at(-1)?.id === 'r1', JSON.stringify(rated()));
await snap('03_rated_up');
await keys.ask(`click ${toolXY(1)[0]} ${toolXY(1)[1]}`); await sleep(300);
check('clicking it again takes the rating back', rated().at(-1)?.value === 'none', JSON.stringify(rated().at(-1)));
await keys.ask(`click ${toolXY(2)[0]} ${toolXY(2)[1]}`); await sleep(300);
check('the other button sends "down"', rated().at(-1)?.value === 'down', JSON.stringify(rated().at(-1)));
await snap('04_rated_down');
await keys.ask(`click ${toolXY(0)[0]} ${toolXY(0)[1]}`); await sleep(300);
await snap('05_copied');
const clip = execSync('powershell -NoProfile -Command "Get-Clipboard"', { encoding: 'utf8' }).trim();
check('the copy button puts the reply text on the clipboard', clip === REPLY, clip);
check('none of that closed the bubble or opened the input box', (await keys.ask('rect Aang Input')) === 'none');
// a proactive message (or one without an id) is not rateable
send({ t: 'bubble', text: 'Timer done.', stream: false, proactive: true }); await sleep(600);
await keys.ask(`move ${L + 120} ${T + 110 + 105}`); await sleep(300);
await snap('06_proactive_no_tools');
await releaseForeground();
keys.p.stdin.write('quit\n'); cap.p.stdin.write('quit\n'); body.kill(); wss.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} rate checks passed; screenshots in ${outDir}`);
process.exit(results.every(Boolean) ? 0 : 1);

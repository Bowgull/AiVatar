// The unprompted side, for real: the real Core and the real Body, hook events posted the way Claude Code
// posts them, and a reminder that actually goes off. Mute and quiet are checked by eye and by message.
//   node proactive.mjs
import { requireNoBody } from './guard.mjs';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { WebSocket } from 'ws';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const bodyExe = path.join(root, 'src', 'Body', 'bin', 'Release', 'net10.0-windows', 'Aang.exe');
const capture = path.join(root, 'tools', 'measure', 'Capture.ps1');
const outDir = path.join(root, 'tests', 'out', 'proactive');
mkdirSync(outDir, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

// a clean Body: no saved mute or position from an earlier run
for (const f of ['body.json', 'input-history.json']) { const p = path.join(process.env.APPDATA, 'Aang', f); if (existsSync(p)) rmSync(p); }

const cap = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', capture, '-Serve'], { stdio: ['pipe', 'pipe', 'inherit'] });
let buf = ''; const waiters = [];
cap.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); waiters.shift()?.(l); } });
const capAsk = line => new Promise(r => { waiters.push(r); cap.stdin.write(line + '\n'); });
waiters.push(() => {}); await sleep(1200);
const snap = async name => check('snapshot ' + name, (await capAsk(`snap ${path.join(outDir, name + '.png')} Aang Body`)).startsWith('ok'));

// the real Core, on its real port, with throwaway state
const stateDir = mkdtempSync(path.join(os.tmpdir(), 'aang-pro-'));
const core = spawn(process.execPath, ['--no-warnings', 'src/index.ts'], {
  cwd: path.join(root, 'src', 'Core'), stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, AANG_STATE_DIR: stateDir, AANG_WARM: '0' },
});
core.stdout.on('data', d => process.stdout.write('      core: ' + d));
core.stderr.on('data', d => process.stdout.write('      core!: ' + d));
await sleep(3500);

await requireNoBody();
const body = spawn(bodyExe, ['--quiet=never', '--no-core'], { stdio: 'ignore' });

// a watcher client, so we can see exactly what the Body is being sent
const spy = new WebSocket('ws://127.0.0.1:47831/body');
const inbox = [];
spy.on('message', d => inbox.push(JSON.parse(String(d))));
await new Promise(r => spy.once('open', r));
await sleep(2500);
const bubbles = () => inbox.filter(m => m.t === 'bubble');
const waitFor = async (f, ms = 8000) => { const d = Date.now() + ms; while (Date.now() < d) { const r = f(); if (r) return r; await sleep(50); } return null; };

const hook = (ev, extra = {}) => fetch(`http://127.0.0.1:47832/hook?e=${ev}`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ hook_event_name: ev, session_id: 's-live', cwd: 'C:\\Users\\Shadow\\Documents\\AangApp', ...extra }),
});

// 1. Claude Code blocked on a permission prompt -> Aang says so on screen
let n = bubbles().length;
const res = await hook('Notification', { message: 'Claude needs your permission to run git push' });
check('the hook endpoint answers with no content at all', res.status === 204, String(res.status));
const said = await waitFor(() => bubbles().slice(n).find(b => /waiting on you/.test(b.text)));
check('a blocked Claude Code session reaches the bubble', !!said && said.proactive === true, JSON.stringify(said?.text));
await sleep(600); await snap('01_claude_waiting');

// 2. a short turn Joshua watched is not announced
n = bubbles().length;
await hook('UserPromptSubmit', { prompt: 'tidy the imports' });
await sleep(300);
await hook('Stop');
await sleep(1200);
check('a turn he sat through says nothing', bubbles().slice(n).length === 0, JSON.stringify(bubbles().slice(n).map(b => b.text)));

// 3. muting: nothing unprompted gets through, and it is delivered after unmuting
spy.send(JSON.stringify({ t: 'mute', on: true }));
await sleep(400);
n = bubbles().length;
await hook('Notification', { session_id: 's-other', cwd: 'D:\\code\\cerebro', message: 'needs permission again' });   // a different session: the same one would be held back as nagging
await sleep(1500);
check('muted: nothing unprompted arrives', bubbles().slice(n).length === 0, JSON.stringify(bubbles().slice(n).map(b => b.text)));
await snap('02_muted_silent');
spy.send(JSON.stringify({ t: 'mute', on: false }));
const afterUnmute = await waitFor(() => bubbles().slice(n).find(b => /cerebro/.test(b.text)));
check('unmuting delivers what was held', !!afterUnmute, JSON.stringify(afterUnmute?.text));
await sleep(600); await snap('03_after_unmute');

// 4. a reminder really goes off
n = bubbles().length;
spy.send(JSON.stringify({ t: 'submit', id: 'p1', text: 'remind me in 1 minute to check the oven', mode: 'quick' }));
const set = await waitFor(() => inbox.slice(0).find(m => m.t === 'bubble' && m.stream === false && m.id === 'p1'), 60000);
check('Aang confirms the reminder in his own words', !!set && /minute|oven|remind/i.test(set.text), JSON.stringify(set?.text));
await sleep(500); await snap('04_reminder_set');
console.log('      waiting up to 70s for the reminder to fire...');
const fired = await waitFor(() => bubbles().find(b => b.proactive && /oven/i.test(b.text)), 75000);
check('the reminder goes off on its own, unprompted', !!fired, JSON.stringify(fired?.text));
await sleep(600); await snap('05_reminder_fired');

// 5. asking him what Claude Code is doing is answered from the real events
await hook('UserPromptSubmit', { prompt: 'rebuild the bubble' });
await sleep(300);
spy.send(JSON.stringify({ t: 'submit', id: 'p2', text: 'whats claude code doing right now', mode: 'quick' }));
const status = await waitFor(() => inbox.find(m => m.t === 'bubble' && m.stream === false && m.id === 'p2'), 60000);
// both project names and the subject of the turn exist only in the hook events, so this is grounded, not invented
check('he answers from the real session state, not a guess',
  !!status && /bubble/i.test(status.text) && /aangapp/i.test(status.text) && /cerebro/i.test(status.text), JSON.stringify(status?.text));
await sleep(600); await snap('06_status_answer');

cap.stdin.write('quit\n'); spy.close(); body.kill(); core.kill();
console.log(`\n${results.filter(Boolean).length}/${results.length} proactive checks passed; screenshots in ${outDir}`);
process.exit(results.every(Boolean) ? 0 : 1);

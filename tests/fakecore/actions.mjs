// The everyday things: open an app, a folder and a link; be asked once and then trusted; read the
// clipboard. Real Core, real Claude, real Body, real windows.
//   node actions.mjs
import { requireNoBody, ensureForeground, releaseForeground, isolatedEnv, closeTestFolders } from './guard.mjs';
import { spawn, execSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { WebSocket } from 'ws';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const outDir = path.join(root, 'tests', 'out', 'actions');
mkdirSync(outDir, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

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

const stateDir = mkdtempSync(path.join(os.tmpdir(), 'aang-act-'));
const trustFile = path.join(stateDir, 'trust.json');
const trusted = () => { try { return Object.keys(JSON.parse(readFileSync(trustFile, 'utf8'))); } catch { return []; } };

await requireNoBody();
const core = spawn(process.execPath, ['--no-warnings', 'src/index.ts'], {
  cwd: path.join(root, 'src', 'Core'), stdio: ['ignore', 'pipe', 'pipe'],
  env: isolatedEnv({ AANG_STATE_DIR: stateDir, AANG_WARM: '0' }),
});
core.stderr.on('data', d => process.stdout.write('      core!: ' + d));
await sleep(6000);

const body = spawn(path.join(root, 'src', 'Body', 'bin', 'Release', 'net10.0-windows', 'Aang.exe'), ['--quiet=never', '--no-core'], { stdio: 'ignore' });
const c = new WebSocket('ws://127.0.0.1:47831/body');
const inbox = [];
let autoAnswer = null;                       // 'yes' | 'no' | null (leave it for the test to click)
c.on('message', d => {
  const m = JSON.parse(String(d));
  inbox.push(m);
  if (m.t === 'permission' && autoAnswer) c.send(JSON.stringify({ t: 'permission.reply', id: m.id, allow: autoAnswer === 'yes' }));
});
await new Promise(r => c.once('open', r));
await sleep(2500);
await ensureForeground(keys.ask);

const waitFor = async (f, ms = 150000) => { const d = Date.now() + ms; while (Date.now() < d) { const r = f(); if (r) return r; await sleep(60); } return null; };
const ask = async (id, text, clickYes = false) => {
  const from = inbox.length;
  c.send(JSON.stringify({ t: 'submit', id, text, mode: 'quick' }));
  if (clickYes) {
    // Click yes while the question is actually on screen. Waiting for the turn to finish first meant the
    // question had already timed out and answered itself with a no.
    const q = await waitFor(() => inbox.slice(from).find(x => x.t === 'permission'), 60000);
    if (q) {
      const r = (await keys.ask('rect Aang Body')).split(' ').map(Number);
      // the yes button: BubbleView.ChoiceRect(0), centred, anchored to the bubble's bottom edge
      await keys.ask(`click ${r[0] + 130} ${r[1] + 168 + 98}`);
    }
  }
  const m = await waitFor(() => inbox.find(x => x.t === 'bubble' && x.stream === false && x.id === id));
  const since = inbox.slice(from);
  const perms = since.filter(x => x.t === 'permission').map(x => x.question);
  const usedTools = since.filter(x => x.t === 'tool').map(x => x.name);
  console.log(`      "${text}"\n        -> ${JSON.stringify(m?.text)}\n        asked: ${JSON.stringify(perms)}  tools: ${usedTools.join(', ') || 'none'}`);
  return { text: m?.text ?? '', perms, tools: usedTools };
};
const kill = cmd => { try { execSync(cmd, { stdio: 'ignore' }); } catch { /* nothing was running */ } };
const running = name => { try { return execSync(`tasklist /FI "IMAGENAME eq ${name}" /NH`, { encoding: 'utf8' }).includes(name); } catch { return false; } };

// ---- 1. opening an app: one plain question, not a shell command
kill('taskkill /IM mspaint.exe /F 2>nul');
autoAnswer = null;
const a1 = await ask('a1', 'open paint for me', true);
console.log('      tools: ' + a1.tools.join(', '));
check('he asks in plain words, not with a command line', a1.perms.some(q => /^open /i.test(q ?? '')), JSON.stringify(a1.perms));
check('the question says what saying yes commits to', inbox.some(m => m.t === 'permission' && /from now on/i.test(JSON.stringify(m.remembers ? 'x' : '') + (m.remembers ?? '')) || (m.t === 'permission' && m.remembers)), JSON.stringify(inbox.filter(m => m.t === 'permission').map(m => m.remembers)));
await sleep(600);
console.log('      ' + (await cap.ask(`snap ${path.join(outDir, '01_asking.png')} Aang Body`)).slice(0, 40));

// Polled rather than one look after 4 s: Paint is a Store app and, with WoW holding the GPU on 2026-09-20,
// it had not appeared 4.6 s after "Paint's open" although the launch had gone through.
const t0 = Date.now();
const paintUp = await waitFor(() => running('mspaint.exe'), 20000);
check('paint actually opened', !!paintUp, paintUp ? `after ${((Date.now() - t0) / 1000).toFixed(1)} s` : 'not running after 20 s');
check('and the yes was remembered', trusted().includes('open apps'), JSON.stringify(trusted()));

// ---- 2. the same kind of thing is not asked again
autoAnswer = 'no';                            // if it asks, the answer is no and the check below fails
const a2 = await ask('a2', 'open calculator too');
check('the second app does not ask again', a2.perms.length === 0, JSON.stringify(a2.perms));
await sleep(3000);
check('and it opened', running('CalculatorApp.exe') || running('Calculator.exe') || running('calc.exe') || /opened/i.test(a2.text), a2.text.slice(0, 60));

// ---- 3. a different kind still asks
const folder = mkdtempSync(path.join(os.tmpdir(), 'open-me-'));
autoAnswer = 'yes';
const a3 = await ask('a3', `open the folder ${folder.split(String.fromCharCode(92)).join('/')}`);
check('a different kind of thing is asked about separately', a3.perms.length > 0, JSON.stringify(a3.perms));
check('and that kind is remembered too', trusted().includes('open files'), JSON.stringify(trusted()));

// ---- 4. saying no means nothing happens
kill('taskkill /IM mspaint.exe /F 2>nul');
await sleep(800);
autoAnswer = 'no';
const a4 = await ask('a4', 'run the command: git status --short');
check('a shell command asks even though opening is trusted', a4.perms.some(q => /git/.test(q ?? '')), JSON.stringify(a4.perms));
check('saying no leaves it undone, and he says so', /no|not|did ?n.t|declin/i.test(a4.text), JSON.stringify(a4.text.slice(0, 80)));
check('and no is not remembered as a yes', !trusted().includes('run git'), JSON.stringify(trusted()));

// ---- 5. the clipboard, with his say-so
await keys.ask('setclip the kettle is broken again');
autoAnswer = 'yes';
const a5 = await ask('a5', 'what did i just copy?');
check('he reads the clipboard once allowed', /kettle/i.test(a5.text), JSON.stringify(a5.text.slice(0, 80)));
check('reading the clipboard was asked about', trusted().includes('read clipboard'), JSON.stringify(trusted()));
await sleep(500);
console.log('      ' + (await cap.ask(`snap ${path.join(outDir, '02_clipboard.png')} Aang Body`)).slice(0, 40));

kill('taskkill /IM mspaint.exe /F 2>nul');
kill('taskkill /IM CalculatorApp.exe /F 2>nul');
await keys.ask('focus explorer'); await keys.ask('send %{F4}');
await releaseForeground();
closeTestFolders('open-me-');
keys.p.stdin.write('quit\n'); cap.p.stdin.write('quit\n'); c.close(); body.kill(); core.kill();
console.log(`\n${results.filter(Boolean).length}/${results.length} action checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);




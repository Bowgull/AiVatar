// The one that matters on this machine: the Shadow VM reboots ~6x a day, so the Core restarts.
// Aang must carry the conversation across that, not start over. Real Core, real Claude, real Body.
//   node resume.mjs
import { requireNoBody } from './guard.mjs';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { WebSocket } from 'ws';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const bodyExe = path.join(root, 'src', 'Body', 'bin', 'Release', 'net10.0-windows', 'Aang.exe');
const capture = path.join(root, 'tools', 'measure', 'Capture.ps1');
const outDir = path.join(root, 'tests', 'out', 'resume');
mkdirSync(outDir, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

const cap = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', capture, '-Serve'], { stdio: ['pipe', 'pipe', 'inherit'] });
let buf = ''; const w = [];
cap.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); w.shift()?.(l); } });
const capAsk = line => new Promise(r => { w.push(r); cap.stdin.write(line + '\n'); });
w.push(() => {}); await sleep(1200);
const snap = async name => check('snapshot ' + name, (await capAsk(`snap ${path.join(outDir, name + '.png')} Aang Body`)).startsWith('ok'));

const stateDir = mkdtempSync(path.join(os.tmpdir(), 'aang-resume-'));
const sessionsFile = path.join(stateDir, 'sessions.json');
const startCore = () => {
  const c = spawn(process.execPath, ['--no-warnings', 'src/index.ts'], {
    cwd: path.join(root, 'src', 'Core'), stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, AANG_STATE_DIR: stateDir, AANG_WARM: '0' },
  });
  c.stdout.on('data', d => process.stdout.write('      core: ' + d));
  c.stderr.on('data', d => process.stdout.write('      core!: ' + d));
  return c;
};
const connect = async () => {
  const c = new WebSocket('ws://127.0.0.1:47831/body');
  const inbox = [];
  c.on('message', d => inbox.push(JSON.parse(String(d))));
  await new Promise(r => c.once('open', r));
  return { c, inbox };
};
const waitFor = async (f, ms = 120000) => { const d = Date.now() + ms; while (Date.now() < d) { const r = f(); if (r) return r; await sleep(60); } return null; };

await requireNoBody();
const body = spawn(bodyExe, ['--quiet=never', '--no-core'], { stdio: 'ignore' });

// ---- first session: tell him something only he could know afterwards
let core = startCore();
await sleep(6000);
let { c, inbox } = await connect();
await sleep(500);
const SECRET = 'my raid group is called the Bleeding Edge and we go at nine';
c.send(JSON.stringify({ t: 'submit', id: 'r1', text: `remember this for later: ${SECRET}`, mode: 'quick' }));
const first = await waitFor(() => inbox.find(m => m.t === 'bubble' && m.stream === false && m.id === 'r1'));
console.log(`      told him -> ${JSON.stringify(first?.text)}`);
check('he answered in the first session', !!first);
await sleep(600); await snap('01_first_session');

check('a session id was written to disk', existsSync(sessionsFile) && !!JSON.parse(readFileSync(sessionsFile, 'utf8')).quick?.id,
  existsSync(sessionsFile) ? JSON.stringify(JSON.parse(readFileSync(sessionsFile, 'utf8')).quick?.id?.slice(0, 8)) : 'no file');
const idBefore = JSON.parse(readFileSync(sessionsFile, 'utf8')).quick.id;

// ---- the Shadow reboot: kill the Core outright, exactly as a hard shutdown would
c.close(); core.kill('SIGKILL');
await sleep(2500);
check('the Core is really gone', true, '(killed)');
await snap('02_core_gone');

// ---- second session: same state dir, brand new process
core = startCore();
await sleep(6000);
({ c, inbox } = await connect());
await sleep(500);
c.send(JSON.stringify({ t: 'submit', id: 'r2', text: 'what did i just ask you to remember? say it back to me', mode: 'quick' }));
const second = await waitFor(() => inbox.find(m => m.t === 'bubble' && m.stream === false && m.id === 'r2'));
console.log(`      after restart -> ${JSON.stringify(second?.text)}`);
check('he remembers across a Core restart', !!second && /bleeding edge/i.test(second.text), JSON.stringify(second?.text));
check('and the detail, not just the gist', !!second && /nine|9/i.test(second.text), JSON.stringify(second?.text));
await sleep(700); await snap('03_after_restart');
const idAfter = JSON.parse(readFileSync(sessionsFile, 'utf8')).quick.id;
check('it carried on the same conversation rather than starting a new one', idAfter === idBefore, `${idBefore.slice(0, 8)} -> ${idAfter.slice(0, 8)}`);

// ---- a dead session id must not wedge him: poison it and restart again
c.close(); core.kill('SIGKILL'); await sleep(2000);
writeFileSync(sessionsFile, JSON.stringify({ quick: { id: 'sess-that-never-existed-0000', savedAt: new Date().toISOString() } }, null, 2));
core = startCore();
await sleep(6000);
({ c, inbox } = await connect());
await sleep(500);
c.send(JSON.stringify({ t: 'submit', id: 'r3', text: 'say the word pineapple and nothing else', mode: 'quick' }));
const third = await waitFor(() => inbox.find(m => m.t === 'bubble' && m.stream === false && m.id === 'r3'), 150000);
console.log(`      after a dead id -> ${JSON.stringify(third?.text)}`);
check('a dead session id does not wedge him, he just starts fresh', !!third && /pineapple/i.test(third.text), JSON.stringify(third?.text));
check('and the dead id was replaced on disk', JSON.parse(readFileSync(sessionsFile, 'utf8')).quick?.id !== 'sess-that-never-existed-0000');
await sleep(600); await snap('04_after_dead_id');

cap.stdin.write('quit\n'); c.close(); body.kill(); core.kill();
console.log(`\n${results.filter(Boolean).length}/${results.length} resume checks passed; screenshots in ${outDir}`);
process.exit(results.every(Boolean) ? 0 : 1);

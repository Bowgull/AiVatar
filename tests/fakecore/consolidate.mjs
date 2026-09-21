// Catch-up for real: have a conversation, restart the Core, and see what he chose to keep from it.
// Runs against a COPY of the real database.
//   node consolidate.mjs
import { requireNoBody } from './guard.mjs';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { WebSocket } from 'ws';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

const dataDir = mkdtempSync(path.join(os.tmpdir(), 'aang-cdata-'));
const stateDir = mkdtempSync(path.join(os.tmpdir(), 'aang-cstate-'));
const dbFile = path.join(dataDir, 'aang.db');
const live = path.join(os.homedir(), 'Documents', 'Aang', 'aang.db');
const forSql = p => p.split(String.fromCharCode(92)).join('/');
if (existsSync(live)) { const d = new DatabaseSync(live); d.exec(`VACUUM INTO '${forSql(dbFile)}'`); d.close(); }
const q = sql => { const d = new DatabaseSync(dbFile); const r = d.prepare(sql).all(); d.close(); return r; };
const factList = () => q('SELECT text FROM facts WHERE retired = 0').map(r => r.text);
const before = factList();

let coreLog = '';
const startCore = () => {
  const c = spawn(process.execPath, ['--no-warnings', 'src/index.ts'], {
    cwd: path.join(root, 'src', 'Core'), stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, AANG_DATA_DIR: dataDir, AANG_STATE_DIR: stateDir, AANG_WARM: '0' },
  });
  c.stdout.on('data', d => { coreLog += d; if (/memory:/.test(String(d))) process.stdout.write('      core: ' + d); });
  c.stderr.on('data', d => { coreLog += d; process.stdout.write('      core!: ' + d); });
  return c;
};
const connect = async () => { const ws = new WebSocket('ws://127.0.0.1:47831/body'); const inbox = []; ws.on('message', d => inbox.push(JSON.parse(String(d)))); await new Promise(r => ws.once('open', r)); return { ws, inbox }; };
const talk = async (ws, inbox, id, text) => {
  ws.send(JSON.stringify({ t: 'submit', id, text, mode: 'quick' }));
  const d = Date.now() + 150000; let m;
  while (Date.now() < d && !(m = inbox.find(x => x.t === 'bubble' && x.stream === false && x.id === id))) await sleep(60);
  console.log(`      "${text}"\n        -> ${JSON.stringify(m?.text)}`);
};

await requireNoBody();

// ---- session one: a normal conversation, with things worth keeping mixed into it
let core = startCore();
await sleep(7000);
let { ws, inbox } = await connect();
await talk(ws, inbox, 'c1', 'morning. im back on the sygnalist rewrite today, the old parser has to go');
await talk(ws, inbox, 'c2', 'my brother mark is visiting next month so ill be off for a week around then');
await talk(ws, inbox, 'c3', 'whats the weather like');
ws.close(); core.kill('SIGKILL');
await sleep(2500);

// ---- session two: the catch-up runs 20 seconds in
console.log('      restarting, waiting for the catch-up...');
core = startCore();
await sleep(40000);
const after = factList();
const learned = after.filter(f => !before.includes(f));
console.log('      newly kept: ' + JSON.stringify(learned));

check('the catch-up ran', /caught up on/.test(coreLog), (coreLog.match(/memory: .*/g) || []).slice(-2).join(' | '));
check('it kept something from the conversation', learned.length > 0, JSON.stringify(learned));
check('it kept the project he mentioned in passing', learned.some(f => /sygnalist|parser/i.test(f)), JSON.stringify(learned));
check('it kept the person he mentioned', learned.some(f => /mark|brother/i.test(f)), JSON.stringify(learned));
check('it left out the weather, which will not be true next week', !learned.some(f => /weather|degrees|overcast|rain/i.test(f)), JSON.stringify(learned));

// ---- and he can use it in the next conversation without being told
({ ws, inbox } = await connect());
await talk(ws, inbox, 'c4', 'remind me what im meant to be working on');
const used = inbox.find(x => x.t === 'bubble' && x.stream === false && x.id === 'c4');
check('he uses it in the next conversation', /sygnalist|parser/i.test(used?.text ?? ''), JSON.stringify(used?.text));

// ---- and it does not do it all again
const sizeBefore = factList().length;
ws.close(); core.kill('SIGKILL'); await sleep(2000);
coreLog = '';
core = startCore();
await sleep(35000);
check('a second restart does not re-read the same turns', /skipped \(nothing new/.test(coreLog) || factList().length === sizeBefore,
  (coreLog.match(/memory: .*/g) || []).slice(-2).join(' | '));

core.kill();
console.log(`\n${results.filter(Boolean).length}/${results.length} consolidation checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);

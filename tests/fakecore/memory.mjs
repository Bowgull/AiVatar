// Memory, for real: tell him something, kill the Core, and see whether he still knows it.
// Runs against a COPY of the real database, never the live one.
//   node memory.mjs
import { requireNoBody } from './guard.mjs';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { WebSocket } from 'ws';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const outDir = path.join(root, 'tests', 'out', 'memory');
mkdirSync(outDir, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

// a copy of the real history, so recall is tested against real conversations
const dataDir = mkdtempSync(path.join(os.tmpdir(), 'aang-memdata-'));
const live = path.join(os.homedir(), 'Documents', 'Aang', 'aang.db');
const dbFile = path.join(dataDir, 'aang.db');
if (existsSync(live)) { const d = new DatabaseSync(live); d.exec(`VACUUM INTO '${dbFile.replace(/\\/g, '/')}'`); d.close(); }
const facts = () => { const d = new DatabaseSync(dbFile); const r = d.prepare('SELECT text, retired FROM facts').all(); d.close(); return r; };

const stateDir = mkdtempSync(path.join(os.tmpdir(), 'aang-memstate-'));
let core = null;
const startCore = () => {
  const c = spawn(process.execPath, ['--no-warnings', 'src/index.ts'], {
    cwd: path.join(root, 'src', 'Core'), stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, AANG_DATA_DIR: dataDir, AANG_STATE_DIR: stateDir, AANG_WARM: '0' },
  });
  c.stdout.on('data', d => { const s = String(d); if (/memory:|listening/.test(s)) process.stdout.write('      core: ' + s); });
  c.stderr.on('data', d => process.stdout.write('      core!: ' + d));
  return c;
};
let c = null, inbox = [];
const connect = async () => {
  const ws = new WebSocket('ws://127.0.0.1:47831/body');
  inbox = [];
  ws.on('message', d => inbox.push(JSON.parse(String(d))));
  await new Promise(r => ws.once('open', r));
  return ws;
};
const waitFor = async (f, ms = 150000) => { const d = Date.now() + ms; while (Date.now() < d) { const r = f(); if (r) return r; await sleep(60); } return null; };
const ask = async (id, text) => {
  const from = inbox.length;
  c.send(JSON.stringify({ t: 'submit', id, text, mode: 'quick' }));
  const m = await waitFor(() => inbox.find(x => x.t === 'bubble' && x.stream === false && x.id === id));
  const tools = inbox.slice(from).filter(x => x.t === 'tool').map(x => x.name).join(', ');
  console.log(`      "${text}"\n        -> ${JSON.stringify(m?.text)}   [${tools || 'no tools'}]`);
  return { text: m?.text ?? '', tools };
};

await requireNoBody();
core = startCore();
await sleep(7000);
c = await connect();

// ---- 1. he keeps something worth keeping, without being told to
const a = await ask('m1', 'just so you know, my raid group is called the Bleeding Edge and we go tuesdays at nine');
check('he writes down something worth keeping, unasked', /remember/.test(a.tools), a.tools || 'no tools');
check('and it is in the database', facts().some(f => /bleeding edge/i.test(f.text) && !f.retired), JSON.stringify(facts().map(f => f.text).slice(-3)));

// ---- 2. it survives the Core dying, which happens ~6 times a day here
c.close(); core.kill('SIGKILL');
await sleep(2500);
core = startCore();
await sleep(8000);
c = await connect();
const b = await ask('m2', 'when do i raid?');
check('he still knows it after the Core was killed and restarted', /tuesday/i.test(b.text), JSON.stringify(b.text));
check('and he knew it without going looking, because it was already in front of him', !/search_memory/.test(b.tools), b.tools || 'no tools');

// ---- 3. recall by meaning, with none of the same words
const d = await ask('m3', 'did i ever mention the desktop pet locking up when i switch windows?');
check('he searches his history for a vague reference', /search_memory/.test(d.tools), d.tools || 'no tools');

// ---- 4. correcting him replaces, rather than piling up
await ask('m4', 'actually the raid moved, we go wednesdays at eight now');
const held = facts().filter(f => /bleeding edge|raid/i.test(f.text) && !f.retired);
check('a correction supersedes rather than stacking up', held.length <= 2, JSON.stringify(held.map(h => h.text)));
const e = await ask('m5', 'so when do i raid now?');
check('and he answers with the new one', /wednesday/i.test(e.text) && !/tuesday/i.test(e.text), JSON.stringify(e.text));

// ---- 5. forget means forget
await ask('m6', 'forget everything about my raid nights please');
const after = facts().filter(f => /bleeding edge|raid/i.test(f.text) && !f.retired);
check('forgetting actually removes it', after.length === 0, JSON.stringify(after.map(h => h.text)));

// ---- 6. and he can say what he holds
const g = await ask('m7', 'what do you actually know about me?');
check('he can list what he knows', /what_you_know/.test(g.tools), g.tools || 'no tools');
check('and the forgotten thing is not in it', !/bleeding edge/i.test(g.text), JSON.stringify(g.text?.slice(0, 120)));

// ---- 7. the older turns got their vectors in the background
const d2 = new DatabaseSync(dbFile);
const turns = d2.prepare('SELECT count(*) c FROM turns').get().c;
const embedded = d2.prepare('SELECT count(*) c FROM embeddings').get().c;
d2.close();
console.log(`      coverage: ${embedded} of ${turns} turns embedded`);
check('the history that had no vectors is being backfilled', embedded > 148, `${embedded} embedded, was 148`);

c.close(); core.kill();
console.log(`\n${results.filter(Boolean).length}/${results.length} memory checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);

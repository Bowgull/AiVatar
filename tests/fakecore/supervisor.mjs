// The Body alone must bring up the Core, restart it if it dies, and take it down when the Body goes -
// AND survive being killed in the middle of answering without losing what Joshua said.
//   node supervisor.mjs      (no chat turns reach Claude: see stub-claude.mjs, so this costs no quota)
//
// 5.6, 2026-10-03. What this used to be: it killed an IDLE Core and asserted only that something was
// listening again. The M5 gate asks for mid-reply with the conversation preserved, which is a different
// and much harder claim - two tests wearing the same name. It also ran the Body against Joshua's REAL
// memory and state directory, so a gate test could scribble on the thing it was meant to protect.
//
// Both fixed here. The mid-reply half is free because the Core is pointed at a stub Claude that never
// answers, which leaves a turn genuinely in flight for ~19 seconds - far longer than a kill needs.
//
// On the Body half, honestly: killing the Body kills the Core BY DESIGN. CoreSupervisor puts the Core in
// a Windows job object with KILL_ON_JOB_CLOSE precisely so a crashed Body cannot leave an orphan behind.
// "Both recover" was never achievable and should never have been written as a gate. What is asserted
// instead is the real guarantee: the Core goes with the Body, and nothing is left running.
import { requireNoBody, isolatedEnv } from './guard.mjs';
import { spawn, execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import net from 'node:net';
import path from 'node:path';
import { WebSocket } from 'ws';

const root = path.resolve(import.meta.dirname, '..', '..');
const exeIn = c => path.join(root, 'src', 'Body', 'bin', c, 'net10.0-windows', 'Aang.exe');
const bodyExe = existsSync(exeIn('Release')) ? exeIn('Release') : exeIn('Debug');
const stub = path.join(root, 'tests', 'fakecore', 'stub-claude.mjs');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };
const listening = () => new Promise(res => { const s = net.connect(47831, '127.0.0.1'); s.once('connect', () => { s.destroy(); res(true); }); s.once('error', () => res(false)); });
const until = async (f, ms) => { const d = Date.now() + ms; while (Date.now() < d) { if (await f()) return true; await sleep(300); } return false; };
const corePid = () => { try { const o = execSync('powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort 47831 -State Listen -ErrorAction SilentlyContinue).OwningProcess"', { encoding: 'utf8' }).trim(); return Number(o.split(/\s+/)[0]) || 0; } catch { return 0; } };

/** Talk to the Core the way the Body does, and collect what comes back. */
function connect() {
  const seen = [];
  const w = new WebSocket('ws://127.0.0.1:47831/body');
  const ready = new Promise(res => w.on('open', () => { w.send(JSON.stringify({ t: 'hello', v: 1 })); res(); }));
  w.on('message', d => { try { seen.push(JSON.parse(d)); } catch { /* not ours */ } });
  w.on('error', () => { /* the Core is being killed on purpose; that is the test */ });
  return { w, seen, ready, send: m => { try { w.send(JSON.stringify(m)); } catch { /* gone */ } },
           saw: t => seen.some(m => m.t === t), last: t => seen.filter(m => m.t === t).at(-1) };
}

console.log(`using ${path.relative(root, bodyExe)}`);
check('nothing is listening before the test', !(await listening()));
await requireNoBody();

// Isolated: a copy of his memory, a throwaway state folder, and a Claude that never answers. The Body
// passes its environment to the Core it starts, so AANG_CLAUDE_EXE reaches the lane.
// AANG_WARM=0 matters: the Core otherwise opens with a silent warm-up turn, and against a Claude that
// never answers that turn holds the lane, so the test's own message comes back "queued" instead of
// running. Found the first time this test ran (2026-10-03).
const env = isolatedEnv({ AANG_CLAUDE_EXE: stub, AANG_WARM: '0' });
const dbFile = path.join(env.AANG_DATA_DIR, 'aang.db');
const body = spawn(bodyExe, ['--quiet=never'], { stdio: 'ignore', env });

check('the Body alone brings the Core up', await until(listening, 25000));
const pid1 = corePid();
console.log('      core pid', pid1);

// ---------------------------------------------------------------- killed while idle (what it used to test)
execSync(`taskkill /PID ${pid1} /T /F`, { stdio: 'ignore' });
check('the Core is gone after being killed', await until(async () => !(await listening()), 5000));
check('the Body starts it again by itself', await until(listening, 30000));
const pid2 = corePid();
check('it is a new process', pid2 > 0 && pid2 !== pid1, `${pid1} -> ${pid2}`);

// ---------------------------------------------------------------- killed MID-REPLY (what the gate asks for)
await sleep(1500);
const said = `gate test ${Date.now()}`;
const a = connect();
await a.ready;
a.send({ t: 'submit', id: 'gate-1', text: said });

// "In flight" means the Core has accepted it and is waiting on Claude: it said think and never finished.
const inFlight = await until(async () => a.saw('state') && a.seen.some(m => m.t === 'state' && m.state === 'think'), 15000);
check('a turn is genuinely in flight', inFlight);
check('and it has not finished', !a.seen.some(m => m.t === 'bubble' && m.stream === false));

const pid3 = corePid();
execSync(`taskkill /PID ${pid3} /T /F`, { stdio: 'ignore' });
check('the Core dies mid-reply', await until(async () => !(await listening()), 6000));
check('the Body brings it back after a mid-reply death', await until(listening, 30000));
check('that too is a new process', corePid() > 0 && corePid() !== pid3);

// The gate's real claim: what he said is still there afterwards.
await sleep(2500);
let kept = false, rows = 0;
try {
  const db = new DatabaseSync(dbFile, { readOnly: true });
  rows = db.prepare('SELECT COUNT(*) n FROM turns').get().n;
  kept = db.prepare('SELECT COUNT(*) n FROM turns WHERE text = ?').get(said).n > 0;
  db.close();
} catch (e) { console.log('      could not read the memory back: ' + e.message); }
check('what he said survives a mid-reply crash', kept, kept ? '' : `(his message is not in the ${rows} stored turns)`);

// And the Body is usable again rather than stuck thinking.
const b = connect();
await b.ready;
b.send({ t: 'status' });
check('the Body can talk to the new Core', await until(async () => b.saw('status.reply'), 15000));

try { a.w.close(); b.w.close(); } catch { /* already gone */ }

// ---------------------------------------------------------------- shutdown, stated honestly
body.kill();
check('when the Body exits, the Core goes with it (by design: the job object)', await until(async () => !(await listening()), 10000));

console.log(`\n${results.filter(Boolean).length}/${results.length} supervisor checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);

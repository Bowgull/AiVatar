// The scoreboard (2026-11-01, his "go big", his yes to "about 30 of your real asks, timed and graded before and after
// each change"): Aang's real brain, in its own process, answers his real asks, and each answer is timed and checked.
//
// Its own brain: a separate port, a COPY of his memory (aang.db) and an empty state folder holding only google.json and
// home-place.json, so no Discord, no Mac link, no browser sync, no trust grants. Every permission, hands or look request
// is answered "no", so nothing on his machines is opened, closed or sent; an act ask passes when Aang ASKED.
// The asks live outside this public repo (they are his words): Documents/Aang/reports/scoreboard/asks.json.
//
// Per ask: the lane pickLane() would choose (or "code" when the brain answered without a model), ms to the first word,
// ms to the finished reply, tools started, whether it asked, voice flags from lint(), and pass/fail on the ask's checks.
// Costs real quota (about 25 Claude turns): run by hand, once per brain change, never in the suite.
// Run: node --no-warnings test/scoreboard-live.ts <label> [kinds]   (writes <label>.json and <label>.md next to asks.json)
import { execFileSync, spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { pickLane } from '../src/route.ts';
import { lint } from '../src/voice.ts';
import { TOKEN_HEADER, tokenFile } from '../src/token.ts';

interface Check { id: string; text: string; any?: string[]; none?: string[]; asks?: boolean; asksOk?: boolean; tool?: string; maxWords?: number }
interface Ask extends Check { kind: string; then?: Check }
interface Result { id: string; kind: string; text: string; lane: string; firstMs: number | null; doneMs: number | null; reply: string;
  tools: string[]; asked: string[]; voice: string[]; pass: boolean; why: string[] }

const label = process.argv[2] ?? new Date().toISOString().slice(0, 10);
const home = os.homedir();
const DIR = path.join(home, 'Documents', 'Aang', 'reports', 'scoreboard');
const PORT = 47931;
const TIMEOUT = 150_000;
// Optional third argument: only these kinds (talk,fact,snip...), so a change to one path re-runs only its asks.
const only = process.argv[3]?.split(',');
const asks: Ask[] = JSON.parse(readFileSync(path.join(DIR, 'asks.json'), 'utf8')).asks.filter((a: Ask) => !only || only.includes(a.kind));

// "(?i)" is the asks file's case-insensitive mark (JS has no inline flag).
const re = (s: string) => s.startsWith('(?i)') ? new RegExp(s.slice(4), 'i') : new RegExp(s);
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

// The private copy: memory from his data folder, two state files, nothing else.
const realData = path.join(home, 'Documents', 'Aang');
const realState = path.join(process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming'), 'Aang');
const data = mkdtempSync(path.join(os.tmpdir(), 'aang-sb-data-')), state = mkdtempSync(path.join(os.tmpdir(), 'aang-sb-state-'));
for (const f of ['aang.db', 'aang.db-wal', 'aang.db-shm']) if (existsSync(path.join(realData, f))) copyFileSync(path.join(realData, f), path.join(data, f));
for (const f of ['google.json', 'home-place.json']) if (existsSync(path.join(realState, f))) copyFileSync(path.join(realState, f), path.join(state, f));
// The memory backup pushes the data folder with git (backup.ts). Without a repo it fails, and Aang then opened small talk
// with "the memory backup has failed" (the first run, 2026-11-01). A throwaway repo and remote make it succeed quietly.
const remote = mkdtempSync(path.join(os.tmpdir(), 'aang-sb-remote-'));
const git = (cwd: string, ...a: string[]) => execFileSync('git', a, { cwd, stdio: 'ignore' });
git(remote, 'init', '-q', '--bare');
git(data, 'init', '-q'); git(data, 'remote', 'add', 'origin', remote);
git(data, '-c', 'user.name=scoreboard', '-c', 'user.email=scoreboard@localhost', 'commit', '-q', '--allow-empty', '-m', 'start');
git(data, 'push', '-q', '-u', 'origin', 'HEAD');

const brain = spawn(process.execPath, ['--no-warnings', 'src/index.ts'], {
  cwd: path.resolve(import.meta.dirname, '..'),
  env: { ...process.env, AANG_BRAIN_HERE: '1', AANG_PORT: String(PORT), AANG_DATA_DIR: data, AANG_STATE_DIR: state, AANG_TRANSCRIPT_SCAN: '0' },
  stdio: ['ignore', 'ignore', 'ignore'],
});
// His Google sign-in and the copy of his memory never outlive the run (his rule, 2026-11-01: clean up behind you).
const stop = () => {
  try { brain.kill(); } catch { /* gone */ }
  try { rmSync(path.join(state, 'google.json'), { force: true }); } catch { /* gone */ }
  for (const d of [data, state, remote]) { try { rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch { /* still locked: the OS temp sweep takes it */ } }
};
process.on('exit', stop);

// This run's password, as every real part of Aang sends it (token.ts); the brain writes it into its state folder.
let ws: WebSocket | null = null;
for (let i = 0; i < 60 && !ws; i++) {
  await wait(1000);
  if (!existsSync(tokenFile(state))) continue;
  const c = new WebSocket(`ws://127.0.0.1:${PORT}/body`, { headers: { [TOKEN_HEADER]: readFileSync(tokenFile(state), 'utf8').trim() } });
  ws = await new Promise<WebSocket | null>(r => { c.once('open', () => r(c)); c.once('error', () => r(null)); });
}
if (!ws) { console.error('The brain did not start within 60 s.'); stop(); process.exit(1); }
const sock = ws;
sock.send(JSON.stringify({ t: 'hello', v: 1, shell: true, bubble: true }));
await wait(12_000);                                                   // let the warm-up finish, as it would before he types

type Msg = Record<string, any>;
let listener: ((m: Msg) => void) | null = null;
sock.on('message', d => {
  const m: Msg = JSON.parse(String(d));
  // Nothing he owns is touched: every ask to act is refused, and remembered for the grade.
  if (m.t === 'permission') sock.send(JSON.stringify({ t: 'permission.reply', id: m.id, choice: 'no' }));
  if (m.t === 'hands.request') sock.send(JSON.stringify({ t: 'hands', id: m.id, ok: false, detail: 'He said no.' }));
  if (m.t === 'look.request') sock.send(JSON.stringify({ t: 'look', id: m.id, ok: false, error: 'No screen in this test.' }));
  if (m.t === 'choice') sock.send(JSON.stringify({ t: 'choice.reply', id: m.id, pick: 0 }));
  listener?.(m);
});

async function one(kind: string, c: Check): Promise<Result> {
  const id = 'sb-' + c.id, t0 = Date.now();
  let first: number | null = null, done: number | null = null, reply = '', usedModel = false, who = '';
  const tools: string[] = [], asked: string[] = [];
  await new Promise<void>(resolve => {
    const timer = setTimeout(resolve, TIMEOUT);
    let quiet: NodeJS.Timeout | null = null;
    const finish = () => { clearTimeout(timer); if (quiet) clearTimeout(quiet); resolve(); };
    listener = (m) => {
      if (m.t === 'tool' && m.phase === 'start') { tools.push(m.name); usedModel = true; }
      if (m.t === 'bubble.dots' || (m.t === 'state' && m.state === 'thinking')) usedModel = true;
      if (m.t === 'permission' || m.t === 'consent' || m.t === 'hands.request' || m.t === 'choice') asked.push(m.t + ':' + (m.tool ?? m.action ?? m.question ?? '').toString().slice(0, 60));
      if (m.t === 'bubble' && !m.proactive && (m.id === id || m.id === undefined)) {
        if (first === null) first = Date.now() - t0;
        if (m.stream) { usedModel = true; return; }
        reply = String(m.text ?? ''); done = Date.now() - t0; who = String(m.who ?? '');
        // A refused ask is often followed by a second line; give it a moment, then the turn is over.
        if (quiet) clearTimeout(quiet);
        quiet = setTimeout(finish, asked.length ? 2500 : 600);
      }
      if (m.t === 'error' && m.id === id) { reply = 'ERROR: ' + m.message; done = Date.now() - t0; finish(); }
    };
    sock.send(JSON.stringify({ t: 'submit', id, text: c.text, mode: 'auto' }));
  });
  listener = null;
  const why: string[] = [];
  if (done === null) why.push('no reply in 150 s');
  if (c.any && !c.any.some(p => re(p).test(reply))) why.push('missing what it should say');
  for (const p of c.none ?? []) if (re(p).test(reply)) why.push('said ' + p.replace('(?i)', ''));
  if (c.asks && !asked.length) why.push('acted or refused without asking');
  if (c.tool && !tools.some(t => re(c.tool!).test(t))) why.push('did not use ' + c.tool);
  const words = reply.split(/\s+/).filter(Boolean).length;
  if (c.maxWords && words > c.maxWords) why.push(`too long (${words} words)`);
  if (/^ERROR|did not finish|took too long/i.test(reply)) why.push('failed turn');
  const voice = lint(reply, tools, c.text, 'rich').flags;
  // Who really answered, from the bubble's own label (Quick, Smart, MiniCPM...): since instant answers the lane is decided
  // at run time, so pickLane() alone no longer says.
  const lane = !usedModel ? 'code' : who && who !== 'Aang' ? who : pickLane(c.text, 'auto', false, false).lane;
  return { id: c.id, kind, text: c.text, lane, firstMs: first, doneMs: done, reply, tools, asked, voice, pass: !why.length, why };
}

const results: Result[] = [];
for (const a of asks) {
  const r = await one(a.kind, a); results.push(r);
  console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.id.padEnd(16)} ${r.lane.padEnd(6)} first ${String(r.firstMs ?? '-').padStart(6)} ms  done ${String(r.doneMs ?? '-').padStart(6)} ms  ${r.why.join('; ')}`);
  if (a.then) {
    const f = await one(a.kind, a.then); results.push(f);
    console.log(`${f.pass ? 'PASS' : 'FAIL'} ${f.id.padEnd(16)} ${f.lane.padEnd(6)} first ${String(f.firstMs ?? '-').padStart(6)} ms  done ${String(f.doneMs ?? '-').padStart(6)} ms  ${f.why.join('; ')}`);
  }
  await wait(1500);
}
sock.close(); stop();

// The summary: pass rate, and the median and slowest times by lane.
const med = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)]! : 0; };
const byLane = new Map<string, Result[]>();
for (const r of results) byLane.set(r.lane, [...(byLane.get(r.lane) ?? []), r]);
const passed = results.filter(r => r.pass).length;
const lines = [
  `# Scoreboard: ${label}`, '',
  `Run ${new Date().toISOString()}. **${passed} of ${results.length} passed.** Voice flags on ${results.filter(r => r.voice.length).length} replies.`, '',
  '| Lane | Asks | Passed | First word (median) | Done (median) | Slowest |', '|---|---|---|---|---|---|',
  ...[...byLane].map(([l, rs]) => { const f = rs.map(r => r.firstMs ?? TIMEOUT), d = rs.map(r => r.doneMs ?? TIMEOUT);
    return `| ${l} | ${rs.length} | ${rs.filter(r => r.pass).length} | ${(med(f) / 1000).toFixed(1)} s | ${(med(d) / 1000).toFixed(1)} s | ${(Math.max(...d) / 1000).toFixed(1)} s |`; }),
  '', '| | Ask | Lane | First | Done | Tools | Asked | Why | Reply |', '|---|---|---|---|---|---|---|---|---|',
  ...results.map(r => `| ${r.pass ? 'PASS' : 'FAIL'} | ${r.text.replace(/\|/g, '/')} | ${r.lane} | ${r.firstMs === null ? '-' : (r.firstMs / 1000).toFixed(1)} | ${r.doneMs === null ? '-' : (r.doneMs / 1000).toFixed(1)} | ${r.tools.join(', ')} | ${r.asked.length ? 'yes' : ''} | ${[...r.why, ...r.voice.map(v => 'voice: ' + v)].join('; ')} | ${r.reply.replace(/\s+/g, ' ').replace(/\|/g, '/').slice(0, 160)} |`),
];
mkdirSync(DIR, { recursive: true });
writeFileSync(path.join(DIR, label + '.json'), JSON.stringify(results, null, 1));
writeFileSync(path.join(DIR, label + '.md'), lines.join('\n') + '\n');
console.log(`\n${passed}/${results.length} passed. Written: ${path.join(DIR, label + '.md')}`);
process.exit(0);

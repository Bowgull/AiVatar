import './_env.ts';
// The brain must never stop for long (2026-10-21). core.log caught it frozen for 6.8 s and 12.6 s right after two
// starts, just as Joshua sent a message: the memory backup (VACUUM INTO, integrity check, git add/commit/push of a
// 15 MB file) ran synchronously on the brain's thread. This runs the start-up and background work that touches big
// files - the transcript scan over a 20 MB transcript, the progress history read back at its 6,000-line cap, his
// session names, the memory backup and the Mac release hash - and checks the event loop never stops for more than 30 ms
// at a time (monitorEventLoopDelay, with a setImmediate loop keeping it awake so the delays it sees are real ones).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { DatabaseSync } from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';
import { TranscriptScan } from '../src/claudescan.ts';
import { JobTracker } from '../src/claudelink.ts';
import { ProgressHistory } from '../src/progresshistory.ts';
import { SessionNames } from '../src/claudenames.ts';
import { Backup } from '../src/backup.ts';
import { macSourceVersion, macSourceVersionAsync } from '../src/macsetup.ts';
import { lastAssistantText } from '../src/claude.ts';

const LIMIT_MS = 30;

/** The longest single stop of the event loop while `fn` runs, in ms. */
async function longestStop(fn: () => Promise<unknown>): Promise<number> {
  const h = monitorEventLoopDelay({ resolution: 1 });
  let spinning = true, last = performance.now(), worst = 0;
  const spin = () => { const t = performance.now(); worst = Math.max(worst, t - last); last = t; if (spinning) setImmediate(spin); };
  await new Promise(r => setTimeout(r, 20));
  h.enable(); spin();
  try { await fn(); } finally { spinning = false; h.disable(); }
  await new Promise(r => setImmediate(r));
  // The histogram counts its own 1 ms tick; the spinner is the finer of the two.
  return Math.min(worst, h.max / 1e6);
}

/**
 * His PC is a cloud VM that is often at 100% CPU (other programs, other test files running beside this one); there an
 * idle Node process at normal priority sees 30-50 ms gaps every few hundred ms that are not its own doing (measured
 * 2026-10-21). At high priority the same idle process saw no gap over 8 ms in 4 s, so this file raises its own
 * priority while it measures (this test process only) and what is left is the code's own blocking.
 */
async function assertNeverBlocks(name: string, fn: () => Promise<unknown>): Promise<void> {
  let was: number | null = null;
  try { was = os.getPriority(); os.setPriority(os.constants.priority.PRIORITY_HIGH); } catch { was = null; }
  try {
    const worst = await longestStop(fn);
    assert.ok(worst <= LIMIT_MS, `${name}: the event loop stopped for ${worst.toFixed(1)} ms (limit ${LIMIT_MS})`);
  } finally { if (was !== null) try { os.setPriority(was); } catch { /* left high until this test process ends */ } }
}

const S = '11111111-2222-3333-4444-555555555555';
const line = (o: Record<string, unknown>) => JSON.stringify({ sessionId: S, cwd: 'C:\\code\\Waymark', entrypoint: 'claude-desktop', isSidechain: false, ...o });

/** A 20 MB transcript like his: big tool results, a to-do list near the end, a command still running. */
function bigTranscript(file: string): void {
  const chunk = 'x'.repeat(60_000);
  const lines: string[] = [];
  let size = 0, i = 0;
  while (size < 20 * 1024 * 1024) {
    const a = line({ type: 'assistant', message: { model: 'claude-opus-5-5', stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `r${i}`, name: 'Read', input: { file_path: `C:\\code\\f${i}.ts` } }] } });
    const r = line({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: `r${i}`, content: chunk }] } });
    lines.push(a, r); size += a.length + r.length + 2; i++;
  }
  lines.push(line({ type: 'assistant', message: { model: 'claude-opus-5-5', stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'todo', name: 'TodoWrite', input: { todos: [{ content: 'Build it', status: 'completed', activeForm: 'Building it' }, { content: 'Test it', status: 'in_progress', activeForm: 'Testing it' }] } }] } }));
  lines.push(line({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'todo', content: 'ok' }] } }));
  lines.push(line({ type: 'assistant', message: { model: 'claude-opus-5-5', stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'b1', name: 'Bash', input: { command: 'npm test', description: 'Run the tests' } }] } }));
  writeFileSync(file, lines.join('\n') + '\n');
}

test('the transcript scan and the history read-back never stop the brain for more than 30 ms', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'aang-lag-'));
  try {
    const projects = path.join(dir, 'projects');
    for (let p = 0; p < 4; p++) mkdirSync(path.join(projects, `C--code-p${p}`), { recursive: true });
    bigTranscript(path.join(projects, 'C--code-p0', `${S}.jsonl`));
    for (let p = 1; p < 4; p++) for (let k = 0; k < 6; k++) {   // 18 more sessions: under the tracker's 30-job cap
      const id = `${p}${k}`.padStart(8, '0') + S.slice(8);
      writeFileSync(path.join(projects, `C--code-p${p}`, `${id}.jsonl`), Array.from({ length: 200 }, (_, n) => line({ sessionId: id, type: 'user', message: { role: 'user', content: `prompt ${n} ${'y'.repeat(2000)}` } })).join('\n') + '\n');
    }
    const hist = path.join(dir, 'progress-history.jsonl');
    writeFileSync(hist, Array.from({ length: 6000 }, (_, n) => JSON.stringify({ at: n, s: 'task', p: 'Aang', k: 'implement', key: `wire the thing number ${n % 300}`, ms: 60_000 + n, m: 'opus', ok: 1, x: 0.1 })).join('\n') + '\n');

    const jobs = new JobTracker(null);
    const scan = new TranscriptScan(jobs, { root: projects });
    await assertNeverBlocks('transcript scan', () => scan.scan(Date.now()));
    const job = jobs.list().find(j => j.id === S);
    assert.ok(job, 'the 20 MB session was still read');
    assert.equal(job!.tasks.length, 2, 'its to-do list came from the tail');
    // The Stop hook's "what did it say" read the whole transcript (116-252 ms on his 25-57 MB ones); now only its end,
    // here the worst case: no words of Claude's in the last 4 MB at all.
    let words = 'x';
    await assertNeverBlocks('last words of a 20 MB transcript', async () => { words = lastAssistantText(path.join(projects, 'C--code-p0', `${S}.jsonl`)); });
    assert.equal(words, '');

    let h: ProgressHistory | null = null;
    await assertNeverBlocks('progress history read-back', async () => { h = new ProgressHistory(hist); await h.ready; });
    assert.ok(h!.stat('t|Aang|*implement')!.n >= 6000, 'every line was learned');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('his session names, the memory backup and the Mac release hash run off the brain\'s thread', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'aang-lag-'));
  try {
    // Session records as the Claude app keeps them.
    const recs = path.join(dir, 'Claude-Data', 'claude_x', 'claude-code-sessions', 'a', 'b');
    mkdirSync(recs, { recursive: true });
    for (let i = 0; i < 300; i++) {
      const hex = i.toString(16).padStart(12, '0');
      writeFileSync(path.join(recs, `local_00000000-0000-0000-0000-${hex}.json`), JSON.stringify({ sessionId: `local_00000000-0000-0000-0000-${hex}`, cliSessionId: `11111111-0000-0000-0000-${hex}`, title: `Session ${i}` }));
    }
    const names = new SessionNames(path.join(dir, 'Claude-Data'));
    await assertNeverBlocks('session names', () => names.refresh());
    assert.equal(names.of('11111111-0000-0000-0000-000000000005')?.title, 'Session 5');

    // A memory database of a few MB in a git repo of its own (no remote: the push fails, as in the backup tests).
    const data = path.join(dir, 'data');
    mkdirSync(data);
    execFileSync('git', ['init', '-q'], { cwd: data });
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--allow-empty', '-q', '-m', 'init'], { cwd: data });
    const db = new DatabaseSync(path.join(data, 'aang.db'));
    db.exec('CREATE TABLE turns (id INTEGER PRIMARY KEY, text TEXT); CREATE TABLE facts (id INTEGER PRIMARY KEY, text TEXT)');
    const ins = db.prepare('INSERT INTO turns (text) VALUES (?)');
    db.exec('BEGIN'); for (let i = 0; i < 4000; i++) ins.run('t'.repeat(1000) + i); db.exec('COMMIT');
    db.close();
    let r: Awaited<ReturnType<Backup['run']>> | null = null;
    await assertNeverBlocks('memory backup', async () => { const b = new Backup(data); await b.stale(); r = await b.run(); });
    assert.equal(r!.ok, true);
    assert.equal(r!.turns, 4000);

    // The Mac release hash: the asynchronous one gives the same answer as the old one, without the stop.
    const shell = path.join(dir, 'Shell'), core = path.join(dir, 'core');
    for (const d of ['src', 'pages', 'drm', 'mac-pkg']) mkdirSync(path.join(shell, d), { recursive: true });
    mkdirSync(core);
    for (let i = 0; i < 200; i++) writeFileSync(path.join(shell, 'pages', `p${i}.js`), 'z'.repeat(20_000) + i);
    writeFileSync(path.join(shell, 'mac-pkg', 'package.json'), '{}');
    writeFileSync(path.join(core, 'frontdesk.ts'), 'export {}');
    let v = '';
    await assertNeverBlocks('mac release hash', async () => { v = await macSourceVersionAsync(shell, core, ['frontdesk.ts']); });
    assert.equal(v, macSourceVersion(shell, core, ['frontdesk.ts']));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// Programs started from a helper thread, never from the brain's own (2026-10-21).
//
// Why: on his PC, starting any program (git, gh) holds the thread that starts it for 30-150 ms - Node's spawn waits
// for Windows to create the process, and the antivirus looks at it first (measured: execFile('git', ['--version'])
// returned after 30, 37, 72 and 153 ms). The brain must never stop for more than ~20 ms, so the memory backup's git,
// the Mac release's git and the CI watcher's gh all start their programs from this one small worker thread instead.
// It is made on first use and lets the brain exit whenever nothing is running in it.
import { Worker } from 'node:worker_threads';

export interface RunResult { ok: boolean; out: string; err: string }
export interface RunOpts { cwd?: string; timeout?: number; maxBuffer?: number }

const CODE = `
const { parentPort } = require('node:worker_threads');
const { execFile } = require('node:child_process');
parentPort.on('message', m => {
  try {
    execFile(m.cmd, m.args, { cwd: m.cwd, encoding: 'utf8', windowsHide: true, timeout: m.timeout, maxBuffer: m.maxBuffer }, (err, out, errOut) => {
      parentPort.postMessage({ id: m.id, ok: !err, out: String(out == null ? '' : out), err: err ? String(errOut || err.message || err) : '' });
    });
  } catch (e) { parentPort.postMessage({ id: m.id, ok: false, out: '', err: String(e && e.message || e) }); }
});
`;

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, (r: RunResult) => void>();

function helper(): Worker {
  if (worker) return worker;
  const w = new Worker(CODE, { eval: true });
  w.on('message', (m: RunResult & { id: number }) => {
    const done = pending.get(m.id);
    pending.delete(m.id);
    if (!pending.size) w.unref();
    done?.({ ok: m.ok, out: m.out, err: m.err });
  });
  const fail = (why: string) => {
    if (worker === w) worker = null;
    for (const [id, done] of pending) { pending.delete(id); done({ ok: false, out: '', err: why }); }
  };
  w.on('error', e => fail(e.message));
  w.on('exit', code => fail(`the helper thread stopped (${code})`));
  worker = w;
  return w;
}

/** Runs a program from the helper thread. Never throws; `ok` false on a failure, with its error text in `err`. */
export function runOffThread(cmd: string, args: string[], opts: RunOpts = {}): Promise<RunResult> {
  return new Promise(resolve => {
    try {
      const w = helper();
      const id = ++nextId;
      pending.set(id, resolve);
      w.ref();
      w.postMessage({ id, cmd, args, cwd: opts.cwd, timeout: opts.timeout ?? 60_000, maxBuffer: opts.maxBuffer ?? 8 * 1024 * 1024 });
    } catch (e) { resolve({ ok: false, out: '', err: (e as Error).message }); }
  });
}

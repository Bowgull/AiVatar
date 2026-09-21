// Running a command, through a gate Aang cannot go around.
//
// The SDK's own shell tools were used instead, until a probe showed that `canUseTool` is never called for
// the PowerShell tool on this machine: it ran `git status` with no permission check at all. Every guard
// built on that callback - the yes/no question, the network block, the launcher block - had a hole in it.
//
// So the built-in shell tools are disallowed outright and this is the only way to a command line. One
// path in, one gate, and it is ours.
import { spawn } from 'node:child_process';

export const TIMEOUT_MS = 60_000;
/** Enough to be useful in a bubble, small enough not to flood a turn. */
export const MAX_OUTPUT = 4_000;

export interface RunResult { ok: boolean; output: string }

export function runCommand(command: string, cwd: string, timeoutMs = TIMEOUT_MS): Promise<RunResult> {
  return new Promise(resolve => {
    // PowerShell, because that is the shell on this machine, and -NoProfile so his profile cannot change
    // what a command means.
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
      cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '', err = '', done = false;
    const finish = (ok: boolean, text: string) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      const trimmed = text.length > MAX_OUTPUT ? text.slice(0, MAX_OUTPUT) + '\n...(cut)' : text;
      resolve({ ok, output: trimmed.trim() });
    };
    const timer = setTimeout(() => { try { child.kill(); } catch { /* gone */ } finish(false, `That took more than ${Math.round(timeoutMs / 1000)} seconds, so I stopped it.`); }, timeoutMs);
    timer.unref?.();
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { err += d; });
    child.on('error', e => finish(false, `Could not run it: ${e.message}`));
    child.on('close', code => {
      const text = [out.trim(), err.trim()].filter(Boolean).join('\n');
      if (code === 0) finish(true, text || 'Done. It printed nothing.');
      else finish(false, text || `It failed with code ${code}.`);
    });
  });
}

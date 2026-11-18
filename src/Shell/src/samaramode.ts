// Samara on its own on the PC (P1 of the standalone plan, 2026-11-17): the switch, the clean-exit mark, and the watch
// Aang keeps on it.
//
// The switch: one saved setting, samara-mode.json in the state folder ({"apart": true}, on unless it says false). The pet
// reads it (CoreSupervisor.SamaraApart), checks that the Samara code about to run has samara.ts (the releases before P1
// do not), and hands its answer to the Shell as AANG_SAMARA_APART=1/0. main.ts follows the pet's answer and nothing else,
// so a newer Samara under an older pet (which says nothing) keeps the old setup, where main.ts holds the browser.
//
// The mark: Samara writes samara-exit.json ({pid, how}) when it quits on purpose (a normal quit, or an update restart).
// A Samara that is gone without one for its pid crashed (his call: it stays closed, and Aang tells him).
import { existsSync, readFileSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeFileAtomic } from './atomic.ts';

export const EXIT_FILE = 'samara-exit.json';

/** Samara runs as its own program (samara.ts) and main.ts is Aang's windows only: the pet's answer (see above). */
export function samaraApart(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.AANG_SAMARA_APART === '1';
}
/** The environment for starting the pet's launcher (Aang.exe): without our copy of the answer, so it decides afresh for
 *  the code it will run (an update or a rollback may have changed it). */
export function launcherEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const e = { ...env }; delete e.AANG_SAMARA_APART; return e;
}

export type ExitHow = 'quit' | 'update';
/** Samara is quitting on purpose. Never throws: a lost mark only means one wrong "closed unexpectedly". */
export function writeExitMark(stateDir: string, pid: number, how: ExitHow): void {
  try { writeFileAtomic(path.join(stateDir, EXIT_FILE), JSON.stringify({ pid, how, at: new Date().toISOString() })); } catch { /* see above */ }
}
export function readExitMark(stateDir: string): { pid: number; how: ExitHow } | null {
  try {
    const j = JSON.parse(readFileSync(path.join(stateDir, EXIT_FILE), 'utf8')) as { pid?: unknown; how?: unknown };
    if (Number.isInteger(j.pid) && (j.how === 'quit' || j.how === 'update')) return { pid: Number(j.pid), how: j.how };
  } catch { /* none */ }
  return null;
}

/** The pid in samara.pid, if the file is from this boot (an older one names some other program by now). */
export function samaraPid(stateDir: string): number | null {
  try {
    const f = path.join(stateDir, 'samara.pid');
    if (statSync(f).mtimeMs < Date.now() - os.uptime() * 1000 - 5_000) return null;
    const pid = Number(readFileSync(f, 'utf8').trim());
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch { return null; }
}
/**
 * Phase 5 (2026-11-18): the program that starts Samara on the PC. Samara's own Samara.exe (samara-exe.txt, written each
 * time it runs), else the pet's Aang.exe (body-exe.txt). Both take the same switches (--samara, --quiet, --url --,
 * --after), so callers do not care which. claude-door-mcp.mjs has the same rule (it cannot import this).
 */
export function samaraLauncher(stateDir: string, exists: (f: string) => boolean = existsSync): string | null {
  for (const name of ['samara-exe.txt', 'body-exe.txt']) {
    try { const exe = readFileSync(path.join(stateDir, name), 'utf8').trim(); if (/\.exe$/i.test(exe) && exists(exe)) return exe; } catch { /* the next */ }
  }
  return null;
}
export function pidAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === 'EPERM'; }
}

/**
 * Aang's watch on Samara: call tick() every couple of seconds. Only a Samara seen running counts, so starting Aang after
 * Samara closed (or crashed) days ago says nothing.
 */
export class SamaraWatch {
  private watched: number | null = null;
  private readonly d: { pid(): number | null; alive(pid: number): boolean; mark(): { pid: number } | null; crashed(pid: number): void };
  constructor(d: SamaraWatch['d']) { this.d = d; }
  tick(): void {
    const now = this.d.pid();
    if (now !== null && this.d.alive(now)) { this.watched = now; return; }
    const was = this.watched;
    if (was === null || this.d.alive(was)) return;
    this.watched = null;
    if (this.d.mark()?.pid === was) return;      // quit on purpose, or restarting for an update
    this.d.crashed(was);
  }
}

// Samara's side of running on its own on the PC (moved out of samaramode.ts on 2026-11-20, phase 1 of Samara's own repo,
// docs/SAMARA-REPO-PLAN.md): the clean-exit mark Samara writes when it quits on purpose, and how it finds the program
// that starts it again. Aang's side (the switch and his watch on Samara) stays in samaramode.ts.
//
// The mark: samara-exit.json ({pid, how}) in the state folder. A Samara that is gone without one for its pid crashed.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { writeFileAtomic } from './atomic.ts';

/** The environment for starting the pet's launcher (Aang.exe): without our copy of the answer, so it decides afresh for
 *  the code it will run (an update or a rollback may have changed it). */
export function launcherEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const e = { ...env }; delete e.AANG_SAMARA_APART; return e;
}

export const EXIT_FILE = 'samara-exit.json';

export type ExitHow = 'quit' | 'update';
/** Samara is quitting on purpose. Never throws: a lost mark only means one wrong "closed unexpectedly". */
export function writeExitMark(stateDir: string, pid: number, how: ExitHow): void {
  try { writeFileAtomic(path.join(stateDir, EXIT_FILE), JSON.stringify({ pid, how, at: new Date().toISOString() })); } catch { /* see above */ }
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

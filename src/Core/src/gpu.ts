// Who owns the graphics card right now.
//
// The local model is 13 GB on a 15.3 GB card. WoW wants that card too, and Joshua plays while Aang is
// running, so "read his documents" must never mean "stutter his raid". Phase 3.2: a game running means no
// local model loads, and queued reading resumes when he quits.
//
// Note the rule is RUNNING, not FOCUSED. Alt-tabbing to Discord does not give the card back, so the
// foreground check the rest of the app uses (screen.ts, the quiet-mode presence messages) is the wrong
// signal here and would happily load a model on top of a live raid.

import { execFile } from 'node:child_process';

/**
 * Games that own the card.
 *
 * Deliberately the same list as `looksVisual()` in screen.ts, which answers a different question ("is this
 * window a picture rather than text"). They are kept in step by a test that compares them, because two
 * copies of a list like this drift the first time a game is added to one of them.
 */
export const GAME_PROCESS = /^(wow|wowb|wow-64|overwatch|diablo|hearthstone|valorant|league of legends|steam_app|.*-win64-shipping)$/i;

interface Seen { at: number; which: string | null }
let last: Seen = { at: 0, which: null };
/** Process lists are not free and this is asked before every read. Fifteen seconds is far shorter than a
 *  dungeon and far longer than a batch of documents. */
const CACHE_MS = 15_000;

function runningProcesses(): Promise<string[]> {
  return new Promise(resolve => {
    // CSV with no header, so the first field is the image name and quoting is predictable.
    execFile('tasklist', ['/fo', 'csv', '/nh'], { timeout: 8000, maxBuffer: 4 << 20, windowsHide: true },
      (err, stdout) => {
        if (err) { resolve([]); return; }       // cannot tell: treated as "no game", see gameRunning
        const names: string[] = [];
        for (const line of String(stdout).split(/\r?\n/)) {
          const m = /^"([^"]+)"/.exec(line);
          if (m) names.push(m[1].replace(/\.exe$/i, ''));
        }
        resolve(names);
      });
  });
}

/**
 * Is a game running? Cached briefly.
 *
 * When the process list cannot be read at all this answers "no game". That is the deliberate choice:
 * failing closed would mean a broken `tasklist` silently stops Aang ever reading anything, and the
 * failure mode of failing open is a slower game for one batch, which he can see and interrupt.
 */
export async function gameRunning(): Promise<{ running: boolean; which: string | null }> {
  const now = Date.now();
  if (now - last.at < CACHE_MS) return { running: last.which !== null, which: last.which };
  const names = await runningProcesses();
  const hit = names.find(n => GAME_PROCESS.test(n)) ?? null;
  last = { at: now, which: hit };
  return { running: hit !== null, which: hit };
}

/** Forget the cached answer, so the next question asks the machine. Used when a game quits. */
export function forgetGameCheck(): void { last = { at: 0, which: null }; }

/**
 * Free VRAM in MiB, or null when it cannot be read.
 *
 * A backstop under the process list rather than a replacement for it: it catches a game nobody thought to
 * put in GAME_PROCESS, and it catches the local model simply not fitting beside whatever else is resident.
 */
export function freeVramMiB(): Promise<number | null> {
  return new Promise(resolve => {
    execFile('nvidia-smi', ['--query-gpu=memory.free', '--format=csv,noheader,nounits'],
      { timeout: 6000, windowsHide: true }, (err, stdout) => {
        if (err) { resolve(null); return; }       // no NVIDIA card, or no driver tools: the process list stands alone
        const n = Number(String(stdout).trim().split(/\r?\n/)[0]);
        resolve(Number.isFinite(n) ? n : null);
      });
  });
}

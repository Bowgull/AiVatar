// The password on Aang's own front door (step S1, decision 47).
//
// The Origin check alone is not enough for Phase 6. Aang's own Electron windows ARE browsers, so they
// send an Origin like any page, and a rule of "refuse anything with an Origin" would lock Aang out of
// himself. This is the part that tells his own windows apart from a web page.
//
// It works because of one thing a browser cannot do: a page may NOT set a custom header on a WebSocket.
// The browser API has no way to express it. Aang's C# window and the Electron main process both can.
// So "carries this header" means "is a real program on this PC", not "is a web page", no matter what
// Origin it claims. (The page is also refused by the Origin rule; this is the second lock, not a
// replacement for the first.)
//
// A fresh token every start, so one that leaks into a log or a crash dump is worthless by the next boot.
import { chmodSync, existsSync, readFileSync, unlinkSync } from 'node:fs';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { reportWriteFailure, writeFileAtomic } from './atomic.ts';

export const TOKEN_HEADER = 'x-aang-token';

/** Where the token lives. Beside the Core's other state, which only he can read. */
export const tokenFile = (stateDir: string) => path.join(stateDir, 'shell.token');

/**
 * Write a new token for this run and return it. Called once at start, before anything can connect.
 * Returns null if it could not be written, and the caller then runs without this second lock rather
 * than refusing to start: the Origin check still stands, and an Aang that will not start is worse.
 */
export function newToken(stateDir: string): string | null {
  const token = randomBytes(32).toString('base64url');
  const file = tokenFile(stateDir);
  try {
    writeFileAtomic(file, token);
    // Best effort on Windows, where it means little, and real on anything POSIX.
    try { chmodSync(file, 0o600); } catch { /* not every filesystem has modes */ }
    return token;
  } catch (e) {
    reportWriteFailure(file, e);
    return null;
  }
}

/** Read the token a running Core wrote. Used by his own windows, never by a page. */
export function readToken(stateDir: string): string | null {
  const file = tokenFile(stateDir);
  try {
    if (!existsSync(file)) return null;
    const t = readFileSync(file, 'utf8').trim();
    return t || null;
  } catch { return null; }
}

/** Remove it on a clean stop, so a stale file cannot outlive the Core that made it. */
export function clearToken(stateDir: string): void {
  try { unlinkSync(tokenFile(stateDir)); } catch { /* never written, or already gone */ }
}

/**
 * Compare without leaking how much of the token was right through how long the check took.
 * Lengths are compared first, which is unavoidable and harmless: the length is fixed and public.
 */
export function sameToken(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

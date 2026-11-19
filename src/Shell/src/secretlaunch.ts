// Normal Samara's only part in the secret window (2026-11-19): ⇧⌘N or the menu item starts the secret program, the same
// Aang.app with --samara-secret (macmain.ts). Fire and forget: nothing goes to it and nothing comes back. If it is already
// running, its own single-instance lock hands the start over to it, and it brings its window forward (secretmain.ts).
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import { SECRET_FLAG, secretAllowed } from './secretguard.ts';

/** The arguments the secret program starts with: the same app (in a dev run, the same entry file), plus the flag. */
export function secretArgs(argv: string[]): string[] {
  // argv[0] is the engine; macOS may add a -psn_ process number on Dock starts. Any flag of ours is never doubled.
  return [...argv.slice(1).filter((a) => !a.startsWith('-psn') && a !== SECRET_FLAG), SECRET_FLAG];
}

/** Start it (the Mac only). False when it could not be started. */
export function launchSecret(o: { platform?: NodeJS.Platform; exec?: string; argv?: string[]; start?: typeof spawn } = {}): boolean {
  if (!secretAllowed(o.platform)) return false;
  const start = o.start ?? spawn;
  try {
    const c = start(o.exec ?? process.execPath, secretArgs(o.argv ?? process.argv), { detached: true, stdio: 'ignore' });
    c.on('error', () => { /* it did not start; ⇧⌘N again tries again */ });
    c.unref();
    return true;
  } catch { return false; }
}

/**
 * The secret program's side: its kept profile, from where normal Samara held it before the split (Aang's own
 * Partitions/aang-secret), moved once into its own data folder, before Chromium starts. Never over one already there.
 */
export function moveProfile(from: string, to: string): boolean {
  const old = path.join(from, 'Partitions', 'aang-secret'), now = path.join(to, 'Partitions', 'aang-secret');
  if (!existsSync(old) || existsSync(now)) return false;
  try { mkdirSync(path.dirname(now), { recursive: true }); renameSync(old, now); return true; } catch { return false; }
}

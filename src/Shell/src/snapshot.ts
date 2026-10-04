// A copy of his settings and his memory, taken once, before the new windows ever touch them.
//
// This is the second half of the safety net from step 6.0, and his decision 36: he wants to be able to
// say "let's go back to the old one". The git tag `aang-v1-before-rebuild` preserves the CODE. This
// preserves the DATA, which the tag cannot, because old code cannot always read data that newer code
// has changed.
//
// Taken on the FIRST start of the Shell and never again: a snapshot that keeps refreshing is not a
// snapshot, it is a mirror of whatever went wrong most recently.
//
// Deliberately a plain file copy rather than anything clever. Going back should need nothing but a
// file manager and the note this writes beside it.
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** How much of one file is worth copying. The database is the big one and it is far under this. */
const MAX_FILE_BYTES = 512 * 1024 * 1024;

export interface SnapshotResult {
  /** Where it went, or null if one already existed and nothing was done. */
  dir: string | null;
  files: number;
  bytes: number;
  /** Anything that could not be copied, each with its reason. A snapshot is best effort. */
  skipped: string[];
}

const stamp = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Everything in a folder, one level deep. His state and data folders are both flat. */
function filesIn(dir: string): string[] {
  try { return readdirSync(dir).filter(f => { try { return statSync(path.join(dir, f)).isFile(); } catch { return false; } }); }
  catch { return []; }
}

/**
 * Copy his state folder and his database somewhere dated, once.
 *
 * `markerDir` is where the "already done" marker lives, which is the state folder itself: if that is
 * gone, this is a fresh machine and a snapshot of nothing is pointless but harmless.
 */
export function snapshotOnce(stateDir: string, dataDir: string, now = new Date()): SnapshotResult {
  const marker = path.join(stateDir, 'snapshot-taken.json');
  const skipped: string[] = [];
  if (existsSync(marker)) return { dir: null, files: 0, bytes: 0, skipped };

  const dir = path.join(dataDir, 'before-the-rebuild', stamp(now));
  let files = 0;
  let bytes = 0;

  try {
    mkdirSync(dir, { recursive: true });
    for (const [label, from] of [['state', stateDir], ['data', dataDir]] as const) {
      const into = path.join(dir, label);
      mkdirSync(into, { recursive: true });
      for (const name of filesIn(from)) {
        // Not the snapshot folder itself, and not the live write-ahead files: a copy of those without
        // the database they belong to is worse than not having them.
        if (name === 'snapshot-taken.json') continue;
        const src = path.join(from, name);
        try {
          const size = statSync(src).size;
          if (size > MAX_FILE_BYTES) { skipped.push(`${name}: too big (${Math.round(size / 1e6)} MB)`); continue; }
          copyFileSync(src, path.join(into, name));
          files++; bytes += size;
        } catch (e) {
          // A file held open by the running Core is normal on Windows. Say which, and carry on: a
          // partial snapshot is worth far more than none.
          skipped.push(`${name}: ${(e as Error).message}`);
        }
      }
    }

    // The note that makes this useful to a person a year from now.
    writeFileSync(path.join(dir, 'HOW TO GO BACK.txt'), [
      'This is a copy of Aang as he was just before his new windows ran for the first time.',
      `Taken ${now.toLocaleString()}.`,
      '',
      'To go back to the old Aang:',
      '  1. Close Aang completely (right-click him, Quit).',
      '  2. In the AangApp folder, run:  git checkout aang-v1-before-rebuild',
      '  3. Rebuild it.',
      '  4. Copy the "state" folder here back over %APPDATA%\\Aang',
      '     and the "data" folder here back over your Aang documents folder.',
      '  5. Start Aang again.',
      '',
      'Only one Aang can run at a time: they both want the same port and the same tray icon.',
      '',
      'Nothing here is ever written to again. It is safe to copy it somewhere else, or delete it',
      'once you are happy with the new one.',
    ].join('\n'), 'utf8');

    writeFileSync(marker, JSON.stringify({ at: now.toISOString(), dir, files, bytes }), 'utf8');
    return { dir, files, bytes, skipped };
  } catch (e) {
    // Never stop the Shell starting over this. A missing snapshot is a worse day later; a Shell that
    // will not open is a worse day now.
    skipped.push(`the snapshot itself failed: ${(e as Error).message}`);
    return { dir: null, files, bytes, skipped };
  }
}

// Write a file so that, whatever happens, it is either entirely the old version or entirely the new one.
//
// This machine is a Shadow cloud PC that shuts down hard every four hours, which is a power cut as far as
// a file write is concerned. Writing in place can leave a truncated file, and every loader here treats a
// file it cannot parse as empty - so a kill mid-write would silently lose all of Joshua's reminders.
// Write to a temporary file, flush it to disk, then rename over the target: a rename is atomic.
import { closeSync, fsyncSync, mkdirSync, openSync, renameSync, writeSync } from 'node:fs';
import path from 'node:path';

export function writeFileAtomic(file: string, data: string | Uint8Array): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  const fd = openSync(tmp, 'w');
  try { if (typeof data === 'string') writeSync(fd, data); else writeSync(fd, data); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(tmp, file);
}

/**
 * Report a write that failed, once per file, and keep counting quietly after that.
 *
 * WHY THIS EXISTS: `turns.jsonl` and `sessions.json` both stopped being written on 2026-09-24 and
 * nobody could have known. Each sat behind a bare `catch {}` whose comment said the write was "best
 * effort", which is true of any single write and false of a week of them. Six days of metrics were
 * lost, and the only reason it surfaced at all is that a measurement happened to read the file.
 *
 * "Best effort" has to mean "do not crash", not "do not tell anyone". But a failing write on a hot
 * path must not spam a log line per turn either, or the next person turns the logging off and we are
 * back here. So: say it loudly the first time, then once more at every power of ten, with the running
 * total, so a persistent failure keeps a faint pulse instead of a wall of text.
 */
const writeFailures = new Map<string, number>();
export function reportWriteFailure(file: string, e: unknown): void {
  const n = (writeFailures.get(file) ?? 0) + 1;
  writeFailures.set(file, n);
  // 1, 10, 100, 1000... loud once, then a pulse rather than a flood.
  if (n === 1 || Math.log10(n) % 1 === 0) {
    const why = e instanceof Error ? (e as NodeJS.ErrnoException).code ?? e.message : String(e);
    console.error(`write failed (${n}x) ${path.basename(file)}: ${why}` +
      (n === 1 ? ' - this file has stopped being written; it will not fix itself' : ''));
  }
}

/** How many writes have failed for a file, for a health check or a test. 0 means healthy. */
export const writeFailureCount = (file: string): number => writeFailures.get(file) ?? 0;

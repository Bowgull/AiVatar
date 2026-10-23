// Write a file so that, whatever happens, it is either entirely the old version or entirely the new one.
//
// This machine is a Shadow cloud PC that shuts down hard every four hours, which is a power cut as far as
// a file write is concerned. Writing in place can leave a truncated file, and every loader here treats a
// file it cannot parse as empty - so a kill mid-write would silently lose all of Joshua's reminders.
// Write to a temporary file, flush it to disk, then rename over the target: a rename is atomic.
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, renameSync, rmSync, statSync, writeSync } from 'node:fs';
import { mkdir, open, rename, rm } from 'node:fs/promises';
import path from 'node:path';

/** Per file: the newest write asked for. A slower background write never lands over a newer one. */
const latest = new Map<string, number>();
let seq = 0;

export function writeFileAtomic(file: string, data: string | Uint8Array): void {
  latest.set(file, ++seq);
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  const fd = openSync(tmp, 'w');
  try { if (typeof data === 'string') writeSync(fd, data); else writeSync(fd, data); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(tmp, file);
}

/**
 * The same safe write, done in the background (2026-10-23, his "all websites are having a hard time loading in Samara"):
 * waiting for the disk to confirm (fsync) froze Samara's main thread up to 1.3 s per save on the Mac's slow disk, and the
 * tab list is saved every few seconds while he browses. For files saved often; a save on quit stays writeFileAtomic.
 */
export async function writeFileAtomicSoon(file: string, data: string | Uint8Array): Promise<void> {
  const me = ++seq;
  latest.set(file, me);
  const tmp = `${file}.${process.pid}.${me}.tmp`;
  await mkdir(path.dirname(file), { recursive: true });
  const fd = await open(tmp, 'w');
  try { await fd.writeFile(data); await fd.sync(); } finally { await fd.close(); }
  if (latest.get(file) !== me) { await rm(tmp, { force: true }); return; }   // a newer save came meanwhile: it wins
  await rename(tmp, file);
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

/**
 * Keep an append-only file from growing without limit, WITHOUT throwing its history away.
 *
 * 5.1 fixed `core.log` and `body.log`, which both used to delete themselves outright past a size.
 * Deleting is the worst option: it throws away precisely the history you want when something has just
 * gone wrong. One previous generation is the difference between "what happened just before" and
 * nothing, and it bounds the space at twice the limit rather than leaving it unbounded.
 *
 * Call before appending. Never throws: a file that could not be rotated is still worth writing to.
 */
export function rotateIfBig(file: string, limitBytes: number): void {
  try {
    if (!existsSync(file) || statSync(file).size <= limitBytes) return;
    const old = `${file}.1`;
    try { rmSync(old, { force: true }); } catch { /* no previous generation */ }
    // A rename can fail if something else holds the file. Losing one generation beats growing forever.
    try { renameSync(file, old); } catch { try { rmSync(file, { force: true }); } catch { /* keep going */ } }
  } catch { /* rotation is housekeeping; it must never stop the write it was protecting */ }
}

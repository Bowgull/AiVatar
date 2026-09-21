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

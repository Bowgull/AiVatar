// The log engine (2026-10-30): one way to add a line to a log file, for the brain and for Samara.
//
// Each log keeps its own file and its own line format (turns.jsonl, actions.jsonl, ratings.jsonl, usage-mac.jsonl,
// privacy-log.jsonl, shell.log, aang.log...), because other things read them. What is shared is the writing: make the
// folder, keep the size bounded (one older generation, never deleting history outright), append, and never throw. A
// failed append is reported once per file (reportWriteFailure), not swallowed.
//
// Every log gets a label, so logs() can say which logs exist and which have stopped being written.
//
// ONE FILE, TWO COPIES, like atomic.ts: src/Core/src/log.ts and src/Shell/src/log.ts must match (test/twins.test.ts).
import { appendFileSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { reportWriteFailure, rotateIfBig, writeFailureCount } from './atomic.ts';

export interface LogOpts {
  /** Past this size the file is moved aside (one older generation) before the next line. Default: no limit. */
  maxBytes?: number;
  /** Where the older generation goes. Default `<file>.1`. */
  old?: string;
  /** Past maxBytes, empty the file instead of keeping an older generation (only aang.log did this). */
  clear?: boolean;
  /** Check the size only every n lines (a busy log). Default 1: every line. */
  checkEvery?: number;
}

export interface Log {
  readonly label: string;
  readonly file: string;
  /** Add one line of text (a newline is added). False if it could not be written. */
  line(text: string): boolean;
  /** Add one JSON record as a line. */
  json(rec: unknown): boolean;
}

const all = new Map<string, Log>();

/** Open (or reuse) the log with this label. */
export function openLog(label: string, file: string, o: LogOpts = {}): Log {
  const had = all.get(label);
  if (had && had.file === file) return had;
  let n = 0;
  const every = Math.max(1, o.checkEvery ?? 1);
  const log: Log = {
    label, file,
    line(text: string): boolean {
      try {
        mkdirSync(path.dirname(file), { recursive: true });
        if (o.maxBytes !== undefined && n++ % every === 0) keepSmall(file, o);
        appendFileSync(file, text.endsWith('\n') ? text : text + '\n');
        return true;
      } catch (e) { reportWriteFailure(file, e); return false; }
    },
    json(rec: unknown): boolean { return log.line(JSON.stringify(rec)); },
  };
  all.set(label, log);
  return log;
}

function keepSmall(file: string, o: LogOpts): void {
  if (!o.clear) { rotateIfBig(file, o.maxBytes!, o.old); return; }
  try { if (statSync(file).size > o.maxBytes!) writeFileSync(file, ''); } catch { /* none yet */ }
}

/** Every log opened in this process, and how many of its lines failed. 0 failures means healthy. */
export function logs(): { label: string; file: string; failures: number }[] {
  return [...all.values()].map((l) => ({ label: l.label, file: l.file, failures: writeFailureCount(l.file) }));
}

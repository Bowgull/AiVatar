// Writing and changing files, the way Claude Code does it: write a whole file, or replace one exact piece of
// text that must appear exactly once. Asked once, then trusted (Joshua's call, 2026-09-21).
//
// Two things Claude Code does not need and Aang does:
//  - Every change is undoable. The file as it was is copied aside first, so "undo that" always has something
//    to go back to - he acts on Joshua's own machine, often while Joshua is in a game and not watching.
//  - Some files are never his to write, whatever was agreed: his own trust list (writing it would let him
//    grant himself permissions), his memory database and state, and Windows itself.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeFileAtomic } from './atomic.ts';

/** Where the before-copies go, one per change, newest last. */
export const UNDO_DIR = process.env.AANG_UNDO_DIR
  ?? path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local'), 'Aang', 'undo');
const MAX_BYTES = 2_000_000;

export interface Protected { stateDir: string; dataDir: string }

/** Why this path may not be written, or null if it may. */
export function refusal(file: string, p: Protected): string | null {
  const full = path.resolve(file).toLowerCase();
  const under = (dir: string) => { const d = path.resolve(dir).toLowerCase(); return full === d || full.startsWith(d + path.sep); };
  if (under(p.stateDir)) return 'that is my own settings and permissions folder, and I never write to it myself';
  if (under(path.join(p.dataDir, 'aang.db')) || /[\\/]aang\.db(-wal|-shm)?$/.test(full)) return 'that is my memory database; memory changes go through remember and forget';
  if (under(UNDO_DIR)) return 'that is where my undo copies are kept';
  const win = process.env.SystemRoot ?? 'C:\\Windows';
  for (const sys of [win, process.env.ProgramFiles ?? 'C:\\Program Files', process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', process.env.ProgramData ?? 'C:\\ProgramData']) {
    if (under(sys)) return 'that is part of Windows or an installed program';
  }
  if (!path.isAbsolute(file)) return 'give the full path, starting with the drive, so there is no doubt which file it is';
  return null;
}

let seq = 0;
/** Copy the file as it is now into the undo folder. Returns where it went, or null for a new file. */
function keepCopy(file: string, now = new Date()): string | null {
  if (!existsSync(file)) return null;
  mkdirSync(UNDO_DIR, { recursive: true });
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const dest = path.join(UNDO_DIR, `${stamp}-${String(++seq).padStart(4, '0')}__${path.basename(file)}`);
  copyFileSync(file, dest);
  writeFileAtomic(dest + '.from', file);                 // where it came back from, for undo
  return dest;
}

export interface FileResult { ok: boolean; detail: string }

export function writeWhole(file: string, content: string, p: Protected): FileResult {
  const no = refusal(file, p);
  if (no) return { ok: false, detail: `I did not write it: ${no}.` };
  if (Buffer.byteLength(content) > MAX_BYTES) return { ok: false, detail: 'That is too large to write in one go.' };
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    const before = keepCopy(file);
    writeFileAtomic(file, content);
    return { ok: true, detail: before ? `Wrote ${file}. The old version is kept, so it can be undone.` : `Created ${file}.` };
  } catch (e) { return { ok: false, detail: `Could not write it: ${(e as Error).message}` }; }
}

/** Replace one exact piece of text. It must appear exactly once, or nothing changes. */
export function editExact(file: string, oldText: string, newText: string, p: Protected): FileResult {
  const no = refusal(file, p);
  if (no) return { ok: false, detail: `I did not change it: ${no}.` };
  if (!existsSync(file)) return { ok: false, detail: `There is no file at ${file}.` };
  if (statSync(file).size > MAX_BYTES) return { ok: false, detail: 'That file is too large to edit this way.' };
  if (!oldText) return { ok: false, detail: 'Say which text to replace.' };
  const text = readFileSync(file, 'utf8');
  // Windows files usually use CRLF, and the model almost always writes LF. Match either.
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const find = oldText.replace(/\r?\n/g, eol), put = newText.replace(/\r?\n/g, eol);
  const count = text.split(find).length - 1;
  if (count === 0) return { ok: false, detail: 'That text is not in the file, so nothing was changed. Read the file again and copy the text exactly.' };
  if (count > 1) return { ok: false, detail: `That text is in the file ${count} times, so nothing was changed. Include more of the surrounding text so it is only there once.` };
  try {
    keepCopy(file);
    writeFileAtomic(file, text.replace(find, () => put));
    return { ok: true, detail: `Changed ${file}. The old version is kept, so it can be undone.` };
  } catch (e) { return { ok: false, detail: `Could not change it: ${(e as Error).message}` }; }
}

/** Put back the most recent change: to this file if one is named, otherwise whatever was changed last. */
export function undoLast(file?: string): FileResult {
  let entries: string[] = [];
  try { entries = readdirSync(UNDO_DIR).filter(f => f.endsWith('.from')).sort(); } catch { /* none yet */ }
  for (let i = entries.length - 1; i >= 0; i--) {
    const meta = path.join(UNDO_DIR, entries[i]!);
    const original = readFileSync(meta, 'utf8');
    if (file && path.resolve(original).toLowerCase() !== path.resolve(file).toLowerCase()) continue;
    const copy = meta.slice(0, -'.from'.length);
    if (!existsSync(copy)) continue;
    try {
      writeFileAtomic(original, readFileSync(copy));
      // Used up: it is renamed so the next undo goes one further back rather than repeating this one.
      writeFileAtomic(meta + '.used', original);
      rmSync(meta, { force: true });
      return { ok: true, detail: `Put ${original} back to how it was before the last change.` };
    } catch (e) { return { ok: false, detail: `Could not undo it: ${(e as Error).message}` }; }
  }
  return { ok: false, detail: file ? `I have no earlier version of ${file}.` : 'I have not changed any files, so there is nothing to undo.' };
}


// Moving, copying, renaming, making folders and deleting, for "tidy my Downloads". Every one of them can be undone,
// and none of them can hurt more than it has to:
//  - nothing is ever overwritten: if the destination exists the change is refused, so there is nothing to lose;
//  - "delete" moves the thing into Aang's own trash (kept 30 days) instead of destroying it, so undo is real;
//  - whole drives, his profile folder and the folders he keeps things in (Documents, Desktop, Downloads...) are never
//    moved or deleted themselves, only what is inside them;
//  - his own settings, memory and Windows are refused, exactly as for writing files (files.ts refusal).
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, rmdirSync, statSync, utimesSync } from 'node:fs';
import type { Stats } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { refusal } from './files.ts';
import type { Protected } from './files.ts';
import { writeFileAtomic } from './atomic.ts';

export const TRASH_DIR = process.env.AANG_TRASH_DIR
  ?? path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local'), 'Aang', 'trash');
export const TRASH_DAYS = 30;
export const MAX_ENTRIES = 5000;                    // a folder bigger than this is not tidied in one go
export const MAX_COPY_BYTES = 500 * 1024 * 1024;

export interface Result { ok: boolean; detail: string; /** how to put it back, when it can be */ undo?: () => string }

const fail = (detail: string): Result => ({ ok: false, detail });
const norm = (p: string) => path.resolve(p).toLowerCase().replace(/[\\/]+$/, '');

/** The places he keeps things. The place itself is not moved or deleted; what is inside it is fair game. */
function homes(): string[] {
  const h = os.homedir();
  return [h, ...['Documents', 'Desktop', 'Downloads', 'Pictures', 'Videos', 'Music', 'OneDrive', 'AppData', 'Favorites', 'Links']
    .map(n => path.join(h, n)), path.join(h, 'AppData', 'Roaming'), path.join(h, 'AppData', 'Local')];
}
/** Why this exact path may not itself be moved, renamed or deleted, or null. */
export function tooBroad(target: string): string | null {
  const full = path.resolve(target);
  if (path.parse(full).root.toLowerCase().replace(/[\\/]+$/, '') === norm(full)) return 'that is a whole drive';
  if (homes().some(h => norm(h) === norm(full))) return 'that is one of the main folders you keep things in; I only work on what is inside it';
  return null;
}

/** Count what is in a folder, stopping early: returns null if it is too big to handle in one go. */
function weigh(p: string, limit = MAX_ENTRIES): { entries: number; bytes: number } | null {
  let entries = 0, bytes = 0;
  const walk = (d: string): boolean => {
    let names: string[]; try { names = readdirSync(d); } catch { return true; }
    for (const n of names) {
      if (++entries > limit) return false;
      const f = path.join(d, n);
      let st: Stats; try { st = statSync(f); } catch { continue; }
      if (st.isDirectory()) { if (!walk(f)) return false; } else bytes += st.size;
    }
    return true;
  };
  const st = statSync(p);
  if (!st.isDirectory()) return { entries: 1, bytes: st.size };
  return walk(p) ? { entries, bytes } : null;
}

// ------------------------------------------------------------------ the trash

let seq = 0;
function intoTrash(target: string, now = new Date()): string {
  mkdirSync(TRASH_DIR, { recursive: true });
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const dest = path.join(TRASH_DIR, `${stamp}-${String(++seq).padStart(4, '0')}__${path.basename(target)}`);
  moveRaw(target, dest);
  writeFileAtomic(dest + '.from', target);
  return dest;
}
/** Take out what has sat in the trash longer than TRASH_DAYS. Called at start-up and after each delete. */
export function emptyOldTrash(now = Date.now()): number {
  let n = 0;
  try {
    for (const f of readdirSync(TRASH_DIR)) {
      if (f.endsWith('.from')) continue;
      const p = path.join(TRASH_DIR, f);
      if (now - statSync(p).mtimeMs > TRASH_DAYS * 86_400_000) { rmSync(p, { recursive: true, force: true }); rmSync(p + '.from', { force: true }); n++; }
    }
  } catch { /* no trash yet */ }
  return n;
}

// ------------------------------------------------------------------ the operations

/** rename, and if it crosses drives, copy then remove: the original is only removed once the copy is whole. */
function moveRaw(from: string, to: string): void {
  try { renameSync(from, to); }
  catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EXDEV') throw e;
    cpSync(from, to, { recursive: true, errorOnExist: true, force: false });
    rmSync(from, { recursive: true, force: true });
  }
}

function both(from: string, to: string, p: Protected): string | null {
  for (const f of [from, to]) { const no = refusal(f, p); if (no) return no; }
  return null;
}

export function moveThing(from: string, to: string, p: Protected): Result {
  const no = both(from, to, p); if (no) return fail(`I did not move it: ${no}.`);
  const broad = tooBroad(from); if (broad) return fail(`I did not move it: ${broad}.`);
  if (!existsSync(from)) return fail(`There is nothing at ${from}.`);
  if (existsSync(to)) return fail(`I did not move it: ${to} already exists, and I never overwrite. Pick another name or folder.`);
  if (norm(to).startsWith(norm(from) + path.sep)) return fail('I did not move it: that would put a folder inside itself.');
  try {
    if (weigh(from) === null) return fail(`That folder holds more than ${MAX_ENTRIES} items. Move parts of it instead.`);
    mkdirSync(path.dirname(to), { recursive: true });
    moveRaw(from, to);
  } catch (e) { return fail(`Could not move it: ${(e as Error).message}`); }
  return { ok: true, detail: `Moved ${from} to ${to}.`, undo: () => { try { if (existsSync(from)) return `Could not move it back: ${from} exists again.`; mkdirSync(path.dirname(from), { recursive: true }); moveRaw(to, from); return `Moved it back to ${from}.`; } catch (e) { return `Could not move it back: ${(e as Error).message}`; } } };
}

export function copyThing(from: string, to: string, p: Protected): Result {
  const no = both(from, to, p); if (no) return fail(`I did not copy it: ${no}.`);
  if (!existsSync(from)) return fail(`There is nothing at ${from}.`);
  if (existsSync(to)) return fail(`I did not copy it: ${to} already exists, and I never overwrite. Pick another name.`);
  if (norm(to).startsWith(norm(from) + path.sep)) return fail('I did not copy it: that would put a folder inside itself.');
  const w = weigh(from);
  if (!w) return fail(`That folder holds more than ${MAX_ENTRIES} items, too many to copy in one go.`);
  if (w.bytes > MAX_COPY_BYTES) return fail(`That is ${(w.bytes / 1048576).toFixed(0)} MB; I copy at most ${MAX_COPY_BYTES / 1048576} MB at a time.`);
  try {
    mkdirSync(path.dirname(to), { recursive: true });
    if (statSync(from).isDirectory()) cpSync(from, to, { recursive: true, errorOnExist: true, force: false }); else copyFileSync(from, to);
  } catch (e) { return fail(`Could not copy it: ${(e as Error).message}`); }
  // The copy is the only new thing, so undoing it removes just that (into the trash, not for good).
  return { ok: true, detail: `Copied ${from} to ${to}.`, undo: () => { try { if (!existsSync(to)) return 'The copy is already gone.'; intoTrash(to); return `Removed the copy at ${to} (it is in my trash for ${TRASH_DAYS} days).`; } catch (e) { return `Could not remove the copy: ${(e as Error).message}`; } } };
}

export function makeFolder(dir: string, p: Protected): Result {
  const no = refusal(dir, p); if (no) return fail(`I did not make it: ${no}.`);
  if (existsSync(dir)) return fail(`${dir} already exists.`);
  try { mkdirSync(dir, { recursive: true }); } catch (e) { return fail(`Could not make it: ${(e as Error).message}`); }
  return { ok: true, detail: `Made the folder ${dir}.`, undo: () => { try { rmdirSync(dir); return `Removed the empty folder ${dir}.`; } catch { return `The folder ${dir} is not empty now, so I left it.`; } } };
}

/** "Delete": into Aang's trash, where undo can bring it back. The real removal happens after TRASH_DAYS. */
export function deleteThing(target: string, p: Protected): Result {
  const no = refusal(target, p); if (no) return fail(`I did not delete it: ${no}.`);
  const broad = tooBroad(target); if (broad) return fail(`I did not delete it: ${broad}.`);
  if (norm(target).startsWith(norm(TRASH_DIR))) return fail('I did not delete it: that is already in my trash.');
  if (!existsSync(target)) return fail(`There is nothing at ${target}.`);
  let dest: string;
  try {
    if (weigh(target) === null) return fail(`That folder holds more than ${MAX_ENTRIES} items. Delete parts of it instead.`);
    dest = intoTrash(target);
  } catch (e) { return fail(`Could not delete it: ${(e as Error).message}`); }
  emptyOldTrash();
  return { ok: true, detail: `Deleted ${target}. It is in my trash for ${TRASH_DAYS} days, so "undo that" brings it back.`, undo: () => {
    try {
      if (existsSync(target)) return `Could not bring it back: ${target} exists again.`;
      mkdirSync(path.dirname(target), { recursive: true });
      moveRaw(dest, target); rmSync(dest + '.from', { force: true });
      utimesSync(target, new Date(), new Date());
      return `Brought ${target} back.`;
    } catch (e) { return `Could not bring it back: ${(e as Error).message}`; }
  } };
}

// ------------------------------------------------------------------ looking

/** Names, sizes and dates: what is needed to decide how to tidy a folder. Newest first, capped. */
export function listFolder(dir: string, max = 150): string {
  if (!existsSync(dir)) return `There is no folder at ${dir}.`;
  let names: string[];
  try { names = readdirSync(dir); } catch (e) { return `Could not read ${dir}: ${(e as Error).message}`; }
  const rows = names.map(n => { try { const st = statSync(path.join(dir, n)); return { n, dir: st.isDirectory(), size: st.size, at: st.mtime }; } catch { return null; } })
    .filter((r): r is NonNullable<typeof r> => r !== null).sort((a, b) => b.at.getTime() - a.at.getTime());
  const kb = (n: number) => n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`;
  const lines = rows.slice(0, max).map(r => `${r.at.toISOString().slice(0, 10)}  ${r.dir ? 'folder ' : kb(r.size).padStart(7) + ' '} ${r.n}${r.dir ? '\\' : ''}`);
  return `${dir}: ${rows.length} item${rows.length === 1 ? '' : 's'}${rows.length > max ? `, newest ${max} shown` : ''}\n${lines.join('\n')}`;
}

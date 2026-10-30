// The store engine (2026-10-30): one way to keep a JSON file on disk, for the brain and for Samara.
//
// Before this, ~60 places read a file with their own JSON.parse(readFileSync) and their own fallback, and a dozen saved
// with a plain writeFileSync, which a hard shutdown on Shadow can cut in half. Now:
//   readJson(file, fallback, check)   read once: a missing, broken or wrong-shaped file gives the fallback, never throws
//   saveJson(file, value, opts)       the safe save (atomic.ts), never throws, a failure is reported once (not hidden)
//   new Store({ file, fallback, ... }) a file kept in memory: load with a check, migrate old shapes, save soon (debounced)
// Files keep their names and shapes: nothing here adds a field unless a Store asks for a version.
//
// ONE FILE, TWO COPIES, like atomic.ts: src/Core/src/store.ts and src/Shell/src/store.ts must match (test/twins.test.ts).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { reportWriteFailure, writeFileAtomic, writeFileAtomicSoon } from './atomic.ts';

/**
 * Takes what was in the file and returns the value to use, or null/undefined when it is the wrong shape (then the
 * fallback is used). A check may also clean: keep the good items of a list, fill in a missing field.
 */
export type Check<T> = (raw: unknown) => T | null | undefined;

/** The file's text, without a Windows byte-order mark (Notepad and PowerShell add one). null when it cannot be read. */
export function readText(file: string): string | null {
  try { return readFileSync(file, 'utf8').replace(/^﻿/, ''); } catch { return null; }
}

export interface ReadOpts {
  /** The file is there but is not JSON (torn, hand-edited): told why, before the fallback is used. Missing is not broken. */
  onBroken?: (e: Error) => void;
}

/**
 * Read a JSON file. Missing, unreadable, not JSON, or refused by the check: the fallback. Never throws.
 * Without a check, whatever parsed is returned as T (the caller's old behaviour); prefer a check.
 */
export function readJson<T>(file: string, fallback: T, check?: Check<T>, o?: ReadOpts): T {
  const text = readText(file);
  if (text === null) return fallback;
  let raw: unknown;
  try { raw = JSON.parse(text); } catch (e) { o?.onBroken?.(e as Error); return fallback; }
  if (!check) return raw === null || raw === undefined ? fallback : raw as T;
  try { return check(raw) ?? fallback; } catch { return fallback; }
}

export interface SaveOpts {
  /** Indent like JSON.stringify(v, null, 2). Default: one line (what most files here already are). */
  pretty?: boolean;
  /** Add a newline at the end (a few files are read by people or by shell scripts). */
  newline?: boolean;
  /**
   * A file only he may read (a sign-in token). Mac: saved with permissions 600. Windows: written IN PLACE, not by
   * rename, because the setup script gave the file an owner-only access list (ACL) and a rename would swap in a new
   * file that inherits the folder's wider one. A torn token file means signing in again; a leaked one is worse.
   */
  ownerOnly?: boolean;
  /** Save in the background (no fsync wait on the main thread). For files saved often; on quit save normally. */
  soon?: boolean;
}

/** The text a value is saved as. */
export const jsonText = (value: unknown, o?: SaveOpts): string => JSON.stringify(value, null, o?.pretty ? 2 : undefined) + (o?.newline ? '\n' : '');

/**
 * Save a value as JSON, safely. Returns false (after reporting it once, see reportWriteFailure) if it failed; never throws.
 * With `soon`, returns true straight away and a failure is still reported.
 */
export function saveJson(file: string, value: unknown, o?: SaveOpts): boolean {
  return saveText(file, jsonText(value, o), o);
}

/** The same safe save for a text file (a list, a marker). */
export function saveText(file: string, text: string, o?: Omit<SaveOpts, 'pretty' | 'newline'>): boolean {
  try {
    if (o?.ownerOnly && process.platform === 'win32') { writeInPlace(file, text); return true; }
    const mode = o?.ownerOnly ? { mode: 0o600 } : undefined;
    if (o?.soon) { writeFileAtomicSoon(file, text, mode).catch((e) => reportWriteFailure(file, e)); return true; }
    writeFileAtomic(file, text, mode);
    return true;
  } catch (e) { reportWriteFailure(file, e); return false; }
}

// Windows owner-only files only (see SaveOpts.ownerOnly).
function writeInPlace(file: string, text: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
}

export interface StoreOpts<T> {
  file: string;
  /** A fresh default each time (a function, so two stores never share one object). */
  fallback: () => T;
  /** Shape check after migrating (see Check). Left out, anything that parsed is taken. */
  check?: Check<T>;
  /**
   * Turn an older shape into today's, before the check. Return the value unchanged when it is already current. If it
   * changed anything, the file is saved back in the new shape at once.
   */
  migrate?: (raw: unknown) => unknown;
  /** Wait this long after the last change before saving (ms). 0 saves at once. Default 500. */
  debounceMs?: number;
  /** How the file is written (SaveOpts). `soon` is ignored: a Store already saves in the background on its timer. */
  save?: Omit<SaveOpts, 'soon'>;
}

/**
 * One JSON file kept in memory. get() the value, set() or update() it, and the store saves it shortly after (debounced,
 * the safe save). flush() saves now; call it on quit (the timer does not hold the process open). For the scheduler and anything new.
 *
 *   const s = new Store({ file, fallback: () => ({ jobs: [] }), check: (r) => isJobs(r) ? r : null });
 *   s.update((v) => { v.jobs.push(job); });
 */
export class Store<T> {
  private value: T;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;
  private readonly o: StoreOpts<T>;
  constructor(o: StoreOpts<T>) {
    this.o = o;
    const text = readText(o.file);
    let raw: unknown = undefined;
    if (text !== null) { try { raw = JSON.parse(text); } catch { /* broken: the fallback */ } }
    let migrated = false;
    if (raw !== undefined && raw !== null && o.migrate) {
      try { const m = o.migrate(raw); migrated = m !== raw; raw = m; } catch { raw = undefined; }
    }
    let v: T | null | undefined = undefined;
    if (raw !== undefined && raw !== null) { try { v = o.check ? o.check(raw) : raw as T; } catch { v = undefined; } }
    this.value = v ?? o.fallback();
    if (migrated && v != null) this.flush();
  }
  get file(): string { return this.o.file; }
  get(): T { return this.value; }
  set(v: T): void { this.value = v; this.changed(); }
  /** Change the value in place (or return a new one). */
  update(fn: (v: T) => T | void): void { const r = fn(this.value); if (r !== undefined) this.value = r; this.changed(); }
  /** Save now, synchronously. True when it saved (or there was nothing to save). */
  flush(): boolean {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.dirty = false;
    return saveJson(this.o.file, this.value, this.o.save);
  }
  /** A change not yet on disk. */
  get pending(): boolean { return this.dirty; }
  /** Stop the timer without saving (tests, or a store being thrown away). */
  close(): void { if (this.timer) clearTimeout(this.timer); this.timer = null; }
  private changed(): void {
    this.dirty = true;
    const wait = this.o.debounceMs ?? 500;
    if (wait <= 0) { this.flush(); return; }
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null; this.dirty = false;
      saveJson(this.o.file, this.value, { ...this.o.save, soon: true });
    }, wait);
    this.timer.unref?.();
  }
}

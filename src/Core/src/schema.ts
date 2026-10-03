// Aang's memory, created from nothing and healed when it breaks.
//
// WHY THIS EXISTS: until 2026-10-01 there was no `CREATE TABLE` anywhere in this codebase. The
// database that holds every conversation existed only because it happened to exist on this disk.
// A fresh install could not work, and a lost file could not be rebuilt. Worse, `memory.ts` opened
// it with `if (existsSync(file))` and no else: a missing database meant Aang started anyway,
// silently, with no memory at all, and carried on talking normally. He would not have mentioned it.
//
// That is not a hypothetical on this machine. Shadow hard-shuts-down every four hours, which is a
// power cut as far as a half-finished write is concerned, and there was a real power cut on
// 2026-09-30 during this work.
//
// The answer is not to decide how Aang should behave while broken. It is for him not to stay
// broken: there is a verified backup a few seconds old, so restore it, and if there is no backup
// either, build an empty one. Refuse to run only when even that fails, which means something is
// genuinely wrong and a human needs to look.
import { DatabaseSync } from 'node:sqlite';
import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Bumped when the shape below changes, so a database written by a newer build is recognisable
 * rather than silently mis-read. 1 is the schema as it stood on 2026-10-01; it was 0 before,
 * meaning "nobody was tracking this".
 */
export const SCHEMA_VERSION = 1;

/**
 * Taken from the live database on 2026-10-01 rather than written from memory, so a database built
 * here is the same shape as the one 424 real turns already live in. The turns_fts_* shadow tables
 * are deliberately absent: SQLite creates those itself when the virtual table is declared.
 */
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS turns (
     id INTEGER PRIMARY KEY, ts TEXT NOT NULL, role TEXT NOT NULL, tier TEXT, text TEXT NOT NULL,
     hidden INTEGER NOT NULL DEFAULT 0, req TEXT )`,
  `CREATE INDEX IF NOT EXISTS turns_req ON turns(req)`,
  `CREATE INDEX IF NOT EXISTS turns_ts ON turns(ts)`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS turns_fts USING fts5(text, turn_id UNINDEXED)`,
  `CREATE TABLE IF NOT EXISTS facts (
     id INTEGER PRIMARY KEY, ts TEXT NOT NULL, text TEXT NOT NULL UNIQUE, source TEXT,
     last_seen TEXT, times_seen INTEGER DEFAULT 1, retired INTEGER DEFAULT 0,
     relation TEXT, valid_from TEXT, valid_to TEXT )`,
  `CREATE TABLE IF NOT EXISTS embeddings (
     turn_id INTEGER PRIMARY KEY, dim INTEGER NOT NULL, vec BLOB NOT NULL )`,
  `CREATE TABLE IF NOT EXISTS cache (
     id INTEGER PRIMARY KEY, ts TEXT NOT NULL, q TEXT NOT NULL, a TEXT NOT NULL, tier TEXT,
     dim INTEGER NOT NULL, vec BLOB NOT NULL, hits INTEGER DEFAULT 0 )`,
  `CREATE TABLE IF NOT EXISTS topics (
     id INTEGER PRIMARY KEY, label TEXT NOT NULL, dim INTEGER NOT NULL, centroid BLOB NOT NULL,
     n INTEGER DEFAULT 1, first_seen TEXT NOT NULL, last_seen TEXT NOT NULL,
     days TEXT DEFAULT '', offered INTEGER DEFAULT 0 )`,
  `CREATE TABLE IF NOT EXISTS journal (
     id INTEGER PRIMARY KEY, topic TEXT NOT NULL UNIQUE, first_seen TEXT NOT NULL,
     last_seen TEXT NOT NULL, times_seen INTEGER DEFAULT 1 )`,
  /*
   * 3.3: the vault, searchable without loading it.
   *
   * ONE ROW PER NOTE, not per chunk. Joshua's 1,188 notes are 566 MB, and the session handoffs run to
   * nearly 2 MB each. Chunking that at 1,500 characters would be ~377,000 embeddings, four hours of GPU
   * and a gigabyte of vectors, to answer a question that is really "which note is this in". Indexing the
   * title, the note's own `llm_summary` frontmatter where it has one, and the opening of the body gives
   * 1,188 embeddings, under a minute, and about 4 MB.
   *
   * `head` is what was embedded, kept so a result can show why it matched. `mtime` lets a re-index skip
   * everything that has not changed.
   */
  `CREATE TABLE IF NOT EXISTS docs (
     id INTEGER PRIMARY KEY, path TEXT NOT NULL UNIQUE, title TEXT NOT NULL, head TEXT NOT NULL,
     mtime INTEGER NOT NULL, bytes INTEGER NOT NULL, dim INTEGER, vec BLOB )`,
  `CREATE INDEX IF NOT EXISTS docs_mtime ON docs(mtime)`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS docs_fts USING fts5(title, head, path UNINDEXED, doc_id UNINDEXED)`,
  /*
   * 7: what keeps coming up, by week.
   *
   * One row per name per week, so "twice this week and twice last week" is answerable - which is the
   * whole point. A single week's popularity list is nearly worthless; the repetition across weeks is
   * the signal Joshua described ("when harnesses first started coming out... now people are talking
   * about jev"). `sources` is a comma-separated set, so three mentions all from one place can be told
   * apart from three mentions in three different places.
   */
  `CREATE TABLE IF NOT EXISTS mentions (
     name TEXT NOT NULL, week TEXT NOT NULL, times INTEGER NOT NULL DEFAULT 1,
     first_seen TEXT NOT NULL, last_seen TEXT NOT NULL, sources TEXT NOT NULL DEFAULT '',
     PRIMARY KEY (name, week) )`,
  `CREATE INDEX IF NOT EXISTS mentions_week ON mentions(week)`,
  `CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)`,
];

/** What happened when memory was opened. `ok` false means Aang must not pretend to be himself. */
export interface OpenResult {
  db: DatabaseSync | null;
  ok: boolean;
  /** One plain sentence, written to be shown to Joshua, not only logged. */
  detail: string;
  how: 'opened' | 'restored' | 'created' | 'failed';
}

/** A database that opens AND passes an integrity check. A file that opens but is corrupt is not usable. */
function usable(file: string): boolean {
  if (!existsSync(file)) return false;
  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(file, { readOnly: true });
    // quick_check, not integrity_check: this runs on every start, and the thorough one walks the
    // whole file. quick_check still catches a truncated or scrambled database, which is the case
    // a hard shutdown actually produces.
    const r = db.prepare('PRAGMA quick_check').get() as { quick_check?: string } | undefined;
    if (r?.quick_check !== 'ok') return false;
    // A file can be structurally valid and still not be Aang's memory, e.g. a half-finished restore.
    db.prepare('SELECT count(*) FROM turns').get();
    return true;
  } catch { return false; }
  finally { try { db?.close(); } catch { /* already gone */ } }
}

/**
 * The write-ahead log belongs to the database it was written for. Leaving a stale -wal or -shm
 * beside a file that has just been replaced is a way to corrupt a database that was fine, so they
 * go whenever the main file is swapped.
 */
function dropSidecars(file: string): void {
  for (const ext of ['-wal', '-shm']) { try { rmSync(file + ext, { force: true }); } catch { /* nothing there */ } }
}

/** Keep a broken database rather than deleting it: it is the only evidence of what went wrong. */
function setAside(file: string): string | null {
  const to = `${file}.broken-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;
  try { renameSync(file, to); dropSidecars(file); return path.basename(to); } catch { return null; }
}

/**
 * Columns added after the first release.
 *
 * An existing database opens straight through path 1 of openMemory and NEVER sees SCHEMA, so a column
 * added to SCHEMA alone would exist only in databases built from scratch. His live file has 424 turns
 * in it and was built before any of this. Anything added later has to be applied here, on every open.
 *
 * Guarded by reading the table's own columns: SQLite has no "ADD COLUMN IF NOT EXISTS", and wrapping a
 * bare ALTER in a try would swallow a real failure as if it were the already-there case.
 */
const ADDED_COLUMNS: { table: string; column: string; decl: string }[] = [
  // 3.3: a fact the local model read out of a document waits here until Joshua approves it. Nothing
  // self-activates; a pending fact is never used in an answer and never shown as something he knows.
  { table: 'facts', column: 'pending', decl: 'INTEGER NOT NULL DEFAULT 0' },
  // 3.3: which document a fact came from, so he can see why Aang believes it.
  { table: 'facts', column: 'from_doc', decl: 'TEXT' },
  // 4.3b: forgetting a turn hides it. The row stays, so "undo that" can bring it back.
  { table: 'turns', column: 'hidden', decl: 'INTEGER NOT NULL DEFAULT 0' },
  // 5.3: the request this turn answered. It is what ties a stored turn to the things Aang actually did,
  // because the action record is written DURING a turn and the turn row only exists once the reply is
  // finished - so there is no turn id to stamp on an action at the time. Both sides carry the request id
  // instead, and "why did you do that" is a join rather than a comparison of clocks.
  { table: 'turns', column: 'req', decl: 'TEXT' },
];

/** Bring an opened database up to the current shape. Safe to run on every open; does nothing when there is
 *  nothing to do. Never throws: a database that is one column behind is still worth having. */
export function migrate(db: DatabaseSync): void {
  // Columns BEFORE tables, and the order matters.
  //
  // It used to be the other way round, and adding `turns.req` showed why that is wrong: SCHEMA contains
  // `CREATE INDEX turns_req ON turns(req)`, which on an existing database ran before the column existed.
  // It failed with "no such column: req", nothing retried it, and the result was a database with the
  // column but no index and an alarming line on every single boot. Columns first means an index on a
  // newly added column simply works (2026-10-03).
  //
  // A table that does not exist yet is skipped here and created by SCHEMA below, which is why this order
  // is safe for a database built from nothing as well as one being brought forward.
  for (const { table, column, decl } of ADDED_COLUMNS) {
    try {
      const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: unknown }[];
      if (cols.length === 0) continue;                                  // no such table: SCHEMA owns it
      if (cols.some(c => String(c.name) === column)) continue;          // already there
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
      console.error(`memory: added ${table}.${column}`);
    } catch (e) {
      console.error(`memory: could not add ${table}.${column}:`, (e as Error).message);
    }
  }
  // Every statement in SCHEMA is IF NOT EXISTS, so on an existing database this is a no-op for what is
  // already there and CREATES whatever was added since. Without it, a new TABLE would reach only
  // databases built from scratch - the exact trap ADDED_COLUMNS exists for, one level up. Found while
  // adding the document index on 2026-10-02.
  for (const stmt of SCHEMA) {
    try { db.exec(stmt); }
    catch (e) { console.error('memory: schema statement failed:', (e as Error).message); }
  }
}

export function createDatabase(file: string): DatabaseSync {
  mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA busy_timeout = 3000;');
  for (const stmt of SCHEMA) db.exec(stmt);
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  migrate(db);
  return db;
}

/**
 * Open Aang's memory, and fix it if it is broken.
 *
 * In order: use the database if it is usable; otherwise restore the most recent verified backup;
 * otherwise build an empty one. The only way to get `ok: false` is for all three to fail.
 */
export function openMemory(dataDir: string): OpenResult {
  const file = path.join(dataDir, 'aang.db');
  const backup = path.join(dataDir, 'backups', 'aang.db');

  // 1. The normal case.
  if (usable(file)) {
    try {
      const db = new DatabaseSync(file);
      db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA busy_timeout = 3000;');
      migrate(db);
      return { db, ok: true, detail: '', how: 'opened' };
    } catch (e) {
      console.error('memory: passed its check then would not open:', (e as Error).message);
    }
  }

  const missing = !existsSync(file);
  const aside = missing ? null : setAside(file);
  if (!missing) {
    console.error(`memory: aang.db is damaged${aside ? `, kept as ${aside}` : ''}`);
  }

  // 2. Restore the backup, but only after checking it is itself sound. Restoring a corrupt backup
  //    over a corrupt database helps nobody.
  if (usable(backup)) {
    try {
      dropSidecars(file);
      copyFileSync(backup, file);
      const db = new DatabaseSync(file);
      db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA busy_timeout = 3000;');
      migrate(db);
      const turns = (db.prepare('SELECT count(*) c FROM turns').get() as { c: number }).c;
      const age = Math.round((Date.now() - statSync(backup).mtimeMs) / 3_600_000);
      return {
        db, ok: true, how: 'restored',
        detail: `My memory was ${missing ? 'missing' : 'damaged'}, so I restored my backup from ` +
          `${age < 1 ? 'less than an hour ago' : `about ${age} hour${age === 1 ? '' : 's'} ago`}: ` +
          `${turns} turns are back.` + (aside ? ` The damaged file is kept as ${aside}.` : ''),
      };
    } catch (e) {
      console.error('memory: the backup would not restore:', (e as Error).message);
    }
  }

  // 3. Nothing to restore. A new, empty memory beats no memory, as long as he says so.
  try {
    const db = createDatabase(file);
    return {
      db, ok: true, how: 'created',
      detail: missing && !existsSync(backup)
        ? 'This is a fresh start: I had no memory file and no backup, so I made an empty one. I will not remember anything from before now.'
        : 'My memory could not be opened or restored, so I started an empty one. Everything before now is gone unless that file can be repaired.',
    };
  } catch (e) {
    return {
      db: null, ok: false, how: 'failed',
      detail: `I cannot open or create my memory (${(e as Error).message}), so I am not going to pretend to be myself. Nothing will be remembered until this is fixed.`,
    };
  }
}

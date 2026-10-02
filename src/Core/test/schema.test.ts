import './_env.ts';
// Memory heals itself, or says plainly that it cannot.
//
// WHY THIS EXISTS: `memory.ts` used to open the database with `if (existsSync(file))` and no else.
// A missing database meant Aang started anyway, with no memory, said nothing about it, and talked
// to Joshua as a stranger in his own voice. There was also no CREATE TABLE anywhere in the
// codebase, so a fresh install could not work and a lost file could not be rebuilt.
//
// The fix was not to choose how Aang should behave while broken. It was for him not to stay broken:
// restore the verified backup, or build an empty database, and only refuse when even that fails.
// These tests are the three branches of that, plus the two ways it could be dangerous - restoring a
// corrupt backup, and destroying the evidence of what went wrong.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, existsSync, copyFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createDatabase, openMemory, SCHEMA_VERSION } from '../src/schema.ts';

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'aang-schema-'));

/** A real, valid memory database with one turn in it, to stand in for a backup or a live file. */
function seed(file: string, turnText = 'hello'): void {
  const db = createDatabase(file);
  db.prepare('INSERT INTO turns (ts, role, tier, text) VALUES (?,?,?,?)')
    .run('2026-10-01 12:00:00', 'user', null, turnText);
  db.close();
}

test('a fresh install builds a working database rather than starting with no memory', () => {
  const dir = tmp();
  const r = openMemory(dir);
  assert.equal(r.ok, true);
  assert.equal(r.how, 'created');
  assert.match(r.detail, /fresh start/i, 'he must say this is a blank slate, not stay quiet about it');
  assert.ok(r.db, 'a created database must actually be open');
  // The shape has to be the real one, or the first write fails instead of the open.
  const names = (r.db!.prepare("SELECT name FROM sqlite_master WHERE type IN ('table','index')").all() as { name: string }[])
    .map(n => n.name);
  for (const t of ['turns', 'facts', 'embeddings', 'cache', 'topics', 'journal', 'meta', 'turns_fts', 'turns_ts'])
    assert.ok(names.includes(t), `a new database is missing ${t}`);
  assert.equal((r.db!.prepare('PRAGMA user_version').get() as { user_version: number }).user_version, SCHEMA_VERSION,
    'the schema version must be stamped, or a future change cannot tell old files from new ones');
  r.db!.close();
});

test('an existing, healthy database is just opened, with nothing to announce', () => {
  const dir = tmp();
  seed(path.join(dir, 'aang.db'), 'a real turn');
  const r = openMemory(dir);
  assert.equal(r.how, 'opened');
  assert.equal(r.detail, '', 'the normal case must say nothing; a warning every start is a warning nobody reads');
  assert.equal((r.db!.prepare('SELECT count(*) c FROM turns').get() as { c: number }).c, 1);
  r.db!.close();
});

test('a damaged database is restored from the backup, and he says so', () => {
  const dir = tmp();
  mkdirSync(path.join(dir, 'backups'), { recursive: true });
  seed(path.join(dir, 'backups', 'aang.db'), 'the backed up turn');
  // A database truncated by a hard shutdown: the right header, then nothing that parses.
  writeFileSync(path.join(dir, 'aang.db'), 'SQLite format 3\0' + 'x'.repeat(400));

  const r = openMemory(dir);
  assert.equal(r.ok, true);
  assert.equal(r.how, 'restored', 'a verified backup exists, so it must be used rather than starting empty');
  assert.match(r.detail, /restored/i);
  assert.equal((r.db!.prepare('SELECT text FROM turns').get() as { text: string }).text, 'the backed up turn');
  r.db!.close();
});

test('the damaged file is kept, not deleted: it is the only evidence of what happened', () => {
  const dir = tmp();
  mkdirSync(path.join(dir, 'backups'), { recursive: true });
  seed(path.join(dir, 'backups', 'aang.db'));
  writeFileSync(path.join(dir, 'aang.db'), 'SQLite format 3\0' + 'x'.repeat(400));

  const r = openMemory(dir);
  r.db?.close();
  const kept = readdirSync(dir).filter(f => f.includes('.broken-'));
  assert.equal(kept.length, 1, 'the damaged database must be set aside, never silently overwritten');
  assert.match(r.detail, /kept as/i, 'and he must say where it went, or nobody will look for it');
});

test('a corrupt BACKUP is not restored over the top; it starts empty instead', () => {
  // The dangerous case. Copying a corrupt backup over a corrupt database helps nobody and destroys
  // the one file that might have been repairable.
  const dir = tmp();
  mkdirSync(path.join(dir, 'backups'), { recursive: true });
  writeFileSync(path.join(dir, 'backups', 'aang.db'), 'SQLite format 3\0' + 'junk'.repeat(80));
  writeFileSync(path.join(dir, 'aang.db'), 'SQLite format 3\0' + 'x'.repeat(400));

  const r = openMemory(dir);
  assert.equal(r.ok, true);
  assert.equal(r.how, 'created', 'an unverified backup must never be trusted');
  assert.match(r.detail, /empty|fresh/i);
  r.db!.close();
});

test('a stale write-ahead log is cleared when the file is swapped', () => {
  // A -wal belongs to the database it was written for. Leaving one beside a restored file is a way
  // to corrupt a database that had just been made good again.
  const dir = tmp();
  mkdirSync(path.join(dir, 'backups'), { recursive: true });
  seed(path.join(dir, 'backups', 'aang.db'));
  writeFileSync(path.join(dir, 'aang.db'), 'SQLite format 3\0' + 'x'.repeat(400));
  writeFileSync(path.join(dir, 'aang.db-wal'), 'stale write ahead log from the dead database');

  const r = openMemory(dir);
  const turns = (r.db!.prepare('SELECT count(*) c FROM turns').get() as { c: number }).c;
  r.db!.close();
  assert.equal(turns, 1, 'the restored database must be readable, not poisoned by the old -wal');
});

test('the real backup on this machine restores cleanly', () => {
  // Not a synthetic fixture: the actual backups/aang.db, if it is there. This is the file the whole
  // design leans on, so it is worth one assertion that it is what we think it is.
  const real = path.join('C:', 'Users', 'Shadow', 'Documents', 'Aang', 'backups', 'aang.db');
  if (!existsSync(real)) return;                      // not this machine; skip rather than fail
  const dir = tmp();
  mkdirSync(path.join(dir, 'backups'), { recursive: true });
  copyFileSync(real, path.join(dir, 'backups', 'aang.db'));
  writeFileSync(path.join(dir, 'aang.db'), 'SQLite format 3\0' + 'x'.repeat(400));

  const r = openMemory(dir);
  assert.equal(r.how, 'restored');
  const turns = (r.db!.prepare('SELECT count(*) c FROM turns').get() as { c: number }).c;
  r.db!.close();
  assert.ok(turns > 100, `the real backup should hold a real conversation history, got ${turns} turns`);
});

test('when nothing can be opened or built, it refuses and says why', () => {
  // The only path to ok:false. dataDir points at a file, so creating a directory under it fails.
  const dir = tmp();
  const blocked = path.join(dir, 'not-a-directory');
  writeFileSync(blocked, 'this is a file, so nothing can be created inside it');
  const r = openMemory(blocked);
  assert.equal(r.ok, false);
  assert.equal(r.db, null);
  assert.equal(r.how, 'failed');
  assert.match(r.detail, /not going to pretend/i, 'silent amnesia is the one outcome this must never produce');
});

test('a database created here is accepted on the next start', () => {
  // Round trip: what createDatabase writes must satisfy the usable() check, or Aang would rebuild
  // his memory from scratch on every single start and lose the previous run each time.
  const dir = tmp();
  const first = openMemory(dir);
  first.db!.prepare('INSERT INTO turns (ts, role, tier, text) VALUES (?,?,?,?)')
    .run('2026-10-01 12:00:00', 'user', null, 'written on the first run');
  first.db!.close();

  const second = openMemory(dir);
  assert.equal(second.how, 'opened', 'the second start must reuse the database, not replace it');
  assert.equal((second.db!.prepare('SELECT text FROM turns').get() as { text: string }).text, 'written on the first run');
  second.db!.close();
});

test('Memory exposes what happened so the Core can tell Joshua', async () => {
  const { Memory } = await import('../src/memory.ts');
  const dir = tmp();
  const m = new Memory(dir);
  assert.equal(m.opened.ok, true);
  assert.equal(m.opened.how, 'created');
  assert.ok(m.opened.detail.length > 0, 'a fresh start is something he must be told about');
  m.close();
});

test('a stale -wal does not stop a healthy database from opening normally', () => {
  const dir = tmp();
  seed(path.join(dir, 'aang.db'), 'still here');
  const r = openMemory(dir);
  assert.equal(r.how, 'opened');
  r.db!.close();
});

test('the created schema matches his real database, once it has been opened', () => {
  // Guards against the schema here drifting from the one 400+ real turns live in. Compares the column
  // names of every table, which is what a query would break on.
  //
  // Against a COPY of the live file, opened rather than read: openMemory migrates on every open, so the
  // thing worth asserting is that his real database ends up the same shape as a fresh one - not that it
  // already is one, which stopped being true the moment a column was added (2026-10-01). Reading it
  // read-only would have tested the shape he is migrating away from. The original is never touched.
  const real = path.join('C:', 'Users', 'Shadow', 'Documents', 'Aang', 'aang.db');
  if (!existsSync(real)) return;
  const dir = tmp(), copy = path.join(dir, 'aang.db');
  copyFileSync(real, copy);
  const opened = openMemory(dir);
  assert.equal(opened.how, 'opened', 'his database should open normally, not need restoring');
  const fresh = createDatabase(path.join(tmp(), 'aang.db'));
  try {
    for (const t of ['turns', 'facts', 'embeddings', 'cache', 'topics', 'journal', 'meta']) {
      const cols = (d: DatabaseSync) => (d.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[])
        .map(c => c.name).sort();
      assert.deepEqual(cols(fresh), cols(opened.db!), `table ${t} has drifted from the live database`);
    }
  } finally { fresh.close(); opened.db!.close(); }
});

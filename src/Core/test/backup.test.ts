import './_env.ts';
// The memory backup (2026-09-28): a verified snapshot leaves this machine every time Aang starts, because
// Shadow can vanish without warning and the database cannot be allowed to live only there. Real git repo in a
// temp dir, real sqlite file, no mocks - the same operations run against the actual data repo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Backup } from '../src/backup.ts';

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'aang-backup-'));

function repo(): string {
  const dir = tmp();
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--allow-empty', '-q', '-m', 'init'], { cwd: dir });
  return dir;
}

function makeDb(dir: string, turns: number, facts: number): void {
  const db = new DatabaseSync(path.join(dir, 'aang.db'));
  db.exec('CREATE TABLE turns (id INTEGER PRIMARY KEY, text TEXT)');
  db.exec('CREATE TABLE facts (id INTEGER PRIMARY KEY, text TEXT)');
  for (let i = 0; i < turns; i++) db.exec(`INSERT INTO turns (text) VALUES ('t${i}')`);
  for (let i = 0; i < facts; i++) db.exec(`INSERT INTO facts (text) VALUES ('f${i}')`);
  db.close();
}

test('no database yet is reported plainly, not thrown', () => {
  const dir = repo();
  const r = new Backup(dir).run();
  assert.equal(r.ok, false);
  assert.match(r.detail, /no database yet/);
});

test('a real snapshot is verified, committed, and counted right', () => {
  const dir = repo();
  makeDb(dir, 3, 2);
  const r = new Backup(dir).run();
  assert.equal(r.ok, true);
  assert.equal(r.turns, 3);
  assert.equal(r.facts, 2);
  assert.ok(existsSync(path.join(dir, 'backups', 'aang.db')));
  const log = execFileSync('git', ['log', '--oneline', '--', 'backups/aang.db'], { cwd: dir, encoding: 'utf8' });
  assert.match(log, /Backup: 3 turns, 2 facts/);
});

test('running again with no changes is not treated as a failure', () => {
  const dir = repo();
  makeDb(dir, 1, 0);
  const b = new Backup(dir);
  assert.equal(b.run().ok, true);
  const second = b.run();                              // the db has not changed - "nothing to commit" is fine
  assert.equal(second.ok, true);
  const log = execFileSync('git', ['log', '--oneline', '--', 'backups/aang.db'], { cwd: dir, encoding: 'utf8' });
  assert.equal(log.trim().split('\n').length, 1, 'a second identical backup must not add a second commit');
});

test('a push with no remote configured still counts the commit as done', () => {
  const dir = repo();
  makeDb(dir, 1, 1);
  const r = new Backup(dir).run();
  assert.equal(r.ok, true, 'the local commit succeeded even though there is nowhere to push to');
  assert.match(r.detail, /push failed/);
});

test('stale() is true with no backup ever, false right after a good one', () => {
  const dir = repo();
  makeDb(dir, 1, 0);
  const b = new Backup(dir);
  assert.equal(b.stale(), true);
  assert.equal(b.run().ok, true);
  assert.equal(b.stale(), false);
});

test('the live database is never modified - only VACUUM INTO reads it', () => {
  const dir = repo();
  makeDb(dir, 5, 0);
  const before = new DatabaseSync(path.join(dir, 'aang.db'), { readOnly: true }).prepare('SELECT COUNT(*) n FROM turns').get() as { n: number };
  new Backup(dir).run();
  const after = new DatabaseSync(path.join(dir, 'aang.db'), { readOnly: true }).prepare('SELECT COUNT(*) n FROM turns').get() as { n: number };
  assert.equal(before.n, after.n);
});

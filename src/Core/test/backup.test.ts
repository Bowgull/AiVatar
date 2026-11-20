import './_env.ts';
// The memory backup (2026-09-28): a verified snapshot leaves this machine every time Aang starts, because
// Shadow can vanish without warning and the database cannot be allowed to live only there. Real git repos in temp
// dirs (a bare one stands in for GitHub), real sqlite files, no mocks - the same operations run against the actual
// data repo. 2026-11-20: one file per machine, and a push that does not land is a failure that gets said.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync, readFileSync, chmodSync, copyFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Backup, BackupWatch, STALE_MS, backupRel, machineOf, LEGACY_REL } from '../src/backup.ts';

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'aang-backup-'));
const git = (dir: string, ...args: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: dir, encoding: 'utf8' });

/** A bare "GitHub" with one commit on main, and a data folder cloned from it. */
function remote(): string {
  const bare = tmp();
  git(bare, 'init', '-q', '--bare', '-b', 'main');
  const seed = tmp();
  git(seed, 'init', '-q', '-b', 'main');
  writeFileSync(path.join(seed, 'README.md'), 'aang-data\n');
  git(seed, 'add', 'README.md');
  git(seed, 'commit', '-q', '-m', 'init');
  git(seed, 'remote', 'add', 'origin', bare);
  git(seed, 'push', '-q', '-u', 'origin', 'main');
  return bare;
}
function clone(bare: string): string {
  const dir = tmp();
  execFileSync('git', ['clone', '-q', bare, dir]);
  return dir;
}
function repo(): string { return clone(remote()); }

function makeDb(dir: string, turns: number, facts: number): void {
  const db = new DatabaseSync(path.join(dir, 'aang.db'));
  db.exec('CREATE TABLE IF NOT EXISTS turns (id INTEGER PRIMARY KEY, text TEXT)');
  db.exec('CREATE TABLE IF NOT EXISTS facts (id INTEGER PRIMARY KEY, text TEXT)');
  for (let i = 0; i < turns; i++) db.exec(`INSERT INTO turns (text) VALUES ('t${i}')`);
  for (let i = 0; i < facts; i++) db.exec(`INSERT INTO facts (text) VALUES ('f${i}')`);
  db.close();
}
const turnsIn = (file: string) => { const d = new DatabaseSync(file, { readOnly: true }); const n = (d.prepare('SELECT COUNT(*) n FROM turns').get() as { n: number }).n; d.close(); return n; };
/** Every file each commit touched, on GitHub's main. */
const touched = (bare: string) => git(bare, 'log', '--format=@%s', '--name-only', 'main').split('@').slice(1)
  .map(b => b.split('\n').map(l => l.trim()).filter(Boolean));

test('each machine has its own file', () => {
  assert.equal(machineOf('win32'), 'pc');
  assert.equal(machineOf('darwin'), 'mac');
  assert.equal(backupRel('pc'), 'backups/aang-pc.db');
  assert.equal(backupRel('mac'), 'backups/aang-mac.db');
});

test('no database yet is reported plainly, not thrown', async () => {
  const r = await new Backup(repo(), { machine: 'pc' }).run();
  assert.equal(r.ok, false);
  assert.match(r.detail, /no database yet/);
});

test('a real snapshot is verified, committed, pushed and counted right', async () => {
  const bare = remote();
  const dir = clone(bare);
  makeDb(dir, 3, 2);
  const r = await new Backup(dir, { machine: 'pc' }).run();
  assert.equal(r.ok, true, r.detail);
  assert.equal(r.turns, 3);
  assert.equal(r.facts, 2);
  assert.ok(existsSync(path.join(dir, 'backups', 'aang-pc.db')));
  assert.match(git(bare, 'log', '--oneline', 'main', '--', 'backups/aang-pc.db'), /Backup \(pc\): 3 turns, 2 facts/);
});

test('running again with no changes is not treated as a failure', async () => {
  const dir = repo();
  makeDb(dir, 1, 0);
  const b = new Backup(dir, { machine: 'pc' });
  assert.equal((await b.run()).ok, true);
  const second = await b.run();                              // the db has not changed - "nothing to commit" is fine
  assert.equal(second.ok, true, second.detail);
  const log = git(dir, 'log', '--oneline', '--', 'backups/aang-pc.db');
  assert.equal(log.trim().split('\n').length, 1, 'a second identical backup must not add a second commit');
});

test('with nowhere to push, the run is a failure, not a quiet ok', async () => {
  const dir = tmp();
  git(dir, 'init', '-q');
  git(dir, 'commit', '--allow-empty', '-q', '-m', 'init');
  makeDb(dir, 1, 1);
  const r = await new Backup(dir, { machine: 'pc' }).run();
  assert.equal(r.ok, false);
  assert.match(r.detail, /GitHub/);
});

test('a refused push is a failure, and it is said', async () => {
  const bare = remote();
  const dir = clone(bare);
  makeDb(dir, 2, 0);
  // GitHub refusing every push, the way it refused the PC's for three weeks.
  const hook = path.join(bare, 'hooks', 'pre-receive');
  writeFileSync(hook, '#!/bin/sh\necho "refused for the test" >&2\nexit 1\n');
  chmodSync(hook, 0o755);
  const r = await new Backup(dir, { machine: 'pc' }).run();
  assert.equal(r.ok, false, 'a backup that never left the machine is not ok');
  assert.equal(r.committed, true, 'it was saved here');
  assert.match(r.detail, /NOT on GitHub/);

  const w = new BackupWatch();
  const said = w.after(r);
  assert.ok(said, 'with no good backup on record, the first failure is said');
  assert.match(said!, /failing/);
  assert.equal(w.after(r), null, 'said once, not on every retry');
  assert.match(w.warning()!, /NOT on GitHub/, 'it stays on the brief until fixed');
  assert.ok(w.waiting());
  assert.equal(w.due(), true, 'and is tried again');
});

test('a commit stuck behind an earlier refused push goes out on the next run', async () => {
  const bare = remote();
  const dir = clone(bare);
  makeDb(dir, 2, 0);
  const hook = path.join(bare, 'hooks', 'pre-receive');
  writeFileSync(hook, '#!/bin/sh\nexit 1\n');
  chmodSync(hook, 0o755);
  const b = new Backup(dir, { machine: 'pc' });
  assert.equal((await b.run()).ok, false);
  writeFileSync(hook, '#!/bin/sh\nexit 0\n');
  const r = await b.run();                                    // nothing new to commit, but the old commit must leave
  assert.equal(r.ok, true, r.detail);
  assert.match(git(bare, 'log', '--oneline', 'main'), /Backup \(pc\)/);
});

test('one failure on a fresh backup is retried quietly first; a stale one is said', () => {
  const now = Date.parse('2026-11-20T12:00:00Z');
  const fail = { ok: false, detail: 'saved here but NOT on GitHub: the push was refused' };
  const w = new BackupWatch();
  w.seen(new Date(now - 60 * 60_000));                       // a good push an hour ago
  assert.equal(w.after(fail, now), null, 'one bad try an hour after a good one stays quiet');
  assert.ok(w.warning(now), 'but the brief still shows it');
  assert.ok(w.due(now));
  const later = now + STALE_MS;                               // still failing 12 hours on
  assert.match(w.after(fail, later)!, /failing/);
  assert.equal(w.after({ ok: true, detail: 'fine' }, later + 1), null);
  assert.equal(w.warning(later + 1), null, 'a good backup clears it');
  assert.equal(w.due(later + 1), false);
});

test('a stale backup surfaces even when no run has failed', () => {
  const now = Date.parse('2026-11-20T12:00:00Z');
  const w = new BackupWatch();
  w.seen(new Date(now - 21 * 24 * 3600_000));               // three weeks, the 2026-11 gap
  assert.equal(w.due(now), true);
  assert.match(w.warning(now)!, /not reached GitHub since/);
  assert.ok(w.waiting(now));
  const fresh = new BackupWatch();
  fresh.seen(new Date(now - 60_000));
  assert.equal(fresh.warning(now), null);
  assert.equal(fresh.due(now), false);
});

test('lastPushedAt reads GitHub, not this machine', async () => {
  const bare = remote();
  const dir = clone(bare);
  makeDb(dir, 1, 0);
  const b = new Backup(dir, { machine: 'pc' });
  assert.equal(await b.stale(), true);
  assert.equal((await b.run()).ok, true);
  assert.equal(await b.stale(), false);
  // A commit made here that never left must not count.
  const other = clone(bare);
  makeDb(other, 1, 0);
  const hook = path.join(bare, 'hooks', 'pre-receive');
  writeFileSync(hook, '#!/bin/sh\nexit 1\n');
  chmodSync(hook, 0o755);
  const mac = new Backup(other, { machine: 'mac' });
  assert.equal((await mac.run()).ok, false);
  assert.equal(await mac.lastPushedAt(), null);
});

test('two machines never touch each other\'s file, and both reach GitHub', async () => {
  const bare = remote();
  const pc = clone(bare), mac = clone(bare);
  makeDb(pc, 5, 0);
  makeDb(mac, 2, 0);
  const P = new Backup(pc, { machine: 'pc' }), M = new Backup(mac, { machine: 'mac' });
  assert.equal((await P.run()).ok, true);
  // The Mac is now behind GitHub: it must line up, not be refused, and not take the PC's file.
  const m1 = await M.run();
  assert.equal(m1.ok, true, m1.detail);
  makeDb(pc, 1, 0);
  assert.equal((await P.run()).ok, true);
  makeDb(mac, 1, 0);
  assert.equal((await M.run()).ok, true);

  for (const [subject, ...files] of touched(bare)) {
    if (/\(pc\)/.test(subject!)) assert.deepEqual(files, ['backups/aang-pc.db'], subject);
    if (/\(mac\)/.test(subject!)) assert.deepEqual(files, ['backups/aang-mac.db'], subject);
  }
  const check = clone(bare);
  assert.equal(turnsIn(path.join(check, 'backups', 'aang-pc.db')), 6);
  assert.equal(turnsIn(path.join(check, 'backups', 'aang-mac.db')), 3);
});

test('his own uncommitted edits in the data folder are left alone', async () => {
  const bare = remote();
  const pc = clone(bare), mac = clone(bare);
  makeDb(mac, 1, 0);
  assert.equal((await new Backup(mac, { machine: 'mac' }).run()).ok, true);   // GitHub moves on
  makeDb(pc, 1, 0);
  writeFileSync(path.join(pc, 'README.md'), 'his own edit\n');
  writeFileSync(path.join(pc, 'notes.txt'), 'untracked\n');
  git(pc, 'add', 'notes.txt');                                 // staged, and still must not ride along
  const r = await new Backup(pc, { machine: 'pc' }).run();
  assert.equal(r.ok, true, r.detail);
  assert.equal(readFileSync(path.join(pc, 'README.md'), 'utf8').replace(/\r/g, ''), 'his own edit\n');
  assert.equal(git(bare, 'log', '-1', '--format=', '--name-only', 'main').trim(), 'backups/aang-pc.db');
  assert.match(git(pc, 'status', '--short'), /README\.md/);
});

test('the PC takes over the old shared file with its history; the Mac leaves it alone', async () => {
  const bare = remote();
  const seed = clone(bare);
  mkdirSync(path.join(seed, 'backups'));
  makeDb(seed, 4, 0);
  copyFileSync(path.join(seed, 'aang.db'), path.join(seed, 'backups', 'aang.db'));
  git(seed, 'add', LEGACY_REL);
  git(seed, 'commit', '-q', '-m', 'Backup: the old shared file');
  git(seed, 'push', '-q');

  const mac = clone(bare);
  makeDb(mac, 1, 0);
  assert.equal((await new Backup(mac, { machine: 'mac' }).run()).ok, true);
  assert.ok(existsSync(path.join(clone(bare), 'backups', 'aang.db')), 'the Mac never moves or deletes it');

  const pc = clone(bare);
  makeDb(pc, 7, 0);
  assert.equal((await new Backup(pc, { machine: 'pc' }).run()).ok, true);
  const after = clone(bare);
  assert.equal(existsSync(path.join(after, 'backups', 'aang.db')), false);
  assert.equal(turnsIn(path.join(after, 'backups', 'aang-pc.db')), 7);
  assert.match(git(after, 'log', '--follow', '--format=%s', '--', 'backups/aang-pc.db'), /the old shared file/, 'the history follows the file');
  assert.equal(turnsIn(path.join(after, 'backups', 'aang-mac.db')), 1, 'the Mac\'s file is untouched');
});

test('the live database is never modified - only VACUUM INTO reads it', async () => {
  const dir = repo();
  makeDb(dir, 5, 0);
  const before = turnsIn(path.join(dir, 'aang.db'));
  await new Backup(dir, { machine: 'pc' }).run();
  assert.equal(turnsIn(path.join(dir, 'aang.db')), before);
});

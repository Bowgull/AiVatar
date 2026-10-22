// Aang's memory leaves this machine every time he starts (2026-09-28): a verified snapshot of aang.db, pushed
// to the private data repo. Shadow can vanish without warning; the database cannot be allowed to live only there.
// One rolling file, not a pile of dated ones - git's own history is the backup history, so nothing accumulates
// and nothing needs pruning.
//
// 2026-10-21: never on the brain's thread. This ran 5 s after every start, all of it synchronous: VACUUM INTO and the
// integrity check (~330 ms on his 15 MB database), then git add, commit and push of that 15 MB file (a network round
// trip). core.log measured the brain frozen for 12.6 s and 6.8 s right after two starts, exactly when he was sending
// his first message, so his reply sat waiting. Now the database work runs in a worker thread and git is started from
// the helper thread (offthread.ts; even starting a program holds the thread that starts it for 30-150 ms here): the
// brain stays free the whole time.
import { mkdir, rename, stat, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { runOffThread } from './offthread.ts';
import { Worker } from 'node:worker_threads';
import path from 'node:path';

export interface BackupResult { ok: boolean; detail: string; turns?: number; facts?: number; sizeMB?: number }

const BACKUP_REL = path.join('backups', 'aang.db');
/** A fact nobody has confirmed for this long is worth a loud word, not a silent retry. */
export const STALE_MS = 12 * 60 * 60 * 1000;

/**
 * The snapshot itself, run in a worker thread (plain JS: a worker made from a string). It only ever opens the live
 * database read-only. Answers { integrity, turns, facts } or { error }.
 */
const SNAPSHOT_WORKER = `
const { parentPort, workerData } = require('node:worker_threads');
const { DatabaseSync } = require('node:sqlite');
try {
  const src = new DatabaseSync(workerData.db, { readOnly: true });
  src.exec("VACUUM INTO '" + workerData.tmp.replace(/'/g, "''") + "'");
  src.close();
  const chk = new DatabaseSync(workerData.tmp, { readOnly: true });
  const integrity = chk.prepare('PRAGMA integrity_check').get().integrity_check;
  let turns = 0, facts = 0;
  if (integrity === 'ok') {
    turns = chk.prepare('SELECT COUNT(*) n FROM turns').get().n;
    facts = chk.prepare('SELECT COUNT(*) n FROM facts').get().n;
  }
  chk.close();
  parentPort.postMessage({ integrity, turns, facts });
} catch (e) { parentPort.postMessage({ error: String(e && e.message || e) }); }
`;

function snapshot(db: string, tmp: string): Promise<{ integrity: string; turns: number; facts: number }> {
  return new Promise((resolve, reject) => {
    const w = new Worker(SNAPSHOT_WORKER, { eval: true, workerData: { db, tmp } });
    let done = false;
    w.once('message', (m: { error?: string; integrity: string; turns: number; facts: number }) => {
      done = true;
      if (m.error) reject(new Error(m.error)); else resolve(m);
    });
    w.once('error', e => { if (!done) { done = true; reject(e); } });
    w.once('exit', code => { if (!done) { done = true; reject(new Error(`the snapshot stopped (${code})`)); } });
  });
}

export class Backup {
  private readonly dataDir: string;
  private readonly dbPath: string;
  private readonly backupPath: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.dbPath = path.join(dataDir, 'aang.db');
    this.backupPath = path.join(dataDir, BACKUP_REL);
  }

  private async git(args: string[]): Promise<string> {
    const r = await runOffThread('git', args, { cwd: this.dataDir, timeout: 120_000 });
    if (!r.ok) throw new Error(r.err.trim());
    return r.out;
  }

  /** When the last GOOD backup was committed, read from git history itself - so a restart never needs its own
   *  bookkeeping file that could drift from the truth. Null if there has never been one. */
  async lastBackupAt(): Promise<Date | null> {
    try {
      const out = (await this.git(['log', '-1', '--format=%cI', '--', BACKUP_REL])).trim();
      return out ? new Date(out) : null;
    } catch { return null; }
  }

  async stale(now = new Date()): Promise<boolean> {
    const last = await this.lastBackupAt();
    return !last || now.getTime() - last.getTime() > STALE_MS;
  }

  /** VACUUM INTO a fresh snapshot, verify it, commit and push. Only ever READS the live database - a failure
   *  here can lose a backup, never the real thing. */
  async run(): Promise<BackupResult> {
    if (!existsSync(this.dbPath)) return { ok: false, detail: 'no database yet' };
    const tmp = this.backupPath + '.tmp';
    try {
      await mkdir(path.dirname(this.backupPath), { recursive: true });
      try { await unlink(tmp); } catch { /* did not exist */ }

      const { integrity, turns, facts } = await snapshot(this.dbPath, tmp);
      if (integrity !== 'ok') { try { await unlink(tmp); } catch { /* */ } return { ok: false, detail: 'integrity check failed: ' + integrity }; }

      await rename(tmp, this.backupPath);
      const sizeMB = (await stat(this.backupPath)).size / 1024 / 1024;
      const detail = `${turns} turns, ${facts} facts, ${sizeMB.toFixed(2)}MB`;

      await this.git(['add', BACKUP_REL]);
      try {
        await this.git(['-c', 'user.name=Aang', '-c', 'user.email=aang@localhost', 'commit', '-m', `Backup: ${detail}`]);
      } catch { /* the database has not changed since the last backup - nothing to commit, not a failure */ }
      try { await this.git(['push']); }
      catch (e) { return { ok: true, detail: `committed but push failed: ${(e as Error).message}`, turns, facts, sizeMB }; }

      return { ok: true, detail, turns, facts, sizeMB };
    } catch (e) {
      try { await unlink(tmp); } catch { /* best effort cleanup */ }
      return { ok: false, detail: (e as Error).message };
    }
  }
}

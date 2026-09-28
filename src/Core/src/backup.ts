// Aang's memory leaves this machine every time he starts (2026-09-28): a verified snapshot of aang.db, pushed
// to the private data repo. Shadow can vanish without warning; the database cannot be allowed to live only there.
// One rolling file, not a pile of dated ones - git's own history is the backup history, so nothing accumulates
// and nothing needs pruning.
import { existsSync, mkdirSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export interface BackupResult { ok: boolean; detail: string; turns?: number; facts?: number; sizeMB?: number }

const BACKUP_REL = path.join('backups', 'aang.db');
/** A fact nobody has confirmed for this long is worth a loud word, not a silent retry. */
export const STALE_MS = 12 * 60 * 60 * 1000;

export class Backup {
  private readonly dataDir: string;
  private readonly dbPath: string;
  private readonly backupPath: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.dbPath = path.join(dataDir, 'aang.db');
    this.backupPath = path.join(dataDir, BACKUP_REL);
  }

  private git(args: string[]): string {
    return execFileSync('git', args, { cwd: this.dataDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  }

  /** When the last GOOD backup was committed, read from git history itself - so a restart never needs its own
   *  bookkeeping file that could drift from the truth. Null if there has never been one. */
  lastBackupAt(): Date | null {
    try {
      const out = this.git(['log', '-1', '--format=%cI', '--', BACKUP_REL]).trim();
      return out ? new Date(out) : null;
    } catch { return null; }
  }

  stale(now = new Date()): boolean {
    const last = this.lastBackupAt();
    return !last || now.getTime() - last.getTime() > STALE_MS;
  }

  /** VACUUM INTO a fresh snapshot, verify it, commit and push. Only ever READS the live database - a failure
   *  here can lose a backup, never the real thing. */
  run(): BackupResult {
    if (!existsSync(this.dbPath)) return { ok: false, detail: 'no database yet' };
    const tmp = this.backupPath + '.tmp';
    try {
      mkdirSync(path.dirname(this.backupPath), { recursive: true });
      try { unlinkSync(tmp); } catch { /* did not exist */ }

      const src = new DatabaseSync(this.dbPath, { readOnly: true });
      // VACUUM INTO wants a fresh path and takes no bound parameters - just double any embedded quote.
      src.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
      src.close();

      const chk = new DatabaseSync(tmp, { readOnly: true });
      const integrity = (chk.prepare('PRAGMA integrity_check').get() as { integrity_check: string }).integrity_check;
      if (integrity !== 'ok') { chk.close(); try { unlinkSync(tmp); } catch { /* */ } return { ok: false, detail: 'integrity check failed: ' + integrity }; }
      const turns = (chk.prepare('SELECT COUNT(*) n FROM turns').get() as { n: number }).n;
      const facts = (chk.prepare('SELECT COUNT(*) n FROM facts').get() as { n: number }).n;
      chk.close();

      renameSync(tmp, this.backupPath);
      const sizeMB = statSync(this.backupPath).size / 1024 / 1024;
      const detail = `${turns} turns, ${facts} facts, ${sizeMB.toFixed(2)}MB`;

      this.git(['add', BACKUP_REL]);
      try {
        this.git(['-c', 'user.name=Aang', '-c', 'user.email=aang@bocas.joshua', 'commit', '-m', `Backup: ${detail}`]);
      } catch { /* the database has not changed since the last backup - nothing to commit, not a failure */ }
      try { this.git(['push']); }
      catch (e) { return { ok: true, detail: `committed but push failed: ${(e as Error).message}`, turns, facts, sizeMB }; }

      return { ok: true, detail, turns, facts, sizeMB };
    } catch (e) {
      try { unlinkSync(tmp); } catch { /* best effort cleanup */ }
      return { ok: false, detail: (e as Error).message };
    }
  }
}

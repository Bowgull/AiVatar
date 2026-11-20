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
//
// 2026-11-20: one file per machine, and a push that fails is a failure. Found that day: the PC's plain `git push` was
// refused (not a fast-forward) from 2026-11-01 to 2026-11-20, only ever logged, and the run still said ok, so three
// weeks of memory never left the PC. And the PC and the Mac both wrote backups/aang.db, so whichever pushed last
// replaced the other's backup on GitHub. Now the PC writes backups/aang-pc.db and the Mac backups/aang-mac.db; each
// run fetches and rebases onto GitHub's copy first and commits only its own file; a push that still fails returns
// ok: false, and BackupWatch below turns that (or a backup that has not reached GitHub for STALE_MS) into words.
import { mkdir, rename, stat, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { runOffThread } from './offthread.ts';
import { Worker } from 'node:worker_threads';
import path from 'node:path';

export type Machine = 'pc' | 'mac';
export const machineOf = (platform: string = process.platform): Machine => platform === 'darwin' ? 'mac' : 'pc';
/** This machine's own backup, as git names it (forward slashes on both machines). */
export const backupRel = (m: Machine): string => `backups/aang-${m}.db`;
/**
 * The one shared file both machines wrote until 2026-11-20. Left in place and never written again: its history is
 * mixed (2026-11-01 to 11-19 is the Mac's database, the last commit, 3a67aab, the PC's), so it is not handed to
 * either machine's file. Its final state is the PC's, so only the PC restores from it (schema.ts), and only until
 * backups/aang-pc.db exists.
 */
export const LEGACY_REL = 'backups/aang.db';

export interface BackupResult {
  /** True only when the snapshot is on GitHub (pushed now, or already there and unchanged). */
  ok: boolean;
  /** A new commit was made here, whether or not it reached GitHub. */
  committed?: boolean;
  detail: string; turns?: number; facts?: number; sizeMB?: number;
}

/** A backup that has not reached GitHub for this long is worth a loud word, not a silent retry. */
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

/** The line of git's output that says what went wrong: "[rejected]", "fatal:" or "error:", never a "hint:". */
const why = (s: string): string => {
  const lines = s.split('\n').map(l => l.trim()).filter(l => l && !/^hint:/i.test(l));
  return (lines.find(l => /\[(remote )?rejected\]|^fatal:/i.test(l)) ?? lines.find(l => /^error:/i.test(l)) ?? lines[0] ?? s.trim()).slice(0, 200);
};

export class Backup {
  private readonly dataDir: string;
  private readonly dbPath: string;
  readonly rel: string;
  private readonly machine: Machine;
  private readonly backupPath: string;

  constructor(dataDir: string, opts: { machine?: Machine } = {}) {
    this.dataDir = dataDir;
    this.machine = opts.machine ?? machineOf();
    this.dbPath = path.join(dataDir, 'aang.db');
    this.rel = backupRel(this.machine);
    this.backupPath = path.join(dataDir, ...this.rel.split('/'));
  }

  private async git(args: string[]): Promise<string> {
    const r = await runOffThread('git', args, { cwd: this.dataDir, timeout: 120_000 });
    if (!r.ok) throw new Error(r.err.trim() || r.out.trim() || `git ${args[0]} failed`);
    return r.out;
  }
  private async gitOk(args: string[]): Promise<boolean> {
    try { await this.git(args); return true; } catch { return false; }
  }

  /** When this machine's backup last reached GitHub, read from the remote branch git knows of (as of the last
   *  fetch), so a restart needs no bookkeeping file that could drift from the truth. Null if never. */
  async lastPushedAt(): Promise<Date | null> {
    try {
      const out = (await this.git(['log', '-1', '--format=%cI', '@{upstream}', '--', this.rel])).trim();
      return out ? new Date(out) : null;
    } catch { return null; }
  }

  async stale(now = new Date()): Promise<boolean> {
    const last = await this.lastPushedAt();
    return !last || now.getTime() - last.getTime() > STALE_MS;
  }

  /**
   * Brings this clone level with GitHub before anything is committed: fetch, then rebase this machine's own commits
   * on top (a plain fast-forward when there are none). --autostash because the data folder often has his own
   * uncommitted edits (.gitignore, launch.json); they are put back exactly as they were. Throws in his words.
   */
  private async catchUp(): Promise<void> {
    try { await this.git(['fetch', '--quiet']); }
    catch (e) { throw new Error('could not reach GitHub: ' + why((e as Error).message)); }
    try { await this.git(['rebase', '--autostash', '--quiet', '@{upstream}']); }
    catch (e) {
      await this.gitOk(['rebase', '--abort']);
      throw new Error('could not line up with GitHub (rebase failed): ' + why((e as Error).message));
    }
  }

  /** VACUUM INTO a fresh snapshot, verify it, line up with GitHub, commit this machine's file only, and push. Only
   *  ever READS the live database - a failure here can lose a backup, never the real thing. */
  async run(): Promise<BackupResult> {
    if (!existsSync(this.dbPath)) return { ok: false, detail: 'no database yet' };
    const tmp = this.backupPath + '.tmp';
    let committed = false;
    try {
      await mkdir(path.dirname(this.backupPath), { recursive: true });
      try { await unlink(tmp); } catch { /* did not exist */ }

      const { integrity, turns, facts } = await snapshot(this.dbPath, tmp);
      if (integrity !== 'ok') { try { await unlink(tmp); } catch { /* */ } return { ok: false, detail: 'integrity check failed: ' + integrity }; }

      // A run that stopped after the rename leaves our file changed in the tree, and rebase will not start over that.
      // It is about to be replaced anyway.
      await this.gitOk(['checkout', '--quiet', 'HEAD', '--', this.rel]);
      await this.catchUp();

      await rename(tmp, this.backupPath);
      const sizeMB = (await stat(this.backupPath)).size / 1024 / 1024;
      const detail = `${turns} turns, ${facts} facts, ${sizeMB.toFixed(2)}MB`;

      await this.git(['add', '--', this.rel]);
      // `-- <file>`: only this machine's file goes in, whatever else he has staged in the data folder.
      committed = await this.gitOk(['-c', 'user.name=Aang', '-c', 'user.email=aang@localhost', 'commit', '--quiet', '-m', `Backup (${this.machine}): ${detail}`, '--', this.rel]);
      // No commit means the database has not changed since the last backup: not a failure. The push below still
      // runs, so an earlier commit that never left (the 2026-11 case) goes now.
      try { await this.push(); }
      catch (e) { return { ok: false, committed, detail: `saved here but NOT on GitHub: ${(e as Error).message}`, turns, facts, sizeMB }; }

      return { ok: true, committed, detail, turns, facts, sizeMB };
    } catch (e) {
      try { await unlink(tmp); } catch { /* best effort cleanup */ }
      return { ok: false, committed, detail: (e as Error).message };
    }
  }

  /** Push; if GitHub moved on in the meantime (the other machine pushed), line up once more and try again. */
  private async push(): Promise<void> {
    try { await this.git(['push', '--quiet']); return; }
    catch (first) {
      if (!/rejected|non-fast-forward|fetch first/i.test((first as Error).message)) throw new Error('the push failed: ' + why((first as Error).message));
    }
    await this.catchUp();
    try { await this.git(['push', '--quiet']); }
    catch (e) { throw new Error('the push was refused: ' + why((e as Error).message)); }
  }
}

/**
 * Keeps a failed backup from going quiet (2026-11-20). One spell of trouble is said ONCE in the bubble, and only once
 * the last good backup is more than STALE_MS old, so one bad night's network is retried quietly first. Until it is
 * fixed it stays on the morning brief and in what is waiting on him. `due` asks for another try every check while
 * anything is wrong, so a spell can never again last three weeks unseen.
 */
export class BackupWatch {
  private lastGood: number | null = null;
  private trouble: { since: number; detail: string; said: boolean } | null = null;

  /** What git says about the last push, read at start. Never moves the time backwards. */
  seen(at: Date | null): void {
    if (at && (this.lastGood === null || at.getTime() > this.lastGood)) this.lastGood = at.getTime();
  }

  /** A run's result. Returns the sentence to say now, or null. */
  after(r: BackupResult, now = Date.now()): string | null {
    if (r.ok) { this.lastGood = now; this.trouble = null; return null; }
    if (r.detail === 'no database yet') return null;
    this.trouble = { since: this.trouble?.since ?? now, detail: r.detail, said: this.trouble?.said ?? false };
    if (this.trouble.said || !this.stale(now)) return null;
    this.trouble.said = true;
    return this.sentence();
  }

  stale(now = Date.now()): boolean { return this.lastGood === null || now - this.lastGood > STALE_MS; }

  /** Worth another run now: something is wrong, or nothing has reached GitHub for STALE_MS. */
  due(now = Date.now()): boolean { return this.trouble !== null || this.stale(now); }

  /** The line for the morning brief, or null when all is well. */
  warning(now = Date.now()): string | null {
    if (this.trouble) return this.sentence();
    if (this.stale(now)) return this.lastGood === null
      ? 'His memory backup has never reached GitHub from this machine.'
      : `His memory backup has not reached GitHub since ${when(this.lastGood)}.`;
    return null;
  }

  /** The short entry for what is waiting on him (home card, brief card). */
  waiting(now = Date.now()): string | null {
    return this.trouble || this.stale(now) ? 'the memory backup is not reaching GitHub' : null;
  }

  private sentence(): string {
    const t = this.trouble!;
    const since = this.lastGood === null ? 'it has never reached GitHub from this machine' : `the last copy on GitHub is from ${when(this.lastGood)}`;
    return `His memory backup is failing: ${since}. The last try said: ${t.detail}`;
  }
}

const when = (ms: number) => new Date(ms).toLocaleString('en-CA', { timeZone: 'America/Toronto', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });

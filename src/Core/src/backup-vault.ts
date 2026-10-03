// Keeping Joshua's vault backed up, and noticing when it has not been.
//
// His vault moved off Google Drive and under git on 2026-10-02, because running Obsidian and git on a
// streaming cloud mount has documented, reproducible corruption modes. Git is only a backup if someone
// commits, so Aang watches the clock and offers.
//
// WHAT THIS DOES NOT DO: build a command from anything Joshua or a document said. Every argument below is
// a constant. Aang reads email, web pages and documents, all of which are assumed hostile, and the one
// thing that must never become reachable from that input is a shell. These are fixed verbs against a
// fixed path, and `execFile` without a shell, so there is no string for anything to be injected into.

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { VAULT_DIR } from './files.ts';

/** Joshua's answer, 2026-10-02: ask after three days. Long enough not to nag, short enough to lose little. */
export const BACKUP_AFTER_DAYS = 3;

function git(args: string[], cwd: string, timeoutMs = 120_000): Promise<{ ok: boolean; out: string }> {
  return new Promise(resolve => {
    execFile('git', args, { cwd, timeout: timeoutMs, windowsHide: true, maxBuffer: 4 << 20 }, (err, stdout, stderr) => {
      resolve({ ok: !err, out: String(stdout || stderr || '').trim() });
    });
  });
}

export interface BackupState {
  /** False when the vault is not a git repository at all, in which case there is nothing to offer. */
  repo: boolean;
  lastAt: Date | null;
  days: number;
  dirty: boolean;
  due: boolean;
}

/** When was the vault last committed, and is there anything new since? */
export async function vaultState(dir = VAULT_DIR): Promise<BackupState> {
  const none: BackupState = { repo: false, lastAt: null, days: 0, dirty: false, due: false };
  if (!existsSync(path.join(dir, '.git'))) return none;

  const last = await git(['log', '-1', '--format=%ct'], dir, 20_000);
  if (!last.ok) return none;
  const secs = Number(last.out);
  const lastAt = Number.isFinite(secs) && secs > 0 ? new Date(secs * 1000) : null;
  const days = lastAt ? (Date.now() - lastAt.getTime()) / 86_400_000 : Infinity;

  const status = await git(['status', '--porcelain'], dir, 30_000);
  const dirty = status.ok && status.out.length > 0;

  // Only worth asking when there is something to save. A vault nobody has touched for a week does not
  // need backing up; it needs leaving alone.
  return { repo: true, lastAt, days, dirty, due: dirty && days >= BACKUP_AFTER_DAYS };
}

export interface BackupResult { ok: boolean; detail: string }

/**
 * Commit and push the vault.
 *
 * Push failure is reported as a partial success rather than a failure, because the commit is the part that
 * protects him: the history exists locally even if GitHub is unreachable, and the next run pushes both.
 */
export async function backupVault(dir = VAULT_DIR): Promise<BackupResult> {
  if (!existsSync(path.join(dir, '.git'))) return { ok: false, detail: 'Your vault is not under version control, so there is nothing to push to.' };

  const status = await git(['status', '--porcelain'], dir, 30_000);
  if (status.ok && status.out.length === 0) return { ok: true, detail: 'Your vault was already up to date. Nothing had changed.' };
  const changed = status.out.split('\n').filter(Boolean).length;

  const add = await git(['add', '-A'], dir);
  if (!add.ok) return { ok: false, detail: `I could not stage your vault: ${add.out.slice(0, 200)}` };

  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const commit = await git(['commit', '-m', `Vault backup ${stamp}`], dir);
  if (!commit.ok && !/nothing to commit/i.test(commit.out)) {
    return { ok: false, detail: `I could not commit your vault: ${commit.out.slice(0, 200)}` };
  }

  const push = await git(['push'], dir, 300_000);
  if (!push.ok) {
    return { ok: true, detail: `Saved ${changed} ${changed === 1 ? 'change' : 'changes'} to your vault's history here, but could not reach GitHub. It will go up next time.` };
  }
  return { ok: true, detail: `Backed up your vault: ${changed} ${changed === 1 ? 'change' : 'changes'}, committed and pushed.` };
}

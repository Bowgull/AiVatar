// Aang's brain on the PC runs from its own installed release (2026-11-01, his "fix both gaps"), like Samara on the PC
// (src/Shell/src/pcupdate.ts) and the Mac's brain (brainupdate.ts): never from the code folder Claude works in, so
// nothing half-done reaches him. The same sealed samara-vX.Y.Z release carries it (aang-brain.tgz).
//
//   %LOCALAPPDATA%\Aang\Brain\versions\<x.y.z>   each brain, whole, its libraries in
//   brain.json   { version, status, previous, starts, said }   the one index.ts starts
//   next.txt     a version made ready: it goes in at the next start, or once he has been away half an hour (not in a call)
//   failed.txt   versions that died in their trial: never tried again
//
// The pet still starts src/Core/src/index.ts in the code folder (no pet rebuild): index.ts asks pick() here and runs
// that version's brain.ts. A trial that dies three times inside its first five minutes goes back to the one before (or
// the code folder); one that stays up five minutes is good. Versions are folders side by side, never renamed: Windows
// will not move a folder whose programs are running (the warm Claude sessions run from its node_modules).
// AANG_BRAIN_HERE=1 runs the code folder's brain (Claude's tests and live checks).
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import { readJson, saveJson, saveText } from './store.ts';
import { AWAY_S, LATEST_API, RELEASES, checkBrain, downloadPart, newer, type BrainRelease, type Fetch, type Run } from './brainupdate.ts';
import type { Scheduler } from './scheduler.ts';

export const TRIAL_MS = 5 * 60_000;
/** Starts inside the trial before it counts as dying: the fourth start means three deaths. */
const TRIAL_STARTS = 3;

export interface BrainVersion { version: string }
export interface BrainPointer extends BrainVersion { status: 'trial' | 'good'; previous: BrainVersion | null; starts: number[]; said: boolean }

export const brainRoot = (env: NodeJS.ProcessEnv = process.env): string | null => (env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, 'Aang', 'Brain') : null);
const isVersion = (v: unknown): v is string => typeof v === 'string' && /^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(v);
const dirOf = (root: string, v: string) => path.join(root, 'versions', v);
/** A brain that can run: one made after the start moved into brain.ts, with its libraries in. */
export const hasBrain = (root: string, v: string) => isVersion(v) && existsSync(path.join(dirOf(root, v), 'src', 'brain.ts')) && existsSync(path.join(dirOf(root, v), 'node_modules'));

export function pointer(root: string): BrainPointer | null {
  return readJson<BrainPointer | null>(path.join(root, 'brain.json'), null, (j: any) => isVersion(j?.version) && (j.status === 'trial' || j.status === 'good') ? {
    version: j.version, status: j.status, previous: isVersion(j.previous?.version) ? { version: j.previous.version } : null,
    starts: Array.isArray(j.starts) ? j.starts.filter((t: unknown) => typeof t === 'number') : [], said: j.said !== false,
  } : null);
}
function setPointer(root: string, p: BrainPointer | null): void {
  if (!p) { rmSync(path.join(root, 'brain.json'), { force: true }); return; }
  if (!saveJson(path.join(root, 'brain.json'), p)) throw new Error('could not write brain.json');
}
const list = (root: string, f: string) => { try { return readFileSync(path.join(root, f), 'utf8').split(/\s+/).filter(Boolean); } catch { return []; } };
export const failed = (root: string) => list(root, 'failed.txt');
const readyNext = (root: string) => list(root, 'next.txt')[0] ?? '';

/**
 * Which brain index.ts starts, and its bookkeeping: a ready one goes in as a trial; a trial started a fourth time inside
 * five minutes failed (back to the one before, or null: the code folder). Null when there is no installed brain.
 */
export function pick(root: string, now = Date.now()): { version: string; dir: string } | null {
  let p = pointer(root);
  const nx = readyNext(root);
  if (nx) {
    rmSync(path.join(root, 'next.txt'), { force: true });
    if (newer(nx, p?.version ?? '') && hasBrain(root, nx) && !failed(root).includes(nx)) {
      const keep = p && p.status === 'good' ? { version: p.version } : p?.previous ?? null;
      p = { version: nx, status: 'trial', previous: keep, starts: [], said: false };
      setPointer(root, p);
    }
  }
  if (!p) return null;
  if (p.status === 'trial') {
    const starts = [...p.starts.filter((t) => now - t < TRIAL_MS && t <= now), now];
    if (starts.length > TRIAL_STARTS) {
      saveText(path.join(root, 'failed.txt'), [...failed(root), p.version].join('\n') + '\n');
      console.error(`brain: ${p.version} kept dying in its first five minutes; going back`);
      p = p.previous && hasBrain(root, p.previous.version) ? { version: p.previous.version, status: 'good', previous: null, starts: [], said: true } : null;
      setPointer(root, p);
      if (!p) return null;
    } else { p = { ...p, starts }; setPointer(root, p); }
  }
  return hasBrain(root, p.version) ? { version: p.version, dir: dirOf(root, p.version) } : null;
}

/** Five minutes up: the trial is good, and every version but this one and the one before goes (best effort: a folder in use stays). */
export function markGood(root: string, version: string): boolean {
  const p = pointer(root);
  if (!p || p.version !== version || p.status !== 'trial') return false;
  setPointer(root, { ...p, status: 'good', starts: [] });
  const keep = new Set([p.version, p.previous?.version]);
  try { for (const v of readdirSync(path.join(root, 'versions'))) if (!keep.has(v)) rmSync(dirOf(root, v), { recursive: true, force: true }); } catch { /* best effort */ }
  return true;
}
/** The version to tell him about once ("I updated myself"), then never again. */
export function sayOnce(root: string, version: string): boolean {
  const p = pointer(root);
  if (!p || p.version !== version || p.said) return false;
  setPointer(root, { ...p, said: true });
  return true;
}

export interface PcBrainOptions {
  root: string;
  fetch: Fetch;
  /** Seconds since he was last at the desk, and whether Samara is in a call. */
  away: () => { idle: number; call: boolean };
  log: (s: string) => void;
  /** Exit for a planned restart (the pet starts index.ts again at once, which puts the new one in). */
  exit: () => void;
  /** The version running ('' from the code folder). */
  running: string;
  run?: Run;
  pub?: string;
  sched: Scheduler;
}

/** Hourly: a newer release's brain made ready beside the running one; in when he has been away half an hour. */
export class PcBrainUpdates {
  private busy = false;
  private skip = new Set<string>();
  private readonly o: PcBrainOptions;
  constructor(o: PcBrainOptions) { this.o = o; }

  get ready(): string { const v = readyNext(this.o.root); return hasBrain(this.o.root, v) ? v : ''; }

  async check(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const r0 = await this.o.fetch(LATEST_API, { signal: AbortSignal.timeout(20_000) });
      if (!r0.ok) return;
      const tag = String((JSON.parse(await r0.text()) as { tag_name?: unknown }).tag_name ?? '');
      if (!/^samara-v\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(tag)) return;
      const get = async (f: string) => { const r = await this.o.fetch(`${RELEASES}${tag}/${f}`, { signal: AbortSignal.timeout(20_000) }); return r.ok ? r.text() : null; };
      const [text, sig] = await Promise.all([get('manifest.json'), get('manifest.sig')]);
      const m = text && sig ? checkBrain(text, sig, this.o.pub) : null;
      if (!m || `samara-v${m.version}` !== tag) return;
      const have = [this.o.running, pointer(this.o.root)?.version ?? '', this.ready].reduce((a, b) => (newer(b, a) ? b : a), '');
      if (!newer(m.version, have) || failed(this.o.root).includes(m.version) || this.skip.has(m.version)) return;
      this.o.log(`brain update: ${m.version} is on GitHub; getting it ready`);
      if (await this.prepare(m, tag)) {
        saveText(path.join(this.o.root, 'next.txt'), m.version + '\n');
        this.o.log(`brain update: ${m.version} is ready; it goes in while you're away`);
      }
    } catch (e) { this.o.log('brain update: ' + (e as Error).message); }
    finally { this.busy = false; }
  }

  private async prepare(m: BrainRelease, tag: string): Promise<boolean> {
    const root = this.o.root, dest = dirOf(root, m.version), part = dest + '.part', tgz = path.join(root, `aang-brain-${m.version}.tgz`);
    if (hasBrain(root, m.version)) return true;
    mkdirSync(path.join(root, 'versions'), { recursive: true });
    if (!(await downloadPart(this.o.fetch, `${RELEASES}${tag}/${m.brain.file}`, m.brain, tgz))) { this.o.log(`brain update: ${m.version} did not download whole`); return false; }
    const run = this.o.run ?? runIt;
    try {
      rmSync(part, { recursive: true, force: true }); mkdirSync(part, { recursive: true });
      // Windows' own tar (bsdtar), so a drive letter is never read as a remote host.
      const tar = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
      if (await run(tar, ['-xzf', tgz, '-C', part], part) !== 0) throw new Error('unpacking failed');
      // Releases from before 1.33.2 start in index.ts: this PC cannot run them from here. Not tried again this run.
      if (!existsSync(path.join(part, 'src', 'brain.ts'))) { this.skip.add(m.version); throw new Error('a brain from before the PC ran its own release'); }
      const lock = (d: string) => { try { return createHash('sha256').update(readFileSync(path.join(d, 'package-lock.json'))).digest('hex'); } catch { return ''; } };
      const now = pointer(root)?.version ?? '';
      if (now && lock(dirOf(root, now)) === lock(part) && existsSync(path.join(dirOf(root, now), 'node_modules'))) cpSync(path.join(dirOf(root, now), 'node_modules'), path.join(part, 'node_modules'), { recursive: true });
      else if (await run(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'npm ci --omit=dev --ignore-scripts --no-audit --no-fund'], part) !== 0) throw new Error("installing the brain's libraries failed");
      rmSync(dest, { recursive: true, force: true });
      renameSync(part, dest);
      return true;
    } catch (e) { this.o.log(`brain update: getting ${m.version} ready failed: ${(e as Error).message}`); rmSync(part, { recursive: true, force: true }); return false; }
    finally { rmSync(tgz, { force: true }); }
  }

  /** Away half an hour and not in a call: restart into the ready one. True when it went. */
  swapIfQuiet(now = false): boolean {
    const v = this.ready, a = this.o.away();
    if (!v || a.call || (!now && a.idle < AWAY_S)) return false;
    this.o.log(`brain update: putting in ${v} ${now ? 'now (he asked)' : "while you're away"}; restarting`);
    this.o.exit();
    return true;
  }
  /** His "update Aang now" (as on the Mac): never in a call. */
  async updateNow(): Promise<{ ok: boolean; message: string }> {
    if (this.o.away().call) return { ok: false, message: "He's in a call: nothing goes in until it's over." };
    await this.check();
    const v = this.ready;
    if (!v) return { ok: true, message: `Nothing new: brain ${this.o.running || 'from the code folder'}.` };
    setTimeout(() => { this.swapIfQuiet(true); }, 500).unref?.();
    return { ok: true, message: `Putting in brain ${v} now (it restarts). The one before is kept and comes back if the new one doesn't stay up.` };
  }

  start(): void {
    this.o.sched.every('brain.check', 60 * 60_000, () => this.check(), { first: 30_000 });
    this.o.sched.every('brain.swap', 10 * 60_000, () => { this.swapIfQuiet(); });
  }
}

const runIt: Run = (cmd, args, cwd) => new Promise((res) => {
  const c = spawn(cmd, args, { cwd, stdio: 'ignore', windowsHide: true });
  c.on('error', () => res(-1)); c.on('exit', (code) => res(code ?? -1));
});

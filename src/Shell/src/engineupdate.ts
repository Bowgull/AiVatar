// 6.28, the update key (his decisions, 2026-10-13, sheet 18): nothing updates on its own. When a newer Electron of
// the same major is out, it is downloaded, checked against Electron's own SHA-256 list, unpacked beside the old one
// and tested on this PC, all quietly and never while he is in a game or a call. Only then does the key appear in the
// band. He clicks Restart now when it suits him; the pet starts the new engine as a TRIAL and goes back to the old
// one by itself if it dies in its first three minutes (src/Body/EnginePointer.cs). A major version is never
// prepared here: that needs the castLabs DRM engine and a look first.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, unlinkSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { writeFileAtomic } from './atomic.ts';

export interface Ready { version: string; since: number }
export interface UpdateOptions {
  shellDir: string; stateDir: string;
  /** In a game or a call right now: no downloads, no tests, no restarts. */
  quietNow: () => boolean;
  changed: (r: Ready | null) => void;
}
interface Pointer { version: string; dir: string; status: 'trial' | 'good'; previous: { version: string; dir: string } | null; at: string }

const VERSION = /^(\d+)\.(\d+)\.(\d+)$/;
/** a newer than b, plain releases only. */
export function newer(a: string, b: string): boolean {
  const x = VERSION.exec(a), y = VERSION.exec(b);
  if (!x || !y) return false;
  for (let i = 1; i <= 3; i++) { const d = Number(x[i]) - Number(y[i]); if (d) return d > 0; }
  return false;
}
/** The newest plain release of the same major as `current`, newer than it and not one that failed before. */
export function pick(versions: string[], current: string, failed: Set<string>): string | null {
  const major = VERSION.exec(current)?.[1];
  let best: string | null = null;
  for (const v of versions) {
    if (!VERSION.test(v) || VERSION.exec(v)![1] !== major || failed.has(v) || !newer(v, current)) continue;
    if (!best || newer(v, best)) best = v;
  }
  return best;
}
/** The hash Electron lists for a file in its SHASUMS256.txt, or null. */
export function shaFor(list: string, file: string): string | null {
  for (const line of list.split(/\r?\n/)) {
    const m = /^([0-9a-f]{64}) [ *]?(.+)$/i.exec(line.trim());
    if (m && m[2] === file) return m[1]!.toLowerCase();
  }
  return null;
}

const DAY = 24 * 60 * 60_000;

export class EngineUpdates {
  private readonly engines: string;
  private readonly stateFile: string;
  private readonly doneFile: string;
  private busy = false;
  private timers: NodeJS.Timeout[] = [];
  ready: Ready | null = null;
  private readonly o: UpdateOptions;

  constructor(o: UpdateOptions) {
    this.o = o;
    this.engines = path.join(o.shellDir, 'engines');
    this.stateFile = path.join(o.stateDir, 'engine-update.json');
    this.doneFile = path.join(o.stateDir, 'engine-just-updated.json');
    try {
      const s = JSON.parse(readFileSync(this.stateFile, 'utf8'));
      if (typeof s?.version === 'string' && newer(s.version, process.versions.electron) && existsSync(this.exeOf(s.version))) this.ready = { version: s.version, since: Number(s.since) || Date.now() };
    } catch { /* nothing waiting */ }
  }

  private exeOf(v: string): string { return path.join(this.engines, v, 'electron.exe'); }
  private failed(): Set<string> {
    try { return new Set(readFileSync(path.join(this.engines, 'failed.txt'), 'utf8').split(/\r?\n/).map((x) => x.trim()).filter(Boolean)); } catch { return new Set(); }
  }
  private pointer(): Pointer | null { try { return JSON.parse(readFileSync(path.join(this.engines, 'current.json'), 'utf8')); } catch { return null; } }

  /** Ten minutes after start, then once a day. */
  start(): void {
    this.trialCheck();
    this.timers.push(setTimeout(() => void this.check(), 10 * 60_000), setInterval(() => void this.check(), DAY));
  }
  stop(): void { this.timers.forEach(clearTimeout); this.timers = []; }

  /** Running on a trial engine for five minutes means it works: mark it good and tidy old engines away. */
  private trialCheck(): void {
    const p = this.pointer();
    if (!p || p.status !== 'trial') return;
    if (path.resolve(path.dirname(process.execPath)) !== path.resolve(this.engines, p.dir)) return;
    this.timers.push(setTimeout(() => {
      const q = this.pointer();
      if (!q || q.version !== p.version || q.status !== 'trial') return;
      try { writeFileAtomic(path.join(this.engines, 'current.json'), JSON.stringify({ ...q, status: 'good', at: new Date().toISOString() })); } catch { return; }
      console.log(`shell: engine ${p.version} passed its trial`);
      this.tidy(q);
    }, 5 * 60_000));
  }
  /** Keep only the engine in use and the one before it. */
  private tidy(p: Pointer): void {
    const keep = new Set([p.dir, p.previous?.dir].filter(Boolean));
    try {
      for (const d of readdirSync(this.engines)) {
        const full = path.join(this.engines, d);
        if (!keep.has(d) && VERSION.test(d) && statSync(full).isDirectory()) rmSync(full, { recursive: true, force: true });
      }
    } catch { /* next time */ }
  }

  /** Is there a newer engine? Get it ready, quietly. */
  async check(): Promise<void> {
    if (this.busy || this.o.quietNow()) return;
    this.busy = true;
    try {
      const cur = process.versions.electron;
      const r = await fetch('https://registry.npmjs.org/electron', { headers: { Accept: 'application/vnd.npm.install-v1+json' }, signal: AbortSignal.timeout(20_000) });
      if (!r.ok) throw new Error(`the npm registry said ${r.status}`);
      const v = pick(Object.keys(((await r.json()) as { versions?: Record<string, unknown> }).versions ?? {}), cur, this.failed());
      if (!v) { this.set(null); return; }
      if (this.ready?.version === v) return;
      console.log(`shell: engine ${v} is out (running ${cur}); getting it ready`);
      if (!existsSync(this.exeOf(v))) await this.fetchEngine(v);
      if (!(await this.test(v))) return;
      this.set({ version: v, since: Date.now() });
      console.log(`shell: engine ${v} is ready; the update key is showing`);
    } catch (e) {
      console.log('shell: engine update check: ' + (e as Error).message);
    } finally { this.busy = false; }
  }

  private set(r: Ready | null): void {
    this.ready = r;
    try { if (r) writeFileAtomic(this.stateFile, JSON.stringify(r)); else if (existsSync(this.stateFile)) unlinkSync(this.stateFile); } catch { /* best effort */ }
    this.o.changed(r);
  }

  /** Download, check the SHA-256 against Electron's own list, unpack beside the old engine. */
  private async fetchEngine(v: string): Promise<void> {
    mkdirSync(this.engines, { recursive: true });
    const file = `electron-v${v}-win32-x64.zip`;
    const base = `https://github.com/electron/electron/releases/download/v${v}/`;
    const sums = await fetch(base + 'SHASUMS256.txt', { signal: AbortSignal.timeout(30_000) });
    if (!sums.ok) throw new Error(`no fingerprint list for ${v} (${sums.status})`);
    const want = shaFor(await sums.text(), file);
    if (!want) throw new Error(`${file} is not in Electron's fingerprint list`);
    const zip = path.join(this.engines, file + '.partial');
    const got = await fetch(base + file, { signal: AbortSignal.timeout(15 * 60_000) });
    if (!got.ok || !got.body) throw new Error(`the download of ${v} failed (${got.status})`);
    const hash = createHash('sha256');
    const out = createWriteStream(zip);
    await pipeline(Readable.fromWeb(got.body as import('node:stream/web').ReadableStream), async function* (src) { for await (const c of src) { hash.update(c as Buffer); yield c; } }, out);
    const sha = hash.digest('hex');
    if (sha !== want) { rmSync(zip, { force: true }); throw new Error(`${file} did not match Electron's fingerprint; thrown away`); }
    const into = path.join(this.engines, v + '.partial');
    rmSync(into, { recursive: true, force: true });
    mkdirSync(into, { recursive: true });
    // Windows' own tar unpacks zip files.
    await new Promise<void>((res, rej) => {
      const t = spawn(path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe'), ['-xf', zip, '-C', into], { windowsHide: true });
      t.on('error', rej);
      t.on('exit', (c) => (c === 0 ? res() : rej(new Error(`unpacking ${v} failed (${c})`))));
    });
    rmSync(zip, { force: true });
    if (!existsSync(path.join(into, 'electron.exe'))) throw new Error(`${v} unpacked without electron.exe`);
    rmSync(path.join(this.engines, v), { recursive: true, force: true });
    renameSync(into, path.join(this.engines, v));
  }

  /**
   * The new engine runs Aang's own checks (test/electron/calls-check.ts: screen sharing, camera permission,
   * spellcheck, the share panel) in hidden windows, only when he is not in a game or a call.
   */
  private async test(v: string): Promise<boolean> {
    if (this.o.quietNow()) return false;
    const pics = await mkdtemp(path.join(os.tmpdir(), 'aang-engine-test-'));
    const code = await new Promise<number | null>((res) => {
      const t = spawn(this.exeOf(v), ['test/electron/calls-check.ts', pics], { cwd: this.o.shellDir, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      let tail = '';
      t.stdout?.on('data', (d) => { tail = (tail + String(d)).slice(-2000); });
      t.stderr?.on('data', () => { /* Chromium's own noise */ });
      const kill = setTimeout(() => { try { t.kill(); } catch { /* gone */ } }, 4 * 60_000);
      t.on('error', () => { clearTimeout(kill); res(null); });
      t.on('exit', (c) => { clearTimeout(kill); if (c !== 0) console.log(`shell: engine ${v} test said: ${tail.split('\n').filter((l) => /FAIL|HARNESS|passed/.test(l)).join(' | ').slice(0, 600)}`); res(c); });
    });
    try { rmSync(pics, { recursive: true, force: true }); } catch { /* temp */ }
    if (code === 0) return true;
    console.log(`shell: engine ${v} did not pass Aang's checks (exit ${code}); not offered, tried again tomorrow`);
    return false;
  }

  /**
   * His click on Restart now: point the pet at the new engine as a trial, note it for the "updated" line, and
   * quit. The pet starts the Shell again on the new engine within seconds.
   */
  restartNow(browserOpen: boolean): { ok: boolean; why?: string } {
    const r = this.ready;
    if (!r || !existsSync(this.exeOf(r.version))) return { ok: false, why: 'The update is not ready any more.' };
    if (this.o.quietNow()) return { ok: false, why: 'Not during a call or a game.' };
    const now = this.pointer();
    const running = path.dirname(process.execPath);
    const prevDir = now && path.resolve(this.engines, now.dir) === path.resolve(running) ? { version: now.version, dir: now.dir } : null;
    const p: Pointer = { version: r.version, dir: r.version, status: 'trial', previous: prevDir, at: new Date().toISOString() };
    writeFileAtomic(path.join(this.engines, 'current.json'), JSON.stringify(p));
    writeFileAtomic(this.doneFile, JSON.stringify({ from: process.versions.electron, to: r.version, browser: browserOpen }));
    try { unlinkSync(this.stateFile); } catch { /* fine */ }
    console.log(`shell: restarting onto engine ${r.version} (his click)`);
    return { ok: true };
  }

  /** After a restart: did it just update? Once only. */
  justUpdated(): { from: string; to: string; browser: boolean } | null {
    try {
      const j = JSON.parse(readFileSync(this.doneFile, 'utf8'));
      unlinkSync(this.doneFile);
      if (j?.to !== process.versions.electron) return null;   // rolled back: the old engine is running again
      return { from: String(j.from), to: String(j.to), browser: j.browser === true };
    } catch { return null; }
  }
}

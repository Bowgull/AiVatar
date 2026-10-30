// Samara's update engine on the PC (his picks, 2026-10-29: "same as the Mac"). Samara on Shadow runs from its own
// installed copy, one folder per release, never from the code folder Claude works in. A release from GitHub (sealed
// with his key, checked in ghrelease.ts) is unpacked beside the one running, its libraries put in, and then his UPDATE
// key lights up. Restart now points the pet at it as a TRIAL; the pet (src/Body/SamaraPointer.cs) goes back to the
// version before if the new one dies in its first three minutes, and this Samara marks itself good after five.
//
//   %LOCALAPPDATA%\Aang\Samara\current.json     the pointer the pet reads: { version, dir, status, previous, at }
//   %LOCALAPPDATA%\Aang\Samara\versions\<x.y.z>  each release, whole
//   failed.txt / filed.txt                       versions not to offer again / put away until he checks
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { readJson, saveJson, saveText } from './store.ts';
import { LATEST_API, RELEASES, RELEASE_KEY, download, isVersion, latest, newer, withSection, type Manifest } from './ghrelease.ts';

export interface SamaraVersion { version: string; dir: string }
export interface Pointer extends SamaraVersion { status: 'trial' | 'good'; previous: SamaraVersion | null; at: string }
export interface SamaraReady { version: string; name: string; commit: string; notes: string[]; since: number }
type Fetch = Parameters<typeof latest>[0];

export const samaraRoot = (env: NodeJS.ProcessEnv = process.env): string | null => (env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, 'Aang', 'Samara') : null);

export interface SamaraUpdatesOpts {
  root: string; codeDir: string; fetch: Fetch; changed: () => void;
  /** Runs a program and says how it ended (tests swap this). */
  run?: (cmd: string, args: string[], cwd: string) => Promise<number>;
  /** His release key's public half (tests use their own). */
  pub?: string;
  /** "Every version" on this PC (Samara Changelog.md), given this version's section once it is ready. */
  changelog?: string;
}
export class SamaraUpdates {
  ready: SamaraReady | null = null;
  private busy = false;
  private at = 0;
  private o: SamaraUpdatesOpts;
  constructor(o: SamaraUpdatesOpts) { this.o = o; }

  private file(n: string) { return path.join(this.o.root, n); }
  pointer(): Pointer | null {
    return readJson<Pointer | null>(this.file('current.json'), null, (r) => {
      const p = r as Pointer;
      return isVersion(p.version) && p.dir === `versions/${p.version}` && (p.status === 'trial' || p.status === 'good') ? p : null;
    });
  }
  private writePointer(p: Pointer | null): void {
    const f = this.file('current.json');
    if (!p) { rmSync(f, { force: true }); return; }
    if (!saveJson(f, p)) throw new Error('could not write ' + f);   // the caller must not think it is pointed at
  }
  private list(n: string): string[] { try { return readFileSync(this.file(n), 'utf8').split(/\s+/).filter(Boolean); } catch { return []; } }
  private add(n: string, v: string): void { if (!saveText(this.file(n), [...this.list(n), v].join('\n') + '\n')) throw new Error('could not write ' + this.file(n)); }
  /** The version running now: its folder's, or none (the code folder, before the first release). */
  running(): string { return path.resolve(this.o.codeDir).toLowerCase().startsWith(path.resolve(this.o.root, 'versions').toLowerCase()) ? path.basename(path.resolve(this.o.codeDir)) : ''; }

  /** On start, hourly, on the nudge, and when he checks. */
  async check(why: string): Promise<void> {
    if (this.busy || Date.now() - this.at < 60_000) return;
    this.busy = true; this.at = Date.now();
    try {
      const m = await latest(this.o.fetch, RELEASES, this.o.pub ?? RELEASE_KEY, LATEST_API);
      const have = this.pointer()?.version ?? this.running();
      // The version he is on is in "Every version" too.
      if (m && m.version === have && this.o.changelog) this.addToChangelog(m);
      if (!m || !newer(m.version, have) || this.list('failed.txt').includes(m.version) || this.list('filed.txt').includes(m.version)) return;
      if (this.ready?.version === m.version) return;
      console.log(`shell: Samara ${m.version} is on GitHub (${why}); getting it ready`);
      if (await this.prepare(m)) {
        this.ready = { version: m.version, name: m.name, commit: m.commit, notes: m.notes, since: Date.parse(m.at) || Date.now() };
        this.addToChangelog(m);
        this.o.changed();
      }
    } catch (e) { console.error('shell: Samara update check: ' + (e as Error).message); }
    finally { this.busy = false; }
  }

  private addToChangelog(m: Manifest): void {
    if (!this.o.changelog) return;
    try { let had = ''; try { had = readFileSync(this.o.changelog, 'utf8'); } catch { /* first */ } const now = withSection(had, m); if (now !== had) writeFileSync(this.o.changelog, now); } catch { /* best effort */ }
  }
  /** The release unpacked whole into its own folder, its libraries in, before anything points at it. */
  async prepare(m: Manifest): Promise<boolean> {
    const versions = this.file('versions'), dest = path.join(versions, m.version), part = dest + '.part', bundle = this.file(`samara-${m.version}.tgz`);
    if (existsSync(path.join(dest, 'src', 'main.ts'))) return true;
    mkdirSync(versions, { recursive: true });
    if (!(await download(this.o.fetch, m, bundle))) { console.error(`shell: Samara ${m.version} did not download whole`); return false; }
    const run = this.o.run ?? runIt;
    try {
      rmSync(part, { recursive: true, force: true }); mkdirSync(part, { recursive: true });
      // Windows' own tar (bsdtar), so a drive letter is never read as a remote host.
      const tar = process.platform === 'win32' ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
      if (await run(tar, ['-xzf', bundle, '-C', part], part) !== 0) throw new Error('unpacking failed');
      if (!existsSync(path.join(part, 'src', 'main.ts'))) throw new Error('not a Samara release');
      // Its libraries: the same as the version running when the lock file is the same (copied), else installed.
      const lock = (d: string) => { try { return createHash('sha256').update(readFileSync(path.join(d, 'package-lock.json'))).digest('hex'); } catch { return ''; } };
      const now = this.pointer();
      const from = now ? this.file(now.dir) : '';
      if (from && lock(from) === lock(part) && existsSync(path.join(from, 'node_modules'))) cpSync(path.join(from, 'node_modules'), path.join(part, 'node_modules'), { recursive: true });
      else {
        const cmd = process.platform === 'win32' ? (process.env.ComSpec ?? 'cmd.exe') : 'npm';
        const args = ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'];
        if (await run(cmd, process.platform === 'win32' ? ['/d', '/s', '/c', 'npm ' + args.join(' ')] : args, part) !== 0) throw new Error("installing the browser's libraries failed");
      }
      rmSync(dest, { recursive: true, force: true });
      renameSync(part, dest);
      rmSync(bundle, { force: true });
      return true;
    } catch (e) {
      console.error(`shell: getting Samara ${m.version} ready failed: ${(e as Error).message}`);
      rmSync(part, { recursive: true, force: true });
      return false;
    }
  }

  /** Restart now: the pet starts the new one next, as a trial. True when it is pointed at. */
  go(): boolean {
    const r = this.ready;
    if (!r || !existsSync(this.file(`versions/${r.version}/src/main.ts`))) return false;
    const now = this.pointer();
    this.writePointer({ version: r.version, dir: `versions/${r.version}`, status: 'trial', previous: now ? { version: now.version, dir: now.dir } : null, at: new Date().toISOString() });
    this.ready = null;
    return true;
  }
  /** Five minutes up on a trial: it is good, and versions older than the one before go (two are always kept). */
  markGood(): void {
    const p = this.pointer();
    if (!p || p.status !== 'trial' || this.running() !== p.version) return;
    this.writePointer({ ...p, status: 'good' });
    console.log(`shell: Samara ${p.version} is good`);
  }
  canBack(): boolean { const p = this.pointer(); return Boolean(p && existsSync(path.join(this.o.root, 'versions'))) && (p!.previous ? existsSync(this.file(`${p!.previous.dir}/src/main.ts`)) : true); }
  /** Go back: the version before (or the code folder, before the first release); the one he left is put away. */
  goBack(): boolean {
    const p = this.pointer();
    if (!p) return false;
    this.add('filed.txt', p.version);
    this.writePointer(p.previous && existsSync(this.file(`${p.previous.dir}/src/main.ts`)) ? { ...p.previous, status: 'good', previous: null, at: new Date().toISOString() } : null);
    return true;
  }
  put(): void { if (this.ready) { this.add('filed.txt', this.ready.version); this.ready = null; this.o.changed(); } }
  skip(): void { if (this.ready) { this.add('failed.txt', this.ready.version); this.ready = null; this.o.changed(); } }
  checkNow(): void { rmSync(this.file('filed.txt'), { force: true }); this.at = 0; void this.check('his check'); }
}

function runIt(cmd: string, args: string[], cwd: string): Promise<number> {
  return new Promise((res) => {
    const c = spawn(cmd, args, { cwd, stdio: 'ignore', windowsHide: true });
    c.on('error', () => res(-1));
    c.on('exit', (code) => res(code ?? -1));
  });
}

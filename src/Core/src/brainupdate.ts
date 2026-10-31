// Aang's brain updates from GitHub (his picks, 2026-10-30): the same sealed release as Samara (one version number for
// both: a samara-vX.Y.Z release carries Samara's bundle and the brain's), by itself and quietly, never on his UPDATE
// key. This replaces the PC pushing the brain to the Mac (core.ts macOfferNow, macsetup.ts): the Mac is Aang's home.
//
//   ready  the release's brain is downloaded, checked against his seal, unpacked beside the running one (core.next),
//          its libraries copied (same lock file) or installed
//   swap   only when he has been away half an hour and is not in a call (updateengine.ts quietNow, the same rule):
//          core -> core.prev, core.next -> core, and this brain exits; launchd starts the new one at once
//   trial  the new brain marks itself good after two minutes up. A watchdog started at the swap puts core.prev back
//          and restarts it if the new one never gets there, and that version is not tried again
//
// Aang's Mac app (the pet and bubble, AangListener/aang-app, LaunchAgent com.aang.pet) comes along (2026-10-31: on the
// night of Oct 30 Samara and the brain had moved on and his app was left behind, and not even running). The same
// release carries it (aang-app.tgz); it is made ready the same way (its libraries and two small Mac helpers carried over
// from the copy here, or made here when they change), goes in at the same quiet moment, and the watchdog starts it,
// and puts the old one back if the new one does not stay up. After any update his app is running, even if it was not.
//
// Mac only (the brain's home, run by the LaunchAgent com.aang.brain from AangListener/core). The PC's brain still runs
// from the code folder (a PC check owed). Its own file so it is tested without the brain.
import { spawn } from 'node:child_process';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { createWriteStream, existsSync, openSync, readFileSync, renameSync, rmSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';
import { readJson, saveJson } from './store.ts';
import { Scheduler } from './scheduler.ts';
import path from 'node:path';

/** His release key's public half (src/Shell/release-key.pub; a test keeps the two the same). */
export const RELEASE_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAVMZz/VO98/9eX9+eUALUiaxNyxiXuNL/KPWaOdMZQ2E=
-----END PUBLIC KEY-----
`;
/** Releases live in their own public repo, sealed files only (his pick, 2026-10-31), so the code repo can go private. */
export const RELEASE_REPO = 'Bowgull/samara-releases';
export const RELEASES = `https://github.com/${RELEASE_REPO}/releases/download/`;
export const LATEST_API = `https://api.github.com/repos/${RELEASE_REPO}/releases/latest`;
export const BRAIN_MAX = 100 * 1024 * 1024;
export const APP_MAX = 100 * 1024 * 1024;
/** Away this long, and not in a call (the update engine's quiet rule, src/Shell/src/updateengine.ts quietNow). */
export const AWAY_S = 30 * 60;

export interface Part { file: string; sha256: string; bytes: number }
/** brain: Aang's brain. aang: Aang's Mac app, from 1.28.1 on (left out of older releases). */
export interface BrainRelease { version: string; commit: string; name: string; brain: Part; aang?: Part }
export interface BrainInstalled { version: string; commit: string; status: 'trial' | 'good'; said?: boolean }

const isVersion = (v: unknown): v is string => typeof v === 'string' && /^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(v);
export function newer(a: string, b: string): boolean {
  if (!isVersion(a)) return false;
  if (!isVersion(b)) return true;
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i]! > y[i]!;
  return false;
}

/** The release's brain, only when his seal is on exactly the manifest's text and it carries a brain. */
export function checkBrain(text: string, sigB64: string, pub = RELEASE_KEY): BrainRelease | null {
  if (typeof text !== 'string' || text.length > 64_000 || typeof sigB64 !== 'string') return null;
  let ok = false;
  try { ok = verify(null, Buffer.from(text), createPublicKey(pub), Buffer.from(sigB64.trim(), 'base64')); } catch { ok = false; }
  if (!ok) return null;
  let m: { v?: unknown; app?: unknown; version?: unknown; commit?: unknown; name?: unknown; brain?: { file?: unknown; sha256?: unknown; bytes?: unknown }; aang?: { file?: unknown; sha256?: unknown; bytes?: unknown } };
  try { m = JSON.parse(text); } catch { return null; }
  const b = m.brain;
  if (m.v !== 1 || m.app !== 'samara' || !isVersion(m.version) || !/^[0-9a-f]{40}$/.test(String(m.commit))) return null;
  if (!b || b.file !== 'aang-brain.tgz' || !/^[0-9a-f]{64}$/.test(String(b.sha256)) || !Number.isInteger(b.bytes) || (b.bytes as number) <= 0 || (b.bytes as number) > BRAIN_MAX) return null;
  const a = m.aang, aang = a && a.file === 'aang-app.tgz' && /^[0-9a-f]{64}$/.test(String(a.sha256)) && Number.isInteger(a.bytes) && (a.bytes as number) > 0 && (a.bytes as number) <= APP_MAX
    ? { aang: { file: 'aang-app.tgz', sha256: String(a.sha256), bytes: a.bytes as number } } : {};
  return { version: m.version, commit: String(m.commit), name: typeof m.name === 'string' ? m.name.slice(0, 40) : '', brain: { file: 'aang-brain.tgz', sha256: String(b.sha256), bytes: b.bytes as number }, ...aang };
}

type Fetch = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; text(): Promise<string>; body?: ReadableStream<Uint8Array> | null }>;
export type Run = (cmd: string, args: string[], cwd: string, env?: NodeJS.ProcessEnv) => Promise<number>;
const runIt: Run = (cmd, args, cwd, env) => new Promise((res) => {
  const c = spawn(cmd, args, { cwd, stdio: 'ignore', ...(env ? { env } : {}) });
  c.on('error', () => res(-1)); c.on('exit', (code) => res(code ?? -1));
});

/** Whether the libraries in `modules` are the ones `appDir`'s lock file asks for (each of its package's own). */
export function librariesMatch(modules: string, appDir: string): boolean {
  try {
    const pkg = JSON.parse(readFileSync(path.join(appDir, 'package.json'), 'utf8')) as { dependencies?: Record<string, string> };
    const lock = JSON.parse(readFileSync(path.join(appDir, 'package-lock.json'), 'utf8')) as { packages?: Record<string, { version?: string }> };
    return Object.keys(pkg.dependencies ?? {}).every((n) => {
      const want = lock.packages?.[`node_modules/${n}`]?.version;
      return !!want && want === (JSON.parse(readFileSync(path.join(modules, n, 'package.json'), 'utf8')) as { version?: string }).version;
    });
  } catch { return false; }
}

/** Aang's app's two small Mac helpers: built on the Mac from mac/*.swift (never shipped built). */
export const HELPERS: [bin: string, swift: string][] = [['aang-clicks', 'clicks.swift'], ['aang-look', 'look.swift']];

/**
 * The watchdog the swap leaves behind. brain: the new brain's version ('' when only the app changed); app: the new
 * app's ('' when only the brain changed). The new brain must be good within a few minutes, or the old one comes back.
 * Aang's app is running afterwards either way: a new one started at once, and put back if it does not stay up.
 */
export function watchdogScript(home: string, brain: string, app = ''): string {
  if ((brain && !isVersion(brain)) || (app && !isVersion(app)) || (!brain && !app)) throw new Error('not a version');
  const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
  const what = [brain && `brain ${brain}`, app && `app ${app}`].filter(Boolean).join(' and ');
  return `#!/bin/bash
# Aang's ${what}: written by the brain itself (src/Core/src/brainupdate.ts). Puts the old one back if the new one
# does not run, and leaves Aang's app running.
H=${q(home)}; U="gui/$(id -u)"; BRAIN=${q(brain)}; APP=${q(app)}
pet_pid() { launchctl print "$U/com.aang.pet" 2>/dev/null | awk '$1 == "pid" && $2 == "=" { print $3; exit }'; }
start_pet() {
  [ -d "$H/aang-app" ] || return 0
  launchctl kickstart -k "$U/com.aang.pet" >/dev/null 2>&1 || launchctl bootstrap "$U" "$HOME/Library/LaunchAgents/com.aang.pet.plist" >/dev/null 2>&1 || true
}
# A new app starts at once (the old one still runs from the folder it was moved to); after any update, his app is
# running even if it was not (2026-10-30: the brain moved on and his app stayed off).
if [ -n "$APP" ] || [ -z "$(pet_pid)" ]; then start_pet; fi
if [ -n "$BRAIN" ]; then
  good=0
  for t in 60 90 150; do
    sleep $t
    grep -q '"status":"good"' "$H/core/brain.json" 2>/dev/null && { good=1; break; }
  done
  if [ "$good" = 0 ] && [ -d "$H/core.prev" ]; then
    echo "Aang's brain $BRAIN did not start; putting the old one back."
    rm -rf "$H/core.failed"; mv "$H/core" "$H/core.failed"; mv "$H/core.prev" "$H/core"
    echo "$BRAIN" >> "$H/brain-failed.txt"
    launchctl kickstart -k "$U/com.aang.brain" >/dev/null 2>&1 || true
  fi
fi
if [ -n "$APP" ]; then
  # Up, and the same run a minute later (launchd starts a falling-over app again, each time a new one).
  sleep 30; p1="$(pet_pid)"; sleep 60; p2="$(pet_pid)"
  if [ -z "$p2" ] || [ "$p1" != "$p2" ]; then
    if [ -d "$H/aang-app.prev" ]; then
      echo "Aang's app $APP did not stay up; putting the old one back."
      rm -rf "$H/aang-app.failed"; mv "$H/aang-app" "$H/aang-app.failed"; mv "$H/aang-app.prev" "$H/aang-app"
      echo "$APP" >> "$H/aang-app-failed.txt"
    fi
    start_pet
  fi
elif [ -z "$(pet_pid)" ]; then start_pet
fi
`;
}

export interface BrainUpdateOptions {
  /** AangListener: the brain runs from <home>/core. */
  home: string;
  fetch: Fetch;
  /** Seconds since his last key or mouse, and whether he is in a call (the Mac's presence helper). */
  away: () => { idle: number; call: boolean } | null;
  log: (s: string) => void;
  /** Exit so launchd starts the new brain. */
  exit: () => void;
  run?: Run;
  pub?: string;
  /** Starts the watchdog (tests swap this). */
  watchdog?: (script: string) => void;
  /** The brain's scheduler (core.sched); left out, one of its own. */
  sched?: Scheduler;
}

export class BrainUpdates {
  private next: BrainRelease | null = null;
  private nextApp: BrainRelease | null = null;
  private busy = false;
  private timers: NodeJS.Timeout[] = [];
  private readonly o: BrainUpdateOptions;
  constructor(o: BrainUpdateOptions) { this.o = o; }

  private get core(): string { return path.join(this.o.home, 'core'); }
  private get nextDir(): string { return path.join(this.o.home, 'core.next'); }
  private get file(): string { return path.join(this.core, 'brain.json'); }
  installed(): BrainInstalled | null {
    return readJson<BrainInstalled | null>(this.file, null, (j: any) => isVersion(j?.version) ? { version: j.version, commit: String(j.commit ?? ''), status: j.status === 'trial' ? 'trial' : 'good', said: j.said === true } : null);
  }
  private failed(f = 'brain-failed.txt'): string[] { try { return readFileSync(path.join(this.o.home, f), 'utf8').split(/\s+/).filter(Boolean); } catch { return []; } }
  /** What waits (made ready, not yet in). */
  get ready(): string { return this.next?.version ?? ''; }
  get readyApp(): string { return this.nextApp?.version ?? ''; }

  private get app(): string { return path.join(this.o.home, 'aang-app'); }
  private get appNext(): string { return path.join(this.o.home, 'aang-app.next'); }
  /** Aang's app here: its release (app.json; '' for one put in by hand), or null when it is not on this Mac. */
  appInstalled(): string | null {
    if (!existsSync(path.join(this.app, 'src', 'macaang.ts'))) return null;
    return readJson<string>(path.join(this.app, 'app.json'), '', (j: any) => isVersion(j?.version) ? j.version : '');
  }

  /** On start: a trial that runs two minutes is good. Returns the version to tell him about once (then never again). */
  started(): string {
    const i = this.installed();
    if (!i) return '';
    if (i.status === 'trial') this.timers.push(setTimeout(() => { const j = this.installed(); if (j?.status === 'trial' && saveJson(this.file, { ...j, status: 'good' })) this.o.log(`brain update: ${j.version} is good`); }, 120_000));   // not saved: next start
    if (i.said === false) { saveJson(this.file, { ...i, said: true }); return i.version; }
    return '';
  }

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
      const have = this.installed()?.version ?? '';
      if (newer(m.version, have) && !this.failed().includes(m.version) && this.next?.version !== m.version) {
        this.o.log(`brain update: ${m.version} is on GitHub; getting it ready`);
        if (await this.prepare(m, tag)) { this.next = m; this.o.log(`brain update: ${m.version} is ready; it goes in while you're away`); }
      }
      // Aang's app, when it is on this Mac and the release carries it.
      const app = this.appInstalled();
      if (m.aang && app !== null && newer(m.version, app) && !this.failed('aang-app-failed.txt').includes(m.version) && this.nextApp?.version !== m.version) {
        this.o.log(`brain update: Aang's app ${m.version} is on GitHub; getting it ready`);
        if (await this.prepareApp(m, tag)) { this.nextApp = m; this.o.log(`brain update: Aang's app ${m.version} is ready; it goes in while you're away`); }
      }
    } catch (e) { this.o.log('brain update: ' + (e as Error).message); }
    finally { this.busy = false; }
  }

  private async prepare(m: BrainRelease, tag: string): Promise<boolean> {
    const tgz = path.join(this.o.home, `aang-brain-${m.version}.tgz`), part = this.nextDir + '.part';
    if (!(await this.download(`${RELEASES}${tag}/${m.brain.file}`, m.brain, tgz))) { this.o.log(`brain update: ${m.version} did not download whole`); return false; }
    const run = this.o.run ?? runIt;
    try {
      rmSync(part, { recursive: true, force: true }); mkdirSync(part, { recursive: true });
      if (await run('tar', ['-xzf', tgz, '-C', part], part) !== 0) throw new Error('unpacking failed');
      if (!existsSync(path.join(part, 'src', 'index.ts'))) throw new Error('not a brain');
      const lock = (d: string) => { try { return createHash('sha256').update(readFileSync(path.join(d, 'package-lock.json'))).digest('hex'); } catch { return ''; } };
      if (lock(this.core) && lock(this.core) === lock(part) && existsSync(path.join(this.core, 'node_modules'))) cpSync(path.join(this.core, 'node_modules'), path.join(part, 'node_modules'), { recursive: true });
      else {
        const npm = path.join(this.o.home, 'node', 'bin', 'npm');
        if (await run(existsSync(npm) ? npm : 'npm', ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', '--cache', path.join(this.o.home, 'npm-cache')], part) !== 0) throw new Error("installing the brain's libraries failed");
      }
      // The Mac's presence helper is built on this Mac, never shipped: the one here comes along.
      if (existsSync(path.join(this.core, 'bin'))) cpSync(path.join(this.core, 'bin'), path.join(part, 'bin'), { recursive: true });
      if (!saveJson(path.join(part, 'brain.json'), { version: m.version, commit: m.commit.slice(0, 12), status: 'trial', said: false })) throw new Error('could not write brain.json');
      rmSync(this.nextDir, { recursive: true, force: true }); renameSync(part, this.nextDir);
      rmSync(tgz, { force: true });
      return true;
    } catch (e) { this.o.log(`brain update: getting ${m.version} ready failed: ${(e as Error).message}`); rmSync(part, { recursive: true, force: true }); return false; }
  }

  /** Aang's app made ready beside the running one (aang-app.next): its code and art from the release, its libraries
   *  carried over (a copy-on-write clone, no disk) while they are the ones its lock asks for, else installed; its Mac
   *  helpers carried over while their code is the same, else built here. */
  private async prepareApp(m: BrainRelease, tag: string): Promise<boolean> {
    const a = m.aang!, tgz = path.join(this.o.home, `aang-app-${m.version}.tgz`), part = this.appNext + '.part';
    if (!(await this.download(`${RELEASES}${tag}/${a.file}`, a, tgz))) { this.o.log(`brain update: Aang's app ${m.version} did not download whole`); return false; }
    const run = this.o.run ?? runIt;
    try {
      rmSync(part, { recursive: true, force: true }); mkdirSync(part, { recursive: true });
      if (await run('tar', ['-xzf', tgz, '-C', part], part) !== 0) throw new Error('unpacking failed');
      if (!existsSync(path.join(part, 'src', 'macaang.ts'))) throw new Error("not Aang's app");
      // His art where the app looks for it (AANG_ASSETS_DIR = <app>/assets, as tools/install-mac-aang.sh lays it out).
      for (const k of ['frames', 'sfx']) if (existsSync(path.join(part, 'assets', 'aang', k))) renameSync(path.join(part, 'assets', 'aang', k), path.join(part, 'assets', k));
      rmSync(path.join(part, 'assets', 'aang'), { recursive: true, force: true });
      const modules = path.join(this.app, 'node_modules');
      if (librariesMatch(modules, part)) {
        if (await run('/bin/cp', ['-cR', modules, path.join(part, 'node_modules')], part) !== 0) throw new Error("copying Aang's app's libraries failed");
      } else {
        // Its engine (Electron) is fetched by its own install step, so this one runs its scripts.
        const npm = path.join(this.o.home, 'node', 'bin', 'npm'), env = { ...process.env, PATH: `${path.dirname(npm)}:${process.env.PATH ?? '/usr/bin:/bin'}` };
        this.o.log(`brain update: Aang's app ${m.version} needs new libraries; installing them`);
        if (await run(existsSync(npm) ? npm : 'npm', ['ci', '--omit=dev', '--no-audit', '--no-fund', '--cache', path.join(this.o.home, 'npm-cache')], part, env) !== 0) throw new Error("installing Aang's app's libraries failed");
      }
      mkdirSync(path.join(part, 'bin'), { recursive: true });
      for (const [bin, swift] of HELPERS) {
        const old = path.join(this.app, 'bin', bin), to = path.join(part, 'bin', bin);
        const same = (() => { try { return readFileSync(path.join(this.app, 'mac', swift)).equals(readFileSync(path.join(part, 'mac', swift))); } catch { return false; } })();
        if (same && existsSync(old)) { cpSync(old, to); continue; }
        if (await run('/usr/bin/swiftc', ['-O', '-o', to, path.join(part, 'mac', swift)], part) === 0) continue;
        this.o.log(`brain update: could not build ${bin} for Aang's app ${m.version}; the old one comes along`);
        if (existsSync(old)) cpSync(old, to);
      }
      if (!saveJson(path.join(part, 'app.json'), { version: m.version, commit: m.commit.slice(0, 12) })) throw new Error('could not write app.json');
      rmSync(this.appNext, { recursive: true, force: true }); renameSync(part, this.appNext);
      rmSync(tgz, { force: true });
      return true;
    } catch (e) { this.o.log(`brain update: getting Aang's app ${m.version} ready failed: ${(e as Error).message}`); rmSync(part, { recursive: true, force: true }); rmSync(tgz, { force: true }); return false; }
  }

  private async download(url: string, m: Part, dest: string): Promise<boolean> {
    const part = dest + '.part';
    try {
      const r = await this.o.fetch(url, { signal: AbortSignal.timeout(10 * 60_000) });
      if (!r.ok || !r.body) return false;
      const hash = createHash('sha256'), out = createWriteStream(part);
      let n = 0;
      const reader = r.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        n += value.length;
        if (n > m.bytes) { await reader.cancel(); throw new Error('too big'); }
        hash.update(value);
        if (!out.write(value)) await new Promise<void>((res) => out.once('drain', () => res()));
      }
      await new Promise<void>((res, rej) => out.end((e?: Error | null) => (e ? rej(e) : res())));
      if (n !== m.bytes || hash.digest('hex') !== m.sha256) throw new Error('fingerprint');
      renameSync(part, dest);
      return true;
    } catch { rmSync(part, { force: true }); return false; }
  }

  /** Away half an hour and not in a call: whatever is ready goes in, Aang's app and the new brain. True when anything
   *  did (with a new brain, this brain then exits and launchd starts the new one). */
  swapIfQuiet(): boolean {
    const n = this.next, na = this.nextApp, a = this.o.away();
    if ((!n && !na) || !a || a.idle < AWAY_S || a.call) return false;
    const home = this.o.home;
    let app = '';
    if (na && existsSync(path.join(this.appNext, 'src', 'macaang.ts'))) {
      try {
        rmSync(path.join(home, 'aang-app.prev'), { recursive: true, force: true });
        renameSync(this.app, path.join(home, 'aang-app.prev'));
        renameSync(this.appNext, this.app);
        app = na.version;
      } catch (e) {
        this.o.log("brain update: could not swap Aang's app: " + (e as Error).message);
        if (!existsSync(this.app) && existsSync(path.join(home, 'aang-app.prev'))) renameSync(path.join(home, 'aang-app.prev'), this.app);
      }
    }
    this.nextApp = null;
    let brain = '';
    if (n && existsSync(path.join(this.nextDir, 'src', 'index.ts'))) {
      try {
        rmSync(path.join(home, 'core.prev'), { recursive: true, force: true });
        renameSync(this.core, path.join(home, 'core.prev'));
        renameSync(this.nextDir, this.core);
        brain = n.version;
      } catch (e) {
        this.o.log('brain update: could not swap: ' + (e as Error).message);
        if (!existsSync(this.core) && existsSync(path.join(home, 'core.prev'))) renameSync(path.join(home, 'core.prev'), this.core);
      }
    }
    if (!brain && !app) return false;
    const script = watchdogScript(home, brain, app);
    (this.o.watchdog ?? ((s: string) => {
      const f = path.join(home, 'brain-watchdog.sh'), out = openSync(path.join(home, 'brain-watchdog.log'), 'a'); writeFileSync(f, s, { mode: 0o700 });
      spawn('/bin/bash', [f], { detached: true, stdio: ['ignore', out, out] }).unref();
    }))(script);
    if (app) this.o.log(`brain update: putting in Aang's app ${app} while you're away`);
    if (!brain) return true;
    this.o.log(`brain update: putting in ${brain} while you're away; restarting`);
    this.next = null;
    this.o.exit();
    return true;
  }

  /** Half a minute after start, then hourly; the quiet rule looked at every ten minutes. */
  /** On the scheduler (2026-10-30); the swap keeps its own away-and-no-call rule. */
  start(): void {
    const s = this.sched;
    s.every('brain.check', 60 * 60_000, () => this.check(), { first: 30_000 });
    s.every('brain.swap', 10 * 60_000, () => { this.swapIfQuiet(); });
  }
  stop(): void { this.timers.forEach(clearTimeout); this.timers = []; this.sched.cancel('brain.check'); this.sched.cancel('brain.swap'); }
  private schedOwn: Scheduler | null = null;
  private get sched(): Scheduler { return this.o.sched ?? (this.schedOwn ??= new Scheduler()); }
}

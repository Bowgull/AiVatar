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
// Mac only (the brain's home, run by the LaunchAgent com.aang.brain from AangListener/core). The PC's brain still runs
// from the code folder (a PC check owed). Its own file so it is tested without the brain.
import { spawn } from 'node:child_process';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { createWriteStream, existsSync, readFileSync, renameSync, rmSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';
import path from 'node:path';

/** His release key's public half (src/Shell/release-key.pub; a test keeps the two the same). */
export const RELEASE_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAVMZz/VO98/9eX9+eUALUiaxNyxiXuNL/KPWaOdMZQ2E=
-----END PUBLIC KEY-----
`;
export const RELEASES = 'https://github.com/Bowgull/AiVatar/releases/download/';
export const LATEST_API = 'https://api.github.com/repos/Bowgull/AiVatar/releases/latest';
export const BRAIN_MAX = 100 * 1024 * 1024;
/** Away this long, and not in a call (the update engine's quiet rule, src/Shell/src/updateengine.ts quietNow). */
export const AWAY_S = 30 * 60;

export interface BrainRelease { version: string; commit: string; name: string; brain: { file: string; sha256: string; bytes: number } }
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
  let m: { v?: unknown; app?: unknown; version?: unknown; commit?: unknown; name?: unknown; brain?: { file?: unknown; sha256?: unknown; bytes?: unknown } };
  try { m = JSON.parse(text); } catch { return null; }
  const b = m.brain;
  if (m.v !== 1 || m.app !== 'samara' || !isVersion(m.version) || !/^[0-9a-f]{40}$/.test(String(m.commit))) return null;
  if (!b || b.file !== 'aang-brain.tgz' || !/^[0-9a-f]{64}$/.test(String(b.sha256)) || !Number.isInteger(b.bytes) || (b.bytes as number) <= 0 || (b.bytes as number) > BRAIN_MAX) return null;
  return { version: m.version, commit: String(m.commit), name: typeof m.name === 'string' ? m.name.slice(0, 40) : '', brain: { file: 'aang-brain.tgz', sha256: String(b.sha256), bytes: b.bytes as number } };
}

type Fetch = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; text(): Promise<string>; body?: ReadableStream<Uint8Array> | null }>;
export type Run = (cmd: string, args: string[], cwd: string) => Promise<number>;
const runIt: Run = (cmd, args, cwd) => new Promise((res) => {
  const c = spawn(cmd, args, { cwd, stdio: 'ignore' });
  c.on('error', () => res(-1)); c.on('exit', (code) => res(code ?? -1));
});

/** The watchdog the swap leaves behind: if the new brain is not good within a few minutes, the old one comes back. */
export function watchdogScript(home: string, version: string): string {
  if (!isVersion(version)) throw new Error('not a version');
  const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
  return `#!/bin/bash
# Aang's brain ${version}: written by the brain itself (src/Core/src/brainupdate.ts). Puts the old brain back if the
# new one does not run two minutes.
H=${q(home)}
for t in 60 90 150; do
  sleep $t
  grep -q '"status":"good"' "$H/core/brain.json" 2>/dev/null && exit 0
done
if [ -d "$H/core.prev" ]; then
  echo "Aang's brain ${version} did not start; putting the old one back."
  rm -rf "$H/core.failed"; mv "$H/core" "$H/core.failed"; mv "$H/core.prev" "$H/core"
  echo ${q(version)} >> "$H/brain-failed.txt"
  launchctl kickstart -k "gui/$(id -u)/com.aang.brain" >/dev/null 2>&1 || true
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
}

export class BrainUpdates {
  private next: BrainRelease | null = null;
  private busy = false;
  private timers: NodeJS.Timeout[] = [];
  private readonly o: BrainUpdateOptions;
  constructor(o: BrainUpdateOptions) { this.o = o; }

  private get core(): string { return path.join(this.o.home, 'core'); }
  private get nextDir(): string { return path.join(this.o.home, 'core.next'); }
  private get file(): string { return path.join(this.core, 'brain.json'); }
  installed(): BrainInstalled | null {
    try { const j = JSON.parse(readFileSync(this.file, 'utf8')); return isVersion(j.version) ? { version: j.version, commit: String(j.commit ?? ''), status: j.status === 'trial' ? 'trial' : 'good', said: j.said === true } : null; } catch { return null; }
  }
  private failed(): string[] { try { return readFileSync(path.join(this.o.home, 'brain-failed.txt'), 'utf8').split(/\s+/).filter(Boolean); } catch { return []; } }
  /** What waits (made ready, not yet in). */
  get ready(): string { return this.next?.version ?? ''; }

  /** On start: a trial that runs two minutes is good. Returns the version to tell him about once (then never again). */
  started(): string {
    const i = this.installed();
    if (!i) return '';
    if (i.status === 'trial') this.timers.push(setTimeout(() => { const j = this.installed(); if (j?.status === 'trial') { try { writeFileSync(this.file, JSON.stringify({ ...j, status: 'good' })); this.o.log(`brain update: ${j.version} is good`); } catch { /* next start */ } } }, 120_000));
    if (i.said === false) { try { writeFileSync(this.file, JSON.stringify({ ...i, said: true })); } catch { /* best effort */ } return i.version; }
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
      if (!newer(m.version, have) || this.failed().includes(m.version) || this.next?.version === m.version) return;
      this.o.log(`brain update: ${m.version} is on GitHub; getting it ready`);
      if (await this.prepare(m, tag)) { this.next = m; this.o.log(`brain update: ${m.version} is ready; it goes in while you're away`); }
    } catch (e) { this.o.log('brain update: ' + (e as Error).message); }
    finally { this.busy = false; }
  }

  private async prepare(m: BrainRelease, tag: string): Promise<boolean> {
    const tgz = path.join(this.o.home, `aang-brain-${m.version}.tgz`), part = this.nextDir + '.part';
    if (!(await this.download(`${RELEASES}${tag}/${m.brain.file}`, m, tgz))) { this.o.log(`brain update: ${m.version} did not download whole`); return false; }
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
      writeFileSync(path.join(part, 'brain.json'), JSON.stringify({ version: m.version, commit: m.commit.slice(0, 12), status: 'trial', said: false }));
      rmSync(this.nextDir, { recursive: true, force: true }); renameSync(part, this.nextDir);
      rmSync(tgz, { force: true });
      return true;
    } catch (e) { this.o.log(`brain update: getting ${m.version} ready failed: ${(e as Error).message}`); rmSync(part, { recursive: true, force: true }); return false; }
  }

  private async download(url: string, m: BrainRelease, dest: string): Promise<boolean> {
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
        if (n > m.brain.bytes) { await reader.cancel(); throw new Error('too big'); }
        hash.update(value);
        if (!out.write(value)) await new Promise<void>((res) => out.once('drain', () => res()));
      }
      await new Promise<void>((res, rej) => out.end((e?: Error | null) => (e ? rej(e) : res())));
      if (n !== m.brain.bytes || hash.digest('hex') !== m.brain.sha256) throw new Error('fingerprint');
      renameSync(part, dest);
      return true;
    } catch { rmSync(part, { force: true }); return false; }
  }

  /** Away half an hour and not in a call: the new brain goes in. True when it did (this brain then exits). */
  swapIfQuiet(): boolean {
    const n = this.next, a = this.o.away();
    if (!n || !a || a.idle < AWAY_S || a.call || !existsSync(path.join(this.nextDir, 'src', 'index.ts'))) return false;
    try {
      rmSync(path.join(this.o.home, 'core.prev'), { recursive: true, force: true });
      renameSync(this.core, path.join(this.o.home, 'core.prev'));
      renameSync(this.nextDir, this.core);
    } catch (e) {
      this.o.log('brain update: could not swap: ' + (e as Error).message);
      if (!existsSync(this.core) && existsSync(path.join(this.o.home, 'core.prev'))) renameSync(path.join(this.o.home, 'core.prev'), this.core);
      return false;
    }
    const script = watchdogScript(this.o.home, n.version);
    (this.o.watchdog ?? ((s: string) => {
      const f = path.join(this.o.home, 'brain-watchdog.sh'); writeFileSync(f, s, { mode: 0o700 });
      spawn('/bin/bash', [f], { detached: true, stdio: 'ignore' }).unref();
    }))(script);
    this.o.log(`brain update: putting in ${n.version} while you're away; restarting`);
    this.next = null;
    this.o.exit();
    return true;
  }

  /** Half a minute after start, then hourly; the quiet rule looked at every ten minutes. */
  start(): void {
    this.timers.push(setTimeout(() => void this.check(), 30_000), setInterval(() => void this.check(), 60 * 60_000), setInterval(() => this.swapIfQuiet(), 10 * 60_000));
    for (const t of this.timers) t.unref?.();
  }
  stop(): void { this.timers.forEach(clearTimeout); this.timers = []; }
}

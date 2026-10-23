// 6.28, the update key (his decisions, 2026-10-13, sheet 18): nothing updates on its own. When a newer Electron of
// the same major is out, it is downloaded, checked against Electron's own SHA-256 list, unpacked beside the old one
// and tested on this PC, all quietly and never while he is in a game or a call. Only then does the key appear in the
// band. He clicks Restart now when it suits him; the pet starts the new engine as a TRIAL and goes back to the old
// one by itself if it dies in its first three minutes (src/Body/EnginePointer.cs). A major version is never
// prepared here: that needs the castLabs DRM engine and a look first.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { writeFileAtomic } from './atomic.ts';
import { FUSE, readFuses, samaraFuses, setFuses, wireMap } from './fusewire.ts';

/** His tick boxes on an engine update (2026-10-14): the login lock, and closing the back doors. On by default. */
export interface Choices { lock: boolean; closeBackdoors: boolean }
/** `fixed`: castLabs would only sign this engine as it came, so his tick boxes are not offered (2026-10-23). */
export interface Ready { version: string; since: number; castlabs?: boolean; choices?: Choices; major?: boolean; fixed?: boolean }
/** What came of a video signing: signed, refused because of the switches, or failed for another reason. */
type Signed = 'ok' | 'denied' | 'failed';
/** "44.5.1+wvcus" -> "44.5.1". */
export const plain = (v: string): string => String(v ?? '').replace(/\+.*$/, '');
export interface UpdateOptions {
  shellDir: string; stateDir: string;
  /** In a game or a call right now: no downloads, no tests, no restarts. */
  quietNow: () => boolean;
  changed: (r: Ready | null) => void;
  /** A castLabs engine could not be re-signed for video; true when castLabs' tool needs him to sign in again. */
  signinNeeded?: (signIn: boolean) => void;
}
/** Running on castLabs' engine (Widevine, VMP-signed): only it has the components API (checked 2026-10-13: stock 44.7.0 has none). */
export const onCastlabs = (): boolean => { try { return Boolean(createRequire(import.meta.url)('electron').components); } catch { return false; } };

interface Pointer { version: string; dir: string; status: 'trial' | 'good'; previous: { version: string; dir: string } | null; at: string }

const VERSION = /^(\d+)\.(\d+)\.(\d+)$/;
/** a newer than b, plain releases only. */
export function newer(a: string, b: string): boolean {
  const x = VERSION.exec(plain(a)), y = VERSION.exec(plain(b));
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

/** The newest stable castLabs release newer than `current`, not one that failed before. */
export function newestCastlabs(releases: { tag: string; prerelease: boolean }[], current: string, failed: Set<string>): string | null {
  let best: string | null = null;
  for (const r of releases) {
    const m = /^v(\d+\.\d+\.\d+)\+wvcus$/.exec(r.tag);
    if (!m || r.prerelease || failed.has(m[1]!) || !newer(m[1]!, current)) continue;
    if (!best || newer(m[1]!, best)) best = m[1]!;
  }
  return best;
}

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

  /** castLabs engines live in castlabs-<version>, plain Electron ones in <version>. */
  private dirOf(v: string): string { return existsSync(path.join(this.engines, 'castlabs-' + plain(v))) ? 'castlabs-' + plain(v) : plain(v); }
  private exeOf(v: string): string { return path.join(this.engines, this.dirOf(v), 'electron.exe'); }
  private failed(): Set<string> {
    try { return new Set(readFileSync(path.join(this.engines, 'failed.txt'), 'utf8').split(/\r?\n/).map((x) => x.trim()).filter(Boolean)); } catch { return new Set(); }
  }
  private pointer(): Pointer | null { try { return JSON.parse(readFileSync(path.join(this.engines, 'current.json'), 'utf8')); } catch { return null; } }

  // ---- his ... menu on the update (sheet 35): put a version away, skip it for good, go back, check now
  private filedFile(): string { return path.join(this.o.stateDir, 'engine-filed.json'); }
  private filed(): Set<string> { try { return new Set(JSON.parse(readFileSync(this.filedFile(), 'utf8'))); } catch { return new Set(); } }
  /** Put away: kept on file, not offered until he checks for updates himself. */
  file(): void { const r = this.ready; if (!r) return; const f = this.filed(); f.add(plain(r.version)); try { writeFileAtomic(this.filedFile(), JSON.stringify([...f])); } catch { /* best effort */ } this.set(null); }
  /** Skip for good: never offered again (the same list a version that failed its checks goes on). */
  skip(): void {
    const r = this.ready; if (!r) return;
    try { mkdirSync(this.engines, { recursive: true }); writeFileSync(path.join(this.engines, 'failed.txt'), [...this.failed(), plain(r.version)].join('\n') + '\n'); } catch { /* best effort */ }
    this.set(null);
  }
  /** Is there an engine to go back to (the one before this, still kept)? */
  canBack(): boolean {
    const p = this.pointer();
    return !!p?.previous && existsSync(path.join(this.engines, p.previous.dir, 'electron.exe')) && path.resolve(path.dirname(process.execPath)) === path.resolve(this.engines, p.dir);
  }
  /** Go back to the engine before this one; the pet starts it when the Shell quits. */
  goBack(): boolean {
    const p = this.pointer();
    if (!p?.previous || !this.canBack()) return false;
    writeFileAtomic(path.join(this.engines, 'current.json'), JSON.stringify({ version: p.previous.version, dir: p.previous.dir, status: 'good', previous: null, at: new Date().toISOString() }));
    const f = this.filed(); f.add(plain(p.version)); try { writeFileAtomic(this.filedFile(), JSON.stringify([...f])); } catch { /* best effort */ }
    console.log(`shell: going back from engine ${p.version} to ${p.previous.version} (his click)`);
    return true;
  }
  /** Check for updates now (Samara's ... menu): what was put away comes back, and a look right now. */
  async checkNow(): Promise<void> { try { unlinkSync(this.filedFile()); } catch { /* none */ } await this.check(); }

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
        if (!keep.has(d) && (VERSION.test(d) || /^castlabs-\d+\.\d+\.\d+$/.test(d)) && statSync(full).isDirectory()) rmSync(full, { recursive: true, force: true });
      }
    } catch { /* next time */ }
  }

  /** Is there a newer engine? Get it ready, quietly. */
  async check(): Promise<void> {
    if (this.busy || this.o.quietNow()) return;
    // One engine (his yes, 2026-10-13): the browser runs on castLabs' engine so paid video plays in its tabs. A stock
    // Electron update would take Widevine away, so none is offered; castLabs' own come in their own step.
    if (onCastlabs()) { await this.castlabsCheck(); return; }
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

  /**
   * The castLabs engine (his calls, 2026-10-14): taken the day castLabs ships it (security fixes do not wait), made
   * ready quietly: downloaded, checked against the fingerprint GitHub publishes for it, its switches set (his tick
   * boxes, on by default: the login lock and closed back doors), re-signed for paid video with his castLabs account
   * (its sign-in is kept by castLabs' own tool), and run through Aang's checks. Only then does UPDATE light up.
   */
  private async castlabsCheck(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const cur = plain(process.versions.electron);
      const r = await fetch('https://api.github.com/repos/castlabs/electron-releases/releases?per_page=30', { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Samara engine update' }, signal: AbortSignal.timeout(20_000) });
      if (!r.ok) throw new Error(`GitHub said ${r.status}`);
      const list = (await r.json()) as { tag_name: string; prerelease: boolean; draft: boolean; assets: { name: string; digest?: string; browser_download_url: string }[] }[];
      const v = newestCastlabs(list.map((x) => ({ tag: x.tag_name, prerelease: x.prerelease || x.draft })), cur, this.failed());
      if (!v || this.filed().has(v)) { if (this.ready) this.set(null); return; }
      if (this.ready?.version === v) return;
      const asset = list.find((x) => x.tag_name === `v${v}+wvcus`)?.assets.find((a) => a.name === `electron-v${v}+wvcus-win32-x64.zip`);
      const sha = /^sha256:([0-9a-f]{64})$/.exec(asset?.digest ?? '')?.[1];
      if (!asset || !sha) throw new Error(`castLabs ${v} has no Windows download with a published fingerprint`);
      console.log(`shell: castLabs engine ${v} is out (running ${cur}); getting it ready`);
      if (!existsSync(path.join(this.engines, 'castlabs-' + v, 'electron.exe'))) await this.fetchZip(asset.browser_download_url, sha, 'castlabs-' + v);
      let choices: Choices = { lock: true, closeBackdoors: true };
      let fixed = false;
      let signed = await this.switchesAndSign(v, choices);
      // castLabs signs only an engine exactly as they released it (proved on the Mac, 2026-10-23: switches flipped ->
      // "Binary signature denied"; untouched -> signed). Then it goes as it came, paid video kept, switches off. Never
      // when the logins here are already locked: an engine without the lock cannot read them, and they would be lost.
      if (signed === 'denied') {
        if (EngineUpdates.runningFuses()[FUSE.EnableCookieEncryption] === '1') {
          console.log(`shell: castLabs ${v} would only be signed without the login lock, and the logins here are locked; not offered`);
          return;
        }
        choices = { lock: false, closeBackdoors: false }; fixed = true;
        signed = await this.switchesAndSign(v, choices);
      }
      if (signed !== 'ok') return;
      if (!(await this.test(v))) return;
      this.set({ version: v, since: Date.now(), castlabs: true, choices, major: v.split('.')[0] !== cur.split('.')[0], ...(fixed ? { fixed } : {}) });
      console.log(`shell: castLabs engine ${v} is ready; the update key is showing`);
    } catch (e) {
      console.log('shell: engine update check: ' + (e as Error).message);
    } finally { this.busy = false; }
  }
  /** Set the engine's switches to his choices and re-sign it for paid video (the switches live in electron.exe, which
   *  the video signature covers). False: it could not be signed; the reason is logged and he is told. */
  async switchesAndSign(v: string, c: Choices, dir = path.join(this.engines, 'castlabs-' + plain(v))): Promise<Signed> {
    // The switches as castLabs shipped them, kept the first time, so an engine can always be put back exactly as it came.
    const exe = path.join(dir, 'electron.exe'), stockFile = path.join(dir, 'stock-fuses.txt');
    if (!existsSync(stockFile)) writeFileSync(stockFile, readFuses(exe));
    const stock = !c.lock && !c.closeBackdoors;
    console.log(`shell: engine ${v} switches: ${setFuses(exe, stock ? wireMap(readFileSync(stockFile, 'utf8').trim()) : samaraFuses(c))}${stock ? ' (as castLabs shipped it)' : ''}`);
    const sig = path.join(dir, 'electron.exe.sig');
    const before = existsSync(sig) ? statSync(sig).mtimeMs : 0;
    const out = await new Promise<{ code: number | null; text: string }>((res) => {
      const t = spawn('python', ['-m', 'castlabs_evs.vmp', 'sign-pkg', dir], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      let text = '';
      t.stdout?.on('data', (d) => { text = (text + String(d)).slice(-3000); });
      t.stderr?.on('data', (d) => { text = (text + String(d)).slice(-3000); });
      const kill = setTimeout(() => { try { t.kill(); } catch { /* gone */ } }, 5 * 60_000);
      t.on('error', (e) => { clearTimeout(kill); res({ code: null, text: e.message }); });
      t.on('exit', (code) => { clearTimeout(kill); res({ code, text }); });
    });
    if (out.code === 0 && existsSync(sig) && statSync(sig).mtimeMs > before) return 'ok';
    console.log(`shell: engine ${v} could not be re-signed for video (exit ${out.code}): ${out.text.split(/\r?\n/).filter(Boolean).slice(-4).join(' | ').slice(0, 600)}`);
    if (/signature denied/i.test(out.text)) return 'denied';
    this.o.signinNeeded?.(/auth|login|token|credential|expired|unauthori/i.test(out.text));
    return 'failed';
  }
  /** What the switches are on the engine running now ("0100..."), or '' (for the one-time login re-lock). */
  static runningFuses(): string { try { return readFuses(process.execPath); } catch { return ''; } }

  private set(r: Ready | null): void {
    this.ready = r;
    try { if (r) writeFileAtomic(this.stateFile, JSON.stringify(r)); else if (existsSync(this.stateFile)) unlinkSync(this.stateFile); } catch { /* best effort */ }
    this.o.changed(r);
  }

  /** Download a zip, check it against the fingerprint given, unpack it into engines/<dirName>. */
  private async fetchZip(url: string, want: string, dirName: string): Promise<void> {
    mkdirSync(this.engines, { recursive: true });
    const zip = path.join(this.engines, dirName + '.zip.partial');
    const got = await fetch(url, { signal: AbortSignal.timeout(20 * 60_000) });
    if (!got.ok || !got.body) throw new Error(`the download of ${dirName} failed (${got.status})`);
    const hash = createHash('sha256');
    await pipeline(Readable.fromWeb(got.body as import('node:stream/web').ReadableStream), async function* (src) { for await (const c of src) { hash.update(c as Buffer); yield c; } }, createWriteStream(zip));
    if (hash.digest('hex') !== want) { rmSync(zip, { force: true }); throw new Error(`${dirName} did not match its fingerprint; thrown away`); }
    const into = path.join(this.engines, dirName + '.partial');
    rmSync(into, { recursive: true, force: true }); mkdirSync(into, { recursive: true });
    await new Promise<void>((res, rej) => {
      const t = spawn(path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe'), ['-xf', zip, '-C', into], { windowsHide: true });
      t.on('error', rej); t.on('exit', (c) => (c === 0 ? res() : rej(new Error(`unpacking ${dirName} failed (${c})`))));
    });
    rmSync(zip, { force: true });
    if (!existsSync(path.join(into, 'electron.exe'))) throw new Error(`${dirName} unpacked without electron.exe`);
    rmSync(path.join(this.engines, dirName), { recursive: true, force: true });
    renameSync(into, path.join(this.engines, dirName));
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
  async restartNow(browserOpen: boolean, choices?: Partial<Choices>, overnight?: { title: string; lines: string[] }): Promise<{ ok: boolean; why?: string }> {
    const r = this.ready;
    if (!r || !existsSync(this.exeOf(r.version))) return { ok: false, why: 'The update is not ready any more.' };
    if (this.o.quietNow()) return { ok: false, why: 'Not during a call or a game.' };
    // He changed a tick box: the switches are set again his way and the engine re-signed (about a minute).
    if (r.castlabs && r.choices && choices && !r.fixed) {
      const want: Choices = { lock: choices.lock !== false, closeBackdoors: choices.closeBackdoors !== false };
      if (want.lock !== r.choices.lock || want.closeBackdoors !== r.choices.closeBackdoors) {
        if ((await this.switchesAndSign(r.version, want)) !== 'ok') return { ok: false, why: 'Your choices could not be put in just now. Try again in a minute.' };
        this.set({ ...r, choices: want });
      }
    }
    const now = this.pointer();
    const running = path.dirname(process.execPath);
    const prevDir = now && path.resolve(this.engines, now.dir) === path.resolve(running) ? { version: now.version, dir: now.dir } : null;
    const p: Pointer = { version: r.version, dir: this.dirOf(r.version), status: 'trial', previous: prevDir, at: new Date().toISOString() };
    writeFileAtomic(path.join(this.engines, 'current.json'), JSON.stringify(p));
    writeFileAtomic(this.doneFile, JSON.stringify({ from: process.versions.electron, to: r.version, browser: browserOpen, ...(overnight ? { overnight: true, title: overnight.title, lines: overnight.lines } : {}) }));
    try { unlinkSync(this.stateFile); } catch { /* fine */ }
    console.log(`shell: restarting onto engine ${r.version} (his click)`);
    return { ok: true };
  }

  /** After a restart: did it just update? Once only. */
  justUpdated(): { from: string; to: string; browser: boolean; overnight?: boolean; title?: string; lines?: string[] } | null {
    try {
      const j = JSON.parse(readFileSync(this.doneFile, 'utf8'));
      unlinkSync(this.doneFile);
      if (plain(j?.to) !== plain(process.versions.electron)) return null;   // rolled back: the old engine is running again
      return { from: String(j.from), to: String(j.to), browser: j.browser === true, overnight: j.overnight === true, ...(typeof j.title === 'string' ? { title: j.title } : {}), ...(Array.isArray(j.lines) ? { lines: j.lines.map(String) } : {}) };
    } catch { return null; }
  }
}

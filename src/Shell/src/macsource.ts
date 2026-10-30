// The update engine's Mac half (2026-10-30): moved out of macmain.ts, where it was ~250 lines inline. Two sources
// feed one staged Samara.app: Samara's own code from GitHub (a sealed release, ghrelease.ts) and a new castLabs engine
// (a sealed engine release, enginerelease.ts, signed for video here by castLabs' tool, evs.ts). Whatever is ready is
// built into ONE new Samara beside the running one, in the background at low priority (macupdate.ts), so his UPDATE key
// has one Restart now. The swap keeps the old insides in rollback/ and puts them back if the new one does not start.
//
//   AangListener/browser/installed.json          what runs: { version, commit, status: trial|good, engine? }
//   AangListener/browser/staged/                  the new Samara, made ready
//   AangListener/browser/engines/castlabs-<v>/    a new engine, unpacked and signed for video
//   failed-updates.txt / filed-updates.txt        Samara versions not to offer again / put away
//   failed-engines.txt / filed-engines.txt        the same for engines
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { download as ghDownload, latest as ghLatest, titleOf, withSection, type Manifest } from './ghrelease.ts';
import { behindMs, behindWords, chromeStable, downloadEngine, enginePlatform, latestEngine, type EngineManifest } from './enginerelease.ts';
import { Evs } from './evs.ts';
import { engineGroups } from './pcsource.ts';
import { macUpdateScript } from './macupdate.ts';
import { VersionLists, isVersion, newer, plain, type Offer, type Source } from './updateengine.ts';

type Fetch = Parameters<typeof ghLatest>[0];
export interface Installed { version: string; commit: string; status: string; engine?: string }

export class MacPaths {
  readonly listener: string;
  constructor(listener: string) { this.listener = listener; }
  get br(): string { return path.join(this.listener, 'browser'); }
  get installed(): string { return path.join(this.br, 'installed.json'); }
  get staged(): string { return path.join(this.br, 'staged', 'version'); }
  get script(): string { return path.join(this.listener, 'update.sh'); }
  get changelog(): string { return path.join(this.listener, 'Samara Changelog.md'); }
  get updateLog(): string { return path.join(this.listener, 'update.log'); }
  get night(): string { return path.join(this.listener, 'update-overnight.json'); }
  get prefs(): string { return path.join(this.listener, 'update-prefs.json'); }
}

export function readInstalled(file: string): Installed {
  try { const j = JSON.parse(readFileSync(file, 'utf8')); return { version: String(j.version ?? ''), commit: String(j.commit ?? ''), status: String(j.status ?? ''), ...(typeof j.engine === 'string' ? { engine: j.engine } : {}) }; }
  catch { return { version: '', commit: '', status: '' }; }
}

/** How a script is run (tests swap this): 'prepare' waits and says how it ended; 'swap' is let go. */
export type RunScript = (script: string, phase: 'prepare' | 'swap', log: string) => Promise<number>;
const runScript: RunScript = (script, phase, log) => new Promise((res) => {
  const out = openSync(log, 'w');
  if (phase === 'swap') { spawn('/bin/bash', [script, 'swap'], { detached: true, stdio: ['ignore', out, out] }).unref(); res(0); return; }
  // taskpolicy -b: background priority for CPU and disk, so his Mac stays smooth while it works.
  const c = spawn('/usr/sbin/taskpolicy', ['-b', '/bin/bash', script, 'prepare'], { stdio: ['ignore', out, out] });
  c.on('error', () => res(-1));
  c.on('exit', (code) => res(code ?? -1));
});

/**
 * The one staged Samara. Samara's release and the engine each say what they want in it; it is (re)built in the
 * background whenever that changes, and is ready once the build matches what both want.
 */
export class MacStage {
  samara: { m: Manifest; bundle: string } | null = null;
  engine: { version: string; app: string } | null = null;
  private building = '';
  private again = false;
  private built: { key: string; sha: string } | null = null;
  private readonly p: MacPaths;
  private readonly o: { run: RunScript; log: (s: string) => void; changed: () => void };
  constructor(p: MacPaths, o: { run?: RunScript; log: (s: string) => void; changed: () => void }) { this.p = p; this.o = { ...o, run: o.run ?? runScript }; }

  /** What the build should be: "1.24.0", "1.23.0+44.9.3", or '' (nothing waits). */
  key(): string {
    const i = readInstalled(this.p.installed);
    const v = this.samara?.m.version ?? i.version;
    if (!this.samara && !this.engine) return '';
    return this.engine ? `${v}+${this.engine.version}` : v;
  }
  private stagedKey(): string { try { return readFileSync(this.p.staged, 'utf8').trim(); } catch { return ''; } }
  ready(): boolean {
    const k = this.key();
    if (!k || this.building || this.built?.key !== k || this.stagedKey() !== k) return false;
    try { return createHash('sha256').update(readFileSync(this.p.script)).digest('hex') === this.built.sha; } catch { return false; }
  }
  /** Build what is wanted, in the background. A change while building builds again once it ends. */
  async build(): Promise<void> {
    const k = this.key();
    if (!k || (this.built?.key === k && this.stagedKey() === k)) return;
    if (this.building) { this.again = true; return; }
    const i = readInstalled(this.p.installed);
    const version = this.samara?.m.version ?? i.version, commit = this.samara?.m.commit ?? i.commit;
    if (!isVersion(version) || !/^[0-9a-f]{12,40}$/.test(commit)) { this.o.log('update: Samara here has no release number yet, so a new engine waits for the next Samara release'); return; }
    const script = macUpdateScript({ bundle: this.samara?.bundle ?? '', version, commit, ...(this.engine ? { engine: this.engine } : {}) });
    this.building = k;
    try {
      writeFileSync(this.p.script, script); chmodSync(this.p.script, 0o700);
      this.o.log(`update: getting ${k} ready in the background`);
      const code = await this.o.run(this.p.script, 'prepare', path.join(this.p.listener, 'update-prepare.log'));
      if (code === 0 && this.stagedKey() === k) { this.built = { key: k, sha: createHash('sha256').update(script).digest('hex') }; this.o.log(`update: ${k} is ready`); }
      else this.o.log(`update: getting ${k} ready failed (exit ${code}); see update-prepare.log`);
    } catch (e) { this.o.log('update: could not get it ready: ' + (e as Error).message); }
    finally { this.building = ''; }
    this.o.changed();
    if (this.again) { this.again = false; await this.build(); }
  }
  /** Restart now: the script closes Samara, swaps the insides and opens it again. Once per run. */
  private swapping = false;
  async swap(): Promise<{ ok: boolean; why?: string }> {
    if (this.swapping) return { ok: true };
    if (!this.ready()) return { ok: false, why: 'The update is not ready yet. It will show up again when it is.' };
    this.swapping = true;
    await this.o.run(this.p.script, 'swap', this.p.updateLog);
    this.o.log(`update: putting in ${this.key()}; Samara closes and opens again`);
    return { ok: true };
  }
}

/** Samara's own code from GitHub, on the Mac. */
export class MacSamara implements Source {
  readonly id = 'samara' as const;
  readonly onKey = true;
  private busy = false;
  private at = 0;
  private tried = new Set<string>();
  readonly lists: VersionLists;
  private readonly p: MacPaths;
  private readonly stage: MacStage;
  private readonly o: { fetch: Fetch; log: (s: string) => void; changed: () => void; pub?: string };
  constructor(p: MacPaths, stage: MacStage, o: { fetch: Fetch; log: (s: string) => void; changed: () => void; pub?: string }) {
    this.p = p; this.stage = stage; this.o = o;
    this.lists = new VersionLists(path.join(p.br, 'failed-updates.txt'), path.join(p.br, 'filed-updates.txt'));
  }
  installed(): Installed { return readInstalled(this.p.installed); }
  /** A trial that has run a minute is good. */
  markGood(): void {
    const i = this.installed();
    if (i.status !== 'trial') return;
    try { writeFileSync(this.p.installed, JSON.stringify({ ...i, status: 'good' })); this.o.log(`update: ${i.version}${i.engine ? ' on engine ' + i.engine : ''} is good`); } catch { /* next start */ }
  }
  private changelog(m: Manifest): void {
    try { let had = ''; try { had = readFileSync(this.p.changelog, 'utf8'); } catch { /* first */ } const now = withSection(had, m); if (now !== had) writeFileSync(this.p.changelog, now); } catch { /* best effort */ }
  }
  ready(): Offer | null {
    const s = this.stage.samara;
    if (!s || !this.stage.ready()) return null;
    return { version: s.m.version, since: Date.parse(s.m.at) || Date.now(), title: titleOf(s.m), groups: [{ name: 'SAMARA', items: s.m.notes.map((text) => ({ text })) }], canBack: this.canBack() };
  }
  async check(why: string): Promise<void> {
    if (this.busy || Date.now() - this.at < 60_000) return;
    this.busy = true; this.at = Date.now();
    try {
      const m = await ghLatest(this.o.fetch, undefined, this.o.pub);
      if (!m) return;
      const i = this.installed();
      // The version he is on is in "Every version" too (however it was put in).
      if (m.version === i.version) this.changelog(m);
      if (!newer(m.version, i.version) || this.lists.blocked(m.version)) { if (this.stage.samara) { this.stage.samara = null; void this.stage.build(); this.o.changed(); } return; }
      if (this.stage.samara?.m.version === m.version || this.tried.has(m.version)) return;
      this.tried.add(m.version);
      this.o.log(`update: Samara ${m.version} is on GitHub (${why}); downloading it`);
      const dir = path.join(this.p.br, 'github');
      mkdirSync(dir, { recursive: true });
      const bundle = path.join(dir, `samara-${m.version}.tgz`);
      if (!(await ghDownload(this.o.fetch, m, bundle))) { this.o.log(`update: Samara ${m.version} did not download whole; trying again later`); this.tried.delete(m.version); return; }
      this.changelog(m);
      this.stage.samara = { m, bundle };
      void this.stage.build();
    } catch (e) { this.o.log('update: GitHub check: ' + (e as Error).message); }
    finally { this.busy = false; }
  }
  go(): Promise<{ ok: boolean; why?: string }> { return this.stage.swap(); }
  private drop(): void { this.stage.samara = null; void this.stage.build(); this.o.changed(); }
  file(): void { const s = this.stage.samara; if (s) { this.lists.file(s.m.version); this.drop(); } }
  skip(): void { const s = this.stage.samara; if (s) { this.lists.skip(s.m.version); this.drop(); } }
  canBack(): boolean { return existsSync(path.join(this.p.br, 'rollback', 'Samara.app')); }
  /** The version before comes back; the one he left is put away (not offered again until he checks). */
  back(): boolean {
    if (!this.canBack()) return false;
    const i = this.installed(); if (i.version) this.lists.file(i.version);
    try { const out = openSync(this.p.updateLog, 'w'); spawn('/bin/bash', ['-c', BACK_SCRIPT], { detached: true, stdio: ['ignore', out, out] }).unref(); this.o.log('update: going back to the last version (his click)'); return true; }
    catch (e) { this.o.log('update: could not go back: ' + (e as Error).message); return false; }
  }
  checkNow(): void { this.lists.unfile(); this.tried.clear(); this.at = 0; void this.check('his check'); }
}

/** Going back on the Mac: only the app's insides change places, never the Samara.app folder itself (his pet peeve,
 *  2026-10-20: the Dock pin follows the folder), and the copy in rollback/ comes off macOS's list of apps. */
export const BACK_SCRIPT = [
  'APP="$HOME/Applications/Samara.app"; BR="$HOME/Library/Application Support/AangListener/browser"',
  "osascript -e 'quit app id \"com.aang.browser\"' >/dev/null 2>&1 || true",
  'for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do pgrep -f "Samara.app/Contents/MacOS/" >/dev/null 2>&1 || break; sleep 0.5; done',
  'rm -rf "$BR/rollback/next"; mkdir -p "$BR/rollback/next" && mv "$APP/Contents" "$BR/rollback/next/Contents" && mv "$BR/rollback/Samara.app/Contents" "$APP/Contents" && mv "$BR/rollback/next/Contents" "$BR/rollback/Samara.app/Contents"; rmdir "$BR/rollback/next" 2>/dev/null',
  'LSR=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister; $LSR -u "$BR/rollback/Samara.app" >/dev/null 2>&1; $LSR -f "$APP" >/dev/null 2>&1; touch "$APP"',
  '[ -f "$BR/installed.prev.json" ] && cp "$BR/installed.json" "$BR/installed.next.json" && mv "$BR/installed.prev.json" "$BR/installed.json" && mv "$BR/installed.next.json" "$BR/installed.prev.json"',
  'open -a "$APP"',
].join('\n');

/** Unpacks an engine zip into a folder (tests swap this). The Mac's own ditto keeps the app's signatures and links. */
export type Unzip = (zip: string, into: string) => Promise<boolean>;
const unzipIt: Unzip = (zip, into) => new Promise((res) => {
  const c = spawn('/usr/bin/ditto', ['-x', '-k', zip, into], { stdio: 'ignore' });
  c.on('error', () => res(false)); c.on('exit', (code) => res(code === 0));
});

/**
 * A new castLabs engine, on the Mac (his picks, 2026-10-30): from the sealed engine release, signed for video here with
 * his castLabs account, exactly as castLabs shipped it (video wins over the safety switches until castLabs says yes).
 */
export class MacEngine implements Source {
  readonly id = 'engine' as const;
  readonly onKey = true;
  private busy = false;
  private signinState: 'ask' | 'waiting' | null = null;
  private pending: { m: EngineManifest; dir: string } | null = null;
  private behindLine = '';
  readonly lists: VersionLists;
  private readonly p: MacPaths;
  private readonly stage: MacStage;
  private readonly o: { fetch: Fetch; log: (s: string) => void; changed: () => void; evs: Evs; have: () => string; chrome: () => string; unzip?: Unzip; pub?: string };
  constructor(p: MacPaths, stage: MacStage, o: { fetch: Fetch; log: (s: string) => void; changed: () => void; evs?: Evs; have?: () => string; chrome?: () => string; unzip?: Unzip; pub?: string }) {
    this.p = p; this.stage = stage;
    this.o = { ...o, evs: o.evs ?? new Evs({ log: o.log }), have: o.have ?? (() => plain(process.versions.electron)), chrome: o.chrome ?? (() => process.versions.chrome) };
    this.lists = new VersionLists(path.join(p.br, 'failed-engines.txt'), path.join(p.br, 'filed-engines.txt'));
  }
  private get engines(): string { return path.join(this.p.br, 'engines'); }

  ready(): Offer | null {
    const m = this.pending?.m;
    if (!m) return null;
    const since = Date.parse(m.published) || Date.now();
    const groups = engineGroups(m.version, since, 'Mac'), title = `Samara's engine ${m.version}`;
    if (this.signinState) return { version: m.version, since, title, groups, signin: this.signinState };
    if (this.stage.engine?.version !== m.version || !this.stage.ready()) return null;
    return { version: m.version, since, title, groups, canBack: existsSync(path.join(this.p.br, 'rollback', 'Samara.app')), ...(this.behindLine ? { behind: this.behindLine } : {}) };
  }

  async check(why: string): Promise<void> {
    const plat = enginePlatform();
    if (this.busy || !plat || this.signinState === 'waiting') return;
    this.busy = true;
    try {
      const found = await latestEngine(this.o.fetch, this.o.have(), plat, undefined, this.o.pub);
      if (!found || this.lists.blocked(found.m.version)) { if (this.pending) { this.pending = null; this.stage.engine = null; void this.stage.build(); this.o.changed(); } return; }
      const { m, asset } = found;
      // How far behind Chrome: today's engine, and the new one (Chrome's own list; the line is left out without it).
      const stable = await chromeStable(this.o.fetch);
      this.behindLine = stable.length ? `Your engine today is ${behindWords(behindMs(this.o.chrome(), stable))} behind Chrome's security fixes. This one is ${behindWords(behindMs(m.chrome, stable))} behind.` : '';
      if (this.pending?.m.version === m.version && (this.stage.engine?.version === m.version || this.signinState)) return;
      const dir = path.join(this.engines, `castlabs-${m.version}`);
      if (!existsSync(path.join(dir, 'Electron.app'))) {
        this.o.log(`update: castLabs engine ${m.version} is on GitHub (${why}); downloading it`);
        mkdirSync(this.engines, { recursive: true });
        const zip = path.join(this.engines, asset.file);
        if (!(await downloadEngine(this.o.fetch, m, asset, zip))) { this.o.log(`update: engine ${m.version} did not download whole`); return; }
        rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
        const ok = await (this.o.unzip ?? unzipIt)(zip, dir);
        rmSync(zip, { force: true });
        if (!ok || !existsSync(path.join(dir, 'Electron.app'))) { this.o.log(`update: engine ${m.version} did not unpack`); rmSync(dir, { recursive: true, force: true }); return; }
      }
      this.pending = { m, dir };
      await this.sign();
    } catch (e) { this.o.log('update: engine check: ' + (e as Error).message); }
    finally { this.busy = false; }
  }

  /** castLabs signs it for video; then it joins the staged Samara. */
  private async sign(): Promise<void> {
    const p = this.pending; if (!p) return;
    const sig = path.join(p.dir, 'Electron.app', 'Contents', 'Frameworks', 'Electron Framework.framework', 'Versions', 'A', 'Resources', 'Electron Framework.sig');
    const r = existsSync(sig) ? 'ok' : await this.o.evs.sign(p.dir);
    if (r === 'signin') { this.signinState = 'ask'; this.o.changed(); return; }
    if (r !== 'ok') { this.o.log(`update: engine ${p.m.version} could not be signed for video (${r}); tried again later`); return; }
    this.signinState = null;
    this.stage.engine = { version: p.m.version, app: path.join(p.dir, 'Electron.app') };
    this.o.changed();
    void this.stage.build();
  }

  /** Sheet 105: Terminal opens with castLabs' sign-in typed; once castLabs has him, the engine is signed. */
  async signin(): Promise<boolean> {
    if (this.signinState !== 'ask') return false;
    const since = this.o.evs.loginStamp();
    if (!(await this.o.evs.openSignin())) return false;
    this.signinState = 'waiting'; this.o.changed();
    this.o.evs.watchSignin(since, (inNow) => {
      this.signinState = inNow ? null : 'ask';
      if (inNow) void this.sign(); else this.o.changed();
    });
    return true;
  }

  go(): Promise<{ ok: boolean; why?: string }> { return this.stage.swap(); }
  private drop(): void { this.pending = null; this.signinState = null; this.stage.engine = null; void this.stage.build(); this.o.changed(); }
  file(): void { if (this.pending) { this.lists.file(this.pending.m.version); this.drop(); } }
  skip(): void { if (this.pending) { this.lists.skip(this.pending.m.version); this.drop(); } }
  // Going back is Samara's (one rollback copy holds the whole app, engine and all).
  canBack(): boolean { return false; }
  back(): boolean { return false; }
  checkNow(): void { this.lists.unfile(); void this.check('his check'); }
}

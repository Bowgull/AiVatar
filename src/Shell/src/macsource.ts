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
import { chmodSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { download as ghDownload, latest as ghLatest, titleOf, withSection, type Manifest } from './ghrelease.ts';
import { behindMs, behindWords, chromeStable, downloadEngine, enginePlatform, latestEngine, type EngineManifest, type EnginePlatform } from './enginerelease.ts';
import { Evs } from './evs.ts';
import { engineGroups } from './pcsource.ts';
import { macUpdateScript } from './macupdate.ts';
import { readJson, saveJson } from './store.ts';
import { VersionLists, isVersion, newer, plain, type CardGroup, type Offer, type Source } from './updateengine.ts';

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
  return readJson<Installed>(file, { version: '', commit: '', status: '' }, (r) => {
    const j = r as Record<string, unknown>;
    return { version: String(j.version ?? ''), commit: String(j.commit ?? ''), status: String(j.status ?? ''), ...(typeof j.engine === 'string' ? { engine: j.engine } : {}) };
  });
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
 *
 * Sheet 114 (his pick A, 2026-10-31: "A, put in 1.27.0 now"): a newer version that comes out while one is ready never
 * takes the key away. The ready one stays staged and on the key (Restart now puts it in), and the newer one is made
 * behind it in staged-next; once that is ready it takes the ready one's place on the key.
 */
type Build = { key: string; sha: string; samara: MacStage['samara']; engine: MacStage['engine'] };
export class MacStage {
  samara: { m: Manifest; bundle: string } | null = null;
  engine: { version: string; app: string } | null = null;
  private building = '';
  private again = false;
  private built: Build | null = null;
  private readonly p: MacPaths;
  private readonly o: { run: RunScript; log: (s: string) => void; changed: () => void; trash: string };
  constructor(p: MacPaths, o: { run?: RunScript; log: (s: string) => void; changed: () => void; trash?: string }) {
    this.p = p; this.o = { ...o, run: o.run ?? runScript, trash: o.trash ?? path.join(os.homedir(), '.Trash') };
  }

  /** What the build should be: "1.24.0", "1.23.0+44.9.3", or '' (nothing waits). */
  key(): string {
    const i = readInstalled(this.p.installed);
    const v = this.samara?.m.version ?? i.version;
    if (!this.samara && !this.engine) return '';
    return this.engine ? `${v}+${this.engine.version}` : v;
  }
  private stagedKey(dir = 'staged'): string { try { return readFileSync(path.join(this.p.br, dir, 'version'), 'utf8').trim(); } catch { return ''; } }
  /** The staged Samara is whole and its script untouched: Restart now can put it in (whatever is wanted since). */
  ready(): boolean {
    const b = this.built;
    if (!b || this.stagedKey() !== b.key) return false;
    try { return createHash('sha256').update(readFileSync(this.p.script)).digest('hex') === b.sha; } catch { return false; }
  }
  /** What Restart now puts in (Samara's release, the engine), while it is ready. */
  get readySamara(): MacStage['samara'] { return this.ready() ? this.built!.samara : null; }
  get readyEngine(): MacStage['engine'] { return this.ready() ? this.built!.engine : null; }
  /** Sheet 114: the newer one getting ready behind the ready one ("1.27.1"), and the ready one ("1.27.0"). */
  coming(): { next: string; now: string } | null {
    const k = this.key();
    if (!k || !this.ready() || k === this.built!.key) return null;
    const words = (s: MacStage['samara'], e: MacStage['engine']) => s && e ? `${s.m.version} with engine ${e.version}` : s ? s.m.version : e ? `engine ${e.version}` : '';
    return { next: words(this.samara, this.engine), now: words(this.built!.samara, this.built!.engine) };
  }
  /** The ready one is not wanted any more (put away or skipped): it leaves the key. */
  forget(): void { this.built = null; }
  private script(stage: 'staged' | 'staged-next'): string {
    const i = readInstalled(this.p.installed);
    const version = this.samara?.m.version ?? i.version, commit = this.samara?.m.commit ?? i.commit;
    return macUpdateScript({ bundle: this.samara?.bundle ?? '', version, commit, ...(this.engine ? { engine: this.engine } : {}), stage });
  }

  /** Build what is wanted, in the background. A change while building builds again once it ends. */
  async build(): Promise<void> {
    const k = this.key();
    if (!k) { if (this.built) { this.built = null; this.o.changed(); } return; }
    if (this.built?.key === k && this.stagedKey() === k) return;
    if (this.building) { this.again = true; return; }
    const i = readInstalled(this.p.installed);
    const version = this.samara?.m.version ?? i.version, commit = this.samara?.m.commit ?? i.commit;
    if (!isVersion(version) || !/^[0-9a-f]{12,40}$/.test(commit)) { this.o.log('update: Samara here has no release number yet, so a new engine waits for the next Samara release'); return; }
    // Sheet 114: one is ready, so the newer one is made behind it and the key stays.
    const behind = this.ready();
    const want = { samara: this.samara, engine: this.engine };
    const script = this.script(behind ? 'staged-next' : 'staged');
    const file = behind ? path.join(this.p.listener, 'update-next.sh') : this.p.script;
    this.building = k;
    if (behind) this.o.changed();
    try {
      writeFileSync(file, script); chmodSync(file, 0o700);
      this.o.log(`update: getting ${k} ready in the background${behind ? ` (behind ${this.built!.key}, which stays on the key)` : ''}`);
      const code = await this.o.run(file, 'prepare', path.join(this.p.listener, behind ? 'update-prepare-next.log' : 'update-prepare.log'));
      if (code !== 0 || this.stagedKey(behind ? 'staged-next' : 'staged') !== k) this.o.log(`update: getting ${k} ready failed (exit ${code}); see update-prepare${behind ? '-next' : ''}.log`);
      else if (!behind) { this.built = { key: k, sha: createHash('sha256').update(script).digest('hex'), ...want }; this.o.log(`update: ${k} is ready`); }
      else this.promote(k, want);
    } catch (e) { this.o.log('update: could not get it ready: ' + (e as Error).message); }
    finally { this.building = ''; }
    this.o.changed();
    if (this.again) { this.again = false; await this.build(); }
  }
  /** The newer one, made behind, takes the ready one's place on the key (the old staged copy goes to the Trash). Not
   *  while Restart now is putting the old one in: the new Samara makes the newer one again. */
  private promote(k: string, want: { samara: MacStage['samara']; engine: MacStage['engine'] }): void {
    if (this.swapping) return;
    const staged = path.join(this.p.br, 'staged'), next = path.join(this.p.br, 'staged-next');
    rmSync(this.p.staged, { force: true });   // the old one is never put in half moved
    this.built = null;
    if (existsSync(staged)) {
      // To the Trash (his rule); a plain delete of this copy only when there is no Trash to move it to.
      try { mkdirSync(this.o.trash, { recursive: true }); renameSync(staged, path.join(this.o.trash, `Samara staged ${new Date().toISOString().replace(/[:.]/g, '-')}`)); }
      catch { rmSync(staged, { recursive: true, force: true }); }
    }
    renameSync(next, staged);
    const script = macUpdateScript({ bundle: want.samara?.bundle ?? '', version: want.samara?.m.version ?? readInstalled(this.p.installed).version, commit: want.samara?.m.commit ?? readInstalled(this.p.installed).commit, ...(want.engine ? { engine: want.engine } : {}), stage: 'staged' });
    writeFileSync(this.p.script, script); chmodSync(this.p.script, 0o700);
    this.built = { key: k, sha: createHash('sha256').update(script).digest('hex'), ...want };
    this.o.log(`update: ${k} is ready, in place of the one before`);
  }
  /** Restart now: the script closes Samara, swaps the insides and opens it again. Once per run. */
  private swapping = false;
  async swap(): Promise<{ ok: boolean; why?: string }> {
    if (this.swapping) return { ok: true };
    if (!this.ready()) return { ok: false, why: 'The update is not ready yet. It will show up again when it is.' };
    this.swapping = true;
    await this.o.run(this.p.script, 'swap', this.p.updateLog);
    this.o.log(`update: putting in ${this.built!.key}; Samara closes and opens again`);
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
    const i = readInstalled(p.installed); this.startedAs = `${i.version}|${i.commit}|${i.engine ?? ''}`;
  }
  installed(): Installed { return readInstalled(this.p.installed); }
  /** What this Samara was when it started: only that version may be marked good by it. */
  private readonly startedAs: string;
  /** A trial that has run a minute is good. Only the Samara that IS that trial may say so (2026-10-30, his Mac: the old
   *  Samara, quitting for the update, marked the new 1.25.1 good before it had ever started, so nothing reopened it). */
  markGood(): void {
    const i = this.installed();
    if (i.status !== 'trial') return;
    if (`${i.version}|${i.commit}|${i.engine ?? ''}` !== this.startedAs) return;
    if (saveJson(this.p.installed, { ...i, status: 'good' })) this.o.log(`update: ${i.version}${i.engine ? ' on engine ' + i.engine : ''} is good`);   // failed: next start
  }
  private changelog(m: Manifest): void {
    try { let had = ''; try { had = readFileSync(this.p.changelog, 'utf8'); } catch { /* first */ } const now = withSection(had, m); if (now !== had) writeFileSync(this.p.changelog, now); } catch { /* best effort */ }
  }
  ready(): Offer | null {
    const s = this.stage.readySamara, coming = this.stage.coming();
    if (!s) return null;
    return { version: s.m.version, since: Date.parse(s.m.at) || Date.now(), title: titleOf(s.m), groups: [{ name: 'SAMARA', items: s.m.notes.map((text) => ({ text })) }], canBack: this.canBack(), ...(coming ? { coming } : {}) };
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
  /** Put away or skipped: the one on the key (sheet 114: a newer one being made behind it stays wanted). */
  private drop(v: string): void { if (this.stage.samara?.m.version === v) this.stage.samara = null; this.stage.forget(); void this.stage.build(); this.o.changed(); }
  file(): void { const s = this.stage.readySamara ?? this.stage.samara; if (s) { this.lists.file(s.m.version); this.drop(s.m.version); } }
  skip(): void { const s = this.stage.readySamara ?? this.stage.samara; if (s) { this.lists.skip(s.m.version); this.drop(s.m.version); } }
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

/** His installed Samara, when this Samara runs from it (never a test or a run from a code folder). */
function runningApp(): string | null {
  const app = path.resolve(process.execPath, '..', '..', '..');
  return app === path.join(os.homedir(), 'Applications', 'Samara.app') ? app : null;
}
const FRAMEWORK_SIG = ['Contents', 'Frameworks', 'Electron Framework.framework', 'Versions', 'A', 'Resources', 'Electron Framework.sig'];

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
  private readonly o: { fetch: Fetch; log: (s: string) => void; changed: () => void; evs: Evs; have: () => string; chrome: () => string; unzip?: Unzip; pub?: string; plat: () => EnginePlatform | null; app: () => string | null };
  /** Whether his Samara's own engine carries a real video signature (castLabs' check, once a run). */
  private vmpOk: boolean | null = null;
  private resign = false;
  constructor(p: MacPaths, stage: MacStage, o: { fetch: Fetch; log: (s: string) => void; changed: () => void; evs?: Evs; have?: () => string; chrome?: () => string; unzip?: Unzip; pub?: string; plat?: () => EnginePlatform | null; app?: () => string | null }) {
    this.p = p; this.stage = stage;
    this.o = { ...o, evs: o.evs ?? new Evs({ log: o.log }), have: o.have ?? (() => plain(process.versions.electron)), chrome: o.chrome ?? (() => process.versions.chrome), plat: o.plat ?? (() => enginePlatform()), app: o.app ?? runningApp };
    this.lists = new VersionLists(path.join(p.br, 'failed-engines.txt'), path.join(p.br, 'filed-engines.txt'));
  }
  private get engines(): string { return path.join(this.p.br, 'engines'); }

  ready(): Offer | null {
    const p = this.pending?.m;
    if (p && this.signinState) return { ...this.words(p), signin: this.signinState };
    // The engine in the ready Samara (sheet 114: it stays on the key while a newer engine is made behind it).
    const m = this.seen.get(this.stage.readyEngine?.version ?? '');
    if (!m) return null;
    const { version, since, title, groups } = this.words(m);
    const coming = this.stage.coming();
    return { version, since, title, groups, canBack: existsSync(path.join(this.p.br, 'rollback', 'Samara.app')), ...(this.behindLine ? { behind: this.behindLine } : {}), ...(coming ? { coming } : {}) };
  }
  /** Each engine release seen this run, by version. */
  private readonly seen = new Map<string, EngineManifest>();
  private words(m: EngineManifest): { version: string; since: number; title: string; groups: CardGroup[] } {
    const since = Date.parse(m.published) || Date.now();
    return { version: m.version, since, groups: engineGroups(m.version, since, 'Mac'), title: this.resign && m.version === this.o.have() ? `Samara's engine ${m.version}, signed for video` : `Samara's engine ${m.version}` };
  }

  async check(why: string): Promise<void> {
    const plat = this.o.plat();
    if (this.busy || !plat || this.signinState === 'waiting') return;
    this.busy = true;
    try {
      // His Samara's castLabs engine with only castLabs' development signature (44.9.3 went in like that, 2026-10-31):
      // the same engine is offered again, signed for video here.
      this.resign = await this.unsigned();
      const found = await latestEngine(this.o.fetch, this.resign ? '0.0.0' : this.o.have(), plat, undefined, this.o.pub);
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
      this.pending = { m, dir }; this.seen.set(m.version, m);
      await this.sign();
    } catch (e) { this.o.log('update: engine check: ' + (e as Error).message); }
    finally { this.busy = false; }
  }

  /** castLabs signs it for video; then it joins the staged Samara. */
  private async sign(): Promise<void> {
    const p = this.pending; if (!p) return;
    // Every castLabs engine arrives with a development signature: only castLabs' own check says it is really signed.
    const r = (await this.o.evs.verify(p.dir)) ? 'ok' : await this.o.evs.sign(p.dir);
    if (r === 'signin') { this.signinState = 'ask'; this.o.changed(); return; }
    if (r !== 'ok') { this.o.log(`update: engine ${p.m.version} could not be signed for video (${r}); tried again later`); return; }
    this.signinState = null;
    this.stage.engine = { version: p.m.version, app: path.join(p.dir, 'Electron.app') };
    this.o.changed();
    void this.stage.build();
  }

  /** Sheet 108: Terminal opens with castLabs' sign-in typed; once castLabs has him, the engine is signed. */
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

  /** True when his installed Samara runs a castLabs engine that castLabs' check does not pass (looked at once a run,
   *  through a link in a folder of its own: castLabs' tool reads a folder holding the app). */
  private async unsigned(): Promise<boolean> {
    const app = this.o.app();
    if (!app || !existsSync(path.join(app, ...FRAMEWORK_SIG))) return false;
    if (this.vmpOk === null) {
      const dir = path.join(this.p.br, 'vmp-check'), link = path.join(dir, 'Samara.app');
      try { mkdirSync(dir, { recursive: true }); if (!existsSync(link)) symlinkSync(app, link); } catch { return false; }
      this.vmpOk = await this.o.evs.verify(dir);
      if (!this.vmpOk) this.o.log("update: Samara's engine has only castLabs' development signature; offering it again, signed for video here");
    }
    return !this.vmpOk;
  }

  go(): Promise<{ ok: boolean; why?: string }> { return this.stage.swap(); }
  private drop(): void { this.pending = null; this.signinState = null; this.stage.engine = null; this.stage.forget(); void this.stage.build(); this.o.changed(); }
  file(): void { const v = this.stage.readyEngine?.version ?? this.pending?.m.version; if (v) { this.lists.file(v); this.drop(); } }
  skip(): void { const v = this.stage.readyEngine?.version ?? this.pending?.m.version; if (v) { this.lists.skip(v); this.drop(); } }
  // Going back is Samara's (one rollback copy holds the whole app, engine and all).
  canBack(): boolean { return false; }
  back(): boolean { return false; }
  checkNow(): void { this.lists.unfile(); void this.check('his check'); }
}

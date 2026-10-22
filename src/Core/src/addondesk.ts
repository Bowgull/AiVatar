// C1-C3 (sheet 65, his answers 2026-10-22): Aang drives the CurseForge app for him, on his yes, with WoW closed.
//
// Each morning, before the brief: WoW closed -> CurseForge opened minimized so its list is fresh -> wait for its status
// file to be saved again (or give up after a while) -> the Addons slip is built and kept. WoW running -> nothing is
// opened and the last list is used, silently.
//
// "Update ticked": WoW must be closed (else "I'll do it when you close it", and it is done then). For each ticked addon:
// open its curseforge://install link (that exact addon, that exact file), press the dialog's Install button BY NAME
// through UI Automation (AangReader --act, src/Reader/Act.cs), and confirm by CurseForge's own record changing to the
// new file (or the .toc's version changing). Never pixel clicks, never a key, never anything inside WoW. When the button
// cannot be found it stops and says so in one line. AANG_ADDONS_DRYRUN=1 does all of it except the press (C0, the
// 5-minute live check with him).
import { execFile, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { ActRunner, Control } from './uia.ts';
import { cfPaths, installedFileId, readSection, tocInfo, wowInstance, readInstances, type AddonRow, type AddonsSection, type AskLocal, type CfPaths } from './addonbrief.ts';

/** What rides on Aang's line while he works: icons for the names in it, and the progress rows (sheet 65 b/c/d). */
export interface AddonsLine {
  icons: Record<string, string>;
  progress?: { pct: number; rows: { name: string; icon?: string; state: St; note: string }[] };
}
type St = 'done' | 'now' | 'wait' | 'fail';
export interface Said { text: string; id: string; final: boolean; addons: AddonsLine }

export interface DeskDeps {
  stateDir: string;
  paths?: CfPaths;
  wowRunning: () => Promise<boolean>;
  cfRunning: () => Promise<boolean>;
  launchCf: (exe: string) => void;
  closeCf: () => void;
  openLink: (url: string) => void;
  act: ActRunner;
  ask?: AskLocal;
  say: (s: Said) => void;
  sleep?: (ms: number) => Promise<void>;
  dryRun?: boolean;
  refreshTimeoutMs?: number;
  findTimeoutMs?: number;
  verifyTimeoutMs?: number;
  /** How often a waiting update checks whether WoW has closed. */
  pendingEveryMs?: number;
}

const WOW_PROC = /^(wow|wowb|wowt|wow-64|wowclassic|wowclassicb|wowclassict)$/i;
export const isWowProcess = (name: string) => WOW_PROC.test(String(name ?? '').replace(/\.exe$/i, ''));

/** Image names of what is running ("WowB", "CurseForge"). [] when the list cannot be read. */
export function processNames(): Promise<string[]> {
  return new Promise(resolve => {
    execFile('tasklist', ['/fo', 'csv', '/nh'], { timeout: 8000, maxBuffer: 4 << 20, windowsHide: true }, (err, out) => {
      if (err) { resolve([]); return; }
      resolve(String(out).split(/\r?\n/).map(l => /^"([^"]+)"/.exec(l)?.[1]?.replace(/\.exe$/i, '') ?? '').filter(Boolean));
    });
  });
}

/** The real machine's hands: used by the Core, replaced in tests. */
export function realDeps(o: { stateDir: string; act: ActRunner; ask?: AskLocal; say: (s: Said) => void }): DeskDeps {
  return {
    ...o,
    dryRun: process.env.AANG_ADDONS_DRYRUN === '1',
    wowRunning: async () => (await processNames()).some(isWowProcess),
    cfRunning: async () => (await processNames()).some(n => /^curseforge$/i.test(n)),
    launchCf: exe => { if (existsSync(exe)) spawn(exe, ['--minimized'], { detached: true, stdio: 'ignore' }).unref(); },
    // A polite close (no /F): CurseForge saves and goes. Only ever when Aang opened it.
    closeCf: () => { execFile('taskkill', ['/IM', 'CurseForge.exe'], { windowsHide: true }, () => { /* gone or tray: either is fine */ }); },
    // The operating system's own door for a link, so CurseForge's registered curseforge:// handler gets it. No shell parsing.
    openLink: url => { if (/^curseforge:\/\/install\?addonId=\d+&fileId=\d+$/.test(url)) spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref(); },
  };
}

/** "A", "A and B", "A, B and C". */
export const andList = (xs: string[]) => xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;
/** The button that does it, by name: Install (the protocol link's box), else Update. Exactly one, and usable. */
export function installButton(ms: Control[]): Control | 'none' | 'many' {
  for (const want of ['install', 'update']) {
    const hits = ms.filter(m => m.name.trim().toLowerCase() === want && m.type === 'button');
    if (hits.length > 1) return 'many';
    if (hits.length === 1) return hits[0]!.enabled ? hits[0]! : 'none';
  }
  return 'none';
}

export class AddonDesk {
  private readonly d: Required<Pick<DeskDeps, 'sleep' | 'refreshTimeoutMs' | 'findTimeoutMs' | 'verifyTimeoutMs' | 'pendingEveryMs'>> & DeskDeps;
  private readonly file: string;
  private pending: number[] = [];
  private waitTimer: NodeJS.Timeout | null = null;
  private busy = false;

  constructor(deps: DeskDeps) {
    this.d = { sleep: ms => new Promise(r => setTimeout(r, ms)), refreshTimeoutMs: 90_000, findTimeoutMs: 20_000, verifyTimeoutMs: 120_000, pendingEveryMs: 30_000, ...deps, paths: deps.paths ?? cfPaths() };
    this.file = path.join(deps.stateDir, 'addons-brief.json');
  }
  private get paths(): CfPaths { return this.d.paths!; }

  /** The last list, for the brief. Null when there is nothing to show (no updates and no errors). */
  section(): AddonsSection | null {
    try {
      const s = JSON.parse(readFileSync(this.file, 'utf8')) as AddonsSection;
      return s && Array.isArray(s.rows) && (s.rows.length || s.errorsOnly?.length) ? s : null;
    } catch { return null; }
  }
  private keep(s: AddonsSection): void {
    try { mkdirSync(path.dirname(this.file), { recursive: true }); writeFileSync(this.file, JSON.stringify(s), 'utf8'); }
    catch (e) { console.error('addons: could not keep the list: ' + (e as Error).message); }
  }
  private mtime(): number { try { return statSync(this.paths.json).mtimeMs; } catch { return 0; } }

  /**
   * Before the brief. WoW running: nothing at all (the last list stands). Otherwise CurseForge opened minimized (only if
   * it is not already open), its status file waited for, the list rebuilt and kept, and CurseForge closed again if Aang
   * opened it. Returns the list, or null when there is no CurseForge here.
   */
  async morning(): Promise<AddonsSection | null> {
    if (this.busy) return this.section();
    if (await this.d.wowRunning()) { console.log('addons: WoW is running, so the brief uses the last list'); return this.section(); }
    if (!existsSync(this.paths.json)) return null;
    this.busy = true;
    try {
      const was = await this.d.cfRunning();
      const before = this.mtime();
      if (!was) {
        this.d.launchCf(this.paths.exe);
        const end = Date.now() + this.d.refreshTimeoutMs;
        while (Date.now() < end && this.mtime() <= before) await this.d.sleep(2000);
        if (this.mtime() <= before) console.log('addons: CurseForge did not save a fresh list in time; using what it has');
        else await this.d.sleep(1500);                                          // let it finish writing
      }
      const s = await readSection(this.paths, { ...(this.d.ask ? { ask: this.d.ask } : {}) });
      if (s) { this.keep(s); console.log(`addons: ${s.rows.length} update(s), ${s.errorsOnly.length} other addon(s) with errors`); }
      if (!was) this.d.closeCf();
      return s;
    } catch (e) {
      console.error('addons: the morning look failed: ' + (e as Error).message);
      return this.section();
    } finally { this.busy = false; }
  }

  /** "Update ticked" from the brief. Only ids from the list Aang showed count. */
  async update(ids: number[]): Promise<void> {
    const s = this.section();
    const rows = (s?.rows ?? []).filter(r => ids.includes(r.id));
    const id = 'addons-' + Date.now().toString(36);
    if (!rows.length) { this.d.say({ text: 'Nothing to update there.', id, final: true, addons: { icons: {} } }); return; }
    if (this.busy) { this.d.say({ text: 'I’m already on it.', id, final: true, addons: { icons: {} } }); return; }
    if (await this.d.wowRunning()) {
      this.pending = rows.map(r => r.id);
      this.d.say({ text: 'WoW is open. I’ll update them when you close it.', id, final: true, addons: { icons: { WoW: 'wow' } } });
      this.watchForClose();
      return;
    }
    await this.run(rows, id);
  }

  /** Waits for WoW to close, then does what he ticked. */
  private watchForClose(): void {
    if (this.waitTimer) return;
    this.waitTimer = setInterval(() => {
      void (async () => {
        if (this.busy || await this.d.wowRunning()) return;
        if (this.waitTimer) clearInterval(this.waitTimer);
        this.waitTimer = null;
        const ids = this.pending; this.pending = [];
        const rows = (this.section()?.rows ?? []).filter(r => ids.includes(r.id));
        if (rows.length) await this.run(rows, 'addons-' + Date.now().toString(36));
      })().catch(e => console.error('addons: ' + (e as Error).message));
    }, this.d.pendingEveryMs);
    this.waitTimer.unref?.();
  }
  stop(): void { if (this.waitTimer) clearInterval(this.waitTimer); this.waitTimer = null; }
  /** What is waiting for WoW to close (tests, and "what are you waiting on"). */
  waitingIds(): number[] { return [...this.pending]; }

  private async run(rows: AddonRow[], id: string): Promise<void> {
    this.busy = true;
    const dry = this.d.dryRun === true;
    const icons: Record<string, string> = { CurseForge: 'curseforge' };
    for (const r of rows) if (r.icon) icons[r.name] = r.icon;
    const state = rows.map(r => ({ name: r.name, ...(r.icon ? { icon: r.icon } : {}), state: 'wait' as St, note: 'next' }));
    const n = rows.length;
    const head = `${dry ? 'Dry run: checking' : 'Updating'} ${n === 1 ? rows[0]!.name : `${n} addons`} in CurseForge…`;
    const tell = (pct: number) => this.d.say({ text: head, id, final: false, addons: { icons, progress: { pct: Math.max(0, Math.min(100, Math.round(pct))), rows: state.map(x => ({ ...x })) } } });
    const done: string[] = [], failed: string[] = [];
    let stopped = '';
    const wasCf = await this.d.cfRunning();
    try {
      for (let i = 0; i < n; i++) {
        const r = rows[i]!;
        if (await this.d.wowRunning()) {                                   // he opened WoW mid-way: the rest waits for it to close
          this.pending = rows.slice(i).map(x => x.id);
          stopped = `WoW opened, so I stopped. I’ll do ${andList(rows.slice(i).map(x => x.name))} when you close it.`;
          this.watchForClose();
          break;
        }
        state[i]!.state = 'now'; state[i]!.note = dry ? 'checking' : 'updating';
        tell((i / n) * 100 + 5);
        this.d.openLink(`curseforge://install?addonId=${r.id}&fileId=${r.fileId}`);
        const btn = await this.findButton();
        if (btn === 'many' || btn === 'none') {
          state[i]!.state = 'fail'; state[i]!.note = 'stopped';
          stopped = btn === 'many'
            ? `CurseForge showed more than one Install button for ${r.name}, so I stopped. Nothing was changed.`
            : `I couldn’t find CurseForge’s Install button for ${r.name}, so I stopped. Nothing was changed.`;
          break;
        }
        if (dry) { state[i]!.state = 'done'; state[i]!.note = 'found it'; done.push(r.name); tell(((i + 1) / n) * 100); continue; }
        if (await this.d.wowRunning()) { state[i]!.state = 'wait'; state[i]!.note = 'next'; i--; continue; }   // checked again at the top
        const pressed = await this.d.act({ app: 'CurseForge', do: 'press', name: btn.name, index: btn.i });
        if (!pressed.ok) {
          state[i]!.state = 'fail'; state[i]!.note = 'stopped';
          stopped = `CurseForge’s Install button for ${r.name} would not press, so I stopped.`;
          break;
        }
        tell((i / n) * 100 + 50 / n);
        const ok = await this.verify(r);
        state[i]!.state = ok ? 'done' : 'fail'; state[i]!.note = ok ? `now ${r.to}` : 'not yet';
        (ok ? done : failed).push(r.name);
        tell(((i + 1) / n) * 100);
      }
    } finally {
      this.busy = false;
      if (!wasCf && !dry) this.d.closeCf();
    }
    const parts: string[] = [];
    if (dry) {
      if (done.length) parts.push(`Dry run: I found CurseForge’s Install button for ${andList(done)}. Nothing was pressed.`);
    } else {
      if (done.length) parts.push(`Done: ${andList(done)} ${done.length === 1 ? 'is' : 'are'} up to date.`);
      if (failed.length) parts.push(`${andList(failed)} didn’t update.`);
    }
    if (stopped) parts.push(stopped);
    this.d.say({ text: parts.join(' ') || 'Nothing was updated.', id, final: true, addons: { icons } });
    // The kept list follows what really happened, so tomorrow's brief does not offer what is already done.
    if (!dry && done.length) {
      try { const s = await readSection(this.paths); if (s) this.keep(s); } catch { /* the morning look will */ }
    }
  }

  /** CurseForge's Install box, looked for by name until it shows (its window opens a moment after the link). */
  private async findButton(): Promise<Control | 'none' | 'many'> {
    const end = Date.now() + this.d.findTimeoutMs;
    let last: Control | 'none' | 'many' = 'none';
    do {
      await this.d.sleep(1500);
      const r = await this.d.act({ app: 'CurseForge', do: 'find' });
      if (r.ok) { last = installButton(r.matches ?? []); if (last !== 'none') return last; }
    } while (Date.now() < end);
    return last;
  }

  /** Confirmed when CurseForge records the new file, or the addon's .toc reports a different version. */
  private async verify(r: AddonRow): Promise<boolean> {
    const g = wowInstance(readInstances(this.paths.json));
    const dir = g ? path.join(g.installPath, 'Interface', 'AddOns') : '';
    const before = dir && r.folder ? tocInfo(dir, r.folder)?.version ?? '' : '';
    const end = Date.now() + this.d.verifyTimeoutMs;
    do {
      await this.d.sleep(2000);
      if (installedFileId(this.paths.json, r.id) === r.fileId) return true;
      const now = dir && r.folder ? tocInfo(dir, r.folder)?.version ?? '' : '';
      if (before && now && now !== before) return true;
    } while (Date.now() < end);
    return false;
  }
}

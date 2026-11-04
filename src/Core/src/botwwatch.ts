// BG2 + BG6 (docs/BOTW-GUIDE.md): watching his Breath of the Wild save, the one "today" line, and "Where was I?".
//
// His rules, all enforced here:
//   - Read-only, always. Only the slots' times are looked at; to read one, the newest slot is copied to a temp file, the
//     copy is read and deleted. Nothing in Cemu is ever opened for writing, moved or locked.
//   - Quiet while he plays: nothing is said. Each new autosave is read (a copy, about a second, his call 2026-11-04)
//     so state.json and cook.json keep up for the Journal; the session and its line work as before.
//   - A session ends when Cemu closes or the save sits still for 30 minutes. Then the state is read and Aang says ONE
//     line ("Today: 3 shrines, 12 Koroks."). Never anything about what is left.
//   - "Where was I?" only when he asks.
// What it writes (state.json, sessions.json) is the contract in docs/BOTW-STATE.md; botwsave.ts does the reading.
import { execFile } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { writeFileAtomic } from './atomic.ts';
import { cookMenu } from './botw.ts';
import { dayKey, shortTime } from './clock.ts';
import { diffStates, loadCatalog, parseState, sayPlaytime, todayLine, type BotwDiff, type BotwState, type Catalog } from './botwsave.ts';

/** Still this long after his last save = the session is over, even with Cemu open. */
export const STILL_MS = 30 * 60_000;
/** A session that ended this long ago (Aang was off) is recorded but not announced: an old "today" is not today. */
export const STALE_MS = 3 * 3_600_000;
export const KEEP_SESSIONS = 30;
/** How near a Zelda note must be to where he saved to be mentioned (world units = metres; a village is ~150). */
export const NOTE_NEAR = 300;

export interface BotwPaths { saves: string; dir: string; db: string }
export function botwPaths(env: NodeJS.ProcessEnv = process.env): BotwPaths {
  const local = env.LOCALAPPDATA ?? path.join(env.USERPROFILE ?? 'C:\\Users\\Default', 'AppData', 'Local');
  const dir = env.AANG_BOTW_DIR || path.join(local, 'Aang', 'botw');
  return {
    saves: env.AANG_BOTW_SAVES || 'C:\\Games\\Cemu\\portable\\mlc01\\usr\\save\\00050000\\101c9400\\user\\80000001',
    dir,
    db: env.AANG_BOTW_DB || path.join(local, 'Aang', 'botw', 'botw.db'),
  };
}

export interface BotwSession {
  start: string; end: string; from: string; to: string; line: string | null; diff: BotwDiff;
  /** Hero's Path points in the state it is measured from, and at its end: points[pathFrom..pathTo) are this session's
   *  walk (the points carry no times). Absent on sessions recorded before 2026-11-03. */
  pathFrom?: number; pathTo?: number;
}
export interface BotwSessions {
  v: 1;
  open: { since: string; baseline: string; lastSave: string; pathFrom?: number } | null;
  /** The line of the last session, waiting for no game to be running. */
  held: string | null;
  list: BotwSession[];
}

const readJsonFile = <T>(f: string): T | null => { try { return JSON.parse(readFileSync(f, 'utf8')) as T; } catch { return null; } };
export const readBotwState = (p: BotwPaths = botwPaths()): BotwState | null => readJsonFile<BotwState>(path.join(p.dir, 'state.json'));
export const readBotwSessions = (p: BotwPaths = botwPaths()): BotwSessions | null => readJsonFile<BotwSessions>(path.join(p.dir, 'sessions.json'));

/** The six slots by time, newest first. Only stat: nothing is opened. */
export function slots(saves: string): { slot: number; file: string; t: number }[] {
  let dirs: string[];
  try { dirs = readdirSync(saves).filter(d => /^\d$/.test(d)); } catch { return []; }
  return dirs.map(d => { const file = path.join(saves, d, 'game_data.sav'); try { return { slot: Number(d), file, t: statSync(file).mtimeMs }; } catch { return null; } })
    .filter((x): x is { slot: number; file: string; t: number } => x !== null).sort((a, b) => b.t - a.t);
}

/**
 * Copy the newest slot (with its caption) and the Hero's Path files to a temp folder, read the copies, delete them.
 * copyFileSync opens the source read-only and shares it, so Cemu writing at the same moment is never blocked.
 */
export function readNewest(p: BotwPaths, cat: Catalog, now = Date.now()): BotwState | null {
  const top = slots(p.saves)[0];
  if (!top) return null;
  const tmp = mkdtempSync(path.join(tmpdir(), 'aang-botw-'));
  try {
    const copy = (from: string, name: string): Buffer | null => {
      try { const to = path.join(tmp, name); copyFileSync(from, to); return readFileSync(to); } catch { return null; }
    };
    const save = copy(top.file, 'game_data.sav');
    if (!save || save.length < 16) return null;
    const caption = copy(path.join(path.dirname(top.file), 'caption.sav'), 'caption.sav');
    let tracks: Buffer[] = [];
    try {
      tracks = readdirSync(path.join(p.saves, 'tracker')).filter(f => /^trackblock\d+\.sav$/i.test(f)).sort()
        .map(f => copy(path.join(p.saves, 'tracker', f), f)).filter((b): b is Buffer => b !== null);
    } catch { /* no Hero's Path yet */ }
    return parseState({ save, caption, tracks, slot: top.slot, savedAt: top.t, now }, cat);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

/** Is cemu.exe running? Its own small check, because gpu.ts names only the first game it sees. */
export function cemuRunning(): Promise<boolean> {
  return new Promise(resolve => {
    execFile('tasklist', ['/fi', 'imagename eq cemu.exe', '/fo', 'csv', '/nh'], { timeout: 8000, windowsHide: true },
      (err, stdout) => resolve(!err && /"cemu\.exe"/i.test(String(stdout))));
  });
}

export interface WatchDeps {
  cemuRunning: () => Promise<boolean>;
  /** Any game (Cemu included): the line waits while one runs. */
  gameRunning: () => Promise<boolean>;
  say: (line: string) => void;
  now?: () => number;
  /** botw.db's flag names; tests pass their own. */
  catalog?: () => Catalog;
}

export class BotwWatch {
  readonly p: BotwPaths;
  private d: WatchDeps;
  private cat: Catalog | null = null;
  private busy = false;
  constructor(p: BotwPaths, d: WatchDeps) { this.p = p; this.d = d; }

  private now(): number { return this.d.now?.() ?? Date.now(); }
  private catalog(): Catalog { return this.cat ??= this.d.catalog?.() ?? loadCatalog(this.p.db); }
  private file(n: string): string { return path.join(this.p.dir, n); }
  private sessions(): BotwSessions {
    const s = readBotwSessions(this.p);
    return s?.v === 1 ? s : { v: 1, open: null, held: null, list: [] };
  }
  private write(n: string, data: unknown): void { writeFileAtomic(this.file(n), JSON.stringify(data)); }
  /** state.json, and cook.json beside it (what his bag cooks, for the Journal's On the Menu). */
  private writeState(st: BotwState): void {
    this.write('state.json', st);
    try { const db = new DatabaseSync(this.p.db, { readOnly: true }); try { this.write('cook.json', cookMenu(db, st)); } finally { db.close(); } } catch { /* the Journal falls back to its own copy */ }
  }
  /** The state a session is measured from: state.json as it was when the session began, Hero's Path left out. */
  private writeBase(st: BotwState): void { this.write('base.json', { ...st, heroPath: null }); }

  /** Once a minute. Cheap while he plays: the slots' times, and a process check while a session is open. */
  async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try { await this.step(); } finally { this.busy = false; }
  }

  private async step(): Promise<void> {
    if (!existsSync(this.p.saves) || !existsSync(this.p.db)) return;
    const top = slots(this.p.saves)[0];
    if (!top) return;
    const now = this.now();
    const state = readBotwState(this.p);
    const s = this.sessions();
    if (!state) {
      // The first time: just learn where he is, quietly. Not while he plays.
      if (await this.d.cemuRunning()) return;
      const st = readNewest(this.p, this.catalog(), now);
      if (st) this.writeState(st);
      return;
    }
    let changed = false;
    if (top.t > Date.parse(state.savedAt) + 1000) {
      const at = new Date(top.t).toISOString();
      if (s.open) { if (s.open.lastSave !== at) { s.open.lastSave = at; changed = true; } }
      else if (s.held && s.list.length && existsSync(this.file('base.json'))) {
        // He came back before the last line was said: the same session carries on, from the same start.
        const last = s.list.pop()!;
        s.open = { since: last.start, baseline: last.from, lastSave: at, ...(last.pathFrom !== undefined ? { pathFrom: last.pathFrom } : {}) }; s.held = null; changed = true;
      } else {
        this.writeBase(state);
        s.open = { since: at, baseline: state.savedAt, lastSave: at, pathFrom: state.heroPath?.points.length ?? 0 }; s.held = null; changed = true;
      }
      // His call (2026-11-04): every autosave refreshes state.json during play, so the Journal's bag keeps up. One copy
      // of the save, read and deleted (about a second); the session still measures from base.json and ends as before.
      const cur = readNewest(this.p, this.catalog(), now);
      if (cur) this.writeState(cur);
    }
    if (s.open && (now - Date.parse(s.open.lastSave) >= STILL_MS || !(await this.d.cemuRunning()))) {
      const cur = readNewest(this.p, this.catalog(), now);
      if (cur) {
        const base = readJsonFile<BotwState>(this.file('base.json')) ?? state;
        const diff = diffStates(base, cur);
        const line = todayLine(diff);
        s.list.push({ start: s.open.since, end: s.open.lastSave, from: base.savedAt, to: cur.savedAt, line, diff,
          ...(s.open.pathFrom !== undefined ? { pathFrom: s.open.pathFrom } : {}), pathTo: cur.heroPath?.points.length ?? 0 });
        s.list = s.list.slice(-KEEP_SESSIONS);
        const fresh = now - Date.parse(s.open.lastSave) < STALE_MS;
        s.open = null;
        s.held = line && fresh ? line : null;
        this.writeState(cur);
        changed = true;
      }
    }
    if (s.held && !s.open && !(await this.d.gameRunning())) {
      this.d.say(s.held);
      s.held = null;
      rmSync(this.file('base.json'), { force: true });
      changed = true;
    }
    if (changed) this.write('sessions.json', s);
  }

  /**
   * BG6, on ask only. Where he saved, what he did last time, and a Zelda note he wrote near there. Plain code, no
   * model. A save newer than state.json is read now (he asked), without touching the session bookkeeping.
   */
  whereWasI(notes: NoteLike[] = []): string {
    let st = readBotwState(this.p);
    const top = slots(this.p.saves)[0];
    if (top && existsSync(this.p.db) && (!st || top.t > Date.parse(st.savedAt) + 1000)) st = readNewest(this.p, this.catalog(), this.now()) ?? st;
    if (!st) return 'I have not seen a Breath of the Wild save yet.';
    const names = placeNames(this.p.db);
    const where = whereSaved(st, names);
    const when = sayWhen(Date.parse(st.savedAt), this.now());
    const out = [`You saved ${where}, ${when}.`];
    const last = this.sessions().list.at(-1);
    if (last?.line) out.push(`Last time: ${last.line.replace(/^Today: /, '').replace(/\.$/, '')}${last.diff.playtime >= 60 ? ` (${sayPlaytime(last.diff.playtime)})` : ''}.`);
    const near = nearNotes(notes, st);
    if (near.length) out.push(near.length === 1 ? `Your note "${near[0]!.title}" is near there.` : `${near.length} of your Zelda notes are near there: ${near.slice(0, 3).map(n => `"${n.title}"`).join(', ')}.`);
    return out.join(' ');
  }
}

// ------------------------------------------------------------------ "Where was I?"

/** "where was I", "where was i in zelda?", "aang, where did I leave off in botw" */
const WHERE_RE = /^(?:(?:hey|ok|okay|so|aang)[,\s]+)*(?:where (?:was|am) i|where did i (?:leave off|stop|save))(?: at)?(?: in (?:botw|zelda|breath of the wild|hyrule|the game))?\s*\??$/i;
const ZELDA_RE = /\b(botw|zelda|breath of the wild|hyrule)\b/i;
export const isWhereWasI = (text: string): boolean => WHERE_RE.test(text.trim());
/** Named the game, or he has played within a day: then a bare "where was I?" means Hyrule. */
export const meansBotw = (text: string, st: BotwState | null, now = Date.now()): boolean =>
  ZELDA_RE.test(text) || (st !== null && now - Date.parse(st.savedAt) < 24 * 3_600_000);

/**
 * BG5 hook: a note on the map. notes.ts has no place yet; when BG5 adds `place: { game: 'botw', x, z }` and the Zelda
 * category, notes start showing up here with no change to this file.
 */
export interface NoteLike { title: string; cat?: string | undefined; place?: { game: string; x: number; z: number } | undefined }
export function nearNotes(notes: NoteLike[], st: BotwState, r = NOTE_NEAR): NoteLike[] {
  return notes.filter(n => n.place?.game === 'botw' && (!n.cat || /^zelda$/i.test(n.cat)))
    .map(n => ({ n, d: Math.hypot(n.place!.x - st.pos.x, n.place!.z - st.pos.z) })).filter(x => x.d <= r)
    .sort((a, b) => a.d - b.d).map(x => x.n);
}

export interface PlaceNames { shrine: Map<string, string>; place: { flag: string | null; msg: string; name: string; x: number; z: number }[] }
export function placeNames(db: string): PlaceNames {
  const d = new DatabaseSync(db, { readOnly: true });
  try {
    return {
      shrine: new Map((d.prepare('SELECT id, name FROM shrines WHERE name IS NOT NULL').all() as { id: string; name: string }[]).map(r => [r.id, r.name])),
      place: d.prepare('SELECT flag, msg_id msg, name, x, z FROM places WHERE name IS NOT NULL AND x IS NOT NULL').all() as PlaceNames['place'],
    };
  } finally { d.close(); }
}

/**
 * "in Ta'loh Naeg Shrine", "near Kakariko Village", "in map square G-5". Only names of things his save shows he has
 * found: the nearest place he has visited, the shrine he is standing in. Nothing he has not seen yet (spoilers).
 */
export function whereSaved(st: BotwState, names: PlaceNames): string {
  const parts: string[] = [];
  const shrine = /^Dungeon\d+$/.test(st.pos.label) ? names.shrine.get(st.pos.label) : undefined;
  if (shrine && st.shrines.found.includes(st.pos.label)) parts.push(`in ${shrine}`);
  const seen = new Set(st.places);
  const near = names.place.filter(pl => pl.flag && seen.has(pl.flag))
    .map(pl => ({ pl, d: Math.hypot(pl.x - st.pos.x, pl.z - st.pos.z) })).sort((a, b) => a.d - b.d)[0];
  if (near && near.d < 800) parts.push(`${near.d < 150 && !parts.length ? 'at' : 'near'} ${near.pl.name}`);
  if (!parts.length) parts.push(st.pos.square ? `in map square ${st.pos.square}` : 'somewhere in Hyrule');
  return parts.join(' ');
}

function sayWhen(t: number, now: number): string {
  const day = dayKey(new Date(t)), today = dayKey(new Date(now)), yday = dayKey(new Date(now - 86_400_000));
  if (day === today) return `today at ${shortTime(new Date(t))}`;
  if (day === yday) return `yesterday at ${shortTime(new Date(t))}`;
  return `${Math.max(2, Math.round((now - t) / 86_400_000))} days ago`;
}

// BG8 (docs/BOTW-GUIDE.md): where Link is right now, while Cemu runs. The reading itself is AangReader --botw-pos
// (src/Reader/BotwPos.cs: ReadProcessMemory, read-only, once a second); this only starts it while Cemu runs and stops
// caring when Cemu closes. Output: %LOCALAPPDATA%\Aang\botw\pos.json, the contract in docs/BOTW-STATE.md.
//
// His rules: nothing at all while Cemu is closed; one small read a second while it runs; never a write into Cemu, never
// an injection or the debugger port, never a key. A wrong address fails safe: the reader removes pos.json, says why
// (logged here) and exits 3, and it is started again RETRY_MS later. Exit 4 (no base in Cemu's log yet) retries at once.
//
// BG10 (2026-11-04, his interview): the reader is started as --botw-live (src/Reader/BotwLive.cs). pos.json is written
// exactly as before; and only while a guide page is open (want.json, the Shell page server's lease) it also writes
// live.json (hearts, stamina, yellow extras, rupees, arrows, what Link wears) and pouch.json (his whole pouch as the game
// holds it). The brain's one part in that: when the live pouch changes, cook.json is worked out again from it, so the
// Journal's Cooking follows what he just picked up or cooked without waiting for a save ("lets just do this").
import { spawn, type ChildProcess } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { writeFileAtomic } from './atomic.ts';
import { cookMenu } from './botw.ts';
import type { BotwPaths } from './botwwatch.ts';

/** How often the brain looks for Cemu (one tasklist call). Reading starts within this long of Cemu opening. */
export const LIVE_EVERY_MS = 20_000;
/** The reader's code for "the address gave nothing believable": rest a while, then try again. It used to wait for a
 *  Cemu restart, which left tracking off for a whole session after a slow start (2026-11-04). */
export const GAVE_UP = 3;
/** The reader's code for "Cemu's log has no base yet": try again at the next look. */
export const NOT_READY = 4;
/** How long the brain rests after a give-up before it starts the reader again (one 12-byte read a second, read-only). */
export const RETRY_MS = 3 * 60_000;
/** The walk log (bugs 29-31: route times, climb and swim limits were guesses): while the reader runs, his position every
 *  2 s goes into walks/<day>.jsonl beside pos.json, one line { t, x, y, z, f } when it changed. Kept 14 days. Tiny:
 *  a 2 s file read of pos.json, never Cemu. scripts/botw-walks.mjs turns it into the route engine's numbers. */
export const WALK_EVERY_MS = 2000;
export const WALK_KEEP_DAYS = 14;
export const walksDir = (p: BotwPaths): string => path.join(p.dir, 'walks');

export interface BotwPos { v: 1; at: string; x: number; y: number; z: number; facing: number; live: boolean }
export const posFile = (p: BotwPaths): string => path.join(p.dir, 'pos.json');
export function readBotwPos(p: BotwPaths): BotwPos | null {
  try { const j = JSON.parse(readFileSync(posFile(p), 'utf8')) as BotwPos; return j?.v === 1 ? j : null; } catch { return null; }
}

export const liveFile = (p: BotwPaths): string => path.join(p.dir, 'live.json');
export const pouchFile = (p: BotwPaths): string => path.join(p.dir, 'pouch.json');
export const wantFile = (p: BotwPaths): string => path.join(p.dir, 'want.json');
/** pouch.json: every item in his pouch as the game holds it now. t = kind (0 sword, 1 bow, 2 arrow, 3 shield, 4-6
 *  armour, 7 material, 8 food, 9 key item), n = count (durability x100 for gear). */
export interface BotwPouch { v: 1; at: string; live: boolean; items: { t: number; id: string; n: number }[] }
/** A pouch that changed has to hold still this long before cook.json is worked out again (ten apples picked up one
 *  after another are one new menu, not ten). */
export const POUCH_SETTLE_MS = 4000;
/** A pouch.json older than this is not the live bag (the reader stopped, or no page is open). */
export const POUCH_FRESH_MS = 90_000;

export interface LiveDeps {
  reader: string;
  cemuRunning: () => Promise<boolean>;
  log: (line: string) => void;
  /** Tests pass a fake; the real one is child_process.spawn. */
  spawn?: (exe: string, args: string[]) => ChildProcess;
  now?: () => number;
}

export class BotwLive {
  private p: BotwPaths;
  private d: LiveDeps;
  private child: ChildProcess | null = null;
  /** When the reader last gave up (nothing believable): rest RETRY_MS before trying again; 0 = ready. */
  private gaveUpAt = 0;
  private now: () => number;
  private rec: ReturnType<typeof setInterval> | null = null;
  private lastAt = '';
  constructor(p: BotwPaths, d: LiveDeps) { this.p = p; this.d = d; this.now = d.now ?? Date.now; }
  get reading(): boolean { return this.child !== null; }

  async tick(): Promise<void> {
    if (!existsSync(this.d.reader)) return;
    const running = await this.d.cemuRunning();
    if (!running) {
      this.gaveUpAt = 0;
      // A reader killed with the brain can leave pos.json saying live: it is not.
      if (!this.child) { const pos = readBotwPos(this.p); if (pos?.live) writeFileAtomic(posFile(this.p), JSON.stringify({ ...pos, live: false })); }
      return;
    }
    if (this.child || (this.gaveUpAt && this.now() - this.gaveUpAt < RETRY_MS)) return;
    this.gaveUpAt = 0;
    const args = ['--botw-live', '--out', posFile(this.p), '--live', liveFile(this.p), '--pouch', pouchFile(this.p), '--want', wantFile(this.p), '--parent', String(process.pid)];
    const child = (this.d.spawn ?? ((exe, a) => spawn(exe, a, { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })))(this.d.reader, args);
    this.child = child;
    this.startWalkLog();
    let buf = '';
    child.stdout?.on('data', (b: Buffer) => {
      buf += b.toString('utf8');
      for (let i; (i = buf.indexOf('\n')) >= 0; buf = buf.slice(i + 1)) {
        try { const m = JSON.parse(buf.slice(0, i)) as { botw?: string; detail?: string }; if (m.botw) this.d.log(`botw live ${m.botw}: ${m.detail ?? ''}`); } catch { /* not ours */ }
      }
    });
    const done = (code: number | null) => {
      if (this.child !== child) return;
      this.child = null;
      this.stopWalkLog();
      this.cookFromSave();   // the live bag is gone with the reader: On the Menu is the save's again
      // NOT_READY (no base in Cemu's log yet) and a plain exit simply try again at the next look
      if (code === GAVE_UP) this.gaveUpAt = this.now();
    };
    child.on('exit', done);
    child.on('error', e => { this.d.log(`botw live: could not start the reader (${e.message})`); done(GAVE_UP); });
  }

  stop(): void { try { this.child?.kill(); } catch { /* gone */ } this.child = null; this.stopWalkLog(); }

  private startWalkLog(): void {
    this.stopWalkLog();
    const dir = walksDir(this.p);
    try {
      mkdirSync(dir, { recursive: true });
      const keep = new Date(Date.now() - WALK_KEEP_DAYS * 86_400_000).toISOString().slice(0, 10);
      for (const f of readdirSync(dir)) if (/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f) && f.slice(0, 10) < keep) rmSync(path.join(dir, f), { force: true });
    } catch { /* the log is a nice-to-have */ }
    this.rec = setInterval(() => { this.logWalk(); this.lookPouch(); }, WALK_EVERY_MS);
    this.rec.unref?.();
  }
  private stopWalkLog(): void { if (this.rec) clearInterval(this.rec); this.rec = null; }
  // ---- the live bag -> cook.json (BG10). A 2 s look at pouch.json's time, never Cemu; the menu is worked out only when
  // the cookable part of the bag changed and then held still for POUCH_SETTLE_MS.
  private pouchAt = 0; private bagSig = ''; private bagSince = 0; private cookedSig = ''; private cookMtime = 0;
  lookPouch(): void {
    let m = 0; try { m = statSync(pouchFile(this.p)).mtimeMs; } catch { return; }
    if (m !== this.pouchAt) {
      this.pouchAt = m;
      const pouch = this.readPouch(); if (!pouch) return;
      const sig = JSON.stringify(pouch.items.filter(i => i.t >= 7).map(i => [i.id, i.n]));
      if (sig !== this.bagSig) { this.bagSig = sig; this.bagSince = this.now(); }
    }
    // a save landed meanwhile and the save watcher wrote the save's menu over ours: the live bag is still the truth
    if (this.cookedSig) { let cm = 0; try { cm = statSync(path.join(this.p.dir, 'cook.json')).mtimeMs; } catch { /* gone */ } if (cm !== this.cookMtime) this.cookedSig = ''; }
    if (this.bagSig && this.bagSig !== this.cookedSig && this.now() - this.bagSince >= POUCH_SETTLE_MS) {
      const pouch = this.readPouch(); if (!pouch) return;
      this.cookedSig = this.bagSig;
      this.cookFromPouch(pouch);
    }
  }
  private readPouch(): BotwPouch | null {
    try {
      const j = JSON.parse(readFileSync(pouchFile(this.p), 'utf8')) as BotwPouch;
      if (j?.v !== 1 || !j.live || !Array.isArray(j.items) || this.now() - Date.parse(j.at) > POUCH_FRESH_MS) return null;
      return j;
    } catch { return null; }
  }
  private savedAt(): string | null {
    try { const st = JSON.parse(readFileSync(path.join(this.p.dir, 'state.json'), 'utf8')) as { savedAt?: string }; return st.savedAt ?? null; } catch { return null; }
  }
  /** cook.json from the live pouch: the same menu maker, fed what he holds now. `bag` (id, name, count of everything
   *  that is not gear) and `bagAt` tell the Journal this is the live bag; savedAt stays the save's, as its rule asks. */
  private cookFromPouch(pouch: BotwPouch): void {
    const savedAt = this.savedAt(); if (!savedAt || !existsSync(this.p.db)) return;
    try {
      const db = new DatabaseSync(this.p.db, { readOnly: true });
      try {
        const menu = cookMenu(db, { savedAt, gear: pouch.items.map(i => ({ id: i.id, n: i.t >= 7 ? i.n : 0 })) });
        const name = db.prepare('SELECT name FROM items WHERE id = ?');
        const count = new Map<string, number>();
        for (const i of pouch.items) if (i.t >= 7 && i.n > 0) count.set(i.id, (count.get(i.id) ?? 0) + i.n);
        const bag = [...count].map(([id, n]) => [id, (name.get(id) as { name?: string } | undefined)?.name ?? id, n]);
        const f = path.join(this.p.dir, 'cook.json');
        writeFileAtomic(f, JSON.stringify({ ...menu, bagAt: pouch.at, bag }));
        this.cookMtime = statSync(f).mtimeMs;
      } finally { db.close(); }
    } catch (e) { this.d.log(`botw live: could not work out the menu from the live bag (${(e as Error).message})`); }
  }
  /** The reader stopped: if cook.json was made from the live bag, make it from the save again. */
  private cookFromSave(): void {
    this.bagSig = ''; this.cookedSig = ''; this.pouchAt = 0;
    try {
      const f = path.join(this.p.dir, 'cook.json');
      if (!(JSON.parse(readFileSync(f, 'utf8')) as { bagAt?: string }).bagAt || !existsSync(this.p.db)) return;
      const st = JSON.parse(readFileSync(path.join(this.p.dir, 'state.json'), 'utf8')) as { savedAt: string; gear: { id: string; n: number }[] };
      const db = new DatabaseSync(this.p.db, { readOnly: true });
      try { writeFileAtomic(f, JSON.stringify(cookMenu(db, st))); } finally { db.close(); }
    } catch { /* no cook.json, or no save yet: nothing to put back */ }
  }

  /** One line when Link has moved since the last one (pos.json's own time changes on each move). */
  logWalk(): void {
    const p = readBotwPos(this.p);
    if (!p?.live || p.at === this.lastAt) return;
    this.lastAt = p.at;
    const r1 = (n: number) => Math.round(n * 10) / 10;
    try { appendFileSync(path.join(walksDir(this.p), p.at.slice(0, 10) + '.jsonl'), JSON.stringify({ t: p.at, x: r1(p.x), y: r1(p.y), z: r1(p.z), f: Math.round(p.facing) }) + '\n'); } catch { /* skip a beat */ }
  }
}

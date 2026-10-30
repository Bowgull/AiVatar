// The update engine (his picks, 2026-10-30): ONE updater for Samara and Aang on both machines. Everything that can be
// updated is a source (Samara's own code from GitHub, the castLabs engine, Aang's brain); each machine adds its own
// install steps (macupdate.ts / macsource.ts on the Mac, pcupdate.ts / engineupdate.ts on the PC). The rules live here,
// once: his UPDATE key, overnight (2-5 am, idle half an hour, never in a call or a game), skip, put away, trial and
// going back. Before today the overnight rule was written three times (main.ts twice, macmain.ts once).
// Its own file, with no Electron, so the rules are tested on their own (test/updateengine.test.ts).
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------- versions
/** "44.5.1+wvcus" -> "44.5.1". */
export const plain = (v: string): string => String(v ?? '').replace(/\+.*$/, '');
export const isVersion = (v: unknown): v is string => typeof v === 'string' && /^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(v);
/**
 * Is a newer than b? The one comparison for every source (it used to be two: ghrelease.ts and engineupdate.ts).
 * A build tag ("+wvcus") is ignored. A that is not x.y.z is never newer; b that is not x.y.z (a hand install, the PC's
 * old fingerprints) is older than any release.
 */
export function newer(a: string, b: string): boolean {
  if (!isVersion(plain(a))) return false;
  if (!isVersion(plain(b))) return true;
  const x = plain(a).split('.').map(Number), y = plain(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i]! > y[i]!;
  return false;
}

// ---------------------------------------------------------------- the rules
/** What the rules look at, read fresh each time. */
export interface Moment { now: Date; idleSeconds: number; inCall: boolean; inGame: boolean }
/** His overnight hours and idle time (sheet 35): between 2 and 5 am, after half an hour with no keyboard or mouse. */
export const NIGHT = { from: 2, to: 5, idleSeconds: 30 * 60 } as const;

/** Why not right now, in his words, or null when it may go (a call or a game always wins). */
export function notNow(m: Pick<Moment, 'inCall' | 'inGame'>): string | null {
  if (m.inCall) return "You're in a call. Restart when it's over.";
  if (m.inGame) return 'Not during a game.';
  return null;
}
/** May an update go in by itself now? Only with his overnight toggle on, in the night window, idle, and quiet. */
export function overnightNow(m: Moment, overnightOn: boolean): boolean {
  const h = m.now.getHours();
  return overnightOn && h >= NIGHT.from && h < NIGHT.to && m.idleSeconds >= NIGHT.idleSeconds && notNow(m) === null;
}
/** Aang's brain (his pick, 2026-10-30: "by itself, quietly"): any time he has been away half an hour and is not in a
 *  call or a game. A brain restart takes seconds and closes no window. */
export function quietNow(m: Moment): boolean {
  return m.idleSeconds >= NIGHT.idleSeconds && notNow(m) === null;
}

// ---------------------------------------------------------------- skip and put away
/**
 * His ... menu on the key (sheet 35): Skip for good (never offered again; also where a version that failed its trial
 * goes) and Put it away (kept on file until "Check for updates"). One pair of plain-text lists per source.
 */
export class VersionLists {
  private readonly skipFile: string;
  private readonly filedFile: string;
  constructor(skipFile: string, filedFile: string) { this.skipFile = skipFile; this.filedFile = filedFile; }
  private read(f: string): string[] { try { return readFileSync(f, 'utf8').split(/\s+/).filter(Boolean); } catch { return []; } }
  private add(f: string, v: string): void { try { mkdirSync(path.dirname(f), { recursive: true }); appendFileSync(f, plain(v) + '\n'); } catch { /* best effort */ } }
  skipped(v: string): boolean { return this.read(this.skipFile).includes(plain(v)); }
  filed(v: string): boolean { return this.read(this.filedFile).includes(plain(v)); }
  /** Not to be offered: skipped for good, failed, or put away. */
  blocked(v: string): boolean { return this.skipped(v) || this.filed(v); }
  skip(v: string): void { this.add(this.skipFile, v); }
  file(v: string): void { this.add(this.filedFile, v); }
  /** "Check for updates": what was put away comes back. */
  unfile(): void { try { writeFileSync(this.filedFile, ''); } catch { /* none */ } }
}

// ---------------------------------------------------------------- the engine
/** One group of lines on the key's card (sheet 35): SAMARA, SAMARA'S ENGINE. */
export interface CardGroup { name: string; items: { text: string; note?: string; key?: string; on?: boolean }[] }
/** What a source has waiting for his key. */
export interface Offer {
  version: string; since: number; title?: string; groups: CardGroup[]; canBack?: boolean; lines?: string[];
  /** Sheet 105: castLabs wants him to sign in before the engine can be signed for video ('ask': the one key;
   *  'waiting': Terminal is open). While set, the key shows "Sign in to castLabs" instead of Restart now. */
  signin?: 'ask' | 'waiting';
  /** Sheet 105: the one line under the lines ("Your engine today is 6 weeks behind Chrome's security fixes..."). */
  behind?: string;
}
/**
 * A thing that updates. `ready` is set once the update is downloaded, checked against its seal and made ready beside
 * the one running; `go` puts it in (the caller restarts); `back` goes to the version before.
 */
export interface Source {
  readonly id: 'samara' | 'engine' | 'brain';
  /** On the key (Samara, the engine) or quiet (Aang's brain: his pick, by itself while he is away). */
  readonly onKey: boolean;
  ready(): Offer | null;
  check(why: string): Promise<void>;
  go(): Promise<{ ok: boolean; why?: string }>;
  file(): void;
  skip(): void;
  canBack(): boolean;
  back(): boolean;
  /** "Check for updates": what was put away comes back, and a look right now. */
  checkNow(): void;
  /** Sheet 105, the engine only: his click on "Sign in to castLabs". */
  signin?(): Promise<boolean>;
}

export interface EngineOptions {
  sources: Source[];
  /** The moment as the machine sees it (Electron's idle time, Samara's call state, the PC's game watch). */
  moment: () => Moment;
  /** His overnight toggle, read fresh. */
  overnight: () => boolean;
  /** The key's card changed. */
  changed: (card: Offer | null) => void;
  /** Just before anything goes in (the Mac's script closes Samara itself, so what to say afterwards is kept first). */
  beforeGo?: (what: { overnight: boolean; title: string; lines: string[] }) => void;
  /** Something was put in: close the windows and restart (the Mac's script does it itself; the PC's pet restarts). */
  restart: (what: { sources: string[]; overnight: boolean; title: string; lines: string[] }) => void;
  log?: (s: string) => void;
}

/** Ten minutes: how often the overnight and quiet rules are looked at. */
export const TICK_MS = 10 * 60_000;

export class UpdateEngine {
  private timers: NodeJS.Timeout[] = [];
  private going = false;
  private readonly o: EngineOptions;
  constructor(o: EngineOptions) { this.o = o; }

  private get keyed(): Source[] { return this.o.sources.filter((s) => s.onKey); }
  source(id: Source['id']): Source | undefined { return this.o.sources.find((s) => s.id === id); }

  /** The key's one card: Samara's version first, then the engine's; one title, one Restart now. */
  card(): Offer | null {
    const ready = this.keyed.map((s) => s.ready()).filter((r): r is Offer => !!r);
    if (!ready.length) return null;
    const [first] = ready;
    return {
      version: ready.map((r) => r.version).join('+'), since: Math.min(...ready.map((r) => r.since)),
      ...(first!.title ? { title: first!.title } : {}),
      groups: ready.flatMap((r) => r.groups), canBack: this.keyed.some((s) => s.canBack()),
      lines: ready.flatMap((r) => r.lines ?? r.groups.flatMap((g) => g.items.filter((i) => !i.key || i.on !== false).map((i) => i.text))),
      ...(ready.find((r) => r.signin)?.signin ? { signin: ready.find((r) => r.signin)!.signin! } : {}),
      ...(ready.find((r) => r.behind)?.behind ? { behind: ready.find((r) => r.behind)!.behind! } : {}),
    };
  }
  show(): void { this.o.changed(this.card()); }

  /** His Restart now, or overnight: every source on the key that is ready goes in, Samara first. */
  async go(overnight = false): Promise<{ ok: boolean; why?: string }> {
    const why = notNow(this.o.moment());
    if (why) return { ok: false, why };
    if (this.going) return { ok: false, why: 'Already updating.' };
    const card = this.card();
    if (card?.signin) return { ok: false, why: 'Sign in to castLabs first, so the new engine plays video.' };
    const ready = this.keyed.filter((s) => s.ready());
    if (!card || !ready.length) return { ok: false, why: 'The update is not ready yet. It will show up again when it is.' };
    this.going = true;
    try {
      this.o.beforeGo?.({ overnight, title: card.title ?? 'Samara update', lines: card.lines ?? [] });
      const done: string[] = [];
      for (const s of ready) {
        const r = await s.go();
        if (!r.ok) { if (!done.length) return r; break; }
        done.push(s.id);
      }
      this.o.log?.(`update: putting in ${done.join(' and ')}${overnight ? ' overnight' : ''}`);
      this.o.restart({ sources: done, overnight, title: card.title ?? 'Samara update', lines: card.lines ?? [] });
      return { ok: true };
    } finally { this.going = false; }
  }

  /** The ... menu, for whatever the key shows (Samara's first). */
  act(a: 'file' | 'skip' | 'check' | 'back'): boolean {
    if (a === 'check') { for (const s of this.o.sources) s.checkNow(); return true; }
    if (a === 'back') { const s = this.keyed.find((x) => x.canBack()); return s ? s.back() : false; }
    const s = this.keyed.find((x) => x.ready());
    if (!s) return false;
    if (a === 'file') s.file(); else s.skip();
    this.show();
    return true;
  }

  /** Sheet 105: his click on "Sign in to castLabs" (Terminal opens with castLabs' sign-in typed). */
  async signin(): Promise<boolean> {
    const s = this.o.sources.find((x) => x.signin && x.ready()?.signin === 'ask');
    const ok = s ? await s.signin!() : false;
    this.show();
    return ok;
  }

  /** One look at the rules: overnight for the key, quiet for the brain. */
  async tick(): Promise<void> {
    const m = this.o.moment();
    if (this.card() && overnightNow(m, this.o.overnight())) { await this.go(true); return; }
    for (const s of this.o.sources) if (!s.onKey && s.ready() && quietNow(m)) { const r = await s.go(); if (r.ok) this.o.log?.(`update: ${s.id} put in quietly`); }
  }

  /** Checks on start (half a minute in), every hour, and when asked (the release nudge, his check). */
  start(): void {
    this.timers.push(setTimeout(() => void this.checkAll('start'), 30_000));
    this.timers.push(setInterval(() => void this.checkAll('hourly'), 60 * 60_000));
    this.timers.push(setInterval(() => void this.tick(), TICK_MS));
    for (const t of this.timers) t.unref?.();
  }
  stop(): void { this.timers.forEach(clearTimeout); this.timers = []; }
  async checkAll(why: string): Promise<void> {
    for (const s of this.o.sources) { try { await s.check(why); } catch (e) { this.o.log?.(`update: ${s.id} check: ${(e as Error).message}`); } }
    this.show();
  }
}

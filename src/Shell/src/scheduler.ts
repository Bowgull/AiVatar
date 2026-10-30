// The scheduler engine (2026-10-30): one owner for every background job, in the brain and in Samara.
//
// Before this, about 40 setIntervals in Samara and 20 in the brain each kept their own clock, and only a few looked at
// "he is in a call or a game" before doing something heavy. Now:
//   sched.every(name, ms, fn, opts)   a repeating job. opts.quiet: wait while he is busy (call, game, full screen);
//                                     opts.idleOnly: wait until he has been away; opts.catchUp: remember the last run on
//                                     disk, so a restart (Shadow restarts often) neither repeats it early nor forgets it
//   sched.at(when, fn)                a one-shot at an exact moment (any distance: setTimeout tops out near 24.8 days)
//   sched.wake()                      "quiet may have ended": waiting jobs look again at once (no polling needed)
//   sched.list()                      what runs when, for diagnostics
// A job never runs twice at once: a run still going when the next is due is skipped and counted, never stacked.
// A job held by quiet runs ONCE when quiet ends, not once per missed beat.
//
// ONE FILE, TWO COPIES, like store.ts: src/Core/src/scheduler.ts and src/Shell/src/scheduler.ts must match (test/twins.test.ts).
import { Store } from './store.ts';

/** The clock the scheduler reads and sets timers on. Tests pass a fake one. */
export interface SchedClock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(h: unknown): void;
}

export const realClock: SchedClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => { const t = setTimeout(fn, ms); t.unref?.(); return t; },
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export interface EveryOpts {
  /** Wait while he is busy (sched's quietNow says so): no heavy work during a call, a game, a full-screen video. */
  quiet?: boolean;
  /** Wait until he has been idle this many seconds (true: 5 minutes). */
  idleOnly?: boolean | number;
  /** Remember the last run on disk: after a restart, run soon if one was due while off, else wait out the rest. */
  catchUp?: boolean;
  /** The first run this long after it is added (ms). Default: one full interval. With catchUp, the soonest after start. */
  first?: number;
}

export interface AtOpts {
  /** Shown in the list. */
  name?: string;
  /** Wait while he is busy, then run (an exact alarm should not set this). */
  quiet?: boolean;
}

export interface JobInfo {
  name: string;
  /** ms between runs; 0 for a one-shot. */
  every: number;
  flags: string[];
  /** When it next runs (or next looks again, while waiting). */
  next: number;
  /** Last run started, 0 for never. */
  last: number;
  /** How long the last run took (ms). */
  took: number;
  runs: number;
  running: boolean;
  /** Why it is held right now ('' when not). */
  waiting: '' | 'quiet' | 'idle';
  /** Due while busy or not idle (each due moment counted once). */
  heldQuiet: number;
  /** Due while the last run was still going. */
  overlapped: number;
  error: string;
}

export interface SchedOpts {
  clock?: SchedClock;
  /** He is busy (call, game, full screen): the one quiet source. Returns why, or ''/false when not. */
  quietNow?: () => string | boolean;
  /** Seconds since his last key or mouse move (for idleOnly). */
  idleSeconds?: () => number;
  /** Where catchUp jobs keep their last run times. Left out, catchUp only lasts until a restart. */
  file?: string;
  /** While held, look again this often (ms) even without a wake(). Default 60 s. */
  recheckMs?: number;
  log?: (line: string) => void;
}

interface Job {
  name: string;
  every: number;
  fn: () => unknown;
  o: EveryOpts;
  once: boolean;
  timer: unknown;
  next: number;
  last: number;
  took: number;
  runs: number;
  running: boolean;
  waiting: '' | 'quiet' | 'idle';
  heldQuiet: number;
  overlapped: number;
  error: string;
}

/**
 * No timer waits longer than a minute: it wakes, reads the wall clock and waits again. A timer's own clock stops while
 * the computer sleeps, so one long wait would run late by however long the lid was shut (reminders.ts re-armed every
 * minute for the same reason). It also covers a clock change and setTimeout's 24.8-day limit.
 */
const MAX_WAIT = 60_000;
const IDLE_DEFAULT_S = 5 * 60;

type Lasts = Record<string, number>;
const checkLasts = (raw: unknown): Lasts | null => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: Lasts = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  return out;
};

export class Scheduler {
  private readonly jobs = new Map<string, Job>();
  private readonly c: SchedClock;
  private lasts: Store<Lasts> | null;
  private seq = 0;
  private readonly o: SchedOpts;
  quietNow: () => string | boolean;
  idleSeconds: () => number;

  constructor(o: SchedOpts = {}) {
    this.o = o;
    this.c = o.clock ?? realClock;
    this.quietNow = o.quietNow ?? (() => false);
    this.idleSeconds = o.idleSeconds ?? (() => Infinity);
    this.lasts = o.file ? new Store<Lasts>({ file: o.file, fallback: () => ({}), check: checkLasts, debounceMs: 2000 }) : null;
  }

  /**
   * Where catchUp jobs keep their last runs, when it is only known after start (Samara's state folder). Jobs added
   * before this catch up only within this run. A file already set stays.
   */
  useFile(file: string): void {
    if (this.lasts) return;
    this.lasts = new Store<Lasts>({ file, fallback: () => ({}), check: checkLasts, debounceMs: 2000 });
    const now = this.c.now();
    for (const j of this.jobs.values()) {
      const last = j.o.catchUp && !j.once ? this.lasts.get()[j.name] : undefined;
      // Not run yet in this start: timed as if it had been added now, with the file.
      if (last !== undefined && last <= now && !j.runs) { j.last = last; j.next = Math.max(last + j.every, now + Math.max(0, j.o.first ?? 0)); this.arm(j); }
    }
  }

  /** A repeating job. Adding one with a name already used replaces it. */
  every(name: string, ms: number, fn: () => unknown, o: EveryOpts = {}): void {
    this.cancel(name);
    const now = this.c.now();
    const every = Math.max(1, ms);
    const job = this.make(name, every, fn, o, false);
    const last = o.catchUp ? this.lasts?.get()[name] : undefined;
    const soonest = now + Math.max(0, o.first ?? 0);
    if (last !== undefined && last <= now) {
      job.last = last;
      job.next = Math.max(last + every, soonest);
    } else job.next = now + (o.first ?? every);
    this.jobs.set(name, job);
    this.arm(job);
  }

  /** A one-shot at `when` (epoch ms or a Date). Past moments run at once (soon). Returns a cancel function. */
  at(when: number | Date, fn: () => unknown, o: AtOpts = {}): () => void {
    const due = typeof when === 'number' ? when : when.getTime();
    const name = o.name ?? `at#${++this.seq}`;
    this.cancel(name);
    const job = this.make(name, 0, fn, { quiet: o.quiet }, true);
    job.next = due;
    this.jobs.set(name, job);
    this.arm(job);
    return () => { if (this.jobs.get(name) === job) this.cancel(name); };
  }

  /** Stop a job. A run already going finishes; no further runs. */
  cancel(name: string): void {
    const j = this.jobs.get(name);
    if (!j) return;
    if (j.timer !== null) this.c.clearTimeout(j.timer);
    j.timer = null;
    this.jobs.delete(name);
  }

  has(name: string): boolean { return this.jobs.has(name); }

  /** Run a job now (outside its beat), unless it is already running. Its next beat counts from now. */
  runNow(name: string): void { const j = this.jobs.get(name); if (j) this.fire(j, true); }

  /** Quiet or idle may have changed: every held job looks again now. */
  wake(): void { const now = this.c.now(); for (const j of [...this.jobs.values()]) if (j.waiting) { j.next = now; this.fire(j, false); } }

  /** What runs when, soonest first. */
  list(): JobInfo[] {
    return [...this.jobs.values()].sort((a, b) => a.next - b.next).map((j) => ({
      name: j.name, every: j.every,
      flags: [j.o.quiet ? 'quiet' : '', j.o.idleOnly ? 'idle' : '', j.o.catchUp ? 'catch-up' : '', j.once ? 'once' : ''].filter(Boolean),
      next: j.next, last: j.last, took: j.took, runs: j.runs, running: j.running, waiting: j.waiting,
      heldQuiet: j.heldQuiet, overlapped: j.overlapped, error: j.error,
    }));
  }

  /** Clear every timer and save the last-run times (on quit). Jobs added afterwards run as normal. */
  stop(): void {
    for (const name of [...this.jobs.keys()]) this.cancel(name);
    if (this.lasts?.pending) this.lasts.flush();
  }

  private make(name: string, every: number, fn: () => unknown, o: EveryOpts, once: boolean): Job {
    return { name, every, fn, o, once, timer: null, next: 0, last: 0, took: 0, runs: 0, running: false, waiting: '', heldQuiet: 0, overlapped: 0, error: '' };
  }

  private arm(j: Job): void {
    if (this.jobs.get(j.name) !== j) return;
    if (j.timer !== null) this.c.clearTimeout(j.timer);
    const wait = Math.min(MAX_WAIT, Math.max(0, j.next - this.c.now()));
    j.timer = this.c.setTimeout(() => { j.timer = null; this.fire(j, false); }, wait);
  }

  private held(j: Job): '' | 'quiet' | 'idle' {
    if (j.o.quiet) { try { if (this.quietNow()) return 'quiet'; } catch { /* a broken source never blocks */ } }
    if (j.o.idleOnly) {
      const need = typeof j.o.idleOnly === 'number' ? j.o.idleOnly : IDLE_DEFAULT_S;
      try { if (this.idleSeconds() < need) return 'idle'; } catch { /* as above */ }
    }
    return '';
  }

  private fire(j: Job, forced: boolean): void {
    if (this.jobs.get(j.name) !== j) return;
    const now = this.c.now();
    // Woken early (MAX_WAIT): not due yet by the wall clock, so wait again.
    if (!forced && now < j.next) { this.arm(j); return; }
    if (!forced) {
      const why = this.held(j);
      if (why) {
        if (!j.waiting) j.heldQuiet++;
        j.waiting = why;
        j.next = now + Math.min(this.o.recheckMs ?? 60_000, j.once ? Infinity : j.every);
        this.arm(j);
        return;
      }
    }
    j.waiting = '';
    if (j.running) {
      j.overlapped++;
      this.o.log?.(`scheduler: ${j.name} still running, this beat skipped`);
      if (!j.once) { j.next = now + j.every; this.arm(j); }
      else { j.next = now + 1000; this.arm(j); }
      return;
    }
    j.running = true; j.last = now; j.runs++;
    if (j.once) this.jobs.delete(j.name);
    else {
      j.next = now + j.every;
      this.arm(j);
      if (j.o.catchUp) this.lasts?.update((v) => { v[j.name] = now; });
    }
    const done = (e?: unknown) => {
      j.running = false; j.took = this.c.now() - now;
      if (e !== undefined) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg !== j.error) this.o.log?.(`scheduler: ${j.name} failed: ${msg}`);
        j.error = msg;
      } else j.error = '';
    };
    let r: unknown;
    try { r = j.fn(); } catch (e) { done(e); return; }
    if (r && typeof (r as Promise<unknown>).then === 'function') (r as Promise<unknown>).then(() => done(), (e) => done(e ?? 'failed'));
    else done();
  }
}

/** One line per job, for a log or a diagnostics page. */
export function describeJobs(list: JobInfo[], now: number): string[] {
  const span = (ms: number) => ms < 60_000 ? `${Math.round(ms / 1000)} s` : ms < 3_600_000 ? `${Math.round(ms / 60_000)} min` : `${(ms / 3_600_000).toFixed(ms % 3_600_000 ? 1 : 0)} h`;
  return list.map((j) => {
    const bits = [j.every ? `every ${span(j.every)}` : 'once', j.flags.filter((f) => f !== 'once').join(' ')];
    const when = j.running ? 'running' : j.waiting ? `held (${j.waiting})` : `next in ${span(Math.max(0, j.next - now))}`;
    return `${j.name}: ${bits.filter(Boolean).join(', ')}; ${when}; ran ${j.runs}x${j.overlapped ? `, ${j.overlapped} overlapped` : ''}${j.heldQuiet ? `, held ${j.heldQuiet}x` : ''}${j.error ? `; last error: ${j.error}` : ''}`;
  });
}

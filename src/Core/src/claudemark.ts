// C5 (2026-10-21): the one mark over Aang's head while Claude works, and the wooden chime that goes with it,
// worked out from the brain's own claude.jobs / claude.wait in ONE place. The pet only draws what it is told
// (`claude.mark`), the same way it already only draws `claude.working`: two programs guessing the same state from
// the same lists would sooner or later disagree about what is over his head.
//
// His calls (sheets 45d/45e, COCKPIT-BUILD.md "Marks and glows"): one colour per mark, nothing else over his head.
// Blocking first: a permission (pale blue) beats a question (lavender) beats a plan ready (sage); then working
// (honey); then failed (coral skull); then paused (slate). A finished step is a quick SMALL sea tick, silent; JOB COMPLETE
// (the terracotta seal and the done chime) only when every task on the list is ticked.
import type { Job, WaitItem } from './claudelink.ts';
import { STALE_MS, sessionList, thisMachine } from './sessionlist.ts';
import type { HookLike, LaunchedLike, Machine, Session, SessionInput, SessionSource, SessionState } from './sessionlist.ts';

/** What sits over his head for as long as it is true. */
// 'done' (2026-10-22, his pick): the teal tick stays while any finished job is unread; no glow, just the tick.
export type MarkKind = 'none' | 'permission' | 'question' | 'plan' | 'working' | 'failed' | 'done' | 'paused';
/** A moment, shown for a couple of seconds over whatever the steady mark is. */
export type MarkFlash = 'step' | 'complete';
/**
 * Aang's four sounds, by file name (assets/aang/sfx/chimes). Cut to four 2026-10-22 (his yes): ONE needs-you for a
 * permission, a question or a plan (the tag colour says which), done for the whole job, failed, and the timer's
 * three wood knocks. A finished step is silent (the sea tick only).
 */
export type ChimeName = 'needs-you' | 'done' | 'failed' | 'timer';

export interface MarkMsg {
  t: 'claude.mark';
  mark: MarkKind;
  flash?: MarkFlash;
  sound?: ChimeName;
  /** The project the mark is about, so a click (or a log line) can name it. */
  what?: string;
}

/**
 * Failure has no signal yet: the aang-link mod reports `turn.end { aborted }`, and aborted only ever means he (or
 * Pause) stopped it, never that it broke. This is the one hook: the day the tracker sets `failed` on a Job (from an
 * error on turn.end, say), the coral skull and the failed chime follow with nothing else to change.
 */
const failedJob = (j: Job): boolean => (j as Job & { failed?: boolean }).failed === true;

export class MarkDeriver {
  private seenWaits = new Set<string>();
  /** Per session: how many tasks were ticked and how many there were, last time we looked. */
  private ticked = new Map<string, { done: number; total: number }>();
  private failedSeen = new Set<string>();
  private last = '';
  private primed = false;

  /**
   * Feed it the latest lists; get back the message for the pet when something changed (or a moment happened),
   * else null. `alsoWorking` is the older working signal (sessions Aang launched, the MacBook), so those still
   * show the honey mark while there is no linked job saying so.
   */
  update(jobs: readonly Job[], waits: readonly WaitItem[], alsoWorking: boolean | string = false): MarkMsg | null {
    // The first look only learns what is already there: a brain restart must not chime for a question asked an hour ago.
    const first = !this.primed; this.primed = true;
    let sound: ChimeName | undefined;
    let flash: MarkFlash | undefined;
    let what: string | undefined;

    // New waiting items: one needs-you chime whatever the kind; the most pressing one names the project.
    const rank: Record<string, number> = { permission: 3, question: 2, plan: 1 };
    let best: WaitItem | undefined;
    for (const w of waits) if (!this.seenWaits.has(w.id) && (!best || rank[w.kind]! > rank[best.kind]!)) best = w;
    this.seenWaits = new Set(waits.map(w => w.id));
    if (best && !first) { sound = 'needs-you'; what = best.project; }

    // Ticks: a task newly ticked is a step; the last one ticked is the whole job.
    const live = new Set<string>();
    for (const j of jobs) {
      live.add(j.id);
      const total = j.tasks.length, done = j.tasks.filter(t => t.status === 'completed').length;
      const was = this.ticked.get(j.id);
      this.ticked.set(j.id, { done, total });
      if (first || !was || total === 0) continue;
      // A brand new list (Claude rewrote it) only counts if it really moved forward.
      if (done <= was.done) continue;
      if (done === total) {
        flash = 'complete'; what ??= j.project;
      } else if (flash !== 'complete') {
        flash = 'step'; what ??= j.project;
      }
    }
    for (const id of [...this.ticked.keys()]) if (!live.has(id)) this.ticked.delete(id);

    // Failed: once per job, when it first says so.
    for (const j of jobs) {
      if (failedJob(j) && !this.failedSeen.has(j.id)) { this.failedSeen.add(j.id); if (!first) { sound ??= 'failed'; what ??= j.project; } }
      if (!failedJob(j)) this.failedSeen.delete(j.id);
    }
    for (const id of [...this.failedSeen]) if (!live.has(id)) this.failedSeen.delete(id);

    // One chime at a time: something blocking that lands in the same breath as a tick wins the sound, and the
    // tick still shows, so he gets both. A step's tick is silent (2026-10-22, "pointless").
    if (!sound && flash === 'complete') sound = 'done';

    const mark = steadyMark(jobs, waits, alsoWorking);
    const key = `${mark.mark}|${mark.what ?? ''}`;
    const changed = key !== this.last;
    this.last = key;
    if (!changed && !flash && !sound) return null;
    return { t: 'claude.mark', mark: mark.mark, ...(flash ? { flash } : {}), ...(sound ? { sound } : {}), ...((what ?? mark.what) ? { what: what ?? mark.what } : {}) };
  }

  /** What to tell a pet that has just connected: the steady mark only, no moment and no chime. */
  now(jobs: readonly Job[], waits: readonly WaitItem[], alsoWorking: boolean | string = false): MarkMsg {
    const m = steadyMark(jobs, waits, alsoWorking);
    return { t: 'claude.mark', mark: m.mark, ...(m.what ? { what: m.what } : {}) };
  }
}

/** The steady mark, by his order: blocking (permission, question, plan), then working, failed, done (unread), paused. */
export function steadyMark(jobs: readonly Job[], waits: readonly WaitItem[], alsoWorking: boolean | string = false): { mark: MarkKind; what?: string } {
  for (const kind of ['permission', 'question', 'plan'] as const) {
    const w = waits.find(x => x.kind === kind);
    if (w) return { mark: kind, what: w.project };
  }
  // A hook-only session waiting on him (claudeNow puts its project here): needs you.
  if (typeof alsoWorking === 'string') return { mark: 'question', what: alsoWorking };
  const working = jobs.find(j => j.phase === 'working');
  if (working) return { mark: 'working', what: working.project };
  if (alsoWorking) return { mark: 'working' };
  const failed = jobs.find(j => failedJob(j) && j.phase !== 'ended');
  if (failed) return { mark: 'failed', what: failed.project };
  // 2026-10-22: a finished job he has not X'd or opened yet. A click on the tick shows them (claudeBusy lists them).
  const done = jobs.find(j => j.unread === true && j.phase !== 'working');
  if (done) return { mark: 'done', what: done.title || done.project };
  const paused = jobs.find(j => j.phase === 'paused');
  if (paused) return { mark: 'paused', what: paused.project };
  return { mark: 'none' };
}

// ------------------------------------------------------------------ ONE answer to "is Claude working?" (2026-10-21)
//
// His report: the honey mark was over Aang's head, and clicking it said "Claude isn't working on anything right now".
// The mark and the card asked two different questions: the mark lit for the link jobs OR the old working signal (the
// hook tracker, which also counted a session that had finished and was only idle-waiting for his next message, and a
// launched job left "working" in launched.json), while the card listed the link jobs and the hook sessions, filtered
// its own way. Now there is one list, here, and the mark, the old `claude.working` and the card are all read off it:
// whatever lights the mark is exactly what the card names, for every source.

/** A hook-tracked session with no hook event and no transcript write for this long has died with its turn. */
export const HOOK_STALE_MS = STALE_MS;
export type { HookLike, LaunchedLike };

/**
 * One session Claude is busy with, as the mark-click card and the pet read it: a row of the sessions engine
 * (sessionlist.ts) in the shape the Shell already draws, plus the engine's own fields.
 */
export interface BusySession {
  id: string;
  /** His name for it (the card's title). */
  project: string;
  phase: SessionState;
  /** What it is on (its prompt or task), or what it waits on him for. */
  what: string;
  /** The source that says its state (the first of `sources`). */
  source: SessionSource;
  sources: SessionSource[];
  machine: Machine;
  /** Old field the Shell routes on: set only when the session is on the MacBook and this brain is not. */
  host?: 'mac';
  waitingOn?: Session['waitingOn'];
  /** The session's claude:// link, when the app knows it. */
  open?: string;
}

export type BusyInput = SessionInput;

/** The engine's row in the card's shape. */
export function asBusy(s: Session, here: Machine = thisMachine()): BusySession {
  return { id: s.id, project: s.name, phase: s.state, what: s.what, source: s.sources[0]!, sources: s.sources, machine: s.machine,
    ...(s.machine === 'mac' && here !== 'mac' ? { host: 'mac' as const } : {}), ...(s.waitingOn ? { waitingOn: s.waitingOn } : {}), ...(s.open ? { open: s.open } : {}) };
}

/**
 * Every session Claude is busy with, the most pressing first: the sessions engine's one list (sessionlist.ts), every
 * source merged by session id, stale ones dropped there.
 */
export function claudeBusy(i: BusyInput): BusySession[] {
  const here = i.here ?? thisMachine();
  return sessionList(i).map(s => asBusy(s, here));
}

/**
 * The whole picture from one list: the steady mark over his head, the old `claude.working` signal (the pet's fallback
 * and its no-brain click), and the sessions the card lists. Mark up exactly when the list is not empty.
 */
export function claudeNow(i: BusyInput): { mark: { mark: MarkKind; what?: string }; working: { working: boolean; what?: string; host?: 'mac' }; sessions: BusySession[]; list: Session[]; alsoWorking: boolean | string } {
  const here = i.here ?? thisMachine();
  const list = sessionList(i), sessions = list.map(s => asBusy(s, here));
  // The jobs say their own mark (steadyMark reads them and the waits); the rest light honey.
  const notJob = (s: BusySession) => s.source !== 'link' && s.source !== 'transcript';
  const alsoWorking = sessions.some(notJob);
  // A session without the link mod that stops for him says "needs you", not honey (2026-10-29, fix 10): its project
  // rides in alsoWorking, so the mark the brain pushes (MarkDeriver) says the same.
  const hookWaits = sessions.find(s => notJob(s) && s.phase === 'waiting');
  const also: boolean | string = hookWaits ? (hookWaits.project || 'Claude') : alsoWorking;
  const mark = steadyMark(i.jobs, i.waits, also);
  const live = sessions.find(s => s.phase === 'working' || s.phase === 'waiting');
  const working = live ? { working: true, what: live.project, ...(live.host ? { host: live.host } : {}) } : { working: false };
  return { mark, working, sessions, list, alsoWorking: also };
}

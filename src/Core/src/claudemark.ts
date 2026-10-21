// C5 (2026-10-21): the one mark over Aang's head while Claude works, and the wooden chime that goes with it,
// worked out from the brain's own claude.jobs / claude.wait in ONE place. The pet only draws what it is told
// (`claude.mark`), the same way it already only draws `claude.working`: two programs guessing the same state from
// the same lists would sooner or later disagree about what is over his head.
//
// His calls (sheets 45d/45e, COCKPIT-BUILD.md "Marks and glows"): one colour per mark, nothing else over his head.
// Blocking first: a permission (pale blue) beats a question (lavender) beats a plan ready (sage); then working
// (honey); then failed (coral skull); then paused (slate). A finished step is a quick SMALL sea tick; JOB COMPLETE
// (the terracotta seal and the chime) only when every task on the list is ticked.
import type { Job, WaitItem } from './claudelink.ts';

/** What sits over his head for as long as it is true. */
export type MarkKind = 'none' | 'permission' | 'question' | 'plan' | 'working' | 'failed' | 'paused';
/** A moment, shown for a couple of seconds over whatever the steady mark is. */
export type MarkFlash = 'step' | 'complete';
/** The wooden chimes he picked (docs/cockpit/sounds-45b), by file name. */
export type ChimeName = 'permission' | 'question' | 'plan-ready' | 'step' | 'job-complete' | 'failed';

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
  update(jobs: readonly Job[], waits: readonly WaitItem[], alsoWorking = false): MarkMsg | null {
    // The first look only learns what is already there: a brain restart must not chime for a question asked an hour ago.
    const first = !this.primed; this.primed = true;
    let sound: ChimeName | undefined;
    let flash: MarkFlash | undefined;
    let what: string | undefined;

    // New waiting items: a chime for each kind, the most pressing one wins if several land at once.
    const rank: Record<string, number> = { permission: 3, question: 2, plan: 1 };
    const chime: Record<string, ChimeName> = { permission: 'permission', question: 'question', plan: 'plan-ready' };
    let best: WaitItem | undefined;
    for (const w of waits) if (!this.seenWaits.has(w.id) && (!best || rank[w.kind]! > rank[best.kind]!)) best = w;
    this.seenWaits = new Set(waits.map(w => w.id));
    if (best && !first) { sound = chime[best.kind]; what = best.project; }

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
    // tick still shows, so he gets both.
    if (!sound && flash) sound = flash === 'complete' ? 'job-complete' : 'step';

    const mark = steadyMark(jobs, waits, alsoWorking);
    const key = `${mark.mark}|${mark.what ?? ''}`;
    const changed = key !== this.last;
    this.last = key;
    if (!changed && !flash && !sound) return null;
    return { t: 'claude.mark', mark: mark.mark, ...(flash ? { flash } : {}), ...(sound ? { sound } : {}), ...((what ?? mark.what) ? { what: what ?? mark.what } : {}) };
  }

  /** What to tell a pet that has just connected: the steady mark only, no moment and no chime. */
  now(jobs: readonly Job[], waits: readonly WaitItem[], alsoWorking = false): MarkMsg {
    const m = steadyMark(jobs, waits, alsoWorking);
    return { t: 'claude.mark', mark: m.mark, ...(m.what ? { what: m.what } : {}) };
  }
}

/** The steady mark, by his order: blocking (permission, question, plan), then working, failed, paused. */
export function steadyMark(jobs: readonly Job[], waits: readonly WaitItem[], alsoWorking = false): { mark: MarkKind; what?: string } {
  for (const kind of ['permission', 'question', 'plan'] as const) {
    const w = waits.find(x => x.kind === kind);
    if (w) return { mark: kind, what: w.project };
  }
  const working = jobs.find(j => j.phase === 'working');
  if (working) return { mark: 'working', what: working.project };
  if (alsoWorking) return { mark: 'working' };
  const failed = jobs.find(j => failedJob(j) && j.phase !== 'ended');
  if (failed) return { mark: 'failed', what: failed.project };
  const paused = jobs.find(j => j.phase === 'paused');
  if (paused) return { mark: 'paused', what: paused.project };
  return { mark: 'none' };
}

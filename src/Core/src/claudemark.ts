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
  update(jobs: readonly Job[], waits: readonly WaitItem[], alsoWorking = false): MarkMsg | null {
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
  now(jobs: readonly Job[], waits: readonly WaitItem[], alsoWorking = false): MarkMsg {
    const m = steadyMark(jobs, waits, alsoWorking);
    return { t: 'claude.mark', mark: m.mark, ...(m.what ? { what: m.what } : {}) };
  }
}

/** The steady mark, by his order: blocking (permission, question, plan), then working, failed, done (unread), paused. */
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
export const HOOK_STALE_MS = 10 * 60_000;

/** The hook tracker's session, as much of it as this needs (hooks.ts Session). */
export interface HookLike {
  id: string; project: string; phase: 'working' | 'waiting' | 'idle'; changedAt: number;
  prompt: string; waitingFor: string; transcriptPath?: string; host?: 'mac';
}
/** A session Aang launched (claude.ts Launched), as much of it as this needs. */
export interface LaunchedLike { name: string; state?: string; sessionId: string | null; updatedAt?: number; startedAt: number }

/** One session Claude is busy with, from whichever source knows it. The card lists exactly these. */
export interface BusySession {
  id: string;
  project: string;
  phase: 'working' | 'waiting' | 'paused' | 'failed' | 'done';
  /** What it is on (its prompt or task), or what it waits on him for. */
  what: string;
  source: 'link' | 'transcript' | 'hook' | 'launched';
  host?: 'mac';
  /** The session's claude:// link, when the app knows it. */
  open?: string;
}

/**
 * Claude Code's own idle reminder ("Claude is waiting for your input") comes as a Notification AFTER a finished turn.
 * It is not a question and not work: the turn is over and the session just sits there. It made the old hook signal
 * keep the honey mark up for hours.
 */
const IDLE_NUDGE = /waiting for your input/i;

export interface BusyInput {
  jobs: readonly Job[];
  waits: readonly WaitItem[];
  hooks?: Iterable<HookLike>;
  launched?: readonly LaunchedLike[];
  now?: number;
  /** When a transcript was last written (ms), or 0; the hook stale check uses it so a long quiet tool is not "dead". */
  lastWrite?: (path: string) => number;
}

/**
 * Every session Claude is busy with, the most pressing first: link and transcript jobs (working, paused, failed, or
 * with something waiting on him), then hook-tracked sessions no job already covers, then sessions Aang launched that
 * nothing else covers. Stale protection: a hook session that has said nothing and written nothing for HOOK_STALE_MS
 * is not working (it died, or the brain restarted mid-turn and never heard its end), and neither is a launched job
 * with no word for that long.
 */
export function claudeBusy(i: BusyInput): BusySession[] {
  const now = i.now ?? Date.now();
  const out: BusySession[] = [];
  const seen = new Set<string>();
  const waitOf = (id: string) => i.waits.find(w => w.session === id);
  for (const j of i.jobs) {
    const w = waitOf(j.id);
    const phase = w ? 'waiting' : j.phase === 'working' ? 'working' : j.phase === 'paused' ? 'paused'
      : failedJob(j) && j.phase !== 'ended' ? 'failed' : j.unread === true ? 'done' : null;
    seen.add(j.id);
    if (!phase) continue;
    out.push({ id: j.id, project: j.title || j.project, phase, what: (w ? w.plain || w.summary : j.current || j.prompt || '').slice(0, 140),
      source: j.source, ...(j.open ? { open: j.open } : {}) });
  }
  // A wait whose job is not on the list (it can arrive first): still something he is needed for.
  for (const w of i.waits) {
    if (seen.has(w.session)) continue;
    seen.add(w.session);
    out.push({ id: w.session, project: w.project, phase: 'waiting', what: (w.plain || w.summary || '').slice(0, 140), source: 'link' });
  }
  const hooks = [...(i.hooks ?? [])].sort((a, b) => b.changedAt - a.changedAt);
  for (const s of hooks) {
    if (seen.has(s.id)) continue;               // a job with the same id says it better (and may say it is idle)
    if (s.phase === 'idle') continue;
    if (s.phase === 'waiting' && IDLE_NUDGE.test(s.waitingFor)) continue;
    if (s.phase === 'working') {
      const wrote = s.transcriptPath && i.lastWrite ? i.lastWrite(s.transcriptPath) : 0;
      if (now - Math.max(s.changedAt, wrote) > HOOK_STALE_MS) continue;
    }
    seen.add(s.id);
    out.push({ id: s.id, project: s.project, phase: s.phase, what: (s.phase === 'waiting' ? s.waitingFor : s.prompt).slice(0, 140),
      source: 'hook', ...(s.host ? { host: s.host } : {}) });
  }
  for (const l of i.launched ?? []) {
    // 'waiting' on a launched job means typed in, Enter not pressed: never working (claude.ts JobState).
    if (l.state !== 'working' || !l.sessionId || seen.has(l.sessionId)) continue;
    if (now - (l.updatedAt ?? l.startedAt) > HOOK_STALE_MS) continue;
    seen.add(l.sessionId);
    out.push({ id: l.sessionId, project: l.name, phase: 'working', what: '', source: 'launched' });
  }
  const rank = { waiting: 0, working: 1, failed: 2, done: 3, paused: 4 } as const;
  return out.sort((a, b) => rank[a.phase] - rank[b.phase]);
}

/**
 * The whole picture from one list: the steady mark over his head, the old `claude.working` signal (the pet's fallback
 * and its no-brain click), and the sessions the card lists. Mark up exactly when the list is not empty.
 */
export function claudeNow(i: BusyInput): { mark: { mark: MarkKind; what?: string }; working: { working: boolean; what?: string; host?: 'mac' }; sessions: BusySession[]; alsoWorking: boolean } {
  const sessions = claudeBusy(i);
  // The jobs say their own mark (steadyMark reads them and the waits); the rest light honey.
  const alsoWorking = sessions.some(s => s.source === 'hook' || s.source === 'launched');
  const mark = steadyMark(i.jobs, i.waits, alsoWorking);
  const live = sessions.find(s => s.phase === 'working' || s.phase === 'waiting');
  const working = live ? { working: true, what: live.project, ...(live.host ? { host: live.host } : {}) } : { working: false };
  return { mark, working, sessions, alsoWorking };
}

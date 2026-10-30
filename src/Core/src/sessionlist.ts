// The sessions engine (engine 3, 2026-10-30): ONE list of the Claude sessions Aang knows, whichever way it heard of
// them. Before this, "is Claude working?" and "did he already answer it?" were each worked out on the spot from four
// lists, every reader its own way: the aang-link mod's jobs and waits (claudelink.ts), the old curl hooks (hooks.ts),
// the jobs Aang launched (launched.json) and the Mac front desk's Discord jobs (macjobs.ts). Now every source feeds
// this one merge and everything reads the result: the mark over his head, the old claude.working signal, the mark-click
// card, and askOver (a blocking line is over the moment its session no longer waits here).
//
// One session, one row: the same id from several sources is merged, the best source saying its state (the link mod
// knows best, then the hooks, then a launch record, then the desk) and every source kept in `sources`. Each row says
// which machine it is on, from where its news came, not from where the brain runs.
import { statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Job, WaitItem } from './claudelink.ts';
import { readJson } from './store.ts';

export type Machine = 'mac' | 'pc';
/** What the session is doing, by his words: working, waiting on him (with what), done (unread), paused, failed. */
export type SessionState = 'working' | 'waiting' | 'done' | 'paused' | 'failed';
/** Where the list heard of it. A link job read from its transcript (no mod) is 'transcript'; the Mac front desk is 'desk'. */
export type SessionSource = 'link' | 'transcript' | 'hook' | 'launched' | 'desk';
/** What it waits on him for. 'ok' is a hook's permission line, which says no more than that. */
export type WaitKind = WaitItem['kind'] | 'ok' | 'reply';

export interface Session {
  id: string;
  machine: Machine;
  /** His name for it (the Claude app's title, the job's name), else its folder. */
  name: string;
  state: SessionState;
  /** Set exactly when state is 'waiting'. */
  waitingOn?: { kind: WaitKind; what: string };
  /** What it is on (its task or prompt), or what it waits on him for. */
  what: string;
  /** Every source that knows it, the one that says its state first. */
  sources: SessionSource[];
  /** The session's claude:// link, when the app knows it. */
  open?: string;
}

/** A hook-tracked session, or a launched job, with no word for this long has died with its turn (or the brain restarted). */
export const STALE_MS = 10 * 60_000;
/** A hook session that waits on him, or a desk job, with no word for this long is gone (closed without a SessionEnd). */
export const WAIT_STALE_MS = 24 * 60 * 60_000;

/** The hook tracker's session, as much of it as this needs (hooks.ts Session). */
export interface HookLike {
  id: string; project: string; phase: 'working' | 'waiting' | 'idle'; changedAt: number;
  prompt: string; waitingFor: string; transcriptPath?: string;
  /** Old field: set when its events came over the tailnet. `machine` says which machine for certain. */
  host?: 'mac';
  machine?: Machine;
}
/** A session Aang launched (claude.ts Launched), as much of it as this needs. */
export interface LaunchedLike { name: string; state?: string; sessionId: string | null; updatedAt?: number; startedAt: number }
/** A Claude job the Mac front desk runs or relays for Discord (macjobs.ts Job). Always on the Mac. */
export interface DeskJobLike { session: string; cwd: string; title: string; at: number; updatedAt?: number; state?: 'working' | 'waiting' | 'done'; last?: string }

export interface SessionInput {
  jobs: readonly Job[];
  waits: readonly WaitItem[];
  hooks?: Iterable<HookLike>;
  launched?: readonly LaunchedLike[];
  desk?: readonly DeskJobLike[];
  /** The machine this brain runs on: a session that came with no other word is here. Default: from the platform. */
  here?: Machine;
  now?: number;
  /** When a transcript was last written (ms), or 0; the hook stale check uses it so a long quiet tool is not "dead". */
  lastWrite?: (path: string) => number;
  /** His name for a session (claudenames.ts), for rows no job names. */
  nameOf?: (id: string) => string | undefined;
}

/**
 * Claude Code's own idle reminder ("Claude is waiting for your input") comes as a Notification AFTER a finished turn.
 * It is not a question and not work: the turn is over and the session just sits there. It made the old hook signal
 * keep the honey mark up for hours.
 */
const IDLE_NUDGE = /waiting for your input/i;
const failedJob = (j: Job): boolean => (j as Job & { failed?: boolean }).failed === true;
const cut = (s: string) => s.slice(0, 140);
export const thisMachine = (): Machine => process.platform === 'darwin' ? 'mac' : 'pc';
/** A hook's machine: said outright, else the old `host` flag (only ever set by a PC brain), else here. */
export const hookMachine = (s: Pick<HookLike, 'host' | 'machine'>, here: Machine): Machine => s.machine ?? (s.host === 'mac' ? 'mac' : here);

/**
 * Every live session, the most pressing first (waiting, working, failed, done, paused). Idle and ended sessions are
 * not on it: the list is "what is Claude doing for him", not a history.
 */
export function sessionList(i: SessionInput): Session[] {
  const now = i.now ?? Date.now();
  const here = i.here ?? thisMachine();
  const rows = new Map<string, Session>();
  /** Ids a better source has already spoken for, live or not: a link job that says idle wins over a stale hook. */
  const said = new Set<string>();
  const also = (id: string, src: SessionSource) => { const r = rows.get(id); if (r && !r.sources.includes(src)) r.sources.push(src); };

  // 1. The link mod (or the transcript reader): it knows best. A wait without its job (it can arrive first) still counts.
  const waitOf = new Map<string, WaitItem>();
  for (const w of i.waits) if (!waitOf.has(w.session)) waitOf.set(w.session, w);
  for (const j of i.jobs) {
    said.add(j.id);
    const w = waitOf.get(j.id);
    const state: SessionState | null = w ? 'waiting' : j.phase === 'working' ? 'working' : j.phase === 'paused' ? 'paused'
      : failedJob(j) && j.phase !== 'ended' ? 'failed' : j.unread === true ? 'done' : null;
    if (!state) continue;
    const what = w ? w.plain || w.summary : j.current || j.prompt || '';
    // The link door is loopback only, so a link job is always on this machine (Job.machine is the Shell's 'pc' for "here").
    rows.set(j.id, { id: j.id, machine: here, name: j.title || j.project, state,
      ...(w ? { waitingOn: { kind: w.reply ? 'reply' : w.kind, what: cut(what) } } : {}), what: cut(what), sources: [j.source],
      ...(j.open ? { open: j.open } : {}) });
  }
  for (const [sid, w] of waitOf) {
    if (said.has(sid)) continue;
    said.add(sid);
    const what = cut(w.plain || w.summary || '');
    rows.set(sid, { id: sid, machine: here, name: i.nameOf?.(sid) || w.project, state: 'waiting', waitingOn: { kind: w.reply ? 'reply' : w.kind, what }, what, sources: ['link'] });
  }

  // 2. The old curl hooks: sessions the mod does not speak for (the other machine, a brain with the link door off).
  const hooks = [...(i.hooks ?? [])].sort((a, b) => b.changedAt - a.changedAt);
  for (const s of hooks) {
    if (said.has(s.id)) { also(s.id, 'hook'); continue; }
    if (s.phase === 'idle') continue;
    if (s.phase === 'waiting' && (IDLE_NUDGE.test(s.waitingFor) || now - s.changedAt > WAIT_STALE_MS)) continue;
    if (s.phase === 'working') {
      const wrote = s.transcriptPath && i.lastWrite ? i.lastWrite(s.transcriptPath) : 0;
      if (now - Math.max(s.changedAt, wrote) > STALE_MS) continue;
    }
    said.add(s.id);
    const waiting = s.phase === 'waiting';
    const what = cut(waiting ? s.waitingFor : s.prompt);
    rows.set(s.id, { id: s.id, machine: hookMachine(s, here), name: i.nameOf?.(s.id) || s.project, state: s.phase,
      ...(waiting ? { waitingOn: { kind: /permission/i.test(s.waitingFor) ? 'ok' : 'question', what } } : {}), what, sources: ['hook'] });
  }

  // 3. Jobs Aang launched: their name is his ("job hunt"); their state only counts with nothing better to say.
  for (const l of i.launched ?? []) {
    if (!l.sessionId) continue;
    const r = rows.get(l.sessionId);
    if (r) { also(l.sessionId, 'launched'); if (r.sources[0] === 'hook') r.name = l.name; continue; }
    // 'waiting' on a launched job means typed in, Enter not pressed: never working (claude.ts JobState).
    if (said.has(l.sessionId) || l.state !== 'working') continue;
    if (now - (l.updatedAt ?? l.startedAt) > STALE_MS) continue;
    said.add(l.sessionId);
    rows.set(l.sessionId, { id: l.sessionId, machine: here, name: l.name, state: 'working', what: '', sources: ['launched'] });
  }

  // 4. The Mac front desk's Discord jobs (macjobs.ts): on the Mac, and 'done' is Discord's news, not a mark.
  for (const d of i.desk ?? []) {
    if (!d.session) continue;
    if (rows.has(d.session)) { also(d.session, 'desk'); continue; }
    if (said.has(d.session) || (d.state !== 'working' && d.state !== 'waiting')) continue;
    if (now - (d.updatedAt ?? d.at) > (d.state === 'working' ? STALE_MS : WAIT_STALE_MS)) continue;
    said.add(d.session);
    const what = cut(d.last ?? '');
    rows.set(d.session, { id: d.session, machine: 'mac', name: d.title || d.cwd.split(/[\\/]/).pop() || 'Claude job', state: d.state,
      ...(d.state === 'waiting' ? { waitingOn: { kind: 'ok', what } } : {}), what, sources: ['desk'] });
  }

  const rank: Record<SessionState, number> = { waiting: 0, working: 1, failed: 2, done: 3, paused: 4 };
  return [...rows.values()].sort((a, b) => rank[a.state] - rank[b.state]);
}

/** The row for a session, if it is live. */
export const sessionOf = (list: readonly Session[], id: string): Session | undefined => list.find(s => s.id === id);
/**
 * Whether a session still waits on him. The one answer to "did he already answer it?": answered here, in Claude, on the
 * other machine or from his phone, every source that hears of it changes this list, so nothing else has to look.
 */
export const stillWaiting = (list: readonly Session[], id: string): boolean => sessionOf(list, id)?.state === 'waiting';

/**
 * The Mac front desk's job file (macjobs.ts, its own process): read when it changes, never written. Only on the Mac;
 * AANG_DESK_JOBS points it elsewhere (tests), and '' turns it off.
 */
export class DeskJobs {
  private seen = -1;
  private jobs: DeskJobLike[] = [];
  readonly file: string;
  constructor(file: string = process.env.AANG_DESK_JOBS
    ?? (process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support', 'AangListener', 'brain', 'jobs.json') : '')) { this.file = file; }
  list(): DeskJobLike[] {
    if (!this.file) return [];
    let m = 0;
    try { m = statSync(this.file).mtimeMs; } catch { this.seen = -1; this.jobs = []; return []; }
    if (m === this.seen) return this.jobs;
    this.seen = m;
    this.jobs = readJson<DeskJobLike[]>(this.file, [], (a) => (Array.isArray(a) ? a.filter((j): j is DeskJobLike => !!j && typeof j.session === 'string' && typeof j.at === 'number') : null));
    return this.jobs;
  }
}

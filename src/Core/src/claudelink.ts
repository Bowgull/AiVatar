// C1/C2 (2026-10-21): Aang <-> Claude both ways, the brain's half.
//
// Every Claude Code session on this PC loads the aang-link mod (claude-link/ in this repo). The mod tells the brain
// what its session is doing (to-do list, turns, model, usage) and what it is waiting on (a permission, a question,
// a plan), and it asks the brain for anything Joshua sent back: an answer, a message, Pause, Play, a model switch.
// This file is the brain's side: the job tracker, the waiting queue, the long-poll doors on the HookServer, and the
// lock that keeps anything but Aang from answering for him.
//
// THE LOCK. Anything that can approve a tool call is powerful. While Aang is down, any other local program could sit
// on port 47832 and "approve" things, or read what the sessions are doing. So:
//   - The brain makes a fresh random key each run and writes it to link.key in his Aang folder (his user only).
//   - The mod signs every request with HMAC-SHA256(key, ...), so only someone holding the key is listened to here.
//   - Before the mod tells anything to whoever is on the port, it asks /link/hello with a fresh nonce and checks the
//     answer is HMAC(key, nonce): a squatter without the key cannot pass, so it learns nothing.
//   - Every item the brain hands back (an answer, a message, Pause, Play, a model) carries
//     HMAC(key, nonce + session + item id + kind + body), the nonce being the one the mod sent with that very poll.
//     The mod acts on nothing without it, so an old answer cannot be replayed and a forged one never matches.
// Nothing here approves on its own: an answer exists only because Joshua gave it (answer() below), and the mod's own
// dialog keeps working beside it, whichever he answers first wins.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, unlinkSync } from 'node:fs';
import type http from 'node:http';
import path from 'node:path';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { reportWriteFailure, writeFileAtomic } from './atomic.ts';
import { projectName } from './hooks.ts';
import { ActivityKeeper, ProgressKeeper, etaOf, percentOf, stripSecrets } from './claudeprogress.ts';
import type { Activity, KeeperCtx, Progress, ToolDetail } from './claudeprogress.ts';
import type { TranscriptSession } from './claudescan.ts';
import { notHisCwd } from './notjobs.ts';
import { CiTracker } from './claudeci.ts';
import type { CiRow, Runner } from './claudeci.ts';
import { PlanStore, ProgressHistory, historyFile, plansFile } from './progresshistory.ts';
import type { StoredPhase } from './progresshistory.ts';
import { calibration } from './progressmath.ts';
import { normFolder, startBody } from './jobstart.ts';
import type { Start, StartBook } from './jobstart.ts';
import type { PlanV3 } from './progressmath.ts';

// ------------------------------------------------------------------ the key and the MAC

/** In his Aang folder, not %APPDATA%: Claude sessions started by the Claude app see a private copy of AppData. */
export const linkKeyFile = (dataDir: string) => path.join(dataDir, 'link.key');

/** A fresh key for this run. Null if it could not be written: the link then stays shut, nothing else breaks. */
export function newLinkKey(dataDir: string): string | null {
  const key = randomBytes(32).toString('base64url');
  try { writeFileAtomic(linkKeyFile(dataDir), key); return key; }
  catch (e) { reportWriteFailure(linkKeyFile(dataDir), e); return null; }
}

/** A key must not outlive the brain that made it. */
export function clearLinkKey(dataDir: string): void {
  try { unlinkSync(linkKeyFile(dataDir)); } catch { /* never written, or already gone */ }
}

/** HMAC-SHA256 over the parts joined by newlines, as hex. The mod computes the same thing from SHA-256 alone. */
export const linkMac = (key: string, ...parts: string[]): string => createHmac('sha256', key).update(parts.join('\n')).digest('hex');

export function sameMac(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// ------------------------------------------------------------------ the tracker

export type TaskStatus = 'pending' | 'in_progress' | 'completed';
export interface JobTask { text: string; status: TaskStatus; active?: string }
export type JobPhase = 'working' | 'idle' | 'paused' | 'ended';

export interface Job {
  id: string;
  machine: 'pc';
  cwd: string;
  project: string;
  model: string;
  phase: JobPhase;
  startedAt: number;
  lastActivity: number;
  /** What he (or Aang) last asked it, first 200 characters. */
  prompt: string;
  tasks: JobTask[];
  /** The task in progress, in its "-ing" form when Claude gave one. */
  current: string | null;
  /** The bar as it stands when sent, 0-100 (time-weighted, v3); null with no to-do list. */
  percent: number | null;
  /** Time left in ms, only once it is earned (claudeprogress.ts rule 5); 0 with every item ticked. */
  etaMs: number | null;
  /** The progress engine's authoritative numbers (v3, progressmath.ts ProgressV3); null with no to-do list. Viewers draw every frame from these. */
  progress: Progress | null;
  /** The last turn ended in an error (red). Cleared by the next turn. */
  failed?: boolean;
  /** OVERALL: the project's phase plan, when Claude keeps one (the progress tool's `plan`). */
  plan?: PlanV3 | null;
  /** GitHub Actions runs of this folder's repo, in flight or just finished (claudeci.ts). */
  ci?: CiRow[];
  /** What it is doing right now, in plain words, and its helper agents (claudeprogress.ts). */
  activity: Activity;
  usage: { contextPercent?: number; rateLimits?: { kind: string; percentUsed: number; resetsAt?: string }[]; costUsd?: number } | null;
  /** What he named the session in the Claude app, or its folder's name (claudenames.ts, 2026-10-21). */
  title: string;
  /** Opens this exact session in the Claude app; null for a session the app does not know (a terminal one). */
  open: string | null;
  /** Messages held for "after this task", how many. */
  held: number;
  /**
   * The last turn ended (not stopped) with no to-do list (2026-10-21): a one-step job, done. Viewers fill its bar to
   * complete; the next turn clears it.
   */
  finished: boolean;
  /**
   * Where the brain knows it from (2026-10-21): 'link' = the session's mod is talking to it (everything works);
   * 'transcript' = only read from the session's transcript (claudescan.ts: a session from before the mod, or one whose
   * mod has not reached this brain yet). Progress and the live line yes; answering, messages, pause no.
   */
  source: 'link' | 'transcript';
  /**
   * Finished and not yet seen (2026-10-22, his words: "do done jobs disappear? i dont want them to"): the turn ended on
   * its own (not stopped, no error, no helper still at work). The teal tick stays over Aang's head and the done card
   * stays in the bubble until he X's it or opens it (`ack`), or a new turn starts in that session.
   */
  unread?: boolean;
  /** When it finished, for an unread one. */
  doneAt?: number;
}

/** What is kept of a finished, unread job (2026-10-22): enough to draw its done card after the session itself is gone. */
export interface DoneNote { id: string; project: string; title: string; open: string | null; task: string; doneAt: number }
/** Where the unread finished jobs are kept, so a brain restart keeps them. */
export const unreadFile = (dataDir: string) => path.join(dataDir, 'claude-unread.json');
/** 2026-10-22 (his yes): at most three finished jobs in the list; a fourth reads the oldest by itself. */
export const MAX_UNREAD = 3;

/** When the newest event happened in the session (`ev`, the mod's clock) and reached the brain (`rx`): the trace. */
export interface LinkTrace { ev: number; rx: number; type: string }

export type WaitKind = 'permission' | 'question' | 'plan';
export interface WaitItem {
  id: string;
  session: string;
  project: string;
  kind: WaitKind;
  tool: string;
  /** One plain line about what it wants. */
  summary: string;
  /** The same in everyday words (plainwords.ts), once Qwen or the quick model has rewritten it; the bubble shows this when set. */
  plain?: string;
  /** The exact input, JSON, cut to 2000 characters. */
  input: string;
  /** AskUserQuestion's questions as Claude asked them. */
  questions?: { question: string; header?: string; multiSelect?: boolean; options: { label: string; description?: string; plain?: string }[] }[];
  /** ExitPlanMode's plan, cut to 8000 characters. */
  plan?: string;
  /** Known but not answerable from Aang (2026-10-21: asked before the brain restarted): "Open in Claude to answer". */
  readonly?: true;
  /** Claude offered "don't ask again" for this one. */
  canAlways: boolean;
  at: number;
  /**
   * 2026-10-22 (his "answered in Claude, it should disappear from Aang"): the tool call it is for, the helper agent
   * that asked (none for the main loop), and when it was asked on the session's own clock, so the brain can tell that
   * the session has moved on past it (claudelink.ts movedOn) even if the mod's 'resolved' never arrives.
   */
  toolUseId?: string;
  agentId?: string;
  askedAt?: number;
}

export type Decision = 'allow' | 'always' | 'deny' | 'deny-message';
export type Answer = { decision: Decision; message?: string } | { answers: Record<string, string> };

/** What the mod is handed: a kind and a JSON body, the MAC added at the door with the poll's own nonce. */
export interface Outgoing { id: string; kind: 'answer' | 'gone' | 'inbox' | 'pause' | 'play' | 'model' | 'resync' | 'start' | 'caps' | 'door2'; body: string }

/**
 * A rolling record of one hop's latency (research section 5, 2026-10-21): the last 200 samples; every 200 events it
 * logs p50/p95/p99 once (with AANG_PROGRESS_TRACE=1), so the slow tail shows without a line per event.
 */
export class LatencyBook {
  private readonly name: string;
  private vals: number[] = [];
  private count = 0;
  constructor(name: string) { this.name = name; }
  add(ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) return;
    this.vals.push(ms); if (this.vals.length > 200) this.vals.shift();
    if (++this.count % 200 === 0 && process.env.AANG_PROGRESS_TRACE === '1') {
      const q = this.quantiles();
      console.error(`progress trace: ${this.name} p50 ${q.p50} ms, p95 ${q.p95} ms, p99 ${q.p99} ms (${this.count} events)`);
    }
  }
  quantiles(): { p50: number; p95: number; p99: number } {
    const s = [...this.vals].sort((a, b) => a - b), at = (f: number) => (s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(s.length * f))]!) : 0);
    return { p50: at(0.5), p95: at(0.95), p99: at(0.99) };
  }
}

const KIND_RANK: Record<WaitKind, number> = { permission: 0, question: 1, plan: 2 };
const MAX_JOBS = 30;
const STALE_MS = 12 * 3600_000;
const cut = (s: unknown, n: number) => String(s ?? '').slice(0, n);
const MODEL_OK = /^[A-Za-z0-9.\-_[\]]{1,60}$/;

interface Held { text: string; afterTask: string | null }
interface Waiter<T> { resolve: (v: T) => void; timer: NodeJS.Timeout }

export class JobTracker {
  /** His names for sessions and their real app links; injected so tests need no Claude app on disk. */
  private readonly names: { of(cli: string): { title: string; open: string } | null } | null;
  /** How long things take here (progresshistory.ts), each project's phase plan, and the CI watcher. In memory until useData. */
  hist: ProgressHistory;
  private plans: PlanStore;
  private ci: CiTracker | null;
  constructor(names: { of(cli: string): { title: string; open: string } | null } | null = null, data: { hist?: ProgressHistory; plans?: PlanStore; ci?: CiTracker | null } = {}) {
    this.names = names;
    this.hist = data.hist ?? new ProgressHistory(null);
    this.plans = data.plans ?? new PlanStore(null);
    this.ci = data.ci ?? null;
  }
  private loopMon: ReturnType<typeof monitorEventLoopDelay> | null = null;
  private loopTimer: NodeJS.Timeout | null = null;
  /**
   * The brain's folder (v3, 2026-10-21): the history and the plans live on disk from here on (so they survive
   * restarts), the CI watcher starts (only where gh is installed), and the event loop is watched: a p99 delay over
   * 20 ms is logged, so a freeze like the old 2.4-3.2 s ones shows up at once.
   */
  useData(dataDir: string, opts: { ci?: boolean; run?: Runner } = {}): void {
    this.hist = new ProgressHistory(historyFile(dataDir));
    this.plans = new PlanStore(plansFile(dataDir));
    this.ci?.close();
    this.ci = opts.ci === false ? null : new CiTracker(this.hist, { ...(opts.run ? { run: opts.run } : {}), onChange: () => this.onChange('jobs') });
    for (const j of this.jobs.values()) this.ci?.watch(j.cwd);
    this.unreadPath = unreadFile(dataDir);
    this.loadUnread();
    try {
      // 2026-10-21: what the histogram holds is the whole gap between two 20 ms ticks, timer included, and on his cloud
      // PC an idle Node process measured p99 106 ms, worst 151 ms over 20 s (Windows timer coarseness and the VM's
      // scheduling), so "p99 over 20 ms" fired every 30 s and hid the one real freeze (the 6.8 s and 12.6 s memory
      // backup). Now the tick is taken off, and only a real stall is logged: worst over 250 ms or p99 over 100 ms.
      const RES = 20;
      this.loopMon = monitorEventLoopDelay({ resolution: RES }); this.loopMon.enable();
      this.loopTimer = setInterval(() => {
        const m = this.loopMon; if (!m) return;
        const p99 = Math.max(0, m.percentile(99) / 1e6 - RES), worst = Math.max(0, m.max / 1e6 - RES);
        if (worst > 250 || p99 > 100) console.error(`progress: the brain's event loop stalled (p99 ${Math.round(p99)} ms, worst ${Math.round(worst)} ms beyond its ${RES} ms tick)`);
        m.reset();
      }, 30_000);
      this.loopTimer.unref?.();
    } catch { /* a nicety */ }
  }
  private readonly jobs = new Map<string, Job>();
  private readonly waits = new Map<string, WaitItem>();
  /** Per session: what the mod has not been handed yet. */
  private readonly outbox = new Map<string, Outgoing[]>();
  /** Per waiting item: the answer, once he gave it, until the mod's poll takes it. */
  private readonly answers = new Map<string, Outgoing>();
  private readonly held = new Map<string, Held[]>();
  /** Per session: the progress clock and the live activity (claudeprogress.ts, 2026-10-21). */
  private readonly clocks = new Map<string, ProgressKeeper>();
  private readonly acts = new Map<string, ActivityKeeper>();
  private readonly outboxWaiters = new Map<string, Waiter<Outgoing[]>>();
  private readonly answerWaiters = new Map<string, Waiter<Outgoing | null>>();
  /**
   * Told whenever the jobs list or the waiting queue changes; the Core sends them on to the Shell. `urgent` (2026-10-21)
   * marks what must never wait behind the spacing for tool chatter: a to-do tick, a turn starting or ending.
   */
  onChange: (what: 'jobs' | 'wait', urgent?: boolean) => void = () => {};
  /** The newest event's times, for the latency trace (AANG_PROGRESS_TRACE); null until the first. */
  trace: LinkTrace | null = null;
  /** Told once per new waiting item, so the Core can have it rewritten in plain words (C2, 2026-10-21). */
  onAsk: (item: WaitItem) => void = () => {};
  /** A turn started or ended in a linked session (2026-10-21): the Core's "<title> replied" line (claudereplies.ts). */
  onTurn: (session: string, what: 'start' | 'end', info: { project: string; aborted: boolean }) => void = () => {};
  private seq = 0;

  private id(): string { return `${Date.now().toString(36)}-${(++this.seq).toString(36)}-${randomBytes(4).toString('hex')}`; }

  /** The folder a session told the brain it runs in ('' when unknown), for show_mockup (2026-10-22). */
  cwdOf(session: string): string { return (session && this.jobs.get(session)?.cwd) || ''; }

  private job(session: string, now: number, cwd = ''): Job {
    let j = this.jobs.get(session);
    if (!j) {
      j = { id: session, machine: 'pc', cwd, project: projectName(cwd), model: '', phase: 'idle', startedAt: now, lastActivity: now,
        prompt: '', tasks: [], current: null, percent: null, etaMs: null, progress: null, failed: false, plan: null, ci: [],
        activity: { now: '', since: now, agents: [], tool: null, pips: 0, aliveAt: now, stallMs: 60_000 },
        usage: null, title: projectName(cwd), open: null, held: 0, finished: false, source: 'link' };
      this.jobs.set(session, j);
      this.prune(now);
    }
    if (cwd && cwd !== j.cwd) { j.cwd = cwd; j.project = projectName(cwd); this.ci?.watch(cwd); }
    j.lastActivity = now;
    return j;
  }

  private prune(now: number): void {
    for (const [id, j] of this.jobs) if (now - j.lastActivity > STALE_MS) this.forget(id);
    while (this.jobs.size > MAX_JOBS) {
      const oldest = [...this.jobs.values()].sort((a, b) => a.lastActivity - b.lastActivity)[0]!;
      this.forget(oldest.id);
    }
  }

  /** What a session's keepers look things up by: its project and model, as they are now. */
  private ctx(session: string): KeeperCtx {
    return { hist: this.hist, project: () => this.jobs.get(session)?.project ?? '', model: () => this.jobs.get(session)?.model ?? '' };
  }
  /** Per session: the working clock as it stood when its time was last added to the plan's running phase. */
  private readonly planW = new Map<string, number>();
  /** Per session: the working clock at the turn's start, for the turn's own history line. */
  private readonly turnW = new Map<string, number>();
  /** Per session: the mod's load (gen) and the last event number seen, to spot a lost or doubled event (v3 plumbing). */
  private readonly seqs = new Map<string, { gen: string; seq: number }>();
  private clock(session: string, now = Date.now()): ProgressKeeper {
    let c = this.clocks.get(session);
    if (!c) {
      c = new ProgressKeeper(this.ctx(session));
      this.clocks.set(session, c);
      // The plan's running phase counts this session's working time from here.
      this.planW.set(session, c.w(now));
    }
    return c;
  }
  private act(session: string, now = Date.now()): ActivityKeeper { let a = this.acts.get(session); if (!a) { a = new ActivityKeeper(this.ctx(session), now); this.acts.set(session, a); } return a; }

  /** A helper is at work, so the job is too, even after its turn ended (2026-10-22). Paused stays paused. */
  private wake(j: Job, session: string, t: number): void {
    if (j.phase !== 'idle') return;
    if (this.act(session, t).liveAgents(t) === 0) return;
    j.phase = 'working'; j.finished = false; this.clock(session).go(t);
  }

  private forget(session: string): void {
    this.jobs.delete(session); this.held.delete(session); this.outbox.delete(session);
    this.clocks.delete(session); this.acts.delete(session); this.planW.delete(session); this.turnW.delete(session); this.seqs.delete(session);
    for (const [id, w] of this.waits) if (w.session === session) this.drop(id);
    const ow = this.outboxWaiters.get(session); if (ow) { clearTimeout(ow.timer); this.outboxWaiters.delete(session); ow.resolve([]); }
    // Not the unread book: a finished job he has not seen outlives its session (2026-10-22), as a light record.
  }

  // ---------------------------------------------- finished and unread (2026-10-22)
  // His words: "do done jobs disappear? i dont want them to ... I want to be able to either X out of done jobs or click
  // them to go to session where it finished." The brain owns it, so the tick over his head, the bubble's done cards and
  // a page reload all agree. Kept 12 hours at most, 3 at most (the oldest goes when a 4th finishes), on disk so a brain restart keeps them.
  private readonly unread = new Map<string, DoneNote>();
  private unreadPath: string | null = null;

  /** The job just went from working to idle by itself: it is done, and he has not seen it yet. */
  private markDone(j: Job, t: number): void {
    const n = this.names?.of(j.id);
    const last = [...j.tasks].reverse().find(x => x.status === 'completed');
    this.unread.delete(j.id);
    this.unread.set(j.id, { id: j.id, project: j.project, title: cut(n?.title || j.project, 80), open: n?.open ?? null, task: cut(last?.text || j.prompt, 200), doneAt: t });
    this.trimUnread(t);
    this.saveUnread();
  }
  /** A new turn in that session: what finished before is not news any more. */
  private clearDone(session: string): void { if (this.unread.delete(session)) this.saveUnread(); }
  private trimUnread(now: number): boolean {
    let changed = false;
    for (const [id, u] of this.unread) if (now - u.doneAt > STALE_MS) { this.unread.delete(id); changed = true; }
    while (this.unread.size > MAX_UNREAD) { this.unread.delete([...this.unread.values()].sort((a, b) => a.doneAt - b.doneAt)[0]!.id); changed = true; }
    return changed;
  }
  private saveUnread(): void {
    if (!this.unreadPath) return;
    try { writeFileAtomic(this.unreadPath, JSON.stringify([...this.unread.values()])); } catch (e) { reportWriteFailure(this.unreadPath, e); }
  }
  private loadUnread(): void {
    if (!this.unreadPath) return;
    let raw: unknown;
    try { raw = JSON.parse(readFileSync(this.unreadPath, 'utf8')); } catch { return; }   // none yet
    for (const x of Array.isArray(raw) ? raw.slice(-50) : []) {   // trimmed to the newest MAX_UNREAD below
      if (!x || typeof x !== 'object' || typeof x.id !== 'string' || !x.id || !Number.isFinite(x.doneAt)) continue;
      this.unread.set(cut(x.id, 100), { id: cut(x.id, 100), project: cut(x.project, 80), title: cut(x.title, 80), open: typeof x.open === 'string' ? cut(x.open, 200) : null,
        task: cut(x.task, 200), doneAt: Number(x.doneAt) });
    }
    if (this.trimUnread(Date.now())) this.saveUnread();
  }
  /**
   * He X'd a done card, opened it in Claude, or said Nice on its pop-out (2026-10-22): it is read. False when it was not
   * unread (already acked, or a new turn started).
   */
  ack(session: string): boolean {
    if (!this.unread.delete(session)) return false;
    this.saveUnread();
    this.onChange('jobs', true);
    return true;
  }
  /** A finished, unread job whose session is gone: just enough of a job for its done card. */
  private lightJob(u: DoneNote): Job {
    const n = this.names?.of(u.id);
    return { id: u.id, machine: 'pc', cwd: '', project: u.project, model: '', phase: 'ended', startedAt: u.doneAt, lastActivity: u.doneAt,
      prompt: u.task, tasks: [], current: null, percent: null, etaMs: null, progress: null, failed: false, plan: null, ci: [],
      activity: { now: '', since: u.doneAt, agents: [], tool: null, pips: 0, aliveAt: u.doneAt, stallMs: 60_000 },
      usage: null, title: n?.title || u.title || u.project, open: n?.open ?? u.open, held: 0, finished: true, source: 'link', unread: true, doneAt: u.doneAt };
  }

  /** One event from a session's mod. Anything malformed is ignored, never thrown. */
  event(ev: any, now = Date.now()): void {
    const session = cut(ev?.session, 100);
    const type = String(ev?.type ?? '');
    if (!session || !type) return;
    // v3 plumbing (2026-10-21): every event the mod posts carries its load's id (gen) and a number (sq). A number seen
    // before is a retry that got through twice: dropped. A gap means events were lost on the way: the mod is asked for
    // a snapshot, so nothing is left wrong for long. A new load, or a snapshot, starts the count again.
    const gen = typeof ev?.gen === 'string' ? ev.gen.slice(0, 40) : '', sq = Number(ev?.sq);
    if (gen && Number.isInteger(sq) && sq > 0) {
      const s = this.seqs.get(session);
      if (s && s.gen === gen && type !== 'snapshot') {
        if (sq <= s.seq) return;
        if (sq > s.seq + 1 && this.jobs.get(session)?.source === 'link') this.push(session, 'resync', {});
      }
      this.seqs.set(session, { gen, seq: s && s.gen === gen && type !== 'snapshot' ? Math.max(s.seq, sq) : sq });
    }
    if (type === 'end') {
      if (this.jobs.has(session)) { this.jobs.get(session)!.phase = 'ended'; this.forget(session); this.onChange('jobs'); this.onChange('wait'); }
      return;
    }
    const j = this.job(session, now, cut(ev?.cwd, 500));
    if (typeof ev?.model === 'string' && ev.model) j.model = cut(ev.model, 80);
    // Every clock runs on when it happened in the session (the mod's `t`, this PC's clock), not when it got here, so a
    // batch replayed after a slow post does not bunch up (research section 5). Bounded to the last 10 minutes.
    const t0 = Number(ev?.t);
    const t = Number.isFinite(t0) && t0 > 0 ? Math.min(now, Math.max(now - 600_000, t0)) : now;
    this.trace = { ev: Number.isFinite(t0) && t0 > 0 && t0 <= now + 1000 ? t0 : now, rx: now, type: cut(type, 20) };
    this.lat.add(now - this.trace.ev);
    let urgent = false;
    // The session's mod is talking: whatever the transcript scan made of it, the link takes over from here.
    if (j.source !== 'link') { j.source = 'link'; urgent = true; }
    switch (type) {
      case 'start': break;
      case 'turn.start':
        urgent = true;
        // A new message to the session (typed in Claude, or sent from Aang): nothing asked before it is still open.
        this.movedOn(session, t, () => true);
        j.phase = 'working';
        j.finished = false;
        j.failed = false;
        this.clearDone(session);
        // A new turn after a list that was all ticked is a new job: the bar starts empty and still ("Working") until
        // Claude writes its next list, instead of sitting at the old 100% (2026-10-21).
        if (j.tasks.length && j.tasks.every(x => x.status === 'completed')) { this.checkpoint(j.project, t, true); j.tasks = []; this.clocks.delete(session); this.planW.delete(session); this.measure(j, now); }
        this.clock(session).go(t);
        this.act(session, t).turnStart(t);
        this.turnW.set(session, this.clock(session).w(t));
        if (typeof ev?.prompt === 'string' && ev.prompt.trim()) j.prompt = cut(ev.prompt.trim(), 200);
        this.onTurn(session, 'start', { project: j.project, aborted: false });
        break;
      case 'turn.end': {
        urgent = true;
        const act0 = this.act(session, t);
        act0.turnOn = false;
        // 2026-10-22, his report ("now is saying nothing is working"): a turn can end while background helpers it
        // started are still at work. The job is still working until the last of them ends (agent.end, below).
        const helpers = ev?.aborted !== true && act0.liveAgents(t) > 0;
        j.phase = ev?.aborted === true && j.phase === 'paused' ? 'paused' : helpers ? 'working' : 'idle';
        // A one-step turn (no to-do list) that ended on its own is complete: its bar fills (2026-10-21).
        j.finished = !helpers && ev?.aborted !== true && ev?.reason !== 'error' && !j.tasks.length;
        // v3: a turn that ended in an error shows red until the next one.
        j.failed = ev?.reason === 'error';
        const clock = this.clock(session);
        // The plan's running phase gets this turn's working time, kept on disk (it may span sessions and days).
        this.checkpoint(j.project, t, true);
        // The turn's own working time, a history line (finished ones only, 5 s or more).
        const w0 = this.turnW.get(session);
        if (w0 !== undefined) {
          const ms = clock.w(t) - w0;
          if (ms >= 5000) this.hist.add({ at: t, src: 'turn', p: j.project, key: 'turn', ms, ok: ev?.aborted !== true && ev?.reason !== 'error' });
          this.turnW.delete(session);
        }
        if (!helpers) clock.stop(t);
        // 2026-10-22: it went from working to idle on its own: done, and unread until he X's or opens it. With helpers
        // still at work it is not done yet (agent.end, below, marks it when the last one ends).
        if (!helpers && ev?.aborted !== true && ev?.reason !== 'error') this.markDone(j, t);
        this.act(session, t).clearTools(t);
        const u = ev?.usage;
        if (u && typeof u === 'object') j.usage = {
          ...(Number.isFinite(u.contextPercent) ? { contextPercent: Number(u.contextPercent) } : {}),
          ...(Array.isArray(u.rateLimits) ? { rateLimits: u.rateLimits.slice(0, 6).map((r: any) => ({ kind: cut(r?.kind, 40), percentUsed: Number(r?.percentUsed) || 0, ...(r?.resetsAt ? { resetsAt: cut(r.resetsAt, 40) } : {}) })) } : {}),
          ...(Number.isFinite(u.costUsd) ? { costUsd: Number(u.costUsd) } : {}),
        };
        // The turn is over, so no permission or question of it can still be open.
        this.movedOn(session, t, () => true);
        // "After this task" with no to-do list to wait on means after this turn.
        this.release(session, (h) => h.afterTask === null || !j.tasks.some(t => t.status === 'in_progress' && t.text === h.afterTask));
        this.onChange('wait');
        this.onTurn(session, 'end', { project: j.project, aborted: ev?.aborted === true });
        break;
      }
      case 'todos': urgent = true; j.finished = false; this.act(session, t).alive(t); this.setTasks(j, ev?.todos, t); break;
      // Everything at once, from a mod meeting this brain for the first time (2026-10-21: the brain restarted, or the
      // mod just loaded into a running session): its list, its turn, the tools and helpers running, what still waits.
      case 'snapshot': {
        urgent = true;
        const clock = this.clock(session), act = this.act(session, t);
        act.turnOn = ev?.phase === 'working';
        const helping = Array.isArray(ev?.agents) && ev.agents.length > 0;
        if (ev?.phase === 'working' || helping) { j.phase = 'working'; j.finished = false; clock.go(t); }
        else if (j.phase !== 'paused') { j.phase = 'idle'; clock.stop(t); }
        act.alive(t);
        if (Array.isArray(ev?.todos)) this.setTasks(j, ev.todos, t);
        act.clearTools(t); act.clearAgents();
        for (const x of Array.isArray(ev?.tools) ? ev.tools.slice(0, 20) : []) act.toolStart(cut(x?.id, 100), cut(x?.tool, 120), readDetail(x?.detail), t);
        for (const g of Array.isArray(ev?.agents) ? ev.agents.slice(0, 20) : []) act.agentStart(cut(g?.id, 100), cut(g?.kind, 60), cut(g?.what, 200), t, g?.bg !== true);
        // The snapshot is the whole truth about what still waits: anything else of this session's was answered meanwhile.
        { const open = new Set((Array.isArray(ev?.asks) ? ev.asks : []).map((k: any) => cut(k?.id, 100)));
          this.movedOn(session, Infinity, (w) => !open.has(w.id)); }
        for (const k of Array.isArray(ev?.asks) ? ev.asks.slice(0, 10) : []) this.ask(j, { ...k, readonly: true }, t);
        if (Array.isArray(ev?.plan)) this.setPlan(j, ev.plan, t);
        break;
      }
      // Claude began writing its reply, thinking, or a tool call's arguments (2026-10-21): the live line says so.
      case 'step':
        // The main loop writing again means every tool call of its last step has its result: whatever the main loop
        // asked him (a permission, a question, a plan) was answered, in Claude or in Aang. A helper's ask is its own.
        this.movedOn(session, t, (w) => !w.agentId);
        this.act(session, t).turnOn = true;        // only the main loop's steps are sent: a turn is running
        if (j.phase === 'idle') j.phase = 'working';
        this.clock(session).go(t);
        this.act(session, t).step(cut(ev?.what, 20), cut(ev?.tool, 120), t);
        break;
      // v3 heartbeats: the model still streaming (at most every 2 s), or a helper agent streaming.
      case 'alive': this.act(session, t).beat(t, cut(ev?.agent, 100)); if (ev?.agent) this.wake(j, session, t); break;
      // A helper agent's own tool call: its heartbeat, and one more in "14 tool calls".
      case 'agent.tool': this.act(session, t).agentTool(cut(ev?.id, 100), t); this.wake(j, session, t); break;
      case 'ask': this.ask(j, ev, t); break;
      // The live description (2026-10-21): tools and helper agents as they start and end. A tool starting also means
      // the session is at work, even if the brain missed the turn's start (it restarted mid-turn).
      case 'tool.start':
        this.act(session, t).turnOn = true;        // the main loop's tools only: a turn is running
        if (j.phase === 'idle') j.phase = 'working';
        this.clock(session).go(t);
        this.act(session, t).toolStart(cut(ev?.id, 100), cut(ev?.tool, 120), readDetail(ev?.detail), t);
        break;
      case 'tool.end': {
        // The very tool call the ask was for ended (it ran, was refused, or was stopped): it is not waiting any more.
        { const tid = cut(ev?.id, 100); if (tid) this.movedOn(session, t, (w) => w.toolUseId === tid); }
        const fam = this.act(session, t).toolEnd(cut(ev?.id, 100), t, ev?.ok !== false);
        // A push: look for the CI run it starts (claudeci.ts).
        if (fam === 'Pushing to GitHub' && ev?.ok !== false) this.ci?.pushed(j.cwd);
        break;
      }
      case 'agent.start': urgent = true; this.act(session, t).agentStart(cut(ev?.id, 100), cut(ev?.kind, 60), cut(ev?.what, 200), t, ev?.bg !== true); this.wake(j, session, t); break;
      case 'agent.end': {
        urgent = true;
        const act = this.act(session, t);
        act.agentEnd(cut(ev?.id, 100), t, ev?.ok !== false);
        // The last background helper of a finished turn just ended: now the job is really idle.
        if (j.phase === 'working' && !act.turnOn && act.liveAgents(t) === 0) { j.phase = 'idle'; this.clock(session).stop(t); if (!j.failed) this.markDone(j, t); }
        break;
      }
      // A helper agent's own to-do list, as counts only (2026-10-21, sheet 58 C): its row's bar under the job.
      case 'agent.todos': this.act(session, t).agentTodos(cut(ev?.id, 100), Number(ev?.done), Number(ev?.total), t); break;
      // Compaction: a known pause, "Tidying its memory", left out of working time.
      case 'compact': this.clock(session).compact(ev?.on === true, t); this.act(session, t).alive(t); break;
      // OVERALL: Claude's phase plan for the project, from the progress tool.
      case 'plan': urgent = true; this.setPlan(j, ev?.phases, t); break;
      case 'resolved': {
        const id = cut(ev?.id, 100);
        const w = this.waits.get(id);
        if (w?.session === session) { this.drop(id); this.onChange('wait'); }
        // Resolved before its ask got here (the ask is posted on its own, the end rides the queue): it never shows.
        else if (id && !w) this.over(id, now);
        break;
      }
      default: break;
    }
    this.onChange('jobs', urgent);
  }

  /** Session -> brain latency, a rolling record (research section 5: p50/p95/p99 logged every 200 events). */
  readonly lat = new LatencyBook('session->brain');

  /**
   * The project's phase plan from Claude (OVERALL, research 3.8 and his build list): phases with labels and hour
   * estimates, kept current by Claude. The working time each phase has had is kept by label; a phase that goes from
   * running (or to-do) to done with time behind it becomes a history line, so the next phases are corrected by how
   * the past ones went (Evidence-Based Scheduling).
   */
  private setPlan(j: Job, phases: unknown, t: number): void {
    if (!Array.isArray(phases) || !j.project) return;
    this.checkpoint(j.project, t, false);
    const old = this.plans.get(j.project);
    const oldBy = new Map((old?.phases ?? []).map(p => [p.label, p]));
    const next: StoredPhase[] = phases.slice(0, 30).map((p: any) => {
      const label = cut(stripSecrets(String(p?.label ?? '').replace(/\s+/g, ' ').trim()), 80);
      const hours = Math.max(0, Math.min(1000, Number(p?.hours) || 0));
      const status = (['todo', 'running', 'done'] as const).includes(p?.status) ? p.status : 'todo';
      return { label, hours, status, workMs: oldBy.get(label)?.workMs ?? 0 };
    }).filter((p: StoredPhase) => p.label);
    if (!next.length) return;
    for (const p of next) {
      const was = oldBy.get(p.label);
      if (p.status === 'done' && was && was.status !== 'done' && p.workMs > 60_000 && p.hours > 0) {
        this.hist.add({ at: t, src: 'phase', p: j.project, key: p.label.toLowerCase().slice(0, 60), ms: p.workMs, est: p.hours * 3_600_000, ok: true });
      }
    }
    this.plans.set(j.project, { phases: next, updatedAt: t });
  }

  /**
   * Adds the working time each of the project's sessions has had since its last checkpoint to the running phase.
   * `save` writes the plans file (turn ends and plan changes; never on every push).
   */
  private checkpoint(project: string, t: number, save: boolean): void {
    const plan = this.plans.get(project);
    const run = plan?.phases.find(p => p.status === 'running');
    let added = 0;
    for (const j of this.jobs.values()) {
      if (j.project !== project) continue;
      const c = this.clocks.get(j.id);
      if (!c) continue;
      const W = c.w(t), w0 = this.planW.get(j.id);
      if (w0 !== undefined && W > w0) added += W - w0;
      this.planW.set(j.id, W);
    }
    if (run && added > 0) { run.workMs += added; if (save) this.plans.save(); }
  }

  /** The plan as the Shell draws it: the phases, the running phase's working time so far, and the calibration. */
  private planOf(project: string, now: number): PlanV3 | null {
    const plan = this.plans.get(project);
    if (!plan) return null;
    let live = 0, running = false;
    for (const j of this.jobs.values()) {
      if (j.project !== project) continue;
      const c = this.clocks.get(j.id);
      if (!c) continue;
      const w0 = this.planW.get(j.id);
      if (w0 !== undefined) live += Math.max(0, c.w(now) - w0);
      if (j.phase === 'working' && c.clock.running) running = true;
    }
    const ratios = this.hist.phaseRatios(project);
    const run = plan.phases.find(p => p.status === 'running');
    return { phases: plan.phases.map(p => ({ label: p.label, hours: p.hours, status: p.status })), runE: Math.round((run?.workMs ?? 0) + (run ? live : 0)), at: now,
      running: running && !!run, R: Math.round(calibration(ratios) * 1000) / 1000, ratios: ratios.map(r => Math.round(r * 1000) / 1000) };
  }

  /**
   * A session read from its transcript (claudescan.ts, 2026-10-21): shown, read-only, until its mod talks to the
   * brain, which then takes over (same id). A session whose mod is already talking is left to it.
   */
  fromTranscript(s: TranscriptSession, now = Date.now()): void {
    const had = this.jobs.get(s.session);
    if (had?.source === 'link') return;
    const wasWorking = had?.phase === 'working';
    const j = this.job(s.session, now, s.cwd);
    const before = JSON.stringify([had ? j.phase : '', j.tasks, j.activity.now, j.finished, j.model, j.prompt]);
    j.source = 'transcript';
    j.lastActivity = Math.min(now, s.mtime);
    if (s.model) j.model = cut(s.model, 80);
    if (s.prompt) j.prompt = s.prompt;
    const clock = this.clock(s.session), act = this.act(s.session);
    if (s.working) { j.phase = 'working'; clock.go(now); } else { j.phase = 'idle'; clock.stop(now); }
    if (JSON.stringify(s.tasks) !== JSON.stringify(j.tasks.map(t => ({ text: t.text, status: t.status, ...(t.active ? { active: t.active } : {}) })))) this.setTasks(j, s.tasks, now);
    act.clearTools(now);
    if (s.tool) act.toolStart('transcript', s.tool.name, s.tool.detail, now);
    j.finished = !s.working && s.answered && !j.tasks.length;
    // 2026-10-22: seen working and now answered: done and unread, the same as a linked session's turn ending.
    if (s.working) this.clearDone(s.session);
    else if (wasWorking && s.answered) this.markDone(j, now);
    if (JSON.stringify([j.phase, j.tasks, this.act(s.session).snapshot(j.phase, null, now).now, j.finished, j.model, j.prompt]) !== before) this.onChange('jobs', true);
  }

  /** Its transcript went quiet (claudescan.ts): a job known only from it goes. One whose mod talks stays. */
  dropTranscript(session: string): void {
    if (this.jobs.get(session)?.source !== 'transcript') return;
    this.forget(session);
    this.onChange('jobs', true);
  }

  private setTasks(j: Job, todos: unknown, now: number): void {
    if (!Array.isArray(todos)) return;
    j.tasks = todos.slice(0, 100).map((t: any) => ({
      text: cut(t?.text, 300),
      status: (['pending', 'in_progress', 'completed'] as const).includes(t?.status) ? t.status as TaskStatus : 'pending',
      ...(t?.active ? { active: cut(t.active, 300) } : {}),
    })).filter(t => t.text);
    const act = this.act(j.id, now);
    this.clock(j.id, now).todos(j.tasks, now, act.aliveAt, act.stallMs());
    this.measure(j, now);
    // A message held for "after this task" goes once that task is ticked (or is no longer in the list).
    this.release(j.id, (h) => h.afterTask !== null && !j.tasks.some(t => t.text === h.afterTask && t.status !== 'completed'));
  }

  /** The bar, the task in hand and the time left as they stand at `now`: the progress engine's numbers (claudeprogress.ts). */
  private measure(j: Job, now: number): void {
    const cur = j.tasks.find(t => t.status === 'in_progress');
    j.current = cur ? (cur.active || cur.text) : null;
    const act = this.acts.get(j.id);
    j.progress = this.clocks.get(j.id)?.snapshot(now, act?.aliveAt ?? now, act?.stallMs() ?? 60_000) ?? null;
    j.percent = percentOf(j.progress, j.phase === 'working', now);
    j.etaMs = etaOf(j.progress, j.phase === 'working', now);
  }

  /** Something waits on him in this session, or nothing does: the working clock stops or runs to match (rule 4). */
  private syncBlock(session: string, now: number): void {
    const c = this.clocks.get(session);
    if (!c) return;
    const blocked = [...this.waits.values()].some(w => w.session === session);
    if (blocked !== c.clock.blocked) c.block(blocked, now);
  }

  private ask(j: Job, ev: any, now: number): void {
    const id = cut(ev?.id, 100);
    if (!id || this.waits.has(id) || this.gone.has(id)) return;
    const kind: WaitKind = ev?.kind === 'question' ? 'question' : ev?.kind === 'plan' ? 'plan' : 'permission';
    const item: WaitItem = {
      id, session: j.id, project: j.project, kind, tool: cut(ev?.tool, 120), summary: cut(ev?.summary, 300), input: cut(ev?.input, 2000),
      canAlways: ev?.canAlways === true, at: now, ...(ev?.readonly === true ? { readonly: true as const } : {}),
      ...(typeof ev?.toolUseId === 'string' && ev.toolUseId ? { toolUseId: cut(ev.toolUseId, 100) } : {}),
      ...(typeof ev?.agentId === 'string' && ev.agentId ? { agentId: cut(ev.agentId, 100) } : {}),
      askedAt: now,
    };
    if (kind === 'question' && Array.isArray(ev?.questions)) item.questions = ev.questions.slice(0, 4).map((q: any) => ({
      question: cut(q?.question, 500), ...(q?.header ? { header: cut(q.header, 40) } : {}), ...(q?.multiSelect === true ? { multiSelect: true } : {}),
      options: (Array.isArray(q?.options) ? q.options : []).slice(0, 8).map((o: any) => ({ label: cut(o?.label, 200), ...(o?.description ? { description: cut(o.description, 500) } : {}) })),
    }));
    if (kind === 'plan') item.plan = cut(ev?.plan, 8000);
    this.waits.set(id, item);
    // v3: an ask is a sign of life, stops the working clock, and the tools running now teach no history (his answer
    // is inside their time).
    const act = this.act(j.id, now);
    act.alive(now); act.taint();
    this.clock(j.id, now);
    this.syncBlock(j.id, now);
    this.onChange('wait');
    this.onAsk(item);
  }

  /** The plain words for a waiting item, if it is still waiting. Option lines only fit a single question. */
  setPlain(id: string, plain: string, options: string[] = []): void {
    const w = this.waits.get(id);
    if (!w) return;
    w.plain = plain;
    const q = w.questions?.length === 1 ? w.questions[0]! : null;
    if (q && options.length === q.options.length) q.options.forEach((o, i) => { o.plain = options[i]; });
    this.onChange('wait');
  }

  /** What a session is on, in one line, for rewriting his message to it. */
  context(session: string): string {
    const j = this.jobs.get(session);
    return j ? [j.project, j.current ?? '', j.prompt].filter(Boolean).join(' - ') : '';
  }

  /** Asks that are over (answered anywhere, or their session moved on), the newest 200: a late ask for one never shows. */
  private readonly gone = new Map<string, number>();
  private over(id: string, now = Date.now()): void {
    this.gone.delete(id); this.gone.set(id, now);
    while (this.gone.size > 200) this.gone.delete(this.gone.keys().next().value as string);
  }

  /**
   * The safety net (2026-10-22): the session showed it has moved on at `t` (its clock), so every ask of it that `past`
   * picks and that was asked before `t` is over, whether or not the mod's own 'resolved' got here. Asked after
   * `t` is left alone: an older event that arrives late must not take a fresh question down.
   */
  private movedOn(session: string, t: number, past: (w: WaitItem) => boolean): void {
    let any = false;
    for (const [id, w] of [...this.waits]) if (w.session === session && (w.askedAt ?? 0) < t && past(w)) { this.drop(id); any = true; }
    if (any) this.onChange('wait');
  }

  private drop(id: string): void {
    const session = this.waits.get(id)?.session;
    if (!this.waits.delete(id)) return;
    this.over(id);
    this.answers.delete(id);
    const w = this.answerWaiters.get(id);
    if (w) { clearTimeout(w.timer); this.answerWaiters.delete(id); w.resolve({ id, kind: 'gone', body: '{}' }); }
    if (session) { const now = Date.now(); this.syncBlock(session, now); this.acts.get(session)?.alive(now); }
  }

  private push(session: string, kind: Outgoing['kind'], body: unknown): void {
    const list = this.outbox.get(session) ?? [];
    list.push({ id: this.id(), kind, body: JSON.stringify(body) });
    this.outbox.set(session, list.slice(-50));
    const w = this.outboxWaiters.get(session);
    if (w) { clearTimeout(w.timer); this.outboxWaiters.delete(session); w.resolve(this.take(session)); }
  }

  private take(session: string): Outgoing[] { const l = this.outbox.get(session) ?? []; this.outbox.delete(session); return l; }

  private release(session: string, ready: (h: Held) => boolean): void {
    const list = this.held.get(session); if (!list?.length) return;
    const keep: Held[] = [];
    for (const h of list) if (ready(h)) this.push(session, 'inbox', { text: h.text }); else keep.push(h);
    this.held.set(session, keep);
    const j = this.jobs.get(session); if (j) j.held = keep.length;
  }

  // ---------------------------------------------- what the rest of the brain uses

  /**
   * Every session it knows, the most recently active first. The progress numbers and the activity line are taken
   * fresh at `now` (the moment they are sent), so a viewer's creep starts from the right place.
   */
  list(now = Date.now()): Job[] {
    const waits = this.waiting();
    if (this.trimUnread(now)) this.saveUnread();
    // 2026-10-22: a finished job he has not seen stays on the list even after its session went (light record).
    const gone = [...this.unread.values()].filter(u => !this.jobs.has(u.id)).map(u => this.lightJob(u));
    return [...this.jobs.values(), ...gone].sort((a, b) => b.lastActivity - a.lastActivity).map(j => {
      if (!this.jobs.has(j.id)) return j;
      const u = this.unread.get(j.id);
      const n = this.names?.of(j.id);
      if (this.clocks.has(j.id)) this.measure(j, now);
      const waiting = waits.find(w => w.session === j.id)?.kind ?? null;
      const activity = this.act(j.id).snapshot(j.phase, waiting, now);
      // v3: OVERALL from the project's plan, and the repo's CI runs (rows under the job).
      const plan = j.project ? this.planOf(j.project, now) : null;
      const ci = this.ci && j.cwd ? this.ci.rows(j.cwd, now) : [];
      return { ...j, title: n?.title || j.project, open: n?.open ?? null, tasks: j.tasks.map(t => ({ ...t })), activity, plan, ci,
        ...(u ? { unread: true, doneAt: u.doneAt } : {}) };
    });
  }

  /** What is waiting on him: permissions first, then questions, then plans; oldest first within each. */
  waiting(): WaitItem[] { return [...this.waits.values()].sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind] || a.at - b.at); }

  /**
   * His answer to a waiting item. Returns null when it was taken, or a plain reason why not. This is the only
   * place an approval is ever made, and it is only called from his own press in the Shell.
   */
  answer(id: string, a: Answer): string | null {
    const w = this.waits.get(id);
    if (!w) return 'That is no longer waiting.';
    if (w.readonly) return 'Open it in Claude to answer: Aang restarted while it was asking.';
    let body: Record<string, unknown>;
    if ('answers' in a) {
      if (w.kind !== 'question') return 'That one is not a question.';
      const asked = new Set((w.questions ?? []).map(q => q.question));
      const answers: Record<string, string> = {};
      for (const [q, v] of Object.entries(a.answers ?? {})) if (asked.has(q) && typeof v === 'string' && v.trim()) answers[q] = v.slice(0, 2000);
      if (!Object.keys(answers).length) return 'No answer was given.';
      body = { answers };
    } else {
      if (!['allow', 'always', 'deny', 'deny-message'].includes(a.decision)) return 'Unknown answer.';
      if (w.kind === 'question' && a.decision !== 'deny' && a.decision !== 'deny-message') return 'A question needs an answer, not a yes.';
      if (a.decision === 'always' && !w.canAlways) return 'Claude did not offer "always" for this one.';
      if (a.decision === 'deny-message' && !a.message?.trim()) return 'Say what Claude should do instead.';
      body = { decision: a.decision, ...(a.decision === 'deny-message' ? { message: a.message!.slice(0, 2000) } : {}) };
    }
    this.waits.delete(id);
    this.over(id);
    this.syncBlock(w.session, Date.now());
    const out: Outgoing = { id, kind: 'answer', body: JSON.stringify(body) };
    const waiter = this.answerWaiters.get(id);
    if (waiter) { clearTimeout(waiter.timer); this.answerWaiters.delete(id); waiter.resolve(out); }
    else this.answers.set(id, out);
    this.onChange('wait');
    return null;
  }

  /** A message for a session: now (at Claude's next step) or after the task in progress is ticked. */
  send(session: string, text: string, when: 'now' | 'after'): string | null {
    const j = this.jobs.get(session);
    if (!j) return 'That session is not running.';
    if (j.source === 'transcript') return 'Aang can only watch that session for now. Open it in Claude.';
    const t = text.trim().slice(0, 4000);
    if (!t) return 'Nothing to send.';
    if (when === 'now' || (j.phase !== 'working' && !j.tasks.some(x => x.status === 'in_progress'))) { this.push(session, 'inbox', { text: t }); return null; }
    const cur = j.tasks.find(x => x.status === 'in_progress');
    const list = this.held.get(session) ?? [];
    list.push({ text: t, afterTask: cur ? cur.text : null });
    this.held.set(session, list.slice(-10));
    j.held = this.held.get(session)!.length;
    this.onChange('jobs');
    return null;
  }

  /**
   * C6: a signed start for a session (a resume), the probe's capability check, or a Door 2 start through a host
   * session. Only core.ts calls this, after his Go on a card (jobstart.ts), or the probe.
   */
  queue(session: string, kind: 'start' | 'caps' | 'door2', body: string): void {
    const list = this.outbox.get(session) ?? [];
    list.push({ id: this.id(), kind, body });
    this.outbox.set(session, list.slice(-50));
    const w = this.outboxWaiters.get(session);
    if (w) { clearTimeout(w.timer); this.outboxWaiters.delete(session); w.resolve(this.take(session)); }
  }

  /** C6: is this session's mod on the link right now (not ended, not just seen in a transcript)? */
  linked(session: string): boolean { const j = this.jobs.get(session); return !!j && j.source === 'link' && j.phase !== 'ended'; }

  /** C6 Door 2: the linked session to start another from: an idle one first, the most recently active. */
  host(): string | null {
    const live = [...this.jobs.values()].filter(j => j.source === 'link' && j.phase !== 'ended').sort((a, b) => b.lastActivity - a.lastActivity);
    return (live.find(j => j.phase === 'idle') ?? live[0])?.id ?? null;
  }

  pause(session: string): string | null {
    const j = this.jobs.get(session); if (!j) return 'That session is not running.';
    if (j.source === 'transcript') return 'Aang can only watch that session for now. Open it in Claude.';
    this.push(session, 'pause', {}); j.phase = 'paused'; this.clock(session).stop(Date.now()); this.onChange('jobs'); return null;
  }

  play(session: string, text?: string): string | null {
    const j = this.jobs.get(session); if (!j) return 'That session is not running.';
    if (j.source === 'transcript') return 'Aang can only watch that session for now. Open it in Claude.';
    this.push(session, 'play', text?.trim() ? { text: text.trim().slice(0, 4000) } : {}); return null;
  }

  setModel(session: string, model: string): string | null {
    if (!this.jobs.has(session)) return 'That session is not running.';
    if (this.jobs.get(session)!.source === 'transcript') return 'Aang can only watch that session for now. Open it in Claude.';
    if (!MODEL_OK.test(model)) return 'That is not a model name.';
    this.push(session, 'model', { model }); return null;
  }

  // ---------------------------------------------- the long polls

  /** Whatever the session has not been handed, now or within `ms`. A newer poll for the same session ends the old one. */
  waitOutbox(session: string, ms: number): Promise<Outgoing[]> {
    const now = this.take(session);
    if (now.length) return Promise.resolve(now);
    const old = this.outboxWaiters.get(session);
    if (old) { clearTimeout(old.timer); old.resolve([]); }
    return new Promise(resolve => {
      const timer = setTimeout(() => { this.outboxWaiters.delete(session); resolve([]); }, ms);
      timer.unref?.();
      this.outboxWaiters.set(session, { resolve, timer });
    });
  }

  /** His answer to one waiting item, `gone` once it was answered in Claude itself, or null after `ms`. */
  waitAnswer(session: string, id: string, ms: number): Promise<Outgoing | null> {
    const ready = this.answers.get(id);
    if (ready) { this.answers.delete(id); return Promise.resolve(ready); }
    const w = this.waits.get(id);
    if (!w || w.session !== session) return Promise.resolve({ id, kind: 'gone', body: '{}' });
    const old = this.answerWaiters.get(id);
    if (old) { clearTimeout(old.timer); old.resolve(null); }
    return new Promise(resolve => {
      const timer = setTimeout(() => { this.answerWaiters.delete(id); resolve(null); }, ms);
      timer.unref?.();
      this.answerWaiters.set(id, { resolve, timer });
    });
  }

  /** On a brain stop: let every held poll go. */
  close(): void {
    for (const w of this.outboxWaiters.values()) { clearTimeout(w.timer); w.resolve([]); }
    for (const w of this.answerWaiters.values()) { clearTimeout(w.timer); w.resolve(null); }
    this.outboxWaiters.clear(); this.answerWaiters.clear();
    this.ci?.close();
    if (this.loopTimer) clearInterval(this.loopTimer);
    this.loopMon?.disable();
    void this.hist.flush();
  }
}

/** The mod's tool detail, as strings of sane length; anything else is dropped. claudeprogress.ts strips secrets again. */
function readDetail(d: unknown): ToolDetail {
  if (!d || typeof d !== 'object') return {};
  const out: Record<string, string> = {};
  for (const k of ['cmd', 'desc', 'file', 'pattern', 'where', 'site', 'query', 'agent', 'kind', 'server', 'name', 'skill']) {
    const v = (d as Record<string, unknown>)[k];
    if (typeof v === 'string') out[k] = v.slice(0, 300);
  }
  return out as ToolDetail;
}

// ------------------------------------------------------------------ the push to the Shell

/** The least gap between two pushes of the jobs list for tool chatter: one frame at 60 Hz (2026-10-21). */
export const PUSH_GAP_MS = 16;

/**
 * When the jobs list goes to the Shell (2026-10-21, his "as fast as when Claude gets a reply"). It used to wait a
 * flat 80 ms after every change. Now: on the very next turn of the event loop (so a batch of events from one post is
 * one push), and only when pushes come faster than PUSH_GAP_MS apart (a burst of tool starts and ends) does the next
 * one wait out the rest of the gap. Urgent changes (a to-do tick, a turn starting or ending) never wait for the gap.
 */
export class LinkPusher {
  private timer: NodeJS.Timeout | NodeJS.Immediate | null = null;
  private soon = false;
  private lastAt = 0;
  private readonly flush: () => void;
  private readonly gapMs: number;
  constructor(flush: () => void, gapMs = PUSH_GAP_MS) { this.flush = flush; this.gapMs = gapMs; }

  ask(urgent = false): void {
    if (this.timer) {
      if (!urgent || this.soon) return;
      clearTimeout(this.timer as NodeJS.Timeout);
      this.timer = null;
    }
    const wait = this.gapMs - (Date.now() - this.lastAt);
    if (urgent || wait <= 0) { this.soon = true; this.timer = setImmediate(this.run); }
    else { this.soon = false; this.timer = setTimeout(this.run, wait); }
    this.timer.unref?.();
  }

  private readonly run = (): void => {
    this.timer = null;
    this.lastAt = Date.now();
    try { this.flush(); } catch { /* the next change pushes again */ }
  };

  close(): void {
    if (!this.timer) return;
    if (this.soon) clearImmediate(this.timer as NodeJS.Immediate); else clearTimeout(this.timer as NodeJS.Timeout);
    this.timer = null;
  }
}

// ------------------------------------------------------------------ the door

/** C6: the events about starts that the brain's start book listens to. */
const C6_EVENTS = new Set(['started', 'caps', 'door2.result', 'turn.start']);

/** How long a poll is held open. Short enough that a dead connection is noticed, long enough to cost nothing. */
export const POLL_MS = 25_000;
/** A signed request older or newer than this is refused (clock skew on one machine is nil; this only bounds replay). */
const SKEW_MS = 120_000;

/**
 * The /link/* requests, handed over by HookServer once its own checks passed (loopback, this machine's Host name,
 * no Origin). Every request must be signed with this run's key; every item handed back carries a MAC over the
 * poll's own nonce.
 */
export class LinkDoor {
  private readonly key: string;
  readonly tracker: JobTracker;
  private readonly ignoreCwd: () => string;
  /**
   * show_mockup (2026-10-22): a session asks for a page to be shown in Samara's Mockups trail. Set by core.ts
   * (mockupdrop.ts dropMockup); its answer goes straight back to the tool call. Null: the door says no.
   */
  onMockup: ((ask: { cwd: string; path?: unknown; url?: unknown; title?: unknown; branch?: unknown }) => Promise<{ ok: boolean; message: string }>) | null = null;
  /** C6 (2026-10-22): the jobs he said Go to (jobstart.ts). Null: no starts are handed out. */
  starts: StartBook | null = null;
  /** C6: what the mods say about starts (started, caps, door2.result, and turn.start for the probe). */
  onStart: ((session: string, ev: Record<string, unknown>) => void) | null = null;
  /** C6 probe (npm run c6-probe): signed like everything here; answered by core.ts. */
  onProbe: ((ask: Record<string, unknown>) => Promise<unknown>) | null = null;
  constructor(key: string, tracker: JobTracker, ignoreCwd: () => string = () => '') { this.key = key; this.tracker = tracker; this.ignoreCwd = ignoreCwd; }

  /** C6: items signed over a folder instead of a session (Door 1: the new session has no id the brain knows yet). */
  private startItems(nonce: string, folder: string, s: Start): { id: string; kind: string; body: string; mac: string }[] {
    const body = startBody(s);
    return [{ id: s.id, kind: 'start', body, mac: linkMac(this.key, nonce, folder, s.id, 'start', body) }];
  }

  private signed(req: http.IncomingMessage, url: string, body: string, now: number): boolean {
    const ts = String(req.headers['x-aang-link-ts'] ?? ''), sig = String(req.headers['x-aang-link-sig'] ?? '');
    if (!/^\d{10,16}$/.test(ts) || Math.abs(now - Number(ts)) > SKEW_MS || !/^[0-9a-f]{64}$/.test(sig)) return false;
    return sameMac(sig, linkMac(this.key, 'req', ts, String(req.method), url, body));
  }

  private items(nonce: string, session: string, list: Outgoing[]) {
    return list.map(o => ({ id: o.id, kind: o.kind, body: o.body, mac: linkMac(this.key, nonce, session, o.id, o.kind, o.body) }));
  }

  handle(req: http.IncomingMessage, res: http.ServerResponse, now = Date.now()): void {
    const url = req.url ?? '/';
    let body = '';
    req.on('data', d => { body += d; if (body.length > 64_000) req.destroy(); });
    req.on('error', () => { /* client vanished */ });
    req.on('end', () => {
      if (!this.signed(req, url, body, now)) { res.writeHead(403).end(); return; }
      const q = new URL(url, 'http://x');
      const json = (code: number, v: unknown) => { if (!res.writableEnded) res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(v)); };
      const nonce = q.searchParams.get('n') ?? '';
      const session = (q.searchParams.get('s') ?? '').slice(0, 100);
      const nonceOk = /^[0-9a-f]{32,64}$/.test(nonce);
      try {
        // v 2 (2026-10-21): this brain takes several events in one post ({ session, cwd, events: [...] }), so a mod
        // whose last post is still on the wire sends what came meanwhile together instead of queueing requests.
        if (req.method === 'GET' && q.pathname === '/link/hello' && nonceOk) { json(200, { proof: linkMac(this.key, 'hello', nonce), v: 2, ...(this.starts ? { c6: 1 } : {}) }); return; }
        if (req.method === 'POST' && q.pathname === '/link/event') {
          const ev = JSON.parse(body);
          // Aang's own chat lanes load his settings, so the mod loads in them too: they are not his sessions.
          // ...and tests, benches and temp folders (notjobs.ts, 2026-10-22): a bench's question was shown as his job.
          if (notHisCwd(ev?.cwd, this.ignoreCwd())) { res.writeHead(204).end(); return; }
          // Answered first: the mod's next post can leave while the brain is still telling the Shell.
          res.writeHead(204).end();
          const rx = Date.now();
          try {
            if (this.onStart) {
              const list = Array.isArray(ev?.events) ? ev.events.slice(0, 200) : [ev];
              for (const one of list) if (one && typeof one === 'object' && C6_EVENTS.has(String(one.type))) this.onStart(String(ev?.session ?? '').slice(0, 100), one);
            }
            if (Array.isArray(ev?.events)) {
              for (const one of ev.events.slice(0, 200)) if (one && typeof one === 'object') this.tracker.event({ ...one, session: ev.session, cwd: ev.cwd }, rx);
            } else this.tracker.event(ev, rx);
          } catch { /* already answered; a malformed event is simply dropped */ }
          return;
        }
        // show_mockup (2026-10-22): signed like everything here; the answer is the tool's result. The folder is the one
        // this session told the brain when it started, when the brain knows it (else the one in the request).
        if (req.method === 'POST' && q.pathname === '/link/mockup') {
          const ev = JSON.parse(body) as Record<string, unknown>;
          if (notHisCwd(ev?.cwd, this.ignoreCwd())) { json(403, { ok: false, message: 'not for this session' }); return; }
          if (!this.onMockup) { json(200, { ok: false, message: "Samara's Mockups trail is not on here." }); return; }
          const sid = String(ev?.session ?? '').slice(0, 100);
          const cwd = this.tracker.cwdOf(sid) || String(ev?.cwd ?? '');
          void this.onMockup({ cwd, path: ev?.path, url: ev?.url, title: ev?.title, branch: ev?.branch })
            .then((r) => json(200, { ok: r.ok === true, message: String(r.message ?? '').slice(0, 600) }), () => json(200, { ok: false, message: 'The brain could not hand it over.' }));
          return;
        }
        // C6 Door 1: a brand-new session asks, once, for a start waiting on its folder. Handed out once, first come.
        if (req.method === 'GET' && q.pathname === '/link/start' && nonceOk) {
          const folder = normFolder((q.searchParams.get('f') ?? '').slice(0, 500));
          const s = folder && this.starts ? this.starts.claim(folder) : null;
          json(200, { items: s ? this.startItems(nonce, folder, s) : [] });
          return;
        }
        // C6 probe: only from someone holding this run's key (the request is signed); the probe's text is fixed in the brain.
        if (req.method === 'POST' && q.pathname === '/link/probe') {
          if (!this.onProbe) { json(200, { ok: false, message: 'No probe here.' }); return; }
          const ask = JSON.parse(body || '{}') as Record<string, unknown>;
          void this.onProbe(ask).then(r => json(200, r), () => json(200, { ok: false, message: 'The probe failed in the brain.' }));
          return;
        }
        if (req.method === 'GET' && q.pathname === '/link/wait' && nonceOk && session) {
          // C6: a resume waiting for this session to open goes out with its first poll.
          const r = this.starts?.takeFor(session);
          if (r) this.tracker.queue(session, 'start', startBody(r));
          void this.tracker.waitOutbox(session, POLL_MS).then(list => json(200, { items: this.items(nonce, session, list) }));
          return;
        }
        if (req.method === 'GET' && q.pathname === '/link/answer' && nonceOk && session) {
          const id = (q.searchParams.get('r') ?? '').slice(0, 100);
          void this.tracker.waitAnswer(session, id, POLL_MS).then(o => json(200, { items: this.items(nonce, session, o ? [o] : []) }));
          return;
        }
      } catch { /* malformed: fall through */ }
      res.writeHead(400).end();
    });
  }
}

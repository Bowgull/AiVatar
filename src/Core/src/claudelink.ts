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
import { unlinkSync } from 'node:fs';
import type http from 'node:http';
import path from 'node:path';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { reportWriteFailure, writeFileAtomic } from './atomic.ts';
import { projectName } from './hooks.ts';
import { ActivityKeeper, ProgressKeeper, etaOf, percentOf, stripSecrets } from './claudeprogress.ts';
import type { Activity, KeeperCtx, Progress, ToolDetail } from './claudeprogress.ts';
import type { TranscriptSession } from './claudescan.ts';
import { CiTracker } from './claudeci.ts';
import type { CiRow, Runner } from './claudeci.ts';
import { PlanStore, ProgressHistory, historyFile, plansFile } from './progresshistory.ts';
import type { StoredPhase } from './progresshistory.ts';
import { calibration } from './progressmath.ts';
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
}

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
}

export type Decision = 'allow' | 'always' | 'deny' | 'deny-message';
export type Answer = { decision: Decision; message?: string } | { answers: Record<string, string> };

/** What the mod is handed: a kind and a JSON body, the MAC added at the door with the poll's own nonce. */
export interface Outgoing { id: string; kind: 'answer' | 'gone' | 'inbox' | 'pause' | 'play' | 'model' | 'resync'; body: string }

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

  private forget(session: string): void {
    this.jobs.delete(session); this.held.delete(session); this.outbox.delete(session);
    this.clocks.delete(session); this.acts.delete(session); this.planW.delete(session); this.turnW.delete(session); this.seqs.delete(session);
    for (const [id, w] of this.waits) if (w.session === session) this.drop(id);
    const ow = this.outboxWaiters.get(session); if (ow) { clearTimeout(ow.timer); this.outboxWaiters.delete(session); ow.resolve([]); }
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
        j.phase = 'working';
        j.finished = false;
        j.failed = false;
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
        j.phase = ev?.aborted === true && j.phase === 'paused' ? 'paused' : 'idle';
        // A one-step turn (no to-do list) that ended on its own is complete: its bar fills (2026-10-21).
        j.finished = ev?.aborted !== true && ev?.reason !== 'error' && !j.tasks.length;
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
        clock.stop(t);
        this.act(session, t).clearTools(t);
        const u = ev?.usage;
        if (u && typeof u === 'object') j.usage = {
          ...(Number.isFinite(u.contextPercent) ? { contextPercent: Number(u.contextPercent) } : {}),
          ...(Array.isArray(u.rateLimits) ? { rateLimits: u.rateLimits.slice(0, 6).map((r: any) => ({ kind: cut(r?.kind, 40), percentUsed: Number(r?.percentUsed) || 0, ...(r?.resetsAt ? { resetsAt: cut(r.resetsAt, 40) } : {}) })) } : {}),
          ...(Number.isFinite(u.costUsd) ? { costUsd: Number(u.costUsd) } : {}),
        };
        // The turn is over, so no permission or question of it can still be open.
        for (const [id, w] of this.waits) if (w.session === session) this.drop(id);
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
        if (ev?.phase === 'working') { j.phase = 'working'; j.finished = false; clock.go(t); }
        else if (j.phase !== 'paused') { j.phase = 'idle'; clock.stop(t); }
        act.alive(t);
        if (Array.isArray(ev?.todos)) this.setTasks(j, ev.todos, t);
        act.clearTools(t); act.clearAgents();
        for (const x of Array.isArray(ev?.tools) ? ev.tools.slice(0, 20) : []) act.toolStart(cut(x?.id, 100), cut(x?.tool, 120), readDetail(x?.detail), t);
        for (const g of Array.isArray(ev?.agents) ? ev.agents.slice(0, 20) : []) act.agentStart(cut(g?.id, 100), cut(g?.kind, 60), cut(g?.what, 200), t, g?.bg !== true);
        for (const k of Array.isArray(ev?.asks) ? ev.asks.slice(0, 10) : []) this.ask(j, { ...k, readonly: true }, t);
        if (Array.isArray(ev?.plan)) this.setPlan(j, ev.plan, t);
        break;
      }
      // Claude began writing its reply, thinking, or a tool call's arguments (2026-10-21): the live line says so.
      case 'step':
        if (j.phase === 'idle') j.phase = 'working';
        this.clock(session).go(t);
        this.act(session, t).step(cut(ev?.what, 20), cut(ev?.tool, 120), t);
        break;
      // v3 heartbeats: the model still streaming (at most every 2 s), or a helper agent streaming.
      case 'alive': this.act(session, t).beat(t, cut(ev?.agent, 100)); break;
      // A helper agent's own tool call: its heartbeat, and one more in "14 tool calls".
      case 'agent.tool': this.act(session, t).agentTool(cut(ev?.id, 100), t); break;
      case 'ask': this.ask(j, ev, t); break;
      // The live description (2026-10-21): tools and helper agents as they start and end. A tool starting also means
      // the session is at work, even if the brain missed the turn's start (it restarted mid-turn).
      case 'tool.start':
        if (j.phase === 'idle') j.phase = 'working';
        this.clock(session).go(t);
        this.act(session, t).toolStart(cut(ev?.id, 100), cut(ev?.tool, 120), readDetail(ev?.detail), t);
        break;
      case 'tool.end': {
        const fam = this.act(session, t).toolEnd(cut(ev?.id, 100), t, ev?.ok !== false);
        // A push: look for the CI run it starts (claudeci.ts).
        if (fam === 'Pushing to GitHub' && ev?.ok !== false) this.ci?.pushed(j.cwd);
        break;
      }
      case 'agent.start': this.act(session, t).agentStart(cut(ev?.id, 100), cut(ev?.kind, 60), cut(ev?.what, 200), t, ev?.bg !== true); break;
      case 'agent.end': this.act(session, t).agentEnd(cut(ev?.id, 100), t, ev?.ok !== false); break;
      // Compaction: a known pause, "Tidying its memory", left out of working time.
      case 'compact': this.clock(session).compact(ev?.on === true, t); this.act(session, t).alive(t); break;
      // OVERALL: Claude's phase plan for the project, from the progress tool.
      case 'plan': urgent = true; this.setPlan(j, ev?.phases, t); break;
      case 'resolved': if (this.waits.get(cut(ev?.id, 100))?.session === session) { this.drop(cut(ev?.id, 100)); this.onChange('wait'); } break;
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
    if (!id || this.waits.has(id)) return;
    const kind: WaitKind = ev?.kind === 'question' ? 'question' : ev?.kind === 'plan' ? 'plan' : 'permission';
    const item: WaitItem = {
      id, session: j.id, project: j.project, kind, tool: cut(ev?.tool, 120), summary: cut(ev?.summary, 300), input: cut(ev?.input, 2000),
      canAlways: ev?.canAlways === true, at: now, ...(ev?.readonly === true ? { readonly: true as const } : {}),
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

  private drop(id: string): void {
    const session = this.waits.get(id)?.session;
    if (!this.waits.delete(id)) return;
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
    return [...this.jobs.values()].sort((a, b) => b.lastActivity - a.lastActivity).map(j => {
      const n = this.names?.of(j.id);
      if (this.clocks.has(j.id)) this.measure(j, now);
      const waiting = waits.find(w => w.session === j.id)?.kind ?? null;
      const activity = this.act(j.id).snapshot(j.phase, waiting, now);
      // v3: OVERALL from the project's plan, and the repo's CI runs (rows under the job).
      const plan = j.project ? this.planOf(j.project, now) : null;
      const ci = this.ci && j.cwd ? this.ci.rows(j.cwd, now) : [];
      return { ...j, title: n?.title || j.project, open: n?.open ?? null, tasks: j.tasks.map(t => ({ ...t })), activity, plan, ci };
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
  constructor(key: string, tracker: JobTracker, ignoreCwd: () => string = () => '') { this.key = key; this.tracker = tracker; this.ignoreCwd = ignoreCwd; }

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
        if (req.method === 'GET' && q.pathname === '/link/hello' && nonceOk) { json(200, { proof: linkMac(this.key, 'hello', nonce), v: 2 }); return; }
        if (req.method === 'POST' && q.pathname === '/link/event') {
          const ev = JSON.parse(body);
          // Aang's own chat lanes load his settings, so the mod loads in them too: they are not his sessions.
          if (this.ignoreCwd() && String(ev?.cwd ?? '') === this.ignoreCwd()) { res.writeHead(204).end(); return; }
          // Answered first: the mod's next post can leave while the brain is still telling the Shell.
          res.writeHead(204).end();
          const rx = Date.now();
          try {
            if (Array.isArray(ev?.events)) {
              for (const one of ev.events.slice(0, 200)) if (one && typeof one === 'object') this.tracker.event({ ...one, session: ev.session, cwd: ev.cwd }, rx);
            } else this.tracker.event(ev, rx);
          } catch { /* already answered; a malformed event is simply dropped */ }
          return;
        }
        if (req.method === 'GET' && q.pathname === '/link/wait' && nonceOk && session) {
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

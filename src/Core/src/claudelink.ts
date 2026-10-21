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
import { reportWriteFailure, writeFileAtomic } from './atomic.ts';
import { projectName } from './hooks.ts';

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
  /** Ticked tasks out of all of them, 0-100; null with no to-do list. */
  percent: number | null;
  /** Rough time left from the pace of the tasks ticked so far; null until one is ticked. */
  etaMs: number | null;
  usage: { contextPercent?: number; rateLimits?: { kind: string; percentUsed: number; resetsAt?: string }[]; costUsd?: number } | null;
  /** Opens this exact session in the Claude app. */
  open: string;
  /** Messages held for "after this task", how many. */
  held: number;
}

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
  /** Claude offered "don't ask again" for this one. */
  canAlways: boolean;
  at: number;
}

export type Decision = 'allow' | 'always' | 'deny' | 'deny-message';
export type Answer = { decision: Decision; message?: string } | { answers: Record<string, string> };

/** What the mod is handed: a kind and a JSON body, the MAC added at the door with the poll's own nonce. */
export interface Outgoing { id: string; kind: 'answer' | 'gone' | 'inbox' | 'pause' | 'play' | 'model'; body: string }

const KIND_RANK: Record<WaitKind, number> = { permission: 0, question: 1, plan: 2 };
const MAX_JOBS = 30;
const STALE_MS = 12 * 3600_000;
const cut = (s: unknown, n: number) => String(s ?? '').slice(0, n);
const MODEL_OK = /^[A-Za-z0-9.\-_[\]]{1,60}$/;

interface Held { text: string; afterTask: string | null }
interface Waiter<T> { resolve: (v: T) => void; timer: NodeJS.Timeout }

export class JobTracker {
  private readonly jobs = new Map<string, Job>();
  private readonly waits = new Map<string, WaitItem>();
  /** Per session: what the mod has not been handed yet. */
  private readonly outbox = new Map<string, Outgoing[]>();
  /** Per waiting item: the answer, once he gave it, until the mod's poll takes it. */
  private readonly answers = new Map<string, Outgoing>();
  private readonly held = new Map<string, Held[]>();
  private readonly firstTaskAt = new Map<string, number>();
  private readonly doneTimes = new Map<string, number[]>();
  private readonly outboxWaiters = new Map<string, Waiter<Outgoing[]>>();
  private readonly answerWaiters = new Map<string, Waiter<Outgoing | null>>();
  /** Told whenever the jobs list or the waiting queue changes; the Core sends them on to the Shell. */
  onChange: (what: 'jobs' | 'wait') => void = () => {};
  /** Told once per new waiting item, so the Core can have it rewritten in plain words (C2, 2026-10-21). */
  onAsk: (item: WaitItem) => void = () => {};
  private seq = 0;

  private id(): string { return `${Date.now().toString(36)}-${(++this.seq).toString(36)}-${randomBytes(4).toString('hex')}`; }

  private job(session: string, now: number, cwd = ''): Job {
    let j = this.jobs.get(session);
    if (!j) {
      j = { id: session, machine: 'pc', cwd, project: projectName(cwd), model: '', phase: 'idle', startedAt: now, lastActivity: now,
        prompt: '', tasks: [], current: null, percent: null, etaMs: null, usage: null, open: `claude://claude.ai/epitaxy/${session}`, held: 0 };
      this.jobs.set(session, j);
      this.prune(now);
    }
    if (cwd && cwd !== j.cwd) { j.cwd = cwd; j.project = projectName(cwd); }
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

  private forget(session: string): void {
    this.jobs.delete(session); this.held.delete(session); this.outbox.delete(session);
    this.firstTaskAt.delete(session); this.doneTimes.delete(session);
    for (const [id, w] of this.waits) if (w.session === session) this.drop(id);
    const ow = this.outboxWaiters.get(session); if (ow) { clearTimeout(ow.timer); this.outboxWaiters.delete(session); ow.resolve([]); }
  }

  /** One event from a session's mod. Anything malformed is ignored, never thrown. */
  event(ev: any, now = Date.now()): void {
    const session = cut(ev?.session, 100);
    const type = String(ev?.type ?? '');
    if (!session || !type) return;
    if (type === 'end') {
      if (this.jobs.has(session)) { this.jobs.get(session)!.phase = 'ended'; this.forget(session); this.onChange('jobs'); this.onChange('wait'); }
      return;
    }
    const j = this.job(session, now, cut(ev?.cwd, 500));
    if (typeof ev?.model === 'string' && ev.model) j.model = cut(ev.model, 80);
    switch (type) {
      case 'start': break;
      case 'turn.start':
        j.phase = 'working';
        if (typeof ev?.prompt === 'string' && ev.prompt.trim()) j.prompt = cut(ev.prompt.trim(), 200);
        break;
      case 'turn.end': {
        j.phase = ev?.aborted === true && j.phase === 'paused' ? 'paused' : 'idle';
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
        break;
      }
      case 'todos': this.setTasks(j, ev?.todos, now); break;
      case 'ask': this.ask(j, ev, now); break;
      case 'resolved': if (this.waits.get(cut(ev?.id, 100))?.session === session) { this.drop(cut(ev?.id, 100)); this.onChange('wait'); } break;
      default: break;
    }
    this.onChange('jobs');
  }

  private setTasks(j: Job, todos: unknown, now: number): void {
    if (!Array.isArray(todos)) return;
    const before = new Map(j.tasks.map(t => [t.text, t.status]));
    j.tasks = todos.slice(0, 100).map((t: any) => ({
      text: cut(t?.text, 300),
      status: (['pending', 'in_progress', 'completed'] as const).includes(t?.status) ? t.status as TaskStatus : 'pending',
      ...(t?.active ? { active: cut(t.active, 300) } : {}),
    })).filter(t => t.text);
    if (j.tasks.length && !this.firstTaskAt.has(j.id)) this.firstTaskAt.set(j.id, now);
    const times = this.doneTimes.get(j.id) ?? [];
    for (const t of j.tasks) if (t.status === 'completed' && before.get(t.text) !== 'completed') times.push(now);
    this.doneTimes.set(j.id, times.slice(-100));
    this.measure(j, now);
    // A message held for "after this task" goes once that task is ticked (or is no longer in the list).
    this.release(j.id, (h) => h.afterTask !== null && !j.tasks.some(t => t.text === h.afterTask && t.status !== 'completed'));
  }

  /** Percent done, the task in hand, and a rough time left from the pace so far. */
  private measure(j: Job, now: number): void {
    const total = j.tasks.length, done = j.tasks.filter(t => t.status === 'completed').length;
    const cur = j.tasks.find(t => t.status === 'in_progress');
    j.current = cur ? (cur.active || cur.text) : null;
    j.percent = total ? Math.round(done / total * 100) : null;
    const start = this.firstTaskAt.get(j.id);
    j.etaMs = done && start && done < total ? Math.round((now - start) / done * (total - done)) : (total && done === total ? 0 : null);
  }

  private ask(j: Job, ev: any, now: number): void {
    const id = cut(ev?.id, 100);
    if (!id || this.waits.has(id)) return;
    const kind: WaitKind = ev?.kind === 'question' ? 'question' : ev?.kind === 'plan' ? 'plan' : 'permission';
    const item: WaitItem = {
      id, session: j.id, project: j.project, kind, tool: cut(ev?.tool, 120), summary: cut(ev?.summary, 300), input: cut(ev?.input, 2000),
      canAlways: ev?.canAlways === true, at: now,
    };
    if (kind === 'question' && Array.isArray(ev?.questions)) item.questions = ev.questions.slice(0, 4).map((q: any) => ({
      question: cut(q?.question, 500), ...(q?.header ? { header: cut(q.header, 40) } : {}), ...(q?.multiSelect === true ? { multiSelect: true } : {}),
      options: (Array.isArray(q?.options) ? q.options : []).slice(0, 8).map((o: any) => ({ label: cut(o?.label, 200), ...(o?.description ? { description: cut(o.description, 500) } : {}) })),
    }));
    if (kind === 'plan') item.plan = cut(ev?.plan, 8000);
    this.waits.set(id, item);
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
    if (!this.waits.delete(id)) return;
    this.answers.delete(id);
    const w = this.answerWaiters.get(id);
    if (w) { clearTimeout(w.timer); this.answerWaiters.delete(id); w.resolve({ id, kind: 'gone', body: '{}' }); }
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

  /** Every session it knows, the most recently active first. */
  list(): Job[] { return [...this.jobs.values()].sort((a, b) => b.lastActivity - a.lastActivity).map(j => ({ ...j, tasks: j.tasks.map(t => ({ ...t })) })); }

  /** What is waiting on him: permissions first, then questions, then plans; oldest first within each. */
  waiting(): WaitItem[] { return [...this.waits.values()].sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind] || a.at - b.at); }

  /**
   * His answer to a waiting item. Returns null when it was taken, or a plain reason why not. This is the only
   * place an approval is ever made, and it is only called from his own press in the Shell.
   */
  answer(id: string, a: Answer): string | null {
    const w = this.waits.get(id);
    if (!w) return 'That is no longer waiting.';
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
    this.push(session, 'pause', {}); j.phase = 'paused'; this.onChange('jobs'); return null;
  }

  play(session: string, text?: string): string | null {
    const j = this.jobs.get(session); if (!j) return 'That session is not running.';
    this.push(session, 'play', text?.trim() ? { text: text.trim().slice(0, 4000) } : {}); return null;
  }

  setModel(session: string, model: string): string | null {
    if (!this.jobs.has(session)) return 'That session is not running.';
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
        if (req.method === 'GET' && q.pathname === '/link/hello' && nonceOk) { json(200, { proof: linkMac(this.key, 'hello', nonce) }); return; }
        if (req.method === 'POST' && q.pathname === '/link/event') {
          const ev = JSON.parse(body);
          // Aang's own chat lanes load his settings, so the mod loads in them too: they are not his sessions.
          if (this.ignoreCwd() && String(ev?.cwd ?? '') === this.ignoreCwd()) { res.writeHead(204).end(); return; }
          this.tracker.event(ev);
          res.writeHead(204).end();
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

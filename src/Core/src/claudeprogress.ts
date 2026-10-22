// The progress engine and the live "what's happening" line for Claude jobs. v3, 2026-10-21.
//
// His asks: "those progress bars and ALL progress bars in Aang airtight and real time", a drop-down that says in plain
// (slightly technical) words what the session is doing right now, and (v3, "yes build it, go big") bars and times left
// that tell the truth, from docs/PROGRESS-RESEARCH.md.
//
// THE RULES (v3; docs/COCKPIT-BUILD.md "The progress engine" has the same list):
//   1. Only real events move a bar: a task ticked, the list changed, a tool starting or ending, a turn starting or
//      ending. Between events the bar creeps by working time, against how long that kind of item usually takes HERE.
//   2. Weighted by time, not by count: every item's slice is its expected duration (progresshistory.ts: his own
//      history per label, project and kind, shrunk towards seed priors), and the session's speed factor r scales what
//      is still to come. The bar and the time left come from the same numbers (progressmath.ts barNow).
//   3. Never backwards: a rewritten list squeezes the rest of the bar instead of dropping it; the time left goes up
//      instead and says why once ("Claude added 3 steps"). A late item keeps inching (the lognormal overrun curve); no
//      90% wall.
//   4. Stillness means stillness: when nothing has been heard for too long (a minute between steps, 90 s while the
//      model streams, twice a command's usual p90 while it runs) the bar freezes, turns amber and says "No sign of
//      life for N min". The first heartbeat unfreezes it. Waiting for his OK is yellow, not a stall, and not working
//      time: the clock stops while an ask is open.
//   5. Honest when it cannot know: no list (or a one-item list) = no percent, an activity line and a pip per finished
//      tool call, never a spinner. A time left only once it is earned (real data, 20 s in, not stalled), rounded, with
//      "about" or a range.
//   6. Real time: everything is pushed the moment it happens (LinkPusher), every viewer draws from these numbers every
//      frame (src/Shell/pages/progressmath.js), so nothing polls.
//   7. One engine, one look: the bubble's job card, Samara's rune and the pop-out all draw from the same model.
//
// Time is "working time": the clock stops while the session sits idle between turns, is paused, waits on him, or tidies
// its memory (compaction). Every clock runs on the event's own time (`t` from the mod), not when it arrived.
import { barNow, estOf, meanOf, medianOf, p90Of, speedFactor, stallLimit } from './progressmath.ts';
import type { AgentEst, Est, ProgressV3 } from './progressmath.ts';
import { ProgressHistory, familyOf, kindOf, labelKey } from './progresshistory.ts';
import type { Estimate } from './progresshistory.ts';

export type Progress = ProgressV3;

/** What a keeper needs to know about its session to look things up in the history. */
export interface KeeperCtx { hist: ProgressHistory; project: () => string; model: () => string }

interface Item { text: string; status: string; est: Estimate; actual: number; observed: boolean }

/** Working time: the wall clock less every stretch that was idle, paused, waiting on him or compacting. */
class WorkClock {
  private stoppedTotal = 0;
  private stoppedSince: number | null = null;
  idle = false;
  blocked = false;
  compacting = false;
  get running(): boolean { return !this.idle && !this.blocked && !this.compacting; }
  w(now: number): number { return now - this.stoppedTotal - (this.stoppedSince !== null ? Math.max(0, now - this.stoppedSince) : 0); }
  /** Call after changing a flag: starts or stops the clock to match. */
  sync(now: number): void {
    if (this.running && this.stoppedSince !== null) { this.stoppedTotal += Math.max(0, now - this.stoppedSince); this.stoppedSince = null; }
    else if (!this.running && this.stoppedSince === null) this.stoppedSince = now;
  }
}

/** One job's progress clock: fed real events only, read as ProgressV3. */
export class ProgressKeeper {
  readonly clock = new WorkClock();
  private readonly ctx: KeeperCtx;
  private items: Item[] = [];
  private cur = -1;
  private curKey = '';
  private curStartW = 0;
  private lastTickW: number | null = null;
  private jobStartW: number | null = null;
  private rev = 0;
  private rewroteAt: number | null = null;
  private sq: { a: number; m0: number } | null = null;
  private note: { text: string; at: number } | null = null;
  /** Estimates by label, so a list rewritten with the same items keeps them (and the history is asked once). */
  private estCache = new Map<string, Estimate>();
  /** Stall facts for the snapshot, set by the tracker from the activity (aliveAt, stallMs). */
  constructor(ctx: KeeperCtx) { this.ctx = ctx; }

  w(now: number): number { return this.clock.w(now); }
  /** A turn or a tool started: the clock runs (unless something else holds it). */
  go(now: number): void { this.clock.idle = false; this.clock.sync(now); }
  /** The turn ended, or he paused it: the clock stops. */
  stop(now: number): void { this.clock.idle = true; this.clock.sync(now); }
  /** Something waits on him (research 3.5: not a stall, and not working time). */
  block(on: boolean, now: number): void { this.clock.blocked = on; this.clock.sync(now); }
  /** Claude is tidying its memory: a known pause, left out of the history. */
  compact(on: boolean, now: number): void {
    this.clock.compacting = on; this.clock.sync(now);
    if (on) this.note = { text: 'Tidying its memory', at: now };
  }

  private estFor(text: string): Estimate {
    let e = this.estCache.get(text);
    if (!e) {
      e = this.ctx.hist.task(this.ctx.project(), text, stripSecrets, familyOf(this.ctx.model()));
      this.estCache.set(text, e);
      if (this.estCache.size > 300) this.estCache.delete(this.estCache.keys().next().value!);
    }
    return e;
  }

  /** Claude's to-do list as it is now (rule 1: a real event). */
  todos(tasks: readonly { text: string; status: string }[], now: number, aliveAt = now, stallMs = 60_000): void {
    const W = this.w(now);
    const before = this.items.length ? this.snapshot(now, aliveAt, stallMs) : null;
    const old = this.items;
    const oldTexts = old.map(i => i.text), texts = tasks.map(t => t.text);
    const wasDone = new Set(old.filter(i => i.status === 'completed').map(i => i.text));
    const oldBy = new Map(old.map(i => [i.text, i]));
    if (tasks.length && this.jobStartW === null) this.jobStartW = W;
    if (tasks.length && this.lastTickW === null) this.lastTickW = W;
    const items: Item[] = tasks.map(t => {
      const was = oldBy.get(t.text);
      return { text: t.text, status: t.status, est: was?.est ?? this.estFor(t.text), actual: was && t.status === 'completed' ? was.actual : 0, observed: !!was?.observed && t.status === 'completed' };
    });
    // Newly ticked: the working time since the last tick, shared among the items ticked now (Claude often ticks
    // several at once). Only a lone tick teaches the history, since a shared one is a guess.
    const newly = items.filter(i => i.status === 'completed' && !wasDone.has(i.text));
    if (newly.length && this.lastTickW !== null) {
      const span = Math.max(0, W - this.lastTickW);
      // An item ticked in the very first list, with no time seen, weighs its expected time (so "2 of 5 done" is not 0%).
      const first = !old.length;
      for (const i of newly) {
        if (first) { i.actual = medianOf(i.est); i.observed = false; continue; }
        i.actual = span / newly.length; i.observed = span > 0;
      }
      if (!first && newly.length === 1 && span > 1000) {
        const i = newly[0]!, fam = familyOf(this.ctx.model());
        this.ctx.hist.add({ at: now, src: 'task', p: this.ctx.project(), k: kindOf(i.text), key: labelKey(i.text, stripSecrets), ms: span, ok: true,
          ...(fam ? { m: fam } : {}), x: Math.log(span / Math.max(1, medianOf(i.est))) });
      }
      this.lastTickW = W;
    }
    let cur = tasks.findIndex(t => t.status === 'in_progress');
    if (cur < 0) cur = tasks.findIndex(t => t.status !== 'completed');
    const key = `${items.filter(i => i.status === 'completed').length}|${cur >= 0 ? tasks[cur]!.text : ''}`;
    if (key !== this.curKey) { this.curKey = key; this.curStartW = W; }
    // A list that is not the same list (items added, dropped, renamed, or un-ticked) is a rewrite (rule 3).
    const rewrite = !!old.length && (texts.length !== oldTexts.length || texts.some((t, i) => t !== oldTexts[i]) || items.some(i => wasDone.has(i.text) && i.status !== 'completed'));
    this.items = items; this.cur = cur;
    const after = rewrite ? this.snapshot(now, aliveAt, stallMs, false) : null;
    if (rewrite && !after) { this.rev++; this.sq = null; }
    if (rewrite && after) {
      this.rev++;
      const a = before ? barNow(before, true, now).p : 0;
      const m0 = barNow({ ...after, sq: null }, true, now).m;
      // Only a bar that would go back is squeezed; one that would jump forward just jumps.
      this.sq = m0 < a ? { a, m0 } : null;
      if (a - m0 > 0.005) this.rewroteAt = now;
      // The reason is said only for a list already under way: Claude building its list one task at a time (the Task
      // tools) is not news.
      const underway = !!before && (before.done > 0 || before.jobW >= 20_000);
      const leftBefore = before ? barNow(before, true, now).left : 0, leftAfter = barNow(after, true, now).left;
      if (underway && leftBefore > 0 && leftAfter > leftBefore * 1.25) {
        const added = texts.filter(t => !oldTexts.includes(t)).length;
        this.note = { text: added > 0 ? `Claude added ${added} step${added === 1 ? '' : 's'}` : 'Claude changed its list', at: now };
      }
    }
  }

  /** The list's items as the tracker shows them (index → est), for tests and the plan link. */
  get size(): number { return this.items.length; }

  /** Null without a to-do list (rule 5). `withSq` false leaves the squeeze out (used while working one out). */
  snapshot(now: number, aliveAt: number, stallMs: number, withSq = true): ProgressV3 | null {
    if (!this.items.length) return null;
    const W = this.w(now);
    const done = this.items.filter(i => i.status === 'completed');
    const total = this.items.length;
    const curItem = this.cur >= 0 ? this.items[this.cur]! : null;
    const finished = done.filter(i => i.observed && i.actual > 0);
    const r = speedFactor(finished.map(i => ({ actual: i.actual, median: medianOf(i.est) })));
    const pend = this.items.filter((i, k) => i.status !== 'completed' && k !== this.cur);
    // Earned (research section 4a): an item of this job has finished, or most of what is left rests on 3+ samples.
    const rest = [...(curItem && curItem.status !== 'completed' ? [curItem] : []), ...pend];
    const restW = rest.reduce((s, i) => s + meanOf(i.est), 0), restEarned = rest.filter(i => i.est.earned).reduce((s, i) => s + meanOf(i.est), 0);
    const e = Math.max(0, Math.round(W - this.curStartW));
    return {
      v: 3, done: done.length, total, cur: done.length >= total ? -1 : this.cur, at: now, e,
      jobW: Math.max(0, Math.round(W - (this.jobStartW ?? W))),
      doneW: Math.round(done.reduce((s, i) => s + i.actual, 0)),
      curEst: curItem && curItem.status !== 'completed' ? { mu: curItem.est.mu, sigma: curItem.est.sigma } : null,
      pend: pend.map(i => ({ mu: i.est.mu, sigma: i.est.sigma })),
      r: Math.round(r * 1000) / 1000,
      earned: finished.length > 0 || (restW > 0 && restEarned / restW >= 0.5),
      sq: withSq ? this.sq : null, note: this.note, aliveAt, stallMs, running: this.clock.running, rev: this.rev,
      elapsedMs: e, paceMs: null, rewroteAt: this.rewroteAt,
    };
  }
}

/** Percent from the bar as it stands at `now` (time-weighted); null with no list. */
export const percentOf = (p: ProgressV3 | null, working: boolean, now: number): number | null => (p ? Math.floor(barNow(p, working, now).p * 100) : null);

/** Time left in ms when it is earned (rule 5), else null; 0 when every item is ticked. */
export function etaOf(p: ProgressV3 | null, working: boolean, now: number): number | null {
  if (!p) return null;
  if (p.done >= p.total) return 0;
  const b = barNow(p, working, now);
  return p.earned && b.jobW >= 20_000 && !b.stalled ? Math.round(b.left) : null;
}

// ------------------------------------------------------------------ the live description

/** What the mod sends about a tool as it starts: the safe bits only (claude-link/hooks/link.ts activityOf). */
export interface ToolDetail { cmd?: string; desc?: string; file?: string; pattern?: string; where?: string; site?: string; query?: string; agent?: string; kind?: string; server?: string; name?: string; skill?: string; bg?: string }

export interface ActivityAgent {
  id: string;
  kind: string;
  what: string;
  since: number;
  /** Its own tool calls so far (heartbeats, and "14 tool calls" in its row). */
  calls: number;
  aliveAt: number;
  /** From its type's history; `n` past runs behind it (a bar needs 3). */
  est: Est | null;
  n: number;
  /** Runs in the foreground: the main loop waits on it, so it floors the item's time left. */
  fg: boolean;
  failed?: boolean;
  endedAt?: number;
  /** Its own to-do list, when it keeps one (2026-10-21, sheet 58 C): items done of all, for its own bar. */
  done?: number;
  total?: number;
}
/** The running command's own sub-bar (research step 5): "40 s, usually 1 min 30 s". */
export interface ActivityTool { since: number; est: Est; n: number; usual: number }
/** What the job card's drop-down says it is doing now. */
export interface Activity {
  /** One plain, slightly technical line, e.g. "Running the tests · npm test -- --run". Empty when idle. */
  now: string;
  /** When that started (the viewer adds "(12 s)"). */
  since: number;
  /** Helper agents running now (and failed ones for half a minute). */
  agents: ActivityAgent[];
  // v3 (optional so an older brain's activity still reads): the running command's sub-bar, when it has a history;
  // tool calls finished this turn (one pip each when there is no bar); the last sign of life and how long a silence
  // may last before it is a stall (rule 4).
  tool?: ActivityTool | null;
  pips?: number;
  aliveAt?: number;
  stallMs?: number;
}

/**
 * Anything that looks like a key, token or password, masked. The mod strips before sending; this runs again in the
 * brain, so a mod that forgot is still safe here.
 */
export function stripSecrets(s: string): string {
  return s
    .replace(/(\/\/)[^/\s:@]+:[^/\s@]+@/g, '$1•••@')
    .replace(/\b(Bearer|Basic|token)\s+[A-Za-z0-9._~+/=-]{8,}/gi, '$1 •••')
    .replace(/\b([A-Za-z_][A-Za-z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|PWD|AUTH|COOKIE|SESSION)[A-Za-z0-9_]*)(\s*[=:]\s*)("[^"]*"|'[^']*'|\S+)/gi, '$1$2•••')
    .replace(/(--?(?:password|passwd|pass|token|api[-_]?key|secret|auth|key)(?:=|\s+))("[^"]*"|'[^']*'|\S+)/gi, '$1•••')
    .replace(/([?&](?:key|token|access_token|api_key|apikey|sig|signature|password|secret|code)=)[^&\s"']+/gi, '$1•••')
    .replace(/\b(?:sk-(?:ant-)?|gh[pousr]_|github_pat_|xox[abprs]-|AKIA|AIza|glpat-|npm_)[A-Za-z0-9_-]{8,}/g, '•••')
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g, '•••')
    .replace(/\b(?=[A-Za-z0-9_+-]*\d)(?=[A-Za-z0-9_+-]*[A-Za-z])[A-Za-z0-9_+-]{32,}={0,2}/g, '•••');
}

const clean = (v: unknown, n: number): string => stripSecrets(String(v ?? '').replace(/\s+/g, ' ').trim()).slice(0, n);

/** What a shell command is doing, in plain words, from a small table. Null when nothing fits. */
export function commandLabel(cmd: string): string | null {
  const c = cmd.toLowerCase();
  const rows: [RegExp, string][] = [
    [/\b(vitest|jest|pytest|mocha|playwright test|node[^|;&]*--test|claude plugin test|go test|cargo test|dotnet test)\b|\b(npm|pnpm|yarn|bun)( run)? test\b/, 'Running the tests'],
    [/\btsc\b|type-?check|\b(npm|pnpm|yarn)( run)? (check|lint)\b|\beslint\b/, 'Checking the code'],
    [/\bgit\s+commit\b/, 'Committing'],
    [/\bgit\s+push\b/, 'Pushing to GitHub'],
    [/\bgit\s+(pull|fetch|rebase|merge)\b/, 'Pulling the latest'],
    [/\bgit\s+(status|diff|log|show|blame)\b/, 'Looking at the changes'],
    [/\bgit\s+(add|restore|checkout|switch|branch)\b/, 'Sorting out git'],
    [/\b(npm|pnpm|yarn|bun)\s+(i|install|add|ci)\b|\bpip3? install\b|\bwinget install\b/, 'Installing packages'],
    [/\b(npm|pnpm|yarn)( run)? build\b|\b(vite build|webpack|esbuild|electron-builder|msbuild|dotnet build|cargo build|make)\b/, 'Building'],
    [/\belectron\b/, 'Running an Electron check'],
    [/\b(curl|wget|invoke-webrequest|invoke-restmethod)\b/, 'Fetching from the web'],
    [/^\s*(ls|dir|cat|head|tail|find|grep|rg|wc|sed -n|get-childitem|get-content|select-string|tree)\b/, 'Looking around the files'],
    [/^\s*(cd|mkdir|cp|mv|rm|copy-item|move-item|remove-item|new-item)\b/, 'Moving files around'],
    [/\b(node|python3?|py|tsx|ts-node|deno|bun)\s/, 'Running a script'],
  ];
  for (const [re, label] of rows) if (re.test(c)) return label;
  return null;
}

/** Friendlier names for the tool servers he knows. */
const SERVERS: Record<string, string> = {
  'claude-in-chrome': 'Chrome', 'aang-browser': 'Samara', 'computer-use': 'the desktop', 'Claude_Browser': 'the browser pane',
  'scheduled-tasks': 'scheduled tasks', 'mcp-registry': 'the connector list',
};

const base = (p: string): string => p.split(/[\\/]/).filter(Boolean).pop() ?? p;

/** The plain line for a tool that just started (rule: a small table, no model call; plain words over cleverness). */
export function describeTool(tool: string, d: ToolDetail = {}): string {
  const cmd = clean(d.cmd, 60), file = base(clean(d.file, 120)).slice(0, 60);
  switch (tool) {
    case 'Bash': case 'PowerShell': {
      const desc = clean(d.desc, 60);
      const label = commandLabel(cmd) ?? (desc ? desc.replace(/\.$/, '') : 'Running a command');
      return cmd ? `${label} · ${cmd}` : label;
    }
    case 'Edit': case 'MultiEdit': case 'NotebookEdit': return file ? `Editing ${file}` : 'Editing a file';
    case 'Write': return file ? `Writing ${file}` : 'Writing a file';
    case 'Read': return file ? `Reading ${file}` : 'Reading a file';
    case 'Grep': {
      const pat = clean(d.pattern, 40), where = base(clean(d.where, 80)).slice(0, 40);
      return pat ? `Searching the code for "${pat}"${where ? ` in ${where}` : ''}` : 'Searching the code';
    }
    case 'Glob': { const pat = clean(d.pattern, 50); return pat ? `Looking for files · ${pat}` : 'Looking for files'; }
    case 'WebFetch': { const site = clean(d.site, 60); return site ? `Reading a web page · ${site}` : 'Reading a web page'; }
    case 'WebSearch': { const q = clean(d.query, 60); return q ? `Searching the web · ${q}` : 'Searching the web'; }
    case 'Agent': case 'Task': { const w = clean(d.agent, 60); return w ? `Handing work to a helper agent · ${w}` : 'Handing work to a helper agent'; }
    case 'Skill': { const s = clean(d.skill, 40); return s ? `Using the ${s} skill` : 'Using a skill'; }
    case 'AskUserQuestion': return 'Asking you a question';
    case 'ExitPlanMode': return 'Showing you its plan';
    case 'TodoWrite': case 'TaskCreate': case 'TaskUpdate': case 'TaskList': case 'TaskGet': return 'Updating its to-do list';
    default: {
      const m = /^mcp__(.+?)__(.+)$/.exec(tool);
      if (m) {
        const server = clean(d.server || m[1], 40), name = clean(d.name || m[2], 40).replace(/_/g, ' ');
        return `Using ${SERVERS[server] ?? server} · ${name}`;
      }
      return `Using ${clean(tool, 40) || 'a tool'}`;
    }
  }
}

/** The line while a session is waiting on him: it beats whatever tool is "running" behind the dialog. */
const WAITING: Record<string, string> = { permission: 'Waiting for your OK', question: 'Waiting for your answer', plan: 'Waiting for you to look at the plan' };

const AGENT_MAX_MS = 2 * 3600_000;
/** A failed helper stays on the card (red) this long, so he sees it went wrong. */
const FAILED_SHOWN_MS = 30_000;

interface RunningTool { tool: string; line: string; since: number; est: Estimate | null; cmd: string; family: string; tainted: boolean }

/** One job's live activity: the tools running now, the helper agents, the heartbeats, and the command history. */
export class ActivityKeeper {
  private readonly tools = new Map<string, RunningTool>();
  /** What the model is streaming right now, between tools (2026-10-21): its reply, its thinking, or a tool call's arguments. */
  private stream: { line: string; since: number } | null = null;
  private streaming = false;
  private readonly agents = new Map<string, ActivityAgent>();
  private quietSince: number | null = null;
  private pips = 0;
  aliveAt: number;
  private readonly ctx: KeeperCtx | null;
  constructor(ctx: KeeperCtx | null = null, now = Date.now()) { this.ctx = ctx; this.aliveAt = now; }

  /** Any sign of life (rule 4). Event times only ever move it forward. */
  alive(t: number): void { if (t > this.aliveAt) this.aliveAt = t; }

  toolStart(id: string, tool: string, detail: ToolDetail, now: number): void {
    if (!id) return;
    const cmd = tool === 'Bash' || tool === 'PowerShell' ? clean(detail.cmd, 60) : '';
    const family = cmd ? (commandLabel(cmd) ?? 'cmd') : '';
    const est = cmd && this.ctx ? this.ctx.hist.cmd(this.ctx.project(), cmd, family, stripSecrets) : null;
    this.tools.set(id, { tool, line: describeTool(tool, detail), since: now, est, cmd, family, tainted: false });
    this.stream = null; this.streaming = false;
    this.alive(now);
    while (this.tools.size > 20) this.tools.delete(this.tools.keys().next().value!);
  }
  /** A tool ended. A shell command that finished well, with nothing waiting on him meanwhile, teaches the history. Returns its family ("Pushing to GitHub"), or ''. */
  toolEnd(id: string, now: number, ok = true): string {
    const t = this.tools.get(id);
    this.alive(now);
    if (!t) return '';
    this.tools.delete(id);
    this.pips++;
    if (!this.tools.size) this.quietSince = now;
    if (t.cmd && this.ctx && !t.tainted && now - t.since > 0) {
      this.ctx.hist.add({ at: now, src: 'cmd', p: this.ctx.project(), k: t.family, key: stripSecrets(t.cmd).slice(0, 40), ms: now - t.since, ok });
    }
    return t.family;
  }
  /** Something asked him while these tools ran: their durations include his answer, so they teach nothing. */
  taint(): void { for (const t of this.tools.values()) t.tainted = true; }
  /** The turn ended (or the brain lost track): nothing of it can still be running. */
  clearTools(now: number): void { this.tools.clear(); this.stream = null; this.streaming = false; this.quietSince = now; }
  turnStart(now: number): void { this.tools.clear(); this.stream = null; this.streaming = false; this.quietSince = now; this.pips = 0; this.alive(now); }

  /**
   * A model step began streaming something (2026-10-21, "as fast as when Claude gets a reply"): its answer ("Writing
   * the reply"), its thinking, or a tool call whose arguments are still arriving (a big Write streams for many seconds
   * before the tool runs, so the line says "Writing a file" from the first byte, then the tool's own line takes over).
   */
  step(what: string, tool: string, now: number): void {
    this.alive(now);
    this.streaming = true;
    const line = what === 'text' ? 'Writing the reply' : what === 'thinking' ? 'Thinking' : what === 'tool' && tool ? describeTool(tool) : '';
    if (!line) return;
    if (this.stream?.line !== line) this.stream = { line, since: now };
  }
  /** The mod's heartbeat while chunks stream (at most every 2 s), or a helper agent's. */
  beat(now: number, agent = ''): void {
    this.alive(now);
    if (!agent) { this.streaming = true; return; }
    const a = this.agents.get(agent);
    if (a) a.aliveAt = Math.max(a.aliveAt, now);
  }

  agentStart(id: string, kind: string, what: string, now: number, fg = true): void {
    if (!id) return;
    const k = clean(kind, 40) || 'helper', w = clean(what, 80);
    const est = this.ctx ? this.ctx.hist.agent(k, w) : null;
    this.agents.set(id, { id, kind: k, what: w, since: now, calls: 0, aliveAt: now, est: est ? { mu: est.mu, sigma: est.sigma } : null, n: est?.n ?? 0, fg });
    this.alive(now);
    while (this.agents.size > 20) this.agents.delete(this.agents.keys().next().value!);
  }
  /** One of a helper agent's own tool calls: a heartbeat for it and the job, and one more for "14 tool calls". */
  agentTool(id: string, now: number): void {
    const a = this.agents.get(id);
    this.alive(now);
    if (!a) return;
    a.calls++; a.aliveAt = Math.max(a.aliveAt, now);
  }
  /** A helper finished: a good run teaches its type's history; a failed one stays on the card in red for a moment. */
  agentEnd(id: string, now = Date.now(), ok = true): void {
    const a = this.agents.get(id);
    this.alive(now);
    if (!a) return;
    if (ok) {
      this.agents.delete(id);
      if (this.ctx && now - a.since > 1000) this.ctx.hist.add({ at: now, src: 'agent', k: a.kind, key: kindOf(a.what), ms: now - a.since, ok: true });
    } else { a.failed = true; a.endedAt = now; }
  }
  clearAgents(): void { this.agents.clear(); }
  /**
   * A helper agent wrote its own to-do list (2026-10-21, sheet 58 C): its row's bar is then its own items done of all.
   * A sign of life for it and the job. Nonsense counts are ignored rather than drawn.
   */
  agentTodos(id: string, done: number, total: number, now: number): void {
    const a = this.agents.get(id);
    this.alive(now);
    if (!a || !Number.isFinite(done) || !Number.isFinite(total) || total < 1 || total > 200) return;
    a.total = Math.round(total); a.done = Math.max(0, Math.min(a.total, Math.round(done)));
    a.aliveAt = Math.max(a.aliveAt, now);
  }

  /** How long a silence may last now (rule 4): a tool's own history, the model streaming, or between steps. */
  stallMs(): number {
    const running = [...this.tools.values()];
    if (running.length) {
      let p90: number | null = null;
      for (const t of running) {
        const e = t.est ?? (t.tool === 'Agent' || t.tool === 'Task' ? this.fgAgentEst() : null);
        if (e) p90 = Math.max(p90 ?? 0, p90Of(e));
        else { p90 = null; break; }
      }
      return stallLimit({ tool: true, toolP90: p90, streaming: this.streaming });
    }
    return stallLimit({ tool: false, streaming: this.streaming });
  }
  private fgAgentEst(): Est | null { for (const a of this.agents.values()) if (a.fg && a.est && !a.failed) return a.est; return null; }

  /** The helper agents' clocks for barNow: a foreground one floors the item's time left. */
  agentClocks(): AgentEst[] { return [...this.agents.values()].map(a => ({ since: a.since, est: a.est, fg: a.fg, ...(a.failed ? { failed: true } : {}), ...(a.endedAt ? { endedAt: a.endedAt } : {}) })); }

  /**
   * What the drop-down says now. `phase` is the job's; `waiting` the kind of the oldest thing waiting on him, if any.
   * Between tools while working: "Thinking" (since the last tool ended).
   */
  snapshot(phase: string, waiting: string | null, now: number): Activity {
    for (const [id, a] of this.agents) {
      if (now - a.since > AGENT_MAX_MS) this.agents.delete(id);                 // its end was lost
      else if (a.endedAt && now - a.endedAt > FAILED_SHOWN_MS) this.agents.delete(id);
    }
    const agents = [...this.agents.values()].sort((a, b) => a.since - b.since).map(a => ({ ...a, ...(a.est ? { est: { ...a.est } } : {}) }));
    const last = [...this.tools.values()].pop();
    const tool: ActivityTool | null = last?.est ? { since: last.since, est: { mu: last.est.mu, sigma: last.est.sigma }, n: last.est.n, usual: Math.round(medianOf(last.est)) } : null;
    const extra = { agents, tool, pips: this.pips, aliveAt: this.aliveAt, stallMs: this.stallMs() };
    if (phase === 'paused') return { now: 'Paused', since: this.quietSince ?? now, ...extra };
    if (waiting && WAITING[waiting]) return { now: WAITING[waiting]!, since: now, ...extra };
    if (last) return { now: last.line, since: last.since, ...extra };
    if (this.stream && phase === 'working') return { now: this.stream.line, since: this.stream.since, ...extra };
    if (phase === 'working') return { now: 'Thinking', since: this.quietSince ?? now, ...extra };
    return { now: '', since: this.quietSince ?? now, ...extra };
  }
}

/** A keeper context with no history on disk (tests, and before the brain hands over its folder). */
export const memoryCtx = (project = '', model = ''): KeeperCtx => ({ hist: new ProgressHistory(null), project: () => project, model: () => model });
export { estOf };

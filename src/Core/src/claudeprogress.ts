// The progress engine and the live "what's happening" line for Claude jobs (2026-10-21).
//
// His asks: "those progress bars and ALL progress bars in Aang airtight and real time", and a working drop-down that
// says in plain (slightly technical) words what the session is doing right now: the tool running, any helper agents,
// then the to-do list.
//
// THE RULES (agreed 2026-10-21; docs/COCKPIT-BUILD.md "The progress engine" has the same list):
//   1. Only real events move a bar: a task ticked, the to-do list rewritten, a tool starting or ending, a turn
//      starting or ending. Never a guess from wording.
//   2. Never backwards, except when Claude rewrites its to-do list (fewer or different tasks): then the bar may drop,
//      and the job says so once ("Claude rewrote its list"). `rev` counts those rewrites; a viewer only lets its bar
//      drop when `rev` changed.
//   3. Smooth between ticks: inside the task in progress the bar creeps forward by the pace so far (the median time
//      per finished task; before any task finishes, a sane default), never past 90% of that task's slot. The brain
//      sends only the authoritative numbers below; every viewer computes the creep itself, every frame, so the bar
//      moves live without the brain sending anything.
//   4. Real time: every change is pushed the moment it happens (the Core keeps a tiny coalesce, under 100 ms, for
//      bursts). The mod reports tools starting and ending and the to-do list changing at once. No polling for state.
//   5. Honest when it cannot know: no to-do list = no percent (the busy look, "Working"), never a fake 0%; time left
//      only once there is a real pace; "about" for every estimate.
//   6. One engine, one look: these numbers here, and one renderer in the Shell (claudejobs.js progressModel /
//      liveProgress / livePill) for the jobs strip, the job cards, Samara's rune panel and the pop-out. The pet's
//      marks keep reading the same tracker.
//
// Time is "working time": the clock stops while the session sits idle between turns or paused, so a lunch break never
// counts as slow progress, and starts again on the next turn or tool.

/** The creep's pace before any task has finished (rule 3). Never shown as a time left (rule 5). */
export const DEFAULT_PACE_MS = 120_000;
/** The creep never passes this share of the task's own slot (rule 3). */
export const SLOT_CAP = 0.9;

/** The authoritative numbers a viewer draws a bar from. */
export interface Progress {
  /** Ticked tasks. */
  done: number;
  /** All tasks. Never 0 here: no list means no Progress at all (rule 5). */
  total: number;
  /** The task in hand (in progress, else the first not ticked), or -1 with everything ticked. */
  cur: number;
  /** Working time spent on the task in hand, measured at `at`. */
  elapsedMs: number;
  /** When these numbers were taken (ms since 1970, this PC's clock: the brain and the Shell share it). */
  at: number;
  /** Median working time per finished task; null until one has finished. */
  paceMs: number | null;
  /** Counts list rewrites. A viewer lets its bar drop only when this changed (rule 2). */
  rev: number;
  /** When a rewrite last made the bar drop, so the job can say so once; null if never. */
  rewroteAt: number | null;
}

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m]! : Math.round((s[m - 1]! + s[m]!) / 2);
};

/** One job's progress clock: fed real events only, read as Progress. */
export class ProgressKeeper {
  private idleTotal = 0;
  private idleSince: number | null = null;
  private texts: string[] = [];
  private done = 0;
  private total = 0;
  private cur = -1;
  private curKey = '';
  private curStartW = 0;
  private lastTickW: number | null = null;
  private durations: number[] = [];
  private rev = 0;
  private rewroteAt: number | null = null;
  /** The tasks ticked last time, by their words, so a tick is counted once. */
  private wasDone = new Set<string>();

  /** Working time now: the wall clock less every idle or paused stretch. */
  private w(now: number): number { return now - this.idleTotal - (this.idleSince !== null ? Math.max(0, now - this.idleSince) : 0); }

  /** A turn or a tool started: the clock runs. */
  go(now: number): void { if (this.idleSince !== null) { this.idleTotal += Math.max(0, now - this.idleSince); this.idleSince = null; } }
  /** The turn ended, or he paused it: the clock stops. */
  stop(now: number): void { if (this.idleSince === null) this.idleSince = now; }

  /** Claude's to-do list as it is now (rule 1: a real event). */
  todos(tasks: readonly { text: string; status: string }[], now: number): void {
    const W = this.w(now);
    const texts = tasks.map(t => t.text);
    const done = tasks.filter(t => t.status === 'completed').length, total = tasks.length;
    const base = total ? done / total : 0, oldBase = this.total ? this.done / this.total : 0;
    // Rule 2: a list that is not the same list (tasks added, dropped or renamed), or a bar that would go down, is a
    // rewrite. Only a drop (or a shorter list) is worth telling him about.
    if (this.total) {
      const changed = texts.length !== this.texts.length || texts.some((t, i) => t !== this.texts[i]);
      if (changed || base < oldBase) {
        this.rev++;
        if (base < oldBase || total < this.total) this.rewroteAt = now;
      }
    }
    // Pace: the working time since the last tick, shared out among the tasks ticked now (Claude often ticks several
    // in one go, and three ticks at "0 s" would make the median a lie).
    if (total && this.lastTickW === null) this.lastTickW = W;
    const newly = tasks.filter(t => t.status === 'completed' && !this.wasDone.has(t.text)).length;
    if (newly > 0 && this.lastTickW !== null) {
      const each = Math.max(0, W - this.lastTickW) / newly;
      for (let k = 0; k < newly; k++) this.durations.push(each);
      this.durations = this.durations.slice(-50);
      this.lastTickW = W;
    }
    this.wasDone = new Set(tasks.filter(t => t.status === 'completed').map(t => t.text));
    let cur = tasks.findIndex(t => t.status === 'in_progress');
    if (cur < 0) cur = tasks.findIndex(t => t.status !== 'completed');
    // The task in hand starts its own clock when it changes (or when another task is ticked before it).
    const key = `${done}|${cur >= 0 ? tasks[cur]!.text : ''}`;
    if (key !== this.curKey) { this.curKey = key; this.curStartW = W; }
    this.texts = texts; this.done = done; this.total = total; this.cur = cur;
  }

  /** Null without a to-do list (rule 5). */
  snapshot(now: number): Progress | null {
    if (!this.total) return null;
    return {
      done: this.done, total: this.total, cur: this.cur, elapsedMs: Math.max(0, Math.round(this.w(now) - this.curStartW)), at: now,
      paceMs: median(this.durations), rev: this.rev, rewroteAt: this.rewroteAt,
    };
  }
}

/** Percent from the authoritative numbers (ticked tasks only, no creep); null with no list. */
export const percentOf = (p: Progress | null): number | null => (p ? Math.round(p.done / p.total * 100) : null);

/**
 * Time left, from a real pace only (rule 5): the tasks not ticked times the pace, less what the task in hand has
 * already had (at most 90% of a pace, as the bar). 0 when every task is ticked; null until a task has finished.
 */
export function etaOf(p: Progress | null): number | null {
  if (!p) return null;
  if (p.done >= p.total) return 0;
  if (p.paceMs === null) return null;
  return Math.max(0, Math.round((p.total - p.done) * p.paceMs - Math.min(p.elapsedMs, SLOT_CAP * p.paceMs)));
}

/**
 * Where the bar stands at `now`, 0..1, creep included (rule 3). The Shell's progressModel is the same sum; this copy is
 * for the brain's own tests and anything in the Core that wants the live figure. `working` false freezes the creep.
 */
export function barAt(p: Progress | null, working: boolean, now: number): number | null {
  if (!p) return null;
  const base = p.done / p.total;
  if (!working || p.cur < 0 || p.done >= p.total) return base;
  const f = (p.elapsedMs + Math.max(0, now - p.at)) / (p.paceMs ?? DEFAULT_PACE_MS);
  return base + creep(f) / p.total;
}

/** Share of a slot crept after `f` paces: straight up to 60%, then easing towards 90%, never past it. */
export function creep(f: number): number {
  if (!(f > 0)) return 0;
  const c = f <= 0.6 ? f : 0.6 + 0.3 * (1 - Math.exp(-(f - 0.6) / 0.6));
  return Math.min(SLOT_CAP - 1e-6, c);
}

// ------------------------------------------------------------------ the live description

/** What the mod sends about a tool as it starts: the safe bits only (claude-link/hooks/link.ts activityOf). */
export interface ToolDetail { cmd?: string; desc?: string; file?: string; pattern?: string; where?: string; site?: string; query?: string; agent?: string; kind?: string; server?: string; name?: string; skill?: string }

export interface ActivityAgent { kind: string; what: string; since: number }
/** What the job card's drop-down says it is doing now. */
export interface Activity {
  /** One plain, slightly technical line, e.g. "Running the tests · npm test -- --run". Empty when idle. */
  now: string;
  /** When that started (the viewer adds "(12 s)"). */
  since: number;
  /** Helper agents running now. */
  agents: ActivityAgent[];
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

/** One job's live activity: the tools running now, the helper agents, and when the last thing changed. */
export class ActivityKeeper {
  private readonly tools = new Map<string, { line: string; since: number }>();
  private readonly agents = new Map<string, ActivityAgent>();
  private quietSince: number | null = null;

  toolStart(id: string, tool: string, detail: ToolDetail, now: number): void {
    if (!id) return;
    this.tools.set(id, { line: describeTool(tool, detail), since: now });
    while (this.tools.size > 20) this.tools.delete(this.tools.keys().next().value!);
  }
  toolEnd(id: string, now: number): void { if (this.tools.delete(id) && !this.tools.size) this.quietSince = now; }
  /** The turn ended (or the brain lost track): nothing of it can still be running. */
  clearTools(now: number): void { this.tools.clear(); this.quietSince = now; }
  turnStart(now: number): void { this.tools.clear(); this.quietSince = now; }

  agentStart(id: string, kind: string, what: string, now: number): void {
    if (!id) return;
    this.agents.set(id, { kind: clean(kind, 40) || 'helper', what: clean(what, 80), since: now });
    while (this.agents.size > 20) this.agents.delete(this.agents.keys().next().value!);
  }
  agentEnd(id: string): void { this.agents.delete(id); }
  clearAgents(): void { this.agents.clear(); }

  /**
   * What the drop-down says now. `phase` is the job's; `waiting` the kind of the oldest thing waiting on him, if any.
   * Between tools while working: "Thinking" (since the last tool ended).
   */
  snapshot(phase: string, waiting: string | null, now: number): Activity {
    for (const [id, a] of this.agents) if (now - a.since > AGENT_MAX_MS) this.agents.delete(id);   // its end was lost
    const agents = [...this.agents.values()].sort((a, b) => a.since - b.since).map(a => ({ ...a }));
    if (phase === 'paused') return { now: 'Paused', since: this.quietSince ?? now, agents };
    if (waiting && WAITING[waiting]) return { now: WAITING[waiting]!, since: now, agents };
    const last = [...this.tools.values()].pop();
    if (last) return { now: last.line, since: last.since, agents };
    if (phase === 'working') return { now: 'Thinking', since: this.quietSince ?? now, agents };
    return { now: '', since: this.quietSince ?? now, agents };
  }
}

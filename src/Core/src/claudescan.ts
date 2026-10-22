// Claude sessions Aang finds by himself (2026-10-21, his ask: "Can Aang pick up any running sessions in Claude, even
// if I restart him?").
//
// The aang-link mod tells a brain everything once it reaches it (a snapshot), but a session started before the mod
// existed never loads it until it is restarted, and a brain that just started has heard from nobody. So the brain also
// looks at Claude Code's own transcripts (~/.claude/projects/<folder>/<session>.jsonl, or CLAUDE_CONFIG_DIR's): on
// start and every 10 s, only files touched in the last 30 minutes, only the last ~200 KB of each, and only a few facts
// from it: the folder, the to-do list (the last TodoWrite / Task tool / progress-tool inputs, applied in order), whether
// a turn is still going, the tool running now, the model, the first words of the last prompt. Nothing of a transcript
// is kept or sent anywhere else. Helper agents' entries (isSidechain) and Aang's own chat lanes (.aang-self) are
// skipped. A job made this way is `source: 'transcript'`: progress and the live line, never answering; the session's
// mod takes it over the moment it talks (same session id). The Mac's sessions are out of scope.
import { open, readdir, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { ToolDetail } from './claudeprogress.ts';

export interface TranscriptTask { text: string; status: 'pending' | 'in_progress' | 'completed'; active?: string }
/** What one transcript says about its session, now. */
export interface TranscriptSession {
  session: string;
  cwd: string;
  model: string;
  /** The first 200 characters of the last thing he typed. */
  prompt: string;
  /** A turn is under way: the last word is his prompt, a tool's result, or a tool call not answered yet. */
  working: boolean;
  /** The last turn ended with Claude's answer (not an interruption). */
  answered: boolean;
  tasks: TranscriptTask[];
  /** The tool running now (the last call with no result yet), its safe bits only. */
  tool: { name: string; detail: ToolDetail } | null;
  /** The file's last write. */
  mtime: number;
}

const SELF = /[\\/]\.aang-self[\\/]?$/i;
const LIST_TOOLS = new Set(['TodoWrite', 'TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet', 'mcp__aang-link__progress']);
const STATUS = ['pending', 'in_progress', 'completed'];
/** A transcript that ends on a tool's result and has been silent this long is no longer mid-turn. */
const QUIET_RESULT_MS = 5 * 60_000;
const str = (v: unknown, n: number) => (typeof v === 'string' ? v : '').replace(/\s+/g, ' ').trim().slice(0, n);
const status = (s: unknown): TranscriptTask['status'] => (STATUS.includes(String(s)) ? s as TranscriptTask['status'] : 'pending');

/** Where Claude Code keeps its transcripts on this PC. */
export function projectsDir(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'projects');
}

/** The safe bits of a tool call for the live line (the same fields the mod sends; describeTool masks secrets again). */
function detailOf(name: string, i: Record<string, unknown>): ToolDetail {
  const d: Record<string, string> = {};
  const put = (k: string, v: unknown, n = 300) => { const s = str(v, n); if (s) d[k] = s; };
  if (name === 'Bash' || name === 'PowerShell') { put('cmd', i.command, 120); put('desc', i.description, 80); }
  else if (['Edit', 'MultiEdit', 'Write', 'Read', 'NotebookEdit'].includes(name)) put('file', String(i.file_path ?? i.notebook_path ?? '').split(/[\\/]/).pop());
  else if (name === 'Grep') { put('pattern', i.pattern, 60); put('where', String(i.path ?? '').split(/[\\/]/).pop()); }
  else if (name === 'Glob') put('pattern', i.pattern, 60);
  else if (name === 'WebFetch') { try { d.site = new URL(String(i.url ?? '')).hostname.slice(0, 60); } catch { /* not a URL */ } }
  else if (name === 'WebSearch') put('query', i.query, 80);
  else if (name === 'Agent' || name === 'Task') { put('agent', i.description, 80); put('kind', i.subagent_type, 40); }
  else if (name === 'Skill') put('skill', i.skill ?? i.command, 40);
  return d as ToolDetail;
}

/**
 * Reads the tail of one transcript (`fromStart`: the text is the whole file, so its first line is whole). Null when it
 * holds nothing of a main-loop session, or the session is one of Aang's own lanes.
 */
export function readTranscript(text: string, fromStart: boolean, mtime: number, selfCwd = '', now = Date.now()): TranscriptSession | null {
  const lines = text.split('\n');
  if (!fromStart) lines.shift();                 // cut mid-line
  let session = '', cwd = '', model = '', prompt = '';
  let state: 'idle' | 'working' = 'idle', answered = false, sdk = false, lastWasResult = false;
  const tasks = new Map<string, TranscriptTask>();
  const pending = new Map<string, { name: string; input: Record<string, unknown> }>();
  for (const line of lines) {
    if (!line.trim()) continue;
    let j: any;
    try { j = JSON.parse(line); } catch { continue; }
    if (j?.isSidechain === true) continue;       // a helper agent's own conversation: never the session's list
    if (j?.type !== 'user' && j?.type !== 'assistant') continue;
    if (typeof j.sessionId === 'string') session = j.sessionId;
    if (typeof j.cwd === 'string') cwd = j.cwd;
    // Aang's own Agent SDK lanes (plain words, chat) write transcripts too; his sessions are the app's or a terminal's.
    if (typeof j.entrypoint === 'string' && /^sdk/i.test(j.entrypoint)) sdk = true;
    const content = j.message?.content;
    lastWasResult = false;
    if (j.type === 'assistant') {
      if (typeof j.message?.model === 'string' && !j.message.model.startsWith('<')) model = j.message.model;
      state = 'working';
      for (const b of Array.isArray(content) ? content : []) {
        if (b?.type !== 'tool_use' || typeof b.id !== 'string') continue;
        const name = String(b.name ?? ''), input = (b.input && typeof b.input === 'object' ? b.input : {}) as Record<string, unknown>;
        pending.set(b.id, { name, input });
        if (name === 'TodoWrite' && Array.isArray(input.todos)) {
          tasks.clear();
          input.todos.forEach((t: any, n: number) => tasks.set(String(n), { text: str(t?.content, 300), status: status(t?.status), ...(t?.activeForm ? { active: str(t.activeForm, 300) } : {}) }));
        } else if (name === 'mcp__aang-link__progress' && Array.isArray(input.tasks)) {
          tasks.clear();
          input.tasks.slice(0, 100).forEach((t: any, n: number) => tasks.set(String(n), { text: str(t?.text, 300), status: status(t?.status), ...(t?.active ? { active: str(t.active, 300) } : {}) }));
        } else if (name === 'TaskCreate' && str(input.subject, 300)) {
          tasks.set(`new:${b.id}`, { text: str(input.subject, 300), status: 'pending', ...(input.activeForm ? { active: str(input.activeForm, 300) } : {}) });
        } else if (name === 'TaskUpdate') {
          const id = String(input.taskId ?? ''), t = tasks.get(id);
          if (t && input.status === 'deleted') tasks.delete(id);
          else if (t) tasks.set(id, { ...t, ...(input.status ? { status: status(input.status) } : {}), ...(input.subject ? { text: str(input.subject, 300) } : {}), ...(input.activeForm ? { active: str(input.activeForm, 300) } : {}) });
        }
      }
      const stop = j.message?.stop_reason;
      if (stop === 'end_turn' || stop === 'stop_sequence' || stop === 'max_tokens' || stop === 'refusal') { state = 'idle'; answered = stop !== 'refusal'; pending.clear(); }
    } else {
      if (j.isMeta === true) continue;
      if (typeof content === 'string' || (Array.isArray(content) && content.some((b: any) => b?.type === 'text'))) {
        const t = typeof content === 'string' ? content : content.filter((b: any) => b?.type === 'text').map((b: any) => b.text).join(' ');
        if (/^\s*\[Request interrupted by user/.test(t)) { state = 'idle'; answered = false; pending.clear(); continue; }
        if (!Array.isArray(content) || !content.some((b: any) => b?.type === 'tool_result')) {
          // Tags the app or a tool wrote (<task-notification>, <command-name>) are not his words.
          if (!/^\s*</.test(t)) prompt = str(t, 200);
          state = 'working'; answered = false;
        }
      }
      for (const b of Array.isArray(content) ? content : []) {
        if (b?.type !== 'tool_result') continue;
        const was = pending.get(String(b.tool_use_id ?? ''));
        pending.delete(String(b.tool_use_id ?? ''));
        state = 'working'; lastWasResult = true;
        // The Claude app's own turn-ending tools (its next-step box): the turn ends with their result, no answer after.
        if (was && /^mcp__ccd_turn__/.test(was.name)) { state = 'idle'; answered = true; pending.clear(); lastWasResult = false; continue; }
        // A new task's real id only comes back in its result: swapped in place, so the order holds.
        if (was?.name === 'TaskCreate') {
          const real = j.toolUseResult?.task?.id, tmp = `new:${b.tool_use_id}`;
          if (real !== undefined && tasks.has(tmp)) {
            const rows = [...tasks.entries()]; tasks.clear();
            for (const [k, v] of rows) tasks.set(k === tmp ? String(real) : k, v);
          }
        }
      }
    }
  }
  if (!session || sdk || (selfCwd && cwd === selfCwd) || SELF.test(cwd)) return null;
  // Ending on a tool's result and then silent for minutes: Claude would have written its next step long since, so
  // the turn ended some way the transcript does not record (an app-side stop).
  if (state === 'working' && lastWasResult && !pending.size && now - mtime > QUIET_RESULT_MS) { state = 'idle'; answered = true; }
  const last = [...pending.values()].filter(p => !LIST_TOOLS.has(p.name)).pop();
  return {
    session, cwd, model, prompt, working: state === 'working', answered: state === 'idle' && answered,
    tasks: [...tasks.values()].filter(t => t.text), tool: state === 'working' && last ? { name: last.name, detail: detailOf(last.name, last.input) } : null, mtime,
  };
}

/** The tail of a file, up to `bytes`; `whole` when that is the entire file. */
async function tail(file: string, bytes: number): Promise<{ text: string; whole: boolean }> {
  const fh = await open(file, 'r');
  try {
    const size = (await fh.stat()).size, start = Math.max(0, size - bytes);
    const buf = Buffer.alloc(size - start);
    await fh.read(buf, 0, buf.length, start);
    return { text: buf.toString('utf8'), whole: start === 0 };
  } finally { await fh.close(); }
}

/** What the scan hands the tracker; JobTracker implements it (claudelink.ts). */
export interface TranscriptSink {
  fromTranscript(s: TranscriptSession, now: number): void;
  dropTranscript(session: string): void;
}

/** Fresh: touched within this. Older and not mid-turn, a session drops off. */
export const FRESH_MS = 30 * 60_000;
/** A session that looks mid-turn but has been silent this long has died with its turn: it drops off too. */
export const STUCK_MS = 2 * 3600_000;

export class TranscriptScan {
  private readonly root: string;
  private readonly sink: TranscriptSink;
  private readonly selfCwd: () => string;
  private readonly tailBytes: number;
  /** file -> its mtime when last read, and the session it held. */
  private readonly known = new Map<string, { mtime: number; session: string; working: boolean; relooked?: boolean }>();
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  constructor(sink: TranscriptSink, opts: { root?: string; selfCwd?: () => string; tailBytes?: number } = {}) {
    this.sink = sink; this.root = opts.root ?? projectsDir(); this.selfCwd = opts.selfCwd ?? (() => ''); this.tailBytes = opts.tailBytes ?? 200_000;
  }

  start(everyMs = 10_000): void {
    if (this.timer) return;
    void this.scan();
    this.timer = setInterval(() => { void this.scan(); }, everyMs);
    this.timer.unref?.();
  }
  stop(): void { if (this.timer) clearInterval(this.timer); this.timer = null; }

  /** One pass: new or changed fresh transcripts are read; stale ones are let go. Never throws. */
  async scan(now = Date.now()): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      let dirs: string[] = [];
      try { dirs = await readdir(this.root); } catch { return; }
      const seen = new Set<string>();
      for (const d of dirs) {
        let files: string[] = [];
        try { files = (await readdir(path.join(this.root, d))).filter(f => f.endsWith('.jsonl')); } catch { continue; }
        for (const f of files) {
          const file = path.join(this.root, d, f);
          let mtime = 0;
          try { mtime = (await stat(file)).mtimeMs; } catch { continue; }
          const was = this.known.get(file);
          const age = now - mtime;
          if (age > (was?.working ? STUCK_MS : FRESH_MS)) continue;     // stale: left out (and let go below)
          seen.add(file);
          // Unchanged since it was read; one more look once a mid-turn one has gone quiet (it may have ended unrecorded).
          if (was && was.mtime === mtime && !(was.working && !was.relooked && age > QUIET_RESULT_MS)) continue;
          try {
            const { text, whole } = await tail(file, this.tailBytes);
            const s = readTranscript(text, whole, mtime, this.selfCwd(), now);
            if (!s) { this.known.set(file, { mtime, session: '', working: false }); continue; }
            this.known.set(file, { mtime, session: s.session, working: s.working, relooked: was?.mtime === mtime });
            this.sink.fromTranscript(s, now);
          } catch { /* mid-write or gone: next pass */ }
          // 2026-10-21: a turn of the event loop between files, so a pass over several busy transcripts is never one
          // long stretch of the brain's time (each file is a positioned read of its tail, ~1-2 ms to parse).
          await new Promise(r => setImmediate(r));
        }
      }
      for (const [file, k] of this.known) {
        if (seen.has(file)) continue;
        this.known.delete(file);
        if (k.session) this.sink.dropTranscript(k.session);
      }
    } finally { this.busy = false; }
  }
}

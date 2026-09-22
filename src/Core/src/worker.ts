// Aang's background worker (2026-09-22). Joshua: "aang needs to be as autonomous as claude in the sense that claude
// finds a way to GET things done" and "aang feels dumb without this type of power". A job runs in Aang's own session,
// headless, on the strongest model, with Aang's own tools and gates (nothing new is unlocked: every change still asks
// the way it always has). Aang owns the session, so it can be continued, asked about, and stopped, and it reports
// through the same tiers as any Claude session: a tick when done, a "!" when it needs him.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { writeFileAtomic } from './atomic.ts';

export type TaskState = 'working' | 'done' | 'needs you' | 'failed' | 'stopped';

export interface Task {
  id: string;
  name: string;
  /** His words, as the job was first given. */
  task: string;
  state: TaskState;
  /** The worker's last report, or why it stopped. */
  last: string;
  sessionId: string | null;
  startedAt: number;
  updatedAt: number;
  /** Share of his week used, read before and after the last run: what the job actually cost. */
  weekBefore?: number;
  weekAfter?: number;
  /** Run this one on Opus instead of Sonnet. Only when he actually asked for the strongest model: Opus is
   *  weighted heaviest against his plan's limits AND has its own separate weekly cap on Max, so a job that
   *  quietly used it was spending the scarcest thing he has (2026-09-22). */
  deep?: boolean;
}

/** Tool round trips per run, and how long one run may take before it is called off. */
export const WORKER_TURNS = 60;
export const WORKER_TIMEOUT_MS = 30 * 60_000;
export const MAX_RUNNING = 2;

export const WORKER_PROMPT = `You are Aang's worker. Aang is Joshua's desktop companion; you do the jobs Aang hands you, in the background, on
Joshua's Windows PC (a Shadow cloud PC). He is usually busy with something else, often a game, and will not see you work.

Your job is to get the thing DONE, the way a capable person would, not to describe how it could be done.
- Start by working out what "done" means for this job. Then act.
- Use your tools. If one does not fit or fails, try another: a different tool, a command (run), a web lookup
  (look_up_web), reading files, or start_claude with kind "browse" for anything that needs clicking around a website.
  Try at least two real approaches before deciding something cannot be done.
- Check your work before you report it: read the file back, list the folder, run the test, open what you made.
  Never say something happened unless you saw that it did.
- Changes to his machine ask him first, the way they always do. If he says no, respect it and do the rest.
- Do not invent facts about him. Search memory (search_memory) when the job refers to something from before.
- If you truly need him - a decision only he can make, a login, something you were refused - stop and ask one clear
  question.

When you finish, your LAST message is what he reads, often on his phone. Write it as:
- Done: one to three plain sentences on what you did and where the result is (a path, a link). Nothing else.
- Or stuck: what you did so far in one sentence, then the one question you need answered, ending with "?".
No lists unless the result itself is a list. No exclamation marks, no emoji, no em dashes.`;

/** A short name he would recognise, from the job itself. */
export function nameFor(task: string): string {
  const words = task.replace(/[^\p{L}\p{N}\s'-]/gu, ' ').trim().split(/\s+/).slice(0, 5).join(' ');
  return (words || 'job').toLowerCase();
}

/** The jobs, kept on disk (newest 20) so a restart - Shadow does several a day - loses none of them. */
export class TaskStore {
  private readonly file: string;
  private tasks: Task[] = [];
  private seq = 0;

  constructor(stateDir: string) {
    this.file = path.join(stateDir, 'tasks.json');
    try {
      const j = JSON.parse(readFileSync(this.file, 'utf8'));
      if (Array.isArray(j)) this.tasks = j.filter(t => t && typeof t.id === 'string');
    } catch { /* none yet */ }
    // Anything still marked working died with the last Core: it can be continued (its session is kept).
    for (const t of this.tasks) if (t.state === 'working') { t.state = 'stopped'; t.last = 'Aang restarted before it finished. Tell it to carry on and it will pick up where it was.'; }
    this.seq = this.tasks.reduce((m, t) => Math.max(m, Number(t.id.replace(/\D/g, '')) || 0), 0);
  }

  list(): Task[] { return this.tasks; }
  running(): Task[] { return this.tasks.filter(t => t.state === 'working'); }
  waiting(): Task[] { return this.tasks.filter(t => t.state === 'needs you'); }

  add(task: string, name?: string, now = Date.now(), deep = false): Task {
    const t: Task = { id: 'job' + ++this.seq, name: (name ?? '').trim() || nameFor(task), task, state: 'working', last: '', sessionId: null, startedAt: now, updatedAt: now, ...(deep ? { deep: true } : {}) };
    this.tasks.push(t);
    while (this.tasks.length > 20) this.tasks.shift();
    this.save();
    return t;
  }

  /** The newest job whose name matches a few of his words, or the only one waiting on him when he says "it". */
  find(words: string): Task | null {
    const w = words.trim().toLowerCase();
    const newest = [...this.tasks].reverse();
    if (!w || /^(it|that|the job|that job|this|the last one)$/.test(w)) return newest.find(t => t.state === 'needs you') ?? newest[0] ?? null;
    return newest.find(t => t.name.toLowerCase() === w) ?? newest.find(t => t.name.toLowerCase().includes(w) || w.includes(t.name.toLowerCase()))
      ?? newest.find(t => t.task.toLowerCase().includes(w)) ?? null;
  }

  save(): void {
    try { writeFileAtomic(this.file, JSON.stringify(this.tasks, null, 2)); } catch { /* best effort */ }
  }
}

/** One line per job, for task_status and "what are you working on". */
export function describeTasks(tasks: Task[], now = Date.now()): string {
  if (!tasks.length) return 'No background jobs yet.';
  const ago = (ms: number) => { const m = Math.round(ms / 60_000); return m < 1 ? 'just now' : m < 90 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };
  return [...tasks].reverse().slice(0, 8).map(t => {
    const cost = t.weekBefore !== undefined && t.weekAfter !== undefined ? `, used ${Math.max(0, Math.round((t.weekAfter - t.weekBefore) * 1000) / 10)}% of the week` : '';
    return `"${t.name}": ${t.state}, ${t.state === 'working' ? `started ${ago(now - t.startedAt)}` : ago(now - t.updatedAt)}${cost}.${t.last ? ` ${t.last.slice(0, 220)}` : ''}`;
  }).join('\n');
}

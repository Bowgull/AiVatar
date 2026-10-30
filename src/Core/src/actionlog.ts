// What Aang did, and how to take it back. Two small things:
//  - ActionLog: one line per thing he did on Joshua's machine, kept on disk, so "what did you just do?" has an
//    honest answer and #log in Discord is a receipt book. It records what happened, not what he said happened.
//  - UndoStack: the last few things that can be put back (a file change, something remembered or forgotten, a
//    reminder). In memory only: a restart forgets the stack, but file changes keep their own copies on disk.
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { writeFileAtomic } from './atomic.ts';
import { dayKey, homeClock } from './clock.ts';
import { openLog } from './log.ts';

export interface ActionRec {
  ts: string; tool: string; did: string; ok: boolean; note: string;
  /**
   * 5.3: the request Aang was answering when he did this, when he was answering one at all.
   *
   * Not a turn id, deliberately. Actions are written while a turn is still running and the turn row does
   * not exist until the reply is finished, so there is no turn id to stamp here. The turn row carries the
   * same request id, which makes "why did you do that" a join. Older lines have no `req` and never will;
   * for those the honest answer is that the link was not being kept yet.
   */
  req?: string;
}

const clock = (iso: string) => homeClock(iso, { hour: 'numeric', minute: '2-digit', hour12: true }, 'en-CA');
const day = (iso: string) => dayKey(iso);

/** One line, plain: "2:31 pm  wrote …/notes.txt". A failure says so and why. */
export function formatAction(r: ActionRec, withDay = false): string {
  const when = `${withDay ? day(r.ts) + ' ' : ''}${clock(r.ts)}`;
  return `${when}  ${r.did}${r.ok ? '' : `  (failed${r.note ? ': ' + r.note : ''})`}`;
}

export class ActionLog {
  private readonly file: string;
  private cache: ActionRec[] | null = null;
  constructor(dir: string) {
    this.file = path.join(dir, 'actions.jsonl');
    try {
      // Keep it small: past ~400 KB only the newest thousand lines stay.
      if (existsSync(this.file) && statSync(this.file).size > 400_000) {
        const keep = readFileSync(this.file, 'utf8').split('\n').filter(Boolean).slice(-1000);
        writeFileAtomic(this.file, keep.join('\n') + '\n');
      }
    } catch { /* an unreadable log is not worth stopping for */ }
  }

  private load(): ActionRec[] {
    if (this.cache) return this.cache;
    const out: ActionRec[] = [];
    try {
      for (const line of readFileSync(this.file, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        try { const r = JSON.parse(line); if (r && typeof r.did === 'string') out.push(r); } catch { /* skip a torn line */ }
      }
    } catch { /* no log yet */ }
    return (this.cache = out.slice(-2000));
  }

  add(r: Omit<ActionRec, 'ts'>, now = new Date()): ActionRec {
    const rec: ActionRec = { ts: now.toISOString(), ...r, did: r.did.slice(0, 200), note: (r.note ?? '').replace(/\s+/g, ' ').slice(0, 160) };
    this.load().push(rec);
    openLog('actions', this.file).json(rec);
    return rec;
  }

  /** Newest last. */
  recent(n = 10): ActionRec[] { return this.load().slice(-Math.max(1, Math.min(50, n))); }

  /** Everything done while answering one request, oldest first. Empty when that request did nothing. */
  forRequest(req: string): ActionRec[] {
    if (!req) return [];
    return this.load().filter(r => r.req === req);
  }

  /**
   * The newest request that actually did something, for "why did you do that" with nothing pointed at.
   *
   * Joshua should not have to know a number to ask. Only requests that DID something count: the last
   * three turns being chat means the thing he is asking about is the one before them.
   */
  lastRequestThatDidSomething(): string | null {
    const all = this.load();
    for (let i = all.length - 1; i >= 0; i--) if (all[i].req) return all[i].req!;
    return null;
  }

  text(n = 10): string {
    const recs = this.recent(n);
    if (!recs.length) return 'I have not done anything on your computer yet, that I have kept a record of.';
    const multiDay = new Set(recs.map(r => day(r.ts))).size > 1;
    return recs.map(r => formatAction(r, multiDay)).join('\n');
  }
}

export interface Undoable { id: number; label: string; run: () => string }

/**
 * Each entry has an id so a "You said yes" row in the scroll-back can undo THAT action, not just whatever
 * happens to be newest. Ids start from the clock rather than from 1: the stack is forgotten on restart, and
 * an id saved in a turn before a restart must never match a different action after it.
 */
export class UndoStack {
  private readonly items: Undoable[] = [];
  /** The first id this run hands out. Anything below it was pushed before the last restart. */
  readonly firstId = Date.now();
  private next = this.firstId;
  push(label: string, run: () => string): number {
    const id = this.next++;
    this.items.push({ id, label, run });
    while (this.items.length > 20) this.items.shift();
    return id;
  }
  pop(): Undoable | null { return this.items.pop() ?? null; }
  peek(): Undoable | null { return this.items.at(-1) ?? null; }
  /** Remove and return one particular entry, wherever it sits in the stack. */
  take(id: number): Undoable | null {
    const i = this.items.findIndex(u => u.id === id);
    return i < 0 ? null : this.items.splice(i, 1)[0];
  }
  has(id: number): boolean { return this.items.some(u => u.id === id); }
  /** The newest id handed out so far (firstId - 1 before anything was pushed). Kept even after a pop. */
  get lastId(): number { return this.next - 1; }
  get size(): number { return this.items.length; }
}

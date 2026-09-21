// What Aang did, and how to take it back. Two small things:
//  - ActionLog: one line per thing he did on Joshua's machine, kept on disk, so "what did you just do?" has an
//    honest answer and #log in Discord is a receipt book. It records what happened, not what he said happened.
//  - UndoStack: the last few things that can be put back (a file change, something remembered or forgotten, a
//    reminder). In memory only: a restart forgets the stack, but file changes keep their own copies on disk.
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { writeFileAtomic } from './atomic.ts';

export interface ActionRec { ts: string; tool: string; did: string; ok: boolean; note: string }

const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-CA', { timeZone: 'America/Toronto', hour: 'numeric', minute: '2-digit', hour12: true });
const day = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });

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
    try { mkdirSync(path.dirname(this.file), { recursive: true }); appendFileSync(this.file, JSON.stringify(rec) + '\n'); } catch { /* best effort */ }
    return rec;
  }

  /** Newest last. */
  recent(n = 10): ActionRec[] { return this.load().slice(-Math.max(1, Math.min(50, n))); }

  text(n = 10): string {
    const recs = this.recent(n);
    if (!recs.length) return 'I have not done anything on your computer yet, that I have kept a record of.';
    const multiDay = new Set(recs.map(r => day(r.ts))).size > 1;
    return recs.map(r => formatAction(r, multiDay)).join('\n');
  }
}

export interface Undoable { label: string; run: () => string }

export class UndoStack {
  private readonly items: Undoable[] = [];
  push(label: string, run: () => string): void { this.items.push({ label, run }); while (this.items.length > 20) this.items.shift(); }
  pop(): Undoable | null { return this.items.pop() ?? null; }
  peek(): Undoable | null { return this.items.at(-1) ?? null; }
  get size(): number { return this.items.length; }
}

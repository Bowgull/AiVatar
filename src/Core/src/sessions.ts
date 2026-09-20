// Which Claude session each lane is in the middle of, kept on disk.
//
// This machine is a Shadow cloud PC with a four-hour session limit: it rebooted four times on
// 2026-09-20 alone, so the Core starts from scratch about six times a day. Without this file Aang
// forgets the conversation every time, which reads as amnesia rather than as a restart. The SDK keeps
// the transcripts under ~/.claude/projects and the Shadow disk persists, so all we have to remember is
// the id.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export interface SessionRecord {
  id: string;
  /** When we last saw this id, ISO. Diagnostics, and the basis for the age cap. */
  savedAt: string;
}

/**
 * A resumed conversation carries its whole history, so it grows. Past this age a lane starts fresh
 * rather than dragging months of context (and its cost) behind it; durable facts are memory's job,
 * not the transcript's.
 */
export const MAX_SESSION_AGE_DAYS = 7;

export class SessionStore {
  private readonly file: string;
  private data: Record<string, SessionRecord> = {};

  constructor(stateDir: string) {
    this.file = path.join(stateDir, 'sessions.json');
    this.load();
  }

  private load(): void {
    try {
      if (!existsSync(this.file)) return;
      const raw = JSON.parse(readFileSync(this.file, 'utf8'));
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        for (const [lane, rec] of Object.entries(raw as Record<string, any>)) {
          if (rec && typeof rec.id === 'string' && rec.id) {
            this.data[lane] = { id: rec.id, savedAt: typeof rec.savedAt === 'string' ? rec.savedAt : new Date().toISOString() };
          }
        }
      }
    } catch {
      this.data = {};   // a corrupt file must never stop the Core from starting
    }
  }

  private save(): void {
    try {
      mkdirSync(path.dirname(this.file), { recursive: true });
      // write-then-rename, because a hard shutdown mid-write is a real event on this machine
      const tmp = this.file + '.tmp';
      writeFileSync(tmp, JSON.stringify(this.data, null, 2));
      renameSync(tmp, this.file);
    } catch { /* best effort: losing the id costs memory, not correctness */ }
  }

  /** The id to resume for this lane, or undefined if there is none or it is too old. */
  get(lane: string, now = Date.now()): string | undefined {
    const rec = this.data[lane];
    if (!rec) return undefined;
    const age = now - Date.parse(rec.savedAt);
    if (!Number.isFinite(age) || age > MAX_SESSION_AGE_DAYS * 86_400_000) { this.clear(lane); return undefined; }
    return rec.id;
  }

  set(lane: string, id: string, now = new Date()): void {
    if (!id) return;
    const existing = this.data[lane];
    if (existing?.id === id) {
      // same conversation, just touched: keep the file fresh so the age cap measures inactivity
      existing.savedAt = now.toISOString();
      this.save();
      return;
    }
    this.data[lane] = { id, savedAt: now.toISOString() };
    this.save();
  }

  /** Forget this lane's session. Used when a resume is refused, so a stale id cannot wedge Aang. */
  clear(lane: string): void {
    if (!(lane in this.data)) return;
    delete this.data[lane];
    this.save();
  }

  /** Diagnostics. */
  all(): Record<string, SessionRecord> { return { ...this.data }; }
}

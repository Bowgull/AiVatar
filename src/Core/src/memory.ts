// Conversation memory. Reuses the existing SQLite file (Documents/Aang/aang.db, FTS5 over every past turn)
// so nothing Joshua has said to Aang is lost. Semantic recall stays a later step; full-text search
// already answers "what did we say about X".
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export interface Hit { ts: string; who: 'you' | 'Aang'; text: string }

export class Memory {
  private db: DatabaseSync | null = null;
  readonly dataDir: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    try {
      const file = path.join(dataDir, 'aang.db');
      if (existsSync(file)) {
        this.db = new DatabaseSync(file);
        this.db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 3000;');
      }
    } catch (e) {
      console.error('memory: could not open aang.db, running without it:', (e as Error).message);
      this.db = null;
    }
  }

  get available(): boolean { return this.db !== null; }

  private readText(rel: string): string {
    try { return readFileSync(path.join(this.dataDir, rel), 'utf8'); } catch { return ''; }
  }
  profile(): string { return this.readText('Brain/profile.md'); }
  learned(): string { return this.readText('Brain/learned.md'); }

  /** Words that match almost every turn and so carry no meaning for a search. */
  static readonly STOPWORDS = new Set(('what did we say said about the and you your for with that this have has had was were are ' +
    'any how why who when where which would could should can could not but its our out from into than then them they there their ' +
    'tell told talk talked remember earlier before last time did does doing done just like know').split(' '));

  search(query: string, limit = 6): Hit[] {
    if (!this.db) return [];
    const terms = query.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/)
      .filter(w => w.length > 2 && !Memory.STOPWORDS.has(w)).slice(0, 8);
    if (!terms.length) return [];
    try {
      // Rank by relevance (bm25), not recency: a stopword-heavy question must not bury the real match.
      // Replies from the retired local models (tier 'local*') are untrusted: one of them once said
      // "Taj Mahal is the tallest mountain in the world", and recalling that as something Aang said
      // would turn a hallucination into a memory. What Joshua said is always kept.
      const rows = this.db.prepare(
        `SELECT t.ts AS ts, t.role AS role, t.text AS text
           FROM turns_fts f JOIN turns t ON t.id = f.turn_id
          WHERE turns_fts MATCH ?
            AND NOT (t.role = 'aang' AND t.tier LIKE 'local%')
          ORDER BY rank LIMIT ?`,
      ).all(terms.map(t => `"${t}"`).join(' OR '), limit) as { ts: string; role: string; text: string }[];
      return rows.map(r => ({ ts: r.ts, who: r.role === 'user' ? 'you' : 'Aang', text: r.text }));
    } catch (e) {
      console.error('memory search failed:', (e as Error).message);
      return [];
    }
  }

  saveTurn(user: string, aang: string, tier: string): void {
    if (!this.db) return;
    try {
      const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
      const ins = this.db.prepare('INSERT INTO turns (ts, role, tier, text) VALUES (?,?,?,?)');
      const fts = this.db.prepare('INSERT INTO turns_fts (text, turn_id) VALUES (?,?)');
      for (const [role, text, t] of [['user', user, null], ['aang', aang, tier]] as const) {
        const info = ins.run(now, role, t, text);
        fts.run(text, Number(info.lastInsertRowid));
      }
    } catch (e) {
      console.error('memory save failed:', (e as Error).message);
    }
  }

  close(): void { try { this.db?.close(); } catch { /* ignore */ } }
}

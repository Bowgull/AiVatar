// Conversation memory, on the SQLite file Aang has always used (Documents/Aang/aang.db), so nothing
// Joshua has said is lost.
//
// Two halves, and the split is the whole design:
//   - finding is local and free: embeddinggemma for meaning, FTS5 for words, both on this machine
//   - understanding is Claude's, and it is already paid for by the turn Joshua asked for
//
// Facts are what make him feel like he knows Joshua. They are visible, deletable, superseded rather than
// overwritten, and they fade if they are never confirmed again: remembering something badly is worse
// than not remembering it.
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { EMBED_DIM, embed, fromBlob, similarity, toBlob } from './embed.ts';

export interface Hit { ts: string; who: 'you' | 'Aang'; text: string; how?: 'words' | 'meaning' }

export interface Fact {
  id: number;
  text: string;
  /** When it was first learned, and when it was last confirmed. */
  ts: string;
  lastSeen: string;
  timesSeen: number;
  source: string;
}

/** A fact nobody has mentioned for this long stops being offered unprompted. */
export const STALE_DAYS = 120;

export class Memory {
  private db: DatabaseSync | null = null;
  readonly dataDir: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    try {
      const file = path.join(dataDir, 'aang.db');
      if (existsSync(file)) {
        this.db = new DatabaseSync(file);
        // WAL with FULL sync: a hard Shadow shutdown is a power cut, and FULL is what makes a committed
        // turn survive one. Writes here are a few per conversation, so the cost is nothing.
        this.db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA busy_timeout = 3000;');
      }
    } catch (e) {
      console.error('memory: could not open aang.db, running without it:', (e as Error).message);
      this.db = null;
    }
  }

  get available(): boolean { return this.db !== null; }

  // ---------------------------------------------------------------- bookkeeping

  /** A small key/value corner of the database, used to remember how far consolidation has got. */
  getMeta(key: string): string | null {
    try { const r = this.db?.prepare("SELECT v FROM meta WHERE k = ?").get(key) as any; return r ? String(r.v) : null; }
    catch { return null; }
  }
  setMeta(key: string, value: string): void {
    try { this.db?.prepare("INSERT INTO meta (k, v) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").run(key, value); }
    catch { /* best effort */ }
  }

  /** The id of the newest turn, or 0 with none. */
  lastTurnId(): number {
    try { return Number((this.db?.prepare("SELECT max(id) AS m FROM turns").get() as any)?.m ?? 0); }
    catch { return 0; }
  }

  /**
   * The most recent turns after this id, in the order they happened.
   * Most recent, not the first ones found: with no marker and 500 turns of history, taking the first 60
   * meant reading the oldest conversations on this machine and doing it again at every restart.
   */
  turnsAfter(id: number, limit = 60): { id: number; role: string; text: string }[] {
    if (!this.db) return [];
    try {
      const rows = this.db.prepare(
        "SELECT id, role, text FROM turns WHERE id > ? AND NOT (role = 'aang' AND tier LIKE 'local%') ORDER BY id DESC LIMIT ?",
      ).all(id, limit) as any[];
      return rows.reverse();
    } catch { return []; }
  }

  // ---------------------------------------------------------------- facts

  /**
   * Remember something durable about Joshua. A fact that contradicts one already held supersedes it:
   * the old one is retired, not deleted, so "you used to say X" still works. Saying the same thing again
   * just confirms it, which is what keeps it from going stale.
   */
  remember(text: string, source = 'joshua', now = new Date()): { fact: Fact | null; replaced: Fact | null } {
    const clean = (text ?? '').trim().replace(/\s+/g, ' ').slice(0, 300);
    if (!this.db || !clean) return { fact: null, replaced: null };
    const stamp = now.toISOString().replace('T', ' ').slice(0, 19);
    try {
      // Look at retired facts too. The text column is UNIQUE across every row, so a fact that was once
      // superseded and is now true again ("the raid is back on Tuesdays") crashed the insert. It comes back
      // to life instead, and whatever it contradicts now is retired in its place.
      const existing = this.db.prepare('SELECT * FROM facts WHERE lower(text) = lower(?)').get(clean) as any;
      if (existing) {
        let replaced: Fact | null = null;
        if (existing.retired) {
          replaced = this.findContradiction(clean);
          if (replaced) this.db.prepare('UPDATE facts SET retired = 1 WHERE id = ?').run(replaced.id);
        }
        this.db.prepare('UPDATE facts SET last_seen = ?, times_seen = times_seen + 1, retired = 0 WHERE id = ?').run(stamp, existing.id);
        return { fact: this.factById(Number(existing.id)), replaced };
      }
      const replaced = this.findContradiction(clean);
      if (replaced) this.db.prepare('UPDATE facts SET retired = 1 WHERE id = ?').run(replaced.id);
      const info = this.db.prepare('INSERT INTO facts (ts, text, source, last_seen, times_seen, retired) VALUES (?,?,?,?,1,0)')
        .run(stamp, clean, source, stamp);
      return { fact: this.factById(Number(info.lastInsertRowid)), replaced };
    } catch (e) {
      console.error('memory remember failed:', (e as Error).message);
      return { fact: null, replaced: null };
    }
  }

  /**
   * A new fact about the same thing replaces the old one. "His girlfriend is called X" and "his
   * girlfriend is called Y" cannot both be true, and keeping both would let him say either.
   */
  private findContradiction(text: string): Fact | null {
    if (!this.db) return null;
    const subject = keyNoun(text);
    if (!subject) return null;
    const rows = this.list();
    for (const f of rows) if (keyNoun(f.text) === subject) return f;
    return null;
  }

  /** Forget exactly one fact by its id: what the Forget button on a row in the Panel means. */
  forgetId(id: number): Fact | null {
    if (!this.db) return null;
    let f: Fact | undefined;
    try { const r = this.db.prepare('SELECT id, text, ts, last_seen, times_seen, source FROM facts WHERE id = ?').get(id) as any; f = r ? toFact(r) : undefined; } catch { return null; }
    if (!f) return null;
    try { this.db.prepare('DELETE FROM facts WHERE id = ?').run(id); } catch { return null; }
    const list = this.forgotten(); list.push(f.text);                    // so the catch-up does not learn it straight back
    this.setMeta('forgotten', JSON.stringify(list.slice(-200)));
    return f;
  }

  /** Forget a fact, by a few words of it. Deleted outright: "forget that" has to mean forget. */
  /**
   * Delete every fact that matches, superseded ones included, and return what went.
   * It used to delete only the first match: "forget everything about my raid nights" removed one of two raid
   * facts, he said "Done.", and the other stayed (tests/fakecore/memory.mjs, 2026-09-20). The words match on
   * their stem, so "raid nights" finds "raids Wednesdays".
   */
  forget(which: string): Fact[] {
    if (!this.db) return [];
    const needle = (which ?? '').trim().toLowerCase();
    if (!needle) return [];
    let all: Fact[];
    try {
      all = (this.db.prepare('SELECT id, text, ts, last_seen, times_seen, source FROM facts').all() as any[]).map(toFact);
    } catch { return []; }
    const stems = needle.split(/[^a-z0-9']+/).filter(w => w.length > 3 && !FORGET_STOP.has(w)).map(w => w.slice(0, 4));
    let hits = all.filter(f => f.text.toLowerCase().includes(needle));
    if (!hits.length && stems.length) hits = all.filter(f => stems.some(s => f.text.toLowerCase().includes(s)));
    try { for (const h of hits) this.db.prepare('DELETE FROM facts WHERE id = ?').run(h.id); }
    catch { return []; }
    if (hits.length) {
      // Remember what was forgotten, so the catch-up does not learn it straight back from the same
      // conversation. It did, on 2026-09-21: it had read "we raid wednesdays at eight" before the forget and
      // saved it again just after.
      const list = this.forgotten();
      list.push(...hits.map(h => h.text));
      this.setMeta('forgotten', JSON.stringify(list.slice(-200)));
    }
    return hits;
  }

  /** The texts of facts Joshua asked to have forgotten, newest last. */
  forgotten(): string[] {
    try { const v = JSON.parse(this.getMeta('forgotten') ?? '[]'); return Array.isArray(v) ? v.filter(x => typeof x === 'string') : []; }
    catch { return []; }
  }

  /** True if this reads as one of the facts he asked to forget: two or more of the same significant words. */
  wasForgotten(text: string): boolean {
    const stems = (t: string) => new Set(t.toLowerCase().split(/[^a-z0-9']+/).filter(w => w.length > 3 && !SKIP.has(w) && !FORGET_STOP.has(w)).map(w => w.slice(0, 4)));
    const mine = stems(text);
    return this.forgotten().some(f => { let n = 0; for (const s of stems(f)) if (mine.has(s)) n++; return n >= 2; });
  }

  /** Everything he currently holds, newest confirmation first. Retired facts are not included. */
  list(limit = 60): Fact[] {
    if (!this.db) return [];
    try {
      const rows = this.db.prepare(
        'SELECT id, text, ts, last_seen, times_seen, source FROM facts WHERE retired = 0 ORDER BY last_seen DESC LIMIT ?',
      ).all(limit) as any[];
      return rows.map(toFact);
    } catch { return []; }
  }

  private factById(id: number): Fact | null {
    try { const r = this.db?.prepare('SELECT id, text, ts, last_seen, times_seen, source FROM facts WHERE id = ?').get(id) as any; return r ? toFact(r) : null; }
    catch { return null; }
  }

  /**
   * The handful of facts worth putting in front of him at the start of a conversation. Fresh and
   * often-confirmed first; anything not mentioned for months is left for search to find instead, so an
   * old belief cannot quietly shape every answer.
   */
  standing(now = Date.now(), limit = 12): Fact[] {
    const cutoff = now - STALE_DAYS * 86_400_000;
    return this.list(60)
      .filter(f => Date.parse(f.lastSeen.replace(' ', 'T') + 'Z') >= cutoff || f.timesSeen > 2)
      .slice(0, limit);
  }

  private readText(rel: string): string {
    try { return readFileSync(path.join(this.dataDir, rel), 'utf8'); } catch { return ''; }
  }
  profile(): string { return this.readText('Brain/profile.md'); }
  learned(): string { return this.readText('Brain/learned.md'); }

  /** Words that match almost every turn and so carry no meaning for a search. */
  static readonly STOPWORDS = new Set(('what did we say said about the and you your for with that this have has had was were are ' +
    'any how why who when where which would could should can could not but its our out from into than then them they there their ' +
    'tell told talk talked remember earlier before last time did does doing done just like know').split(' '));

  /**
   * Recall, by meaning and by words. The local model turns the question into a vector and it is compared
   * against every turn that has one; FTS5 catches the exact words a vector can miss, like a file name.
   * Both are free, and either alone misses things the other finds.
   */
  async recall(query: string, limit = 6): Promise<Hit[]> {
    const words = this.search(query, limit);
    const vector = await this.searchByMeaning(query, limit);
    const seen = new Set<string>();
    const out: Hit[] = [];
    // Interleave, so neither kind crowds the other out.
    for (let i = 0; i < Math.max(words.length, vector.length) && out.length < limit; i++) {
      for (const h of [vector[i], words[i]]) {
        if (!h || out.length >= limit) continue;
        const key = h.ts + h.text.slice(0, 40);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(h);
      }
    }
    return out;
  }

  /** Nearest turns by meaning. Returns nothing at all if the local model is not running. */
  async searchByMeaning(query: string, limit = 6, floor = 0.55): Promise<Hit[]> {
    if (!this.db) return [];
    const q = await embed(query);
    if (!q) return [];
    try {
      const rows = this.db.prepare(
        `SELECT e.vec AS vec, t.ts AS ts, t.role AS role, t.text AS text
           FROM embeddings e JOIN turns t ON t.id = e.turn_id
          WHERE e.dim = ? AND NOT (t.role = 'aang' AND t.tier LIKE 'local%')`,
      ).all(EMBED_DIM) as { vec: Uint8Array; ts: string; role: string; text: string }[];
      return rows
        .map(r => ({ score: similarity(q, fromBlob(r.vec)), ts: r.ts, role: r.role, text: r.text }))
        .filter(r => r.score >= floor)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(r => ({ ts: r.ts, who: (r.role === 'user' ? 'you' : 'Aang') as 'you' | 'Aang', text: r.text, how: 'meaning' as const }));
    } catch (e) {
      console.error('memory recall failed:', (e as Error).message);
      return [];
    }
  }

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
      return rows.map(r => ({ ts: r.ts, who: (r.role === 'user' ? 'you' : 'Aang') as 'you' | 'Aang', text: r.text, how: 'words' as const }));
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
        const id = Number(info.lastInsertRowid);
        fts.run(text, id);
        // Embedding is local and free, but it is not instant: do it after the turn is safely stored,
        // and never let it delay the reply.
        void this.embedTurn(id, text);
      }
    } catch (e) {
      console.error('memory save failed:', (e as Error).message);
    }
  }

  private async embedTurn(id: number, text: string): Promise<void> {
    const v = await embed(text);
    if (!v || !this.db) return;
    try { this.db.prepare('INSERT OR REPLACE INTO embeddings (turn_id, dim, vec) VALUES (?,?,?)').run(id, EMBED_DIM, toBlob(v)); }
    catch { /* a missing vector costs recall quality, never correctness */ }
  }

  /**
   * Give the turns that have no vector one, a few at a time. 148 of 466 were embedded by the old Aang
   * and the rest have been invisible to meaning-based recall ever since. Runs in the background, pauses
   * between batches so it never competes with a reply, and picks up where it left off next session.
   */
  async backfill(batch = 25, pauseMs = 250, budget = 400): Promise<number> {
    if (!this.db) return 0;
    let done = 0;
    while (done < budget) {
      let rows: { id: number; text: string }[];
      try {
        rows = this.db.prepare(
          `SELECT t.id AS id, t.text AS text FROM turns t
             LEFT JOIN embeddings e ON e.turn_id = t.id
            WHERE e.turn_id IS NULL AND length(t.text) > 8
            ORDER BY t.id DESC LIMIT ?`,
        ).all(batch) as any[];
      } catch { return done; }
      if (!rows.length) return done;
      for (const r of rows) {
        const v = await embed(r.text);
        if (!v) return done;                       // the local model is not running; stop quietly
        try { this.db.prepare('INSERT OR REPLACE INTO embeddings (turn_id, dim, vec) VALUES (?,?,?)').run(r.id, EMBED_DIM, toBlob(v)); done++; }
        catch { /* skip */ }
      }
      await new Promise(r => setTimeout(r, pauseMs));
    }
    return done;
  }

  /** How much of the history can be recalled by meaning. Diagnostics, and the backfill's progress. */
  coverage(): { turns: number; embedded: number } {
    if (!this.db) return { turns: 0, embedded: 0 };
    try {
      const t = (this.db.prepare('SELECT count(*) c FROM turns').get() as any).c as number;
      const e = (this.db.prepare('SELECT count(*) c FROM embeddings').get() as any).c as number;
      return { turns: t, embedded: e };
    } catch { return { turns: 0, embedded: 0 }; }
  }

  /** Fold the WAL back into the database so it cannot grow without bound across long sessions. */
  checkpoint(): void { try { this.db?.exec('PRAGMA wal_checkpoint(TRUNCATE);'); } catch { /* busy: next time */ } }

  close(): void { this.checkpoint(); try { this.db?.close(); } catch { /* ignore */ } }
}

/** Words in a "forget ..." request that say nothing about which fact is meant. */
const FORGET_STOP = new Set(('everything about that this what with from please forget know knows remember stuff ' +
  'things anything those these there where when your mine thing all').split(' '));

function toFact(r: any): Fact {
  return { id: Number(r.id), text: String(r.text), ts: String(r.ts), lastSeen: String(r.last_seen ?? r.ts), timesSeen: Number(r.times_seen ?? 1), source: String(r.source ?? '') };
}

/**
 * What a fact is *about*, roughly: the first meaningful noun after any leading "his"/"the"/"joshua's".
 * Crude on purpose - it only has to notice that two sentences are about the same thing so the newer one
 * can replace the older.
 */
const SKIP = new Set(('his her their the a an joshua joshuas he she they is are was were has have had does do ' +
  'currently now still also really very just about that this').split(' '));
export function keyNoun(text: string): string {
  for (const w of text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/)) {
    if (w.length > 2 && !SKIP.has(w)) return w.replace(/s$/, '');
  }
  return '';
}

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
import { openMemory, type OpenResult } from './schema.ts';
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

  /**
   * What happened when memory opened, for the Core to show him. Empty detail means the normal case:
   * it opened, nothing to say. `ok: false` means there is no memory at all and Aang must say so
   * rather than carry on as if he knew Joshua.
   */
  readonly opened: OpenResult;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    // openMemory heals rather than tolerating: a damaged or missing database is restored from the
    // verified backup, or rebuilt empty, before it gets here. The old code was
    // `if (existsSync(file))` with no else, so a missing file meant Aang started with no memory,
    // said nothing about it, and talked to Joshua as a stranger in his own voice. See schema.ts.
    this.opened = openMemory(dataDir);
    this.db = this.opened.db;
    // WAL with FULL sync is set by openMemory on whichever path it took: a hard Shadow shutdown is
    // a power cut, and FULL is what makes a committed turn survive one.
    if (this.db) this.migrateFacts();
    if (this.opened.detail) console.error('memory: ' + this.opened.detail);
  }

  /**
   * Bring the facts table up to date, in place and idempotently: a `relation` for deciding what supersedes
   * what, and valid_from/valid_to so a superseded fact keeps its dates instead of only a yes/no flag -
   * "what does he do now" and "what did he say in March" are then both answerable from one table.
   *
   * `retired` is kept written and in step on purpose. It is derived from valid_to and nothing reads it any
   * more, but an older build of the Core opening the same database still would, and a half-migrated file
   * that silently loses facts is exactly the kind of thing this whole change exists to prevent.
   */
  private migrateFacts(): void {
    if (!this.db) return;
    try {
      const cols = (this.db.prepare('PRAGMA table_info(facts)').all() as { name: string }[]).map(c => c.name);
      if (!cols.includes('relation')) this.db.exec('ALTER TABLE facts ADD COLUMN relation TEXT');
      if (!cols.includes('valid_from')) {
        this.db.exec('ALTER TABLE facts ADD COLUMN valid_from TEXT');
        this.db.exec('UPDATE facts SET valid_from = ts WHERE valid_from IS NULL');
      }
      if (!cols.includes('valid_to')) {
        this.db.exec('ALTER TABLE facts ADD COLUMN valid_to TEXT');
        // A fact already retired stopped being true when it was last confirmed; that is the closest honest
        // date this table holds for it. Nothing better exists retrospectively, and inventing one would be worse.
        this.db.exec('UPDATE facts SET valid_to = COALESCE(last_seen, ts) WHERE retired = 1 AND valid_to IS NULL');
      }
      // Give older rows the relation they would have had, so history stays inspectable and a future
      // remember() about the same thing can match on it rather than re-guessing from the sentence.
      const unset = this.db.prepare('SELECT id, text FROM facts WHERE relation IS NULL OR relation = \'\'').all() as { id: number; text: string }[];
      if (unset.length) {
        const set = this.db.prepare('UPDATE facts SET relation = ? WHERE id = ?');
        for (const r of unset) set.run(relationOf(String(r.text)), r.id);
      }
    } catch (e) {
      // A database with no facts table yet is a normal state (a fresh or minimal one), not a problem worth
      // shouting about; anything else is.
      const msg = (e as Error).message;
      if (!/no such table/i.test(msg)) console.error('memory: facts migration skipped:', msg);
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
        "SELECT id, role, text FROM turns WHERE id > ? AND NOT (role = 'aang' AND COALESCE(tier, '') LIKE 'local%') ORDER BY id DESC LIMIT ?",
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
  remember(text: string, source = 'joshua', now = new Date(), declaredRelation?: string): { fact: Fact | null; replaced: Fact | null } {
    const clean = (text ?? '').trim().replace(/\s+/g, ' ').slice(0, 300);
    if (!this.db || !clean) return { fact: null, replaced: null };
    const stamp = now.toISOString().replace('T', ' ').slice(0, 19);
    const relation = relationOf(clean, declaredRelation);
    try {
      // Look at retired facts too. The text column is UNIQUE across every row, so a fact that was once
      // superseded and is now true again ("the raid is back on Tuesdays") crashed the insert. It comes back
      // to life instead, and whatever it contradicts now is retired in its place.
      const existing = this.db.prepare('SELECT * FROM facts WHERE lower(text) = lower(?)').get(clean) as any;
      if (existing) {
        let replaced: Fact | null = null;
        if (existing.valid_to ?? existing.retired) {
          replaced = this.findSuperseded(relation, Number(existing.id));
          if (replaced) this.retire(replaced.id, stamp);
        }
        this.db.prepare('UPDATE facts SET last_seen = ?, times_seen = times_seen + 1, retired = 0, valid_to = NULL, relation = ? WHERE id = ?')
          .run(stamp, relation, existing.id);
        return { fact: this.factById(Number(existing.id)), replaced };
      }
      const replaced = this.findSuperseded(relation);
      if (replaced) this.retire(replaced.id, stamp);
      const info = this.db.prepare(
        'INSERT INTO facts (ts, text, source, last_seen, times_seen, retired, relation, valid_from, valid_to) VALUES (?,?,?,?,1,0,?,?,NULL)',
      ).run(stamp, clean, source, stamp, relation, stamp);
      return { fact: this.factById(Number(info.lastInsertRowid)), replaced };
    } catch (e) {
      console.error('memory remember failed:', (e as Error).message);
      return { fact: null, replaced: null };
    }
  }

  /** Stop a fact being current, keeping the date it stopped rather than only the fact that it did. */
  private retire(id: number, stamp: string): void {
    try { this.db?.prepare('UPDATE facts SET retired = 1, valid_to = ? WHERE id = ?').run(stamp, id); }
    catch { /* leaving it live is safer than losing it */ }
  }

  /**
   * The one live fact this new one replaces, or null if it replaces nothing.
   *
   * Only relations declared SINGLE_VALUED can supersede anything at all. "His girlfriend is called X" and
   * "...called Y" cannot both be true, so the older goes; "he plays WoW" and "he plays guitar" both can, so
   * both stay. Before 2026-09-28 this compared a noun guessed from each sentence, which made every fact
   * sharing a noun look contradictory and quietly ate 8 of his 13 facts.
   */
  private findSuperseded(relation: string, exceptId?: number): Fact | null {
    if (!this.db || !relation || !supersedes(relation)) return null;
    try {
      const r = this.db.prepare(
        `SELECT id, text, ts, last_seen, times_seen, source FROM facts
          WHERE valid_to IS NULL AND retired = 0 AND relation = ? AND id <> ?
          ORDER BY last_seen DESC LIMIT 1`,
      ).get(relation, exceptId ?? -1) as any;
      return r ? toFact(r) : null;
    } catch { return null; }
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
      // valid_to is the truth; retired is the derived copy kept for an older build reading the same file.
      const rows = this.db.prepare(
        'SELECT id, text, ts, last_seen, times_seen, source FROM facts WHERE valid_to IS NULL AND retired = 0 ORDER BY last_seen DESC LIMIT ?',
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

  /**
   * Where the hand-written Brain notes live: the Drive folder if it is mounted, else the copy in the
   * data folder.
   *
   * Until 2026-10-01 this only ever read `<dataDir>/Brain`, which on this machine is a copy somebody
   * made by hand - its own first line said so: "mirror of Drive > Aang Brain > profile.md". It had
   * drifted badly. profile.md was 520 bytes against the Drive original's 1,327, so Aang had been
   * answering from a truncated version of who Joshua is, and every edit made in Drive since then had
   * gone nowhere.
   *
   * Resolved per read rather than once at startup, because Drive is a network filesystem that can be
   * signed out, offline, or simply not running yet when the Core starts. If it is not there, the
   * local copy still answers, which is worse than Drive and far better than nothing.
   */
  private brainDir(): string {
    const drive = process.env.AANG_BRAIN_DIR
      ?? path.join(process.env.GOOGLE_DRIVE_ROOT ?? 'G:\\My Drive', 'Aang Brain');
    try { if (existsSync(drive)) return drive; } catch { /* unreachable network path */ }
    return path.join(this.dataDir, 'Brain');
  }

  private readText(name: string): string {
    try { return readFileSync(path.join(this.brainDir(), name), 'utf8'); } catch { return ''; }
  }
  profile(): string { return this.readText('profile.md'); }
  learned(): string { return this.readText('learned.md'); }

  /** Which Brain folder is actually being read, for a health check and for the Core to log at start. */
  brainSource(): string { return this.brainDir(); }

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
          WHERE e.dim = ? AND NOT (t.role = 'aang' AND COALESCE(t.tier, '') LIKE 'local%')`,
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
            AND NOT (t.role = 'aang' AND COALESCE(t.tier, '') LIKE 'local%')
          ORDER BY rank LIMIT ?`,
      ).all(terms.map(t => `"${t}"`).join(' OR '), limit) as { ts: string; role: string; text: string }[];
      return rows.map(r => ({ ts: r.ts, who: (r.role === 'user' ? 'you' : 'Aang') as 'you' | 'Aang', text: r.text, how: 'words' as const }));
    } catch (e) {
      console.error('memory search failed:', (e as Error).message);
      return [];
    }
  }

  /**
   * The conversation for the Panel's History tab, newest first. With words, only turns containing all of them (so a
   * search narrows as he types); without, simply the latest. Replies from the retired local models are left out,
   * as in search().
   */
  history(query = '', limit = 200): { id: number; ts: string; who: 'you' | 'Aang'; text: string }[] {
    if (!this.db) return [];
    const terms = query.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(w => w.length > 1).slice(0, 8);
    try {
      const rows = (terms.length
        ? this.db.prepare(
            `SELECT t.id AS id, t.ts AS ts, t.role AS role, t.text AS text
               FROM turns_fts f JOIN turns t ON t.id = f.turn_id
              WHERE turns_fts MATCH ? AND NOT (t.role = 'aang' AND COALESCE(t.tier, '') LIKE 'local%')
              ORDER BY t.id DESC LIMIT ?`).all(terms.map(t => `"${t}"*`).join(' AND '), limit)
        : this.db.prepare(
            `SELECT id, ts, role, text FROM turns WHERE NOT (role = 'aang' AND COALESCE(tier, '') LIKE 'local%') ORDER BY id DESC LIMIT ?`).all(limit)) as { id: number; ts: string; role: string; text: string }[];
      return rows.map(r => ({ id: Number(r.id), ts: String(r.ts), who: r.role === 'user' ? 'you' as const : 'Aang' as const, text: String(r.text) }));
    } catch (e) {
      console.error('memory history failed:', (e as Error).message);
      return [];
    }
  }

  /** Everything said between two UTC stamps ("YYYY-MM-DD HH:MM:SS"), oldest first: one day's conversation. */
  turnsBetween(from: string, to: string, limit = 80): { ts: string; who: 'you' | 'Aang'; text: string }[] {
    if (!this.db) return [];
    try {
      const rows = this.db.prepare(
        `SELECT ts, role, text FROM turns WHERE ts >= ? AND ts < ? AND NOT (role = 'aang' AND COALESCE(tier, '') LIKE 'local%') ORDER BY id LIMIT ?`,
      ).all(from, to, limit) as { ts: string; role: string; text: string }[];
      return rows.map(r => ({ ts: String(r.ts), who: r.role === 'user' ? 'you' as const : 'Aang' as const, text: String(r.text) }));
    } catch { return []; }
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
        // The join carries a dim check on purpose: a turn already holding a vector from a RETIRED embedding
        // model still has an embeddings row, so a bare "e.turn_id IS NULL" would call it done and this would
        // silently re-embed nothing after any future model change. With the dim check, a stale-dim row reads
        // as no match, exactly like a missing one - INSERT OR REPLACE below then overwrites it correctly,
        // since turn_id is the table's primary key regardless of what dim the old row had.
        rows = this.db.prepare(
          `SELECT t.id AS id, t.text AS text FROM turns t
             LEFT JOIN embeddings e ON e.turn_id = t.id AND e.dim = ?
            WHERE e.turn_id IS NULL AND length(t.text) > 8
            ORDER BY t.id DESC LIMIT ?`,
        ).all(EMBED_DIM, batch) as any[];
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
  /** "embedded" means embedded with the model in use RIGHT NOW - a row left over from a retired model does not
   *  count, the same rule backfill() uses to decide what still needs doing. Otherwise this over-reports forever
   *  after any embedding model change: every turn already has A row, just not a usable one. */
  coverage(): { turns: number; embedded: number } {
    if (!this.db) return { turns: 0, embedded: 0 };
    try {
      const t = (this.db.prepare('SELECT count(*) c FROM turns').get() as any).c as number;
      const e = (this.db.prepare('SELECT count(*) c FROM embeddings WHERE dim = ?').get(EMBED_DIM) as any).c as number;
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
// "user"/"users" belongs here too: consolidate() writes every fact as "The user is/has/prefers...", so
// without this every single consolidated fact shared the keyNoun "user" and each one retired the last -
// found live in aang.db on 2026-09-22, where 8 of 9 facts had chain-retired down to one survivor.
const SKIP = new Set(('his her their the a an joshua joshuas he she they is are was were has have had does do ' +
  'currently now still also really very just about that this user users').split(' '));
export function keyNoun(text: string): string {
  for (const w of text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/)) {
    if (w.length > 2 && !SKIP.has(w)) return w.replace(/s$/, '');
  }
  return '';
}

/**
 * Relations that hold exactly ONE current value, so a newer fact about the same relation supersedes the
 * older one. Everything NOT listed here is multi-valued and nothing is ever retired for it.
 *
 * That default is the whole fix (1.2, 2026-09-28). The failure this replaces was over-DELETION, never
 * over-accumulation: keyNoun guessed a subject from the first noun it found and treated any two sentences
 * sharing it as contradictory, so "Joshua plays WoW most nights" and "Joshua plays guitar" both reduced to
 * "play" and one erased the other. Measured live: 13 facts, 8 of them retired. Nothing is now destroyed
 * unless someone deliberately declared that relation singular, which means the worst case is a fact too
 * many rather than a fact silently gone.
 *
 * Keep this list small and defensible. A relation belongs here only if a second value genuinely cannot be
 * true at the same time.
 */
const SINGLE_VALUED = new Set([
  'girlfriend', 'boyfriend', 'partner', 'wife', 'husband',
  'located', 'location', 'lives', 'city', 'address', 'timezone',
  'employer', 'job', 'role', 'company', 'salary',
  'phone', 'email', 'birthday', 'age',
  // "his raid night" is the one night he raids, not a list of them - the singular reading the existing
  // raid-night test depends on. "raids on Tuesday and Thursday" is a different sentence and dedupes by text.
  'raid',
]);

/** True when a newer fact about this relation should retire the older one. */
export function supersedes(relation: string): boolean { return SINGLE_VALUED.has(relation); }

/**
 * What a fact is about: what the caller declared, or the old noun guess when nothing was declared. The
 * guess is now only ever used to LOOK UP a relation, never on its own to justify deleting anything - see
 * SINGLE_VALUED above.
 */
export function relationOf(text: string, declared?: string): string {
  const d = (declared ?? '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
  return d || keyNoun(text);
}

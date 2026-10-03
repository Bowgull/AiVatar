// Joshua's vault, searchable, without loading it.
//
// His 1,188 notes come to 566 MB, and 1,111 of them are old AI session handoffs averaging nearly 2 MB
// each. Obsidian was given the whole thing on 2026-10-02 and reached 2.5 GB of memory while still
// indexing, which is why it now opens only the 73 working notes. This is the other half of that trade:
// Aang reads ALL of it, so the transcripts stay useful without anything having to hold them open.
//
// ONE EMBEDDING PER NOTE, not per chunk. Chunking 566 MB at 1,500 characters would be roughly 377,000
// embeddings, hours of GPU time and about a gigabyte of vectors, to answer a question that is really
// "which note was that in". Title + the note's own `llm_summary` frontmatter + the opening of the body
// gives 1,188 embeddings, under a minute, and a few megabytes.
//
// That bounds what this can find: it locates the right NOTE, not the right paragraph deep inside a 2 MB
// transcript. Say so rather than imply otherwise - searching inside the transcripts is a separate feature
// with a real cost, and nobody has asked for it yet.
//
// Read-only. Nothing here writes to the vault.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { embed, EMBED_DIM } from './embed.ts';
import { offLimits } from './files.ts';

/** How much of a note's body is worth embedding. Enough to carry what it is about, short enough that a
 *  2 MB transcript costs the same as a short note. */
const HEAD_CHARS = 1500;

export interface DocHit {
  path: string;
  title: string;
  head: string;
  score: number;
  how: 'meaning' | 'words';
}

/** Markdown frontmatter, if the note has any. These notes carry `llm_summary`, which is the single best
 *  sentence to index: it was written to describe the note. */
function frontmatter(text: string): { fields: Record<string, string>; body: string } {
  if (!text.startsWith('---')) return { fields: {}, body: text };
  const end = text.indexOf('\n---', 3);
  if (end < 0) return { fields: {}, body: text };
  const fields: Record<string, string> = {};
  for (const line of text.slice(3, end).split('\n')) {
    const m = /^([a-z_]+):\s*(.+)$/i.exec(line.trim());
    if (m) fields[m[1].toLowerCase()] = m[2].trim();
  }
  return { fields, body: text.slice(end + 4) };
}

/** What gets embedded for a note: what it is called, what it says it is about, and how it opens. */
export function headOf(file: string, text: string): { title: string; head: string } {
  const { fields, body } = frontmatter(text);
  const title = fields.title || path.basename(file, '.md');
  const summary = fields.llm_summary ?? fields.description ?? '';
  const opening = body
    // Callout blocks are boilerplate: every Aang note opens with the same "written by Aang" warning, and
    // his own notes carry banner callouts. Shared text pulls unrelated notes together in the embedding and
    // makes them all score the same, which is exactly what the first search results showed (2026-10-02).
    .replace(/^>\s*\[![a-z]+\][\s\S]*?(?=\n\s*\n|\n[^>])/gim, ' ')
    .replace(/^>\s?.*$/gm, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/```[\s\S]*?```/g, ' ')          // code fences carry little about the subject and a lot of noise
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, HEAD_CHARS);
  return { title, head: [title, summary, opening].filter(Boolean).join('\n').slice(0, HEAD_CHARS + 400) };
}

/** Every note under a root, skipping anything offLimits refuses. */
export function vaultNotes(root: string, max = 5000): string[] {
  const out: string[] = [];
  const walk = (dir: string, depth: number): void => {
    if (out.length >= max || depth > 8) return;
    let entries: string[] = [];
    try { entries = readdirSync(dir); } catch { return; }
    for (const name of entries) {
      if (name === '.git' || name === '.obsidian' || name === 'node_modules') continue;
      const full = path.join(dir, name);
      if (offLimits(full)) continue;          // asked for every path, file and folder alike
      let st; try { st = statSync(full); } catch { continue; }
      if (st.isDirectory()) walk(full, depth + 1);
      else if (name.toLowerCase().endsWith('.md') && st.size > 0) out.push(full);
    }
  };
  walk(root, 0);
  return out;
}

const toBlob = (v: Float32Array): Uint8Array => new Uint8Array(v.buffer.slice(0));
const fromBlob = (b: Uint8Array): Float32Array => new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);

function similarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export interface IndexResult { seen: number; added: number; updated: number; skipped: number; failed: number; ms: number }

/**
 * Index a vault. Safe to run repeatedly: a note whose size and modified time are unchanged is skipped,
 * so a re-run after editing three notes costs three embeddings.
 */
export async function indexVault(
  db: DatabaseSync,
  root: string,
  onProgress?: (done: number, total: number) => void,
  /** Re-embed everything, even notes that have not changed. Needed when what gets EMBEDDED changes, since
   *  the usual skip compares the file rather than the text that was indexed from it. */
  force = false,
): Promise<IndexResult> {
  const started = Date.now();
  const files = vaultNotes(root);
  const r: IndexResult = { seen: files.length, added: 0, updated: 0, skipped: 0, failed: 0, ms: 0 };

  const existing = new Map<string, { id: number; mtime: number; bytes: number }>();
  for (const row of db.prepare('SELECT id, path, mtime, bytes FROM docs').all() as any[]) {
    existing.set(String(row.path), { id: Number(row.id), mtime: Number(row.mtime), bytes: Number(row.bytes) });
  }

  const upsert = db.prepare(
    `INSERT INTO docs (path, title, head, mtime, bytes, dim, vec) VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(path) DO UPDATE SET title=excluded.title, head=excluded.head, mtime=excluded.mtime,
         bytes=excluded.bytes, dim=excluded.dim, vec=excluded.vec`);

  let done = 0;
  for (const file of files) {
    done++;
    if (done % 50 === 0) onProgress?.(done, files.length);
    let st, text;
    try { st = statSync(file); text = readFileSync(file, 'utf8'); } catch { r.failed++; continue; }

    const was = existing.get(file);
    const mtime = Math.round(st.mtimeMs);
    if (!force && was && was.mtime === mtime && was.bytes === st.size) { r.skipped++; continue; }

    const { title, head } = headOf(file, text);
    if (!head.trim()) { r.skipped++; continue; }

    const vec = await embed(head, 20_000);
    if (!vec) { r.failed++; continue; }        // Ollama down: keep going, the rest still index later

    try {
      upsert.run(file, title, head, mtime, st.size, EMBED_DIM, toBlob(vec));
      const id = Number((db.prepare('SELECT id FROM docs WHERE path = ?').get(file) as any).id);
      db.prepare('DELETE FROM docs_fts WHERE doc_id = ?').run(id);
      db.prepare('INSERT INTO docs_fts (title, head, path, doc_id) VALUES (?,?,?,?)').run(title, head, file, id);
      was ? r.updated++ : r.added++;
    } catch (e) {
      console.error('docs: could not store', path.basename(file), (e as Error).message);
      r.failed++;
    }
  }
  r.ms = Date.now() - started;
  return r;
}

/**
 * Find notes about something.
 *
 * Meaning first, words second, because "what did I decide about the browser" matches a note that never
 * uses the word "decide". Exact-word hits are merged in so a filename or a rare term still lands.
 */
export async function searchDocs(db: DatabaseSync, query: string, limit = 8): Promise<DocHit[]> {
  const q = (query ?? '').trim();
  if (!q) return [];
  const hits = new Map<string, DocHit>();

  const vec = await embed(q, 8000);
  if (vec) {
    const rows = db.prepare('SELECT path, title, head, dim, vec FROM docs WHERE dim = ?').all(EMBED_DIM) as any[];
    const scored = rows
      .map(row => ({ path: String(row.path), title: String(row.title), head: String(row.head), score: similarity(vec, fromBlob(row.vec)), how: 'meaning' as const }))
      .filter(h => h.score > 0.35)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    for (const h of scored) hits.set(h.path, h);
  }

  try {
    const terms = q.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(w => w.length > 1).slice(0, 8);
    if (terms.length) {
      const rows = db.prepare(
        `SELECT d.path AS path, d.title AS title, d.head AS head FROM docs_fts f
           JOIN docs d ON d.id = f.doc_id WHERE docs_fts MATCH ? ORDER BY rank LIMIT ?`,
      ).all(terms.map(t => `"${t}"*`).join(' OR '), limit) as any[];
      for (const row of rows) {
        const p = String(row.path);
        if (!hits.has(p)) hits.set(p, { path: p, title: String(row.title), head: String(row.head), score: 0.34, how: 'words' });
      }
    }
  } catch { /* fts is a bonus; meaning search already answered */ }

  return [...hits.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}

export function docCount(db: DatabaseSync): number {
  try { return (db.prepare('SELECT count(*) c FROM docs').get() as any).c as number; } catch { return 0; }
}

// Memory, against a copy of the real database. Never the live one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';
import { Memory, STALE_DAYS, keyNoun } from '../src/memory.ts';
import { EMBED_DIM, embed, fromBlob, normalise, similarity, toBlob } from '../src/embed.ts';

const live = path.join(os.homedir(), 'Documents', 'Aang', 'aang.db');

/** A throwaway copy of the real database, so the tests run against real history. */
function copyDb(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'aang-mem-'));
  const file = path.join(dir, 'aang.db');
  if (existsSync(live)) { const d = new DatabaseSync(live); d.exec(`VACUUM INTO '${file.replace(/\\/g, '/')}'`); d.close(); }
  else {
    const d = new DatabaseSync(file);
    d.exec(`CREATE TABLE turns (id INTEGER PRIMARY KEY, ts TEXT NOT NULL, role TEXT NOT NULL, tier TEXT, text TEXT NOT NULL);
            CREATE VIRTUAL TABLE turns_fts USING fts5(text, turn_id UNINDEXED);
            CREATE TABLE embeddings (turn_id INTEGER PRIMARY KEY, dim INTEGER NOT NULL, vec BLOB NOT NULL);
            CREATE TABLE facts (id INTEGER PRIMARY KEY, ts TEXT NOT NULL, text TEXT NOT NULL UNIQUE, source TEXT, last_seen TEXT, times_seen INTEGER DEFAULT 1, retired INTEGER DEFAULT 0);`);
    d.close();
  }
  return dir;
}

// ---------------------------------------------------------------- facts

test('he keeps what he is told, and confirming it again does not duplicate it', () => {
  const m = new Memory(copyDb());
  const a = m.remember('He raids on Tuesday and Thursday nights');
  assert.equal(a.fact?.text, 'He raids on Tuesday and Thursday nights');
  const b = m.remember('He raids on Tuesday and Thursday nights');
  assert.equal(b.fact?.timesSeen, 2, 'said twice, held once');
  assert.equal(m.list().filter(f => /raids on Tuesday/.test(f.text)).length, 1);
  m.close();
});

test('a newer fact about the same thing replaces the older one', () => {
  const m = new Memory(copyDb());
  m.remember('His girlfriend is called Sam');
  const second = m.remember('His girlfriend is called Alex');
  assert.equal(second.replaced?.text, 'His girlfriend is called Sam', 'the old one was superseded');
  const held = m.list().filter(f => /girlfriend/i.test(f.text));
  assert.equal(held.length, 1, 'he cannot hold both and pick either');
  assert.match(held[0]!.text, /Alex/);
  m.close();
});

test('forget means forget', () => {
  const m = new Memory(copyDb());
  m.remember('He is allergic to penicillin');
  const gone = m.forget('penicillin');
  assert.match(gone?.text ?? '', /penicillin/);
  assert.equal(m.list().some(f => /penicillin/.test(f.text)), false);
  assert.equal(m.forget('penicillin'), null, 'and it stays forgotten');
  m.close();
});

test('a fact nobody has confirmed for months stops being put in front of him', () => {
  const dir = copyDb();
  const m = new Memory(dir);
  const old = new Date(Date.now() - (STALE_DAYS + 30) * 86_400_000);
  m.remember('He is job searching', 'joshua', old);
  m.remember('He started a new job', 'joshua');
  const standing = m.standing().map(f => f.text);
  assert.ok(standing.includes('He started a new job'), 'the fresh one is offered');
  assert.equal(standing.includes('He is job searching'), false, 'the stale one is not');
  assert.ok(m.list().some(f => f.text === 'He is job searching'), 'but it is still there to be found');
  m.close();
});

test('facts are about a subject, so contradictions can be spotted', () => {
  assert.equal(keyNoun('His girlfriend is called Sam'), 'girlfriend');
  assert.equal(keyNoun('He raids on Tuesday'), 'raid');
  assert.equal(keyNoun('Joshua is currently located in Toronto'), 'located');
});

// ---------------------------------------------------------------- vectors

test('a vector round-trips through the database blob unchanged', () => {
  const v = normalise(Float32Array.from({ length: EMBED_DIM }, (_, i) => Math.sin(i)));
  const back = fromBlob(toBlob(v));
  assert.equal(back.length, EMBED_DIM);
  assert.ok(similarity(v, back) > 0.9999, 'same vector after a round trip');
});

test('similarity separates related text from unrelated', { timeout: 60_000 }, async () => {
  const a = await embed('my raid group clears heroic on tuesday nights');
  if (!a) { console.log('      (Ollama not running: skipped)'); return; }
  const near = await embed('we raid heroic on tuesdays with the guild');
  const far = await embed('the kettle needs descaling');
  assert.ok(similarity(a, near!) > similarity(a, far!), 'raiding is closer to raiding than to kettles');
  assert.ok(similarity(a, near!) > 0.55, `related text scored ${similarity(a, near!).toFixed(2)}`);
});

test('recall finds a turn by meaning when the words do not match', { timeout: 120_000 }, async () => {
  const dir = copyDb();
  const m = new Memory(dir);
  if (!(await embed('probe'))) { console.log('      (Ollama not running: skipped)'); m.close(); return; }
  m.saveTurn('the chibi keeps freezing when I alt tab out of the game', 'I will look into it', 'test');
  await new Promise(r => setTimeout(r, 1500));            // the vector is written just after the turn

  const byMeaning = await m.searchByMeaning('desktop pet hangs when switching windows');
  assert.ok(byMeaning.some(h => /chibi keeps freezing/.test(h.text)),
    'found it without sharing a single significant word: ' + JSON.stringify(byMeaning.map(h => h.text.slice(0, 40))));
  m.close();
});

test('recall still works with the local model switched off', { timeout: 60_000 }, async () => {
  const m = new Memory(copyDb());
  m.saveTurn('remember the bleeding edge raid schedule', 'noted', 'test');
  const old = process.env.AANG_OLLAMA;
  process.env.AANG_OLLAMA = 'http://127.0.0.1:1';        // nothing listening
  const hits = await m.recall('bleeding edge');
  process.env.AANG_OLLAMA = old;
  assert.ok(hits.some(h => /bleeding edge/i.test(h.text)), 'keyword search carried it alone');
  m.close();
});

test('coverage reports how much of the history can be recalled by meaning', () => {
  const m = new Memory(copyDb());
  const c = m.coverage();
  assert.ok(c.turns > 0);
  assert.ok(c.embedded >= 0 && c.embedded <= c.turns);
  console.log(`      real history: ${c.embedded} of ${c.turns} turns embedded`);
  m.close();
});

import './_env.ts';
// 4.3b: reaching back into the conversation - forgetting one turn, and pointing at specific turns.
//
// WHY THIS EXISTS: forgetting a message is only honest if it is forgotten everywhere. There are six
// separate reads of the `turns` table, and they had the "never recall a local model's answer" rule
// copy-pasted into five of them - the sixth, meaning-based recall, is exactly the kind of place a
// second rule gets missed. A turn that vanishes from search but still surfaces through embeddings is
// worse than one that was never hidden, because he would believe it was gone.
//
// Also covers the migration. His live database has 424 turns in it and was built before any of this;
// it opens through the normal path and never sees CREATE TABLE, so a column added to the schema alone
// would exist only in databases built from scratch - that is, in tests, and nowhere else.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Memory } from '../src/memory.ts';
import { migrate } from '../src/schema.ts';

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'aang-reach-'));

test('a forgotten turn leaves search, recall and history, and comes back', () => {
  const m = new Memory(tmp());
  try {
    const rows = m.saveTurn('what did the vet say about rosie', 'She needs the second jab on the 14th.', 'claude-quick');
    assert.ok(rows, 'saveTurn must hand back the row ids');

    const seen = () => m.history('').map(t => t.id);
    assert.ok(seen().includes(rows!.aangTurn), 'the reply should be in history to begin with');

    const gone = m.hideTurn(rows!.aangTurn);
    assert.equal(gone?.who, 'Aang');
    assert.ok(/second jab/.test(gone?.text ?? ''), 'hideTurn returns what it hid, so it can be offered back');

    assert.ok(!seen().includes(rows!.aangTurn), 'a forgotten turn is out of history');
    assert.equal(m.history('jab').length, 0, 'and out of word search');
    assert.equal(m.turnsById([rows!.aangTurn]).length, 0, 'and cannot be handed to him as context either');

    assert.equal(m.unhideTurn(rows!.aangTurn), true);
    assert.ok(seen().includes(rows!.aangTurn), 'undo brings it back');
  } finally { m.close(); }
});

test('forgetting hides the row, it does not delete it', () => {
  // The whole reason "undo that" can work. If this ever becomes a DELETE, undo is a lie.
  const dir = tmp();
  const m = new Memory(dir);
  let id = 0;
  try {
    id = m.saveTurn('keep this', 'and this', 'claude-quick')!.aangTurn;
    m.hideTurn(id);
  } finally { m.close(); }

  const db = new DatabaseSync(path.join(dir, 'aang.db'));
  try {
    const row = db.prepare('SELECT hidden, text FROM turns WHERE id = ?').get(id) as { hidden: number; text: string };
    assert.equal(Number(row.hidden), 1);
    assert.equal(String(row.text), 'and this', 'the words are still on disk');
  } finally { db.close(); }
});

test('turnsById returns what he pointed at, oldest first, and ignores nonsense', () => {
  const m = new Memory(tmp());
  try {
    const a = m.saveTurn('first question', 'first answer', 'claude-quick')!;
    const b = m.saveTurn('second question', 'second answer', 'claude-quick')!;
    const got = m.turnsById([b.aangTurn, a.userTurn]);
    assert.deepEqual(got.map(t => t.text), ['first question', 'second answer'], 'oldest first, whatever order he clicked');
    assert.deepEqual(got.map(t => t.who), ['you', 'Aang']);
    assert.equal(m.turnsById([]).length, 0);
    assert.equal(m.turnsById([-1, 0, 999999]).length, 0, 'bad ids are dropped, not thrown');
  } finally { m.close(); }
});

test('something Aang said unprompted is a row he can be replied to', () => {
  // The gap the September design was written about: saveTurn was called in exactly one place, the
  // normal chat path, so a reminder or a quota notice existed only as pixels.
  const m = new Memory(tmp());
  try {
    const id = m.saveSaid('You are at 50% of your week.');
    assert.ok(id && id > 0, 'it has an id, so Reply has something to bind to');
    const back = m.turnsById([id!]);
    assert.equal(back.length, 1);
    assert.equal(back[0].who, 'Aang');
    assert.equal(m.saveSaid('   '), null, 'an empty announcement is not a turn');
  } finally { m.close(); }
});

test('a proactive line is never mistaken for an answer he reasoned out', () => {
  const dir = tmp();
  const m = new Memory(dir);
  let id = 0;
  try { id = m.saveSaid('Reminder: raid at eight.')!; } finally { m.close(); }
  const db = new DatabaseSync(path.join(dir, 'aang.db'));
  try {
    const row = db.prepare('SELECT tier FROM turns WHERE id = ?').get(id) as { tier: string };
    assert.equal(String(row.tier), 'proactive');
  } finally { db.close(); }
});

test('an old database without the column gets it on open', () => {
  // Exactly the shape his live file is in: built before `hidden` existed.
  const dir = tmp();
  const file = path.join(dir, 'aang.db');
  const old = new DatabaseSync(file);
  old.exec('CREATE TABLE turns (id INTEGER PRIMARY KEY, ts TEXT NOT NULL, role TEXT NOT NULL, tier TEXT, text TEXT NOT NULL)');
  old.exec("INSERT INTO turns (ts, role, text) VALUES ('2026-09-01 10:00:00', 'user', 'from before')");
  old.exec('CREATE VIRTUAL TABLE turns_fts USING fts5(text, turn_id UNINDEXED)');
  old.close();

  const m = new Memory(dir);
  try {
    const cols = m.history('').length;
    assert.equal(cols, 1, 'the old turn survives the migration');
    const row = m.history('')[0];
    assert.equal(row.text, 'from before');
    assert.ok(m.hideTurn(row.id), 'and the new column actually works on it');
    assert.equal(m.history('').length, 0);
  } finally { m.close(); }
});

test('migrate is safe to run twice', () => {
  const dir = tmp();
  const m = new Memory(dir);
  try {
    // openMemory already ran it once; a second pass must be a no-op rather than an error.
    migrate((m as unknown as { db: DatabaseSync }).db);
    assert.ok(m.saveTurn('still fine', 'still fine', 'claude-quick'));
  } finally { m.close(); }
});

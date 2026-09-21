import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';
import { Memory } from '../src/memory.ts';
import { QUOTA_CEILING, consolidate, parseFacts } from '../src/consolidate.ts';

function freshDb(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'aang-cons-'));
  const d = new DatabaseSync(path.join(dir, 'aang.db'));
  d.exec(`CREATE TABLE turns (id INTEGER PRIMARY KEY, ts TEXT NOT NULL, role TEXT NOT NULL, tier TEXT, text TEXT NOT NULL);
          CREATE VIRTUAL TABLE turns_fts USING fts5(text, turn_id UNINDEXED);
          CREATE TABLE embeddings (turn_id INTEGER PRIMARY KEY, dim INTEGER NOT NULL, vec BLOB NOT NULL);
          CREATE TABLE facts (id INTEGER PRIMARY KEY, ts TEXT NOT NULL, text TEXT NOT NULL UNIQUE, source TEXT, last_seen TEXT, times_seen INTEGER DEFAULT 1, retired INTEGER DEFAULT 0);
          CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT);`);
  d.close();
  return dir;
}

/** A stand-in for the model, so the logic is tested without spending anything. */
const replying = (reply: string) => { let seen = ''; return { ask: async (p: string) => { seen = p; return reply; }, prompt: () => seen }; };

test('it reads the last session and keeps what matters', async () => {
  const m = new Memory(freshDb());
  m.saveTurn('im building cerebro and aang, and i raid wednesdays', 'noted', 'test');
  const model = replying('["He is building CereBro and Aang", "He raids on Wednesdays"]');
  const r = await consolidate(m, model.ask);
  assert.equal(r.skipped, null);
  assert.deepEqual(r.kept, ['He is building CereBro and Aang', 'He raids on Wednesdays']);
  assert.deepEqual(m.list().map(f => f.text).sort(), ['He is building CereBro and Aang', 'He raids on Wednesdays']);
  assert.match(model.prompt(), /Joshua: im building cerebro/, 'the real conversation was sent');
  m.close();
});

test('the same turns are never read twice', async () => {
  const dir = freshDb();
  const m = new Memory(dir);
  m.saveTurn('i play wow most nights', 'ok', 'test');
  await consolidate(m, replying('["He plays WoW most nights"]').ask);
  const second = await consolidate(m, replying('["He plays WoW most nights"]').ask);
  assert.equal(second.skipped, 'nothing new since last time');

  m.saveTurn('also i watch a lot of anime', 'ok', 'test');
  const third = await consolidate(m, replying('["He watches a lot of anime"]').ask);
  assert.equal(third.skipped, null, 'a new turn makes it worth reading again');
  assert.equal(third.considered, 2, 'only the new turns');
  m.close();
});

test('only his words are read: Aang\'s claims never reach it, his questions do', async () => {
  const m = new Memory(freshDb());
  m.saveTurn('open youtube in chrome', 'Opened it. YouTube links open in your default browser, which is Chrome.', 'test');
  m.saveTurn('dana', 'Nice. Is she older or younger?', 'test');
  const model = replying('[]');
  await consolidate(m, model.ask);
  assert.doesNotMatch(model.prompt(), /default browser, which is Chrome/, 'his false claim is not shown as if it were a fact');
  assert.match(model.prompt(), /Joshua: open youtube in chrome/);
  assert.match(model.prompt(), /Aang asked: Is she older or younger\?/, 'a question stays, for context');
  m.close();
});

test('what he asked to forget is not learned straight back from the old conversation', async () => {
  const m = new Memory(freshDb());
  m.saveTurn('we raid wednesdays at eight now', 'Got it.', 'test');
  m.remember('His raid group raids on Wednesdays at 8pm');
  m.forget('raid nights');
  m.remember('His sister is called Dana');
  const r = await consolidate(m, replying('["His raid group raids on Wednesdays at 8pm.", "His sister Dana is moving to Montreal."]').ask);
  assert.deepEqual(r.kept, ['His sister Dana is moving to Montreal.'], 'the raid fact stays forgotten');
  assert.equal(r.skippedForgotten, 1);
  assert.equal(m.list().some(f => /raid/i.test(f.text)), false);
  // but if he tells Aang again himself, it is kept
  assert.ok(m.remember('His raid group raids on Thursdays now').fact);
  m.close();
});

test('a marker left past the newest turn does not stop it for good', async () => {
  const m = new Memory(freshDb());
  m.setMeta('last_consolidated_turn', '616');           // turns were deleted; their ids come round again
  m.saveTurn('my sister is called Dana', 'noted', 'test');
  const r = await consolidate(m, replying('["His sister is called Dana"]').ask);
  assert.equal(r.skipped, null, 'the new turn was read, not waved off as already seen');
  assert.deepEqual(r.kept, ['His sister is called Dana']);
  assert.equal(m.getMeta('last_consolidated_turn'), String(m.lastTurnId()), 'and the marker is back in step');
  m.close();
});

test('it does not run when the week is already tight', async () => {
  const m = new Memory(freshDb());
  m.saveTurn('something worth keeping', 'ok', 'test');
  let called = false;
  const r = await consolidate(m, async () => { called = true; return '[]'; }, { weekUsed: QUOTA_CEILING });
  assert.match(r.skipped ?? '', /week already at 40%/);
  assert.equal(called, false, 'no model call at all');
  assert.equal(m.list().length, 0);
  m.close();
});

test('a quiet session costs one call and is not re-read forever', async () => {
  const m = new Memory(freshDb());
  m.saveTurn('hey', 'hey', 'test');
  const first = await consolidate(m, replying('[]').ask);
  assert.deepEqual(first.kept, []);
  const second = await consolidate(m, replying('[]').ask);
  assert.equal(second.skipped, 'nothing new since last time', 'the marker moved even though nothing was kept');
  m.close();
});

test('a correction found while catching up supersedes the old fact', async () => {
  const m = new Memory(freshDb());
  m.remember('His girlfriend is called Sam');
  m.saveTurn('her name is actually Alex', 'sorry, noted', 'test');
  const r = await consolidate(m, replying('["His girlfriend is called Alex"]').ask);
  assert.deepEqual(r.replaced, ['His girlfriend is called Sam']);
  assert.equal(m.list().filter(f => /girlfriend/.test(f.text)).length, 1);
  m.close();
});

test('a reply that is not clean JSON does not break it', () => {
  assert.deepEqual(parseFacts('Here you go:\n["He likes tea"]\nhope that helps'), ['He likes tea']);
  assert.deepEqual(parseFacts('[]'), []);
  assert.deepEqual(parseFacts('sorry, I could not do that'), []);
  assert.deepEqual(parseFacts('[{"fact":"nope"}, "He likes tea"]'), ['He likes tea'], 'non-strings dropped');
  assert.deepEqual(parseFacts('["tiny"]'), [], 'fragments dropped');
  assert.equal(parseFacts(`["${'x'.repeat(400)}"]`).length, 0, 'over-long dropped');
});

test('a model that fails does not lose the marker or corrupt anything', async () => {
  const m = new Memory(freshDb());
  m.saveTurn('worth keeping', 'ok', 'test');
  await assert.rejects(() => consolidate(m, async () => { throw new Error('model down'); }));
  assert.equal(m.getMeta('last_consolidated_turn'), null, 'the marker did not move, so it will try again');
  m.close();
});

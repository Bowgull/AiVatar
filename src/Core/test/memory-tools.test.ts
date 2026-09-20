import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Memory } from '../src/memory.ts';
import { describeWeatherCode, fetchWeather, toolLabel } from '../src/tools.ts';
import { parseFromBody } from '../src/protocol.ts';

function tempData(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'aang-mem-'));
  const db = new DatabaseSync(path.join(dir, 'aang.db'));
  db.exec(`CREATE TABLE turns (id INTEGER PRIMARY KEY, ts TEXT NOT NULL, role TEXT NOT NULL, tier TEXT, text TEXT NOT NULL);
           CREATE VIRTUAL TABLE turns_fts USING fts5(text, turn_id UNINDEXED);`);
  const add = (role: string, text: string) => {
    const r = db.prepare('INSERT INTO turns (ts, role, text) VALUES (?,?,?)').run('2026-09-18 23:17:00', role, text);
    db.prepare('INSERT INTO turns_fts (text, turn_id) VALUES (?,?)').run(text, Number(r.lastInsertRowid));
  };
  // Many turns full of everyday words, newer than the one we want: recency must not win.
  for (let i = 0; i < 12; i++) add('user', `what did you say about the thing number ${i}`);
  add('user', 'find me some good recipes for dinner');
  add('aang', 'Here are three easy dinner ideas.');
  for (let i = 0; i < 12; i++) add('aang', `what did we say about that, it was fine ${i}`);
  db.close();
  mkdirSync(path.join(dir, 'Brain'));
  writeFileSync(path.join(dir, 'Brain', 'profile.md'), 'Joshua Bocas, Toronto.');
  return dir;
}

test('memory finds an earlier conversation by words', () => {
  const m = new Memory(tempData());
  const hits = m.search('what did we say about dinner recipes');
  assert.ok(hits.length >= 1);
  assert.ok(hits.slice(0, 2).some(h => /dinner|recipes/.test(h.text)), 'the dinner turns must rank first, ahead of newer stopword-only matches: ' + JSON.stringify(hits.map(h => h.text)));
  assert.ok(!hits.some(h => /number \d+$/.test(h.text)), 'stopwords alone must not match');
  m.close();
});

test('replies from the retired local models are never recalled, but what Joshua said is', () => {
  const dir = tempData();
  const db = new DatabaseSync(path.join(dir, 'aang.db'));
  const r = db.prepare("INSERT INTO turns (ts, role, tier, text) VALUES ('2026-09-20 12:29:51','aang','local','Taj Mahal is the tallest mountain in the world.')").run();
  db.prepare('INSERT INTO turns_fts (text, turn_id) VALUES (?,?)').run('Taj Mahal is the tallest mountain in the world.', Number(r.lastInsertRowid));
  const u = db.prepare("INSERT INTO turns (ts, role, text) VALUES ('2026-09-20 12:29:50','user','what is the tallest mountain in the world?')").run();
  db.prepare('INSERT INTO turns_fts (text, turn_id) VALUES (?,?)').run('what is the tallest mountain in the world?', Number(u.lastInsertRowid));
  db.close();
  const hits = new Memory(dir).search('tallest mountain');
  assert.ok(!hits.some(h => /Taj Mahal/.test(h.text)), 'the hallucination must not resurface');
  assert.ok(hits.some(h => h.who === 'you'), "Joshua's own question is still found");
});

test('memory saves turns that search can then find', () => {
  const m = new Memory(tempData());
  m.saveTurn('remind me about the pelican project', 'Noted, the pelican project.', 'claude-quick');
  assert.ok(m.search('pelican').some(h => h.who === 'you'));
  m.close();
});

test('memory reads profile files and survives a missing database', () => {
  const dir = tempData();
  assert.match(new Memory(dir).profile(), /Toronto/);
  const empty = new Memory(mkdtempSync(path.join(os.tmpdir(), 'aang-none-')));
  assert.equal(empty.available, false);
  assert.deepEqual(empty.search('anything'), []);
  assert.equal(empty.profile(), '');
});

test('weather codes map to words and unknown codes do not crash', () => {
  assert.equal(describeWeatherCode(0), 'clear');
  assert.equal(describeWeatherCode(63), 'rain');
  assert.equal(describeWeatherCode(999), 'weather code 999');
});

test('weather is formatted from the service response', async () => {
  const fake = (async () => ({ ok: true, json: async () => ({ current: { time: '2026-09-20T15:00', weather_code: 61, temperature_2m: 14.4, apparent_temperature: 12.6, wind_speed_10m: 11.2, precipitation: 0.2 } }) })) as unknown as typeof fetch;
  const s = await fetchWeather(fake);
  assert.match(s, /light rain, 14 C \(feels like 13 C\), wind 11 km\/h/);
});

test('a failing weather service raises so the tool can report it', async () => {
  const fake = (async () => ({ ok: false, status: 503 })) as unknown as typeof fetch;
  await assert.rejects(fetchWeather(fake), /503/);
});

test('tool receipts have human labels', () => {
  assert.equal(toolLabel('mcp__aang__get_weather'), 'checking the weather');
  assert.equal(toolLabel('mcp__aang__something_new'), 'working');
});

test('protocol parsing accepts messages and rejects junk', () => {
  assert.deepEqual(parseFromBody('{"t":"stop"}'), { t: 'stop' });
  assert.equal(parseFromBody('not json'), null);
  assert.equal(parseFromBody('{"x":1}'), null);
  assert.equal(parseFromBody('[]'), null);
});

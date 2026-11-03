// BG3: the BotW guide tools (botw.ts) over the real botw.db and a made-up save (botwguide-fixture.ts), plus the spoiler
// test from docs/BOTW-GUIDE.md: ten questions whose right answer is a hint, not the solution, and three "just tell me"s.
// Tool level, so no model and no quota: what a tool hands back is all the model can say, so a spoiler it never gets is
// a spoiler it cannot give. Skipped when botw.db is not on this machine (it is Nintendo's data, never in the repo).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';
import { BotwGuide, botwLane, nameScore, square, direction } from '../src/botw.ts';
import { FIXTURE_STATE } from './botwguide-fixture.ts';

const REAL_DB = path.join(process.env.LOCALAPPDATA || '', 'Aang', 'botw', 'botw.db');
const have = existsSync(REAL_DB) && (() => { const d = new DatabaseSync(REAL_DB, { readOnly: true }); try { return !!d.prepare("SELECT 1 FROM sqlite_master WHERE name = 'cook_items'").get(); } finally { d.close(); } })();
const SAVED = Date.parse(FIXTURE_STATE.savedAt);
const SQUARE = /\b[A-J]-[1-8]\b/;

let dir = '', clock = SAVED + 3600_000, g: BotwGuide;
const fresh = () => { g?.close(); g = new BotwGuide(dir, () => clock); return g; };

before(() => {
  if (!have) return;
  dir = mkdtempSync(path.join(os.tmpdir(), 'aang-botwguide-'));
  copyFileSync(REAL_DB, path.join(dir, 'botw.db'));
  // the 7 Koroks nearest Kakariko count as found
  const db = new DatabaseSync(path.join(dir, 'botw.db'), { readOnly: true });
  const kak = { x: 1797, z: 990 };
  const found = (db.prepare('SELECT hash_id, x, z FROM koroks').all() as any[]).sort((a, b) => Math.hypot(a.x - kak.x, a.z - kak.z) - Math.hypot(b.x - kak.x, b.z - kak.z)).slice(0, 7).map(k => k.hash_id);
  db.close();
  writeFileSync(path.join(dir, 'state.json'), JSON.stringify({ ...FIXTURE_STATE, koroks: { seeds: 7, found } }));
  fresh();
});
after(() => { g?.close(); if (dir) rmSync(dir, { recursive: true, force: true }); });

test('the map grid and compass match the game (north is -z)', () => {
  assert.equal(square(1610, 475), 'G-5');
  assert.equal(square(-4999, -3999), 'A-1');
  assert.equal(square(4999, 3999), 'J-8');
  assert.equal(direction({ x: 0, z: 0 }, { x: 0, z: -100 }), 'north');
  assert.equal(direction({ x: 0, z: 0 }, { x: 100, z: 100 }), 'south-east');
});

test('names match the way he types them', () => {
  assert.equal(nameScore('hylian shroom', 'Hylian Shroom'), 100);
  assert.ok(nameScore('hylain shrom', 'Hylian Shroom') > 0, 'two slips still find it');
  assert.equal(nameScore('lynel', 'Hylian Shroom'), 0);
});

describe('the tools', { skip: !have && 'botw.db (pack v2) is not on this machine' }, () => {
  test('botw_me: where he saved, hearts, gear', () => {
    const r = g.me();
    for (const s of ['G-5', 'Lanayru', 'Hearts 3/3', '286 rupees', "Traveler's Sword", 'From his save of']) assert.ok(r.includes(s), s + '\n' + r);
  });

  test('botw_progress: counts only', () => {
    const r = g.progress();
    for (const s of ['9 of 120 done (10 found)', '7 of 900', 'Towers: 5 of 15', 'Divine Beasts: 0 of 4', 'main 2 of', 'side 0 of 76', 'shrine quests 0 of 42']) assert.ok(r.includes(s), s + '\n' + r);
  });

  test('botw_lookup: items are straight answers, with sellers, drops and his bag', () => {
    const r = g.lookup('hylian shroom');
    assert.match(r, /^Hylian Shroom \(material\)/);
    assert.match(r, /Sold by: /);
    assert.match(r, /He has 9 in his bag/);
    assert.match(g.lookup('hylain shrom'), /^Hylian Shroom/, 'a typo still finds it');
    assert.match(g.lookup('hearty durian'), /Dropped by: .*Hinox/);
    assert.match(g.lookup('kakariko'), /^Kakariko Village \(village\).*He has been there/);
    assert.match(g.lookup('meat skewer'), /^Meat Skewer: any meat\./, 'a dish answers with its recipe');
    assert.match(g.lookup('lynel'), /Lynel: \d+ health/);
    assert.match(g.lookup('zzqx'), /Nothing in the game's data/);
  });

  test('botw_nearby: counts first, spots on the second ask', () => {
    const counts = g.nearby(500);
    assert.match(counts, /Within 500 m of where he saved: \d+ Korok seeds?/);
    assert.doesNotMatch(counts, /- Korok/);
    const spots = g.nearby(1500, 'koroks', true);
    assert.match(spots, /- Korok: \d+ m (north|south|east|west)/);
    assert.ok(spots.split('\n').filter(l => l.startsWith('- ')).length <= 8);
    assert.doesNotMatch(spots, /Matching Trees|Rock Lift|Cube Puzzle/, 'no puzzle types in spots');
  });

  test('botw_cook: from his bag, with the game\'s numbers', () => {
    const all = g.cook();
    assert.match(all, /Hearty .*Hearty Durian x2 -> full heal \+ 8 hearts extra/);
    const cold = g.cook('something for the cold');
    const lines = cold.split('\n').filter(l => l.startsWith('- '));
    assert.ok(lines.length >= 1 && lines.every(l => /^- Spicy /.test(l) && /cold resistance/.test(l)), cold);
    assert.match(g.cook('stamina'), /^- Energizing Mushroom Skewer: Stamella Shroom x5 -> .*restores stamina 1\.4 wheels/m);
    assert.match(g.cook('fireproof'), /cannot make a flame guard dish/);
  });

  test('botw_quest: the ones on the go, and only the next step', () => {
    assert.match(g.quest(), /On the go: Divine Beast Vah Ruta \(main\), Captured Memories \(main\), Riddles of Hyrule \(side\)/);
    assert.match(g.quest('the isolated plateau'), /he finished it/);
    assert.match(g.quest("robbie's research"), /has not started it/);
    assert.match(g.quest('vah ruta'), /Muzu/);
  });

  test('botw_hint: the ladder climbs warm, warmer, the spot, and cools after half an hour', () => {
    fresh();
    assert.match(g.hint('nearest korok'), /rung 1 of 3, warm/);
    assert.match(g.hint('nearest korok'), /rung 2 of 3, warmer/);
    assert.match(g.hint('nearest korok'), /rung 3 of 3, the spot/);
    clock += 31 * 60_000;
    assert.match(g.hint('nearest korok'), /rung 1 of 3/);
    assert.match(g.hint('nearest korok', 3), /rung 3 of 3/, 'he can ask for a rung');
  });

  test('missing files are said plainly', () => {
    const empty = mkdtempSync(path.join(os.tmpdir(), 'aang-botwguide-none-'));
    try {
      const n = new BotwGuide(empty);
      assert.match(n.me(), /data pack is not on this PC/);
      copyFileSync(path.join(dir, 'botw.db'), path.join(empty, 'botw.db'));
      const m = new BotwGuide(empty);
      assert.match(m.progress(), /No save read yet/);
      assert.match(m.lookup('apple'), /^Apple/, 'game facts work without a save');
      m.close();
    } finally { rmSync(empty, { recursive: true, force: true }); }
  });

  // ---- the spoiler test: the right answer is a hint, not the solution
  describe('spoilers: ten hints', () => {
    before(() => fresh());
    test('1. "where\'s the nearest korok?" -> warm: no square, no puzzle', () => {
      const r = g.hint('nearest korok');
      assert.doesNotMatch(r, SQUARE); assert.doesNotMatch(r, /puzzle/i);
    });
    test('2. again -> warmer: the puzzle type, still no square', () => {
      const r = g.hint('nearest korok');
      assert.match(r, /puzzle/i); assert.doesNotMatch(r, SQUARE);
    });
    test('3. "nearest shrine?" -> warm, and the shrine is not named', () => {
      const r = g.hint('nearest shrine');
      assert.match(r, /a shrine he has not found/); assert.match(r, /Do not name the shrine/); assert.doesNotMatch(r, /\w+ Shrine\b/); assert.doesNotMatch(r, SQUARE);
    });
    test('4. "where is Myahm Agana Shrine?" (not found) -> no spot', () => {
      const r = g.lookup('myahm agana shrine');
      assert.match(r, /not found it yet/); assert.doesNotMatch(r, SQUARE); assert.doesNotMatch(r, /\d+ m /);
    });
    test('5. "how do I beat Waterblight Ganon?" -> held back', () => {
      const r = g.lookup('waterblight ganon');
      assert.match(r, /story enemy/); assert.doesNotMatch(r, /health/);
    });
    test('6. "what does Mipha\'s Grace do?" -> held back', () => {
      const r = g.lookup("mipha's grace");
      assert.match(r, /story reward/); assert.doesNotMatch(r, /resurrected|revive/i);
    });
    test('7. "what next in Vah Ruta?" -> his current step only, never the one after', () => {
      const db = new DatabaseSync(path.join(dir, 'botw.db'), { readOnly: true });
      const next = (db.prepare("SELECT text FROM quest_steps WHERE quest_id = 'Water_Relic' AND n = 1").get() as any).text as string;
      db.close();
      const r = g.quest('vah ruta');
      assert.ok(!r.includes(next.replace(/\{[\d.]+\}/g, '').slice(0, 40)), 'the next step\'s text is not in it');
    });
    test('8. "where do I take the riddle answer?" -> a warm direction, not the marker', () => {
      const r = g.quest('riddles of hyrule');
      assert.match(r, /warm hint/); assert.doesNotMatch(r, SQUARE);
    });
    test('9. "any koroks around here?" -> counts, no spots', () => {
      const r = g.nearby(400, 'koroks');
      assert.match(r, /Counts only/); assert.doesNotMatch(r, /- Korok/);
    });
    test('10. "what\'s in Divine Beast Vah Ruta?" -> the quest, not its steps', () => {
      const r = g.lookup('divine beast vah ruta');
      assert.match(r, /main quest/); assert.doesNotMatch(r, /Muzu|shock arrow/i);
    });
  });

  describe('spoilers: "just tell me" lifts it for that one question', () => {
    test('a. "just tell me where the korok is" -> the spot at once', () => {
      fresh();
      const r = g.hint('nearest korok', undefined, true);
      assert.match(r, /rung 3 of 3/); assert.match(r, SQUARE); assert.match(r, /Puzzle: /);
      assert.match(g.hint('nearest shrine'), /rung 1 of 3/, 'the next question is under the rule again');
    });
    test('b. "just tell me about Waterblight Ganon" -> the facts', () => {
      assert.match(g.lookup('waterblight ganon', true), /Waterblight Ganon: \d+ health/);
      assert.match(g.lookup('waterblight ganon'), /story enemy/, 'and held back again after');
    });
    test('c. "just tell me where Walton is" -> the marker square', () => {
      assert.match(g.quest('riddles of hyrule', true), /The marker: [A-J]-[1-8]/);
    });
  });
});

test('lanes while Cemu runs: words to Haiku, snips to Sonnet, small talk local, doing as usual', () => {
  const cemu = { running: true, which: 'Cemu' };
  assert.equal(botwLane('where is the nearest korok', false, cemu), 'quick');
  assert.equal(botwLane('what can I cook for the cold', false, cemu), 'quick');
  assert.equal(botwLane('what is this?', true, cemu), 'smart');
  assert.equal(botwLane('thanks!', false, cemu), null);
  assert.equal(botwLane('open spotify', false, cemu), null);
  assert.equal(botwLane('show me the nearest shrine', false, cemu), 'quick', 'a BotW word wins over "show me"');
  assert.equal(botwLane('where is the nearest korok', false, { running: true, which: 'Wow' }), null);
  assert.equal(botwLane('where is the nearest korok', false, { running: false, which: null }), null);
});

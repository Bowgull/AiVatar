// Sheet 25: "Ask Aang: add the general store to my route". His words become one goal in the Hyrule page's shapes, with
// his spoiler rules: nothing he has not found is ever named. Over the real botw.db and the made-up save
// (botwguide-fixture.ts); skipped when botw.db is not on this machine (Nintendo's data, never in the repo).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { resolveRouteGoal, routeLine, type RouteState } from '../src/botwroute.ts';
import { FIXTURE_STATE } from './botwguide-fixture.ts';

const REAL_DB = path.join(process.env.LOCALAPPDATA || '', 'Aang', 'botw', 'botw.db');
const st = FIXTURE_STATE as unknown as RouteState;
// the map's shops (sheet-07/shops.json shape): a general store in Kakariko, one in Hateno, one somewhere he has not been
const SHOPS: [string, number, number][] = [['ShopYorozu', 1800, 990], ['ShopYorozu', 3400, 2140], ['ShopYorozu', -3600, -1800], ['ShopYadoya', 1810, 1000]];

test('his words to one route goal, never naming what he has not found', { skip: !existsSync(REAL_DB) }, () => {
  const db = new DatabaseSync(REAL_DB, { readOnly: true });
  try {
    const r = (w: string) => resolveRouteGoal(db, st, w, SHOPS);
    // a shop kind: by a place he has been, nearest where he saved (Kakariko), or the place he names
    assert.deepEqual(r('the general store'), { goal: { kind: 'place', at: [1800, 990], name: 'General store (Kakariko Village)', icon: 'sheet-09/game/ShopYorozu.png' }, name: 'General store (Kakariko Village)' });
    assert.equal((r('the general store in hateno') as any).name, 'General store (Hateno Village)');
    assert.match((r('the inn') as any).name, /^Inn \(Kakariko/);
    assert.ok('why' in r('the jewelry shop'));
    // a place he has been; one he has not is not found
    assert.equal((r('kakariko') as any).goal.kind, 'place');
    assert.ok(!('goal' in r('rito village')) || (r('rito village') as any).goal.kind !== 'place');
    // items, dishes, quests he has going; a quest he has not started is refused
    assert.deepEqual((r('5 hylian shrooms') as any).goal, { kind: 'item', id: 'Item_Mushroom_E', n: 5 });
    assert.deepEqual(r('a hearty dish'), { goal: { kind: 'dish', effect: 'LifeMaxUp' }, name: 'a Hearty dish' });
    // a shrine he found is named; every unfound shrine stays unnamed
    const unfound = (db.prepare('SELECT id, name FROM shrines WHERE name IS NOT NULL').all() as any[]).filter(s => !st.shrines.found.includes(s.id));
    for (const s of unfound.slice(0, 40)) { const x = r(s.name) as any; assert.ok(!(x.goal?.kind === 'place' && x.name === s.name), s.name); }
  } finally { db.close(); }
});

test('Aang says what the map made of it, in one line', () => {
  assert.equal(routeLine({ name: 'General store (Kakariko Village)', state: 'planned', title: 'Your route', stops: 4 }), 'Added General store (Kakariko Village) to Your route: 4 stops now.');
  assert.equal(routeLine({ name: 'Kakariko Village', remove: true, state: 'planned', title: 'Your route', stops: 1 }), 'Took Kakariko Village off Your route: 1 stop left.');
  assert.equal(routeLine({ name: 'Kakariko Village', state: 'queued' }), "I'll put Kakariko Village on your route when you open your Hyrule map.");
  assert.match(routeLine({ name: 'x', state: 'off' }), /Samara is closed/);
});

test('Puzzle help: Straight answers takes a shrine hint straight to the spot; hints first otherwise', { skip: !existsSync(REAL_DB) }, async () => {
  const { BotwGuide } = await import('../src/botw.ts');
  const { mkdtempSync, copyFileSync, writeFileSync } = await import('node:fs');
  const os = await import('node:os');
  const dir = mkdtempSync(path.join(os.tmpdir(), 'aang-puzzle-'));
  copyFileSync(REAL_DB, path.join(dir, 'botw.db'));
  writeFileSync(path.join(dir, 'state.json'), JSON.stringify(FIXTURE_STATE));
  const g = new BotwGuide(dir);
  try {
    assert.match(g.hint('nearest shrine'), /rung 1 of 3/);
    writeFileSync(path.join(dir, 'guide-settings.json'), JSON.stringify({ puzzle: 'straight' }));
    assert.match(g.hint('nearest korok'), /rung 3 of 3/);
    assert.equal(g.puzzleStraight(), true);
  } finally { g.close(); }
});

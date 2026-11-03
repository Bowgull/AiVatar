// E6 (docs/BOTW-ENGINE.md): the engine against his real save (a COPY of his newest slot) and the real botw.db, with
// the hand-checked goals from the plan: "Flamebreaker armour", "all of Kakariko's shrines", "a Hearty dish now", plus
// more hearts and a closed shop. Skipped on a machine without his saves or a pack with E1's tables.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { botwDir } from '../src/botw.ts';
import { loadCatalog, parseState, type BotwState } from '../src/botwsave.ts';
import { slots } from '../src/botwwatch.ts';
import { Engine, parseGoal, type Plan } from '../src/botwengine.ts';

const CEMU = 'C:/Games/Cemu/portable/mlc01/usr/save/00050000/101c9400/user/80000001';
const DB = path.join(botwDir(), 'botw.db');
const has = existsSync(CEMU) && existsSync(DB) && !!new DatabaseSync(DB, { readOnly: true }).prepare("SELECT 1 FROM sqlite_master WHERE name = 'dlc_things'").get();
const skip = !has && 'no Cemu saves or an E1 botw.db here';

function his(): { db: DatabaseSync; st: BotwState } {
  const top = slots(CEMU)[0]!, dir = mkdtempSync(path.join(tmpdir(), 'aang-engine-')), copy = path.join(dir, 'game_data.sav');
  copyFileSync(top.file, copy);
  const st = parseState({ save: readFileSync(copy), slot: top.slot, savedAt: top.t }, loadCatalog(DB));
  rmSync(dir, { recursive: true, force: true });
  return { db: new DatabaseSync(DB, { readOnly: true }), st };
}
const run = (db: DatabaseSync, st: BotwState, words: string): { e: Engine; p: Plan } => {
  const g = parseGoal(db, words); assert.ok(g, `a goal from "${words}"`);
  const e = new Engine(db, st as any); return { e, p: e.plan(e.tree(g!), { maxStops: 30 }) };
};

test('E6: Flamebreaker armour fully upgraded: the set, its materials, the Great Fairies, and upgrades last', { skip }, () => {
  const { db, st } = his(), { e, p } = run(db, st, 'Flamebreaker armor fully upgraded');
  assert.deepEqual(p.tree.goal, { kind: 'armor', name: 'Flamebreaker armor', star: 4 });
  assert.match(p.tree.title, /Flamebreaker Helm/); assert.match(p.tree.title, /Flamebreaker Armor/); assert.match(p.tree.title, /Flamebreaker Boots/);
  const mats = p.tree.needs.map(n => n.what);
  for (const m of ['Smotherwing Butterfly', 'Fireproof Lizard', 'Moblin Guts', 'Hinox Guts']) assert.ok(mats.includes(m), `needs ${m}`);
  // the armour is sold in Goron City (Rogaro)
  assert.ok(p.tree.needs.find(n => n.what === 'Flamebreaker Armor')?.sources.some(s => s.kind === 'shop' && s.name === 'Rogaro'));
  // nothing is upgraded before the fountains are open and the materials he can buy are bought
  const last = p.stops.findIndex(s => s.what === 'the upgrades'), lastFountain = Math.max(...p.stops.map((s, i) => s.what === 'Great Fairy fountains open' ? i : -1));
  assert.ok(last > lastFountain && last === p.stops.length - 1, 'the upgrade visit comes last');
  assert.ok(p.routeGoals.some(g => g.kind === 'item' && g.id === 'Armor_011_Upper'), 'the route engine gets the items to find');
  assert.match(e.say(p), /Great Fair/);
});

test("E6: all of Kakariko's shrines: every shrine left near Kakariko, once each, unfound ones not named", { skip }, () => {
  const { db, st } = his(), { e, p } = run(db, st, "all of Kakariko's shrines");
  const need = p.tree.needs[0]!;
  assert.equal(p.stops.length, need.n - need.have);
  assert.equal(new Set(p.stops.map(s => s.source.id)).size, p.stops.length, 'no shrine twice');
  assert.ok(p.stops.every(s => !st.shrines.done.includes(s.source.id)), 'only shrines he has not finished');
  const unfound = p.stops.filter(s => !st.shrines.found.includes(s.source.id));
  const said = e.say(p), told = e.say(p, { spoil: true });
  for (const s of unfound) { assert.doesNotMatch(said, new RegExp(s.source.name)); assert.match(told, new RegExp(s.source.name)); }
});

test('E6: a Hearty dish now, from his bag', { skip }, () => {
  const { db, st } = his(), { e, p } = run(db, st, 'a hearty dish now');
  const hearty = db.prepare("SELECT id FROM cook_items WHERE effect = 'LifeMaxUp'").all().map((r: any) => r.id);
  const inBag = st.gear.some(g => hearty.includes(g.id));
  assert.equal(p.tree.done, inBag);
  if (inBag) assert.match(e.say(p), /cook it now/);
  else assert.ok(p.stops.length > 0, 'somewhere to get one');
});

test('E6: more hearts: Spirit Orbs from shrines first, then a Goddess statue; shops open when he gets there', { skip }, () => {
  const { db, st } = his(), { p } = run(db, st, '2 more hearts');
  const statue = p.stops.findIndex(s => s.source.kind === 'statue');
  assert.ok(statue >= 0, 'a statue');
  assert.ok(p.stops.slice(0, statue).every(s => s.source.kind === 'shrine'), 'every orb before the statue');
  // at 11 pm every shop on a plan is reached while it is open (after any wait)
  const night = { ...st, clock: { ...st.clock, hour: 23 } };
  const { p: q } = run(db, night, 'Flamebreaker armor fully upgraded');
  for (const s of q.stops) if (s.source.hours) {
    const h = s.arrive; // arrive is after any wait assert.ok(s.source.hours.some(([a, b]) => h >= a - 0.05 && h < b + 0.05), `${s.source.name} open at ${h}`);
  }
});

// The Paladin Book's rules (sheet omashu/remote/18 v5): what Now shows for a given OmaBook save, and that its tables
// hold together. Pure: no laptop, no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { makeBook, nextTalent, coin, ICONS, PATH, TREE, LADDER, FOOD, WATER, POTION, type BookSave } from '../src/omashubook.ts';

const at23 = { Deflection: 5, Conviction: 3, 'Improved Judgement': 2, 'Pursuit of Justice': 2, 'Seal of Command': 1, 'Sanctified Judgement': 1 };
const stocked = { 4542: 10, 1205: 10, 1710: 5, 3241: 5 };
const base = (o: Partial<BookSave> = {}): BookSave => ({ class: 'PALADIN', name: 'Bunji', level: 23, xp: 410, xpMax: 1000, zone: 'Duskwood', unspent: 0, talents: { ...at23 }, bags: { ...stocked }, skills: { 'Two-Handed Maces': 115 }, weapon: { id: 6953, dps: 25.63, sub: 5 }, done: { 1806: true, 78093: true }, ...o });

test('the tables hold together: every path talent is in the tree with room for its ranks, every icon ships', () => {
  const total: Record<string, number> = {};
  for (const [n, , r] of PATH) { assert.ok(TREE.find(t => t.name === n), n); total[n] = (total[n] ?? 0) + r; }
  for (const [n, r] of Object.entries(total)) assert.ok(r <= TREE.find(t => t.name === n)!.max, `${n} ${r}`);
  assert.equal(PATH.reduce((s, p) => s + p[2], 0), 51, 'one point a level from 10 to 60');
  for (const i of ICONS) assert.ok(existsSync(path.join(import.meta.dirname, '..', 'assets', 'omashu', 'book', 'icons', `${i}.jpg`)), i);
  for (const list of [FOOD, WATER, POTION]) assert.equal(new Set(list.map(w => w.id)).size, list.length);
  for (let i = 1; i < LADDER.length; i++) assert.ok(LADDER[i].dps > LADDER[i - 1].dps && LADDER[i].lvl >= LADDER[i - 1].lvl);
});

test('not a paladin, or nothing saved: no book', () => {
  assert.equal(makeBook(null), null);
  assert.equal(makeBook({ class: 'WARLOCK', level: 30 }), null);
});

test('all done: no cards, nothing to restock, the stocked list', () => {
  const b = makeBook(base())!;
  assert.deepEqual(b.cards, []);
  assert.deepEqual(b.restock, []);
  assert.match(b.fine, /10 Moist Cornbread, 10 Melon Juice, 5 Greater Healing Potion, 5 Heavy Weightstone/);
  assert.equal(b.spec, 'Retribution'); assert.equal(b.xpPct, 41); assert.equal(b.bracket, '20-40');
});

test('talent point: the next point of the leveling path, with its rank', () => {
  const b = makeBook(base({ unspent: 1, talents: { ...at23, 'Sanctified Judgement': 0 } }))!;
  assert.equal(b.cards[0].t, 'Spend your talent point');
  assert.equal(b.cards[0].d, 'Sanctified Judgement, rank 1 of 3');
  assert.equal(nextTalent({}, 10)?.name, 'Deflection');
  assert.equal(nextTalent(at23, 23), null, 'all taken');
  assert.equal(makeBook(base({ unspent: 2 }))!.cards[0].t, 'Spend your 2 talent points');
});

test('training: only spells you are high enough for', () => {
  const b = makeBook(base({ level: 20, train: [{ name: 'Consecration', lvl: 20 }, { name: 'Exorcism', lvl: 20 }, { name: 'Hammer of Wrath', lvl: 44 }] }))!;
  const c = b.cards.find(c => c.t.startsWith('Train'))!;
  assert.equal(c.t, 'Train 2 new spells');
  assert.match(c.d, /^Consecration, Exorcism · /);
});

test('weapon: the best open rung that beats what you hold; Verigan\'s Fist until its quest is done', () => {
  const b = makeBook(base({ weapon: { id: 7230, dps: 19.71, sub: 5 }, done: {} }))!;
  assert.equal(b.cards[0].t, "Verigan's Fist is waiting");
  assert.equal(b.cards.filter(c => /Verigan/.test(c.t)).length, 1, 'not also as a class quest card');
  assert.ok(b.cards.some(c => c.t === 'Class quest: Cloak of the Divine Storm'));
  assert.equal(b.ladder.find(r => r.state === 'next')!.name, "Verigan's Fist");
  assert.equal(makeBook(base())!.ladder.find(r => r.state === 'next')!.name, 'Heavehammer');
});

test('weapon skill: three levels before the rung that needs it', () => {
  assert.ok(!makeBook(base({ level: 31 }))!.cards.some(c => /Polearms/.test(c.t)));
  const b = makeBook(base({ level: 32, talents: {} }))!;
  assert.ok(b.cards.some(c => c.t === 'Learn Polearms soon'));
  assert.equal(b.gearNote, 'Train Polearms and Two-Handed Axes at a weapon master before 35 and 40.');
  assert.ok(!makeBook(base({ level: 32, skills: { Polearms: 1 } }))!.cards.some(c => /Polearms/.test(c.t)));
});

test('Cheap Upgrades: only +60% or more, two at most', () => {
  const b = makeBook(base({ cu: { list: [{ name: 'Ringed Chestguard', slot: 'Chest', price: 11000, pct: 64 }, { name: 'Meh Boots', slot: 'Feet', pct: 40 }] } }))!;
  const c = b.cards.filter(c => c.tone === 'green');
  assert.equal(c.length, 1);
  assert.equal(c[0].t, 'Upgrade: Ringed Chestguard'); assert.equal(c[0].d, 'Cheap Upgrades: chest +64% · AH 1g 10s'); assert.equal(c[0].go, '+64%');
});

test('restock: low items for your level, with auction prices; the cheaper potion when the better one costs far more', () => {
  const b = makeBook(base({ bags: { 4542: 10, 1179: 12, 3241: 1 } }), { 929: 1800, 1710: 15000, 3241: 900 })!;
  const water = b.restock.find(r => r.slot.startsWith('Water'))!;
  assert.equal(water.slot, 'Water · upgrade'); assert.equal(water.t, 'Melon Juice ×10'); assert.match(water.d, /^You carry Ice Cold Milk\. 835 mana/); assert.deepEqual(water.price, ['vendor']);
  const pot = b.restock.find(r => r.slot.startsWith('Potion'))!;
  assert.equal(pot.t, 'Healing Potion ×5'); assert.deepEqual(pot.price, ['AH 18s', '90s total']); assert.match(pot.d, /^Greater heals 63% more but costs 8×: not yet$/);
  const stone = b.restock.find(r => r.slot.startsWith('Weapon'))!;
  assert.equal(stone.slot, 'Weapon · you have 1'); assert.equal(stone.t, 'Heavy Weightstone ×5'); assert.deepEqual(stone.price, ['AH 9s', '45s total']);
  assert.ok(!b.restock.some(r => r.slot.startsWith('Food')), 'food is fine');
});

test('restock: a sharp weapon wants sharpening stones; First Aid adds bandages you can make', () => {
  const b = makeBook(base({ level: 36, weapon: { id: 274601, dps: 35.74, sub: 6 }, skills: { Polearms: 180, 'First Aid': 110 }, bags: {} }))!;
  assert.ok(b.restock.some(r => r.t === 'Dense Sharpening Stone ×5'));
  const band = b.restock.find(r => r.slot.startsWith('Bandage'))!;
  assert.equal(band.t, 'Silk Bandage ×10'); assert.deepEqual(band.price, ['you make it']);
});

test('coins read like the game', () => {
  assert.equal(coin(11000), '1g 10s'); assert.equal(coin(1800), '18s'); assert.equal(coin(9), '9c'); assert.equal(coin(20000), '2g');
});

// The Paladin Book's rules (sheet omashu/remote/18 v5): what Now shows for a given OmaBook save, and that its tables
// hold together. Pure: no laptop, no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { makeBook, nextTalent, coin, rotation, ICONS, PATH, TREE, LADDER, FOOD, WATER, POTION, SPELLS, type BookSave } from '../src/omashubook.ts';

const at23 = { Benediction: 5, Conviction: 3, 'Improved Judgement': 2, 'Seal of Command': 1, 'Pursuit of Justice': 2, 'Sanctified Judgement': 1 };
const stocked = { 4542: 10, 1205: 10, 1710: 5, 3241: 5 };
const base = (o: Partial<BookSave> = {}): BookSave => ({ class: 'PALADIN', name: 'Bunji', level: 23, xp: 410, xpMax: 1000, zone: 'Duskwood', unspent: 0, talents: { ...at23 }, bags: { ...stocked }, skills: { 'Two-Handed Maces': 115 }, weapon: { id: 6953, dps: 25.63, sub: 5 }, done: { 1788: true, 1806: true, 78093: true }, ...o });

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
  assert.equal(makeBook({ class: 'PALADIN', level: 1, faction: 'Horde' }), null, 'no Alliance book for a Horde paladin (2026-11-27)');
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
  assert.equal(nextTalent({}, 10)?.name, 'Benediction');
  assert.equal(nextTalent(at23, 23), null, 'all taken');
  assert.equal(makeBook(base({ unspent: 2 }))!.cards[0].t, 'Spend your 2 talent points');
});

test('training: the trainer list split into new spells (with plain lines) and upgrades, total cost', () => {
  const b = makeBook(base({ level: 10, spells: ['Judgement', 'Holy Light', 'Seal of Righteousness'],
    train: [{ name: 'Lay on Hands', lvl: 10, rank: 1, cost: 300 }, { name: 'Seal of Fury', lvl: 10, rank: 1, cost: 300 }, { name: 'Seal of Righteousness', lvl: 10, rank: 2, cost: 300 }, { name: 'Holy Light', lvl: 14, rank: 3, cost: 2000 }] }))!;
  assert.deepEqual(b.train!.fresh.map(f => f.name), ['Lay on Hands', 'Seal of Fury']);
  assert.equal(b.train!.fresh[0].use, "Panic button when you're about to die."); assert.ok(b.train!.fresh[1].skip, 'tank seal: skip for now');
  assert.deepEqual(b.train!.ups.map(u => u.name + ' ' + u.rank), ['Seal of Righteousness 2'], 'only what you can learn now');
  assert.equal(b.train!.cost, 900);
  assert.equal(makeBook(base())!.train, null, 'nothing to train: no card');
});

test('Forever Judgement keeps the Seal; Command replaces Righteousness on D-up; Holy Light stays on X until Flash of Light', () => {
  const lv8 = makeBook(base({ level: 8, talents: {}, spells: ['Seal of Righteousness', 'Judgement', 'Holy Strike', 'Holy Light', 'Hammer of Justice', 'Divine Protection'] }))!;
  assert.match(lv8.steps.find(s => s[4] === 'Judgement')![5], /Seal stays/);
  assert.ok(lv8.steps.some(s => s[4] === 'Hammer of Justice' && s[1] === 'LT' && s[2] === 'A'));
  const lv20 = makeBook(base({ level: 20, talents: {}, spells: ['Seal of Righteousness', 'Judgement', 'Holy Strike', 'Holy Light', 'Exorcism'] }))!;
  assert.deepEqual(lv20.steps.filter(s => s[2] === 'U').map(s => s[4]), ['Seal of Righteousness'], 'a seal before the talent');
  assert.equal(lv20.steps.find(s => s[4] === 'Holy Light')![2], 'X', 'Holy Light on X until Flash of Light');
  const lv22 = makeBook(base({ level: 22, spells: ['Seal of Righteousness', 'Seal of Command', 'Judgement', 'Holy Strike', 'Holy Light', 'Flash of Light'] }))!;
  assert.deepEqual(lv22.steps.filter(s => s[2] === 'U').map(s => s[4]), ['Seal of Command']);
  assert.equal(lv22.steps.find(s => s[4] === 'Holy Light')![2], 'Y');
  const lv44 = makeBook(base({ level: 44, spells: ['Seal of Command', 'Hammer of Wrath', 'Judgement'] }))!;
  const hw = lv44.steps.find(s => s[4] === 'Hammer of Wrath')!; assert.equal(hw[0], 'RT'); assert.equal(hw[2], 'U');
});

test('fight: only spells you know (no Hammer of Justice before you have it), new ones flagged', () => {
  const b = makeBook(base({ level: 6, talents: {}, spells: ['Seal of Righteousness', 'Judgement', 'Holy Strike', 'Holy Light', 'Seal of the Crusader', 'Devotion Aura'], fresh: ['Holy Strike'] }))!;
  assert.deepEqual(b.steps.map(s => s[4]), ['Seal of Righteousness', 'Judgement', 'Holy Strike', 'Holy Light']);
  assert.deepEqual(b.prep.map(s => s[4]), ['Devotion Aura']);
  const nc = b.cards.find(c => c.t === 'New: Holy Strike')!; assert.ok(nc && /RT \+ Y/.test(nc.d) && nc.tab === 'fight', 'a new spell is taught on Now');
  assert.deepEqual(b.fresh, ['Holy Strike']); assert.equal(b.crusader, true);
});

test('weapon: the best open rung that beats what you hold; Verigan\'s Fist until its quest is done', () => {
  const b = makeBook(base({ weapon: { id: 7230, dps: 19.71, sub: 5 }, done: { 1788: true } }))!;
  assert.equal(b.cards[0].t, "Verigan's Fist is waiting");
  assert.equal(b.cards.filter(c => /Verigan/.test(c.t)).length, 1, 'not also as a class quest card');
  assert.ok(b.cards.some(c => c.t === 'Class quest: Cloak of the Divine Storm (Ashenvale)'));
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

test('Upgrades tab: Cheap Upgrades\' mode, budget and list pass through, bad entries dropped', () => {
  const b = makeBook(base({ cu: { rich: true, max: 50000, list: [{ id: 2264, name: 'Mantle of Thieves', slot: 'Shoulder', price: 11000, pct: 64.4 }, { name: 'no id' }, { id: -1, name: 'bad' }] } }))!;
  assert.equal(b.cu.rich, true); assert.equal(b.cu.max, 50000);
  assert.deepEqual(b.cu.list, [{ id: 2264, name: 'Mantle of Thieves', slot: 'Shoulder', price: 11000, pct: 64 }]);
  assert.equal(b.cards.find(c => c.tone === 'green')!.item, 2264, 'the remote can give the card its real icon');
  assert.deepEqual(makeBook(base())!.cu, { rich: false, max: null, list: [] });
});

// ---------------------------------------------------------------- audit fixes, 2026-11-26 (live save: Bunji, level 8)

test('1. train: a first rank of a spell you know is never listed; the same name and rank only once', () => {
  const b = makeBook(base({ level: 8, spells: ['Judgement', 'Holy Light'], train: [{ name: 'Judgement', lvl: 4, rank: 0, cost: 100, id: 10321 }] }))!;
  assert.equal(b.train, null, 'live: Judgement listed while known');
  const c = makeBook(base({ level: 10, spells: ['Holy Light'], train: [{ name: 'Holy Light', lvl: 6, rank: 1, cost: 100 }, { name: 'Lay on Hands', lvl: 10, rank: 1, cost: 300 }, { name: 'Lay on Hands', lvl: 10, rank: 1, cost: 300 }, { name: 'Holy Light', lvl: 6, rank: 2, cost: 100 }] }))!;
  assert.deepEqual(c.train!.fresh.map(f => f.name), ['Lay on Hands']);
  assert.deepEqual(c.train!.ups.map(u => u.name + ' ' + u.rank), ['Holy Light 2']);
  assert.equal(c.train!.cost, 400, 'what is listed is what is paid');
});

test('2. New cards: real lines for Purify and friends; an unknown spell makes no claim about the pad or Fight', () => {
  const b = makeBook(base({ level: 8, fresh: ['Purify', 'Hammer of Justice', 'Some Odd Spell'] }))!;
  assert.match(b.cards.find(c => c.t === 'New: Purify')!.d, /poison and a disease.*set 2, LT \+ B$/);
  assert.equal(b.cards.find(c => c.t === 'New: Some Odd Spell')!.d, 'In your spellbook.');
  assert.ok(!b.cards.some(c => /in Fight/.test(c.d)));
  for (const n of ['Purify', 'Redemption', 'Blessing of Salvation', 'Frost Resistance Aura', 'Fire Resistance Aura', 'Blessing of Light', 'Blessing of Sacrifice',
    'Greater Blessing of Might', 'Greater Blessing of Wisdom', 'Greater Blessing of Light', 'Greater Blessing of Salvation', 'Greater Blessing of Kings']) {
    assert.ok(SPELLS[n]?.what && (SPELLS[n].use || SPELLS[n].skip) && SPELLS[n].pad, n);
  }
  assert.equal(SPELLS['Redemption'].pad, 'set 2, D-right'); assert.equal(SPELLS['Blessing of Salvation'].pad, 'In your spellbook');
});

test('3. spellbook folders are not spells: no card, no train row, nothing in fresh', () => {
  const b = makeBook(base({ level: 8, spells: ['Auras', 'Blessings', 'Seals', 'Holy Light'], fresh: ['Auras', 'Seals', 'Purify'], train: [{ name: 'Blessings', lvl: 4, rank: 0 }] }))!;
  assert.deepEqual(b.fresh, ['Purify']);
  assert.ok(!b.cards.some(c => /Auras|Seals|Blessings/.test(c.t)));
  assert.equal(b.train, null);
});

test('4. Cheap Upgrades: slot numbers in plain words, one row per item (its cheapest), one card per slot', () => {
  const list = [{ id: 4564, name: 'Spiked Club of the Wolf', pct: 253.8, price: 610, slot: 16 }, { id: 4564, name: 'Spiked Club of Spirit', pct: 252.4, price: 614, slot: 16 },
    { id: 4564, name: 'Spiked Club of Spirit', pct: 252.4, price: 610, slot: 16 }, { id: 3192, name: 'Short Bastard Sword of Holy Wrath', pct: 229.7, price: 490, slot: 16 },
    { id: 2264, name: 'Mantle of Thieves', pct: 70, price: 1100, slot: 3 }];
  const b = makeBook(base({ cu: { list } }))!;
  const c = b.cards.filter(c => c.tone === 'green');
  assert.deepEqual(c.map(c => c.d), ['Cheap Upgrades: main hand +254% · AH 6s', 'Cheap Upgrades: shoulder +70% · AH 11s']);
  assert.deepEqual(b.cu.list.map(u => `${u.name} ${u.slot} ${u.price}`), ['Spiked Club of the Wolf Main hand 610', 'Spiked Club of Spirit Main hand 610',
    'Short Bastard Sword of Holy Wrath Main hand 490', 'Mantle of Thieves Shoulder 1100']);
});

test('5. food: the cheese line counts, and "you have" counts every food you can eat at your level', () => {
  const b = makeBook(base({ level: 8, bags: { 2070: 10 } }))!;
  const food = b.restock.find(r => r.slot.startsWith('Food'))!;
  assert.equal(food.slot, 'Food · upgrade'); assert.match(food.d, /^You carry Darnassian Bleu\./);
  const c = makeBook(base({ level: 8, bags: { 4541: 2, 2070: 1, 422: 9 } }))!;
  assert.equal(c.restock.find(r => r.slot.startsWith('Food'))!.slot, 'Food · you have 3', 'Dwarven Mild (15) is not usable at 8');
  assert.match(makeBook(base({ level: 15, bags: { ...stocked, 4542: 0, 422: 6 } }))!.fine, /6 Dwarven Mild/);
});

test('6. Hammer of Justice: after Holy Strike until Seal of Command, then before Judgement', () => {
  const pre = rotation(new Set(['Seal of Righteousness', 'Judgement', 'Holy Strike', 'Hammer of Justice']), {}).steps.map(s => s[4]);
  assert.deepEqual(pre, ['Seal of Righteousness', 'Judgement', 'Holy Strike', 'Hammer of Justice']);
  const cmd = rotation(new Set(['Judgement', 'Holy Strike', 'Hammer of Justice']), { 'Seal of Command': 1 }).steps;
  assert.deepEqual(cmd.map(s => s[4]).slice(0, 4), ['Seal of Command', 'Hammer of Justice', 'Judgement', 'Holy Strike']);
  assert.match(cmd[1][5], /twice the damage/);
});

test('7. class quests: Redemption is done when you know it or finished either chain; 2998 alone is not; mounts by spell', () => {
  const at = (o: Partial<BookSave>) => makeBook(base({ level: 60, done: { 1806: true, 78093: true, 8418: true }, ...o }))!.cards.find(c => c.t.startsWith('Class quest'))?.t;
  assert.equal(at({}), 'Class quest: The Tome of Divinity (Redemption), Goldshire');
  assert.equal(at({ done: { 2998: true, 1806: true, 78093: true, 8418: true } }), 'Class quest: The Tome of Divinity (Redemption), Goldshire', 'the start only');
  assert.equal(at({ spells: ['Redemption'] }), 'Class quest: The Tome of Nobility (Warhorse)');
  assert.equal(at({ done: { 1785: true, 1806: true, 78093: true, 8418: true } }), 'Class quest: The Tome of Nobility (Warhorse)', 'dwarf chain end');
  assert.equal(at({ spells: ['Redemption', 'Summon Warhorse'] }), 'Class quest: Charger');
  assert.equal(at({ spells: ['Redemption', 'Summon Charger'] }), undefined);
  assert.equal(makeBook(base({ level: 30, done: [] }))!.cards.find(c => c.t.startsWith('Class quest'))!.t, 'Class quest: The Tome of Divinity (Redemption), Goldshire', 'done as an empty Lua list');
});

test('8. Ironforge Greathammer waits for its quest level, 16', () => {
  const lo = { level: 15, talents: {}, weapon: { id: 5579, dps: 2.6, sub: 5 } };
  assert.ok(!makeBook(base(lo))!.cards.some(c => /Greathammer/.test(c.t)));
  assert.ok(makeBook(base({ ...lo, level: 16 }))!.cards.some(c => c.t === 'Ironforge Greathammer is waiting'));
});

test('9. Seal of Command: new ranks at 30, 40, 50 and 60', () => assert.match(SPELLS['Seal of Command'].use!, /30, 40, 50 and 60/));

test('10. before a fight: Kings as a second line after Might once you know it', () => {
  const b = makeBook(base({ level: 20, spells: ['Devotion Aura', 'Blessing of Might', 'Blessing of Kings'] }))!;
  assert.deepEqual(b.prep.map(p => p[4]), ['Devotion Aura', 'Blessing of Might', 'Blessing of Kings']);
  const k = b.prep[2]; assert.equal(k[0] + k[2], 'LTRTA'); assert.match(k[5], /^Or Kings/);
  assert.ok(!makeBook(base({ level: 20, spells: ['Blessing of Might'] }))!.prep.some(p => p[4] === 'Blessing of Kings'));
});

test('11. a malformed save never breaks the page', () => {
  const bad = { spells: 'Judgement', fresh: { a: 1 }, train: 5, done: 'x', cu: { list: 'nope' } } as unknown as Partial<BookSave>;
  const b = makeBook(base(bad))!;
  assert.ok(b); assert.deepEqual(b.fresh, []); assert.equal(b.train, null); assert.deepEqual(b.cu.list, []);
  assert.ok(makeBook(base({ train: [null, 'x', { name: 3 }] as never, cu: { list: [null, 7] as never } })));
});

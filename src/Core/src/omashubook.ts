// The Paladin Book on the phone remote (omashu mockup sheet 18 v5, approved 2026-11-26): what Bunji needs right now,
// how to fight, the talent tree and the gear ladder. Pure: it takes the OmaBook add-on's save (as of the last /reload or
// logout, read by Couch Mode's GET /book with aux's auction prices) and returns what the phone draws. Nothing is live.
//
// Every table below is checked against WoW Forever's own data (Wowhead Forever item tooltips and sources, 2026-11-26),
// the talent tree is read from Bunji's game, and the leveling order is Mobalytics' Forever Retribution path (Nov 12).
import { readFileSync } from 'node:fs';
import path from 'node:path';

const BOOK_DIR = path.join(import.meta.dirname, '..', 'assets', 'omashu', 'book');

/** OmaBook's save (addons/OmaBook in oma-suite). Every field may be missing on an older or broken save. */
export interface BookSave {
  v?: number; at?: number; name?: string; realm?: string; faction?: string; class?: string; zone?: string;
  level?: number; xp?: number; xpMax?: number; unspent?: number;
  talents?: Record<string, number>; spells?: string[]; train?: { name: string; lvl: number }[];
  skills?: Record<string, number>; weapon?: { id?: number; name?: string; dps?: number; sub?: number } | null;
  bags?: Record<string, number>; done?: Record<string, boolean>; log?: number[];
  cu?: { rich?: boolean; max?: number; list?: { id?: number; name?: string; slot?: string; price?: number; pct?: number }[] } | null;
}

export interface TreeNode { sid: string; name: string; max: number; icon: string; tree: 'Holy' | 'Protection' | 'Retribution'; col: number; tier: number }
export const TREE: TreeNode[] = JSON.parse(readFileSync(path.join(BOOK_DIR, 'tree.json'), 'utf8'));

/** Mobalytics' Forever Retribution path: [talent, first level, ranks], one point a level from 10. */
export const PATH: [string, number, number][] = [['Deflection', 10, 5], ['Conviction', 15, 3], ['Improved Judgement', 18, 2], ['Pursuit of Justice', 20, 2], ['Seal of Command', 22, 1], ['Sanctified Judgement', 23, 2], ['Two-Handed Weapon Specialization', 25, 3], ['Sacred Arbiter', 28, 1], ['Sanctified Judgement', 29, 1], ['Vengeance', 30, 3], ['Repentance', 33, 1], ['Benediction', 34, 1], ['Champion of the Light', 35, 5], ['Unsealed Wrath', 40, 1], ['Divine Strength', 41, 5], ['Reverence', 46, 2], ['Improved Seals', 48, 5], ['Divine Intellect', 53, 5], ['Precision', 58, 3]];

/** Each point of the path in order: the level it is taken at, and the rank it brings that talent to. */
const POINTS: { name: string; lvl: number; rank: number }[] = (() => {
  const out: { name: string; lvl: number; rank: number }[] = [], got: Record<string, number> = {};
  for (const [n, l, r] of PATH) for (let i = 0; i < r; i++) { got[n] = (got[n] ?? 0) + 1; out.push({ name: n, lvl: l + i, rank: got[n] }); }
  return out.sort((a, b) => a.lvl - b.lvl);
})();

export const DESC: Record<string, string> = {
  'Deflection': '+1% parry per rank. Fewer hits get through.', 'Conviction': 'More critical strikes with all spells and attacks.',
  'Improved Judgement': 'Judgement cooldown 1 second shorter.', 'Pursuit of Justice': 'Run 15% faster, mounted too.',
  'Seal of Command': 'Your main Seal from here: extra Holy hits worth 70% of your weapon. Best with a slow two-hander.',
  'Sanctified Judgement': "Judgement gives back 60% of the Seal's mana. Fewer drinks.",
  'Two-Handed Weapon Specialization': 'More Physical and Holy damage with a two-hander, less threat.',
  'Sacred Arbiter': 'Holy Strike +20% and it refreshes all your Judgements.', 'Vengeance': 'After a critical hit, +5% damage for 30 s, stacks to 5.',
  'Repentance': 'Incapacitate a humanoid for 6 s. A second stun for doubled Judgement.', 'Benediction': 'Instant spells cost 10% less mana.',
  'Champion of the Light': 'Intellect becomes spell damage; Hammer of Wrath casts faster.',
  'Unsealed Wrath': 'Hits store copies of your Seal (up to 3); swap Seals to set them off.', 'Divine Strength': '+2% Strength per rank.',
  'Reverence': '30% of mana regen keeps going while you cast.', 'Improved Seals': 'More damage from your Seals and Judgements.',
  'Divine Intellect': '+2% Intellect per rank.', 'Precision': '+1% chance to hit per rank.',
};

/** The Fight tab: [trigger label, layout, button, icon, spell, when] per step, OmaPad's paladin layout. */
export const FIGHTS: Record<string, [string, string, string, string, string, string][]> = {
  '1-20': [['D-up', 'none', 'U', 'ability_thunderbolt', 'Seal of Righteousness', 'Keep it on'], ['RT', 'RT', 'X', 'spell_holy_righteousfury', 'Judgement', 'As you run in'], ['RT', 'RT', 'Y', 'classicon_paladin', 'Holy Strike', 'Every time it lights up'], ['LT', 'LT', 'A', 'spell_holy_sealofmight', 'Hammer of Justice', 'A second mob, or to stop a cast'], ['LT', 'LT', 'Y', 'spell_holy_holybolt', 'Holy Light', 'After the fight, if under half']],
  '20-40': [['D-up', 'none', 'U', 'ability_warrior_innerrage', 'Seal of Command', 'Keep it on, slow two-hander'], ['LT', 'LT', 'A', 'spell_holy_sealofmight', 'Hammer of Justice', 'Stun first'], ['RT', 'RT', 'X', 'spell_holy_righteousfury', 'Judgement', 'Double damage on a stunned enemy'], ['RT', 'RT', 'Y', 'classicon_paladin', 'Holy Strike', 'On cooldown'], ['RT', 'RT', 'B', 'spell_holy_innerfire', 'Consecration', 'Only on 3+ mobs'], ['LT', 'LT', 'Y', 'spell_holy_holybolt', 'Holy Light', 'Between fights']],
  '40+': [['D-up', 'none', 'U', 'ability_warrior_innerrage', 'Seal of Command', 'Swing 3 times: 3 stored copies'], ['D-down', 'none', 'D', 'ability_thunderbolt', 'Seal of Righteousness', 'Swap for the 4th swing: copies go off'], ['RT', 'RT', 'X', 'spell_holy_righteousfury', 'Judgement', 'On cooldown'], ['RT', 'RT', 'Y', 'classicon_paladin', 'Holy Strike', 'On cooldown, refreshes Judgement'], ['RT', 'RT', 'A', 'spell_holy_excorcism_02', 'Exorcism', 'Undead and demons'], ['D-up', 'RT', 'U', 'ability_thunderclap', 'Hammer of Wrath', 'Under 20% health (44+)']],
};

/** Two-hander ladder: Wowhead Forever item ids, DPS and icons; sources from Polestar's Forever guides. */
export interface Rung { id: number; name: string; icon: string; lvl: number; dps: number; from: string; skill?: string; quest?: number }
export const LADDER: Rung[] = [
  { id: 279895, name: 'Ironforge Greathammer', icon: 'inv_hammer_21', lvl: 13, dps: 15.97, from: 'Quest "Old Ironforge Incursion" · Hall of Thanes' },
  { id: 7230, name: "Smite's Mighty Hammer", icon: 'inv_hammer_09', lvl: 18, dps: 19.71, from: 'Deadmines' },
  { id: 6953, name: "Verigan's Fist", icon: 'inv_hammer_05', lvl: 20, dps: 25.63, from: 'Class quest · Polestar guides it', quest: 1806 },
  { id: 271766, name: 'Heavehammer', icon: 'inv_hammer_09', lvl: 31, dps: 27.73, from: 'Excavation Site: Wetlands quest' },
  { id: 274601, name: 'Harpoon of Command', icon: 'inv_spear_04', lvl: 35, dps: 35.74, from: "Polearm · Var'Taka, Drowned City", skill: 'Polearms' },
  { id: 6830, name: 'Bonebiter', icon: 'inv_axe_04', lvl: 40, dps: 38.82, from: 'Axe · "In the Name of the Light", Scarlet Monastery', skill: 'Two-Handed Axes' },
];

/** Paladin class quests OmaBook checks (Polestar's Forever paladin guides), with the level each opens at. */
export const CLASS_QUESTS: { id: number; name: string; lvl: number; icon: string }[] = [
  { id: 1806, name: "Verigan's Fist", lvl: 20, icon: 'inv_hammer_05' },
  { id: 78093, name: 'Cloak of the Divine Storm', lvl: 22, icon: 'inv_misc_book_11' },
  { id: 1661, name: 'The Tome of Nobility (Warhorse)', lvl: 40, icon: 'ability_mount_charger' },
  { id: 8418, name: 'Holy Mightstone', lvl: 50, icon: 'inv_stone_16' },
  { id: 7647, name: 'Charger', lvl: 60, icon: 'ability_mount_charger' },
];

/** Consumables by tier (Wowhead Forever: id, level to use, icon; v = vendor sells it). The first item of a tier is the one to buy. */
export interface Ware { id: number; name: string; icon: string; lvl: number; v?: boolean; heal?: number; fa?: number }
export const FOOD: Ware[] = [
  { id: 4540, name: 'Tough Hunk of Bread', icon: 'inv_misc_food_11', lvl: 1, v: true }, { id: 117, name: 'Tough Jerky', icon: 'inv_misc_food_16', lvl: 1, v: true },
  { id: 2681, name: 'Roasted Boar Meat', icon: 'inv_misc_food_18', lvl: 1 }, { id: 2888, name: 'Beer Basted Boar Ribs', icon: 'inv_misc_food_48', lvl: 1 },
  { id: 4541, name: 'Freshly Baked Bread', icon: 'inv_misc_food_12', lvl: 5, v: true }, { id: 2287, name: 'Haunch of Meat', icon: 'inv_misc_food_18', lvl: 5, v: true },
  { id: 2687, name: 'Dry Pork Ribs', icon: 'inv_misc_food_48', lvl: 5 }, { id: 724, name: 'Goretusk Liver Pie', icon: 'inv_misc_food_10', lvl: 5 },
  { id: 4542, name: 'Moist Cornbread', icon: 'inv_misc_food_08', lvl: 15, v: true }, { id: 3770, name: 'Mutton Chop', icon: 'inv_misc_food_14', lvl: 15, v: true },
  { id: 5480, name: 'Lean Venison', icon: 'inv_misc_food_72', lvl: 15 },
  { id: 4544, name: 'Mulgore Spice Bread', icon: 'inv_misc_food_11', lvl: 25, v: true }, { id: 3771, name: 'Wild Hog Shank', icon: 'inv_misc_food_13', lvl: 25, v: true },
  { id: 8364, name: 'Mithril Head Trout', icon: 'inv_misc_fish_02', lvl: 25 },
  { id: 4601, name: 'Soft Banana Bread', icon: 'inv_misc_food_09', lvl: 35, v: true }, { id: 4599, name: 'Cured Ham Steak', icon: 'inv_misc_food_14', lvl: 35, v: true },
  { id: 12218, name: 'Monster Omelet', icon: 'inv_misc_food_06', lvl: 35 }, { id: 13932, name: 'Poached Sunscale Salmon', icon: 'inv_misc_fish_19', lvl: 35 },
  { id: 8950, name: 'Homemade Cherry Pie', icon: 'inv_misc_food_10', lvl: 45, v: true }, { id: 8952, name: 'Roasted Quail', icon: 'inv_misc_food_15', lvl: 45, v: true },
  { id: 13934, name: 'Mightfish Steak', icon: 'inv_misc_food_47', lvl: 45 }, { id: 20452, name: 'Smoked Desert Dumplings', icon: 'inv_misc_food_64', lvl: 45 },
];
export const WATER: Ware[] = [
  { id: 159, name: 'Refreshing Spring Water', icon: 'inv_drink_07', lvl: 1, v: true }, { id: 1179, name: 'Ice Cold Milk', icon: 'inv_drink_milk_01', lvl: 5, v: true },
  { id: 1205, name: 'Melon Juice', icon: 'inv_drink_09', lvl: 15, v: true }, { id: 1708, name: 'Sweet Nectar', icon: 'inv_drink_12', lvl: 25, v: true },
  { id: 1645, name: 'Moonberry Juice', icon: 'inv_drink_02', lvl: 35, v: true }, { id: 8766, name: 'Morning Glory Dew', icon: 'inv_potion_01', lvl: 45, v: true },
];
/** Healing potions: vendors sell them in Forever too, but the auction house is usually cheaper. heal = the middle of the roll. */
export const POTION: Ware[] = [
  { id: 118, name: 'Minor Healing Potion', icon: 'inv_potion_49', lvl: 1, heal: 80 }, { id: 858, name: 'Lesser Healing Potion', icon: 'inv_potion_50', lvl: 3, heal: 160 },
  { id: 929, name: 'Healing Potion', icon: 'inv_potion_51', lvl: 12, heal: 320 }, { id: 1710, name: 'Greater Healing Potion', icon: 'inv_potion_52', lvl: 21, heal: 520 },
  { id: 3928, name: 'Superior Healing Potion', icon: 'inv_potion_53', lvl: 35, heal: 800 }, { id: 13446, name: 'Major Healing Potion', icon: 'inv_potion_54', lvl: 45, heal: 1400 },
];
export const WEIGHTSTONE: Ware[] = [
  { id: 3239, name: 'Rough Weightstone', icon: 'inv_stone_weightstone_01', lvl: 1 }, { id: 3240, name: 'Coarse Weightstone', icon: 'inv_stone_weightstone_02', lvl: 5 },
  { id: 3241, name: 'Heavy Weightstone', icon: 'inv_stone_weightstone_03', lvl: 15 }, { id: 7965, name: 'Solid Weightstone', icon: 'inv_stone_weightstone_04', lvl: 25 },
  { id: 12643, name: 'Dense Weightstone', icon: 'inv_stone_weightstone_05', lvl: 35 },
];
export const SHARPENING: Ware[] = [
  { id: 2862, name: 'Rough Sharpening Stone', icon: 'inv_stone_sharpeningstone_01', lvl: 1 }, { id: 2863, name: 'Coarse Sharpening Stone', icon: 'inv_stone_sharpeningstone_02', lvl: 5 },
  { id: 2871, name: 'Heavy Sharpening Stone', icon: 'inv_stone_sharpeningstone_03', lvl: 15 }, { id: 7964, name: 'Solid Sharpening Stone', icon: 'inv_stone_sharpeningstone_04', lvl: 25 },
  { id: 12404, name: 'Dense Sharpening Stone', icon: 'inv_stone_sharpeningstone_05', lvl: 35 },
];
/** What one of each tier restores (Wowhead Forever tooltips). */
const FOOD_HP: Record<number, number> = { 1: 59, 5: 234, 15: 531, 25: 841, 35: 1338, 45: 2065 };
const WATER_MP: Record<number, number> = { 1: 151, 5: 437, 15: 835, 25: 1345, 35: 1915, 45: 2821 };
const STONE_BONUS: Record<number, number> = { 1: 2, 5: 3, 15: 4, 25: 6, 35: 8 };
/** Bandages: fa = the First Aid skill needed to use (and make) them. */
export const BANDAGE: Ware[] = [
  { id: 1251, name: 'Linen Bandage', icon: 'inv_misc_bandage_15', lvl: 1, fa: 1 }, { id: 2581, name: 'Heavy Linen Bandage', icon: 'inv_misc_bandage_18', lvl: 1, fa: 20 },
  { id: 3530, name: 'Wool Bandage', icon: 'inv_misc_bandage_14', lvl: 1, fa: 50 }, { id: 3531, name: 'Heavy Wool Bandage', icon: 'inv_misc_bandage_17', lvl: 1, fa: 75 },
  { id: 6450, name: 'Silk Bandage', icon: 'inv_misc_bandage_01', lvl: 1, fa: 100 }, { id: 6451, name: 'Heavy Silk Bandage', icon: 'inv_misc_bandage_02', lvl: 1, fa: 125 },
  { id: 8544, name: 'Mageweave Bandage', icon: 'inv_misc_bandage_19', lvl: 1, fa: 150 }, { id: 8545, name: 'Heavy Mageweave Bandage', icon: 'inv_misc_bandage_20', lvl: 1, fa: 175 },
  { id: 14529, name: 'Runecloth Bandage', icon: 'inv_misc_bandage_11', lvl: 1, fa: 200 }, { id: 14530, name: 'Heavy Runecloth Bandage', icon: 'inv_misc_bandage_12', lvl: 1, fa: 225 },
];

/** The item ids whose auction prices the book uses (Couch Mode's /book?ids=). */
export const PRICE_IDS: number[] = [...POTION, ...WEIGHTSTONE, ...SHARPENING].map(w => w.id);

/** Every icon the book can show: shipped in assets/omashu/book/icons. */
export const ICONS: string[] = [...new Set([
  ...TREE.map(t => t.icon), ...LADDER.map(r => r.icon), ...CLASS_QUESTS.map(q => q.icon),
  ...[FOOD, WATER, POTION, WEIGHTSTONE, SHARPENING, BANDAGE].flat().map(w => w.icon),
  ...Object.values(FIGHTS).flat().map(f => f[3]), 'classicon_paladin', 'inv_misc_book_09', 'inv_chest_chain_05',
])].sort();

// ------------------------------------------------------------------ what the phone draws

export interface Card { icon: string; t: string; d: string; go?: string; tone?: 'hot' | 'blue' | 'green'; tab?: 'talents' | 'gear'; /** a Cheap Upgrades item: the remote swaps in its real icon */ item?: number }
export interface Restock { icon: string; slot: string; t: string; d: string; price: string[] }
export interface BookView {
  name: string; level: number; xpPct: number; spec: string; zone: string; at: number;
  cards: Card[]; restock: Restock[]; fine: string;
  ranks: Record<string, number>; next: string | null;
  ladder: (Rung & { state: 'have' | 'next' | 'later' })[]; forLevel: { icon: string; name: string; what: string }[]; gearNote: string;
  bracket: string;
  /** Cheap Upgrades (sheet 17): its mode (rich = biggest in budget), budget in copper, and its list from the last scan.
   *  icon, q (quality) and lvl are filled in from Wowhead by the remote. */
  cu: { rich: boolean; max: number | null; list: { id: number; name: string; slot: string; price: number; pct: number; icon?: string; q?: number; lvl?: number }[] };
}

export const coin = (c: number) => { c = Math.round(c); const g = Math.floor(c / 10000), s = Math.floor(c / 100) % 100, k = c % 100; return g ? `${g}g${s ? ` ${s}s` : ''}` : s ? `${s}s` : `${k}c`; };
const best = (list: Ware[], level: number) => { let b: Ware | null = null; for (const w of list) if (w.lvl <= level && (!b || w.lvl > b.lvl)) b = w; return b; };
const num = (v: unknown, d = 0) => typeof v === 'number' && Number.isFinite(v) ? v : d;

/** The talent the next unspent point goes in (the first point of the path not yet taken), or null. */
export function nextTalent(ranks: Record<string, number>, level: number): { name: string; rank: number } | null {
  for (const p of POINTS) { if (p.lvl > level) break; if ((ranks[p.name] ?? 0) < p.rank) return { name: p.name, rank: p.rank }; }
  return null;
}

/** Bag count of every item of one tier (any food that heals the same as the best one counts). */
function carried(bags: Record<string, number>, list: Ware[], lvl: number) {
  let n = 0, first: Ware | null = null;
  for (const w of list) if (w.lvl === lvl && bags[w.id]) { n += bags[w.id]; first ??= w; }
  return { n, first };
}
function lowerCarried(bags: Record<string, number>, list: Ware[], lvl: number): Ware | null {
  let b: Ware | null = null; for (const w of list) if (w.lvl < lvl && bags[w.id] && (!b || w.lvl > b.lvl)) b = w; return b;
}

export function makeBook(raw: unknown, prices: Record<string, number> = {}): BookView | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as BookSave;
  if (s.class !== 'PALADIN') return null;
  const level = Math.max(1, Math.min(60, Math.floor(num(s.level, 1))));
  const ranks: Record<string, number> = {};
  for (const [k, v] of Object.entries(s.talents ?? {})) if (typeof v === 'number') ranks[k] = v;
  const bags: Record<string, number> = {};
  for (const [k, v] of Object.entries(s.bags ?? {})) if (typeof v === 'number' && v > 0) bags[k] = v;
  const skills = s.skills ?? {};
  const price = (id: number) => { const p = prices[String(id)]; return typeof p === 'number' && p > 0 ? p : null; };
  const cards: Card[] = [];

  // 1. talent point
  const unspent = Math.max(0, Math.floor(num(s.unspent)));
  const nt = unspent > 0 ? nextTalent(ranks, level) : null;
  if (unspent > 0) {
    const node = nt && TREE.find(t => t.name === nt.name);
    cards.push({ icon: node?.icon ?? 'classicon_paladin', t: unspent > 1 ? `Spend your ${unspent} talent points` : 'Spend your talent point', d: nt && node ? `${nt.name}, rank ${nt.rank} of ${node.max}` : 'Your leveling build is done: pick what you like', tone: 'hot', tab: 'talents', go: '›' });
  }
  // 2. spells to train (the spellbook's own "learn at level N" list)
  const train = (s.train ?? []).filter(x => x && typeof x.name === 'string' && num(x.lvl) <= level).map(x => x.name);
  if (train.length) cards.push({ icon: 'inv_misc_book_09', t: train.length > 1 ? `Train ${train.length} new spells` : `Train ${train[0]}`, d: `${train.slice(0, 4).join(', ')}${train.length > 4 ? '…' : ''} · at a paladin trainer` });
  // 3. a weapon skill the ladder will need soon
  const owned = s.weapon && typeof s.weapon === 'object' ? s.weapon : null;
  const myDps = num(owned?.dps);
  for (const r of LADDER) if (r.skill && level >= r.lvl - 3 && skills[r.skill] === undefined) {
    cards.push({ icon: r.icon, t: `Learn ${r.skill}${level >= r.lvl ? '' : ' soon'}`, d: `${r.name} at ${r.lvl} needs it · a weapon master teaches it` }); break;
  }
  // 4. a better weapon is open: the best rung at your level that beats what you hold
  let up: Rung | null = null;
  for (const r of LADDER) if (r.lvl <= level && r.dps > myDps + 0.5 && owned?.id !== r.id && (!r.skill || skills[r.skill] !== undefined || level < r.lvl)) up = r;
  if (up && !(up.quest && s.done?.[String(up.quest)])) cards.push({ icon: up.icon, t: `${up.name} is waiting`, d: `${up.from} · ${up.dps.toFixed(1)} DPS`, tone: 'blue', tab: 'gear', go: '›' });
  // 5. a class quest is open (one at a time; Verigan's Fist is already the weapon card above)
  const cq = CLASS_QUESTS.find(q => level >= q.lvl && !s.done?.[String(q.id)] && !(up && up.quest === q.id));
  if (cq) cards.push({ icon: cq.icon, t: `Class quest: ${cq.name}`, d: 'Open it in Polestar' });
  // 6. Cheap Upgrades, only the big ones (+60% or more)
  for (const u of (s.cu?.list ?? []).filter(u => u && num(u.pct) >= 60).slice(0, 2))
    cards.push({ icon: 'inv_chest_chain_05', t: `Upgrade: ${String(u.name ?? 'an item')}`, d: `Cheap Upgrades: ${String(u.slot ?? '').toLowerCase()} +${Math.round(num(u.pct))}%${u.price ? ` · AH ${coin(num(u.price))}` : ''}`, tone: 'green', go: `+${Math.round(num(u.pct))}%`, ...(num(u.id) > 0 ? { item: num(u.id) } : {}) });

  // Restock: the best of each for your level, only when low
  const restock: Restock[] = [], fine: string[] = [];
  const stock = (slot: string, list: Ware[], target: number, low: number, priceOf: (w: Ware) => string[], why: (w: Ware) => string, pick?: Ware | null) => {
    const b = pick ?? best(list, level); if (!b) return;
    const have = carried(bags, list, b.lvl);
    if (have.n >= low) { fine.push(`${have.n} ${have.first!.name}`); return; }
    const lower = have.n === 0 ? lowerCarried(bags, list, b.lvl) : null;
    restock.push({ icon: b.icon, slot: lower ? `${slot} · upgrade` : `${slot} · you have ${have.n}`, t: `${b.name} ×${target}`, d: lower ? `You carry ${lower.name}. ${why(b)}` : why(b), price: priceOf(b) });
  };
  const ah = (w: Ware, n: number) => { const p = price(w.id); return p ? [`AH ${coin(p)}`, `${coin(p * n)} total`] : ['AH']; };
  stock('Food', FOOD, 10, 5, () => ['vendor'], w => `${FOOD_HP[w.lvl]} health while you sit`);
  stock('Water', WATER, 10, 5, () => ['vendor'], w => `${WATER_MP[w.lvl]} mana while you sit`);
  // potions: the best you can use, unless it costs far more than the one below it for little more healing
  let pot = best(POTION, level);
  let potNote = '';
  if (pot) {
    const below = POTION[POTION.indexOf(pot) - 1], pb = below && price(below.id), pp = price(pot.id);
    if (below && pb && pp && pp > pb * 4) { potNote = `${pot.name.replace(' Healing Potion', '')} heals ${Math.round((pot.heal! / below.heal! - 1) * 100)}% more but costs ${Math.round(pp / pb)}×: not yet`; pot = below; }
  }
  stock('Potion', POTION, 5, 2, w => ah(w, 5), w => potNote || `Heals about ${w.heal} at once`, pot);
  const blunt = owned?.sub === undefined || owned.sub === 4 || owned.sub === 5 || owned.sub === 10;
  stock('Weapon', blunt ? WEIGHTSTONE : SHARPENING, 5, 2, w => ah(w, 5), w => `+${STONE_BONUS[w.lvl]} damage, 30 min`);
  const fa = skills['First Aid'];
  if (typeof fa === 'number') {
    let bd: Ware | null = null; for (const w of BANDAGE) if ((w.fa ?? 0) <= fa) bd = w;
    if (bd) stock('Bandage', BANDAGE, 10, 5, () => ['you make it'], () => `First Aid ${fa}`, { ...bd, lvl: 1 });
  }

  // Gear tab
  const nextRung = LADDER.find(r => r.dps > myDps + 0.5 && owned?.id !== r.id) ?? null;
  const ladder = LADDER.map(r => ({ ...r, state: (r === nextRung ? 'next' : r.lvl <= level && (r.dps <= myDps + 0.5 || owned?.id === r.id) ? 'have' : 'later') as 'have' | 'next' | 'later' }));
  const f = best(FOOD, level)!, wt = best(WATER, level)!, pt = best(POTION, level)!, st = best(blunt ? WEIGHTSTONE : SHARPENING, level)!;
  const forLevel = [{ icon: f.icon, name: f.name, what: 'food' }, { icon: wt.icon, name: wt.name, what: 'water' }, { icon: pt.icon, name: pt.name.replace(' Potion', ''), what: `potion · ${pt.lvl}` }, { icon: st.icon, name: st.name, what: 'weapon' }];
  const need = LADDER.filter(r => r.skill && skills[r.skill] === undefined);
  const gearNote = need.length ? `Train ${need.map(r => r.skill).join(' and ')} at a weapon master before ${need.map(r => r.lvl).join(' and ')}.` : '';

  // the spec: the tree with the most points
  const per: Record<string, number> = {};
  for (const t of TREE) per[t.tree] = (per[t.tree] ?? 0) + (ranks[t.name] ?? 0);
  const spec = Object.entries(per).sort((a, b) => b[1] - a[1])[0];
  const xpMax = num(s.xpMax);
  return {
    name: String(s.name ?? 'Paladin'), level, xpPct: xpMax > 0 ? Math.round(num(s.xp) / xpMax * 100) : 0,
    spec: spec && spec[1] > 0 ? spec[0] : '', zone: typeof s.zone === 'string' ? s.zone : '', at: num(s.at),
    cards, restock, fine: fine.length ? `All stocked: ${fine.join(', ')}.` : '',
    ranks, next: nt?.name ?? nextTalent(ranks, level + 1)?.name ?? null,
    ladder, forLevel, gearNote, bracket: level < 20 ? '1-20' : level < 40 ? '20-40' : '40+',
    cu: {
      rich: s.cu?.rich === true, max: num(s.cu?.max) > 0 ? num(s.cu?.max) : null,
      list: (s.cu?.list ?? []).filter(u => u && Number.isInteger(u.id) && num(u.id) > 0 && typeof u.name === 'string').slice(0, 10)
        .map(u => ({ id: num(u.id), name: String(u.name), slot: String(u.slot ?? ''), price: Math.max(0, num(u.price)), pct: Math.round(num(u.pct)) })),
    },
  };
}

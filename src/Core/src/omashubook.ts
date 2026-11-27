// The Paladin Book on the phone remote (omashu mockup sheet 18 v5, approved 2026-11-26): what Bunji needs right now,
// how to fight, the talent tree and the gear ladder. Pure: it takes the OmaBook add-on's save (as of the last /reload or
// logout, read by Couch Mode's GET /book with aux's auction prices) and returns what the phone draws. Nothing is live.
//
// Every table below is checked against WoW Forever's own data (Wowhead Forever item tooltips and sources, 2026-11-26),
// the talent tree is read from Bunji's game, and the leveling order is Polestar's Forever Retribution build (see PATH).
import { readFileSync } from 'node:fs';
import path from 'node:path';

const BOOK_DIR = path.join(import.meta.dirname, '..', 'assets', 'omashu', 'book');

/** OmaBook's save (addons/OmaBook in oma-suite). Every field may be missing on an older or broken save. */
export interface BookSave {
  v?: number; at?: number; name?: string; realm?: string; faction?: string; class?: string; zone?: string;
  level?: number; money?: number; xp?: number; xpMax?: number; unspent?: number;
  talents?: Record<string, number>; spells?: string[]; train?: { name: string; lvl: number; rank?: number; cost?: number; id?: number }[]; fresh?: string[];
  skills?: Record<string, number>; weapon?: { id?: number; name?: string; dps?: number; sub?: number } | null;
  /** quest ids done: a map, or an empty Lua table that arrives as [] (a list of ids is read too) */
  bags?: Record<string, number>; done?: Record<string, boolean> | (number | string)[]; log?: number[];
  /** slot: Cheap Upgrades gives the inventory slot number (16 = main hand); older saves had a name */
  cu?: { rich?: boolean; max?: number; list?: { id?: number; name?: string; slot?: string | number; price?: number; pct?: number }[] } | null;
}

export interface TreeNode { sid: string; name: string; max: number; icon: string; tree: 'Holy' | 'Protection' | 'Retribution'; col: number; tier: number }
export const TREE: TreeNode[] = JSON.parse(readFileSync(path.join(BOOK_DIR, 'tree.json'), 'utf8'));

/** Forever Retribution leveling path (audit 2026-11-26, checked against the game's own tree, tree.json): Benediction first
 *  (Polestar's Forever build: cheaper instant spells, less drinking), Seal of Command as soon as it opens at 20 (tier 3,
 *  10 Ret points). [talent, first level, ranks], one point a level from 10; every tier gate checked. */
export const PATH: [string, number, number][] = [['Benediction', 10, 5], ['Conviction', 15, 3], ['Improved Judgement', 18, 2], ['Seal of Command', 20, 1], ['Pursuit of Justice', 21, 2], ['Sanctified Judgement', 23, 2], ['Two-Handed Weapon Specialization', 25, 3], ['Sacred Arbiter', 28, 1], ['Sanctified Judgement', 29, 1], ['Vengeance', 30, 3], ['Repentance', 33, 1], ['Deflection', 34, 1], ['Champion of the Light', 35, 5], ['Unsealed Wrath', 40, 1], ['Divine Strength', 41, 5], ['Reverence', 46, 2], ['Improved Seals', 48, 5], ['Divine Intellect', 53, 5], ['Precision', 58, 3]];

/** Each point of the path in order: the level it is taken at, and the rank it brings that talent to. */
const POINTS: { name: string; lvl: number; rank: number }[] = (() => {
  const out: { name: string; lvl: number; rank: number }[] = [], got: Record<string, number> = {};
  for (const [n, l, r] of PATH) for (let i = 0; i < r; i++) { got[n] = (got[n] ?? 0) + 1; out.push({ name: n, lvl: l + i, rank: got[n] }); }
  return out.sort((a, b) => a.lvl - b.lvl);
})();

export const DESC: Record<string, string> = {
  'Deflection': '+1% parry per rank.', 'Conviction': 'More critical strikes with all spells and attacks.',
  'Improved Judgement': 'Judgement cooldown 1 sec shorter per rank: 8 sec at 2/2.', 'Pursuit of Justice': 'Run 15% faster, mounted too.',
  'Seal of Command': 'Your main Seal from here: extra Holy hits worth 70% of your weapon. Best with a slow two-hander.',
  'Sanctified Judgement': "Judgement gives back 60% of the Seal's mana. Fewer drinks.",
  'Two-Handed Weapon Specialization': 'More Physical and Holy damage with a two-hander, less threat.',
  'Sacred Arbiter': 'Holy Strike +20%, and it refreshes Judgement effects on the target (Crusader, Justice, Light, Wisdom).', 'Vengeance': 'After a critical hit, +5% damage for 30 s, stacks to 5.',
  'Repentance': 'Puts a mob to sleep for up to 6 sec; any damage wakes it. Seal of Command\'s Judgement hits it twice as hard.', 'Benediction': 'Instant spells (Judgement, Holy Strike, Seals) cost less mana. Less drinking.',
  'Champion of the Light': 'Intellect becomes spell damage; Hammer of Wrath casts faster.',
  'Unsealed Wrath': 'Hits store copies of your Seal (up to 3, 15 sec). Hit with a different Seal and each copy gets its normal chance to go off. Optional: costs a second Seal.', 'Divine Strength': '+2% Strength per rank.',
  'Reverence': '30% of mana regen keeps going while you cast.', 'Improved Seals': 'More damage from your Seals and Judgements.',
  'Divine Intellect': '+2% Intellect per rank.', 'Precision': '+1% chance to hit per rank.',
};

/** The old per-bracket Fight tables: [trigger label, layout, button, icon, spell, when]. The phone now draws `rotation()`'s
 *  steps instead; these only feed ICONS and ride along in Couch Mode's /book payload (omashuremote.ts). */
export const FIGHTS: Record<string, [string, string, string, string, string, string][]> = {
  // Forever: Judgement does NOT use up the Seal (spell 20271: "Does not consume the Seal", 10 sec cooldown, 10 yd).
  '1-20': [['D-up', 'none', 'U', 'ability_thunderbolt', 'Seal of Righteousness', 'Keep it on. Lasts 30 sec'], ['RT', 'RT', 'X', 'spell_holy_righteousfury', 'Judgement', 'On the pull, then every 10 sec. Your Seal stays'], ['RT', 'RT', 'Y', 'classicon_paladin', 'Holy Strike', 'Every time it lights up'], ['LT', 'LT', 'A', 'spell_holy_sealofmight', 'Hammer of Justice', 'Stop a caster or a runner, or hold a 2nd mob'], ['LT', 'LT', 'D', 'spell_holy_restoration', 'Divine Protection', 'Fight going bad: bubble, then heal'], ['LT', 'LT', 'X', 'spell_holy_holybolt', 'Holy Light', 'After a fight if under half'], ['LT', 'LT', 'R', 'spell_holy_layonhands', 'Lay on Hands', 'About to die: full heal, all your mana']],
  '20-40': [['D-up', 'none', 'U', 'ability_thunderbolt', 'Seal of Righteousness', 'Keep it on until you take Seal of Command'], ['D-up', 'none', 'U', 'ability_warrior_innerrage', 'Seal of Command', 'Keep it on. Best with a slow two-hander'], ['RT', 'RT', 'A', 'spell_holy_excorcism_02', 'Exorcism', 'Opener on undead and demons'], ['LT', 'LT', 'A', 'spell_holy_sealofmight', 'Hammer of Justice', 'Stun, then Judgement: twice the damage with Command'], ['RT', 'RT', 'X', 'spell_holy_righteousfury', 'Judgement', 'Every time it lights up'], ['RT', 'RT', 'Y', 'classicon_paladin', 'Holy Strike', 'Every time it lights up'], ['LT', 'LT', 'B', 'spell_holy_prayerofhealing', 'Repentance', 'Humanoids: sleep, then Judgement'], ['RT', 'RT', 'B', 'spell_holy_innerfire', 'Consecration', 'Only with 3+ mobs on you'], ['LT', 'LT', 'X', 'spell_holy_flashheal', 'Flash of Light', 'Quick top-up mid-fight'], ['LT', 'LT', 'Y', 'spell_holy_holybolt', 'Holy Light', 'Between fights'], ['LT', 'LT', 'D', 'spell_holy_divineintervention', 'Divine Shield', 'Emergency'], ['LT', 'LT', 'D', 'spell_holy_restoration', 'Divine Protection', 'Emergency']],
  '40+': [['D-up', 'none', 'U', 'ability_warrior_innerrage', 'Seal of Command', 'Keep it on'], ['RT', 'RT', 'A', 'spell_holy_excorcism_02', 'Exorcism', 'Undead and demons'], ['LT', 'LT', 'A', 'spell_holy_sealofmight', 'Hammer of Justice', 'Stun, then Judgement for double'], ['RT', 'RT', 'X', 'spell_holy_righteousfury', 'Judgement', 'Every time it lights up'], ['RT', 'RT', 'Y', 'classicon_paladin', 'Holy Strike', 'Every time it lights up'], ['RT', 'RT', 'U', 'ability_thunderclap', 'Hammer of Wrath', 'Mob under 20% health'], ['RT', 'RT', 'B', 'spell_holy_innerfire', 'Consecration', '3+ mobs'], ['D-down', 'none', 'D', 'ability_thunderbolt', 'Seal of Righteousness', 'Optional swap after 3 swings (Unsealed Wrath)'], ['LT', 'LT', 'X', 'spell_holy_flashheal', 'Flash of Light', 'Mid-fight'], ['LT', 'LT', 'Y', 'spell_holy_holybolt', 'Holy Light', 'Between fights'], ['LT', 'LT', 'D', 'spell_holy_divineintervention', 'Divine Shield', 'Emergency']],
};

/** The paladin spells Forever's trainer sells (Polestar's trainer data, Wowhead Forever tooltips, 2026-11-26) and the
 *  ones the game or a quest gives, in plain words: what it does, when to use it, get it now or skip it for now (and why),
 *  and where OmaPad puts it ("In your spellbook": no pad button). Spells not here still show, just without the lines. */
export interface SpellGuide { icon: string; what: string; use?: string; skip?: string; pad?: string }
export const SPELLS: Record<string, SpellGuide> = {
  'Judgement': { icon: 'spell_holy_righteousfury', what: 'Hits the mob with your Seal\'s Judgement. In Forever it does NOT use up the Seal. 10 sec cooldown, 10 yd.', use: 'Keep a Seal on and press it every time it lights up.', pad: 'RT + X' },
  'Hammer of Justice': { icon: 'spell_holy_sealofmight', what: 'Stuns a mob for 3 sec. 1 min cooldown, 10 yd. The game gives you rank 1 at 8.', use: 'Stop a caster or a runner, or hold a 2nd mob. Later, with Seal of Command, Judge the stunned mob for double damage.', pad: 'LT + A' },
  'Divine Protection': { icon: 'spell_holy_restoration', what: "You take no damage for a few secs, but you can't attack.", use: "Only when a fight's going bad. Heal up or run.", pad: 'LT + D-down' },
  'Holy Strike': { icon: 'classicon_paladin', what: 'Quick hit: some weapon damage plus Holy damage. 10 sec cooldown.', use: 'Hit it whenever it lights up.', pad: 'RT + Y' },
  'Seal of the Crusader': { icon: 'spell_holy_holysmite', what: '+35 attack power, you swing 40% faster but each hit is weaker, 30 sec. Its Judgement: the mob takes more Holy damage for 40 sec.', skip: 'Righteousness is simpler and hits harder solo. Handy in groups.', pad: 'D-left' },
  'Parry': { icon: 'ability_parry', what: 'Lets you parry some hits. Nothing to press.', use: 'Always on once you have it.' },
  'Lay on Hands': { icon: 'spell_holy_layonhands', what: 'Heals to full but uses all your mana.', use: "Panic button when you're about to die.", pad: 'LT + D-right' },
  'Blessing of Protection': { icon: 'spell_holy_sealofprotection', what: "Stops all physical damage on someone for a bit, but they can't attack.", use: 'Save a buddy in a group who has aggro.', pad: 'set 2, LT + Y' },
  'Seal of Fury': { icon: 'spell_holy_retributionaura', what: 'A tank seal: Judging it makes the mob attack you.', skip: "Only for tanking in groups. Solo you don't need it.", pad: 'set 2, LT + RT + Y' },
  'Blessing of Wisdom': { icon: 'spell_holy_sealofwisdom', what: 'Gives you mana back over time for an hour.', use: 'Swap Might for it if you keep running out of mana.', pad: 'set 2, LT + X' },
  'Retribution Aura': { icon: 'spell_holy_auraoflight', what: 'Mobs that hit you take Holy damage back.', use: 'Your aura from here: it takes Devotion Aura\'s button.', pad: 'LT + RT + D-down' },
  'Righteous Fury': { icon: 'spell_holy_sealoffury', what: 'Makes mobs much more likely to attack you.', skip: 'Tanking only. Leave it off solo.', pad: 'set 2, LT + RT + X' },
  'Blessing of Freedom': { icon: 'spell_holy_sealofvalor', what: "Can't be slowed or rooted for 10 secs.", use: 'When something slows you or roots you.', pad: 'LT + D-left' },
  'Exorcism': { icon: 'spell_holy_excorcism_02', what: 'Holy hit on undead or demons. 30 yd, 15 sec cooldown.', use: 'Open on undead and demons.', pad: 'RT + A' },
  'Seal of Command': { icon: 'ability_warrior_innerrage', what: 'Your main Seal: hits get a chance for extra Holy damage. Lasts 30 sec.', use: 'Keep it on. Buy the new rank at 30, 40, 50 and 60.', pad: 'D-up' },
  'Flash of Light': { icon: 'spell_holy_flashheal', what: 'Small, fast, cheap heal.', use: 'Top up between fights, or mid-fight when Holy Light is too slow.', pad: 'LT + X' },
  'Blessing of Kings': { icon: 'spell_magic_magearmor', what: '+10% to all your stats for an hour.', use: 'Keep it on if you like it more than Might.', pad: 'LT + RT + A' },
  'Consecration': { icon: 'spell_holy_innerfire', what: 'Holy fire on the ground around you.', use: 'When 3 or more mobs are on you.', pad: 'RT + B' },
  'Concentration Aura': { icon: 'spell_holy_mindsooth', what: 'Helps you finish casts while getting hit.', skip: "For healers. You're better with Devotion or Retribution.", pad: 'set 2, RT + D-left' },
  'Seal of Justice': { icon: 'spell_holy_sealofwrath', what: "Your hits get a chance to stun for 2 sec. Judge it and the mob can't run away.", use: 'On mobs that run at low health. Not on your pad: cast it from the spellbook.' },
  'Shadow Resistance Aura': { icon: 'spell_shadow_sealofkings', what: '+30 Shadow resistance for the group.', skip: 'Only against shadow casters or in dungeons that need it.', pad: 'set 2, RT + D-up' },
  'Seal of Light': { icon: 'spell_holy_healingaura', what: 'Judge it and hits on the mob can heal you.', skip: 'Command hits much harder. Try it only if you keep running low on health.' },
  'Divine Intervention': { icon: 'spell_nature_timestop', what: 'Saves a party member: mobs stop attacking them, but they can\'t act for 3 min. Costs your life.', skip: 'Group wipes only.', pad: 'set 2, D-left' },
  'Divine Shield': { icon: 'spell_holy_divineintervention', what: 'Immune to all damage for 10 sec, but you deal half damage. 5 min cooldown.', use: 'Emergency, then heal or run. Takes Divine Protection\'s button.', pad: 'LT + D-down' },
  'Seal of Wisdom': { icon: 'spell_holy_righteousnessaura', what: 'Judge it and hits on the mob can give you mana.', skip: 'Command first. Try it if mana is your problem.' },
  'Plate Mail': { icon: 'inv_chest_plate01', what: 'You can wear plate armor.', use: 'Buy it at 40. Your armor jumps a lot.' },
  'Cleanse': { icon: 'spell_holy_renew', what: 'Removes a poison, a disease and a magic effect.', use: 'Replaces Purify.', pad: 'set 2, LT + B' },
  'Hammer of Wrath': { icon: 'ability_thunderclap', what: 'Big Holy hit, only on mobs under 20% health.', use: 'Finish mobs off.', pad: 'RT + D-up' },
  'Holy Wrath': { icon: 'spell_holy_excorcism', what: 'Holy blast around you that hits and stuns undead and demons.', skip: 'Undead and demon packs only.', pad: 'RT + D-left' },
  'Turn Undead': { icon: 'spell_holy_turnundead', what: 'Makes one undead run away for a bit.', skip: 'Rarely needed solo.', pad: 'set 2, LT + A' },
  // the game gives Purify at 8 and the Tome of Divinity quest gives Redemption: neither is sold, so they only show as New
  'Purify': { icon: 'inv_misc_book_09', what: 'Removes a poison and a disease from you or a buddy.', use: 'When a poison or a disease is wearing you down.', pad: 'set 2, LT + B' },
  'Redemption': { icon: 'spell_holy_resurrection', what: 'Brings a dead party member back to life.', use: 'After a fight, on a buddy who died.', pad: 'set 2, D-right' },
  'Blessing of Salvation': { icon: 'inv_misc_book_09', what: 'The target makes less threat, so mobs stay on the tank.', skip: 'For groups: put it on the damage dealers. Solo, keep Might.', pad: 'In your spellbook' },
  'Frost Resistance Aura': { icon: 'inv_misc_book_09', what: 'More Frost resistance for the group.', skip: 'Only against frost casters or in dungeons that need it.', pad: 'set 2, RT + D-right' },
  'Fire Resistance Aura': { icon: 'inv_misc_book_09', what: 'More Fire resistance for the group.', skip: 'Only against fire casters or in dungeons that need it.', pad: 'set 2, RT + D-down' },
  'Blessing of Light': { icon: 'inv_misc_book_09', what: 'Your heals on the target heal more.', skip: 'For healers in groups. Solo, keep Might.', pad: 'In your spellbook' },
  'Blessing of Sacrifice': { icon: 'inv_misc_book_09', what: 'Some of the damage a party member takes goes to you instead.', skip: 'Groups only, to save a buddy.', pad: 'In your spellbook' },
  // the Greater Blessings (Polestar's trainer data: Might 52, Wisdom 54, Light, Salvation and Kings 60)
  'Greater Blessing of Might': { icon: 'inv_misc_book_09', what: 'Might on everyone of one class in your group at once. Uses a Symbol of Kings.', skip: 'For groups. Solo, the normal Might does the job.', pad: 'In your spellbook' },
  'Greater Blessing of Wisdom': { icon: 'inv_misc_book_09', what: 'Wisdom on everyone of one class in your group at once. Uses a Symbol of Kings.', skip: 'For groups. Solo, the normal Wisdom does the job.', pad: 'In your spellbook' },
  'Greater Blessing of Light': { icon: 'spell_holy_greaterblessingoflight', what: 'Light on everyone of one class in your group at once. Uses a Symbol of Kings.', skip: 'For groups with a healer.', pad: 'In your spellbook' },
  'Greater Blessing of Salvation': { icon: 'inv_misc_book_09', what: 'Salvation on everyone of one class in your group at once. Uses a Symbol of Kings.', skip: 'For groups.', pad: 'In your spellbook' },
  'Greater Blessing of Kings': { icon: 'inv_misc_book_09', what: 'Kings on everyone of one class in your group at once. Uses a Symbol of Kings.', skip: 'For groups. Solo, the normal Kings does the job.', pad: 'In your spellbook' },
};

/** Spellbook folders (flyouts) the add-on can save as if they were spells: never a card, a train row or a rotation step. */
const FOLDERS = new Set(['Auras', 'Blessings', 'Seals']);

/** The rotation, built for your exact level from the spells (and talents) you have (Joshua 2026-11-26: "rotations per
 *  level"). One priority list; each row shows only once you have its spell. [label, trigger, button, icon, spell, when]. */
type Step = [string, string, string, string, string, string];
export function rotation(known: Set<string>, ranks: Record<string, number>): { steps: Step[]; prep: Step[] } {
  const has = (n: string) => known.has(n) || (ranks[n] ?? 0) > 0;
  const command = has('Seal of Command');
  const steps: Step[] = [];
  const add = (st: Step, ok = true) => { if (ok && has(st[4])) steps.push(st); };
  add(['D-up', 'none', 'U', 'ability_warrior_innerrage', 'Seal of Command', 'Keep it on. Lasts 30 sec']);
  add(['D-up', 'none', 'U', 'ability_thunderbolt', 'Seal of Righteousness', 'Keep it on. Lasts 30 sec'], !command);
  add(['RT', 'RT', 'A', 'spell_holy_excorcism_02', 'Exorcism', 'Open with it on undead and demons']);
  // with Seal of Command the stun sets up a double Judgement, so it comes first; before that it's only for trouble
  const hoj: Step = ['LT', 'LT', 'A', 'spell_holy_sealofmight', 'Hammer of Justice', command ? 'Stun, then Judgement: twice the damage' : 'Stop a caster or a runner, or hold a 2nd mob'];
  if (command) add(hoj);
  add(['RT', 'RT', 'X', 'spell_holy_righteousfury', 'Judgement', 'Every time it lights up. Your Seal stays']);
  add(['RT', 'RT', 'Y', 'classicon_paladin', 'Holy Strike', 'Every time it lights up']);
  if (!command) add(hoj);
  add(['RT', 'RT', 'U', 'ability_thunderclap', 'Hammer of Wrath', 'Mob under 20% health']);
  add(['LT', 'LT', 'B', 'spell_holy_prayerofhealing', 'Repentance', 'Humanoids: sleep, then Judgement']);
  add(['RT', 'RT', 'B', 'spell_holy_innerfire', 'Consecration', 'Only with 3+ mobs on you']);
  if (command && (ranks['Unsealed Wrath'] ?? 0) > 0) add(['D-down', 'none', 'D', 'ability_thunderbolt', 'Seal of Righteousness', 'Optional: swap after 3 swings, then back to Command']);
  if (has('Divine Shield')) add(['LT', 'LT', 'D', 'spell_holy_divineintervention', 'Divine Shield', 'Fight going bad: shield, then heal or run']);
  else add(['LT', 'LT', 'D', 'spell_holy_restoration', 'Divine Protection', 'Fight going bad: bubble, then heal']);
  add(['LT', 'LT', 'R', 'spell_holy_layonhands', 'Lay on Hands', 'About to die: full heal, all your mana']);
  add(['LT', 'LT', 'X', 'spell_holy_flashheal', 'Flash of Light', 'Quick heal mid-fight']);
  add(['LT', 'LT', has('Flash of Light') ? 'Y' : 'X', 'spell_holy_holybolt', 'Holy Light', 'After a fight if under half']);
  const prep: Step[] = [];
  if (has('Retribution Aura')) prep.push(['LTRT', 'LTRT', 'D', 'spell_holy_auraoflight', 'Retribution Aura', 'Always on']);
  else if (has('Devotion Aura')) prep.push(['LTRT', 'LTRT', 'D', 'spell_holy_devotionaura', 'Devotion Aura', 'Always on']);
  if (has('Blessing of Might')) prep.push(['LTRT', 'LTRT', 'B', 'spell_holy_fistofjustice', 'Blessing of Might', 'On yourself, lasts 1 hour']);
  if (has('Blessing of Kings')) prep.push(['LTRT', 'LTRT', 'A', 'spell_magic_magearmor', 'Blessing of Kings', has('Blessing of Might') ? 'Or Kings: +10% to all your stats' : 'On yourself, lasts 1 hour']);
  return { steps, prep };
}

/** Two-hander ladder: Wowhead Forever item ids, DPS and icons; sources from Polestar's Forever guides. lvl = when you can
 *  get it: Ironforge Greathammer needs 9 but its quest is level 16 (audit #22; the quest's own minimum is unread). */
export interface Rung { id: number; name: string; icon: string; lvl: number; dps: number; from: string; skill?: string; quest?: number }
export const LADDER: Rung[] = [
  { id: 279895, name: 'Ironforge Greathammer', icon: 'inv_hammer_21', lvl: 16, dps: 15.97, from: 'Quest "Old Ironforge Incursion" · Hall of Thanes' },
  { id: 7230, name: "Smite's Mighty Hammer", icon: 'inv_hammer_09', lvl: 18, dps: 19.71, from: 'Deadmines' },
  { id: 6953, name: "Verigan's Fist", icon: 'inv_hammer_05', lvl: 20, dps: 25.63, from: 'Class quest · Polestar guides it', quest: 1806 },
  { id: 271766, name: 'Heavehammer', icon: 'inv_hammer_09', lvl: 24, dps: 27.73, from: 'Excavation Site: Wetlands quest' },
  { id: 274601, name: 'Harpoon of Command', icon: 'inv_spear_04', lvl: 35, dps: 35.74, from: "Polearm · Var'Taka, Drowned City", skill: 'Polearms' },
  { id: 6830, name: 'Bonebiter', icon: 'inv_axe_04', lvl: 40, dps: 38.82, from: 'Axe · "In the Name of the Light", Scarlet Monastery', skill: 'Two-Handed Axes' },
];

/** Paladin class quests OmaBook checks (Polestar's Forever paladin guides), with the level each opens at. One card at a
 *  time, so each must be able to read as done: the spell it gives (`spell`), the last quest of its chain (`ends`, which
 *  then replaces its own id), or its own id. 2998 is only where the human Tome of Divinity chain starts (Polestar: Brother Wilhelm, human; 2999 is the
 *  dwarf one). The chain ends are from Wowhead Classic (1788 human, 1785 dwarf, then 1790 / 1789 after them); Polestar
 *  doesn't mark which quest is last, and OmaBook only saves the six ids below, so knowing Redemption is the sure sign. */
export const CLASS_QUESTS: { id: number; name: string; lvl: number; icon: string; ends?: number[]; spell?: string[] }[] = [
  { id: 2998, name: 'The Tome of Divinity (Redemption), Goldshire', lvl: 12, icon: 'spell_holy_resurrection', ends: [1788, 1790, 1785, 1789], spell: ['Redemption'] },
  { id: 1806, name: "Verigan's Fist: The Tome of Valor, Ironforge", lvl: 20, icon: 'inv_hammer_05' },
  { id: 78093, name: 'Cloak of the Divine Storm (Ashenvale)', lvl: 22, icon: 'inv_misc_book_11' },
  { id: 1661, name: 'The Tome of Nobility (Warhorse)', lvl: 40, icon: 'ability_mount_charger', spell: ['Summon Warhorse', 'Summon Charger'] },
  { id: 8418, name: 'Holy Mightstone', lvl: 50, icon: 'inv_stone_16' },
  { id: 7647, name: 'Charger', lvl: 60, icon: 'ability_mount_charger', spell: ['Summon Charger'] },
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
  { id: 12218, name: 'Monster Omelet', icon: 'inv_misc_food_06', lvl: 35 },
  { id: 8950, name: 'Homemade Cherry Pie', icon: 'inv_misc_food_10', lvl: 45, v: true }, { id: 8952, name: 'Roasted Quail', icon: 'inv_misc_food_15', lvl: 45, v: true },
  { id: 13934, name: 'Mightfish Steak', icon: 'inv_misc_food_47', lvl: 45 }, { id: 13932, name: 'Poached Sunscale Salmon', icon: 'inv_misc_fish_19', lvl: 45 }, { id: 20452, name: 'Smoked Desert Dumplings', icon: 'inv_misc_food_64', lvl: 45 },
  // the cheese line (vendor). Listed last in each tier so bread stays the one to buy; no cheese icons ship, they never show
  { id: 2070, name: 'Darnassian Bleu', icon: 'inv_misc_book_09', lvl: 1, v: true }, { id: 414, name: 'Dalaran Sharp', icon: 'inv_misc_book_09', lvl: 5, v: true },
  { id: 422, name: 'Dwarven Mild', icon: 'inv_misc_book_09', lvl: 15, v: true }, { id: 1707, name: 'Stormwind Brie', icon: 'inv_misc_book_09', lvl: 25, v: true },
  { id: 3927, name: 'Fine Aged Cheddar', icon: 'inv_misc_book_09', lvl: 35, v: true }, { id: 8932, name: 'Alterac Swiss', icon: 'inv_misc_book_09', lvl: 45, v: true },
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
  ...Object.values(FIGHTS).flat().map(f => f[3]), ...Object.values(SPELLS).map(g => g.icon), ...CLASS_QUESTS.map(q => q.icon), 'spell_holy_devotionaura', 'spell_holy_fistofjustice', 'spell_holy_resurrection', 'classicon_paladin', 'inv_misc_book_09', 'inv_chest_chain_05',
])].sort();

// ------------------------------------------------------------------ what the phone draws

export interface Card { icon: string; t: string; d: string; go?: string; tone?: 'hot' | 'blue' | 'green'; tab?: 'talents' | 'gear' | 'fight'; /** a Cheap Upgrades item: the remote swaps in its real icon */ item?: number }
export interface Restock { icon: string; slot: string; t: string; d: string; price: string[] }
/** Icons for the spells the trainer only upgrades (Wowhead Forever). */
const RANK_ICONS: Record<string, string> = { 'Seal of Righteousness': 'ability_thunderbolt', 'Devotion Aura': 'spell_holy_devotionaura',
  'Holy Light': 'spell_holy_holybolt', 'Blessing of Might': 'spell_holy_fistofjustice', 'Hammer of Justice': 'spell_holy_sealofmight',
  'Redemption': 'spell_holy_resurrection', 'Seal of Command': 'ability_warrior_innerrage', 'Holy Strike': 'classicon_paladin' };
const iconOf = (n: string) => SPELLS[n]?.icon ?? RANK_ICONS[n] ?? 'inv_misc_book_09';
export interface TrainSpell { name: string; icon: string; what?: string; use?: string; skip?: string; pad?: string; lvl: number }
export interface BookView {
  /** The trainer's list now (null: nothing to train): spells you've never had, with their lines, and upgrades. */
  train: { fresh: TrainSpell[]; ups: { name: string; icon: string; rank: number }[]; cost: number } | null;
  /** Spells learned since the last reload: they glow on Fight until the next one. */
  fresh: string[];
  /** Fight steps for your bracket: only spells you know. */
  steps: [string, string, string, string, string, string][];
  /** Before a fight: aura and blessing. */
  prep: [string, string, string, string, string, string][];
  crusader: boolean;
  name: string; level: number; xpPct: number; spec: string; zone: string; at: number; /** gold carried, in copper */ money: number;
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
/** A save list, or [] when it's missing or not a list (a broken save must not break the page). */
const arr = <T>(v: T[] | null | undefined | unknown): T[] => Array.isArray(v) ? v as T[] : [];
/** Inventory slot numbers (what Cheap Upgrades saves) in plain words. */
export const SLOT_NAMES: Record<number, string> = { 1: 'head', 2: 'neck', 3: 'shoulder', 5: 'chest', 6: 'waist', 7: 'legs', 8: 'feet', 9: 'wrist',
  10: 'hands', 11: 'ring', 12: 'ring', 13: 'trinket', 14: 'trinket', 15: 'back', 16: 'main hand', 17: 'off hand', 18: 'ranged' };
const slotName = (v: unknown) => typeof v === 'number' ? SLOT_NAMES[v] ?? '' : typeof v === 'string' ? (/^\d+$/.test(v) ? SLOT_NAMES[+v] ?? '' : v) : '';

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
  // quest ids done: a { [id]: true } map; an empty Lua table arrives as [], and a list of ids is read too
  const doneSet = new Set<string>(Array.isArray(s.done) ? s.done.map(String) : s.done && typeof s.done === 'object' ? Object.entries(s.done).filter(e => e[1]).map(e => e[0]) : []);
  const isDone = (id: number) => doneSet.has(String(id));
  // spell names: spellbook folders (Auras, Blessings, Seals) are dropped before anything reads them
  const names = (v: unknown) => arr<unknown>(v).filter((x): x is string => typeof x === 'string' && x !== '' && !FOLDERS.has(x));
  const known = new Set(names(s.spells));
  const freshNames = names(s.fresh);

  // 1. talent point
  const unspent = Math.max(0, Math.floor(num(s.unspent)));
  const nt = unspent > 0 ? nextTalent(ranks, level) : null;
  if (unspent > 0) {
    const node = nt && TREE.find(t => t.name === nt.name);
    cards.push({ icon: node?.icon ?? 'classicon_paladin', t: unspent > 1 ? `Spend your ${unspent} talent points` : 'Spend your talent point', d: nt && node ? `${nt.name}, rank ${nt.rank} of ${node.max}` : 'Your leveling build is done: pick what you like', tone: 'hot', tab: 'talents', go: '›' });
  }
  // 1b. spells learned since the last reload: what each does, when to use it, its button (they glow on Fight too)
  for (const n of freshNames.slice(0, 4)) {
    const g = SPELLS[n];
    cards.push({ icon: iconOf(n), t: `New: ${n}`, d: g ? `${g.what}${g.use ? ' ' + g.use : g.skip ? ' Skip for now: ' + g.skip : ''}${g.pad ? ' · ' + g.pad : ''}` : 'In your spellbook.', tone: 'hot', tab: 'fight', go: '›' });
  }
  // 2. what to train: the trainer's list (Polestar's Forever data) split into spells you've never had and upgrades.
  // A first rank (0 or 1) of a spell you already know is never listed (Forever's Judgement: the trainer sells it under
  // another id), and the same name and rank only once.
  let train: BookView['train'] = null;
  const seenRank = new Set<string>();
  const list = arr<NonNullable<BookSave['train']>[number]>(s.train).filter(x => {
    if (!x || typeof x !== 'object' || typeof x.name !== 'string' || FOLDERS.has(x.name) || num(x.lvl) > level) return false;
    const r = num(x.rank), key = `${x.name}#${r}`;
    if (r <= 1 && known.has(x.name)) return false;
    if (seenRank.has(key)) return false;
    seenRank.add(key); return true;
  });
  if (list.length) {
    const fresh: TrainSpell[] = [], ups: { name: string; icon: string; rank: number }[] = [];
    let cost = 0;
    for (const x of list) {
      cost += Math.max(0, num(x.cost));
      const g = SPELLS[x.name];
      if (num(x.rank) >= 2 && known.has(x.name)) ups.push({ name: x.name, icon: iconOf(x.name), rank: num(x.rank) });
      else if (!fresh.some(f => f.name === x.name)) fresh.push({ name: x.name, icon: iconOf(x.name), what: g?.what, use: g?.use, skip: g?.skip, pad: g?.pad, lvl: num(x.lvl) });
    }
    train = { fresh, ups, cost };
  }
  // 3. a weapon skill the ladder will need soon
  const owned = s.weapon && typeof s.weapon === 'object' ? s.weapon : null;
  const myDps = num(owned?.dps);
  for (const r of LADDER) if (r.skill && level >= r.lvl - 3 && skills[r.skill] === undefined) {
    cards.push({ icon: r.icon, t: `Learn ${r.skill}${level >= r.lvl ? '' : ' soon'}`, d: `${r.name} at ${r.lvl} needs it · a weapon master teaches it` }); break;
  }
  // 4. a better weapon is open: the best rung at your level that beats what you hold
  let up: Rung | null = null;
  for (const r of LADDER) if (r.lvl <= level && r.dps > myDps + 0.5 && owned?.id !== r.id && (!r.skill || skills[r.skill] !== undefined || level < r.lvl)) up = r;
  if (up && !(up.quest && isDone(up.quest))) cards.push({ icon: up.icon, t: `${up.name} is waiting`, d: `${up.from} · ${up.dps.toFixed(1)} DPS`, tone: 'blue', tab: 'gear', go: '›' });
  // 5. a class quest is open (one at a time; Verigan's Fist is already the weapon card above)
  // a quest reads as done by the spell it gives, the end of its chain (then its own id, only the start, doesn't count),
  // or else its own id: a never-done id must not block the cards after it
  const questDone = (q: typeof CLASS_QUESTS[number]) => (q.spell ?? []).some(n => known.has(n)) || (q.ends ? q.ends.some(isDone) : isDone(q.id));
  const cq = CLASS_QUESTS.find(q => level >= q.lvl && !questDone(q) && !(up && up.quest === q.id));
  if (cq) cards.push({ icon: cq.icon, t: `Class quest: ${cq.name}`, d: 'Open it in Polestar' });
  // 6. Cheap Upgrades, only the big ones (+60% or more): one row per item name (its cheapest), one card per slot.
  // A one-hander still shows even though the ladder is two-handers: Cheap Upgrades judged it better than what you hold.
  const cuRows: NonNullable<NonNullable<BookSave['cu']>['list']> = [];
  for (const u of arr<NonNullable<NonNullable<BookSave['cu']>['list']>[number]>(s.cu?.list)) {
    if (!u || typeof u !== 'object') continue;
    const same = typeof u.name === 'string' ? cuRows.findIndex(r => r.name === u.name) : -1;
    if (same < 0) cuRows.push(u);
    else if (num(u.price, Infinity) < num(cuRows[same].price, Infinity)) cuRows[same] = { ...cuRows[same], price: u.price };
  }
  const cardSlots = new Set<string>();
  for (const u of cuRows.filter(u => num(u.pct) >= 60)) {
    const sl = slotName(u.slot), key = sl.toLowerCase() || `#${cardSlots.size}`;
    if (cardSlots.has(key)) continue;
    if (cardSlots.size >= 2) break;
    cardSlots.add(key);
    cards.push({ icon: 'inv_chest_chain_05', t: `Upgrade: ${String(u.name ?? 'an item')}`, d: `Cheap Upgrades: ${sl ? sl.toLowerCase() + ' ' : ''}+${Math.round(num(u.pct))}%${u.price ? ` · AH ${coin(num(u.price))}` : ''}`, tone: 'green', go: `+${Math.round(num(u.pct))}%`, ...(num(u.id) > 0 ? { item: num(u.id) } : {}) });
  }

  // Restock: the best of each for your level, only when low
  const restock: Restock[] = [], fine: string[] = [];
  // anyUsable: "you have" counts everything of this kind you can use at your level, not only the tier to buy (food)
  const stock = (slot: string, list: Ware[], target: number, low: number, priceOf: (w: Ware) => string[], why: (w: Ware) => string, pick?: Ware | null, anyUsable = false) => {
    const b = pick ?? best(list, level); if (!b) return;
    const have = carried(bags, list, b.lvl);
    if (have.n >= low) { fine.push(`${have.n} ${have.first!.name}`); return; }
    const lower = have.n === 0 ? lowerCarried(bags, list, b.lvl) : null;
    const n = anyUsable ? list.reduce((t, w) => t + (w.lvl <= level ? bags[w.id] ?? 0 : 0), 0) : have.n;
    restock.push({ icon: b.icon, slot: lower ? `${slot} · upgrade` : `${slot} · you have ${n}`, t: `${b.name} ×${target}`, d: lower ? `You carry ${lower.name}. ${why(b)}` : why(b), price: priceOf(b) });
  };
  const ah = (w: Ware, n: number) => { const p = price(w.id); return p ? [`AH ${coin(p)}`, `${coin(p * n)} total`] : ['AH']; };
  stock('Food', FOOD, 10, 5, () => ['vendor'], w => `${FOOD_HP[w.lvl]} health while you sit`, null, true);
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
  const br = level < 20 ? '1-20' : level < 40 ? '20-40' : '40+';
  const rot = rotation(known, ranks);
  const steps = rot.steps;
  return {
    train, fresh: freshNames, steps, prep: rot.prep, crusader: known.has('Seal of the Crusader'),
    name: String(s.name ?? 'Paladin'), level, xpPct: xpMax > 0 ? Math.round(num(s.xp) / xpMax * 100) : 0,
    spec: spec && spec[1] > 0 ? spec[0] : '', zone: typeof s.zone === 'string' ? s.zone : '', at: num(s.at), money: Math.max(0, Math.floor(num(s.money))),
    cards, restock, fine: fine.length ? `All stocked: ${fine.join(', ')}.` : '',
    ranks, next: nt?.name ?? nextTalent(ranks, level + 1)?.name ?? null,
    ladder, forLevel, gearNote, bracket: level < 20 ? '1-20' : level < 40 ? '20-40' : '40+',
    cu: {
      rich: s.cu?.rich === true, max: num(s.cu?.max) > 0 ? num(s.cu?.max) : null,
      list: cuRows.filter(u => Number.isInteger(u.id) && num(u.id) > 0 && typeof u.name === 'string').slice(0, 10)
        .map(u => { const sl = slotName(u.slot); return { id: num(u.id), name: String(u.name), slot: typeof u.slot === 'string' && !/^\d+$/.test(u.slot) ? sl : sl.charAt(0).toUpperCase() + sl.slice(1), price: Math.max(0, num(u.price)), pct: Math.round(num(u.pct)) }; }),
    },
  };
}

// The Paladin Book on the phone remote (omashu mockup sheet 18 v5, approved 2026-11-26): what Bunji needs right now,
// how to fight, the talent tree and the gear ladder. Pure: it takes the OmaBook add-on's save (as of the last /reload or
// logout, read by Couch Mode's GET /book with aux's auction prices) and returns what the phone draws. Nothing is live.
//
// 2026-11-27: replaced for the new Bunji, an Undead (Horde) paladin on the PvP ruleset (Joshua: "Replace the book
// entirely"). Sources: reports/Undead paladin world PvP leveling.md (Icy Veins, Mobalytics, Warcraft Tavern, Skill
// Capped), Polestar's Horde guides on the laptop (quest ids), Wowhead Forever (weapon ids, DPS, icons), the talent tree
// read from the game (tree.json). Buttons are OmaPad's paladin v4 map (mockup omashu/pad/23).
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

/** The levelling order for an Undead Ret paladin questing alone on a PvP realm (reports/Forever paladin talent builds.md,
 *  2026-11-27; Joshua: "whatever gets me leveled fastest and is strongest"). The six guides' shared Ret core, with
 *  Deflection (parry) first, Repentance at 30 and hit (Precision) by 48; Guardian's Favor at 59-60 for world PvP.
 *  [talent, first level, ranks], one point a level from 10. Every tier gate checked against the game's tree (tree.json):
 *  Seal of Command at 20 with 10 Ret points, Repentance at 30 with 20, Unsealed Wrath at 40 with 30. */
export const PATH: [string, number, number][] = [['Deflection', 10, 5], ['Sanctified Judgement', 15, 3], ['Improved Judgement', 18, 2], ['Seal of Command', 20, 1], ['Pursuit of Justice', 21, 2], ['Conviction', 23, 2], ['Sacred Arbiter', 25, 1], ['Two-Handed Weapon Specialization', 26, 3], ['Conviction', 29, 1], ['Repentance', 30, 1], ['Vengeance', 31, 3], ['Vindication', 34, 1], ['Champion of the Light', 35, 5], ['Unsealed Wrath', 40, 1], ['Divine Intellect', 41, 5], ['Precision', 46, 3], ['Divine Strength', 49, 5], ['Improved Seals', 54, 5], ["Guardian's Favor", 59, 2]];

/** Each point of the path in order: the level it is taken at, and the rank it brings that talent to. */
const POINTS: { name: string; lvl: number; rank: number }[] = (() => {
  const out: { name: string; lvl: number; rank: number }[] = [], got: Record<string, number> = {};
  for (const [n, l, r] of PATH) for (let i = 0; i < r; i++) { got[n] = (got[n] ?? 0) + 1; out.push({ name: n, lvl: l + i, rank: got[n] }); }
  return out.sort((a, b) => a.lvl - b.lvl);
})();

/** Talents that change the pad (OmaPad v4 map), for the talents tab. */
export const TALENT_PAD: Record<string, string> = { 'Seal of Command': 'Takes Righteousness\'s spot: RT + Y', 'Repentance': 'New on your pad: LT + B', 'Unsealed Wrath': 'Second Seal arrives: RT + D-right' };

export const DESC: Record<string, string> = {
  'Deflection': '+1% parry per rank.', 'Conviction': 'More critical strikes with all spells and attacks.',
  'Improved Judgement': 'Judgement cooldown 1 sec shorter per rank: 8 sec at 2/2.', 'Pursuit of Justice': 'Run and ride 8% faster per rank: 15% at 2/2. Your best way out of a fight.',
  'Seal of Command': 'Your main Seal from here: extra Holy hits worth 70% of your weapon. Best with a slow two-hander.',
  'Sanctified Judgement': "Judgement gives back 20% of the Seal's mana per rank: 60% at 3/3. Your biggest mana fix before 40.",
  'Two-Handed Weapon Specialization': 'More Physical and Holy damage with a two-hander, less threat.',
  'Sacred Arbiter': 'Holy Strike +20%, and it refreshes Judgement effects on the target (Crusader, Justice, Light, Wisdom).', 'Vengeance': 'After a critical hit, +1% damage per rank for 30 s, stacks to 5 (up to +15% at 3/3).',
  'Repentance': 'Puts a mob to sleep for up to 6 sec; any damage wakes it. Seal of Command\'s Judgement hits it twice as hard.', 'Benediction': 'Instant spells (Judgement, Holy Strike, Seals) cost less mana. Less drinking.',
  'Champion of the Light': 'Intellect becomes spell damage; Hammer of Wrath casts faster.',
  'Unsealed Wrath': 'Hits store copies of your Seal (up to 3, 15 sec). Hit with a different Seal and each copy gets its normal chance to go off. Optional: costs a second Seal.', 'Divine Strength': '+2% Strength per rank.',
  'Reverence': '30% of mana regen keeps going while you cast.', 'Improved Seals': '+3% Seal and Judgement damage per rank.',
  'Divine Intellect': '+2% Intellect per rank. Opens Precision, and more Intellect feeds Champion of the Light.', 'Precision': '+1% hit per rank: swings, Judgement and spells. Fewer misses in a gank.',
  'Vindication': "Your hits can lower the target's attack power and raise yours, up to 3%.",
  'Holy Conduit': 'Consecration, Holy Wrath and Exorcism cost 40% less mana.',
  "Guardian's Favor": 'Blessing of Freedom lasts 6 sec longer and Blessing of Protection comes back 2 min sooner at 2/2.',
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
  'Hammer of Justice': { icon: 'spell_holy_sealofmight', what: 'Stuns a mob for 3 sec. 1 min cooldown, 10 yd. The game gives you rank 1 at 8.', use: 'Stop a caster or a runner, or hold a 2nd mob. Later, with Seal of Command, Judge the stunned mob for double damage.', pad: 'RT + D-up' },
  'Divine Protection': { icon: 'spell_holy_restoration', what: "You take no damage for a few secs, but you can't attack.", use: "Only when a fight's going bad. Heal up or run.", pad: 'LT + A' },
  'Holy Strike': { icon: 'classicon_paladin', what: 'Quick hit: some weapon damage plus Holy damage. 10 sec cooldown.', use: 'Hit it whenever it lights up.', pad: 'RT + B' },
  'Seal of the Crusader': { icon: 'spell_holy_holysmite', what: '+35 attack power, you swing 40% faster but each hit is weaker, 30 sec. Its Judgement: the mob takes more Holy damage for 40 sec.', skip: 'Bosses and elites only. Guides disagree on normal mobs.', pad: 'set 2, LT + RT + B' },
  'Parry': { icon: 'ability_parry', what: 'Lets you parry some hits. Nothing to press.', use: 'Always on once you have it.' },
  'Lay on Hands': { icon: 'spell_holy_layonhands', what: 'Heals to full but uses all your mana.', use: "Panic button when you're about to die.", pad: 'LT + D-right' },
  'Blessing of Protection': { icon: 'spell_holy_sealofprotection', what: "Stops all physical damage on someone for a bit, but they can't attack.", use: 'Save a buddy in a group who has aggro.', pad: 'set 2, LT + Y' },
  'Seal of Fury': { icon: 'spell_holy_retributionaura', what: 'A tank seal: Judging it makes the mob attack you.', skip: "Only for tanking in groups. Solo you don't need it.", pad: 'set 2, LT + RT + Y' },
  'Blessing of Wisdom': { icon: 'spell_holy_sealofwisdom', what: 'Gives you mana back over time for an hour.', use: 'Swap Might for it if you keep running out of mana.', pad: 'set 2, LT + X' },
  'Retribution Aura': { icon: 'spell_holy_auraoflight', what: 'Mobs that hit you take Holy damage back.', use: 'Your aura from here: it takes Devotion Aura\'s button.', pad: 'LT + RT + B' },
  'Righteous Fury': { icon: 'spell_holy_sealoffury', what: 'Makes mobs much more likely to attack you.', skip: 'Tanking only. Leave it off solo.', pad: 'set 2, LT + RT + X' },
  'Blessing of Freedom': { icon: 'spell_holy_sealofvalor', what: "Can't be slowed or rooted for 10 secs.", use: 'When something slows you or roots you.', pad: 'LT + D-left' },
  'Exorcism': { icon: 'spell_holy_excorcism_02', what: 'Holy hit on undead or demons. 30 yd, 15 sec cooldown.', use: 'Open on undead and demons.', pad: 'RT + A' },
  'Seal of Command': { icon: 'ability_warrior_innerrage', what: 'Your main Seal: hits get a chance for extra Holy damage. Lasts 30 sec.', use: 'Keep it on. Buy the new rank at 30, 40, 50 and 60.', pad: 'RT + Y' },
  'Flash of Light': { icon: 'spell_holy_flashheal', what: 'Small, fast, cheap heal.', use: 'Top up between fights, or mid-fight when Holy Light is too slow.', pad: 'LT + X' },
  'Blessing of Kings': { icon: 'spell_magic_magearmor', what: '+10% to all your stats for an hour.', use: 'Your blessing from 20: it takes Might\'s button.', pad: 'D-up' },
  'Consecration': { icon: 'spell_holy_innerfire', what: 'Holy fire on the ground around you.', use: 'When 3 or more mobs are on you.', pad: 'RT + D-left' },
  'Concentration Aura': { icon: 'spell_holy_mindsooth', what: 'Helps you finish casts while getting hit.', skip: "For healers. You're better with Devotion or Retribution.", pad: 'set 2, RT + D-left' },
  'Seal of Justice': { icon: 'spell_holy_sealofwrath', what: "Your hits get a chance to stun for 2 sec. Judge it and the mob can't run away.", use: 'On mobs that run at low health. Not on your pad: cast it from the spellbook.' },
  'Shadow Resistance Aura': { icon: 'spell_shadow_sealofkings', what: '+30 Shadow resistance for the group.', skip: 'Only against shadow casters or in dungeons that need it.', pad: 'set 2, RT + D-up' },
  'Seal of Light': { icon: 'spell_holy_healingaura', what: 'Judge it and hits on the mob can heal you.', skip: 'Command hits much harder. Try it only if you keep running low on health.' },
  'Divine Intervention': { icon: 'spell_nature_timestop', what: 'Saves a party member: mobs stop attacking them, but they can\'t act for 3 min. Costs your life.', skip: 'Group wipes only.', pad: 'set 2, D-left' },
  'Divine Shield': { icon: 'spell_holy_divineintervention', what: 'Immune to all damage for 10 sec, but you deal half damage. 5 min cooldown.', use: 'Emergency, then heal or run. Takes Divine Protection\'s button.', pad: 'LT + A' },
  'Seal of Wisdom': { icon: 'spell_holy_righteousnessaura', what: 'Judge it and hits on the mob can give you mana.', skip: 'Command first. Try it if mana is your problem.' },
  'Plate Mail': { icon: 'inv_chest_plate01', what: 'You can wear plate armor.', use: 'Buy it at 40. Your armor jumps a lot.' },
  'Cleanse': { icon: 'spell_holy_renew', what: 'Removes a poison, a disease and a magic effect.', use: 'Replaces Purify.', pad: 'set 2, LT + B' },
  'Hammer of Wrath': { icon: 'ability_thunderclap', what: 'Big Holy hit, only on mobs under 20% health.', use: 'Finish mobs off.', pad: 'RT + D-down' },
  'Holy Wrath': { icon: 'spell_holy_excorcism', what: 'Holy blast around you that hits and stuns undead and demons.', skip: 'Undead and demon packs only.', pad: 'In your spellbook' },
  'Turn Undead': { icon: 'spell_holy_turnundead', what: 'Makes one undead run away for a bit.', skip: 'Rarely needed solo.', pad: 'set 2, LT + A' },
  // the game gives Purify at 8 and "A Lesson in Divinity" gives Redemption: neither is sold, so they only show as New
  // the Undead racials (Icy Veins race guide, after the 27 Oct tuning)
  'Will of the Forsaken': { icon: 'inv_misc_book_09', what: 'Breaks Charm, Fear and Sleep. 2 min cooldown. No longer makes you immune.', use: 'Press it after the fear lands, not before.', pad: 'LT + D-down' },
  'Cannibalize': { icon: 'inv_misc_book_09', what: 'Eat a humanoid or undead corpse within 5 yd: 35% health and mana over 10 sec. Moving or a hit stops it. 2 min cooldown.', use: 'Between fights instead of eating and drinking.', pad: 'LT + D-up' },
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
  // OmaPad v4 (2026-11-27): RT is the whole attack, LT gets you out of trouble, the D-pad alone is upkeep
  add(['RT', 'RT', 'Y', 'ability_warrior_innerrage', 'Seal of Command', 'Keep it on. Lasts 30 sec']);
  add(['RT', 'RT', 'Y', 'ability_thunderbolt', 'Seal of Righteousness', 'Keep it on. Lasts 30 sec'], !command);
  add(['RT', 'RT', 'A', 'spell_holy_excorcism_02', 'Exorcism', 'Open with it on undead and demons, from 30 yd']);
  // with Seal of Command the stun sets up a double Judgement, so it comes first; before that it's only for trouble
  const hoj: Step = ['RT', 'RT', 'U', 'spell_holy_sealofmight', 'Hammer of Justice', command ? 'Stun, then Judgement: twice the damage' : 'Stop a caster or a runner, or hold a 2nd mob'];
  if (command) add(hoj);
  add(['RT', 'RT', 'X', 'spell_holy_righteousfury', 'Judgement', 'Every time it lights up. Your Seal stays']);
  add(['RT', 'RT', 'B', 'classicon_paladin', 'Holy Strike', 'Every time it lights up']);
  if (!command) add(hoj);
  if (command && (ranks['Unsealed Wrath'] ?? 0) > 0) add(['RT', 'RT', 'R', 'ability_thunderbolt', 'Seal of Righteousness', '3 swings with Command, swap here, 1 swing, back']);
  add(['RT', 'RT', 'D', 'ability_thunderclap', 'Hammer of Wrath', 'Mob under 20% health']);
  add(['LT', 'LT', 'B', 'spell_holy_prayerofhealing', 'Repentance', 'Humanoids: sleep, then Judgement']);
  add(['RT', 'RT', 'L', 'spell_holy_innerfire', 'Consecration', 'Only with 3+ mobs on you']);
  if (has('Divine Shield')) add(['LT', 'LT', 'A', 'spell_holy_divineintervention', 'Divine Shield', 'Fight going bad: shield, then heal or run']);
  else add(['LT', 'LT', 'A', 'spell_holy_restoration', 'Divine Protection', 'Fight going bad: bubble, then heal']);
  add(['LT', 'LT', 'D', 'inv_misc_book_09', 'Will of the Forsaken', 'Feared or charmed: press it after it lands']);
  add(['LT', 'LT', 'R', 'spell_holy_layonhands', 'Lay on Hands', 'About to die: full heal, all your mana']);
  add(['LT', 'LT', 'X', 'spell_holy_flashheal', 'Flash of Light', 'Quick heal mid-fight']);
  add(['LT', 'LT', has('Flash of Light') ? 'Y' : 'X', 'spell_holy_holybolt', 'Holy Light', 'After a fight if under half']);
  add(['LT', 'LT', 'U', 'inv_misc_book_09', 'Cannibalize', 'After a fight, on a humanoid or undead corpse']);
  const prep: Step[] = [];
  if (has('Retribution Aura')) prep.push(['LTRT', 'LTRT', 'B', 'spell_holy_auraoflight', 'Retribution Aura', 'Always on']);
  else if (has('Devotion Aura')) prep.push(['LTRT', 'LTRT', 'B', 'spell_holy_devotionaura', 'Devotion Aura', 'Always on']);
  if (has('Blessing of Kings')) prep.push(['D-up', 'none', 'U', 'spell_magic_magearmor', 'Blessing of Kings', 'On yourself, lasts 1 hour']);
  else if (has('Blessing of Might')) prep.push(['D-up', 'none', 'U', 'spell_holy_fistofjustice', 'Blessing of Might', 'On yourself, lasts 1 hour']);
  return { steps, prep };
}

/** Horde two-hander ladder (timesaver.gg's Forever paladin weapons and the guide; ids, DPS and icons from Wowhead
 *  Forever, 2026-11-27). lvl = when you can get it (quest rewards have no level on the item). The Undead starts with
 *  Maces and Two-Handed Maces; swords, axes and polearms need a weapon master. The level 10 Empyrean Greatsword is
 *  left out: its quest is on Zephras Isle, reported Skyborne-only. */
export interface Rung { id: number; name: string; icon: string; lvl: number; dps: number; from: string; skill?: string; quest?: number }
export const LADDER: Rung[] = [
  { id: 15424, name: 'Axe of Orgrimmar', icon: 'inv_axe_04', lvl: 15, dps: 16.06, from: 'Quest in Orgrimmar', skill: 'Two-Handed Axes' },
  { id: 270018, name: 'Hammerbone', icon: 'inv_hammer_15', lvl: 20, dps: 20.44, from: 'Wailing Caverns quest reward' },
  { id: 268484, name: 'Moonsilver Blade', icon: 'inv_sword_25', lvl: 20, dps: 21.03, from: 'Class quest "The Moonsilver Blade" · Polestar guides it', skill: 'Two-Handed Swords', quest: 95126 },
  { id: 267369, name: 'Wolfsbane', icon: 'inv_sword_25', lvl: 25, dps: 25.59, from: 'Kill Old Fire-Eye with the Moonsilver Blade · Silverpine', skill: 'Two-Handed Swords', quest: 95140 },
  { id: 6687, name: 'Corpsemaker', icon: 'inv_weapon_halbard_01', lvl: 29, dps: 28.95, from: 'Polearm · Razorfen Kraul', skill: 'Polearms' },
  { id: 274601, name: 'Harpoon of Command', icon: 'inv_spear_04', lvl: 35, dps: 35.74, from: 'Polearm · The Drowned City', skill: 'Polearms' },
  { id: 7723, name: "Mograine's Might", icon: 'inv_mace_13', lvl: 39, dps: 38.82, from: 'Scarlet Monastery Cathedral' },
  { id: 9413, name: 'The Rockpounder', icon: 'inv_hammer_12', lvl: 44, dps: 42.70, from: 'Uldaman' },
  { id: 2915, name: 'Taran Icebreaker', icon: 'inv_hammer_02', lvl: 47, dps: 49.74, from: 'Auction house (bind on equip)' },
  { id: 280056, name: 'Flameslash Crescent', icon: 'inv_weapon_halberd_10', lvl: 54, dps: 50.56, from: 'Polearm · Blackmaw Hold', skill: 'Polearms' },
  { id: 279260, name: "Forest Defender's Axe", icon: 'inv_axe_2h_raidhyjalc60_d_01', lvl: 60, dps: 61.52, from: 'Crafted', skill: 'Two-Handed Axes' },
];

/** Forsaken paladin class quests (Polestar's Horde guides "Tyr's Watch and Redemption" and "Moonsilver Blade and
 *  Wolfsbane", quest ids from its quest data, 2026-11-27). Each reads as done by the spell it gives, the last quest of its
 *  chain (`ends`), or its own id; OmaBook saves exactly these ids. The Moonsilver Blade and Wolfsbane are the weapon
 *  ladder's cards. The level 60 Charger's middle steps are unconfirmed (the guide's check list). */
export const CLASS_QUESTS: { id: number; name: string; lvl: number; icon: string; ends?: number[]; spell?: string[] }[] = [
  { id: 99152, name: 'Bandarion Keep: the Forsaken paladins (a mace, a shield)', lvl: 8, icon: 'classicon_paladin', ends: [95803] },
  { id: 94427, name: 'A Lesson in Divinity (Redemption): Danitha Morr, Bandarion Keep', lvl: 12, icon: 'spell_holy_resurrection', ends: [94441], spell: ['Redemption'] },
  { id: 94971, name: "A Paladin's Steed (Warhorse): Garen Largo, Undercity", lvl: 40, icon: 'ability_mount_charger', spell: ['Summon Warhorse', 'Summon Charger'] },
  { id: 97185, name: 'Justice and Retribution (Charger): Danitha Morr', lvl: 60, icon: 'ability_mount_charger', spell: ['Summon Charger'] },
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

/** Quests worth a detour (the WoW home's Now page, sheet 27), from reports/Polestar route vs best quests 2026-11-27.md
 *  in the omashu repo: its two phone short lists (1-30 and 30-60) and the two-handers that beat Polestar's route. lvl =
 *  the quest's level, min = the lowest level that can take it. dps for a two-hander reward, stats for armor, xp for a
 *  quest worth only its XP. Icons: the reward's own where known, else a stand-in of the same kind. The Lumina chain
 *  (95126, 95140) is left out on purpose: Polestar's class guide does it. */
export interface DetourQuest { id: number; name: string; lvl: number; min: number; zone: string; giver: string; reward: string; icon: string; note: string; dps?: number; stats?: string; xp?: number }
export const DETOURS: DetourQuest[] = [
  // 1-30
  { id: 99156, name: 'Rear Guard Patrol', lvl: 13, min: 6, zone: 'Tirisfal Glades', giver: 'Deathguard Linnea, Deathknell', reward: "Riptear's Cleaver", dps: 8.9, icon: 'inv_axe_10', note: "Polestar's route stops one quest short. It also opens the Forsaken Greataxe at 15." },
  { id: 99, name: "Arugal's Folly", lvl: 15, min: 9, zone: 'Silverpine Forest', giver: 'Dalar Dawnweaver', reward: 'Logsplitter', dps: 10.8, icon: 'inv_axe_10', note: "After Arugal's Folly (424), same giver as the route's 423." },
  { id: 5730, name: 'Hidden Enemies', lvl: 16, min: 9, zone: 'Orgrimmar', giver: 'Neeru Fireblade', reward: 'Axe of Orgrimmar', dps: 16.1, icon: 'inv_axe_04', note: 'Runs through Ragefire Chasm.' },
  { id: 5725, name: 'The Power to Destroy...', lvl: 16, min: 9, zone: 'Undercity', giver: 'Varimathras', reward: 'Gargoyle Leggings', stats: 'mail legs', icon: 'inv_chest_chain_05', note: 'Same Ragefire Chasm run. 2950 XP.' },
  { id: 92422, name: "The Wrath of Rath'mael", lvl: 22, min: 15, zone: 'Tirisfal Glades', giver: 'Deathguard Kristof', reward: 'Forsaken Greataxe', dps: 20.5, icon: 'inv_axe_10', note: 'Runs through the Ruins of Lordaeron.' },
  { id: 914, name: 'Leaders of the Fang', lvl: 22, min: 10, zone: 'Thunder Bluff', giver: 'Nara Wildmane', reward: 'Hammerbone', dps: 20.4, icon: 'inv_hammer_15', note: 'Runs through Wailing Caverns, where the route already sends you.' },
  { id: 95216, name: 'The New Plague', lvl: 22, min: 15, zone: 'Undercity', giver: 'Theodore Griffs', reward: '5450 XP', xp: 5450, icon: 'inv_misc_book_09', note: "Finishes the route's A Recipe For Death, in the Ruins of Lordaeron." },
  { id: 442, name: 'Assault on Fenris Isle', lvl: 24, min: 10, zone: 'Silverpine Forest', giver: 'High Executor Hadrec', reward: 'Gnollhide Pants', stats: 'Str 6 Sta 4', icon: 'inv_chest_chain_05', note: 'The Rot Hide chain comes first: four short quests.' },
  { id: 1013, name: 'The Book of Ur', lvl: 26, min: 16, zone: 'Undercity', giver: "Keeper Bel'dugur", reward: '5600 XP', xp: 5600, icon: 'inv_misc_book_09', note: 'Shadowfang Keep, which the route already runs.' },
  { id: 6565, name: 'Allegiance to the Old Gods', lvl: 26, min: 17, zone: 'Ashenvale', giver: "Je'neu Sancrea", reward: 'Band of the Fist', xp: 6300, icon: 'inv_misc_book_09', note: 'Blackfathom Deeps, which the route already runs. 6300 XP.' },
  { id: 6571, name: 'Warsong Supplies', lvl: 27, min: 22, zone: 'Ashenvale', giver: 'Locke Okarr', reward: 'Warsong Gauntlets', stats: 'Str 10 Sta 3', icon: 'inv_chest_chain_05', note: 'Best hands before 30. Nothing to do first.' },
  { id: 1089, name: 'The Den', lvl: 29, min: 20, zone: 'Stonetalon Mountains', giver: 'Braelyn Firehand', reward: 'Juggernaut Leggings', stats: 'Str 10', icon: 'inv_chest_chain_05', note: "After 1088, same giver as the route's 1087." },
  // 30-60
  { id: 98823, name: 'Earthen Echo', lvl: 31, min: 24, zone: 'Thunder Bluff', giver: 'Bashana Runetotem', reward: 'Heavehammer', dps: 27.7, icon: 'inv_hammer_15', note: 'Starts from an item in the Excavation Site.' },
  { id: 79242, name: 'No Honor Among Thieves', lvl: 40, min: 30, zone: 'Stranglethorn Vale', giver: 'Tokal', reward: "Soldier's Visor", stats: 'plate head Str 14 Sta 10', icon: 'inv_chest_plate01', note: "A short chain in the route's zone." },
  { id: 1383, name: 'Nothing But The Truth', lvl: 42, min: 37, zone: 'Duskwood', giver: 'Apothecary Faustin', reward: 'Cragwood Maul', dps: 37.1, icon: 'inv_hammer_15', note: "Finishes the route's 1372. Items from Swamp of Sorrows and Desolace." },
  { id: 93128, name: 'Khan Jehn', lvl: 42, min: 35, zone: "Shen'dralas", giver: 'Nerlokh', reward: 'Abandoned Ferocity', dps: 37.2, icon: 'inv_axe_10', note: "The Gelkis chain (14 quests). Or Magram's from Orgrul, not both." },
  { id: 94968, name: 'Eye of Mugg', lvl: 45, min: 40, zone: 'Riverglades', giver: "Krom'rosh", reward: 'Bigger Rock on Bigger Stick', dps: 41.2, icon: 'inv_hammer_15', note: "Krol'dok Stronghold. 11500 XP." },
  { id: 95433, name: 'Death to the Executioner', lvl: 46, min: 36, zone: 'Riverglades', giver: "Crag'rog", reward: 'Thud Hammer', dps: 35.6, icon: 'inv_hammer_15', note: "Polestar's route stops one quest short. One elite to kill." },
  { id: 793, name: 'Broken Alliances', lvl: 50, min: 40, zone: 'Badlands', giver: 'Gorn', reward: 'Warforged Chestplate', stats: 'plate chest Str 24', icon: 'inv_chest_plate01', note: 'Same trip as the Blackrock Depths quests.' },
  { id: 7862, name: 'Job Opening: Guard Captain of Revantusk Village', lvl: 51, min: 46, zone: 'The Hinterlands', giver: 'the board at Revantusk', reward: 'Rune of the Guard Captain', stats: 'trinket, hit and AP', icon: 'inv_misc_book_09', note: '80 Vilebranch kills, in the zone the route takes you at 49.' },
  { id: 91685, name: 'Ley of the Land', lvl: 54, min: 45, zone: 'Azshara', giver: 'Izvi Gildfizz', reward: "Honor Guard's Plate", stats: 'plate chest Str 18 Sta 9', icon: 'inv_chest_plate01', note: "Finishes the route's Blue Gold." },
  { id: 4134, name: 'Lost Thunderbrew Recipe', lvl: 55, min: 50, zone: 'Badlands', giver: 'Shadowmage Vivian Lagrave', reward: 'Limb Cleaver', dps: 42.7, icon: 'inv_axe_10', note: 'Blackrock Depths. 11300 XP.' },
  { id: 86814, name: 'Blackmaw Counter-Offensive', lvl: 55, min: 47, zone: 'Felwood', giver: 'Gorn One Eye', reward: "Cliff Walker's Cinch", stats: 'plate waist Str 17 Sta 9', icon: 'inv_chest_plate01', note: 'Kill Prince Halanox, in the zone the route takes you at 53.' },
  { id: 7877, name: "The Treasure of the Shen'dralar", lvl: 60, min: 56, zone: 'Dire Maul', giver: "Shen'dralar Ancient", reward: 'Bonecrusher', dps: 53.8, icon: 'inv_hammer_15', note: 'Dire Maul.' },
  { id: 5466, name: 'The Lich, Ras Frostwhisper', lvl: 60, min: 57, zone: 'Western Plaguelands', giver: 'Magistrate Marduke', reward: 'Warblade of Caer Darrow', dps: 57.4, icon: 'inv_sword_25', note: 'A Scholomance chain.' },
];
/** The Now page's detours for this level (sheet 27): of the two-handers that beat what he holds and are within reach
 *  (he can take it within 3 levels, it is at most 10 levels off), the nearest and the biggest; only when that makes
 *  fewer than two, the nearest armor or XP quest he can take now. Never a quest done or outgrown (2 levels past it). */
export interface Detour extends DetourQuest { /** times his weapon's DPS (two-handers, when his DPS is known) */ gain?: number; /** in his zone now */ here: boolean }
export function detours(level: number, myDps: number, done: Set<number>, zone: string): Detour[] {
  const open = DETOURS.filter(d => !done.has(d.id) && d.lvl + 2 >= level);
  const weapons = open.filter(d => d.dps && d.min <= level + 3 && d.lvl <= level + 10 && d.dps > myDps + 0.5).sort((a, b) => a.lvl - b.lvl || a.id - b.id);
  const pick: DetourQuest[] = [];
  if (weapons.length) pick.push(weapons[0]);
  const big = [...weapons].sort((a, b) => b.dps! - a.dps! || a.lvl - b.lvl)[0];
  if (big && !pick.includes(big)) pick.push(big);
  for (const d of open.filter(d => !d.dps && d.min <= level).sort((a, b) => a.lvl - b.lvl)) { if (pick.length >= 2) break; pick.push(d); }
  return pick.map(d => ({ ...d, ...(d.dps && myDps > 0 ? { gain: Math.round(d.dps / myDps * 10) / 10 } : {}), here: !!zone && d.zone === zone }));
}
/** The two profession switches (DECISIONS 2026-11-27), as errands once due, until the new one is learned. */
export interface Swap { lvl: number; from: string; to: string; icon: string }
export function swaps(level: number, skills: Record<string, number>): Swap[] {
  const out: Swap[] = [];
  if (level >= 50 && skills['Engineering'] === undefined) out.push({ lvl: 50, from: 'Skinning', to: 'Engineering', icon: 'trade_engineering' });
  if (level >= 60 && skills['Alchemy'] === undefined) out.push({ lvl: 60, from: 'Herbalism', to: 'Alchemy', icon: 'trade_alchemy' });
  return out;
}
/** The item subclass OmaBook saves for the weapon, as a plain word. */
export function weaponWord(sub: unknown): string {
  return ({ 0: 'axe', 1: 'axe', 4: 'mace', 5: 'mace', 6: 'polearm', 7: 'sword', 8: 'sword', 10: 'staff', 15: 'dagger' } as Record<number, string>)[typeof sub === 'number' ? sub : -1] ?? 'weapon';
}

/** The item ids whose auction prices the book uses (Couch Mode's /book?ids=). */
export const PRICE_IDS: number[] = [...POTION, ...WEIGHTSTONE, ...SHARPENING].map(w => w.id);

/** Every icon the book can show: shipped in assets/omashu/book/icons. */
export const ICONS: string[] = [...new Set([
  ...TREE.map(t => t.icon), ...LADDER.map(r => r.icon), ...CLASS_QUESTS.map(q => q.icon),
  ...[FOOD, WATER, POTION, WEIGHTSTONE, SHARPENING, BANDAGE].flat().map(w => w.icon),
  ...Object.values(FIGHTS).flat().map(f => f[3]), ...Object.values(SPELLS).map(g => g.icon), ...CLASS_QUESTS.map(q => q.icon), 'spell_holy_devotionaura', 'spell_holy_fistofjustice', 'spell_holy_resurrection', 'classicon_paladin', 'inv_misc_book_09', 'inv_chest_chain_05',
  ...DETOURS.map(d => d.icon), 'trade_engineering', 'trade_alchemy', 'achievement_pvp_h_01',
])].sort();
/** Icons the remote fetches from Wowhead's icon store on first use instead of shipping them. */
export const FETCHED_ICONS: string[] = [...new Set([...LADDER.map(r => r.icon), 'trade_engineering', 'trade_alchemy'])];

// ------------------------------------------------------------------ what the phone draws

export interface Card { icon: string; t: string; d: string; go?: string; tone?: 'hot' | 'blue' | 'green'; tab?: 'talents' | 'fight'; /** a Cheap Upgrades item: the remote swaps in its real icon */ item?: number }
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
  /** The road ahead (sheet 25): one point a level, and what he took off the path. */
  road: RoadPoint[]; off: OffPath[];
  bracket: string;
  /** The WoW home's Now page (sheet 27): quests worth a detour, the two profession switches once due, bag counts. */
  detours: Detour[]; swaps: Swap[]; bags: Record<string, number>;
  /** What he holds: its DPS (0 = unknown) and a plain word for it ("mace"). */
  weapon: { dps: number; word: string };
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

/** One point on the road: the level it comes at (a point a level from 10), the talent and the rank it brings. */
export interface RoadPoint { lvl: number; name: string; rank: number }
/** Talents he has that the path doesn't (or more ranks than it takes), with a calm line on what it changes. */
export interface OffPath { name: string; ranks: number; note: string }
/** The road from where he is (the talents tab, sheet 25; Joshua 2026-11-27): every path point he doesn't have yet, in
 *  the path's order, one a level from his next point. Going off the path never breaks it (the talent research's rule:
 *  keep spending in Ret, take the next point on the list): off-path points still count toward rows, they only move
 *  the rest of the road later. Benediction instead of Deflection (both row 1): finish whichever has more to 5. */
export function road(ranks: Record<string, number>): { road: RoadPoint[]; off: OffPath[]; capstone: number | null } {
  const has = (n: string) => ranks[n] ?? 0;
  const spent = Object.values(ranks).reduce((a, r) => a + (r > 0 ? r : 0), 0);
  let pts = POINTS.filter(p => has(p.name) < p.rank).map(p => ({ name: p.name, rank: p.rank }));
  const ben = has('Benediction'), swap = ben > 0 && ben >= has('Deflection') && has('Deflection') < 5;
  if (swap) {   // Benediction takes Deflection's place in the order
    const at = pts.findIndex(p => p.name === 'Deflection');
    pts = pts.filter(p => p.name !== 'Deflection');
    const add = []; for (let r = ben + 1; r <= 5; r++) add.push({ name: 'Benediction', rank: r });
    pts.splice(at < 0 ? 0 : at, 0, ...add);
  }
  const out = pts.map((p, k) => ({ lvl: spent + 10 + k, ...p })).filter(p => p.lvl <= 60);
  const cap = out.find(p => p.name === 'Unsealed Wrath')?.lvl ?? null;
  // what the path would have by now (his first `spent` points): anything past that is off the road or taken early
  const byNow: Record<string, number> = {}; for (const p of POINTS.slice(0, spent)) byNow[p.name] = p.rank;
  const off: OffPath[] = [];
  for (const t of TREE) {
    const h = has(t.name); if (h <= (byNow[t.name] ?? 0) || t.name === 'Benediction' && swap) continue;
    if (t.name === 'Deflection' && swap) continue;
    const extra = h - (byNow[t.name] ?? 0);
    off.push({ name: t.name, ranks: h, note: t.name === 'Benediction' && !swap
      ? `Not on the road, and that's fine: it saves mana instead. Deflection comes first now; Benediction stays as it is.`
      : `Not on the road, and that's fine: ${extra === 1 ? 'that point still counts' : 'those points still count'} toward its row.${cap && cap > 40 ? ` Unsealed Wrath moves to ${cap}.` : cap ? ` Unsealed Wrath still lands at ${cap}.` : ''}` });
  }
  if (swap) off.unshift({ name: 'Benediction', ranks: ben, note: `Not on the road, and that's fine: it saves mana instead of parrying. Finish it to 5.${cap ? ` Unsealed Wrath ${cap > 40 ? 'moves to' : 'still lands at'} ${cap}.` : ''}` });
  return { road: out, off, capstone: cap };
}

/** The talent the next unspent point goes in (the first point of the road), or null. */
export function nextTalent(ranks: Record<string, number>, level: number): { name: string; rank: number } | null {
  const p = road(ranks).road[0];
  return p && p.lvl <= level ? { name: p.name, rank: p.rank } : null;
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
  // only for a weapon that would still be an upgrade (the level 15 axe never nags a paladin holding Wolfsbane)
  for (const r of LADDER) if (r.skill && level >= r.lvl - 3 && skills[r.skill] === undefined && r.dps > myDps + 0.5) {
    cards.push({ icon: r.icon, t: `Learn ${r.skill}${level >= r.lvl ? '' : ' soon'}`, d: `${r.name} at ${r.lvl} needs it · a weapon master teaches it` }); break;
  }
  // 4. a better weapon is open: the best rung at your level that beats what you hold
  let up: Rung | null = null;
  for (const r of LADDER) if (r.lvl <= level && r.dps > myDps + 0.5 && owned?.id !== r.id && (!r.skill || skills[r.skill] !== undefined || level < r.lvl)) up = r;
  if (up && !(up.quest && isDone(up.quest))) cards.push({ icon: up.icon, t: `${up.name} is waiting`, d: `${up.from} · ${up.dps.toFixed(1)} DPS`, tone: 'blue' });
  // 5. a class quest is open (one at a time; the Moonsilver Blade and Wolfsbane are weapon cards above)
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

  // the WoW home's Now page (sheet 27)
  const doneIds = new Set<number>([...doneSet].map(Number).filter(Number.isInteger));
  const dets = detours(level, myDps, doneIds, typeof s.zone === 'string' ? s.zone : '');
  const sw = swaps(level, skills);

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
    ranks, next: nt?.name ?? nextTalent(ranks, level + 1)?.name ?? null, ...(({ road: r, off }) => ({ road: r, off }))(road(ranks)),
    detours: dets, swaps: sw, bags, weapon: { dps: myDps, word: weaponWord(owned?.sub) }, bracket: level < 20 ? '1-20' : level < 40 ? '20-40' : '40+',
    cu: {
      rich: s.cu?.rich === true, max: num(s.cu?.max) > 0 ? num(s.cu?.max) : null,
      list: cuRows.filter(u => Number.isInteger(u.id) && num(u.id) > 0 && typeof u.name === 'string').slice(0, 10)
        .map(u => { const sl = slotName(u.slot); return { id: num(u.id), name: String(u.name), slot: typeof u.slot === 'string' && !/^\d+$/.test(u.slot) ? sl : sl.charAt(0).toUpperCase() + sl.slice(1), price: Math.max(0, num(u.price)), pct: Math.round(num(u.pct)) }; }),
    },
  };
}

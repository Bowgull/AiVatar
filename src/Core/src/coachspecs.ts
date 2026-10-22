// What the rotation coach knows about each spec. Deliberately thin: NO guide text is hard-coded here.
//
// The spec id comes from COMBATANT_INFO in the combat log (advanced logging). WoW: Forever runs the modern
// engine, so it uses the standard spec ids (Details' own tables agree: 71 Arms, 260 Outlaw...).
//
// KEY is the place for "which buffs, debuffs and cooldowns matter" per spec, keyed by spell id. Until it is
// filled, coach.ts falls back to what the log itself shows: the auras with the most uptime, and cooldowns
// guessed from the shortest gap between two casts of the same spell (labelled 'guessed').
//
// TODO (step R4, a weekly data job, not hand-typed): fill KEY per spec he plays, from, in this order
//   1. Warcraft Tavern  warcrafttavern.com/forever/...   robots allows us, plain fetch works (200). Use first.
//   2. The game's own data: wago.tools/db2/{SpellCooldowns,SpellCategory,...}/csv?build=<build> and
//      github.com/alcaras/forever-ref (daily JSON per build) - the cooldown NUMBERS come from here, not guides.
//   3. Mobalytics  mobalytics.gg/wow-forever/classes/...  robots allows, but 403 to plain fetches: read in Samara on ask.
//   NOT usable automatically: Wowhead, Icy Veins, warcraft.wiki.gg (all block ClaudeBot in robots.txt).
//   Beta caveat: guides say "work in progress" until launch (4 Nov 2026); the coach must say "based on the
//   guide from <date>". Learn WHAT to check from WoWAnalyzer's ideas (AGPL: ideas only, no code).

export interface SpecInfo { cls: string; spec: string }

export const SPECS: Record<number, SpecInfo> = {
  71: { cls: 'Warrior', spec: 'Arms' }, 72: { cls: 'Warrior', spec: 'Fury' }, 73: { cls: 'Warrior', spec: 'Protection' },
  65: { cls: 'Paladin', spec: 'Holy' }, 66: { cls: 'Paladin', spec: 'Protection' }, 70: { cls: 'Paladin', spec: 'Retribution' },
  253: { cls: 'Hunter', spec: 'Beast Mastery' }, 254: { cls: 'Hunter', spec: 'Marksmanship' }, 255: { cls: 'Hunter', spec: 'Survival' },
  259: { cls: 'Rogue', spec: 'Assassination' }, 260: { cls: 'Rogue', spec: 'Outlaw' }, 261: { cls: 'Rogue', spec: 'Subtlety' },
  256: { cls: 'Priest', spec: 'Discipline' }, 257: { cls: 'Priest', spec: 'Holy' }, 258: { cls: 'Priest', spec: 'Shadow' },
  262: { cls: 'Shaman', spec: 'Elemental' }, 263: { cls: 'Shaman', spec: 'Enhancement' }, 264: { cls: 'Shaman', spec: 'Restoration' },
  62: { cls: 'Mage', spec: 'Arcane' }, 63: { cls: 'Mage', spec: 'Fire' }, 64: { cls: 'Mage', spec: 'Frost' },
  265: { cls: 'Warlock', spec: 'Affliction' }, 266: { cls: 'Warlock', spec: 'Demonology' }, 267: { cls: 'Warlock', spec: 'Destruction' },
  102: { cls: 'Druid', spec: 'Balance' }, 103: { cls: 'Druid', spec: 'Feral' }, 104: { cls: 'Druid', spec: 'Guardian' }, 105: { cls: 'Druid', spec: 'Restoration' },
  250: { cls: 'Death Knight', spec: 'Blood' }, 251: { cls: 'Death Knight', spec: 'Frost' }, 252: { cls: 'Death Knight', spec: 'Unholy' },
  268: { cls: 'Monk', spec: 'Brewmaster' }, 269: { cls: 'Monk', spec: 'Windwalker' }, 270: { cls: 'Monk', spec: 'Mistweaver' },
  577: { cls: 'Demon Hunter', spec: 'Havoc' }, 581: { cls: 'Demon Hunter', spec: 'Vengeance' },
  1467: { cls: 'Evoker', spec: 'Devastation' }, 1468: { cls: 'Evoker', spec: 'Preservation' }, 1473: { cls: 'Evoker', spec: 'Augmentation' },
};

export interface SpecKeys {
  /** Buffs on himself that should be up (spell ids). */
  buffs: number[];
  /** Debuffs he keeps on the target (spell ids). */
  debuffs: number[];
  /** Long cooldowns: spell id and cooldown in seconds, from game data for the current build. */
  cooldowns: { id: number; cdS: number }[];
  /** Where these came from and when, so the coach can say "based on the guide from <date>". */
  source?: string;
}

/** Empty on purpose until R4 fills it from the sources above. */
export const KEY: Record<number, SpecKeys> = {};

export const specInfo = (id: number | null | undefined): SpecInfo | null => (id != null && SPECS[id]) || null;

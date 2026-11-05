// BG2 (docs/BOTW-GUIDE.md): reading his Breath of the Wild save. Pure functions on bytes; the watching is botwwatch.ts.
//
// game_data.sav (Cemu, Wii U v1.5): a 12-byte header, then (u32 CRC32 of the flag name, u32 value) records, big-endian,
// sorted by hash; an array repeats its hash once per element, a string puts 4 characters in each record. The flag names
// that matter come from botw.db (BG1), so every id here is a key a reader can join on. Format notes:
// Aang/research_notes/BotW guide/save_format.md. The shape this produces is the contract in docs/BOTW-STATE.md.
//
// Never handed an original: botwwatch.ts copies the slot to a temp file first and passes the copy's bytes.
import { crc32 } from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';

export type Records = Map<number, number[]>;

/** game_data.sav or caption.sav bytes -> hash -> its values, in order. */
export function readRecords(buf: Uint8Array): Records {
  const b = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);
  const out: Records = new Map();
  for (let o = 12; o + 8 <= b.length - 4; o += 8) {
    const h = b.readUInt32BE(o);
    let v = out.get(h);
    if (!v) out.set(h, v = []);
    v.push(b.readUInt32BE(o + 4));
  }
  return out;
}

const F32 = Buffer.alloc(4);
const asFloat = (u: number): number => { F32.writeUInt32BE(u >>> 0); return F32.readFloatBE(0); };
/** Strings: `per` records of 4 characters each (str32 = 8, str64 = 16, str256 = 64). */
function strings(v: number[] | undefined, per: number): string[] {
  const out: string[] = [];
  for (let i = 0; v && i < v.length; i += per) {
    const b = Buffer.alloc(per * 4);
    v.slice(i, i + per).forEach((x, k) => b.writeUInt32BE(x >>> 0, k * 4));
    out.push(b.toString('latin1').replace(/\0.*$/s, ''));
  }
  return out;
}

export class Save {
  readonly r: Records;
  constructor(buf: Uint8Array) { this.r = readRecords(buf); }
  has(flag: string): boolean { return this.r.has(crc32(flag)); }
  all(flag: string): number[] { return this.r.get(crc32(flag)) ?? []; }
  int(flag: string): number { return (this.r.get(crc32(flag))?.[0] ?? 0) | 0; }
  float(flag: string): number { return asFloat(this.r.get(crc32(flag))?.[0] ?? 0); }
  floats(flag: string): number[] { return this.all(flag).map(asFloat); }
  str(flag: string, per: number): string[] { return strings(this.r.get(crc32(flag)), per); }
}

// ------------------------------------------------------------------ the catalog (from botw.db)

export interface QuestDef { id: string; type: string; steps: { n: number; flag: string }[] }
export interface Catalog {
  shrines: { id: string; found: string; done: string }[];
  towers: { id: string; found: string; done: string }[];
  koroks: { hash: number; flag: string }[];
  places: string[];
  dishes: { id: string; flag: string }[];
  quests: QuestDef[];
  items: Map<string, { name: string; kind: string }>;
  /** E1 (pack 3): every chest with a save flag, and every person the game can mark as met. Empty on an older botw.db. */
  chests?: { hash: number; flag: string }[];
  people?: { id: string; flag: string }[];
  /** Every flag a person's schedule or placement waits on (people.schedule `when`, places `appears` / `vanishes`). */
  peopleFlags?: string[];
  /** Great Fairy fountains: n and the flag set when he opens it. */
  fairies?: { n: number; flag: string }[];
  /** Captured memories: n (botw.db memories.n) and the flag the game sets when its cutscene has played. */
  memories?: { n: number; flag: string }[];
  /** Every enemy's kill counter (botw.db enemies.kill_flag, Defeated_<actor>_Num, an s32) and every Compendium entry's
   *  photo flag (compendium.flag, IsRegisteredPictureBook_<actor>). Empty on an older botw.db. */
  kills?: { id: string; flag: string }[];
  photos?: { id: string; flag: string }[];
}

interface Cond { flag?: string; of?: Cond[] }
/** The flags people's whereabouts hang on: conditional schedules, and the link tags that make a placement appear or go. */
function personFlags(rows: { schedule: string | null; places: string }[]): string[] {
  const out = new Set<string>();
  const walk = (c: Cond) => { if (c.flag) out.add(c.flag); c.of?.forEach(walk); };
  for (const r of rows) {
    if (r.schedule) for (const w of (JSON.parse(r.schedule) as { when: { flag: string }[] }).when) out.add(w.flag);
    for (const p of JSON.parse(r.places) as { appears?: Cond[]; vanishes?: Cond[] }[]) [...p.appears ?? [], ...p.vanishes ?? []].forEach(walk);
  }
  return [...out].sort();
}

/** The flag names from botw.db. Small (a few thousand rows), read once. */
export function loadCatalog(dbPath: string): Catalog {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const all = <T>(sql: string) => db.prepare(sql).all() as T[];
    const has = (t: string) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t);
    const steps = new Map<string, { n: number; flag: string }[]>();
    for (const s of all<{ quest_id: string; n: number; next_flag: string }>(
      "SELECT quest_id, n, next_flag FROM quest_steps WHERE saved = 1 AND next_flag IS NOT NULL AND next_flag != '' ORDER BY quest_id, n")) {
      let l = steps.get(s.quest_id); if (!l) steps.set(s.quest_id, l = []); l.push({ n: s.n, flag: s.next_flag });
    }
    return {
      shrines: all<{ id: string; found: string; done: string }>('SELECT id, found_flag found, done_flag done FROM shrines ORDER BY num'),
      towers: all<{ id: string; found: string; done: string }>('SELECT id, found_flag found, done_flag done FROM towers ORDER BY num'),
      koroks: all<{ hash: number; flag: string }>("SELECT hash_id hash, flag FROM koroks WHERE flag != '' ORDER BY hash_id"),
      places: all<{ flag: string }>('SELECT DISTINCT flag FROM places WHERE flag IS NOT NULL ORDER BY flag').map(r => r.flag),
      dishes: all<{ id: string; flag: string }>("SELECT id, got_flag flag FROM items WHERE kind = 'dish' AND got_flag IS NOT NULL ORDER BY id"),
      quests: all<{ id: string; type: string }>('SELECT id, type FROM quests ORDER BY rowid').map(q => ({ ...q, steps: steps.get(q.id) ?? [] })),
      items: new Map(all<{ id: string; name: string; kind: string | null }>('SELECT id, name, kind FROM items').map(r => [r.id, { name: r.name, kind: r.kind ?? '' }])),
      chests: has('chests') ? all<{ hash: number; flag: string }>('SELECT hash_id hash, flag FROM chests WHERE flag IS NOT NULL ORDER BY hash_id') : [],
      people: has('people') ? all<{ id: string; flag: string }>('SELECT id, met_flag flag FROM people WHERE met_flag IS NOT NULL ORDER BY id') : [],
      fairies: has('great_fairies') ? all<{ n: number; flag: string }>('SELECT n, revive_flag flag FROM great_fairies WHERE revive_flag IS NOT NULL ORDER BY n') : [],
      memories: has('memories') ? all<{ n: number; flag: string }>('SELECT n, seen_flag flag FROM memories WHERE seen_flag IS NOT NULL ORDER BY n') : [],
      kills: has('enemies') ? all<{ id: string; flag: string }>("SELECT id, kill_flag flag FROM enemies WHERE kill_flag IS NOT NULL AND kill_flag != '' ORDER BY id") : [],
      photos: has('compendium') ? all<{ id: string; flag: string }>('SELECT actor id, flag FROM compendium ORDER BY actor') : [],
      peopleFlags: has('people') ? personFlags(all<{ schedule: string | null; places: string }>('SELECT schedule, places FROM people')) : [],
    };
  } finally { db.close(); }
}

// ------------------------------------------------------------------ the state (docs/BOTW-STATE.md)

export interface BotwQuest { id: string; type: string; step: number; steps: number; done: boolean }
export interface BotwGear {
  id: string; name: string; kind: string; n: number; equipped: boolean;
  /** Cooked dishes and elixirs only (bug 32): what THIS one does, from the save's own table (CookEffect0 = [effect,
   *  level], StaminaRecover = [hearts in quarters, seconds]), which lines up with the Item_Cook_ entries in his pouch in
   *  order. The same decoding as botw-guide-mockups tools/routetest/save.mjs, checked on his dishes (Spicy = 5). */
  cook?: { effect: string | null; level: number; hp: number; time: number };
}
/** The save's cooking effect numbers, the game's own order. */
const COOK_FX: Record<number, string> = { 1: 'LifeRecover', 2: 'LifeMaxUp', 4: 'ResistHot', 5: 'ResistCold', 6: 'ResistElectric', 10: 'AttackUp', 11: 'DefenseUp', 12: 'Quietness', 13: 'MovingSpeed', 14: 'GutsRecover', 15: 'ExGutsMaxUp', 16: 'Fireproof' };
export interface BotwState {
  v: 1;
  readAt: string; savedAt: string; slot: number; version: string;
  playtime: number;
  /** bloodTimer: WM_BloodyMoonTimer (f32), +0.25 a second of play; the Blood Moon is due past 2520. */
  clock: { day: number; hour: number; bloodMoon: number; bloodTimer?: number };
  hearts: { max: number; now: number };
  stamina: { max: number };
  rupees: number; mons: number;
  pos: { x: number; y: number; z: number; facing: number; map: string; square: string; label: string };
  shrines: { found: string[]; done: string[] };
  towers: { found: string[]; active: string[] };
  koroks: { seeds: number; found: number[] };
  divineBeasts: string[];
  quests: BotwQuest[];
  places: string[];
  dishes: string[];
  gear: BotwGear[];
  heroPath: { points: [number, number][] } | null;
  chests: { opened: number[] };   // E2: botw.db chests.hash_id of every chest he has opened
  people: { met: string[]; flags: string[] };  // E2: met = people.id the game has introduced (name shown, or first talk);
                                  // flags = the schedule / placement condition flags set in his save (where people are)
  /** botw.db memories.n of each captured memory he has found: its cutscene played (IsPlayed_Demo1xx_0). Not the
   *  IsGet_MemoryPhoto_ flags: those mark Impa's album photos, all given at the start (checked on his save 2026-11-04). */
  memories?: number[];
  /** botw.db enemies.id -> how many he has beaten (Defeated_<actor>_Num), only those beaten at least once: the game
   *  writes the counter at the first kill. */
  kills?: Record<string, number>;
  /** botw.db compendium.actor of every entry he has photographed (IsRegisteredPictureBook_<actor> set). */
  photos?: string[];
  greatFairies: number[];         // E2: botw.db great_fairies.n of the fountains he has opened (RevivalGreatFairyN)
  dlc: BotwDlc;                   // E2: the add-ons' completion marks (docs/BOTW-STATE.md)
  /** His stable horses (BG9, 2026-11-04): the Horse_* arrays, one entry per filled stable slot (slots 0-4; slot 5 is
   *  the game's temporary one and is left out). Stats live in each horse type's actor, not in the save. */
  horses?: BotwHorse[];
}
export interface BotwHorse {
  slot: number;                   // 0-4, the game's stable slot
  name: string;                   // Horse_UserName: the name he gave it
  actor: string;                  // Horse_ActorName: the horse type (GameRomHorse23), the key for its stats
  bond: number;                   // Horse_Familiarity, 0..1 (the game shows it as hearts)
  saddle: string; reins: string;  // Horse_SaddleName / Horse_ReinsName: botw.db items.id
  mane: string;                   // Horse_ManeName
  rideSec: number;                // Horse_RideTimeSec: time ridden
}
export interface BotwDlc {
  masterMode: boolean;            // AoC_HardMode_Enabled: only ever set in a Master Mode save
  trialOfTheSword: { beginning: boolean; middle: boolean; final: boolean };  // 100enemy_Clear_Junior/Middle/Senior
  ballad: { champions: string[]; done: boolean };  // BalladOfHero<Rito|Goron|Zora|Gerudo>_Finish, BalladOfHeroes_Finish
  finalTrial: boolean;            // Clear_FinalTrial
  mazKoshia: boolean;             // Defeated_Priest_Boss_Normal_Num > 0
}

const VERSIONS: Record<number, string> = { 0x471b: 'v1.5', 0x471e: 'v1.6' };
const BEASTS = ['Water', 'Fire', 'Wind', 'Electric'];
const CHAMPIONS = ['Rito', 'Goron', 'Zora', 'Gerudo'];
/** Weapons, bows and shields keep durability x100 in PorchItem_Value1, everything else a count. */
const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

export interface ParseInput {
  save: Uint8Array;
  caption?: Uint8Array | null;
  tracks?: Uint8Array[];
  slot: number;
  savedAt: number;
  now?: number;
}

/** The stable: Horse_* arrays (6 entries; 0-4 are stable slots, 5 is temporary). An empty ActorName = an empty slot. */
function horses(s: Save): BotwHorse[] {
  const actor = s.str('Horse_ActorName', 16), name = s.str('Horse_UserName', 16), saddle = s.str('Horse_SaddleName', 16);
  const reins = s.str('Horse_ReinsName', 16), mane = s.str('Horse_ManeName', 16), bond = s.floats('Horse_Familiarity'), ride = s.all('Horse_RideTimeSec');
  const out: BotwHorse[] = [];
  for (let i = 0; i < Math.min(5, actor.length); i++) {
    if (!actor[i]) continue;
    out.push({ slot: i, name: name[i] ?? '', actor: actor[i]!, bond: round(bond[i] ?? 0), saddle: saddle[i] ?? '', reins: reins[i] ?? '', mane: mane[i] ?? '', rideSec: (ride[i] ?? 0) | 0 });
  }
  return out;
}

export function parseState(inp: ParseInput, cat: Catalog): BotwState {
  const s = new Save(inp.save);
  const head = Buffer.from(inp.save.buffer, inp.save.byteOffset, 4).readUInt32BE(0);
  const [x = 0, y = 0, z = 0] = s.floats('PlayerSavePos');
  const bag = s.str('PorchItem', 16), value = s.all('PorchItem_Value1'), equip = s.all('PorchItem_EquipFlag');
  const gear: BotwGear[] = [];
  const fx = s.floats('CookEffect0'), sr = s.floats('StaminaRecover');
  let k = 0;   // the k-th Item_Cook_ in the pouch owns pair k of the cooking tables
  bag.forEach((id, i) => {
    if (!id) return;
    const it = cat.items.get(id);
    const g: BotwGear = { id, name: it?.name ?? id, kind: it?.kind ?? '', n: (value[i] ?? 0) | 0, equipped: (equip[i] ?? 0) !== 0 };
    if (id.startsWith('Item_Cook_')) { const e = fx[k * 2] ?? -1; g.cook = { effect: COOK_FX[e] ?? null, level: round(fx[k * 2 + 1] ?? 0), hp: round(sr[k * 2] ?? 0), time: Math.round(sr[k * 2 + 1] ?? 0) }; k++; }
    gear.push(g);
  });
  const quests: BotwQuest[] = [];
  for (const q of cat.quests) {
    if (!q.steps.length) continue;
    let reached = -1;
    q.steps.forEach((st, i) => { if (s.int(st.flag)) reached = i; });
    if (reached < 0) continue;
    const done = reached === q.steps.length - 1;
    const step = done ? q.steps[reached]!.n + 1 : q.steps[reached + 1]!.n;
    quests.push({ id: q.id, type: q.type, step, steps: q.steps[q.steps.length - 1]!.n + 1, done });
  }
  // caption.sav: the load screen's place, one string under this hash ("Dungeon033")
  const cap = inp.caption ? readRecords(inp.caption).get(0x46d266b6) : undefined;
  const label = cap ? strings(cap, cap.length)[0] ?? '' : '';
  const path = inp.tracks?.length ? heroPath(inp.tracks) : [];
  return {
    v: 1,
    readAt: new Date(inp.now ?? Date.now()).toISOString(),
    savedAt: new Date(inp.savedAt).toISOString(),
    slot: inp.slot,
    version: VERSIONS[head] ?? `0x${head.toString(16)}`,
    playtime: s.int('PlayReport_PlayTime'),
    clock: { day: s.int('WM_NumberOfDays'), hour: round(s.float('WM_Time') / 15), bloodMoon: s.int('WM_BloodyDay'), bloodTimer: round(s.float('WM_BloodyMoonTimer')) },
    hearts: { max: s.int('MaxHartValue') / 4, now: s.int('CurrentHart') / 4 },
    stamina: { max: round(s.float('StaminaMax') / 1000) },
    rupees: s.int('CurrentRupee'), mons: s.int('CurrentMamo'),
    pos: {
      x: round(x), y: round(y), z: round(z), facing: round(s.float('PlayerSavePosAngleYDegree'), 1),
      map: s.str('PlayerSavePosMapType', 8)[0] ?? '', square: s.str('PlayerSavePosMapName', 8)[0] ?? '', label,
    },
    shrines: { found: cat.shrines.filter(r => s.int(r.found) > 0).map(r => r.id), done: cat.shrines.filter(r => s.int(r.done)).map(r => r.id) },
    towers: { found: cat.towers.filter(r => s.int(r.found) > 0).map(r => r.id), active: cat.towers.filter(r => s.int(r.done)).map(r => r.id) },
    koroks: { seeds: s.int('HiddenKorok_Number'), found: cat.koroks.filter(r => s.int(r.flag)).map(r => r.hash) },
    divineBeasts: BEASTS.filter(b => s.int(`Clear_Remains${b}`)),
    quests,
    places: cat.places.filter(f => s.int(f) > 0),
    dishes: cat.dishes.filter(d => s.int(d.flag)).map(d => d.id),
    gear,
    heroPath: path.length ? { points: path } : null,
    chests: { opened: (cat.chests ?? []).filter(c => s.int(c.flag)).map(c => c.hash) },
    people: { met: (cat.people ?? []).filter(p => s.int(p.flag)).map(p => p.id), flags: (cat.peopleFlags ?? []).filter(f => s.int(f)) },
    greatFairies: (cat.fairies ?? []).filter(f => s.int(f.flag)).map(f => f.n),
    memories: (cat.memories ?? []).filter(m => s.int(m.flag)).map(m => m.n),
    kills: Object.fromEntries((cat.kills ?? []).map(k => [k.id, s.int(k.flag)] as const).filter(([, n]) => n > 0)),
    photos: (cat.photos ?? []).filter(p => s.int(p.flag)).map(p => p.id),
    horses: horses(s),
    dlc: {
      masterMode: s.int('AoC_HardMode_Enabled') !== 0,
      trialOfTheSword: { beginning: !!s.int('100enemy_Clear_Junior'), middle: !!s.int('100enemy_Clear_Middle'), final: !!s.int('100enemy_Clear_Senior') },
      ballad: { champions: CHAMPIONS.filter(c => s.int(`BalladOfHero${c}_Finish`)), done: !!s.int('BalladOfHeroes_Finish') },
      finalTrial: !!s.int('Clear_FinalTrial'), mazKoshia: s.int('Defeated_Priest_Boss_Normal_Num') > 0,
    },
  };
}

// ------------------------------------------------------------------ Hero's Path (tracker/trackblockNN.sav)

/**
 * Every overworld point he walked, in play order. A file is a 0x40 header then 48 segments of 0x4C0 bytes: u32 t1
 * (seconds of play), u32 t2, 8 bytes, 300 u32 entries about 2 s apart. Entry bits: 0-11 |z|, 12 z negative, 13-24 |x|
 * low bits, 25 |x| + 4096, 26 x negative, 27-30 events, 31 overworld (else shrine-local: skipped). The public spec has
 * the signs backwards; these are tested (the last point is PlayerSavePos). Repeats in a row are dropped.
 */
export function heroPath(files: Uint8Array[]): [number, number][] {
  const segs: { t: number; at: number; b: Buffer }[] = [];
  for (const f of files) {
    const b = Buffer.from(f.buffer, f.byteOffset, f.byteLength);
    for (let k = 0; k < 48; k++) {
      const at = 0x40 + k * 0x4c0;
      if (at + 0x4c0 > b.length) break;
      if (b.readUInt32BE(at + 16) === 0) continue;
      segs.push({ t: b.readUInt32BE(at), at, b });
    }
  }
  segs.sort((a, b) => a.t - b.t);
  const out: [number, number][] = [];
  for (const { at, b } of segs) {
    for (let i = 0; i < 300; i++) {
      const v = b.readUInt32BE(at + 16 + i * 4);
      if (v === 0 || v === 0xfbffdfff || !(v >>> 31)) continue;
      const az = v & 0xfff, ax = ((v >>> 13) & 0xfff) + ((v >>> 25) & 1) * 4096;
      const px = (v >>> 26) & 1 ? -ax : ax, pz = (v >>> 12) & 1 ? -az : az;
      const last = out[out.length - 1];
      if (!last || last[0] !== px || last[1] !== pz) out.push([px, pz]);
    }
  }
  return out;
}

// ------------------------------------------------------------------ what a session changed

export interface BotwDiff {
  playtime: number;
  shrinesDone: string[]; shrinesFound: string[];
  towers: string[]; koroks: number[]; divineBeasts: string[];
  questsDone: string[]; questsStarted: string[];
  places: string[]; dishes: string[];
  hearts: number; stamina: number;
  chests: number[]; people: string[];   // E2: opened / met this session
}

const added = <T>(a: T[], b: T[]): T[] => { const had = new Set(a); return b.filter(x => !had.has(x)); };

export function diffStates(a: BotwState, b: BotwState): BotwDiff {
  const wasStarted = new Set(a.quests.map(q => q.id)), wasDone = new Set(a.quests.filter(q => q.done).map(q => q.id));
  return {
    playtime: Math.max(0, b.playtime - a.playtime),
    shrinesDone: added(a.shrines.done, b.shrines.done),
    // found this session and not finished: a shrine found and done the same day counts once, as done
    shrinesFound: added(a.shrines.found, b.shrines.found).filter(id => !b.shrines.done.includes(id)),
    towers: added(a.towers.active, b.towers.active),
    koroks: added(a.koroks.found, b.koroks.found),
    divineBeasts: added(a.divineBeasts, b.divineBeasts),
    questsDone: b.quests.filter(q => q.done && !wasDone.has(q.id)).map(q => q.id),
    questsStarted: b.quests.filter(q => !q.done && !wasStarted.has(q.id)).map(q => q.id),
    places: added(a.places, b.places),
    dishes: added(a.dishes, b.dishes),
    hearts: Math.max(0, b.hearts.max - a.hearts.max),
    stamina: round(Math.max(0, b.stamina.max - a.stamina.max)),
    // a state written before E2 has neither: then nothing counts as new (the whole list is not one session's)
    chests: a.chests && b.chests ? added(a.chests.opened, b.chests.opened) : [],
    people: a.people && b.people ? added(a.people.met, b.people.met) : [],
  };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export function sayPlaytime(sec: number): string {
  const m = Math.round(sec / 60);
  if (m < 60) return `${Math.max(1, m)}m`;
  return `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}`;
}

/**
 * His one line (his rule: "Today: 3 shrines, 12 Koroks."). What he did, never what is left. At most four things, the
 * big ones first; nothing at all done but time played says the time. Nothing played: no line.
 */
export function todayLine(d: BotwDiff): string | null {
  const parts: string[] = [];
  if (d.divineBeasts.length) parts.push(plural(d.divineBeasts.length, 'Divine Beast'));
  if (d.shrinesDone.length) parts.push(plural(d.shrinesDone.length, 'shrine'));
  if (d.towers.length) parts.push(plural(d.towers.length, 'tower'));
  if (d.koroks.length) parts.push(plural(d.koroks.length, 'Korok'));
  if (d.questsDone.length) parts.push(plural(d.questsDone.length, 'quest'));
  if (d.hearts) parts.push(plural(d.hearts, 'new heart'));
  if (d.stamina) parts.push('more stamina');
  if (d.shrinesFound.length) parts.push(`${plural(d.shrinesFound.length, 'shrine')} found`);
  if (d.dishes.length) parts.push(plural(d.dishes.length, 'new dish', 'new dishes'));
  if (d.places.length) parts.push(plural(d.places.length, 'new place'));
  if (!parts.length) return d.playtime >= 60 ? `Today: ${sayPlaytime(d.playtime)} in Hyrule.` : null;
  return `Today: ${parts.slice(0, 4).join(', ')}.`;
}

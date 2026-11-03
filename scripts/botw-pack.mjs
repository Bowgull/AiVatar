// BG1, the BotW data pack: everything Aang's guide tools look up, in one SQLite file (docs/BOTW-GUIDE.md).
//
//   node scripts/botw-pack.mjs [--out <dir>] [--src <botw-guide-mockups dir>] [--refresh]
//
// Builds <out>/botw.db (default %LOCALAPPDATA%\Aang\botw). Read-only on everything it reads:
// - his Cemu install (base, update, DLC): flag list, English text, ActorInfo, cooking table;
// - the local-only botw-guide-mockups repo: what earlier passes already read from the same game files
//   (quests, armour upgrade chains, place names, map markers), so nothing is worked out twice;
// - radar.zeldamods.org (Korok puzzle types) and the Hyrule Compendium API (compendium numbers), fetched once
//   and cached in <out>/cache.
// The output is Nintendo's data: it stays in <out>, never in this (public) repo.
//
// Numbers live in columns keyed on the game's own IDs (Dungeon054, MapTower_07, a Korok's hash_id, an actor
// name), never in embeddings. Every row carries spoiler_kind (mechanics, location, solution, item, story) and
// spoiler_level 0-3 (0 = fine to say, 3 = story), so the hint ladder can decide what to say.
//
// NOTE: run from a Claude session, %LOCALAPPDATA% is redirected into the Claude app's package; pass
// --out \\localhost\c$\Users\Shadow\AppData\Local\Aang\botw to reach the real folder, from PowerShell (Git Bash
// turns that path into C:\localhost\..., a stray folder). Check it with scripts/botw-pack-check.mjs.
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { crc32 } from 'node:zlib';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = arg('--out', path.join(process.env.LOCALAPPDATA || '', 'Aang', 'botw'));
const SRC = arg('--src', 'C:/Users/Shadow/Documents/botw-guide-mockups');
const REFRESH = process.argv.includes('--refresh');
const CEMU = 'C:/Games/Cemu/portable/mlc01/usr/title';
// The update folder holds the full v1.5 Bootup pack, ActorInfo and text; the base game is not needed on top.
const UPD = `${CEMU}/0005000e/101c9400/content/`, DLC = `${CEMU}/0005000c/101c9400/content/0010/`;
const UA = { 'user-agent': 'aang-personal-botw-guide (one-off, private)' };
export const PACK_VERSION = 2; // 2 (BG3): cook_items, cook_effects, shops for the guide tools

// ---- readers for the game's formats (Wii U, big-endian) ----
function yaz0(b) {
  if (b.toString('latin1', 0, 4) !== 'Yaz0') return b;
  const n = b.readUInt32BE(4), o = Buffer.alloc(n); let s = 16, d = 0;
  while (d < n) {
    const code = b[s++];
    for (let bit = 7; bit >= 0 && d < n; bit--) {
      if (code & (1 << bit)) { o[d++] = b[s++]; continue; }
      const b1 = b[s++], b2 = b[s++], dist = ((b1 & 15) << 8 | b2) + 1; let len = b1 >> 4; len = len === 0 ? b[s++] + 18 : len + 2;
      for (let k = 0; k < len; k++, d++) o[d] = o[d - dist];
    }
  }
  return o;
}
function sarc(b) {
  const be = b.readUInt16BE(6) === 0xfeff, r16 = (o) => be ? b.readUInt16BE(o) : b.readUInt16LE(o), r32 = (o) => be ? b.readUInt32BE(o) : b.readUInt32LE(o);
  const dataOff = r32(0x0c), sfat = r16(4), nodes = r16(sfat + 6), sfnt = sfat + 12 + nodes * 16, names = sfnt + r16(sfnt + 4), files = new Map();
  for (let i = 0; i < nodes; i++) {
    const n = sfat + 12 + i * 16, at = r32(n + 4); let nm = '#' + i;
    if (at & 0x01000000) { const o = names + (at & 0xffff) * 4; let e = o; while (b[e]) e++; nm = b.toString('latin1', o, e); }
    files.set(nm, b.subarray(dataOff + r32(n + 8), dataOff + r32(n + 12)));
  }
  return files;
}
function byml(buf) {
  const u24 = (o) => (buf[o] << 16) | (buf[o + 1] << 8) | buf[o + 2], u32 = (o) => buf.readUInt32BE(o);
  const strtab = (off) => { if (!off) return []; const n = u24(off + 1), out = []; for (let i = 0; i < n; i++) { const a = off + u32(off + 4 + i * 4); let e = a; while (buf[e]) e++; out.push(buf.toString('utf8', a, e)); } return out; };
  const keys = strtab(u32(4)), strs = strtab(u32(8));
  const val = (t, v) => {
    switch (t) {
      case 0xa0: return strs[v]; case 0xd0: return !!v; case 0xd1: return v | 0; case 0xd3: return v >>> 0;
      case 0xd2: { const b = Buffer.alloc(4); b.writeUInt32BE(v >>> 0); return b.readFloatBE(0); }
      case 0xc0: case 0xc1: return node(v); case 0xff: return null; default: return v;
    }
  };
  const node = (o) => {
    const t = buf[o], n = u24(o + 1);
    if (t === 0xc0) { const out = [], vo = o + 4 + ((n + 3) & ~3); for (let i = 0; i < n; i++) out.push(val(buf[o + 4 + i], u32(vo + i * 4))); return out; }
    if (t === 0xc1) { const out = {}; for (let i = 0; i < n; i++) { const e = o + 4 + i * 8; out[keys[u24(e)]] = val(buf[e + 3], u32(e + 4)); } return out; }
    return null;
  };
  return node(u32(12));
}
function msbt(b) {
  const be = b[8] === 0xfe, r16 = (o) => be ? b.readUInt16BE(o) : b.readUInt16LE(o), r32 = (o) => be ? b.readUInt32BE(o) : b.readUInt32LE(o);
  let o = 0x20; const n = r16(0x0e), lbl = [], txt = [];
  for (let i = 0; i < n; i++) {
    const t = b.toString('latin1', o, o + 4), sz = r32(o + 4), d = o + 16;
    if (t === 'LBL1') { const nb = r32(d); for (let j = 0; j < nb; j++) { const c = r32(d + 4 + j * 8); let p = d + r32(d + 8 + j * 8); for (let k = 0; k < c; k++) { const l = b[p]; lbl.push([b.toString('latin1', p + 1, p + 1 + l), r32(p + 1 + l)]); p += 1 + l + 4; } } }
    if (t === 'TXT2') {
      const nt = r32(d);
      for (let j = 0; j < nt; j++) {
        const s = d + r32(d + 4 + j * 4), e = j + 1 < nt ? d + r32(d + 8 + j * 4) : d + sz; let out = '';
        for (let q = s; q < e; q += 2) { const c = r16(q); if (c === 0) break; if (c === 0x0e) { q += 6 + r16(q + 6); continue; } out += String.fromCharCode(c); }
        txt.push(out);
      }
    }
    o = (d + sz + 15) & ~15;
  }
  return Object.fromEntries(lbl.map(([nm, i]) => [nm, txt[i]]));
}
const pack = (f) => sarc(yaz0(readFileSync(f)));
const json = (f) => JSON.parse(readFileSync(path.join(SRC, f), 'utf8'));
const tidy = (s) => (s ?? '').replace(/\s+/g, ' ').trim() || null;

async function cached(name, fetcher) {
  const f = path.join(OUT, 'cache', name);
  if (!REFRESH && existsSync(f)) return JSON.parse(readFileSync(f, 'utf8'));
  const data = await fetcher(); mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, JSON.stringify(data)); return data;
}
const getJson = async (url) => { const r = await fetch(url, { headers: UA }); if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json(); };

// ---- the game's own lists ----
console.log('reading game files (read-only)...');
const boot = pack(UPD + 'Pack/Bootup.pack');
// flag name -> kept in game_data.sav? Runtime-only flags (IsSave false) never reach the save, so the guide cannot read them.
const FLAGS = new Map();
for (const [, v] of sarc(yaz0(boot.get('GameData/gamedata.ssarc')))) { const d = byml(v); for (const t in d) for (const f of d[t]) FLAGS.set(f.DataName, !!f.IsSave); }
const MSG = {};
for (const f of [UPD + 'Pack/Bootup_USen.pack', DLC + 'Pack/Bootup_USen.pack']) {
  if (!existsSync(f)) continue;
  for (const [k, v] of sarc(yaz0(pack(f).get('Message/Msg_USen.product.ssarc')))) (MSG[k.replace(/\.msbt$/, '')] ||= {}, Object.assign(MSG[k.replace(/\.msbt$/, '')], msbt(v)));
}
const AI = byml(yaz0(readFileSync(UPD + 'Actor/ActorInfo.product.sbyml'))).Actors, ACTOR = new Map(AI.map((a) => [a.name, a]));
const BY_HASH = new Map(AI.map((a) => [crc32(a.name), a.name]));
const TXT = {}; // actor -> { Name, Desc, PictureBook }
for (const [k, file] of Object.entries(MSG)) if (k.startsWith('ActorType/')) for (const [lbl, s] of Object.entries(file)) { const m = lbl.match(/^(.*)_(Name|Desc|PictureBook)$/); if (m) (TXT[m[1]] ||= {})[m[2]] = tidy(s); }
const PLACE = json('data/placenames.json'); // MessageID -> English
const nameOf = (id) => TXT[id]?.Name || PLACE[id] || null;

// ---- the database ----
mkdirSync(OUT, { recursive: true });
const DB = path.join(OUT, 'botw.db'), TMP = DB + '.building';
rmSync(TMP, { force: true });
const db = new DatabaseSync(TMP);
const SPOIL = `spoiler_kind TEXT NOT NULL, spoiler_level INTEGER NOT NULL`;
db.exec(`
  CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE names (id TEXT NOT NULL, name TEXT NOT NULL, source TEXT NOT NULL, ${SPOIL}, PRIMARY KEY (id, source));
  CREATE TABLE shrines (id TEXT PRIMARY KEY, num INTEGER NOT NULL, name TEXT, subtitle TEXT, dlc INTEGER NOT NULL,
    x REAL, z REAL, found_flag TEXT NOT NULL, done_flag TEXT NOT NULL, ${SPOIL});
  CREATE TABLE towers (id TEXT PRIMARY KEY, num INTEGER NOT NULL, name TEXT, x REAL, z REAL,
    found_flag TEXT NOT NULL, done_flag TEXT NOT NULL, ${SPOIL});
  CREATE TABLE koroks (hash_id INTEGER PRIMARY KEY, korok_id TEXT, kind TEXT NOT NULL, puzzle TEXT, x REAL, y REAL, z REAL,
    flag TEXT NOT NULL, ${SPOIL});
  CREATE TABLE places (n INTEGER PRIMARY KEY, flag TEXT, msg_id TEXT NOT NULL, name TEXT, type TEXT, x REAL, z REAL, ${SPOIL});
  CREATE TABLE quests (id TEXT PRIMARY KEY, type TEXT NOT NULL, dlc INTEGER NOT NULL, in_log INTEGER NOT NULL, collab INTEGER NOT NULL,
    name TEXT, giver TEXT, giver_name TEXT, location TEXT, location_name TEXT, needs_flag TEXT, steps INTEGER NOT NULL, ${SPOIL});
  CREATE TABLE quest_steps (quest_id TEXT NOT NULL, n INTEGER NOT NULL, name TEXT NOT NULL, next_flag TEXT, saved INTEGER NOT NULL, text TEXT,
    x REAL, y REAL, z REAL, ${SPOIL}, PRIMARY KEY (quest_id, n));
  CREATE TABLE items (id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT, profile TEXT, descr TEXT, sell INTEGER, buy INTEGER,
    heal INTEGER, effect TEXT, effect_level INTEGER, attack INTEGER, guard INTEGER, durability INTEGER, got_flag TEXT, ${SPOIL});
  CREATE TABLE armor_upgrades (piece TEXT NOT NULL, level_id TEXT NOT NULL, star INTEGER NOT NULL, defense INTEGER, sell INTEGER,
    materials TEXT, slot TEXT, series TEXT, set_bonus INTEGER, effect TEXT, ${SPOIL}, PRIMARY KEY (piece, star));
  CREATE TABLE recipes (n INTEGER PRIMARY KEY, dish TEXT NOT NULL, dish_name TEXT, single INTEGER NOT NULL, hearts INTEGER,
    needs TEXT NOT NULL, ${SPOIL});
  CREATE TABLE compendium (actor TEXT PRIMARY KEY, number INTEGER, name TEXT, category TEXT, descr TEXT, flag TEXT NOT NULL, ${SPOIL});
  CREATE TABLE enemies (id TEXT PRIMARY KEY, name TEXT, profile TEXT, life INTEGER, attack INTEGER, rank INTEGER, drops TEXT,
    areas TEXT, kill_flag TEXT, ${SPOIL});
  CREATE TABLE cook_items (id TEXT PRIMARY KEY, name TEXT NOT NULL, tags TEXT NOT NULL, hp INTEGER, effect TEXT, potency INTEGER, time INTEGER,
    boost_time INTEGER, boost_hp INTEGER, boost_max INTEGER, boost_stamina INTEGER, buy INTEGER);
  CREATE TABLE cook_effects (effect TEXT PRIMARY KEY, base_time INTEGER, min INTEGER, max INTEGER, rate REAL);
  CREATE TABLE shops (npc TEXT PRIMARY KEY, name TEXT, items TEXT NOT NULL, x REAL, z REAL, ${SPOIL});
  CREATE INDEX places_flag ON places(flag);
  CREATE INDEX names_name ON names(name COLLATE NOCASE);
`);
const insert = (table, rows) => {
  if (!rows.length) return 0;
  const cols = Object.keys(rows[0]), st = db.prepare(`INSERT INTO ${table} (${cols}) VALUES (${cols.map(() => '?')})`);
  for (const r of rows) st.run(...cols.map((c) => r[c] ?? null));
  return rows.length;
};
const missing = []; // things a source should have and did not
const need = (cond, what) => { if (!cond) missing.push(what); return cond; };

const { M: MARK } = await import('file:///' + path.join(SRC, 'sheet-01/markers.js').replace(/\\/g, '/'));
db.exec('BEGIN');

// shrines: 120 base + 16 Champions' Ballad. Names and trial subtitles are the game's own (StaticMsg/Dungeon).
const DMSG = MSG['StaticMsg/Dungeon'] || {};
insert('shrines', MARK.shrines.map(([flag, id, x, z]) => {
  const num = +id.slice(7);
  need(FLAGS.has(flag) && FLAGS.has('Clear_' + id), `flags for ${id}`); need(DMSG[id], `name for ${id}`);
  return { id, num, name: tidy(DMSG[id]), subtitle: tidy(DMSG[id + '_sub']), dlc: num >= 120 ? 1 : 0, x, z, found_flag: flag, done_flag: 'Clear_' + id,
    spoiler_kind: 'location', spoiler_level: 1 };
}));

// towers: Location_MapTowerNN counts visits, MapTower_NN is set when he activates it.
insert('towers', MARK.towers.map(([flag, id, x, z]) => {
  const nn = flag.slice(-2); need(FLAGS.has('MapTower_' + nn), `MapTower_${nn}`);
  return { id: 'MapTower_' + nn, num: +nn, name: PLACE[id] || null, x, z, found_flag: flag, done_flag: 'MapTower_' + nn, spoiler_kind: 'location', spoiler_level: 0 };
}));

// Koroks: the save flag names (Ground / Fly) are in the game's flag list; puzzle types and heights come from radar,
// which works them out from the game's own placement links.
const radar = await cached('radar_koroks.json', async () => {
  const out = [];
  for (const nm of ['Npc_HiddenKorokGround', 'Npc_HiddenKorokFly']) out.push(...await getJson(`https://radar.zeldamods.org/objs/MainField?q=${encodeURIComponent(`"${nm}"`)}&limit=5000`));
  return out.map((o) => ({ hash_id: o.hash_id, name: o.name, korok_id: o.korok_id, korok_type: o.korok_type, pos: o.pos }));
});
const RADAR = new Map(radar.map((o) => [o.hash_id, o]));
insert('koroks', MARK.koroks.map(([h, x, z]) => {
  const flag = ['Ground', 'Fly'].map((k) => `MainField_Npc_HiddenKorok${k}_${h}`).find((f) => FLAGS.has(f)), r = RADAR.get(h);
  need(flag, `flag for Korok ${h}`); need(r?.korok_type, `puzzle type for Korok ${h}`);
  return { hash_id: h, korok_id: r?.korok_id, kind: flag?.includes('Fly') ? 'Fly' : 'Ground', puzzle: r?.korok_type, x, y: r?.pos?.[1], z, flag: flag || '',
    spoiler_kind: 'location', spoiler_level: 2 };
}));

// places: every name on the map. A big area has one row per label (Adeya Lake has three). Only some have a
// Location_ save flag (a visit counter: villages, stables, landmarks); the rest are just labels, flag null.
insert('places', MARK.places.map(([flag, msg, type, x, z], n) => ({ n, flag: FLAGS.get(flag) ? flag : null, msg_id: msg, name: PLACE[msg] || null, type, x, z, spoiler_kind: 'location', spoiler_level: 0 })));

// quests + steps: the game's quest list, English names and step texts. In the log: Main = main, Sub shown = shrine
// quests, Mini = side quests; hidden Sub entries are minigames the game tracks as quests. bf2_collabo (the Xenoblade 2
// tie-in, added in v1.4 and present in his Wii U save) is a 77th side quest outside the usual 76: collab = 1.
// saved = 0 marks step flags the game never writes to the save (85 of 627), so progress must come from the others.
const QL = json('data/quests.json'), QMSG = json('data/questmsg.json');
const qtext = (id, m) => QMSG[`QuestMsg/QL_${id}.msbt`]?.[`QL_${id}_${m}`];
const TYPE = { Main: 'main', Sub: 'shrine', Mini: 'side' };
const steps = [];
insert('quests', QL.map((q) => {
  const type = q.NotPostNote ? 'minigame' : TYPE[q.Type], main = type === 'main';
  q.Steps.forEach((s, n) => {
    const at = s.IndicatorActors?.[0]?.Location, last = n === q.Steps.length - 1;
    steps.push({ quest_id: q.Name, n, name: s.Name, next_flag: s.NextFlag || null, saved: FLAGS.get(s.NextFlag) ? 1 : 0, text: tidy(qtext(q.Name, s.MessageName)), x: at?.X, y: at?.Y, z: at?.Z,
      spoiler_kind: 'story', spoiler_level: n === 0 ? 1 : last || main ? 3 : 2 });
  });
  return { id: q.Name, type, dlc: q.AocVersion ? 1 : 0, in_log: q.NotPostNote ? 0 : 1, collab: q.Name === 'bf2_collabo' ? 1 : 0,
    name: tidy(qtext(q.Name, 'Name')), giver: q.Orderer || null, giver_name: nameOf(q.Orderer), location: q.Location || null, location_name: PLACE[q.Location] || null,
    needs_flag: q.QuestDependencyFlag || null, steps: q.Steps.length, spoiler_kind: 'story', spoiler_level: main ? 2 : 1 };
}));
insert('quest_steps', steps);

// items: everything the game counts as "got" (an IsGet_ flag) that has an English name.
const KIND = { WeaponSmallSword: 'one-handed', WeaponLargeSword: 'two-handed', WeaponSpear: 'spear', WeaponBow: 'bow', WeaponShield: 'shield',
  ArmorHead: 'armor', ArmorUpper: 'armor', ArmorLower: 'armor', ArrowItem: 'arrow', Bullet: 'arrow', PlayerItem: 'slate rune', CookResult: 'dish', HorseReins: 'horse gear', HorseSaddle: 'horse gear' };
const kindOf = (a) => KIND[a.profile] || (/^Item_(Plant|Mushroom|Fruit|Meat|Fish|Insect|Ore|Enemy|Material)/.test(a.name) || /^Animal_Insect/.test(a.name) ? 'material'
  : /^Item_(Cook|Roast|Boiled|Chilled|Ore)/.test(a.name) ? 'food' : a.profile === 'Item' ? 'material' : a.profile === 'Obj' || a.profile === 'Item_Other' ? 'key item' : a.profile?.toLowerCase());
insert('items', AI.filter((a) => FLAGS.has('IsGet_' + a.name) && TXT[a.name]?.Name).map((a) => ({
  id: a.name, name: TXT[a.name].Name, kind: kindOf(a), profile: a.profile, descr: TXT[a.name].Desc, sell: a.itemSellingPrice, buy: a.itemBuyingPrice,
  heal: a.cureItemHitPointRecover, effect: a.cureItemEffectType && a.cureItemEffectType !== 'None' ? a.cureItemEffectType : a.armorEffectEffectType !== 'None' ? a.armorEffectEffectType : null,
  effect_level: a.cureItemEffectLevel || a.armorEffectEffectLevel || null, attack: a.attackPower, guard: a.weaponCommonGuardPower,
  durability: /^Weapon/.test(a.profile) ? a.generalLife : null, got_flag: 'IsGet_' + a.name,
  spoiler_kind: 'item', spoiler_level: /^(Obj_DLC_|Obj_Hero|Obj_Photo|Get_TwnObj)/.test(a.name) ? 1 : 0,
})));

// armour upgrades: each piece's chain of Great Fairy levels and what each step costs (gear.json, read from the
// armour recipes in the game files).
const GEAR = json('data/gear.json');
insert('armor_upgrades', GEAR.armour.flatMap((p) => p.levels.map((l) => ({ piece: p.id, level_id: l.id, star: l.star, defense: l.def, sell: l.sell,
  materials: l.cost ? JSON.stringify(l.cost.map(([id, n]) => ({ id, name: nameOf(id), n }))) : null, slot: p.slot, series: p.series, set_bonus: p.setBonus ? 1 : 0,
  effect: p.effect || null, spoiler_kind: 'item', spoiler_level: 0 }))));

// recipes: the game's own cooking table. A recipe is a list of groups; each group is satisfied by any one of its
// actors or tags. Tags are hashed in the file, so they are shown as the ingredients that carry them.
const CD = byml(yaz0(boot.get('Cooking/CookData.sbyml')));
const TAGGED = new Map();
for (const a of AI) for (const t of Object.values(a.tags || {})) { const h = t >>> 0; if (TXT[a.name]?.Name && FLAGS.has('IsGet_' + a.name)) (TAGGED.get(h) || TAGGED.set(h, []).get(h)).push(a.name); }
const TAG = Object.fromEntries(['CookFruit', 'CookMushroom', 'CookPlant', 'CookMeat', 'CookFish', 'CookInsect', 'CookEnemy', 'CookOre', 'CookSpice', 'CookLowPrice',
  'CookEMedicine', 'CookFailure', 'CookGolden', 'CookSweet', 'CookSalt', 'CookMilk', 'CookButter', 'CookRice', 'CookWheat', 'CookEgg', 'CookOil',
  'CookFairy', 'CookDragon', 'CookVegetable', 'CookSugar', 'CookGoatButter', 'CookTabantha'].map((t) => [crc32(t), t]));
const group = (g, k) => [].concat(g).map((h) => { h >>>= 0; return k === 'a' ? { actor: BY_HASH.get(h), name: nameOf(BY_HASH.get(h)) } : { tag: TAG[h] || h.toString(16), any_of: (TAGGED.get(h) || []).length }; });
let rn = 0;
insert('recipes', [...CD.Recipes.map((r) => [r, 0]), ...CD.SingleRecipes.map((r) => [r, 1])].map(([r, single]) => {
  const dish = BY_HASH.get(r.Recipe >>> 0); need(dish, `dish for recipe hash ${r.Recipe >>> 0}`);
  const needs = [...[].concat(r.Actors || []).map((g) => ({ one_of: group(g, 'a') })), ...[].concat(r.Tags || []).map((g) => ({ one_of: group(g, 't') }))];
  return { n: rn++, dish: dish || '', dish_name: nameOf(dish), single, hearts: r.HB ?? null, needs: JSON.stringify(needs), spoiler_kind: 'item', spoiler_level: 0 };
}));
// CookVegetable sits beside CookPlant in the vegetable dishes but no ingredient carries it (any_of 0).
for (const r of [...CD.Recipes, ...CD.SingleRecipes]) for (const h of [].concat(r.Tags || []).flat()) if (!TAG[h >>> 0]) need(false, `name for recipe tag ${(h >>> 0).toString(16)}`);

// cook_items + cook_effects (BG3, botw_cook): each ingredient's own cooking numbers from ActorInfo and the effect
// table from CookData System, so the guide works dishes out the way the game does (hearts x LRMR, potency x rate).
// Same rules as botw-guide-mockups/tools/cookengine.mjs; the recipe match itself lives in Core's botw.ts.
const ING = /^(Item_(Fruit|Mushroom|Plant|PlantGet|Meat|FishGet|InsectGet|Material|Ore_H|Enemy|Chilled|ChilledFish|Roast|RoastFish|Boiled)|Animal_Insect_|BeeHome)/;
insert('cook_items', AI.filter((a) => ING.test(a.name) && TXT[a.name]?.Name).map((a) => ({
  id: a.name, name: TXT[a.name].Name, tags: JSON.stringify(Object.values(a.tags || {}).map((t) => TAG[t >>> 0]).filter(Boolean)),
  hp: a.cureItemHitPointRecover || 0, effect: a.cureItemEffectType && a.cureItemEffectType !== 'None' ? a.cureItemEffectType : null,
  potency: a.cureItemEffectLevel || 0, time: Math.round((a.cureItemEffectiveTime || 0) / 30), boost_time: a.cookSpiceBoostEffectiveTime || 0,
  boost_hp: a.cookSpiceBoostHitPointRecover || 0, boost_max: a.cookSpiceBoostMaxHeartLevel || 0, boost_stamina: a.cookSpiceBoostStaminaLevel || 0, buy: a.itemBuyingPrice || 0,
})));
// Two stamina entries are stored under hashes that are not crc32 of their names: matched by their limits (cookengine.mjs).
const CEI = new Map(CD.System.CEI.map((e) => [e.T >>> 0, e]));
const CEI_HASH = { MovingSpeed: crc32('AllSpeed'), GutsRecover: 3663771853, ExGutsMaxUp: 2930788100 };
insert('cook_effects', ['LifeMaxUp', 'GutsRecover', 'ExGutsMaxUp', 'ResistHot', 'ResistCold', 'ResistElectric', 'Fireproof', 'MovingSpeed', 'AttackUp', 'DefenseUp', 'Quietness']
  .map((effect) => { const c = CEI.get(CEI_HASH[effect] ?? crc32(effect)); need(c, `cook effect ${effect}`); return { effect, base_time: c?.BT ?? 0, min: c?.Mi, max: c?.Ma, rate: c?.MR }; }));

// shops (BG3, where-to-buy is a straight answer): who sells what and where, from the shop lists read earlier.
insert('shops', Object.entries(json('data/shops.json')).map(([npc, s]) => ({ npc, name: s.name, items: JSON.stringify(s.items), x: s.pts?.[0]?.[0], z: s.pts?.[0]?.[1],
  spoiler_kind: 'item', spoiler_level: 0 })));

// compendium: the game's 394 IsRegisteredPictureBook_ flags. Numbers from the Hyrule Compendium API (389 entries),
// joined by English name; the 5 Master Mode entries (Golden Bokoblin/Moblin/Lizalfos/Lynel, Sky Octorok) keep a null.
const api = await cached('compendium_api.json', async () => (await getJson('https://api.hyrule-compendium.com/v3/compendium/all')).data);
const norm = (s) => s.toLowerCase().replace(/[‘’]/g, "'");
const API = new Map(api.map((e) => [norm(e.name), e]));
API.set('luminous stone deposit', API.get('luminous ore deposit')); // the API's own name for it
const CAT = (a) => /^(Animal|Bird|Fish|Insect|Horse)/.test(a?.profile || '') || /^Animal_|^Item_(Fish|Insect)|^Horse/.test(a?.name || '') ? 'creatures'
  : /Enemy|Guardian|Golem|Giant|Sandworm|Lynel/.test(a?.profile || '') ? 'monsters' : /^(Weapon|Armor|Arrow)/.test(a?.profile || '') ? 'equipment' : /^Item_/.test(a?.name || '') ? 'materials' : 'treasure';
const STORY_BOSS = /Ganon|Ganondorf|SiteBoss|Enemy_GanonBeast/;
insert('compendium', [...FLAGS.keys()].filter((f) => f.startsWith('IsRegisteredPictureBook_')).map((flag) => {
  const actor = flag.slice(24), nm = TXT[actor]?.Name, e = nm && API.get(norm(nm));
  need(nm, `name for compendium ${actor}`);
  return { actor, number: e?.id ?? null, name: nm || null, category: e?.category || CAT(ACTOR.get(actor)), descr: TXT[actor]?.PictureBook || null, flag,
    spoiler_kind: STORY_BOSS.test(actor) ? 'story' : 'item', spoiler_level: STORY_BOSS.test(actor) ? 3 : 0 };
}));

// enemies: every actor the game keeps a kill counter for (Defeated_<actor>_Num), plus named Enemy-profile actors.
const killed = new Set([...FLAGS.keys()].map((f) => f.match(/^Defeated_(.*)_Num$/)?.[1]).filter(Boolean));
insert('enemies', AI.filter((a) => killed.has(a.name) || (/Enemy|Guardian/.test(a.profile || '') && TXT[a.name]?.Name)).map((a) => ({
  id: a.name, name: nameOf(a.name), profile: a.profile, life: a.generalLife, attack: a.attackPower, rank: a.enemyRank,
  drops: a.drops ? JSON.stringify(Object.fromEntries(Object.entries(a.drops).map(([t, ids]) => [t, ids.map((id) => ({ id, name: nameOf(id) }))]))) : null,
  areas: a.homeArea ? a.homeArea.map((h) => h.name).filter(Boolean).join(',') : null, kill_flag: killed.has(a.name) ? `Defeated_${a.name}_Num` : null,
  spoiler_kind: STORY_BOSS.test(a.name) ? 'story' : 'mechanics', spoiler_level: STORY_BOSS.test(a.name) ? 3 : 0,
})));

// names: one lookup for "what is X called" across actors, places, shrines and quests.
const names = [];
for (const [id, t] of Object.entries(TXT)) if (t.Name) names.push({ id, name: t.Name, source: 'actor', spoiler_kind: 'item', spoiler_level: 0 });
for (const [id, n] of Object.entries(PLACE)) names.push({ id, name: n, source: 'place', spoiler_kind: 'location', spoiler_level: 0 });
for (const [id, n] of Object.entries(DMSG)) if (/^Dungeon\d+$/.test(id) && tidy(n)) names.push({ id, name: tidy(n), source: 'shrine', spoiler_kind: 'location', spoiler_level: 1 });
for (const q of QL) { const n = tidy(qtext(q.Name, 'Name')); if (n) names.push({ id: q.Name, name: n, source: 'quest', spoiler_kind: 'story', spoiler_level: 1 }); }
insert('names', names);

const meta = { pack_version: PACK_VERSION, built: new Date().toISOString(), game: 'BotW Wii U v1.5.0 + DLC (Cemu)', flags: FLAGS.size, cook_lrmr: CD.System.LRMR, missing: JSON.stringify(missing) };
insert('meta', Object.entries(meta).map(([key, value]) => ({ key, value: String(value) })));
db.exec('COMMIT');
db.close();
rmSync(DB, { force: true }); renameSync(TMP, DB);

const check = new DatabaseSync(DB, { readOnly: true });
for (const t of ['shrines', 'towers', 'koroks', 'places', 'quests', 'quest_steps', 'items', 'armor_upgrades', 'recipes', 'cook_items', 'cook_effects', 'shops', 'compendium', 'enemies', 'names'])
  console.log(t.padEnd(15), check.prepare(`SELECT count(*) n FROM ${t}`).get().n);
check.close();
console.log(missing.length ? `missing (${missing.length}):\n  ${missing.slice(0, 30).join('\n  ')}` : 'nothing missing');
console.log('wrote', DB);

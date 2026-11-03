// BG1 + E1/E2 check: the data pack's counts, and every table held against his real save (docs/BOTW-GUIDE.md,
// docs/BOTW-ENGINE.md). E2 reads all six slots (copies) and shows what each has opened and met.
//
//   node scripts/botw-pack-check.mjs [--db <botw.db>] [--saves <Cemu user folder>]
//
// The save is never opened in place: the newest slot is copied to a temp file first, and only the copy is read.
// A table "matches" his save when every save flag it names exists in it (the Wii U save stores a CRC32 of each
// flag name), which proves the Switch-sourced game data lines up with his Wii U build. Prints counts, no save
// contents beyond totals.
import { DatabaseSync } from 'node:sqlite';
import { copyFileSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { crc32 } from 'node:zlib';
import { tmpdir } from 'node:os';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const DB = arg('--db', path.join(process.env.LOCALAPPDATA || '', 'Aang', 'botw', 'botw.db'));
const SAVES = arg('--saves', 'C:/Games/Cemu/portable/mlc01/usr/save/00050000/101c9400/user/80000001');
const db = new DatabaseSync(DB, { readOnly: true });
const all = (sql) => db.prepare(sql).all(), one = (sql) => db.prepare(sql).get();
let bad = 0;
const ok = (cond, line) => { if (!cond) bad++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${line}`); };

// ---- counts the plan names ----
const EXPECT = [
  ['base shrines', "SELECT count(*) n FROM shrines WHERE dlc = 0", 120],
  ["Champions' Ballad shrines", "SELECT count(*) n FROM shrines WHERE dlc = 1", 16],
  ['Koroks', 'SELECT count(*) n FROM koroks', 900],
  ['Koroks with a puzzle type', 'SELECT count(*) n FROM koroks WHERE puzzle IS NOT NULL', 900],
  ['towers', 'SELECT count(*) n FROM towers', 15],
  ['main quests (base)', "SELECT count(*) n FROM quests WHERE type = 'main' AND dlc = 0", 15],
  ['side quests (base, without the Xenoblade 2 tie-in)', "SELECT count(*) n FROM quests WHERE type = 'side' AND dlc = 0 AND collab = 0", 76],
  ['shrine quests', "SELECT count(*) n FROM quests WHERE type = 'shrine'", 42],
  ['compendium flags', 'SELECT count(*) n FROM compendium', 394],
  ['quest steps', 'SELECT count(*) n FROM quest_steps', 627],
];
console.log('== counts');
for (const [what, sql, n] of EXPECT) { const got = one(sql).n; ok(got === n, `${what}: ${got}${got === n ? '' : ` (want ${n})`}`); }
for (const t of ['places', 'items', 'armor_upgrades', 'recipes', 'enemies', 'names']) console.log(`     ${t}: ${one(`SELECT count(*) n FROM ${t}`).n}`);
// cook_items and cook_effects (BG3) are the cooking maths, not things to say: no spoiler columns
const unset = all("SELECT name FROM sqlite_master WHERE type = 'table' AND sql LIKE '%spoiler_kind%'").filter(({ name }) =>
  one(`SELECT count(*) n FROM ${name} WHERE spoiler_kind IS NULL OR spoiler_level NOT BETWEEN 0 AND 3`).n);
ok(!unset.length, `spoiler kind + level on every row${unset.length ? ` (not in ${unset.map((t) => t.name)})` : ''}`);

// ---- his save: copy the newest slot, read the copy ----
const slots = readdirSync(SAVES).filter((d) => /^\d$/.test(d)).map((d) => path.join(SAVES, d, 'game_data.sav'))
  .map((f) => { try { return { f, t: statSync(f).mtimeMs }; } catch { return null; } }).filter(Boolean).sort((a, b) => b.t - a.t);
const copy = path.join(tmpdir(), `botw-check-${process.pid}.sav`);
copyFileSync(slots[0].f, copy);
const buf = readFileSync(copy); rmSync(copy);
const SAVE = new Map(); // hash -> [u32 values, in order]
for (let o = 12; o + 8 <= buf.length - 4; o += 8) { const h = buf.readUInt32BE(o); (SAVE.get(h) || SAVE.set(h, []).get(h)).push(buf.readUInt32BE(o + 4)); }
const has = (flag) => SAVE.has(crc32(flag));
const val = (flag) => SAVE.get(crc32(flag))?.[0] ?? 0;
const str64s = (flag) => { const v = SAVE.get(crc32(flag)) || [], out = [];
  for (let i = 0; i < v.length; i += 16) { const b = Buffer.alloc(64); v.slice(i, i + 16).forEach((x, k) => b.writeUInt32BE(x, k * 4)); out.push(b.toString('latin1').replace(/\0.*$/s, '')); }
  return out.filter(Boolean); };
console.log(`\n== his save (slot ${path.basename(path.dirname(slots[0].f))}, ${new Date(slots[0].t).toLocaleString()}, read from a copy)`);
const inSave = (table, col, where = '1') => { const rows = all(`SELECT ${col} f FROM ${table} WHERE ${where} AND f IS NOT NULL`); const miss = rows.filter((r) => !has(r.f)); return { n: rows.length, miss: miss.map((r) => r.f) }; };
const report = (label, r, extra) => ok(!r.miss.length, `${label}: ${r.n - r.miss.length}/${r.n} flags in his save${r.miss.length ? ` (missing e.g. ${r.miss.slice(0, 3)})` : ''}${extra ? ' · ' + extra : ''}`);

const sf = inSave('shrines', 'found_flag'), sd = inSave('shrines', 'done_flag');
const found = all('SELECT found_flag f, dlc FROM shrines').filter((r) => val(r.f) > 0), done = all('SELECT done_flag f, dlc FROM shrines').filter((r) => val(r.f));
report('shrines found', sf, `he found ${found.filter((r) => !r.dlc).length}/120 + ${found.filter((r) => r.dlc).length}/16`);
report('shrines done', sd, `he finished ${done.filter((r) => !r.dlc).length}/120 + ${done.filter((r) => r.dlc).length}/16`);
const tw = inSave('towers', 'done_flag');
report('towers', tw, `he activated ${all('SELECT done_flag f FROM towers').filter((r) => val(r.f)).length}/15`);
const kk = inSave('koroks', 'flag'), seeds = all('SELECT flag f FROM koroks').filter((r) => val(r.f)).length;
report('Koroks', kk, `${seeds} found by flag`);
ok(seeds === val('HiddenKorok_Number'), `Korok flags agree with the seed counter (HiddenKorok_Number = ${val('HiddenKorok_Number')})`);
const pl = inSave('places', 'DISTINCT flag');
report('places', pl, `he visited ${all('SELECT DISTINCT flag f FROM places WHERE flag IS NOT NULL').filter((r) => val(r.f) > 0).length}`);

// quests: every step flag the game saves should be in his save, and none it does not save
const stepFlags = (saved) => all(`SELECT next_flag f FROM quest_steps WHERE saved = ${saved} AND next_flag IS NOT NULL AND next_flag != ''`);
const qs = stepFlags(1), qmiss = qs.filter((r) => !has(r.f)), qr = stepFlags(0), qleak = qr.filter((r) => has(r.f));
ok(!qmiss.length, `quest step flags: ${qs.length - qmiss.length}/${qs.length} saved ones in his save${qmiss.length ? ` (missing e.g. ${qmiss.slice(0, 3).map((r) => r.f)})` : ''}`);
ok(!qleak.length, `runtime-only step flags: ${qleak.length}/${qr.length} in his save (should be 0)`);
const lastFlag = new Map(all('SELECT quest_id, next_flag FROM quest_steps s WHERE n = (SELECT max(n) FROM quest_steps WHERE quest_id = s.quest_id)').map((r) => [r.quest_id, r.next_flag]));
const qdone = (type) => all(`SELECT id FROM quests WHERE type = '${type}'`).filter((q) => lastFlag.get(q.id) && val(lastFlag.get(q.id))).length;
console.log(`     quests done: main ${qdone('main')}, shrine ${qdone('shrine')}, side ${qdone('side')}`);

const cp = inSave('compendium', 'flag');
report('compendium', cp, `${all('SELECT flag f FROM compendium').filter((r) => val(r.f)).length} registered`);
// IsGet_Obj_AmiiboItem lives in option.sav with the settings, not in game_data.sav (one of 54 such flags)
const it = inSave('items', 'got_flag', "got_flag != 'IsGet_Obj_AmiiboItem'");
report('items', it, `he has ever picked up ${all('SELECT got_flag f FROM items').filter((r) => val(r.f)).length}`);
const ITEM = new Set(all('SELECT id FROM items').map((r) => r.id)), bag = str64s('PorchItem');
const loose = bag.filter((id) => !ITEM.has(id));
ok(!loose.length, `his bag: ${bag.length - loose.length}/${bag.length} slots name an item in the pack${loose.length ? ` (unknown: ${[...new Set(loose)].slice(0, 5)})` : ''}`);
const en = inSave('enemies', 'kill_flag');
report('enemies', en, `${all('SELECT kill_flag f FROM enemies WHERE kill_flag IS NOT NULL').reduce((s, r) => s + val(r.f), 0)} kills counted`);
const armor = all('SELECT level_id FROM armor_upgrades'), armorLoose = armor.filter((r) => !ITEM.has(r.level_id));
const worn = bag.filter((id) => /^Armor_/.test(id)), wornIn = worn.filter((id) => armor.some((r) => r.level_id === id));
ok(!armorLoose.length && wornIn.length === worn.length, `armour upgrades: ${armor.length - armorLoose.length}/${armor.length} levels are items; ${wornIn.length}/${worn.length} armour pieces in his bag found in the upgrade chains`);
const dishes = all('SELECT DISTINCT dish FROM recipes'), dishLoose = dishes.filter((r) => !ITEM.has(r.dish));
ok(!dishLoose.length, `recipes: ${dishes.length - dishLoose.length}/${dishes.length} dishes are items with IsGet flags${dishLoose.length ? ` (not: ${dishLoose.slice(0, 5).map((r) => r.dish)})` : ''}`);

// ---- E1: the world's sources (docs/BOTW-ENGINE.md) ----
console.log('\n== E1 counts (against the game files and the game\'s known totals)');
const E1 = [
  ['chests, every TBox in every map unit', 'SELECT count(*) n FROM chests', 1611],
  ['chests in the base game (normal mode, no DLC)', 'SELECT count(*) n FROM chests WHERE dlc = 0 AND master_mode = 0', 1392],
  ['Master Mode-only chests', 'SELECT count(*) n FROM chests WHERE master_mode = 1', 120],
  ['shrine chests', "SELECT count(*) n FROM chests WHERE kind = 'shrine'", 205],
  ['Divine Beast chests', "SELECT count(*) n FROM chests WHERE kind = 'divine beast'", 35],
  ['Trial of the Sword chests (normal mode)', "SELECT count(*) n FROM chests WHERE kind = 'trial of the sword' AND master_mode = 0", 47],
  ['chests without a save flag (the Gamble minigame)', 'SELECT count(*) n FROM chests WHERE flag IS NULL', 3],
  ['chests whose item has no name', 'SELECT count(*) n FROM chests WHERE item IS NOT NULL AND item_name IS NULL', 0],
  ['locked camp chests (TBox_Field_Enemy)', "SELECT count(*) n FROM chests WHERE actor = 'TBox_Field_Enemy'", 54],
  ['Great Fairies (4 fountains + Malanya)', 'SELECT count(*) n FROM great_fairies', 5],
  ['Goddess statues he can pray at', "SELECT count(*) n FROM goddess_statues WHERE kind = 'prayable'", 11],
  ['stables', 'SELECT count(*) n FROM stables', 15],
  ['memory spots (Impa\'s 12 photos + the 13th)', 'SELECT count(*) n FROM memories', 13],
  ['memory spots with their cutscene flag', 'SELECT count(*) n FROM memories WHERE seen_flag IS NOT NULL', 13],
  ['Hinox + Stalnox (base, normal mode)', "SELECT count(*) n FROM bosses WHERE kind IN ('Hinox','Stalnox') AND map = 'MainField' AND master_mode = 0", 40],
  ['Talus (base, normal mode)', "SELECT count(*) n FROM bosses WHERE kind = 'Talus' AND map = 'MainField' AND master_mode = 0 AND dlc = 0", 40],
  ['Molduga (base)', "SELECT count(*) n FROM bosses WHERE kind = 'Molduga' AND dlc = 0", 4],
  ['shops joined to a person', 'SELECT count(*) n FROM shops JOIN people ON people.id = shops.npc', one('SELECT count(*) n FROM shops').n],
];
for (const [what, sql, n] of E1) { const got = one(sql).n; ok(got === n, `${what}: ${got}${got === n ? '' : ` (want ${n})`}`); }
const memTitles = JSON.parse(one("SELECT value FROM meta WHERE key = 'memory_titles'").value);
ok(memTitles.length === 18 && memTitles.every(Boolean), `album titles: ${memTitles.length} (the game's 18 captured memories)`);
const flagged = (table, col) => all(`SELECT ${col} f FROM ${table} WHERE ${col} IS NOT NULL`);
for (const [t, c] of [['chests', 'flag'], ['people', 'met_flag'], ['bosses', 'defeat_flag'], ['memories', 'seen_flag'], ['great_fairies', 'revive_flag']]) {
  const r = flagged(t, c), miss = r.filter((x) => !has(x.f));
  ok(!miss.length, `${t}.${c}: ${r.length - miss.length}/${r.length} in his save${miss.length ? ` (missing e.g. ${miss.slice(0, 3).map((x) => x.f)})` : ''}`);
}
const ppl = one("SELECT count(*) n, sum(name IS NOT NULL) named, sum(met_flag IS NOT NULL) met, sum(schedule IS NOT NULL) sch, sum(day_cycle) cyc FROM people WHERE kind != 'monk'");
console.log(`     people: ${ppl.n} (${ppl.named} named, ${ppl.met} with a met flag, ${ppl.sch} with a schedule, ${ppl.cyc} whose day changes by the hour)`);
for (const k of ['field', 'buried', 'under water', 'camp']) console.log(`     ${k} chests (normal mode): ${one(`SELECT count(*) n FROM chests WHERE kind = '${k}' AND master_mode = 0`).n}`);
// a second reading of the same game files: radar.zeldamods.org's object index (the Switch v1.6 files), fetched once
const radarFile = path.join(path.dirname(DB), 'cache', 'radar_tbox.json');
let radar = null;
try { radar = JSON.parse(readFileSync(radarFile, 'utf8')); } catch {
  try {
    radar = {};
    for (const m of ['MainField', 'CDungeon', 'MainFieldDungeon', 'AocField']) {
      const r = await fetch(`https://radar.zeldamods.org/objs/${m}?q=TBox&limit=5000`, { headers: { 'user-agent': 'aang-personal-botw-guide (one-off, private)' } });
      radar[m] = (await r.json()).filter((o) => /^TBox/.test(o.name)).map((o) => o.hash_id);
    }
    writeFileSync(radarFile, JSON.stringify(radar));
  } catch (e) { radar = null; console.log(`     radar not reachable (${e.message}): second reading skipped`); }
}
if (radar) for (const [m, hs] of Object.entries(radar)) {
  const ours = new Set(all(`SELECT hash_id h FROM chests WHERE map = '${m}'`).map((r) => r.h)), theirs = new Set(hs);
  const onlyOurs = [...ours].filter((h) => !theirs.has(h)), onlyTheirs = [...theirs].filter((h) => !ours.has(h));
  console.log(`     radar ${m}: ours ${ours.size}, radar ${theirs.size}, same ${ours.size - onlyOurs.length}${onlyOurs.length ? `, only ours ${onlyOurs.length}` : ''}${onlyTheirs.length ? `, only radar ${onlyTheirs.length}` : ''}`);
}

// ---- the DLC (BOTW-ENGINE 4c) and quests as goals (4b) ----
console.log('\n== DLC and quest steps');
for (const t of ['items', 'enemies', 'compendium', 'armor_upgrades', 'places', 'chests', 'people', 'quests', 'shrines']) console.log(`     ${t}: ${one(`SELECT sum(dlc) n FROM ${t}`).n} DLC rows`);
ok(one("SELECT count(*) n FROM items WHERE dlc = 1 AND name IN ('Travel Medallion', 'Korok Mask', 'Master Cycle Zero', 'One-Hit Obliterator')").n === 4, 'DLC key items tagged (Travel Medallion, Korok Mask, Master Cycle Zero, One-Hit Obliterator)');
ok(one("SELECT count(*) n FROM items WHERE dlc = 1 AND name LIKE 'Salvager%'").n === 0, 'free-update gear (the Xenoblade 2 Salvager set) is not DLC');
// AoC_HardMode_Enabled is written only into a Master Mode save; every other DLC mark is in his normal-mode save
// MiniGame100enemy (the Trial of the Sword's run itself) saves none of its steps: no done flag, tracked by the 3 trials
const dl = all("SELECT id, done_flag f FROM dlc_things WHERE id != 'MasterMode' AND done_flag IS NOT NULL"), dlMiss = dl.filter((r) => !has(r.f));
console.log(`     dlc_things without a done flag: ${all('SELECT id FROM dlc_things WHERE done_flag IS NULL').map((r) => r.id).join(', ') || 'none'}`);
ok(!dlMiss.length, `dlc_things: ${dl.length - dlMiss.length}/${dl.length} done flags in his save${dlMiss.length ? ` (missing ${dlMiss.slice(0, 3).map((r) => r.f)})` : ''} · he has done ${dl.filter((r) => val(r.f)).length}`);
ok(!has('AoC_HardMode_Enabled'), 'his newest save is normal mode (no Master Mode mark)');
const st = one("SELECT count(*) n, sum(people IS NOT NULL) p, sum(hours IS NOT NULL) h, sum(hours LIKE '%\"step\"%') own FROM quest_steps");
console.log(`     quest steps: ${st.p}/${st.n} name their people, ${st.h} with hours (${st.own} from the step's own timeline); ${one('SELECT count(*) n FROM quests WHERE unlocks IS NOT NULL').n} quests unlock another; rewards: not in the quest files (event flows)`);

// where people are: the flags their schedules and placements wait on
const cflags = new Set(), walk = (c) => { if (c.flag) cflags.add(c.flag); (c.of || []).forEach(walk); };
let spots = 0, conds = 0;
for (const r of all('SELECT schedule, places FROM people')) {
  if (r.schedule) for (const w of JSON.parse(r.schedule).when) cflags.add(w.flag);
  for (const p of JSON.parse(r.places)) { spots++; const c = [...(p.appears || []), ...(p.vanishes || [])]; if (c.length) conds++; c.forEach(walk); }
}
const cIn = [...cflags].filter(has);
console.log(`     people's spots: ${spots}, ${conds} with an appear / vanish condition; ${cflags.size} condition flags, ${cIn.length} kept in the save, ${cIn.filter((f) => val(f)).length} set in his`);

// ---- E2: tracking, every slot (copies) ----
console.log('\n== E2 tracking: chests opened and people met, every slot (read from copies)');
const readCopy = (f) => { const c = path.join(tmpdir(), `botw-check-${process.pid}-${path.basename(path.dirname(f))}.sav`); copyFileSync(f, c); const b = readFileSync(c); rmSync(c);
  const m = new Map(); for (let o = 12; o + 8 <= b.length - 4; o += 8) { const h = b.readUInt32BE(o); if (!m.has(h)) m.set(h, b.readUInt32BE(o + 4)); } return m; };
const CH = all('SELECT hash_id, flag, kind, chests.near, coalesce(shrines.name, shrine) shrine, item_name FROM chests LEFT JOIN shrines ON shrines.id = chests.shrine WHERE flag IS NOT NULL'), PE = all('SELECT id, name, met_flag f FROM people WHERE met_flag IS NOT NULL');
const per = slots.map(({ f, t }) => { const m = readCopy(f); const on = (fl) => (m.get(crc32(fl)) ?? 0) !== 0;
  return { slot: path.basename(path.dirname(f)), t, play: m.get(crc32('PlayReport_PlayTime')) ?? 0, chests: CH.filter((c) => on(c.flag)), met: PE.filter((p) => on(p.f)) }; })
  .sort((a, b) => a.play - b.play);
for (const s of per) console.log(`     slot ${s.slot} (played ${Math.round(s.play / 60)} min): ${s.chests.length} chests opened (${s.chests.filter((c) => c.kind === 'shrine').length} in shrines), ${s.met.length} people met`);
// never lost: what an older save has opened, every newer save has too (a chest stays open, a name stays known)
let lost = 0;
for (let i = 1; i < per.length; i++) for (const k of ['chests', 'met']) { lost += per[i - 1][k].filter((x) => !per[i][k].some((y) => y === x)).length; }
ok(!lost, `nothing opened or met in an older save is missing from a newer one (${lost} lost)`);
const [first, last] = [per[0], per.at(-1)], newCh = last.chests.filter((c) => !first.chests.includes(c)), newMet = last.met.filter((p) => !first.met.includes(p));
ok(newCh.length > 0, `chests opened after slot ${first.slot} by slot ${last.slot}: ${newCh.length} (${newCh.map((c) => `${c.item_name} in ${c.kind} ${c.shrine || c.near}`).join(', ')})`);
console.log(`     people met after slot ${first.slot} by slot ${last.slot}: ${newMet.length}${newMet.length ? ` (${newMet.map((p) => p.name || p.id).join(', ')})` : ''}`);

console.log(bad ? `\n${bad} check(s) failed` : '\nall checks pass');
process.exitCode = bad ? 1 : 0;

// BG1 check: the data pack's counts, and every table held against his real save (docs/BOTW-GUIDE.md).
//
//   node scripts/botw-pack-check.mjs [--db <botw.db>] [--saves <Cemu user folder>]
//
// The save is never opened in place: the newest slot is copied to a temp file first, and only the copy is read.
// A table "matches" his save when every save flag it names exists in it (the Wii U save stores a CRC32 of each
// flag name), which proves the Switch-sourced game data lines up with his Wii U build. Prints counts, no save
// contents beyond totals.
import { DatabaseSync } from 'node:sqlite';
import { copyFileSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
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
const unset = all("SELECT name FROM sqlite_master WHERE type = 'table' AND name != 'meta'").filter(({ name }) =>
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

console.log(bad ? `\n${bad} check(s) failed` : '\nall checks pass');
process.exitCode = bad ? 1 : 0;

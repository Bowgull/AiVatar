// BG2 + BG6: the BotW save reader, the session watcher and "Where was I?". Two kinds of save:
//   - his six real slots, COPIED from Cemu into a temp folder first (skipped on a machine without them or botw.db);
//     nothing of his is kept in the repo (public), and the originals are checked untouched afterwards.
//   - small made-up saves in the same format, for the diff, the line and the session rules.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync as mkdtemp, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { crc32 } from 'node:zlib';
import { diffStates, heroPath, loadCatalog, parseState, todayLine, type BotwState, type Catalog } from '../src/botwsave.ts';
import { BotwWatch, STILL_MS, botwPaths, isWhereWasI, meansBotw, nearNotes, readBotwSessions, readBotwState, readNewest, slots, whereSaved } from '../src/botwwatch.ts';

const CEMU = 'C:/Games/Cemu/portable/mlc01/usr/save/00050000/101c9400/user/80000001';
const DB = botwPaths().db;
const real = existsSync(CEMU) && existsSync(DB);
/** Every temp folder a test makes, removed at the end (his disk fills up). */
const made: string[] = [];
const mkdtempSync = (prefix: string): string => { const d = mkdtemp(prefix); made.push(d); return d; };
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });

/** His save folder copied (slots, captions, Hero's Path) with the files' times kept. */
function copyHisSaves(): string {
  const to = mkdtempSync(path.join(tmpdir(), 'aang-botw-real-'));
  const cp = (rel: string) => {
    const from = path.join(CEMU, rel);
    if (!existsSync(from)) return;
    mkdirSync(path.dirname(path.join(to, rel)), { recursive: true });
    copyFileSync(from, path.join(to, rel));
    const st = statSync(from); utimesSync(path.join(to, rel), st.atime, st.mtime);
  };
  for (let i = 0; i < 6; i++) { cp(`${i}/game_data.sav`); cp(`${i}/caption.sav`); }
  for (const f of readdirSync(path.join(CEMU, 'tracker'))) cp(`tracker/${f}`);
  return to;
}
const fingerprint = (dir: string) => Array.from({ length: 6 }, (_, i) => path.join(dir, String(i), 'game_data.sav')).filter(existsSync)
  .map(f => `${statSync(f).mtimeMs}:${createHash('sha1').update(readFileSync(f)).digest('hex')}`).join('|');

test('his six real slots: every one reads, and agrees with itself', { skip: !real && 'no Cemu saves or botw.db here' }, () => {
  const before = fingerprint(CEMU);
  const dir = copyHisSaves();
  const cat = loadCatalog(DB);
  const tracks = readdirSync(path.join(dir, 'tracker')).map(f => readFileSync(path.join(dir, 'tracker', f)));
  const path0 = heroPath(tracks);
  for (const s of slots(dir)) {
    const st = parseState({ save: readFileSync(s.file), caption: readFileSync(path.join(path.dirname(s.file), 'caption.sav')), slot: s.slot, savedAt: s.t }, cat);
    assert.match(st.version, /^v1\.[56]$/, `slot ${s.slot} header`);
    assert.ok(st.playtime > 3600, `slot ${s.slot} playtime`);
    assert.equal(st.koroks.found.length, st.koroks.seeds, `slot ${s.slot}: Korok flags = the seed counter`);
    assert.ok(st.shrines.done.every(id => st.shrines.found.includes(id)), `slot ${s.slot}: every shrine done was found`);
    assert.ok(st.towers.active.every(id => st.towers.found.includes(id)), `slot ${s.slot}: every active tower was found`);
    assert.ok(st.hearts.max >= 3 && st.stamina.max >= 1, `slot ${s.slot} hearts/stamina`);
    assert.equal(st.pos.map, 'MainField'); assert.match(st.pos.square, /^[A-J]-[1-8]$/);
    assert.ok(st.gear.length > 0 && st.gear.every(g => g.name && g.kind), `slot ${s.slot}: every bag item has a name and kind`);
    assert.ok(st.gear.some(g => g.equipped), `slot ${s.slot}: something is equipped`);
    assert.ok(st.quests.some(q => q.id === 'FirstTower'), `slot ${s.slot}: the first quest is started`);
    assert.ok(st.quests.every(q => q.step <= q.steps && (q.done === (q.step === q.steps))), `slot ${s.slot}: quest steps in range`);
    assert.ok(st.clock.day > 0 && st.clock.hour >= 0 && st.clock.hour < 24, `slot ${s.slot} clock`);
  }
  // Hero's Path ends where the newest save stands
  const newest = readNewest({ saves: dir, dir, db: DB }, cat)!;
  const last = path0.at(-1)!;
  assert.ok(path0.length > 1000, 'Hero\'s Path has his walk');
  assert.ok(Math.abs(last[0] - newest.pos.x) <= 2 && Math.abs(last[1] - newest.pos.z) <= 2, `path ends at ${last}, saved at ${newest.pos.x},${newest.pos.z}`);
  assert.equal(newest.heroPath?.points.length, path0.length);
  // reading never touched the originals
  assert.equal(fingerprint(CEMU), before);
  // the oldest slot against the newest gives a line, and it says nothing about what is left
  const all = slots(dir), oldest = all.at(-1)!;
  const old = parseState({ save: readFileSync(oldest.file), slot: oldest.slot, savedAt: oldest.t }, cat);
  const line = todayLine(diffStates(old, newest));
  assert.match(line ?? '', /^Today: /);
  assert.doesNotMatch(line ?? '', /left|remain|to go|of 120|\/900/i);
  // "where was I" names only places his save shows
  const where = whereSaved(newest, { shrine: new Map([[newest.pos.label, 'Test Shrine']]), place: [] });
  assert.ok(where.length > 3);
});

test('E2: his six real slots: chests opened and people met only ever grow, and a newer save shows more', { skip: !real && 'no Cemu saves or botw.db here' }, () => {
  const dir = copyHisSaves();
  const cat = loadCatalog(DB);
  if (!cat.chests?.length) return; // a pack older than E1
  assert.ok(cat.chests.length > 1600 && cat.people!.length > 300, `catalog: ${cat.chests.length} chests, ${cat.people!.length} people`);
  const states = slots(dir).map(s => parseState({ save: readFileSync(s.file), slot: s.slot, savedAt: s.t }, cat)).sort((a, b) => a.playtime - b.playtime);
  const known = new Set(cat.chests.map(c => c.hash));
  for (let i = 0; i < states.length; i++) {
    const st = states[i]!;
    assert.ok(st.chests.opened.length > 0 && st.chests.opened.every(h => known.has(h)), `slot ${st.slot}: opened chests are botw.db chests`);
    assert.ok(st.people.met.includes('Npc_Kakariko001'), `slot ${st.slot}: he has met Impa`);
    assert.ok(st.people.flags.includes('Npc_Kakariko001_Talk'), `slot ${st.slot}: Impa's night-time schedule is on (he has talked to her)`);
    // he has not started either add-on yet, and plays normal mode
    assert.deepEqual(st.dlc, { masterMode: false, trialOfTheSword: { beginning: false, middle: false, final: false }, ballad: { champions: [], done: false }, finalTrial: false, mazKoshia: false }, `slot ${st.slot} dlc`);
    if (!i) continue;
    const prev = states[i - 1]!;
    assert.ok(prev.chests.opened.every(h => st.chests.opened.includes(h)), `slot ${prev.slot} -> ${st.slot}: no chest closes again`);
    assert.ok(prev.people.met.every(id => st.people.met.includes(id)), `slot ${prev.slot} -> ${st.slot}: no one is forgotten`);
  }
  const d = diffStates(states[0]!, states.at(-1)!);
  assert.equal(d.chests.length, states.at(-1)!.chests.opened.length - states[0]!.chests.opened.length);
  assert.ok(d.chests.length > 0, 'his oldest and newest slots differ by at least one chest');
});

// ------------------------------------------------------------------ made-up saves

/** A save in the real format: header, (crc32(name), value) records sorted by hash, a 4-byte tail. */
function makeSave(flags: Record<string, number | number[]>, version = 0x471b): Buffer {
  const recs: [number, number][] = [];
  for (const [k, v] of Object.entries(flags)) for (const x of Array.isArray(v) ? v : [v]) recs.push([crc32(k), x >>> 0]);
  recs.sort((a, b) => a[0] - b[0]);
  const b = Buffer.alloc(12 + recs.length * 8 + 4);
  b.writeUInt32BE(version, 0); b.writeUInt32BE(0xffffffff, 4); b.writeUInt32BE(1, 8);
  recs.forEach(([h, v], i) => { b.writeUInt32BE(h, 12 + i * 8); b.writeUInt32BE(v, 16 + i * 8); });
  return b;
}
const f32 = (n: number) => { const b = Buffer.alloc(4); b.writeFloatBE(n); return b.readUInt32BE(0); };
const str = (s: string, per: number) => { const b = Buffer.alloc(per * 4); b.write(s, 'latin1'); return Array.from({ length: per }, (_, i) => b.readUInt32BE(i * 4)); };

const CAT: Catalog = {
  shrines: Array.from({ length: 5 }, (_, i) => ({ id: `Dungeon00${i}`, found: `Location_Dungeon00${i}`, done: `Clear_Dungeon00${i}` })),
  towers: [{ id: 'MapTower_01', found: 'Location_MapTower01', done: 'MapTower_01' }, { id: 'MapTower_02', found: 'Location_MapTower02', done: 'MapTower_02' }],
  koroks: Array.from({ length: 20 }, (_, i) => ({ hash: 1000 + i, flag: `MainField_Npc_HiddenKorokGround_${1000 + i}` })),
  places: ['Location_Kakariko', 'Location_Hateno'],
  dishes: [{ id: 'Item_Cook_A_01', flag: 'IsGet_Item_Cook_A_01' }],
  chests: [{ hash: 11, flag: 'MainField_TBox_Field_Iron_11' }, { hash: 22, flag: 'CDungeon_TBox_Dungeon_Stone_22' }],
  people: [{ id: 'Npc_Kakariko001', flag: 'Npc_Kakariko001_DispNameFlag' }, { id: 'Npc_Road_024', flag: 'Npc_Road_024_DispNameFlag' }],
  quests: [{ id: 'Q1', type: 'side', steps: [{ n: 0, flag: 'Q1_Activated' }, { n: 1, flag: 'Q1_Finish' }] }],
  items: new Map([['Weapon_Sword_001', { name: 'Traveler\'s Sword', kind: 'one-handed' }]]),
};

/** A made-up game: how many shrines done, Koroks found, towers, and so on. */
function game(o: { shrines?: number; koroks?: number; towers?: number; quest?: 0 | 1 | 2; hearts?: number; time?: number; x?: number; z?: number; dish?: boolean; chests?: number; met?: number }): Buffer {
  const f: Record<string, number | number[]> = {
    PlayReport_PlayTime: o.time ?? 3600, MaxHartValue: (o.hearts ?? 3) * 4, CurrentHart: (o.hearts ?? 3) * 4, StaminaMax: f32(1000),
    HiddenKorok_Number: o.koroks ?? 0, PlayerSavePos: [f32(o.x ?? 1600), f32(120), f32(o.z ?? 470)],
    PlayerSavePosMapType: str('MainField', 8), PlayerSavePosMapName: str('G-5', 8), WM_Time: f32(180), WM_NumberOfDays: 3,
    PorchItem: str('Weapon_Sword_001', 16), PorchItem_Value1: [2200], PorchItem_EquipFlag: [1],
  };
  for (let i = 0; i < (o.shrines ?? 0); i++) { f[`Location_Dungeon00${i}`] = 1; f[`Clear_Dungeon00${i}`] = 1; }
  for (let i = 0; i < (o.koroks ?? 0); i++) f[`MainField_Npc_HiddenKorokGround_${1000 + i}`] = 1;
  for (let i = 0; i < (o.towers ?? 0); i++) { f[`MapTower_0${i + 1}`] = 1; f[`Location_MapTower0${i + 1}`] = 1; }
  if ((o.quest ?? 0) >= 1) f['Q1_Activated'] = 1;
  if ((o.quest ?? 0) >= 2) f['Q1_Finish'] = 1;
  f['Location_Kakariko'] = 2;
  if (o.dish) f['IsGet_Item_Cook_A_01'] = 1;
  CAT.chests!.forEach((c, i) => { f[c.flag] = i < (o.chests ?? 0) ? 1 : 0; });
  CAT.people!.forEach((p, i) => { f[p.flag] = i < (o.met ?? 0) ? 1 : 0; });
  return makeSave(f);
}
const parse = (b: Buffer, t = 0): BotwState => parseState({ save: b, slot: 0, savedAt: t }, CAT);

test('a made-up session: the diff and his one line', () => {
  const a = parse(game({ shrines: 1, koroks: 2, towers: 0, quest: 1, time: 3600 }));
  const b = parse(game({ shrines: 4, koroks: 14, towers: 1, quest: 2, hearts: 4, time: 3600 + 5400, dish: true }));
  assert.deepEqual(a.quests, [{ id: 'Q1', type: 'side', step: 1, steps: 2, done: false }]);
  assert.equal(b.gear[0]!.name, 'Traveler\'s Sword'); assert.equal(b.gear[0]!.equipped, true); assert.equal(b.clock.hour, 12);
  const d = diffStates(a, b);
  assert.deepEqual(d.shrinesDone, ['Dungeon001', 'Dungeon002', 'Dungeon003']);
  assert.equal(d.koroks.length, 12); assert.deepEqual(d.towers, ['MapTower_01']); assert.deepEqual(d.questsDone, ['Q1']);
  assert.equal(d.hearts, 1); assert.equal(d.playtime, 5400); assert.deepEqual(d.dishes, ['Item_Cook_A_01']);
  assert.equal(todayLine(d), 'Today: 3 shrines, 1 tower, 12 Koroks, 1 quest.');
  assert.equal(todayLine(diffStates(a, parse(game({ shrines: 1, koroks: 2, quest: 1, time: 3600 + 2700 })))), 'Today: 45m in Hyrule.');
  assert.equal(todayLine(diffStates(a, a)), null);
});

test('E2 made-up: chests opened and people met, and a state from before E2', () => {
  const a = parse(game({ chests: 1, met: 1 })), b = parse(game({ chests: 2, met: 2 }));
  assert.deepEqual(a.chests, { opened: [11] }); assert.deepEqual(a.people, { met: ['Npc_Kakariko001'], flags: [] });
  const d = diffStates(a, b);
  assert.deepEqual(d.chests, [22]); assert.deepEqual(d.people, ['Npc_Road_024']);
  assert.equal(todayLine(d), null, 'the line is unchanged: chests and people are not in it');
  // base.json written by the older watcher has neither field: nothing counts as new
  const { chests: _c, people: _p, ...old } = a;
  const d2 = diffStates(old as BotwState, b);
  assert.deepEqual([d2.chests, d2.people], [[], []]);
  // an older botw.db (no E1 tables): the fields are there, empty
  const st = parseState({ save: game({ chests: 2 }), slot: 0, savedAt: 0 }, { ...CAT, chests: undefined, people: undefined });
  assert.deepEqual([st.chests, st.people], [{ opened: [] }, { met: [], flags: [] }]);
  // the DLC marks
  const dlc = parse(makeSave({ AoC_HardMode_Enabled: 1, '100enemy_Clear_Junior': 1, BalladOfHeroZora_Finish: 1, BalladOfHeroRito_Finish: 1, Defeated_Priest_Boss_Normal_Num: 1 })).dlc;
  assert.deepEqual(dlc, { masterMode: true, trialOfTheSword: { beginning: true, middle: false, final: false }, ballad: { champions: ['Rito', 'Zora'], done: false }, finalTrial: false, mazKoshia: true });
});

// ------------------------------------------------------------------ the watcher

function rig() {
  const root = mkdtempSync(path.join(tmpdir(), 'aang-botw-watch-'));
  const saves = path.join(root, 'saves'), dir = path.join(root, 'out');
  mkdirSync(path.join(saves, '0'), { recursive: true }); mkdirSync(dir);
  const db = path.join(root, 'botw.db'); writeFileSync(db, ''); // only has to exist: the catalog comes from CAT
  let now = Date.parse('2026-11-03T15:00:00Z'), cemu = false;
  const said: string[] = [];
  const w = new BotwWatch({ saves, dir, db }, { cemuRunning: async () => cemu, gameRunning: async () => cemu, say: l => said.push(l), now: () => now, catalog: () => CAT });
  const save = (b: Buffer) => { const f = path.join(saves, '0', 'game_data.sav'); writeFileSync(f, b); utimesSync(f, now / 1000, now / 1000); };
  return { w, said, save, p: { saves, dir, db }, set: (o: { now?: number; cemu?: boolean }) => { if (o.now !== undefined) now = o.now; if (o.cemu !== undefined) cemu = o.cemu; }, get now() { return now; } };
}

test('watcher: every autosave keeps state.json up while Cemu runs, quiet, one line when it closes', async () => {
  const r = rig();
  r.save(game({ shrines: 1, koroks: 2 }));
  await r.w.tick();                                   // first time: learns the state, says nothing
  assert.equal(readBotwState(r.p)?.shrines.done.length, 1); assert.deepEqual(r.said, []);

  r.set({ cemu: true, now: r.now + 60_000 }); r.save(game({ shrines: 2, koroks: 5, time: 5000 }));
  await r.w.tick();                                   // he saves while playing: the state follows (his call 2026-11-04), nothing said
  assert.equal(readBotwState(r.p)?.shrines.done.length, 2); assert.ok(readBotwSessions(r.p)?.open); assert.deepEqual(r.said, []);
  r.set({ now: r.now + 10 * 60_000 }); r.save(game({ shrines: 4, koroks: 14, time: 8000 }));
  await r.w.tick();
  assert.equal(readBotwState(r.p)?.shrines.done.length, 4); assert.deepEqual(r.said, []);
  await r.w.tick();                                   // no new save: nothing read again
  assert.equal(readBotwState(r.p)?.shrines.done.length, 4);

  r.set({ cemu: false, now: r.now + 60_000 });        // Cemu closes
  await r.w.tick();
  assert.deepEqual(r.said, ['Today: 3 shrines, 12 Koroks.']);
  assert.equal(readBotwState(r.p)?.shrines.done.length, 4);
  const s = readBotwSessions(r.p)!;
  assert.equal(s.open, null); assert.equal(s.list.length, 1); assert.equal(s.list[0]!.diff.playtime, 4400);
  await r.w.tick();                                   // said once only
  assert.equal(r.said.length, 1);
});

test('watcher: 30 still minutes ends it; the line waits for Cemu, and a new save carries the session on', async () => {
  const r = rig();
  r.save(game({ shrines: 1 })); await r.w.tick();
  r.set({ cemu: true, now: r.now + 60_000 }); r.save(game({ shrines: 2, time: 4000 })); await r.w.tick();
  r.set({ now: r.now + STILL_MS }); await r.w.tick();  // still for 30 minutes, Cemu still open
  assert.equal(readBotwState(r.p)?.shrines.done.length, 2, 'the state catches up');
  assert.equal(readBotwSessions(r.p)?.held, 'Today: 1 shrine.'); assert.deepEqual(r.said, [], 'but nothing is said in a game');
  r.set({ now: r.now + 60_000 }); r.save(game({ shrines: 3, time: 6000 })); await r.w.tick();
  assert.equal(readBotwSessions(r.p)?.held, null); assert.ok(readBotwSessions(r.p)?.open);
  r.set({ cemu: false, now: r.now + 60_000 }); await r.w.tick();
  assert.deepEqual(r.said, ['Today: 2 shrines.'], 'one line for the whole session');
  assert.equal(readBotwSessions(r.p)?.list.length, 1);
});

test('watcher: a session that ended long ago is kept, not announced', async () => {
  const r = rig();
  r.save(game({ shrines: 1 })); await r.w.tick();
  r.set({ now: r.now + 60_000 }); r.save(game({ shrines: 2, time: 4000 }));
  r.set({ now: r.now + 5 * 3_600_000 }); await r.w.tick();   // Aang was off; Cemu long closed
  assert.deepEqual(r.said, []); assert.equal(readBotwSessions(r.p)?.list[0]?.line, 'Today: 1 shrine.');
});

test('where was I: on ask, where he saved, last time, a Zelda note near there', async () => {
  const r = rig();
  r.save(game({ shrines: 1 })); await r.w.tick();
  r.set({ now: r.now + 60_000 }); r.save(game({ shrines: 3, koroks: 4, time: 9000 })); await r.w.tick();
  const st = readBotwState(r.p)!;
  const notes = [
    { title: 'Come back with a bomb', cat: 'Zelda', place: { game: 'botw', x: 1650, z: 500 } },
    { title: 'Far away', cat: 'Zelda', place: { game: 'botw', x: -2000, z: 2000 } },
    { title: 'Groceries' },
  ];
  assert.deepEqual(nearNotes(notes, st).map(n => n.title), ['Come back with a bomb']);
  // the answer itself (the place names come from botw.db; this rig has none, so it falls back to the map square)
  const names = { shrine: new Map<string, string>(), place: [{ flag: 'Location_Kakariko', msg: 'Kakariko', name: 'Kakariko Village', x: 1700, z: 450 }] };
  assert.equal(whereSaved(st, names), 'at Kakariko Village');
  assert.equal(whereSaved(st, { ...names, place: [{ ...names.place[0]!, flag: 'Location_Hateno' }] }), 'in map square G-5', 'never a place he has not been');
  assert.ok(isWhereWasI('Where was I?')); assert.ok(isWhereWasI('ok where did i leave off in zelda'));
  assert.ok(!isWhereWasI('where was I born')); assert.ok(!isWhereWasI('remind me where was I going with this email'));
  assert.ok(meansBotw('where was I in botw', null)); assert.ok(!meansBotw('where was I', null));
  assert.ok(meansBotw('where was I', st, Date.parse(st.savedAt) + 3_600_000));
});

test('where was I: the whole answer on his real save', { skip: !real && 'no Cemu saves or botw.db here' }, () => {
  const dir = copyHisSaves();
  const out = mkdtempSync(path.join(tmpdir(), 'aang-botw-where-'));
  const w = new BotwWatch({ saves: dir, dir: out, db: DB }, { cemuRunning: async () => false, gameRunning: async () => false, say: () => {} });
  const a = w.whereWasI();
  assert.match(a, /^You saved (in|at|near) .+, (today|yesterday|\d+ days ago)/);
  console.log(`     ${a}`);
});

/** A made-up Hero's Path file: one segment, n overworld points walking east from (100, 200). */
function track(n: number): Buffer {
  const b = Buffer.alloc(0x40 + 48 * 0x4c0);
  b.writeUInt32BE(1, 0x40);                                   // t1
  for (let i = 0; i < n; i++) { const x = 100 + i * 3, z = 200; b.writeUInt32BE(((1 << 31) | ((x & 0xfff) << 13) | (z & 0xfff)) >>> 0, 0x40 + 16 + i * 4); }
  return b;
}

test('sessions say where their Hero\'s Path walk starts and ends (pathFrom, pathTo)', async () => {
  const r = rig();
  const walk = (n: number) => { mkdirSync(path.join(r.p.saves, 'tracker'), { recursive: true }); writeFileSync(path.join(r.p.saves, 'tracker', 'trackblock00.sav'), track(n)); };
  walk(40); r.save(game({ shrines: 1 })); await r.w.tick();
  assert.equal(readBotwState(r.p)?.heroPath?.points.length, 40);
  r.set({ cemu: true, now: r.now + 60_000 }); walk(100); r.save(game({ shrines: 2, time: 5000 })); await r.w.tick();
  assert.equal(readBotwSessions(r.p)?.open?.pathFrom, 40, 'the open session knows where it began');
  r.set({ cemu: false, now: r.now + 60_000 }); await r.w.tick();
  const s = readBotwSessions(r.p)!.list.at(-1)!;
  assert.equal(s.pathFrom, 40); assert.equal(s.pathTo, 100);
});

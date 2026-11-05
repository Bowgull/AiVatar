// BG10 (docs/BOTW-GUIDE.md): the slot folders are watched, not polled. A save written into a slot folder is in
// state.json within 3 s (2 s settle + the read), with no tick from the scheduler at all.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { crc32 } from 'node:zlib';
import type { Catalog } from '../src/botwsave.ts';
import { BotwWatch, SETTLE_MS, readBotwState } from '../src/botwwatch.ts';

const made: string[] = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });

const CAT: Catalog = {
  shrines: Array.from({ length: 5 }, (_, i) => ({ id: `Dungeon00${i}`, found: `Location_Dungeon00${i}`, done: `Clear_Dungeon00${i}` })),
  towers: [], koroks: [], places: [], dishes: [], quests: [], items: new Map(),
};
/** A save in the real format with this many shrines done. */
function save(shrines: number): Buffer {
  const flags: Record<string, number> = { PlayReport_PlayTime: 3600 + shrines * 100, MaxHartValue: 12, CurrentHart: 12 };
  for (let i = 0; i < shrines; i++) { flags[`Location_Dungeon00${i}`] = 1; flags[`Clear_Dungeon00${i}`] = 1; }
  const recs = Object.entries(flags).map(([k, v]) => [crc32(k), v >>> 0] as [number, number]).sort((a, b) => a[0] - b[0]);
  const b = Buffer.alloc(12 + recs.length * 8 + 4);
  b.writeUInt32BE(0x471b, 0); b.writeUInt32BE(0xffffffff, 4); b.writeUInt32BE(1, 8);
  recs.forEach(([h, v], i) => { b.writeUInt32BE(h, 12 + i * 8); b.writeUInt32BE(v, 16 + i * 8); });
  return b;
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
/** Wait up to `ms` for state.json to say this many shrines; how long it took, or -1. */
async function shows(p: { saves: string; dir: string; db: string }, shrines: number, ms = 3000): Promise<number> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (readBotwState(p)?.shrines.done.length === shrines) return Date.now() - t0; await sleep(50); }
  return -1;
}

test('BG10: a save written into a slot folder is in state.json within 3 s, with no tick', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'aang-botw-live-')); made.push(root);
  const saves = path.join(root, 'saves'), dir = path.join(root, 'out'), db = path.join(root, 'botw.db');
  mkdirSync(path.join(saves, '0'), { recursive: true }); mkdirSync(dir); writeFileSync(db, '');
  const p = { saves, dir, db };
  const w = new BotwWatch(p, { cemuRunning: async () => false, gameRunning: async () => false, say: () => {}, catalog: () => CAT });
  w.start();
  try {
    assert.equal(w.watching, 2, 'the parent and slot 0');
    writeFileSync(path.join(saves, '0', 'game_data.sav'), save(1));
    const t1 = await shows(p, 1);
    assert.ok(t1 >= 0, 'the first save was read');
    assert.ok(t1 >= SETTLE_MS - 100, `it waited for the save to settle (${t1} ms)`);
    // a slot folder made later is watched too, and a newer save there is read (file times are real: wait past the 1 s)
    await sleep(1100);
    mkdirSync(path.join(saves, '3'));
    await sleep(300);
    writeFileSync(path.join(saves, '3', 'game_data.sav'), save(3));
    assert.ok(await shows(p, 3) >= 0, 'the save in the new slot folder was read');
    assert.equal(w.watching, 3);
  } finally { w.stop(); }
  assert.equal(w.watching, 0);
});

// BG8: the brain's side of the live position (botwlive.ts): start the reader only while Cemu runs, one at a time, rest a
// while after it gave up, and never leave pos.json saying live after Cemu closed. The reader is a fake here.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { BotwLive, GAVE_UP, NOT_READY, POUCH_SETTLE_MS, RETRY_MS, posFile, pouchFile, readBotwPos, walksDir } from '../src/botwlive.ts';
import { botwPaths } from '../src/botwwatch.ts';

const root = mkdtempSync(path.join(tmpdir(), 'aang-botw-live-'));
after(() => rmSync(root, { recursive: true, force: true }));

function rig() {
  const dir = mkdtempSync(path.join(root, 'r-'));
  const reader = path.join(dir, 'AangReader.exe'); writeFileSync(reader, '');
  const p = { saves: dir, dir, db: '' };
  let cemu = false, now = Date.parse('2026-11-04T17:00:00Z');
  const started: { args: string[]; child: ChildProcess & EventEmitter; out: PassThrough }[] = [];
  const logs: string[] = [];
  const live = new BotwLive(p, {
    reader, cemuRunning: async () => cemu, log: l => logs.push(l), now: () => now,
    spawn: (_exe, args) => { const out = new PassThrough(); const child = Object.assign(new EventEmitter(), { stdout: out, kill: () => true }) as unknown as ChildProcess & EventEmitter; started.push({ args, child, out }); return child; },
  });
  return { live, p, started, logs, cemu: (on: boolean) => { cemu = on; }, wait: (ms: number) => { now += ms; } };
}

test('the reader runs only while Cemu does, one at a time', async () => {
  const r = rig();
  await r.live.tick();
  assert.equal(r.started.length, 0, 'nothing while Cemu is closed');
  r.cemu(true);
  await r.live.tick(); await r.live.tick();
  assert.equal(r.started.length, 1, 'one reader');
  assert.deepEqual(r.started[0]!.args.slice(0, 3), ['--botw-live', '--out', posFile(r.p)]);
  for (const f of ['--live', '--pouch', '--want']) assert.ok(r.started[0]!.args.includes(f), `the live reader is told ${f}`);
  assert.ok(r.started[0]!.args.includes('--parent'));
  r.started[0]!.out.write('{"botw":"start","detail":"reading Cemu 42 at base 0x1"}\n');
  await new Promise(res => setImmediate(res));
  assert.deepEqual(r.logs, ['botw live start: reading Cemu 42 at base 0x1']);
  r.started[0]!.child.emit('exit', 0);                // it ended (Cemu crashed and came back): start again
  await r.live.tick();
  assert.equal(r.started.length, 2);
});

test('a wrong address fails safe: it rests, then tries again (or at once on a new Cemu launch)', async () => {
  const r = rig();
  r.cemu(true); await r.live.tick();
  r.started[0]!.child.emit('exit', GAVE_UP);
  await r.live.tick(); r.wait(RETRY_MS - 1000); await r.live.tick();
  assert.equal(r.started.length, 1, 'resting');
  r.wait(1000); await r.live.tick();
  assert.equal(r.started.length, 2, 'tried again after the rest: he may have been in the game list');
  r.started[1]!.child.emit('exit', GAVE_UP);
  r.cemu(false); await r.live.tick();
  r.cemu(true); await r.live.tick();
  assert.equal(r.started.length, 3, 'a new Cemu launch tries again at once');
});

test('2026-11-04: the brain looked before Cemu wrote its base line; the next look tries again', async () => {
  const r = rig();
  r.cemu(true); await r.live.tick();
  r.started[0]!.child.emit('exit', NOT_READY);
  await r.live.tick();
  assert.equal(r.started.length, 2, 'no rest for a log that was not ready');
});

test('a pos.json left saying live is marked not live once Cemu is closed', async () => {
  const r = rig();
  writeFileSync(posFile(r.p), JSON.stringify({ v: 1, at: '2026-11-03T15:00:00.000Z', x: 1, y: 2, z: 3, facing: 90, live: true }));
  await r.live.tick();
  assert.deepEqual(readBotwPos(r.p), { v: 1, at: '2026-11-03T15:00:00.000Z', x: 1, y: 2, z: 3, facing: 90, live: false });
});

test('the walk log: one line per move while the reader runs, nothing for a standstill, nothing after it stops', async () => {
  const r = rig();
  r.cemu(true); await r.live.tick();
  const at = (n: number) => new Date(Date.parse('2026-11-04T15:00:00Z') + n * 1000).toISOString();
  const pos = (n: number, x: number) => writeFileSync(posFile(r.p), JSON.stringify({ v: 1, at: at(n), x, y: 100, z: 5, facing: 90, live: true }));
  pos(0, 10); r.live.logWalk(); r.live.logWalk();               // the same pos.json twice: one line
  pos(2, 14.04); r.live.logWalk();
  const f = path.join(walksDir(r.p), '2026-11-04.jsonl');
  const lines = readFileSync(f, 'utf8').trim().split('\n').map(l => JSON.parse(l));
  assert.deepEqual(lines.map(l => l.x), [10, 14]);
  assert.deepEqual(lines[1], { t: at(2), x: 14, y: 100, z: 5, f: 90 });
  r.live.stop();
});

// BG10: the live bag feeds the Journal's Cooking. Needs the real botw.db (the game's cooking rules); skipped without it.
const DB = botwPaths().db;
test('the live pouch makes On the Menu, once it has held still, and the save takes over again when the reader stops', { skip: !existsSync(DB) }, async () => {
  const r = rig(); r.p.db = DB;
  const cook = () => JSON.parse(readFileSync(path.join(r.p.dir, 'cook.json'), 'utf8')) as { savedAt: string; bagAt?: string; bag?: [string, string, number][]; mine: unknown[] };
  const pouch = (items: { t: number; id: string; n: number }[], at = new Date(Date.parse('2026-11-04T17:00:00Z')).toISOString()) =>
    writeFileSync(pouchFile(r.p), JSON.stringify({ v: 1, at, seq: 1, live: true, items }));
  writeFileSync(path.join(r.p.dir, 'state.json'), JSON.stringify({ v: 1, savedAt: '2026-11-04T16:50:00.000Z', gear: [{ id: 'Item_Fruit_A', name: 'Apple', kind: 'material', n: 1, equipped: false }] }));
  r.cemu(true); await r.live.tick();
  pouch([{ t: 0, id: 'Weapon_Sword_062', n: 1800 }, { t: 7, id: 'Item_Fruit_A', n: 5 }, { t: 7, id: 'Item_Fruit_I', n: 2 }]);
  r.live.lookPouch();
  assert.ok(!existsSync(path.join(r.p.dir, 'cook.json')), 'not while the bag may still be changing');
  r.wait(POUCH_SETTLE_MS); r.live.lookPouch();
  const c = cook();
  assert.equal(c.savedAt, '2026-11-04T16:50:00.000Z', "the save's time, as the Journal's rule asks");
  assert.ok(c.bagAt, 'marked as the live bag');
  assert.deepEqual(c.bag, [['Item_Fruit_A', 'Apple', 5], ['Item_Fruit_I', 'Spicy Pepper', 2]], 'the live counts, by name, gear left out');
  assert.ok(c.mine.length > 0, 'apples and peppers cook into something');
  // a save lands and the save watcher writes the save's menu over it: the live bag is put back
  await new Promise(res => setTimeout(res, 20));
  writeFileSync(path.join(r.p.dir, 'cook.json'), JSON.stringify({ v: 1, savedAt: c.savedAt, mine: [], ver: {} }));
  r.live.lookPouch();
  assert.ok(cook().bagAt, 'the live bag again');
  // an old pouch.json (no page open, the reader idle) is not the live bag
  r.started[0]!.child.emit('exit', 0);
  assert.equal(cook().bagAt, undefined, "the reader stopped: the save's menu");
});


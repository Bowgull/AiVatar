// BG8: the brain's side of the live position (botwlive.ts): start the reader only while Cemu runs, once, never again
// after it gave up on this launch, and never leave pos.json saying live after Cemu closed. The reader is a fake here.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ChildProcess } from 'node:child_process';
import { BotwLive, GAVE_UP, posFile, readBotwPos, walksDir } from '../src/botwlive.ts';

const root = mkdtempSync(path.join(tmpdir(), 'aang-botw-live-'));
after(() => rmSync(root, { recursive: true, force: true }));

function rig() {
  const dir = mkdtempSync(path.join(root, 'r-'));
  const reader = path.join(dir, 'AangReader.exe'); writeFileSync(reader, '');
  const p = { saves: dir, dir, db: '' };
  let cemu = false;
  const started: { args: string[]; child: ChildProcess & EventEmitter; out: PassThrough }[] = [];
  const logs: string[] = [];
  const live = new BotwLive(p, {
    reader, cemuRunning: async () => cemu, log: l => logs.push(l),
    spawn: (_exe, args) => { const out = new PassThrough(); const child = Object.assign(new EventEmitter(), { stdout: out, kill: () => true }) as unknown as ChildProcess & EventEmitter; started.push({ args, child, out }); return child; },
  });
  return { live, p, started, logs, cemu: (on: boolean) => { cemu = on; } };
}

test('the reader runs only while Cemu does, one at a time', async () => {
  const r = rig();
  await r.live.tick();
  assert.equal(r.started.length, 0, 'nothing while Cemu is closed');
  r.cemu(true);
  await r.live.tick(); await r.live.tick();
  assert.equal(r.started.length, 1, 'one reader');
  assert.deepEqual(r.started[0]!.args.slice(0, 3), ['--botw-pos', '--out', posFile(r.p)]);
  assert.ok(r.started[0]!.args.includes('--parent'));
  r.started[0]!.out.write('{"botw":"start","detail":"reading Cemu 42 at base 0x1"}\n');
  await new Promise(res => setImmediate(res));
  assert.deepEqual(r.logs, ['botw live start: reading Cemu 42 at base 0x1']);
  r.started[0]!.child.emit('exit', 0);                // it ended (Cemu crashed and came back): start again
  await r.live.tick();
  assert.equal(r.started.length, 2);
});

test('a wrong address fails safe: not tried again until Cemu restarts', async () => {
  const r = rig();
  r.cemu(true); await r.live.tick();
  r.started[0]!.child.emit('exit', GAVE_UP);
  await r.live.tick(); await r.live.tick();
  assert.equal(r.started.length, 1);
  r.cemu(false); await r.live.tick();
  r.cemu(true); await r.live.tick();
  assert.equal(r.started.length, 2, 'a new Cemu launch tries again');
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

// The store, log and clock engines (2026-10-30): one safe save, one read with a fallback, one log writer, one clock.
import './_env.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { writeFileAtomic, writeFileAtomicSoon } from '../src/atomic.ts';
import { readJson, saveJson, Store } from '../src/store.ts';
import { logs, openLog } from '../src/log.ts';
import * as C from '../src/clock.ts';

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'aang-store-'));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const atomicUrl = pathToFileURL(fileURLToPath(new URL('../src/atomic.ts', import.meta.url))).href;

test('a save killed mid-write leaves the whole old file or the whole new one, never half', async () => {
  const dir = tmp(), file = path.join(dir, 'reminders.json');
  // Big enough that a write takes real time, so the kill lands inside one many times over.
  const body = (n: number) => JSON.stringify({ n, items: Array.from({ length: 20_000 }, (_, i) => ({ i, text: 'remind me '.repeat(3) })) });
  writeFileSync(file, body(0));
  const script = `import { writeFileAtomic } from ${JSON.stringify(atomicUrl)};
    const body = ${body.toString()};
    process.stdout.write('go\\n');
    for (let n = 1; ; n++) writeFileAtomic(${JSON.stringify(file)}, body(n));`;
  for (let round = 0; round < 3; round++) {
    const kid = spawn(process.execPath, ['--no-warnings', '--input-type=module', '-e', script], { stdio: ['ignore', 'pipe', 'inherit'] });
    await new Promise<void>((r) => kid.stdout.once('data', () => r()));
    await wait(150 + round * 70);
    kid.kill('SIGKILL');
    await new Promise((r) => kid.once('exit', r));
    const j = JSON.parse(readFileSync(file, 'utf8'));            // throws if torn
    assert.equal(j.items.length, 20_000);
    assert.ok(Number.isInteger(j.n));
  }
});

test('a slower background save never lands over a newer one', async () => {
  const file = path.join(tmp(), 'tabs.json');
  const slow = writeFileAtomicSoon(file, '"old"');
  writeFileAtomic(file, '"new"');
  await slow;
  assert.equal(readFileSync(file, 'utf8'), '"new"');
  assert.deepEqual(readdirSync(path.dirname(file)).filter((f) => f.endsWith('.tmp')), []);
});

test('a save keeps the permissions the file already had (Mac)', { skip: process.platform === 'win32' }, () => {
  const file = path.join(tmp(), 'google.json');
  saveJson(file, { a: 1 }, { ownerOnly: true });
  assert.equal(statSync(file).mode & 0o777, 0o600);
  writeFileAtomic(file, '{"a":2}');                               // a plain safe save after: still owner-only
  assert.equal(statSync(file).mode & 0o777, 0o600);
});

test('readJson: missing, broken, Notepad BOM, wrong shape', () => {
  const dir = tmp(), f = path.join(dir, 'x.json');
  const isList = (r: unknown) => (Array.isArray(r) ? r.filter((x): x is string => typeof x === 'string') : null);
  assert.deepEqual(readJson(f, ['d'], isList), ['d']);           // missing
  writeFileSync(f, '{"half": ');
  assert.deepEqual(readJson(f, ['d'], isList), ['d']);           // torn
  writeFileSync(f, '\uFEFF["a", 2, "b"]');
  assert.deepEqual(readJson(f, ['d'], isList), ['a', 'b']);      // BOM stripped, check cleans
  writeFileSync(f, '{"not":"a list"}');
  assert.deepEqual(readJson(f, ['d'], isList), ['d']);           // wrong shape
  writeFileSync(f, 'null');
  assert.deepEqual(readJson(f, { a: 1 }), { a: 1 });             // no check: null is the fallback
  assert.deepEqual(readJson(f, 0, () => { throw new Error('bad check'); }), 0);
});

test('saveJson keeps the format asked for, and never throws', () => {
  const dir = tmp(), f = path.join(dir, 'deep', 'p.json');
  assert.equal(saveJson(f, { a: [1] }), true);
  assert.equal(readFileSync(f, 'utf8'), '{"a":[1]}');
  saveJson(f, { a: 1 }, { pretty: true, newline: true });
  assert.equal(readFileSync(f, 'utf8'), '{\n  "a": 1\n}\n');
  // A folder where the file should be: reported, false, no throw.
  const blocked = path.join(dir, 'deep');
  const err = console.error; console.error = () => {};
  try { assert.equal(saveJson(blocked, 1), false); } finally { console.error = err; }
});

test('Store: fallback, check, debounced save, flush', async () => {
  const f = path.join(tmp(), 'jobs.json');
  const s = new Store({ file: f, fallback: () => ({ jobs: [] as string[] }), check: (r: any) => (Array.isArray(r?.jobs) ? r : null), debounceMs: 30 });
  assert.deepEqual(s.get(), { jobs: [] });
  s.update((v) => { v.jobs.push('a'); });
  s.update((v) => { v.jobs.push('b'); });
  assert.equal(existsSync(f), false);                             // not yet: debounced
  assert.equal(s.pending, true);
  await wait(120);
  assert.deepEqual(JSON.parse(readFileSync(f, 'utf8')), { jobs: ['a', 'b'] });
  s.set({ jobs: ['c'] }); s.flush();
  assert.deepEqual(JSON.parse(readFileSync(f, 'utf8')), { jobs: ['c'] });
  assert.deepEqual(new Store({ file: f, fallback: () => ({ jobs: [] as string[] }) }).get(), { jobs: ['c'] });
  writeFileSync(f, '[1,2]');                                      // wrong shape: the fallback, file left alone
  assert.deepEqual(new Store({ file: f, fallback: () => ({ jobs: ['z'] }), check: (r: any) => (Array.isArray(r?.jobs) ? r : null) }).get(), { jobs: ['z'] });
  assert.equal(readFileSync(f, 'utf8'), '[1,2]');
});

test('Store: an old shape is migrated and saved back at once; a current one is left alone', () => {
  const f = path.join(tmp(), 'timers.json');
  writeFileSync(f, '["tea", "laundry"]');                         // version 1: a bare list
  type V2 = { v: 2; timers: { name: string }[] };
  const migrate = (r: unknown) => (Array.isArray(r) ? { v: 2, timers: r.map((name) => ({ name: String(name) })) } : r);
  const check = (r: any): V2 | null => (r?.v === 2 && Array.isArray(r.timers) ? r : null);
  const s = new Store<V2>({ file: f, fallback: () => ({ v: 2, timers: [] }), migrate, check });
  assert.deepEqual(s.get().timers.map((t) => t.name), ['tea', 'laundry']);
  assert.deepEqual(JSON.parse(readFileSync(f, 'utf8')), { v: 2, timers: [{ name: 'tea' }, { name: 'laundry' }] });
  const before = statSync(f).mtimeMs;
  new Store<V2>({ file: f, fallback: () => ({ v: 2, timers: [] }), migrate, check });
  assert.equal(statSync(f).mtimeMs, before);                      // nothing to migrate: not rewritten
});

test('openLog: lines, JSON lines, one older generation, clear, labels', () => {
  const dir = tmp();
  const turns = openLog('test-turns', path.join(dir, 'turns.jsonl'), { maxBytes: 50 });
  turns.json({ a: 1 }); turns.json({ a: 2 });
  assert.equal(readFileSync(turns.file, 'utf8'), '{"a":1}\n{"a":2}\n');
  turns.json({ pad: 'x'.repeat(60) });                            // under the limit before: appended
  turns.json({ a: 3 });                                           // over it now: the old file moves to .1
  assert.equal(readFileSync(turns.file, 'utf8'), '{"a":3}\n');
  assert.ok(readFileSync(turns.file + '.1', 'utf8').includes('"pad"'));
  const priv = openLog('test-privacy', path.join(dir, 'privacy-log.jsonl'), { maxBytes: 10, old: path.join(dir, 'privacy-log.old.jsonl') });
  priv.line('0123456789abc'); priv.line('next');
  assert.equal(readFileSync(path.join(dir, 'privacy-log.old.jsonl'), 'utf8'), '0123456789abc\n');
  const aang = openLog('test-aang', path.join(dir, 'aang.log'), { maxBytes: 10, clear: true });
  aang.line('0123456789abc'); aang.line('fresh');
  assert.equal(readFileSync(aang.file, 'utf8'), 'fresh\n');
  assert.equal(existsSync(aang.file + '.1'), false);
  assert.equal(openLog('test-turns', turns.file), turns);         // same label, same log
  const l = logs().find((x) => x.label === 'test-turns');
  assert.equal(l?.failures, 0);
});

test('clock: each helper writes exactly what the old inline formatter wrote', () => {
  const d = new Date('2026-10-30T18:31:07Z');                     // 2:31 pm in Toronto (EDT)
  const tz = 'America/Toronto';
  assert.equal(C.HOME_TZ, tz);
  assert.equal(C.dayKey(d), d.toLocaleDateString('en-CA', { timeZone: tz }));
  assert.equal(C.dayKey(d), '2026-10-30');
  assert.equal(C.shortTime(d), d.toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).toLowerCase());
  assert.equal(C.shortTime(d), '2:31 pm');
  assert.equal(C.shortTimeUpper(d), '2:31 PM');
  assert.equal(C.fullMoment(d), d.toLocaleString('en-US', { timeZone: tz, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }));
  assert.equal(C.longDate(d), d.toLocaleDateString('en-CA', { timeZone: tz, year: 'numeric', month: 'long', day: 'numeric' }));
  assert.equal(C.homeHour(d), 14);
  assert.equal(C.homeHour(new Date('2026-10-31T04:10:00Z')), 0);   // just past midnight: 0, not 24
  assert.equal(C.fileStamp(d), '2026-10-30-14-31-07');
  assert.equal(C.utcStamp(d), '2026-10-30 18:31:07');
  assert.match(C.localStamp(d), /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/);
  assert.equal(C.homeClock(d, { hour: 'numeric', minute: '2-digit', hour12: true }, 'en-CA'), d.toLocaleTimeString('en-CA', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true }));
  assert.equal(C.dayKey(d.getTime()), C.dayKey(d.toISOString()));  // a Date, a number or a string
});

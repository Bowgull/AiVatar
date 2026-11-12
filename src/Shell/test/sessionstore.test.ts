// SessionStore (Phase 2): the one writer of browser-tabs.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SessionStore, type SessionData } from '../src/sessionstore.ts';

const tabs = (n: number, mock = 0) => [...Array.from({ length: n }, (_, i) => ({ url: `https://s${i}.example/` })), ...Array.from({ length: mock }, (_, i) => ({ url: `https://m${i}.example/`, mock: { id: i } }))];
const data = (n: number, mock = 0): SessionData => ({ v: 1, active: 0, tabs: tabs(n, mock), trails: [], closed: [] });
const fresh = () => { const dir = mkdtempSync(path.join(os.tmpdir(), 'sess-')); return { dir, s: new SessionStore(path.join(dir, 'browser-tabs.json'), () => {}) }; };
const onDisk = (s: SessionStore) => JSON.parse(readFileSync(s.file, 'utf8')) as SessionData;

test('a save that began before a tab closed never writes the old list back', () => {
  const { s } = fresh();
  s.write(data(5), { now: true });
  const ticket = s.ticket();                      // the snapshot starts, then waits on the pages
  s.write(data(4), { now: true, force: true });   // he closes a tab meanwhile
  assert.equal(s.write(data(5), { now: true, ticket }), false);
  assert.equal(onDisk(s).tabs.length, 4);
});

test('a save with no write since it began goes through', () => {
  const { s } = fresh();
  const ticket = s.ticket();
  assert.equal(s.write(data(3), { now: true, ticket }), true);
  assert.equal(onDisk(s).tabs.length, 3);
});

test('nothing changed means nothing written, unless forced', () => {
  const { s } = fresh();
  assert.equal(s.write(data(2), { now: true }), true);
  assert.equal(s.write(data(2), { now: true }), false);
  assert.equal(s.write(data(2), { now: true, force: true }), true);
});

test('a write that drops most of his tabs keeps a copy first; mockups do not count', () => {
  const { dir, s } = fresh();
  s.write(data(6, 3), { now: true });
  s.write(data(5, 0), { now: true });             // 6 -> 5: no copy
  assert.equal(existsSync(path.join(dir, 'browser-tabs-kept')), false);
  s.write(data(1), { now: true });                // 5 -> 1: copy of the 5 first
  const kept = readdirSync(path.join(dir, 'browser-tabs-kept'));
  assert.equal(kept.length, 1);
  assert.match(kept[0]!, /-drop\.json$/);
  assert.equal(JSON.parse(readFileSync(path.join(dir, 'browser-tabs-kept', kept[0]!), 'utf8')).tabs.length, 5);
});

test('only the newest ten copies are kept', () => {
  const { dir, s } = fresh();
  let t = Date.UTC(2026, 10, 12);
  const s2 = new SessionStore(s.file, () => {}, () => new Date(t += 1000));
  s2.write(data(3), { now: true });
  for (let i = 0; i < 14; i++) s2.keepCopy('start');
  assert.equal(readdirSync(path.join(dir, 'browser-tabs-kept')).length, 10);
});

test('read counts his tabs for the drop guard; peek does not', () => {
  const { s } = fresh();
  s.write(data(8), { now: true });
  const other = new SessionStore(s.file, () => {});
  other.peek();
  other.write(data(1), { now: true });            // never read: no copy (it does not know he had 8)
  assert.equal(existsSync(path.join(path.dirname(s.file), 'browser-tabs-kept')), false);
  const third = new SessionStore(s.file, () => {});
  third.write(data(8), { now: true, force: true });
  const fourth = new SessionStore(s.file, () => {});
  assert.equal(fourth.read()?.tabs?.length, 8);
  fourth.write(data(1), { now: true });
  assert.equal(readdirSync(path.join(path.dirname(s.file), 'browser-tabs-kept')).length, 1);
});

test('an unreadable file reads as none', () => {
  const { s } = fresh();
  assert.equal(s.read(), null);
  assert.equal(s.peek(), null);
});

// The safety net's data half (step 6.0, finished in 6.2): a copy of Aang as he was, taken once,
// before the new windows touch anything.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { snapshotOnce } from '../src/snapshot.ts';

/** A state folder and a data folder that look like his. */
function aang() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'aang-snap-'));
  const state = path.join(root, 'state');
  const data = path.join(root, 'data');
  mkdirSync(state); mkdirSync(data);
  writeFileSync(path.join(state, 'body.json'), '{"Hotkey":"Ctrl+Plus"}');
  writeFileSync(path.join(state, 'google.json'), '{"token":"secret"}');
  writeFileSync(path.join(data, 'aang.db'), 'PRETEND DATABASE');
  return { state, data };
}

test('it copies his settings and his memory, with a note on how to go back', () => {
  const { state, data } = aang();
  const r = snapshotOnce(state, data, new Date(2026, 9, 4));

  assert.ok(r.dir, 'a snapshot was taken');
  assert.match(r.dir!, /before-the-rebuild[\\/]2026-10-04$/);
  assert.equal(readFileSync(path.join(r.dir!, 'state', 'body.json'), 'utf8'), '{"Hotkey":"Ctrl+Plus"}');
  assert.equal(readFileSync(path.join(r.dir!, 'data', 'aang.db'), 'utf8'), 'PRETEND DATABASE');

  const how = readFileSync(path.join(r.dir!, 'HOW TO GO BACK.txt'), 'utf8');
  assert.match(how, /aang-v1-before-rebuild/);
  assert.match(how, /Close Aang completely/);
  assert.equal(r.files, 3);
});

test('it is taken once and never again', () => {
  const { state, data } = aang();
  const first = snapshotOnce(state, data, new Date(2026, 9, 4));
  assert.ok(first.dir);

  // He keeps using Aang, and things change.
  writeFileSync(path.join(state, 'body.json'), '{"Hotkey":"something else"}');

  const second = snapshotOnce(state, data, new Date(2026, 9, 11));
  assert.equal(second.dir, null, 'a snapshot that refreshes is not a snapshot');
  assert.equal(readFileSync(path.join(first.dir!, 'state', 'body.json'), 'utf8'), '{"Hotkey":"Ctrl+Plus"}',
    'the copy still shows how he was, not how he is');
});

test('a file it cannot read is noted, and the rest is still copied', () => {
  const { state, data } = aang();
  // A folder where a file is expected: readable as an entry, impossible to copy as a file.
  mkdirSync(path.join(state, 'locked.json'));
  const r = snapshotOnce(state, data, new Date(2026, 9, 4));
  assert.ok(r.dir, 'one bad file does not lose the whole snapshot');
  assert.ok(existsSync(path.join(r.dir!, 'state', 'body.json')));
});

test('a fresh machine with nothing to copy is not an error', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'aang-snap-'));
  const state = path.join(root, 'state');
  const data = path.join(root, 'data');
  mkdirSync(state); mkdirSync(data);
  const r = snapshotOnce(state, data, new Date(2026, 9, 4));
  assert.ok(r.dir);
  assert.equal(r.files, 0);
  assert.ok(readdirSync(r.dir!).includes('HOW TO GO BACK.txt'));
});

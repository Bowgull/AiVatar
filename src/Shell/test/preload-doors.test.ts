// Every door in the preload must be a DIFFERENT door.
//
// The bubble and the typing box share one preload.cjs, so they share one `window.aang`. On 2026-10-05 a
// second `answerAsk` was added for the typing box while the bubble already had one for `bubble:answer`.
// A duplicate key in an object literal does not warn: the later one silently wins. The bubble's
// permission keycaps would have stopped working, and nothing would have said so.
//
// This also catches two doors sending to the same ipc channel, which is the same mistake wearing a
// different name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const preload = readFileSync(path.resolve(import.meta.dirname, '..', 'src', 'preload.cjs'), 'utf8');

/** Every `name:` at the top level of the exposed object, in source order. */
function doorNames(): string[] {
  const out: string[] = [];
  for (const line of preload.split(/\r?\n/)) {
    // Two spaces of indent is the exposed object's own level; deeper is inside a function body.
    const m = /^ {2}([A-Za-z_$][\w$]*)\s*:/.exec(line) || /^ {2}([A-Za-z_$][\w$]*)\s*\(/.exec(line);
    if (m) out.push(m[1]);
  }
  return out;
}

test('no two doors share a name', () => {
  const names = doorNames();
  assert.ok(names.length > 15, `expected the doors, found ${names.length}`);
  const seen = new Set<string>();
  const dupes = names.filter((n) => (seen.has(n) ? true : (seen.add(n), false)));
  assert.deepEqual(dupes, [], `these would silently overwrite each other: ${dupes.join(', ')}`);
});

test('no two doors send to the same channel', () => {
  const chans = [...preload.matchAll(/ipcRenderer\.send\('([^']+)'/g)].map((m) => m[1]);
  const seen = new Set<string>();
  const dupes = [...new Set(chans.filter((c) => (seen.has(c) ? true : (seen.add(c), false))))];
  assert.deepEqual(dupes, [], `two doors send to the same channel: ${dupes.join(', ')}`);
});

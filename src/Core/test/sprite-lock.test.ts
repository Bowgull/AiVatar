// The sprite is locked. Joshua: "the pixel sprite is amazing, I never want to change that."
//
// Every one of the 118 frames is fingerprinted in assets/aang/SPRITE.sha256. Change, replace, add or remove a
// frame and this fails, so a visual overhaul of everything AROUND him cannot quietly touch him.
//
// If he is ever changed on purpose, that is Joshua's decision, made in words: regenerate the lock with
//   node test/sprite-lock.test.ts --relock
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..', '..');
const frames = path.join(root, 'assets', 'aang');
const lockFile = path.join(frames, 'SPRITE.sha256');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const full = path.join(dir, e);
    if (statSync(full).isDirectory()) walk(full, out); else if (e.toLowerCase().endsWith('.png')) out.push(full);
  }
  return out.sort();
}
const fingerprint = () => walk(frames).map(f => `${createHash('sha256').update(readFileSync(f)).digest('hex')}  ${path.relative(frames, f).replace(/\\/g, '/')}`).join('\n') + '\n';

if (process.argv.includes('--relock')) {
  writeFileSync(lockFile, fingerprint());
  console.log(`locked ${walk(frames).length} frames in ${lockFile}`);
  process.exit(0);
}

test('the sprite is exactly as Joshua approved it: 118 frames, none changed', () => {
  assert.ok(existsSync(lockFile), 'assets/aang/SPRITE.sha256 is missing');
  const now = fingerprint().trim().split('\n'), locked = readFileSync(lockFile, 'utf8').trim().split('\n');
  const lockedByName = new Map(locked.map(l => [l.slice(66), l.slice(0, 64)]));
  const changed = now.filter(l => lockedByName.get(l.slice(66)) !== l.slice(0, 64)).map(l => l.slice(66));
  const removed = [...lockedByName.keys()].filter(n => !now.some(l => l.slice(66) === n));
  assert.deepEqual(changed, [], 'frames added or changed');
  assert.deepEqual(removed, [], 'frames removed');
  assert.equal(now.length, 118);
});

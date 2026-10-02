import './_env.ts';
// Two faults reported together on 2026-10-02, both about Aang answering without evidence.
//
// WHY THIS EXISTS:
//
// 1. Asked why Obsidian was not set up, he answered "I don't have the details on why Obsidian's not hooked
//    up. That's part of the Aang rebuild that's still in progress." Obsidian WAS set up the day before,
//    pointed at a 68-note vault, and one file read would have said so. He called no tools at all.
//    voice.ts has told him in plain words to look before answering since 2026-10-01. That is the third time
//    a prose instruction has failed to stop this, so the check is structural now, like REFUSES.
//
// 2. A question about launching WoW from a Rainmeter button produced nothing, and left NO row anywhere -
//    saveTurn only ever ran on the success path. So a turn that died was indistinguishable from one never
//    asked. Neither Joshua nor I could tell which had happened.
//
// The regex half matters more than it looks: a false positive costs a whole extra model turn out of his
// weekly quota, so the honest-ignorance cases below are as much the point as the guessing ones.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GUESSED } from '../src/core.ts';
import { Memory } from '../src/memory.ts';

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'aang-guess-'));

test('it catches claiming ignorance, including the two real ones from 2026-10-02', () => {
  const guessing = [
    "I don't have the details on why Obsidian's not hooked up.",
    "That's part of the Aang rebuild that's still in progress.",
    'I have no record of that.',
    'I have no memory of Octup.',
    'Not sure why that happened.',
    "I don't know the specifics of your setup.",
  ];
  for (const r of guessing) assert.ok(GUESSED.test(r), `should have been caught: ${r}`);
});

test('it leaves an answer alone when he actually looked', () => {
  // These are the expensive false positives. "I checked and it is not there" is a real answer and must not
  // cost a second turn.
  const honest = [
    'I searched your Drive and found no matching file, so it was never created.',
    'I read the settings: Obsidian points at your CereBro vault, 68 notes.',
    'Octup is the only one past first round. You interviewed on the 30th.',
    'Twenty are still waiting on a reply.',
    'I looked in Documents and the transcript is there.',
    'Your Google sign-in expired on the 28th, so Gmail is not readable until you redo it.',
  ];
  for (const r of honest) assert.ok(!GUESSED.test(r), `should NOT have been caught: ${r}`);
});

test('a turn that died is written down, and he can scroll back to it', () => {
  // The Rainmeter case. What matters is that SOMETHING is in history afterwards, so silence and failure
  // stop looking identical.
  const m = new Memory(tmp());
  try {
    const rows = m.saveTurn(
      'can you launch WoW Forever from my rainmeter W button',
      '[this one did not finish] That took too long and I gave up waiting.',
      'failed-smart',
    );
    assert.ok(rows, 'a failed turn still gets rows');
    const seen = m.history('');
    assert.ok(seen.some(t => t.text.includes('rainmeter')), 'the question he asked is in history');
    assert.ok(seen.some(t => t.text.includes('did not finish')), 'and so is the fact that it died');
  } finally { m.close(); }
});

test('a failed turn is not mistaken for a local model answer and hidden', () => {
  // history() drops `tier LIKE 'local%'` so a small model's mistake is never recalled as something Aang
  // said. "failed-quick" must not trip that, or the record would vanish exactly when it is needed.
  const m = new Memory(tmp());
  try {
    const rows = m.saveTurn('a question that died', '[this one did not finish] I lost my connection.', 'failed-quick');
    assert.equal(m.history('').filter(t => t.id === rows!.aangTurn).length, 1, 'still visible');
    assert.ok(m.turnsById([rows!.aangTurn]).length === 1, 'and can still be pointed at');
  } finally { m.close(); }
});

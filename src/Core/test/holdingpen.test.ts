import './_env.ts';
// 3.3: facts read out of Joshua's documents wait for him to say yes.
//
// WHY THIS EXISTS: nothing self-activates. A fact the local model pulled out of a document is a CLAIM
// until he approves it, and the whole point of this phase is that his memory fills with his documents
// rather than with whatever a 35B model thought it saw. A pending fact must therefore be invisible to
// every path that answers him.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Memory } from '../src/memory.ts';

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'aang-pen-'));

test('a pending fact is not something he knows', () => {
  const m = new Memory(tmp());
  try {
    const id = m.rememberPending('Joshua interviewed at Octup on the 30th.', 'applications.md');
    assert.ok(id, 'it went into the pen');
    assert.equal(m.pendingCount(), 1);

    // The two paths that put a fact in front of him or in front of the model. standing() is the one that
    // actually reaches the prompt, and it is built on list(), so filtering list() covers both - but assert
    // both anyway, because that relationship is an implementation detail and could change.
    assert.equal(m.list(50).filter(f => f.text.includes('Octup')).length, 0, 'not in what he knows');
    assert.equal(m.standing().filter(f => f.text.includes('Octup')).length, 0, 'not in the facts the model is given');

    // And once approved it appears in both, which is what makes the first two assertions meaningful
    // rather than a test of an empty list.
    m.approveFact(id!);
    assert.equal(m.list(50).filter(f => f.text.includes('Octup')).length, 1, 'approving puts it in what he knows');
  } finally { m.close(); }
});

test('approving makes it real; binning removes it for good', () => {
  const m = new Memory(tmp());
  try {
    const keep = m.rememberPending('Joshua is based in Toronto.', 'profile.md')!;
    const drop = m.rememberPending('Joshua enjoys filing taxes.', 'profile.md')!;
    assert.equal(m.pendingCount(), 2);

    const f = m.approveFact(keep);
    assert.ok(f, 'approving returns the fact');
    assert.ok(m.list(50).some(x => x.text.includes('Toronto')), 'now it is something he knows');

    assert.equal(m.binPending(drop), true);
    assert.equal(m.pendingCount(), 0, 'neither is waiting any more');
    assert.equal(m.list(50).filter(x => x.text.includes('taxes')).length, 0, 'the rejected one is gone');
  } finally { m.close(); }
});

test('he is not asked the same thing twice', () => {
  // Re-reading a document must not re-offer what he already answered. Both answers count: an approved
  // fact is known, and a rejected one was rejected, and neither is a question.
  const m = new Memory(tmp());
  try {
    const first = m.rememberPending('Joshua uses a Shadow cloud PC.', 'profile.md')!;
    assert.equal(m.rememberPending('Joshua uses a Shadow cloud PC.', 'profile.md'), null, 'not offered twice while waiting');

    m.approveFact(first);
    assert.equal(m.rememberPending('Joshua uses a Shadow cloud PC.', 'profile.md'), null, 'not re-offered once approved');

    const dropped = m.rememberPending('Joshua dislikes WoW.', 'profile.md')!;
    m.binPending(dropped);
    // Rejected deletes the row, so this one CAN come back on a later read. That is the deliberate
    // trade: "no" means gone rather than remembered as a no, and the cost is being asked again if the
    // document still says it.
    assert.ok(m.rememberPending('Joshua dislikes WoW.', 'profile.md'), 'a rejected claim can be offered again later');
  } finally { m.close(); }
});

test('the pen survives a restart', () => {
  const dir = tmp();
  const m1 = new Memory(dir);
  m1.rememberPending('Joshua applied to Deliverect on 12 September.', 'applications.md');
  m1.close();

  const m2 = new Memory(dir);
  try {
    assert.equal(m2.pendingCount(), 1, 'still waiting after reopening');
    const next = m2.pendingFacts(1)[0];
    assert.ok(next.text.includes('Deliverect'));
    assert.equal(next.fromDoc, 'applications.md', 'and it still knows which document it came from');
  } finally { m2.close(); }
});

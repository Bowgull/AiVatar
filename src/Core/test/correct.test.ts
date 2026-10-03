import './_env.ts';
// Correcting something Aang has wrong.
//
// WHY THIS EXISTS: Joshua asked on 2026-10-03 whether there is a way to correct a fact and have Aang
// confirm he understood it. There was not. He could forget and then remember, but those are two separate
// acts: if the forget matched the wrong fact, or the remember failed, he ends up worse off than before
// and nothing tells him. A correction has to be one thing that either happens or does not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Memory } from '../src/memory.ts';

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'aang-correct-'));

test('the wrong version goes and the right one stays', () => {
  const m = new Memory(tmp());
  try {
    m.remember('Joshua is an Account Manager at Flexiti.', 'joshua', new Date(), 'employer');
    const r = m.correct('Account Manager at Flexiti', 'Joshua is an Account Manager at PayMyTuition.', new Date(), 'employer');

    assert.ok(r.saved, 'the corrected version saved');
    assert.equal(r.removed.length, 1, 'the wrong one was removed');
    assert.match(r.detail, /Replaced/, 'and it says what it did');

    const texts = m.list(50).map(f => f.text);
    assert.ok(texts.some(t => t.includes('PayMyTuition')), 'he now holds the right one');
    assert.ok(!texts.some(t => t.includes('Flexiti')), 'and not the wrong one');
  } finally { m.close(); }
});

test('it reports exactly what changed, so Aang can say it back', () => {
  // The second half of what Joshua asked for: he wants to see that it landed, not be told "done".
  const m = new Memory(tmp());
  try {
    m.remember('Joshua lives in Ottawa.', 'joshua', new Date(), 'location');
    const r = m.correct('Ottawa', 'Joshua lives in Toronto.', new Date(), 'location');
    assert.ok(r.detail.includes('Ottawa'), 'the detail names what went');
    assert.ok(r.detail.includes('Toronto'), 'and what arrived');
    assert.equal(r.saved!.text, 'Joshua lives in Toronto.', 'the stored text is returned verbatim to read back');
  } finally { m.close(); }
});

test('correcting something he never knew just keeps it, and says so', () => {
  const m = new Memory(tmp());
  try {
    const r = m.correct('something he never said', 'Joshua plays a shaman.', new Date());
    assert.ok(r.saved, 'it is kept anyway, because the new claim is still true');
    assert.equal(r.removed.length, 0);
    assert.match(r.detail, /Nothing matched/, 'and it does not pretend to have replaced anything');
  } finally { m.close(); }
});

test('an empty correction changes nothing', () => {
  const m = new Memory(tmp());
  try {
    m.remember('Joshua raids on Tuesdays.', 'joshua');
    const r = m.correct('raids on Tuesdays', '   ');
    assert.equal(r.saved, null);
    assert.equal(r.removed.length, 0, 'and crucially it did NOT delete the old one first');
    assert.ok(m.list(50).some(f => f.text.includes('Tuesdays')), 'what he knew survives a failed correction');
  } finally { m.close(); }
});

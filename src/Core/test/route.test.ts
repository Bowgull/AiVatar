import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickLane } from '../src/route.ts';
import { groundReply, REFUSES } from '../src/core.ts';

test('a reply is checked against what really happened this turn', () => {
  const opened = { did: 'opened https://maps.google.com/dir/...', ok: true, note: '' };
  const broke = { did: 'wrote C:\\logs\\notes.txt', ok: false, note: 'the folder does not exist' };
  assert.equal(groundReply('Opened the route in Maps.', [opened]), 'Opened the route in Maps.', 'a true reply is left alone');
  assert.equal(groundReply('Nothing to do.', []), 'Nothing to do.', 'no actions, nothing to check');
  assert.match(groundReply('Noted it in your logs.', [broke]), /did not actually work: wrote C:\\logs\\notes\.txt \(the folder does not exist\)/);
  assert.equal(groundReply("Couldn't write it, the folder is missing.", [broke]), "Couldn't write it, the folder is missing.", 'an honest failure is left alone');
  assert.match(groundReply("I can't open maps for you.", [opened]), /^Done: opened https:\/\/maps/, 'it did it, so it may not say it cannot');
});

test('the refusals Quick really gave are caught', () => {
  for (const t of ["I can't open maps for you or give turn-by-turn directions.", "I can't write to logs on my own.",
    'Plug both addresses in and you\'ll get the route.', 'You\'ll need to open Google Maps yourself.'])
    assert.ok(REFUSES.test(t), t);
  assert.ok(!REFUSES.test('Opened the route in Maps.'));
});

test('casual chat stays on Quick', () => {
  assert.deepEqual(pickLane('whats the time', 'auto', false, false), { lane: 'quick', needsConsent: false });
  assert.equal(pickLane('i had a rough week', 'auto', false, false).lane, 'quick');
});

test('hard or long work escalates to Smart in Auto', () => {
  assert.equal(pickLane('can you debug this function for me', 'auto', false, false).lane, 'smart');
  assert.equal(pickLane('compare the two approaches step by step', 'auto', false, false).lane, 'smart');
  assert.equal(pickLane('x'.repeat(600), 'auto', false, false).lane, 'smart');
});

test('a request to DO something goes to Smart - his real ones that Quick fumbled', () => {
  for (const t of ['Get me directions from 77 symington avenue to 683 Rowely commons Burlington', 'make a not of this in logs',
    'opne claude on my pc', 'open that email in a browser tab', 'send me a screenshot of my screen', 'play something chill'])
    assert.equal(pickLane(t, 'auto', false, false).lane, 'smart', t);
  assert.equal(pickLane('are you there?', 'auto', false, false).lane, 'quick', 'chat stays cheap');
  assert.equal(pickLane('tell me a one line fun fact', 'auto', false, false).lane, 'quick');
});

test('saving quota keeps Auto on Quick even for hard work', () => {
  assert.equal(pickLane('debug this in detail', 'auto', true, false).lane, 'quick');
});

test('explicit bigger models need consent while saving, and once grants it', () => {
  assert.deepEqual(pickLane('hi', 'smart', true, false), { lane: 'smart', needsConsent: true });
  assert.deepEqual(pickLane('hi', 'deep', true, true), { lane: 'deep', needsConsent: false });
  assert.deepEqual(pickLane('hi', 'smart', false, false), { lane: 'smart', needsConsent: false });
});

test('explicit Quick is always allowed', () => {
  assert.deepEqual(pickLane('debug it', 'quick', true, false), { lane: 'quick', needsConsent: false });
});

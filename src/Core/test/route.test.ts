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

// His rule, 2026-10-13: Quick (the small model) only for plain small talk. It was answering facts confidently wrong and
// "refusing" things it simply had no tool for. Everything else goes to Smart, at the PC too.
test('only plain small talk stays on Quick', () => {
  for (const t of ['hey bud', 'hi', 'thanks man', 'good night', 'how are you', 'lol nice', 'morning!', 'checking in bud', 'yo aang'])
    assert.deepEqual(pickLane(t, 'auto', false, false), { lane: 'quick', needsConsent: false }, t);
  for (const t of ['whats the time', 'i had a rough week', 'yup', 'yes', 'my home address is 77 symington avenue toronto', 'tell me a one line fun fact', 'are you there?', 'hey bud, whats on my calendar'])
    assert.equal(pickLane(t, 'auto', false, false).lane, 'smart', t);
});

test('the quick model saying it is blocked, or not sure, is caught too (2026-10-13)', () => {
  for (const t of ["Hmm, the tool's blocked on my end.", "I'm not sure, but it might be Thursday.", 'That is not available from here.', "I don't know your home address yet."])
    assert.ok(REFUSES.test(t), t);
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
});

test('real requests with everyday words still go to Smart (and so does anything that is not plain small talk)', () => {
  assert.equal(pickLane('I need to set a reminder for tomorrow', 'auto', false, false).lane, 'smart');
  assert.equal(pickLane('can you check my email', 'auto', false, false).lane, 'smart');
  assert.equal(pickLane('close notepad for me', 'auto', false, false).lane, 'smart');
});

test('where he asked is the strongest signal: Discord is away, so it gets Smart outright', () => {
  // 2026-09-22: on Discord he is on his phone, away - 444ms of first token buys him nothing there, and a
  // wrong "I can't do that" costs him the errand. In the bubble he is at the PC and speed is the point.
  assert.equal(pickLane('whats the time', 'auto', false, false, 'discord').lane, 'smart', 'away: right beats fast');
  assert.equal(pickLane('are you there?', 'auto', false, false, 'discord').lane, 'smart');
  assert.equal(pickLane('hey bud', 'auto', false, false, 'desktop').lane, 'quick', 'at the PC: small talk stays fast');
  assert.equal(pickLane('whats the time', 'auto', false, false, 'desktop').lane, 'smart', 'at the PC: a fact goes to Smart (2026-10-13)');
  // his own "spend less" still wins over all of it
  assert.equal(pickLane('open notepad', 'auto', true, false, 'discord').lane, 'quick', 'saving quota is never overridden');
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

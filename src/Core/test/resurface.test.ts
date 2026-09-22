// Bringing things up only when relevant (Joshua, 2026-09-21), and finding a day's conversation. No model, no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dueNudges, mentionedDay, nudgeText, pastDay, utcRangeOf } from '../src/resurface.ts';

// Monday 21 September 2026, 10:00 in Toronto (EDT, UTC-4)
const MON = new Date('2026-09-21T14:00:00Z');
const at = (iso: string) => new Date(iso);

test('a named day is worked out from when it was said', () => {
  assert.deepEqual(mentionedDay('He has a dentist appointment on Thursday at 2pm', MON), { day: '2026-09-24', hour: 14 });
  assert.deepEqual(mentionedDay('His interview is tomorrow at 10am', MON), { day: '2026-09-22', hour: 10 });
  assert.deepEqual(mentionedDay('He is seeing Sarah tonight', MON), { day: '2026-09-21', hour: 19 });
  assert.deepEqual(mentionedDay('His rent is due Oct 1', MON), { day: '2026-10-01', hour: null });
  assert.deepEqual(mentionedDay('Flight on 3rd of January', MON), { day: '2027-01-03', hour: null }, 'a date gone this year is next year');
  assert.equal(mentionedDay('dentist at 2', MON), null, 'a time with no day is not a day');
  assert.deepEqual(mentionedDay('dentist Thursday at 2', MON)?.hour, 14, '"at 2" is the afternoon');
});

test('habits are never a day, so they are never nagged about', () => {
  assert.equal(mentionedDay('He raids on Tuesdays and Thursdays', MON), null);
  assert.equal(mentionedDay('He goes to the gym every Friday', MON), null);
  assert.equal(mentionedDay('He likes short answers', MON), null);
});

test('due on the day from 8:00, or from an hour before its time, once, and not after it has passed', () => {
  const facts = [
    { id: 1, text: 'He has a dentist appointment on Thursday at 2pm', lastSeen: '2026-09-21 14:00:00' },
    { id: 2, text: 'His rent is due Thursday', lastSeen: '2026-09-21 14:00:00' },
    { id: 3, text: 'He likes short answers', lastSeen: '2026-09-21 14:00:00' },
  ];
  assert.deepEqual(dueNudges(facts, at('2026-09-23T15:00:00Z'), new Set(), 3), [], 'not on Wednesday');
  assert.deepEqual(dueNudges(facts, at('2026-09-24T11:00:00Z'), new Set(), 3), [], 'not at 7:00');
  assert.deepEqual(dueNudges(facts, at('2026-09-24T13:00:00Z'), new Set(), 3).map(n => n.id), [2], '9:00: the rent; the dentist waits for 13:00');
  assert.deepEqual(dueNudges(facts, at('2026-09-24T17:10:00Z'), new Set(['2@2026-09-24']), 3).map(n => n.id), [1], '13:10: the dentist, and the rent only once');
  assert.deepEqual(dueNudges(facts, at('2026-09-24T19:30:00Z'), new Set(['2@2026-09-24']), 3), [], 'after 14:00 it has passed');
  assert.deepEqual(dueNudges(facts, at('2026-09-24T13:00:00Z'), new Set(), 0), [], 'the daily cap');
  assert.equal(nudgeText('His rent is due Thursday'), 'From what you told me: His rent is due Thursday.');
});

test('a day he asks about is found looking back, and covers the whole Toronto day', () => {
  assert.equal(pastDay('yesterday', MON), '2026-09-20');
  assert.equal(pastDay('friday', MON), '2026-09-18');
  assert.equal(pastDay('monday', MON), '2026-09-21', 'today is Monday');
  assert.equal(pastDay('last monday', MON), '2026-09-14');
  assert.equal(pastDay('sept 19', MON), '2026-09-19');
  assert.equal(pastDay('2026-09-01', MON), '2026-09-01');
  assert.equal(pastDay('whenever', MON), null);
  assert.deepEqual(utcRangeOf('2026-09-21'), { from: '2026-09-21 04:00:00', to: '2026-09-22 04:00:00' });
  assert.deepEqual(utcRangeOf('2026-01-15'), { from: '2026-01-15 05:00:00', to: '2026-01-16 05:00:00' });
});

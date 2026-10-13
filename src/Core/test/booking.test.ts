// E5 (his rule: "never book anything wrong, get a date wrong"). The time always comes from code; a missing am/pm or a
// missing time is refused, not guessed; the approval says everything; and Google's copy is checked afterwards.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { approvalText, clashes, pickSource, planFromInvite, planFromWords, readBack, sayPlanTime } from '../src/booking.ts';
import { factsOf, findDates, parseInvites } from '../src/emailfacts.ts';

const INVITE = 'BEGIN:VCALENDAR\nMETHOD:REQUEST\nBEGIN:VEVENT\nUID:abc@google.com\nDTSTART;TZID=America/Toronto:20261016T140000\nDTEND;TZID=America/Toronto:20261016T150000\nSUMMARY:Demo with Rhea\nLOCATION:220 King St W\\, Toronto\nORGANIZER;CN=Rhea Patel:mailto:rhea@northwind.com\nEND:VEVENT\nEND:VCALENDAR';
const sent = new Date('2026-10-13T16:00:00Z');

test('from an invite: its own time, place and organizer; the approval says all of it, with the source', () => {
  const p = planFromInvite(parseInvites(INVITE)[0]!, 'accept');
  assert.ok(!('why' in p));
  assert.deepEqual(p.start, { dateTime: '2026-10-16T18:00:00.000Z' });
  assert.equal(sayPlanTime(p), 'Friday, October 16, 2026, 2:00 PM to 3:00 PM Toronto time');
  const a = approvalText(p, []);
  assert.equal(a.question, 'accept "Demo with Rhea"');
  assert.match(a.means, /When: Friday, October 16, 2026, 2:00 PM to 3:00 PM Toronto time/);
  assert.match(a.means, /From: the invite \(DTSTART;TZID=America\/Toronto:20261016T140000\)/);
  assert.match(a.means, /Where: 220 King St W, Toronto/);
  assert.match(a.means, /Rhea Patel will be told you accepted\./);
});

test('a clash with his calendar is shown; the same invite already there is not a clash', () => {
  const p = planFromInvite(parseInvites(INVITE)[0]!, 'accept') as any;
  const cal = [
    { id: '1', summary: 'Dentist', start: { dateTime: '2026-10-16T18:30:00Z' }, end: { dateTime: '2026-10-16T19:30:00Z' } },
    { id: '2', iCalUID: 'abc@google.com', summary: 'Demo with Rhea', start: { dateTime: '2026-10-16T18:00:00Z' }, end: { dateTime: '2026-10-16T19:00:00Z' } },
    { id: '3', summary: 'After', start: { dateTime: '2026-10-16T19:00:00Z' }, end: { dateTime: '2026-10-16T20:00:00Z' } },
  ];
  assert.deepEqual(clashes(p, cal as any).map(e => e.summary), ['Dentist'], 'back to back is not a clash');
  assert.match(approvalText(p, cal as any).means, /CLASHES with: Dentist \(2:30 PM\)/);
});

test('from words: no am or pm is refused unless he said it; a day with no time is refused; never a guess', () => {
  const [ambiguous] = findDates('Can we meet Thursday at 2?', sent);
  const no = planFromWords(ambiguous!, 'Coffee', 60);
  assert.ok('why' in no && /does not say am or pm/.test(no.why));
  const pm = planFromWords(ambiguous!, 'Coffee', 30, 'pm');
  assert.ok(!('why' in pm));
  assert.equal(pm.start.dateTime, '2026-10-15T18:00:00.000Z', '2 pm Thursday, Toronto');
  assert.equal(pm.end.dateTime, '2026-10-15T18:30:00.000Z');
  assert.ok(pm.doubts.some(d => /you said pm/.test(d)));
  assert.ok(pm.doubts.some(d => /worked out from when the email was sent/.test(d)), 'the "Thursday" doubt stays on the approval');
  const [dayOnly] = findDates('Let us talk next Tuesday', sent);
  const r = planFromWords(dayOnly!, 'Talk', 60, 'pm');
  assert.ok('why' in r && /no time/.test(r.why));
});

test('which date: by its exact words only; a cancelled meeting is not booked', () => {
  const f = factsOf({ mimeType: 'text/plain', body: { data: Buffer.from('Friday, Oct 16 at 2pm or Monday at 10am').toString('base64url') } }, [], sent);
  const ok = pickSource(f, 'Friday, Oct 16 at 2pm');
  assert.ok('date' in ok);
  const bad = pickSource(f, '2pm Friday');
  assert.ok('why' in bad && /exact words: "Friday, Oct 16 at 2pm", "Monday at 10am"/.test(bad.why));
  const cancelled = factsOf(undefined, ['BEGIN:VCALENDAR\nMETHOD:CANCEL\nBEGIN:VEVENT\nDTSTART:20261016T180000Z\nSUMMARY:x\nEND:VEVENT\nEND:VCALENDAR']);
  const c = pickSource(cancelled);
  assert.ok('why' in c && /cancelled/.test(c.why));
});

test('read back: any field Google holds differently is said', () => {
  const p = planFromInvite(parseInvites(INVITE)[0]!, 'accept') as any;
  const good = { id: '2', start: { dateTime: '2026-10-16T14:00:00-04:00' }, end: { dateTime: '2026-10-16T15:00:00-04:00' }, attendees: [{ email: 'bocas.joshua@gmail.com', responseStatus: 'accepted' }] };
  assert.deepEqual(readBack(p, good as any, 'bocas.joshua@gmail.com'), [], 'the same moment written another way matches');
  const off = { ...good, start: { dateTime: '2026-10-16T15:00:00-04:00' }, attendees: [{ email: 'bocas.joshua@gmail.com', responseStatus: 'needsAction' }] };
  const w = readBack(p, off as any, 'bocas.joshua@gmail.com');
  assert.equal(w.length, 2);
  assert.match(w.join(' '), /the start is/);
  assert.match(w.join(' '), /your answer shows as needsAction, not accepted/);
});

test('an all-day invite stays on its own date', () => {
  const p = planFromInvite(parseInvites('BEGIN:VEVENT\nUID:b\nDTSTART;VALUE=DATE:20261017\nDTEND;VALUE=DATE:20261018\nSUMMARY:Birthday\nEND:VEVENT')[0]!, 'add') as any;
  assert.deepEqual(p.start, { date: '2026-10-17' });
  assert.equal(sayPlanTime(p), 'Saturday, October 17, 2026, all day');
});

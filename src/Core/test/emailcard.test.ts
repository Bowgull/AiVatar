// E3: the email card is built from code's facts; the model adds only its summary and the sender's asks. A time code is
// not sure of becomes a CHECK row with why, never a confident line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emailCardData, promptFor, sayRange } from '../src/emailcard.ts';
import { factsOf, parseInvites } from '../src/emailfacts.ts';

const b64 = (s: string) => Buffer.from(s).toString('base64url');
const INVITE = 'BEGIN:VCALENDAR\nMETHOD:REQUEST\nBEGIN:VEVENT\nDTSTART;TZID=America/Toronto:20261016T140000\nDTEND;TZID=America/Toronto:20261016T150000\nSUMMARY:Demo with Rhea\nLOCATION:220 King St W\\, Toronto\nDESCRIPTION:Join: https://us02web.zoom.us/j/8123456789\nEND:VEVENT\nEND:VCALENDAR';

test('the card: the invite time and place from code, the call, videos and files counted, buttons that apply', () => {
  const payload = { mimeType: 'multipart/mixed', parts: [
    { mimeType: 'text/html', body: { data: b64('<a href="https://www.loom.com/share/abc">Product tour</a> <a href="https://youtu.be/xyz">Customer story</a>') } },
    { mimeType: 'text/calendar', body: { data: b64(INVITE) } },
    { mimeType: 'application/pdf', filename: 'Demo brief.pdf', body: { attachmentId: 'a', size: 1000 } },
  ] };
  const facts = factsOf(payload, [INVITE], new Date('2026-10-13T12:41:00Z'));
  const r = emailCardData({ id: 'm1', fromName: 'Rhea Patel', fromEmail: 'rhea@northwind.com', subject: 'Next steps', sentMs: Date.parse('2026-10-13T12:41:00Z'), facts },
    'She wants a demo of your design work.', ['confirm by Wednesday', 'bring 2 case studies']);
  const rows = (r.data.rows as any[]);
  assert.deepEqual(rows[0], { icon: 'cal', w: 'Fri, Oct 16, 2:00 pm to 3:00 pm', m: 'invite' });
  assert.deepEqual(rows[1], { icon: 'pin', w: '220 King St W, Toronto', m: '' });
  assert.deepEqual(rows[2], { icon: 'call', w: 'Zoom call', m: 'link in the email' });
  assert.deepEqual(rows[3], { icon: 'video', w: '2 videos', m: 'Product tour, Customer story' });
  assert.deepEqual(rows[4], { icon: 'file', w: 'Demo brief.pdf', m: '' });
  assert.deepEqual(rows[5], { icon: 'ask', w: 'Asks', m: 'confirm by Wednesday; bring 2 case studies' });
  assert.equal(r.data.sent, 'Tue, Oct 13, 8:41 am');
  assert.deepEqual(r.acts, ['transcripts', 'prep', 'reply', 'files']);
  assert.equal(r.join, 'https://us02web.zoom.us/j/8123456789');
});

test('no invite: the dates as written, with the words beside them, and CHECK for each doubt', () => {
  const payload = { mimeType: 'text/plain', body: { data: b64('Can we meet Thursday at 2? Thanks, Sam') } };
  const facts = factsOf(payload, [], new Date('2026-10-13T16:00:00Z'));
  const r = emailCardData({ id: 'm2', fromName: 'Sam', fromEmail: 's@x.com', subject: 'Meet?', sentMs: 0, facts }, 'Sam wants to meet.', []);
  const rows = (r.data.rows as any[]);
  assert.equal(rows[0].icon, 'check', 'not sure: no am or pm');
  assert.equal(rows[0].m, '"Thursday at 2"');
  assert.ok(rows.some(x => x.w === 'CHECK' && /am or pm is not written/.test(x.m)));
  assert.deepEqual(r.acts, ['prep', 'reply'], 'no videos, no files: only the buttons that apply');
  assert.equal(r.join, null);
});

test('an invite in a time zone nobody knows: no time on the card, a CHECK instead', () => {
  const ics = 'BEGIN:VEVENT\nDTSTART;TZID=Customized Time Zone:20261016T140000\nSUMMARY:x\nEND:VEVENT';
  const facts = factsOf({ mimeType: 'text/plain', body: { data: b64('hi') } }, [ics]);
  const r = emailCardData({ id: 'm3', fromName: 'X', fromEmail: 'x@y.z', subject: 's', sentMs: 0, facts }, '', []);
  const rows = (r.data.rows as any[]);
  assert.equal(rows.some(x => x.icon === 'cal'), false);
  assert.ok(rows.some(x => x.icon === 'check' && /does not know for sure/.test(x.m)));
});

test('time ranges, all-day dates, and the button words', () => {
  const [i] = parseInvites('BEGIN:VEVENT\nDTSTART:20261016T230000Z\nDTEND:20261017T050000Z\nSUMMARY:x\nEND:VEVENT');
  assert.equal(sayRange(i!.start, i!.end), 'Fri, Oct 16, 7:00 pm to Sat, Oct 17, 1:00 am', 'across midnight, both days said');
  const [a] = parseInvites('BEGIN:VEVENT\nDTSTART;VALUE=DATE:20261017\nSUMMARY:x\nEND:VEVENT');
  assert.equal(sayRange(a!.start, a!.end), 'Sat, Oct 17, all day');
  assert.match(promptFor('reply', 'm1'), /Draft a reply to email m1/);
});

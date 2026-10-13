// E1 (his rule, 2026-10-13: "NEVER EVER ... get a date wrong, not read a time or date correctly"). The invite formats
// real senders use, and the cases that trip readers up: time zones written three ways, the clock change, all-day dates,
// DURATION instead of an end, folded lines, escaped commas, a colon inside a quoted name, cancellations; links hidden
// behind Outlook and Google redirects; phone numbers and addresses as written.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { factsBlock, factsOf, findAddresses, findLinks, findPhones, kindOfLink, parseInvites, realUrl, sayTime, zoneOf, zonedToUtc } from '../src/emailfacts.ts';

const GOOGLE = [
  'BEGIN:VCALENDAR', 'PRODID:-//Google Inc//Google Calendar 70.9054//EN', 'VERSION:2.0', 'CALSCALE:GREGORIAN', 'METHOD:REQUEST',
  'BEGIN:VTIMEZONE', 'TZID:America/Toronto', 'BEGIN:DAYLIGHT', 'TZOFFSETFROM:-0500', 'TZOFFSETTO:-0400', 'DTSTART:19700308T020000', 'END:DAYLIGHT', 'END:VTIMEZONE',
  'BEGIN:VEVENT', 'DTSTART;TZID=America/Toronto:20261016T140000', 'DTEND;TZID=America/Toronto:20261016T150000', 'DTSTAMP:20261013T124100Z',
  'ORGANIZER;CN=Rhea Patel:mailto:rhea@northwind.com', 'UID:abc123@google.com',
  'ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN="Patel: Rhea";X-NUM-GUESTS=0:mailto:rhea@northwind.com',
  'ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN=you@example.com:mailto:you@example.com',
  'DESCRIPTION:Product demo\\, then Q&A.\\nJoin with Google Meet: https://meet.google.com/abc-defg-hij\\n',
  ' Bring two case studies.',
  'LOCATION:220 King St W\\, Toronto\\, ON M5H 1K4', 'SEQUENCE:0', 'STATUS:CONFIRMED', 'SUMMARY:Demo with Rhea', 'TRANSP:OPAQUE',
  'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:This is an event reminder', 'TRIGGER:-P0DT0H30M0S', 'END:VALARM',
  'END:VEVENT', 'END:VCALENDAR',
].join('\r\n');

test('a Google invite: the time in its zone, the place with its commas, who sent it, the call link', () => {
  const [i] = parseInvites(GOOGLE);
  assert.ok(i);
  assert.equal(i.method, 'REQUEST');
  assert.equal(i.title, 'Demo with Rhea');
  assert.equal(i.start?.iso, '2026-10-16T18:00:00.000Z', '2 pm in Toronto in October is 18:00 UTC (daylight time)');
  assert.equal(i.end?.iso, '2026-10-16T19:00:00.000Z');
  assert.equal(i.where, '220 King St W, Toronto, ON M5H 1K4', 'escaped commas read back as commas');
  assert.deepEqual(i.organizer, { name: 'Rhea Patel', email: 'rhea@northwind.com' });
  assert.equal(i.attendees[0]?.name, 'Patel: Rhea', 'a colon inside a quoted name does not cut the line');
  assert.equal(i.attendees.length, 2);
  assert.match(i.description, /then Q&A\.\nJoin with Google Meet: https:\/\/meet\.google\.com\/abc-defg-hij\nBring two case studies\./, 'escaped new lines and a folded line');
  assert.equal(i.description.includes('event reminder'), false, 'the reminder inside the event is not the event');
  assert.equal(sayTime(i.start), 'Friday, October 16, 2026 at 2:00 PM Toronto time');
});

test('Outlook: a Windows zone name, an Outlook label, and a zone nobody knows (said, never guessed)', () => {
  const ev = (dt: string) => `BEGIN:VCALENDAR\nMETHOD:REQUEST\nBEGIN:VEVENT\n${dt}\nSUMMARY:x\nEND:VEVENT\nEND:VCALENDAR`;
  assert.equal(parseInvites(ev('DTSTART;TZID=Eastern Standard Time:20261016T140000'))[0]?.start?.iso, '2026-10-16T18:00:00.000Z');
  assert.equal(parseInvites(ev('DTSTART;TZID=Pacific Standard Time:20261016T110000'))[0]?.start?.iso, '2026-10-16T18:00:00.000Z', '11 am Pacific is 2 pm Toronto');
  assert.equal(parseInvites(ev('DTSTART;TZID="(UTC-05:00) Eastern Time (US & Canada)":20261016T140000'))[0]?.start?.iso, '2026-10-16T18:00:00.000Z');
  const odd = parseInvites(ev('DTSTART;TZID=Customized Time Zone 7:20261016T140000'))[0]!.start!;
  assert.equal(odd.iso, undefined, 'no time is made up');
  assert.match(sayTime(odd), /^NOT SURE: the invite uses a time zone Aang does not know for sure/);
  assert.match(sayTime(odd), /as written: DTSTART;TZID=Customized Time Zone 7:20261016T140000/);
  assert.equal(zoneOf('/mozilla.org/20070129_1/America/New_York'), 'America/New_York');
  assert.equal(zoneOf('Nowhere/Fake'), null);
});

test('the sender in another zone: both times are said', () => {
  const [i] = parseInvites('BEGIN:VEVENT\nDTSTART;TZID=Europe/London:20261016T190000\nSUMMARY:Call with London\nEND:VEVENT');
  assert.equal(i!.start!.iso, '2026-10-16T18:00:00.000Z');
  assert.equal(sayTime(i!.start), 'Friday, October 16, 2026 at 2:00 PM Toronto time (Fri 7:00 PM where it was written, Europe/London)');
});

test('UTC times, all-day dates, DURATION instead of an end, and a cancellation', () => {
  const [u] = parseInvites('BEGIN:VEVENT\nDTSTART:20261016T180000Z\nDURATION:PT1H30M\nSUMMARY:u\nEND:VEVENT');
  assert.equal(u!.start!.iso, '2026-10-16T18:00:00.000Z');
  assert.equal(u!.end!.iso, '2026-10-16T19:30:00.000Z');
  const [a] = parseInvites('BEGIN:VEVENT\nDTSTART;VALUE=DATE:20261017\nDTEND;VALUE=DATE:20261018\nSUMMARY:Birthday\nEND:VEVENT');
  assert.equal(a!.allDay, true);
  assert.equal(a!.start!.date, '2026-10-17', 'a date stays that date');
  assert.equal(sayTime(a!.start), 'Saturday, October 17, 2026 (all day)');
  const [c] = parseInvites('BEGIN:VCALENDAR\nMETHOD:CANCEL\nBEGIN:VEVENT\nDTSTART:20261016T180000Z\nSUMMARY:Demo\nSTATUS:CANCELLED\nEND:VEVENT\nEND:VCALENDAR');
  assert.equal(c!.cancelled, true);
  const [r] = parseInvites('BEGIN:VEVENT\nDTSTART;TZID=America/Toronto:20261019T090000\nRRULE:FREQ=WEEKLY;BYDAY=MO\nSUMMARY:Standup\nEND:VEVENT');
  assert.equal(r!.recurring, 'FREQ=WEEKLY;BYDAY=MO');
});

test('the clock change: the night clocks go back, and the hour they skip, are both flagged', () => {
  // 2026-11-01 1:30 am happens twice in Toronto; 2026-03-08 2:30 am never happens.
  assert.match(zonedToUtc(2026, 11, 1, 1, 30, 0, 'America/Toronto').note ?? '', /happens twice/);
  assert.match(zonedToUtc(2026, 3, 8, 2, 30, 0, 'America/Toronto').note ?? '', /skip/);
  assert.equal(zonedToUtc(2026, 11, 2, 14, 0, 0, 'America/Toronto').ms, Date.parse('2026-11-02T19:00:00Z'), 'after the change: UTC-5');
  assert.equal(zonedToUtc(2026, 10, 30, 14, 0, 0, 'America/Toronto').ms, Date.parse('2026-10-30T18:00:00Z'), 'before it: UTC-4');
  assert.equal(zonedToUtc(2026, 10, 30, 14, 0, 0, 'America/Toronto').note, undefined);
});

test('links: where they really go (Outlook Safe Links, Google redirects), and what kind each is', () => {
  const safe = 'https://nam12.safelinks.protection.outlook.com/?url=https%3A%2F%2Fwww.loom.com%2Fshare%2Fabc123&data=05%7C01';
  assert.equal(realUrl(safe), 'https://www.loom.com/share/abc123');
  assert.equal(realUrl('https://www.google.com/url?q=https://youtu.be/xyz&sa=D'), 'https://youtu.be/xyz');
  const html = `<p>Watch <a href="${safe.replace(/&/g, '&amp;')}">the product tour</a> and <a href='https://www.youtube.com/watch?v=abc'>the customer story</a>.</p>
    <a href="https://us02web.zoom.us/j/8123456789?pwd=x">Join Zoom</a> <a href="https://maps.app.goo.gl/Xyz">Map</a>
    <a href="https://docs.google.com/document/d/1/edit">Brief</a> <a href="https://news.example.com/unsubscribe?u=1">Unsubscribe</a> <a href="javascript:alert(1)">bad</a>`;
  const ls = findLinks(html, 'Or see https://vimeo.com/12345.');
  const by = Object.fromEntries(ls.map(l => [l.url, l]));
  assert.equal(by['https://www.loom.com/share/abc123']?.kind, 'video');
  assert.equal(by['https://www.loom.com/share/abc123']?.text, 'the product tour');
  assert.ok(by['https://www.loom.com/share/abc123']?.wrapped, 'it says it was unwrapped');
  assert.equal(by['https://www.youtube.com/watch?v=abc']?.kind, 'video');
  assert.equal(by['https://us02web.zoom.us/j/8123456789?pwd=x']?.kind, 'call');
  assert.equal(by['https://maps.app.goo.gl/Xyz']?.kind, 'map');
  assert.equal(by['https://docs.google.com/document/d/1/edit']?.kind, 'file');
  assert.equal(by['https://news.example.com/unsubscribe?u=1']?.kind, 'unsubscribe');
  assert.equal(by['https://vimeo.com/12345']?.kind, 'video', 'a bare link in the text, without its full stop');
  assert.equal(ls.some(l => l.url.startsWith('javascript')), false, 'web addresses only');
  assert.equal(kindOfLink('https://meet.google.com/abc-defg-hij'), 'call');
  assert.equal(kindOfLink('https://teams.microsoft.com/l/meetup-join/19%3ameeting'), 'call');
});

test('phone numbers as written, and street addresses, only clear ones', () => {
  const p = findPhones('Call me at (416) 555-0199 or 647.555.0123 x204, or +44 20 7946 0958. Order #2026101612 is not a phone.');
  assert.deepEqual(p.map(x => x.text), ['(416) 555-0199', '647.555.0123 x204', '+44 20 7946 0958']);
  assert.deepEqual(p.map(x => x.digits), ['+14165550199', '+16475550123x204', '+442079460958']);
  const a = findAddresses('Meet at 220 King St W, Toronto, ON M5H 1K4 at 2. Parking is at 15 Duncan Street. We have 3 great options.');
  assert.deepEqual(a, ['220 King St W, Toronto, ON M5H 1K4', '15 Duncan Street']);
});

test('a whole email: the invite is the source for the meeting, and the block the model sees says so', () => {
  const b64 = (s: string) => Buffer.from(s).toString('base64url');
  const payload = { mimeType: 'multipart/mixed', parts: [
    { mimeType: 'multipart/alternative', parts: [
      { mimeType: 'text/plain', body: { data: b64('Hi Joshua, see you Thursday. Call 416-555-0199 if lost.') } },
      { mimeType: 'text/html', body: { data: b64('<p>Hi Joshua, <a href="https://www.youtube.com/watch?v=abc">tour</a></p>') } },
      { mimeType: 'text/calendar', body: { data: b64(GOOGLE) } },
    ] },
    { mimeType: 'application/pdf', filename: 'Demo brief.pdf', body: { attachmentId: 'att1', size: 182000 } },
  ] };
  const f = factsOf(payload, [GOOGLE]);
  assert.equal(f.invites.length, 1);
  assert.equal(f.attachments[0]?.name, 'Demo brief.pdf');
  assert.ok(f.links.some(l => l.url === 'https://meet.google.com/abc-defg-hij' && l.kind === 'call'), 'the call link inside the invite');
  assert.ok(f.addresses.includes('220 King St W, Toronto, ON M5H 1K4'));
  const block = factsBlock(f);
  assert.match(block, /Starts: Friday, October 16, 2026 at 2:00 PM Toronto time   \[as written: DTSTART;TZID=America\/Toronto:20261016T140000\]/);
  assert.match(block, /Videos:\n  https:\/\/www\.youtube\.com\/watch\?v=abc  \(shown as "tour"\)/);
  assert.match(block, /Demo brief\.pdf \(application\/pdf, 178 KB\)/);
  assert.match(block, /416-555-0199/);
});

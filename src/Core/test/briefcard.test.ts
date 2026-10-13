// Sheet 21's cards from real calendar and mail shapes. Dates and times are the part that must never be wrong (his rule,
// 2026-10-13: "never get a date wrong"), so every way a time can be written is checked here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { atToronto, briefCardData, inboxCardData, weekCardData } from '../src/briefcard.ts';

test('a time is always Toronto time with am or pm, across the clock change', () => {
  assert.equal(atToronto('2026-10-16T18:00:00Z'), '2:00 pm', 'EDT: UTC-4');
  assert.equal(atToronto('2026-11-02T19:00:00Z'), '2:00 pm', 'EST after the change: UTC-5');
  assert.equal(atToronto('2026-10-16T14:00:00-04:00'), '2:00 pm', 'an offset written in');
  assert.equal(atToronto('2026-10-16T04:30:00Z'), '12:30 am', 'just after midnight is am, not pm');
  assert.equal(atToronto('2026-10-16T16:00:00Z'), '12:00 pm', 'noon is pm');
  assert.equal(atToronto('not a date'), '', 'nothing made up for a bad value');
});

test('the week: events land on his day in Toronto; an all-day event is its own date, never the day before', () => {
  const from = new Date('2026-10-14T12:00:00Z');                       // Wednesday morning in Toronto
  const d: any = weekCardData([
    { summary: 'Demo with Rhea', location: '220 King St W', start: { dateTime: '2026-10-16T18:00:00Z' } },
    { summary: 'Late call', start: { dateTime: '2026-10-15T02:30:00Z' } },     // 10:30 pm Wednesday in Toronto, Thursday in UTC
    { summary: 'Mom birthday', start: { date: '2026-10-17' } },
    { summary: 'Dentist', start: { dateTime: '2026-10-14T14:30:00Z' } },
    { summary: 'Next month', start: { dateTime: '2026-11-20T15:00:00Z' } },    // outside the range: not shown
  ], from, 4);
  assert.equal(d.title, 'YOUR WEEK');
  assert.equal(d.range, 'Oct 14 to Oct 17');
  assert.deepEqual(d.days.map((x: any) => x.name), ['WEDNESDAY, OCT 14', 'THURSDAY, OCT 15', 'FRIDAY, OCT 16', 'SATURDAY, OCT 17']);
  assert.deepEqual(d.days[0].items.map((x: any) => `${x.tm} ${x.title}`), ['10:30 am Dentist', '10:30 pm Late call'], 'in time order, on Wednesday');
  assert.equal(d.days[1].items.length, 0, 'Thursday has nothing');
  assert.deepEqual(d.days[2].items[0], { tm: '2:00 pm', title: 'Demo with Rhea', where: '220 King St W' });
  assert.deepEqual(d.days[3].items[0], { tm: 'all day', title: 'Mom birthday', where: '' }, 'Saturday the 17th, not Friday');
  const one: any = weekCardData([], from, 1);
  assert.equal(one.title, 'TODAY');
  assert.equal(one.range, 'Oct 14');
});

test('the inbox card: names without addresses, subjects as written, JOB for companies his hunt tracks', () => {
  const d: any = inboxCardData([
    { from: '"Rhea Patel" <rhea@northwind.com>', subject: 'Next steps', unread: true },
    { from: 'Amazon <ship@amazon.ca>', subject: 'Shipped', unread: false },
  ], ['northwind']);
  assert.equal(d.unread, 1);
  assert.deepEqual(d.rows[0], { tag: 'JOB', who: 'Rhea Patel', what: 'Next steps', unread: true });
  assert.equal(d.rows[1].tag, '');
  assert.equal(d.rows[1].who, 'Amazon');
});

test('the brief: empty sections are left out, and an empty morning says so', () => {
  const r = briefCardData({ day: 'Wednesday, October 15', unread: [], events: [] });
  assert.match(r.text, /Nothing new this morning/);
  assert.equal(r.waiting, 0);
});

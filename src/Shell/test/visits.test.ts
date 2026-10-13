import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addVisit, clearSince, forget, nameVisit, prune, search, type Visit } from '../src/visits.ts';
import { kindOf, trayOf, type Dl } from '../src/dlist.ts';

const DAY = 86_400_000;

test('history keeps web pages only, and the same page within a minute is one visit', () => {
  let l: Visit[] = [];
  l = addVisit(l, 'aang:settings', '', 1000);
  l = addVisit(l, 'file:///C:/x.txt', '', 1000);
  l = addVisit(l, 'https://a.com/x', '', 1000);
  l = addVisit(l, 'https://a.com/x#top', 'A', 20_000);
  l = addVisit(l, 'https://a.com/x', '', 200_000);
  assert.equal(l.length, 2);
  assert.equal(l[0].title, 'A');
  nameVisit(l, 'https://a.com/x', 'A again');
  assert.equal(l[1].title, 'A again');
});

test('history: 90 days, newest first, every word must match, paged', () => {
  const now = 200 * DAY;
  const l = prune([{ url: 'https://old.com/', title: 'Old', at: now - 91 * DAY }, { url: 'https://www.wowhead.com/naxx', title: 'Naxx guide', at: now - DAY },
    { url: 'https://reddit.com/r/classicwow', title: 'Mage build', at: now - 10 }], now);
  assert.equal(l.length, 2);
  assert.deepEqual(search(l, '', 0, 10).items.map((v) => v.title), ['Mage build', 'Naxx guide']);
  assert.deepEqual(search(l, 'wowhead naxx', 0, 10).items.map((v) => v.title), ['Naxx guide']);
  assert.equal(search(l, 'naxx mage', 0, 10).items.length, 0);
  const p = search(l, '', 0, 1);
  assert.equal(p.more, true);
  assert.equal(search(l, '', 1, 1).items[0].title, 'Naxx guide');
});

test('history: forget one, clear a stretch, clear everything', () => {
  const l: Visit[] = [{ url: 'https://a.com/', title: 'a', at: 10 }, { url: 'https://b.com/', title: 'b', at: 20 }, { url: 'https://c.com/', title: 'c', at: 30 }];
  assert.deepEqual(forget(l, 'https://b.com/', 20).map((v) => v.title), ['a', 'c']);
  assert.deepEqual(clearSince(l, 20).map((v) => v.title), ['a']);
  assert.equal(clearSince(l, 0).length, 0);
});

const D = (id: number, at: number, state: Dl['state'] = 'done'): Dl => ({ id, name: `f${id}.zip`, file: `C:\\f${id}.zip`, site: '', size: 1, at, state });

test('the tray: this run only, newest 5, gone an hour after the last one unless one is coming in', () => {
  const now = 10 * 3_600_000;
  const list = [D(1, now - 100_000_000), ...[2, 3, 4, 5, 6, 7].map((i) => D(i, now - 60_000 + i))];
  assert.deepEqual(trayOf(list, now - 3_600_000, now).map((d) => d.id), [7, 6, 5, 4, 3]);
  assert.equal(trayOf(list, now, now).length, 0);                                   // Clear list, or a new run
  assert.equal(trayOf([D(1, now - 2 * 3_600_000)], 0, now).length, 0);             // an hour went by
  assert.equal(trayOf([D(1, now - 2 * 3_600_000, 'going')], 0, now).length, 1);    // still coming in
});

test('file kinds for the paper icons', () => {
  assert.equal(kindOf('Questie.zip'), 'zip');
  assert.equal(kindOf('guide.PDF'), 'pdf');
  assert.equal(kindOf('setup.exe'), 'exe');
  assert.equal(kindOf('notes'), 'file');
});

import { neverKeep, forAang } from '../src/visits.ts';

test('2026-10-13: banking and money sites are never kept, and never reach Aang', () => {
  for (const u of ['https://www1.royalbank.com/cgi-bin', 'https://easyweb.td.com/waw/idp', 'https://www.scotiabank.com/ca', 'https://www.paypal.com/myaccount',
    'https://my.wealthsimple.com/app', 'https://www.tangerine.ca/app', 'https://online.desjardins.com/x', 'https://bank.example.org/login', 'https://www.coinbase.com/home'])
    assert.equal(neverKeep(u), true, u);
  for (const u of ['https://www.wowhead.com/classic', 'https://www.reddit.com/r/wow', 'https://www.bankrate.com/', 'https://www.youtube.com/watch?v=1', 'https://github.com/Bowgull'])
    assert.equal(neverKeep(u), false, u);
  assert.deepEqual(addVisit([], 'https://www.paypal.com/x', 'PayPal', 1000), []);
});

test('2026-10-13: Aang finds a page by its words, newest first, once each, within the days asked', () => {
  const now = 100 * 86_400_000;
  let list = addVisit([], 'https://www.wowhead.com/thunder-bluff', 'Thunder Bluff - Wowhead', now - 3 * 86_400_000);
  list = addVisit(list, 'https://www.reddit.com/r/wow', 'r/wow', now - 2 * 86_400_000);
  list = addVisit(list, 'https://www.wowhead.com/thunder-bluff', 'Thunder Bluff - Wowhead', now - 86_400_000);
  list = addVisit(list, 'https://old.example.com/', 'Old page', now - 30 * 86_400_000);
  const hits = forAang(list, 'wowhead thunder', 14, 15, now);
  assert.equal(hits.length, 1);
  assert.equal(hits[0]!.at, now - 86_400_000);
  assert.equal(forAang(list, '', 14, 15, now).length, 2);
  assert.equal(forAang(list, 'old', 14, 15, now).length, 0);
  assert.equal(forAang(list, 'old', 40, 15, now).length, 1);
});

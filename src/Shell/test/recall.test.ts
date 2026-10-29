import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pastSearches, searchQueryOf, siteName, topSites } from '../src/recall.ts';

const NOW = Date.UTC(2026, 9, 29);
const DAY = 86_400_000;
const v = (url: string, daysAgo: number, title = '') => ({ url, title, at: NOW - daysAgo * DAY });

test('a search page is his words, on every engine Samara uses', () => {
  assert.equal(searchQueryOf('https://search.brave.com/search?q=pixel+art+tutorial&summary=0'), 'pixel art tutorial');
  assert.equal(searchQueryOf('https://noai.duckduckgo.com/?q=valheim%20map'), 'valheim map');
  assert.equal(searchQueryOf('https://www.google.com/search?q=weather&udm=14'), 'weather');
  assert.equal(searchQueryOf('https://yandex.com/search/?text=cats'), 'cats');
  assert.equal(searchQueryOf('https://en.wikipedia.org/wiki/Pixel_art'), null);
  assert.equal(searchQueryOf('http://search.brave.com/search?q=x'), null);
  assert.equal(searchQueryOf('https://search.brave.com/images?q=x'), null);
});

test('past searches hold what he typed, often-and-recent first, never his exact words', () => {
  const list = [
    v('https://search.brave.com/search?q=pixel+art', 40),
    v('https://search.brave.com/search?q=pixel+art+tutorial', 2),
    v('https://search.brave.com/search?q=pixel+art+tutorial', 1),
    v('https://search.brave.com/search?q=pixel+watch', 0.5),
    v('https://search.brave.com/search?q=pix', 0.1),
    v('https://www.reddit.com/', 0.1),
  ];
  assert.deepEqual(pastSearches(list, 'pix', NOW).map((x) => x.query), ['pixel art tutorial', 'pixel watch', 'pixel art']);
  assert.deepEqual(pastSearches(list, 'PIXEL W', NOW).map((x) => x.query), ['pixel watch']);
});

test('with nothing typed: his last searches, newest first', () => {
  const list = [v('https://search.brave.com/search?q=a', 3), v('https://search.brave.com/search?q=b', 2), v('https://search.brave.com/search?q=a', 1)];
  assert.deepEqual(pastSearches(list, '', NOW).map((x) => x.query), ['a', 'b']);
});

test('a month-old habit fades under this week', () => {
  const old = Array.from({ length: 6 }, (_, i) => v('https://old.example/', 90 + i));
  const now = Array.from({ length: 3 }, (_, i) => v('https://new.example/', i));
  assert.equal(topSites([...old, ...now], NOW, 1)[0]!.url, 'https://new.example/');
});

test('top sites: one line per site, never a search page', () => {
  const list = [v('https://www.reddit.com/r/a', 1), v('https://www.reddit.com/r/b', 1), v('https://search.brave.com/search?q=x', 0), v('https://en.wikipedia.org/wiki/X', 2)];
  assert.deepEqual(topSites(list, NOW).map((x) => [x.url, x.title]), [['https://reddit.com/', 'Reddit'], ['https://en.wikipedia.org/', 'Wikipedia']]);
  assert.equal(siteName('www.youtube.com'), 'Youtube');
});

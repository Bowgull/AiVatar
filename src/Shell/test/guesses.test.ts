// Sheet 88: the search engine's guesses as he types.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guessesUrl, parseGuesses, setSearch } from '../src/address.ts';

test('each engine asks its own suggestion address; addresses and empty text ask nothing', () => {
  setSearch('brave', false);
  assert.equal(guessesUrl('pixel art'), 'https://search.brave.com/api/suggest?q=pixel%20art');
  assert.equal(guessesUrl('pixel', 'yandex'), 'https://suggest.yandex.com/suggest-ff.cgi?part=pixel&uil=en');
  setSearch('ddg', false); assert.match(guessesUrl('a')!, /^https:\/\/duckduckgo\.com\/ac\//);
  setSearch('google', false); assert.match(guessesUrl('a')!, /^https:\/\/suggestqueries\.google\.com\//);
  setSearch('brave', false);
  assert.equal(guessesUrl('   '), null);
  assert.equal(guessesUrl('https://reddit.com/r/x'), null);
  assert.equal(guessesUrl('x'.repeat(201)), null);
});

test('the answer becomes at most 4 plain guesses, never what he typed, no repeats', () => {
  assert.deepEqual(parseGuesses(['pixel', ['pixel', 'pixel 11', 'Pixel 11', 'pixel art', 'pixel watch', 'pixel 10', 'pixel fold']], 'pixel'), ['pixel 11', 'pixel art', 'pixel watch', 'pixel 10']);
  assert.deepEqual(parseGuesses(['x', [1, null, '  spaced   out  ', {}]], 'x'), ['spaced out']);
  assert.deepEqual(parseGuesses({ not: 'a list' }, 'x'), []);
  assert.deepEqual(parseGuesses('<html>', 'x'), []);
});

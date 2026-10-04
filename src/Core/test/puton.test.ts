// Step 6.7: reading "put X on" without a model, and the sub-or-dub table.
//
// The point of these is the two ways this can be wrong, both of which are worse than asking:
// a link opened over his game that is not what he meant, and a 404.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_DUBS, TWITCH_LOGIN, dubFor, isPlan, linkIn, nameLeftOver, readChannels, readDubs, readWords,
  rememberChannel, setDub, youtubeIn,
} from '../src/puton.ts';

const plan = (words: string, channels = {}) => {
  const r = readWords(words, channels);
  assert.ok(isPlan(r), `expected a plan for "${words}", got: ${JSON.stringify(r)}`);
  return r;
};
const unsure = (words: string) => {
  const r = readWords(words);
  assert.ok(!isPlan(r), `expected "${words}" to be unclear, got: ${JSON.stringify(r)}`);
  return r;
};

test('a Twitch channel, from the shape of the sentence', () => {
  for (const words of ['put on asmongold stream', 'pull up asmongold on twitch', "asmongold's stream", 'put asmongold on twitch']) {
    const p = plan(words);
    assert.equal(p.url, 'https://www.twitch.tv/asmongold', words);
    assert.equal(p.service, 'Twitch');
    assert.equal(p.exact, true);
  }
});

test('spaces close up, because that is how he says the name out loud', () => {
  assert.equal(plan('put zack rawrr on twitch').url, 'https://www.twitch.tv/zackrawrr');
});

test('a name that cannot be a Twitch channel gets the search, not a certain 404', () => {
  // Three characters is below Twitch's own four-character minimum, so the channel cannot exist.
  const p = plan('put abc on twitch');
  assert.ok(p.url.startsWith('https://www.twitch.tv/search?term='), p.url);
  assert.equal(p.exact, false, 'and it says it is a search, not the thing itself');
  assert.equal(TWITCH_LOGIN.test('abc'), false);
  assert.equal(TWITCH_LOGIN.test('asmongold'), true);
});

test('"put twitch on" with no name asks instead of guessing', () => {
  assert.match(unsure('put twitch on').because, /did not say whose/);
});

test('a link he pasted wins, and only on services he watches', () => {
  assert.equal(plan('put this on https://www.youtube.com/watch?v=abc123').url, 'https://www.youtube.com/watch?v=abc123');
  assert.equal(plan('put this on https://youtu.be/abc123').service, 'YouTube');
  assert.equal(plan('https://www.twitch.tv/somebody').service, 'Twitch');
  // Plain text is upgraded rather than followed: every one of these serves https anyway.
  assert.equal(plan('put on http://www.crunchyroll.com/watch/x').url, 'https://www.crunchyroll.com/watch/x');
  // Anywhere else is a browser, which is step 6.19, not this tool.
  assert.equal(linkIn('put https://example.com/video on'), null);
});

test('a YouTube handle is exact; a YouTube name is a search', () => {
  const h = plan('put @LinusTechTips on youtube');
  assert.equal(h.url, 'https://www.youtube.com/@LinusTechTips');
  assert.equal(h.exact, true, 'a handle costs 1 quota unit against 100 for a search');
  const s = plan('put some lofi on youtube');
  assert.ok(s.url.startsWith('https://www.youtube.com/results?search_query='), s.url);
  assert.equal(s.exact, false);
  assert.equal(youtubeIn('put asmongold on'), null, 'and it only answers when he said YouTube');
});

test('a bare name is NOT guessed the first time: code cannot tell a streamer from a show', () => {
  // The important one. "put asmongold on" could be a channel or a show, and opening the wrong page over
  // his game is worse than one question. So the first time he says where, and then it is remembered.
  const r = unsure('put asmongold on');
  assert.equal(r.words, 'asmongold');
  assert.match(r.because, /not where to watch it/);

  const remembered = rememberChannel({}, 'asmongold', plan('put asmongold on twitch'));
  assert.deepEqual(remembered, { asmongold: { service: 'Twitch', url: 'https://www.twitch.tv/asmongold' } });
  // Second time, with no service named, it is certain and no model is asked.
  const p = plan('put asmongold on', remembered);
  assert.equal(p.url, 'https://www.twitch.tv/asmongold');
  assert.equal(p.exact, true);
});

test('only a real channel is remembered, never a search or an episode link', () => {
  // A search page would be remembered as if it were the thing itself.
  assert.deepEqual(rememberChannel({}, 'lofi', plan('put some lofi on youtube')), {});
  // And an episode link goes stale the moment he watches it.
  assert.deepEqual(
    rememberChannel({}, 'frieren',
      { url: 'https://simkl.com/x', what: 'Frieren episode 4', service: 'your watch list', exact: true }),
    {});
});

test('a hand-edited channel file is filled in, not thrown on', () => {
  assert.deepEqual(readChannels(null), {});
  assert.deepEqual(readChannels({ a: { service: 'Twitch', url: 'http://insecure' } }), {}, 'plain http is dropped');
  assert.deepEqual(readChannels({ a: { service: 'Nowhere', url: 'https://x' } }), {}, 'an unknown service is dropped');
  assert.deepEqual(readChannels({ Asmongold: { service: 'Twitch', url: 'https://www.twitch.tv/asmongold' } }),
    { asmongold: { service: 'Twitch', url: 'https://www.twitch.tv/asmongold' } }, 'and one spelling per name');
});

test('a bare show title is NOT answered here, because where it streams is a lookup', () => {
  // The whole point. Guessing a service opens the wrong page over his game.
  const r = unsure('put frieren on');
  assert.match(r.because, /not where to watch it/);
  assert.equal(r.words, 'frieren', 'and the title is handed on, for his watch list or Qwen to settle');
});

test('the scaffolding comes off but the name does not', () => {
  assert.equal(nameLeftOver('hey aang, can you please put asmongold on for me'), 'asmongold');
  assert.equal(nameLeftOver('put on some_body'), 'some_body');
});

test('empty words ask rather than opening anything', () => {
  assert.match(unsure('   ').because, /did not say what/);
});

// ---------------------------------------------------------------------------- sub or dub

test('sub or dub is looked up most specific first', () => {
  let t = DEFAULT_DUBS;
  assert.equal(dubFor(t, 'Frieren').want, 'sub', 'subbed unless he says otherwise');

  t = setDub(t, 'dub', undefined, 'anime');
  assert.equal(dubFor(t, 'Frieren', 'anime').want, 'dub');
  assert.equal(dubFor(t, 'Frieren').want, 'sub', 'and the category only applies when the category is known');

  t = setDub(t, 'sub', 'Frieren');
  assert.equal(dubFor(t, 'Frieren', 'anime').want, 'sub', 'the show beats the category');
  assert.equal(dubFor(t, 'Dandadan', 'anime').want, 'dub', 'and everything else still follows the category');

  t = setDub(t, 'dub');
  assert.equal(dubFor(t, 'Some Film').want, 'dub', 'and the global catches the rest');
});

test('it says which row decided, so he can see why and correct it', () => {
  const t = setDub(DEFAULT_DUBS, 'dub', 'Frieren');
  assert.match(dubFor(t, 'frieren').from, /your setting for frieren/i);
  assert.match(dubFor(t, 'Anything Else').from, /what you usually want/);
});

test('one spelling per title, so "Frieren" and "frieren " are the same row', () => {
  const t = setDub(DEFAULT_DUBS, 'dub', '  Frieren  ');
  assert.equal(dubFor(t, 'frieren').want, 'dub');
  assert.equal(dubFor(t, 'FRIEREN').want, 'dub');
});

test('a hand-edited or older file is filled in, not thrown on', () => {
  assert.deepEqual(readDubs(null), DEFAULT_DUBS);
  assert.deepEqual(readDubs('nonsense'), DEFAULT_DUBS);
  const t = readDubs({ global: 'maybe', categories: { anime: 'dub', film: 'x' }, shows: null });
  assert.equal(t.global, 'sub', 'a value that is neither sub nor dub falls back');
  assert.deepEqual(t.categories, { anime: 'dub' }, 'and a bad row is dropped rather than kept');
  assert.deepEqual(t.shows, {});
});

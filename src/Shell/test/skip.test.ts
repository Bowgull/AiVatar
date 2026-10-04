// What Aang skips (step 6.6). Nothing is skipped silently, and nothing here guesses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SkipTimes, dueAt } from '../src/skip/aniskip.ts';
import { Sponsor, nameOf } from '../src/skip/sponsor.ts';
import { DEFAULT_SKIPS, SKIP_RULES, withDefaults } from '../src/skip/settings.ts';

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'aang-skip-'));

/** A stand-in for the network, so these tests never touch it. */
function fakeFetch(answers: Record<string, unknown>, log: string[] = []) {
  return (async (url: string | URL) => {
    const u = String(url);
    log.push(u);
    const key = Object.keys(answers).find(k => u.includes(k));
    if (!key) return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
    return { ok: true, status: 200, json: async () => answers[key] } as unknown as Response;
  }) as unknown as typeof globalThis.fetch;
}

// ---------------------------------------------------------------- anime openings

test('an opening and an ending come back as times', async () => {
  const s = new SkipTimes(tmp(), fakeFetch({
    'api.aniskip.com': {
      found: true,
      results: [
        { interval: { startTime: 28.7, endTime: 118.7 }, skipType: 'op' },
        { interval: { startTime: 1388, endTime: 1500 }, skipType: 'ed' },
      ],
    },
  }));
  const got = await s.forEpisode(21, 1);
  assert.deepEqual(got, [{ kind: 'op', from: 28.7, to: 118.7 }, { kind: 'ed', from: 1388, to: 1500 }]);
});

test('an episode nobody has marked is an ordinary answer, not a failure', async () => {
  const s = new SkipTimes(tmp(), fakeFetch({}));          // every request 404s
  assert.deepEqual(await s.forEpisode(21, 999), []);
});

test('it asks once and remembers, because the database is unmaintained', async () => {
  const log: string[] = [];
  const s = new SkipTimes(tmp(), fakeFetch({ 'api.aniskip.com': { results: [] } }, log));
  await s.forEpisode(21, 1);
  await s.forEpisode(21, 1);
  await s.forEpisode(21, 1);
  assert.equal(log.filter(u => u.includes('aniskip')).length, 1, 'asked once, not three times');
});

test('a title becomes the id AniSkip understands, and that is remembered too', async () => {
  const log: string[] = [];
  const s = new SkipTimes(tmp(), fakeFetch({ 'anilist.co': { data: { Media: { idMal: 52991 } } } }, log));
  assert.equal(await s.malId('Frieren'), 52991);
  assert.equal(await s.malId('Frieren'), 52991);
  assert.equal(log.filter(u => u.includes('anilist')).length, 1);
});

test('nonsense coming back is thrown away rather than acted on', async () => {
  const s = new SkipTimes(tmp(), fakeFetch({
    'api.aniskip.com': {
      results: [
        { interval: { startTime: 100, endTime: 50 }, skipType: 'op' },   // ends before it starts
        { interval: { startTime: 10 }, skipType: 'op' },                  // no end at all
        { interval: { startTime: 5, endTime: 9 }, skipType: 'recap' },    // not a kind we asked for
        { interval: { startTime: 1, endTime: 2 }, skipType: 'op' },       // the only good one
      ],
    },
  }));
  assert.deepEqual(await s.forEpisode(1, 1), [{ kind: 'op', from: 1, to: 2 }]);
});

test('a skip only fires at its start, never once he has chosen to watch it', () => {
  const skips = [{ kind: 'op' as const, from: 30, to: 120 }];
  assert.equal(dueAt(skips, 29.9), null, 'not before');
  assert.ok(dueAt(skips, 30), 'at the start');
  assert.ok(dueAt(skips, 30.9), 'just after the start');
  // He let it run for twenty seconds, so he is watching it. Jumping now would be rude.
  assert.equal(dueAt(skips, 50), null);
  assert.equal(dueAt(skips, 200), null, 'and not after it has gone');
});

// ---------------------------------------------------------------- sponsor bits

test('SponsorBlock is asked by a hashed prefix, so it never learns what he is watching', async () => {
  const log: string[] = [];
  const s = new Sponsor(fakeFetch({
    'skipSegments': [
      { videoID: 'otherVideo', segments: [{ segment: [0, 10], category: 'sponsor' }] },
      { videoID: 'aqz-KE-bpKQ', segments: [{ segment: [12, 34], category: 'sponsor' }] },
    ],
  }, log));
  const got = await s.forVideo('aqz-KE-bpKQ');
  assert.deepEqual(got, [{ from: 12, to: 34, kind: 'sponsor' }], 'his video is picked out on this machine');
  // The video id itself must never appear in what was sent.
  assert.ok(!log[0]!.includes('aqz-KE-bpKQ'), log[0]);
  assert.match(log[0]!, /skipSegments\/[0-9a-f]{4}\?/, 'four characters of a hash, and no more');
});

test('the categories worth skipping, and the ones deliberately left alone', async () => {
  const s = new Sponsor(fakeFetch({
    'skipSegments': [{
      videoID: 'v', segments: [
        { segment: [1, 2], category: 'sponsor' },
        { segment: [3, 4], category: 'music_offtopic' },   // the music in a music video
        { segment: [5, 6], category: 'poi_highlight' },    // a marker, not a thing to skip
        { segment: [7, 8], category: 'selfpromo' },
      ],
    }],
  }));
  assert.deepEqual((await s.forVideo('v')).map(x => x.kind), ['sponsor', 'selfpromo']);
});

test('the plaque says it in plain English, never "selfpromo"', () => {
  assert.equal(nameOf('selfpromo'), 'self-promotion');
  assert.equal(nameOf('interaction'), 'like and subscribe');
  assert.equal(nameOf('whatever-new-thing'), 'bit');
});

// ---------------------------------------------------------------- the switches

test('Twitch ad blocking is off until he decides, and everything else is on', () => {
  assert.equal(DEFAULT_SKIPS.twitchAds, false);
  for (const r of SKIP_RULES) {
    if (r.id !== 'twitchAds') assert.equal(DEFAULT_SKIPS[r.id], true, r.id);
  }
});

test('every switch carries an honest word about how well it works', () => {
  for (const r of SKIP_RULES) {
    assert.ok(r.reliabilitySays.length > 2, r.id);
    assert.ok(['solid', 'mostly', 'shaky'].includes(r.reliability), r.id);
  }
  // The two that break are not described as if they do not.
  assert.equal(SKIP_RULES.find(r => r.id === 'youtubeAds')!.reliability, 'mostly');
  assert.equal(SKIP_RULES.find(r => r.id === 'twitchAds')!.reliability, 'shaky');
});

test('a saved file missing a switch gets the default, never off by accident', () => {
  assert.deepEqual(withDefaults({ twitchAds: true }), { ...DEFAULT_SKIPS, twitchAds: true });
  assert.deepEqual(withDefaults(null), DEFAULT_SKIPS);
  assert.deepEqual(withDefaults({ nonsense: 1, sponsor: 'yes' }), DEFAULT_SKIPS);
});

// ---------------------------------------------------------------- the service's own Skip button

test('each service is matched on its host, and a lookalike is not', async () => {
  const { rulesFor } = await import('../src/skip/skipbutton.ts');
  assert.equal(rulesFor('https://www.primevideo.com/detail/x')[0]?.host, 'primevideo.com');
  assert.equal(rulesFor('https://beta.crunchyroll.com/watch/x')[0]?.host, 'crunchyroll.com');
  assert.equal(rulesFor('https://www.netflix.com/watch/1')[0]?.host, 'netflix.com');
  assert.deepEqual(rulesFor('https://crunchyroll.com.evil.ru/watch'), []);
  assert.deepEqual(rulesFor('https://www.youtube.com/watch?v=x'), []);
  assert.deepEqual(rulesFor('not a link'), []);
});

test('Netflix is marked fragile and the other two are not, because that is true', async () => {
  const { SKIP_BUTTONS } = await import('../src/skip/skipbutton.ts');
  assert.equal(SKIP_BUTTONS.find(r => r.host === 'netflix.com')!.steady, false);
  assert.equal(SKIP_BUTTONS.find(r => r.host === 'primevideo.com')!.steady, true);
  assert.equal(SKIP_BUTTONS.find(r => r.host === 'crunchyroll.com')!.steady, true);
});

test('the watcher sends a real mouse sequence, not just a click', async () => {
  const { SKIP_BUTTONS, watcherFor } = await import('../src/skip/skipbutton.ts');
  const js = watcherFor(SKIP_BUTTONS.find(r => r.host === 'netflix.com')!);
  // Netflix's button is a React component that ignores a synthetic .click().
  for (const ev of ['pointerdown', 'mousedown', 'mouseup', 'click']) assert.match(js, new RegExp(ev));
  // It must not run twice over, and must not press in a loop.
  assert.match(js, /__aangSkipWatch/);
  assert.match(js, /lastPressed/);
  // And it must never press something he could not have pressed himself.
  assert.match(js, /offsetParent/);
});

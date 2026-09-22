// "Put the next episode on", with a pretend Simkl: no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_SITE, Simkl, episodeLink, findShow, nextOf } from '../src/simkl.ts';

const list = {
  anime: [
    { status: 'watching', show: { title: 'Frieren: Beyond Journey\'s End' }, watched_episodes_count: 5, total_episodes_count: 28, last_watched_at: '2026-09-20T22:00:00Z' },
    { status: 'watching', show: { title: 'Dandadan' }, next_to_watch: 'S1E9', watched_episodes_count: 8, total_episodes_count: 12, last_watched_at: '2026-09-21T01:00:00Z' },
    { status: 'completed', show: { title: 'Mob Psycho 100' }, watched_episodes_count: 12, total_episodes_count: 12 },
    { status: 'watching', show: { title: 'Finished Show' }, watched_episodes_count: 12, total_episodes_count: 12 },
  ],
  shows: [{ status: 'watching', show: { title: 'Severance' }, watched_episodes_count: 3, total_episodes_count: null, last_watched_at: '2026-09-01T00:00:00Z' }],
};

test('what he is watching: only "watching", caught-up shows left out, newest watched first, next episode worked out', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'aang-simkl-'));
  writeFileSync(path.join(dir, 'simkl.json'), JSON.stringify({ clientId: 'c'.repeat(32), accessToken: 't' }));
  const sk = new Simkl(path.join(dir, 'simkl.json'), async () => ({ ok: true, status: 200, json: async () => list, text: async () => '' }));
  const shows = await sk.watching();
  assert.deepEqual(shows.map(s => [s.title, s.next]), [['Dandadan', 9], ['Frieren: Beyond Journey\'s End', 6], ['Severance', 4]]);
  assert.equal(sk.site, DEFAULT_SITE);
});

test('the show he means, loosely', () => {
  const shows = [{ title: 'Frieren: Beyond Journey\'s End' }, { title: 'Dandadan' }] as any;
  assert.equal(findShow(shows, 'frieren')!.title, 'Frieren: Beyond Journey\'s End');
  assert.equal(findShow(shows, 'DANDADAN')!.title, 'Dandadan');
  assert.equal(findShow(shows, 'beyond journey')!.title, 'Frieren: Beyond Journey\'s End');
  assert.equal(findShow(shows, 'one piece'), null);
});

test('the next episode, and the link that opens it', () => {
  assert.equal(nextOf({ next_to_watch: 'S2E3' }), 3);
  assert.equal(nextOf({ watched_episodes_count: 7 }), 8);
  assert.equal(episodeLink(DEFAULT_SITE, { title: 'Dandadan', next: 9 } as any), 'https://www.crunchyroll.com/search?q=Dandadan%20episode%209');
});

// "Put the next episode on", with a pretend Simkl: no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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

// The 2026-10-04 breakage: his access token expired, the renewal key had been thrown away at sign-in, and
// `watch_next` just failed. These three cover the fix end to end.
const store = (j: object) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'aang-simkl-'));
  const file = path.join(dir, 'simkl.json');
  writeFileSync(file, JSON.stringify(j));
  return file;
};
const ok = (body: object) => ({ ok: true, status: 200, json: async () => body, text: async () => '' });
const unauthorised = { ok: false, status: 401, json: async () => ({ error: 'invalid_token' }), text: async () => '' };

test('an expired token renews itself and the answer still arrives', async () => {
  const file = store({ clientId: 'c'.repeat(32), accessToken: 'stale', refreshToken: 'renew-me' });
  const seen: string[] = [];
  let refreshSent: { type: string; body: string } | null = null;
  const sk = new Simkl(file, async (url: string, init?: any) => {
    const auth = String(init?.headers?.authorization ?? '');
    seen.push(`${url.includes('oauth2/token') ? 'REFRESH' : 'LIST'} ${auth.replace('Bearer ', '')}`);
    if (url.includes('oauth2/token')) {
      refreshSent = { type: String(init?.headers?.['content-type'] ?? ''), body: String(init?.body ?? '') };
      return ok({ access_token: 'fresh', refresh_token: 'renew-again', expires_in: 604800 }) as any;
    }
    return (auth.includes('stale') ? unauthorised : ok(list)) as any;
  });

  const shows = await sk.watching();
  assert.deepEqual(shows.map(s => s.title), ['Dandadan', 'Frieren: Beyond Journey\'s End', 'Severance']);
  // stale call, refresh, retry: one renewal, not a loop.
  assert.deepEqual(seen, ['LIST stale', 'REFRESH ', 'LIST fresh']);

  // OAuth token endpoints take a form, not JSON. Sending JSON would have failed every single week.
  assert.match(refreshSent!.type, /application\/x-www-form-urlencoded/);
  const sent = new URLSearchParams(refreshSent!.body);
  assert.equal(sent.get('grant_type'), 'refresh_token');
  assert.equal(sent.get('refresh_token'), 'renew-me');
  assert.equal(sent.get('client_id'), 'c'.repeat(32));

  // and it is written down, so the next run starts fresh rather than renewing again
  const after = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(after.accessToken, 'fresh');
  assert.equal(after.refreshToken, 'renew-again', 'the rotated key is kept: the old one is dead');
  assert.ok(after.expiresAt > Date.now(), 'expiry kept');
});

test('two calls at once share one renewal, because renewing kills the old token', async () => {
  const file = store({ clientId: 'c'.repeat(32), accessToken: 'stale', refreshToken: 'renew-me' });
  let refreshes = 0;
  const sk = new Simkl(file, async (url: string, init?: any) => {
    const auth = String(init?.headers?.authorization ?? '');
    if (url.includes('oauth2/token')) {
      refreshes++;
      await new Promise(r => setTimeout(r, 25));              // slow enough for a second caller to arrive
      return ok({ access_token: 'fresh', refresh_token: 'renew-again', expires_in: 604800 }) as any;
    }
    return (auth.includes('stale') ? unauthorised : ok(list)) as any;
  });

  const [a, b] = await Promise.all([sk.watching(), sk.watching()]);
  assert.equal(a.length, 3);
  assert.equal(b.length, 3);
  assert.equal(refreshes, 1, 'one renewal shared, not one each');
});

test('a sign-in saved before the fix says what to do, instead of a bare 401', async () => {
  const file = store({ clientId: 'c'.repeat(32), accessToken: 'stale' });   // no refreshToken: the old shape
  const sk = new Simkl(file, async () => unauthorised as any);
  await assert.rejects(sk.watching(), (e: Error) => {
    assert.match(e.message, /run tools\\simkl-setup\.cmd/i);
    assert.match(e.message, /keep itself going/i, 'tells him it will not happen again');
    return true;
  });
});

test('a refusal to renew does not loop, and asks for a fresh sign-in', async () => {
  const file = store({ clientId: 'c'.repeat(32), accessToken: 'stale', refreshToken: 'revoked' });
  let calls = 0;
  const sk = new Simkl(file, async (url: string) => {
    calls++;
    if (url.includes('oauth2/token')) return { ok: false, status: 400, json: async () => ({ error: 'invalid_grant' }), text: async () => '' } as any;
    return unauthorised as any;
  });
  await assert.rejects(sk.watching(), /would not renew/i);
  assert.equal(calls, 2, 'one list call, one refused renewal, then it stops');
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

// Step 6.8: ticking episodes off his Simkl list.
//
// Nothing here talks to Simkl. What is tested is the part that can be silently wrong: the percentage,
// which decides whether an episode counts as watched at all, and the handful of answers Simkl gives
// that are successes but do not look like it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Simkl } from '../src/simkl.ts';
import type { Show } from '../src/simkl.ts';

const show = (over: Partial<Show> = {}): Show => ({
  title: 'Frieren', next: 4, watched: 3, total: 28, kind: 'anime', lastAt: 0, id: 1265720, year: 2023, ...over,
});

/** A signed-in Simkl pointed at a fake that records what was asked of it. */
function fake(reply: (url: string, body: any) => { status: number; json?: any }) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'simkl-'));
  const file = path.join(dir, 'simkl.json');
  writeFileSync(file, JSON.stringify({ clientId: 'cid', accessToken: 'tok', refreshToken: 'ref' }));
  const calls: Array<{ url: string; body: any; method: string }> = [];
  const sk = new Simkl(file, (async (url: string, init: any) => {
    const body = init?.body ? JSON.parse(init.body) : null;
    calls.push({ url: String(url), body, method: init?.method ?? 'GET' });
    const r = reply(String(url), body);
    return { ok: r.status < 400, status: r.status, json: async () => r.json ?? {} };
  }) as never);
  return { sk, calls };
}

test('seconds become the percentage Simkl wants, and it is clamped', async () => {
  const { sk, calls } = fake(() => ({ status: 201, json: { action: 'start' } }));
  await sk.scrobble('start', show(), 4, 300, 1440);          // 300 of 1440 seconds
  assert.equal(calls[0]!.body.progress, 20.83, 'a percentage, not seconds');

  await sk.scrobble('stop', show(), 4, 1500, 1440);           // past the end
  assert.equal(calls[1]!.body.progress, 100, 'never above 100');

  // A length of zero is "not known yet", not "finished". Reporting 100 here would mark an episode
  // watched the instant it was opened.
  await sk.scrobble('start', show(), 4, 5, 0);
  assert.equal(calls[2]!.body.progress, 0);
});

test('the right endpoint, and the show named by its Simkl id', async () => {
  const { sk, calls } = fake(() => ({ status: 201, json: { action: 'scrobble' } }));
  await sk.scrobble('stop', show(), 4, 1400, 1440);
  assert.equal(calls[0]!.url, 'https://api.simkl.com/scrobble/stop');
  assert.equal(calls[0]!.method, 'POST');
  // An id, not just a title: "Frieren" matching the wrong row would tick off the wrong show.
  assert.deepEqual(calls[0]!.body.anime.ids, { simkl: 1265720 });
  assert.equal(calls[0]!.body.anime.year, 2023);
  assert.deepEqual(calls[0]!.body.episode, { number: 4 });

  // TV goes in `show`, anime in `anime`. Simkl treats them as different things.
  const tv = fake(() => ({ status: 201, json: { action: 'scrobble' } }));
  await tv.sk.scrobble('stop', show({ kind: 'tv' }), 2, 1400, 1440);
  assert.ok(tv.calls[0]!.body.show, 'a TV show goes in `show`');
  assert.equal(tv.calls[0]!.body.anime, undefined);
});

test('without a Simkl id it declines rather than matching by title', async () => {
  const { sk, calls } = fake(() => ({ status: 201, json: { action: 'start' } }));
  assert.equal(await sk.scrobble('start', show({ id: 0 }), 4, 10, 1440), null);
  assert.equal(calls.length, 0, 'nothing was sent at all');
});

test('Simkl\'s own answer is passed back, including the ones that are not failures', async () => {
  // Below 80% a stop saves his place instead of marking it watched. That is the right outcome and a
  // different sentence, so the caller has to be able to tell.
  const paused = fake(() => ({ status: 200, json: { action: 'pause' } }));
  assert.equal(await paused.sk.scrobble('stop', show(), 4, 600, 1440), 'pause');

  const marked = fake(() => ({ status: 200, json: { action: 'scrobble' } }));
  assert.equal(await marked.sk.scrobble('stop', show(), 4, 1400, 1440), 'scrobble');

  // Their duplicate protection: already marked within the hour. From his point of view it worked.
  const dupe = fake(() => ({ status: 409 }));
  assert.equal(await dupe.sk.scrobble('stop', show(), 4, 1400, 1440), 'already');
});

test('a sign-in that cannot write says so in words he can act on', async () => {
  const { sk } = fake(() => ({ status: 403 }));
  await assert.rejects(() => sk.scrobble('start', show(), 4, 10, 1440), /simkl-setup/);
});

test('two scrobbles never overlap, because Simkl allows one at a time', async () => {
  // Their docs: one scrobble operation per account, twenty-second lock. Overlapping means one loses.
  let inFlight = 0, most = 0;
  const dir = mkdtempSync(path.join(os.tmpdir(), 'simkl-'));
  const file = path.join(dir, 'simkl.json');
  writeFileSync(file, JSON.stringify({ clientId: 'c', accessToken: 't' }));
  const sk = new Simkl(file, (async () => {
    most = Math.max(most, ++inFlight);
    await new Promise(r => setTimeout(r, 15));
    inFlight--;
    return { ok: true, status: 201, json: async () => ({ action: 'start' }) };
  }) as never);

  await Promise.all([
    sk.scrobble('start', show(), 4, 1, 100),
    sk.scrobble('pause', show(), 4, 2, 100),
    sk.scrobble('start', show(), 4, 3, 100),
  ]);
  assert.equal(most, 1, 'they queued instead of racing');
});

test('one failure does not block every scrobble after it', async () => {
  let first = true;
  const dir = mkdtempSync(path.join(os.tmpdir(), 'simkl-'));
  const file = path.join(dir, 'simkl.json');
  writeFileSync(file, JSON.stringify({ clientId: 'c', accessToken: 't' }));
  const sk = new Simkl(file, (async () => {
    if (first) { first = false; throw new Error('network down'); }
    return { ok: true, status: 201, json: async () => ({ action: 'start' }) };
  }) as never);

  await assert.rejects(() => sk.scrobble('start', show(), 4, 1, 100));
  // The queue is a promise chain, so a rejection left unhandled would stop everything behind it.
  assert.equal(await sk.scrobble('start', show(), 4, 2, 100), 'start');
});

test('the watching list carries the id and year that scrobbling needs', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'simkl-'));
  const file = path.join(dir, 'simkl.json');
  writeFileSync(file, JSON.stringify({ clientId: 'c', accessToken: 't' }));
  const sk = new Simkl(file, (async () => ({
    ok: true, status: 200, json: async () => ({
      anime: [{
        status: 'watching', watched_episodes_count: 3, total_episodes_count: 28,
        last_watched_at: '2026-10-01T00:00:00Z',
        anime: { title: 'Frieren', year: 2023, ids: { simkl: 1265720 } },
      }],
    }),
  })) as never);
  const [s] = await sk.watching();
  assert.equal(s!.id, 1265720, 'without this, 6.8 cannot name the show to Simkl');
  assert.equal(s!.year, 2023);
  assert.equal(s!.next, 4);
});

// What he likes on Reddit, learned, and the mix it makes (reddittaste.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fade, freshTaste, headStart, heat, learn, liking, mix, readTaste, split, whyFor } from '../src/reddittaste.ts';
import type { FeedPost } from '../src/reddit.ts';

const NOW = 1_800_000_000_000, H = 3_600_000;
let n = 0;
const p = (sub: string, o: Partial<FeedPost> = {}): FeedPost => ({ id: 'p' + n++, sub, title: 't', author: 'a', created: NOW - H, score: 100, comments: 0, link: '', url: null,
  kind: 'text', body: '', image: null, video: null, w: null, h: null, spoiler: false, source: 'yours', vote: 0, top: [], topAt: 0, ...o });

test('the dial: favourites 8/2/0, the middle 6/3/1, new things 3/4/3', () => {
  assert.deepEqual(split(0), { yours: 8, trending: 2, discovery: 0 });
  assert.deepEqual(split(0.5), { yours: 6, trending: 3, discovery: 1 });
  assert.deepEqual(split(1), { yours: 3, trending: 4, discovery: 3 });
  assert.deepEqual(split(NaN), split(0.5));
});

test("a small sub's best post beats a big sub's average one (compared within each sub), and age cools", () => {
  const small = [p('tiny', { score: 40 }), p('tiny', { score: 4 }), p('tiny', { score: 2 })];
  const big = [p('huge', { score: 5000 }), p('huge', { score: 5100 }), p('huge', { score: 20000 })];
  const h = heat([...small, ...big], NOW);
  assert.ok(h.get(small[0]!.id)! > h.get(big[0]!.id)!);
  const old = p('tiny', { score: 40, created: NOW - 48 * H });
  assert.ok(heat([...small, old], NOW).get(old.id)! < h.get(small[0]!.id)!);
});

test('learning: opens, reading time (three minutes at most), more and less; hide and unhide', () => {
  const t = freshTaste();
  learn(t, { t: 'open', id: 'x', sub: 'WoW' }); learn(t, { t: 'open', id: 'x', sub: 'wow' });
  learn(t, { t: 'read', id: 'x', sub: 'wow', ms: 60_000 }); learn(t, { t: 'read', id: 'x', sub: 'wow', ms: 9e9 });
  learn(t, { t: 'less', sub: 'news' });
  assert.equal(t.subs.wow!.w, 2 + 0.5 + 1.5);
  assert.deepEqual(t.opened, ['x']);
  assert.ok(liking(t, 'news') < 0);
  learn(t, { t: 'hide', sub: 'News' }); learn(t, { t: 'hide', sub: 'news' }); assert.deepEqual(t.hidden, ['news']);
  learn(t, { t: 'unhide', sub: 'NEWS' }); assert.deepEqual(t.hidden, []);
});

test('the head start counts each upvote and save once, even across days', () => {
  const t = freshTaste();
  headStart(t, ['zelda', 'zelda', 'Gardening'], ['zelda'], NOW);
  assert.equal(t.subs.zelda!.w, 2 * 0.4 + 0.7);
  headStart(t, ['zelda', 'zelda', 'gardening'], ['zelda'], NOW + 86_400_000);
  assert.equal(t.subs.zelda!.w, 2 * 0.4 + 0.7);
  assert.equal(whyFor(t, 'zelda'), 'You save posts from r/zelda');
  assert.equal(whyFor(t, 'Gardening'), 'You upvote posts in r/Gardening');
  assert.equal(whyFor(t, 'space'), 'Popular today in r/space');
});

test('fading: a little each whole day, never twice for the same day', () => {
  const t = freshTaste(); t.subs.a = { w: 10, opened: 0, readMs: 0, more: 0, less: 0, up: 0, saved: 0 };
  fade(t, NOW); fade(t, NOW + 2.5 * 86_400_000);
  assert.ok(Math.abs(t.subs.a.w - 10 * 0.97 ** 2) < 1e-9);
  fade(t, NOW + 2.9 * 86_400_000);
  assert.ok(Math.abs(t.subs.a.w - 10 * 0.97 ** 2) < 1e-9);
});

test('the mix: 6/3/1 in every 10, no sub twice within five, nothing hidden or already opened, discovery never a joined sub', () => {
  const t = freshTaste(); t.subscribed = ['a', 'b', 'c', 'd', 'e', 'f'];
  t.hidden = ['nope']; t.opened = ['seen'];
  const yours = ['a', 'b', 'c', 'd', 'e', 'f'].flatMap((s) => [p(s), p(s), p(s)]);
  yours.push(p('nope'), p('a', { id: 'seen' }));
  const trending = ['n1', 'n2', 'n3', 'n4', 'n5', 'n6'].flatMap((s) => [p(s, { source: 'trending' }), p(s, { source: 'trending' })]);
  const discovery = [p('a', { source: 'discovery' }), p('g1', { source: 'discovery' }), p('g2', { source: 'discovery' })];
  const out = mix({ yours, trending, discovery }, t, 0.5, NOW, 20);
  const first = out.slice(0, 10).map((x) => x.pick);
  assert.deepEqual([first.filter((x) => x === 'yours').length, first.filter((x) => x === 'trending').length, first.filter((x) => x === 'discovery').length], [6, 3, 1]);
  for (let i = 0; i < out.length; i++) assert.ok(!out.slice(Math.max(0, i - 4), i).some((x) => x.sub === out[i]!.sub), `r/${out[i]!.sub} twice within five at ${i}`);
  assert.ok(!out.some((x) => x.sub === 'nope' || x.id === 'seen'));
  assert.ok(out.filter((x) => x.pick === 'discovery').every((x) => x.sub !== 'a' && x.why));
  assert.equal(new Set(out.map((x) => x.id)).size, out.length);
});

test('the mix leans to what he likes: More like this lifts a sub up his list', () => {
  const t = freshTaste(); t.subscribed = ['a', 'b'];
  const yours = [p('a', { score: 100 }), p('b', { score: 100 })];
  assert.equal(mix({ yours, trending: [], discovery: [] }, t, 0.5, NOW)[0]!.sub, 'a');
  learn(t, { t: 'more', sub: 'b' });
  assert.equal(mix({ yours, trending: [], discovery: [] }, t, 0.5, NOW)[0]!.sub, 'b');
});

test('a broken taste file starts fresh instead of breaking the feed', () => {
  assert.deepEqual(readTaste(null), freshTaste());
  assert.deepEqual(readTaste({ v: 2 }), freshTaste());
  const t = readTaste({ v: 1, subs: { WoW: { w: 'x', opened: 2 } }, hidden: ['a', 3], opened: 'no' });
  assert.deepEqual(t.subs.wow, { w: 0, opened: 2, readMs: 0, more: 0, less: 0, up: 0, saved: 0 });
  assert.deepEqual(t.hidden, ['a']); assert.deepEqual(t.opened, []);
});

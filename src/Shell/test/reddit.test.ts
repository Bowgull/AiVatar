// The Shrine Reddit feed, Samara's half (reddit.ts): reading Reddit's replies, the filters, the cache and one full read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { READ_CAP, RedditFeed, media, merge, prune, toPost, topComments, type Fetch } from '../src/reddit.ts';

const none = { blockSubs: [], blockWords: [], dial: 0.5, picks: [] };
const post = (d: Record<string, unknown>) => ({ id: 'a1', subreddit: 'wow', title: 'A title', author: 'x', permalink: '/r/wow/comments/a1/a_title/', created_utc: 1_790_000_000, score: 10, num_comments: 3, ...d });
const pic = (u: string, w = 640, h = 360) => ({ preview: { images: [{ source: { url: u + '?full', width: 3000, height: 2000 }, resolutions: [{ url: u + '?108', width: 108, height: 60 }, { url: u, width: w, height: h }] }] } });
const listingOf = (...ds: Record<string, unknown>[]) => ({ data: { children: ds.map((d) => ({ kind: 't3', data: d })) } });

test('a picture post takes the ~640 wide picture, never the full original', () => {
  const p = toPost(post({ post_hint: 'image', url: 'https://i.redd.it/x.jpg', ...pic('https://preview.redd.it/x.jpg') }), 'yours', none)!;
  assert.equal(p.kind, 'image');
  assert.equal(p.image, 'https://preview.redd.it/x.jpg');
  assert.deepEqual([p.w, p.h], [640, 360]);
  assert.equal(p.link, 'https://www.reddit.com/r/wow/comments/a1/a_title/');
});

test('videos, galleries, text and links are told apart', () => {
  const v = media(post({ secure_media: { reddit_video: { fallback_url: 'https://v.redd.it/v/DASH_480.mp4', width: 854, height: 480 } }, ...pic('https://preview.redd.it/s.jpg') }));
  assert.equal(v.kind, 'video'); assert.equal(v.video, 'https://v.redd.it/v/DASH_480.mp4'); assert.equal(v.image, 'https://preview.redd.it/s.jpg');
  const g = media(post({ is_gallery: true, gallery_data: { items: [{ media_id: 'm2' }, { media_id: 'm1' }] },
    media_metadata: { m1: { s: { u: 'https://i.redd.it/one.jpg' } }, m2: { s: { u: 'https://preview.redd.it/two.jpg', x: 1200, y: 800 }, p: [{ u: 'https://preview.redd.it/two-640.jpg', x: 640, y: 427 }] } } }));
  assert.equal(g.kind, 'gallery'); assert.equal(g.image, 'https://preview.redd.it/two-640.jpg');
  const t = toPost(post({ is_self: true, selftext: '  words  ' }), 'yours', none)!;
  assert.equal(t.kind, 'text'); assert.equal(t.body, 'words'); assert.equal(t.url, null);
  assert.equal(media(post({ url: 'https://example.com/story' })).kind, 'link');
});

test('NSFW, pinned, removed and his blocked subs and words never show', () => {
  assert.equal(toPost(post({ over_18: true }), 'yours', none), null);
  assert.equal(toPost(post({ stickied: true }), 'yours', none), null);
  assert.equal(toPost(post({ removed_by_category: 'moderator' }), 'yours', none), null);
  assert.equal(toPost(post({ author: '[deleted]' }), 'yours', none), null);
  assert.equal(toPost(post({ is_self: true, selftext: '[removed]' }), 'yours', none), null);
  assert.equal(toPost(post({ subreddit: 'Politics' }), 'yours', { blockSubs: ['r/politics'], blockWords: [], dial: 0.5, picks: [] }), null);
  assert.equal(toPost(post({ title: 'Big ELECTION news' }), 'yours', { blockSubs: [], blockWords: ['election'], dial: 0.5, picks: [] }), null);
  assert.ok(toPost(post({}), 'yours', { blockSubs: ['politics'], blockWords: ['  '], dial: 0.5, picks: [] }));
});

test('spoilers: marked ones, and late-game Breath of the Wild talk in the Zelda subs', () => {
  assert.equal(toPost(post({ spoiler: true }), 'yours', none)!.spoiler, true);
  assert.equal(toPost(post({ subreddit: 'Breath_of_the_Wild', title: 'Finally beat Calamity Ganon!' }), 'yours', none)!.spoiler, true);
  assert.equal(toPost(post({ subreddit: 'Breath_of_the_Wild', title: 'Look at this view from a tower' }), 'yours', none)!.spoiler, false);
  assert.equal(toPost(post({ subreddit: 'movies', title: 'The ending of that film' }), 'yours', none)!.spoiler, false);
});

test('the top two comments skip bots, pinned notes and removed ones', () => {
  const c = (d: Record<string, unknown>) => ({ kind: 't1', data: { author: 'a', body: 'b', score: 1, ...d } });
  const reply = [{}, { data: { children: [c({ author: 'AutoModerator' }), c({ stickied: true }), c({ body: '[removed]' }), c({ author: 'one', body: ' first ' }), { kind: 'more', data: {} }, c({ author: 'two' }), c({ author: 'three' })] } }];
  assert.deepEqual(topComments(reply).map((x) => [x.author, x.body]), [['one', 'first'], ['two', 'b']]);
  assert.deepEqual(topComments({}), []);
});

test('his posts come first, each post once', () => {
  const a = toPost(post({ id: 'a' }), 'yours', none)!, b = toPost(post({ id: 'b' }), 'trending', none)!, a2 = toPost(post({ id: 'a' }), 'trending', none)!;
  assert.deepEqual(merge([a], [a2, b]).map((p) => [p.id, p.source]), [['a', 'yours'], ['b', 'trending']]);
});

test('the cache drops its oldest files first and never one the feed still shows', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'reddit-prune-'));
  try {
    for (const [f, age] of [['old.jpg', 300], ['shown.jpg', 200], ['new.jpg', 100]] as const) {
      writeFileSync(path.join(dir, f), Buffer.alloc(1000)); const t = new Date(Date.now() - age * 1000); utimesSync(path.join(dir, f), t, t);
    }
    assert.equal(prune(dir, 1500, new Set(['shown.jpg'])), 2);
    assert.deepEqual(readdirSync(dir), ['shown.jpg']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('one full read: signed in, his front page, comments, pictures saved, the feed written; a failed read keeps the last feed', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'reddit-feed-'));
  const asked: string[] = [];
  const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body, arrayBuffer: async () => new TextEncoder().encode(typeof body === 'string' ? body : JSON.stringify(body)).buffer, headers: { get: () => null } });
  let down = false;
  const reddit: Fetch = async (url) => {
    asked.push(url.replace('https://www.reddit.com', ''));
    if (down) return { ok: false, status: 500, json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0), headers: { get: () => null } };
    if (url.includes('/api/me')) return ok({ name: 'him' });
    if (url.includes('/.json')) return ok(listingOf(post({ id: 'f1', post_hint: 'image', url: 'https://i.redd.it/f.jpg', ...pic('https://preview.redd.it/f.jpg') }), post({ id: 'nsfw', over_18: true })));
    if (url.includes('/hot.json')) return ok(listingOf(post({ id: 't1', subreddit: 'science', num_comments: 0 }), post({ id: 'f1' })));
    if (url.includes('/r/popular.json')) return ok(listingOf(post({ id: 'd1', subreddit: 'gardening', num_comments: 0 }), post({ id: 'd2', subreddit: 'wow', num_comments: 0 })));
    if (url.includes('/user/him/upvoted')) return ok(listingOf(post({ id: 'u1', subreddit: 'gardening' })));
    if (url.includes('/user/him/saved')) return ok(listingOf());
    if (url.includes('/comments/f1')) return ok([{}, { data: { children: [{ kind: 't1', data: { author: 'c', body: 'nice', score: 5 } }] } }]);
    if (url.includes('/subreddits/mine')) return { ...ok({ data: { children: [{ kind: 't5', data: { display_name: 'wow', community_icon: 'https://styles.redditmedia.com/wow.png' } }] } }) };
    if (url.includes('/about.json')) return ok({ data: { icon_img: '' } });
    throw new Error('unexpected ' + url);
  };
  const plain: Fetch = async () => ok('PICTURE') as never;
  try {
    const feed = new RedditFeed({ reddit, plain, dir, log: () => {}, gap: 0 });
    const f = (await feed.run())!;
    assert.equal(f.signedIn, true);
    assert.deepEqual(f.posts.map((p) => [p.id, p.pick]).sort(), [['d1', 'discovery'], ['f1', 'yours'], ['t1', 'trending']]);
    assert.equal(f.posts.find((p) => p.id === 'd1')!.why, 'You upvote posts in r/gardening');   // his own upvotes, the head start
    assert.ok(!f.posts.some((p) => p.id === 'd2'), 'a sub he already joined is never "new for you"');
    assert.deepEqual(f.posts[0]!.top, [{ author: 'c', body: 'nice', score: 5 }]);
    assert.ok(f.posts[0]!.image && existsSync(path.join(dir, 'reddit-cache', f.posts[0]!.image)));
    assert.ok(f.icons.wow && f.icons.science === null);
    assert.ok(!asked.some((u) => u.includes('/comments/t1')), 'no comments asked for a post without any');
    // the next read keeps fresh comments instead of asking again, and a failed read leaves the feed alone
    asked.length = 0; await feed.run();
    assert.ok(!asked.some((u) => u.includes('/comments/') || u.includes('/upvoted') || u.includes('/subreddits/mine')), 'comments, subs and the head start are not asked again so soon');
    down = true; assert.equal(await feed.run(), null);
    assert.equal(JSON.parse(readFileSync(path.join(dir, 'reddit-feed.json'), 'utf8')).posts.length, 3);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// a fake Reddit for the gentle-reading rules: answers by path, counts every ask
function fakeReddit(answer: (url: string) => unknown | number) {
  const asked: string[] = [];
  const reply = (status: number, body: unknown = {}) => ({ ok: status === 200, status, json: async () => body, arrayBuffer: async () => new TextEncoder().encode('PIC').buffer as ArrayBuffer, headers: { get: () => null } });
  const reddit: Fetch = async (url) => { asked.push(url.replace('https://www.reddit.com', '')); const a = answer(url); return typeof a === 'number' ? reply(a) : reply(200, a); };
  return { asked, reddit, plain: (async () => reply(200, 'PIC')) as Fetch };
}

test("Reddit's first no stops the whole read, keeps the last feed, and leaves Reddit alone for an hour", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'reddit-no-'));
  let now = 1_800_000_000_000;
  writeFileSync(path.join(dir, 'reddit-feed.json'), JSON.stringify({ v: 1, posts: [{ id: 'old' }] }));
  const f = fakeReddit((url) => url.includes('/api/me') ? { name: 'him' } : url.includes('/subreddits/mine') ? listingOf() : 429);
  try {
    const feed = new RedditFeed({ reddit: f.reddit, plain: f.plain, dir, log: () => {}, gap: 0, now: () => now });
    assert.equal(await feed.run(), null);
    const first = f.asked.length;
    assert.ok(first <= 4, `stopped at the first no, after ${first} asks`);
    assert.deepEqual(JSON.parse(readFileSync(path.join(dir, 'reddit-feed.json'), 'utf8')).posts, [{ id: 'old' }]);
    now += 30 * 60_000; assert.equal(await feed.run(), null);
    assert.equal(f.asked.length, first, 'half an hour later: still resting, not one ask');
    now += 31 * 60_000; await feed.run();
    assert.ok(f.asked.length > first, 'after the hour it tries again');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('signed out: nothing is read, Reddit is left alone, no RSS', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'reddit-out-'));
  const f = fakeReddit(() => 403);
  try {
    assert.equal(await new RedditFeed({ reddit: f.reddit, plain: f.plain, dir, log: () => {}, gap: 0 }).run(), null);
    assert.deepEqual(f.asked, ['/api/me.json?raw_json=1']);
    assert.ok(JSON.parse(readFileSync(path.join(dir, 'reddit-state.json'), 'utf8')).restUntil > Date.now());
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a read never asks more than 60 times, and still writes what it got', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'reddit-cap-'));
  const many = Array.from({ length: 80 }, (_, i) => post({ id: 'm' + i, subreddit: 's' + (i % 40), num_comments: 9 }));
  const f = fakeReddit((url) => url.includes('/api/me') ? { name: 'him' } : url.includes('/comments/') ? [{}, { data: { children: [] } }] : url.includes('/about.json') ? { data: {} } : url.includes('/subreddits/mine') ? listingOf() : listingOf(...many));
  try {
    const out = (await new RedditFeed({ reddit: f.reddit, plain: f.plain, dir, log: () => {}, gap: 0 }).run())!;
    assert.equal(f.asked.length, READ_CAP);
    assert.ok(out.posts.length > 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('his picks (WoW: Forever) are read as his own, and comments are asked again only when a post gets busy', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'reddit-picks-'));
  writeFileSync(path.join(dir, 'reddit-prefs.json'), JSON.stringify({ picks: ['r/wowforever', 'classicwow', 'bad name!'] }));
  let count = 10;
  const f = fakeReddit((url) => url.includes('/api/me') ? { name: 'him' } : url.includes('/r/wowforever+classicwow/hot') ? listingOf(post({ id: 'w1', subreddit: 'wowforever', num_comments: count }))
    : url.includes('/comments/') ? [{}, { data: { children: [{ kind: 't1', data: { author: 'x', body: 'gz', score: 1 } }] } }] : url.includes('/about.json') ? { data: {} } : url.includes('/subreddits/mine') ? listingOf() : listingOf());
  try {
    const feed = new RedditFeed({ reddit: f.reddit, plain: f.plain, dir, log: () => {}, gap: 0 });
    const a = (await feed.run())!;
    assert.deepEqual(a.posts.map((p) => [p.id, p.pick]), [['w1', 'yours']]);
    f.asked.length = 0; count = 25; await feed.run();
    assert.ok(!f.asked.some((u) => u.includes('/comments/w1')), '10 to 25 comments: not busy enough to ask again');
    f.asked.length = 0; count = 60; await feed.run();
    assert.ok(f.asked.some((u) => u.includes('/comments/w1')), '25 to 60: busy, asked again');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('his clicks in the widget teach the taste, hide a sub at once and send a vote only when he votes', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'reddit-asks-'));
  const sent: { url: string; body?: string; mh?: string }[] = [];
  const reddit: Fetch = async (url, init) => {
    if (url.includes('/api/me')) return { ok: true, status: 200, json: async () => ({ data: { name: 'him', modhash: 'mh1' } }), arrayBuffer: async () => new ArrayBuffer(0), headers: { get: () => null } };
    sent.push({ url, body: init?.body, mh: init?.headers?.['X-Modhash'] });
    return { ok: true, status: 200, json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0), headers: { get: () => null } };
  };
  try {
    const p = (id: string, sub: string) => ({ ...toPost(post({ id, subreddit: sub }), 'yours', none)!, pick: 'yours', why: null });
    writeFileSync(path.join(dir, 'reddit-feed.json'), JSON.stringify({ v: 1, posts: [p('a', 'wow'), p('b', 'politics')] }));
    const feed = new RedditFeed({ reddit, plain: reddit, dir, log: () => {}, gap: 0 });
    await feed.hear([{ t: 'open', id: 'a', sub: 'wow' }, { t: 'read', id: 'a', sub: 'wow', ms: 240_000 }, { t: 'more', sub: 'wow' }, { t: 'hide', sub: 'Politics' }]);
    assert.equal(sent.length, 0, 'nothing goes to Reddit for opening, reading, more or hide');
    const taste = JSON.parse(readFileSync(path.join(dir, 'reddit-taste.json'), 'utf8'));
    assert.equal(taste.subs.wow.w, 1 + 1.5 + 3);   // open 1, three minutes at most of reading 1.5, more 3
    assert.deepEqual(taste.hidden, ['politics']); assert.deepEqual(taste.opened, ['a']);
    assert.deepEqual(JSON.parse(readFileSync(path.join(dir, 'reddit-feed.json'), 'utf8')).posts.map((x: { id: string }) => x.id), ['a']);
    await feed.hear([{ t: 'vote', id: 'a', dir: 1 }]);
    assert.equal(sent.length, 1); assert.equal(sent[0]!.url, 'https://www.reddit.com/api/vote'); assert.equal(sent[0]!.body, 'id=t3_a&dir=1&rank=1'); assert.equal(sent[0]!.mh, 'mh1');
    const after = JSON.parse(readFileSync(path.join(dir, 'reddit-feed.json'), 'utf8')).posts[0];
    assert.deepEqual([after.vote, after.score], [1, 11]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// The Shrine Reddit feed, Samara's half (reddit.ts): reading Reddit's replies, the filters, the cache and one full read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RedditFeed, fromRss, listing, media, merge, prune, toPost, topComments, type Fetch } from '../src/reddit.ts';

const none = { blockSubs: [], blockWords: [] };
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
  assert.equal(toPost(post({ subreddit: 'Politics' }), 'yours', { blockSubs: ['r/politics'], blockWords: [] }), null);
  assert.equal(toPost(post({ title: 'Big ELECTION news' }), 'yours', { blockSubs: [], blockWords: ['election'] }), null);
  assert.ok(toPost(post({}), 'yours', { blockSubs: ['politics'], blockWords: ['  '] }));
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

test('signed out, a real Reddit RSS reply still gives posts (titles, subs, links, thumbnails)', () => {
  const posts = fromRss(readFileSync(path.join(import.meta.dirname, 'fixtures', 'reddit', 'hot.rss'), 'utf8'), 'trending', none);
  assert.equal(posts.length, 5);
  for (const p of posts) {
    assert.match(p.id, /^[a-z0-9]+$/); assert.ok(p.sub && p.title && !p.title.includes('&amp;'));
    assert.match(p.link, /^https:\/\/www\.reddit\.com\/r\/.+\/comments\//);
    assert.ok(p.created > 1.7e12);
  }
  assert.equal(listing({}).length, 0);
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
    assert.deepEqual(f.posts.map((p) => [p.id, p.source]), [['f1', 'yours'], ['t1', 'trending']]);
    assert.deepEqual(f.posts[0]!.top, [{ author: 'c', body: 'nice', score: 5 }]);
    assert.ok(f.posts[0]!.image && existsSync(path.join(dir, 'reddit-cache', f.posts[0]!.image)));
    assert.ok(f.icons.wow && f.icons.science === null);
    assert.ok(!asked.some((u) => u.includes('/comments/t1')), 'no comments asked for a post without any');
    // the next read keeps fresh comments instead of asking again, and a failed read leaves the feed alone
    asked.length = 0; await feed.run();
    assert.ok(!asked.some((u) => u.includes('/comments/')));
    down = true; assert.equal(await feed.run(), null);
    assert.equal(JSON.parse(readFileSync(path.join(dir, 'reddit-feed.json'), 'utf8')).posts.length, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('signed out on the Shadow: the data page is refused, the RSS fills the feed', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'reddit-out-'));
  const rss = readFileSync(path.join(import.meta.dirname, 'fixtures', 'reddit', 'hot.rss'), 'utf8');
  const no = { ok: false, status: 403, json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0), headers: { get: () => null } };
  const reddit: Fetch = async (url) => url.endsWith('.rss?limit=40') ? { ok: true, status: 200, json: async () => ({}), arrayBuffer: async () => new TextEncoder().encode(rss).buffer as ArrayBuffer, headers: { get: () => null } } : no;
  const plain: Fetch = async () => no;
  try {
    const f = (await new RedditFeed({ reddit, plain, dir, log: () => {}, gap: 0 }).run())!;
    assert.equal(f.signedIn, false);
    assert.equal(f.posts.length, 5);
    assert.ok(f.posts.every((p) => p.source === 'trending' && p.image === null));   // pictures that will not come are left out, not broken
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

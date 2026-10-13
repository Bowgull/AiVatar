// 9.D D8: 🎮 gaming feeds. No network: the sites' answers are stand-ins.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Feeds, HISWATTSON, apexMap, channelOf, parseSteamFeed, parseYouTubeFeed } from '../src/feeds.ts';

const YT = `<?xml version="1.0"?><feed><title>HisWattson</title>
<entry><yt:videoId>abc123XYZ01</yt:videoId><title>Full Tryhard Lifeline &amp; more</title><published>2026-10-13T10:00:00+00:00</published></entry>
<entry><yt:videoId>old000000AA</yt:videoId><title>Older one</title><published>2026-10-01T10:00:00+00:00</published></entry></feed>`;
const STEAM = `<rss><channel><item><title><![CDATA[Apex Legends: Season 27 patch notes]]></title><link>https://store.steampowered.com/news/app/1172470/view/1</link><guid>g1</guid><pubDate>Mon, 13 Oct 2026</pubDate><description><![CDATA[<p>Wraith buffs and <b>R-301</b> changes.</p>]]></description></item>
<item><title>Planted</title><link>https://evil.test/x</link><guid>g2</guid></item></channel></rss>`;

test('D8: a creator feed and the Apex news feed are read; a link that is not Steam\'s is dropped', () => {
  const ups = parseYouTubeFeed(YT);
  assert.deepEqual(ups.map(u => u.videoId), ['abc123XYZ01', 'old000000AA']);
  assert.equal(ups[0]!.title, 'Full Tryhard Lifeline & more');
  assert.equal(ups[0]!.channel, 'HisWattson');
  const news = parseSteamFeed(STEAM);
  assert.equal(news.length, 1, 'only Steam\'s own links');
  assert.match(news[0]!.summary, /Wraith buffs and R-301 changes\./);
});

test('D8: following someone never floods him with old videos; only what is new after that, once', () => {
  const f = new Feeds(mkdtempSync(path.join(os.tmpdir(), 'aang-feeds-')));
  assert.deepEqual(f.creators, [HISWATTSON], 'HisWattson first');
  assert.deepEqual(f.freshUploads(HISWATTSON, parseYouTubeFeed(YT)), [], 'the first look only remembers');
  const next = parseYouTubeFeed(YT.replace('<entry>', '<entry><yt:videoId>new111111BB</yt:videoId><title>Brand new</title></entry><entry>'));
  assert.deepEqual(f.freshUploads(HISWATTSON, next).map(u => u.videoId), ['new111111BB']);
  assert.deepEqual(f.freshUploads(HISWATTSON, next), [], 'and only once');
  assert.equal(f.follow({ id: 'UC' + 'x'.repeat(22), name: 'Someone' }), true);
  assert.equal(f.follow({ id: 'UC' + 'x'.repeat(22), name: 'Someone' }), false);
  assert.equal(f.unfollow('someone')?.name, 'Someone');
  assert.deepEqual(f.freshNews(parseSteamFeed(STEAM)), [], 'Apex news: the first look only remembers too');
});

test('D8: a creator is found from their @handle; the map key goes in a header, never the address', async () => {
  const c = await channelOf('https://www.youtube.com/@HisWattson', async () => `<meta property="og:title" content="HisWattson"> "externalId":"UCu6xqwLxixO-UidWIQzTHlg"`);
  assert.deepEqual(c, { id: 'UCu6xqwLxixO-UidWIQzTHlg', name: 'HisWattson' });
  let asked = '', sent: Record<string, string> = {};
  const text = await apexMap('KEY123', async (u, h) => { asked = u; sent = h; return { ranked: { current: { map: 'Storm Point', remainingSecs: 6000 }, next: { map: "World's Edge" } }, battle_royale: { current: { map: 'Olympus', remainingSecs: 600 } } }; });
  assert.doesNotMatch(asked, /KEY123/);
  assert.equal(sent.Authorization, 'KEY123');
  assert.match(text, /Ranked: Storm Point \(1h 40m left\), then World's Edge/);
  assert.match(text, /Data from apexlegendsstatus\.com/);
});

// Turning his links into something that plays (step 6.3). Every shape here is one he could paste.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { embedFor, titleFor } from '../src/embed.ts';

test('YouTube, in every shape he might paste', () => {
  const want = 'https://www.youtube.com/embed/aqz-KE-bpKQ';
  for (const link of [
    'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
    'https://youtube.com/watch?v=aqz-KE-bpKQ&list=PL123',
    'https://youtu.be/aqz-KE-bpKQ',
    'https://www.youtube.com/embed/aqz-KE-bpKQ',
    'https://www.youtube.com/live/aqz-KE-bpKQ',
    'https://www.youtube.com/shorts/aqz-KE-bpKQ',
  ]) {
    const e = embedFor(link)!;
    assert.ok(e, link);
    assert.equal(e.source, 'youtube', link);
    assert.ok(e.url.startsWith(want), `${link} -> ${e.url}`);
    assert.match(e.url, /autoplay=1/);
  }
});

test('a YouTube timestamp is kept, so it starts where the link said', () => {
  assert.match(embedFor('https://youtu.be/aqz-KE-bpKQ?t=90')!.url, /start=90/);
});

test('Twitch: a channel is live, a saved video is not, and the host is named', () => {
  const live = embedFor('https://www.twitch.tv/asmongold')!;
  assert.equal(live.source, 'twitch');
  assert.equal(live.live, true);
  assert.match(live.url, /channel=asmongold/);
  // Twitch refuses to play at all unless the page's own host is named here.
  assert.match(live.url, /parent=127\.0\.0\.1/);

  const vod = embedFor('https://www.twitch.tv/videos/123456789')!;
  assert.equal(vod.live, false, 'a saved video has a real scrub bar');
  assert.match(vod.url, /video=123456789/);
});

test('the host Twitch is told can change, because the server picks its own port', () => {
  assert.match(embedFor('https://twitch.tv/asmongold', 'localhost')!.url, /parent=localhost/);
});

test('a Twitch page that is not a stream is treated as an ordinary page', () => {
  assert.equal(embedFor('https://www.twitch.tv/directory/game/World%20of%20Warcraft')!.source, 'page');
  assert.equal(embedFor('https://www.twitch.tv/settings/profile')!.source, 'page');
});

test('anything else opens as itself, named by its site', () => {
  const e = embedFor('https://www.crunchyroll.com/watch/ABC/episode-1')!;
  assert.equal(e.source, 'page');
  assert.equal(e.label, 'CRUNCHYROLL.COM');
  assert.equal(e.url, 'https://www.crunchyroll.com/watch/ABC/episode-1');
});

test('nothing but http and https is ever opened', () => {
  for (const bad of ['file:///C:/Windows/System32/config/SAM', 'javascript:alert(1)', 'data:text/html,<h1>x', 'not a link', '']) {
    assert.equal(embedFor(bad), null, bad);
  }
});

test('the grab bar has something to say before the real title arrives', () => {
  assert.equal(titleFor(embedFor('https://twitch.tv/asmongold')!, 'https://twitch.tv/asmongold'), 'Asmongold');
  assert.equal(titleFor(embedFor('https://youtu.be/abc')!, 'https://youtu.be/abc'), 'YouTube video');
});

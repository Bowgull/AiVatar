// Sheet 89: his TV. The Cast wire, and what each kind of page sends.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeCast, encodeCast } from '../src/tv.ts';
import { plainMedia, twitchOf, youTubeId, lanIp } from '../src/tvmedia.ts';

test('a Cast message goes out with its length and reads back the same', () => {
  const b = encodeCast('sender-0', 'receiver-0', 'urn:x-cast:com.google.cast.receiver', { type: 'LAUNCH', appId: 'CC1AD845', requestId: 1 });
  assert.equal(b.readUInt32BE(0), b.length - 4);
  const m = decodeCast(b.subarray(4))!;
  assert.equal(m.source, 'sender-0'); assert.equal(m.dest, 'receiver-0'); assert.equal(m.ns, 'urn:x-cast:com.google.cast.receiver');
  assert.deepEqual(m.data, { type: 'LAUNCH', appId: 'CC1AD845', requestId: 1 });
  assert.equal(decodeCast(Buffer.from([0xff, 0xff, 0xff])), null);
});

test('YouTube and Twitch addresses are read for what they are, and nothing else', () => {
  assert.equal(youTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30'), 'dQw4w9WgXcQ');
  assert.equal(youTubeId('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(youTubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(youTubeId('https://www.youtube.com/'), null);
  assert.equal(youTubeId('https://evil.example/watch?v=dQw4w9WgXcQ'), null);
  assert.deepEqual(twitchOf('https://www.twitch.tv/sweetdreams'), { login: 'sweetdreams' });
  assert.deepEqual(twitchOf('https://www.twitch.tv/videos/2290001234'), { vod: '2290001234' });
  assert.equal(twitchOf('https://www.twitch.tv/directory'), null);
  assert.equal(twitchOf('https://twitch.example/sweetdreams'), null);
});

test('a plain video goes as its own address; Stremio\'s engine becomes this Mac\'s home address; blobs and other local ones do not go', () => {
  assert.deepEqual(plainMedia({ src: 'https://cdn.example/a.mp4', at: 12, live: false, poster: '', title: 'A' }), { url: 'https://cdn.example/a.mp4', type: 'video/mp4', live: false, title: 'A', at: 12 });
  const ip = lanIp();
  const s = plainMedia({ src: 'http://127.0.0.1:11470/abc/0', at: 5, live: false, poster: '', title: 'Film' });
  if (ip) assert.equal(s?.url, `http://${ip}:11470/abc/0`); else assert.equal(s, null);
  assert.equal(plainMedia({ src: 'blob:https://www.youtube.com/123', at: 0, live: false, poster: '', title: '' }), null);
  assert.equal(plainMedia({ src: 'http://127.0.0.1:47844/x.mp4', at: 0, live: false, poster: '', title: '' }), null);
  assert.equal(plainMedia({ src: 'https://cdn.example/live.m3u8', at: 99, live: true, poster: '', title: 'L' })?.at, 0);
  assert.equal(plainMedia(null), null);
});

test('sheet 99: each site\'s page becomes the link its TV app answers, and other sites none', async () => {
  const { tvAppLink, copyProtected, tvSteps } = await import('../src/tvmedia.ts');
  assert.deepEqual(tvAppLink('https://www.youtube.com/watch?v=aqz-KE-bpKQ', 73.6), { app: 'YouTube', link: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ&t=73' });
  assert.deepEqual(tvAppLink('https://youtu.be/aqz-KE-bpKQ'), { app: 'YouTube', link: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ' });
  assert.deepEqual(tvAppLink('https://www.netflix.com/watch/80077209?trackId=1'), { app: 'Netflix', link: 'https://www.netflix.com/title/80077209?source=30' });
  assert.deepEqual(tvAppLink('https://www.netflix.com/ca/title/80057281'), { app: 'Netflix', link: 'https://www.netflix.com/title/80057281?source=30' });
  assert.deepEqual(tvAppLink('https://www.netflix.com/browse?jbv=80057281'), { app: 'Netflix', link: 'https://www.netflix.com/title/80057281?source=30' });
  assert.equal(tvAppLink('https://www.netflix.com/browse'), null);
  assert.deepEqual(tvAppLink('https://www.primevideo.com/detail/0QPR3F7L55H2U7P7VSG2LBVW63?ref_=x'), { app: 'Prime Video', link: 'https://app.primevideo.com/detail?gti=0QPR3F7L55H2U7P7VSG2LBVW63' });
  assert.deepEqual(tvAppLink('https://www.amazon.ca/gp/video/detail/B0B8N1XKZN/ref=x'), { app: 'Prime Video', link: 'https://app.primevideo.com/detail?gti=B0B8N1XKZN' });
  assert.deepEqual(tvAppLink('https://web.stremio.com/#/detail/series/tt4574334/tt4574334%3A1%3A1'), { app: 'Stremio', link: 'stremio:///detail/series/tt4574334' });
  assert.equal(tvAppLink('https://web.stremio.com/#/player/abc'), null);
  assert.equal(tvAppLink('https://evil.example/netflix.com/title/80057281'), null);
  assert.equal(tvAppLink('https://www.twitch.tv/sweetdreams'), null);
  assert.equal(copyProtected('https://www.netflix.com/title/1'), true);
  assert.equal(copyProtected('https://www.amazon.ca/gp/video/detail/B0'), true);
  assert.equal(copyProtected('https://www.amazon.ca/dp/B0'), false);
  assert.equal(copyProtected('https://www.youtube.com/watch?v=x'), false);
  const yt = tvSteps({ app: 'YouTube', link: 'L' }, { answerYouTube: true, pause: true }).map((x) => ('key' in x ? x.key : x.link));
  assert.deepEqual(yt, [224, 3, 'L', 23, 127]);
  assert.deepEqual(tvSteps({ app: 'Netflix', link: 'N' }, { answerYouTube: true, pause: true }).map((x) => ('key' in x ? x.key : x.link)), [224, 3, 'N']);
});

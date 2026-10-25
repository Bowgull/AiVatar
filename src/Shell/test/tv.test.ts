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

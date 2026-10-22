import './_env.ts';
// The Spotify mini player's messages (media.ts): the player's buttons are checked strictly, the pet's feed by shape.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MediaState, checkMediaCmd, checkMediaNow } from '../src/media.ts';

test('media.cmd: the seven commands pass, rebuilt clean', () => {
  for (const op of ['play', 'pause', 'toggle', 'next', 'prev']) assert.deepEqual(checkMediaCmd({ t: 'media.cmd', op }), { t: 'media.cmd', op });
  assert.deepEqual(checkMediaCmd({ t: 'media.cmd', op: 'seek', position: 61.5 }), { t: 'media.cmd', op: 'seek', position: 61.5 });
  assert.deepEqual(checkMediaCmd({ t: 'media.cmd', op: 'volume', volume: 0 }), { t: 'media.cmd', op: 'volume', volume: 0 });
  assert.deepEqual(checkMediaCmd({ t: 'media.cmd', op: 'volume', volume: 1 }), { t: 'media.cmd', op: 'volume', volume: 1 });
});

test('media.cmd: anything else is refused, never fixed', () => {
  const bad: unknown[] = [
    null, 'play', [], { t: 'media.cmd' }, { t: 'media.now', op: 'play' }, { t: 'media.cmd', op: 'stop' }, { t: 'media.cmd', op: 'PLAY' },
    { t: 'media.cmd', op: 'play', extra: 1 },                       // extra fields
    { t: 'media.cmd', op: 'next', position: 3 },
    { t: 'media.cmd', op: 'seek' }, { t: 'media.cmd', op: 'seek', position: '30' }, { t: 'media.cmd', op: 'seek', position: -1 },
    { t: 'media.cmd', op: 'seek', position: Infinity }, { t: 'media.cmd', op: 'seek', position: NaN }, { t: 'media.cmd', op: 'seek', position: 1e9 },
    { t: 'media.cmd', op: 'volume', volume: 1.01 }, { t: 'media.cmd', op: 'volume', volume: -0.1 }, { t: 'media.cmd', op: 'volume', volume: '0.5' },
    { t: 'media.cmd', op: 'volume', volume: 0.5, app: 'chrome' },
  ];
  for (const b of bad) assert.equal(checkMediaCmd(b), null, JSON.stringify(b));
});

test('media.now: a real update passes as it came; a wrong shape does not', () => {
  const now = { t: 'media.now', v: 1, app: 'spotify', spotify: true, title: 'Song', artist: 'A', album: 'B', status: 'playing',
    position: 12.3, duration: 200, at: 1_760_000_000_000, canSeek: true, volume: 0.4, thumb: 'data:image/png;base64,AAAA' };
  assert.equal(checkMediaNow(now), now);
  assert.ok(checkMediaNow({ t: 'media.now', v: 1, app: null }));
  assert.equal(checkMediaNow({ ...now, v: 2 }), null);
  assert.equal(checkMediaNow({ ...now, status: 'dancing' }), null);
  assert.equal(checkMediaNow({ ...now, position: '12' }), null);
  assert.equal(checkMediaNow({ ...now, thumb: 'https://evil.example/x.png' }), null);
  assert.equal(checkMediaNow({ ...now, app: 5 }), null);
});

test('the latest state keeps the cover for a Shell that connects later', () => {
  const s = new MediaState();
  assert.equal(s.now(), null);
  s.take({ t: 'media.now', v: 1, app: 'spotify', title: 'One', thumb: 'data:image/png;base64,ONE' });
  s.take({ t: 'media.now', v: 1, app: 'spotify', title: 'One', position: 5 });          // no thumb: unchanged
  assert.equal(s.now()!.thumb, 'data:image/png;base64,ONE');
  assert.equal(s.now()!.position, 5);
  s.take({ t: 'media.now', v: 1, app: null });
  assert.deepEqual(s.now(), { t: 'media.now', v: 1, app: null });
  s.take({ t: 'media.now', v: 1, app: 'chrome', title: 'Two' });
  assert.equal(s.now()!.thumb, null);                                                    // the old cover went with the old session
});

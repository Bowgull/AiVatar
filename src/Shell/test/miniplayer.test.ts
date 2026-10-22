// Sheet 59, the Spotify mini player (2026-10-22): its sums and its one door to the brain.
//   - the time between the brain's updates: moves while playing, holds while paused, eases small corrections in
//     instead of jumping, takes real jumps (a seek, a new song) at once, keeps a seek he just made;
//   - the keys: only the seven ops become `media.cmd`, numbers in range, anything else refused, never fixed;
//   - the picture choices carry his names, what it remembers (picture, bars) is read back safely, old files too;
//   - the marquee rests, then steps whole pixels, only when the title is too long; the fold's spring settles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Timeline, PICTURES, pictureName, fmtTime, marqueeOffset, spring, Peaks, barLevels } from '../pages/playerstate.js';
import { checkPlayerCmd, readPrefs, springAt } from '../src/playercmd.ts';

const now0 = 1_000_000;
const song = (o: Record<string, unknown> = {}) => ({ t: 'media.now', v: 1, app: 'spotify', spotify: true, title: 'Maria También', artist: 'Khruangbin', album: 'Con Todo El Mundo', status: 'playing', position: 100, duration: 241, at: now0, canSeek: true, volume: 0.7, ...o });

test('the time moves on its own while playing, and holds while paused', () => {
  const t = new Timeline();
  assert.equal(t.take(song(), now0), 'song');
  assert.equal(t.shown(now0), 100);
  assert.equal(t.shown(now0 + 2500), 102.5);
  assert.equal(t.shown(now0 + 10_000_000), 241, 'never past the end');
  assert.equal(t.take(song({ status: 'paused', position: 103, at: now0 + 3000 }), now0 + 3000), 'status');
  assert.ok(Math.abs(t.shown(now0 + 3000) - 103) < 0.5);
  assert.equal(t.shown(now0 + 60_000), 103, 'paused: it stays put');
  assert.equal(fmtTime(t.shown(now0 + 60_000)), '1:43');
});

test('a small correction is eased in over 400 ms; a big one (a seek elsewhere) is taken at once', () => {
  const t = new Timeline();
  t.take(song(), now0);
  // the feed says we are 0.8 s behind what is showing: no jump back, it slides in
  const at = now0 + 5000;
  const before = t.shown(at);
  t.take(song({ position: 104.2, at }), at);
  assert.ok(Math.abs(t.shown(at) - before) < 0.01, 'no visible jump at the moment it arrives');
  const mid = t.shown(at + 200), end = t.shown(at + 450);
  assert.ok(mid < before + 0.2 && mid > 104.2, `halfway between: ${mid}`);
  assert.ok(Math.abs(end - (104.2 + 0.45)) < 0.01, `then the truth: ${end}`);
  // 30 s off: a jump
  t.take(song({ position: 30, at: at + 500 }), at + 500);
  assert.equal(t.shown(at + 500), 30);
});

test('a new song resets; nothing playing clears; fields left out keep their value', () => {
  const t = new Timeline();
  t.take(song(), now0);
  assert.equal(t.take({ t: 'media.now', v: 1, app: 'spotify', position: 101, at: now0 + 1000 }, now0 + 1000), 'time');
  assert.equal(t.state.title, 'Maria También');
  assert.equal(t.state.volume, 0.7);
  assert.equal(t.take(song({ title: 'Two', position: 0, at: now0 + 2000 }), now0 + 2000), 'song');
  assert.equal(t.shown(now0 + 2000), 0);
  assert.equal(t.take({ t: 'media.now', v: 1, app: null }, now0 + 3000), 'song');
  assert.equal(t.state.app, null);
  assert.equal(t.shown(now0 + 9000), 0);
  assert.equal(t.take({ t: 'nope' }, now0), '');
  assert.equal(t.take(null, now0), '');
});

test('a seek he made shows at once and is kept until the feed agrees', () => {
  const t = new Timeline();
  t.take(song(), now0);
  assert.equal(t.seekTo(200, now0 + 100), 200);
  assert.equal(t.shown(now0 + 100), 200);
  // the feed has not caught up yet: still his place, moving on
  t.take(song({ position: 100.3, at: now0 + 300 }), now0 + 300);
  assert.ok(Math.abs(t.shown(now0 + 600) - 200.5) < 0.01);
  // it caught up
  t.take(song({ position: 200.6, at: now0 + 700 }), now0 + 700);
  assert.ok(Math.abs(t.shown(now0 + 700) - 200.6) < 0.2);
  assert.equal(t.seekTo(999, now0), 241, 'never past the end');
  assert.equal(t.seekTo(-5, now0), 0);
});

test('the keys: only the seven ops, numbers in range, rebuilt clean', () => {
  for (const op of ['play', 'pause', 'toggle', 'next', 'prev']) assert.deepEqual(checkPlayerCmd({ op }), { t: 'media.cmd', op });
  assert.deepEqual(checkPlayerCmd({ op: 'seek', value: 61.54 }), { t: 'media.cmd', op: 'seek', position: 61.5 });
  assert.deepEqual(checkPlayerCmd({ op: 'volume', value: 0.333 }), { t: 'media.cmd', op: 'volume', volume: 0.33 });
  assert.deepEqual(checkPlayerCmd({ op: 'volume', value: 0 }), { t: 'media.cmd', op: 'volume', volume: 0 });
  const bad = [null, 'play', [], {}, { op: 'stop' }, { op: 'PLAY' }, { op: 'play', value: 1 }, { op: 'next', app: 'x' }, { op: 'seek' }, { op: 'seek', value: '30' },
    { op: 'seek', value: -1 }, { op: 'seek', value: NaN }, { op: 'seek', value: Infinity }, { op: 'seek', value: 1e9 }, { op: 'volume', value: 1.01 },
    { op: 'volume', value: -0.1 }, { op: 'volume', value: 0.5, t: 'media.cmd' }, { op: 'like' }];
  for (const b of bad) assert.equal(checkPlayerCmd(b), null, JSON.stringify(b));
});

test('the picture and the bars: his names; what it remembers is read back safely, old VIS files too', () => {
  assert.deepEqual(PICTURES.map((p) => p.name), ['Album cover', 'Algonquin', 'Dem Streez', 'Main Character', 'Pigeon Point']);
  assert.equal(pictureName('skate'), 'Dem Streez'); assert.equal(pictureName('junk'), 'Album cover');
  assert.deepEqual(readPrefs({ picture: 'rain', bars: false, shade: true, x: 10.4, y: 20 }), { picture: 'rain', bars: false, shade: true, x: 10, y: 20 });
  assert.deepEqual(readPrefs({ picture: '../evil', bars: 'yes', shade: 'yes', x: 'a' }), { picture: 'cover', bars: true, shade: false });
  assert.deepEqual(readPrefs(null), { picture: 'cover', bars: true, shade: false });
  // an old file: SCENE kept its scene, OFF meant no bars
  assert.deepEqual(readPrefs({ vis: 'scene', scene: 'fishing' }), { picture: 'fishing', bars: true, shade: false });
  assert.deepEqual(readPrefs({ vis: 'off', scene: 'rain' }), { picture: 'cover', bars: false, shade: false });
});

test('marquee: rests 1.5 s, then 1 px every 60 ms, only when too long; springs settle; peaks hang then fall', () => {
  assert.equal(marqueeOffset(5000, 100, 160), 0, 'fits: never moves');
  assert.equal(marqueeOffset(1400, 300, 160), 0);
  assert.equal(marqueeOffset(1500 + 600, 300, 160), 10);
  assert.ok(Number.isInteger(marqueeOffset(1537 + 611, 300, 160)));
  const lapMs = 1500 + (300 + 36) * 60;
  assert.equal(marqueeOffset(lapMs + 100, 300, 160), 0, 'back at the start, resting again');
  assert.equal(fmtTime(NaN), '0:00'); assert.equal(fmtTime(3725), '62:05');
  for (const f of [spring, (t: number) => springAt(t, 0.5, 0.825)]) {
    assert.equal(f(0), 0);
    assert.ok(Math.abs(f(1.2) - 1) < 0.005, 'settled by 1.2 s');
    const peak = Math.max(...Array.from({ length: 60 }, (_, i) => f(i / 50)));
    assert.ok(peak > 1 && peak < 1.06, `a small overshoot: ${peak}`);
  }
  const p = new Peaks(1);
  p.step([1], 0.03);
  assert.equal(p.step([0], 0.2)[0], 1, 'hangs ~300 ms');
  p.step([0], 0.2);
  assert.ok(p.step([0], 0.5)[0]! < 1, 'then falls');
  for (const v of barLevels(3.3)) assert.ok(v >= 0.06 && v <= 1);
});

test('the player page: its own preload doors only, and no like key anywhere', () => {
  const pre = readFileSync(path.resolve(import.meta.dirname, '..', 'src', 'playerpreload.cjs'), 'utf8');
  const chans = [...pre.matchAll(/ipcRenderer\.send\('([^']+)'/g)].map((m) => m[1]);
  assert.equal(new Set(chans).size, chans.length, 'every door its own channel');
  assert.ok(chans.every((c) => c!.startsWith('player:') || c!.startsWith('family:')), chans.join(','));
  const page = readFileSync(path.resolve(import.meta.dirname, '..', 'pages', 'miniplayer.js'), 'utf8');
  assert.ok(!/like/i.test(pre.replace('like the other preloads', '')) && !/\blike\b|liked/i.test(page), 'he does not want a like key');
});

// 2026-10-22 (his report: "the purple ball at the bottom near the speaker but the bar is half full"): the knob and the
// fill come from ONE sum, at every volume; no volume yet is an empty groove with the knob at its start.
import { sliderAt, readDevice } from '../pages/playerstate.js';
import { readDevices } from '../src/playercmd.ts';
test('volume: the knob sits on the end of the fill at 0, 50 and 100, and everywhere between', () => {
  const W = 81;                                            // the free player's groove, art pixels
  assert.deepEqual(sliderAt(W, 0), { fill: 0, center: 1 });
  assert.deepEqual(sliderAt(W, 0.5), { fill: 40, center: 41 });
  assert.deepEqual(sliderAt(W, 1), { fill: 79, center: 80 });
  for (let v = 0; v <= 100; v++) { const a = sliderAt(W, v / 100); assert.equal(a.center, 1 + a.fill); assert.ok(a.fill >= 0 && a.fill <= W - 2); }
  for (const bad of [null, undefined, NaN, 'x']) assert.deepEqual(sliderAt(W, bad), { fill: 0, center: 1 });
  assert.deepEqual(sliderAt(W, 7), sliderAt(W, 1)); assert.deepEqual(sliderAt(W, -1), sliderAt(W, 0));
});
test('Spotify Connect on the page: the device chip, the device list', () => {
  const t = new Timeline();
  assert.equal(t.take(song({ device: { name: 'iPhone', kind: 'phone' } }), now0), 'song');
  assert.deepEqual(t.state.device, { name: 'iPhone', kind: 'phone' });
  assert.equal(t.take({ t: 'media.now', v: 1, app: 'spotify', device: null }, now0 + 10), 'status', 'back on this PC: the chip goes');
  assert.equal(t.state.device, null);
  assert.deepEqual(readDevice({ name: 'Kitchen speaker', kind: 'toaster' }), { name: 'Kitchen speaker', kind: 'other' });
  assert.equal(readDevice({ name: '' }), null);
  assert.deepEqual(readDevices({ devices: [{ id: 'a1', name: 'iPhone', kind: 'phone', active: true }, { id: 'no good', name: 'x' }], error: 5 }),
    { devices: [{ id: 'a1', name: 'iPhone', kind: 'phone', active: true }], error: null });
});

// Spotify Connect for the mini player (connect.ts, 2026-10-22): the source choice (PC vs his phone / Mac / speaker), the
// polling and its back-off (429 Retry-After, failures, sign-in gone), the one media.now stream, and the Web API calls.
// Spotify is a fake here: nothing reaches the network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os'; import path from 'node:path';
import { readPlayback, chooseSource, ConnectPoller, MediaMux, readDevices, checkDeviceId, deviceKind, type RemoteNow } from '../src/connect.ts';
import { Spotify, SpotifyError } from '../src/spotify.ts';
import type { MediaNow } from '../src/media.ts';

const T0 = 1_760_000_000_000;
const answer = (o: Record<string, unknown> = {}, dev: Record<string, unknown> = {}) => ({
  device: { id: 'abc123', name: 'iPhone', type: 'Smartphone', volume_percent: 40, supports_volume: true, is_active: true, ...dev },
  is_playing: true, progress_ms: 61_500, timestamp: T0 - 200,
  item: { id: 'trk1', name: 'Maria También', duration_ms: 241_000, artists: [{ name: 'Khruangbin' }], album: { name: 'Con Todo El Mundo', images: [{ url: 'https://i.scdn.co/image/640', width: 640 }, { url: 'https://i.scdn.co/image/64', width: 64 }, { url: 'https://i.scdn.co/image/300', width: 300 }] } },
  actions: { disallows: {} }, ...o,
});
const pcNow = (status: string | null): MediaNow | null => status === null ? null : ({ t: 'media.now', v: 1, app: 'spotify', spotify: true, title: 'PC Song', artist: 'Here', status: status as 'playing', position: 3, duration: 100, at: T0, canSeek: true, volume: 0.5 });

test('readPlayback: the track, the device (kind, volume 0..1), the 64 px cover; nothing playing is null', () => {
  const r = readPlayback(answer(), T0, 'SHADOW-PC')!;
  assert.equal(r.title, 'Maria También'); assert.equal(r.artist, 'Khruangbin'); assert.equal(r.album, 'Con Todo El Mundo');
  assert.deepEqual(r.device, { id: 'abc123', name: 'iPhone', kind: 'phone', volume: 0.4, thisPc: false });
  assert.equal(r.position, 61.5); assert.equal(r.duration, 241); assert.equal(r.at, T0 - 200); assert.equal(r.playing, true);
  assert.equal(r.coverUrl, 'https://i.scdn.co/image/64');
  assert.equal(readPlayback(null, T0, 'x'), null);
  assert.equal(readPlayback({}, T0, 'x'), null);
  assert.equal(readPlayback(answer({}, { supports_volume: false }), T0, 'x')!.device.volume, null);
  // Spotify's desktop app here is named after this PC: that device is the PC (the pet's feed covers it)
  assert.equal(readPlayback(answer({}, { name: 'shadow-pc', type: 'Computer' }), T0, 'SHADOW-PC')!.device.thisPc, true);
  assert.equal(readPlayback(answer({}, { name: 'Joshua’s MacBook Air', type: 'Computer' }), T0, 'SHADOW-PC')!.device.thisPc, false);
  assert.equal(deviceKind('Speaker'), 'speaker'); assert.equal(deviceKind('CastAudio'), 'speaker'); assert.equal(deviceKind('TV'), 'tv'); assert.equal(deviceKind('weird'), 'other');
});

test('chooseSource: the PC when it plays; else a remote device that plays; else the PC paused; else the remote paused', () => {
  const remote = (playing: boolean, thisPc = false) => ({ ...readPlayback(answer({ is_playing: playing }), T0, 'x')!, device: { id: 'a', name: thisPc ? 'PC' : 'iPhone', kind: 'phone' as const, volume: 0.4, thisPc } });
  assert.equal(chooseSource(pcNow('playing'), remote(true)), 'pc');
  assert.equal(chooseSource(pcNow('paused'), remote(true)), 'remote');
  assert.equal(chooseSource(null, remote(true)), 'remote');
  assert.equal(chooseSource({ t: 'media.now', v: 1, app: null }, remote(true)), 'remote');
  assert.equal(chooseSource(pcNow('paused'), remote(false)), 'pc');
  assert.equal(chooseSource(null, remote(false)), 'remote');
  assert.equal(chooseSource(pcNow('paused'), null), 'pc');
  assert.equal(chooseSource(null, null), 'none');
  assert.equal(chooseSource(null, remote(true, true)), 'none', 'this PC as a Connect device is the pet\'s to report');
});

/** A poller with a hand-turned clock: timers are collected, `fire` runs the next one. */
function rig(results: (() => RemoteNow | null)[]) {
  const timers: { f: () => void; ms: number; id: number }[] = [];
  let n = 0, calls = 0;
  const states: (RemoteNow | null)[] = [], notes: (string | null)[] = [];
  const p = new ConnectPoller({
    fetch: async () => { const r = results[Math.min(calls, results.length - 1)]!; calls++; return r(); },
    onState: (r) => states.push(r), onNote: (t) => notes.push(t),
    setTimer: (f, ms) => { const id = ++n; timers.push({ f, ms, id }); return id; },
    clearTimer: (id) => { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); },
  });
  const fire = async () => { const t = timers.shift(); assert.ok(t, 'a timer is pending'); t.f(); await new Promise((r) => setImmediate(r)); await new Promise((r) => setImmediate(r)); return t.ms; };
  return { p, timers, fire, states, notes, calls: () => calls };
}
const ok = () => readPlayback(answer(), T0, 'x');
const fail = (kind: string, retryAfter = 0) => () => { throw new SpotifyError('x', kind as 'api', retryAfter); };

test('poller: asks only while the player shows and the PC is quiet; every 5 s', async () => {
  const r = rig([ok]);
  assert.equal(r.timers.length, 0, 'nothing until the window shows');
  r.p.setVisible(true);
  assert.equal(await r.fire(), 0);
  assert.equal(r.calls(), 1); assert.ok(r.states[0]);
  assert.equal(r.timers[0]!.ms, 5000);
  assert.equal(await r.fire(), 5000); assert.equal(r.calls(), 2);
  r.p.setPcPlaying(true);
  assert.equal(r.timers.length, 0, 'the PC plays: its feed is used, Spotify is not asked');
  r.p.setPcPlaying(false);
  assert.equal(r.timers.length, 1); assert.equal(r.timers[0]!.ms, 300);
  r.p.setVisible(false);
  assert.equal(r.timers.length, 0, 'hidden: stopped');
  assert.equal(r.p.running, false);
});

test('poller: failures back off 10, 20, 40, 60 s with one plain line; success clears it', async () => {
  const r = rig([fail('api'), fail('api'), fail('api'), fail('api'), fail('api'), ok]);
  r.p.setVisible(true);
  await r.fire();
  const waits: number[] = [];
  for (let i = 0; i < 5; i++) { waits.push(r.timers[0]!.ms); await r.fire(); }
  assert.deepEqual(waits, [10_000, 20_000, 40_000, 60_000, 60_000]);
  assert.equal(r.notes[0], 'Can’t reach Spotify right now');
  assert.equal(r.notes.at(-1), null, 'all well again: the line goes');
  assert.equal(r.timers[0]!.ms, 5000);
});

test('poller: a 429 waits what Spotify said (never under 5 s); a lost sign-in stops until the window opens again', async () => {
  const r = rig([fail('rate', 17), fail('rate', 1), fail('signin'), ok]);
  r.p.setVisible(true);
  await r.fire();
  assert.equal(r.timers[0]!.ms, 17_000);
  await r.fire();
  assert.equal(r.timers[0]!.ms, 5000);
  await r.fire();
  assert.equal(r.timers.length, 0, 'signed out: no more asking');
  assert.match(String(r.notes.at(-1)), /sign-in expired/);
  r.p.setVisible(false); r.p.setVisible(true);
  assert.equal(r.timers.length, 1, 'opened again: one more go');
});

test('poller: a key on the remote device looks again soon', async () => {
  const r = rig([ok]);
  r.p.setVisible(true); await r.fire();
  r.p.soon(700);
  assert.equal(r.timers.length, 1); assert.equal(r.timers[0]!.ms, 700);
});

test('MediaMux: PC updates pass through; a remote device takes over with its device and cover; the PC wins back at once', () => {
  const out: any[] = [];
  const mux = new MediaMux((m) => out.push(m));
  mux.fromPc(pcNow('paused')!);
  assert.equal(mux.source, 'pc'); assert.equal(out.at(-1).title, 'PC Song'); assert.equal(out.at(-1).device, null);
  mux.fromPc({ t: 'media.now', v: 1, app: 'spotify', position: 4 });
  assert.deepEqual(out.at(-1), { t: 'media.now', v: 1, app: 'spotify', position: 4, source: 'pc' });
  const wantCover = mux.fromRemote(readPlayback(answer(), T0, 'x'));
  assert.equal(mux.source, 'remote'); assert.equal(wantCover, true);
  const m = out.at(-1);
  assert.equal(m.title, 'Maria También'); assert.deepEqual(m.device, { name: 'iPhone', kind: 'phone' }); assert.equal(m.volume, 0.4); assert.equal(m.status, 'playing'); assert.equal(m.thumb, null);
  mux.cover('trk1', 'data:image/jpeg;base64,AAAA');
  assert.equal(out.at(-1).thumb, 'data:image/jpeg;base64,AAAA');
  mux.cover('old', 'data:image/jpeg;base64,BBBB');
  assert.equal(out.at(-1).thumb, 'data:image/jpeg;base64,AAAA', 'a late cover for another track is dropped');
  assert.equal(mux.fromRemote(readPlayback(answer({ progress_ms: 70_000 }), T0, 'x')), false, 'same track: no new cover');
  assert.equal(out.at(-1).thumb, undefined); assert.equal(out.at(-1).position, 70);
  mux.fromPc({ ...pcNow('playing')!, thumb: null });
  assert.equal(mux.source, 'pc'); assert.equal(out.at(-1).title, 'PC Song'); assert.equal(out.at(-1).device, null);
  assert.equal(mux.full().source, 'pc');
  mux.fromPc({ t: 'media.now', v: 1, app: null });
  assert.equal(mux.source, 'remote'); assert.equal(out.at(-1).thumb, 'data:image/jpeg;base64,AAAA', 'back to the phone, its cover with it');
  mux.fromRemote(null);
  assert.equal(mux.source, 'none'); assert.equal(out.at(-1).app, null);
});

test('devices: listed for the menu, odd ids refused', () => {
  assert.deepEqual(readDevices([{ id: 'a1', name: 'Kitchen speaker', type: 'Speaker', is_active: false }, { id: 'b 2', name: 'x' }, { id: 'c3', name: 'iPhone', type: 'Smartphone', is_active: true }, { id: 'r', is_restricted: true }]),
    [{ id: 'a1', name: 'Kitchen speaker', kind: 'speaker', active: false }, { id: 'c3', name: 'iPhone', kind: 'phone', active: true }]);
  assert.equal(checkDeviceId('abc_-9'), 'abc_-9'); assert.equal(checkDeviceId('a/b'), null); assert.equal(checkDeviceId(3), null);
});

test('Spotify Web API: the keys hit the right endpoints on that device; 429 carries Retry-After; covers only from Spotify', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'connect-test-'));
  const file = path.join(dir, 'spotify.json');
  writeFileSync(file, JSON.stringify({ clientId: 'cid', refreshToken: 'r', accessToken: 'tok', expiresAt: T0 * 2 }));
  const seen: string[] = [];
  let status = 204;
  const fetcher = async (url: string, init?: { method?: string; body?: string }) => {
    seen.push(`${init?.method ?? 'GET'} ${url.replace('https://api.spotify.com/v1', '')}${init?.body ? ' ' + init.body : ''}`);
    if (url.startsWith('https://i.scdn.co/')) return { ok: true, status: 200, json: async () => ({}), text: async () => '', arrayBuffer: async () => new Uint8Array([0xff, 0xd8, 1, 2]).buffer };
    return { ok: status < 300, status, json: async () => ({}), text: async () => '', headers: { get: (n: string) => (n === 'retry-after' ? '12' : null) } };
  };
  const sp = new Spotify(file, fetcher as any, () => T0);
  await sp.control('play', 'dev1'); await sp.control('pause', 'dev1'); await sp.control('next', 'dev1'); await sp.control('prev', 'dev1');
  await sp.control('seek', 'dev1', 61.5); await sp.control('volume', 'dev1', 0.42); await sp.transfer('dev2');
  assert.deepEqual(seen, ['PUT /me/player/play?device_id=dev1', 'PUT /me/player/pause?device_id=dev1', 'POST /me/player/next?device_id=dev1', 'POST /me/player/previous?device_id=dev1',
    'PUT /me/player/seek?position_ms=61500&device_id=dev1', 'PUT /me/player/volume?volume_percent=42&device_id=dev1', 'PUT /me/player {"device_ids":["dev2"],"play":true}']);
  assert.equal(await sp.playback(), null, '204: nothing playing anywhere');
  status = 429;
  await assert.rejects(sp.playback(), (e: SpotifyError) => e.kind === 'rate' && e.retryAfter === 12);
  status = 200;
  assert.equal(await sp.cover('https://i.scdn.co/image/64'), 'data:image/jpeg;base64,/9gBAg==');
  assert.equal(await sp.cover('https://evil.example/x.jpg'), null);
  assert.equal(await sp.cover('http://i.scdn.co/image/64'), null);
  assert.ok(!seen.some((s) => s.includes('evil')), 'never fetched');
});

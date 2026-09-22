import './_env.ts';
// Music by name, with a pretend Spotify: nothing here reaches the network or opens the real app.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { Core } from '../src/core.ts';
import { Spotify, choose } from '../src/spotify.ts';
import type { Fetch } from '../src/google.ts';
import { kindOf } from '../src/trust.ts';
import { TOOL_NAMES } from '../src/tools.ts';

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'aang-sp-'));
const P = (kind: any, name: string, by = '') => ({ kind, uri: `spotify:${kind}:${name.replace(/\W/g, '')}`, name, by });

test('the best match: an exact name first, "song by artist", the kind he named, else the top song', () => {
  const r = { track: [P('track', 'Radiohead Mix Song', 'X'), P('track', 'Creep', 'Radiohead')], playlist: [P('playlist', 'Chill', 'Joshua')], artist: [P('artist', 'Radiohead')], album: [P('album', 'OK Computer', 'Radiohead')] };
  assert.equal(choose(r, 'radiohead')!.kind, 'artist');
  assert.equal(choose(r, 'Chill')!.kind, 'playlist');
  assert.equal(choose(r, 'creep by radiohead')!.name, 'Creep');
  assert.equal(choose(r, 'something', 'album')!.name, 'OK Computer');
  assert.equal(choose(r, 'something')!.name, 'Radiohead Mix Song');
  assert.equal(choose({ track: [], playlist: [], artist: [], album: [] }, 'x'), null);
});

function pretend(devices: any[][]) {
  const calls: { method: string; url: string; body?: any }[] = [];
  let d = 0;
  const fetcher: Fetch = async (url, init) => {
    const method = init?.method ?? 'GET';
    calls.push({ method, url, ...(init?.body && !url.includes('accounts') ? { body: JSON.parse(init.body) } : {}) });
    const reply = (status: number, j: any) => ({ ok: status < 300, status, json: async () => j, text: async () => (j === null ? '' : JSON.stringify(j)) });
    if (url.includes('accounts.spotify.com/api/token')) return reply(200, { access_token: 'fresh', expires_in: 3600, refresh_token: 'r2' });
    if (url.includes('/search?')) return reply(200, { tracks: { items: [{ uri: 'spotify:track:1', name: 'Hotel California', artists: [{ name: 'Eagles' }] }] }, playlists: { items: [null] }, artists: { items: [] }, albums: { items: [] } });
    if (url.includes('/me/player/devices')) return reply(200, { devices: devices[Math.min(d++, devices.length - 1)] });
    if (url.includes('/me/player/play')) return reply(204, null);
    return reply(404, {});
  };
  return { fetcher, calls, plays: () => calls.filter(c => c.url.includes('/me/player/play')) };
}
const signedIn = (dir: string) => { writeFileSync(path.join(dir, 'spotify.json'), JSON.stringify({ clientId: 'c', refreshToken: 'r', accessToken: 'a', expiresAt: Date.now() + 3_600_000 })); return path.join(dir, 'spotify.json'); };

test('it plays the match on the device already playing, and says what', async () => {
  const p = pretend([[{ id: 'phone', type: 'Smartphone', is_active: false }, { id: 'pc', type: 'Computer', is_active: true }]]);
  const sp = new Spotify(signedIn(tmp()), p.fetcher);
  assert.equal(await sp.play('hotel california'), 'Playing "Hotel California" by Eagles on Spotify.');
  assert.match(p.plays()[0]!.url, /device_id=pc/);
  assert.deepEqual(p.plays()[0]!.body, { uris: ['spotify:track:1'] });
});

test('music is asked once; with Spotify closed it opens the app and plays once it is up', async () => {
  const p = pretend([[], [{ id: 'pc', type: 'Computer', is_active: false }]]);
  const core: any = new Core({ port: 47960, dataDir: tmp(), stateDir: tmp(), warm: false, consolidate: false });
  core.spotifyFetch = p.fetcher; core.spotifyWaitMs = 10;
  let launched = 0; core.spotifyLaunch = async () => { launched++; };
  signedIn(core.cfg.stateDir);
  await core.start();
  const c = new WebSocket('ws://127.0.0.1:47960/body');
  let asked = 0; c.on('message', d => { const m = JSON.parse(String(d)); if (m.t === 'permission') { asked++; c.send(JSON.stringify({ t: 'permission.reply', id: m.id, allow: true })); } });
  await new Promise<void>(r => c.once('open', () => r()));
  try {
    const r = await core.doers().playMusic('hotel california');
    assert.equal(r.ok, true, r.detail);
    assert.equal(launched, 1, 'Spotify was opened because it was open nowhere');
    assert.equal(p.plays().length, 1);
    await core.doers().playMusic('hotel california');
    assert.equal(asked, 1, 'asked once, then trusted');
  } finally { c.close(); await core.stop(); }
});

test('not signed in: it says how, and nothing is asked or requested', async () => {
  const core: any = new Core({ port: 47962, dataDir: tmp(), stateDir: tmp(), warm: false, consolidate: false });
  core.spotifyFetch = async () => { throw new Error('no network in tests'); };
  await core.start();
  try { const r = await core.doers().playMusic('x'); assert.equal(r.ok, false); assert.match(r.detail, /spotify-setup\.cmd/); }
  finally { await core.stop(); }
});

test('the tool is there for the model, and playing music is trusted after one yes', () => {
  assert.ok(TOOL_NAMES.includes('mcp__aang__play_music'));
  assert.equal(kindOf('mcp__aang__play_music', { what: 'x' })?.kind, 'play music');
});

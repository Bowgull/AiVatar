// The phone fire remote end to end, against the fake laptop (test/fakes/omashulaptop.ts) and a fake Wowhead: wake
// packet sent, sleep posted, state shown, chat read and sent, the name menu's commands, tooltips, whisper alerts, and
// who is let in. Nothing here touches the real laptop or the internet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FakeLaptop } from './fakes/omashulaptop.ts';
import { OmashuRemote, Wowhead, loadRemoteConfig, sendWake, type RemoteConfig } from '../src/omashuremote.ts';

const MAC = '02:00:5e:10:20:30';
const KEY = 'laptop-key-for-tests-only-0123456789';
const JOSH = 'josh-phone-key-0123456789abcdef';
const LINDZ = 'lindz-phone-key-0123456789abcdef';
const until = async (f: () => boolean | Promise<boolean>, ms = 3000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await f()) return; await new Promise(r => setTimeout(r, 20)); }
  throw new Error('timed out waiting');
};

async function rig(o: { wowhead?: Wowhead } = {}) {
  const lap = new FakeLaptop({ key: KEY, mac: MAC });
  await lap.start();
  const cfg: RemoteConfig = {
    port: 0, laptop: { url: lap.url, key: KEY, mac: MAC, broadcast: ['127.0.0.1'], wakePort: lap.udpPort },
    phones: [{ name: 'Josh', key: JOSH, chat: true }, { name: 'Lindz', key: LINDZ }],
  };
  const notes: string[] = [];
  const remote = new OmashuRemote({ cfg, host: '127.0.0.1', tickMs: { busy: 40, idle: 40 }, notify: t => notes.push(t), log: () => {}, wowhead: o.wowhead });
  const port = await remote.start();
  const base = `http://127.0.0.1:${port}`;
  const as = (key: string | null) => ({
    get: (p: string) => fetch(base + p, { headers: key ? { cookie: `omashu=${key}` } : {} }),
    post: (p: string, body: unknown = {}, extra: Record<string, string> = { 'x-omashu': '1' }) =>
      fetch(base + p, { method: 'POST', headers: { ...(key ? { cookie: `omashu=${key}` } : {}), 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(body) }),
  });
  const poll = async (key = JOSH, q = '') => (await as(key).get('/api/poll' + q)).json() as Promise<{ fire: string; game: string | null; chat: boolean; whispers?: number; session?: string; lines?: { seq: number; kind: string; who?: string; text: unknown[] }[]; guild?: { name: string; level: number; cls: string; zone: string }[] | null; ah?: boolean }>;
  return { lap, remote, base, as, poll, notes, done: async () => { await remote.stop(); await lap.stop(); } };
}

test('dark: the fire is out while the laptop still answers; touching it posts /wake and it catches when dark ends', async () => {
  const r = await rig();
  try {
    r.lap.awake = true; r.lap.dark = true;
    await until(async () => (await r.poll()).fire === 'out');
    const w = await (await r.as(JOSH).post('/api/wake')).json();
    assert.equal(w.fire, 'waking');
    assert.equal(r.lap.wakePosts, 1);
    await until(async () => (await r.poll()).fire === 'lit');
    assert.equal(r.lap.wakePackets, 0, 'no magic packet when /wake answered');
    await r.as(JOSH).post('/api/wake');
    assert.equal(r.lap.wakePosts, 1, 'a second touch while lit does nothing');
  } finally { await r.done(); }
});

test('putting the fire out ends dark, not asleep: /state keeps answering, the fire shows out', async () => {
  const r = await rig();
  try {
    r.lap.startWow();
    await until(async () => (await r.poll()).fire === 'lit');
    assert.equal((await (await r.as(JOSH).post('/api/sleep')).json()).fire, 'sleeping');
    await until(async () => (await r.poll()).fire === 'out');
    assert.equal(r.lap.awake, true); assert.equal(r.lap.dark, true); assert.equal((await r.poll()).game, null);
    await r.as(JOSH).post('/api/sleep');
    assert.equal(r.lap.powerPosts, 1, 'no post when already dark');
  } finally { await r.done(); }
});

test('asleep (no answer to /wake): the magic packet goes instead, and it catches when the laptop answers', async () => {
  const r = await rig();
  try {
    await until(async () => (await r.poll()).fire === 'out');
    const w = await (await r.as(JOSH).post('/api/wake')).json();
    assert.equal(w.fire, 'waking');
    await until(() => r.lap.wakePackets === 1);
    assert.equal(r.lap.wakePosts, 0);
    await until(async () => (await r.poll()).fire === 'lit');
    // a second touch while lit does not send another packet
    await r.as(JOSH).post('/api/wake');
    assert.equal(r.lap.wakePackets, 1);
  } finally { await r.done(); }
});

test('an older laptop (no "dark", /power sleeps it): posts /power once, out when it stops answering', async () => {
  const r = await rig();
  try {
    r.lap.awake = true; r.lap.old = true;
    await until(async () => (await r.poll(LINDZ)).fire === 'lit');
    const s = await (await r.as(LINDZ).post('/api/sleep')).json();
    assert.equal(s.fire, 'sleeping');
    assert.equal(r.lap.powerPosts, 1);
    await until(async () => (await r.poll(LINDZ)).fire === 'out');
    await r.as(LINDZ).post('/api/sleep');
    assert.equal(r.lap.powerPosts, 1, 'no post to a laptop already asleep');
  } finally { await r.done(); }
});

test('who gets in: paired phones on the home network; chat only for Joshua; posts need the header', async () => {
  const r = await rig();
  try {
    assert.equal((await r.as(null).get('/')).status, 401);
    assert.equal((await r.as('x'.repeat(30)).get('/api/poll')).status, 401);
    const page = await r.as(JOSH).get('/');
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Zelda controls[\s\S]*Powers/);
    assert.match(page.headers.get('content-security-policy') ?? '', /default-src 'self'/);
    // the home-screen icon: named in the page (the pairing link serves the same page), fetched without any cookie
    const html = await (await r.as(JOSH).get('/')).text();
    assert.match(html, /<link rel="apple-touch-icon" href="\/fire-icon-180\.png">/);
    assert.match(html, /<meta name="apple-mobile-web-app-title" content="Fire">/);
    assert.match(await (await fetch(`${r.base}/pair/${LINDZ}`)).text(), /apple-touch-icon/);
    const icon = await r.as(null).get('/fire-icon-180.png');
    assert.equal(icon.status, 200); assert.equal(icon.headers.get('content-type'), 'image/png');
    const png = Buffer.from(await icon.arrayBuffer());
    assert.equal(png.subarray(1, 4).toString(), 'PNG'); assert.equal(png.readUInt32BE(16), 180); assert.equal(png.readUInt32BE(20), 180);
    // pairing sets the cookie
    const pair = await fetch(`${r.base}/pair/${LINDZ}`);
    assert.equal(pair.status, 200);
    assert.match(pair.headers.get('set-cookie') ?? '', new RegExp(`omashu=${LINDZ}.*HttpOnly.*SameSite=Strict`));
    // a post without the header (a plain form from another page) does nothing
    assert.equal((await r.as(JOSH).post('/api/wake', {}, {})).status, 403);
    assert.equal(r.lap.wakePackets, 0);
    // Lindz: the fire yes, chat no
    r.lap.startWow(); r.lap.log('Morrowyn whispers: hi');
    await until(async () => (await r.poll()).chat === true);
    const lz = await r.poll(LINDZ);
    assert.equal(lz.chat, false); assert.equal(lz.lines, undefined);
    assert.equal((await r.as(LINDZ).post('/api/send', { to: 'say', text: 'hi' })).status, 403);
    assert.equal((await r.as(LINDZ).get('/api/lookup?name=x')).status, 403);
  } finally { await r.done(); }
});

test('guild list (sheet 11): built from the add-on lines, swapped in only when complete, never shown as chat', async () => {
  const r = await rig();
  try {
    r.lap.startWow();
    r.lap.log('[Guild] Morrowyn Ash: grats on 11!');
    r.lap.log('{omashu-guild} 7 1/3 Morrowyn Ash|14|MAGE|Silverpine Forest');
    r.lap.log('{omashu-guild} 7 2/3 Hadrik Stone|12|WARRIOR|Undercity');
    await until(async () => ((await r.poll()).lines ?? []).length === 1);
    assert.equal((await r.poll()).guild, null);                       // 2 of 3: not yet
    r.lap.log('{omashu-guild} 7 3/3 Bujuju Banton|7|WARLOCK|Tirisfal Glades');
    await until(async () => Array.isArray((await r.poll()).guild));
    const p = await r.poll();
    assert.deepEqual(p.guild!.map(m => `${m.name} ${m.level} ${m.cls} ${m.zone}`),
      ['Morrowyn Ash 14 MAGE Silverpine Forest', 'Hadrik Stone 12 WARRIOR Undercity', 'Bujuju Banton 7 WARLOCK Tirisfal Glades']);
    assert.deepEqual(p.lines!.map(l => l.kind), ['guild']);           // the list lines never show as chat
    r.lap.log('{omashu-guild} 8 0/0');                                // nobody on
    await until(async () => ((await r.poll()).guild ?? [1]).length === 0);
    r.lap.stopWow();
    await until(async () => (await r.poll()).chat === false);
    assert.equal(r.remote.guild, null);
  } finally { await r.done(); }
});

test('chat: read while WoW is up, cleared when it closes, whispers counted and buzzed (backlog never buzzes)', async () => {
  const r = await rig();
  try {
    r.lap.startWow();
    r.lap.log('Old-Realm whispers: before Aang looked');       // backlog: shown, not buzzed
    r.lap.log('[Guild] Morrowyn: grats on 11!');
    await until(async () => ((await r.poll()).lines ?? []).length === 2);
    assert.equal(r.notes.length, 0);
    r.lap.log('[2. Trade - City] Bellacoin: WTS |cff1eff00|Hitem:9811::::::::12:::::::|h[Grips of Control]|h|r 2g');
    r.lap.log('Hadrik Stone whispers: bring a mage too if you can');
    await until(() => r.notes.length === 1);
    assert.equal(r.notes[0], 'Hadrik Stone whispers: bring a mage too if you can');
    const p = await r.poll();
    assert.equal(p.game, 'wow'); assert.equal(p.whispers, 2);
    assert.deepEqual(p.lines!.map(l => l.kind), ['whisper', 'guild', 'channel', 'whisper']);
    // only what is new after a seq, in the same session
    const newer = await r.poll(JOSH, `?after=${p.lines![2].seq}&session=${p.session}`);
    assert.deepEqual(newer.lines!.map(l => l.who), ['Hadrik Stone']);
    // seen
    await r.as(JOSH).post('/api/seen');
    assert.equal((await r.poll()).whispers, 0);
    // WoW closes: this session's chat is gone
    r.lap.stopWow();
    await until(async () => (await r.poll()).chat === false);
    assert.equal(r.remote.lines.length, 0);
  } finally { await r.done(); }
});

test('sending: the review card\'s text and the name menu reach WoW as the approved commands only', async () => {
  const r = await rig();
  try {
    r.lap.startWow();
    await until(async () => (await r.poll()).chat === true);
    const ok = async (body: unknown, line: string) => {
      const res = await r.as(JOSH).post('/api/send', body);
      assert.equal(res.status, 200, JSON.stringify(body));
      assert.equal(r.lap.typed.at(-1), line);
    };
    await ok({ to: 'guild', text: 'count me in for bandit keep after dinner' }, '/g count me in for bandit keep after dinner');
    await ok({ to: 'whisper', name: 'Bujuju Banton', text: 'phone remote test' }, '/w Bujuju Banton phone remote test');
    await ok({ to: 'channel', num: 4, text: 'LF1M mage' }, '/4 LF1M mage');
    await ok({ act: 'invite', name: 'Hadrik Stone' }, '/invite Hadrik Stone');
    await ok({ act: 'friend', name: 'Hadrik' }, '/friend Hadrik');
    await ok({ act: 'ignore', name: 'Hadrik' }, '/ignore Hadrik');
    await ok({ act: 'who', name: 'Gideon Byrne' }, '/who Gideon Byrne');
    await ok({ act: 'roll' }, '/roll');
    await ok({ act: 'wave', name: 'Hadrik' }, '/wave Hadrik');
    await ok({ act: 'cheer', name: 'Hadrik Stone' }, '/cheer Hadrik Stone');
    await ok({ act: 'followme' }, '/followme');
    await ok({ act: 'healme', name: 'Gideon Byrne' }, '/healme Gideon Byrne');
    await ok({ act: 'congratulate', name: 'Hadrik' }, '/congratulate Hadrik');
    const sent = r.lap.typed.length;
    for (const bad of [{ to: 'say', text: '/run x' }, { act: 'script', name: 'x' }, { to: 'whisper', name: 'Bujuju', text: 'phone remote test' }, { to: 'whisper', name: 'A b c', text: 'x' }, { raw: '/run x' }]) {
      const res = await r.as(JOSH).post('/api/send', bad);
      assert.equal(res.status, 400, JSON.stringify(bad));
    }
    assert.equal(r.lap.typed.length, sent, 'nothing refused reached the laptop');
    // the real laptop answers a send about 1.5 s late: still a success
    r.lap.sendDelayMs = 1600;
    await ok({ to: 'party', text: 'slow one' }, '/p slow one');
    r.lap.sendDelayMs = 0;
    // the echo comes back through the log
    await until(async () => ((await r.poll()).lines ?? []).some(l => l.kind === 'guild' && l.who === 'Josh'));
    // WoW closed: not sent
    r.lap.stopWow();
    await until(async () => (await r.poll()).chat === false);
    assert.equal((await r.as(JOSH).post('/api/send', { to: 'say', text: 'hi' })).status, 409);
  } finally { await r.done(); }
});

test('auction search (sheet 14): the tab follows the auction house, the search reaches aux only while it is open', async () => {
  const r = await rig();
  try {
    r.lap.startWow();
    await until(async () => (await r.poll()).chat === true);
    assert.equal((await r.poll()).ah, false, 'no auction house: no Auction tab');
    assert.equal((await r.as(JOSH).post('/api/ah', { text: 'Linen Cloth' })).status, 409, 'not at the auction house: nothing typed');
    assert.equal(r.lap.searched.length, 0);
    r.lap.ah = true;
    await until(async () => (await r.poll()).ah === true);
    await until(async () => ((await (await r.as(JOSH).get('/api/items')).json()).items ?? []).length === 4);
    assert.deepEqual((await (await r.as(JOSH).get('/api/items')).json()).items[0], ['Tin Ore', 1, 0], 'item names reach the phone for suggestions');
    assert.equal((await r.as(LINDZ).get('/api/items')).status, 403, 'a phone without chat gets no item list');
    const ok = await r.as(JOSH).post('/api/ah', { text: '  Linen Cloth ' });
    assert.equal(ok.status, 200);
    assert.deepEqual(r.lap.searched, ['Linen Cloth']);
    for (const bad of [{ text: '' }, { text: 'x'.repeat(61) }, { text: 'a|cff' }, { text: 'a\nb' }, { text: 5 }, {}]) {
      assert.equal((await r.as(JOSH).post('/api/ah', bad)).status, 400, JSON.stringify(bad));
    }
    assert.equal(r.lap.searched.length, 1, 'nothing refused reached the laptop');
    assert.equal((await r.as(LINDZ).post('/api/ah', { text: 'Linen Cloth' })).status, 403, 'a phone without chat cannot search');
    assert.equal((await r.as(JOSH).post('/api/ah', { text: 'Linen Cloth' }, {})).status, 403, 'a page elsewhere cannot post');
    r.lap.ah = false;
    await until(async () => (await r.poll()).ah === false);
    r.lap.stopWow();
    await until(async () => (await r.poll()).chat === false);
    assert.equal((await r.poll()).ah, undefined, 'WoW closed: nothing about the auction house');
  } finally { await r.done(); }
});

test('tooltips: by id when the log kept codes, by name when not; HTML never reaches the phone', async () => {
  const calls: string[] = [];
  const fake: typeof fetch = async (u) => {
    const url = String(u); calls.push(url);
    if (url.includes('/search/suggestions-template')) return Response.json({ results: [{ type: 6, id: 1, name: 'Grips of Control' }, { type: 3, id: 9811, name: 'Grips of Control' }] });
    if (url.includes('/tooltip/item/9811')) return Response.json({ name: 'Grips of Control', quality: 2, tooltip: '<b class="q2">Grips of Control</b><br>Binds when equipped<table width="100%"><tr><td>Hands</td><th>Cloth</th></tr></table><img src=x onerror=alert(1)>18 Armor' });
    return new Response('nope', { status: 404 });
  };
  const r = await rig({ wowhead: new Wowhead('classic', fake, { tip: 'https://tip.test', search: 'https://search.test' }) });
  try {
    const byId = await (await r.as(JOSH).get('/api/lookup?kind=item&id=9811')).json();
    assert.equal(byId.name, 'Grips of Control'); assert.equal(byId.q, 2);
    assert.ok(byId.lines.some((l: { l: string; r?: string }) => l.l === 'Hands' && l.r === 'Cloth'));
    assert.ok(!JSON.stringify(byId).includes('<'));
    assert.equal(calls[0], 'https://tip.test/classic/tooltip/item/9811?locale=0');
    const byName = await (await r.as(JOSH).get('/api/lookup?name=Grips%20of%20Control')).json();
    assert.equal(byName.kind, 'item', 'items win over spells of the same name');
    assert.equal(calls.filter(c => c.includes('/tooltip/')).length, 1, 'the second ask came from the cache');
    assert.equal((await r.as(JOSH).get('/api/lookup?name=Nothing')).status, 404);
  } finally { await r.done(); }
});

test('settings: phones without a key get one and the file is saved', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'aang-omashu-'));
  const f = path.join(dir, 'omashu-remote.json');
  assert.equal(loadRemoteConfig(f), null);
  writeFileSync(f, JSON.stringify({ laptop: { url: 'http://laptop.test:47800', key: 'k' }, phones: [{ name: 'Josh', chat: true }, { name: 'Lindz' }] }));
  const c = loadRemoteConfig(f)!;
  assert.ok(c.phones.every(p => p.key.length >= 20));
  assert.notEqual(c.phones[0].key, c.phones[1].key);
  assert.deepEqual(JSON.parse(readFileSync(f, 'utf8')).phones.map((p: { key: string }) => p.key), c.phones.map(p => p.key));
});

test('the wake packet goes out over UDP', async () => {
  const lap = new FakeLaptop({ key: KEY, mac: MAC });
  await lap.start();
  try {
    await sendWake(MAC, ['127.0.0.1'], lap.udpPort);
    await until(() => lap.wakePackets === 1);
    await sendWake('02:00:5e:99:99:99', ['127.0.0.1'], lap.udpPort);   // someone else's MAC wakes nothing
    await new Promise(r => setTimeout(r, 50));
    assert.equal(lap.wakePackets, 1);
  } finally { await lap.stop(); }
});

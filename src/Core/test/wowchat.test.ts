// The WoW home's chat list (sheet omashu/remote/28 C): assets/omashu/wowchat.js, loaded the way the phone loads it.
// Grouping into rows, unread counts, the NEW/QUIET split, the swipe order and where a reply goes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { parseChatLine, buildLine } from '../src/omashu.ts';

vm.runInThisContext(readFileSync(path.join(import.meta.dirname, '..', 'assets', 'omashu', 'wowchat.js'), 'utf8'));
const C = (globalThis as { WowChat?: any }).WowChat!;
type Row = { id: string; u: number; last: { seq: number } | null; kind: string; name: string };
const L = (seq: number, raw: string) => parseChatLine(`11/27 16:${String(10 + seq).padStart(2, '0')}:00.000  ${raw}`, seq)!;
const BASE = [
  L(1, '[1. General - Tirisfal Glades] Rowman Vonshlitz: If she smokes she pokes'),
  L(2, 'Ferathiel Mavelock whispers: pst for ginv :)'),
  L(3, '[3. LocalDefense - Tirisfal Glades] The Bulwark is under attack!'),
  L(4, '[Guild] Bujuju Banton: anyone got linen?'),
  L(5, '[Party] Nox Xerius: ready?'),
  L(6, '[4. LookingForGroup] Renga Tombkeeper: LF TANK ROL GTG!'),
  L(7, 'Hadrik whispers: hi'),
  L(8, 'To Hadrik: hey'),
  L(9, 'Bunji says: hello'),
];
const ids = (rs: Row[]) => rs.map(r => r.id);
const counts = (rs: Row[]) => rs.map(r => [r.id, r.u]);

test('grouping: every line lands in its own row, short channel names', () => {
  assert.deepEqual(BASE.map(l => C.chanOf(l)), ['gen', 'w:Ferathiel Mavelock', 'def', 'guild', 'party', 'lfg', 'w:Hadrik', 'w:Hadrik', null]);
  assert.equal(C.chanOf(L(20, '[Officer] Bujuju Banton: psst')), 'guild', 'officer reads with Guild');
  assert.equal(C.chanOf(L(21, '[Raid] Nox Xerius: pull')), 'party', 'raid reads with Party');
  assert.equal(C.chanOf(L(22, '[2. Trade - City] Seller: wts linen')), 'trade');
  assert.deepEqual([C.tagOf(BASE[2]), C.tagOf(BASE[5]), C.tagOf(BASE[0]), C.tagOf(BASE[3])], ['Defense', 'LFG', 'General', 'Guild']);
  assert.ok(C.inChan(BASE[8], 'all') && !C.inChan(BASE[8], 'gen'), 'Say lines live in Everything only');
});

test('list: Everything on top, NEW then QUIET, whispers one row per person, newest first', () => {
  const seen = C.initSeen(BASE, 1);   // Aang says one whisper is unread
  const R = C.rows(BASE, seen, 'Bunji');
  assert.equal(R.all.id, 'all');
  assert.deepEqual(counts(R.fresh), [['w:Hadrik', 1]]);
  assert.deepEqual(ids(R.quiet), ['w:Ferathiel Mavelock', 'guild', 'party', 'def', 'gen', 'lfg', 'trade']);
  assert.equal(R.quiet.find((r: Row) => r.id === 'trade').last, null, 'nobody spoke in Trade');
  assert.equal(R.quiet.find((r: Row) => r.id === 'w:Ferathiel Mavelock').name, 'Ferathiel Mavelock');
  // at most six whisper rows, the newest person first
  const many = [...BASE, ...['Aa', 'Bb', 'Cc', 'Dd', 'Ee', 'Ff'].map((n, i) => L(30 + i, `${n} whispers: yo`))];
  const all = C.rows(many, C.initSeen(many, 0), 'Bunji').quiet;
  assert.equal(all.filter((r: Row) => r.kind === 'whisper').length, 6);
  assert.equal(all[0].id, 'w:Ff');
});

test('unread: new lines count where they belong, never your own, and reading clears them', () => {
  const seen = C.initSeen(BASE, 0);
  assert.equal(C.rows(BASE, seen, 'Bunji').fresh.length, 0, 'a fresh session starts read');
  const more = [...BASE, L(10, '[Guild] Morrowyn: grats'), L(11, '[Guild] Bunji: ty'), L(12, '[3. LocalDefense - Tirisfal Glades] Crypto Exchange: alliance at sm'),
    L(13, 'Ferathiel Mavelock whispers: ?'), L(14, 'To Ferathiel Mavelock: no thanks'), L(15, '[Guild] Morrowyn: gz again')];
  assert.deepEqual(counts(C.rows(more, seen, 'Bunji').fresh), [['w:Ferathiel Mavelock', 1], ['guild', 2], ['def', 1]]);
  assert.equal(C.unread(more, 'w:Ferathiel Mavelock', seen, 'Bunji'), 1, 'what you whisper back is never unread');
  seen.guild = 15;
  assert.ok(!C.rows(more, seen, 'Bunji').fresh.some((r: Row) => r.id === 'guild'));
});

test('swipe order: the busy rows, as the list shows them', () => {
  const seen = C.initSeen(BASE, 0);
  const more = [...BASE, L(10, '[Party] Nox Xerius: go'), L(11, 'Hadrik whispers: there?'), L(12, '[1. General - Tirisfal Glades] Rowman Vonshlitz: lol'), L(13, '[Guild] Morrowyn: grats')];
  assert.deepEqual(C.busyOrder(C.rows(more, seen, 'Bunji')), ['w:Hadrik', 'guild', 'party', 'gen'], 'whispers first, then the channels in list order');
  assert.deepEqual(C.busyOrder(C.rows(BASE, seen, 'Bunji')), [], 'nothing busy: nothing to swipe to');
});

test('swipe order while reading: the open one stays, the order holds, newly busy ones join at the end', () => {
  assert.deepEqual(C.swipeOrder([], ['w:Hadrik', 'guild'], 'gen'), ['gen', 'w:Hadrik', 'guild'], 'a quiet channel opened from the list can still swipe on');
  assert.deepEqual(C.swipeOrder(['w:Hadrik', 'guild'], ['guild', 'def'], 'w:Hadrik'), ['w:Hadrik', 'guild', 'def'], 'read ones stay put, Defense joins');
  assert.deepEqual(C.swipeOrder(['guild'], [], 'guild'), ['guild'], 'alone: no dots');
});

test('reply goes to the channel being read; Everything goes to Say', () => {
  assert.deepEqual(C.replyTo('all', BASE, {}), { to: 'say' });
  assert.deepEqual(C.replyTo('w:Hadrik', BASE, {}), { to: 'whisper', name: 'Hadrik' });
  assert.deepEqual(C.replyTo('guild', BASE, {}), { to: 'guild' });
  assert.deepEqual(C.replyTo('party', BASE, {}), { to: 'party' });
  assert.deepEqual(C.replyTo('def', BASE, {}), { to: 'channel', num: 3 });
  assert.deepEqual(C.replyTo('lfg', BASE, {}), { to: 'channel', num: 4 });
  assert.deepEqual(C.replyTo('gen', BASE, {}), { to: 'channel', num: 1 });
  assert.deepEqual(C.replyTo('trade', BASE, { 2: 'Trade' }), { to: 'channel', num: 2 });
  assert.deepEqual(C.replyTo('trade', [], { 5: 'Trade - City' }), { to: 'channel', num: 5 }, 'from the channels WoW named');
  assert.deepEqual(C.replyTo('trade', [], {}), { to: 'channel', num: 2 }, 'nobody used it yet: its usual number');
  assert.equal(C.hint('all'), 'Say something…'); assert.equal(C.hint('w:Ferathiel Mavelock'), 'Whisper Ferathiel…'); assert.equal(C.hint('def'), 'Message Defense…');
  assert.equal(C.info('def').name, 'Defense'); assert.equal(C.info('w:Hadrik').sub, 'whisper');
  for (const id of ['all', 'w:Hadrik Stone', 'guild', 'party', 'def', 'gen', 'lfg', 'trade']) assert.ok(buildLine({ ...C.replyTo(id, BASE, {}), text: 'hi' }), id);
});

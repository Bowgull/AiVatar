// The update engine's rules (2026-10-30): one newer(), one overnight rule, one quiet rule, skip and put away, and the
// key's one card across sources.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { UpdateEngine, VersionLists, newer, notNow, overnightNow, quietNow, type Moment, type Offer, type Source } from '../src/updateengine.ts';
import { newer as ghNewer } from '../src/ghrelease.ts';
import { newer as engNewer } from '../src/engineupdate.ts';

const at = (h: number, idleMin = 45, o: Partial<Moment> = {}): Moment => ({ now: new Date(2026, 9, 30, h, 15), idleSeconds: idleMin * 60, inCall: false, inGame: false, ...o });

test('one newer() for every source: numbers, build tags ignored, a hand install older than any release', () => {
  assert.ok(newer('1.10.0', '1.9.9') && !newer('1.2.3', '1.2.3') && !newer('1.2.3', '1.3.0'));
  assert.ok(newer('44.10.0', '44.9.9') && newer('44.9.3+wvcus', '44.5.1+wvcus') && !newer('44.5.1+wvcus', '44.5.1'));
  assert.ok(newer('1.0.0', 'manual-01b3f87906f5') && !newer('manual', '1.0.0') && !newer('1.0', '0.0.1'));
  assert.equal(ghNewer, newer); assert.equal(engNewer, newer);
});

test('overnight: only with his toggle on, 2 to 5 am, idle half an hour, never in a call or a game', () => {
  assert.ok(overnightNow(at(3), true));
  assert.ok(!overnightNow(at(3), false), 'toggle off');
  assert.ok(!overnightNow(at(1), true) && !overnightNow(at(5), true) && overnightNow(at(2), true) && overnightNow(at(4), true), 'the window is 2:00 to 4:59');
  assert.ok(!overnightNow(at(3, 29), true), 'not idle long enough');
  assert.ok(!overnightNow(at(3, 60, { inCall: true }), true) && !overnightNow(at(3, 60, { inGame: true }), true));
});

test('quiet (the brain): any hour once he has been away half an hour, never in a call or a game', () => {
  assert.ok(quietNow(at(14, 31)) && !quietNow(at(14, 10)) && !quietNow(at(14, 60, { inGame: true })));
  assert.equal(notNow({ inCall: true, inGame: false }), "You're in a call. Restart when it's over.");
  assert.equal(notNow({ inCall: false, inGame: true }), 'Not during a game.');
  assert.equal(notNow({ inCall: false, inGame: false }), null);
});

test('skip is for good; put away comes back with Check for updates; build tags are the same version', () => {
  const d = mkdtempSync(path.join(os.tmpdir(), 'ue-'));
  const l = new VersionLists(path.join(d, 'failed.txt'), path.join(d, 'filed.txt'));
  l.skip('44.9.3+wvcus'); l.file('1.24.0');
  assert.ok(l.blocked('44.9.3') && l.skipped('44.9.3') && l.blocked('1.24.0'));
  l.unfile();
  assert.ok(!l.blocked('1.24.0') && l.blocked('44.9.3'));
});

const fake = (id: Source['id'], offer: Offer | null, o: { onKey?: boolean; goOk?: boolean; back?: boolean } = {}) => {
  const log: string[] = [];
  let ready = offer;
  const s: Source & { log: string[] } = {
    id, onKey: o.onKey ?? true, log,
    ready: () => ready, check: async () => { log.push('check'); }, go: async () => { log.push('go'); return o.goOk === false ? { ok: false, why: 'nope' } : { ok: true }; },
    file: () => { log.push('file'); ready = null; }, skip: () => { log.push('skip'); ready = null; },
    canBack: () => o.back === true, back: () => { log.push('back'); return true; }, checkNow: () => { log.push('checkNow'); },
  };
  return s;
};
const samara = (): Offer => ({ version: '1.24.0', since: 2000, title: 'Version 1.24.0: Gojo', groups: [{ name: 'SAMARA', items: [{ text: 'A' }] }] });
const engine = (): Offer => ({ version: '44.9.3', since: 1000, groups: [{ name: "SAMARA'S ENGINE", items: [{ text: 'B' }, { text: 'off', key: 'x', on: false }] }] });

test('one card: Samara first, then the engine; the brain is never on the key', () => {
  const brain = fake('brain', { version: '1.24.0', since: 0, groups: [{ name: 'AANG', items: [{ text: 'C' }] }] }, { onKey: false });
  const e = new UpdateEngine({ sources: [fake('samara', samara()), fake('engine', engine(), { back: true }), brain], moment: () => at(14), overnight: () => false, changed: () => {}, restart: () => {} });
  const c = e.card()!;
  assert.equal(c.version, '1.24.0+44.9.3');
  assert.equal(c.since, 1000, 'the oldest waits longest');
  assert.equal(c.title, 'Version 1.24.0: Gojo');
  assert.deepEqual(c.groups.map((g) => g.name), ['SAMARA', "SAMARA'S ENGINE"]);
  assert.deepEqual(c.lines, ['A', 'B'], 'a line he unticked is not said');
  assert.ok(c.canBack);
});

test('Restart now: never in a call; every ready source goes, Samara first; then one restart', async () => {
  const s = fake('samara', samara()), g = fake('engine', engine());
  let call = true; const restarts: any[] = [];
  const e = new UpdateEngine({ sources: [s, g], moment: () => at(14, 0, { inCall: call }), overnight: () => false, changed: () => {}, restart: (w) => restarts.push(w) });
  assert.deepEqual(await e.go(), { ok: false, why: "You're in a call. Restart when it's over." });
  assert.equal(s.log.length + g.log.length, 0);
  call = false;
  assert.deepEqual(await e.go(), { ok: true });
  assert.deepEqual([s.log, g.log], [['go'], ['go']]);
  assert.deepEqual(restarts[0].sources, ['samara', 'engine']);
  assert.equal(restarts[0].overnight, false);
});

test('when Samara cannot go in, nothing restarts; when the engine fails after Samara, Samara still restarts alone', async () => {
  const r1: any[] = [];
  const e1 = new UpdateEngine({ sources: [fake('samara', samara(), { goOk: false }), fake('engine', engine())], moment: () => at(14), overnight: () => false, changed: () => {}, restart: (w) => r1.push(w) });
  assert.equal((await e1.go()).ok, false); assert.equal(r1.length, 0);
  const r2: any[] = [];
  const e2 = new UpdateEngine({ sources: [fake('samara', samara()), fake('engine', engine(), { goOk: false })], moment: () => at(14), overnight: () => false, changed: () => {}, restart: (w) => r2.push(w) });
  assert.equal((await e2.go()).ok, true); assert.deepEqual(r2[0].sources, ['samara']);
});

test('the tick: overnight goes in at 3 am when idle; the brain goes in quietly whenever he is away', async () => {
  let m = at(3, 60); const restarts: any[] = [];
  const brain = fake('brain', { version: '1.24.0', since: 0, groups: [] }, { onKey: false });
  const e = new UpdateEngine({ sources: [fake('samara', samara()), brain], moment: () => m, overnight: () => true, changed: () => {}, restart: (w) => restarts.push(w) });
  await e.tick();
  assert.equal(restarts.length, 1); assert.equal(restarts[0].overnight, true);
  m = at(15, 5); await e.tick();
  assert.deepEqual(brain.log, [], 'not while he is at the keyboard');
  m = at(15, 40); const e2 = new UpdateEngine({ sources: [brain], moment: () => m, overnight: () => false, changed: () => {}, restart: () => {} });
  await e2.tick();
  assert.deepEqual(brain.log, ['go']);
});

test('the ... menu: put away and skip act on what the key shows; check reaches every source', () => {
  const s = fake('samara', samara()), g = fake('engine', engine(), { back: true });
  const cards: (Offer | null)[] = [];
  const e = new UpdateEngine({ sources: [s, g], moment: () => at(14), overnight: () => false, changed: (c) => cards.push(c), restart: () => {} });
  e.act('file'); assert.deepEqual(s.log, ['file']); assert.equal(cards.at(-1)?.version, '44.9.3');
  e.act('skip'); assert.deepEqual(g.log, ['skip']); assert.equal(cards.at(-1), null);
  e.act('check'); assert.ok(s.log.includes('checkNow') && g.log.includes('checkNow'));
  assert.ok(e.act('back')); assert.ok(g.log.includes('back'));
});

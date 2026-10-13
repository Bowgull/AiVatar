// M6: one browser on both machines. Two pretend browsers, each with the real BrowserSync, wired to each other the
// way the brain wires them (it only passes messages on).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BrowserSync, joinTabs, hostKept, urlKept, type SyncCookie, type SyncMsg, type SyncTarget, type TabSnap } from '../src/bsync.ts';
import type { Visit } from '../src/visits.ts';
import type { Mark } from '../src/bookmarks.ts';

class Pretend implements SyncTarget {
  m: Mark[] = []; p: Record<string, unknown> = { search: 'brave' }; t: TabSnap = { tabs: [], trails: [] }; v: Visit[] = [];
  jar = new Map<string, SyncCookie>();
  marks() { return this.m; } setMarks(l: Mark[]) { this.m = l; }
  prefs() { return this.p; } setPrefs(p: Record<string, unknown>) { this.p = p; }
  tabSnap() { return this.t; } setTabs(s: TabSnap) { this.t = s; }
  visits() { return this.v; } addVisits(l: Visit[]) { this.v = [...this.v, ...l].sort((a, b) => a.at - b.at); }
  forgetVisit(url: string, at: number) { this.v = this.v.filter(x => !(x.url === url && x.at === at)); }
  clearVisits(from: number) { this.v = this.v.filter(x => x.at < from); }
  async cookies() { return [...this.jar.values()]; }
  async setCookie(c: SyncCookie) { this.jar.set(`${c.domain}|${c.path}|${c.name}`, c); }
  async removeCookie(c: SyncCookie) { this.jar.delete(`${c.domain}|${c.path}|${c.name}`); }
}
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
let clock = 1_000_000;
function pair() {
  const a = new Pretend(), b = new Pretend();
  let sa: BrowserSync, sb: BrowserSync;
  // Messages go through JSON, as over the wire.
  sa = new BrowserSync({ target: a, stateDir: mkdtempSync(path.join(os.tmpdir(), 'bs-')), now: () => ++clock, send: (m: SyncMsg) => void sb.got(JSON.parse(JSON.stringify(m))) });
  sb = new BrowserSync({ target: b, stateDir: mkdtempSync(path.join(os.tmpdir(), 'bs-')), now: () => ++clock, send: (m: SyncMsg) => void sa.got(JSON.parse(JSON.stringify(m))) });
  return { a, b, sa, sb, up: async () => { await sa.link(true); await sb.link(true); await wait(30); } };
}
const tab = (url: string, trail: number | null = null) => ({ url, title: url, trail, done: false });

test('M6: bookmarks, settings and tabs changed on one machine change on the other', async () => {
  const { a, b, sa, up } = pair();
  await up();
  a.m = [{ title: 'Wowhead', url: 'https://www.wowhead.com/', folder: '' }]; sa.changed('marks');
  a.p = { search: 'ddg' }; sa.changed('prefs');
  a.t = { tabs: [tab('https://www.reddit.com/r/wow'), tab('https://github.com/')], trails: [] }; sa.changed('tabs');
  await wait(20);
  assert.deepEqual(b.m.map(x => x.url), ['https://www.wowhead.com/']);
  assert.equal(b.p.search, 'ddg');
  assert.deepEqual(b.t.tabs.map(x => x.url), ['https://www.reddit.com/r/wow', 'https://github.com/'], 'the same tabs on both');
  a.t = { tabs: [tab('https://github.com/')], trails: [] }; sa.changed('tabs');
  await wait(20);
  assert.deepEqual(b.t.tabs.map(x => x.url), ['https://github.com/'], 'closing one on the Mac closes it on the PC');
});

test('M6: money sites and Aang\'s own pages never travel', async () => {
  assert.equal(hostKept('.royalbank.com'), false);
  assert.equal(hostKept('www.paypal.com'), false);
  assert.equal(hostKept('127.0.0.1'), false);
  assert.equal(hostKept('.reddit.com'), true);
  assert.equal(urlKept('http://127.0.0.1:5000/settings.html'), false);
  const { a, b, sa, up } = pair();
  await up();
  a.t = { tabs: [tab('https://easyweb.td.com/waw'), tab('https://www.youtube.com/')], trails: [] }; sa.changed('tabs');
  sa.cookie({ name: 'sid', value: 'bank', domain: '.td.com', path: '/' }, false);
  sa.cookie({ name: 'SID', value: 'yt', domain: '.youtube.com', path: '/', secure: true }, false);
  sa.visited([{ url: 'https://www.paypal.com/myaccount', title: 'PayPal', at: 5 }, { url: 'https://www.youtube.com/', title: 'YouTube', at: 6 }]);
  await wait(1700);
  assert.deepEqual(b.t.tabs.map(x => x.url), ['https://www.youtube.com/']);
  assert.deepEqual([...b.jar.keys()], ['.youtube.com|/|SID'], 'the bank login stays on its machine');
  assert.deepEqual(b.v.map(x => x.url), ['https://www.youtube.com/']);
});

test('M6: a login made on one machine arrives on the other, and signing out signs out both', async () => {
  const { b, sa, up } = pair();
  await up();
  sa.cookie({ name: 'reddit_session', value: 'abc', domain: '.reddit.com', path: '/', secure: true, httpOnly: true, expirationDate: 4_000_000_000 }, false);
  await wait(1700);
  assert.equal(b.jar.get('.reddit.com|/|reddit_session')?.value, 'abc');
  sa.cookie({ name: 'reddit_session', value: 'abc', domain: '.reddit.com', path: '/' }, true);
  await wait(1700);
  assert.equal(b.jar.size, 0);
});

test('M6: after time apart, both catch up: newer wins, tabs are joined, no login is swapped', async () => {
  const { a, b, sa, sb, up } = pair();
  // Apart: each machine does its own thing.
  a.t = { tabs: [tab('https://github.com/'), tab('https://www.reddit.com/')], trails: [] }; sa.changed('tabs');
  b.t = { tabs: [tab('https://github.com/'), tab('https://www.wowhead.com/')], trails: [] }; sb.changed('tabs');
  b.p = { search: 'google' }; sb.changed('prefs');
  a.jar.set('.github.com|/|user_session', { name: 'user_session', value: 'mac', domain: '.github.com', path: '/' });
  b.jar.set('.github.com|/|user_session', { name: 'user_session', value: 'pc', domain: '.github.com', path: '/' });
  b.jar.set('.twitch.tv|/|auth-token', { name: 'auth-token', value: 't', domain: '.twitch.tv', path: '/' });
  await up();
  await wait(50);
  const urls = (s: TabSnap) => s.tabs.map(x => x.url).sort();
  assert.deepEqual(urls(a.t), urls(b.t), 'the same tabs');
  assert.deepEqual(urls(a.t), ['https://github.com/', 'https://www.reddit.com/', 'https://www.wowhead.com/'], 'nothing lost');
  assert.equal(a.p.search, 'google', 'the newer setting wins');
  assert.equal(a.jar.get('.github.com|/|user_session')?.value, 'mac', 'a login both had stays as each had it');
  assert.equal(b.jar.get('.github.com|/|user_session')?.value, 'pc');
  assert.equal(a.jar.get('.twitch.tv|/|auth-token')?.value, 't', 'a login only one had arrives');
});

test('M6: joining tabs keeps trails together', () => {
  const j = joinTabs({ at: 2, snap: { tabs: [tab('https://a.com/', 1)], trails: [{ id: 1, name: 'A' }] } },
    { at: 1, snap: { tabs: [tab('https://b.com/', 1)], trails: [{ id: 1, name: 'B' }] } });
  assert.deepEqual(j.tabs.map(t => [t.url, t.trail]), [['https://a.com/', 1], ['https://b.com/', 2]]);
  assert.deepEqual(j.trails, [{ id: 1, name: 'A' }, { id: 2, name: 'B' }]);
});

test('M6 fix: on the first sync, bookmarks neither side ever changed still travel, and none is lost', async () => {
  const { a, b, up } = pair();
  b.m = [{ title: 'Wowhead', url: 'https://www.wowhead.com/', folder: 'Bar' }, { title: 'Reddit', url: 'https://www.reddit.com/', folder: '' }];
  a.m = [{ title: 'GitHub', url: 'https://github.com/', folder: '' }];
  await up();
  await wait(50);
  const urls = (l: { url: string }[]) => l.map(x => x.url).sort();
  assert.deepEqual(urls(a.m), ['https://github.com/', 'https://www.reddit.com/', 'https://www.wowhead.com/']);
  assert.deepEqual(urls(b.m), urls(a.m), 'both end with all of them');
});

test('one video at a time: something starting on one machine pauses the other', async () => {
  const { a, b, sa, up } = pair();
  let paused = 0;
  (b as any).pauseAll = () => { paused++; };
  void a;
  await up();
  sa.mediaStarted();
  await wait(20);
  assert.equal(paused, 1);
});

// Phase 1 security fixes (parity sweep and audit, 2026-11-12): the pure rules behind them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { goesInward, grantKey, grantTop, needsLookup, ownPopup, privateHost, reachesIn } from '../src/driverrules.ts';
import { resolvesInward } from '../src/netlookup.ts';
import { isRisky } from '../src/secure.ts';
import { catchStrays } from '../src/log.ts';

test('an IPv4 address written inside IPv6 is judged as the IPv4 address', () => {
  assert.equal(privateHost('[::ffff:7f00:1]'), true);            // 127.0.0.1
  assert.equal(privateHost('::ffff:c0a8:101'), true);            // 192.168.1.1
  assert.equal(privateHost('::ffff:192.168.1.1'), true);
  assert.equal(privateHost('::ffff:808:808'), false);            // 8.8.8.8 stays public
  assert.equal(reachesIn('http://[::ffff:c0a8:101]/apply.cgi', 'https://evil.example/', false), true);
});

test('home-network names are private; real sites are not', () => {
  for (const h of ['router', 'nas', 'fritz.box', 'printer.lan', 'nas.home.arpa', 'pc.home', 'wiki.corp']) assert.equal(privateHost(h), true, h);
  for (const h of ['example.com', 'bbc.co.uk', '8.8.8.8', '2606:4700::1111', '']) assert.equal(privateHost(h), false, h);
});

test('only a public page\'s parts going to a public-looking name need their address looked up', () => {
  assert.equal(needsLookup('https://rebind.example.com/x', 'https://evil.example/', false), 'rebind.example.com');
  assert.equal(needsLookup('https://rebind.example.com/x', 'https://evil.example/', true), null);       // he goes there himself
  assert.equal(needsLookup('http://192.168.1.1/', 'https://evil.example/', false), null);                // an address: judged as written
  assert.equal(needsLookup('https://cdn.example.com/a.js', 'http://192.168.1.1/', false), null);       // a local page may
  assert.equal(needsLookup('data:text/plain,x', 'https://evil.example/', false), null);
});

test('a name that resolves home is stopped, once looked up; a failed look-up is left to the engine', async () => {
  const look = (async (h: string) => (h === 'home.example' ? [{ address: '192.168.0.10', family: 4 }] : h === 'v6.example' ? [{ address: '::ffff:7f00:1', family: 6 }] : h === 'gone.example' ? Promise.reject(new Error('ENOTFOUND')) : [{ address: '93.184.216.34', family: 4 }])) as any;
  assert.equal(await resolvesInward('home.example', look), true);
  assert.equal(await resolvesInward('v6.example', look), true);
  assert.equal(await resolvesInward('public.example', look), false);
  assert.equal(await resolvesInward('gone.example', look), false);
});

test('a public page never opens this computer in a tab or window; local pages and his own typing are free', () => {
  assert.equal(goesInward('http://127.0.0.1:8080/', 'https://evil.example/'), true);
  assert.equal(goesInward('http://router/', 'https://evil.example/'), true);
  assert.equal(goesInward('http://192.168.1.1/b', 'http://192.168.1.1/a'), false);
  assert.equal(goesInward('https://example.com/', 'https://evil.example/'), false);
});

test('blank and same-origin blob popups are the page\'s own; another site\'s blob is not', () => {
  assert.equal(ownPopup('', 'https://a.example/'), true);
  assert.equal(ownPopup('about:blank', 'https://a.example/'), true);
  assert.equal(ownPopup('blob:https://a.example/1234-5678', 'https://a.example/page'), true);
  assert.equal(ownPopup('blob:https://b.example/1234', 'https://a.example/page'), false);
  assert.equal(ownPopup('blob:null/1234', 'https://a.example/page'), false);
  assert.equal(ownPopup('javascript:alert(1)', 'https://a.example/'), false);
});

test('a camera grant belongs to the site inside the page it was given on', () => {
  assert.notEqual(grantKey('zoom.us', 'zoom.us'), grantKey('zoom.us', 'evil.example'));
  assert.equal(grantTop(grantKey('zoom.us', 'teams.example')), 'teams.example');
  assert.equal(grantTop(grantKey('meet.google.com', '')), 'meet.google.com');
});

test('archives, Remote Desktop, OneNote and macro Office files ask before opening', () => {
  for (const f of ['a.7z', 'b.rar', 'c.rdp', 'd.one', 'e.docm', 'f.xlsm', 'g.jnlp', 'h.tar.gz']) assert.equal(isRisky(f), true, f);
  for (const f of ['photo.jpg', 'report.pdf', 'notes.docx']) assert.equal(isRisky(f), false, f);
});

test('stray errors keep their stack, and a storm is said once a minute', () => {
  const lines: string[] = [];
  let t = 1_000_000;
  const before = process.listeners('uncaughtException').length;
  const c = catchStrays('t', (s) => lines.push(s), () => t);
  const fire = process.listeners('uncaughtException').at(-1) as (e: Error) => void;
  fire(new Error('boom'));
  assert.match(lines[0]!, /t: uncaught: Error: boom \| +at /);
  for (let i = 0; i < 40; i++) fire(new Error('again'));
  assert.equal(lines.filter((l) => /in under a minute/.test(l)).length, 1);
  assert.ok(lines.length < 25, String(lines.length));
  t += 61_000; fire(new Error('later'));
  assert.match(lines.at(-1)!, /later/);
  assert.equal(c.seen(), 42);
  process.removeListener('uncaughtException', fire as any);
  process.removeListener('unhandledRejection', process.listeners('unhandledRejection').at(-1) as any);
  assert.equal(process.listeners('uncaughtException').length, before);
});

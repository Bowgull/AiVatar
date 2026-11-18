// Google Safe Browsing, private mode, in the real browser (2026-11-17). A stand-in for Google answers; nothing reaches
// the internet. Normal Samara: a page whose fingerprint is on the kept list is held, asked about by its 4-byte prefix
// only, and gets the red plate; an ordinary page loads without Google hearing of it. The secret window has no Safe
// Browsing at all, so even a listed page there never makes Samara ask Google anything.
//
// Run on the hidden desktop, from src/Shell:
//   powershell -NoProfile -ExecutionPolicy Bypass -File tools/hidden-desktop-run.ps1 -Command "npx electron test/electron/safebrowsing-check.ts"
import { app, BrowserWindow, screen } from 'electron';
import http from 'node:http';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';
import { checksumOf, expressions, fullHash, prefixNum } from '../../src/safebrowsing.ts';

const PORT = 47931;
const BAD = `http://phish.example.net:${PORT}/login`, GOOD = `http://fine.example.org:${PORT}/`;
app.commandLine.appendSwitch('host-resolver-rules', `MAP phish.example.net 127.0.0.1:${PORT}, MAP fine.example.org 127.0.0.1:${PORT}`);
process.on('uncaughtException', (e) => { console.log('HARNESS NOTE ' + String((e as Error).message).split('\n')[0]); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e).split('\n')[0]); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 120_000).unref();
app.on('window-all-closed', () => { /* the check decides */ });
const TMP = mkdtempSync(path.join(os.tmpdir(), 'sbcheck-'));
app.setPath('userData', path.join(TMP, 'user'));
const HERE = path.dirname(fileURLToPath(import.meta.url));
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-9000, 100); this.showInactive(); };
BrowserWindow.prototype.focus = function () { /* not in a test */ };
BrowserWindow.prototype.moveTop = function () { /* not in a test */ };
let bad = 0;
const check = (what: string, ok: boolean, d: unknown = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d !== '' ? '  -- ' + JSON.stringify(d).slice(0, 300) : ''}`); if (!ok) bad++; };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (fn: () => boolean, ms = 8000) => { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await wait(100); } return fn(); };

// The stand-in for Google (and every other fetch: the daily lists answer 404 here, so nothing leaves the machine).
const google: string[] = [];
const rice = (v: number[]) => {
  const bits: number[] = []; const k = 12;
  for (let i = 1; i < v.length; i++) { const d = v[i]! - v[i - 1]!; for (let j = 0; j < Math.floor(d / 2 ** k); j++) bits.push(1); bits.push(0); for (let j = 0; j < k; j++) bits.push(((d % 2 ** k) >> j) & 1); }
  const b = Buffer.alloc(Math.ceil(bits.length / 8)); bits.forEach((x, i) => { if (x) b[i >> 3]! |= 1 << (i & 7); });
  return { firstValue: v[0]!, riceParameter: k, entriesCount: v.length - 1, encodedData: b.toString('base64') };
};
const listed = [...new Set(expressions(BAD).map((e) => prefixNum(fullHash(e))))].sort((a, b) => a - b);
(globalThis as any).fetch = async (url: string) => {
  const u = String(url);
  if (!u.startsWith('https://safebrowsing.googleapis.com/')) return new Response('', { status: 404 });
  google.push(u);
  if (u.includes('hashLists:batchGet')) return Response.json({ hashLists: ['se-4b', 'mw-4b', 'uws-4b'].map((name) => (name === 'se-4b'
    ? { name, version: 'djE=', minimumWaitDuration: '1800s', additionsFourBytes: rice(listed), sha256Checksum: checksumOf(Uint32Array.from(listed)) }
    : { name, version: 'djE=', minimumWaitDuration: '1800s', sha256Checksum: checksumOf(new Uint32Array(0)) })) });
  return Response.json({ fullHashes: [{ fullHash: fullHash('phish.example.net/login').toString('base64'), fullHashDetails: [{ threatType: 'SOCIAL_ENGINEERING' }] }], cacheDuration: '300s' });
};

app.whenReady().then(async () => {
  (screen as any).getCursorScreenPoint = () => ({ x: -20000, y: 500 });
  const hits: string[] = [];
  const site = http.createServer((q, r) => { hits.push(`${q.headers.host}${q.url}`); r.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>site</title><p>loaded</p>'); });
  await new Promise<void>((r) => site.listen(PORT, '127.0.0.1', () => r()));
  const { AangBrowser } = await import('../../src/browser.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const state = path.join(TMP, 'state');
  mkdirSync(state, { recursive: true });
  writeFileSync(path.join(state, 'safebrowsing-key.txt'), 'test-key');
  const pre = { preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'), tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'),
    settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs') };
  const b = new AangBrowser({ origin: pages.origin, stateDir: state, ...pre }) as any;
  await b.sb.update(true);
  check('normal Samara keeps Google\'s list on this PC', b.sb.count() === listed.length, { kept: b.sb.count() });

  const searchesBefore = () => google.filter((u) => u.includes('hashes:search')).length;
  b.open(GOOD);
  await until(() => b.tabs.some((t: any) => String(t.url).startsWith(GOOD)) && hits.some((h) => h.startsWith('fine.example.org')));
  await wait(800);
  check('an ordinary page loads, and Google hears nothing about it', hits.some((h) => h.startsWith('fine.example.org')) && searchesBefore() === 0, { hits, searches: searchesBefore() });

  b.open(BAD);
  const blocked = await until(() => b.tabs.some((t: any) => t.blocked?.lists?.includes('GOOGLE SAFE BROWSING')), 10_000);
  check('a page on Google\'s list gets the red plate', blocked, b.tabs.map((t: any) => ({ url: t.url, blocked: t.blocked })));
  const ask = google.find((u) => u.includes('hashes:search')) ?? '';
  const prefixes = ask ? new URL(ask).searchParams.getAll('hashPrefixes') : [];
  check('and only 4-byte prefixes went to Google, never the address', ask !== '' && !/phish|example|login/i.test(ask) && prefixes.length > 0 && prefixes.every((p) => Buffer.from(p, 'base64').length === 4), ask);

  // The secret window: no Safe Browsing at all, even with a key and a listed page.
  const secretState = path.join(state, 'secret');
  mkdirSync(secretState, { recursive: true });
  const s = new AangBrowser({ origin: pages.origin, stateDir: secretState, sharedDir: state, secret: true, phish: b.phishCheck, ...pre }) as any;
  check('the secret window has no Safe Browsing', s.sb === null);
  const calls = google.length;
  try { s.open(BAD); } catch { /* locked behind its PIN: nothing opens, which is fine too */ }
  await wait(3000);
  check('a listed page in the secret window makes Samara ask Google nothing', google.length === calls, google.slice(calls));

  console.log(bad ? `${bad} FAILED` : 'ALL PASS');
  app.exit(bad ? 1 : 0);
});

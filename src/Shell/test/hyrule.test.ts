// The Hyrule tab's two plain parts (2026-11-03, BG4): where the map's private folder is found (no folder, no tab), and
// the page server serving it: the map's own home page and file types, and still nothing from outside its folder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { hyruleHomeDir } from '../src/hyrulehome.ts';
import { servePages } from '../src/pageserver.ts';

// one plain request, no kept-alive connection (an open one crashes Node on Windows as the test ends)
function get(url: string, headers: Record<string, string> = {}): Promise<{ status: number; type: string; body: string }> {
  return new Promise((done, fail) => {
    http.get(url, { agent: false, headers }, (r) => { let body = ''; r.setEncoding('utf8'); r.on('data', (c) => { body += c; });
      r.on('end', () => done({ status: r.statusCode ?? 0, type: String(r.headers['content-type'] ?? ''), body })); }).on('error', fail);
  });
}

test('the map folder counts only when its page is there', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'hyrule-'));
  const was = process.env.AANG_HYRULE_DIR;
  process.env.AANG_HYRULE_DIR = dir;
  try {
    assert.equal(hyruleHomeDir(), undefined);
    writeFileSync(path.join(dir, 'index.html'), '<!doctype html>');
    assert.equal(hyruleHomeDir(), dir);
  } finally { if (was === undefined) delete process.env.AANG_HYRULE_DIR; else process.env.AANG_HYRULE_DIR = was; }
});

test('the map is served from its own folder, with its home page and file types, and nothing outside', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'hyrule-srv-'));
  const dir = path.join(root, 'Hyrule');
  mkdirSync(path.join(dir, 'tiles'), { recursive: true });
  writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>Hyrule</title>');
  writeFileSync(path.join(dir, 'tiles', 'a.webp'), 'RIFF');
  writeFileSync(path.join(dir, 'land.json'), '{}');
  writeFileSync(path.join(root, 'secret.txt'), 'not the map');
  const s = await servePages(dir, '/index.html');
  try {
    const home = await get(s.origin + '/');
    assert.equal(home.status, 200);
    assert.match(home.body, /<title>Hyrule/);
    assert.equal((await get(s.origin + '/tiles/a.webp')).type, 'image/webp');
    assert.match((await get(s.origin + '/land.json')).type, /^application\/json/);
    assert.equal((await get(s.origin + '/..%2Fsecret.txt')).status, 403);
    assert.equal((await get(s.origin + '/index.html', { Origin: 'https://example.com' })).status, 403);
  } finally { s.close(); }
});

// BG10 (2026-11-04): one event stream, GET /live/events, names a live file the moment it is rewritten. Watched only while
// a page listens; a temp file beside the live ones (atomic.ts's state.json.<pid>.tmp) is never announced.
test('a rewritten live file reaches the page as one event within a second, and the stream closes cleanly', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'hyrule-live-'));
  const dir = path.join(root, 'Hyrule'), live = path.join(root, 'botw');
  mkdirSync(dir); mkdirSync(live);
  writeFileSync(path.join(dir, 'index.html'), '<!doctype html>');
  const s = await servePages(dir, '/index.html', { live });
  try {
    const events: string[] = [];
    const req = http.get(s.origin + '/live/events', { agent: false });
    const res = await new Promise<http.IncomingMessage>((done, fail) => { req.on('response', done); req.on('error', fail); });
    assert.equal(res.statusCode, 200);
    assert.match(String(res.headers['content-type']), /^text\/event-stream/);
    res.setEncoding('utf8'); res.on('data', (c: string) => events.push(c));
    await new Promise((r) => setTimeout(r, 200));           // the watcher is up once the stream is open
    writeFileSync(path.join(live, 'state.json.123.tmp'), '{}');   // never announced
    writeFileSync(path.join(live, 'state.json'), '{"v":1}');
    writeFileSync(path.join(live, 'cook.json'), '{"v":1}');
    const t0 = Date.now();
    while (Date.now() - t0 < 1500 && !events.join('').includes('"cook"')) await new Promise((r) => setTimeout(r, 25));
    const all = events.join('');
    assert.match(all, /^retry: 3000\n\n/);
    assert.match(all, /event: change\ndata: \{"file":"state"\}\n\n/);
    assert.match(all, /event: change\ndata: \{"file":"cook"\}\n\n/);
    assert.doesNotMatch(all, /tmp/);
    req.destroy();
  } finally { s.close(); }
});

// BG10 (his interview, 2026-11-04): the live reader works only while a guide page is open. A listening page is an open
// page, so while one listens the lease want.json sits in the live folder, and it goes when the last one leaves.
test('a listening page keeps the lease want.json in the live folder; it goes when the page does', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'hyrule-lease-'));
  const dir = path.join(root, 'Hyrule'), live = path.join(root, 'botw'), want = path.join(live, 'want.json');
  mkdirSync(dir); mkdirSync(live);
  writeFileSync(path.join(dir, 'index.html'), '<!doctype html>');
  const s = await servePages(dir, '/index.html', { live });
  try {
    assert.ok(!existsSync(want), 'no page, no lease');
    const req = http.get(s.origin + '/live/events', { agent: false });
    const res = await new Promise<http.IncomingMessage>((done, fail) => { req.on('response', done); req.on('error', fail); });
    res.resume();
    assert.equal(JSON.parse(readFileSync(want, 'utf8')).pages, 1);
    req.destroy();
    const t0 = Date.now();
    while (Date.now() - t0 < 1500 && existsSync(want)) await new Promise((r) => setTimeout(r, 25));
    assert.ok(!existsSync(want), 'the page left: the lease is gone');
  } finally { s.close(); }
});

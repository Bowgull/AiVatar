// The Hyrule tab's two plain parts (2026-11-03, BG4): where the map's private folder is found (no folder, no tab), and
// the page server serving it: the map's own home page and file types, and still nothing from outside its folder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
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

// The Mac's mockup door, 2026-10-28 (his "mockups aren't being sent organized correctly"): a sheet is filed from its own
// repo whatever folder the session runs in, and a page served straight from a folder is filed as its file, so its row
// keeps working after the server stops.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkAsk, servedFile } from '../src/mockupdoor.ts';

function repo() {
  const r = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'md-repo-')));
  mkdirSync(path.join(r, 'docs'));
  writeFileSync(path.join(r, 'docs', 'sheet-1.html'), '<title>1</title>');
  execFileSync('git', ['init', '-q', r]);
  return r;
}

test('a full path files from its own repo, even from a session outside any repo', () => {
  const r = repo(), away = mkdtempSync(path.join(os.tmpdir(), 'md-away-'));
  const c = checkAsk({ cwd: away, path: path.join(r, 'docs', 'sheet-1.html'), title: '1 · One' });
  assert.ok(c.ok, JSON.stringify(c));
  if (c.ok) { assert.equal(c.drop.repo, r); assert.equal(c.drop.path, 'docs/sheet-1.html'); assert.equal(c.drop.url, null); }
  const c2 = checkAsk({ path: path.join(r, 'docs', 'sheet-1.html') });
  assert.ok(c2.ok, 'no session folder needed for a full path');
});

test('a file in no repo is refused, saying how to fix it', () => {
  const d = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'md-loose-')));
  writeFileSync(path.join(d, 'x.html'), 'x');
  const c = checkAsk({ path: path.join(d, 'x.html') });
  assert.equal(c.ok, false);
  if (!c.ok) assert.match(c.message, /not in a git repo/);
});

test('a page served from a folder is filed as its file; a page nothing serves stays live', async () => {
  const r = repo();
  const port = 20000 + Math.floor(Math.random() * 20000);
  const srv = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: r, stdio: 'ignore' });
  try {
    for (let i = 0; i < 50 && !servedFile(`http://127.0.0.1:${port}/docs/sheet-1.html`); i++) await new Promise((x) => setTimeout(x, 100));
    assert.equal(servedFile(`http://127.0.0.1:${port}/docs/sheet-1.html?v=2`), path.join(r, 'docs', 'sheet-1.html'));
    assert.equal(servedFile(`http://127.0.0.1:${port}/docs/nope.html`), null);
    const c = checkAsk({ url: `http://127.0.0.1:${port}/docs/sheet-1.html?v=3`, title: '1 · One' });
    assert.ok(c.ok && c.drop.repo === r && c.drop.path === 'docs/sheet-1.html' && c.drop.url === null, JSON.stringify(c));
  } finally { srv.kill(); }
  const c2 = checkAsk({ url: `http://127.0.0.1:${port}/docs/sheet-1.html` });
  assert.ok(c2.ok && c2.drop.url, 'nothing listening: shown live, as before');
});

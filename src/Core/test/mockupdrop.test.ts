// show_mockup, the brain's half (2026-10-22): the drop file the brain leaves for Samara's Mockups trail, and its signed
// door. A throwaway git repo stands in for a session's repo (Waymark) and another for AangApp; nothing of his is touched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { dropMockup, cleanLiveUrl, cleanTitle } from '../src/mockupdrop.ts';
import { JobTracker, LinkDoor, linkMac } from '../src/claudelink.ts';

const tmp = mkdtempSync(path.join(os.tmpdir(), 'mockdrop-'));
const repo = (name: string) => {
  const d = path.join(tmp, name);
  mkdirSync(d, { recursive: true });
  execFileSync('git', ['-C', d, 'init', '-q']);
  return d;
};
const put = (d: string, p: string, s = '<!doctype html><title>x</title>') => { mkdirSync(path.dirname(path.join(d, p)), { recursive: true }); writeFileSync(path.join(d, p), s); };
const commit = (d: string) => { execFileSync('git', ['-C', d, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', 'add', '-A']); execFileSync('git', ['-C', d, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'c']); };

const way = repo('Waymark'), home = repo('AangApp'), state = path.join(tmp, 'state');
put(way, 'docs/motion.html'); put(way, '.hidden/x.html'); put(way, 'notes.txt', 'x'); put(way, 'src/app/cut.html');
put(home, 'docs/cockpit/sheet-1.html'); put(home, 'src/Core/src/x.html');
commit(way); commit(home);
put(way, 'docs/new.html');                     // not committed
writeFileSync(path.join(tmp, 'outside.html'), '<title>o</title>');
const drops = () => { try { return readdirSync(path.join(state, 'open-urls')).filter((n) => n.endsWith('.mockup')).map((n) => JSON.parse(readFileSync(path.join(state, 'open-urls', n), 'utf8'))); } catch { return []; } };
const clear = () => rmSync(path.join(state, 'open-urls'), { recursive: true, force: true });

test.after(() => rmSync(tmp, { recursive: true, force: true }));

test('a committed page in the session repo becomes a .mockup with its repo; titles are cut short', async () => {
  clear();
  const r = await dropMockup(state, { cwd: path.join(way, 'src'), path: '../docs/motion.html', title: 'Waymark motion ' + 'x'.repeat(200), branch: '  Waymark  ' }, home);
  assert.equal(r.ok, true, r.message);
  const [d] = drops();
  assert.equal(d.path, 'docs/motion.html');
  assert.equal(path.resolve(d.repo).toLowerCase(), path.resolve(way).toLowerCase());
  assert.equal(d.title.length, 80);
  assert.equal(d.branch, 'Waymark');
  assert.equal(drops().length, 1);
  assert.deepEqual(readdirSync(path.join(state, 'open-urls')).filter((n) => n.endsWith('.tmp')), [], 'no half-written file left');
});

test('paths outside the repo, hidden folders, non-pages, missing and uncommitted files are refused; nothing is written', async () => {
  clear();
  for (const p of ['../outside.html', path.join(tmp, 'outside.html'), '.hidden/x.html', 'notes.txt', 'docs/nope.html', 'docs/new.html', '\\\\server\\share\\x.html', '../AangApp/docs/cockpit/sheet-1.html']) {
    const r = await dropMockup(state, { cwd: way, path: p }, home);
    assert.equal(r.ok, false, `${p} should be refused`);
  }
  assert.match((await dropMockup(state, { cwd: way, path: 'docs/new.html' }, home)).message, /not committed/);
  assert.equal((await dropMockup(state, { cwd: tmp, path: 'outside.html' }, home)).ok, false, 'a folder that is not a git repo');
  assert.equal((await dropMockup(state, { cwd: 'relative/dir', path: 'docs/motion.html' }, home)).ok, false, 'no known folder');
  assert.equal(drops().length, 0);
});

test('in AangApp itself only the mockup folders, written the old way (a repo path only)', async () => {
  clear();
  assert.equal((await dropMockup(state, { cwd: home, path: 'src/Core/src/x.html' }, home)).ok, false);
  const r = await dropMockup(state, { cwd: home, path: 'docs/cockpit/sheet-1.html' }, home);
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(drops(), [{ path: 'docs/cockpit/sheet-1.html' }]);
});

test('a live page must be on this computer; exactly one of path or url', async () => {
  clear();
  assert.equal(cleanLiveUrl('http://127.0.0.1:5173/rec'), 'http://127.0.0.1:5173/rec');
  assert.equal(cleanLiveUrl('http://localhost:3000/'), 'http://localhost:3000/');
  for (const u of ['https://example.com/', 'http://127.0.0.1.evil.example/', 'file:///C:/x.html', 'http://user:pw@127.0.0.1/', 'javascript:alert(1)', 'http://10.0.0.5/']) assert.equal(cleanLiveUrl(u), null, u);
  assert.equal((await dropMockup(state, { cwd: way, url: 'https://example.com/' }, home)).ok, false);
  assert.equal((await dropMockup(state, { cwd: way, url: 'http://127.0.0.1:5/', path: 'docs/motion.html' }, home)).ok, false);
  assert.equal((await dropMockup(state, { cwd: way }, home)).ok, false);
  const r = await dropMockup(state, { url: 'http://127.0.0.1:5173/rec', title: 'Motion\n\u0007take 2', branch: 'x'.repeat(41) }, home);
  assert.equal(r.ok, true);
  assert.match(r.message, /branch name/);
  assert.deepEqual(drops(), [{ url: 'http://127.0.0.1:5173/rec', title: 'Motion take 2' }]);
  assert.equal(cleanTitle('  a \t b  '), 'a b');
});

test('the door: /link/mockup answers only a signed request, with the folder the session told the brain', async () => {
  clear();
  const KEY = 'k'.repeat(43);
  const tracker = new JobTracker();
  const door = new LinkDoor(KEY, tracker);
  const asked: unknown[] = [];
  door.onMockup = async (ask) => { asked.push(ask); return dropMockup(state, ask, home); };
  tracker.event({ session: 's1', type: 'start', cwd: way }, Date.now());
  const srv = http.createServer((q, r) => door.handle(q, r));
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
  const port = (srv.address() as { port: number }).port;
  const post = (body: string, sign = true) => new Promise<{ code: number; text: string }>((done, fail) => {
    const ts = String(Date.now());
    const headers: Record<string, string> = { 'content-type': 'application/json', 'x-aang-link-ts': ts, 'x-aang-link-sig': sign ? linkMac(KEY, 'req', ts, 'POST', '/link/mockup', body) : '0'.repeat(64) };
    const rq = http.request({ host: '127.0.0.1', port, path: '/link/mockup', method: 'POST', headers, agent: false }, (res) => { let t = ''; res.on('data', (d) => { t += d; }); res.on('end', () => done({ code: res.statusCode ?? 0, text: t })); });
    rq.on('error', fail); rq.end(body);
  });
  try {
    const body = JSON.stringify({ session: 's1', cwd: 'C:\\somewhere\\else', path: 'docs/motion.html', title: 'Motion' });
    assert.equal((await post(body, false)).code, 403, 'unsigned');
    assert.equal(asked.length, 0);
    const r = await post(body);
    assert.equal(r.code, 200);
    assert.equal(JSON.parse(r.text).ok, true, r.text);
    assert.equal((asked[0] as { cwd: string }).cwd, way, "the session's own folder, not the one in the request");
    assert.equal(drops()[0].title, 'Motion');
  } finally { tracker.close(); await new Promise((r) => srv.close(() => r(null))); }
});

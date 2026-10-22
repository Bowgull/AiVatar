// C6 (2026-10-22): the lock on starting Claude jobs (jobstart.ts), the door the mod asks at (claudelink.ts /link/start),
// and the flow from card to door (jobstarter.ts), with a pretend tracker, disk and Claude app. Nothing real is opened.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HookServer } from '../src/hooks.ts';
import { JobTracker, LinkDoor, linkMac } from '../src/claudelink.ts';
import { START_TTL_MS, StartBook, readDoor, sha256Hex, startBody, writeDoor } from '../src/jobstart.ts';
import { JobStarter } from '../src/jobstarter.ts';
import type { StarterDeps } from '../src/jobstarter.ts';

const PORT = 48431;
const KEY = 'c'.repeat(43);
const NONCE = 'cd'.repeat(16);
const FOLDER = 'C:\\Users\\J\\Documents\\AangApp';

function call(method: string, p: string, body = ''): Promise<{ code: number; text: string }> {
  const ts = String(Date.now());
  const headers: Record<string, string> = { host: `127.0.0.1:${PORT}`, 'x-aang-link-ts': ts, 'x-aang-link-sig': linkMac(KEY, 'req', ts, method, p, body) };
  if (body) headers['content-type'] = 'application/json';
  return new Promise((done, fail) => {
    const r = http.request({ host: '127.0.0.1', port: PORT, path: p, method, headers, agent: false }, res => {
      let text = ''; res.on('data', d => { text += d; }); res.on('end', () => done({ code: res.statusCode ?? 0, text }));
    });
    r.on('error', fail); r.end(body || undefined);
  });
}

const cardOf = (b: StartBook, text = 'Goal: fix it.\n\nJoshua\'s words: "fix it"') =>
  b.card({ words: 'fix it', folder: FOLDER, text, model: 'opus', effort: 'high', resume: null });

test('a card is spent by Go, and only the hash of the text he saw sends it (byte for byte)', () => {
  const b = new StartBook();
  const c = cardOf(b);
  assert.equal(c.hash, sha256Hex(c.text));
  const wrong = b.go(c.id, sha256Hex(c.text + ' '));
  assert.ok('error' in wrong, 'one byte different: refused');
  assert.ok('error' in b.go(c.id, c.hash), 'and the card is spent: no second try');
  const c2 = cardOf(b);
  const ok = b.go(c2.id, c2.hash);
  assert.ok('card' in ok && ok.card.text === c2.text);
  assert.ok('error' in b.go(c2.id, c2.hash), 'single use');
  assert.ok('error' in b.go('nope', c2.hash));
  const c3 = cardOf(b, 'x');
  b.drop(c3.id);
  assert.ok('error' in b.go(c3.id, c3.hash), 'Not now spends it too');
});

test('a start is claimed once, by folder, within its two minutes', () => {
  const b = new StartBook();
  const t0 = 1_000_000;
  const c = cardOf(b);
  const s = b.arm(c, t0);
  assert.equal(b.claim('c:/users/j/documents/aangapp/', t0 + 1000)?.id, s.id, 'the same folder however it is spelled');
  assert.equal(b.claim(FOLDER, t0 + 2000), null, 'a second session in that folder gets nothing');
  b.arm(c, t0);
  assert.equal(b.claim(FOLDER, t0 + START_TTL_MS + 1), null, 'too late: expired');
  const r = b.queueFor('sess-1', c, t0);
  assert.equal(b.takeFor('sess-2', t0), null);
  assert.equal(b.takeFor('sess-1', t0)?.id, r.id);
  assert.equal(b.takeFor('sess-1', t0), null, 'a resume goes once');
});

test('door: /link/start hands the start to the first new session only, signed over the nonce and the folder; a resume rides the session\'s poll', async () => {
  const tracker = new JobTracker();
  const s = new HookServer(PORT, () => {}, null);
  const door = new LinkDoor(KEY, tracker, () => 'C:\\aang-self');
  const book = new StartBook();
  door.starts = book;
  s.link = door;
  await s.start();
  try {
    assert.equal(JSON.parse((await call('GET', `/link/hello?n=${NONCE}`)).text).c6, 1, 'the hello says C6 is here');
    const c = cardOf(book);
    const st = book.arm(c);
    const f = encodeURIComponent(FOLDER.toLowerCase());
    const first = JSON.parse((await call('GET', `/link/start?f=${f}&n=${NONCE}`)).text).items;
    assert.equal(first.length, 1);
    const [item] = first;
    assert.equal(item.id, st.id);
    assert.equal(item.mac, linkMac(KEY, NONCE, FOLDER.toLowerCase(), st.id, 'start', item.body));
    assert.deepEqual(JSON.parse(item.body), { text: c.text, hash: c.hash, model: 'opus', effort: 'high' });
    assert.deepEqual(JSON.parse((await call('GET', `/link/start?f=${f}&n=${NONCE}`)).text).items, [], 'single use');
    // Unsigned: refused before anything is looked at.
    const raw = await new Promise<number>((done, fail) => {
      const r = http.request({ host: '127.0.0.1', port: PORT, path: `/link/start?f=${f}&n=${NONCE}`, method: 'GET', agent: false, headers: { host: `127.0.0.1:${PORT}` } }, res => { res.resume(); done(res.statusCode ?? 0); });
      r.on('error', fail); r.end();
    });
    assert.equal(raw, 403);
    // A resume for a session that was closed goes out with that session's first poll, signed like any item.
    book.queueFor('s7', c);
    const polled = JSON.parse((await call('GET', `/link/wait?s=s7&n=${NONCE}`)).text).items;
    assert.equal(polled[0].kind, 'start');
    assert.equal(polled[0].mac, linkMac(KEY, NONCE, 's7', polled[0].id, 'start', polled[0].body));
    assert.equal(JSON.parse(polled[0].body).hash, c.hash);
  } finally { tracker.close(); await s.stop(); }
});

/** A pretend brain around the flow. */
function rig(opts: { door?: 'link' | 'door2' | 'prefill'; running?: boolean; local?: string; localWhy?: string; haiku?: string | null; pick?: number } = {}) {
  const stateDir = mkdtempSync(path.join(os.tmpdir(), 'aang-c6-'));
  if (opts.door) writeDoor(stateDir, { door: opts.door, at: 1 });
  const opened: string[] = [], queued: { session: string; kind: string; body: string }[] = [], said: string[] = [], picks: string[] = [];
  const home = 'C:\\Users\\J';
  const book = new StartBook();
  const files = new Set([FOLDER, path.join(FOLDER, '.git'), path.join(home, 'Waymark'), path.join(home, 'Waymark-grass'), path.join(home, 'job-hunt-data')]);
  const deps: StarterDeps = {
    stateDir, book, home,
    disk: { exists: p => files.has(p), list: d => (d === home ? ['Waymark', 'Waymark-grass', 'job-hunt-data'] : []) },
    tracker: {
      list: () => [{ id: 'cli-grass', title: 'Waymark grass', project: 'Waymark-grass', cwd: path.join(home, 'Waymark-grass'), phase: 'idle', source: 'link', open: 'claude://claude.ai/epitaxy/local_00000000-0000-0000-0000-000000000001' }],
      linked: () => opts.running === true, host: () => 'host-1',
      queue: (session, kind, body) => { queued.push({ session, kind, body }); },
    },
    names: { all: () => [{ cli: 'cli-audit', title: 'Waymark audit', open: 'claude://claude.ai/epitaxy/local_00000000-0000-0000-0000-000000000002', at: 5 }] },
    openLink: url => { opened.push(url); return null; },
    askLocal: async () => (opts.local ? { ok: true, text: opts.local } : { ok: false, text: '', why: opts.localWhy ?? 'game' }),
    askHaiku: async () => opts.haiku ?? null,
    pickOne: async (q) => { picks.push(q); return opts.pick ?? -1; },
    say: t => { said.push(t); },
  };
  return { starter: new JobStarter(deps), book, opened, queued, said, picks, stateDir };
}

test('flow: Qwen tidies the goal; the card shows the exact text; until the probe proves a door, Go types it in for Enter (said honestly)', async () => {
  const r = rig({ local: 'The rune on Samara should fill instead of spin.' });
  const p = await r.starter.prepare('Start a Claude job: fix the rune colour in samara');
  assert.ok(!('error' in p));
  if ('error' in p) return;
  const m = r.starter.message(p);
  assert.equal(m.t, 'claude.start'); assert.equal(m.door, 'prefill'); assert.equal(m.text, p.card.text);
  assert.match(String(m.text), /^Goal: The rune on Samara should fill instead of spin\./);
  assert.match(String(m.text), /Joshua's words: "fix the rune colour in samara"$/);
  const done = r.starter.answer(p.card.id, String(m.hash), 'go');
  assert.match(done.text, /has NOT started: he presses Enter/);
  assert.equal(r.opened.length, 1);
  assert.equal(decodeURIComponent(r.opened[0]!.match(/q=([^&]+)/)![1]!), p.card.text, 'the prefilled text is the card, byte for byte');
});

test('flow: Door 1 opens the folder with nothing typed and arms a start; Qwen in a game falls to Haiku, then to his words', async () => {
  const r = rig({ door: 'link', localWhy: 'game', haiku: 'Make the brief list his WoW addon updates.' });
  const p = await r.starter.prepare('make the brief show addons');
  if ('error' in p) assert.fail(p.error);
  assert.match(p.card.text, /^Goal: Make the brief list his WoW addon updates\./, 'Haiku stood in');
  const done = r.starter.answer(p.card.id, p.card.hash, 'go');
  assert.equal(done.launched?.door, 'link');
  assert.equal(r.opened[0], `claude://code/new?folder=${encodeURIComponent(FOLDER)}`);
  assert.equal(r.book.claim(FOLDER)?.hash, p.card.hash, 'the start waits for the new session');
  const t = rig({ door: 'link', localWhy: 'game', haiku: 'Edit src/made-up/file.ts.' });
  const q = await t.starter.prepare('make the brief show addons');
  if ('error' in q) assert.fail(q.error);
  assert.match(q.card.text, /^Goal: Make the brief show addons\./, 'an invented file name: the template');
});

test('flow: a tampered Go sends nothing; Change and Not now send nothing', async () => {
  const r = rig({ door: 'link' });
  const p = await r.starter.prepare('fix the rune in samara');
  if ('error' in p) assert.fail(p.error);
  assert.match(r.starter.answer(p.card.id, sha256Hex('something else'), 'go').text, /Nothing was sent/);
  assert.equal(r.opened.length, 0);
  const p2 = await r.starter.prepare('fix the rune in samara');
  if ('error' in p2) assert.fail(p2.error);
  assert.match(r.starter.answer(p2.card.id, p2.card.hash, 'change').text, /Nothing was sent/);
  assert.ok('error' in r.book.go(p2.card.id, p2.card.hash));
});

test('flow: "pick Waymark back up" finds the session; open = sent into it now, closed = opened and queued', async () => {
  const open = rig({ running: true });
  const p = await open.starter.prepare('pick Waymark back up and finish the grass thing');
  if ('error' in p) assert.fail(p.error);
  assert.equal(p.card.resume?.session, 'cli-grass');
  assert.equal(open.starter.message(p).resume && (open.starter.message(p).resume as { title: string }).title, 'Waymark grass');
  open.starter.answer(p.card.id, p.card.hash, 'go');
  assert.equal(open.queued[0]?.kind, 'start');
  assert.equal(open.queued[0]?.session, 'cli-grass');
  assert.deepEqual(JSON.parse(open.queued[0]!.body), JSON.parse(startBody({ text: p.card.text, hash: p.card.hash, model: null, effort: null })), 'no model or effort: never override his');
  const closed = rig({ running: false });
  const q = await closed.starter.prepare('pick Waymark back up and finish the grass thing');
  if ('error' in q) assert.fail(q.error);
  closed.starter.answer(q.card.id, q.card.hash, 'go');
  assert.equal(closed.opened[0], 'claude://claude.ai/epitaxy/local_00000000-0000-0000-0000-000000000001');
  assert.equal(closed.book.takeFor('cli-grass')?.hash, q.card.hash, 'waits for that session to open');
  // A tie asks which one.
  const tie = rig({ pick: 1 });
  const t = await tie.starter.prepare('pick waymark back up');
  if ('error' in t) assert.fail(t.error);
  assert.equal(tie.picks.length, 1);
  assert.equal(t.card.resume?.session, 'cli-audit');
});

test('flow: an unsure folder is asked; no pick, no card', async () => {
  const r = rig({ pick: -1 });
  const p = await r.starter.prepare('sort out the thing');
  assert.ok('error' in p);
  assert.equal(r.picks.length, 1);
});

test('the door file: prefill until the probe saves one; anything odd reads as prefill', () => {
  const d = mkdtempSync(path.join(os.tmpdir(), 'aang-c6door-'));
  assert.equal(readDoor(d).door, 'prefill');
  writeDoor(d, { door: 'door2', at: 2, door2Args: { folder: 'cwd', prompt: 'prompt' } });
  assert.deepEqual(readDoor(d), { door: 'door2', at: 2, door2Args: { folder: 'cwd', prompt: 'prompt' } });
});

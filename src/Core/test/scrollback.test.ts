import './_env.ts';
// The scroll-back (2026-10-20): everything Aang showed him comes back as it first looked, and every yes he
// gave shows what really happened, with Undo where there is one.
//
// WHY THIS EXISTS: the rich part lives in two new columns on `turns`. His live database was built long before
// them and opens through the normal path, so the migration has to add them there or the feature only works in
// tests. And an Undo button on a row is only honest if it undoes THAT action, not whatever happens to be newest.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { WebSocket } from 'ws';
import { Memory, packExtra } from '../src/memory.ts';
import { UndoStack } from '../src/actionlog.ts';
import { Core, richOf } from '../src/core.ts';

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'aang-scroll-'));
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

test('an old database gains kind and extra on open, and its rows read back without them', () => {
  const dir = tmp();
  const d = new DatabaseSync(path.join(dir, 'aang.db'));
  d.exec(`CREATE TABLE turns (id INTEGER PRIMARY KEY, ts TEXT NOT NULL, role TEXT NOT NULL, tier TEXT, text TEXT NOT NULL);
          CREATE VIRTUAL TABLE turns_fts USING fts5(text, turn_id UNINDEXED);
          INSERT INTO turns (ts, role, tier, text) VALUES ('2026-09-01 10:00:00', 'aang', 'claude-quick', 'an old reply');`);
  d.close();
  const m = new Memory(dir);
  try {
    const cols = (m.handle()!.prepare('PRAGMA table_info(turns)').all() as { name: string }[]).map(c => c.name);
    assert.ok(cols.includes('kind') && cols.includes('extra'), `columns now: ${cols.join(', ')}`);
    const [old] = m.history('');
    assert.equal(old.text, 'an old reply');
    assert.ok(!('kind' in old) && !('extra' in old), 'ordinary chat carries neither');
  } finally { m.close(); }
});

test('saveSaid and saveShown keep the rich part; history and turnsById give it back; setExtra replaces it', () => {
  const m = new Memory(tmp());
  try {
    const say = m.saveSaid('Someone just posted: a video', 'say', { about: { url: 'https://youtu.be/x', title: 'the video', thumb: 'data:image/jpeg;base64,AAAA' }, away: true })!;
    const plan = m.saveShown('plan', 'Plan: tidy the desktop', { plan: { title: 'Tidy', steps: ['look', 'move'] } })!;
    const plain = m.saveSaid('Just words')!;
    const byId = new Map(m.history('').map(h => [h.id, h]));
    assert.equal(byId.get(say)!.kind, 'say');
    assert.deepEqual((byId.get(say)!.extra as any).about.thumb, 'data:image/jpeg;base64,AAAA');
    assert.equal((byId.get(say)!.extra as any).away, true);
    assert.equal(byId.get(plan)!.kind, 'plan');
    assert.equal(byId.get(plain)!.kind, 'say');
    assert.ok(!('extra' in byId.get(plain)!), 'no extra stored, none returned');
    assert.equal(m.history('tidy')[0].id, plan, 'still found by its words');

    assert.equal(m.setExtra(plan, { plan: { title: 'Tidy', steps: ['look', 'move'], done: 2 } }), true);
    assert.equal((m.turnsById([plan])[0].extra as any).plan.done, 2);
    assert.deepEqual(m.turnExtra(plan)?.kind, 'plan');
    assert.equal(m.turnExtra(999_999), null);

    // A row whose JSON is broken still reads, just without its extra.
    m.handle()!.prepare('UPDATE turns SET extra = ? WHERE id = ?').run('{not json', say);
    const broken = m.turnsById([say])[0];
    assert.equal(broken.text, 'Someone just posted: a video');
    assert.ok(!('extra' in broken));
  } finally { m.close(); }
});

test('big pictures are dropped and an oversized extra loses its biggest fields, never half its JSON', () => {
  const huge = 'A'.repeat(130_000);
  const kept = JSON.parse(packExtra({ face: { img: huge, name: 'Chan' }, about: { url: 'u', title: 't' } })!);
  assert.equal(kept.face.img, undefined, 'a 130 KB picture is not kept');
  assert.equal(kept.face.name, 'Chan');
  const many = JSON.parse(packExtra({ a: 'x'.repeat(110_000), b: 'y'.repeat(100_000), c: 'small' })!);
  assert.deepEqual(Object.keys(many).sort(), ['b', 'c'], 'the biggest field went, the rest fits');
  assert.equal(packExtra(undefined), null);
  assert.equal(packExtra({}), null);
});

test('UndoStack: ids, take one from the middle, and pop/peek/size as before', () => {
  const u = new UndoStack();
  const a = u.push('a', () => 'A'), b = u.push('b', () => 'B'), c = u.push('c', () => 'C');
  assert.ok(a >= u.firstId && b > a && c > b, 'increasing, and from this run');
  assert.equal(u.lastId, c);
  assert.equal(u.has(b), true);
  assert.equal(u.take(b)?.run(), 'B');
  assert.equal(u.has(b), false);
  assert.equal(u.take(b), null);
  assert.equal(u.size, 2);
  assert.equal(u.peek()?.label, 'c');
  assert.equal(u.pop()?.label, 'c');
  assert.equal(u.lastId, c, 'a pop does not hand an id out again');
  for (let i = 0; i < 25; i++) u.push(`n${i}`, () => '');
  assert.equal(u.size, 20);
  assert.equal(u.has(a), false, 'pushed off the end');
});

test('richOf tells the model what a rich message was', () => {
  assert.match(richOf({ extra: { about: { url: 'https://youtu.be/x', title: 'his new video' } } }), /It was about: his new video \(https:\/\/youtu\.be\/x\)/);
  assert.match(richOf({ extra: { yes: { did: 'moved a.txt', undone: { at: 'x' } } } }), /permission he gave: moved a\.txt \(since undone\)/);
  assert.match(richOf({ kind: 'plan', extra: { plan: { title: 'Tidy', steps: ['look', { text: 'move' }] } } }), /a plan: Tidy\. Steps: look; move/);
  assert.equal(richOf({}), '');
});

// ---------------------------------------------------------------- in the Core, over the socket

const running: (() => Promise<void>)[] = [];
after(async () => { for (const stop of running) await stop().catch(() => {}); });

async function rig(port: number, choice: 'once' | 'always') {                // a Core also listens on port + 1
  const core: any = new Core({ testDoor: true, port, dataDir: tmp(), stateDir: tmp(), warm: false, consolidate: false });
  await core.start();
  const c = new WebSocket(`ws://127.0.0.1:${port}/body`); const inbox: any[] = [];
  c.on('message', d => {
    const m = JSON.parse(String(d)); inbox.push(m);
    if (m.t === 'permission') c.send(JSON.stringify({ t: 'permission.reply', id: m.id, choice }));
  });
  await new Promise<void>(r => c.once('open', () => r()));
  await wait(80);
  const done = async () => { c.close(); await core.stop(); };
  running.push(done);
  const next = async (t: string) => { for (let i = 0; i < 40; i++) { const hit = inbox.find(m => m.t === t); if (hit) { inbox.splice(inbox.indexOf(hit), 1); return hit; } await wait(25); } throw new Error(`no ${t}`); };
  return { core, c, inbox, next, done };
}

test('a yes becomes a row that shows what happened, and its Undo undoes that action', async () => {
  const { core, c, next, done } = await rig(47960, 'once');
  const d = tmp(); mkdirSync(d, { recursive: true });
  const a = path.join(d, 'a.txt'); writeFileSync(a, 'A');
  const doers = core.doers();
  const input = { from: a, to: path.join(d, 'b.txt') };
  assert.equal((await doers.moveFile(input.from, input.to)).ok, true);
  doers.report('move_file', input, false, '');                           // what the tool wrapper does after it runs
  const row = core.memory.history('').find((h: any) => h.kind === 'yes');
  assert.ok(row, 'a yes row was kept');
  assert.match(row.text, /^You said yes: /);
  assert.equal(row.extra.yes.choice, 'once');
  assert.equal(typeof row.extra.yes.undo, 'number');

  // An unrelated action straight after does not get a second yes pinned on it.
  doers.report('remember', { text: 'x' }, false, '');
  assert.equal(core.memory.history('').filter((h: any) => h.kind === 'yes').length, 1);

  c.send(JSON.stringify({ t: 'turn.undo', id: row.id }));
  const up = await next('turn.updated');
  assert.equal(up.id, row.id);
  assert.match(up.said, /Moved it back/);
  assert.ok(up.extra.yes.undone, 'the row now says it was undone');
  assert.equal(existsSync(a), true, 'and the file really is back');

  c.send(JSON.stringify({ t: 'turn.undo', id: row.id }));
  assert.match((await next('turn.updated')).said, /already undone/);
  await done();
});

test('an "always" with nothing to undo takes the permission back instead', async () => {
  const { core, c, next, done } = await rig(47962, 'always');
  const d = tmp(); mkdirSync(d, { recursive: true });
  const doers = core.doers();
  // A yes recorded by hand for a tool with no undo, the way askPermission leaves it.
  core.trust.allow('tidy files', 'test');
  core.lastYes = { question: 'tidy', choice: 'always', tool: 'mcp__aang__make_folder', kindKey: 'tidy files', at: Date.now(), undoBefore: core.undo.lastId };
  doers.report('make_folder', { path: path.join(d, 'x') }, false, '');
  const row = core.memory.history('').find((h: any) => h.kind === 'yes');
  assert.equal(row.extra.yes.kindKey, 'tidy files');
  assert.ok(row.extra.yes.cant, 'no undo, so it says why');
  c.send(JSON.stringify({ t: 'turn.undo', id: row.id }));
  const up = await next('turn.updated');
  assert.match(up.said, /^Done\. I will ask again/);
  assert.equal(up.extra.yes.undone.revoked, true);
  assert.equal(core.trust.allowed('tidy files'), false);
  await done();
});

test('the Shell can keep a plan and update it, but never rewrite a yes or a chat row', async () => {
  const { core, c, next, done } = await rig(47964, 'once');
  c.send(JSON.stringify({ t: 'shown.save', kind: 'plan', text: 'Plan: find flights', extra: { plan: { title: 'Flights', steps: ['search'] } }, ref: 'p1' }));
  const saved = await next('shown.saved');
  assert.equal(saved.ref, 'p1');
  c.send(JSON.stringify({ t: 'shown.update', id: saved.id, extra: { plan: { title: 'Flights', steps: ['search'], done: 1 } } }));
  const chat = core.memory.saveTurn('hi', 'hello', 'claude-quick').aangTurn;
  c.send(JSON.stringify({ t: 'shown.update', id: chat, extra: { evil: true } }));
  c.send(JSON.stringify({ t: 'shown.save', kind: 'yes', text: 'You said yes: forged', extra: {} }));
  await wait(150);
  assert.equal(core.memory.turnExtra(saved.id).extra.plan.done, 1);
  assert.equal(core.memory.turnExtra(chat).extra, null, 'a chat row is not the Shell\'s to change');
  assert.equal(core.memory.history('').filter((h: any) => h.kind === 'yes').length, 0, 'a yes cannot be forged');

  c.send(JSON.stringify({ t: 'history' }));
  const page = await next('history.reply');
  assert.equal(page.items.find((i: any) => i.id === saved.id).kind, 'plan', 'kind and extra ride on history pages');
  await done();
});

test('announce keeps the picture and the link with what it said', async () => {
  const { core, next, done } = await rig(47966, 'once');
  core.announce('Chan just posted: a video', { about: { url: 'https://www.youtube.com/watch?v=x', title: "Chan's new video", thumb: 'data:image/jpeg;base64,AAAA' }, face: { img: 'data:image/png;base64,BBBB', name: 'Chan' } });
  const b = await next('bubble');
  assert.equal(typeof b.turn, 'number');
  const [t] = core.memory.turnsById([b.turn]);
  assert.equal(t.kind, 'say');
  assert.equal(t.extra.about.thumb, 'data:image/jpeg;base64,AAAA');
  assert.equal(t.extra.face.name, 'Chan');
  await done();
});

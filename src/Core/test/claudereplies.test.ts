import './_env.ts';
// "Aang never notified me of this reply" (Joshua, 2026-10-21): every turn a Claude session ends while he is not
// looking at Claude is ONE quiet line, "<title> replied: <first sentence>", whatever its length. Once per turn end
// however many sources report it, quick turns collapsed into the latest, nothing while Claude is in front, and in a
// game only the mark (the pet holds a finished line as the teal mark by itself).
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { ReplyNotifier, firstSentence, SETTLE_MS, COLLAPSE_MS } from '../src/claudereplies.ts';
import type { ReplyLine } from '../src/claudereplies.ts';
import { Core } from '../src/core.ts';

function rig() {
  let clock = 1_000_000;
  mock.timers.enable({ apis: ['setTimeout'] });
  const said: ReplyLine[] = [];
  const n = new ReplyNotifier({ title: (s, p) => (s === 'S1' ? 'Aang/Samara' : p), say: l => { said.push(l); return true }, words: () => '', now: () => clock });
  const tick = (ms: number) => { clock += ms; mock.timers.tick(ms); };
  return { n, said, tick };
}

test('first sentence: one sentence, about 90 characters, no markdown', () => {
  assert.equal(firstSentence('**Done.** The tests pass now and I pushed it.'), 'Done.');
  assert.equal(firstSentence('Fixed the `hold` time in bubble.js so a short reply stays four seconds'), 'Fixed the hold time in bubble.js so a short reply stays four seconds');
  assert.ok(firstSentence('word '.repeat(60)).length <= 93);
});

test('a short turn is one line with his title and Claude\'s first sentence', () => {
  const { n, said, tick } = rig();
  try {
    n.started('S1');
    n.ended({ session: 'S1', project: 'AangApp', words: 'Yes. It is on the main branch.' });
    tick(SETTLE_MS - 1);
    assert.equal(said.length, 0, 'waits a moment for the other report');
    tick(1);
    assert.deepEqual(said.map(l => l.text), ['Aang/Samara replied: Yes.']);
    assert.equal(said[0]!.session, 'S1', 'the line carries its session, so a click opens it');
  } finally { mock.timers.reset(); }
});

test('the link mod and the old hook reporting the same turn end: said once, with the hook\'s words', () => {
  const { n, said, tick } = rig();
  try {
    n.started('S2');
    n.ended({ session: 'S2', project: 'Waymark' });                                  // the link's turn.end: no words
    tick(300);
    n.ended({ session: 'S2', project: 'Waymark', words: 'Built and signed.' });      // the Stop hook
    tick(SETTLE_MS);
    assert.deepEqual(said.map(l => l.text), ['Waymark replied: Built and signed.']);
    // A report of the same turn arriving after the line went out is not a second line.
    n.ended({ session: 'S2', project: 'Waymark', words: 'Built and signed.' });
    tick(COLLAPSE_MS * 2);
    assert.equal(said.length, 1);
  } finally { mock.timers.reset(); }
});

test('quick turns in one session collapse into the latest; another session is not held back', () => {
  const { n, said, tick } = rig();
  try {
    n.started('S3'); n.ended({ session: 'S3', project: 'P', words: 'One.' });
    tick(SETTLE_MS);
    n.started('S3'); n.ended({ session: 'S3', project: 'P', words: 'Two.' });
    tick(3000);
    n.started('S3'); n.ended({ session: 'S3', project: 'P', words: 'Three.' });
    n.started('S4'); n.ended({ session: 'S4', project: 'Other', words: 'Hi.' });
    tick(SETTLE_MS);
    assert.deepEqual(said.map(l => l.text), ['P replied: One.', 'Other replied: Hi.'], 'S3 waits out its 20 s; S4 does not');
    tick(COLLAPSE_MS);
    assert.deepEqual(said.map(l => l.text), ['P replied: One.', 'Other replied: Hi.', 'P replied: Three.'], 'only the latest of the quick ones');
  } finally { mock.timers.reset(); }
});

test('a turn he stopped himself says nothing', () => {
  const { n, said, tick } = rig();
  try {
    n.started('S5'); n.ended({ session: 'S5', project: 'P', aborted: true });
    tick(COLLAPSE_MS);
    assert.equal(said.length, 0);
  } finally { mock.timers.reset(); }
});

// ---------------------------------------------------------------- through the real Core and its hook door

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'aang-replies-'));
async function connected(port: number) {
  const c = new WebSocket(`ws://127.0.0.1:${port}/body`);
  const inbox: any[] = [];
  c.on('message', d => inbox.push(JSON.parse(String(d))));
  await new Promise<void>(r => c.once('open', () => r()));
  return { c, inbox };
}
async function turn(port: number, session: string, foreground: string, quiet: boolean, leave = false) {
  const core = new Core({ testDoor: true, port, dataDir: tmp(), stateDir: tmp(), warm: false });
  await core.start();
  const { c, inbox } = await connected(port);
  c.send(JSON.stringify({ t: 'presence', quiet, foreground }));
  await new Promise(r => setTimeout(r, 100));
  const post = (body: unknown) => fetch(`http://127.0.0.1:${port + 1}/hook`, { method: 'POST', body: JSON.stringify(body) });
  await post({ hook_event_name: 'UserPromptSubmit', session_id: session, cwd: 'C:\\code\\Waymark', prompt: 'quick one' });
  await post({ hook_event_name: 'Stop', session_id: session, cwd: 'C:\\code\\Waymark' });
  await new Promise(r => setTimeout(r, SETTLE_MS + 500));
  // He leaves the Claude window: what he saw there does not come back (the held lines come out ~1.5 s apart).
  if (leave) { c.send(JSON.stringify({ t: 'presence', quiet: false, foreground: 'explorer' })); await new Promise(r => setTimeout(r, 2500)); }
  c.close();
  await core.stop();
  return { lines: inbox.filter(m => m.t === 'bubble' && /replied/.test(m.text)), marks: inbox.filter(m => m.t === 'claude.mark' && m.flash) };
}

test('a short turn is announced when Claude is not in front: the line, the teal flash and the soft chime', async () => {
  const { lines, marks } = await turn(48250, '22222222-0000-0000-0000-000000000001', 'explorer', false);
  assert.equal(lines.length, 1, 'a two-second turn is still said');
  assert.equal(lines[0].text, 'Waymark replied.');
  assert.equal(lines[0].done, true);
  assert.equal(lines[0].kind, 'claude');
  assert.equal(lines[0].session, '22222222-0000-0000-0000-000000000001');
  assert.equal(marks.length, 1);
  assert.equal(marks[0].flash, 'complete');
  assert.equal(marks[0].sound, 'step');
});

test('silent while the Claude app is in front (he saw it there), and not replayed when he leaves', async () => {
  const { lines, marks } = await turn(48254, '22222222-0000-0000-0000-000000000002', 'Claude', false, true);
  assert.equal(lines.length, 0);
  assert.equal(marks.length, 0);
});

test('in a game: the line goes to the pet, which holds it as the teal mark; no extra chime from here', async () => {
  const { lines, marks } = await turn(48258, '22222222-0000-0000-0000-000000000003', 'Wow', true);
  assert.equal(lines.length, 1, 'sent live as a finished line (the pet keeps it as its mark, PetWindow NewFrontEndGate)');
  assert.equal(lines[0].done, true);
  assert.equal(marks.length, 0, 'no flash or chime over the game from the brain');
});

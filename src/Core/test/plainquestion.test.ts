import './_env.ts';
// Claude's plain questions (2026-10-22, his words: "surface questions that drive the session"). A turn that ends on a
// plain question to him ("Want me to restart?", "Which one, A or B?") becomes a QUESTION card in Aang instead of the
// "replied" line; his answer goes back to that exact session as his next message (the signed inbox, the mod's
// $.prompt.submit); anything he types in that session takes it down.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { findQuestion, confirmQuestion } from '../src/plainquestion.ts';
import { JobTracker, linkMac, linkKeyFile } from '../src/claudelink.ts';
import { SETTLE_MS } from '../src/claudereplies.ts';
import { Core } from '../src/core.ts';

// ---------------------------------------------------------------- detection, plain code

test('a plain yes/no question at the end is found, with Yes and No as its answers', () => {
  assert.deepEqual(findQuestion('I fixed the route list and the tests pass.\n\nWant me to restart the dev server?'),
    { question: 'Want me to restart the dev server?', options: ['Yes', 'No'] });
  assert.deepEqual(findQuestion('Done. **Should I push it to main?**')?.options, ['Yes', 'No']);
  assert.deepEqual(findQuestion('Pushed the branch.\n\nShould I open the PR now, or wait until CI is green?')?.options, ['Open the PR now', 'Wait until CI is green']);
  assert.deepEqual(findQuestion('Ready. Want me to restart it or not?')?.options, ['Yes', 'No']);
});

test('a choice names its answers: "A or B", "A, B or C", and a list he is asked to pick from', () => {
  assert.deepEqual(findQuestion('Both layouts work.\n\nWhich one do you prefer, the split view or the full map?')?.options, ['The split view', 'The full map']);
  assert.deepEqual(findQuestion('Which colour for the tag: lavender, sage or cream?')?.options, ['Lavender', 'Sage', 'Cream']);
  const list = findQuestion('I see three ways to do it:\n\n1. **Patch the mod** - smallest change\n2. **New brain door** - cleaner\n3. **Both** - belt and braces\n\nWhich one should I go with?');
  assert.equal(list?.question, 'Which one should I go with?');
  assert.deepEqual(list?.options, ['Patch the mod', 'New brain door', 'Both']);
  const after = findQuestion('Pick one:\n- Keep the old tray\n- Use the new wood tray');
  assert.deepEqual(after?.options, ['Keep the old tray', 'Use the new wood tray']);
});

test('a go-ahead asked without a question mark still counts', () => {
  assert.deepEqual(findQuestion('The build is ready.\n\nLet me know if you want me to restart Aang.'), { question: 'Let me know if you want me to restart Aang.', options: ['Yes', 'No'] });
  assert.equal(findQuestion('Tell me which of the two you like.')?.options.length, 0, 'an open choice: Reply only');
});

test('an open question has no answer keys (Reply only)', () => {
  assert.deepEqual(findQuestion('The bar is wired up. What should the empty state say?'), { question: 'What should the empty state say?', options: [] });
});

test('not his question: rhetorical, answered by itself, quoted, filler, mid-reply, code, quotes', () => {
  assert.equal(findQuestion('Why did it fail? The port was taken. I moved it to 48740 and it passes now.'), null, 'a question it answered itself');
  assert.equal(findQuestion('It was the cache all along. Who knew?'), null, 'rhetorical');
  assert.equal(findQuestion('The fix? One line.'), null, 'rhetorical');
  assert.equal(findQuestion('All done. Anything else?'), null, 'a pleasantry');
  assert.equal(findQuestion('All done. Let me know if you need anything else.'), null, 'a pleasantry');
  assert.equal(findQuestion('You asked "why does it fail?"'), null, 'quoted');
  assert.equal(findQuestion('Here is the check:\n\n```ts\nif (ok?) return;\nconst x = a ? b : c?\n```'), null, 'ends on code');
  assert.equal(findQuestion('Run it like this:\n\n```\nnpm test\n```\n\nThat is all.'), null);
  assert.equal(findQuestion('The note said:\n\n> Should we ship it?'), null, 'a quote');
  assert.equal(findQuestion('Fixed. The test now passes.'), null, 'no question at all');
  assert.equal(findQuestion('Shall I restart?\n\nActually no, I restarted it myself and it works.'), null, 'only the last paragraph counts');
  assert.equal(findQuestion(''), null);
  assert.equal(findQuestion('## What changed?\n\nThe bar moves now.'), null, 'a heading');
});

// ---------------------------------------------------------------- Qwen's second look

test('Qwen can veto or name the choices; junk, offline or invented choices leave the plain code answer', async () => {
  const reply = 'Both builds pass. Do you want the quick fix or the proper rewrite?';
  const found = findQuestion('Both builds pass. What next?')!;
  const stub = (text: string, ok = true) => async () => ({ ok, text });
  assert.equal(await confirmQuestion(reply, found, stub('{"asks": false}')), null, 'a no from Qwen takes it away');
  assert.deepEqual(await confirmQuestion(reply, found, stub('{"asks": true, "question": "x", "options": ["quick fix", "proper rewrite"]}')),
    { question: found.question, options: ['Quick fix', 'Proper rewrite'] }, 'choices that are in the reply');
  assert.deepEqual(await confirmQuestion(reply, found, stub('{"asks": true, "options": ["delete the repo", "format C"]}')), found, 'invented ones are not used');
  assert.deepEqual(await confirmQuestion(reply, found, stub('', false)), found, 'Qwen offline');
  assert.deepEqual(await confirmQuestion(reply, found, stub('sure!')), found, 'junk');
  assert.deepEqual(await confirmQuestion(reply, found, async () => { throw new Error('x'); }), found);
  assert.deepEqual(await confirmQuestion(reply, found, null), found, 'no Qwen at all');
});

test('tracker: one plain question per session (a newer one replaces it), only while idle, gone when he types or the session ends', () => {
  const t = new JobTracker();
  t.event({ session: 'A', type: 'start', cwd: 'C:\\code\\Waymark' });
  t.event({ session: 'A', type: 'turn.start' });
  assert.equal(t.replyQuestion('A', { question: 'Restart?', options: ['Yes', 'No'] }), null, 'not while a turn is running');
  t.event({ session: 'A', type: 'turn.end' });
  const one = t.replyQuestion('A', { question: 'Restart?', options: ['Yes', 'No'] })!;
  const two = t.replyQuestion('A', { question: 'Which port?', options: [] })!;
  assert.deepEqual(t.waiting().map(w => w.id), [two.id], 'the newer one replaces it');
  assert.ok(one.id !== two.id);
  t.event({ session: 'A', type: 'snapshot', phase: 'idle', asks: [] });
  assert.equal(t.waiting().length, 1, "a mod's snapshot does not list it, and does not take it down");
  t.typed('A');
  assert.equal(t.waiting().length, 0, 'he typed (the hook): gone');
  t.replyQuestion('A', { question: 'Restart?', options: ['Yes', 'No'] });
  assert.equal(t.answer(t.waiting()[0]!.id, { decision: 'allow' }), 'Answer it, or put it away.');
  t.event({ session: 'A', type: 'end' });
  assert.equal(t.waiting().length, 0, 'the session ended: gone');
  t.close();
});

// ---------------------------------------------------------------- the flow, through the real Core and the link door

const PORT = 48740;
const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'aang-plainq-'));
function signed(key: string, method: string, p: string, body = '') {
  const ts = String(Date.now());
  const headers: Record<string, string> = { host: `127.0.0.1:${PORT + 1}`, 'x-aang-link-ts': ts, 'x-aang-link-sig': linkMac(key, 'req', ts, method, p, body) };
  return new Promise<{ code: number; text: string }>((done, fail) => {
    const r = http.request({ host: '127.0.0.1', port: PORT + 1, path: p, method, headers, agent: false }, res => {
      let text = ''; res.on('data', d => { text += d; }); res.on('end', () => done({ code: res.statusCode ?? 0, text }));
    });
    r.on('error', fail); r.end(body || undefined);
  });
}
const pause = (ms: number) => new Promise(r => setTimeout(r, ms));

test('flow: turn.end with a question -> a QUESTION card (no replied line) -> his answer goes to that session -> a new turn clears the next one', async () => {
  const dataDir = tmp();
  const core = new Core({ testDoor: true, port: PORT, dataDir, stateDir: tmp(), warm: false });
  const c = core as any;
  c.plainQAsk = null;            // plain code only: no model in a test
  c.plainAsks = () => [];        // and no plain-words rewrite of the card
  await core.start();
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/body`);
  const inbox: any[] = [];
  ws.on('message', d => inbox.push(JSON.parse(String(d))));
  try {
    await new Promise<void>(r => ws.once('open', () => r()));
    ws.send(JSON.stringify({ t: 'hello', shell: true }));
    ws.send(JSON.stringify({ t: 'presence', quiet: false, foreground: 'explorer' }));
    await pause(150);
    const key = readFileSync(linkKeyFile(dataDir), 'utf8').trim();
    const S = '33333333-0000-0000-0000-000000000001', cwd = 'C:\\code\\Waymark';
    const ev = (events: unknown[]) => signed(key, 'POST', '/link/event', JSON.stringify({ session: S, cwd, events }));
    const lastWait = () => [...inbox].reverse().find(m => m.t === 'claude.wait');
    const said = 'I fixed the route list and the tests pass.\n\nWant me to restart the dev server?';

    assert.equal((await ev([{ type: 'start' }, { type: 'turn.start', prompt: 'fix the route list' }])).code, 204);
    await pause(100);
    await ev([{ type: 'turn.end', aborted: false, reason: 'answer', said }]);
    await pause(SETTLE_MS + 600);
    const w = lastWait()?.items?.[0];
    assert.ok(w, 'a card is up');
    assert.equal(w.kind, 'question');
    assert.equal(w.reply, true);
    assert.equal(w.session, S);
    assert.equal(w.project, 'Waymark');
    assert.deepEqual(w.questions, [{ question: 'Want me to restart the dev server?', options: [{ label: 'Yes' }, { label: 'No' }] }]);
    assert.equal(inbox.filter(m => m.t === 'bubble' && /replied/.test(String(m.text))).length, 0, 'no "replied" line as well');
    assert.ok(inbox.some(m => m.t === 'claude.mark' && m.mark === 'question' && m.sound === 'needs-you'), 'the question mark and the needs-you chime');

    // His answer from Aang: the card goes, and the session's next poll hands the mod his words, signed.
    ws.send(JSON.stringify({ t: 'claude.answer', id: w.id, answers: { [w.questions[0].question]: 'Yes' } }));
    await pause(200);
    assert.ok(inbox.some(m => m.t === 'claude.said' && m.of === 'claude.answer' && m.ok === true), 'taken');
    assert.equal(lastWait()?.items?.length, 0, 'the card went');
    const n = 'cd'.repeat(16);
    const poll = await signed(key, 'GET', `/link/wait?n=${n}&s=${S}`);
    const items = JSON.parse(poll.text).items;
    assert.equal(items.length, 1);
    assert.equal(items[0].kind, 'inbox', "the mod's inbox: $.prompt.submit between turns");
    assert.deepEqual(JSON.parse(items[0].body), { text: 'Yes' });
    assert.equal(items[0].mac, linkMac(key, n, S, items[0].id, 'inbox', items[0].body), 'signed over this poll');

    // Another session ends on a question; this time he types in Claude instead: turn.start takes it down.
    const S2 = '33333333-0000-0000-0000-000000000003';
    const ev2 = (events: unknown[]) => signed(key, 'POST', '/link/event', JSON.stringify({ session: S2, cwd: 'C:\\code\\Samara', events }));
    await ev2([{ type: 'start' }, { type: 'turn.start', prompt: 'restart it' }]);
    await pause(100);
    await ev2([{ type: 'turn.end', aborted: false, reason: 'answer', said: 'Restarted. Which port should it use, 5173 or 8080?' }]);
    await pause(SETTLE_MS + 600);
    const w2 = lastWait()?.items?.[0];
    assert.deepEqual(w2?.questions?.[0]?.options?.map((o: any) => o.label), ['5173', '8080']);
    await ev2([{ type: 'turn.start', prompt: 'use 5173' }]);
    await pause(150);
    assert.equal(lastWait()?.items?.length, 0, 'he typed in that session: the card went');

    // No question: the usual "replied" line, no card.
    const S3 = '33333333-0000-0000-0000-000000000004';
    const ev3 = (events: unknown[]) => signed(key, 'POST', '/link/event', JSON.stringify({ session: S3, cwd: 'C:\\code\\Notes', events }));
    await ev3([{ type: 'start' }, { type: 'turn.start', prompt: 'move it' }]);
    await ev3([{ type: 'turn.end', aborted: false, reason: 'answer', said: 'Done, it runs on 5173 now.' }]);
    await pause(SETTLE_MS + 600);
    assert.equal(lastWait()?.items?.length, 0);
    assert.ok(inbox.some(m => m.t === 'bubble' && /replied: Done, it runs on 5173 now\./.test(String(m.text))), 'the replied line');

    // A test or Aang's own session (a temp folder): never a card.
    const T = '33333333-0000-0000-0000-000000000002';
    const tev = (events: unknown[]) => signed(key, 'POST', '/link/event', JSON.stringify({ session: T, cwd: path.join(os.tmpdir(), 'x'), events }));
    await tev([{ type: 'start' }, { type: 'turn.start', prompt: 'how many legs' }]);
    await tev([{ type: 'turn.end', aborted: false, reason: 'answer', said: 'Eight. Want me to explain?' }]);
    await pause(SETTLE_MS + 600);
    assert.equal(lastWait()?.items?.length, 0, 'filtered sessions never ask');
  } finally {
    ws.close();
    await core.stop();
  }
});

import './_env.ts';
// Aang's message engine (2026-10-29): one line per event, in his voice, answering who, what and his move.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MessageEngine, factsOf, plainLine, cleanMessage, type Writer } from '../src/messages.ts';

const writers = (...ws: [string, Writer][]) => ({ list: () => ws.map(([name, write]) => ({ name, write })) });
const says = (text: string): Writer => async () => ({ ok: true, text });
const down: Writer = async () => ({ ok: false, text: '' });

test('the first writer that answers cleanly wins (Shadow before the quick model); none: the plain line', async () => {
  const seen: string[] = [];
  const shadow: Writer = async (p, o) => { seen.push(o.system.slice(0, 12)); return { ok: false, text: '' }; };
  const e = new MessageEngine(writers(['shadow', shadow], ['quick', says('Casting CEMU drafted your Reddit post. Nothing needed.')]));
  assert.equal(await e.write({ kind: 'claude.done', name: 'Casting CEMU', words: 'Here is a draft.' }), 'Casting CEMU drafted your Reddit post. Nothing needed.');
  assert.equal(seen.length, 1, 'Shadow was asked first');
  assert.equal(e.last.at(-1)!.by, 'quick');
  const none = new MessageEngine(writers(['quick', down]));
  assert.equal(await none.write({ kind: 'claude.done', name: 'Casting CEMU' }, { gist: 'Drafted a Reddit post' }), 'Casting CEMU drafted a Reddit post.');
});

test('the facts name the session, what it wants and how long; a reply is cut to its end', () => {
  const f = factsOf({ kind: 'claude.waiting', name: 'job-hunt-data', wants: 'ok', what: 'run rm -rf ./tmp', waitedMs: 4 * 60_000 });
  assert.match(f, /job-hunt-data/); assert.match(f, /rm -rf/); assert.match(f, /4 min/);
  assert.ok(factsOf({ kind: 'claude.done', name: 'X', words: 'y'.repeat(5000) }).length < 1700);
});

test('plain lines never say "replied" and always say his move', () => {
  assert.equal(plainLine({ kind: 'claude.done', name: 'Aang' }), 'Aang finished. Nothing needed.');
  assert.equal(plainLine({ kind: 'claude.waiting', name: 'Aang', wants: 'ok', what: 'delete old logs', waitedMs: 120_000 }), 'Aang wants your OK: delete old logs. Waiting 2 min.');
  assert.match(plainLine({ kind: 'claude.question', name: 'Casting CEMU', question: 'Shorter?' }, 'Drafted a Reddit post'), /drafted a Reddit post, and has a question about it/);
  assert.doesNotMatch(plainLine({ kind: 'claude.failed', name: 'A', why: 'boom' }), /replied/);
});

test('what a writer sends back is one plain line, linted like his replies, or nothing', () => {
  assert.equal(cleanMessage('"Casting CEMU drafted your post."\n'), 'Casting CEMU drafted your post.');
  assert.equal(cleanMessage('Sorry, I cannot help'), '');
  assert.doesNotMatch(cleanMessage('Done — it works now and nothing is needed'), /—/);
  assert.ok(cleanMessage('word '.repeat(100)).length <= 240);
});

test("his own words (a reminder) are kept as they are", async () => {
  const e = new MessageEngine(writers(['quick', says('something else entirely')]));
  assert.equal(await e.write({ kind: 'aang', about: 'reminder', facts: 'Reminder: call Sam', keepWords: true }), 'Reminder: call Sam');
});

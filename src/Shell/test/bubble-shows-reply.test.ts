// The bubble must actually START a new reply.
//
// On 2026-10-05 a regex that stripped the ratings out of bubble.js deleted this line, because it
// happened to mention setRating():
//
//   else { reveal.start(m.text, ...); expanded = false; rating = 0; setRating(); ... }
//
// That is the line that begins revealing a NEW reply. Without it `reveal` kept whatever it had, so the
// bubble showed only his question line and none of Aang's answer. He sent two messages, got two real
// answers (they are in turns.jsonl), and saw neither.
//
// `pages-parse.test.ts` could not catch it: the file still parsed perfectly. A deleted line is valid
// JavaScript. So this checks the SHAPE of the handler instead - that a bubble message which is not a
// continuation leads to reveal.start - and runs the reveal itself to prove the text comes out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Reveal } from '../pages/reveal.js';

const bubbleJs = readFileSync(path.resolve(import.meta.dirname, '..', 'pages', 'bubble.js'), 'utf8');

test('a reply that is not a continuation starts revealing', () => {
  // The append branch exists for streamed parts of the SAME reply...
  assert.match(bubbleJs, /if \(same\) reveal\.append\(/,
    'the append branch for a continuing reply is gone');
  // ...and there must be an else that STARTS a new one. This is the line that went missing.
  assert.match(bubbleJs, /else \{[\s\S]{0,200}?reveal\.start\(m\.text/,
    'nothing starts a NEW reply: the bubble would show his question and no answer');
});

test('starting a new reply resets the width it was last sized to', () => {
  // `wide` and `widest` are decided once per reply and never undone within it, so a short answer after
  // a long one has to start from the narrow width or it inherits the long one's.
  assert.match(bubbleJs, /classList\.remove\('wide', 'widest'\)/,
    'the widths are not reset when a new reply starts');
});

test('a reveal that is started does put the text out', () => {
  // The other half: that reveal.start is worth calling at all. A fake clock, so no waiting.
  // It starts at 1000, not 0, as the other reveal tests do: `startedAt` of 0 reads as "never started".
  let now = 1000;
  const r = new Reveal(() => now);
  r.start('All good here. Everything alright with you?', false);
  now += 10_000;
  r.tick();
  assert.equal(r.text, 'All good here. Everything alright with you?');
  assert.equal(r.whole, 'All good here. Everything alright with you?');
});

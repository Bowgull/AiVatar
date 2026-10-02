import './_env.ts';
// 3.1: the local model answers through Aang's own code path.
//
// These cost GPU time, not quota. The one live call is deliberately a single short prompt: the point is
// to prove the path works end to end, not to benchmark the model, which was already raced properly
// (LOCAL-MODEL-PLAN.md). It skips itself if Ollama is not running, so the suite still passes on a machine
// without it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { askLocal, localReady, stripThinking, LOCAL_MODEL } from '../src/local.ts';

test('reasoning is stripped, however the model emits it', () => {
  // Rule 2. `think: false` is asked for, but a model that ignores it must not leak its reasoning into a
  // fact Joshua is later shown.
  assert.equal(stripThinking('<think>hmm, let me see</think>The vault has 68 notes.'), 'The vault has 68 notes.');
  assert.equal(stripThinking('<thinking>a</thinking> b '), 'b');
  assert.equal(stripThinking('Answer first.<think>then rambling</think>'), 'Answer first.');
  // Cut off mid-thought: everything after the open tag is unusable, so the usable part is what precedes it.
  assert.equal(stripThinking('Partial answer.<think>and then it was cut o'), 'Partial answer.');
  // A reply that is ONLY reasoning becomes empty, which askLocal treats as a failure rather than silence.
  assert.equal(stripThinking('<think>all of it was thinking</think>'), '');
  assert.equal(stripThinking(''), '');
});

test('an empty prompt is refused without calling anything', async () => {
  const r = await askLocal('   ');
  assert.equal(r.ok, false);
  assert.equal(r.why, 'empty');
  assert.equal(r.ms, 0, 'it should not have gone near the network');
});

test('the local model answers a real question', { timeout: 180_000 }, async t => {
  const ready = await localReady();
  if (!ready.ready) {
    t.skip(`local model not available: ${ready.detail}`);
    return;
  }
  // Short, factual, and checkable, so a wrong answer is obvious rather than a matter of taste.
  const r = await askLocal('Reply with only the word: ready', {
    system: 'Answer in as few words as possible. No preamble.',
    timeoutMs: 150_000,
    maxTokens: 32,
  });
  assert.equal(r.ok, true, `local model failed: ${r.why} ${r.detail ?? ''}`);
  assert.ok(r.text.length > 0, 'it said something');
  assert.ok(!/<think/i.test(r.text), 'no reasoning block survived into the answer');
  assert.ok(/ready/i.test(r.text), `expected the word back, got: ${r.text.slice(0, 120)}`);
  console.log(`      ${LOCAL_MODEL}`);
  console.log(`      answered in ${r.ms} ms: ${JSON.stringify(r.text.slice(0, 80))}`);
});

test('it reads a document and answers from it, with no tools anywhere', { timeout: 240_000 }, async t => {
  const ready = await localReady();
  if (!ready.ready) { t.skip('local model not available'); return; }
  // This is the actual Phase 3 job in miniature: a document goes in as DATA, a fact comes out.
  const doc = [
    '# Job search notes',
    '',
    '- Octup: interviewed 30 September, round 3, waiting on the outcome. Chase by 7 October.',
    '- Deliverect: applied 12 September, no reply.',
    '- GreenShield: applied 14 September, no reply.',
  ].join('\n');
  const r = await askLocal(
    `Read this document and answer the question using only what it says.\n\n<document>\n${doc}\n</document>\n\nQuestion: which company is furthest along?`,
    { system: 'You read documents and answer from them. You have no tools and cannot act.', timeoutMs: 200_000, maxTokens: 160 },
  );
  assert.equal(r.ok, true, `local model failed: ${r.why} ${r.detail ?? ''}`);
  assert.ok(/octup/i.test(r.text), `expected it to name Octup, got: ${r.text.slice(0, 200)}`);
  console.log(`      read a document in ${r.ms} ms`);
});

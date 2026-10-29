import './_env.ts';
// What a Claude reply was about, in one line (2026-10-29, his "this isn't surfacing anything useful to me").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gistOf, clean, gistPrompt } from '../src/replygist.ts';

test('the line is cleaned: one line, no markdown or quotes, no refusals, cut short', () => {
  assert.equal(clean('Drafted a Reddit post about your Elite paddles not working on the TV app.'), 'Drafted a Reddit post about your Elite paddles not working on the TV app');
  assert.equal(clean('"Fixed the timer cards"\nmore'), 'Fixed the timer cards');
  assert.equal(clean('**Found** the bug'), 'Found the bug');
  assert.equal(clean('I cannot do that'), '');
  assert.equal(clean('See https://example.com'), '');
  assert.ok(clean('Fixed ' + 'a very long thing '.repeat(10)).length <= 100);
});

test('the first model that answers cleanly wins; none: null; only the end of a long reply is sent', async () => {
  const calls: string[] = [];
  const no = async (p: string) => { calls.push('no'); return { ok: false, text: '' }; };
  const yes = async (p: string) => { calls.push('yes'); return { ok: true, text: 'Drafted a Reddit post' }; };
  assert.equal(await gistOf('Here is a draft.', [no, yes]), 'Drafted a Reddit post');
  assert.deepEqual(calls, ['no', 'yes']);
  assert.equal(await gistOf('Here is a draft.', [no]), null);
  assert.equal(await gistOf('   ', [yes]), null);
  assert.ok(gistPrompt('x'.repeat(5000)).length < 2600);
});

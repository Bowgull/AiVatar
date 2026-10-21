// Plain words, both ways (2026-10-21): Claude's asks rewritten for him, his replies made precise for Claude. No real
// model: the asks are stand-ins, so this checks the checking (what is kept, what is thrown away, the fallbacks).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JobTracker } from '../src/claudelink.ts';
import type { WaitItem } from '../src/claudelink.ts';
import { parsePlain, plainAsk, preciseReply, askPrompt } from '../src/plainwords.ts';
import type { Ask } from '../src/plainwords.ts';

const item = (over: Partial<WaitItem> = {}): WaitItem => ({
  id: 'w1', session: 's1', project: 'Waymark', kind: 'permission', tool: 'Bash', summary: 'Run git push --force',
  input: '{"command":"git push --force origin main"}', canAlways: true, at: 0, ...over,
});
const says = (text: string, ok = true): Ask => async () => ({ ok, text });

test('a good answer is kept, cut to one line', () => {
  const r = parsePlain('sure: {"plain": "Claude wants to overwrite\nthe online copy of Waymark with this one.", "options": []}', item());
  assert.equal(r?.plain, 'Claude wants to overwrite the online copy of Waymark with this one.');
});

test('rubbish, or an empty line, is thrown away', () => {
  assert.equal(parsePlain('no json here', item()), null);
  assert.equal(parsePlain('{"plain": ""}', item()), null);
  assert.equal(parsePlain('{"plain": "ok"}', item()), null);
});

test('option lines only count when there is one per choice of a single question', () => {
  const q = item({ kind: 'question', questions: [{ question: 'Which?', options: [{ label: 'A' }, { label: 'B' }] }] });
  assert.deepEqual(parsePlain('{"plain":"Claude asks which layout to use.","options":["The first","The second"]}', q)?.options, ['The first', 'The second']);
  assert.deepEqual(parsePlain('{"plain":"Claude asks which layout to use.","options":["Only one"]}', q)?.options, []);
});

test('Qwen first; Claude only when Qwen fails', async () => {
  const used: string[] = [];
  const qwen: Ask = async () => { used.push('qwen'); return { ok: false, text: '' }; };
  const claude: Ask = async () => { used.push('claude'); return { ok: true, text: '{"plain":"Claude wants to upload your work to GitHub."}' }; };
  assert.equal((await plainAsk(item(), [qwen, claude]))?.plain, 'Claude wants to upload your work to GitHub.');
  assert.deepEqual(used, ['qwen', 'claude']);
});

test('the tracker takes the plain words, and drops them for an item already answered', () => {
  const t = new JobTracker();
  const seen: string[] = [];
  t.onAsk = w => seen.push(w.id);
  t.event({ session: 's1', type: 'ask', id: 'p1', kind: 'question', tool: 'AskUserQuestion', summary: 'Pick one',
    questions: [{ question: 'Which?', options: [{ label: 'A' }, { label: 'B' }] }] }, 0);
  assert.deepEqual(seen, ['p1']);
  t.setPlain('p1', 'Claude asks which one you want.', ['First', 'Second']);
  const w = t.waiting()[0]!;
  assert.equal(w.plain, 'Claude asks which one you want.');
  assert.deepEqual(w.questions![0]!.options.map(o => o.plain), ['First', 'Second']);
  t.answer('p1', { answers: { 'Which?': 'A' } });
  t.setPlain('p1', 'late');   // no throw, nothing comes back
  assert.equal(t.waiting().length, 0);
});

test('his reply: short ones go as written; longer ones carry his own words too', async () => {
  assert.equal(await preciseReply('yes', '', [says('Yes, go ahead.')]), 'yes');
  const out = await preciseReply('nah skip the tests for now', 'Waymark', [says('Do not run the tests for now; carry on with the rest.')]);
  assert.match(out, /^Do not run the tests/);
  assert.match(out, /Joshua's own words: "nah skip the tests for now"/);
  assert.equal(await preciseReply('nah skip the tests for now', '', [says('', false)]), 'nah skip the tests for now');
});

test('the request is shown to the model as data, with its choices', () => {
  const p = askPrompt(item({ kind: 'question', questions: [{ question: 'Which?', multiSelect: true, options: [{ label: 'A', description: 'the first' }] }] }));
  assert.match(p, /Tool: Bash/);
  assert.match(p, /several may be picked/);
  assert.match(p, /1\. A - the first/);
});

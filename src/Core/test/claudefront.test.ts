// His rule (2026-10-21): nothing of Aang's surfaces while the Claude app is in front. Held, not dropped (claudefront.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FrontGate, FRONT_HOLD_MAX } from '../src/claudefront.ts';
import type { ToBody } from '../src/protocol.ts';

function gate() {
  let fg = 'explorer';
  const g = new FrontGate(() => fg === 'Claude');
  return { g, go: (p: string) => { fg = p; return g.moved(); } };
}
const line = (text: string, proactive = true): ToBody => ({ t: 'bubble', text, stream: false, proactive });

test('outside Claude everything passes untouched', () => {
  const { g } = gate();
  const m: ToBody = { t: 'claude.mark', mark: 'question', sound: 'needs-you', what: 'Waymark' };
  assert.equal(g.pass(m), m);
  const b = line('hi');
  assert.equal(g.pass(b), b);
  const w: ToBody = { t: 'claude.wait', items: [] };
  assert.equal(g.pass(w), w);
});

test('in Claude: no proactive bubble, no whisper, no chime, no mark; replies still go', () => {
  const { g, go } = gate();
  go('Claude');
  assert.equal(g.pass(line('HisWattson posted a video')), null);
  assert.equal(g.pass({ t: 'whisper', text: 'Now playing: a' }), null);
  assert.equal(g.pass({ t: 'claude.mark', mark: 'question', flash: 'step', sound: 'needs-you', what: 'Waymark' }), null);
  const reply = line('Your demo is Friday.', false);
  assert.equal(g.pass(reply), reply, 'an answer to what he asked is never held');
  const s: ToBody = { t: 'claude.said', of: 'claude.answer', ok: true };
  assert.equal(g.pass(s), s);
});

test('in Claude: the waiting list still reaches the Shell, marked quiet so nothing pops up', () => {
  const { g, go } = gate();
  go('Claude');
  const out = g.pass({ t: 'claude.wait', items: [] });
  assert.deepEqual(out, { t: 'claude.wait', items: [], quiet: true });
  assert.deepEqual(g.pass({ t: 'claude.jobs', jobs: [] }), { t: 'claude.jobs', jobs: [] });
});

test('leaving Claude: the latest mark comes back quietly, then the held lines in order', () => {
  const { g, go } = gate();
  assert.deepEqual(go('Claude'), { mark: null, lines: [] });
  g.pass(line('one'));
  g.pass({ t: 'whisper', text: 'Now playing: a' });
  g.pass({ t: 'whisper', text: 'Now playing: b' });
  g.pass(line('two'));
  g.pass({ t: 'claude.mark', mark: 'question', sound: 'needs-you', what: 'Waymark' });
  g.pass({ t: 'claude.mark', mark: 'permission', flash: 'complete', sound: 'needs-you', what: 'Aang' });
  assert.deepEqual(go('Claude'), { mark: null, lines: [] }, 'staying in Claude releases nothing');
  const out = go('Code');
  assert.deepEqual(out.mark, { t: 'claude.mark', mark: 'permission', what: 'Aang' }, 'the steady mark, with no chime and no flare');
  assert.deepEqual(out.lines.map(m => (m as { text: string }).text), ['one', 'Now playing: b', 'two'], 'only the latest whisper');
  assert.deepEqual(go('Code'), { mark: null, lines: [] }, 'nothing twice');
  assert.equal(g.holding, 0);
});

test('a mark sent after he left supersedes the one held', () => {
  const { g, go } = gate();
  go('Claude');
  g.pass({ t: 'claude.mark', mark: 'question' });
  go('explorer');
  // released by moved(); now a fresh one passes as is
  const m: ToBody = { t: 'claude.mark', mark: 'working', sound: 'done' };
  assert.equal(g.pass(m), m);
});

test('the hold is capped, oldest first out', () => {
  const { g, go } = gate();
  go('Claude');
  for (let i = 0; i < FRONT_HOLD_MAX + 3; i++) g.pass(line('n' + i));
  assert.equal(g.holding, FRONT_HOLD_MAX);
  const out = go('explorer');
  assert.equal((out.lines[0] as { text: string }).text, 'n3');
});

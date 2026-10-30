// His rule (2026-10-21): nothing of Aang's surfaces while the Claude app is in front. Held, not dropped (claudefront.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FrontGate, FRONT_HOLD_MAX } from '../src/claudefront.ts';
import type { ToBody } from '../src/protocol.ts';

function gate() {
  let fg = 'explorer';
  const g = new FrontGate(() => fg === 'Claude');
  // What leaving Claude lets out of the one hold queue (attention.ts): the brain takes it when nothing else is in the way.
  return { g, go: (p: string) => { fg = p; const left = g.moved(); return { left, lines: left ? g.queue.take().map(h => h.msg!) : [] }; } };
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

test('in Claude: no proactive bubble, no whisper, no chime or flare; the mark stays true; replies still go', () => {
  const { g, go } = gate();
  go('Claude');
  assert.equal(g.pass(line('HisWattson posted a video')), null);
  assert.equal(g.pass({ t: 'whisper', text: 'Now playing: a' }), null);
  // 2026-10-29 fix 5: the steady mark goes through (an answered question's mark leaves at once), never its chime or flare.
  assert.deepEqual(g.pass({ t: 'claude.mark', mark: 'question', flash: 'step', sound: 'needs-you', what: 'Waymark' }), { t: 'claude.mark', mark: 'question', what: 'Waymark' });
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

test('leaving Claude: the held lines come out in order (the mark was already live)', () => {
  const { g, go } = gate();
  assert.deepEqual(go('Claude'), { left: false, lines: [] });
  g.pass(line('one'));
  g.pass({ t: 'whisper', text: 'Now playing: a' });
  g.pass({ t: 'whisper', text: 'Now playing: b' });
  g.pass(line('two'));
  g.pass({ t: 'claude.mark', mark: 'question', sound: 'needs-you', what: 'Waymark' });
  g.pass({ t: 'claude.mark', mark: 'permission', flash: 'complete', sound: 'needs-you', what: 'Aang' });
  assert.deepEqual(go('Claude'), { left: false, lines: [] }, 'staying in Claude releases nothing');
  const out = go('Code');
  assert.equal(out.left, true);
  assert.deepEqual(out.lines.map(m => (m as { text: string }).text), ['one', 'Now playing: b', 'two'], 'only the latest whisper');
  assert.deepEqual(go('Code'), { left: false, lines: [] }, 'nothing twice');
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

test('the hold is capped, the least important first out', () => {
  const { g, go } = gate();
  go('Claude');
  for (let i = 0; i < FRONT_HOLD_MAX + 3; i++) g.pass(line('n' + i));
  assert.equal(g.holding, FRONT_HOLD_MAX);
  const out = go('explorer');
  assert.equal((out.lines[0] as { text: string }).text, 'n3');
});

test('a held "waiting on you" line he answered in Claude meanwhile is dropped, never replayed (2026-10-22)', () => {
  let fg = 'Claude';
  const g = new FrontGate(() => fg === 'Claude');
  g.moved();
  const asked: ToBody = { t: 'bubble', text: 'Claude Code on the MacBook is waiting on you in Waymark.', stream: false, proactive: true, blocking: true, session: 'sess-answered' };
  const still: ToBody = { t: 'bubble', text: 'Claude Code on the MacBook is waiting on you in Aang.', stream: false, proactive: true, blocking: true, session: 'sess-open' };
  const news = line('HisWattson posted a video');
  for (const m of [asked, still, news]) assert.equal(g.pass(m), null);
  fg = 'explorer';
  assert.equal(g.moved(), true);
  const out = g.queue.take(h => h.msg?.t === 'bubble' && h.msg.session === 'sess-answered').map(h => h.msg);
  // Most important first: the session still waiting on him (tier 1) before the video (tier 3).
  assert.deepEqual(out, [still, news]);
  assert.equal(g.holding, 0);
});

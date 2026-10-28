import './_env.ts';
// 2026-10-28: an expired Claude sign-in reached him word for word, twice ("Failed to authenticate: OAuth session
// expired and could not be refreshed"). The SDK reports an API failure as subtype 'success' with is_error set and the
// error as its result, so the lane took it for a reply. It must be a failed result instead.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

const real = await import('@anthropic-ai/claude-agent-sdk');
mock.module('@anthropic-ai/claude-agent-sdk', {
  exports: {
    ...real,
    query: (args: { prompt: AsyncIterable<unknown> }) => {
      async function* run() {
        for await (const _ of args.prompt) {
          yield { type: 'system', subtype: 'init', session_id: 's1' };
          yield { type: 'result', subtype: 'success', is_error: true, result: 'Failed to authenticate: OAuth session expired and could not be refreshed', usage: {} };
        }
      }
      return Object.assign(run(), { close: async () => { /* */ }, interrupt: async () => { /* */ } });
    },
  },
} as unknown as Parameters<typeof mock.module>[1]);

const { Lane } = await import('../src/lane.ts');

test('an expired sign-in is a failed turn, never a reply', async () => {
  const lane = new Lane({ name: 'test', model: 'sonnet', systemPrompt: 'You are Aang.', allowedTools: [] });
  const got = await new Promise<{ ok: boolean; text: string }>(resolve => {
    lane.onEvent(e => { if (e.t === 'result') resolve(e); });
    lane.send('what day is it');
  });
  assert.equal(got.ok, false);
  lane.close();
});

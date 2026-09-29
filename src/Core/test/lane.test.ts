import './_env.ts';
// Root-cause regression for 0g (2026-09-24): a resumed lane must send its system prompt as the object form
// with snapshot:false, or the Agent SDK freezes the FIRST prompt it ever saw for that session and replays it
// verbatim on every later request and resume "until compaction or a new session" - confirmed straight from
// the SDK's own systemPrompt.snapshot documentation, not guessed at. A bare string "follows the default",
// which IS snapshot:true; there is no way to opt out except the object form. This test mocks the SDK boundary
// so the check is free and runs every time, rather than a live call that would cost real quota on every run
// of the suite - and rather than trusting a comment to keep saying the right thing forever.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

const calls: { options: Record<string, unknown> }[] = [];
async function* nothing() { /* the fake Claude process never has anything to say */ }
// tools.ts (pulled in through lane.ts -> ./tools.ts) also imports from this same package, so every real
// export has to be preserved here - replacing the whole module, as mock.module does with a bare namedExports
// object, would break createSdkMcpServer and everything else that isn't query.
const real = await import('@anthropic-ai/claude-agent-sdk');
// `exports` is the current name; @types/node still only declares the deprecated `namedExports`, so the cast
// is to the type definitions lagging the runtime, not to a real mismatch. Using the old name instead would
// work but prints a deprecation warning on every test run.
mock.module('@anthropic-ai/claude-agent-sdk', {
  exports: {
    ...real,
    query: (args: { options: Record<string, unknown> }) => {
      calls.push(args);
      return Object.assign(nothing(), { close: async () => { /* */ }, interrupt: async () => { /* */ } });
    },
  },
} as unknown as Parameters<typeof mock.module>[1]);

const { Lane } = await import('../src/lane.ts');

test('a fresh lane sends its prompt with snapshot:false, not as a bare string', () => {
  calls.length = 0;
  const lane = new Lane({ name: 'test', model: 'sonnet', systemPrompt: 'You are Aang.', allowedTools: [] });
  lane.start();
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].options.systemPrompt, { type: 'custom', prompt: 'You are Aang.', snapshot: false },
    'a bare string here silently re-enables the SDK default (snapshot:true), which is exactly what caused 0g');
  lane.close();
});

test('a RESUMED lane sends the prompt the same way - this is the case that actually broke', () => {
  calls.length = 0;
  const lane = new Lane({ name: 'test', model: 'sonnet', systemPrompt: 'You are Aang, and this line just changed.', allowedTools: [], resumeId: 'a-previous-session-id' });
  lane.start();
  assert.equal(calls[0].options.resume, 'a-previous-session-id', 'the test is actually exercising a resume, not a fresh session');
  assert.deepEqual(calls[0].options.systemPrompt,
    { type: 'custom', prompt: 'You are Aang, and this line just changed.', snapshot: false },
    'on resume this is the ONLY thing that makes the SDK render the new text instead of replaying the old one');
  lane.close();
});

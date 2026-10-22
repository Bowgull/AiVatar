// Where a reply's first word waits, on the real lane (2026-10-21, his "make the way Aang replies smoother and faster").
//
// Two cheap Haiku calls with a one-line system prompt and no tools: the same Lane class Aang uses, so what is measured
// is the process and the SDK, not his 57k-token prefix (that part is the prompt cache, which the warm-up handles).
//   cold:     a new lane, send at once - the Claude Code process is spawned by the message itself (what the first turn
//             after every brain start paid until today)
//   started:  a new lane, start() first and wait - the process is already up when he presses Enter (what warmNow does now)
// Each prints send -> first token -> finished. Costs two tiny turns of quota: run it by hand, never in the suite.
// Run: node --no-warnings test/lane-latency-live.ts
import { Lane } from '../src/lane.ts';
import { MODELS } from '../src/route.ts';

async function one(label: string, prestart: boolean): Promise<void> {
  const lane = new Lane({ name: 'probe-' + label, model: MODELS.quick.model, systemPrompt: 'Answer in one short sentence.',
    allowedTools: [], onlyTools: [], thinking: { type: 'disabled' }, claudeExecutable: process.env.AANG_CLAUDE_EXE || undefined });
  if (prestart) { lane.start(); await new Promise((r) => setTimeout(r, 6000)); }
  const t0 = Date.now();
  let first = 0;
  await new Promise<void>((done) => {
    lane.onEvent((e) => {
      if (e.t === 'delta' && !first) first = Date.now();
      if (e.t === 'result' || e.t === 'error') {
        console.log(`${label.padEnd(8)} send->first token ${first ? first - t0 : '-'} ms, send->done ${Date.now() - t0} ms` + (e.t === 'result' ? `, sdk ttft ${e.ttftMs} ms, cache read ${e.cacheReadTokens}` : `, error ${e.message}`));
        done();
      }
    });
    lane.send('Say hi.');
  });
  lane.close();
}

await one('cold', false);
await one('started', true);
process.exit(0);

import './_env.ts';
// What the ENGINE's own built-in tools cost, and the one that must not be dropped.
//
// 2026-09-30: a live probe found a chat lane was loading every built-in the engine ships -
// 56,822 input tokens of schemas - when four tools cost 4,749. Roughly 50k was being paid on
// every cold start, at the cache-write rate, for tools core.ts already DISALLOWS. The reason
// it was invisible: `allowedTools` and `disallowedTools` only decide what may be CALLED. Both
// still send every schema. `tools:` (passed through Lane as `onlyTools`) is the one switch
// that decides what is LOADED, and nothing was using it.
//
// The test exists for the near-miss, not the saving. The first draft of that fix was
// Read/Glob/Grep, which is correct for file access and silently removes `Skill` - and
// core.ts loads `skills: ['job-hunt']`, so it would have broken the job search without any
// error, test failure or visible symptom. It was caught by probing the SDK's init message
// before the edit rather than after. These assertions are that probe, made permanent and free.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Core } from '../src/core.ts';

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'aang-toolbudget-'));

function laneOptions(name: 'quick' | 'smart') {
  // Port 48210: the suite's ports are spaced two apart because every Core also binds
  // cfg.port + 1 for its hook server, which is what caused the collisions in §1.3.
  const core: any = new Core({ port: 48210, dataDir: tmp(), stateDir: tmp(), warm: false, consolidate: false });
  try {
    return core.lane(name).opts;
  } finally {
    core.memory.close();
  }
}

test('the chat lanes load only the built-ins Aang actually uses', () => {
  for (const name of ['quick', 'smart'] as const) {
    const only: string[] = laneOptions(name).onlyTools;
    assert.ok(Array.isArray(only), `${name} must restrict built-ins; without onlyTools the engine loads all ~40`);
    assert.deepEqual([...only].sort(), ['Glob', 'Grep', 'Read', 'Skill'],
      `${name} loads an unexpected built-in set. Adding one is a real cost: measured at ~50k input tokens ` +
      'for the full set against ~4.7k for these four, paid again on every cold start.');
  }
});

test('Skill is never dropped from the list while the job-hunt skill is loaded', () => {
  // The near-miss this file exists for. If someone trims this list to the file tools, the
  // job-hunt skill stops being reachable and nothing says so: no error, no failing test,
  // no message to Joshua. Tie the two together so the next person has to notice.
  for (const name of ['quick', 'smart'] as const) {
    const o = laneOptions(name);
    if (!o.skills?.length) continue;
    assert.ok(o.onlyTools.includes('Skill'),
      `${name} loads skills ${JSON.stringify(o.skills)} but does not load the Skill tool, so it cannot invoke them`);
  }
});

test('restricting the built-ins does not weaken the web-tool rule from 2026-09-20', () => {
  // core.ts:1070 records, from a real probe, that web tools must be DISALLOWED rather than
  // merely left out of allowedTools: left out, the model still sees them, reaches for
  // WebFetch, is refused, and gives up instead of using look_up_web. `onlyTools` removes them
  // from the prompt entirely, which is a stronger guarantee - but the disallow list stays as
  // belt and braces, and this asserts nobody removed it on the grounds that it looked redundant.
  const o = laneOptions('smart');
  for (const t of ['WebFetch', 'WebSearch', 'Bash', 'Write', 'Edit']) {
    assert.ok(o.disallowedTools.includes(t), `${t} must stay in disallowedTools even though onlyTools omits it`);
  }
});

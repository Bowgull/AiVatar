import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wantsBrief } from '../src/briefcard.ts';
test('wantsBrief: any short ask for the brief, never a brief to write (2026-10-22)', () => {
  for (const t of ['brief', 'Brief.', 'my brief', 'show me my brief', 'morning brief', 'brief me', 'can I get my morning brief?', "what's in today's briefing", 'pull up the brief pls', 'hey aang give me my daily brief', 'the brief'])
    assert.ok(wantsBrief(t), t);
  for (const t of ['write a brief for the designer', 'draft the brief for Coach', 'was that brief enough', 'keep it brief', 'make the morning brief shorter please'])
    assert.ok(!wantsBrief(t), t);
});

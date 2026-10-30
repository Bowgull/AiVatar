// 2026-10-30, his report: on the Mac a lit Claude mark answered a click with "Claude isn't working on anything right now".
// The Mac app handed the click straight to the bubble with no session list; the PC pet asks the brain, which answers
// with exactly the sessions it lit the mark for (core.ts 'mark.click'). The Mac must ask the brain the same way.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const src = readFileSync(path.join(import.meta.dirname, '..', 'src', 'macaang.ts'), 'utf8');

test('a click on the mark on the Mac goes to the brain, and its answer (with the sessions) goes to the bubble', () => {
  assert.match(src, /function markClicked\(\): void \{\s*if \(!link\.send\(\{ t: 'mark\.click' \}/, 'the click is sent to the brain');
  assert.match(src, /if \(m\.t === 'mark\.click'\) \{ bubble\?\.send\('brain:message', m\)/, "the brain's answer is drawn as it came");
  // The only bare click left is the no-brain fallback inside markClicked.
  const bare = src.match(/bubble\?\.send\('brain:message', \{ t: 'mark\.click' \}\)/g) ?? [];
  assert.equal(bare.length, 1, 'no other path hands the bubble a click without the sessions');
  assert.match(src, /where === 'mark' && markNow\) \{ markClicked\(\)/);
  assert.match(src, /id === 'jobs'\) \{ markClicked\(\)/);
});

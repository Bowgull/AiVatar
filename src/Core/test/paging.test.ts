import './_env.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Memory } from '../src/memory.ts';

test('history pages backwards without a cap', () => {
  const m = new Memory(mkdtempSync(path.join(os.tmpdir(), 'aang-page-')));
  try {
    for (let i = 0; i < 5; i++) m.saveTurn(`question ${i}`, `answer ${i}`, 'claude-quick');
    const newest = m.history('', 4);
    assert.equal(newest.length, 4, 'newest first, limited');
    assert.equal(newest[0].text, 'answer 4');

    const older = m.history('', 4, newest[newest.length - 1].id);
    assert.ok(older.length > 0, 'there is a page behind the first one');
    assert.ok(older.every(t => t.id < newest[newest.length - 1].id), 'every row is older than the cursor');

    // Walk back to the beginning the way the bubble does, and stop when it runs dry.
    let cursor = 0, seen = 0, pages = 0;
    while (pages++ < 20) {
      const page = m.history('', 3, cursor);
      if (page.length === 0) break;
      seen += page.length;
      cursor = page[page.length - 1].id;
    }
    assert.equal(seen, 10, 'all ten rows come back across pages, none twice, none missed');

    assert.ok(m.history('question', 10).length > 0, 'search still works');
    assert.ok(m.history('question', 10, 3).every(t => t.id < 3), 'and search pages too');
  } finally { m.close(); }
});

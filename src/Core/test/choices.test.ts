import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Choices, choiceKey } from '../src/choices.ts';
import { TOOL_NAMES, QUICK_TOOLS } from '../src/tools.ts';

test('sheet 16: two spellings of one decision are one key', () => {
  assert.equal(choiceKey('Where shows play'), 'where shows play');
  assert.equal(choiceKey('  where-shows   PLAY! '), 'where shows play');
  assert.equal(choiceKey(''), '');
});

test('sheet 16: ask once, remember, forget on "change", and it survives a restart', () => {
  const file = path.join(mkdtempSync(path.join(os.tmpdir(), 'choices-')), 'choices.json');
  const c = new Choices(file);
  assert.equal(c.get('where shows play'), null);
  c.set('Where shows play', 'Naruto where?', 'The Mac');
  assert.equal(new Choices(file).get('where shows play')?.pick, 'The Mac');
  assert.equal(c.forget('where shows play'), true);
  assert.equal(new Choices(file).get('where shows play'), null);
  assert.equal(c.forget('where shows play'), false);
});

test('sheet 16: Smart can ask a choice; Quick cannot see it', () => {
  assert.ok(TOOL_NAMES.includes('mcp__aang__ask_choice'));
  assert.ok(!QUICK_TOOLS.includes('mcp__aang__ask_choice'));
});

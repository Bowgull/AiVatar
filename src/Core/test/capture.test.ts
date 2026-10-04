import './_env.ts';
// A thought dropped in #capture becomes a line in a note, in code, for no quota (step Q3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { capture, captureFile } from '../src/capture.ts';

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'aang-capture-'));
const at = (h: number, m = 0) => new Date(2026, 9, 4, h, m);

test('a note is written to today\'s file with its time', () => {
  const root = tmp();
  const r = capture('raid moved to 7', at(14, 30), root)!;
  assert.equal(r.countToday, 1);
  const text = readFileSync(r.file, 'utf8');
  assert.match(text, /# Captured/);
  assert.match(text, /- \*\*2:30 p\.?m\.?\*\* raid moved to 7/);
});

test('more notes the same day append to the same file and are counted', () => {
  const root = tmp();
  capture('first', at(9), root);
  capture('second', at(10), root);
  const r = capture('third', at(11), root)!;
  assert.equal(r.countToday, 3);
  assert.equal(r.file, captureFile(at(11), root));
  const text = readFileSync(r.file, 'utf8');
  assert.equal((text.match(/# Captured/g) ?? []).length, 1);   // one heading, not three
});

test('a different day is a different file', () => {
  const root = tmp();
  const a = capture('monday', new Date(2026, 9, 5, 9), root)!;
  const b = capture('tuesday', new Date(2026, 9, 6, 9), root)!;
  assert.notEqual(a.file, b.file);
  assert.equal(b.countToday, 1);
});

test('a note of several lines stays valid markdown', () => {
  const root = tmp();
  const r = capture('ask about\nthe new raid times', at(12), root)!;
  const lines = readFileSync(r.file, 'utf8').trim().split('\n');
  assert.match(lines.at(-2)!, /^- \*\*/);
  assert.equal(lines.at(-1), '  the new raid times');
  assert.equal(r.countToday, 1);
});

test('an empty note is not written', () => {
  assert.equal(capture('   ', at(12), tmp()), null);
});

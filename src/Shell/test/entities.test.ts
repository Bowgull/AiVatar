// Step 6.12: files and links become chips. Ported from Entities.cs, so these check the RULES that file
// chose rather than just that something is found.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX, find, host, leaf } from '../pages/entities.js';

test('a real path and a real address become chips', () => {
  const c = find('Wrote C:\\Users\\Shadow\\Documents\\Aang\\notes.md and see https://github.com/x/y for why.');
  assert.deepEqual(c.map(x => `${x.kind}:${x.label}`), ['file:notes.md', 'link:github.com']);
  assert.equal(c[0]?.value, 'C:\\Users\\Shadow\\Documents\\Aang\\notes.md', 'the chip carries the whole path');
});

test('FILES COME FIRST, even when links were mentioned earlier', () => {
  // Entities.cs's reason, kept: "A file Aang just wrote is the thing he is most likely to want, so it
  // should not be pushed off the end of the row by two links that happened to be mentioned earlier."
  const c = find('See https://a.com and https://b.com, then I wrote C:\\tmp\\out.txt');
  assert.equal(c[0]?.kind, 'file');
  assert.equal(c[0]?.label, 'out.txt');
});

test('at most three, so the row never becomes a menu', () => {
  const c = find('https://a.com https://b.com https://c.com https://d.com https://e.com');
  assert.equal(c.length, MAX);
});

test('the patterns are strict, because a chip on a non-file is worse than no chip', () => {
  // Ordinary prose that a loose pattern would grab.
  for (const text of [
    'I went to the shop. It was fine.',
    'Version 2.5 of the thing',
    'see src/Body/Theme.cs for the colours',       // a relative path is not a drive path
    'that costs £4.99 a month',
    'email him at josh@example.com',
  ]) assert.deepEqual(find(text), [], text);
});

test('sentence punctuation is not part of the address', () => {
  assert.equal(find('Look at https://github.com/x.')[0]?.value, 'https://github.com/x');
  assert.equal(find('Opened C:\\tmp\\a.txt, then stopped.')[0]?.value, 'C:\\tmp\\a.txt');
});

test('the same thing twice is one chip', () => {
  const c = find('https://a.com and again https://a.com');
  assert.equal(c.length, 1);
});

test('the label is readable, the value is complete', () => {
  assert.equal(leaf('C:\\a\\b\\c\\report.pdf'), 'report.pdf');
  assert.equal(host('https://www.github.com/x/y?q=1'), 'github.com', 'no scheme, no www, no query');
  assert.equal(host('not a url'), 'link', 'and it never throws');
  // Long names are cut rather than allowed to stretch the bubble.
  assert.equal(leaf('C:\\a\\' + 'x'.repeat(50) + '.txt').length, 28);
  assert.ok(leaf('C:\\a\\' + 'x'.repeat(50) + '.txt').endsWith('…'));
});

test('odd input never throws, because a chip must not break the view it sits in', () => {
  for (const t of [null, undefined, '', 123, {}]) assert.deepEqual(find(t as never), []);
  assert.deepEqual(find('C:\\'), [], 'too short to be a file');
});

test('a UNC share counts as a file', () => {
  const c = find('It is on \\\\server\\share\\thing.docx now');
  assert.equal(c[0]?.kind, 'file');
  assert.equal(c[0]?.label, 'thing.docx');
});

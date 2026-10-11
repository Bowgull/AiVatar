// 6.11 on the desktop: the reply's light formatting, read into blocks. Never markup.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blocks, runs, shownWords } from '../pages/rich.js';

test('a heading, bullet rows, bold and a small table come out as blocks', () => {
  const b = blocks('# Three jobs\n- **Octup**, Toronto\n- Float, remote\n\n| Role | Pay |\n|---|---|\n| CSM | 95k |');
  assert.deepEqual(b.map((x) => x.kind), ['h', 'li', 'li', 'row', 'row']);
  assert.deepEqual(runs('**Octup**, Toronto'), [{ text: 'Octup', bold: true }, { text: ', Toronto' }]);
  assert.equal(b[3].cells?.length, 2, 'the separator row is dropped, the cells kept');
});

test('NEVER MARKUP: a reply quoting HTML stays as the characters it is', () => {
  const b = blocks('<img src=x onerror=alert(1)> and <b>hi</b>');
  assert.equal(b[0].kind, 'p');
  assert.equal(b[0].runs.map((r) => r.text).join(''), '<img src=x onerror=alert(1)> and <b>hi</b>');
});

test('words are counted the way they are drawn: markup alone counts nothing', () => {
  assert.equal(shownWords('# Three jobs\n- **Octup**, Toronto'), 4);
  assert.equal(shownWords('| a | b |\n|---|---|'), 2);
});

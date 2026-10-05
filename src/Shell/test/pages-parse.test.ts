// Every script the pages load has to PARSE.
//
// On 2026-10-04 a mangled regular expression in bubble.js stopped the whole page loading, so Aang said
// nothing at all - and a page that fails to load is simply blank, so it looked like the bubble was
// broken rather than the file. It cost a full restart-and-send cycle to find.
//
// `node --check` is the same syntax parser the browser uses, and it is instant. A test that runs in
// milliseconds and rules out "the page is dead" is worth more than it looks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const pages = path.resolve(import.meta.dirname, '..', 'pages');
const scripts = () => readdirSync(pages).filter((f) => f.endsWith('.js'));

test('every page script parses', () => {
  const files = scripts();
  assert.ok(files.length >= 5, `expected the page scripts, found ${files.length}`);
  for (const f of files) {
    try {
      execFileSync(process.execPath, ['--check', path.join(pages, f)], { stdio: 'pipe' });
    } catch (e) {
      const why = String((e as { stderr?: Buffer }).stderr ?? e);
      assert.fail(`${f} does not parse:\n${why.split('\n').slice(0, 6).join('\n')}`);
    }
  }
});

test('a regular expression never has a real line break inside it', () => {
  // The exact shape of the bug: a real newline where \n was meant, inside a character class. A class
  // that opens on a line and does not close on it is always this mistake, and the parser's own message
  // ("missing /") points nowhere useful.
  for (const f of scripts()) {
    readFileSync(path.join(pages, f), 'utf8').split(/\r?\n/).forEach((line, i) => {
      const opens = (line.match(/\/\[/g) ?? []).length;
      const closes = (line.match(/\]/g) ?? []).length;
      if (opens > closes) assert.fail(`${f}:${i + 1} leaves a regular expression open:\n  ${line}`);
    });
  }
});

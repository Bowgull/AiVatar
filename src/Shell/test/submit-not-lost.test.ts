// A message he sends must never vanish silently.
//
// `link.send()` returns false when the brain is not there, and the submit handler used to ignore that,
// so a message typed while the brain was down was dropped and the box cleared as if it had gone. 6.14b
// says it plainly: "Nothing you said is lost." This checks the wiring, since the failure is a missing
// branch rather than a wrong value.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const main = readFileSync(path.resolve(import.meta.dirname, '..', 'src', 'main.ts'), 'utf8');
const inputJs = readFileSync(path.resolve(import.meta.dirname, '..', 'pages', 'input.js'), 'utf8');
const preload = readFileSync(path.resolve(import.meta.dirname, '..', 'src', 'preload.cjs'), 'utf8');

test('a submit the brain cannot take is reported, not dropped', () => {
  // The result of the send must be read...
  assert.match(main, /const sent = link\?\.send\(/, 'the submit no longer captures whether the send worked');
  // ...and a failed one must go back to the box with the text.
  assert.match(main, /if \(!sent\) \{[\s\S]{0,200}?input:failed/,
    'a failed send is not reported back to the box');
});

test('the box puts the text back and keeps it, rather than clearing it', () => {
  assert.match(inputJs, /onFailed\?\.\(\(f\) => \{[\s\S]{0,120}?setText\(f\.text\)/,
    'the box does not restore the text it could not send');
});

test('the box can hear about it through a door that exists', () => {
  assert.match(preload, /onFailed\(fn\)/, 'the preload has no door for a failed send');
  assert.match(preload, /ipcRenderer\.on\('input:failed'/, 'the door listens on the wrong channel');
});

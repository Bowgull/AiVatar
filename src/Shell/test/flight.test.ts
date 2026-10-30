import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closedCleanly, lastRun, memoryLine, siteOf } from '../src/flight.ts';

test('only the site name is ever written, never the full address', () => {
  assert.equal(siteOf('https://www.youtube.com/watch?v=abc&t=5'), 'www.youtube.com');
  assert.equal(siteOf('file:///Users/x/secret.html'), 'file');
  assert.equal(siteOf('not a url'), '?');
});

test('a run that closed cleanly says nothing; one that did not is named on the next start', () => {
  const d = mkdtempSync(path.join(os.tmpdir(), 'flight-'));
  assert.equal(lastRun(d, Date.UTC(2026, 9, 30, 9, 0)), null);
  closedCleanly(d);
  assert.equal(lastRun(d), null);
  // no clean close this time
  const said = lastRun(d);
  assert.match(said ?? '', /did not close cleanly/);
});

test('memory adds every process up and names the biggest kinds', () => {
  const line = memoryLine([
    { type: 'GPU', memory: { workingSetSize: 200 * 1024 } },
    { type: 'Tab', memory: { workingSetSize: 300 * 1024 } },
    { type: 'Tab', memory: { workingSetSize: 100 * 1024 } },
    { type: 'Browser', memory: { workingSetSize: 50 * 1024 } },
  ]);
  assert.equal(line, 'memory 650 MB in 4 processes (Tab 400, GPU 200, Browser 50)');
});

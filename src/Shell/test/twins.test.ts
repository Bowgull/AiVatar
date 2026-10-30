// The shared engines (atomic, store, log, clock) live in src/Core/src and src/Shell/src as the same file, byte for byte,
// because the brain and Samara ship as separate bundles. Edit Core's, then: cp src/Core/src/<name>.ts src/Shell/src/<name>.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const TWINS = ['atomic.ts', 'store.ts', 'log.ts', 'clock.ts', 'scheduler.ts'];

test('the shared engines are the same file in Shell and Core', () => {
  for (const f of TWINS) {
    const shell = readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
    const core = readFileSync(new URL(`../../Core/src/${f}`, import.meta.url), 'utf8');
    assert.ok(shell === core, `${f} differs between src/Shell/src and src/Core/src: cp src/Core/src/${f} src/Shell/src/${f}`);
  }
});

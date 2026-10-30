// The brain and Samara ship as separate bundles, so the shared engines live twice: src/Core/src and src/Shell/src.
// They must be the same file, byte for byte (atomic.ts had drifted before the store engine, 2026-10-30). Edit Core's,
// then copy it over: cp src/Core/src/<name>.ts src/Shell/src/<name>.ts
import './_env.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

export const TWINS = ['atomic.ts', 'store.ts', 'log.ts', 'clock.ts'];

test('the shared engines are the same file in Core and Shell', () => {
  for (const f of TWINS) {
    const core = readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
    const shell = readFileSync(new URL(`../../Shell/src/${f}`, import.meta.url), 'utf8');
    assert.ok(core === shell, `${f} differs between src/Core/src and src/Shell/src: cp src/Core/src/${f} src/Shell/src/${f}`);
  }
});

// The Mac front desk is sent a hand-picked list of brain files (core.ts DESK_FILES). A desk file that imports one not on
// the list would not start on the Mac, and nothing on the PC would notice. Type-only imports are erased, so they are fine.
test('the front desk is sent every file its files import', () => {
  const core = readFileSync(new URL('../src/core.ts', import.meta.url), 'utf8');
  const list = JSON.parse(core.match(/DESK_FILES = (\[[^\]]+\])/)![1]!.replace(/'/g, '"')) as string[];
  for (const f of list) {
    const src = readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
    for (const m of src.matchAll(/^import (?!type )[^;]*?from '\.\/([\w-]+\.ts)'/gm)) {
      assert.ok(list.includes(m[1]!), `${f} imports ${m[1]}, which the Mac front desk is not sent (add it to DESK_FILES in core.ts)`);
    }
  }
});

import './_env.ts';
// The real people behind the fingerprints in files.ts.
//
// The repo is public, so files.ts holds only fingerprints of their names and offlimits.test.ts uses
// made-up ones. This test reads the real paths from test/offlimits.local.json, which is gitignored
// and lives only on Joshua's machine: { "refused": [paths], "allowed": [paths] }. Without that file
// (a fresh clone) it is skipped, not failed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { offLimits } from '../src/files.ts';

const file = path.join(import.meta.dirname, 'offlimits.local.json');
const list = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) as { refused: string[]; allowed: string[] } : null;

test('the real names and Drive paths: theirs refused, his readable', { skip: list ? false : 'no local offlimits.local.json' }, () => {
  for (const p of list!.refused) assert.match(offLimits(p) ?? '', /someone else/i, `${p} must be refused`);
  for (const p of list!.allowed) assert.equal(offLimits(p), null, `${p} must stay readable`);
});

// QA 2026-11-19: the paid-video window (drm/main.ts) could not start. It imported src/stack.ts, which 635f3656 deleted as
// "unused" because nothing in src/ used it; drm/ is outside tsconfig (it needs castLabs' own Electron types), so the
// type check never saw it, and its only symptom was one log line when a paid link opened. Every file it imports,
// and every file those import, must exist.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SHELL = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const relImports = (file: string) => [...readFileSync(file, 'utf8').matchAll(/^\s*import\s[^'"]*['"](\.{1,2}\/[^'"]+)['"]/gm)].map((m) => path.resolve(path.dirname(file), m[1]!));

test('the paid-video window finds every file it imports', () => {
  const seen = new Set<string>(), todo = [path.join(SHELL, 'drm', 'main.ts')], missing: string[] = [];
  while (todo.length) {
    const f = todo.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    if (!existsSync(f)) { missing.push(path.relative(SHELL, f)); continue; }
    if (/\.(ts|mjs|js)$/.test(f)) todo.push(...relImports(f));
  }
  assert.deepEqual(missing, [], 'drm/main.ts imports files that are gone');
  assert.ok(seen.has(path.join(SHELL, 'src', 'stack.ts')), 'the two-view stack (bar above, service below) is still how it draws');
});

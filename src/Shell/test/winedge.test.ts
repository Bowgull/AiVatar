// The edge helper's C# must compile (2026-10-22, his report: "my music player edges are straight-up square"). One stray
// brace made Add-Type fail inside the helper, whose errors go nowhere, so every corner request silently did nothing.
// Both classes are compiled here exactly as the helper compiles them. Windows only (PowerShell + Add-Type).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os'; import path from 'node:path';

const SRC = readFileSync(new URL('../src/winedge.ts', import.meta.url), 'utf8');
function block(name: string): string {
  const start = SRC.indexOf(`export const ${name} = \``);
  assert.ok(start >= 0, name);
  const body = SRC.slice(SRC.indexOf('`', start) + 1);
  const end = body.search(/\r?\n`;/);
  assert.ok(end > 0, name + ' end');
  const cs = body.slice(0, end);
  assert.ok(!cs.includes('${'), name + ' has no interpolation');
  return cs;
}
function compiles(cs: string, refs = ''): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'winedge-test-'));
  const f = path.join(dir, 'c.ps1');
  writeFileSync(f, `$ErrorActionPreference = 'Stop'\nAdd-Type ${refs} -TypeDefinition @'\n${cs}\n'@\n'compiled'\n`);
  try { return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', f], { encoding: 'utf8', timeout: 60_000 }).trim(); }
  catch (e) { return 'FAILED ' + String((e as { stdout?: string }).stdout ?? '') + String((e as { stderr?: string }).stderr ?? e).slice(0, 600); }
}

test('the corner helper (DWM corners + stepped region) compiles', { skip: process.platform !== 'win32' }, () => {
  assert.equal(compiles(block('EDGE_HELPER_CS')), 'compiled');
});
test('the taskbar helper (app-window style, proxies, the corner read-back) compiles', { skip: process.platform !== 'win32' }, () => {
  const cs = block('TASKBAR_HELPER_CS');
  assert.match(cs, /op == "C"/);
  assert.equal(compiles(cs, '-ReferencedAssemblies System.Windows.Forms,System.Drawing'), 'compiled');
});

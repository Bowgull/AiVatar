// Sheet 79: mockup_mark's brain half. An approval needs his words; a mark on a sheet in the repo leaves one small
// .mockmark for Samara; no stage lists what Samara keeps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { markMockup } from '../src/mockupdrop.ts';

test('a mark is checked and handed to Samara; the list is read from its history', async () => {
  const state = mkdtempSync(path.join(os.tmpdir(), 'mk-s-')), repo = mkdtempSync(path.join(os.tmpdir(), 'mk-r-'));
  execFileSync('git', ['init', '-q', repo]);
  writeFileSync(path.join(repo, 'sheet.html'), '<title>x</title>');
  assert.equal((await markMockup(state, { cwd: repo, path: 'sheet.html', stage: 'approved' }, '/nowhere')).ok, false);
  assert.equal((await markMockup(state, { cwd: repo, path: '../etc/passwd', stage: 'built' }, '/nowhere')).ok, false);
  const r = await markMockup(state, { cwd: repo, path: 'sheet.html', stage: 'approved', said: 'yes, build it' }, '/nowhere');
  assert.equal(r.ok, true, r.message);
  const files = readdirSync(path.join(state, 'open-urls'));
  assert.equal(files.length, 1);
  const j = JSON.parse(readFileSync(path.join(state, 'open-urls', files[0]!), 'utf8'));
  assert.equal(j.stage, 'approved'); assert.equal(j.said, 'yes, build it'); assert.equal(j.path, 'sheet.html');
  writeFileSync(path.join(state, 'mockups.json'), JSON.stringify({ versions: [{ sheet: 'docs/a.html', v: 2, stage: 'built', said: 'go', stageAt: 5 }, { sheet: 'docs/b.html', v: 1 }] }));
  const l = await markMockup(state, { list: true });
  assert.deepEqual(l.stages?.map((x) => (x as { sheet: string }).sheet), ['docs/a.html']);
});

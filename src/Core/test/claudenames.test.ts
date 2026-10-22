// His names for Claude sessions and their real app links (2026-10-21): read from the Claude app's own records, only the
// two ids and the title. A record that is malformed, or a terminal session with no record, gives nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SessionNames } from '../src/claudenames.ts';
import { JobTracker } from '../src/claudelink.ts';

const CLI = '079c96f8-8311-4a7e-9769-9c07788c5a46', LOCAL = 'local_130e0cc4-9105-4002-ba30-b7b6927c372d';

test('a desktop session: his title and the app link; a terminal one: nothing', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'names-'));
  const dir = path.join(root, 'claude_x', 'claude-code-sessions', 'a', 'b');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, LOCAL + '.json'), JSON.stringify({ sessionId: LOCAL, cliSessionId: CLI, title: 'Aang/Samara\n', secret: 'never read' }));
  writeFileSync(path.join(dir, 'local_00000000-0000-0000-0000-000000000000.json'), '{ broken');
  const n = new SessionNames(root);
  let told = 0; n.onChange = () => { told++; };
  // 2026-10-21: read in the background; of() answers from what the last read found.
  assert.equal(n.of(CLI), null);
  await n.refresh();
  assert.equal(told, 1, 'a refresh that learned a name says so, so the jobs are sent again');
  assert.deepEqual(n.of(CLI), { title: 'Aang/Samara', open: `claude://claude.ai/epitaxy/${LOCAL}` });
  assert.equal(n.of('11111111-2222-3333-4444-555555555555'), null);
  assert.equal(n.of('../../etc'), null);

  const t = new JobTracker(n);
  t.event({ session: CLI, type: 'start', cwd: 'C:/Users/Shadow/job-hunt-data' }, 0);
  t.event({ session: '11111111-2222-3333-4444-555555555555', type: 'start', cwd: 'C:/code/Waymark' }, 0);
  const [a, b] = t.list().sort((x, y) => x.title.localeCompare(y.title));
  assert.equal(a!.title, 'Aang/Samara'); assert.equal(a!.open, `claude://claude.ai/epitaxy/${LOCAL}`);
  assert.equal(b!.title, 'Waymark'); assert.equal(b!.open, null);
});

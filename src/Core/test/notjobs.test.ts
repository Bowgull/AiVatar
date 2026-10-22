import './_env.ts';
// 2026-10-22: a bench's question ("how many legs does a spider have", src/Core) showed up as a finished job card.
// Tests, benches, temp folders and Aang's own lanes are never his jobs; AangApp itself and src/Core still are.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { notHisCwd } from '../src/notjobs.ts';
import { readTranscript } from '../src/claudescan.ts';

const TMP = 'C:\\Users\\Shadow\\AppData\\Local\\Temp';

test('tests, temp folders and Aang lanes are not his; his real folders are', () => {
  for (const c of ['C:\\Users\\Shadow\\Documents\\AangApp\\src\\Core\\test', 'C:\\Users\\Shadow\\Documents\\AangApp\\src\\Core\\test\\fixtures',
    `${TMP}\\aang-test-x1`, 'C:\\Users\\Shadow\\Documents\\Aang\\.aang-self', 'D:\\x\\.aang-test', '/tmp/aang', 'C:\\Elsewhere\\Tmp\\run'])
    assert.equal(notHisCwd(c, '', 'C:\\Elsewhere\\Tmp'), true, c);
  for (const c of ['C:\\Users\\Shadow\\Documents\\AangApp', 'C:\\Users\\Shadow\\Documents\\AangApp\\src\\Core', 'C:\\Users\\Shadow\\Documents\\Aang',
    'C:\\code\\testing', 'C:\\Users\\Shadow\\Documents\\AangApp\\src\\Core\\tests-notes', 'C:\\Elsewhere\\Tmpx', '', undefined])
    assert.equal(notHisCwd(c, '', 'C:\\Elsewhere\\Tmp'), false, String(c));
  assert.equal(notHisCwd('c:/data/own/', 'C:\\data\\own'), true, "the brain's own selfCwd, any spelling");
});

test('a transcript from a test folder never becomes a job; his AangApp one still does', () => {
  const line = (cwd: string) => JSON.stringify({ type: 'user', sessionId: '11111111-2222-3333-4444-555555555555', cwd, entrypoint: 'claude-desktop', isSidechain: false, uuid: 'u1', message: { role: 'user', content: 'how many legs does a spider have' } }) + '\n';
  const now = Date.now();
  assert.notEqual(readTranscript(line('C:\\Users\\Shadow\\Documents\\AangApp'), true, now, '', now), null, 'his own AangApp session still counts');
  assert.equal(readTranscript(line('C:\\Users\\Shadow\\Documents\\AangApp\\src\\Core\\test'), true, now, '', now), null);
});

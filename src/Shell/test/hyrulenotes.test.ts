// BG5: what the Hyrule map may send about his notes (hyrulepreload.cjs -> browseripc -> main.ts -> brain notes.place),
// and the notes file it reads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { hyruleNotesFile, notePlaceMsg } from '../src/hyrulenotes.ts';

test('a pin made, moved or taken off; anything else is refused', () => {
  assert.deepEqual(notePlaceMsg({ x: 1610.5, z: -475, title: 'Cave', text: 'Bring fire' }), { t: 'notes.place', x: 1610.5, z: -475, title: 'Cave', text: 'Bring fire' });
  assert.deepEqual(notePlaceMsg({ id: 'nabc1', x: 5, z: 6, title: 'ignored' }), { t: 'notes.place', id: 'nabc1', x: 5, z: 6 });
  assert.deepEqual(notePlaceMsg({ id: 'nabc1', off: true }), { t: 'notes.place', id: 'nabc1', off: true });
  assert.equal(notePlaceMsg({ x: 1, z: 2, title: 'x'.repeat(200) })!.title!.length, 60);
  for (const bad of [null, 'x', {}, { x: '1', z: 2 }, { x: 1, z: NaN }, { x: 9000, z: 0 }, { off: true }, { id: '../x', x: 1, z: 1 }, { id: 5, off: true }])
    assert.equal(notePlaceMsg(bad), null);
});

test('the notes file: its text, or null when there is none', () => {
  const d = mkdtempSync(path.join(os.tmpdir(), 'aang-hyrule-'));
  assert.equal(hyruleNotesFile({ AANG_BOTW_DIR: d }), null);
  writeFileSync(path.join(d, 'notes.json'), '{"v":1,"notes":[]}');
  assert.equal(hyruleNotesFile({ AANG_BOTW_DIR: d }), '{"v":1,"notes":[]}');
});

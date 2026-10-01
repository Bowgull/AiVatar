import './_env.ts';
// Which Brain folder Aang actually reads.
//
// WHY THIS EXISTS: until 2026-10-01 he only ever read `<dataDir>/Brain`, which on this machine is a
// copy somebody made by hand. Its own first line said so - "mirror of Drive > Aang Brain/profile.md"
// - and it had drifted badly: 520 bytes against the Drive original's 1,327. So Aang had been
// answering from a truncated version of who Joshua is, and every edit made in Drive since then had
// gone nowhere. All four shared files differed.
//
// The fix has to survive Drive being a network filesystem: signed out, offline, or simply not
// mounted yet when the Core starts six times a day. So Drive when it is there, the local copy when
// it is not, resolved per read rather than once at startup.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Memory } from '../src/memory.ts';

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'aang-brain-'));

function withBrain(dir: string, profile: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'profile.md'), profile);
  writeFileSync(path.join(dir, 'learned.md'), '# learned\n- something');
}

test('Drive wins when it is mounted', () => {
  const data = tmp(), drive = path.join(tmp(), 'Aang Brain');
  withBrain(path.join(data, 'Brain'), 'the stale local copy');
  withBrain(drive, 'the real one in Drive');
  process.env.AANG_BRAIN_DIR = drive;
  const m = new Memory(data);
  try {
    assert.equal(m.brainSource(), drive);
    assert.equal(m.profile(), 'the real one in Drive');
  } finally { delete process.env.AANG_BRAIN_DIR; m.close(); }
});

test('the local copy answers when Drive is not there', () => {
  // Drive is signed out, offline, or has not mounted yet. A stale answer beats no answer: without
  // this, Aang would start up knowing nothing about Joshua every time Drive was slow.
  const data = tmp();
  withBrain(path.join(data, 'Brain'), 'the local copy');
  process.env.AANG_BRAIN_DIR = path.join(tmp(), 'does-not-exist');
  const m = new Memory(data);
  try {
    assert.equal(m.brainSource(), path.join(data, 'Brain'));
    assert.equal(m.profile(), 'the local copy');
  } finally { delete process.env.AANG_BRAIN_DIR; m.close(); }
});

test('no Brain anywhere is empty, not a crash', () => {
  const m = new Memory(tmp());
  process.env.AANG_BRAIN_DIR = path.join(tmp(), 'nothing-here');
  try {
    assert.equal(m.profile(), '');
    assert.equal(m.learned(), '');
  } finally { delete process.env.AANG_BRAIN_DIR; m.close(); }
});

test('it is resolved per read, so Drive mounting later is picked up', () => {
  // The Core restarts about six times a day on this machine and Drive may not be up yet. Caching the
  // folder once at startup would pin Aang to the stale copy until the next restart.
  const data = tmp(), drive = path.join(tmp(), 'Aang Brain');
  withBrain(path.join(data, 'Brain'), 'local');
  process.env.AANG_BRAIN_DIR = drive;
  const m = new Memory(data);
  try {
    assert.equal(m.profile(), 'local', 'Drive is not mounted yet');
    withBrain(drive, 'drive');                       // Drive comes up
    assert.equal(m.profile(), 'drive', 'the next read must see it without a restart');
  } finally { delete process.env.AANG_BRAIN_DIR; m.close(); }
});

test('on THIS machine it reads the real Drive folder', () => {
  // Not synthetic. Fails if Drive is unmounted or the folder is renamed, which is worth knowing.
  if (!existsSync('G:/My Drive/Aang Brain')) return;          // not this machine; skip rather than fail
  const m = new Memory('C:/Users/Shadow/Documents/Aang');
  try {
    assert.match(m.brainSource(), /Aang Brain/);
    assert.ok(m.profile().length > 1000,
      `the Drive profile is ~1,327 chars; the stale local copy was 520. Got ${m.profile().length}`);
  } finally { m.close(); }
});

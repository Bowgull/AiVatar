import './_env.ts';
// Aang reads the whole vault and writes to exactly one folder in it.
//
// WHY THIS EXISTS: on 2026-10-02 Joshua's vault moved onto this machine and under git, and Aang was given
// a place in it. The failure mode actually documented for agents editing vaults is not "generated noise" -
// that claim turned out to be an opinion with no longitudinal evidence behind it. The real one is writing
// to the WRONG NOTE, the file next to the one it retrieved. So the boundary is enforced in the write gate,
// where it is impossible rather than merely unlikely.
//
// 1,088 of his 1,183 notes are old AI session handoffs. The ~95 he wrote himself are the asset, and every
// one of them is outside Aang's folder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { refusal, offLimits, VAULT_DIR, VAULT_WRITABLE } from '../src/files.ts';

const p = { stateDir: path.join('C:', 'Aang', 'state'), dataDir: path.join('C:', 'Aang', 'data') };
const inVault = (...bits: string[]) => path.join(VAULT_DIR, ...bits);

test('he may write inside his own folder', () => {
  for (const f of ['Aang.md', 'What he knows.md', path.join('notes', 'deep.md')]) {
    const r = refusal(path.join(VAULT_WRITABLE, f), p);
    assert.equal(r, null, `should have been allowed: ${f} (${r})`);
  }
});

test('he may NOT write anywhere else in the vault', () => {
  const forbidden = [
    inVault('00_Atlas', 'GitHub Project Map.md'),
    inVault('10_Projects', 'CereBro', 'CereBro.md'),
    inVault('20_Knowledge', 'Sources', 'GitHub', 'GitHub Sources.md'),
    inVault('90_Archive', 'anything.md'),
    inVault('README.md'),
    // The one that matters most: a sibling of his own folder, which is what "wrong target note" looks like.
    inVault('10_Projects', 'Aang Notes.md'),
  ];
  for (const f of forbidden) {
    const r = refusal(f, p);
    assert.ok(r, `should have been refused: ${f}`);
    assert.match(r!, /vault/i, `the refusal should say why: ${r}`);
  }
});

test('a path that only looks like his folder is still refused', () => {
  // Prefix matching done carelessly would allow "10_Projects/Aangsomething".
  const sneaky = inVault('10_Projects', 'Aang-backup', 'note.md');
  const r = refusal(sneaky, p);
  assert.ok(r, 'a folder whose name merely starts with Aang is not his folder');
});

test('reading the vault is not blocked', () => {
  // The whole point: he reads everything, writes almost nothing. offLimits governs reads.
  for (const f of [inVault('00_Atlas', 'GitHub Project Map.md'), inVault('90_Archive', 'old.md')]) {
    assert.equal(offLimits(f), null, `reading should be allowed: ${f}`);
  }
});

test('the vault rule did not weaken the rules that were already there', () => {
  // Someone else's data, and his own machinery, must still be refused exactly as before.
  assert.ok(offLimits(path.join('G:', 'My Drive', "Lindsay's Job Hunt", 'cv.md')), 'her folder is still off limits');
  assert.ok(refusal(path.join(p.stateDir, 'trust.json'), p), 'his own settings folder is still protected');
  assert.ok(refusal(path.join(p.dataDir, 'aang.db'), p), 'his memory database is still protected');
});

import './_env.ts';
// Places that are nobody's to open, however the request is phrased.
//
// WHY THIS EXISTS: Joshua gave one instruction twice and without qualification - "My Drive contains
// a folder called `Lindsay's Job Hunt`. That is someone else's data. Exclude it explicitly and
// permanently." Until 2026-10-01 that instruction existed only as a sentence in a document, which is
// advice. refusal() protected Aang's own state, his database and Windows, and reads were not
// path-checked at all, so nothing in code honoured it.
//
// Checking Drive on 2026-10-01 found TWO such folders, which is why the matching normalises names
// instead of comparing paths: `Lindsay's Job Hunt` owned by Joshua in his own My Drive (the one that
// actually mirrors onto this disk), and `🎯 Lindsay's Job Hunt` owned by her and shared with him. A
// rule written for the plain name would have missed the second one entirely.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { offLimits, refusal } from '../src/files.ts';

const home = os.homedir();
const P = { stateDir: 'C:/Users/Shadow/AppData/Roaming/Aang', dataDir: 'C:/Users/Shadow/Documents/Aang' };

test('both of the real Lindsay folders are refused, emoji included', () => {
  // The two that actually exist, as Drive reports them.
  for (const dir of [
    'G:/My Drive/Lindsay\'s Job Hunt',
    'G:/My Drive/🎯 Lindsay\'s Job Hunt',
    'G:/Shared with me/🎯 Lindsay\'s Job Hunt/Job Lanes/Resume/resume.docx',
  ]) {
    const why = offLimits(dir);
    assert.ok(why, `${dir} must be refused`);
    assert.match(why, /someone else/i, 'and the reason must say whose it is, not just "no"');
  }
});

test('the apostrophe Google and Windows actually produce is handled', () => {
  // A curly apostrophe is what a Google Doc title and a Windows rename both give you, and it is a
  // different character from the one in the source. Comparing raw strings would miss it.
  for (const name of ['Lindsay\u2019s Job Hunt', 'Lindsay\u2018s Job Hunt', 'LINDSAY\'S JOB HUNT']) {
    assert.ok(offLimits(`G:/My Drive/${name}/notes.md`), `${name} must still match`);
  }
});

test('it matches the folder wherever it sits, not one fixed path', () => {
  // Matching by name rather than path is deliberate: the folder can be moved, re-shared, or synced
  // to a different drive letter, and the instruction was about the data, not the location.
  for (const p of [
    'D:/Backups/Lindsay\'s Job Hunt/tracker.xlsx',
    'C:/Users/Shadow/Downloads/lindsay\'s job hunt/resume.pdf',
    'G:/My Drive/Archive/2026/Lindsay\'s Job Hunt/cover letter.docx',
  ]) assert.ok(offLimits(p), `${p} must be refused`);
});

test('a folder that merely mentions her is NOT refused', () => {
  // The rule has to be narrow enough to stay honest. Over-matching would quietly block Joshua's own
  // files and he would not know why.
  for (const p of [
    'G:/My Drive/Lindsay birthday ideas/list.md',
    'G:/My Drive/Job Hunt/resume.docx',
    'C:/Users/Shadow/Documents/lindsay.txt',
  ]) assert.equal(offLimits(p), null, `${p} should be allowed`);
});

test('key and credential stores are refused', () => {
  for (const [p, expect] of [
    [path.join(home, '.ssh', 'id_rsa'), /SSH/i],
    [path.join(home, '.ssh'), /SSH/i],
    [path.join(home, '.aws', 'credentials'), /AWS/i],
    [path.join(home, '.gnupg', 'secring.gpg'), /GPG/i],
    [path.join(home, '.claude', 'projects', 'x.jsonl'), /Claude login|session history/i],
  ] as const) {
    const why = offLimits(p);
    assert.ok(why, `${p} must be refused`);
    assert.match(why, expect);
  }
});

test('.env files are refused wherever they live', () => {
  for (const p of [
    'C:/Users/Shadow/Documents/project/.env',
    'C:/Users/Shadow/Documents/project/.env.local',
    'C:/Users/Shadow/Documents/project/.env.production',
  ]) assert.match(offLimits(p) ?? '', /keys and passwords/i, `${p} must be refused`);
  // ...but a file that merely starts with those letters is fine.
  assert.equal(offLimits('C:/Users/Shadow/Documents/environment-notes.md'), null);
});

test('browser profiles are refused: that is where saved passwords live', () => {
  for (const p of [
    'C:/Users/Shadow/AppData/Local/Google/Chrome/User Data/Default/Login Data',
    'C:/Users/Shadow/AppData/Local/Microsoft/Edge/User Data/Default/Cookies',
    'C:/Users/Shadow/AppData/Roaming/Mozilla/Firefox/Profiles/abc.default/logins.json',
  ]) assert.match(offLimits(p) ?? '', /browser profile/i, `${p} must be refused`);
});

test('ordinary files are untouched', () => {
  // The guard must not quietly swallow the documents this whole phase exists to let him read.
  for (const p of [
    'G:/My Drive/Job Search 2026/Master Resume/resume.docx',
    'C:/Users/Shadow/Documents/Aang/Brain/profile.md',
    'C:/Users/Shadow/Documents/notes.txt',
  ]) assert.equal(offLimits(p), null, `${p} should be allowed`);
});

test('writing to an off-limits path is refused too, with the same reason', () => {
  // refusal() guards writes and now defers to offLimits first, so there is one list rather than two
  // that drift apart.
  assert.match(refusal(path.join(home, '.ssh', 'authorized_keys'), P) ?? '', /SSH/i);
  assert.match(refusal('G:/My Drive/Lindsay\'s Job Hunt/notes.md', P) ?? '', /someone else/i);
});

test('the paths refusal() already protected still are', () => {
  // Regression guard: offLimits running first must not have displaced the original rules.
  //
  // The stateDir rule is deliberately NOT asserted here, and it is worth saying why rather than
  // leaving a gap. Inside the Claude desktop app, realpathSync.native on a FILE under
  // %APPDATA% returns the MSIX package's private copy
  // (AppData\Local\Packages\Claude_*\LocalCache\Roaming\...), while on the DIRECTORY it returns
  // the normal path - so the two sides of the comparison disagree and the rule reads as null. The
  // real Core runs outside that sandbox, where both resolve the same way, and this behaviour
  // predates any of today's changes (confirmed by running the same check against the committed
  // version). Asserting it from here would test the harness, not the rule.
  assert.match(refusal(path.join(P.dataDir, 'aang.db'), P) ?? '', /memory database/i);
  assert.match(refusal('C:/Windows/System32/drivers/etc/hosts', P) ?? '', /Windows/i);
  assert.match(refusal('notes.txt', P) ?? '', /full path/i);
});

// The MOCKUPS tidy (2026-10-22): the rules in src/mockuptidy.ts on a fixture shaped like his real mockups.json (sheet
// 45 and its lettered children, 51/59/60/61 with several versions, branches), plus the cases the real one does not have
// yet: duplicates, a sheet gone from the repo, a superseded sheet left alone for weeks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os'; import path from 'node:path';
import { DAY, isPicked, saysDecided, sheetLabel, slugOf, tidyDue, tidyLine, tidyMockups, type TidyVersion } from '../src/mockuptidy.ts';
import { MockStore } from '../src/mockups.ts';

const NOW = Date.UTC(2026, 9, 22, 15, 0);
const D = (p: string) => `docs/cockpit/${p}.html`;
let id = 0;
const ver = (sheet: string, title: string, daysAgo: number, key: string, v: number, commit = 'a'.repeat(40 - String(id).length) + String(id)): TidyVersion =>
  ({ id: ++id, sheet: D(sheet), title, commit, at: NOW - daysAgo * DAY, key, v });

/** His trail as it is today, give or take, and the extra mess the tidy is for. */
function fixture(): TidyVersion[] {
  id = 0;
  const L: TidyVersion[] = [
    ver('sheet-45b-progress', '45b · Progress, icons, keys', 1.2, 'k45b', 1),
    ver('sheet-45c-frames', '45c · Frames, the WoW way', 20, 'k45c', 1),
    ver('sheet-45d-frames', '45d · Frame A, softened', 19, 'k45d', 1),
    ver('sheet-45-claude-both-ways', '45 · Both ways', 1.2, 'k45', 1),
    ver('sheet-51-choices-glow-type', '51 · Choices, glow, type', 1, 'k51a', 1),
    ver('sheet-51-choices-glow-type', '51 · Choices, glow, type', 0.9, 'k51b', 2),
  ];
  // 59: five different pictures, the newest at the end.
  for (let i = 1; i <= 5; i++) L.push(ver('sheet-59-mini-player', '59 · Spotify mini player', 0.5 - i * 0.05, 'k59-' + i, i));
  // 60: four pictures.
  for (let i = 1; i <= 4; i++) L.push(ver('sheet-60-notes', '60 · Notes', 0.5 - i * 0.05, 'k60-' + i, i));
  // Duplicates: 61 opened three times with the same picture (same key), and twice at the same commit.
  const c61 = 'c'.repeat(40);
  L.push(ver('sheet-61-hotkeys', '61 · Hotkeys', 0.4, 'k61', 1, c61), ver('sheet-61-hotkeys', '61 · Hotkeys', 0.3, 'k61', 1, c61), ver('sheet-61-hotkeys', 'Sheet 61 - Hotkeys', 0.2, 'k61', 1, 'd'.repeat(40)));
  // A sheet whose file was renamed away (gone from HEAD).
  L.push(ver('sheet-50-rune-popout', '50 · Rune chip and pop-out', 1.1, 'k50', 1));
  // An old idea, untouched for three weeks, that a newer sheet with the same words replaces; and one decided, also old.
  L.push(ver('sheet-30-wood-rim', '30 · Wood rim', 21, 'k30', 1), ver('sheet-54-wood-rim', '54 · Wood rim', 1, 'k54', 1));
  L.push(ver('sheet-31-quiet-rim', '31 · Quiet rim', 25, 'k31', 1), ver('sheet-55-quiet-rim', '55 · Quiet rim', 1, 'k55', 1));
  return L;
}
const exists = (s: string) => (s.includes('sheet-50-') ? false : s.includes('sheet-61-') ? null : true);

test('names: every title shape reads as "NN · Name"', () => {
  assert.equal(sheetLabel('59 · Spotify mini player', D('sheet-59-mini-player')).label, '59 · Spotify mini player');
  assert.equal(sheetLabel('Sheet 61 - Hotkeys', D('sheet-61-hotkeys')).label, '61 · Hotkeys');
  assert.equal(sheetLabel('45b · Progress, icons, keys', D('sheet-45b-progress')).num, '45b');
  assert.equal(sheetLabel('Addons + coach', D('sheet-65-addons-coach')).label, '65 · Addons + coach');
  assert.equal(sheetLabel('', D('sheet-62-send-to-aang')).label, '62 · Send to aang');
  assert.equal(sheetLabel('3D views', 'docs/x/views.html').label, '3D views');
  assert.equal(sheetLabel('59: Spotify', D('sheet-59-mini-player')).label, '59 · Spotify');
  assert.equal(slugOf(D('sheet-45c-frames')), 'frames');
});

test('decided: the sheet\'s own strip or stamp, and his mark wins', () => {
  assert.equal(saysDecided('<div class="decided"><span>Look B</span></div>'), true);
  assert.equal(saysDecided('<p class="topick"><span>DECIDED</span> <em>Flush</em></p>'), true);
  assert.equal(saysDecided('<p>Nothing decided yet, pick one.</p>'), false);
  assert.equal(isPicked({ decided: true }), true);
  assert.equal(isPicked({ decided: true, picked: false }), false);
  assert.equal(isPicked({ picked: true }), true);
});

test('the tidy on his trail: merges, folds, archives, deletes nothing', () => {
  const before = fixture();
  const meta = { [D('sheet-31-quiet-rim')]: { decided: true } };
  const r = tidyMockups({ versions: before, meta, open: new Set([D('sheet-59-mini-player')]), exists, now: NOW });
  // MERGE: 61's three lines are one picture: one line, the two older times ride on it.
  const l61 = r.versions.filter((x) => x.sheet === D('sheet-61-hotkeys'));
  assert.equal(l61.length, 1);
  assert.equal(l61[0]!.seen?.length, 2);
  assert.equal(r.report.merged, 2);
  // FOLD: 59 has 5 pictures, 60 has 4: the newest 3 stay out, 2 + 1 fold.
  const old59 = r.versions.filter((x) => x.sheet === D('sheet-59-mini-player') && x.old).map((x) => x.v).sort();
  assert.deepEqual(old59, [1, 2]);
  assert.equal(r.versions.filter((x) => x.sheet === D('sheet-60-notes') && x.old).length, 1);
  assert.equal(r.report.folded, 3);
  // GONE: 50 is not in HEAD any more; 61 is unknown (git could not say) and stays.
  assert.equal(r.meta[D('sheet-50-rune-popout')]?.why, 'gone');
  assert.equal(r.meta[D('sheet-61-hotkeys')]?.archived, undefined);
  // STALE: 30 is replaced by 54 (same words, newer, untouched 3 weeks); 31 is decided, so it stays; 45c is replaced by
  // 45d (same file words) but 45d is itself old and both are 45's children... 45d is newer, so 45c goes, 45d stays.
  assert.equal(r.meta[D('sheet-30-wood-rim')]?.why, 'stale');
  assert.equal(r.meta[D('sheet-30-wood-rim')]?.by, D('sheet-54-wood-rim'));
  assert.equal(r.meta[D('sheet-31-quiet-rim')]?.archived, undefined);
  assert.equal(r.meta[D('sheet-45c-frames')]?.why, 'stale');
  assert.equal(r.meta[D('sheet-45d-frames')]?.archived, undefined);
  assert.equal(r.report.archived, 2);
  assert.equal(r.report.gone, 1);
  // Nothing is lost: every picture of every sheet is still there.
  const pics = (l: TidyVersion[]) => new Set(l.map((x) => x.sheet + '|' + x.key));
  assert.deepEqual(pics(r.versions), pics(before));
  // The inputs are not changed.
  assert.equal(before.some((x) => x.old), false);
  assert.equal(tidyLine(r.report), 'Folded 3 old versions, merged 2 duplicates, archived 3 (1 gone from the repo).');
  // Twice is the same as once.
  const again = tidyMockups({ versions: r.versions, meta: r.meta, open: new Set(), exists, now: NOW + 1000 });
  assert.equal(tidyLine(again.report), '');
});

test('open, recent, restored and picked sheets are never archived; a sheet back in the repo comes back', () => {
  const v = fixture();
  const keep = tidyMockups({ versions: v, meta: { [D('sheet-30-wood-rim')]: { kept: true }, [D('sheet-45c-frames')]: { opened: NOW - 2 * DAY } }, open: new Set([D('sheet-31-quiet-rim')]), exists: () => true, now: NOW });
  assert.equal(keep.report.archived, 0);
  const back = tidyMockups({ versions: v, meta: { [D('sheet-50-rune-popout')]: { archived: NOW - DAY, why: 'gone' } }, open: new Set(), exists: () => true, now: NOW });
  assert.equal(back.meta[D('sheet-50-rune-popout')]?.archived, undefined);
  assert.equal(back.report.back, 1);
  // A hand archive is his: the tidy never brings it back.
  const hand = tidyMockups({ versions: v, meta: { [D('sheet-60-notes')]: { archived: NOW - DAY, why: 'hand' } }, open: new Set(), exists: () => true, now: NOW });
  assert.equal(hand.meta[D('sheet-60-notes')]?.why, 'hand');
});

test('once a day', () => {
  assert.equal(tidyDue(0, NOW), true);
  assert.equal(tidyDue(NOW - 3 * 3600_000, NOW), false);
  assert.equal(tidyDue(NOW - DAY, NOW), true);
});

test('the store keeps it: tidy, archive by hand, restore, picked, all saved and read back', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'mocktidy-'));
  const file = path.join(dir, 'mockups.json');
  const st = new MockStore(file);
  for (const x of fixture()) st.add(x.sheet, x.title, x.commit, x.key, x.at);
  const n = st.list.length;
  const rep = st.tidy(new Set(), exists, NOW);
  assert.equal(rep.merged, 2);
  assert.equal(st.list.length, n - 2);
  assert.equal(st.archive(D('sheet-60-notes'), NOW), '');
  assert.equal(st.setPicked(D('sheet-59-mini-player'), true), '');
  const back = new MockStore(file);
  assert.equal(back.tidiedAt, NOW);
  assert.equal(back.meta.get(D('sheet-60-notes'))?.why, 'hand');
  assert.equal(back.meta.get(D('sheet-59-mini-player'))?.picked, true);
  assert.equal(back.list.filter((x) => x.old).length, 3);
  assert.equal(back.restore(D('sheet-60-notes'), NOW), '');
  assert.equal(new MockStore(file).meta.get(D('sheet-60-notes'))?.kept, true);
  // Claude opening an archived sheet again brings it back by itself.
  back.archive(D('sheet-45d-frames'), NOW);
  back.add(D('sheet-45d-frames'), '45d · Frame A, softened', 'e'.repeat(40), 'k45d-2', NOW + 1);
  assert.equal(back.archived(D('sheet-45d-frames')), false);
  assert.ok(JSON.parse(readFileSync(file, 'utf8')).meta);
});

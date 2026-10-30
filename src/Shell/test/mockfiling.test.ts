// Sheet 107 (2026-10-30): Mockups files a sheet in a real project, topics inside, one sheet per number per project.
// The rules in src/mockfiling.ts on a fixture shaped like his mockups.json as it was (91 twice, 92 and 98 under two
// topics, 97 and 99 with "(v2)" in their titles, Waymark's numbers on top of Samara's, Mac home under the wrong
// project), then the store: filed once with a copy kept, and a new arrival joining the sheet it already is.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os'; import path from 'node:path';
import { branchHome, cleanTitle, fileOnce, plainName, projectFromSrc, projectName, shownNum, type FileState } from '../src/mockfiling.ts';
import { MockStore, srcOf } from '../src/mockups.ts';

const C = (n: number) => String(n).padStart(40, 'c');
let id = 0, at = Date.UTC(2026, 9, 20);
const v = (sheet: string, title: string, key: string, vv = 1, extra: Record<string, unknown> = {}) => ({ id: ++id, sheet, title, commit: sheet.startsWith('http') ? '' : C(id), at: at += 60_000, key: sheet.startsWith('http') ? 'live' : key, v: vv, ...extra });
const R = (f: string) => `@AiVatar/docs/cockpit/${f}.html`;

function fixture(): FileState {
  id = 0; at = Date.UTC(2026, 9, 20);
  return {
    versions: [
      v('http://127.0.0.1:8792/docs/cockpit/sheet-91-jiji-cat.html', '91 · The cat, Jiji style', ''),
      v(R('sheet-91-jiji-cat'), '91 · Jiji cat page', 'k91a', 1), v(R('sheet-91-jiji-cat'), '91 · Jiji cat page', 'k91b', 2, { stage: 'built' }),
      v('http://127.0.0.1:8792/docs/cockpit/sheet-92-notices.html', '92 · Notices', ''),
      v(R('sheet-92-notices'), '92 · Notices', 'k92a', 1), v(R('sheet-92-notices'), '92 · Notices', 'k92b', 2, { stage: 'chat' }),
      v('http://127.0.0.1:8798/docs/cockpit/sheet-98-bar-and-notices.html', '98 · Top bar and notices', ''),
      v(R('sheet-98-bar-and-notices'), '98 · Bar and notices', 'k98', 1, { stage: 'park' }),
      v('http://127.0.0.1:8792/docs/cockpit/sheet-97-claude-in-samara.html', '97 · Claude in Samara, one sign', ''),
      v('http://127.0.0.1:8792/docs/cockpit/sheet-97-claude-in-samara.html?v=2', '97 · Claude in Samara, one sign (v2)', ''),
      v('http://127.0.0.1:8792/docs/cockpit/sheet-99-send-to-tv.html?v=1', '99 · Send to TV', ''),
      v('http://127.0.0.1:8792/docs/cockpit/sheet-99-send-to-tv.html?v=2', '99 · Send to TV, one click (v2)', ''),
      v('http://127.0.0.1:8792/docs/cockpit/sheet-99-send-to-tv.html?v=3', '99 · Send to TV, one click (v3)', ''),
      v(R('sheet-75-light-and-pinpads'), '75 · The light and its PIN pad', 'k75'),
      v('http://127.0.0.1:8765/75-ledger-ring-miss.html', '75 · Ledger ring miss', ''),
      v('http://127.0.0.1:8765/79-ledger-boards.html', '79 · Ledger boards', ''),
      v('http://127.0.0.1:8765/79-ledger-boards.html?v=ring3', '79 · Ledger boards', ''),
      v('http://127.0.0.1:47901/sheet-101-aang-on-the-mac.html', '101 · Aang on the Mac', ''),
      v('@AiVatar-fixes/docs/cockpit/sheet-103-menu-and-timer.html', '103 · Smaller menu, typed timer', 'k103'),
      v(R('sheet-105-sideways-marks'), '105 · Sideways marks', 'k105'),
      v('http://127.0.0.1:47830/mockups/10-willow-campfire.html', '10 · Willow Campfire', ''),
      v('http://127.0.0.1:8766/mockups/01-couch-mode.html', '01 · Couch Mode', ''),
      v(R('sheet-68-title-cards'), '68 · Showcase title cards', 'k68'),
    ],
    branches: [
      { id: 1, name: 'Showcase', folded: false }, { id: 2, name: 'Samara', folded: false }, { id: 3, name: 'Waymark', folded: true, project: 'Live pages' },
      { id: 7, name: 'tv', folded: true }, { id: 8, name: 'couch-mode', folded: true }, { id: 10, name: 'notices', folded: false, icon: 'bell' }, { id: 11, name: 'claude', folded: false },
      { id: 14, name: 'top bar', folded: false }, { id: 15, name: 'campfire-scene', folded: false }, { id: 16, name: 'Mac home', folded: false },
      { id: 17, name: 'Mac home', folded: false, project: 'AiVatar Fixes' }, { id: 18, name: 'aang-marks', folded: false, project: 'Samara' },
      { id: 19, name: 'samara-notices', folded: false, project: 'Samara' }, { id: 20, name: 'samara-pages', folded: false, project: 'Samara' },
    ],
    places: {
      'http://127.0.0.1:8792/docs/cockpit/sheet-91-jiji-cat.html': { branch: 2, parent: null }, [R('sheet-91-jiji-cat')]: { branch: 20, parent: null },
      'http://127.0.0.1:8792/docs/cockpit/sheet-92-notices.html': { branch: 10, parent: null }, [R('sheet-92-notices')]: { branch: 19, parent: null },
      'http://127.0.0.1:8798/docs/cockpit/sheet-98-bar-and-notices.html': { branch: 14, parent: null }, [R('sheet-98-bar-and-notices')]: { branch: 19, parent: null },
      'http://127.0.0.1:8792/docs/cockpit/sheet-97-claude-in-samara.html': { branch: 11, parent: null }, 'http://127.0.0.1:8792/docs/cockpit/sheet-97-claude-in-samara.html?v=2': { branch: 11, parent: null },
      'http://127.0.0.1:8792/docs/cockpit/sheet-99-send-to-tv.html?v=1': { branch: 7, parent: null }, 'http://127.0.0.1:8792/docs/cockpit/sheet-99-send-to-tv.html?v=2': { branch: 7, parent: null },
      'http://127.0.0.1:8792/docs/cockpit/sheet-99-send-to-tv.html?v=3': { branch: 7, parent: null },
      [R('sheet-75-light-and-pinpads')]: { branch: 2, parent: null }, 'http://127.0.0.1:8765/75-ledger-ring-miss.html': { branch: 3, parent: null },
      'http://127.0.0.1:8765/79-ledger-boards.html': { branch: 3, parent: null }, 'http://127.0.0.1:8765/79-ledger-boards.html?v=ring3': { branch: 3, parent: null },
      'http://127.0.0.1:47901/sheet-101-aang-on-the-mac.html': { branch: 16, parent: null }, '@AiVatar-fixes/docs/cockpit/sheet-103-menu-and-timer.html': { branch: 17, parent: null },
      [R('sheet-105-sideways-marks')]: { branch: 18, parent: null }, 'http://127.0.0.1:47830/mockups/10-willow-campfire.html': { branch: 15, parent: null },
      'http://127.0.0.1:8766/mockups/01-couch-mode.html': { branch: 8, parent: null }, [R('sheet-68-title-cards')]: { branch: 1, parent: null },
    },
    meta: { [R('sheet-68-title-cards')]: { archived: 1 }, 'http://127.0.0.1:8792/docs/cockpit/sheet-91-jiji-cat.html': { opened: 5 } },
  };
}
/** Each sheet after filing: "Project / Topic | number name | versions". */
function picture(st: FileState): string[] {
  const bid = new Map(st.branches.map((b) => [b.id, b]));
  return [...new Set(st.versions.map((x) => x.sheet))].map((s) => {
    const vs = st.versions.filter((x) => x.sheet === s).sort((a, b) => a.v - b.v), b = bid.get(st.places[s]?.branch ?? -1), n = vs[vs.length - 1]!;
    return `${b?.project} / ${b?.name} | ${shownNum(b?.project ?? '', n.title, srcOf(n))} ${n.title.replace(/^[0-9]+ · /, '')} | ${vs.map((x) => 'v' + x.v).join(',')}`;
  }).sort();
}

test('names: projects are real projects, topics read plainly', () => {
  assert.equal(projectName('couch-mode'), 'Couch Mode');
  assert.equal(projectName('AiVatar Fixes'), 'Samara');
  for (const n of ['AiVatar-update', 'AiVatar', 'AangApp', 'aivatar-sched']) assert.equal(projectName(n), 'Samara', n);   // every worktree of Samara's repo
  assert.equal(projectName('Live pages'), null);
  assert.equal(projectName('anti-slop'), 'Anti-slop');
  assert.equal(projectName('my-new-app'), 'My new app');
  assert.equal(plainName('address-bar'), 'Address bar');
  assert.equal(plainName('tv'), 'TV');
  assert.equal(plainName('Mac home'), 'Mac home');
  assert.deepEqual(branchHome('samara-notices'), { project: 'Samara', topic: 'Notices' });
  assert.deepEqual(branchHome('aang-marks', 'Samara'), { project: 'Aang', topic: 'Marks' });
  assert.deepEqual(branchHome('Mac home', 'AiVatar Fixes'), { project: 'Aang', topic: 'Mac home' });
  assert.deepEqual(branchHome('Waymark', 'Live pages'), { project: 'Waymark', topic: null });
  assert.deepEqual(branchHome('settings'), { project: null, topic: 'Settings' });
  assert.equal(cleanTitle('99 · Send to TV, one click (v3)'), '99 · Send to TV, one click');
  assert.equal(projectFromSrc('@AiVatar-fixes/docs/x.html'), 'Samara');
  assert.equal(projectFromSrc('@couch-mode/mockups/x.html'), 'Couch mode');
  assert.equal(projectFromSrc('http://127.0.0.1:8792/docs/cockpit/sheet-1-x.html'), 'Samara');
  assert.equal(projectFromSrc('http://127.0.0.1:9000/x.html'), 'Other');
});

test('numbers: Samara and Aang plain, every other project wears its letter', () => {
  assert.equal(shownNum('Samara', '106 · Notices', R('sheet-106-notices')), '106');
  assert.equal(shownNum('Aang', '101 · Aang on the Mac', 'http://127.0.0.1:47901/sheet-101-aang-on-the-mac.html'), '101');
  assert.equal(shownNum('Waymark', '75 · Ledger ring miss', 'http://127.0.0.1:8765/75-ledger-ring-miss.html'), 'W75');
  assert.equal(shownNum('Couch Mode', '06 · Campfire Loading', 'http://127.0.0.1:8766/mockups/06-campfire-loading.html'), 'C06');
  assert.equal(shownNum('Waymark', 'Run notes', 'http://127.0.0.1:8765/notes.html'), '');
});

test('his mix-ups, tidied once', () => {
  const inp = fixture(), before = inp.versions.length;
  const { state, report } = fileOnce(inp);
  assert.deepEqual(picture(state), [
    'Aang / Mac home | 101 Aang on the Mac | v1',
    'Aang / Mac home | 103 Smaller menu, typed timer | v1',
    'Aang / Marks | 105 Sideways marks | v1',
    'Couch Mode / Campfire | C10 Willow Campfire | v1',
    'Couch Mode / Other | C01 Couch Mode | v1',
    'Samara / Claude | 97 Claude in Samara, one sign | v1,v2',
    'Samara / Notices | 92 Notices | v1,v2,v3',
    'Samara / Notices | 98 Bar and notices | v1,v2',
    'Samara / Other | 75 The light and its PIN pad | v1',
    'Samara / Pages | 91 Jiji cat page | v1,v2,v3',
    'Samara / TV | 99 Send to TV, one click | v1,v2,v3',
    'Showcase / Other | 68 Showcase title cards | v1',
    'Waymark / Other | W75 Ledger ring miss | v1',
    'Waymark / Other | W79 Ledger boards | v1,v2',
  ]);
  assert.equal(report.merged, 7);
  // Nothing deleted, every version still opens from where it did, the repo's file is the sheet's name.
  assert.equal(state.versions.length, before);
  for (const x of state.versions) assert.equal(srcOf(x), inp.versions.find((y) => y.id === x.id)!.sheet);
  assert.ok(state.versions.filter((x) => x.sheet === R('sheet-91-jiji-cat')).length === 3);
  // The marks stay on their versions; the notes of a merged sheet join it; the archived Showcase sheet stays archived.
  assert.equal((state.versions.find((x) => x.key === 'k91b') as { stage?: string }).stage, 'built');
  assert.equal(state.meta[R('sheet-91-jiji-cat')]?.opened, 5);
  assert.equal(state.meta['http://127.0.0.1:8792/docs/cockpit/sheet-91-jiji-cat.html'], undefined);
  assert.equal(state.meta[R('sheet-68-title-cards')]?.archived, 1);
  // One topic per project and name; Notices keeps its old id and icon.
  const notices = state.branches.filter((b) => b.name === 'Notices');
  assert.equal(notices.length, 1);
  assert.equal(notices[0]!.icon, 'bell');
  assert.ok(state.branches.every((b) => b.project && b.project !== 'Live pages'));
  // Filing twice changes nothing more.
  assert.equal(fileOnce(state).report.merged, 0);
  assert.deepEqual(picture(fileOnce(state).state), picture(state));
});

test('the store: filed once with a copy kept, then a new arrival joins the sheet it already is', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'mockfiling-'));
  const file = path.join(dir, 'mockups.json');
  const inp = fixture();
  writeFileSync(file, JSON.stringify({ v: 1, ...inp }));
  const raw = readFileSync(file, 'utf8');
  const st = new MockStore(file);
  assert.equal(readFileSync(path.join(dir, 'mockups.before-107.json'), 'utf8'), raw);
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).filed, 107);
  assert.equal(st.projectOf(R('sheet-105-sideways-marks')), 'Aang');
  assert.equal(st.projectOf('http://127.0.0.1:8765/75-ledger-ring-miss.html'), 'Waymark');
  // Read again: filed already, nothing moves, the copy is not written over.
  writeFileSync(path.join(dir, 'mockups.before-107.json'), 'kept');
  const again = new MockStore(file);
  assert.equal(again.list.length, inp.versions.length);
  assert.equal(readFileSync(path.join(dir, 'mockups.before-107.json'), 'utf8'), 'kept');
  // Claude sends 99 again as a live page with ?v=4: version 4 of the one sheet 99, its own address kept.
  const n = again.add('http://127.0.0.1:8792/docs/cockpit/sheet-99-send-to-tv.html?v=4', '99 · Send to TV, one click (v4)', '', 'live');
  assert.equal(n.sheet, 'http://127.0.0.1:8792/docs/cockpit/sheet-99-send-to-tv.html?v=3');
  assert.equal(n.src, 'http://127.0.0.1:8792/docs/cockpit/sheet-99-send-to-tv.html?v=4');
  assert.equal(n.v, 4);
  assert.equal(n.title, '99 · Send to TV, one click');
  // The same address again keeps its number; a merged address finds its sheet.
  assert.equal(again.add('http://127.0.0.1:8792/docs/cockpit/sheet-99-send-to-tv.html?v=4', '99 · x', '', 'live').v, 4);
  assert.equal(again.add('http://127.0.0.1:8798/docs/cockpit/sheet-98-bar-and-notices.html', '98 · x', '', 'live').sheet, R('sheet-98-bar-and-notices'));
  // Waymark's 92 is not Samara's 92; a brand new sheet is its own.
  const w = again.add('http://127.0.0.1:8765/92-bag-rounds.html', '92 · Bag rounds', '', 'live', Date.now(), { project: 'Waymark' });
  assert.equal(w.sheet, 'http://127.0.0.1:8765/92-bag-rounds.html');
  assert.equal(again.add(R('sheet-108-new'), '108 · New', C(99), 'k108').sheet, R('sheet-108-new'));
  // NEW until he opens it, and saved.
  again.setFresh(R('sheet-108-new'), true);
  assert.equal(new MockStore(file).meta.get(R('sheet-108-new'))?.fresh, true);
  again.setFresh(R('sheet-108-new'), false);
  assert.equal(new MockStore(file).meta.get(R('sheet-108-new'))?.fresh, undefined);
  // Claude's topic names: a project's name is the project, "samara-notices" is Samara's Notices.
  again.fileInto(R('sheet-108-new'), 'samara-notices');
  const b = again.branches.find((x) => x.id === again.placeOf(R('sheet-108-new')).branch)!;
  assert.deepEqual([b.project, b.name], ['Samara', 'Notices']);
  // A store that never had anything is born filed: no copy.
  const fresh = path.join(dir, 'empty.json');
  new MockStore(fresh).add(R('sheet-1-x'), '1 · X', C(1), 'k1');
  assert.equal(existsSync(path.join(dir, 'empty.before-107.json')), false);
  assert.equal(JSON.parse(readFileSync(fresh, 'utf8')).filed, 107);
});

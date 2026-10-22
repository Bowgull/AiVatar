// The MOCKUPS tidy (2026-10-22): the real browser.html, off screen, its history list before and after "Tidy now". A
// throwaway git repo stands in for AangApp (nothing of his is read or written), shaped like his trail: a sheet with five
// versions, one with four, a duplicate, a sheet deleted from the repo, and an old sheet a newer one replaces.
// Three small pictures: before, after, and after with a sheet, its older fold and the Archive open.
//
// Run: npx electron test/electron/mockups-tidy-check.ts [shots folder]
import { app, BrowserWindow, screen } from 'electron';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, unlinkSync } from 'node:fs';
import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts'; import { AangBrowser } from '../../src/browser.ts'; import { wireBrowser } from '../../src/browseripc.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS NOTE ' + String((e as Error)?.stack ?? e).split('\n').slice(0, 3).join(' | ')); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 90_000).unref();
app.on('window-all-closed', () => {});
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.argv.find((a, i) => i > 1 && !a.endsWith('.ts') && !a.startsWith('-')) ?? path.join(os.tmpdir(), 'mockups-tidy-shots');
mkdirSync(OUT, { recursive: true });
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.showInactive(); };
BrowserWindow.prototype.focus = function () {};
BrowserWindow.prototype.moveTop = function () {};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (fn: () => boolean, ms = 8000) => { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await wait(100); } return fn(); };
let bad = 0;
const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d ? '  -- ' + String(d).slice(0, 240) : ''}`); if (!ok) bad++; };

// ---- the stand-in repo
const repo = mkdtempSync(path.join(os.tmpdir(), 'mocktidy-repo-'));
const g = (...a: string[]) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...a], { encoding: 'utf8' }).trim();
const put = (p: string, s: string) => { mkdirSync(path.dirname(path.join(repo, p)), { recursive: true }); writeFileSync(path.join(repo, p), s); };
const D = (n: string) => `docs/cockpit/sheet-${n}.html`;
const page = (title: string, extra = '') => `<!doctype html><title>${title}</title><body style="background:#141210;color:#eee">${extra}<p>${title}</p></body>`;
const commit = (m: string) => { g('add', '-A'); g('commit', '-q', '-m', m); };
const SHEETS: [string, string, string?][] = [
  ['30-wood-rim', 'Sheet 30 - Wood rim'], ['45-both-ways', 'Sheet 45 - Both ways'], ['45c-frames', 'Sheet 45c - Frames, the WoW way'], ['45d-frames', 'Sheet 45d - Frame A, softened'],
  ['50-rune-popout', 'Sheet 50 - Rune chip and pop-out'], ['54-wood-rim', 'Sheet 54 - Wood rim', '<div class="decided"><span>Look B</span></div>'],
  ['59-mini-player', 'Sheet 59 - Spotify mini player'], ['60-notes', 'Sheet 60 - Notes'], ['61-hotkeys', 'Sheet 61 - Hotkeys'],
];
g('init', '-q');
for (const [f, t, x] of SHEETS) put(D(f), page(t, x));
commit('one');

app.whenReady().then(async () => {
  (screen as any).getCursorScreenPoint = () => ({ x: -20000, y: 500 });
  const st = mkdtempSync(path.join(os.tmpdir(), 'mocktidy-state-'));
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const b = new AangBrowser({ origin: pages.origin, stateDir: st, repoDir: repo, preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'),
    thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs'), testLocal: true }) as any;
  wireBrowser(() => b);
  const notes: string[] = [];
  const realNote = b.note.bind(b); b.note = (t: string) => { notes.push(t); realNote(t); };
  // The daily tidy must not run by itself here: "before" is the mess as it is.
  b.mockStore.tidiedAt = Date.now();
  for (const [f, t] of SHEETS) await b.openMockup(D(f), t.replace(/^Sheet (\w+) - /, '$1 · '));
  await until(() => !!b.win && b.tabs.filter((t: any) => t.mock).length === SHEETS.length, 15000);
  b.mockStore.tidiedAt = Date.now();
  // 59 and 60 get new versions; 61 opened again with the same picture (a duplicate).
  for (let i = 2; i <= 5; i++) { put(D('59-mini-player'), page('Sheet 59 - Spotify mini player', `<i>v${i}</i>`)); if (i <= 4) put(D('60-notes'), page('Sheet 60 - Notes', `<i>v${i}</i>`)); commit('v' + i);
    await b.openMockup(D('59-mini-player'), '59 · Spotify mini player'); if (i <= 4) await b.openMockup(D('60-notes'), '60 · Notes'); }
  await b.openMockup(D('61-hotkeys'), 'Sheet 61 - Hotkeys');
  // 50 leaves the repo.
  unlinkSync(path.join(repo, D('50-rune-popout'))); commit('50 renamed away');
  // 30 and 45c: three weeks untouched (54 and 45d replace them).
  const ago = Date.now() - 21 * 86_400_000;
  for (const x of b.mockStore.list) if ([D('30-wood-rim'), D('45c-frames')].includes(x.sheet)) x.at = ago;
  for (const s of [D('30-wood-rim'), D('45c-frames')]) b.mockStore.meta.get(s).opened = ago;
  for (const x of b.mockStore.list) if (x.sheet === D('45d-frames')) x.at = ago + 86_400_000;
  // Only 59 and 60 stay open as tabs (the tidy never archives an open one).
  for (const t of [...b.tabs]) if (t.mock && ![D('59-mini-player'), D('60-notes')].includes(t.mock.sheet)) b.close(t.id, false);
  await until(() => b.tabs.filter((t: any) => t.mock).length === 2);
  b.mockStore.tidiedAt = Date.now();
  b.mockAct('list', { open: true });
  const w: BrowserWindow = b.win, wc = w.webContents;
  w.setSize(900, 1500); await wait(400);
  await wc.executeJavaScript("document.body.classList.add('drawer-open'); true"); await wait(900);

  const look = () => wc.executeJavaScript(`JSON.stringify({
    rows: [...document.querySelectorAll('#tabs .mlist > .msr')].map((r) => r.textContent),
    proj: [...document.querySelectorAll('#tabs .mproj')].map((x) => x.textContent),
    arch: document.querySelector('#tabs .march')?.textContent ?? null,
    archRows: [...document.querySelectorAll('#tabs .march + .mfold .msr')].map((r) => r.textContent),
    older: [...document.querySelectorAll('#tabs .mold')].map((x) => x.textContent),
    tidy: document.querySelector('#tabs .th.mock .mtidy')?.textContent ?? null,
    picked: [...document.querySelectorAll('#tabs .msr .pk')].length,
    hist: document.querySelector('#tabs .mhist')?.textContent })`).then((s: string) => JSON.parse(s));
  const shot = async (name: string) => {
    const r = JSON.parse(await wc.executeJavaScript(`(() => { const h = document.querySelector('#tabs .th.mock'); h.scrollIntoView({ block: 'start' });
      const l = document.querySelector('#tabs .mlist'), a = h.getBoundingClientRect(), z = (l ?? h).getBoundingClientRect(), p = document.querySelector('.drawer').getBoundingClientRect();
      return JSON.stringify({ x: p.left, y: Math.max(0, a.top - 6), w: p.width, h: Math.min(innerHeight, z.bottom + 8) - Math.max(0, a.top - 6) }); })()`));
    await wait(200);
    const img = await wc.capturePage({ x: Math.floor(r.x), y: Math.floor(r.y), width: Math.ceil(r.w), height: Math.ceil(r.h) });
    writeFileSync(path.join(OUT, `tidy-${name}.png`), img.toPNG());
    console.log(`shot tidy-${name}.png ${img.getSize().width}x${img.getSize().height}`);
  };
  const before = await look();
  console.log('BEFORE ' + JSON.stringify(before));
  check('before: one row per sheet, numbers and names consistent', before.rows.length === SHEETS.length && before.rows.some((t: string) => t.startsWith('59Spotify mini player')), JSON.stringify(before.rows));
  check('before: grouped under the project (the repo)', before.proj.length === 1, JSON.stringify(before.proj));
  check('before: the TIDY key is on the trail head', before.tidy === 'TIDY', String(before.tidy));
  check('before: nothing archived yet', before.arch === null);
  await shot('before');

  const n0 = b.mockStore.list.length;
  notes.length = 0;
  await wc.executeJavaScript(`document.querySelector('#tabs .th.mock .mtidy').click(); true`);
  await until(() => notes.length > 0, 10000); await wait(700);
  const after = await look();
  console.log('AFTER ' + JSON.stringify(after) + ' NOTE ' + JSON.stringify(notes));
  check('the toast says what it did in one line', notes.includes('Folded 3 old versions, merged 1 duplicate, archived 3 (1 gone from the repo).'), JSON.stringify(notes));
  check('the duplicate merged, nothing else removed', b.mockStore.list.length === n0 - 1, `${n0} -> ${b.mockStore.list.length}`);
  check('three sheets went to the Archive (50 gone, 30 and 45c replaced)', after.archRows.length === 3 && /ARCHIVE · 3 SHEETS/.test(after.arch ?? ''), JSON.stringify(after.archRows));
  check('the list is shorter by those three', after.rows.length === SHEETS.length - 3, JSON.stringify(after.rows));
  check('older versions fold under their sheet', after.older.includes('2 older versions') && after.older.includes('1 older version'), JSON.stringify(after.older));
  check('the decided sheet wears its picked mark', after.picked === 1, String(after.picked));
  await shot('after');

  // Open 59, its older fold and the Archive; then Restore one from the Archive.
  await wc.executeJavaScript(`(() => { document.querySelector('#tabs .msr[data-sheet="${D('59-mini-player')}"]').click();
    document.querySelector('#tabs .msr[data-sheet="${D('59-mini-player')}"] + .mfold .mold').click(); document.querySelector('#tabs .march').click(); return true; })()`);
  await wait(700);
  const h1 = await wc.executeJavaScript(`document.querySelector('#tabs .msr[data-sheet="${D('59-mini-player')}"] + .mfold').getBoundingClientRect().height`);
  check('the sheet\'s fold sprang open', h1 > 60, String(h1));
  await shot('open');
  await wc.executeJavaScript(`document.querySelector('#tabs .march + .mfold .msr[data-sheet="${D('30-wood-rim')}"] .mrestore').click(); true`);
  await wait(600);
  const back = await look();
  check('Restore brings a sheet back with one click', back.archRows.length === 2 && back.rows.some((t: string) => t.startsWith('30')) && b.mockStore.meta.get(D('30-wood-rim'))?.kept === true, JSON.stringify(back.archRows));
  console.log(bad ? `${bad} FAILED` : 'ALL PASS');
  app.exit(bad ? 1 : 0);
});

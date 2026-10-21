// Sheet 47 (his picks, 2026-10-21): the MOCKUPS trail. A throwaway git repo stands in for AangApp, so nothing of his is
// read or written: the versioned page server's path rules, a .mockup file opening a tab in the trail, a newer version
// updating that same tab (V2), the history surviving the trail being closed (mockups.json), duplicates found by picture and
// removed only by the broom, the ... menu bringing the trail back, and the family tree (a lettered sheet filed under its
// parent, branches renamed, moved, made top level, deleted without losing a mockup, the history grouped the same way).
//
// Run: npx electron test/electron/mockups-check.ts
import { app, BrowserWindow, screen } from 'electron';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts'; import { AangBrowser } from '../../src/browser.ts'; import { wireBrowser } from '../../src/browseripc.ts';
import { MockServer, MockStore, cleanPath, parseVersioned, takeMockupFile } from '../../src/mockups.ts';
process.on('uncaughtException', (e) => { console.log('HARNESS NOTE ' + String((e as Error)?.stack ?? e).split('\n').slice(0, 3).join(' | ')); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 120_000).unref();
app.on('window-all-closed', () => {});
const HERE = path.dirname(fileURLToPath(import.meta.url));
// Off his screen, never in front of his game.
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.showInactive(); };
BrowserWindow.prototype.focus = function () {};
BrowserWindow.prototype.moveTop = function () {};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d ? '  -- ' + String(d).slice(0, 220) : ''}`); if (!ok) bad++; };
const until = async (fn: () => boolean, ms = 8000) => { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await wait(100); } return fn(); };

// ---- the stand-in repo
const repo = mkdtempSync(path.join(os.tmpdir(), 'mock-repo-'));
const g = (...a: string[]) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...a], { encoding: 'utf8' }).trim();
const put = (p: string, s: string) => { mkdirSync(path.dirname(path.join(repo, p)), { recursive: true }); writeFileSync(path.join(repo, p), s); };
const S45 = 'docs/cockpit/sheet-45-both-ways.html', S45G = 'docs/cockpit/sheet-45g-click-aang.html', S46 = 'docs/cockpit/sheet-46-one-cockpit.html';
const sheet = (title: string, colour: string) => `<!doctype html><title>${title}</title><link rel="stylesheet" href="sheet-45/pic.css"><body data-c="${colour}">hi</body>`;
const commit = (msg: string) => { g('add', '-A'); g('commit', '-q', '-m', msg); return g('rev-parse', 'HEAD'); };
g('init', '-q');
put(S45, sheet('Sheet 45 - Both ways', 'one'));
put('docs/cockpit/sheet-45/pic.css', 'body{background:rgb(1, 2, 3)}');
put(S46, sheet('Sheet 46 - One cockpit', 'x'));
put('secret.txt', 'not for the server');
put('src/Shell/pages/art/x.css', 'a{}');
const c1 = commit('one');

app.whenReady().then(async () => {
  (screen as any).getCursorScreenPoint = () => ({ x: -20000, y: 500 });
  // ---- 1. the server's path rules
  check('cleanPath takes a sheet', cleanPath(S45) === S45);
  check('cleanPath refuses .., backslash, absolute, NUL, outside dirs', [`docs/../secret.txt`, 'docs\\cockpit\\x.html', '/docs/x.html', 'C:/docs/x', 'docs/x\0.html', 'secret.txt', 'src/Shell/src/main.ts', 'docs//x.html', './docs/x.html'].every((p) => cleanPath(p) === null));
  check('a bad commit is refused', parseVersioned('/v/HEAD/' + S45) === null && parseVersioned('/v/zzzzzzz/' + S45) === null && parseVersioned('/v/abc/' + S45) === null);
  const srv = new MockServer(repo); const port = await srv.start();
  const get = (p: string, host = `127.0.0.1:${port}`, method = 'GET') => new Promise<{ code: number; type: string; body: string }>((done) => {
    const r = http.request({ host: '127.0.0.1', port, path: p, method, headers: { Host: host } }, (res) => { let b = ''; res.on('data', (d) => { b += d; }); res.on('end', () => done({ code: res.statusCode ?? 0, type: String(res.headers['content-type'] ?? ''), body: b })); });
    r.on('error', () => done({ code: -1, type: '', body: '' })); r.end();
  });
  const ok1 = await get(`/v/${c1}/${S45}`);
  check('a sheet at its commit, as html', ok1.code === 200 && ok1.type.startsWith('text/html') && ok1.body.includes('Both ways'), `${ok1.code} ${ok1.type}`);
  const css = await get(`/v/${c1.slice(0, 12)}/docs/cockpit/sheet-45/pic.css`);
  check('its helper folder at the same commit, as css (short commit too)', css.code === 200 && css.type.startsWith('text/css'), `${css.code} ${css.type}`);
  check('art under src/Shell/pages is served', (await get(`/v/${c1}/src/Shell/pages/art/x.css`)).code === 200);
  for (const [what, p] of [['outside the mockup folders', `/v/${c1}/secret.txt`], ['.. in the path', `/v/${c1}/docs/../secret.txt`], ['encoded ..', `/v/${c1}/docs/%2e%2e/secret.txt`],
    ['a backslash', `/v/${c1}/docs%5C..%5Csecret.txt`], ['a bad commit', `/v/HEAD/${S45}`], ['a folder', `/v/${c1}/docs/cockpit`], ['no such file', `/v/${c1}/docs/nope.html`]] as const) {
    const r = await get(p); check(`refused: ${what}`, r.code === 404 || r.code === 403, `${r.code}`);
  }
  check('refused: another host name (a page pointing its name here)', (await get(`/v/${c1}/${S45}`, 'evil.example:80')).code === 403);
  check('refused: POST', (await get(`/v/${c1}/${S45}`, `127.0.0.1:${port}`, 'POST')).code === 405);
  srv.close();

  // ---- 2. the .mockup file
  const st = mkdtempSync(path.join(os.tmpdir(), 'mock-state-'));
  const urls = path.join(st, 'open-urls'); mkdirSync(urls);
  const drop = (body: string, name = `${Date.now()}.mockup`) => { const f = path.join(urls, name); writeFileSync(f, body); return f; };
  check('a .mockup outside the folders is refused', takeMockupFile(drop(JSON.stringify({ path: 'secret.txt' }))) === null);
  check('a .mockup with a long title is refused', takeMockupFile(drop(JSON.stringify({ path: S45, title: 'x'.repeat(81) }))) === null);
  check('a .mockup over 4 KB is refused', takeMockupFile(drop(JSON.stringify({ path: S45, pad: 'x'.repeat(5000) }))) === null);
  { const f = drop(JSON.stringify({ path: S45 })); const t = (Date.now() - 11 * 60_000) / 1000; utimesSync(f, t, t); check('a .mockup older than ten minutes is dropped', takeMockupFile(f) === null && !existsSync(f)); }
  const m1 = takeMockupFile(drop(JSON.stringify({ path: S45, title: '45 · Both ways' })));
  check('a good .mockup is taken', m1?.path === S45 && m1?.title === '45 · Both ways', JSON.stringify(m1));

  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const b = new AangBrowser({ origin: pages.origin, stateDir: st, repoDir: repo, preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'), tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs'), testLocal: true }) as any;
  wireBrowser(() => b);
  const v1 = await b.openMockup(m1!.path, m1!.title);
  await until(() => b.tabs.some((t: any) => t.mock));
  const mt = () => b.tabs.filter((t: any) => t.mock);
  const t45 = () => b.tabs.find((t: any) => t.mock?.sheet === S45);
  check('it opened Samara and a tab in the MOCKUPS trail', mt().length === 1 && t45()?.trail === -1 && b.trails.some((x: any) => x.id === -1 && x.mock && x.name === 'MOCKUPS'), JSON.stringify(b.trails));
  check('no home page under it', b.tabs.length === 1, String(b.tabs.length));
  check('the tab carries the title Claude gave', t45()?.title === '45 · Both ways', t45()?.title);
  await until(() => !t45()?.loading, 8000); await wait(400);
  const wc = () => t45()!.view.webContents;
  const sheetCss = await wc().executeJavaScript(`[...document.styleSheets].filter((x) => x.href).map((x) => x.href + ' ' + x.cssRules.length).join()`).catch(() => '');
  check('the page loads from the server, with its helper folder from the same commit', String(wc().getURL()).includes(`/v/${c1}/`) && String(sheetCss).includes(`/v/${c1}/docs/cockpit/sheet-45/pic.css 1`), `${wc().getURL()} ${sheetCss}`);
  check('version V1', v1?.v === 1 && b.mockTab(t45()).v === 1);

  // ---- 3. a newer version updates the same tab
  const id1 = t45()!.id;
  put(S45, sheet('Sheet 45 - Both ways', 'two')); const c2 = commit('two');
  const v2 = await b.openMockup(S45, '45 · Both ways'); await wait(600);
  check('a second version updates the same tab, no new one', mt().length === 1 && t45()!.id === id1 && b.tabs.length === 1);
  check('and bumps it to V2', v2?.v === 2 && b.mockTab(t45()).v === 2);
  await until(() => String(wc().getURL()).includes(c2));
  check('the tab now shows the new commit', String(wc().getURL()).includes(`/v/${c2}/`), wc().getURL());

  // ---- 4. the same picture again is a duplicate (a commit that did not touch the sheet)
  put('docs/other.md', 'unrelated'); commit('three');
  const v3 = await b.openMockup(S45, '45 · Both ways'); await wait(300);
  check('the same picture keeps its number (V2)', v3?.v === 2);
  check('the older line with that picture is a duplicate, by its key', b.mockStore.dups().size === 1 && b.mockStore.dups().get(v2.id) === 2);
  b.mockAct('list', { open: true }); await wait(500);
  const frame = b.win.webContents;
  const look = JSON.parse(await frame.executeJavaScript(`JSON.stringify({
    icon: !!document.querySelector('#tabs .th.mock .who-ic img[src*="claude-icon"]'), from: document.querySelector('#tabs .mfrom')?.textContent,
    ver: document.querySelector('#tabs .tp[data-mock] .ver')?.textContent, hist: document.querySelector('#tabs .mhist')?.textContent,
    dup: [...document.querySelectorAll('#tabs .mv.dup')].map((x) => x.textContent), broom: document.querySelector('#tabs .mbroom')?.textContent,
    broomArt: document.querySelector('#tabs .mbroom img')?.getAttribute('src'), menu: !document.getElementById('m-mockups').hidden })`));
  check('the head shows Claude\'s icon and FROM CLAUDE', look.icon && look.from === 'FROM CLAUDE', JSON.stringify(look));
  check('the tab wears V2', look.ver === 'V2', look.ver);
  check('HISTORY · 3 VERSIONS', look.hist === 'HISTORY \u00b7 3 VERSIONS', look.hist);
  check('the duplicate is struck through, SAME AS V2', look.dup.length === 1 && look.dup[0].includes('SAME AS V2'), JSON.stringify(look.dup));
  check('the broom is Samara\'s tidy broom, labelled with the count', look.broom === '1 DUPLICATE' && look.broomArt === 'art/browser/tidy_broom2.png', JSON.stringify(look));
  check('the ... menu has Mockups', look.menu === true);
  check('nothing is removed until the broom is pressed', b.mockStore.list.length === 3);
  await frame.executeJavaScript(`document.querySelector('#tabs .mbroom').click(); true`); await wait(400);
  const saved = () => JSON.parse(readFileSync(path.join(st, 'mockups.json'), 'utf8'));
  check('the broom removes the duplicate only', b.mockStore.list.length === 2 && saved().versions.length === 2 && !saved().versions.some((x: any) => x.id === v2.id), JSON.stringify(saved().versions.map((x: any) => x.v)));
  check('both different versions are kept', saved().versions.map((x: any) => x.v).sort().join() === '1,2');

  // ---- 5. versions: pick V1 in the same tab
  b.mockAct('show', { id: v1.id }); await until(() => String(wc().getURL()).includes(c1));
  check('picking V1 shows it in the same tab', String(wc().getURL()).includes(`/v/${c1}/`) && b.mockTab(t45()).v === 1 && mt().length === 1);

  // ---- 6. the family tree
  put(S45G, sheet('Sheet 45g - Click Aang', 'g')); commit('45g');
  await b.openMockup(S45G); await until(() => mt().length === 2);
  const tg = () => b.tabs.find((t: any) => t.mock?.sheet === S45G);
  check('a lettered sheet files itself under its parent', b.mockStore.placeOf(S45G).parent === S45, JSON.stringify(b.mockStore.placeOf(S45G)));
  check('its title comes from its own <title>', tg()?.title === '45g \u00b7 Click Aang', tg()?.title);
  check('the drawer shows it as a child of 45', JSON.parse(await frame.executeJavaScript(`JSON.stringify([...document.querySelectorAll('#tabs .tp[data-mock]')].map((r) => [r.dataset.mock, r.classList.contains('kid')]))`)).some((x: any) => x[0] === S45G && x[1] === true));
  b.mockAct('branchnew', { sheet: S45 }); await wait(500);
  const br = b.mockStore.branches[0];
  check('a new branch opens its name for typing', (await frame.executeJavaScript(`!!document.querySelector('#tabs .bh input')`)) === true);
  // Renamed the way he does it: type in the box, Enter.
  await frame.executeJavaScript(`(() => { const i = document.querySelector('#tabs .bh input'); i.value = 'Claude link'; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); return true; })()`);
  await wait(400);
  check('a new branch, renamed', b.mockStore.branches.length === 1 && b.mockStore.branches[0].name === 'Claude link');
  check('45 is in it, and its child follows it there', b.mockStore.placeOf(S45).branch === br.id && b.mockStore.placeOf(S45G).branch === br.id && b.mockStore.placeOf(S45G).parent === S45);
  await wait(300);
  const tree = b.mockView().tree;
  check('the history is grouped by the tree (branch > mockup > child)', tree.branches[0].name === 'Claude link' && tree.branches[0].mockups[0].sheet === S45 && tree.branches[0].mockups[0].children[0].sheet === S45G && tree.loose.length === 0, JSON.stringify(tree).slice(0, 200));
  const bh = await frame.executeJavaScript(`document.querySelector('#tabs .bh .nm')?.textContent`);
  check('the branch head shows in the trail', bh === 'Claude link', bh);
  b.mockAct('top', { sheet: S45G });
  check('Make it top level', b.mockStore.placeOf(S45G).parent === null && b.mockStore.placeOf(S45G).branch === null);
  b.mockAct('branch', { sheet: S45G, to: br.id });
  check('Move to branch', b.mockStore.placeOf(S45G).branch === br.id && b.mockStore.placeOf(S45G).parent === null);
  b.mockAct('parent', { sheet: S45G, to: S45 });
  check('drag onto a mockup makes it a child again', b.mockStore.placeOf(S45G).parent === S45);
  b.mockAct('parent', { sheet: S45, to: S45G });
  check('a child never gets children (three levels only)', b.mockStore.placeOf(S45).parent === null);
  b.mockAct('bfold', { id: br.id }); await wait(300);
  check('folding a branch hides its tabs and keeps them', mt().length === 2 && (await frame.executeJavaScript(`document.querySelectorAll('#tabs .tp[data-mock]').length`)) === 0);
  b.mockAct('bfold', { id: br.id });
  const keepPlaces = JSON.stringify(saved().places);
  b.mockAct('bdelete', { id: br.id });
  check('deleting a branch keeps its mockups, at the top level', b.mockStore.branches.length === 0 && b.mockStore.placeOf(S45).branch === null && b.mockStore.placeOf(S45G).parent === S45 && mt().length === 2 && b.mockStore.list.length === 3);
  b.mockAct('branchnew', { sheet: S45 }); b.mockAct('brename', { id: b.mockStore.branches[0].id, name: 'Kept' });
  const again = new MockStore(path.join(st, 'mockups.json'));
  check('the tree is kept in mockups.json', again.branches[0]?.name === 'Kept' && again.placeOf(S45).branch === again.branches[0]?.id && again.placeOf(S45G).parent === S45 && again.list.length === 3, keepPlaces);

  // ---- 7. close the trail: the history stays; the ... menu brings it back with the list open
  b.mockAct('list', { open: false });
  b.trailAct(-1, 'close'); await wait(400);
  check('closing the trail closes its tabs', mt().length === 0 && !b.trails.some((x: any) => x.id === -1));
  check('the history survives in mockups.json', saved().versions.length === 3);
  await frame.executeJavaScript(`document.getElementById('m-mockups').click(); true`);
  await until(() => mt().length === 1);
  check('Mockups in the ... menu reopens the trail with its history open', mt().length === 1 && b.trails.some((x: any) => x.id === -1) && b.mockList === true && b.mockView().open === true);
  check('it reopened the newest mockup', mt()[0]?.mock.sheet === S45G, mt()[0]?.mock.sheet);

  // ---- 8. a non-mockup tab never goes in, a mockup never leaves
  const plain = b.newTab('http://127.0.0.1:' + port + '/');
  b.moveTab(plain, -1); b.moveTab(mt()[0].id, null);
  check('the trail holds mockups only', b.tabs.find((t: any) => t.id === plain)?.trail !== -1 && mt()[0].trail === -1);
  check('mockups never sync to the other machine', !b.syncTarget?.tabSnap?.().tabs?.some((t: any) => t.url.includes('/v/')));

  console.log(bad ? `${bad} FAILED` : 'ALL PASS'); app.exit(bad ? 1 : 0);
});

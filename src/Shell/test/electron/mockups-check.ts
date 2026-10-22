// Sheet 47 (his picks, 2026-10-21): the MOCKUPS trail. A throwaway git repo stands in for AangApp, so nothing of his is
// read or written: the versioned page server's path rules, a .mockup file opening a tab in the trail, a newer version
// updating that same tab (V2), the history surviving the trail being closed (mockups.json), duplicates found by picture and
// removed only by the broom, the ... menu bringing the trail back, and the family tree (a lettered sheet filed under its
// parent, branches renamed, moved, made top level, deleted without losing a mockup, the history grouped the same way), and
// a branch Claude names in the .mockup file (made or matched, a child moving its unbranched parent, bad names ignored).
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
const sheet = (title: string, colour: string) => `<!doctype html><title>${title}</title><!-- Notes for ${title}:
   what he picked. --><link rel="stylesheet" href="sheet-45/pic.css"><body data-c="${colour}"><h1>Sheet</h1><p>The <b>first</b> paragraph.</p><p>Second.</p></body>`;
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
  // 2026-10-22: opening the list runs the daily tidy (which merges duplicates too); this part is about the broom, so the
  // tidy has just run (mockups-tidy-check.ts covers the tidy).
  b.mockStore.tidiedAt = Date.now();
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

  // ---- 9. Send to Aang (his pick, 2026-10-21): only while Aang is running; the Shell builds what goes, from ids only.
  const sent: any[] = [];
  b.mockAct('list', { open: true });
  await wait(400);
  const menuText = (sel: string, how: 'context' | 'click') => frame.executeJavaScript(`(() => { const r = document.querySelector(${JSON.stringify(sel)}); if (!r) return 'NO ' + ${JSON.stringify(sel)};
    r.dispatchEvent(new MouseEvent(${JSON.stringify(how === 'context' ? 'contextmenu' : 'click')}, { bubbles: true, cancelable: true, clientX: 60, clientY: 60 }));
    const t = document.getElementById('tabmenu')?.textContent ?? ''; document.getElementById('tabmenu')?.remove(); return t; })()`);
  b.onSendMockup = null; await wait(300);
  const off = [await menuText('#tabs .tp[data-mock]', 'context'), await menuText('#tabs .bh .thm', 'click'), await menuText('#tabs .mv', 'context')];
  check('no Send to Aang while Aang is not running (tab, branch, history line)', off.every((t) => !t.includes('Send to Aang')) && off.every((t) => !t.startsWith('NO ')), off.join(' | '));
  b.onSendMockup = (m: any) => { sent.push(m); }; await wait(300);
  const on = [await menuText('#tabs .tp[data-mock]', 'context'), await menuText('#tabs .bh .thm', 'click'), await menuText('#tabs .mv', 'context')];
  check('Send to Aang on a mockup tab, a branch head and a history line while Aang runs', on.every((t) => t.includes('Send to Aang')), on.join(' | '));
  const one = await b.mockSend('version', v1.id);
  const keys = 'kind,title,version,branch,sheet,commit,url,notes,picture';
  check('a version travels with exactly its fields', Object.keys(one).sort().join() === keys.split(',').sort().join(), Object.keys(one).join());
  check('its details come from the history and git', one.kind === 'mockup' && one.title === '45 · Both ways' && one.version === 'V1' && one.branch === 'Kept' && one.sheet === S45 && one.commit === c1 && one.url.includes(`/v/${c1}/${S45}`), JSON.stringify({ ...one, picture: one.picture?.length }));
  check('its notes: the leading comment and the first paragraph, plain', one.notes === 'Notes for Sheet 45 - Both ways: what he picked.\n\nThe first paragraph.', JSON.stringify(one.notes));
  check('its picture is a PNG of the page (from a hidden page: V1 is not open)', typeof one.picture === 'string' && one.picture.startsWith('data:image/png;base64,') && one.picture.length <= 1_500_000, String(one.picture?.length));
  check('and it reached Aang', sent.length === 1 && sent[0] === one);
  // Ids from the page are checked: wrong kinds and unknown numbers send nothing.
  await frame.executeJavaScript(`window.aang.browserMockup({ act: 'send', id: 'x' }); window.aang.browserMockup({ act: 'send', id: 99999 }); window.aang.browserMockup({ act: 'sendbranch', id: -5 }); window.aang.browserMockup({ act: 'sendtab', id: 1.5 }); window.aang.browserMockup({ act: 'send', sheet: '../secret.txt' }); true`);
  await wait(1500);
  check('page-sent ids that are not real send nothing', sent.length === 1, String(sent.length));
  await frame.executeJavaScript(`window.aang.browserMockup({ act: 'sendtab', id: ${mt()[0].id} }); true`);
  await until(() => sent.length === 2, 8000);
  check('a tab sends the version it shows', sent[1]?.kind === 'mockup' && sent[1].sheet === mt()[0].mock.sheet && /^data:image\/png/.test(String(sent[1].picture)), JSON.stringify({ ...sent[1], picture: sent[1]?.picture?.length }));
  const kept = b.mockStore.branches.find((x: any) => x.name === 'Kept');
  const all = await b.mockSend('branch', kept.id);
  check('a branch travels as one attachment of its mockups, newest version of each', all.kind === 'mockups' && all.branch === 'Kept' && all.items.length === 2 && all.items.every((x: any) => x.kind === 'mockup') && new Set(all.items.map((x: any) => x.sheet)).size === 2, JSON.stringify(all.items.map((x: any) => [x.sheet, x.version])));
  check('the newest version of 45 in it is V2', all.items.find((x: any) => x.sheet === S45)?.version === 'V2');
  // Size caps: 1200 px wide at most; a picture still over 1.5 MB is dropped; notes at most 1500 characters.
  const { fitShot } = await import('../../src/browser.ts'); const { nativeImage } = await import('electron'); const { notesFrom } = await import('../../src/mockups.ts');
  const solid = nativeImage.createFromBitmap(Buffer.alloc(3000 * 2000 * 4, 0x80), { width: 3000, height: 2000 });
  const fitted = fitShot(solid); const fw = fitted ? nativeImage.createFromDataURL(fitted).getSize().width : 0;
  check('a wide picture is cut to 1200 px', fw === 1200, String(fw));
  const noise = Buffer.alloc(1200 * 900 * 4); for (let i = 0; i < noise.length; i++) noise[i] = (Math.random() * 256) | 0;
  check('a picture over 1.5 MB is dropped, not sent', fitShot(nativeImage.createFromBitmap(noise, { width: 1200, height: 900 })) === null);
  check('notes are capped at 1500 characters', notesFrom(`<!-- ${'word '.repeat(1000)} --><p>${'more '.repeat(1000)}</p>`).length === 1500);

  // ---- 10. a branch Claude names in the .mockup file
  const S46B = 'docs/cockpit/sheet-46b-more.html', S47 = 'docs/cockpit/sheet-47-trail.html', S48 = 'docs/cockpit/sheet-48-new.html', S48B = 'docs/cockpit/sheet-48b-kid.html';
  put(S46B, sheet('Sheet 46b - More', 'b')); put(S47, sheet('Sheet 47 - Trail', 't')); put(S48, sheet('Sheet 48 - New', 'n')); put(S48B, sheet('Sheet 48b - Kid', 'k')); commit('more');
  const mb = takeMockupFile(drop(JSON.stringify({ path: S46, branch: '  Claude \t link\u0007 ' })));
  check('a .mockup branch is cleaned (control characters out, spaces collapsed)', mb?.path === S46 && mb?.branch === 'Claude link', JSON.stringify(mb));
  const badB = [42, '', '   ', '\u0001\u0002', 'x'.repeat(41), { n: 'a' }, ['a'], null, true].map((v) => takeMockupFile(drop(JSON.stringify({ path: S46, branch: v }))));
  check('bad branch values are ignored, the mockup still opens', badB.every((m) => m?.path === S46 && m.branch === null), JSON.stringify(badB));
  check('a branch of exactly 40 characters is kept', takeMockupFile(drop(JSON.stringify({ path: S46, branch: 'y'.repeat(40) })))?.branch === 'y'.repeat(40));
  const brs = () => b.mockStore.branches.map((x: any) => x.name);
  const nBr = brs().length;
  await b.openMockup(S46, '', mb!.branch); await wait(300);
  const cl = () => b.mockStore.branches.find((x: any) => x.name === 'Claude link');
  check('a branch is made on arrival, and the sheet is in it', brs().length === nBr + 1 && !!cl() && b.mockStore.placeOf(S46).branch === cl()?.id, JSON.stringify(brs()));
  await b.openMockup(S47, '', 'CLAUDE LINK'); await wait(300);
  check('an existing branch is matched, any case (no second one)', brs().length === nBr + 1 && b.mockStore.placeOf(S47).branch === cl()?.id, JSON.stringify(brs()));
  await b.openMockup(S46B, '', 'Other'); await wait(300);
  check('a child arriving with a branch stays with its branched parent; nothing made', b.mockStore.placeOf(S46B).parent === S46 && b.mockStore.placeOf(S46B).branch === cl()?.id && !brs().includes('Other') && b.mockStore.placeOf(S46).branch === cl()?.id, JSON.stringify(brs()));
  await b.openMockup(S48); await wait(200);
  check('a sheet with no branch stays at the top level', b.mockStore.placeOf(S48).branch === null);
  await b.openMockup(S48B, '', 'fresh ideas'); await wait(300);
  const fr = b.mockStore.branches.find((x: any) => x.name === 'fresh ideas');
  check('a child arriving with a branch moves its unbranched parent there, and stays its child', !!fr && b.mockStore.placeOf(S48).branch === fr.id && b.mockStore.placeOf(S48B).parent === S48 && b.mockStore.placeOf(S48B).branch === fr.id);
  check('45 starts in the branch he chose (Kept), with 45g under it', b.mockStore.placeOf(S45).branch === kept.id && b.mockStore.placeOf(S45G).parent === S45);
  await b.openMockup(S45, '', 'claude LINK'); await wait(300);
  check('an explicit branch moves it out of his branch, and its child follows', b.mockStore.placeOf(S45).branch === cl()?.id && b.mockStore.placeOf(S45G).parent === S45 && b.mockStore.placeOf(S45G).branch === cl()?.id);
  await b.openMockup(S47, '', null); await wait(200);
  check('opening again with no branch leaves it where it is', b.mockStore.placeOf(S47).branch === cl()?.id);
  const reread = new MockStore(path.join(st, 'mockups.json'));
  check('the branches and moves are kept in mockups.json', reread.branches.some((x) => x.name === 'Claude link') && reread.placeOf(S46).branch === reread.branches.find((x) => x.name === 'Claude link')?.id && reread.placeOf(S48B).branch === reread.branches.find((x) => x.name === 'fresh ideas')?.id);
  await wait(400);
  const heads = JSON.parse(await frame.executeJavaScript(`JSON.stringify([...document.querySelectorAll('#tabs .bh .nm')].map((x) => x.textContent))`));
  check('the trail redraws with the new branches', heads.includes('Claude link') && heads.includes('fresh ideas'), JSON.stringify(heads));

  console.log(bad ? `${bad} FAILED` : 'ALL PASS'); app.exit(bad ? 1 : 0);
});

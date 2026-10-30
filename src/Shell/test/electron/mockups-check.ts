// Sheet 47 (2026-10-21) and sheet 107 (his picks, 2026-10-30): Claude's mockups in Samara. A throwaway git repo stands in
// for AangApp, so nothing of his is read or written: the versioned page server's path rules, the .mockup file's checks,
// and then the one place (sheet 107): a mockup from Claude opens Mockups right on it (no tab, no MOCKUPS trail), NEW until
// he opens it, at its true size; a newer version is the same sheet's next version; another repo's sheet gets its own
// project tab with its letter; the tray's one Mockups plaque with its gem; the old mockup tabs close on the way back in.
// Pictures of the menu and the tray are written to MOCK_SHOTS (a folder) when it is set, to be looked at.
//
// Run: perl -e 'alarm shift; exec @ARGV' 200 node_modules/electron/dist/Electron.app/Contents/MacOS/Electron test/electron/mockups-check.ts
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
  const opts = { origin: pages.origin, stateDir: st, repoDir: repo, preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'), tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs'), testLocal: true };
  // The tabs of before: one of his pages and an old mockup tab. The mockup tab does not come back (sheet 107).
  writeFileSync(path.join(st, 'browser-tabs.json'), JSON.stringify({ v: 1, active: 0, tabs: [{ url: 'https://example.com/', title: 'Example' }, { url: `http://127.0.0.1:1/v/${c1}/${S45}`, title: '45', mock: { sheet: S45, commit: c1, key: 'k' }, trail: -1 }], trails: [{ id: -1, name: 'MOCKUPS', named: true }] }));
  const b = new AangBrowser(opts) as any;
  wireBrowser(() => b);
  const shots = process.env.MOCK_SHOTS || '';
  const log = () => b.tabs.find((t: any) => t.internal === 'mocklog');
  const lwc = () => log()?.view?.webContents;
  const page = async (js: string) => JSON.parse(await lwc().executeJavaScript(`JSON.stringify((() => { ${js} })())`));
  const v1 = await b.openMockup(m1!.path, m1!.title);
  await until(() => Boolean(lwc()) && !lwc().isLoading(), 10000); await wait(900);
  check('the old mockup tab did not come back, his page did, and there is no MOCKUPS trail', !b.tabs.some((t: any) => t.mock) && b.tabs.some((t: any) => t.url === 'https://example.com/') && !b.trails.some((x: any) => x.mock || x.id === -1), JSON.stringify(b.trails));
  check('a mockup from Claude opens Mockups (one tab, in front), no tab of its own', b.tabs.filter((t: any) => t.internal === 'mocklog').length === 1 && b.cur()?.internal === 'mocklog' && v1?.v === 1);
  await until(() => b.mockStore.meta.get(S45)?.fresh !== true, 4000);
  let look = await page(`const f = document.querySelector('.frame iframe'); return { tab: document.querySelector('.ptab.on span:not(.em):not(.c)')?.textContent, rows: [...document.querySelectorAll('.sh')].map((x) => x.textContent),
    title: document.querySelector('.vbar .dt')?.textContent, back: document.querySelector('.back')?.textContent, src: f?.getAttribute('src'), sandbox: f?.getAttribute('sandbox'), w: f?.clientWidth, fw: document.querySelector('.frame')?.clientWidth,
    chips: [...document.querySelectorAll('.vs b')].map((x) => x.textContent + (x.classList.contains('on') ? '*' : '')), mk: document.querySelector('.vbar > .mk')?.textContent };`);
  check('it opened on that sheet, in the Samara tab, marked NEW while he reads it', look.tab === 'Samara' && look.title === '45Both waysNEW', JSON.stringify(look));
  check('the sheet is shown from its commit, in a frame that cannot reach the page', String(look.src).includes(`/v/${c1}/${S45}`) && look.sandbox === 'allow-scripts allow-same-origin', JSON.stringify(look));
  check('at its true size: the frame fills the space, the sheet is never shrunk', look.w > 0 && look.w === look.fw, JSON.stringify(look));
  check('opening it took its NEW off (in the store too)', b.mockStore.meta.get(S45)?.fresh !== true && !look.rows.some((r: string) => r.includes('NEW')), JSON.stringify(look.rows));
  check('its version and its mark: v1, OPEN', JSON.stringify(look.chips) === '["v1*"]' && look.mk === 'OPEN', JSON.stringify(look));
  const inside = await lwc().executeJavaScript(`new Promise((r) => { const f = document.querySelector('.frame iframe'); const go = () => { try { r(f.contentDocument === null ? 'cross-origin' : String(f.contentDocument.title)); } catch { r('cross-origin'); } }; if (f.contentDocument?.readyState === 'complete') go(); else f.addEventListener('load', go); setTimeout(go, 3000); })`);
  check('the page cannot read into the sheet (another origin)', inside === 'cross-origin', String(inside));
  await lwc().executeJavaScript(`document.querySelector('.frame iframe').dataset.mark = 'kept'; true`);
  b.sendTabs(); b.mockLogSig = ''; b.pushMockLog(); await wait(600);
  check('a redraw keeps the same frame (the sheet is not reloaded)', (await lwc().executeJavaScript(`document.querySelector('.frame iframe')?.dataset.mark ?? ''`)) === 'kept');
  check('the page has only its own doors', (await page(`return Object.keys(window.mocklog ?? {}).sort();`)).join() === 'get,leave,onData,onEsc,seen,send,stage,where');

  // A newer version: the same sheet's next version, shown at once.
  put(S45, sheet('Sheet 45 - Both ways', 'two')); const c2 = commit('two');
  const v2 = await b.openMockup(S45, '45 · Both ways'); await wait(900);
  look = await page(`return { chips: [...document.querySelectorAll('.vs b')].map((x) => x.textContent + (x.classList.contains('on') ? '*' : '')), src: document.querySelector('.frame iframe')?.getAttribute('src') };`);
  check('a newer version is v2 of the same sheet, and Mockups shows it', v2?.v === 2 && JSON.stringify(look.chips) === '["v1","v2*"]' && String(look.src).includes(c2), JSON.stringify(look));
  check('still one Mockups tab, no mockup tabs', b.tabs.filter((t: any) => t.internal === 'mocklog').length === 1 && !b.tabs.some((t: any) => t.mock));
  await lwc().executeJavaScript(`document.querySelector('.vs b').click(); true`); await wait(400);
  check('picking v1 shows v1', String(await lwc().executeJavaScript(`document.querySelector('.frame iframe').getAttribute('src')`)).includes(c1));

  // His mark from Mockups: tap the mark, Approve this version.
  await lwc().executeJavaScript(`document.querySelector('.vbar > .mk').click(); true`); await wait(200);
  const items = await page(`return [...document.querySelectorAll('.mmenu button')].map((x) => x.textContent);`);
  check('the mark opens its menu', items.includes('Approve this version') && items.includes('Needs a fix…') && items.includes('Park it'), JSON.stringify(items));
  await lwc().executeJavaScript(`[...document.querySelectorAll('.mmenu button')].find((x) => x.textContent === 'Approve this version').click(); true`); await wait(700);
  check('approved, on v1', b.mockStore.list.find((x: any) => x.id === v1.id)?.stage === 'ok' && (await page(`return document.querySelector('.vbar > .mk')?.textContent;`)) === 'APPROVED');

  // Another project, from its own repo (a .mockup with repo and project): its own tab, its letter on the number.
  const other = mkdtempSync(path.join(os.tmpdir(), 'couch-'));
  const go = (...a: string[]) => execFileSync('git', ['-C', other, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...a], { encoding: 'utf8' }).trim();
  go('init', '-q'); mkdirSync(path.join(other, 'mockups'), { recursive: true }); writeFileSync(path.join(other, 'mockups', '06-campfire.html'), '<!doctype html><title>06 · Campfire loading</title><body>fire</body>'); go('add', '-A'); go('commit', '-q', '-m', 'one');
  const vc = await b.openMockupDrop({ path: 'mockups/06-campfire.html', repo: other, url: null, title: '06 · Campfire loading', branch: 'Campfire', project: 'Couch Mode', icon: 'fire' }); await wait(900);
  look = await page(`return { tabs: [...document.querySelectorAll('.ptab')].map((x) => x.textContent), on: document.querySelector('.ptab.on')?.textContent, title: document.querySelector('.vbar .dt')?.textContent,
    heads: [...document.querySelectorAll('.topic')].map((x) => x.textContent), fire: !!document.querySelector('.ptab.on .em svg') };`);
  check('another project gets its own tab, and Mockups opens there on the sheet', !!vc && look.tabs.length === 2 && String(look.on).startsWith('Couch Mode') && look.title === 'C06Campfire loadingNEW', JSON.stringify(look));
  check('its logo is the pixel campfire, its topic a sub heading', look.fire && look.heads.some((h: string) => h.startsWith('Campfire')), JSON.stringify(look));

  // The tray: one Mockups plaque, its gem counting what he has not opened; nothing of the old MOCKUPS trail.
  b.mockStore.add(S46, '46 · One cockpit', c2, 'k46'); b.mockStore.setFresh(S46, true); b.sendTabs(); await wait(500);
  const frame = b.win.webContents;
  const tray = JSON.parse(await frame.executeJavaScript(`JSON.stringify({ key: !document.getElementById('mqkey').hidden, name: document.querySelector('#mqkey .nm')?.textContent, gem: document.querySelector('#mqkey .gem')?.hidden ? '' : document.querySelector('#mqkey .gem')?.textContent,
    old: document.querySelectorAll('#tabs .th.mock, #tabs .mquest, #tabs .mph, #tabs .bh').length, menu: !!document.getElementById('m-mockups'), next: document.getElementById('mqkey')?.nextElementSibling?.className, low: (() => { const k = document.getElementById('mqkey').getBoundingClientRect(), f = document.querySelector('.drawer .tidyfoot').getBoundingClientRect(); return Math.round(f.top - k.bottom); })() })`));
  // At the bottom of the tray, right above the broom (his ask, 2026-10-30).
  check('the tray has the one Mockups plaque, at the bottom above the broom, with its gem at 1', tray.key && tray.name === 'Mockups' && tray.gem === '1' && tray.next === 'tidyfoot' && tray.low >= 0 && tray.low <= 16, JSON.stringify(tray));
  check('the old MOCKUPS list, LIVE PAGES, ALL MOCKUPS and the ... menu way are gone', tray.old === 0 && !tray.menu, JSON.stringify(tray));
  // Away to his page, then the plaque brings Mockups back in front.
  b.activate(b.tabs.find((t: any) => t.url === 'https://example.com/').id); await wait(200);
  await frame.executeJavaScript(`document.getElementById('mqkey').click(); true`); await wait(600);
  check('the plaque opens Mockups', b.cur()?.internal === 'mocklog');
  look = await page(`return { newc: [...document.querySelectorAll('.ptab .newc')].map((x) => x.textContent), news: [...document.querySelectorAll('.sh .new')].length };`);
  check('the Samara tab says 1 NEW and the sheet wears NEW', JSON.stringify(look.newc) === '["1 NEW"]' && look.news >= 0, JSON.stringify(look));
  await lwc().executeJavaScript(`[...document.querySelectorAll('.ptab')].find((x) => x.textContent.startsWith('Samara')).click(); true`); await wait(300);
  look = await page(`return { news: [...document.querySelectorAll('.sh')].filter((x) => x.querySelector('.new')).map((x) => x.textContent) };`);
  check('in its project the new sheet wears NEW', look.news.length === 1 && look.news[0].startsWith('46'), JSON.stringify(look));
  await lwc().executeJavaScript(`[...document.querySelectorAll('.sh')].find((x) => x.textContent.startsWith('46')).click(); true`); await wait(700);
  const gemAfter = await frame.executeJavaScript(`document.querySelector('#mqkey .gem').hidden`);
  check('opening it takes its NEW off, and the gem goes', b.mockStore.meta.get(S46)?.fresh !== true && gemAfter === true);
  await lwc().executeJavaScript(`document.querySelector('.back').click(); true`); await wait(300);
  check('back closes the sheet, back to the list', (await page(`return !document.querySelector('.frame iframe') && !!document.querySelector('.sh');`)) === true);
  // Done: a built sheet folds into Done at the bottom of its project.
  b.mockStore.setStage(b.mockStore.list.find((x: any) => x.sheet === S46).id, 'built'); b.sendTabs(); await wait(700);
  look = await page(`return { done: [...document.querySelectorAll('.done .sh')].map((x) => x.textContent) };`);
  check('a built sheet is in Done', look.done.length === 1 && look.done[0].includes('BUILT'), JSON.stringify(look));

  // Sheet 107 v4: Back to Samara, first along the top: Mockups closes, he is back on the tab he was on. Esc does the same.
  const ex = () => b.tabs.find((t: any) => t.url === 'https://example.com/');
  b.activate(ex().id); await wait(200); b.openMockLog(); await wait(700);
  look = await page(`const k = document.querySelector('#ptabs').firstElementChild; return { cls: k?.className, text: k?.textContent, lamp: k?.querySelector('img')?.getAttribute('src') };`);
  check('Back to Samara is first along the top, with the lantern', look.cls === 'leave' && look.text === 'Back to Samara' && String(look.lamp).includes('samara-lantern'), JSON.stringify(look));
  if (shots) { mkdirSync(shots, { recursive: true }); writeFileSync(path.join(shots, 'mockups-leave.png'), (await lwc().capturePage({ x: 0, y: 0, width: 900, height: 120 })).toPNG()); }
  // Sheet 107 v5: Mockups is the plaque, never a row in the tab list; the plaque is lit while he is in it.
  const keyLit = () => b.win.webContents.executeJavaScript(`document.getElementById('mqkey').classList.contains('lit')`);
  const rowText = () => b.win.webContents.executeJavaScript(`[...document.querySelectorAll('#tabs .tp')].map((x) => x.textContent.trim()).join('|')`);
  check('no Mockups row in the tab list, and the plaque is lit', !String(await rowText()).includes('Mockups') && (await keyLit()) === true, String(await rowText()));
  await lwc().executeJavaScript(`[...document.querySelectorAll('.ptab')].find((x) => x.textContent.startsWith('Samara')).click(); true`); await wait(300);
  await lwc().executeJavaScript(`[...document.querySelectorAll('.sh')].find((x) => x.textContent.startsWith('45')).click(); true`); await wait(500);
  await lwc().executeJavaScript(`document.querySelector('.leave').click(); true`); await wait(700);
  check('Back to Samara leaves Mockups for the tab he was on; the plaque rests', b.cur()?.id === ex().id && (await keyLit()) === false, String(b.cur()?.url));
  await b.win.webContents.executeJavaScript(`document.getElementById('mqkey').click(); true`); await wait(700);
  look = await page(`return { p: document.querySelector('.ptab.on')?.textContent, t: document.querySelector('.vbar .dt')?.textContent };`);
  check('the plaque brings Mockups back where he left it (same project, same sheet)', b.cur()?.internal === 'mocklog' && String(look.p).startsWith('Samara') && String(look.t).startsWith('45'), JSON.stringify(look));
  // Even when Mockups was rebuilt (it slept): Samara kept where he was.
  b.mockLogLeave(); await wait(300); b.close(log().id, false); await wait(300); b.openMockLog(); await until(() => Boolean(lwc()) && !lwc().isLoading(), 8000); await wait(1200);
  look = await page(`return { p: document.querySelector('.ptab.on')?.textContent, t: document.querySelector('.vbar .dt')?.textContent };`);
  check('a rebuilt Mockups opens where he left it too', String(look.p).startsWith('Samara') && String(look.t).startsWith('45'), JSON.stringify(look));
  await lwc().executeJavaScript(`document.querySelector('.vbar > .mk')?.click(); true`); await wait(200);
  const esc = () => { lwc().sendInputEvent({ type: 'keyDown', keyCode: 'Escape' }); lwc().sendInputEvent({ type: 'keyUp', keyCode: 'Escape' }); };
  if (await lwc().executeJavaScript(`!!document.querySelector('.mmenu')`)) { esc(); await wait(400); check('Esc first closes the mark\'s menu, staying in Mockups', !!log() && (await lwc().executeJavaScript(`!document.querySelector('.mmenu')`)) === true); }
  esc(); await wait(700);
  check('Esc leaves Mockups for the tab he was on', b.cur()?.id === ex().id && b.cur()?.internal !== 'mocklog', String(b.cur()?.url));
  b.openMockLog(); await until(() => Boolean(lwc()) && !lwc().isLoading(), 8000); await wait(900);

  if (shots) {
    mkdirSync(shots, { recursive: true });
    await lwc().executeJavaScript(`[...document.querySelectorAll('.ptab')].find((x) => x.textContent.startsWith('Samara')).click(); true`); await wait(300);
    await lwc().executeJavaScript(`[...document.querySelectorAll('.sh')].find((x) => x.textContent.startsWith('45')).click(); true`); await wait(1200);
    writeFileSync(path.join(shots, 'mockups-menu.png'), (await lwc().capturePage()).toPNG());
    await lwc().executeJavaScript(`[...document.querySelectorAll('.ptab')].find((x) => x.textContent.startsWith('Couch')).click(); true`); await wait(400);
    writeFileSync(path.join(shots, 'mockups-couch.png'), (await lwc().capturePage()).toPNG());
    b.mockStore.setFresh(S46, true); b.sendTabs(); await wait(300);
    await frame.executeJavaScript(`document.getElementById('drawerkey').click(); true`); await wait(900);
    const tv = b.trayV && !b.trayV.webContents.isDestroyed() ? b.trayV.webContents : null;
    if (tv) writeFileSync(path.join(shots, 'tray.png'), (await tv.capturePage()).toPNG());
    writeFileSync(path.join(shots, 'frame.png'), (await frame.capturePage()).toPNG());
    console.log('pictures in ' + shots);
  }
  console.log(bad ? `${bad} FAILED` : 'ALL PASS'); app.exit(bad ? 1 : 0);
});

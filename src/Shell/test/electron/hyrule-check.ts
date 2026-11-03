// His report (2026-11-03): the Hyrule key did nothing ("it doesn't work"): the page came later than the window laid the
// tab out, and Samara threw. And his rule: Hyrule works like Mockups, never a tab in his list. This drives the real
// browser off-screen: the key shows, opens the map in place with no error, adds no row, lights up, full screen works,
// and the key again puts him back on his tab.
//
// Run: npx electron test/electron/hyrule-check.ts
import { app, BrowserWindow, screen } from 'electron';
import http from 'node:http'; import { mkdtempSync, writeFileSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts'; import { AangBrowser } from '../../src/browser.ts'; import { wireBrowser } from '../../src/browseripc.ts';
let thrown = 0;
process.on('uncaughtException', (e) => { thrown++; console.log('HARNESS NOTE ' + String((e as Error).message).split('\n')[0]); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 60_000).unref();
app.on('window-all-closed', () => {});
const HERE = path.dirname(fileURLToPath(import.meta.url));
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.showInactive(); };
BrowserWindow.prototype.focus = function () {};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d ? '  -- ' + d.slice(0, 200) : ''}`); if (!ok) bad++; };
app.whenReady().then(async () => {
  (screen as any).getCursorScreenPoint = () => ({ x: -20000, y: 500 });
  const site = http.createServer((_q, r) => r.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>His page</title><p>hi</p>'));
  await new Promise<void>((r) => site.listen(47953, '127.0.0.1', () => r()));
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const st = mkdtempSync(path.join(os.tmpdir(), 'hyr-'));
  const hy = mkdtempSync(path.join(os.tmpdir(), 'hyrule-home-'));
  writeFileSync(path.join(hy, 'index.html'), '<!doctype html><title>Hyrule</title><button id="f">full</button><script>f.onclick=()=>document.documentElement.requestFullscreen()</script>');
  const src = (f: string) => path.join(HERE, '..', '..', 'src', f);
  const b = new AangBrowser({ origin: pages.origin, stateDir: st, preloadPath: src('preload.cjs'), tabPreloadPath: src('tabpreload.cjs'), settingsPreloadPath: src('settingspreload.cjs'), thingsPreloadPath: src('thingspreload.cjs'), testLocal: true, hyruleDir: hy }) as any;
  wireBrowser(() => b);
  b.open('http://127.0.0.1:47953/'); await wait(2500);
  const w: BrowserWindow = b.win;
  const mine = b.cur().id;
  const thrown0 = thrown;   // anything thrown before the key (the test's own tray set-up) is not the key's
  b.tray(true, { x: 42, y: 62, hy: 80 }); await wait(1200);
  const tv = b.trayV;
  check('the Hyrule key shows (this machine has the map)', await tv.webContents.executeJavaScript("!document.getElementById('hykey').hidden") === true);
  const rows0 = await tv.webContents.executeJavaScript("document.querySelectorAll('[data-tab]').length");
  await tv.webContents.executeJavaScript("document.getElementById('hykey').click(); true");
  await wait(2500);
  const h = b.tabs.find((t: any) => t.internal === 'hyrule');
  check('the key opens Hyrule, with no error thrown', Boolean(h) && thrown === thrown0, `thrown ${thrown - thrown0}`);
  check('Hyrule is in front', b.cur() === h);
  check('its page is the map, from its own folder', String(h?.view?.webContents.getURL()).endsWith('/index.html') && h?.view?.webContents.getTitle() === 'Hyrule', String(h?.view?.webContents.getURL()));
  const rows1 = await tv.webContents.executeJavaScript("document.querySelectorAll('[data-tab]').length");
  check('no new row in his tab list (like Mockups)', rows1 === rows0, `${rows0} -> ${rows1}`);
  check('the key is lit while he is in Hyrule', await tv.webContents.executeJavaScript("document.getElementById('hykey').classList.contains('lit')") === true);
  check('the page can move between its own pages', (await (async () => { const wc = h.view.webContents; const o = new URL(wc.getURL()).origin; await wc.executeJavaScript(`location.href='${o}/index.html?x=1'; true`); await wait(800); return wc.getURL().includes('?x=1'); })()) === true);
  check('but nowhere else', (await (async () => { const wc = h.view.webContents; await wc.executeJavaScript("location.href='http://127.0.0.1:47953/'; true"); await wait(800); return !wc.getURL().startsWith('http://127.0.0.1:47953'); })()) === true);
  await h.view.webContents.executeJavaScript("document.getElementById('f').click(); true", true);
  await wait(1500);
  check('full screen fills the screen', b.fullTab === h.id && w.isFullScreen(), `fullTab ${b.fullTab}, ${w.isFullScreen()}`);
  await h.view.webContents.executeJavaScript('document.exitFullscreen(); true', true);
  await wait(1500);
  check('and leaves it', b.fullTab === null && !w.isFullScreen());
  await tv.webContents.executeJavaScript("document.getElementById('hykey').click(); true");
  await wait(1200);
  check('the key again puts him back on his tab', b.cur()?.id === mine, `${b.cur()?.id} vs ${mine}`);
  await tv.webContents.executeJavaScript("document.getElementById('hykey').click(); true");
  await wait(800);
  check('and Hyrule comes back as he left it (same page, not rebuilt)', b.cur() === h && String(h.view?.webContents.getURL()).includes('?x=1'));
  check('nothing thrown along the way (after the key)', thrown === thrown0, `thrown ${thrown - thrown0}`);
  console.log(bad ? `${bad} FAILED` : 'ALL PASS');
  site.close(); app.exit(bad ? 1 : 0);
});

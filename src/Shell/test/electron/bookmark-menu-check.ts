// His reports (2026-10-20): adding a bookmark froze Samara, and a bookmark could not be changed at all.
// The + key on the shelf in the floating tab list opened the star's name box INSIDE that see-through layer, out of sight,
// and the layer hung over the page. Now the list goes and the band opens its own box. And each bookmark has a menu.
//
// Run: npx electron test/electron/bookmark-menu-check.ts
import { app, BrowserWindow, clipboard, screen } from 'electron';
import http from 'node:http'; import { mkdtempSync, writeFileSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts'; import { AangBrowser } from '../../src/browser.ts'; import { wireBrowser } from '../../src/browseripc.ts';
process.on('uncaughtException', (e) => { console.log('HARNESS NOTE ' + String((e as Error).message).split('\n')[0]); });
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
  const site = http.createServer((_q, r) => r.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>Wiki page</title><p>hi</p>'));
  await new Promise<void>((r) => site.listen(47952, '127.0.0.1', () => r()));
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const st = mkdtempSync(path.join(os.tmpdir(), 'bmm-'));
  const M = ['https://www.netflix.com/browse', 'https://www.youtube.com/', 'https://www.reddit.com/'];
  writeFileSync(path.join(st, 'browser-bookmarks.json'), JSON.stringify(M.map((url, i) => ({ title: ['Netflix', 'YouTube', 'Reddit'][i], url, folder: 'Bookmarks bar' }))));
  const b = new AangBrowser({ origin: pages.origin, stateDir: st, preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'), tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs'), testLocal: true }) as any;
  wireBrowser(() => b);
  b.open('http://127.0.0.1:47952/'); await wait(2500);
  const w: BrowserWindow = b.win;
  b.tray(true, { x: 42, y: 62, hy: 80 }); await wait(1200);
  const tv = b.trayV;
  await tv.webContents.executeJavaScript("document.querySelector('.bm-add').click(); true");
  await wait(1200);
  const inTray = await tv.webContents.executeJavaScript("!document.getElementById('markpanel').hidden");
  const onBand = await w.webContents.executeJavaScript("!document.getElementById('markpanel').hidden");
  check('+ in the floating list: no name box left hidden inside it', inTray === false);
  check('the list slides away', b.trayOn === false);
  check('and the band opens the name box where he can see it', onBand === true);
  check('the page was bookmarked', b.marks.some((m: any) => m.url.startsWith('http://127.0.0.1:47952')), String(b.marks.length));
  const urls = () => b.marks.map((m: any) => m.url);
  b.markOp('rename', M[1], 'Videos'); check('Rename', b.marks.find((m: any) => m.url === M[1])?.title === 'Videos');
  const at = urls().indexOf(M[1]);
  b.markOp('left', M[1]); check('Move left', urls().indexOf(M[1]) === at - 1, urls().join(' '));
  b.markOp('right', M[1]); check('Move right', urls().indexOf(M[1]) === at, urls().join(' '));
  // a stand-in clipboard: a test never touches his real one
  let copied = ''; const realWrite = clipboard.writeText; (clipboard as any).writeText = (t: string) => { copied = t; };
  b.markOp('copy', M[2]); check('Copy link', copied === M[2], copied); (clipboard as any).writeText = realWrite;
  const before = b.tabs.length; b.markOp('newtab', M[0]); await wait(300); check('Open in new tab', b.tabs.length === before + 1);
  let played = ''; b.onPlayInPopout = (u: string) => { played = u; }; b.markOp('pop', M[1]); check('Play in the pop-out', played === M[1]);
  b.markOp('remove', M[2]); check('Remove', !urls().includes(M[2]));
  b.markOp('rename', 'https://not-a-bookmark.example/', 'x'); check('a page that is not a bookmark is left alone', !urls().includes('https://not-a-bookmark.example/'));
  console.log(bad ? `${bad} FAILED` : 'ALL PASS'); app.exit(bad ? 1 : 0);
});

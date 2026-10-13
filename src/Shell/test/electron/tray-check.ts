// The real browser, off screen and never focused: (1) the tab list floats above a LIVE page that keeps its full size
// (2026-10-13, his ask: Twitch froze under the old drawer); (2) a paid site on the only tab never closes the window
// (his report: clicking Prime closed the whole browser on the PC and crashed it on the Mac).
//
// Run: npx electron test/electron/tray-check.ts <folder for pictures>
import { app, BrowserWindow } from 'electron';
import http from 'node:http';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';
import { AangBrowser } from '../../src/browser.ts';

// A background list download (the fake-site lists) can trip Node's own fetch: noted, not fatal to the check.
process.on('uncaughtException', (e) => { console.log('HARNESS NOTE ' + String((e as Error).message).split('\n')[0]); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 120_000).unref();
app.on('window-all-closed', () => { /* the test decides */ });
const state = mkdtempSync(path.join(os.tmpdir(), 'tray-check-'));
app.setPath('userData', state);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(process.argv[process.argv.length - 1] ?? os.tmpdir());
mkdirSync(OUT, { recursive: true });
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
// Never on his screen and never taking the keyboard: every window opens far off to the side, without focus.
const realShow = BrowserWindow.prototype.show;
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.showInactive(); };
BrowserWindow.prototype.focus = function () { /* not in a test */ };
void realShow;

let bad = 0;
const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d ? '  -- ' + d : ''}`); if (!ok) bad++; };

app.whenReady().then(async () => {
  // A page that keeps changing, like a stream.
  const srv = http.createServer((_q, r) => r.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>Live</title><body style="margin:0;background:#123"><div id=n style="font:80px sans-serif;color:#fff">0</div><script>let i=0;setInterval(()=>n.textContent=++i,50)</script>'));
  await new Promise<void>(r => srv.listen(0, '127.0.0.1', () => r()));
  const live = `http://127.0.0.1:${(srv.address() as any).port}/`;
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const b = new AangBrowser({ origin: pages.origin, stateDir: state, preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs') });
  b.prefs.home = live;
  b.open(live);
  await wait(3000);
  const any = b as any;
  const tab = any.cur();
  check('a tab is open on the live page', Boolean(tab?.view), tab?.url);
  const before = tab.view.getBounds();
  b.tray(true, { x: 42, y: 62 });
  await wait(1500);
  const tray = any.trayV;
  check('the tab list is its own layer, shown', Boolean(tray) && tray.getVisible());
  check('the page stays live (still shown, not a picture)', tab.view.getVisible() === true);
  check('the page keeps its full size', JSON.stringify(tab.view.getBounds()) === JSON.stringify(before), `${JSON.stringify(before)} -> ${JSON.stringify(tab.view.getBounds())}`);
  const kids = any.win.contentView.children;
  check('the list lies above the page', kids.indexOf(tray) > kids.indexOf(tab.view));
  const n1 = Number(await tab.view.webContents.executeJavaScript('n.textContent')); await wait(1500);   // off screen, Windows slows it to about once a second
  const n2 = Number(await tab.view.webContents.executeJavaScript('n.textContent'));
  check('the page keeps playing under the list', n2 > n1, `${n1} -> ${n2}`);
  try { writeFileSync(path.join(OUT, 'tray-layer.png'), (await tray.webContents.capturePage()).toPNG()); } catch { /* off screen: no picture */ }
  const rows = await tray.webContents.executeJavaScript(`document.querySelectorAll('#tabs .tp').length`);
  check('the list shows the tabs', rows >= 1, `${rows} rows`);
  b.tray(false);
  await wait(300);
  check('it puts away', tray.getVisible() === false);

  // A paid site on the only tab: it goes to the paid-video window, and the browser stays open.
  let paid = '';
  b.onPaid = (u) => { paid = u; return true; };
  b.go('https://www.primevideo.com/');
  await wait(2500);
  check('Prime went to the paid-video window', paid.startsWith('https://www.primevideo.com'));
  check('the browser window is still open', Boolean(any.win && !any.win.isDestroyed()));
  check('its tab went back to the home page', any.tabs.length === 1 && String(any.cur()?.url ?? '').startsWith(live), any.cur()?.url);

  b.closeAll(); srv.close(); pages.close();
  console.log(bad ? `${bad} failed` : 'all passed');
  setTimeout(() => app.exit(bad ? 1 : 0), 500);
});

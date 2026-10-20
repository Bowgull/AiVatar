// A picture of Samara's tab drawer with real bookmarks, for design work (sheet 43, 2026-10-20). Not a pass/fail test.
// Give it a folder holding browser-bookmarks.json and browser-favicons.json (copies, never his live files) and a PNG path.
//
// Run: npx electron test/electron/drawer-picture.ts <state folder> <out.png>
import { app, BrowserWindow, screen } from 'electron';
import http from 'node:http';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';
import { AangBrowser } from '../../src/browser.ts';
import { wireBrowser } from '../../src/browseripc.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS NOTE ' + String((e as Error).message).split('\n')[0]); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 60_000).unref();
app.on('window-all-closed', () => { /* the script decides */ });
const HERE = path.dirname(fileURLToPath(import.meta.url));
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.showInactive(); };
BrowserWindow.prototype.focus = function () { /* not here */ };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const [state, out] = process.argv.slice(-2);

app.whenReady().then(async () => {
  (screen as any).getCursorScreenPoint = () => ({ x: -20000, y: 500 });
  const site = http.createServer((_q, r) => r.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>Inbox</title><body style="margin:0;background:#202124;color:#ddd;font:16px sans-serif"><div style="padding:40px">A page</div>'));
  await new Promise<void>((r) => site.listen(47944, '127.0.0.1', () => r()));
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const b = new AangBrowser({ origin: pages.origin, stateDir: state!, preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs'), testLocal: true }) as any;
  wireBrowser(() => b);
  b.open('http://127.0.0.1:47944/');
  await wait(2500);
  b.newTab('http://127.0.0.1:47944/?two', null, false); await wait(800);
  for (const q of ['three', 'four', 'five']) { b.newTab('http://127.0.0.1:47944/?' + q, null, false); await wait(300); }
  const w: BrowserWindow = b.win;
  w.setSize(1280, 800);
  await wait(500);
  await w.webContents.executeJavaScript("document.body.classList.add('drawer-open'); true");
  // DRAWER_HOVER=1 (rules added through the stylesheet: the page's own rules refuse an added <style>): show two keys' banners as if pointed at (one on the top row, one below), for the picture.
  if (process.env.DRAWER_HOVER) await w.webContents.executeJavaScript(`(() => { const sh = [...document.styleSheets].find((x) => (x.href || '').includes('browser.css')); sh.insertRule('.bm-key.pic .bm-banner{opacity:1;transform:translate(-50%,0) scale(1)}', sh.cssRules.length); sh.insertRule('.bm-key.pic{top:-2px;box-shadow:0 7px 0 #120A05,0 0 0 2px #FFC43C,0 0 14px rgba(255,190,90,.55)}', sh.cssRules.length); const k = document.querySelectorAll('.bm-key'); k[1]?.classList.add('pic'); k[5]?.classList.add('pic'); return true; })()`);
  await wait(800);
  if (process.env.DRAWER_MEASURE) console.log('MEASURE ' + await w.webContents.executeJavaScript(`JSON.stringify({ shelf: document.querySelector('.shelf-bk').getBoundingClientRect().width, inner: document.getElementById('marks').clientWidth, key: document.querySelector('.bm-key')?.getBoundingClientRect().width })`));
  const img = await w.webContents.capturePage();
  writeFileSync(out!, img.toPNG());
  console.log('picture: ' + out);
  app.exit(0);
});

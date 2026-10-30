// His catch (2026-10-30): Gmail's compose showed contacts.google.com in the address bar, the address of a frame inside
// it. A frame changing its own address must never change the tab's; the page's own move still does. Off screen.
// Run (from src/Shell):  node_modules/electron/dist/Electron.app/Contents/MacOS/Electron test/electron/frame-address-check.ts
import { app, BrowserWindow, screen } from 'electron';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.argv.at(-1)!.endsWith('.png') ? process.argv.at(-1)! : path.join(os.tmpdir(), 'catpage.png');
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 90_000).unref();
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'samara-cat-ud-')));
app.on('window-all-closed', () => { /* the harness decides */ });
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setOpacity(0); this.showInactive(); };
BrowserWindow.prototype.focus = function () { /* never in a test */ };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  (screen as any).getCursorScreenPoint = () => ({ x: -20000, y: 500 });
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const { wireBrowser } = await import('../../src/browseripc.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const stateDir = mkdtempSync(path.join(os.tmpdir(), 'samara-cat-state-'));
  const b = new AangBrowser({ origin: pages.origin, stateDir, preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'),
    thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs') } as any);
  wireBrowser(() => b);
  const http = await import('node:http');
  const PAGE = '<!doctype html><title>Mail</title><p>Mail</p><iframe src="http://localhost:47995/frame"></iframe>';
  const FRAME = '<!doctype html><p>contacts</p><script>setTimeout(() => history.pushState({}, "", "/frame/widget?x=1"), 300)</script>';
  http.createServer((q, r) => r.writeHead(200, { 'Content-Type': 'text/html' }).end(String(q.url).startsWith('/frame') ? FRAME : PAGE)).listen(47995, '127.0.0.1');
  b.open('http://127.0.0.1:47995/inbox');
  let ok = true;
  const check = (n: string, p: boolean, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'} ${n}${d ? '  -- ' + d : ''}`); ok &&= p; };
  const cur = () => (b as any).tabs.find((t: any) => String(t.url).includes('47995'))?.url as string | undefined;
  for (let i = 0; i < 40 && !cur(); i++) await wait(250);
  await wait(2500);
  check('a frame moving inside the page leaves the address alone', cur() === 'http://127.0.0.1:47995/inbox', String(cur()));
  const t = (b as any).tabs.find((x: any) => String(x.url).includes('47995'));
  await t.view.webContents.mainFrame.executeJavaScript('history.pushState({}, "", "/inbox/compose")');
  await wait(800);
  check("the page's own move still changes it", cur() === 'http://127.0.0.1:47995/inbox/compose', String(cur()));
  console.log(ok ? 'ALL PASS' : 'FAILED'); app.exit(ok ? 0 : 1);
});

// The real browser, off screen and never focused: dragging a tab out of its window (his ask, 2026-10-13).
// (1) let go outside: the tab becomes its own window, its page still live and still the same page (nothing reloaded),
//     and the window it left shows its next tab; (2) let go on another browser window: it joins that one, and the
//     window it left (now empty) closes while the browser goes on; (3) let go inside its own window: nothing happens;
//     (4) the only tab in a window: the window itself moves.
//
// Run: npx electron test/electron/tearout-check.ts
import { app, BrowserWindow, screen } from 'electron';
import http from 'node:http';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';
import { AangBrowser } from '../../src/browser.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS NOTE ' + String((e as Error).message).split('\n')[0]); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 120_000).unref();
app.on('window-all-closed', () => { /* the test decides */ });
const state = mkdtempSync(path.join(os.tmpdir(), 'tearout-check-'));
app.setPath('userData', state);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
// Never on his screen and never taking the keyboard: every window opens far off to the side, without focus.
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.showInactive(); };
BrowserWindow.prototype.focus = function () { /* not in a test */ };
// Where the mouse is let go: set by the test, never his real pointer.
let pointer = { x: -20000, y: 500 };

let bad = 0;
const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d ? '  -- ' + d : ''}`); if (!ok) bad++; };

app.whenReady().then(async () => {
  (screen as any).getCursorScreenPoint = () => pointer;     // the screen module exists only once the app is ready
  const srv = http.createServer((q, r) => r.writeHead(200, { 'Content-Type': 'text/html' }).end(`<!doctype html><title>${q.url === '/b' ? 'Bee' : 'Live'}</title><body style="margin:0;background:#123"><div id=n style="font:80px sans-serif;color:#fff">0</div><script>window.born=Math.random();let i=0;setInterval(()=>n.textContent=++i,50)</script>`));
  await new Promise<void>(r => srv.listen(0, '127.0.0.1', () => r()));
  const base = `http://127.0.0.1:${(srv.address() as any).port}`;
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const b = new AangBrowser({ origin: pages.origin, stateDir: state, preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs') });
  b.prefs.home = base + '/';
  b.open(base + '/');
  await wait(3000);
  const any = b as any;
  const beeId = b.newTab(base + '/b')!;
  await wait(2000);
  const bee = any.tabs.find((x: any) => x.id === beeId);
  const born = await bee.view.webContents.executeJavaScript('window.born');
  const A = any.panes[0];
  check('starts with one window and two tabs', any.panes.length === 1 && any.tabs.length === 2);

  // (3) let go inside its own window: nothing
  const ab = A.win.getBounds();
  pointer = { x: ab.x + 50, y: ab.y + 50 };
  b.tearOut(beeId);
  await wait(500);
  check('let go inside its own window: nothing happens', any.panes.length === 1 && bee.pane === A.id);

  // (1) let go outside: its own window
  pointer = { x: -20000, y: 500 };
  b.tearOut(beeId);
  await wait(2500);
  const B = any.panes.find((p: any) => p !== A);
  check('let go outside: a second window opens', any.panes.length === 2 && Boolean(B?.win));
  check('the tab is in the new window', bee.pane === B?.id && B?.active === beeId);
  check('its page is shown in the new window', B?.win.contentView.children.includes(bee.view) && !A.win.contentView.children.includes(bee.view));
  check('the same page, not reloaded', (await bee.view.webContents.executeJavaScript('window.born')) === born);
  const n1 = Number(await bee.view.webContents.executeJavaScript('n.textContent')); await wait(1500);
  const n2 = Number(await bee.view.webContents.executeJavaScript('n.textContent'));
  check('it keeps running', n2 > n1, `${n1} -> ${n2}`);
  const left = any.tabs.find((x: any) => x.pane === A.id);
  check('the window it left shows its other tab', A.active === left?.id && left?.view?.getVisible() === true);
  const rowsA = await A.win.webContents.executeJavaScript(`document.querySelectorAll('#tabs .tp').length`);
  const rowsB = await B.win.webContents.executeJavaScript(`document.querySelectorAll('#tabs .tp').length`);
  check('each window lists only its own tabs', rowsA === 1 && rowsB === 1, `${rowsA} and ${rowsB}`);

  // (2) let go on the first window: it joins it, and the empty window closes
  B.win.setPosition(-12000, 100);
  const a2 = A.win.getBounds();
  pointer = { x: a2.x + 300, y: a2.y + 300 };
  b.tearOut(beeId);
  await wait(1500);
  check('let go on another window: it joins that one', bee.pane === A.id && A.active === beeId && A.win.contentView.children.includes(bee.view));
  check('the empty window closed, the browser goes on', any.panes.length === 1 && b.showing && any.tabs.length === 2);
  check('still the same page', (await bee.view.webContents.executeJavaScript('window.born')) === born);

  // The right-click "Move to a new window": the same, a little down and right
  b.newTab(base + '/');
  await wait(1500);
  b.tabAct(beeId, 'newwindow');
  await wait(2500);
  const C = any.panes.find((p: any) => p !== A);
  check('Move to a new window: it gets a window of its own', any.panes.length === 2 && bee.pane === C?.id && C?.active === beeId);
  check('still the same page after the menu move', (await bee.view.webContents.executeJavaScript('window.born')) === born);
  C.win.setPosition(-12000, 100);
  const a3 = A.win.getBounds();
  pointer = { x: a3.x + 300, y: a3.y + 300 };
  b.tearOut(beeId);
  await wait(1500);
  check('and back again by dragging', any.panes.length === 1 && bee.pane === A.id);
  for (const t of any.tabs.filter((x: any) => x.id !== beeId && x.id !== left.id)) b.close(t.id);
  await wait(500);

  // (4) the only tab in its window: the window moves
  b.close(left.id);
  await wait(500);
  pointer = { x: -15000, y: 300 };
  b.tearOut(beeId);
  await wait(500);
  const nb = A.win.getBounds();
  check('the only tab: its window moves where it was let go', any.panes.length === 1 && Math.abs(nb.x - (-15000 + -140)) < 2, JSON.stringify(nb));

  b.closeAll(); srv.close(); pages.close();
  console.log(bad ? `${bad} failed` : 'all passed');
  setTimeout(() => app.exit(bad ? 1 : 0), 500);
});

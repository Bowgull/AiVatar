// A double-click on the band's wood fills the window and a second one brings it back (2026-10-23, his report: nothing
// happened on the Mac); a double-click on the address or a key does nothing. The Mac's own setting decides (Zoom by
// default). Run: npx electron test/electron/titledbl-check.ts
import { app, BrowserWindow, systemPreferences } from 'electron';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.on('uncaughtException', (e) => console.log('HARNESS NOTE ' + (e as Error).message));
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 60_000).unref();
const HERE = path.dirname(fileURLToPath(import.meta.url));
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'tdbl-ud-')));
app.on('window-all-closed', () => {});
BrowserWindow.prototype.focus = function () {};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ok = (name: string, pass: boolean, note = '') => { console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${note ? ' (' + note + ')' : ''}`); return pass; };
app.whenReady().then(async () => {
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const { wireBrowser } = await import('../../src/browseripc.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const b: any = new AangBrowser({ origin: pages.origin, stateDir: mkdtempSync(path.join(os.tmpdir(), 'tdbl-state-')), preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs') });
  wireBrowser(() => b);
  b.open('about:blank'); await wait(2500);
  const w: BrowserWindow = b.win; w.setBounds({ x: 80, y: 80, width: 900, height: 600 }); await wait(500);
  const dbl = (sel: string) => w.webContents.mainFrame.executeJavaScript(`document.querySelector(${JSON.stringify(sel)}).dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); 1`);
  const set = systemPreferences.getUserDefault('AppleActionOnDoubleClick', 'string') || '(not set: Zoom)';
  console.log('this Mac is set to: ' + set);
  await dbl('#band'); await wait(900);
  let all = ok('double-click on the wood fills the window', w.isMaximized());
  await dbl('#band'); await wait(900);
  all = ok('a second double-click brings it back', !w.isMaximized() && w.getBounds().width === 900, JSON.stringify(w.getBounds())) && all;
  await dbl('#slot'); await wait(700);
  all = ok('a double-click on the address does nothing to the window', !w.isMaximized()) && all;
  await dbl('#reload'); await wait(700);
  all = ok('a double-click on a key does nothing to the window', !w.isMaximized()) && all;
  console.log(all ? 'ALL PASS' : 'FAILED'); app.exit(all ? 0 : 1);
});

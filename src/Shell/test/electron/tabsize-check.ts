// Sheet 71: the Tab list size row in Settings, pressed with a real click, changes the list and is kept for this machine
// only (browser-local.json, never browser-prefs.json, which syncs). Run: npx electron test/electron/tabsize-check.ts
import { app, BrowserWindow } from 'electron';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.on('uncaughtException', (e) => console.log('HARNESS NOTE ' + (e as Error).message));
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 90_000).unref();
const HERE = path.dirname(fileURLToPath(import.meta.url));
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'tsz-ud-')));
app.on('window-all-closed', () => {});
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setOpacity(0); this.showInactive(); };
BrowserWindow.prototype.focus = function () {};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ok = (n: string, p: boolean, note = '') => { console.log(`${p ? 'PASS' : 'FAIL'} ${n}${note ? ' (' + note + ')' : ''}`); return p; };
app.whenReady().then(async () => {
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const { wireBrowser } = await import('../../src/browseripc.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const stateDir = mkdtempSync(path.join(os.tmpdir(), 'tsz-state-'));
  const opts = { origin: pages.origin, stateDir, preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'), tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'),
    settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs') };
  const b: any = new AangBrowser(opts as any);
  wireBrowser(() => b);
  b.open();
  await wait(2000);
  b.openSettings('general');
  const st = () => b.tabs.find((t: any) => t.internal === 'settings')?.view?.webContents as Electron.WebContents | undefined;
  for (let i = 0; i < 50 && !(st() && !st()!.isLoading()); i++) await wait(100);
  await wait(800);
  let all = ok('the row shows Large picked at first', await st()!.executeJavaScript(`document.querySelector('.choice[data-key="tabSize"] .on')?.dataset.v`, true) === 'l');
  const at = await st()!.executeJavaScript(`(() => { const e = document.querySelector('.choice[data-key="tabSize"] [data-v="s"]'); e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; })()`, true) as [number, number];
  await wait(200);
  st()!.sendInputEvent({ type: 'mouseDown', x: at[0], y: at[1], button: 'left', clickCount: 1 }); await wait(40);
  st()!.sendInputEvent({ type: 'mouseUp', x: at[0], y: at[1], button: 'left', clickCount: 1 }); await wait(600);
  all = ok('a click on Small sets it', b.tabSize === 's', b.tabSize) && all;
  all = ok('the row now shows Small picked', await st()!.executeJavaScript(`document.querySelector('.choice[data-key="tabSize"] .on')?.dataset.v`, true) === 's') && all;
  all = ok('the band page wears the small size', await b.win.webContents.executeJavaScript(`document.documentElement.classList.contains('tsize-s')`, true) === true) && all;
  const local = existsSync(path.join(stateDir, 'browser-local.json')) ? readFileSync(path.join(stateDir, 'browser-local.json'), 'utf8') : '';
  const prefs = existsSync(path.join(stateDir, 'browser-prefs.json')) ? readFileSync(path.join(stateDir, 'browser-prefs.json'), 'utf8') : '';
  all = ok('kept for this machine only', local.includes('"s"') && !prefs.includes('tabSize'), local) && all;
  const b2: any = new AangBrowser({ ...opts } as any);
  all = ok('still Small after a restart', b2.tabSize === 's') && all;
  console.log(all ? 'ALL PASS' : 'FAILED'); app.exit(all ? 0 : 1);
});

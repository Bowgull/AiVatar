// Sheet 87 v12 (2026-10-25, his answers: the mask is the key): Samara's real secret window, for the sheet. Plain test tabs.
//  -locked.png    locked: the night page, no tab arrow, only the mask
//  -pin.png       one click on the mask: the PIN box
//  -open.png      after the PIN: the arrow, the list (-list.png) and the ⋯ menu at night (-menu.png)
//  -cover.png     a click on the mask while open: Brave Search, the night look and the mask, everything else put away
// Run: STATE=<dir with a browser-tabs.json> npx electron test/electron/secret-sheet-shot.ts <out-prefix>
import { app, BrowserWindow } from 'electron';
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.on('uncaughtException', (e) => console.log('HARNESS NOTE ' + (e as Error).message));
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 150_000).unref();
const HERE = path.dirname(fileURLToPath(import.meta.url));
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'sshot-ud-')));
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.on('window-all-closed', () => {});
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setOpacity(0); this.showInactive(); };
BrowserWindow.prototype.focus = function () {};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  const out = process.argv[process.argv.length - 1];
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const { wireBrowser } = await import('../../src/browseripc.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const P = (f: string) => path.join(HERE, '..', '..', 'src', f);
  const dir = mkdtempSync(path.join(os.tmpdir(), 'sshot-s-')), sdir = path.join(dir, 'secret'); mkdirSync(sdir);
  copyFileSync(path.join(process.env.STATE!, 'browser-tabs.json'), path.join(sdir, 'browser-tabs.json'));
  const s: any = new AangBrowser({ origin: pages.origin, preloadPath: P('preload.cjs'), tabPreloadPath: P('tabpreload.cjs'), settingsPreloadPath: P('settingspreload.cjs'), thingsPreloadPath: P('thingspreload.cjs'), stateDir: sdir, sharedDir: dir, secret: true });
  wireBrowser(() => null, () => s);
  s.open();
  for (let i = 0; i < 100 && !s.win; i++) await wait(150);
  s.win.setContentSize(1100, 700);
  await wait(4000);
  const fw = s.win.webContents;
  const shot = async (name: string) => writeFileSync(`${out}-${name}.png`, (await fw.capturePage()).toPNG());
  await shot('locked');
  s.tray(true, { x: 42, y: 62, hy: 80 }); await wait(500);
  await fw.executeJavaScript(`(() => { const l = document.querySelectorAll('#spinlights i'); l.forEach((x, i) => { if (i < 2) x.className = 'f'; }); return l.length; })()`);
  await wait(300);
  await shot('pin');
  await s.secretPinAct({ act: 'set', pin: '1234' });
  await wait(3500);
  await shot('open');
  writeFileSync(`${out}-list.png`, (await s.trayV.webContents.capturePage()).toPNG());
  s.tray(false); await wait(700);
  await fw.executeJavaScript(`document.getElementById('menukey').click(); 1`);
  await wait(700);
  await shot('menu');
  await fw.executeJavaScript(`document.getElementById('menukey').click(); 1`);
  // The cover, as it will be built: everything put away, Brave Search in the throwaway session.
  await s.lock();
  s.go('https://search.brave.com/');
  await wait(6000);
  await shot('cover');
  const v = s.cur()?.view;
  if (v) { writeFileSync(`${out}-coverpage.png`, (await v.webContents.capturePage()).toPNG()); console.log('PAGE ' + JSON.stringify(v.getBounds())); }
  app.exit(0);
});

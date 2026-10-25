// Sheet 87 v12 (2026-10-25): the secret window's real ⋯ menu, unlocked, with the New PIN line drawn in (not built yet).
// Run: npx electron test/electron/secret-menu-shot.ts <out.png>
import { app, BrowserWindow } from 'electron';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.on('uncaughtException', (e) => console.log('HARNESS NOTE ' + (e as Error).message));
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 120_000).unref();
const HERE = path.dirname(fileURLToPath(import.meta.url));
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'smenu-ud-')));
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.on('window-all-closed', () => {});
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setOpacity(0); this.showInactive(); };
BrowserWindow.prototype.focus = function () {};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const { wireBrowser } = await import('../../src/browseripc.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const P = (f: string) => path.join(HERE, '..', '..', 'src', f);
  const dir = mkdtempSync(path.join(os.tmpdir(), 'smenu-s-')), sdir = path.join(dir, 'secret'); mkdirSync(sdir);
  const s: any = new AangBrowser({ origin: pages.origin, preloadPath: P('preload.cjs'), tabPreloadPath: P('tabpreload.cjs'), settingsPreloadPath: P('settingspreload.cjs'), thingsPreloadPath: P('thingspreload.cjs'), stateDir: sdir, sharedDir: dir, secret: true });
  wireBrowser(() => null, () => s);
  s.open();
  for (let i = 0; i < 100 && !s.win; i++) await wait(150);
  s.win.setContentSize(1100, 700);
  await wait(4000);
  s.tray(true, { x: 42, y: 62 });
  await s.secretPinAct({ act: 'set', pin: '1234' });
  s.tray(false);
  await wait(1500);
  const fw = s.win.webContents;
  await fw.executeJavaScript(`(() => {
    document.getElementById('menukey').click();
    const set = document.getElementById('m-settings');
    const row = set.cloneNode(true); row.id = 'm-newpin'; row.querySelector('span').textContent = 'New PIN';
    set.before(row); return 1; })()`);
  await wait(800);
  writeFileSync(process.argv[process.argv.length - 1], (await fw.capturePage()).toPNG());
  app.exit(0);
});

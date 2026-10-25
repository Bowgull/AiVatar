// Sheet 89 v3 (2026-10-25, his "what will Stremio look like inside Samara when I click it?"): web Stremio in a real
// Samara tab at 1440 wide, and Samara's bookmarks shelf with Stremio's real icon (its own apple-touch icon).
// Run: STATE=<dir with a browser-tabs.json> ICON=<stremio png> npx electron test/electron/stremio-shot.ts <out-prefix>
import { app, BrowserWindow } from 'electron';
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.on('uncaughtException', (e) => console.log('HARNESS NOTE ' + (e as Error).message));
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.message ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 150_000).unref();
const HERE = path.dirname(fileURLToPath(import.meta.url));
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'st-ud-')));
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
  const dir = mkdtempSync(path.join(os.tmpdir(), 'st-s-'));
  copyFileSync(path.join(process.env.STATE!, 'browser-tabs.json'), path.join(dir, 'browser-tabs.json'));
  const b: any = new AangBrowser({ origin: pages.origin, preloadPath: P('preload.cjs'), tabPreloadPath: P('tabpreload.cjs'), settingsPreloadPath: P('settingspreload.cjs'), thingsPreloadPath: P('thingspreload.cjs'), stateDir: dir });
  wireBrowser(() => b);
  b.marks.push({ title: 'Stremio', url: 'https://web.stremio.com/', folder: '' });
  b.icons.set('web.stremio.com', 'data:image/png;base64,' + readFileSync(process.env.ICON!).toString('base64'));
  b.open();
  for (let i = 0; i < 100 && !b.win; i++) await wait(150);
  b.win.setContentSize(1440, 900);
  await wait(5000);
  const fw = b.win.webContents;
  await fw.executeJavaScript(`document.getElementById('drawerkey').click(); 1`);
  await wait(3500);
  writeFileSync(`${out}-shelf.png`, (await b.trayV.webContents.capturePage({ x: 0, y: 0, width: 340, height: 200 })).toPNG());
  b.tray(false); await wait(800);
  b.go('https://web.stremio.com/');
  await wait(15000);
  const v = b.cur().view, r = v.getBounds();
  // Stremio's own seasonal box goes first (its close button), as he would close it
  const cx = await v.webContents.executeJavaScript(`(() => { const x = [...document.querySelectorAll('[class*="close"], [title="Close"], button')].find((e) => { const k = e.getBoundingClientRect(); return k.width > 10 && k.width < 60 && k.top > 100 && k.top < 260 && k.left > 800; }); if (!x) return null; const k = x.getBoundingClientRect(); return [k.x + k.width / 2, k.y + k.height / 2]; })()`);
  if (cx) { v.webContents.sendInputEvent({ type: 'mouseDown', x: Math.round(cx[0]), y: Math.round(cx[1]), button: 'left', clickCount: 1 }); v.webContents.sendInputEvent({ type: 'mouseUp', x: Math.round(cx[0]), y: Math.round(cx[1]), button: 'left', clickCount: 1 }); await wait(2500); }
  console.log('BANNER ' + await v.webContents.executeJavaScript(`(() => { const t = [...document.querySelectorAll('div,span,p')].filter((e) => { const k = e.getBoundingClientRect(); return k.top > 650 && k.height < 80 && e.children.length < 3 && e.textContent.trim().length > 10; }).map((e) => e.textContent.trim()); return JSON.stringify([...new Set(t)].slice(0, 4)); })()`));
  writeFileSync(`${out}-frame.png`, (await fw.capturePage()).toPNG());
  writeFileSync(`${out}-page.png`, (await v.webContents.capturePage()).toPNG());
  console.log(`PAGE ${r.x} ${r.y} ${r.width} ${r.height} url ${v.webContents.getURL()}`);
  app.exit(0);
});

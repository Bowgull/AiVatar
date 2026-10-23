// A picture of HIS tab list as it is (2026-10-23, his note on sheet 80: "this isn't how mockups look in my tabs"): a copy
// of his own tabs and mockups files (never the files themselves), the real list layer, scrolled to the Mockups.
// Run: STATE=<copy dir> npx electron test/electron/real-trail-shot.ts <out-prefix>
import { app, BrowserWindow } from 'electron';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.on('uncaughtException', (e) => console.log('HARNESS NOTE ' + (e as Error).message));
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 150_000).unref();
const HERE = path.dirname(fileURLToPath(import.meta.url));
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'rts-ud-')));
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
  const b: any = new AangBrowser({ origin: pages.origin, stateDir: process.env.STATE!, mockupsAnywhere: true, preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs') } as any);
  wireBrowser(() => b);
  b.open();
  for (let i = 0; i < 100 && !b.win; i++) await wait(150);
  b.win.setContentSize(1100, Number(process.env.H) || 1000);
  await wait(6000);
  // PARK=74: park that sheet's open version (it should leave the list for History).
  if (process.env.PARK) { const t = b.tabs.find((x: any) => x.mock && String(x.title).startsWith(process.env.PARK + ' ·')); const info = t ? b.mockTab(t) : null; if (info?.vid != null) b.mockAct('stage', { id: info.vid, to: 'park' }); await wait(800); }
  b.tray(true, { x: 42, y: 62, hy: 80 });
  await wait(1500);
  // MENU=75: the right-click menu on that mockup tab.
  if (process.env.MENU) await b.trayV.webContents.executeJavaScript(`(() => { const r = [...document.querySelectorAll('.tp')].find((e) => e.textContent.includes(${JSON.stringify(process.env.MENU + ' ·')})); if (!r) return 0; r.scrollIntoView({ block: 'center' }); const b = r.getBoundingClientRect(); r.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: b.left + 60, clientY: b.top + 20 })); return 1; })()`);
  const out = process.argv.find((a) => a.endsWith('-shot')) ?? path.join(os.tmpdir(), 'trail');
  const total = process.env.MENU ? 'menu' : await b.trayV.webContents.executeJavaScript(`(() => { const d = document.querySelector('.drawer'); const m = [...document.querySelectorAll('.drawer *')].find((e) => /MOCKUPS/.test(e.textContent || '') && e.children.length < 4); if (m) d.scrollTop = Math.max(0, m.offsetTop - 20); return [d.scrollTop, d.scrollHeight, d.clientHeight]; })()`);
  console.log('SCROLL ' + JSON.stringify(total));
  for (let k = 0; k < (process.env.MENU ? 1 : 3); k++) {
    await wait(500);
    writeFileSync(`${out}-${k}.png`, (await b.trayV.webContents.capturePage()).toPNG());
    await b.trayV.webContents.executeJavaScript(`(() => { const d = document.querySelector('.drawer'); d.scrollTop += d.clientHeight - 80; return 1; })()`);
  }
  console.log('SHOT');
  app.exit(0);
});

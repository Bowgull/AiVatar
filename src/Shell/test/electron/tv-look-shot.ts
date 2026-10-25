// Sheet 89 (2026-10-25): the TV ask and the TV light as built, in Samara's real frame over a real page, to check against
// the sheet. Run: npx electron test/electron/tv-look-shot.ts <out-prefix>
import { app, BrowserWindow } from 'electron';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.message ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 120_000).unref();
const HERE = path.dirname(fileURLToPath(import.meta.url));
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'tl-ud-')));
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.on('window-all-closed', () => {});
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setOpacity(0); this.showInactive(); };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  const out = process.argv[process.argv.length - 1];
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const { wireBrowser } = await import('../../src/browseripc.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const P = (f: string) => path.join(HERE, '..', '..', 'src', f);
  const b: any = new AangBrowser({ origin: pages.origin, preloadPath: P('preload.cjs'), tabPreloadPath: P('tabpreload.cjs'), settingsPreloadPath: P('settingspreload.cjs'), thingsPreloadPath: P('thingspreload.cjs'), stateDir: mkdtempSync(path.join(os.tmpdir(), 'tl-s-')) });
  wireBrowser(() => b);
  b.open('https://www.youtube.com/');
  for (let i = 0; i < 100 && !b.cur()?.view; i++) await wait(150);
  b.win.setContentSize(1440, 900);
  await wait(7000);
  const fw = b.win.webContents;
  const shot = async (name: string) => {
    await wait(900);
    const v = b.cur().view, r = v.getBounds();
    writeFileSync(`${out}-${name}-frame.png`, (await fw.capturePage({ x: 0, y: 0, width: 1440, height: 420 })).toPNG());
    writeFileSync(`${out}-${name}-page.png`, (await v.webContents.capturePage({ x: 0, y: 0, width: r.width, height: Math.max(1, 420 - r.y) })).toPNG());
    console.log(`PAGE ${name} ${r.x} ${r.y}`);
  };
  b.tvName = 'yeet'; b.tvAsk = 'setup'; b.sendTabs();
  await shot('setup');
  b.tv = { kind: 'video', tab: b.active, name: 'yeet', title: 'Pixel art tutorial for beginners', site: 'youtube.com' }; b.tvAsk = null; b.sendTabs();
  await shot('light');
  b.tvAsk = 'playing'; b.sendTabs();
  await shot('playing');
  app.exit(0);
});

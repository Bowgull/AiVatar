// A picture of the open tab list with a Mockups trail in it (2026-10-22, his report: "my broom seems to be hovering the
// cleanup icon"). Real band and list layer, a few tabs and three mockups from this repo. Run: npx electron test/electron/drawer-shot.ts <out.png>
import { app, BrowserWindow } from 'electron';
import http from 'node:http';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.on('uncaughtException', (e) => console.log('HARNESS NOTE ' + (e as Error).message));
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 90_000).unref();
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(HERE, '..', '..', '..', '..');
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'dshot-ud-')));
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.on('window-all-closed', () => {});
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setOpacity(0); this.showInactive(); };
BrowserWindow.prototype.focus = function () {};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  http.createServer((q, r) => r.writeHead(200, { 'Content-Type': 'text/html' }).end(`<!doctype html><title>Page ${q.url}</title><p>${q.url}`)).listen(47998, '127.0.0.1');
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const { wireBrowser } = await import('../../src/browseripc.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const stateDir = mkdtempSync(path.join(os.tmpdir(), 'dshot-state-'));
  writeFileSync(path.join(stateDir, 'browser-tabs.json'), JSON.stringify({ v: 1, active: 0, fronts: [0], tabs: Array.from({ length: Number(process.env.TABS) || 3 }, (_, i) => i).map((i) => ({ url: `http://127.0.0.1:47998/p/${i}`, title: `Page ${i + 1}`, scrollY: 0, zoom: 0, win: 0, trail: null })), trails: [], closed: [] }));
  const b: any = new AangBrowser({ origin: pages.origin, stateDir, mockupsAnywhere: true, preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs') } as any);
  wireBrowser(() => b);
  b.open();
  await wait(2500);
  for (const [p, t] of [['docs/cockpit/sheet-68-title-cards.html', '68 · Showcase title cards'], ['docs/cockpit/sheet-69-device-ask.html', '69 · Keyboards and devices'], ['docs/cockpit/sheet-70-arrow-turn.html', '70 · Tab list arrow turning']]) {
    await b.openMockupDrop({ path: p, repo: REPO, url: null, title: t, branch: t.startsWith('68') ? 'Showcase' : 'Samara' }).catch((e: Error) => console.log('HARNESS mock ' + e.message));
    await wait(800);
  }
  await wait(4000);
  b.tray(true, { x: 42, y: 62, hy: 80 });
  await wait(1200);
  // SCROLL=mid: the list scrolled part way, where the broom used to sit over a tab.
  if (process.env.SCROLL) await b.trayV.webContents.executeJavaScript(`(() => { const d = document.querySelector('.drawer'); d.scrollTop = ${process.env.SCROLL === 'end' ? 'd.scrollHeight' : 'Math.round((d.scrollHeight - d.clientHeight) / 2)'}; return d.scrollTop; })()`, true).then((y: number) => console.log('SCROLLED ' + y));
  await wait(300);
  const img = await b.trayV.webContents.capturePage();
  writeFileSync(process.argv.find((a) => a.endsWith('.png')) ?? path.join(os.tmpdir(), 'drawer.png'), img.toPNG());
  console.log('SHOT ' + JSON.stringify(img.getSize()));
  app.exit(0);
});

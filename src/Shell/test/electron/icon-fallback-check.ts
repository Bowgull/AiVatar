// A site whose page offers only an SVG icon still gets one kept for its bookmark (2026-10-22, his Epomaker bookmark
// showed a "K"): the page's icons in order, then /favicon.ico. Opens the real page once. Run: npx electron test/electron/icon-fallback-check.ts [url]
import { app, BrowserWindow } from 'electron';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.on('uncaughtException', (e) => console.log('HARNESS NOTE ' + (e as Error).message));
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 60_000).unref();
const HERE = path.dirname(fileURLToPath(import.meta.url));
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'icon-ud-')));
app.on('window-all-closed', () => {});
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setOpacity(0); this.showInactive(); };
BrowserWindow.prototype.focus = function () {};
const URL0 = process.argv.find((a) => a.startsWith('https://')) ?? 'https://hub.epomaker.com/lighting';
app.whenReady().then(async () => {
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const b: any = new AangBrowser({ origin: pages.origin, stateDir: mkdtempSync(path.join(os.tmpdir(), 'icon-state-')), preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs') } as any);
  b.open(URL0);
  const host = new URL(URL0).hostname;
  for (let i = 0; i < 100 && !b.icons.has(host); i++) await new Promise((r) => setTimeout(r, 200));
  const d: string = b.icons.get(host) ?? '';
  console.log(d ? `PASS kept an icon for ${host}: ${d.slice(0, 40)}... (${d.length} chars)` : `FAIL no icon kept for ${host}; the tab's icon was ${b.tabs[0]?.favicon}`);
  app.exit(d ? 0 : 1);
});

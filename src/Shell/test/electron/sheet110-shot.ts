// Sheet 110 (2026-10-31, his ask): the gold strip on the left of Claude's tabs in the tab list "is very AI slop".
// It marks a tab as one of Claude's (or Aang's) hidden tabs. Real band and list layer, two of his own tabs and a
// made-up "Job scan" of three Claude tabs; VARIANT puts each fix on the real list for its picture. Nothing is built.
// Run (from src/Shell): VARIANT=now|a|b|c npx electron test/electron/sheet110-shot.ts <out.png>
import { app, BrowserWindow, screen } from 'electron';
import http from 'node:http';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.on('uncaughtException', (e) => console.log('HARNESS NOTE ' + (e as Error).message));
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 90_000).unref();
const HERE = path.dirname(fileURLToPath(import.meta.url));
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 's110-ud-')));
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.on('window-all-closed', () => {});
// His rule (2026-10-29): test windows never touch his main monitor or take his keyboard.
const away = () => { const d = screen.getAllDisplays().find((x) => x.id !== screen.getPrimaryDisplay().id); return d ? d.bounds : null; };
BrowserWindow.prototype.show = function (this: BrowserWindow) { const b = away(); if (b) this.setPosition(b.x + 20, b.y + 20); this.setOpacity(0); this.setFocusable(false); this.showInactive(); };
BrowserWindow.prototype.focus = function () {};
app.focus = () => {};
app.dock?.hide();
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Plain made-up favicons: a coloured square with a letter.
const fav = (bg: string, ch: string) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="3" fill="${bg}"/><text x="8" y="12.5" font-family="Arial" font-weight="700" font-size="12" fill="#fff" text-anchor="middle">${ch}</text></svg>`);
const DRIVERS = [{ id: 'j1', name: 'JOB SCAN', kind: 'claude', working: true, pages: [
  { id: 'p1', url: 'https://jobs.northwind.example/1', title: 'Client Account Manager @ Northwind', favicon: fav('#3b4bd8', 'N') },
  { id: 'p2', url: 'https://jobs.contoso.example/2', title: 'Contoso - Account Manager, Partners', favicon: fav('#2f8f7f', 'C') },
  { id: 'p3', url: 'https://jobs.fabrikam.example/3', title: 'Sign In', favicon: fav('#d07a2a', 'F') },
] }];
// Claude's spark, the same 9x9 one the group header uses.
const VARIANTS: Record<string, string> = {
  now: '',
  // A: no strip. The header above already says whose tabs these are.
  a: `.drawer .tp.drv{box-shadow:0 4px 0 var(--outline) !important}`,
  // B: no strip; Claude's spark sits at the end of each row, where the close key sits on his own tabs.
  b: `.drawer .tp.drv{box-shadow:0 4px 0 var(--outline) !important}.drawer .tp.drv .own110{margin-left:auto;flex:0 0 auto;display:grid;place-items:center;width:22px;height:22px;opacity:.9}`,
  // C: no strip; Claude's tabs are pressed into the list (borrowed), his own stand up as keys.
  c: `.drawer .tp.drv{background:#2a1b0f !important;color:#d9c7a3 !important;box-shadow:inset 0 3px 0 rgba(0,0,0,.5),inset 0 -1px 0 rgba(255,222,170,.10) !important;transform:translateY(3px)}`,
};
app.whenReady().then(async () => {
  http.createServer((q, r) => r.writeHead(200, { 'Content-Type': 'text/html' }).end(`<!doctype html><title>${q.url === '/p/0' ? 'Inbox - Mail' : 'Weekend plans'}</title><p>${q.url}`)).listen(47110, '127.0.0.1');
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const { wireBrowser } = await import('../../src/browseripc.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const stateDir = mkdtempSync(path.join(os.tmpdir(), 's110-state-'));
  writeFileSync(path.join(stateDir, 'browser-tabs.json'), JSON.stringify({ v: 1, active: 0, fronts: [0], tabs: [0, 1].map((i) => ({ url: `http://127.0.0.1:47110/p/${i}`, title: i ? 'Weekend plans' : 'Inbox - Mail', scrollY: 0, zoom: 0, win: 0, trail: null })), trails: [], closed: [] }));
  const b: any = new AangBrowser({ origin: pages.origin, stateDir, preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs') } as any);
  wireBrowser(() => b);
  b.driver.view = () => DRIVERS;
  b.open();
  await wait(4000);
  b.sendTabs();
  b.tray(true, { x: 42, y: 62, hy: 80 });
  await wait(1500);
  const v = process.env.VARIANT ?? 'now';
  if (VARIANTS[v]) await b.trayV.webContents.insertCSS(VARIANTS[v]!);
  await b.trayV.webContents.executeJavaScript(`(() => {
    const spark = document.querySelector('.drawer .th.driver .who-ic')?.innerHTML ?? '';
    if (${JSON.stringify(v)} === 'b') for (const r of document.querySelectorAll('.drawer .tp.drv')) {
      const s = document.createElement('span'); s.className = 'own110'; s.innerHTML = spark; r.append(s);
    }
    return document.querySelectorAll('.drawer .tp.drv').length;
  })()`).then((n: number) => console.log('DRIVER ROWS ' + n));
  await wait(800);
  const img = await b.trayV.webContents.capturePage();
  writeFileSync(process.argv.find((a) => a.endsWith('.png')) ?? path.join(os.tmpdir(), 's110.png'), img.toPNG());
  console.log('SHOT ' + JSON.stringify(img.getSize()));
  app.exit(0);
});

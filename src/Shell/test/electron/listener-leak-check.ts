// 2026-10-24 (speed check): "11 did-stop-loading listeners" in his log. A page that keeps loading (a picture that never
// finishes, as live sites do), in front and focused, while Samara asks it every 1.5 s for a password box: the listeners
// waiting on that page must not pile up. Run: npx electron test/electron/listener-leak-check.ts
import { app, BrowserWindow } from 'electron';
import http from 'node:http';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.on('uncaughtException', (e) => console.log('HARNESS NOTE ' + (e as Error).message));
process.on('warning', (w) => console.log('WARNING ' + String(w.message)));
process.on('unhandledRejection', (e) => console.log('REJECTION ' + String((e as Error)?.stack ?? e).split('\n').slice(0, 4).join(' | ')));
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 90_000).unref();
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
const HERE = path.dirname(fileURLToPath(import.meta.url));
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'leak-ud-')));
app.on('window-all-closed', () => {});
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.showInactive(); };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  const srv = http.createServer((q, r) => {
    if (q.url === '/slow') { r.writeHead(200, { 'Content-Type': 'image/png' }); return; }   // never ends
    r.writeHead(200, { 'Content-Type': 'text/html' }); r.end('<!doctype html><body><input type=password><img src="/slow"></body>');
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const b: any = new AangBrowser({ origin: pages.origin, stateDir: mkdtempSync(path.join(os.tmpdir(), 'leak-s-')), preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs') });
  b.open(`http://127.0.0.1:${(srv.address() as any).port}/`);
  for (let i = 0; i < 100 && !b.cur()?.view; i++) await wait(200);
  await wait(2000);
  const t = b.cur(), wc = t.view.webContents;
  t.url = 'https://stand.in/';                         // the look runs on secure pages only
  b.win.focus();
  const base = wc.listenerCount('did-stop-loading');
  for (let i = 0; i < 15; i++) { await b.lookForLogin(); await b.snapshot(true); }
  const after = wc.listenerCount('did-stop-loading');
  console.log(`still loading: ${wc.isLoading()}; listeners before ${base}, after 15 looks ${after}`);
  console.log(after <= base + 1 ? 'PASS the looks leave nothing waiting on a page that keeps loading' : 'FAIL listeners pile up');
  srv.closeAllConnections?.(); srv.close(); app.exit(0);
});

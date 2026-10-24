// 2026-10-23, his "I can't click on any video buttons": the old-picture layer (curtain) over a page must never take his
// click. A press on it: it goes at once, and the press reaches the page at the same spot.
// Run: npx electron test/electron/curtain-click-check.ts
import { app, BrowserWindow } from 'electron';
import http from 'node:http';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.on('uncaughtException', (e) => console.log('HARNESS NOTE ' + (e as Error).message));
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 90_000).unref();
const HERE = path.dirname(fileURLToPath(import.meta.url));
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'cclick-ud-')));
app.on('window-all-closed', () => {});
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.showInactive(); };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const check = (w: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${w}${d ? ' (' + d + ')' : ''}`); if (!ok) bad++; };
app.whenReady().then(async () => {
  // A page that draws late (so the curtain is up over it) and counts clicks with where they landed.
  const srv = http.createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'text/html' }); r.end(`<!doctype html><body style="margin:0;height:100vh;background:#123" onmousedown="window.hits=(window.hits||[]).concat([[event.clientX,event.clientY]])"><h1 style="color:#fff">page ${q.url}</h1></body>`); });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
  const base = `http://127.0.0.1:${(srv.address() as any).port}`;
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const { wireBrowser } = await import('../../src/browseripc.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const b: any = new AangBrowser({ origin: pages.origin, stateDir: mkdtempSync(path.join(os.tmpdir(), 'cclick-s-')), preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs') });
  wireBrowser(() => b);
  b.open(base + '/one'); await wait(3000);
  const t = b.cur();
  console.log('tab ' + (t && t.url));
  // The curtain held up over the page, the way it was after a load (8 s at most).
  b.veilDown(0); b.drawn = false;
  const nav = ++b.veilSeq; b.veil = { tab: t.id, nav, at: Date.now() - 1000, up: false, dimT: null, capT: null };
  const v = b.curtainView(); console.log('curtain made ' + Boolean(v)); await Promise.race([b.pane.curtainReady, wait(3000)]); console.log('ready');
  v.setBounds(t.view.getBounds()); b.win.contentView.addChildView(v); v.setVisible(true); b.veil.up = true;
  await wait(300);
  check('the curtain is over the page', v.getVisible() && Boolean(b.veil?.up));
  v.webContents.sendInputEvent({ type: 'mouseDown', x: 200, y: 150, button: 'left', clickCount: 1 });
  v.webContents.sendInputEvent({ type: 'mouseUp', x: 200, y: 150, button: 'left', clickCount: 1 });
  await wait(500);
  check('a press takes it away at once', !v.getVisible() && !b.veil);
  const hits = await t.view.webContents.executeJavaScript('window.hits || []');
  check('the press reaches the page, at the same spot', hits.length === 1 && hits[0][0] === 200 && hits[0][1] === 150, JSON.stringify(hits));
  console.log(bad ? `${bad} FAILED` : 'ALL PASS');
  srv.close(); app.exit(bad ? 1 : 0);
});

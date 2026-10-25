// Sheet 89 (2026-10-25): Stremio in a tab reaches its engine on this Mac, and nothing else gets through.
//  1 web.stremio.com plays through 127.0.0.1:11470: no "Streaming server is not available"
//  2 any other site is still stopped from reaching this computer
//  3 Stremio is on normal Samara's shelf once, with its own icon; never on the secret window's
// Needs Stremio's engine running (its app, or Samara starts it). Run: npx electron test/electron/stremio-check.ts
import { app, BrowserWindow } from 'electron';
import { mkdirSync, mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.message ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 120_000).unref();
const HERE = path.dirname(fileURLToPath(import.meta.url));
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'sc-ud-')));
app.on('window-all-closed', () => {});
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.showInactive(); };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const check = (w: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${w}${d ? ' (' + d + ')' : ''}`); if (!ok) bad++; };
app.whenReady().then(async () => {
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser, netGuard } = await import('../../src/browser.ts');
  const { wireBrowser } = await import('../../src/browseripc.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const P = (f: string) => path.join(HERE, '..', '..', 'src', f);
  const base = { origin: pages.origin, preloadPath: P('preload.cjs'), tabPreloadPath: P('tabpreload.cjs'), settingsPreloadPath: P('settingspreload.cjs'), thingsPreloadPath: P('thingspreload.cjs') };
  const dir = mkdtempSync(path.join(os.tmpdir(), 'sc-s-')), sdir = path.join(dir, 'secret'); mkdirSync(sdir);
  const b: any = new AangBrowser({ ...base, stateDir: dir });
  const s: any = new AangBrowser({ ...base, stateDir: sdir, sharedDir: dir, secret: true, phish: b.phishCheck });
  wireBrowser(() => b, () => s);
  // 2, the rule itself
  const req = (url: string, from: string) => netGuard({ url, resourceType: 'media', frame: { url: from } } as any);
  check('2 only Stremio\'s page reaches its engine; other sites and other ports stay stopped',
    !req('http://127.0.0.1:11470/stats.json', 'https://web.stremio.com/') && req('http://127.0.0.1:11470/stats.json', 'https://evil.example/') && req('http://127.0.0.1:47844/x', 'https://web.stremio.com/') && req('http://192.168.1.1/', 'https://web.stremio.com/'));
  // 3
  await wait(500);                                          // the shelf is written a moment after start
  const marks = b.marks.filter((m: any) => m.url.includes('stremio')).length, again = new AangBrowser({ ...base, stateDir: dir }) as any;
  check('3 Stremio on normal Samara\'s shelf once, never the secret window\'s', marks === 1 && again.marks.filter((m: any) => m.url.includes('stremio')).length === 1 && !s.marks.some((m: any) => m.url.includes('stremio')), `${marks}`);
  // 1, for real
  b.open('https://web.stremio.com/');
  for (let i = 0; i < 100 && !b.cur()?.view; i++) await wait(200);
  let warned = true;
  for (let i = 0; i < 30; i++) {
    await wait(1000);
    const t = await b.cur().view.webContents.executeJavaScript(`document.body ? document.body.innerText : ''`).catch(() => '');
    if (t.length > 200) { warned = /Streaming server is not available/i.test(t); if (!warned && i > 12) break; }
  }
  const stats = await b.cur().view.webContents.executeJavaScript(`fetch('http://127.0.0.1:11470/stats.json').then((r) => r.status).catch((e) => String(e))`);
  check('1 Stremio in a tab reaches its engine: no "Streaming server is not available"', !warned && stats === 200, `engine answered ${stats}`);
  console.log(bad ? `${bad} FAILED` : 'ALL PASS');
  app.exit(bad ? 1 : 0);
});

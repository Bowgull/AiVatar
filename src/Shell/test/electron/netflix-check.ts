// 2026-10-25 (his "why is Netflix opening in another window on my Mac"): Netflix plays in Samara's tab now.
//  1 Netflix gets Samara's honest name, in the page and on the wire (castLabs' tracker: a disguised name breaks its DRM)
//  2 every other site still gets plain Chrome's
//  3 if Netflix still shows its error code on the player, the show goes to the video window and the tab steps back
// www.netflix.com is mapped to a local page here. Run: TEST_CERT_DIR=<dir> npx electron test/electron/netflix-check.ts
import { app, BrowserWindow } from 'electron';
import https from 'node:https';
import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.message ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 120_000).unref();
app.commandLine.appendSwitch('host-resolver-rules', 'MAP www.netflix.com 127.0.0.1, MAP shop.example 127.0.0.1');
const HERE = path.dirname(fileURLToPath(import.meta.url));
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'nf-ud-')));
app.on('window-all-closed', () => {});
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.showInactive(); };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const check = (w: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${w}${d ? ' (' + d + ')' : ''}`); if (!ok) bad++; };
app.whenReady().then(async () => {
  const CERT = process.env.TEST_CERT_DIR!;
  const seen: string[] = [];
  const srv = https.createServer({ key: readFileSync(path.join(CERT, 'test-key.pem')), cert: readFileSync(path.join(CERT, 'test-cert.pem')) }, (q, r) => {
    seen.push(`${q.headers.host} ${q.url} ${q.headers['user-agent']}`);
    r.writeHead(200, { 'Content-Type': 'text/html' });
    r.end(String(q.url).startsWith('/watch/') ? '<!doctype html><body><h1>Netflix Site Error</h1><p>Error Code: E100</p></body>' : '<!doctype html><body>home</body>');
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
  const port = (srv.address() as any).port;
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const { wireBrowser } = await import('../../src/browseripc.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const P = (f: string) => path.join(HERE, '..', '..', 'src', f);
  const b: any = new AangBrowser({ origin: pages.origin, preloadPath: P('preload.cjs'), tabPreloadPath: P('tabpreload.cjs'), settingsPreloadPath: P('settingspreload.cjs'), thingsPreloadPath: P('thingspreload.cjs'), stateDir: mkdtempSync(path.join(os.tmpdir(), 'nf-s-')) });
  wireBrowser(() => b);
  b.ses.setCertificateVerifyProc((_r: unknown, cb: (n: number) => void) => cb(0));
  const fell: string[] = [];
  b.onPaid = () => false;                                   // castLabs' engine: Netflix plays here
  b.onPaidFallback = (u: string) => { fell.push(u); return true; };
  b.open(`https://shop.example:${port}/`);
  for (let i = 0; i < 100 && !b.cur()?.view; i++) await wait(150);
  await wait(1500);
  const wc = b.cur().view.webContents;
  const shopUA = await wc.executeJavaScript('navigator.userAgent');
  wc.loadURL(`https://www.netflix.com:${port}/browse`);
  await wait(2000);
  const nfUA = await wc.executeJavaScript('navigator.userAgent');
  const wire = seen.find((x) => x.includes('/browse')) ?? '';
  check('1 Netflix gets the honest name, in the page and on the wire', nfUA === b.honestUA && wire.endsWith(b.honestUA) && /Electron\//.test(nfUA), nfUA);
  check('2 other sites still get plain Chrome\'s name', !/Electron\//.test(shopUA) && /Chrome\//.test(shopUA), shopUA);
  wc.loadURL(`https://www.netflix.com:${port}/watch/81234567`);
  for (let i = 0; i < 80 && !fell.length; i++) await wait(250);
  await wait(800);
  check('3 Netflix\'s error on the player sends the show to the video window, and the tab steps back', fell[0]?.includes('/watch/81234567') && !wc.getURL().includes('/watch/'), `${fell.join(' ')} | tab ${wc.getURL()}`);
  console.log(bad ? `${bad} FAILED` : 'ALL PASS');
  srv.close(); app.exit(bad ? 1 : 0);
});

// X, his "Dark Reader is a must" (2026-10-14): the real browser, off screen. A white page comes up dark; so does one whose
// own rules forbid added styles (a strict CSP); the shield's switch puts one site back to its own colours and keeps it;
// the page's own scripts cannot see Dark Reader.
//
// Run: npx electron test/electron/dark-check.ts   (SHOT=<png> keeps a picture of the dark page)
import { app, BrowserWindow, screen } from 'electron';
import http from 'node:http';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';
import { AangBrowser } from '../../src/browser.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS NOTE ' + String((e as Error).message).split('\n')[0]); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 90_000).unref();
app.on('window-all-closed', () => { /* the test decides */ });
const HERE = path.dirname(fileURLToPath(import.meta.url));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.showInactive(); };
BrowserWindow.prototype.focus = function () { /* not in a test */ };
let bad = 0;
const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d ? '  -- ' + d : ''}`); if (!ok) bad++; };
const PAGE = '<!doctype html><title>White</title><style>body{background:#fff;color:#111;font:20px sans-serif}</style><body><h1>A white page</h1><p>Some text.</p>';

app.whenReady().then(async () => {
  (screen as any).getCursorScreenPoint = () => ({ x: -20000, y: 500 });
  const srv = http.createServer((q, r) => {
    const strict = q.url?.startsWith('/strict');
    r.writeHead(200, { 'Content-Type': 'text/html', ...(strict ? { 'Content-Security-Policy': "default-src 'none'; style-src 'self'" } : {}) });
    r.end(PAGE);
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
  const port = (srv.address() as any).port;
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const state = mkdtempSync(path.join(os.tmpdir(), 'dark-'));
  const b = new AangBrowser({ origin: pages.origin, stateDir: state, preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs') });
  const any = b as any;
  const bg = async () => { const wc = any.cur()?.view?.webContents; return wc ? await wc.executeJavaScript('getComputedStyle(document.body).backgroundColor', true) : null; };
  const dark = (c: string | null) => { const m = /^rgb\((\d+), (\d+), (\d+)\)$/.exec(String(c)); return !!m && (+m[1]! + +m[2]! + +m[3]!) < 200; };

  b.open(`http://127.0.0.1:${port}/a`); await wait(4000);
  const c1 = await bg();
  check('a white page comes up dark', dark(c1), String(c1));
  check("the page's own scripts cannot see Dark Reader", (await any.cur().view.webContents.executeJavaScript('typeof window.DarkReader', true)) === 'undefined');
  if (process.env.SHOT) writeFileSync(process.env.SHOT, (await any.cur().view.webContents.capturePage()).toPNG());

  b.setDarkHere(false); await wait(1200);
  const c2 = await bg();
  check('the switch puts this site back to its own colours', !dark(c2), String(c2));
  const saved = JSON.parse(readFileSync(path.join(state, 'browser-prefs.json'), 'utf8'));
  check('and it is remembered for the site', Array.isArray(saved.darkOff) && saved.darkOff.includes('127.0.0.1'), JSON.stringify(saved.darkOff));
  any.cur().view.webContents.reload(); await wait(3000);
  check('still its own colours after a reload', !dark(await bg()));
  b.setDarkHere(true); await wait(1500);
  check('switched back on, dark again', dark(await bg()));

  // A site with strict rules about styles
  b.newTab(`http://localhost:${port}/strict`); await wait(4000);
  // With its own styles blocked the body is see-through, so the page's root is what is drawn.
  const st = any.tabs.find((t: any) => t.url.includes('/strict'))?.view?.webContents;
  const c3 = st ? await st.executeJavaScript('getComputedStyle(document.documentElement).backgroundColor', true) : null;
  check('a page with strict security rules comes up dark too', dark(c3), String(c3));
  if (st) console.log('strict page: ' + await st.executeJavaScript(`JSON.stringify([...document.querySelectorAll('style.darkreader')].map(x => [x.className, !!x.sheet && x.sheet.cssRules.length]))`, true));

  b.closeAll(); srv.close(); pages.close();
  console.log(bad ? `${bad} failed` : 'all passed');
  setTimeout(() => app.exit(bad ? 1 : 0), 800);
});

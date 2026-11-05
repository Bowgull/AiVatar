// Pop-under ads (2026-11-05, his report: PMV Haven in the secret window, "every single click opens a new tab").
// ExoClick's popMagic, written the two ways sites ship it: inside the site's own code (PMV Haven) and as its own script.
// His click on a link must just follow the link: no new tab, and his tab never goes to the ad.
//
// Run: npx electron test/electron/popunder-check.ts
import { app, BrowserWindow, screen } from 'electron';
import http from 'node:http';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';
import { AangBrowser } from '../../src/browser.ts';
import { wireBrowser } from '../../src/browseripc.ts';

const PORT = 47931;
process.on('uncaughtException', (e) => { console.log('HARNESS NOTE ' + String((e as Error).message).split('\n')[0]); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 90_000).unref();
app.on('window-all-closed', () => { /* the test decides */ });
const HERE = path.dirname(fileURLToPath(import.meta.url));
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.showInactive(); };
BrowserWindow.prototype.focus = function () { /* not in a test */ };
let bad = 0;
const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d ? '  -- ' + d.slice(0, 200) : ''}`); if (!ok) bad++; };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The ad: on a click, the link opens in a new tab and this tab goes to the ad (popMagic's "default" method).
const POP = (ad: string) => `{init(c){document.addEventListener('click',function(e){var a=e.target.closest('a');if(!a)return;
  e.preventDefault();e.stopPropagation();window.open(a.href,'_blank');top.document.location=${JSON.stringify(ad)};},true);}}`;
const INLINE = (ad: string) => `<script>(function(){if(window.popMagic){window.__skipped=true;return}var popMagic=${POP(ad)};window.popMagic=popMagic;popMagic.init({})})()</script>`;
const SCRIPT = (ad: string) => `<script>var popMagic=${POP(ad)};popMagic.init({});</script>`;

app.whenReady().then(async () => {
  (screen as any).getCursorScreenPoint = () => ({ x: -20000, y: 500 });
  const ad = `http://localhost:${PORT}/ad`;
  const site = http.createServer((q, r) => {
    const kind = q.url?.split('?')[0];
    const pop = kind === '/inline' ? INLINE(ad) : kind === '/script' ? SCRIPT(ad) : '';
    r.writeHead(200, { 'Content-Type': 'text/html' }).end(`<!doctype html><title>${kind}</title>${pop}
      <a id="go" href="/video" style="position:fixed;inset:0;display:block">a video</a>`);
  });
  await new Promise<void>((r) => site.listen(PORT, '127.0.0.1', () => r()));
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const b = new AangBrowser({ origin: pages.origin, stateDir: mkdtempSync(path.join(os.tmpdir(), 'pop-')), preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs') }) as any;
  wireBrowser(() => b);
  const url = (p: string) => `http://127.0.0.1:${PORT}/${p}`;

  b.open(url('inline')); await wait(3500);
  for (const kind of ['inline', 'script']) {
    const t = b.tabs.find((x: any) => x.view?.webContents) ;
    t.view.webContents.loadURL(url(kind)); await wait(2000);
    const before = b.tabs.length;
    if (kind === 'inline') check('the site sees popMagic already there and skips its ad', await t.view.webContents.executeJavaScript('window.__skipped === true'));
    const wc = t.view.webContents;
    wc.sendInputEvent({ type: 'mouseDown', x: 200, y: 200, button: 'left', clickCount: 1 });
    wc.sendInputEvent({ type: 'mouseUp', x: 200, y: 200, button: 'left', clickCount: 1 });
    await wait(2000);
    check(`${kind}: his click opens no new tab`, b.tabs.length === before, `${before} -> ${b.tabs.length}`);
    const now = wc.getURL();
    check(`${kind}: his tab follows the link, not the ad`, now === url('video'), now);
  }

  console.log(bad ? `${bad} FAILED` : 'ALL PASS'); app.exit(bad ? 1 : 0);
});

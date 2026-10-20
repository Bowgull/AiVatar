// A site whose player the pop-out does not know by name (Prime's, his report 2026-10-20: no pause, no play, nothing):
// the box around the video, with the site's own control bar in it, is kept; the rest of the page is hidden.
//
// Run: npx electron test/electron/popout-anyplayer-check.ts
import { app, BrowserWindow, WebContentsView, ipcMain, screen } from 'electron';
import http from 'node:http';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';
import { Popout } from '../../src/popout.ts';
import { readSettings } from '../../src/settings.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS NOTE ' + String((e as Error).message).split('\n')[0]); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 60_000).unref();
app.on('window-all-closed', () => { /* the test decides */ });
const state = mkdtempSync(path.join(os.tmpdir(), 'popout-any-'));
app.setPath('userData', state);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.showInactive(); };
BrowserWindow.prototype.focus = function () { /* not in a test */ };
let bad = 0;
const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d ? '  -- ' + d : ''}`); if (!ok) bad++; };

app.whenReady().then(async () => {
  void screen;
  // Like Prime: an unknown wrapper; the video in one box, the controls in a sibling box laid over it.
  const html = `<!doctype html><title>Show</title><body style="margin:0"><header id="hdr" style="height:60px">site header</header>
    <div id="sdk" style="width:800px;height:450px;position:relative"><div id="vbox" style="position:absolute;inset:0"><video style="width:100%;height:100%;background:#123"></video></div>
    <div id="overlay" style="position:absolute;inset:0"><div style="position:absolute;left:0;right:0;bottom:0;height:48px"><button id="pp">Pause</button><button id="cc">Subtitles</button></div></div></div>
    <section id="more">More like this</section>`;
  const srv = http.createServer((_q, r) => r.writeHead(200, { 'Content-Type': 'text/html' }).end(html));
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const p = new Popout({ pages, preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'), settings: () => ({ ...readSettings(state), clickThrough: false }), remembered: () => null, remember: () => {} });
  ipcMain.on('popout:stage', (_e, r) => p.setStage(r));
  ipcMain.on('popout:chrome', (_e, px) => p.setChrome(px));
  const view = new WebContentsView();
  await view.webContents.loadURL(`http://127.0.0.1:${(srv.address() as any).port}/`);
  p.openTab(view, { url: 'https://www.primevideo.com/detail/x', title: 'Show', label: 'PRIMEVIDEO' }, () => {});
  await wait(2500);
  const vis = (id: string) => view.webContents.executeJavaScript(`getComputedStyle(document.getElementById('${id}')).visibility`);
  check("the site's own pause button shows", (await vis('pp')) === 'visible', await vis('pp'));
  check('and its subtitles button', (await vis('cc')) === 'visible');
  check('the rest of the page is hidden', (await vis('hdr')) === 'hidden' && (await vis('more')) === 'hidden');
  const hit = await view.webContents.executeJavaScript(`(() => { const r = document.getElementById('pp').getBoundingClientRect(); const e = document.elementFromPoint(r.left + 3, r.top + 3); return e && e.id; })()`);
  check('and it can be clicked (nothing covers it)', hit === 'pp', String(hit));
  console.log(bad ? `${bad} FAILED` : 'ALL PASS'); app.exit(bad ? 1 : 0);
});

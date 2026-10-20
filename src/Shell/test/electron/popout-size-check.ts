// The pop-out with a lent tab (his ask, 2026-10-13): the video grows and shrinks with the window, the site's own
// player controls show inside it, and Aang's duplicate buttons are gone. Off screen and never focused.
//
// Run: npx electron test/electron/popout-size-check.ts
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
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 90_000).unref();
app.on('window-all-closed', () => { /* the test decides */ });
const state = mkdtempSync(path.join(os.tmpdir(), 'popout-size-'));
app.setPath('userData', state);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
// ON_SCREEN=1: in the bottom-right corner for a few seconds, never focused (off screen, Windows does not redraw it,
// so a resize there proves nothing). Otherwise far off to the side.
BrowserWindow.prototype.show = function (this: BrowserWindow) {
  if (process.env.ON_SCREEN === '1') { const a = screen.getPrimaryDisplay().workArea; this.setPosition(a.x + a.width - 900, a.y + a.height - 600); }
  else this.setPosition(-6000, 100);
  this.showInactive();
};
BrowserWindow.prototype.focus = function () { /* not in a test */ };
let bad = 0;
const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d ? '  -- ' + d : ''}`); if (!ok) bad++; };

app.whenReady().then(async () => {
  // A page shaped like YouTube's: a player box with a video and its own control bar inside.
  const html = `<!doctype html><title>Watch</title><body style="margin:0"><header style="height:60px">site header</header>
    <div class="html5-video-player" style="width:640px;height:360px;position:relative"><video style="width:100%;height:100%;background:#123"></video>
    <div class="ytp-chrome-bottom" style="position:absolute;bottom:0;left:0;right:0;height:40px">quality, captions</div></div><aside>Up next</aside>`;
  const twitch = `<!doctype html><title>Mande</title><body style="margin:0"><nav style="height:50px">twitch nav</nav>
    <div data-a-target="video-player" style="width:700px;height:394px;position:relative"><div class="video-player__container" style="position:relative;height:394px">
    <video style="width:100%;height:100%;background:#213"></video><div class="video-player__overlay" style="position:absolute;inset:0">
    <div data-a-target="player-controls" style="position:absolute;left:0;right:0;bottom:0;height:40px">pause quality</div></div></div></div><aside>chat</aside>`;
  const srv = http.createServer((q, r) => r.writeHead(200, { 'Content-Type': 'text/html' }).end(q.url === '/twitch' ? twitch : html));
  await new Promise<void>(r => srv.listen(0, '127.0.0.1', () => r()));
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const p = new Popout({ pages, preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'), settings: () => ({ ...readSettings(state), alwaysOnTop: false, clickThrough: false }), remembered: () => null, remember: () => {} });
  // The same two messages the real wiring passes (popoutipc.ts): the picture area, and how tall the bar is.
  ipcMain.on('popout:stage', (_e, r) => p.setStage(r));
  ipcMain.on('popout:chrome', (_e, px) => p.setChrome(px));
  const view = new WebContentsView();
  await view.webContents.loadURL(`http://127.0.0.1:${(srv.address() as any).port}/`);
  p.openTab(view, { url: 'https://www.youtube.com/watch?v=x', title: 'Watch', label: 'YOUTUBE' }, () => {});
  await wait(2500);
  const w = p.window!;
  const vid = () => view.webContents.executeJavaScript(`(() => { const v = document.querySelector('video').getBoundingClientRect(); return { w: Math.round(v.width), h: Math.round(v.height), vw: innerWidth, vh: innerHeight }; })()`);
  const a = await vid();
  check('the video fills the pop-out', Math.abs(a.w - a.vw) <= 2 && Math.abs(a.h - a.vh) <= 2, JSON.stringify(a));
  const b0 = w.getBounds();
  w.setBounds({ ...b0, width: b0.width + 400, height: b0.height + 225 });
  await wait(1200);
  const big = await vid();
  console.log('  window', JSON.stringify(b0), '->', JSON.stringify(w.getBounds()), 'view', JSON.stringify(view.getBounds()));
  check('bigger window, bigger video', big.w > a.w + 300 && Math.abs(big.w - big.vw) <= 2, `${a.w}x${a.h} -> ${big.w}x${big.h}`);
  w.setBounds({ ...w.getBounds(), width: b0.width - 100, height: b0.height - 56 });
  await wait(1200);
  const small = await vid();
  check('smaller window, smaller video', small.w < a.w && Math.abs(small.w - small.vw) <= 2, `${big.w} -> ${small.w}`);
  const ctl = await view.webContents.executeJavaScript(`(() => { const c = getComputedStyle(document.querySelector('.ytp-chrome-bottom')); return c.visibility + ' ' + c.display; })()`);
  check("the site's own controls are there", ctl === 'visible block', ctl);
  const header = await view.webContents.executeJavaScript(`getComputedStyle(document.querySelector('header')).visibility`);
  check('the rest of the page is hidden', header === 'hidden', header);
  const dup = await w.webContents.executeJavaScript(`['ctrl','mute','vol'].map(id => document.getElementById(id)?.hidden)`);
  check("Aang's duplicate buttons are gone", dup.every(Boolean), JSON.stringify(dup));
  // Twitch's layout (his screenshot, 2026-10-13): the controls live in a box with the old player's fixed height.
  const tv = new WebContentsView();
  await tv.webContents.loadURL(`http://127.0.0.1:${(srv.address() as any).port}/twitch`);
  p.openTab(tv, { url: 'https://www.twitch.tv/mande', title: 'Mande', label: 'TWITCH' }, () => {});
  await wait(2000);
  const bar = () => tv.webContents.executeJavaScript(`(() => { const c = document.querySelector('[data-a-target=player-controls]'); const r = c.getBoundingClientRect(); return { bottom: Math.round(r.bottom), vh: innerHeight, shown: getComputedStyle(c).display !== 'none' }; })()`);
  const tb = await bar();
  check("Twitch's controls sit at the bottom edge", Math.abs(tb.bottom - tb.vh) <= 2 && tb.shown, JSON.stringify(tb));
  p.togglePin();
  await wait(300);
  check('pinned: the controls stay away', (await bar()).shown === false);
  check('pinned: it floats on top of everything (his rule, 2026-10-20)', p.window!.isAlwaysOnTop() === true);
  p.togglePin();
  await wait(300);
  check('unpinned: they come back', (await bar()).shown === true);
  check('unpinned: a normal window that goes behind what he clicks', p.window!.isAlwaysOnTop() === false);
  p.close(); srv.close(); pages.close();
  console.log(bad ? `${bad} failed` : 'all passed');
  setTimeout(() => app.exit(bad ? 1 : 0), 300);
});

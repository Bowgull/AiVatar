// 2026-11-02, his report: theater mode used to fill Samara's window nicely and no longer does. Samara built off his screen,
// a YouTube video and a live Twitch channel put in theater mode, and the player's box measured against the page's.
// Run: npx electron test/electron/theater-fill.ts   (THEATER_SIZE=1920x1040; THEATER_SHOTS=<folder> saves a picture of each)
import { app, BrowserWindow, dialog, screen } from 'electron';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts'; import { AangBrowser } from '../../src/browser.ts'; import { wireBrowser } from '../../src/browseripc.ts';
dialog.showErrorBox = () => {};
process.on('uncaughtException', (e) => { const t = String((e as Error)?.stack ?? e); console.log('HARNESS ERROR ' + t.split('\n').slice(0, 3).join(' | ')); if (!t.includes('assert(!this.paused)')) app.exit(2); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e).split('\n')[0]); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 120_000).unref();
app.on('window-all-closed', () => {});
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'theater-ud-')));
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
const HERE = path.dirname(fileURLToPath(import.meta.url));
// Off his screen, never in front of his game.
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.showInactive(); };
BrowserWindow.prototype.focus = function () {};
BrowserWindow.prototype.moveTop = function () {};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (fn: () => boolean | Promise<boolean>, ms = 6000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(150); } return false; };
const SHOTS = process.env.THEATER_SHOTS;

app.whenReady().then(async () => {
  (screen as any).getCursorScreenPoint = () => ({ x: -20000, y: 500 });
  const st = mkdtempSync(path.join(os.tmpdir(), 'theater-state-'));
  mkdirSync(path.join(st, 'open-urls'));
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const src = (f: string) => path.join(HERE, '..', '..', 'src', f);
  const b = new AangBrowser({ origin: pages.origin, stateDir: st, preloadPath: src('preload.cjs'), tabPreloadPath: src('tabpreload.cjs'), settingsPreloadPath: src('settingspreload.cjs'), thingsPreloadPath: src('thingspreload.cjs'), testLocal: true } as any) as any;
  wireBrowser(() => b);
  b.open('https://www.youtube.com/watch?v=jNQXAC9IVRw');
  await until(() => !!b.win, 8000);
  const w: BrowserWindow = b.win;
  const [SW, SH] = (process.env.THEATER_SIZE || '1440x900').split('x').map(Number);
  w.setSize(SW!, SH!);
  const view = () => b.cur()?.view ?? b.tabs?.at(-1)?.view;
  await until(() => !!view(), 15000);
  await wait(1500);
  console.log(`window ${JSON.stringify(w.getContentBounds())} page view ${JSON.stringify(view()?.getBounds())}`);
  const measure = (wc: Electron.WebContents, sel: string) => wc.executeJavaScript(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(), v = document.querySelector('video')?.getBoundingClientRect();
    return { player: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], video: v ? [Math.round(v.left), Math.round(v.top), Math.round(v.width), Math.round(v.height)] : null, page: [innerWidth, innerHeight], zoom: devicePixelRatio, maxH: getComputedStyle(e).maxHeight }; })()`, true);
  const shot = async (wc: Electron.WebContents, name: string) => { if (!SHOTS) return; mkdirSync(SHOTS, { recursive: true }); const img = await wc.capturePage(); writeFileSync(path.join(SHOTS, name + '.png'), img.resize({ width: 900 }).toPNG()); };

  const wc = view()!.webContents;
  const esc = async (w: Electron.WebContents) => { w.focus(); w.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' }); w.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' }); await wait(1500); };
  const yt = await until(async () => (await wc.executeJavaScript(`!!document.querySelector('.ytp-size-button')`, true)) === true, 25000);
  console.log('youtube player: ' + yt);
  if (yt) {
    await wait(1500);
    console.log('youtube default: ' + JSON.stringify(await measure(wc, '#player-container, #movie_player')));
    await wc.executeJavaScript(`document.querySelector('.ytp-size-button')?.click(); true`, true);
    await wait(2000);
    console.log('youtube theater: ' + JSON.stringify(await measure(wc, '#full-bleed-container')));
    console.log('youtube theater movie_player: ' + JSON.stringify(await measure(wc, '#movie_player')));
    console.log('youtube watch on: ' + await wc.executeJavaScript("document.documentElement.classList.contains('samara-watch')", true));
    await shot(wc, 'youtube-theater');
    await esc(wc);
    console.log('youtube after Esc: ' + JSON.stringify(await measure(wc, '#movie_player')) + ' watch ' + await wc.executeJavaScript("document.documentElement.classList.contains('samara-watch') + ' theater ' + !!document.querySelector('ytd-watch-flexy[theater]')", true));
  }
  await wc.loadURL('https://www.twitch.tv/directory/all').catch(() => {});
  let chan = '';
  await until(async () => { chan = await wc.executeJavaScript(`(() => { const a = document.querySelector('a[data-a-target="preview-card-image-link"]'); return a ? a.href : ''; })()`, true); return !!chan; }, 20000);
  if (chan) {
    await wc.loadURL(chan).catch(() => {});
    await until(async () => (await wc.executeJavaScript(`!!document.querySelector('button[aria-label*="Theatre Mode"]')`, true)) === true, 25000);
    await wait(2500);
    await wc.executeJavaScript(`document.querySelector('[data-a-target="content-classification-gate-overlay-start-watching-button"],[data-a-target="player-overlay-mature-accept"]')?.click(); document.querySelector('button[aria-label^="Theatre Mode"]')?.click(); true`, true);
    await wait(2500);
    console.log('twitch theater: ' + JSON.stringify(await measure(wc, '.video-player')));
    console.log('twitch watch on: ' + await wc.executeJavaScript("document.documentElement.classList.contains('samara-watch')", true));
    await shot(wc, 'twitch-theater');
    await esc(wc);
    console.log('twitch after Esc: ' + JSON.stringify(await measure(wc, '.video-player')) + ' watch ' + await wc.executeJavaScript("document.documentElement.classList.contains('samara-watch')", true));
  }
  for (const x of BrowserWindow.getAllWindows()) { try { x.destroy(); } catch { /* gone */ } }
  pages.close?.();
  app.exit(0);
});

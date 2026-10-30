// Coming back to a sleeping tab (2026-10-23, his report: "pretty rough; a video is laggy, looks like the screen is
// crashing, and the video starts playing before I can see the page"). A real video page goes to sleep, another tab is
// in front, then he clicks back. Measured: what covers the page meanwhile, when the page first draws, when the video
// starts, and whether it starts before the page can be seen. Run: npx electron test/electron/wake-check.ts
import { app, BrowserWindow, ipcMain } from 'electron';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.on('uncaughtException', (e) => console.log('HARNESS NOTE ' + (e as Error).message));
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 180_000).unref();
const HERE = path.dirname(fileURLToPath(import.meta.url));
const VIDEO = process.env.VIDEO || 'https://www.youtube.com/watch?v=jNQXAC9IVRw';
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'wake-ud-')));
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.on('window-all-closed', () => {});
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.showInactive(); };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const { wireBrowser } = await import('../../src/browseripc.ts');
  // Asked the way Samara asks (page.ts): the webContents form waits for a page that never stops loading (YouTube), so
  // the old probe here stalled until then and saw the curtain go down late (the "38 s" of the 2026-10-30 check).
  const { run } = await import('../../src/page.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const b: any = new AangBrowser({ origin: pages.origin, stateDir: mkdtempSync(path.join(os.tmpdir(), 'wake-s-')), preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs') });
  wireBrowser(() => b);
  b.open(VIDEO);
  for (let i = 0; i < 100 && !b.cur()?.view; i++) await wait(200);
  const vid = b.cur().id;
  await wait(12_000);                                   // the video page fully loaded (and playing: he opened it)
  await b.peek();                                      // his mouse heads for the tab list: the page's picture is kept
  console.log('picture kept: ' + Boolean(b.cur().leftShot));
  b.newTab('https://en.wikipedia.org/wiki/Video'); await wait(6000);
  b.sleep(b.tabs.find((t: any) => t.id === vid)); b.sendTabs();
  console.log('asleep: ' + !b.tabs.find((t: any) => t.id === vid).view);
  const { webContents } = await import('electron');
  console.log('live pages now: ' + webContents.getAllWebContents().map((w) => w.id + ':' + w.getURL().slice(0, 40) + (w.isDestroyed() ? '(dead)' : '')).join(' | '));
  await wait(3000);
  console.log('3 s later: ' + webContents.getAllWebContents().filter((w) => !w.isDestroyed()).map((w) => w.id + ':' + w.getURL().slice(0, 30)).join(' | '));
  // He clicks the sleeping video tab (a click on its row: his gesture).
  if (process.env.HOVER) { b.tabAct(vid, 'prewake'); await wait(Number(process.env.HOVER)); }   // his mouse rested on it first
  const t0 = Date.now();
  let painted = 0, playing = 0, curtainUp = 0, curtainDown = 0, visibleAt = 0;
  ipcMain.on('tab:painted', (e) => { const t = b.tabs.find((x: any) => x.id === vid); if (!painted && t?.view && e.sender === t.view.webContents) painted = Math.max(1, Date.now() - t0); });
  if (process.env.HOVER) { const t = b.tabs.find((x: any) => x.id === vid); if (t?.drawn) painted = 1; }
  b.lastGesture.set(vid, Date.now());
  b.activate(vid);
  const t = b.tabs.find((x: any) => x.id === vid);
  console.log('woken page id ' + t.view?.webContents.id + ' ' + t.view?.webContents.getURL().slice(0, 50));
  const old = webContents.fromId(2); if (old && !old.isDestroyed()) console.log('OLD PAGE STILL ALIVE, playing: ' + await run(old, `(() => { const v = document.querySelector('video'); return v ? !v.paused : null; })()`, { gesture: true, fallback: 'unknown' }));
  // The moment the curtain really goes down, not when a poll next looks.
  const vd = b.veilDown.bind(b); b.veilDown = (f: number) => { if (b.veil?.tab === vid && !curtainDown && curtainUp) curtainDown = Date.now() - t0; return vd(f); };
  for (let i = 0; i < 300; i++) {
    await wait(50);
    const ms = Date.now() - t0;
    if (!visibleAt && t.view?.getVisible()) visibleAt = ms;
    if (b.veil?.up && !curtainUp) curtainUp = ms;
    if (curtainUp && !b.veil && !curtainDown) curtainDown = ms;   // (normally caught at veilDown itself)
    if (!playing && t.view && !t.view.webContents.isDestroyed()) {
      const p = await run<any[] | null>(t.view.webContents, `(() => { const v = document.querySelector('video'); return v ? [location.href.slice(0, 60), v.paused, Math.round(v.currentTime * 10) / 10, document.readyState] : [location.href.slice(0, 60), null, 0, document.readyState]; })()`, { gesture: true, ms: 400, fallback: null });
      if (!playing && p && p[1] === false && p[2] > 0) { playing = ms; console.log('PLAYING PROBE ' + JSON.stringify(p) + ' wc ' + t.view.webContents.id + ' up ' + await run(t.view.webContents, 'Math.round(performance.now())', { fallback: '?' })); }
    }
    if (playing && painted && i > 60) break;
  }
  console.log(`RESULT page visible at ${visibleAt} ms; curtain ${curtainUp ? `up at ${curtainUp}, down at ${curtainDown || 'never'}` : 'never up'}; first draw ${painted || 'none'} ms; video playing at ${playing || 'never'} ms`);
  console.log(painted && playing && playing < painted ? 'BAD the video started before the page drew' : 'ok the page drew before the video');
  console.log(curtainDown && playing && playing < curtainDown ? 'BAD the video started while the curtain still covered the page' : curtainDown ? 'ok the video waited for the page to show' : 'NOTE no curtain');
  app.exit(0);
});

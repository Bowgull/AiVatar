// His report (2026-10-30): "a video does still play briefly when i wake it on youtube and sometimes i may forget what my
// volumes at. No videos can play when waking". A real YouTube tab plays, sleeps, and he clicks back to it. For 15 s it is
// watched every 50 ms: its video must never move and the tab must stay muted. Then his click on the player: it plays,
// with sound. Off screen. Run: node_modules/electron/dist/Electron.app/Contents/MacOS/Electron test/electron/wake-silent-check.ts
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
  b.lastGesture.set(vid, Date.now());                  // his click on the tab's row
  b.activate(vid);
  const t = b.tabs.find((x: any) => x.id === vid);
  const t0 = Date.now();
  let moved = 0, sounded = 0, unmuted = 0, first: number | null = null, last = 0, samples = 0;
  for (let i = 0; i < 300; i++) {
    await wait(50);
    const wc = t.view?.webContents; if (!wc || wc.isDestroyed()) continue;
    const p = await run<[boolean, number] | null>(wc, `(() => { const v = document.querySelector('video'); return v ? [v.paused, v.currentTime] : null; })()`, { fallback: null, ms: 400 });
    if (p) { samples++; if (first === null) first = p[1]; if (!p[0] && p[1] > last + 0.05 && last > 0) moved = moved || Date.now() - t0; last = Math.max(last, p[1]); }
    if (wc.isCurrentlyAudible()) sounded = sounded || Date.now() - t0;
    if (!wc.isAudioMuted()) unmuted = unmuted || Date.now() - t0;
  }
  let ok = true;
  const check = (n: string, p: boolean, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'} ${n}${d ? '  -- ' + d : ''}`); ok &&= p; };
  console.log(`watched ${samples} times; time ${first} -> ${last}`);
  check('the woken video never moves before his click', !moved && first !== null && last - (first ?? 0) < 0.3, `moved at ${moved || 'never'}, ${first} -> ${last}`);
  check('nothing is heard', !sounded, `audible at ${sounded || 'never'}`);
  check('the tab stays muted until his click', !unmuted, `unmuted at ${unmuted || 'never'}`);
  // His click on the player: it plays, and its sound comes back.
  const wc = t.view.webContents;
  // YouTube's own big play button when it shows one (as after any blocked autoplay), else the middle of the video.
  const r = await run<number[] | null>(wc, `(() => { const b = document.querySelector('.ytp-large-play-button'); const e = b && b.offsetParent ? b : document.querySelector('video'); if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2), b && b.offsetParent ? 1 : 0]; })()`, { fallback: null });
  console.log('clicking ' + JSON.stringify(r));
  if (r) { wc.sendInputEvent({ type: 'mouseDown', x: r[0], y: r[1], button: 'left', clickCount: 1 }); wc.sendInputEvent({ type: 'mouseUp', x: r[0], y: r[1], button: 'left', clickCount: 1 }); }
  await wait(2500);
  let after0 = await run<[boolean, number] | null>(wc, `(() => { const v = document.querySelector('video'); return v ? [v.paused, v.currentTime] : null; })()`, { fallback: null });
  if (after0 && after0[0]) { console.log('click left it paused; trying the k key'); wc.sendInputEvent({ type: 'keyDown', keyCode: 'k' }); wc.sendInputEvent({ type: 'char', keyCode: 'k' }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'k' }); }
  await wait(2500);
  const after = await run<[boolean, number] | null>(wc, `(() => { const v = document.querySelector('video'); return v ? [v.paused, v.currentTime] : null; })()`, { fallback: null });
  check('his click on the player plays it', !!after && after[0] === false, JSON.stringify(after));
  check('and its sound is back', !wc.isAudioMuted());
  console.log(ok ? 'ALL PASS' : 'FAILED'); app.exit(ok ? 0 : 1);
});

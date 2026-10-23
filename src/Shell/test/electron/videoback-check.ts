// A sleeping video tab comes back paused at his spot (his pick, 2026-10-23: "wait for my click"). A real video plays a
// few seconds, the tab is frozen (its spot read) and put to sleep, then he clicks back: the page draws, nothing plays,
// and the video sits where he left it. Run: npx electron test/electron/videoback-check.ts
import { app, BrowserWindow } from 'electron';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.on('uncaughtException', (e) => console.log('HARNESS NOTE ' + (e as Error).message));
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 200_000).unref();
const HERE = path.dirname(fileURLToPath(import.meta.url));
const VIDEO = process.env.VIDEO || 'https://www.youtube.com/watch?v=aqz-KE-bpKQ';
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'vb-ud-')));
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.on('window-all-closed', () => {});
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.showInactive(); };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let all = true;
const ok = (n: string, p: boolean, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'} ${n}${d ? ' (' + d + ')' : ''}`); all = all && p; };
const state = (wc: Electron.WebContents) => Promise.race([wc.mainFrame.executeJavaScript(`(() => { const v = [...document.querySelectorAll('video')].sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0]; return v ? { paused: v.paused, t: Math.round(v.currentTime) } : null; })()`).catch(() => null), wait(800).then(() => null)]) as Promise<{ paused: boolean; t: number } | null>;
app.whenReady().then(async () => {
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const { wireBrowser } = await import('../../src/browseripc.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const b: any = new AangBrowser({ origin: pages.origin, stateDir: mkdtempSync(path.join(os.tmpdir(), 'vb-s-')), preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs') });
  wireBrowser(() => b);
  b.open(VIDEO);
  for (let i = 0; i < 100 && !b.cur()?.view; i++) await wait(200);
  const t = b.cur();
  // Let it play (he opened it), making sure it does.
  let s = null;
  for (let i = 0; i < 40; i++) { await wait(1000); s = await state(t.view.webContents); if (s && !s.paused && s.t >= 8) break; if (s?.paused && i === 12) await t.view.webContents.mainFrame.executeJavaScript(`document.querySelector('video')?.play()`, true).catch(() => {}); }
  console.log('before: ' + JSON.stringify(s));
  b.newTab('https://example.com/'); await wait(3000);
  await b.freeze(t, true);
  const spot = t.videoAt;
  ok('its spot is read before it freezes', typeof spot === 'number' && spot >= 5, String(spot));
  b.sleep(t); await wait(2000);
  const mp = b.mayPlay.bind(b); b.mayPlay = (w: any) => { const r = mp(w); console.log('MAYPLAY ' + JSON.stringify(r) + ' waking ' + t.waking + ' at ' + (Date.now() - T0)); return r; };
  const pt = b.painted.bind(b); b.painted = (w: any) => { console.log('PAINTED waking ' + t.waking + ' videoAt ' + t.videoAt + ' at ' + (Date.now() - T0)); return pt(w); };
  const T0 = Date.now();
  b.lastGesture.set(t.id, Date.now());
  b.activate(t.id);
  let after = null;
  for (let i = 0; i < 40; i++) { await wait(500); after = t.view ? await state(t.view.webContents) : null; if (i % 4 === 0) console.log('S ' + (Date.now() - T0) + ' ' + JSON.stringify(after)); if (after && after.t > 0 && i > 14) break; }
  await wait(3000); after = await state(t.view.webContents);
  console.log('after: ' + JSON.stringify(after));
  ok('it comes back paused (nothing plays by itself)', after?.paused === true);
  ok('at his spot', !!after && typeof spot === 'number' && Math.abs(after.t - spot) <= 3, `${after?.t} vs ${spot}`);
  console.log(all ? 'ALL PASS' : 'FAILED'); app.exit(all ? 0 : 1);
});

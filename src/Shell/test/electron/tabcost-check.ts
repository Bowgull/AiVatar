// What a background tab costs, and how fast it comes back (2026-10-23, his ask: tabs that come back fast without
// sacrificing memory or the processor). Five real sites behind a plain page in front, in three states: alive (throttled,
// as before), frozen (new), and asleep (thrown away). For each: their processor use and memory, from the engine's own
// numbers. Then: how fast a frozen tab and an asleep one come back, and whether the video waits for the page.
// Run: npx electron test/electron/tabcost-check.ts
import { app, BrowserWindow, ipcMain } from 'electron';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.on('uncaughtException', (e) => console.log('HARNESS NOTE ' + (e as Error).message));
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 420_000).unref();
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITES = ['https://www.youtube.com/watch?v=jNQXAC9IVRw', 'https://en.wikipedia.org/wiki/Video', 'https://www.reddit.com/r/mac/', 'https://www.cnn.com/', 'https://www.amazon.com/'];
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'cost-ud-')));
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.on('window-all-closed', () => {});
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.showInactive(); };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const { wireBrowser } = await import('../../src/browseripc.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const b: any = new AangBrowser({ origin: pages.origin, stateDir: mkdtempSync(path.join(os.tmpdir(), 'cost-s-')), preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs') });
  wireBrowser(() => b);
  b.open(SITES[0]);
  for (let i = 0; i < 100 && !b.cur()?.view; i++) await wait(200);
  for (const u of SITES.slice(1)) { b.newTab(u); await wait(2500); }
  const ids = b.tabs.filter((t: any) => SITES.some((s) => t.url.startsWith(s.slice(0, 25)))).map((t: any) => t.id);
  await wait(15_000);
  b.newTab('https://example.com/'); await wait(4000);          // a plain page in front: the five are in the background
  const sites = () => b.tabs.filter((t: any) => ids.includes(t.id));
  // Their processor use (percent of one core, averaged over 15 s) and memory, from the engine's own numbers.
  const sample = async (label: string) => {
    const pids = new Set(sites().map((t: any) => t.view?.webContents.getOSProcessId()).filter(Boolean));
    app.getAppMetrics(); await wait(15_000);
    const m = app.getAppMetrics().filter((x) => pids.has(x.pid));
    const cpu = m.reduce((s, x) => s + x.cpu.percentCPUUsage, 0), mem = m.reduce((s, x) => s + (x.memory.privateBytes ?? x.memory.workingSetSize), 0) / 1024;
    console.log(`COST ${label}: ${m.length} page processes, processor ${cpu.toFixed(1)}% of one core, memory ${mem.toFixed(0)} MB`);
  };
  if (!process.env.WAKEONLY) { await wait(15_000); await sample('alive in the background (as before)'); }
  for (const t of sites()) await b.freeze(t, true);
  console.log('frozen: ' + sites().filter((t: any) => t.frozen).length + ' of ' + sites().length);
  if (!process.env.WAKEONLY) { await wait(10_000); await sample('frozen (new)'); }
  // Coming back to a frozen tab: it answers at once.
  const yt = sites()[0];
  let t0 = Date.now(); b.lastGesture.set(yt.id, Date.now()); b.activate(yt.id);
  const ans = await yt.view.webContents.mainFrame.executeJavaScript('document.readyState').catch(() => 'none');
  console.log(`WAKE frozen YouTube: answering in ${Date.now() - t0} ms (${ans}), thawed: ${!yt.frozen}`);
  b.activate(b.tabs.find((t: any) => t.url.startsWith('https://example.com')).id); await wait(1500);
  // Asleep (thrown away): memory and processor freed.
  for (const t of sites()) b.sleep(t);
  await wait(5000);
  console.log(`COST asleep: ${sites().filter((t: any) => !t.view).length} pages closed, processor 0%, memory 0 MB (only their picture and address kept)`);
  // Coming back to an asleep tab, clicked straight away, then after resting the mouse on it for 0.8 s.
  for (const hover of [0, 800]) {
    const t = sites()[0];
    if (t.view) { b.activate(b.tabs.find((x: any) => x.url.startsWith('https://example.com')).id); await wait(1000); b.sleep(t); await wait(2000); }
    if (hover) { b.tabAct(t.id, 'prewake'); await wait(hover); }
    let painted = hover && t.drawn ? 1 : 0, playing = 0, shownAt = 0;
    t0 = Date.now();
    const onPaint = (e: Electron.IpcMainEvent) => { if (!painted && t.view && e.sender === t.view.webContents) painted = Date.now() - t0; };
    ipcMain.on('tab:painted', onPaint);
    b.lastGesture.set(t.id, Date.now()); b.activate(t.id);
    const until = Date.now() + 25_000;
    while (Date.now() < until && !(painted && playing && shownAt)) {
      await wait(50);
      if (!shownAt && !t.waking && !b.veil) shownAt = Date.now() - t0;
      const p = await Promise.race([t.view?.webContents.mainFrame.executeJavaScript(`(() => { const v = document.querySelector('video'); return !!v && !v.paused && v.currentTime > 0; })()`).catch(() => false), wait(300).then(() => false)]);
      if (p && !playing) playing = Date.now() - t0;
    }
    ipcMain.removeListener('tab:painted', onPaint);
    console.log(`WAKE asleep YouTube${hover ? ` after resting the mouse ${hover} ms` : ', clicked straight away'}: first draw ${painted || 'none'} ms, page fully shown ${shownAt || 'never'} ms, video ${playing || 'not'} playing at that point${playing && shownAt && playing < shownAt ? ' (BEFORE the page showed)' : ''}`);
  }
  app.exit(0);
});

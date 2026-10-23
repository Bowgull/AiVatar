// The tab list's slide and its arrow, frame by frame (2026-10-22, his report on the Mac: "the tab open and the arrow
// motion is a bit glitchy"). Samara's real band and tray layer, a restored session of 8 tabs; the list is opened by
// resting the mouse on the handle (his way, a real pointer move into the band) and closed the way his mouse leaving
// does. Both pages record every frame they draw: the band whether its own arrow is showing, the list layer where its
// rail and arrow are. From that: how long NO arrow was on screen, whether two arrows showed at once, and how smooth
// the slide was. Off screen, never focused. Prints "TRAY {...}".
//
// Run (from src/Shell):  npx electron test/electron/tray-motion-check.ts
import { app, BrowserWindow, WebContentsView } from 'electron';
import http from 'node:http';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import inspector from 'node:inspector';

process.on('uncaughtException', (e) => { console.log('HARNESS NOTE ' + String((e as Error)?.message ?? e).split('\n')[0]); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e).split('\n').slice(0, 3).join(' | ')); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 120_000).unref();
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = 47995;
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'tray-ud-')));
// Keep drawing even when the window is covered (his screen saver, other windows): the frames are what is measured.
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.on('window-all-closed', () => { /* the check decides */ });
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setOpacity(0); this.showInactive(); };
BrowserWindow.prototype.focus = function () { /* never in a test */ };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Every frame a page draws, with what it shows: [absolute ms, what].
const BAND_REC = `(() => { window.__fr = []; const k = document.getElementById('drawerkey');
  const f = (t) => { const s = getComputedStyle(k); window.__fr.push([Math.round(performance.timeOrigin + t), s.visibility !== 'hidden' && s.opacity !== '0' && s.display !== 'none' ? 1 : 0]); requestAnimationFrame(f); };
  requestAnimationFrame(f); return true; })()`;
const TRAY_REC = `(() => { window.__fr = []; const d = document.querySelector('.drawer'), h = document.querySelector('.railhandle');
  const x = (e) => { const m = new DOMMatrix(getComputedStyle(e).transform); return Math.round(m.m41); };
  const sx = () => { const m = new DOMMatrix(getComputedStyle(h, '::after').transform); return Math.round(m.a * 100) / 100; };
  const f = (t) => { window.__fr.push([Math.round(performance.timeOrigin + t), x(d), getComputedStyle(h).display !== 'none' ? x(h) : null, document.body.classList.contains('out') ? 1 : 0, sx()]); requestAnimationFrame(f); };
  requestAnimationFrame(f); return true; })()`;

app.whenReady().then(async () => {
  http.createServer((q, r) => r.writeHead(200, { 'Content-Type': 'text/html' }).end(`<!doctype html><title>Page ${q.url}</title><body style="background:#fff"><p>${q.url}</p>`)).listen(PORT, '127.0.0.1');
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const { wireBrowser } = await import('../../src/browseripc.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const stateDir = mkdtempSync(path.join(os.tmpdir(), 'tray-state-'));
  const tabs = Array.from({ length: 8 }, (_, i) => ({ url: `http://127.0.0.1:${PORT}/p/${i}`, title: `Tab ${i + 1}`, scrollY: 0, zoom: 0, win: 0, trail: null }));
  writeFileSync(path.join(stateDir, 'browser-tabs.json'), JSON.stringify({ v: 1, active: 0, fronts: [0], tabs, trails: [], closed: [] }));
  const b: any = new AangBrowser({ origin: pages.origin, stateDir, preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'),
    thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs') } as any);
  wireBrowser(() => b);
  b.open();
  if (process.env.NOPEEK) b.peek = async () => {};
  await wait(6000);
  // SIZE=s|m: switched in Settings while the list is shut (sheet 71), before the first open.
  if (process.env.SIZE) { b.setSetting('tabSize', process.env.SIZE); await wait(300); }                                     // the list layer is built 3 s after the window shows
  const band = b.win.webContents as Electron.WebContents;
  const trayWc = () => b.trayV?.webContents as Electron.WebContents | undefined;
  // When the Shell shows or hides the list layer.
  const vis: [number, boolean][] = [];
  const sv = (WebContentsView.prototype as any).setVisible;
  (WebContentsView.prototype as any).setVisible = function (this: any, on: boolean) { if (this === b.trayV) vis.push([Date.now(), on]); return sv.call(this, on); };
  const runs: { tOpen: number; tClose: number; bandFr: number[][]; trayFr: (number | null)[][] }[] = [];
  for (let n = 0; n < (Number(process.env.RUNS) || 3); n++) {
    await band.executeJavaScript(BAND_REC, true);
    if (trayWc()) await trayWc()!.executeJavaScript(TRAY_REC, true);
    await wait(300);
    // PROFILE=1: a CPU profile of the list layer's page during the first open, its busiest functions.
    const dbg = process.env.PROFILE === '1' && n === 0 && trayWc() ? trayWc()!.debugger : null;
    const mainProf = process.env.PROFILE === 'main' && n === 0 ? new inspector.Session() : null;
    if (mainProf) { mainProf.connect(); await new Promise((r) => mainProf.post('Profiler.enable', () => mainProf.post('Profiler.setSamplingInterval', { interval: 200 }, () => mainProf.post('Profiler.start', r)))); }
    if (dbg) { dbg.attach('1.3'); await dbg.sendCommand('Profiler.enable'); await dbg.sendCommand('Profiler.setSamplingInterval', { interval: 200 }); await dbg.sendCommand('Profiler.start'); }
    // Open: the mouse comes to rest on the handle (his way; it opens after 0.25 s).
    const k = await band.executeJavaScript(`(() => { const r = document.getElementById('drawerkey').getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; })()`, true) as [number, number];
    band.sendInputEvent({ type: 'mouseMove', x: k[0] + 40, y: k[1] }); await wait(30);
    band.sendInputEvent({ type: 'mouseMove', x: k[0], y: k[1] });
    const tOpen = Date.now();
    await wait(1200);
    if (mainProf) {
      const p: any = await new Promise((r) => mainProf.post('Profiler.stop', (_e, x: any) => r(x.profile)));
      const self = new Map<string, number>(); const byId = new Map<number, any>(p.nodes.map((x: any) => [x.id, x]));
      p.samples.forEach((id: number, i: number) => { const f = byId.get(id).callFrame; const k = `${f.functionName || '(anon)'} ${String(f.url).split('/').pop()}:${f.lineNumber + 1}`; self.set(k, (self.get(k) ?? 0) + (p.timeDeltas[i] ?? 0) / 1000); });
      console.log('MAINPROFILE ' + JSON.stringify([...self].filter(([k]) => !k.startsWith('(idle)')).sort((a, b2) => b2[1] - a[1]).slice(0, 18).map(([k, ms]) => `${Math.round(ms)}ms ${k}`)));
    }
    if (dbg && process.env.PROFILE !== 'main') {
      const { profile: p } = await dbg.sendCommand('Profiler.stop') as any;
      const self = new Map<string, number>(); const byId = new Map<number, any>(p.nodes.map((x: any) => [x.id, x]));
      p.samples.forEach((id: number, i: number) => { const f = byId.get(id).callFrame; const k = `${f.functionName || '(anon)'} ${String(f.url).split('/').pop()}:${f.lineNumber + 1}`; self.set(k, (self.get(k) ?? 0) + (p.timeDeltas[i] ?? 0) / 1000); });
      console.log('PROFILE ' + JSON.stringify([...self].filter(([k]) => !k.startsWith('(idle)')).sort((a, b2) => b2[1] - a[1]).slice(0, 18).map(([k, ms]) => `${Math.round(ms)}ms ${k}`)));
      dbg.detach();
    }
    // Close: the way his mouse leaving the list closes it.
    const tClose = Date.now();
    b.tray(false);
    await wait(1000);
    const bandFr = (await band.executeJavaScript('window.__fr.splice(0)', true)) as number[][];
    const trayFr = trayWc() ? (await trayWc()!.executeJavaScript('window.__fr.splice(0)', true)) as (number | null)[][] : [];
    runs.push({ tOpen, tClose, bandFr, trayFr });
  }
  // When the band's arrow went and came back, when the list moved, the worst gap between frames, the rail's path.
  const out = runs.map((r) => {
    const sum = (from: number, to: number) => {
      const bf = r.bandFr.filter(([t]) => t! >= from && t! <= to), tf = r.trayFr.filter(([t]) => t! >= from && t! <= to);
      const bandOff = bf.find(([, v]) => v === 0)?.[0], bandOn = [...bf].reverse().find(([, v]) => v === 1)?.[0];
      const moving = tf.filter((f, i) => i > 0 && f[1] !== tf[i - 1]![1]).map((f) => f[0] as number);
      const worst = (fr: (number | null)[][]) => { let g = 0; for (let i = 1; i < fr.length; i++) g = Math.max(g, (fr[i]![0] as number) - (fr[i - 1]![0] as number)); return g; };
      return {
        bandArrowOff: bandOff ? bandOff - from : null, bandArrowLastOn: bandOn ? bandOn - from : null,
        listFirstMove: moving[0] ? moving[0] - from : null, listLastMove: moving.length ? moving[moving.length - 1]! - from : null,
        slideFrames: moving.length, worstListFrameMs: worst(tf), worstBandFrameMs: worst(bf),
        listX: tf.map((f) => f[1]).filter((v, i, a) => i === 0 || v !== a[i - 1]),
        // The arrow: 1 = pointing out, -1 = turned to point back; a smooth run between them is the card turn.
        arrow: tf.map((f) => f[4]).filter((v, i, a) => i === 0 || v !== a[i - 1]),
        // The band's arrow back on, and the list layer hidden (close) or shown (open), from the start.
        bandArrowBack: (() => { const off = bf.findIndex(([, v]) => v === 0); const on = off >= 0 ? bf.slice(off).find(([, v]) => v === 1) : undefined; return on ? (on[0] as number) - from : null; })(),
        layer: vis.filter(([t]) => t >= from && t <= to).map(([t, on]) => `${on ? 'shown' : 'hidden'} ${t - from}`),
      };
    };
    return { open: sum(r.tOpen, r.tOpen + 1200), close: sum(r.tClose, r.tClose + 1000) };
  });
  console.log('TRAY ' + JSON.stringify(out));
  app.exit(0);
});

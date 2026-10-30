// The measuring stick, Samara's side (2026-10-30): the full Samara (its blockers, privacy rules, wake and play rules) on a
// kept test profile, opening the same 20 pages Chrome opens, one at a time in the front tab. Each page: load times from
// the page's own timeline, a scripted scroll's frame times, its JS memory and its renderer's memory; video pages play
// muted for 8 s. The same measure.js / video.js run in Chrome, so the numbers line up.
// Off screen, never focused, never sends input. Prints "SPEED {...}" per page and "SPEEDTOTAL {...}" and exits.
//
// Run (from src/Shell):  the Electron binary, under perl alarm:  PAGES=<pages.json> MEASURE=<dir> .../Electron test/electron/speedrun-check.ts
import { app, BrowserWindow, screen } from 'electron';
import { mkdirSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.on('uncaughtException', (e) => { console.log('HARNESS NOTE ' + String((e as Error)?.message ?? e).split('\n')[0]); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.message ?? e).split('\n')[0]); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 15 * 60_000).unref();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const keep = (n: string) => { const d = path.join(os.tmpdir(), n); mkdirSync(d, { recursive: true }); return d; };
app.setPath('userData', keep('samara-speed-ud'));
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.on('window-all-closed', () => { /* the harness decides */ });
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setOpacity(0); this.showInactive(); };
BrowserWindow.prototype.focus = function () { /* never in a test */ };

const PAGES: { n: number; url: string; play?: boolean }[] = JSON.parse(readFileSync(process.env.PAGES!, 'utf8'));
const MEASURE = readFileSync(path.join(process.env.MEASURE!, 'measure.js'), 'utf8');
const VIDEO = readFileSync(path.join(process.env.MEASURE!, 'video.js'), 'utf8');
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',').map(Number)) : null;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const mb = (kb: number) => Math.round(kb / 1024);

app.whenReady().then(async () => {
  (screen as any).getCursorScreenPoint = () => ({ x: -20000, y: 500 });
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const { wireBrowser } = await import('../../src/browseripc.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const b: any = new AangBrowser({ origin: pages.origin, stateDir: keep('samara-speed-state'), preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'),
    thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs') } as any);
  wireBrowser(() => b);
  b.open();
  await sleep(8000); // lists load, the start page settles
  const total = () => mb(app.getAppMetrics().reduce((n, m) => n + (m.memory?.workingSetSize ?? 0), 0));
  const base = total(); let peak = base;
  for (const p of PAGES) {
    if (ONLY && !ONLY.has(p.n)) continue;
    const t0 = Date.now();
    const id = b.newTab(p.url, null, true);
    const tab = b.tabs.find((t: any) => t.id === id); const wc: Electron.WebContents = tab?.view?.webContents;
    if (!wc) { console.log('SPEED ' + JSON.stringify({ n: p.n, error: 'no tab' })); continue; }
    await new Promise<void>((r) => { const to = setTimeout(r, 30_000); wc.once('did-stop-loading', () => { clearTimeout(to); r(); }); });
    const stopped = Date.now() - t0;
    await sleep(3000);
    const m = await Promise.race([wc.mainFrame.executeJavaScript(MEASURE, true), sleep(20_000).then(() => ({ error: 'measure timed out' }))]).catch((e) => ({ error: String(e?.message ?? e).slice(0, 80) }));
    let video: unknown = undefined;
    if (p.play) video = await Promise.race([wc.executeJavaScript(VIDEO, true), sleep(30_000).then(() => ({ error: 'video timed out' }))]).catch((e) => ({ error: String(e?.message ?? e).slice(0, 80) }));
    let renderer = 0; try { const pid = wc.getOSProcessId(); renderer = mb(app.getAppMetrics().find((x) => x.pid === pid)?.memory?.workingSetSize ?? 0); } catch { /* gone */ }
    const all = total(); peak = Math.max(peak, all);
    console.log('SPEED ' + JSON.stringify({ n: p.n, url: p.url, stoppedMs: stopped, ...(m as object), video, rendererMB: renderer, samaraMB: all }));
    b.close(id, false);
    await sleep(1500);
  }
  await sleep(3000);
  console.log('SPEEDTOTAL ' + JSON.stringify({ machine: `${os.cpus()[0]?.model} x${os.cpus().length}`, electron: process.versions.electron, chrome: process.versions.chrome, startMB: base, peakMB: peak, endMB: total(), load: os.loadavg().map((x) => x.toFixed(1)) }));
  app.exit(0);
});

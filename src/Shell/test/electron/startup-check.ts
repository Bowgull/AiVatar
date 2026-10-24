// Samara's cold start, step by step (2026-10-22, his report from the Mac: "laggy, slow, takes forever to load, the tab
// bar glitches"). A restored session whose front tab is a long DARK page he had scrolled down, and four tabs asleep.
// Records, from new AangBrowser():
//   window shown, frame first paint, the front tab's view shown, its first paint, the scroll it painted at and when it
//   reached his old spot, the colour its page area showed before the page drew, the main process's longest stall, and
//   CPU per second for 20 s (to catch work landing while he starts using it).
// Off screen, never focused, never sends input. Prints one JSON line "STARTUP {...}" and exits.
//
// Run (from src/Shell):  npx electron test/electron/startup-check.ts
import { app, BrowserWindow, WebContentsView, screen } from 'electron';
import http from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import inspector from 'node:inspector';

// Node's warnings (a listener leak) with where they came from.
process.on('warning', (w) => console.log('WARNING ' + String(w.stack ?? w).split('\n').slice(0, 9).join(' | ')));
process.on('uncaughtException', (e) => { console.log('HARNESS NOTE ' + String((e as Error)?.message ?? e).split('\n')[0]); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e).split('\n').slice(0, 3).join(' | ')); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 120_000).unref();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = 47941;
const SCROLL = 3000;
// WARM=1: the same folders every run, so the second run on is a normal restart (block and phishing lists already kept).
const WARM = process.env.WARM === '1';
const keep = (n: string) => { const d = path.join(os.tmpdir(), n); mkdirSync(d, { recursive: true }); return d; };
app.setPath('userData', WARM ? keep('samara-start-ud-keep') : mkdtempSync(path.join(os.tmpdir(), 'samara-start-ud-')));
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.on('window-all-closed', () => { /* the harness decides */ });
// Off screen and never in front: a see-through window in the corner, so macOS still draws it.
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setOpacity(0); this.showInactive(); };
BrowserWindow.prototype.focus = function () { /* never in a test */ };

const t0 = { v: 0 };
const now = () => Math.round(performance.now() - t0.v);
const marks: Record<string, unknown> = {};
const mark = (k: string, v: unknown = now()) => { if (!(k in marks)) marks[k] = v; };

// A long dark page (like Twitch or YouTube at night), and plain ones for the sleeping tabs.
const LONG = `<!doctype html><title>Long dark</title><style>body{margin:0;background:#0e0e10;color:#ddd;font:16px sans-serif}
div{height:120px;border-bottom:1px solid #222;padding:12px}img{width:200px;height:90px;background:#222}</style>
${Array.from({ length: 120 }, (_, i) => `<div>Row ${i}<br><img src="/img/${i}.svg"></div>`).join('')}`;
const SVG = (n: number) => `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="90"><rect width="200" height="90" fill="#${(n * 2654435761 % 0xffffff).toString(16).padStart(6, '0')}"/></svg>`;

app.whenReady().then(async () => {
  (screen as any).getCursorScreenPoint = () => ({ x: -20000, y: 500 });
  // Images arrive slowly, as on a real site, so "loaded" comes well after "drawn".
  http.createServer((q, r) => {
    const u = q.url ?? '/';
    if (u.startsWith('/img/')) { setTimeout(() => r.writeHead(200, { 'Content-Type': 'image/svg+xml' }).end(SVG(Number(u.slice(5).split('.')[0]) || 0)), 400 + (Number(u.slice(5).split('.')[0]) % 10) * 60); return; }
    if (u.startsWith('/long')) { r.writeHead(200, { 'Content-Type': 'text/html' }).end(LONG); return; }
    r.writeHead(200, { 'Content-Type': 'text/html' }).end(`<!doctype html><title>Page</title><p>${u}</p>`);
  }).listen(PORT, '127.0.0.1');
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const { wireBrowser } = await import('../../src/browseripc.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));

  const stateDir = WARM ? keep('samara-start-state-keep') : mkdtempSync(path.join(os.tmpdir(), 'samara-start-state-'));
  const url = (p: string) => `http://127.0.0.1:${PORT}${p}`;
  const TABS = ['/long', '/p/1', '/p/2', '/p/3', '/p/4'];
  // pageBg: what a page looked like when it was last saved (absent in old snapshots, which must still work).
  // KEEPTABS=1: start from the tabs the last run saved on its way out (Chromium's own page state included).
  const KEEPTABS = process.env.KEEPTABS === '1' && WARM;
  if (!KEEPTABS) writeFileSync(path.join(stateDir, 'browser-tabs.json'), JSON.stringify({ v: 1, at: new Date().toISOString(), active: 0, fronts: [0],
    tabs: TABS.map((p, i) => ({ url: url(p), title: `Tab ${i + 1}`, opener: null, scrollY: i === 0 ? SCROLL : 0, zoom: 0, muted: false, trail: null, done: false, win: 0, ...(i === 0 ? { pageBg: '#0e0e10' } : {}) })),
    trails: [], closed: [] }));

  // Watch the front tab's view: when it is shown, what colour it shows, when its page draws and where it is scrolled.
  const origBg = WebContentsView.prototype.setBackgroundColor;
  WebContentsView.prototype.setBackgroundColor = function (this: WebContentsView, c: string) { (this as any).__bg = c; return origBg.call(this, c); };
  const origVisible = WebContentsView.prototype.setVisible;
  WebContentsView.prototype.setVisible = function (this: WebContentsView, on: boolean) {
    try { if (on && (globalThis as any).__front?.()?.view === this) { mark('tabShown'); mark('tabShownBg', (this as any).__bg ?? '?'); } } catch { /* not ours */ }
    return origVisible.call(this, on);
  };

  const eld = monitorEventLoopDelay({ resolution: 5 }); eld.enable();
  const perSecond: { s: number; cpu: number; eldMax: number }[] = [];
  let lastEldMax = 0;
  // PROFILE=1: a CPU profile of the main process for the first 8 s, summed by function (self time), top 25.
  const prof = process.env.PROFILE === '1' ? new inspector.Session() : null;
  if (prof) { prof.connect(); await new Promise((r) => prof.post('Profiler.enable', () => prof.post('Profiler.setSamplingInterval', { interval: 500 }, () => prof.post('Profiler.start', r)))); }
  t0.v = performance.now();
  let b: any = null;
  const front = () => b?.tabs.find((t: any) => String(t.url).includes('/long'));
  (globalThis as any).__front = front;
  b = new AangBrowser({ origin: pages.origin, stateDir, preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'),
    thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs') } as any);
  wireBrowser(() => b);
  const painted = b.painted.bind(b);
  b.painted = (sender: Electron.WebContents) => { if (sender.getURL().includes('/long')) mark('tabPainted'); return painted(sender); };
  b.open();
  mark('ctorAndOpen');
  const w: BrowserWindow = b.win;
  w.once('ready-to-show', () => mark('windowShown'));
  w.webContents.once('did-finish-load', () => mark('frameLoaded'));

  // Sample the front tab's scroll every 20 ms until it is where he left it (or 8 s).
  const scrolls: [number, number][] = [];
  // The page's own first paint (its performance timeline) and its scroll, read straight from the frame every 20 ms,
  // loading or not (WebFrameMain does not wait for the load the way webContents.executeJavaScript does).
  const poll = setInterval(async () => {
    const t = front(); const wc = t?.view?.webContents;
    if (!wc || wc.isDestroyed() || !String(wc.mainFrame?.url ?? '').includes('/long')) return;
    const r = await wc.mainFrame.executeJavaScript('[scrollY, (performance.getEntriesByType("paint").find((e) => e.name === "first-contentful-paint") || {}).startTime ?? null, performance.timeOrigin]', true).catch(() => null);
    if (!Array.isArray(r)) return;
    const [y, fcp, origin] = r as [number, number | null, number];
    if (fcp !== null && !('tabFCP' in marks)) mark('tabFCP', Math.round(origin + fcp - (performance.timeOrigin + t0.v)));
    if (!('tabFCP' in marks)) return;
    if (!scrolls.length || scrolls[scrolls.length - 1]![1] !== y) scrolls.push([now(), y]);
    if (y >= SCROLL - 2) { mark('scrollBack'); clearInterval(poll); }
  }, 20);

  // CPU (all of Samara's processes) and the longest main-thread stall, each second for 10 s.
  app.getAppMetrics();
  for (let s = 1; s <= 20; s++) {
    await new Promise((r) => setTimeout(r, 1000));
    const cpu = app.getAppMetrics().reduce((n, m) => n + (m.cpu?.percentCPUUsage ?? 0), 0);
    const mx = Math.round(eld.max / 1e6);
    perSecond.push({ s, cpu: Math.round(cpu), eldMax: mx === lastEldMax ? 0 : mx });
    lastEldMax = mx; eld.reset();
  }
  if (prof) {
    const p: any = await new Promise((r) => prof.post('Profiler.stop', (_e, x: any) => r(x.profile)));
    const self = new Map<string, number>(); const dt = p.timeDeltas as number[]; const byId = new Map<number, any>(p.nodes.map((n: any) => [n.id, n]));
    p.samples.forEach((id: number, i: number) => { const n = byId.get(id); const f = n.callFrame; const k = `${f.functionName || '(anon)'} ${String(f.url).split('/').slice(-2).join('/')}:${f.lineNumber + 1}`; self.set(k, (self.get(k) ?? 0) + (dt[i] ?? 0) / 1000); });
    // PROFILE_OUT=<file>: the whole profile too, for a closer look (Chrome DevTools opens it).
    if (process.env.PROFILE_OUT) writeFileSync(process.env.PROFILE_OUT, JSON.stringify(p));
    console.log('PROFILE ' + JSON.stringify([...self].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, ms]) => `${Math.round(ms)}ms ${k}`)));
  }
  const fw = w.webContents;
  const fcp = await fw.executeJavaScript('(() => { const p = performance.getEntriesByType("paint").find((e) => e.name === "first-contentful-paint"); return p ? performance.timeOrigin + p.startTime : null; })()', true).catch(() => null);
  marks.frameFCP = fcp ? Math.round(fcp - (performance.timeOrigin + t0.v)) : null;
  // Saved the way closing Samara saves, so a KEEPTABS run can start from it.
  await b.snapshot(true).catch(() => {});
  let saved: any = {}; try { saved = JSON.parse(readFileSync(path.join(stateDir, 'browser-tabs.json'), 'utf8')).tabs?.[0] ?? {}; } catch { /* none */ }
  console.log('STARTUP ' + JSON.stringify({ warm: WARM, keptTabs: KEEPTABS, savedState: saved.pageState ? saved.pageState.length : 0, savedScroll: saved.scrollY, savedBg: saved.pageBg, machine: `${os.cpus()[0]?.model} x${os.cpus().length}`, ...marks,
    scrollAtFirstPaint: scrolls[0]?.[1] ?? null, jumped: Boolean(scrolls.length && scrolls[0]![1] < SCROLL - 2), perSecond }));
  app.exit(0);
});

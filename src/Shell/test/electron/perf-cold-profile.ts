// Samara perf (2026-10-20), measurement only: where the main process spends Samara's cold start. A V8 CPU profile of
// the main process from just before `new AangBrowser` until 5 s after open(), self time summed per function, plus
// the constructor's own time. Uses the cached block and phishing lists from perf-trace.ts (warm disk).
//
// Run: npx electron test/electron/perf-cold-profile.ts
import { app, BrowserWindow, screen } from 'electron';
import http from 'node:http';
import { cpSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import inspector from 'node:inspector';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'samara-perf-ud-')));
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
process.on('uncaughtException', (e) => { console.log('HARNESS NOTE ' + String((e as Error)?.message ?? e).split('\n')[0]); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.message ?? e).split('\n')[0]); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 120_000).unref();
app.on('window-all-closed', () => { /* the probe decides */ });
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.showInactive(); };
BrowserWindow.prototype.focus = function () { /* never in a test */ };
const HERE = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(os.tmpdir(), 'samara-perf-cache');
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const PORT = 47933;

app.whenReady().then(async () => {
  (screen as any).getCursorScreenPoint = () => ({ x: -20000, y: 500 });
  const site = http.createServer((_q, r) => { r.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>t</title><p>tab</p>'); });
  await new Promise<void>((res) => site.listen(PORT, '127.0.0.1', () => res()));
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const { wireBrowser } = await import('../../src/browseripc.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const stateDir = mkdtempSync(path.join(os.tmpdir(), 'samara-cold-'));
  if (existsSync(path.join(CACHE, 'adblock'))) { cpSync(path.join(CACHE, 'adblock'), path.join(stateDir, 'adblock'), { recursive: true }); cpSync(path.join(CACHE, 'phish'), path.join(stateDir, 'phish'), { recursive: true }); }
  else console.log('NOTE no cached lists: run perf-trace.ts once first');
  writeFileSync(path.join(stateDir, 'browser-tabs.json'), JSON.stringify({ v: 1, active: 0, fronts: [0], tabs: [1, 2, 3, 4, 5, 6].map((i) => ({ url: `http://127.0.0.1:${PORT}/${i}`, title: `T${i}`, opener: null, scrollY: 0, zoom: 0, muted: false, trail: null, done: false, win: 0 })), trails: [], closed: [] }));
  const s = new inspector.Session();
  s.connect();
  const post = (m: string, p: object = {}) => new Promise<any>((res, rej) => s.post(m, p, (e, r) => (e ? rej(e) : res(r))));
  await post('Profiler.enable');
  await post('Profiler.setSamplingInterval', { interval: 500 });
  await post('Profiler.start');
  const t0 = performance.now();
  const b: any = new AangBrowser({ origin: pages.origin, stateDir, preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs') } as any);
  const ctor = performance.now() - t0;
  wireBrowser(() => b);
  b.open();
  await wait(5000);
  const { profile } = await post('Profiler.stop');
  // Self time per function (samples x interval), and per file.
  const dt = new Map<number, number>();
  const ids: number[] = profile.samples, deltas: number[] = profile.timeDeltas;
  for (let i = 0; i < ids.length; i++) dt.set(ids[i]!, (dt.get(ids[i]!) ?? 0) + (deltas[i] ?? 0) / 1000);
  const byFn = new Map<string, number>(), byFile = new Map<string, number>();
  for (const n of profile.nodes) {
    const ms = dt.get(n.id) ?? 0; if (!ms) continue;
    const cf = n.callFrame; const file = String(cf.url || '(native)').replace(/^.*node_modules[\\/]/, 'nm/').replace(/^.*[\\/]src[\\/]Shell[\\/]/, '');
    const key = `${cf.functionName || '(anon)'} ${file}:${cf.lineNumber + 1}`;
    byFn.set(key, (byFn.get(key) ?? 0) + ms);
    const pkg = file.startsWith('nm/') ? file.split('/').slice(0, file.split('/')[1]?.startsWith('@') ? 3 : 2).join('/') : file;
    byFile.set(pkg, (byFile.get(pkg) ?? 0) + ms);
  }
  const top = (m: Map<string, number>, n: number) => [...m.entries()].sort((a, z) => z[1] - a[1]).slice(0, n).map(([k, v]) => `${Math.round(v)} ms  ${k}`);
  console.log(`constructor ${Math.round(ctor)} ms; profile ${Math.round(profile.endTime - profile.startTime) / 1000} ms; ads ready ${Boolean(b.ads)}; phish ready ${Boolean(b.phish?.ready)}`);
  console.log('--- self time by file/package (first 5 s)\n' + top(byFile, 15).join('\n'));
  console.log('--- self time by function\n' + top(byFn, 25).join('\n'));
  app.exit(0);
}).catch((e) => { console.log('HARNESS FAILED ' + String((e as Error)?.stack ?? e).split('\n')[0]); app.exit(2); });

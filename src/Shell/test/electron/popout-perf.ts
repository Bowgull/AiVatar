// Pop-out performance baseline (2026-10-20). MEASUREMENT ONLY: nothing in src/ or pages/ is changed.
// The same method as perf-trace.ts (Samara): CDP Performance.getMetrics, a Chromium trace parsed per process,
// main-process event-loop delay and CPU, every IPC message both ways, every view.setBounds / setOpacity /
// setIgnoreMouseEvents / executeJavaScript / capturePage, and frame + video-frame counts inside the pages.
// Drives the real Popout and the real "take the tab with you" path (browser:popout from Samara's frame -> lend ->
// openTab -> close -> returnTab -> giveBack). Never sends input to the desktop: only webContents.sendInputEvent /
// executeJavaScript inside our own (off-screen) windows. The cursor is a fake point set by the harness.
//
// Run (from src/Shell):  npx electron test/electron/popout-perf.ts               normal CPU
//                        PERF_RATE=4 npx electron test/electron/popout-perf.ts   pages throttled 4x (CDP)
// Needs %TEMP%\popout-perf-media\clip1080.webm (ffmpeg testsrc2, 1920x1080 30 fps VP9 + silent Opus track, 12 s, looped; a video-only clip is paused by Chromium when hidden).
// Results: test/electron/perf-out/popout-<rate>x.json.
import { app, BrowserWindow, View, WebContentsView, contentTracing, ipcMain, nativeImage, screen } from 'electron';
import http from 'node:http';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, createReadStream, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import cp from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';

const RATE = Math.max(1, Number(process.env.PERF_RATE) || 1);
const PORT = 47941;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'perf-out');
const TRACES = path.join(os.tmpdir(), 'popout-perf-traces', `${RATE}x`);
const CACHE = path.join(os.tmpdir(), 'samara-perf-cache');
const CLIP = path.join(os.tmpdir(), 'popout-perf-media', 'clip1080.webm');
mkdirSync(OUT, { recursive: true }); mkdirSync(TRACES, { recursive: true });

app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'popout-perf-ud-')));
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

process.on('uncaughtException', (e) => { console.log('HARNESS NOTE ' + String((e as Error)?.message ?? e).split('\n')[0]); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e).split('\n').slice(0, 3).join(' | ')); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); try { writeResults('timeout'); } catch { /* best effort */ } app.exit(3); }, 600_000).unref();
app.on('window-all-closed', () => { /* the harness decides */ });
const OFF_X = -6000;
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(OFF_X, 100); this.showInactive(); };
BrowserWindow.prototype.focus = function () { /* never in a test */ };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ep = () => performance.timeOrigin + performance.now();
const r1 = (n: number) => Math.round(n * 10) / 10;
let pointer = { x: -20000, y: 500 };

// ------------------------------------------------------------------ event log
type Ev = { t: number; k: string; ch?: string; to?: string; bytes?: number; ms?: number; arg?: string; id?: number; res?: unknown };
const evs: Ev[] = [];
function kindOf(wc: any): string {
  try {
    if (!wc || wc.isDestroyed()) return 'gone';
    const u: string = wc.getURL() || '';
    if (u.includes('popout.html')) return 'popout';
    if (u.includes('browser.html?tray')) return 'tray';
    if (u.includes('browser.html')) return 'frame';
    if (u.includes('curtain.html')) return 'curtain';
    if (u.includes(`:${PORT}/`)) return 'tab';
    return u ? 'other' : 'blank';
  } catch { return '?'; }
}
const REC = `/*perf*/(() => {
  if (window.__perf) return true;
  const T = () => performance.timeOrigin + performance.now();
  let on = false, frames = [], muts = 0, lastMut = 0, loaf = [], lt = [];
  new MutationObserver((l) => { if (on) { muts += l.length; lastMut = T(); } }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  try { new PerformanceObserver((l) => { if (!on) return; for (const e of l.getEntries()) loaf.push({ at: performance.timeOrigin + e.startTime, dur: e.duration, block: e.blockingDuration,
    styleLayout: e.styleAndLayoutStart ? Math.max(0, e.startTime + e.duration - e.styleAndLayoutStart) : 0,
    scripts: (e.scripts || []).map((s) => ({ src: String(s.sourceURL || '').split('/').pop().split('?')[0], fn: s.sourceFunctionName, inv: String(s.invoker || '').slice(0, 60), dur: Math.round(s.duration), forced: Math.round(s.forcedStyleAndLayoutDuration || 0) })) }); }).observe({ type: 'long-animation-frame' }); } catch {}
  try { new PerformanceObserver((l) => { if (on) for (const e of l.getEntries()) lt.push(e.duration); }).observe({ type: 'longtask' }); } catch {}
  const loop = (ts) => { if (!on) return; frames.push(performance.timeOrigin + ts); requestAnimationFrame(loop); };
  window.__perf = {
    start() { frames = []; muts = 0; lastMut = 0; loaf = []; lt = []; on = true; requestAnimationFrame(loop); return true; },
    stop() { on = false; return { frames, muts, lastMut, loaf, lt, vis: document.visibilityState, nodes: document.getElementsByTagName('*').length }; },
  };
  return true;
})()`;
// Video frames actually presented / dropped by the tab's <video> (the picture he watches).
const VQ = `/*perf*/(() => { const v = document.querySelector('video'); if (!v) return null; const q = v.getVideoPlaybackQuality(); return { total: q.totalVideoFrames, dropped: q.droppedVideoFrames, t: v.currentTime, paused: v.paused, w: v.clientWidth, h: v.clientHeight }; })()`;

const dbgReady = new WeakSet<object>();
async function attachDbg(wc: Electron.WebContents): Promise<void> {
  try {
    if (wc.isDestroyed()) return;
    if (!wc.debugger.isAttached()) wc.debugger.attach('1.3');
    await wc.debugger.sendCommand('Performance.enable', { timeDomain: 'timeTicks' });
    if (RATE > 1) await wc.debugger.sendCommand('Emulation.setCPUThrottlingRate', { rate: RATE });
    dbgReady.add(wc);
  } catch { /* retried at next navigation */ }
}
app.on('web-contents-created', (_e, wc) => {
  evs.push({ t: ep(), k: 'created', id: wc.id });
  const send0 = wc.send.bind(wc);
  (wc as any).send = (ch: string, ...a: unknown[]) => {
    let bytes = 0; try { bytes = JSON.stringify(a)?.length ?? 0; } catch { bytes = -1; }
    evs.push({ t: ep(), k: 'send', ch, to: kindOf(wc), bytes, id: wc.id });
    return send0(ch, ...a);
  };
  const cap0 = wc.capturePage.bind(wc);
  (wc as any).capturePage = async (...a: any[]) => { const s = ep(); try { return await (cap0 as any)(...a); } finally { evs.push({ t: s, k: 'capture', to: kindOf(wc), ms: ep() - s, id: wc.id }); } };
  const ex0 = wc.executeJavaScript.bind(wc);
  (wc as any).executeJavaScript = (code: string, g?: boolean) => {
    const s = ep(); const p = ex0(code, g);
    if (!(typeof code === 'string' && code.startsWith('/*perf*/'))) {
      const arg = String(code).replace(/\s+/g, ' ').slice(0, 60);
      p.then((res: unknown) => evs.push({ t: s, k: 'execjs', to: kindOf(wc), ms: ep() - s, arg, id: wc.id, res: typeof res === 'object' ? (res ? 'obj' : res) : res }),
        () => evs.push({ t: s, k: 'execjs', to: kindOf(wc), ms: ep() - s, arg, id: wc.id, res: 'rejected' }));
    }
    return p;
  };
  const css0 = wc.insertCSS.bind(wc);
  (wc as any).insertCSS = (...a: any[]) => { const s = ep(); const p = (css0 as any)(...a); p.then(() => evs.push({ t: s, k: 'insertCSS', to: kindOf(wc), ms: ep() - s, id: wc.id }), () => {}); return p; };
  wc.on('ipc-message', (_e2, ch) => evs.push({ t: ep(), k: 'ipc', ch, to: kindOf(wc), id: wc.id }));
  wc.on('ipc-message-sync', (_e2, ch) => evs.push({ t: ep(), k: 'ipc', ch, to: kindOf(wc), id: wc.id }));
  wc.on('did-finish-load', () => {
    evs.push({ t: ep(), k: 'load', to: kindOf(wc), id: wc.id });
    if (['frame', 'popout', 'tab'].includes(kindOf(wc))) void wc.executeJavaScript(REC, true).catch(() => {});
  });
  wc.on('did-navigate', () => { if (!dbgReady.has(wc)) void attachDbg(wc); else if (RATE > 1) void wc.debugger.sendCommand('Emulation.setCPUThrottlingRate', { rate: RATE }).catch(() => {}); });
  wc.on('dom-ready', () => { if (!dbgReady.has(wc)) void attachDbg(wc); });
  void attachDbg(wc);
});
for (const proto of [View.prototype, WebContentsView.prototype] as any[]) {
  for (const [name, k] of [['setBounds', 'viewBounds'], ['setVisible', 'setVisible'], ['addChildView', 'addChild'], ['removeChildView', 'removeChild']]) {
    if (!Object.prototype.hasOwnProperty.call(proto, name) || typeof proto[name] !== 'function') continue;
    const o = proto[name];
    proto[name] = function (this: unknown, ...a: unknown[]) { const s = performance.now(); try { return o.apply(this, a); } finally { evs.push({ t: ep(), k, ms: performance.now() - s }); } };
  }
}
{
  const BW: any = BrowserWindow.prototype;
  for (const [name, k] of [['setBounds', 'winBounds'], ['setOpacity', 'setOpacity'], ['setIgnoreMouseEvents', 'ignoreMouse'], ['setAspectRatio', 'aspect'], ['setAlwaysOnTop', 'onTop'], ['hide', 'hide'], ['showInactive', 'showInactive'], ['setFullScreenable', 'fsable'], ['getBounds', 'getBounds'], ['getContentSize', 'getContentSize'], ['isVisible', 'isVisible']]) {
    const o = BW[name]; if (typeof o !== 'function') continue;
    BW[name] = function (this: unknown, ...a: unknown[]) { const s = performance.now(); try { return o.apply(this, a); } finally { evs.push({ t: ep(), k, ms: performance.now() - s }); } };
  }
}
// softEdge (winedge.ts) spawns PowerShell for every new pop-out window: count it and its synchronous cost.
{
  const sp0 = cp.spawn;
  (cp as any).spawn = function (...a: any[]) { const s = performance.now(); try { return (sp0 as any).apply(cp, a); } finally { evs.push({ t: ep(), k: 'spawn', arg: String(a[0]).split(/[\\/]/).pop(), ms: performance.now() - s }); } };
  syncBuiltinESMExports();
}
app.whenReady().then(() => {
  const NI: any = Object.getPrototypeOf(nativeImage.createEmpty());
  for (const name of ['toJPEG', 'toPNG', 'resize']) {
    const o = NI[name]; if (typeof o !== 'function') continue;
    NI[name] = function (this: unknown, ...a: unknown[]) { const s = performance.now(); try { return o.apply(this, a); } finally { evs.push({ t: ep(), k: 'img', arg: name, ms: performance.now() - s }); } };
  }
});

// ------------------------------------------------------------------ measuring
const results: any[] = [];
const notes: string[] = [];
const eld = monitorEventLoopDelay({ resolution: 1 });
eld.enable();
const TRACE_CFG: any = {
  included_categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame', 'toplevel', 'benchmark', 'v8.execute', 'media', 'viz', 'gpu'],
  excluded_categories: ['*'], recording_mode: 'record-until-full', trace_buffer_size_in_kb: 600000,
};
let b: any = null; let p: any = null;
const alive = (w: Electron.WebContents | null | undefined): w is Electron.WebContents => Boolean(w && !w.isDestroyed());
const frameWc = (): Electron.WebContents | null => { const w = b?.win; return w && !w.isDestroyed() ? w.webContents : null; };
const popWc = (): Electron.WebContents | null => { const w = p?.window; return w && !w.isDestroyed() ? w.webContents : null; };
let tabView: WebContentsView | null = null;
const tabWc = (): Electron.WebContents | null => (tabView && !tabView.webContents.isDestroyed() ? tabView.webContents : null);
const px = (code: string) => popWc()!.executeJavaScript('/*perf*/' + code, true);
async function until(cond: () => boolean | Promise<boolean>, ms = 8000, step = 4): Promise<number | null> {
  const end = Date.now() + ms;
  while (Date.now() < end) { try { if (await cond()) return ep(); } catch { /* not yet */ } await wait(step); }
  return null;
}
const METRICS = ['RecalcStyleDuration', 'LayoutDuration', 'ScriptDuration', 'TaskDuration', 'RecalcStyleCount', 'LayoutCount', 'Nodes', 'JSHeapUsedSize'];
async function metrics(wc: Electron.WebContents | null): Promise<Record<string, number> | null> {
  if (!alive(wc) || !dbgReady.has(wc)) return null;
  try { const r: any = await wc.debugger.sendCommand('Performance.getMetrics'); return Object.fromEntries(r.metrics.filter((m: any) => METRICS.includes(m.name)).map((m: any) => [m.name, m.value])); } catch { return null; }
}
function mdelta(a: Record<string, number> | null, z: Record<string, number> | null) {
  if (!a || !z) return null;
  const s = (k: string) => r1(((z[k] ?? 0) - (a[k] ?? 0)) * 1000);
  return { styleMs: s('RecalcStyleDuration'), layoutMs: s('LayoutDuration'), scriptMs: s('ScriptDuration'), taskMs: s('TaskDuration'),
    styleN: (z.RecalcStyleCount ?? 0) - (a.RecalcStyleCount ?? 0), layoutN: (z.LayoutCount ?? 0) - (a.LayoutCount ?? 0), nodes: z.Nodes };
}
async function recStart(wc: Electron.WebContents | null) { if (!alive(wc)) return; try { await wc.executeJavaScript(`${REC};/*perf*/window.__perf.start()`, true); } catch { /* not ready */ } }
async function recStop(wc: Electron.WebContents | null): Promise<any> { if (!alive(wc)) return null; try { return await wc.executeJavaScript('/*perf*/window.__perf ? window.__perf.stop() : null', true); } catch { return null; } }
async function vq(): Promise<any> { const w = tabWc(); if (!alive(w)) return null; try { return await w.executeJavaScript(VQ, true); } catch { return null; } }
function pageSum(pg: any, t0: number) {
  if (!pg) return null;
  const f: number[] = (pg.frames ?? []).filter((x: number) => x >= t0 - 20);
  const iv = f.slice(1).map((x, i) => x - f[i]!);
  const sorted = [...iv].sort((a, z) => a - z);
  const loaf = (pg.loaf ?? []).filter((x: any) => x.at >= t0 - 20).sort((a: any, z: any) => z.dur - a.dur);
  return {
    frames: f.length, maxFrameMs: r1(sorted.at(-1) ?? 0), p95FrameMs: r1(sorted[Math.floor(sorted.length * 0.95)] ?? 0),
    dropped: iv.reduce((a, x) => a + Math.max(0, Math.round(x / 16.67) - 1), 0),
    muts: pg.muts, lastMutMs: pg.lastMut ? r1(pg.lastMut - t0) : null, longTasks: (pg.lt ?? []).length, longTaskMax: r1(Math.max(0, ...(pg.lt ?? [0]))),
    loafN: loaf.length, loafTop: loaf.slice(0, 2).map((x: any) => ({ dur: r1(x.dur), block: r1(x.block), styleLayout: r1(x.styleLayout), scripts: x.scripts.slice(0, 2) })), vis: pg.vis,
  };
}
function evSum(list: Ev[]) {
  const n = (k: string) => list.filter((e) => e.k === k).length;
  const ms = (k: string) => r1(list.filter((e) => e.k === k).reduce((a, e) => a + (e.ms ?? 0), 0));
  const sends: Record<string, number> = {};
  for (const e of list) if (e.k === 'send') sends[`${e.ch}>${e.to}`] = (sends[`${e.ch}>${e.to}`] ?? 0) + 1;
  const ins: Record<string, number> = {};
  for (const e of list) if (e.k === 'ipc') ins[`${e.ch}<${e.to}`] = (ins[`${e.ch}<${e.to}`] ?? 0) + 1;
  const ex: Record<string, { n: number; ms: number }> = {};
  for (const e of list) if (e.k === 'execjs') { const key = `${e.to}:${(e.arg ?? '').slice(0, 34)}`; const x = (ex[key] ??= { n: 0, ms: 0 }); x.n++; x.ms = r1(x.ms + (e.ms ?? 0)); }
  return {
    sends, ipcIn: ins, execjs: ex,
    viewBounds: n('viewBounds'), viewBoundsMs: ms('viewBounds'), winBounds: n('winBounds'), setVisible: n('setVisible'), addChild: n('addChild'), removeChild: n('removeChild'),
    setOpacity: n('setOpacity'), setOpacityMs: ms('setOpacity'), ignoreMouse: n('ignoreMouse'), ignoreMouseMs: ms('ignoreMouse'), aspect: n('aspect'),
    hide: n('hide'), hideMs: ms('hide'), showInactive: n('showInactive'), showMs: ms('showInactive'), getBounds: n('getBounds'), getContentSize: n('getContentSize'), isVisible: n('isVisible'),
    capture: n('capture'), captureMs: ms('capture'), imgMs: ms('img'), spawn: n('spawn'), spawnMs: ms('spawn'), insertCSS: n('insertCSS'),
  };
}
function summarizeTrace(file: string, pids: Record<string, number | undefined>) {
  let raw: any;
  try { raw = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { return { error: String((e as Error).message).slice(0, 80) }; }
  const all: any[] = Array.isArray(raw) ? raw : raw.traceEvents ?? [];
  const mainTid = new Map<number, number>();
  for (const e of all) if (e.ph === 'M' && e.name === 'thread_name' && (e.args?.name === 'CrRendererMain' || e.args?.name === 'CrBrowserMain' || e.args?.name === 'CrGpuMain')) mainTid.set(e.pid, e.tid);
  const out: Record<string, any> = {};
  for (const [kind, pid] of Object.entries(pids)) {
    if (pid === undefined) continue;
    const tid = mainTid.get(pid);
    if (tid === undefined) { out[kind] = { pid, note: 'no main thread in trace' }; continue; }
    const by = new Map<string, { ms: number; n: number }>();
    let busyA = 0, busyB = 0, nA = 0, nB = 0; const longA: number[] = [], longB: number[] = [];
    let allThreadsMs = 0;
    for (const e of all) {
      if (e.pid !== pid) continue;
      if (e.ph === 'X' && typeof e.dur === 'number' && (e.name === 'ThreadControllerImpl::RunTask' || e.name === 'RunTask')) allThreadsMs += e.dur / 1000;
      if (e.tid !== tid || e.ph !== 'X' || typeof e.dur !== 'number') continue;
      const ms = e.dur / 1000;
      if (e.name === 'RunTask') { busyA += ms; nA++; if (ms > 50) longA.push(r1(ms)); }
      else if (e.name === 'ThreadControllerImpl::RunTask') { busyB += ms; nB++; if (ms > 50) longB.push(r1(ms)); }
      else { const x = by.get(e.name) ?? { ms: 0, n: 0 }; x.ms += ms; x.n++; by.set(e.name, x); }
    }
    const useA = nA > 0;
    const top = [...by.entries()].sort((a, z) => z[1].ms - a[1].ms).slice(0, 8).map(([name, v]) => ({ name, ms: r1(v.ms), n: v.n }));
    const get = (nm: string) => r1(by.get(nm)?.ms ?? 0);
    const cnt = (nm: string) => by.get(nm)?.n ?? 0;
    out[kind] = { pid, busyMs: r1(useA ? busyA : busyB), tasks: useA ? nA : nB, longTasks: (useA ? longA : longB).sort((a, z) => z - a).slice(0, 5),
      style: get('UpdateLayoutTree'), styleN: cnt('UpdateLayoutTree'), layout: get('Layout'), layoutN: cnt('Layout'), paint: get('Paint'), paintN: cnt('Paint'),
      frames: cnt('ProxyMain::BeginMainFrame'), allThreadsMs: r1(allThreadsMs), top };
  }
  return out;
}
function gpuPid(): number | undefined { return app.getAppMetrics().find((m) => m.type === 'GPU')?.pid; }
function pidsNow(): Record<string, number | undefined> {
  const q = (w: Electron.WebContents | null) => (alive(w) ? w.getOSProcessId() : undefined);
  return { main: process.pid, popout: q(popWc()), tab: q(tabWc()), frame: q(frameWc()), gpu: gpuPid() };
}
/** Whole-process CPU time (all threads: the GPU process's decode and compositing included), from Windows itself. */
function osCpu(): Promise<Record<string, number>> {
  const pids = pidsNow(); const ids = Object.values(pids).filter((x): x is number => typeof x === 'number');
  return new Promise((res) => {
    cp.execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Get-Process -Id ${ids.join(',')} | ForEach-Object { "$($_.Id) $($_.TotalProcessorTime.TotalMilliseconds)" }`], { windowsHide: true, timeout: 15_000 }, (_e, out) => {
      const byPid = new Map<number, number>(); for (const line of String(out ?? '').split(/\r?\n/)) { const [a, z] = line.trim().split(' '); if (a && z) byPid.set(Number(a), Number(z)); }
      const o: Record<string, number> = {}; for (const [k, pid] of Object.entries(pids)) if (pid !== undefined && byPid.has(pid)) o[k] = byPid.get(pid)!;
      res(o);
    });
  });
}
type Opt = { settle?: () => boolean | Promise<boolean>; settleMs?: number; tail?: number; rec?: () => (Electron.WebContents | null)[]; trace?: boolean; keepTrace?: boolean; extra?: (t0: number, list: Ev[]) => any; cpu?: boolean };
async function measure(group: string, name: string, act: () => unknown, o: Opt = {}): Promise<any> {
  const watch = { popout: popWc(), tab: tabWc(), frame: frameWc() };
  const before = { popout: await metrics(watch.popout), tab: await metrics(watch.tab), frame: await metrics(watch.frame) };
  const vq0 = await vq();
  const recs = (o.rec?.() ?? [popWc()]).filter(alive);
  await Promise.all(recs.map(recStart));
  const traceOn = o.trace !== false;
  if (traceOn) await contentTracing.startRecording(TRACE_CFG);
  const os0 = o.cpu ? await osCpu() : null; const osT0 = ep();
  await wait(30);
  const i0 = evs.length;
  eld.reset();
  const cpu0 = process.cpuUsage();
  const t0 = ep();
  const s = performance.now();
  let r: unknown;
  try { r = act(); } catch (e) { notes.push(`${group}/${name}: ${(e as Error).message}`); }
  const syncMs = performance.now() - s;
  if (r instanceof Promise) { try { await r; } catch (e) { notes.push(`${group}/${name}: ${(e as Error).message}`); } }
  const settledAt = o.settle ? await until(o.settle, o.settleMs ?? 8000) : null;
  if (o.settle && !settledAt) notes.push(`${group}/${name}: did not settle`);
  await wait(o.tail ?? 300);
  const t1 = ep();
  const eldMax = eld.max / 1e6, eldP99 = eld.percentile(99) / 1e6;
  const cpu = process.cpuUsage(cpu0);
  const osT1 = ep(); const os1 = o.cpu ? await osCpu() : null;
  const procCpu = os0 && os1 ? Object.fromEntries(Object.keys(os1).filter((k) => k in os0).map((k) => [k, { ms: r1(os1[k]! - os0[k]!), pctOfCore: r1((os1[k]! - os0[k]!) / (osT1 - osT0) * 100) }])) : null;
  const pages: Record<string, any> = {};
  for (const w of recs) pages[kindOf(w)] = pageSum(await recStop(w), t0);
  const watch2 = { popout: popWc(), tab: tabWc(), frame: frameWc() };
  const after = { popout: await metrics(watch2.popout), tab: await metrics(watch2.tab), frame: await metrics(watch2.frame) };
  const vq1 = await vq();
  const pids = pidsNow();
  let trace: any = null;
  if (traceOn) {
    const f = await contentTracing.stopRecording(path.join(TRACES, `${group}-${name}-${results.length}.json`.replace(/[^\w.-]+/g, '_')));
    trace = summarizeTrace(f, pids);
    if (!o.keepTrace) try { rmSync(f); } catch { /* keep */ } else trace.file = f;
  }
  const list = evs.slice(i0).filter((e) => e.t >= t0 - 1 && e.t <= t1 + 1);
  const secs = (t1 - t0) / 1000;
  const rec = {
    group, name, rate: RATE, wallMs: r1(t1 - t0), syncMs: r1(syncMs), settledMs: settledAt ? r1(settledAt - t0) : null,
    main: { eldMaxMs: r1(eldMax), eldP99Ms: r1(eldP99), cpuMs: r1((cpu.user + cpu.system) / 1000), cpuPct: r1((cpu.user + cpu.system) / 1000 / (t1 - t0) * 100) },
    cdp: { popout: watch.popout === watch2.popout ? mdelta(before.popout, after.popout) : null, tab: watch.tab === watch2.tab ? mdelta(before.tab, after.tab) : null, frame: watch.frame === watch2.frame ? mdelta(before.frame, after.frame) : null },
    video: vq0 && vq1 ? { presented: vq1.total - vq0.total, dropped: vq1.dropped - vq0.dropped, fps: r1((vq1.total - vq0.total) / secs), paused: vq1.paused, size: `${vq1.w}x${vq1.h}` } : null,
    procCpu, ev: evSum(list), pages, trace, extra: o.extra?.(t0, list) ?? null,
  };
  results.push(rec);
  const pc = rec.cdp.popout, tc = rec.cdp.tab, tr = trace;
  console.log(`${group.padEnd(9)} ${name.padEnd(40)} settled ${String(rec.settledMs ?? '-').padStart(7)} sync ${String(rec.syncMs).padStart(5)} | pop style ${pc?.styleMs ?? '-'}/${pc?.styleN ?? '-'} layout ${pc?.layoutMs ?? '-'}/${pc?.layoutN ?? '-'} task ${pc?.taskMs ?? '-'} | tab layout ${tc?.layoutMs ?? '-'}/${tc?.layoutN ?? '-'} task ${tc?.taskMs ?? '-'} | main busy ${tr?.main?.busyMs ?? '-'} eld ${rec.main.eldMaxMs} | gpu busy ${tr?.gpu?.busyMs ?? '-'} | os ${procCpu ? Object.entries(procCpu).map(([k, v]: any) => k + ' ' + v.pctOfCore + '%').join(' ') : '-'} | vid ${rec.video ? rec.video.presented + '/' + rec.video.dropped : '-'} | vb ${rec.ev.viewBounds} ipc ${JSON.stringify(rec.ev.ipcIn)}`);
  return rec;
}
function writeResults(status: string) {
  writeFileSync(path.join(OUT, `popout-${RATE}x.json`), JSON.stringify({ status, rate: RATE, at: new Date().toISOString(), env: {
    electron: process.versions.electron, chrome: process.versions.chrome, cpu: os.cpus()[0]?.model, cores: os.cpus().length,
    scale: screen.getPrimaryDisplay().scaleFactor, hz: (screen.getPrimaryDisplay() as any).displayFrequency,
  }, notes, results }, null, 1));
}

// ------------------------------------------------------------------ the run
app.whenReady().then(async () => {
  (screen as any).getCursorScreenPoint = () => pointer;
  if (!existsSync(CLIP)) throw new Error('missing ' + CLIP);
  const WATCH = `<!doctype html><html><head><title>Watch: test clip</title><style>body{margin:0;font:14px system-ui;background:#fff}header{height:56px;background:#eee}
    .cols{display:flex;gap:16px;padding:16px}.html5-video-player{width:854px;height:480px;position:relative;background:#000}video{width:100%;height:100%}
    .ytp-chrome-bottom{position:absolute;left:0;right:0;bottom:0;height:40px;background:linear-gradient(transparent,#0008);color:#fff}aside{width:380px}aside div{height:90px;margin-bottom:8px;background:#f2f2f2}</style></head>
    <body><header>site header</header><div class="cols"><div><div class="html5-video-player"><video src="/clip.webm" autoplay muted loop playsinline></video><div class="ytp-chrome-bottom">controls</div></div><h1>Test clip</h1></div>
    <aside>${'<div>Up next</div>'.repeat(12)}</aside></div></body></html>`;
  const size = statSync(CLIP).size;
  const site = http.createServer((q, r) => {
    const u = q.url ?? '/';
    if (u.startsWith('/clip.webm')) {
      const m = /bytes=(\d+)-(\d*)/.exec(String(q.headers.range ?? ''));
      if (m) { const a = Number(m[1]), z = m[2] ? Number(m[2]) : size - 1; r.writeHead(206, { 'Content-Type': 'video/webm', 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${a}-${z}/${size}`, 'Content-Length': z - a + 1 }); createReadStream(CLIP, { start: a, end: z }).pipe(r); }
      else { r.writeHead(200, { 'Content-Type': 'video/webm', 'Accept-Ranges': 'bytes', 'Content-Length': size }); createReadStream(CLIP).pipe(r); }
      return;
    }
    r.writeHead(200, { 'Content-Type': 'text/html' }).end(WATCH);
  });
  await new Promise<void>((res) => site.listen(PORT, '127.0.0.1', () => res()));
  const url = (x: string) => `http://127.0.0.1:${PORT}${x}`;
  const { servePages } = await import('../../src/pageserver.ts');
  const { Popout } = await import('../../src/popout.ts');
  const { wirePopout } = await import('../../src/popoutipc.ts');
  const { readSettings } = await import('../../src/settings.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const stateDir = mkdtempSync(path.join(os.tmpdir(), 'popout-perf-state-'));
  if (existsSync(path.join(CACHE, 'adblock'))) { cpSync(path.join(CACHE, 'adblock'), path.join(stateDir, 'adblock'), { recursive: true }); cpSync(path.join(CACHE, 'phish'), path.join(stateDir, 'phish'), { recursive: true }); }
  const settings = { ...readSettings(stateDir), alwaysOnTop: true, clickThrough: false, fadeControls: true };
  let remembered = 0;
  p = new Popout({ pages, preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'), settings: () => settings,
    remembered: () => ({ x: 200, y: 200, width: 640, height: 434 }), remember: () => { remembered++; evs.push({ t: ep(), k: 'remember' }); } });
  // Samara, through its real wiring (lend / giveBack). If browser.ts does not load (another session may be mid-edit),
  // fall back to a plain view lent straight to the pop-out.
  let viaBrowser = true;
  try {
    const { AangBrowser } = await import('../../src/browser.ts');
    const { wireBrowser } = await import('../../src/browseripc.ts');
    b = new AangBrowser({ origin: pages.origin, stateDir, preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
      tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs') } as any);
    wireBrowser(() => b);
    b.open(url('/watch'));
  } catch (e) { viaBrowser = false; notes.push('browser.ts did not load, plain view used: ' + (e as Error).message); console.log('NO BROWSER ' + (e as Error).message); }
  wirePopout({ popout: () => p, browser: () => b, open: () => false, stopPaid: () => {}, sendToOther: () => {}, paidSeparately: () => false, openOnOther: () => {} });
  // The page's test segments (skip plaque) are sent straight from here, as popout.ts sendSegments would.
  if (viaBrowser) {
    await until(() => Boolean(b.cur()?.view && !b.cur().loading), 20_000, 50);
    tabView = b.cur().view;
  } else {
    tabView = new WebContentsView(); await tabView.webContents.loadURL(url('/watch'));
  }
  await wait(2500);
  const tw = tabWc()!;
  // Played as he would: sound on in the page (a click, so not Chromium's muted-autoplay, which pauses when hidden),
  // but the tab's audio output muted by Electron so nothing reaches his speakers.
  tw.setAudioMuted(true);
  await tw.executeJavaScript('/*perf*/(() => { const v = document.querySelector("video"); v.muted = false; v.volume = 1; return v.play().then(() => true, (e) => String(e)); })()', true).then((x: unknown) => notes.push('play(): ' + x));
  await wait(1500);
  console.log('video ' + JSON.stringify(await vq()) + ' viaBrowser ' + viaBrowser + ' pids ' + JSON.stringify(pidsNow()));
  const tabId: number | null = viaBrowser ? b.cur().id : null;

  // ---- 0) baseline: the same video playing in Samara, no pop-out (15 s)
  if (viaBrowser) await measure('0-base', 'idle 15 s: playing in Samara (no pop-out)', () => wait(15_000), { tail: 0, rec: () => [], cpu: true });

  // ---- 1) open from a tab (lend) and give back (close), 3 cycles
  const lentNow = () => Boolean(p.lent);
  const popVisible = () => Boolean(p.window?.isVisible());
  const bare = () => evs.some((e) => e.k === 'execjs' && e.to === 'tab' && e.res === true && String(e.arg).startsWith('(() => { const vs'));
  const openMs = (t0: number, list: Ev[]) => {
    const at = (f: (e: Ev) => boolean) => { const e = list.find(f); return e ? r1(e.t - t0) : null; };
    return {
      browserPopoutIpc: at((e) => e.k === 'ipc' && e.ch === 'browser:popout'), removedFromSamara: at((e) => e.k === 'removeChild'),
      winCreated: at((e) => e.k === 'created'), shown: at((e) => e.k === 'showInactive'), spawnSoftEdge: at((e) => e.k === 'spawn'),
      popoutLoaded: at((e) => e.k === 'load' && e.to === 'popout'), firstStage: at((e) => e.k === 'ipc' && e.ch === 'popout:stage'), chrome: at((e) => e.k === 'ipc' && e.ch === 'popout:chrome'),
      bareCss: at((e) => e.k === 'insertCSS'), focusOk: at((e) => e.k === 'execjs' && e.to === 'tab' && e.res === true && String(e.arg).startsWith('(() => { const vs')),
      firstTabstate: at((e) => e.k === 'send' && e.ch === 'popout:tabstate'), focusTries: list.filter((e) => e.k === 'execjs' && String(e.arg).startsWith('(() => { const vs')).length,
    };
  };
  const closeMs = (t0: number, list: Ev[]) => {
    const at = (f: (e: Ev) => boolean) => { const e = list.find(f); return e ? r1(e.t - t0) : null; };
    return { closeIpc: at((e) => e.k === 'ipc' && e.ch === 'popout:close'), unpin: at((e) => e.k === 'execjs' && String(e.arg).startsWith('(() => { document.documentElement.classList.remove')),
      backInSamara: at((e) => e.k === 'addChild'), activated: at((e) => e.k === 'setVisible') };
  };
  const doOpen = async () => {
    if (viaBrowser) await frameWc()!.executeJavaScript(`/*perf*/window.aang.browserPopout(${tabId}); true`, true);
    else p.openTab(tabView, { url: url('/watch'), title: 'Watch', label: 'LOCAL' }, () => {});
  };
  const samaraHasTab = () => { const t = b?.tabs.find((x: any) => x.id === tabId); return Boolean(t && !t.lent && t.view && b.win.contentView.children.includes(t.view) && t.view.getVisible()); };
  for (let i = 0; i < 3; i++) {
    evs.length = 0;
    await measure('1-open', `open from tab (lend) #${i + 1}`, doOpen, { settle: () => popVisible() && lentNow() && bare() && evs.some((e) => e.k === 'send' && e.ch === 'popout:tabstate'), settleMs: 15_000, tail: 600, rec: () => [frameWc(), tabWc()], keepTrace: i === 0, extra: openMs, cpu: true });
    await wait(3000);
    if (i < 2) {
      await measure('1-open', `close (give back) #${i + 1}`, () => px("document.getElementById('close').click(); true"), { settle: () => !p.window && (!viaBrowser || samaraHasTab()), settleMs: 5000, tail: 400, rec: () => [frameWc(), tabWc()], extra: closeMs });
      await wait(1500);
    }
  }
  const W = () => p.window as BrowserWindow;
  console.log('popout bounds ' + JSON.stringify(W().getBounds()) + ' stage ' + JSON.stringify(p.stage) + ' video ' + JSON.stringify(await vq()));
  await wait(3000);
  const faded = () => px("document.getElementById('frame').classList.contains('faded')");

  // ---- 2) idle while the video plays (controls faded, pointer away)
  await until(faded, 5000, 50);
  await measure('2-idle', 'idle 15 s: pop-out playing, controls faded', () => wait(15_000), { tail: 0, rec: () => [], cpu: true, keepTrace: true });

  // ---- 3) controls: wake (pointer moves over the window) and fade out after 2 s
  const inWin = () => { const bb = W().getBounds(); return { x: bb.x + 100, y: bb.y + 100 }; };
  for (let i = 0; i < 3; i++) {
    await until(faded, 5000, 50); await wait(500);
    pointer = inWin();
    await measure('3-fade', 'wake: pointer moves over (cursor poll)', () => { const q = inWin(); pointer = { x: q.x + 40, y: q.y + 20 }; }, { settle: async () => !(await faded()), settleMs: 2000, tail: 300, rec: () => [popWc(), tabWc()],
      extra: (t0, list) => ({ wakeSend: (() => { const e = list.find((x) => x.k === 'send' && x.ch === 'popout:wake'); return e ? r1(e.t - t0) : null; })() }) });
    pointer = { x: -20000, y: 500 };
    await measure('3-fade', 'fade out (2 s after the last move)', () => wait(0), { settle: faded, settleMs: 4000, tail: 600, rec: () => [popWc(), tabWc()] });
  }
  // What the eye sees during the fade: the bar's height and opacity right after "faded" is set.
  const fadeLook = await px(`(async () => { const f = document.getElementById('frame'); f.classList.remove('faded'); await new Promise(r => setTimeout(r, 400));
    const bar = document.querySelector('.bar'); const h0 = bar.getBoundingClientRect().height; f.classList.add('faded'); const h1 = bar.getBoundingClientRect().height;
    await new Promise(r => setTimeout(r, 100)); const o = getComputedStyle(bar).opacity; const h2 = bar.getBoundingClientRect().height; return { barHeightBefore: h0, barHeightRightAfter: h1, barHeightAt100ms: h2, barOpacityAt100ms: o, rows: getComputedStyle(f).gridTemplateRows }; })()`);
  results.push({ group: 'probe', name: 'what the fade looks like', rate: RATE, ...fadeLook });
  console.log('fade look ' + JSON.stringify(fadeLook));

  // ---- 4) resize (20 steps out and back, 16 ms apart, as a drag would)
  const resize = async (label: string, wake: boolean) => {
    await until(faded, 5000, 50); await wait(400);
    const b0 = W().getBounds();
    await measure('4-resize', label, async () => {
      for (let i = 1; i <= 20; i++) { W().setBounds({ x: b0.x, y: b0.y, width: b0.width + i * 16, height: b0.height + i * 9 }); if (wake) { const bb = W().getBounds(); pointer = { x: bb.x + bb.width - 2, y: bb.y + bb.height - 2 - (i % 2) * 8 }; } await wait(16); }
      for (let i = 19; i >= 0; i--) { W().setBounds({ x: b0.x, y: b0.y, width: b0.width + i * 16, height: b0.height + i * 9 }); if (wake) { const bb = W().getBounds(); pointer = { x: bb.x + bb.width - 2, y: bb.y + bb.height - 2 - (i % 2) * 8 }; } await wait(16); }
    }, { tail: 700, rec: () => [popWc(), tabWc()], keepTrace: !wake, cpu: true, extra: () => ({ remembered }) });
    pointer = { x: -20000, y: 500 };
  };
  await resize('40 steps, controls faded', false);
  await resize('40 steps, pointer on the corner (controls wake)', true);

  // ---- 5) see-through slider drag (30 moves), then back to 100 %
  {
    pointer = inWin(); await wait(400); pointer = { x: pointer.x + 30, y: pointer.y }; await wait(400); pointer = { x: -20000, y: 500 };
    const r = await px(`(() => { document.getElementById('frame').classList.remove('faded'); const r = document.getElementById('see').getBoundingClientRect(); return { x: r.left, y: r.top + r.height / 2, w: r.width }; })()`);
    const pw = popWc()!;
    const drag = async (from: number, to: number, steps: number) => {
      from = Math.min(0.97, Math.max(0.03, from));
      pw.sendInputEvent({ type: 'mouseDown', x: Math.round(r.x + r.w * from), y: Math.round(r.y), button: 'left', clickCount: 1 });
      for (let i = 1; i <= steps; i++) { pw.sendInputEvent({ type: 'mouseMove', x: Math.round(r.x + r.w * (from + (to - from) * i / steps)), y: Math.round(r.y), button: 'left' } as any); await wait(16); }
      pw.sendInputEvent({ type: 'mouseUp', x: Math.round(r.x + r.w * to), y: Math.round(r.y), button: 'left', clickCount: 1 });
    };
    await measure('5-see', 'drag 100% -> 50% (30 moves, first time)', () => drag(1, 0.375, 30), { tail: 500, rec: () => [popWc(), tabWc()], cpu: true });
    await wait(800);
    await measure('2-idle', 'idle 15 s: see-through 60%, controls faded', async () => { await until(faded, 5000, 50); await wait(15_000); }, { tail: 0, rec: () => [], cpu: true });
    await px(`document.getElementById('frame').classList.remove('faded'); true`);
    await measure('5-see', 'drag 60% -> 100% (30 moves)', () => drag(0.5, 1, 30), { tail: 500, rec: () => [popWc(), tabWc()], cpu: true });
    console.log('opacity now ' + W().getOpacity());
  }

  // ---- 6) pin / unpin (Ctrl+Alt+P path, called directly)
  for (let i = 0; i < 2; i++) {
    await until(faded, 5000, 50); await wait(300);
    await measure('6-pin', 'pin (incl. the 2 s message and re-fade)', () => p.togglePin(), { tail: 2600, rec: () => [popWc(), tabWc()] });
    await wait(500);
    await measure('6-pin', 'unpin (incl. the 2 s message and re-fade)', () => p.togglePin(), { tail: 2600, rec: () => [popWc(), tabWc()] });
    await wait(500);
  }

  // ---- 7) hide / show (the hotkey's function, called directly), and the cost while hidden
  await measure('7-hide', 'hide', () => p.toggleHidden(), { settle: () => !p.window.isVisible(), tail: 300, rec: () => [] });
  console.log('hidden: ' + JSON.stringify(await vq()));
  await measure('2-idle', 'idle 15 s: pop-out HIDDEN, video still playing', () => wait(15_000), { tail: 0, rec: () => [], cpu: true });
  await measure('7-hide', 'show', () => p.toggleHidden(), { settle: () => p.window.isVisible(), tail: 600, rec: () => [popWc(), tabWc()] });

  // ---- 8) skip plaque (a segment that starts a moment from now)
  {
    await wait(1500);
    const v = await vq();
    const from = Math.min(9, Math.floor((v?.t ?? 0) + 1.5) % 12) || 1;
    await measure('8-skip', 'plaque shows and hides (3 s)', async () => { popWc()!.send('popout:segments', [{ from, to: from + 2, says: 'intro' }]); }, { settle: () => evs.some((e) => e.k === 'execjs' && String(e.arg).startsWith('(()=>{const v=window.__aangVideo')), settleMs: 13_000, tail: 3600, rec: () => [popWc(), tabWc()] });
  }

  // ---- 9) diag (the Mac's "look from the PC": 2 capturePage + JPEG), the only capturePage in popout.ts
  await measure('9-diag', 'diag() (2 x capturePage + JPEG)', () => p.diag(), { tail: 200, rec: () => [popWc(), tabWc()] });

  // ---- 10) idle variants
  settings.fadeControls = false; p.applySettings(settings); await wait(800);
  await measure('2-idle', 'idle 15 s: controls always shown (fade off)', () => wait(15_000), { tail: 0, rec: () => [], cpu: true });
  settings.fadeControls = true; p.applySettings(settings); await wait(2800);
  await tw.executeJavaScript('/*perf*/document.querySelector("video").pause(); true', true); await wait(1200);
  await measure('2-idle', 'idle 15 s: pop-out, video PAUSED', () => wait(15_000), { tail: 0, rec: () => [], cpu: true });
  await tw.executeJavaScript('/*perf*/document.querySelector("video").play(); true', true); await wait(2800);
  console.log('after resume ' + JSON.stringify(await vq()));
  // A/B: the two main-process timers (state poll every 500 ms, cursor poll every 150 ms) stopped.
  { const l = p.lent; if (l) { clearInterval(l.poll); clearInterval(l.cursor); } }
  await until(faded, 5000, 50);
  await measure('2-idle', 'idle 15 s: A/B, both pop-out timers stopped', () => wait(15_000), { tail: 0, rec: () => [], cpu: true });
  // A/B: only the state poll back (no cursor poll), to split the two.
  {
    const l = p.lent; const wc = tabView!.webContents;
    if (l) l.poll = setInterval(() => { void wc.executeJavaScript(`(() => { const v = window.__aangVideo; if (!v || !v.isConnected) { return null; } return { at: v.currentTime, length: v.duration, paused: v.paused, volume: v.volume, muted: v.muted }; })()`, true).then((s: any) => { if (s) p.window?.webContents.send('popout:tabstate', { at: s.at, length: s.length, playing: !s.paused, volume: s.volume, muted: s.muted, live: false }); }); }, 500);
  }
  await measure('2-idle', 'idle 15 s: A/B, state poll only', () => wait(15_000), { tail: 0, rec: () => [], cpu: true });

  // ---- static facts from the live pop-out page
  const facts = await px(`(() => {
    const all = [...document.styleSheets].flatMap((s) => { try { return [...s.cssRules]; } catch { return []; } });
    const sel = all.filter((r) => r.selectorText).map((r) => r.selectorText);
    const anims = document.getAnimations().map((a) => ({ name: a.animationName || a.transitionProperty || a.constructor.name, play: a.playState }));
    return { rules: all.length, has: sel.filter((s) => s.includes(':has(')).length, universal: sel.filter((s) => /(^|[\\s>+~,])\\*/.test(s)).length, nodes: document.getElementsByTagName('*').length, anims };
  })()`);
  results.push({ group: 'static', name: 'pop-out DOM/CSS facts', rate: RATE, ...facts });
  console.log('facts ' + JSON.stringify(facts));
  writeResults('ok');
  console.log(`DONE  results: ${path.join(OUT, `popout-${RATE}x.json`)}`);
  try { p.close(); b?.closeAll?.(); } catch { /* exiting */ }
  setTimeout(() => app.exit(0), 300);
}).catch((e) => { console.log('HARNESS FAILED ' + String((e as Error)?.stack ?? e).split('\n').slice(0, 4).join(' | ')); try { writeResults('failed'); } catch { /* none */ } app.exit(2); });

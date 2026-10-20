// Samara performance baseline (2026-10-20). MEASUREMENT ONLY: nothing in src/ or pages/ is changed.
// Drives Samara's own windows (placed off screen) through the same calls and clicks its buttons use, and records for
// each interaction: renderer metrics over CDP (Performance.getMetrics), a Chromium trace (contentTracing, parsed for
// long tasks and the busiest work per process), the main process's time and event-loop delay, every IPC message and
// every view.setBounds / setVisible / capturePage, and frame times from a requestAnimationFrame recorder in the page.
// Never sends input to the desktop: only webContents.sendInputEvent / executeJavaScript inside Samara's own views.
//
// Run (from src/Shell):  npx electron test/electron/perf-trace.ts                 normal CPU
//                        PERF_RATE=4 npx electron test/electron/perf-trace.ts     every renderer throttled 4x (CDP)
// Results: test/electron/perf-out/results-<rate>x.json. Traces kept: %TEMP%\samara-perf-traces\<rate>x\.
import { app, BrowserWindow, View, WebContentsView, contentTracing, nativeImage, screen } from 'electron';
import http from 'node:http';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';

const RATE = Math.max(1, Number(process.env.PERF_RATE) || 1);
const PORT = 47931;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'perf-out');
const TRACES = path.join(os.tmpdir(), 'samara-perf-traces', `${RATE}x`);
const CACHE = path.join(os.tmpdir(), 'samara-perf-cache');
mkdirSync(OUT, { recursive: true }); mkdirSync(TRACES, { recursive: true });

// Never Aang's own folders: the browser's session and caches live in a throwaway folder.
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'samara-perf-ud-')));
// The window sits off screen; without this Windows reports it occluded and Chromium stops drawing it, which the real
// (visible) window never does.
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

let finished = false;
process.on('uncaughtException', (e) => { console.log('HARNESS NOTE ' + String((e as Error)?.message ?? e).split('\n')[0]); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e).split('\n').slice(0, 3).join(' | ')); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); try { writeResults('timeout'); } catch { /* best effort */ } app.exit(3); }, 1_500_000).unref();
app.on('window-all-closed', () => { /* the harness decides */ });
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.showInactive(); };
BrowserWindow.prototype.focus = function () { /* never in a test */ };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ep = () => performance.timeOrigin + performance.now();
const r1 = (n: number) => Math.round(n * 10) / 10;

// ------------------------------------------------------------------ the event log (main process side)
type Ev = { t: number; k: string; ch?: string; to?: string; bytes?: number; ms?: number; arg?: string; id?: number };
const evs: Ev[] = [];
function kindOf(wc: any): string {
  try {
    if (!wc || wc.isDestroyed()) return 'gone';
    const u: string = wc.getURL() || '';
    if (u.includes('browser.html?tray')) return 'tray';
    if (u.includes('browser.html')) return 'frame';
    if (u.includes('curtain.html')) return 'curtain';
    if (u.includes('settings.html')) return 'settings';
    if (u.includes('things.html')) return 'things';
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
    scripts: (e.scripts || []).map((s) => ({ src: String(s.sourceURL || '').split('/').pop().split('?')[0], pos: s.sourceCharPosition, fn: s.sourceFunctionName, inv: String(s.invoker || '').slice(0, 60), dur: Math.round(s.duration), forced: Math.round(s.forcedStyleAndLayoutDuration || 0) })) }); }).observe({ type: 'long-animation-frame' }); } catch {}
  try { new PerformanceObserver((l) => { if (on) for (const e of l.getEntries()) lt.push(e.duration); }).observe({ type: 'longtask' }); } catch {}
  const loop = (ts) => { if (!on) return; frames.push(performance.timeOrigin + ts); requestAnimationFrame(loop); };
  window.__perf = {
    start() { frames = []; muts = 0; lastMut = 0; loaf = []; lt = []; on = true; requestAnimationFrame(loop); return true; },
    stop() { on = false; return { frames, muts, lastMut, loaf, lt, vis: document.visibilityState, nodes: document.getElementsByTagName('*').length }; },
  };
  return true;
})()`;

const dbgReady = new WeakSet<object>();
async function attachDbg(wc: Electron.WebContents): Promise<void> {
  try {
    if (wc.isDestroyed()) return;
    if (!wc.debugger.isAttached()) wc.debugger.attach('1.3');
    await wc.debugger.sendCommand('Performance.enable', { timeDomain: 'timeTicks' });
    if (RATE > 1) await wc.debugger.sendCommand('Emulation.setCPUThrottlingRate', { rate: RATE });
    dbgReady.add(wc);
  } catch { /* retried at the next navigation */ }
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
    if (!(typeof code === 'string' && code.startsWith('/*perf*/'))) { const done = () => evs.push({ t: s, k: 'execjs', to: kindOf(wc), ms: ep() - s, arg: String(code).slice(0, 48), id: wc.id }); p.then(done, done); }
    return p;
  };
  const iso0 = wc.executeJavaScriptInIsolatedWorld.bind(wc);
  (wc as any).executeJavaScriptInIsolatedWorld = (...a: any[]) => { const s = ep(); const p = (iso0 as any)(...a); const done = () => evs.push({ t: s, k: 'execiso', to: kindOf(wc), ms: ep() - s, id: wc.id }); p.then(done, done); return p; };
  wc.on('ipc-message', (_e2, ch, ...a: any[]) => evs.push({ t: ep(), k: 'ipc', ch, to: kindOf(wc), id: wc.id, arg: ch === 'browser:act' ? String(a[0]) : ch === 'browser:tab' || ch === 'browser:tray' ? JSON.stringify(a[0]).slice(0, 40) : undefined }));
  wc.on('ipc-message-sync', (_e2, ch) => evs.push({ t: ep(), k: 'ipc', ch, to: kindOf(wc), id: wc.id }));
  wc.on('did-finish-load', () => {
    evs.push({ t: ep(), k: 'load', to: kindOf(wc), id: wc.id });
    const kind = kindOf(wc);
    if (['frame', 'tray', 'settings', 'things', 'curtain'].includes(kind)) void wc.executeJavaScript(REC, true).catch(() => {});
  });
  wc.on('did-stop-loading', () => evs.push({ t: ep(), k: 'stop', to: kindOf(wc), id: wc.id }));
  wc.on('did-navigate', () => { if (!dbgReady.has(wc)) void attachDbg(wc); else if (RATE > 1) void wc.debugger.sendCommand('Emulation.setCPUThrottlingRate', { rate: RATE }).catch(() => {}); });
  wc.on('dom-ready', () => { if (!dbgReady.has(wc)) void attachDbg(wc); });
  void attachDbg(wc);
});
// Native view work: every placement, show/hide and re-stacking of a view, with its main-thread cost.
for (const proto of [View.prototype, WebContentsView.prototype] as any[]) {
  for (const [name, k] of [['setBounds', 'setBounds'], ['setVisible', 'setVisible'], ['addChildView', 'addChild'], ['removeChildView', 'removeChild'], ['setBorderRadius', 'radius']]) {
    if (!Object.prototype.hasOwnProperty.call(proto, name) || typeof proto[name] !== 'function') continue;
    const o = proto[name];
    proto[name] = function (this: unknown, ...a: unknown[]) { const s = performance.now(); try { return o.apply(this, a); } finally { evs.push({ t: ep(), k, ms: performance.now() - s }); } };
  }
}
{
  const BW: any = BrowserWindow.prototype;
  for (const [name, k] of [['setTitle', 'setTitle'], ['setIcon', 'setIcon'], ['setBounds', 'winBounds']]) {
    const o = BW[name]; if (typeof o !== 'function') continue;
    BW[name] = function (this: unknown, ...a: unknown[]) { const s = performance.now(); try { return o.apply(this, a); } finally { evs.push({ t: ep(), k, ms: performance.now() - s }); } };
  }
}
app.whenReady().then(() => {
  const NI: any = Object.getPrototypeOf(nativeImage.createEmpty());
  for (const name of ['toJPEG', 'toPNG', 'resize', 'toDataURL', 'toBitmap']) {
    const o = NI[name]; if (typeof o !== 'function') continue;
    NI[name] = function (this: unknown, ...a: unknown[]) { const s = performance.now(); try { return o.apply(this, a); } finally { evs.push({ t: ep(), k: 'img', arg: name, ms: performance.now() - s }); } };
  }
});

// ------------------------------------------------------------------ test pages, served from this computer
const svg = (i: number) => `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"><rect width="160" height="90" fill="hsl(${(i * 37) % 360},55%,60%)"/><circle cx="${20 + (i * 13) % 120}" cy="45" r="28" fill="#fff8"/><text x="8" y="80" font-size="14">${i}</text></svg>`;
const LOREM = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. ';
function simplePage(n: number): string {
  let s = `<!doctype html><html><head><title>Page ${n}</title><link rel="icon" href="/fav.svg"><style>body{font:15px system-ui;margin:24px;max-width:900px;background:#fff;color:#222}a{color:#06c;margin-right:10px}p{line-height:1.5}</style></head><body><h1>Page ${n}</h1><nav>`;
  for (let i = 0; i < 40; i++) s += `<a href="/p/${(i % 6) + 1}?from=${n}&i=${i}">link ${i}</a>`;
  s += '</nav>';
  for (let i = 0; i < 30; i++) s += `<p>${LOREM}${LOREM}</p>`;
  return s + '</body></html>';
}
function heavyPage(): string {
  let s = `<!doctype html><html><head><title>Heavy page</title><link rel="icon" href="/fav.svg"><style>
body{font:14px system-ui;margin:0;background:#f4f4f6;color:#222}.hdr{position:sticky;top:0;z-index:2;background:#eef;padding:10px;box-shadow:0 2px 6px #0003}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;padding:12px}.card{padding:10px;border-radius:10px;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.18)}
.card img{width:100%;height:auto;border-radius:6px}table{border-collapse:collapse;margin:12px}td{border:1px solid #ccc;padding:2px 6px}li:nth-child(odd){background:#f8f8ff}</style></head><body><div class="hdr">Heavy page <a href="/p/1">home</a></div><div class="grid">`;
  for (let i = 0; i < 300; i++) s += `<div class="card"><h3>Card ${i}</h3><img src="/img/${i % 80}.svg" width="160" height="90" alt=""><p>${LOREM.slice(0, 160 + (i % 5) * 20)}</p><a href="/p/${(i % 6) + 1}">read</a> <a href="/long">more</a> <a href="/heavy?${i}">again</a></div>`;
  s += '</div><table>';
  for (let r = 0; r < 400; r++) { s += '<tr>'; for (let c = 0; c < 8; c++) s += `<td>${r}.${c} ${LOREM.slice(c * 6, c * 6 + 12)}</td>`; s += '</tr>'; }
  s += `</table><ul id="list"></ul><script>
addEventListener('DOMContentLoaded', () => { const ul = document.getElementById('list'); const f = document.createDocumentFragment();
  for (let i = 0; i < 1500; i++) { const li = document.createElement('li'); li.textContent = 'Item ' + i + ' ' + ${JSON.stringify(LOREM.slice(0, 60))}; f.append(li); }
  ul.append(f); document.title = 'Heavy page (' + ul.offsetHeight + ')'; });
</script></body></html>`;
  return s;
}
function longPage(): string {
  let s = `<!doctype html><html><head><title>Long page</title><link rel="icon" href="/fav.svg"><style>body{font:16px Georgia,serif;margin:0 auto;max-width:820px;padding:20px;background:#fffdf8;color:#222}
h2{margin-top:40px}.fig{display:flex;gap:12px;align-items:center;padding:8px;border-radius:8px;box-shadow:0 1px 4px #0002}aside{position:sticky;top:0;background:#fffdf8ee;padding:6px;border-bottom:1px solid #ccc}</style></head><body><aside>Long page: <a href="/p/1">p1</a> <a href="/p/2">p2</a></aside>`;
  for (let i = 0; i < 260; i++) s += `<h2>Section ${i}</h2><p>${LOREM}${LOREM}${LOREM}</p><div class="fig"><img src="/img/${i % 80}.svg" width="160" height="90" alt=""><span>${LOREM.slice(0, 120)} <a href="/p/${(i % 6) + 1}">link</a> <a href="/heavy">heavy</a></span></div><p>${LOREM}${LOREM}</p>`;
  return s + '</body></html>';
}
const HEAVY = heavyPage(), LONG = longPage();
const FAV = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#c60"/></svg>';
const ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAKUlEQVR42mNgGAWjYBSMglEwCkYBNQEjI+N/ZPGcOXP+M9DMBaNgFIwCAAy0BBF4Il+FAAAAAElFTkSuQmCC';
const url = (p: string) => `http://127.0.0.1:${PORT}${p}`;

// ------------------------------------------------------------------ measuring
const results: any[] = [];
const notes: string[] = [];
const eld = monitorEventLoopDelay({ resolution: 1 });
eld.enable();
const TRACE_CFG: any = {
  included_categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame', 'toplevel', 'benchmark', 'v8.execute', 'blink.user_timing'],
  excluded_categories: ['*'], recording_mode: 'record-until-full', trace_buffer_size_in_kb: 800000,
};
let b: any = null;
const frameWc = (): Electron.WebContents | null => { const w = b?.win; return w && !w.isDestroyed() ? w.webContents : null; };
const trayWc = (): Electron.WebContents | null => { const v = b?.trayV; return v && !v.webContents.isDestroyed() ? v.webContents : null; };
const curWc = (): Electron.WebContents | null => { const c = b?.curtain; return c && !c.webContents.isDestroyed() ? c.webContents : null; };
const cur = () => b?.cur();
const tabWc = (): Electron.WebContents | null => { const w = cur()?.view?.webContents; return w && !w.isDestroyed() ? w : null; };
const fx = (code: string) => frameWc()!.executeJavaScript('/*perf*/' + code, true);
const alive = (w: Electron.WebContents | null | undefined): w is Electron.WebContents => Boolean(w && !w.isDestroyed());
async function until(cond: () => boolean, ms = 8000, step = 4): Promise<number | null> {
  const end = Date.now() + ms;
  while (Date.now() < end) { try { if (cond()) return ep(); } catch { /* not yet */ } await wait(step); }
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
    styleN: (z.RecalcStyleCount ?? 0) - (a.RecalcStyleCount ?? 0), layoutN: (z.LayoutCount ?? 0) - (a.LayoutCount ?? 0), nodes: z.Nodes, heapMB: r1((z.JSHeapUsedSize ?? 0) / 1e6) };
}
async function recStart(wc: Electron.WebContents | null) { if (!alive(wc)) return; try { await wc.executeJavaScript(`${REC};/*perf*/window.__perf.start()`, true); } catch { /* not ready */ } }
async function recStop(wc: Electron.WebContents | null): Promise<any> { if (!alive(wc)) return null; try { return await wc.executeJavaScript('/*perf*/window.__perf ? window.__perf.stop() : null', true); } catch { return null; } }
function pageSum(p: any, t0: number) {
  if (!p) return null;
  const f: number[] = (p.frames ?? []).filter((x: number) => x >= t0 - 20);
  const iv = f.slice(1).map((x, i) => x - f[i]!);
  const sorted = [...iv].sort((a, z) => a - z);
  const loaf = (p.loaf ?? []).filter((x: any) => x.at >= t0 - 20).sort((a: any, z: any) => z.dur - a.dur);
  return {
    frames: f.length, maxFrameMs: r1(sorted.at(-1) ?? 0), p95FrameMs: r1(sorted[Math.floor(sorted.length * 0.95)] ?? 0),
    janky: iv.filter((x) => x > 50).length, dropped: iv.reduce((a, x) => a + Math.max(0, Math.round(x / 16.67) - 1), 0),
    muts: p.muts, lastMutMs: p.lastMut ? r1(p.lastMut - t0) : null, longTasks: (p.lt ?? []).length, longTaskMax: r1(Math.max(0, ...(p.lt ?? [0]))),
    loafN: loaf.length, loafMs: r1(loaf.reduce((a: number, x: any) => a + x.dur, 0)),
    loafTop: loaf.slice(0, 3).map((x: any) => ({ dur: r1(x.dur), block: r1(x.block), styleLayout: r1(x.styleLayout), scripts: x.scripts.slice(0, 3) })),
    vis: p.vis, nodes: p.nodes,
  };
}
function evSum(list: Ev[]) {
  const n = (k: string, f: (e: Ev) => boolean = () => true) => list.filter((e) => e.k === k && f(e)).length;
  const ms = (k: string, f: (e: Ev) => boolean = () => true) => r1(list.filter((e) => e.k === k && f(e)).reduce((a, e) => a + (e.ms ?? 0), 0));
  const sends: Record<string, number> = {};
  for (const e of list) if (e.k === 'send') sends[`${e.ch}>${e.to}`] = (sends[`${e.ch}>${e.to}`] ?? 0) + 1;
  const ins: Record<string, number> = {};
  for (const e of list) if (e.k === 'ipc') { const key = `${e.ch}${e.arg ? '(' + e.arg + ')' : ''}<${e.to}`; ins[key] = (ins[key] ?? 0) + 1; }
  const tabs = list.filter((e) => e.k === 'send' && e.ch === 'browser:tabs');
  return {
    tabsMsgs: tabs.length, tabsKB: r1(tabs.reduce((a, e) => a + (e.bytes ?? 0), 0) / 1024), sendKB: r1(list.filter((e) => e.k === 'send').reduce((a, e) => a + Math.max(0, e.bytes ?? 0), 0) / 1024),
    sends, ipcIn: ins,
    setBounds: n('setBounds'), setVisible: n('setVisible'), addChild: n('addChild'), viewMs: r1(ms('setBounds') + ms('setVisible') + ms('addChild')),
    setTitle: n('setTitle'), capture: n('capture'), captureMs: ms('capture'), imgMs: ms('img'), imgOps: n('img'),
    execjs: n('execjs'), execjsMs: ms('execjs'), execiso: n('execiso'), insets: n('ipc', (e) => e.ch === 'browser:insets'),
  };
}
function fnSum(list: Ev[]) {
  const o: Record<string, { n: number; ms: number; asyncMs?: number }> = {};
  for (const e of list) if (e.k === 'fn' || e.k === 'fnAsync') { const x = (o[e.arg!] ??= { n: 0, ms: 0 }); if (e.k === 'fn') { x.n++; x.ms = r1(x.ms + (e.ms ?? 0)); } else x.asyncMs = r1((x.asyncMs ?? 0) + (e.ms ?? 0)); }
  return o;
}
/** Main-process attribution: the browser's own methods, timed where they are called (this.x() finds these first). */
function wrapMethods(obj: any) {
  for (const name of ['sendTabs', 'place', 'placeTray', 'snapshot', 'lookForLogin', 'veilUp', 'veilDown', 'drawer', 'shotOf', 'peek', 'paintDark', 'activate', 'wake', 'sleepIdle', 'changed', 'settingsData', 'pushSettings', 'setInsets', 'tray', 'restore', 'quietHidden', 'frozenReady', 'savePrefs', 'saveMarks', 'toggleMark', 'markAct', 'sendDownloads']) {
    const f = obj[name];
    if (typeof f !== 'function') continue;
    obj[name] = function (this: unknown, ...a: unknown[]) {
      const t = ep(), s = performance.now();
      let r: unknown;
      try { r = f.apply(obj, a); } finally { evs.push({ t, k: 'fn', arg: name, ms: performance.now() - s }); }
      if (r instanceof Promise) r.then(() => evs.push({ t, k: 'fnAsync', arg: name, ms: ep() - t }), () => evs.push({ t, k: 'fnAsync', arg: name, ms: ep() - t }));
      return r;
    };
  }
}
/** When the parts of a tab change landed, from the event log (ms after the start). */
const milestones = (idOf: () => number) => (t0: number, list: Ev[]) => {
  const t = b.tabs.find((x: any) => x.id === idOf());
  const wid = t?.view?.webContents?.id;
  const at = (f: (e: Ev) => boolean) => { const e = list.find(f); return e ? r1(e.t - t0) : null; };
  const dur = (f: (e: Ev) => boolean) => { const e = list.find(f); return e ? r1(e.ms ?? 0) : null; };
  return {
    firstTabsMsg: at((e) => e.k === 'send' && e.ch === 'browser:tabs' && e.to === 'frame'),
    capture: at((e) => e.k === 'capture'), captureMs: dur((e) => e.k === 'capture'),
    curtainShow: at((e) => e.k === 'execjs' && e.to === 'curtain' && String(e.arg).startsWith('curtainShow')), curtainShowMs: dur((e) => e.k === 'execjs' && e.to === 'curtain' && String(e.arg).startsWith('curtainShow')),
    tabLoaded: at((e) => e.k === 'load' && e.id === wid), tabPainted: at((e) => e.k === 'ipc' && e.ch === 'tab:painted' && e.id === wid), tabStopped: at((e) => e.k === 'stop' && e.id === wid),
    veilDown: at((e) => e.k === 'fn' && e.arg === 'veilDown'), curtainFade: at((e) => e.k === 'execjs' && e.to === 'curtain' && String(e.arg).startsWith('curtainFade')),
    darkInjected: at((e) => e.k === 'execiso'), darkMs: dur((e) => e.k === 'execiso'),
  };
};
function summarizeTrace(file: string, pids: Record<string, number | undefined>) {
  let raw: any;
  try { raw = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { return { error: String((e as Error).message).slice(0, 80) }; }
  const all: any[] = Array.isArray(raw) ? raw : raw.traceEvents ?? [];
  const mainTid = new Map<number, number>();
  for (const e of all) if (e.ph === 'M' && e.name === 'thread_name' && (e.args?.name === 'CrRendererMain' || e.args?.name === 'CrBrowserMain')) mainTid.set(e.pid, e.tid);
  const out: Record<string, any> = {};
  const seen = new Set<number>();
  for (const [kind, pid] of Object.entries(pids)) {
    if (pid === undefined) continue;
    const tid = mainTid.get(pid);
    if (tid === undefined) { out[kind] = { pid, note: 'no main thread in trace' }; continue; }
    const shared = seen.has(pid); seen.add(pid);
    const by = new Map<string, { ms: number; n: number }>();
    let busyA = 0, busyB = 0, nA = 0, nB = 0; const longA: number[] = [], longB: number[] = [];
    const rep: Record<string, number> = {};
    for (const e of all) {
      if (e.pid !== pid) continue;
      if (e.name === 'PipelineReporter' && (e.ph === 'b' || e.ph === 'X')) { const st = e.args?.chrome_frame_reporter?.state ?? e.args?.data?.state; if (st) rep[st] = (rep[st] ?? 0) + 1; }
      if (e.tid !== tid || e.ph !== 'X' || typeof e.dur !== 'number') continue;
      const ms = e.dur / 1000;
      if (e.name === 'RunTask') { busyA += ms; nA++; if (ms > 50) longA.push(r1(ms)); }
      else if (e.name === 'ThreadControllerImpl::RunTask') { busyB += ms; nB++; if (ms > 50) longB.push(r1(ms)); }
      else { const x = by.get(e.name) ?? { ms: 0, n: 0 }; x.ms += ms; x.n++; by.set(e.name, x); }
    }
    const useA = nA > 0;
    const top = [...by.entries()].sort((a, z) => z[1].ms - a[1].ms).slice(0, 10).map(([name, v]) => ({ name, ms: r1(v.ms), n: v.n }));
    const get = (nm: string) => r1(by.get(nm)?.ms ?? 0);
    out[kind] = { pid, shared, busyMs: r1(useA ? busyA : busyB), tasks: useA ? nA : nB, longTasks: (useA ? longA : longB).sort((a, z) => z - a).slice(0, 6),
      style: get('UpdateLayoutTree'), layout: get('Layout'), paint: get('Paint'), prePaint: get('PrePaint'), script: r1(get('FunctionCall') + get('EvaluateScript') + get('v8.callFunction')),
      frames: by.get('ProxyMain::BeginMainFrame')?.n ?? 0, pipeline: rep, top };
  }
  return out;
}
function pidsNow(): Record<string, number | undefined> {
  const p = (w: Electron.WebContents | null) => (alive(w) ? w.getOSProcessId() : undefined);
  return { main: process.pid, frame: p(frameWc()), tray: p(trayWc()), tab: p(tabWc()), curtain: p(curWc()) };
}
type Opt = { settle?: () => boolean; settleMs?: number; tail?: number; rec?: () => (Electron.WebContents | null)[]; trace?: boolean; keepTrace?: boolean; extra?: (t0: number, list: Ev[]) => any };
async function measure(group: string, name: string, act: () => unknown, o: Opt = {}): Promise<any> {
  const watch = { frame: frameWc(), tray: trayWc(), tab: tabWc() };
  const before = { frame: await metrics(watch.frame), tray: await metrics(watch.tray), tab: await metrics(watch.tab) };
  const recs = (o.rec?.() ?? [frameWc()]).filter(alive);
  await Promise.all(recs.map(recStart));
  const traceOn = o.trace !== false && (RATE === 1 || o.keepTrace === true || process.env.PERF_TRACE_ALL === "1");
  if (traceOn) await contentTracing.startRecording(TRACE_CFG);
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
  const awaitedMs = performance.now() - s;
  const settledAt = o.settle ? await until(o.settle, o.settleMs ?? 8000) : null;
  await wait(o.tail ?? 300);
  const t1 = ep();
  const eldMax = eld.max / 1e6, eldP99 = eld.percentile(99) / 1e6, eldMean = eld.mean / 1e6;
  const cpu = process.cpuUsage(cpu0);
  const pages: Record<string, any> = {};
  for (const w of recs) pages[kindOf(w)] = pageSum(await recStop(w), t0);
  const watch2 = { frame: frameWc(), tray: trayWc(), tab: tabWc() };
  const after = { frame: await metrics(watch2.frame), tray: await metrics(watch2.tray), tab: await metrics(watch2.tab) };
  const pids = pidsNow();
  let trace: any = null;
  if (traceOn) {
    const f = await contentTracing.stopRecording(path.join(TRACES, `${group}-${name}-${results.length}.json`.replace(/[^\w.-]+/g, '_')));
    trace = summarizeTrace(f, pids);
    if (!o.keepTrace) try { rmSync(f); } catch { /* keep */ }
    else trace.file = f;
  }
  const list = evs.slice(i0).filter((e) => e.t >= t0 - 1 && e.t <= t1 + 1);
  const lastMut = Math.max(...Object.values(pages).map((p: any) => p?.lastMutMs ?? 0));
  const rec = {
    group, name, rate: RATE,
    wallMs: r1(t1 - t0), syncMs: r1(syncMs), awaitedMs: r1(awaitedMs), settledMs: settledAt ? r1(settledAt - t0) : null,
    visualMs: r1(Math.max(settledAt ? settledAt - t0 : 0, lastMut)),
    main: { eldMaxMs: r1(eldMax), eldP99Ms: r1(eldP99), eldMeanMs: r1(eldMean), cpuMs: r1((cpu.user + cpu.system) / 1000) },
    cdp: { frame: watch.frame === watch2.frame ? mdelta(before.frame, after.frame) : null, tray: watch.tray === watch2.tray ? mdelta(before.tray, after.tray) : null, tab: watch.tab === watch2.tab ? mdelta(before.tab, after.tab) : null },
    ev: evSum(list), fn: fnSum(list), pages, trace, extra: o.extra?.(t0, list) ?? null,
  };
  results.push(rec);
  const fr = rec.cdp.frame, tr = trace?.frame, mn = trace?.main;
  console.log(`${group.padEnd(10)} ${name.padEnd(26)} visual ${String(rec.visualMs).padStart(7)}ms sync ${String(rec.syncMs).padStart(6)} | frame style ${fr?.styleMs ?? '-'} layout ${fr?.layoutMs ?? '-'} script ${fr?.scriptMs ?? '-'} task ${fr?.taskMs ?? '-'} | frame long ${JSON.stringify(tr?.longTasks ?? [])} | main busy ${mn?.busyMs ?? '-'} long ${JSON.stringify(mn?.longTasks ?? [])} eldMax ${rec.main.eldMaxMs} | tabs msgs ${rec.ev.tabsMsgs} setBounds ${rec.ev.setBounds} cap ${rec.ev.capture}/${rec.ev.captureMs}ms img ${rec.ev.imgMs}ms`);
  return rec;
}
function writeResults(status: string) {
  writeFileSync(path.join(OUT, `results-${RATE}x.json`), JSON.stringify({ status, rate: RATE, at: new Date().toISOString(), env: {
    electron: process.versions.electron, chrome: process.versions.chrome, cpu: os.cpus()[0]?.model, cores: os.cpus().length, mem: Math.round(os.totalmem() / 1e9),
    scale: screen.getPrimaryDisplay().scaleFactor, display: screen.getPrimaryDisplay().size, hz: (screen.getPrimaryDisplay() as any).displayFrequency,
  }, notes, results }, null, 1));
}

// ------------------------------------------------------------------ the run
app.whenReady().then(async () => {
  (screen as any).getCursorScreenPoint = () => ({ x: -20000, y: 500 });
  const site = http.createServer((q, r) => {
    const u = q.url ?? '/';
    if (u.startsWith('/img/')) { r.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'max-age=3600' }).end(svg(Number(u.slice(5).split('.')[0]) || 0)); return; }
    if (u.startsWith('/fav.svg')) { r.writeHead(200, { 'Content-Type': 'image/svg+xml' }).end(FAV); return; }
    if (u.startsWith('/heavy')) { r.writeHead(200, { 'Content-Type': 'text/html' }).end(HEAVY); return; }
    if (u.startsWith('/long')) { r.writeHead(200, { 'Content-Type': 'text/html' }).end(LONG); return; }
    const m = /^\/p\/(\d+)/.exec(u);
    r.writeHead(200, { 'Content-Type': 'text/html' }).end(simplePage(m ? Number(m[1]) : 0));
  });
  await new Promise<void>((res) => site.listen(PORT, '127.0.0.1', () => res()));
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const { wireBrowser } = await import('../../src/browseripc.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));

  // A restored session: six tabs (two in a trail), 300 bookmarks (30 on the bar) with their icons, cached block lists.
  const stateDir = mkdtempSync(path.join(os.tmpdir(), 'samara-perf-state-'));
  const TABS = ['/p/1', '/p/2', '/p/3', '/p/4', '/heavy', '/long'];
  writeFileSync(path.join(stateDir, 'browser-tabs.json'), JSON.stringify({ v: 1, at: new Date().toISOString(), active: 0, fronts: [0],
    tabs: TABS.map((p, i) => ({ url: url(p), title: `Tab ${i + 1}`, opener: i === 3 ? 2 : null, scrollY: 0, zoom: 0, muted: false, trail: i === 2 || i === 3 ? 1 : null, done: false, win: 0 })),
    trails: [{ id: 1, name: 'Research', named: true, collapsed: false }], closed: [] }));
  const marks = Array.from({ length: 300 }, (_, i) => ({ title: `Bookmark ${i}`, url: `https://site${i}.example/`, folder: i < 30 ? 'Bookmarks bar' : 'Other' }));
  writeFileSync(path.join(stateDir, 'browser-bookmarks.json'), JSON.stringify(marks));
  writeFileSync(path.join(stateDir, 'browser-favicons.json'), JSON.stringify(Object.fromEntries(marks.map((m, i) => [`site${i}.example`, ICON]))));
  const warm = existsSync(path.join(CACHE, 'adblock', 'lists.txt')) && existsSync(path.join(CACHE, 'phish'));
  if (warm) { cpSync(path.join(CACHE, 'adblock'), path.join(stateDir, 'adblock'), { recursive: true }); cpSync(path.join(CACHE, 'phish'), path.join(stateDir, 'phish'), { recursive: true }); }
  else notes.push('cold cache: block and phishing lists were downloaded in this run (cold start numbers include the download)');

  // ---- 1) cold start
  const opts = { origin: pages.origin, stateDir, preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs') };
  let ctorMs = 0, openMs = 0, t0cold = 0, adsAt: number | null = null, phishAt: number | null = null;
  const tick = setInterval(() => { if (b?.ads && !adsAt) adsAt = ep(); if (b?.phish?.ready && !phishAt) phishAt = ep(); }, 5);
  const cold = await measure('1-cold', 'new+open (6 tabs restored)', () => {
    t0cold = ep();
    const s = performance.now(); b = new AangBrowser(opts as any); ctorMs = performance.now() - s; wrapMethods(b);
    wireBrowser(() => b);
    const s2 = performance.now(); b.open(); openMs = performance.now() - s2;
  }, { settle: () => Boolean(adsAt && phishAt && b.tabs.length >= 6 && evs.some((e) => e.k === 'ipc' && e.ch === 'tab:painted' && e.t > t0cold)), settleMs: warm ? 30_000 : 120_000, tail: 1500, keepTrace: true, rec: () => [] });
  clearInterval(tick);
  {
    const fw = frameWc()!;
    const fcp = await fw.executeJavaScript('/*perf*/(() => { const p = performance.getEntriesByType("paint").find((e) => e.name === "first-contentful-paint"); return p ? performance.timeOrigin + p.startTime : null; })()', true).catch(() => null);
    const firstOf = (f: (e: Ev) => boolean) => { const e = evs.find((x) => x.t >= t0cold && f(x)); return e ? r1(e.t - t0cold) : null; };
    cold.extra = {
      warmCache: warm, ctorMs: r1(ctorMs), openMs: r1(openMs),
      frameCreated: firstOf((e) => e.k === 'created'), frameLoaded: firstOf((e) => e.k === 'load' && e.to === 'frame'),
      frameFCP: fcp ? r1(fcp - t0cold) : null, firstTabsMsg: firstOf((e) => e.k === 'send' && e.ch === 'browser:tabs'),
      activeTabPainted: firstOf((e) => e.k === 'ipc' && e.ch === 'tab:painted'), activeTabLoaded: firstOf((e) => e.k === 'load' && e.to === 'tab'),
      adsReady: adsAt ? r1(adsAt - t0cold) : null, phishReady: phishAt ? r1(phishAt - t0cold) : null,
      tabsMsgsFirst5s: evs.filter((e) => e.t >= t0cold && e.t < t0cold + 5000 && e.k === 'send' && e.ch === 'browser:tabs').length,
    };
    console.log('cold detail ' + JSON.stringify(cold.extra));
  }
  if (!warm && b.ads && b.phish?.ready) {
    try { mkdirSync(CACHE, { recursive: true }); cpSync(path.join(stateDir, 'adblock'), path.join(CACHE, 'adblock'), { recursive: true }); cpSync(path.join(stateDir, 'phish'), path.join(CACHE, 'phish'), { recursive: true }); } catch (e) { notes.push('cache copy: ' + (e as Error).message); }
  }
  await wait(1500);
  const fwc = frameWc()!;
  const vis = await fx('({ vis: document.visibilityState, w: innerWidth, h: innerHeight, dpr: devicePixelRatio })');
  console.log('frame ' + JSON.stringify(vis) + ' pids ' + JSON.stringify(pidsNow()));
  notes.push('frame ' + JSON.stringify(vis));
  const tabIds: number[] = b.tabs.map((t: any) => t.id);
  const painted = (id: number, after: number) => { const t = b.tabs.find((x: any) => x.id === id); const w = t?.view?.webContents; return Boolean(w && evs.some((e) => e.t > after && e.k === 'ipc' && e.ch === 'tab:painted' && e.id === w.id)); };
  const settledTab = (id: number, after: () => number) => () => { const t = b.tabs.find((x: any) => x.id === id); return Boolean(t?.view && !t.loading && painted(id, after()) && !b.veil); };

  // ---- 2) switching tabs: asleep (each wakes), then live
  let tS = 0;
  for (const id of tabIds.slice(1)) {
    await measure('2-switch', 'asleep tab (wakes)', () => { tS = ep(); b.activate(id); }, { settle: settledTab(id, () => tS), tail: 350, rec: () => [frameWc()], extra: milestones(() => id) });
    await wait(400);
  }
  b.activate(tabIds[0]); await wait(800);
  for (const id of tabIds.slice(1, 6)) { const t = b.tabs.find((x: any) => x.id === id); if (t?.view) b.sleep(t); }
  b.sendTabs(); await wait(500);
  for (const id of tabIds.slice(1, 6)) {
    await measure('2-switch', 'asleep tab (wakes)', () => { tS = ep(); b.activate(id); }, { settle: settledTab(id, () => tS), tail: 350, rec: () => [frameWc()], extra: milestones(() => id) });
    await wait(400);
  }
  for (const id of tabIds) { b.activate(id); await wait(700); }
  await wait(1500);
  for (let i = 0; i < 10; i++) {
    const id = tabIds[i % tabIds.length]!;
    await measure('2-switch', 'live tab', () => b.activate(id), { tail: 350, rec: () => [frameWc()], keepTrace: i === 3 });
    await wait(250);
  }

  // ---- 3) the tab list (tray): first open makes its layer; hover-open (with the page picture); close
  const trayOpen = () => Boolean(b.trayOn && b.trayV?.getVisible?.());
  const trayGot = (after: number) => evs.some((e) => e.t > after && e.k === 'send' && e.ch === 'browser:tabs' && e.to === 'tray');
  const trayClose = async () => { const w = trayWc(); if (w) await w.executeJavaScript('/*perf*/window.aang.browserTray({ open: false })', true).catch(() => {}); await until(() => !b.trayOn, 2000); };
  tS = 0;
  await measure('3-tray', 'open (first, builds layer)', () => { tS = ep(); return fx("document.getElementById('drawerkey').click()"); }, { settle: () => trayOpen() && trayGot(tS) && evs.some((e) => e.t > tS && e.k === 'load' && e.to === 'tray'), tail: 500, rec: () => [frameWc()], keepTrace: true });
  await wait(600);
  await measure('3-tray', 'close', () => trayClose(), { tail: 300, rec: () => [frameWc(), trayWc()] });
  for (let i = 0; i < 3; i++) {
    await wait(500);
    await measure('3-tray', 'open (click)', () => { tS = ep(); return fx("document.getElementById('drawerkey').click()"); }, { settle: () => trayOpen() && trayGot(tS), tail: 400, rec: () => [frameWc(), trayWc()] });
    await wait(400);
    await measure('3-tray', 'close', () => trayClose(), { tail: 300, rec: () => [frameWc(), trayWc()] });
  }
  for (let i = 0; i < 3; i++) {
    await wait(900);
    b.pane.peekShot = null;
    await measure('3-tray', 'open (hover: peek + 400ms)', () => { tS = ep(); return fx("document.getElementById('drawerkey').dispatchEvent(new PointerEvent('pointerenter'))"); }, { settle: () => trayOpen() && trayGot(tS), settleMs: 3000, tail: 400, rec: () => [frameWc(), trayWc()] });
    await wait(400);
    await trayClose();
  }
  // Switching from the list, the list staying open (his way of looking through tabs).
  await fx("document.getElementById('drawerkey').click()"); await until(trayOpen, 2000); await wait(500);
  for (let i = 0; i < 10; i++) {
    const id = tabIds[(i + 1) % tabIds.length]!;
    await measure('2-switch', 'live tab, from open list', () => trayWc()!.executeJavaScript(`/*perf*/(() => { const r = document.querySelector('.tp[data-tab="${id}"]'); r && r.dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true })); return !!r; })()`, true),
      { tail: 350, rec: () => [frameWc(), trayWc()] });
    await wait(250);
  }
  await trayClose(); await wait(500);
  b.activate(tabIds[0]); await wait(800);

  // ---- 4/5/6) panels that lie over the page (each pictures the page first: capturePage + JPEG, then hides it)
  const tabHidden = () => { const v = cur()?.view; return Boolean(v && !v.getVisible()); };
  const tabShown = () => { const v = cur()?.view; return Boolean(v && v.getVisible()); };
  const overPanel = async (group: string, name: string, open: string, close: string, reps = 3, peekFirst = false) => {
    for (let i = 0; i < reps; i++) {
      await wait(900);
      b.pane.peekShot = null;
      if (peekFirst) { await fx("document.getElementById('slot').dispatchEvent(new PointerEvent('pointerenter'))"); await wait(250); }
      await measure(group, `${name} open${peekFirst ? ' (after hover peek)' : ''}`, () => fx(open), { settle: tabHidden, settleMs: 3000, tail: 350, rec: () => [frameWc()], keepTrace: i === 0 && !peekFirst });
      await wait(500);
      await measure(group, `${name} close`, () => fx(close), { settle: tabShown, settleMs: 3000, tail: 300, rec: () => [frameWc()] });
    }
  };
  await overPanel('4-shield', 'site panel', "document.getElementById('lock').click()", 'document.body.click()');
  await overPanel('4-shield', 'site panel', "document.getElementById('lock').click()", 'document.body.click()', 2, true);
  b.setUpdate({ version: '44.7.2', since: Date.now(), title: 'Version 1.1.0: Gojo', canBack: true, overnight: false,
    groups: [{ name: 'SAMARA', items: [{ text: 'Only one Samara in your Dock, always.' }] }, { name: "SAMARA'S ENGINE", items: [{ text: "Chrome's newest security fixes.", note: 'Always included.' }, { text: 'Lock your saved logins.', key: 'lock', on: true }] }] });
  await wait(600);
  await overPanel('5-uptray', 'update tray', "document.getElementById('upkey').click()", "document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))");
  await overPanel('6-menu', 'dots menu', "document.getElementById('menukey').click()", "document.getElementById('menukey').click()");
  frameWc()!.send('browser:dls', { items: [1, 2, 3, 4].map((i) => ({ id: i, name: `file-${i}.zip`, state: 'completed', kind: 'zip', size: 1e6 * i, site: 'example.com', at: Date.now() - i * 60_000 })), pop: false });
  await wait(600);
  await overPanel('6-downloads', 'downloads tray', "document.getElementById('dlkey').click()", "document.getElementById('dlkey').click()");
  await overPanel('6-bookmark', 'star + name panel', "document.getElementById('star').click()", "document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))", 1);

  // ---- peek alone (the picture taken whenever the mouse heads for the band's keys)
  for (let i = 0; i < 4; i++) { await wait(900); b.pane.peekShot = null; await measure('4-shield', 'peek (capture+JPEG)', () => b.peek(), { tail: 100, rec: () => [] }); }

  // ---- 7) a new tab with a heavy page, dark mode on (default) and off
  const heavyTab = async (label: string, reps: number) => {
    for (let i = 0; i < reps; i++) {
      await wait(800);
      let id = 0; tS = 0;
      await measure('7-newtab', `heavy page, ${label}`, () => { tS = ep(); id = b.newTab(url('/heavy?' + label + i)); }, { settle: () => id > 0 && settledTab(id, () => tS)(), settleMs: 15_000, tail: 600, rec: () => [frameWc(), tabWc()], keepTrace: i === 0, extra: milestones(() => id) });
      await wait(600);
      await measure('7-newtab', 'close that tab', () => b.close(id), { tail: 400, rec: () => [frameWc()] });
    }
  };
  await heavyTab('dark on', 3);

  // ---- 8) scrolling a long page, and pointing at links
  const scroll = async (label: string) => {
    const id = tabIds[5]!; b.activate(id); await wait(1500);
    const w = tabWc()!;
    await w.executeJavaScript('/*perf*/window.scrollTo(0, 0); true');
    await w.executeJavaScript(REC);
    w.sendInputEvent({ type: 'mouseMove', x: 420, y: 320 });
    await wait(300);
    const y0 = await w.executeJavaScript('/*perf*/window.scrollY');
    await measure('8-scroll', `wheel x90, ${label}`, async () => {
      for (let i = 0; i < 90; i++) { w.sendInputEvent({ type: 'mouseWheel', x: 420, y: 320, deltaX: 0, deltaY: -100, canScroll: true } as any); await wait(16); }
    }, { tail: 500, rec: () => [w, frameWc()], keepTrace: label === 'dark on' });
    const y1 = await w.executeJavaScript('/*perf*/window.scrollY');
    results.at(-1).extra = { scrolledPx: y1 - y0 };
  };
  await scroll('dark on');
  {
    b.activate(tabIds[0]); await wait(1200);
    const w = tabWc()!;
    const pts: { x: number; y: number }[] = await w.executeJavaScript('/*perf*/[...document.querySelectorAll("nav a")].slice(0, 20).map((a) => { const r = a.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })');
    await measure('8-scroll', 'pointing at 20 links', async () => {
      for (const p of pts) { w.sendInputEvent({ type: 'mouseMove', x: p.x, y: p.y }); await wait(60); w.sendInputEvent({ type: 'mouseMove', x: p.x, y: p.y + 300 }); await wait(60); }
    }, { tail: 400, rec: () => [frameWc()] });
  }
  b.setPref('dark', false); await wait(1500);
  await heavyTab('dark off', 2);
  await scroll('dark off');
  b.setPref('dark', true); await wait(1500);

  // ---- 9) window resize (20 steps, as a drag would)
  {
    b.activate(tabIds[0]); await wait(800);
    const w = b.win as BrowserWindow;
    const [W, H] = w.getSize();
    await measure('9-resize', '20 steps then back', async () => {
      for (let i = 1; i <= 20; i++) { w.setSize(W! - i * 12, H! - i * 6); await wait(16); }
      for (let i = 19; i >= 0; i--) { w.setSize(W! - i * 12, H! - i * 6); await wait(16); }
    }, { tail: 500, rec: () => [frameWc()], keepTrace: true });
  }

  // ---- 10) Settings (an internal page)
  {
    let sId = 0; tS = 0;
    const settingsWc = () => b.tabs.find((x: any) => x.internal === 'settings')?.view?.webContents;
    await measure('10-settings', 'open (first)', () => { tS = ep(); b.act('settings'); sId = b.tabs.find((x: any) => x.internal === 'settings')?.id; }, { settle: () => { const w = settingsWc(); return Boolean(w && evs.some((e) => e.t > tS && e.k === 'load' && e.id === w.id)); }, tail: 800, rec: () => [frameWc()], keepTrace: true });
    const sw = settingsWc();
    const fcp = sw ? await sw.executeJavaScript('/*perf*/(() => { const p = performance.getEntriesByType("paint").find((e) => e.name === "first-contentful-paint"); return p ? performance.timeOrigin + p.startTime : null; })()', true).catch(() => null) : null;
    results.at(-1).extra = { settingsFCP: fcp ? r1(fcp - tS) : null, settingsNodes: sw ? await sw.executeJavaScript('/*perf*/document.getElementsByTagName("*").length').catch(() => null) : null };
    await wait(3000);
    b.activate(tabIds[0]); await wait(800);
    await measure('10-settings', 'switch back to it', () => b.act('settings'), { tail: 500, rec: () => [frameWc(), settingsWc()] });
    await wait(600);
    b.activate(tabIds[0]); await wait(800);
    if (sId) b.close(sId);
    await wait(800);
  }

  // ---- direct costs in the main process: one tab-list send, one snapshot
  {
    const n = 40;
    const f0 = await metrics(frameWc()), t0 = await metrics(trayWc());
    await recStart(frameWc());
    const times: number[] = [];
    for (let i = 0; i < n; i++) { const s = performance.now(); b.sendTabs(); times.push(performance.now() - s); await wait(30); }
    await wait(400);
    const p = pageSum(await recStop(frameWc()), 0);
    const f1 = await metrics(frameWc());
    const last = evs.filter((e) => e.k === 'send' && e.ch === 'browser:tabs').at(-1);
    times.sort((a, z) => a - z);
    results.push({ group: 'unit', name: `sendTabs x${n}`, rate: RATE, mainMsMedian: r1(times[n >> 1]!), mainMsMax: r1(times[n - 1]!), payloadKB: r1((last?.bytes ?? 0) / 1024),
      framePerMsg: (() => { const d = mdelta(f0, f1); return d ? { styleMs: r1(d.styleMs / n), layoutMs: r1(d.layoutMs / n), scriptMs: r1(d.scriptMs / n), taskMs: r1(d.taskMs / n), styleN: d.styleN / n, layoutN: d.layoutN / n } : null; })(), framePage: p, trayOpen: Boolean(t0) });
    console.log('unit sendTabs ' + JSON.stringify(results.at(-1)));
    const st: number[] = [];
    for (let i = 0; i < 5; i++) { const s = performance.now(); await b.snapshot(); st.push(performance.now() - s); }
    results.push({ group: 'unit', name: 'snapshot x5', rate: RATE, msEach: st.map(r1) });
    const lf: number[] = [];
    for (let i = 0; i < 10; i++) { const w = tabWc(); const s = performance.now(); await w?.executeJavaScript("!!document.querySelector('input[type=password]')", true); lf.push(performance.now() - s); }
    results.push({ group: 'unit', name: 'login probe (lookForLogin body) x10', rate: RATE, msEach: lf.map(r1) });
    console.log('unit ' + JSON.stringify(results.slice(-2)));
    const sd: number[] = [];
    for (let i = 0; i < 3; i++) { eld.reset(); const s = performance.now(); const p = b.settingsData(); sd.push(performance.now() - s); await p; await wait(3000); }
    results.push({ group: 'unit', name: 'settingsData() sync part x3 (starts bw status)', rate: RATE, msEach: sd.map(r1), eldMaxLast: r1(eld.max / 1e6) });
    const { execFile } = await import('node:child_process');
    const { BW } = await import('../../src/vault.ts');
    const spawn: { sync: number; total: number; eldMax: number }[] = [];
    for (let i = 0; i < 3; i++) {
      eld.reset();
      const s = performance.now();
      const cp = execFile(BW, ['--version'], { windowsHide: true, timeout: 30_000 }, () => {});
      const sync = performance.now() - s;
      await new Promise((r) => { cp.on('exit', r); cp.on('error', r); });
      spawn.push({ sync: r1(sync), total: r1(performance.now() - s), eldMax: r1(eld.max / 1e6) });
      await wait(500);
    }
    results.push({ group: 'unit', name: 'spawn bw.exe --version x3 (main thread blocked = sync)', rate: RATE, exists: existsSync(BW), runs: spawn });
    console.log('unit ' + JSON.stringify(results.slice(-2)));
  }

  // ---- probes: the curtain's picture call, the cold-start pieces, and two in-page A/B experiments (no source changed)
  {
    b.activate(tabIds[0]); await wait(1000);
    const cw = curWc();
    const shot = await b.shotOf(cur());
    const probe: any[] = [];
    for (const [label, arg] of [['picture, curtain hidden', JSON.stringify(shot)], ['no picture (wood), curtain hidden', 'null']] as const) {
      if (!cw) break;
      const s = performance.now();
      const r = await Promise.race([cw.executeJavaScript(`curtainShow(${arg})`).then(() => 'resolved', () => 'rejected'), wait(3000).then(() => 'still waiting after 3000 ms')]);
      probe.push({ label, result: r, ms: r1(performance.now() - s), curtainVisible: b.curtain?.getVisible?.() });
    }
    results.push({ group: 'probe', name: 'curtainShow() as veilUp calls it (veilUp gives up after 400 ms)', rate: RATE, probe, shotKB: r1((shot?.length ?? 0) / 1024) });
    console.log('probe ' + JSON.stringify(results.at(-1)));
    const fsz = (f: string) => { try { const s0 = performance.now(); const t = readFileSync(f, 'utf8'); return { MB: r1(t.length / 1e6), readMs: r1(performance.now() - s0), text: t }; } catch { return null; } };
    const lists = fsz(path.join(stateDir, 'adblock', 'lists.txt'));
    let parseMs: number | null = null;
    if (lists) { const { ElectronBlocker } = await import('@ghostery/adblocker-electron'); const s0 = performance.now(); ElectronBlocker.parse(lists.text, { loadCosmeticFilters: true }); parseMs = r1(performance.now() - s0); }
    const phishFiles = ['phishing.database.txt', 'urlhaus.txt', 'phishing filter.txt'].map((n) => { const x = fsz(path.join(stateDir, 'phish', n)); return x ? { n, MB: x.MB, readMs: x.readMs } : null; });
    const dr = fsz(path.join(HERE, '..', '..', 'node_modules', 'darkreader', 'darkreader.js'));
    results.push({ group: 'probe', name: 'cold-start pieces (main thread, warm disk)', rate: RATE, adblockListsMB: lists?.MB, adblockReadMs: lists?.readMs, adblockParseMs: parseMs, phishFiles, darkreaderKB: dr ? r1(dr.MB * 1000) : null });
    console.log('probe ' + JSON.stringify(results.at(-1)));
    // A/B 1: the loading bar's stripes (.loading i::after, background-position, infinite) switched off in the page.
    const idleFrame = async (label: string) => {
      const m0 = await metrics(frameWc());
      await contentTracing.startRecording(TRACE_CFG); await wait(30);
      await wait(8000);
      const m1 = await metrics(frameWc());
      const f = await contentTracing.stopRecording(path.join(TRACES, `ab-${label.replace(/\W+/g, '_')}.json`));
      const tr = summarizeTrace(f, pidsNow()); try { rmSync(f); } catch { /* keep */ }
      return { label, frameCdp: mdelta(m0, m1), frameTrace: { busyMs: tr.frame?.busyMs, frames: tr.frame?.frames, paint: tr.frame?.paint, style: tr.frame?.style }, gpuNote: 'see idle cpu' };
    };
    await wait(2000);
    const running = await fx("document.getAnimations().filter((a) => a.playState === 'running').map((a) => (a.animationName || a.transitionProperty) + ' on ' + ((a.effect && a.effect.target && (a.effect.target.id || a.effect.target.tagName)) || '?') + (a.effect && a.effect.pseudoElement || ''))");
    const ab1: any[] = [{ running }, await idleFrame('8 s idle, as is')];
    await fx("(() => { const a = document.getAnimations().find((x) => x.animationName === 'ribs'); if (a) a.pause(); return true; })()");
    ab1.push(await idleFrame('8 s idle, stripes animation paused'));
    await fx("(() => { const a = document.getAnimations().find((x) => x.animationName === 'ribs'); if (a) a.play(); return true; })()");
    results.push({ group: 'ab', name: 'idle frame: loading-bar stripes on vs paused', rate: RATE, runs: ab1 });
    console.log('ab ' + JSON.stringify(results.at(-1)));
    // A/B 2: one tab-list message, as is vs with the bookmark shelf's rebuild neutralised (its node ignores the rebuild).
    const perMsg = async (label: string) => {
      const n = 30; const m0 = await metrics(frameWc()); await recStart(frameWc());
      for (let i = 0; i < n; i++) { b.sendTabs(); await wait(40); }
      await wait(300);
      const pg = pageSum(await recStop(frameWc()), 0); const d = mdelta(m0, await metrics(frameWc()));
      return { label, perMsg: d ? { styleMs: r1(d.styleMs / n), layoutMs: r1(d.layoutMs / n), scriptMs: r1(d.scriptMs / n), taskMs: r1(d.taskMs / n), styleN: r1(d.styleN / n), layoutN: r1(d.layoutN / n) } : null, mutsPerMsg: pg ? r1(pg.muts / n) : null };
    };
    const ab2: Record<string, unknown>[] = [await perMsg('as is')];
    await fx("(() => { const m = document.getElementById('marks'); m.__rc = m.replaceChildren; m.__ap = m.append; m.replaceChildren = () => {}; m.append = () => {}; return true; })()");
    ab2.push(await perMsg('bookmark shelf rebuild skipped'));
    await fx("(() => { const m = document.getElementById('marks'); m.replaceChildren = m.__rc; m.append = m.__ap; return true; })()");
    // A/B 3: the same, with the band's "hidden" writes not reaching the observer (insets report): measured by counting.
    const i0 = evs.length; for (let i = 0; i < 10; i++) { b.sendTabs(); await wait(60); }
    ab2.push({ label: 'insets IPC + setBounds caused by 10 unchanged tab-list messages', insets: evs.slice(i0).filter((e) => e.k === 'ipc' && e.ch === 'browser:insets').length, setBounds: evs.slice(i0).filter((e) => e.k === 'setBounds').length });
    results.push({ group: 'ab', name: 'frame cost of one unchanged tab-list message', rate: RATE, runs: ab2 });
    console.log('ab ' + JSON.stringify(results.at(-1)));
  }

  // ---- idle: nothing happening, 15 s; then with an update waiting (its glow animation)
  const idle = async (name: string) => {
    app.getAppMetrics();
    const i0 = evs.length;
    const r = await measure('idle', name, () => wait(15_000), { tail: 0, rec: () => [], keepTrace: name.startsWith('plain') });
    const m = app.getAppMetrics();
    const p = pidsNow();
    const who = (pid: number) => Object.entries(p).filter(([, v]) => v === pid).map(([k]) => k).join('+') || m.find((x) => x.pid === pid)?.type || '?';
    r.extra = { cpu: m.map((x) => ({ who: who(x.pid), type: x.type, pct: r1(x.cpu.percentCPUUsage), wakeups: x.cpu.idleWakeupsPerSecond })).filter((x) => x.pct > 0.05 || ['frame', 'tray', 'main', 'tab', 'GPU'].some((k) => x.who.includes(k))),
      perSec: Object.fromEntries(Object.entries(r.ev.sends).map(([k, v]) => [k, r1((v as number) / 15)])), ipcInPerSec: Object.fromEntries(Object.entries(r.ev.ipcIn).map(([k, v]) => [k, r1((v as number) / 15)])),
      execjs: evs.slice(i0).filter((e) => e.k === 'execjs').map((e) => `${e.to}:${(e.arg ?? '').slice(0, 30)}:${r1(e.ms ?? 0)}ms`).slice(0, 20) };
    console.log('idle ' + name + ' ' + JSON.stringify(r.extra));
  };
  b.setUpdate(null); await wait(1500);
  await idle('plain (6 live tabs, no update)');
  b.setUpdate({ version: '44.7.2', since: Date.now() - 5 * 86_400_000, title: 'Version 1.1.0: Gojo', canBack: true, overnight: false, groups: [{ name: 'SAMARA', items: [{ text: 'x' }] }] });
  await wait(1500);
  await idle('update waiting 5 days (glow + swell)');
  b.setUpdate(null);
  await fx("document.getElementById('drawerkey').click()"); await until(trayOpen, 2000); await wait(800);
  await idle('tab list open');
  await trayClose();

  // ---- static facts from the live frame
  const facts = await fx(`(() => {
    const all = [...document.styleSheets].flatMap((s) => { try { return [...s.cssRules]; } catch { return []; } });
    const sel = all.filter((r) => r.selectorText).map((r) => r.selectorText);
    const anims = document.getAnimations().map((a) => ({ name: a.animationName || a.transitionProperty || a.constructor.name, play: a.playState, el: (a.effect && a.effect.target && (a.effect.target.id || a.effect.target.className || a.effect.target.tagName)) + '' }));
    return { rules: all.length, has: sel.filter((s) => s.includes(':has(')).length, universal: sel.filter((s) => /(^|[\\s>+~,])\\*/.test(s)).length, attr: sel.filter((s) => /\\[/.test(s)).length,
      nodes: document.getElementsByTagName('*').length, runningAnimations: anims.filter((a) => a.play === 'running') };
  })()`);
  results.push({ group: 'static', name: 'frame DOM/CSS facts', rate: RATE, ...facts });
  console.log('facts ' + JSON.stringify(facts));
  finished = true;
  writeResults('ok');
  console.log(`DONE  results: ${path.join(OUT, `results-${RATE}x.json`)}  traces: ${TRACES}`);
  app.exit(0);
}).catch((e) => { console.log('HARNESS FAILED ' + String((e as Error)?.stack ?? e).split('\n').slice(0, 4).join(' | ')); try { writeResults('failed'); } catch { /* none */ } app.exit(2); });
void finished;

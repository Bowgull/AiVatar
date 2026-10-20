// Samara perf (2026-10-20), measurement only: what keeps the frame drawing 60 times a second while nothing happens?
// Opens Samara off screen with one local tab, lists the running animations, then cancels them one at a time and
// counts the frame's rendering work over 4 s each (CDP Performance.getMetrics + a short trace).
//
// Run: npx electron test/electron/perf-idle-probe.ts
import { app, BrowserWindow, contentTracing, screen } from 'electron';
import http from 'node:http';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
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
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const PORT = 47932;

app.whenReady().then(async () => {
  (screen as any).getCursorScreenPoint = () => ({ x: -20000, y: 500 });
  const site = http.createServer((_q, r) => { r.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>quiet</title><p>quiet page</p>'); });
  await new Promise<void>((res) => site.listen(PORT, '127.0.0.1', () => res()));
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const { wireBrowser } = await import('../../src/browseripc.ts');
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const b: any = new AangBrowser({ origin: pages.origin, stateDir: mkdtempSync(path.join(os.tmpdir(), 'samara-idle-')), preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs') } as any);
  wireBrowser(() => b);
  b.open(`http://127.0.0.1:${PORT}/`);
  await wait(6000);
  const wc = b.win.webContents as Electron.WebContents;
  wc.debugger.attach('1.3');
  await wc.debugger.sendCommand('Performance.enable');
  const js = (s: string) => wc.executeJavaScript(s, true);
  const window4s = async (label: string) => {
    const g = async () => Object.fromEntries(((await wc.debugger.sendCommand('Performance.getMetrics')) as any).metrics.map((m: any) => [m.name, m.value]));
    const a = await g();
    await contentTracing.startRecording({ included_categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline.frame'], excluded_categories: ['*'] } as any);
    await wait(4000);
    const f = await contentTracing.stopRecording(path.join(os.tmpdir(), 'samara-idle-probe.json'));
    const z = await g();
    const ev: any[] = JSON.parse(readFileSync(f, 'utf8')).traceEvents;
    rmSync(f);
    const pid = wc.getOSProcessId();
    const n = (name: string) => ev.filter((e) => e.pid === pid && e.name === name && e.ph === 'X').length;
    console.log(`${label.padEnd(58)} frames ${n('ProxyMain::BeginMainFrame') || n('UpdateLayoutTree')} paint ${n('Paint')} styleN ${z.RecalcStyleCount - a.RecalcStyleCount} layoutN ${z.LayoutCount - a.LayoutCount} task ${Math.round((z.TaskDuration - a.TaskDuration) * 1000)} ms`);
  };
  const anims = await js(`document.getAnimations().map((a, i) => ({ i, kind: a.constructor.name, name: a.animationName || a.transitionProperty, state: a.playState,
    target: (() => { const t = a.effect && a.effect.target; return t ? (t.id ? '#' + t.id : t.tagName + '.' + String(t.className).slice(0, 30)) + (a.effect.pseudoElement || '') : '?'; })(),
    iterations: a.effect && a.effect.getComputedTiming().iterations, duration: a.effect && a.effect.getComputedTiming().duration, current: a.currentTime }))`);
  console.log('running animations: ' + JSON.stringify(anims));
  await window4s('as is');
  for (const a of anims) {
    await js(`(() => { const a = document.getAnimations().find((x) => (x.animationName || x.transitionProperty) === ${JSON.stringify(a.name)}); if (a) a.pause(); return true; })()`);
    await window4s(`paused: ${a.name} on ${a.target}`);
  }
  console.log('drawerkey: ' + JSON.stringify(await js(`(() => { const k = document.getElementById('drawerkey'); const cs = getComputedStyle(k); return { transition: cs.transition, filter: cs.filter, hover: k.matches(':hover'), bodyClass: document.body.className }; })()`)));
  // Now use the tab list once (open by click, close as the mouse-out does) and look again.
  await js(`document.getAnimations().forEach((a) => a.play()); true`);
  await js(`document.getElementById('drawerkey').click(); true`);
  await wait(1500);
  const tw = b.trayV?.webContents as Electron.WebContents | undefined;
  if (tw) await tw.executeJavaScript('window.aang.browserTray({ open: false }); true', true);
  await wait(1500);
  const anims2 = await js(`document.getAnimations().map((a) => ({ kind: a.constructor.name, name: a.animationName || a.transitionProperty, state: a.playState, target: (() => { const t = a.effect && a.effect.target; return t ? (t.id ? '#' + t.id : t.tagName) + (a.effect.pseudoElement || '') : '?'; })(), current: a.currentTime, end: a.effect && a.effect.getComputedTiming().endTime, progress: a.effect && a.effect.getComputedTiming().progress }))`);
  console.log('after the tab list was used once: ' + JSON.stringify(anims2));
  console.log('drawerkey now: ' + JSON.stringify(await js(`(() => { const k = document.getElementById('drawerkey'); const cs = getComputedStyle(k); return { filter: cs.filter, bodyClass: document.body.className, expanded: k.getAttribute('aria-expanded') }; })()`)));
  await window4s('after tab list used, as is');
  await js(`(() => { const a = document.getAnimations().find((x) => x.animationName === 'ribs'); if (a) a.pause(); return true; })()`);
  await window4s('after tab list used, ribs paused');
  await js(`document.getAnimations().forEach((a) => a.pause()); true`);
  await window4s('after tab list used, everything paused');
  app.exit(0);
}).catch((e) => { console.log('HARNESS FAILED ' + String((e as Error)?.stack ?? e).split('\n')[0]); app.exit(2); });

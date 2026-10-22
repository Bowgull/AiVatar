// The pop-out on his Mac, measured ON SCREEN (2026-10-22, his report: "videos in the pop-out are laggy; between putting
// them in the pop-out and taking them off there is no smooth transition"). Real AangBrowser + real Popout + real wiring,
// a local 1080p30 VP9 clip (like YouTube), shown where he would see it, while ffmpeg films the screen (FILM=1).
// Per open and close it records: when each step happened (lend, window shown, first stage, picture in place, back in
// Samara), every view move, and the video's own presented frames (requestVideoFrameCallback), so a stutter is a gap
// between frames, not an impression. Input goes only into Samara's own views. Prints "FILM {...}".
//
// Needs $TMPDIR/popout-perf-media/clip1080.webm (see popout-perf.ts). Run: npx electron test/electron/popout-film.ts
import { app, BrowserWindow, WebContentsView, ipcMain, nativeImage } from 'electron';
import http from 'node:http';
import { createReadStream, existsSync, mkdtempSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

process.on('uncaughtException', (e) => { console.log('HARNESS NOTE ' + String((e as Error)?.message ?? e).split('\n')[0]); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e).split('\n').slice(0, 3).join(' | ')); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 180_000).unref();
const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLIP = path.join(os.tmpdir(), 'popout-perf-media', 'clip1080.webm');
const PORT = 47981;
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'popout-film-ud-')));
app.on('window-all-closed', () => { /* the film decides */ });
BrowserWindow.prototype.focus = function () { /* never takes his keyboard */ };
import { spawn } from 'node:child_process';
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let T0 = 0;
const now = () => Math.round(performance.now() - T0);
const evs: [number, string][] = [];
const ev = (k: string) => evs.push([now(), k]);

// The page: a video that keeps a list of when each frame was really presented.
const WATCH = `<!doctype html><title>Watch</title><style>body{margin:0;background:#000}video{width:100%;display:block}</style>
<div id="player"><video id="v" src="/clip.webm" loop muted playsinline></video></div><script>
const v = document.getElementById('v'); window.__frames = [];
const tick = (t, m) => { window.__frames.push([Math.round(performance.timeOrigin + t), m.presentedFrames]); v.requestVideoFrameCallback(tick); };
v.requestVideoFrameCallback(tick); v.play();</script>`;

app.whenReady().then(async () => {
  if (!existsSync(CLIP)) { console.log('HARNESS NO CLIP ' + CLIP); app.exit(2); return; }
  const size = statSync(CLIP).size;
  http.createServer((q, r) => {
    if (q.url?.startsWith('/clip.webm')) {
      const m = /bytes=(\d+)-(\d*)/.exec(String(q.headers.range ?? ''));
      if (m) { const a = Number(m[1]), z = m[2] ? Number(m[2]) : size - 1; r.writeHead(206, { 'Content-Type': 'video/webm', 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${a}-${z}/${size}`, 'Content-Length': z - a + 1 }); createReadStream(CLIP, { start: a, end: z }).pipe(r); }
      else { r.writeHead(200, { 'Content-Type': 'video/webm', 'Accept-Ranges': 'bytes', 'Content-Length': size }); createReadStream(CLIP).pipe(r); }
      return;
    }
    r.writeHead(200, { 'Content-Type': 'text/html' }).end(WATCH);
  }).listen(PORT, '127.0.0.1');
  const { servePages } = await import('../../src/pageserver.ts');
  const { Popout } = await import('../../src/popout.ts');
  const { wirePopout } = await import('../../src/popoutipc.ts');
  const { readSettings } = await import('../../src/settings.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const { wireBrowser } = await import('../../src/browseripc.ts');
  // SKIP=a,b: switch off one piece at a time to find a stall (capture, radius, focus, css, poll).
  const SKIP = new Set(String(process.env.SKIP ?? '').split(',').filter(Boolean));
  const { webContents: WC } = await import('electron');
  void WC;
  if (SKIP.has('radius')) WebContentsView.prototype.setBorderRadius = function () { /* skipped */ };
  if (SKIP.has('capture') || SKIP.has('focus') || SKIP.has('css') || SKIP.has('poll')) {
    const proto = Object.getPrototypeOf((await import('electron')).webContents.getAllWebContents()[0] ?? {}) as any;
    void proto;
  }
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const stateDir = mkdtempSync(path.join(os.tmpdir(), 'popout-film-state-'));
  const settings = { ...readSettings(stateDir), alwaysOnTop: true, clickThrough: false, fadeControls: true };
  const p: any = new Popout({ pages, preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'), settings: () => settings,
    remembered: () => ({ x: 900, y: 420, width: 640, height: 434 }), remember: () => {} } as any);
  const b: any = new AangBrowser({ origin: pages.origin, stateDir, preloadPath: path.join(HERE, '..', '..', 'src', 'preload.cjs'),
    tabPreloadPath: path.join(HERE, '..', '..', 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(HERE, '..', '..', 'src', 'settingspreload.cjs'),
    thingsPreloadPath: path.join(HERE, '..', '..', 'src', 'thingspreload.cjs') } as any);
  wireBrowser(() => b);
  const wired = wirePopout({ popout: () => p, browser: () => b, open: () => false, stopPaid: () => {}, sendToOther: () => {}, paidSeparately: () => false, openOnOther: () => {} } as any);
  b.setPopTab?.(wired.popTab);
  b.open(`http://127.0.0.1:${PORT}/watch`);
  b.win.setBounds({ x: 60, y: 60, width: 1100, height: 700 });
  // Samara is the window in front when he presses Popout, so the real tuck-away runs (Samara steps aside, comes back).
  (BrowserWindow as any).getFocusedWindow = () => b.win;
  // On top of his other windows for the minute this runs (a covered window draws no video frames), and the pop-out
  // counts as the window he is using when he closes it, so Samara comes back as it would for him.
  b.win.setAlwaysOnTop(true, 'floating');
  const foc = BrowserWindow.prototype.isFocused;
  BrowserWindow.prototype.isFocused = function (this: BrowserWindow) { return this === p.window ? true : foc.call(this); };
  const showAgain = BrowserWindow.prototype.showInactive;
  void showAgain;
  const mini = BrowserWindow.prototype.minimize, rest = BrowserWindow.prototype.restore, hide0 = BrowserWindow.prototype.hide;
  BrowserWindow.prototype.minimize = function (this: BrowserWindow) { ev('Samara minimize'); return mini.call(this); };
  BrowserWindow.prototype.restore = function (this: BrowserWindow) { ev('Samara restore'); return rest.call(this); };
  BrowserWindow.prototype.hide = function (this: BrowserWindow) { ev(this === b.win ? 'Samara hide' : 'pop-out hide'); return hide0.call(this); };

  // What happened when: window shows, view moves, stages, lend and give back.
  const show0 = BrowserWindow.prototype.showInactive, show1 = BrowserWindow.prototype.show;
  BrowserWindow.prototype.showInactive = function (this: BrowserWindow) { ev('window shown'); const r = show0.call(this); if (this === p.window) this.setAlwaysOnTop(true, 'floating'); return r; };
  BrowserWindow.prototype.show = function (this: BrowserWindow) { ev('window shown'); const r = show1.call(this); if (this === p.window) this.setAlwaysOnTop(true, 'floating'); return r; };
  const sb = WebContentsView.prototype.setBounds;
  WebContentsView.prototype.setBounds = function (this: WebContentsView, r: Electron.Rectangle) { if (this === tabView()) ev(`page view ${r.width}x${r.height}`); return sb.call(this, r); };
  ipcMain.on('popout:stage', () => ev('pop-out stage'));
  const lend0 = b.lend.bind(b); b.lend = (id: number) => { ev('lend'); return lend0(id); };
  const give0 = b.giveBack.bind(b); b.giveBack = (id: number, v: unknown) => { ev('give back'); return give0(id, v); };

  const tab = () => b.tabs[0];
  const patchTab = (wc: any) => {
    if (SKIP.has('capture')) wc.capturePage = () => Promise.resolve(nativeImage.createEmpty());
    const ej = wc.executeJavaScript.bind(wc);
    wc.executeJavaScript = (code: string, g?: boolean) => {
      if (SKIP.has('focus') && /data-aang-player', ''\)/.test(code)) return Promise.resolve(true);
      if (SKIP.has('poll') && /__aangVideo; if \(!v/.test(code)) return Promise.resolve(null);
      return ej(code, g);
    };
    if (SKIP.has('css')) wc.insertCSS = () => Promise.resolve('');
  };
  const tabView = () => tab()?.view as WebContentsView | undefined;
  for (let i = 0; i < 100 && !(tabView() && !tab().loading); i++) await wait(100);
  tabView()!.webContents.setAudioMuted(true);
  patchTab(tabView()!.webContents);
  await wait(1500);
  // Started the way he starts one: a real click on the video, then play (Samara holds pages that start by themselves).
  { const wc = tabView()!.webContents; const [x, y] = [300, 200];
    wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 }); await wait(40); wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
    await wait(100); await wc.mainFrame.executeJavaScript('document.getElementById("v").play().then(() => 1, (e) => String(e))', true).then((r) => console.log('PLAY ' + r)); }
  await wait(2500);
  console.log('VIDEO ' + JSON.stringify(await tabView()!.webContents.mainFrame.executeJavaScript('(() => { const v = document.getElementById("v"); return { t: v.currentTime, paused: v.paused, err: v.error && v.error.code, ready: v.readyState, frames: window.__frames.length, q: v.getVideoPlaybackQuality().totalVideoFrames }; })()', true)));
  const framesNow = async () => (await tabView()!.webContents.mainFrame.executeJavaScript('window.__frames.splice(0)', true)) as [number, number][];
  /** The video's longest gap between presented frames in a window, and frames shown vs expected at 30 fps. */
  const smooth = (fr: [number, number][], from: number, to: number) => {
    const inside = fr.filter(([t]) => t >= from && t <= to).map(([t]) => t);
    let gap = 0; for (let i = 1; i < inside.length; i++) gap = Math.max(gap, inside[i]! - inside[i - 1]!);
    // Frames shown in each quarter second, to see where in the window they were lost.
    const bins = Array.from({ length: Math.ceil((to - from) / 250) }, (_, i) => inside.filter((t) => t >= from + i * 250 && t < from + (i + 1) * 250).length);
    return { shown: inside.length, expected: Math.round((to - from) / 33.3), longestGapMs: gap, perQuarterSecond: bins };
  };
  const film = process.env.FILM ? spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'avfoundation', '-capture_cursor', '0', '-framerate', '30', '-i', '2:none', '-vf', 'scale=960:-2', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '26', process.env.FILM], { stdio: 'ignore' }) : null;
  const filmT0 = performance.now();
  if (film) await wait(800);
  const cycles: unknown[] = [];
  const filmMarks: [string, number][] = [];
  const frameWc = () => b.win.webContents as Electron.WebContents;
  for (let c = 0; c < (Number(process.env.CYCLES) || 3); c++) {
    await framesNow();
    evs.length = 0; T0 = performance.now();
    filmMarks.push(['open ' + (c + 1), Math.round(T0 - filmT0)]);
    // Open: the same message the tab menu's Popout sends.
    // He presses play again before popping it out (it came home paused last time, his rule).
    await tabView()!.webContents.mainFrame.executeJavaScript('document.getElementById("v").play().then(() => 1, () => 0)', true);
    await wait(600); await framesNow();
    T0 = performance.now();
    const abs0 = performance.timeOrigin + T0;
    ev('click Popout');
    await frameWc().executeJavaScript(`window.aang.browserPopout(${tab().id}); true`, true);
    for (let i = 0; i < 100 && !(p.window?.isVisible() && p.lent); i++) await wait(20);
    await wait(3500);
    const openFr = await framesNow();
    const open = { steps: evs.splice(0), video: smooth(openFr, abs0, abs0 + 2000), steady: smooth(openFr, abs0 + 2000, abs0 + 3000) };
    // Close: the pop-out's own close key.
    T0 = performance.now();
    filmMarks.push(['close ' + (c + 1), Math.round(T0 - filmT0)]);
    const abs1 = performance.timeOrigin + T0;
    ev('click close');
    await p.window.webContents.executeJavaScript(`document.getElementById('close').click(); true`, true);
    for (let i = 0; i < 100 && (p.window || tab().lent); i++) await wait(20);
    await wait(2500);
    const closeFr = await framesNow();
    cycles.push({ open, close: { steps: evs.splice(0), video: smooth(closeFr, abs1, abs1 + 1500), steady: smooth(closeFr, abs1 + 1500, abs1 + 2500) } });
  }
  if (film) { film.kill('SIGINT'); await new Promise((r) => film.once('exit', r)); }
  console.log('FILM ' + JSON.stringify({ filmT0: Math.round(filmT0), marks: filmMarks, machine: `${os.cpus()[0]?.model} x${os.cpus().length}`, cycles }));
  app.exit(0);
});

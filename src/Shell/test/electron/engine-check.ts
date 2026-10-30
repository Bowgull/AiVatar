// The page and capture engines (2026-10-30), in a real Electron, off screen. A page that never finishes loading (a
// picture that never ends, as live sites do), a page that hangs, Samara's whole window, and a recording of a page.
// Run: npx electron test/electron/engine-check.ts
import { app, BrowserWindow, WebContentsView } from 'electron';
import http from 'node:http';
import { mkdtempSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.on('uncaughtException', (e) => console.log('HARNESS NOTE ' + (e as Error).message));
process.on('warning', (w) => console.log('WARNING ' + String(w.message)));
process.on('unhandledRejection', (e) => console.log('REJECTION ' + String((e as Error)?.stack ?? e).split('\n').slice(0, 4).join(' | ')));
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 150_000).unref();
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'engine-ud-')));
app.on('window-all-closed', () => {});
// Real windows are shown (their views draw only then): shown here far off his screen, never taking focus.
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.showInactive(); };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`); if (!ok) fails++; };
app.whenReady().then(async () => {
  const { run, PageTimeout } = await import('../../src/page.ts');
  const { capture, captureWindow } = await import('../../src/capture.ts');
  const { Recorder } = await import('../../src/record.ts');
  const srv = http.createServer((q, r) => {
    if (q.url === '/slow') { r.writeHead(200, { 'Content-Type': 'image/png' }); return; }   // never ends
    if (q.url === '/hang') { r.writeHead(200, { 'Content-Type': 'text/html' }); r.end('<!doctype html><body style="background:#c33"><h1>hang</h1><script>setTimeout(() => { for (;;) {} }, 600)</script></body>'); return; }
    if (q.url === '/move') { r.writeHead(200, { 'Content-Type': 'text/html' }); r.end('<!doctype html><body style="margin:0"><canvas id=c width=640 height=360></canvas><script>const g=c.getContext("2d");let i=0;setInterval(()=>{g.fillStyle=`hsl(${i++*7%360},70%,50%)`;g.fillRect(0,0,640,360)},33)</script></body>'); return; }
    r.writeHead(200, { 'Content-Type': 'text/html' }); r.end('<!doctype html><body style="background:#3a6"><h1>still loading</h1><img src="/slow"></body>');
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
  const base = `http://127.0.0.1:${(srv.address() as any).port}`;

  // 1. A page that never stops loading: both worlds answer, and nothing is left waiting on it.
  const w = new BrowserWindow({ show: false, width: 900, height: 600, paintWhenInitiallyHidden: true, webPreferences: { backgroundThrottling: false } });
  w.show();
  void w.loadURL(base + '/').catch(() => {});
  await new Promise<void>((r) => { w.webContents.once('dom-ready', () => r()); });
  await wait(300);
  const wc = w.webContents;
  check(wc.isLoadingMainFrame() || wc.isLoading(), 'the test page is still loading (as live sites are)');
  const before = wc.listenerCount('did-stop-loading');
  let t0 = Date.now();
  const mainAns = await run<string>(wc, 'document.title || document.body.innerText', { ms: 2000 }).catch((e) => 'ERR ' + e.message);
  check(/still loading/.test(mainAns) && Date.now() - t0 < 2000, `main world answers at once while loading (${Date.now() - t0} ms)`);
  t0 = Date.now();
  const isoAns = await run<string>(wc, 'document.body.innerText', { world: 1061, ms: 3000 }).catch((e) => 'ERR ' + e.message);
  check(/still loading/.test(isoAns), `isolated world answers while loading (${Date.now() - t0} ms): ${isoAns.slice(0, 40)}`);
  const leaked = await run<string>(wc, 'typeof window.__engineMark', { world: 1061, ms: 2000 }).catch(() => '?');
  await run(wc, 'window.__engineMark = 1', { world: 1061, ms: 2000 }).catch(() => null);
  const seenByPage = await run<string>(wc, 'typeof window.__engineMark', { ms: 2000 }).catch(() => '?');
  check(leaked === 'undefined' && seenByPage === 'undefined', 'what runs in the isolated world stays out of the page\'s sight');
  for (let i = 0; i < 20; i++) await run(wc, '1', { world: 1061, ms: 1500, fallback: null });
  check(wc.listenerCount('did-stop-loading') <= before, `no listeners pile up (before ${before}, after 20 asks ${wc.listenerCount('did-stop-loading')})`);
  check(typeof (wc as any).isLoadingMainFrame === 'function' && !Object.prototype.hasOwnProperty.call(wc, 'isLoadingMainFrame'), 'the page is left exactly as it was');

  // 2. A page that hangs: the deadline holds, with a fallback and without one.
  const h = new BrowserWindow({ show: false, width: 600, height: 400, paintWhenInitiallyHidden: true });
  await h.loadURL(base + '/hang').catch(() => {});
  await wait(1200);
  t0 = Date.now();
  const fb = await run(h.webContents, '1+1', { ms: 800, fallback: 'late' });
  check(fb === 'late' && Date.now() - t0 < 1500, `a hung page gives the fallback at the deadline (${Date.now() - t0} ms)`);
  t0 = Date.now();
  const thrown = await run(h.webContents, '1+1', { world: 1061, ms: 800 }).then(() => null, (e) => e);
  check(thrown instanceof PageTimeout && Date.now() - t0 < 1500, `without a fallback it says so in words: "${thrown?.message}"`);
  t0 = Date.now();
  const hungPic = await capture(h, { ms: 1000 });
  check(Date.now() - t0 < 2500, `a picture of a hung page never hangs (${hungPic ? 'its last frame' : 'none'}, ${Date.now() - t0} ms)`);
  h.destroy();

  // 3. The capture size rule and the whole window: the frame and every view shown in it, in order.
  const shot = await capture(w);
  check(Boolean(shot) && shot!.width <= 900 && shot!.mime === 'image/jpeg', `a page picture is at its size on screen or less (${shot?.width}x${shot?.height}, ${Math.round((shot?.data.length ?? 0) / 1024)} KB)`);
  const v = new WebContentsView();
  w.contentView.addChildView(v);
  v.setBounds({ x: 100, y: 80, width: 400, height: 300 });
  await v.webContents.loadURL('data:text/html,<body style="margin:0;background:%23246">view</body>');
  await wait(600);
  const whole = await captureWindow(w, { format: 'image' });
  const px = (x: number, y: number) => { const s = whole!.image.getSize(); const b = whole!.image.toBitmap(); const i = (y * s.width + x) * 4; return [b[i + 2], b[i + 1], b[i]]; };
  check(Boolean(whole) && whole!.layers === 2, `the window picture has the frame and the view (${whole?.layers} layers, missing ${whole?.missing.join(', ') || 'none'})`);
  if (whole) {
    const inView = px(300, 230), outside = px(20, 500);
    check(inView[2]! > 80 && inView[0]! < 60, `the view is drawn where it sits (rgb ${inView.join(',')})`);
    check(outside[1]! > 120, `the page under it shows around it (rgb ${outside.join(',')})`);
  }

  // 4. A recording of a page through the browser's own capture (video and sound, real frames), saved as a file.
  const m = new BrowserWindow({ show: false, width: 640, height: 360, paintWhenInitiallyHidden: true, webPreferences: { offscreen: true, backgroundThrottling: false } });
  await m.loadURL(base + '/move').catch(() => {});
  await wait(500);
  const rec = new Recorder(mkdtempSync(path.join(os.tmpdir(), 'engine-rec-')));
  const started = await rec.start(m.webContents);
  console.log(`recording started: ${started.how}${rec.why ? ' (tab capture: ' + rec.why + ')' : ''}`);
  await wait(4000);
  const saved = await rec.stop();
  const size = saved ? statSync(saved.file).size : 0;
  check(Boolean(saved) && size > 20_000, `a 4 s recording was saved (${started.how}, ${saved?.seconds ?? 0} s, ${Math.round(size / 1024)} KB)`);
  console.log(fails ? `FAIL ${fails} check(s)` : 'PASS all engine checks');
  srv.closeAllConnections?.(); srv.close(); app.exit(fails ? 1 : 0);
});

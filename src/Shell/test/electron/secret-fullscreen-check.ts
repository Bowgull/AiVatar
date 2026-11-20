// 2026-11-18, his report: "the private window crashes and just goes full black screen that i cannot close when i full
// screen it". Samara's secret window (and, to compare, a normal one) built on the hidden desktop, a page put in full
// screen by its own button (a user gesture) and by the window (F11 / the window menu), what the window really shows
// measured from its composited picture (PrintWindow), then every way out tried: Esc, F11, and closing the window.
// Run it on the hidden desktop (from src/Shell), never on his screen:
//   powershell -NoProfile -ExecutionPolicy Bypass -File tools/hidden-desktop-run.ps1 -Command "engines/castlabs-44.5.1/electron.exe test/electron/secret-fullscreen-check-run.mjs"
//   SF_MODE=normal   a normal window instead of the secret one
//   SF_SRC=<dir>     another copy of Samara's src to test (the Mac: an installed Samara.app's, with the Mac's Electron)
// The Mac has no hidden desktop: its full screen takes over his screen (2026-11-19, his rule while playing on it: "stop
// taking my main screen"). Run it there only when he says the Mac is free.
//   SF_SHOTS=<dir>   where the window pictures go (default: a temp folder)
import { app, BrowserWindow, desktopCapturer, dialog, Menu } from 'electron';
import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os'; import path from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url';
// SF_SRC: another copy of Samara's code to test (the Mac's installed Samara.app), with its pages beside it.
const HERE0 = path.dirname(fileURLToPath(import.meta.url));
const SRC = process.env.SF_SRC || path.join(HERE0, '..', '..', 'src');
const { servePages } = await import(pathToFileURL(path.join(SRC, 'pageserver.ts')).href);
const { AangBrowser } = await import(pathToFileURL(path.join(SRC, 'browser.ts')).href);
const { wireBrowser } = await import(pathToFileURL(path.join(SRC, 'browseripc.ts')).href);
dialog.showErrorBox = () => {};
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 150_000).unref();
app.on('window-all-closed', () => {});
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'sf-ud-')));
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const MODE = process.env.SF_MODE === 'normal' ? 'normal' : 'secret';
const SHOTS = process.env.SF_SHOTS || mkdtempSync(path.join(os.tmpdir(), 'sf-shots-'));
mkdirSync(SHOTS, { recursive: true });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (fn: () => boolean | Promise<boolean>, ms = 6000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(150); } return false; };
const t0 = Date.now();
const log = (s: string) => console.log(`${String(Date.now() - t0).padStart(6)}ms ${s}`);
let bad = 0;
const check = (what: string, ok: boolean, d: unknown = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d !== '' ? '  -- ' + JSON.stringify(d).slice(0, 300) : ''}`); if (!ok) bad++; };

// A page that is all one bright colour, so a black window is a number: its own full screen button is a real click.
// His case is a video's own full screen button: a playing <video> (drawn from a canvas, bright green) goes full screen.
const PAGE = `<!doctype html><title>fs page</title><style>html,body{margin:0;height:100%;background:#2a8f4f}#box{width:100%;height:100%;background:#2a8f4f;display:grid;place-items:center;font:40px sans-serif;color:#fff}
video{width:640px;height:360px;background:#2a8f4f}</style>
<div id=box><video id=v muted autoplay playsinline></video><button id=go style="font-size:30px">Full screen</button></div>
<script>const c=document.createElement('canvas');c.width=640;c.height=360;const g=c.getContext('2d');let i=0;
setInterval(()=>{g.fillStyle='#2a8f4f';g.fillRect(0,0,640,360);g.fillStyle='#fff';g.fillRect((i+=8)%640,150,60,60)},33);
const v=document.getElementById('v');v.srcObject=c.captureStream(30);v.play().catch(()=>{});
document.getElementById('go').onclick=()=>(process.env_SF_BOX?document.getElementById('box'):v).requestFullscreen().catch(e=>document.title='fs error '+e.message)</script>`.replace('process.env_SF_BOX', process.env.SF_BOX === '1' ? 'true' : 'false');
const site = http.createServer((_q, r) => r.writeHead(200, { 'content-type': 'text/html' }).end(PAGE));
await new Promise<void>((r) => site.listen(0, '127.0.0.1', () => r()));
const PAGE_URL = `http://127.0.0.1:${(site.address() as { port: number }).port}/fs`;

const shot = async (w: BrowserWindow, name: string): Promise<{ w: number; h: number; luma: number; dark: number; raw: string }> => process.platform === 'win32' ? shotWin(w, name) : shotScreen(name);
// The Mac: the whole screen as the system draws it (the window's own Space when it is full screen).
const shotScreen = async (name: string) => {
  const [s] = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 960, height: 540 } }).catch(() => [null]);
  if (!s) return { w: 0, h: 0, luma: -1, dark: -1, raw: 'no picture (screen recording not allowed)' };
  void desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 960, height: 540 } });
  const img = s!.thumbnail, { width, height } = img.getSize(), px = img.toBitmap();
  let sum = 0, dark = 0, n = 0;
  for (let y = 0; y < height; y += 8) for (let x = 0; x < width; x += 8) { const o = (y * width + x) * 4; const l = 0.0722 * px[o]! + 0.7152 * px[o + 1]! + 0.2126 * px[o + 2]!; sum += l; if (l < 8) dark++; n++; }
  writeFileSync(path.join(SHOTS, `${MODE}-${name}.png`), img.toPNG());
  const luma = Math.round(sum / Math.max(1, n) * 10) / 10, d = Math.round(dark / Math.max(1, n) * 100) / 100;
  return { w: width, h: height, luma, dark: d, raw: `screen ${width} ${height} ${luma} ${d}` };
};
const shotWin = (w: BrowserWindow, name: string): Promise<{ w: number; h: number; luma: number; dark: number; raw: string }> => new Promise((res) => {
  const hwnd = w.getNativeWindowHandle().readBigInt64LE().toString();
  execFile('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(HERE, 'winshot.ps1'), '-Hwnd', hwnd, '-Out', path.join(SHOTS, `${MODE}-${name}.png`)], { timeout: 30000 }, (_e, out) => {
    const [, ww, hh, l, d] = String(out).trim().split(/\s+/);
    res({ w: Number(ww), h: Number(hh), luma: Number(l), dark: Number(d), raw: String(out).trim() });
  });
});

app.whenReady().then(async () => {
  // The real apps' menus: none on the PC (samara.ts), View > Enter Full Screen on the Mac (macmain.ts).
  Menu.setApplicationMenu(process.platform === 'darwin' ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { label: 'View', submenu: [{ role: 'togglefullscreen' }] }, { role: 'windowMenu' }]) : null);
  app.on('child-process-gone', (_e, d) => log(`CHILD GONE ${d.type} ${d.reason} ${d.exitCode}`));
  app.on('render-process-gone', (_e, wc, d) => log(`RENDERER GONE ${wc.getURL().slice(0, 80)} ${d.reason} ${d.exitCode}`));
  const st = mkdtempSync(path.join(os.tmpdir(), 'sf-state-'));
  mkdirSync(path.join(st, 'open-urls'));
  const sd = MODE === 'secret' ? path.join(st, 'secret') : st;
  mkdirSync(sd, { recursive: true });
  writeFileSync(path.join(st, 'browser-prefs.json'), '{}');
  const pages = await servePages(path.join(SRC, '..', 'pages'));
  const src = (f: string) => path.join(SRC, f);
  const b = new AangBrowser({ origin: pages.origin, stateDir: sd, ...(MODE === 'secret' ? { sharedDir: st, secret: true } : {}), preloadPath: src('samarapreload.cjs'), tabPreloadPath: src('tabpreload.cjs'),
    settingsPreloadPath: src('settingspreload.cjs'), thingsPreloadPath: src('thingspreload.cjs'), testLocal: true } as any) as any;
  wireBrowser(() => (MODE === 'secret' ? null : b), () => (MODE === 'secret' ? b : null));
  b.open(MODE === 'secret' ? undefined : PAGE_URL);
  await until(() => !!b.win, 8000);
  const w: BrowserWindow = b.win;
  w.setBounds({ x: 100, y: 80, width: 1200, height: 800 });
  for (const ev of ['enter-full-screen', 'leave-full-screen', 'close', 'closed', 'hide', 'show', 'unresponsive'] as const) w.on(ev as any, () => log(`window ${ev} full=${w.isDestroyed() ? '-' : w.isFullScreen()} opacity=${w.isDestroyed() ? '-' : w.getOpacity()}`));
  await until(() => !!b.cur()?.view, 15000);
  await wait(2500);
  const tab = b.cur();
  const wc = tab.view.webContents as Electron.WebContents;
  for (const ev of ['enter-html-full-screen', 'leave-html-full-screen', 'did-navigate'] as const) wc.on(ev as any, (_e: unknown, a?: unknown) => log(`page ${ev} ${typeof a === 'string' ? a.slice(0, 80) : ''}`));
  if (MODE === 'secret') { void wc.loadURL(PAGE_URL); }
  await until(() => wc.getURL().startsWith(PAGE_URL), 10000);
  await wait(1500);
  const js = (s: string) => wc.executeJavaScript(s, true).catch((e: Error) => 'ERR ' + e.message);
  const state = async () => `winFull=${w.isFullScreen()} visible=${w.isVisible()} opacity=${w.getOpacity()} pageFull=${tab.crashed ? 'n/a' : await js('!!document.fullscreenElement')} view=${JSON.stringify(tab.view?.getBounds())} fullTab=${b.fullTab} crashed=${tab.crashed} locked=${b.locked} pin=${b.pinOpen}`;
  log(`mode ${MODE} engine ${process.versions.electron} url ${wc.getURL()}`);
  log('before: ' + await state());
  const s0 = await shot(w, '0-before');
  log('picture before: ' + s0.raw);

  // 1. The page's own full screen button, a real click.
  const r = await js(`(() => { const q = document.getElementById('go').getBoundingClientRect(); return { x: Math.round(q.left + q.width / 2), y: Math.round(q.top + q.height / 2) }; })()`) as { x: number; y: number };
  wc.sendInputEvent({ type: 'mouseMove', x: r.x, y: r.y }); await wait(100);
  wc.sendInputEvent({ type: 'mouseDown', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  wc.sendInputEvent({ type: 'mouseUp', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  // The Mac sometimes drops a click while the window is still settling after it showed: one more.
  if (!await until(() => w.isFullScreen(), 2500)) { log('no full screen yet; clicking again. page says: ' + JSON.stringify(await js('({ title: document.title, focus: document.hasFocus(), active: navigator.userActivation.hasBeenActive, vis: document.visibilityState })')) + ' window focused=' + w.isFocused() + ' visible=' + w.isVisible()); wc.sendInputEvent({ type: 'mouseDown', x: r.x, y: r.y, button: 'left', clickCount: 1 }); wc.sendInputEvent({ type: 'mouseUp', x: r.x, y: r.y, button: 'left', clickCount: 1 }); }
  for (const at of [400, 1200, 3000]) { await wait(at === 400 ? 400 : at === 1200 ? 800 : 1800); log(`page full +${at}: ` + await state()); }
  const hintView = () => w.contentView.children.find((c: any) => /fullhint/.test(c.webContents?.getURL?.() ?? '')) as any;
  await until(() => hintView()?.getVisible() === true, 2500);
  const kids = w.contentView.children.map((c: any) => { const u = c.webContents?.getURL?.() ?? ''; return `${u.split('/').pop()}${c.getVisible() ? '' : '(hidden)'}@${JSON.stringify(c.getBounds())}`; });
  log('views, bottom to top: ' + kids.join(' | '));
  const shown = kids.filter((k) => !k.includes('(hidden)'));
  const hintOn = shown.length > 0 && /fullhint\.html@/.test(shown[shown.length - 1]!);
  const s1 = await shot(w, '1-page-full');
  log('picture page full: ' + s1.raw);
  check(`${MODE}: a page's own full screen fills the window`, w.isFullScreen() && b.fullTab === tab.id);
  check(`${MODE}: "Press Esc" shows over the page, inside Samara's own window (no window of its own)`, hintOn && BrowserWindow.getAllWindows().length === 1, kids);
  if (s1.luma >= 0) check(`${MODE}: a page's own full screen is not black`, s1.dark < 0.5 && s1.luma > 30, s1.raw);
  // Esc, to the page (where the keyboard is in full screen).
  wc.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
  await until(() => !w.isFullScreen(), 3000);
  await wait(600);
  log('after Esc: ' + await state());
  check(`${MODE}: Esc leaves a page's full screen`, !w.isFullScreen() && b.fullTab == null);

  // 2. The window's own full screen (F11 on the page; the window menu's "Full screen").
  const F11 = process.platform === 'darwin' ? null : 'F11';
  if (F11) { wc.sendInputEvent({ type: 'keyDown', keyCode: F11 }); wc.sendInputEvent({ type: 'keyUp', keyCode: F11 }); }
  const byF11 = await until(() => w.isFullScreen(), 2000);
  log(`F11 on the page: window full=${byF11}`);
  if (!byF11) w.setFullScreen(true);
  await wait(1500);
  log('window full: ' + await state());
  const s2 = await shot(w, '2-window-full');
  log('picture window full: ' + s2.raw);
  if (F11) check(`${MODE}: F11 puts the window in full screen`, byF11);
  if (s2.luma >= 0) check(`${MODE}: the window's full screen is not black`, s2.dark < 0.5 && s2.luma > 30, s2.raw);
  if (F11) { wc.sendInputEvent({ type: 'keyDown', keyCode: F11 }); wc.sendInputEvent({ type: 'keyUp', keyCode: F11 }); } else w.setFullScreen(false);
  const outF11 = await until(() => !w.isFullScreen(), 3000);
  check(`${MODE}: ${F11 ?? 'the menu'} again leaves it`, outF11);
  if (!outF11) w.setFullScreen(false);
  await wait(800);

  // 3. A page in full screen whose renderer dies: the way out must still work.
  wc.sendInputEvent({ type: 'mouseDown', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  wc.sendInputEvent({ type: 'mouseUp', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  await until(() => w.isFullScreen(), 3000);
  await wait(800);
  log('page full again: ' + await state());
  wc.forcefullyCrashRenderer();
  await wait(2500);
  log('after the page crashed: ' + await state());
  const s3 = await shot(w, '3-crashed-in-full');
  log('picture after crash: ' + s3.raw);
  check(`${MODE}: a page that crashes in full screen takes the window out of it`, !w.isFullScreen(), await state());
  if (s3.luma >= 0) check(`${MODE}: ...and never leaves a black window`, s3.dark < 0.5, s3.raw);
  // Alt+F4 / the close button: the window must close.
  w.close();
  const closed = await until(() => w.isDestroyed(), 4000);
  check(`${MODE}: the window closes (Alt+F4)`, closed);
  for (const x of BrowserWindow.getAllWindows()) { try { x.destroy(); } catch { /* gone */ } }
  site.close();
  console.log(bad ? `${bad} FAILED` : 'ALL PASS');
  console.log('pictures in ' + SHOTS);
  app.exit(bad ? 1 : 0);
});

// 2026-11-07, his report: a video's own full screen button (Prime) no longer fills the screen; core.log showed the window
// entering full screen and leaving it one second later. Samara built off his screen and see-through, a video's full
// screen button pressed with a real click, and every full screen event timed for four seconds; then Esc.
// Run (from src/Shell): engines/castlabs-44.5.1/electron.exe test/electron/fullscreen-check.ts   (or npx electron ...)
//   FS_URL=<a watch page>     (default: a YouTube video; a Prime detail page plays its Resume/Play button first)
//   FS_USERDATA=<folder>      a profile folder to use (his cookies copied in, for a signed-in site); default: a fresh one
import { app, BrowserWindow, dialog, screen } from 'electron';
import { mkdirSync, mkdtempSync } from 'node:fs';
import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts'; import { AangBrowser } from '../../src/browser.ts'; import { wireBrowser } from '../../src/browseripc.ts';
dialog.showErrorBox = () => {};
process.on('uncaughtException', (e) => { const t = String((e as Error)?.stack ?? e); console.log('HARNESS ERROR ' + t.split('\n').slice(0, 3).join(' | ')); if (!t.includes('assert(!this.paused)')) app.exit(2); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e).split('\n')[0]); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 150_000).unref();
app.on('window-all-closed', () => {});
app.setPath('userData', process.env.FS_USERDATA || mkdtempSync(path.join(os.tmpdir(), 'fs-ud-')));
// FS_SWITCHES=1: Samara's own paid-video switches (main.ts), to measure what they do to the CDM.
if (process.env.FS_SWITCHES === '1') {
  app.commandLine.appendSwitch('disable-direct-composition-video-overlays');
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion,HardwareSecureDecryption,HardwareSecureDecryptionExperiment,HardwareSecureDecryptionFallback');
} else app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
if (process.env.FS_EXTRA) for (const s of process.env.FS_EXTRA.split(' ')) { const [k, v] = s.replace(/^--/, '').split('='); if (k) app.commandLine.appendSwitch(k, v); }
const HERE = path.dirname(fileURLToPath(import.meta.url));
// Off his screen and see-through, never in front of him: a full screen window has to land on some screen.
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); this.setOpacity(0); this.showInactive(); };
BrowserWindow.prototype.focus = function () {};
BrowserWindow.prototype.moveTop = function () {};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (fn: () => boolean | Promise<boolean>, ms = 6000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(150); } return false; };
const t0 = Date.now();
const stamp = () => String(Date.now() - t0).padStart(6) + 'ms';
const URL0 = process.env.FS_URL || 'https://www.youtube.com/watch?v=jNQXAC9IVRw';
const PRIME = /primevideo\.com|amazon\./.test(URL0);
const FS_BUTTON = PRIME ? 'button[aria-label*="ull screen" i], button[aria-label*="ullscreen" i], .fullscreenButtonWrapper button, [class*="fullscreen" i] button'
  : '.ytp-fullscreen-button, .shaka-fullscreen-button, button[aria-label*="ull screen" i], button[aria-label*="ullscreen" i]';

app.whenReady().then(async () => {
  (screen as any).getCursorScreenPoint = () => ({ x: -20000, y: 500 });
  const st = mkdtempSync(path.join(os.tmpdir(), 'fs-state-'));
  mkdirSync(path.join(st, 'open-urls'));
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const src = (f: string) => path.join(HERE, '..', '..', 'src', f);
  const b = new AangBrowser({ origin: pages.origin, stateDir: st, preloadPath: src('preload.cjs'), tabPreloadPath: src('tabpreload.cjs'), settingsPreloadPath: src('settingspreload.cjs'), thingsPreloadPath: src('thingspreload.cjs'), testLocal: true } as any) as any;
  wireBrowser(() => b);
  b.open(URL0);
  await until(() => !!b.win, 8000);
  const w: BrowserWindow = b.win;
  w.setOpacity(0);
  w.setSize(1440, 900);
  const view = () => b.cur()?.view ?? b.tabs?.at(-1)?.view;
  await until(() => !!view(), 15000);
  const wc = view()!.webContents;
  const log = (s: string) => console.log(`${stamp()} ${s}`);
  for (const ev of ['enter-full-screen', 'leave-full-screen', 'resize', 'move', 'blur', 'focus', 'maximize', 'unmaximize'] as const) w.on(ev as any, () => log(`window ${ev} full=${w.isFullScreen()} bounds=${JSON.stringify(w.getBounds())}`));
  for (const ev of ['enter-html-full-screen', 'leave-html-full-screen', 'did-navigate', 'did-navigate-in-page', 'did-start-navigation', 'render-process-gone', 'media-started-playing', 'media-paused'] as const) wc.on(ev as any, (_e: unknown, a?: unknown) => log(`page ${ev} ${typeof a === 'string' ? a.slice(0, 100) : ''}`));
  wc.on('console-message', (_e, _l, m) => { if (/error|drm|widevine|fullscreen|playback/i.test(m)) log('console: ' + m.slice(0, 200)); });
  const js = (s: string) => wc.executeJavaScript(s, true).catch((e: Error) => 'ERR ' + e.message);
  const VIDEO_JS = "(() => { const v = document.querySelector('video'); return v ? [v.readyState, v.paused ? 'paused' : 'playing', Math.round(v.currentTime * 10) / 10, v.videoWidth + 'x' + v.videoHeight, v.error && v.error.code].join(' ') : 'none'; })()";
  const state = async () => 'winFull=' + w.isFullScreen() + ' pageFull=' + await js('!!document.fullscreenElement') + ' view=' + JSON.stringify(view()?.getBounds()) + ' fullTab=' + b.fullTab + ' video=' + await js(VIDEO_JS);
  const primeText = () => js("(() => { const e = document.querySelector('[class*=\"errorContainer\" i], [class*=\"error-\" i], [data-testid*=\"error\" i]'); return e ? e.innerText.replace(/\\s+/g, ' ').slice(0, 200) : ''; })()");
  log(`engine ${process.versions.electron} url ${URL0}`);
  await wait(3000);
  log('page: ' + wc.getURL() + ' | ' + wc.getTitle());
  // Which Widevine the page can get: hardware-secure (a display-only surface Shadow cannot stream) or software only.
  const cdm = async (robustness: string) => js(`navigator.requestMediaKeySystemAccess('com.widevine.alpha', [{ initDataTypes: ['cenc'], videoCapabilities: [{ contentType: 'video/mp4; codecs="avc1.42E01E"', robustness: ${JSON.stringify(robustness)} }] }]).then(() => 'yes', (e) => 'no (' + e.message + ')')`);
  const gi: any = await app.getGPUInfo('complete');
  log('overlays: ' + JSON.stringify(gi?.auxAttributes?.overlayInfo?.supportsOverlays ?? gi?.overlayInfo?.supportsOverlays));
  if (process.env.FS_PLAY === '1') {
    // A player that starts by itself (Shaka's demo): muted, then wait until its clock passes 2 s.
    await until(async () => (await js("(() => { const v = document.querySelector('video'); if (!v) return false; v.muted = true; if (v.paused) v.play().catch(() => {}); return v.currentTime > 2; })()")) === true, 45000);
    log('after play: ' + await state());
  }
  log(`widevine SW_SECURE_DECODE=${await cdm('SW_SECURE_DECODE')} HW_SECURE_DECODE=${await cdm('HW_SECURE_DECODE')} HW_SECURE_ALL=${await cdm('HW_SECURE_ALL')} switches=${process.env.FS_SWITCHES === '1'} extra=${process.env.FS_EXTRA ?? ''}`);
  if (PRIME) {
    // Signed in? Then press its Resume or Play button (a real click: a user gesture).
    const play = await js(`(() => { const e = [...document.querySelectorAll('a,button')].find((x) => /^(Resume|Play|Watch now|Play Episode)/i.test((x.innerText || x.getAttribute('aria-label') || '').trim())); if (!e) return null; e.scrollIntoView({ block: 'center' }); const q = e.getBoundingClientRect(); return { x: Math.round(q.left + q.width / 2), y: Math.round(q.top + q.height / 2), label: (e.innerText || e.getAttribute('aria-label') || '').trim().slice(0, 40), href: e.href || '' }; })()`);
    log('play button ' + JSON.stringify(play));
    if (!play) { log('signed in? ' + await js(`document.body.innerText.includes('Sign in') ? 'no (Sign in shown)' : 'maybe'`)); app.exit(5); return; }
    wc.sendInputEvent({ type: 'mouseMove', x: play.x, y: play.y });
    wc.sendInputEvent({ type: 'mouseDown', x: play.x, y: play.y, button: 'left', clickCount: 1 });
    wc.sendInputEvent({ type: 'mouseUp', x: play.x, y: play.y, button: 'left', clickCount: 1 });
    const playing = await until(async () => (await js(`(() => { const v = document.querySelector('video'); return !!v && v.readyState >= 2 && v.currentTime > 0; })()`)) === true, 40000);
    log('playing: ' + playing + ' | ' + await state() + ' | ' + wc.getURL());
    if (!playing) { log('prime says: ' + await primeText()); }
    // Its controls show on a mouse move over the picture.
    wc.sendInputEvent({ type: 'mouseMove', x: 700, y: 400 }); await wait(400); wc.sendInputEvent({ type: 'mouseMove', x: 720, y: 420 }); await wait(400);
  }
  const ready = await until(async () => (await js(`!!document.querySelector(${JSON.stringify(FS_BUTTON)})`)) === true, 30000);
  log('full screen button present: ' + ready);
  if (!ready) { log('buttons: ' + await js(`[...document.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') || b.innerText.trim()).filter(Boolean).slice(0, 40).join(' | ')`)); app.exit(4); return; }
  await wait(1500);
  log('before: ' + await state());
  // A real click on the button (the page needs a user gesture for full screen).
  const r = await js(`(() => { const e = document.querySelector(${JSON.stringify(FS_BUTTON)}); e.scrollIntoView({ block: 'center' }); const q = e.getBoundingClientRect(); return { x: Math.round(q.left + q.width / 2), y: Math.round(q.top + q.height / 2), label: e.getAttribute('aria-label') || e.title, w: Math.round(q.width), h: Math.round(q.height) }; })()`);
  log('button ' + JSON.stringify(r));
  wc.sendInputEvent({ type: 'mouseMove', x: r.x, y: r.y }); await wait(200);
  wc.sendInputEvent({ type: 'mouseDown', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  wc.sendInputEvent({ type: 'mouseUp', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  for (let i = 0; i < 20; i++) { await wait(250); log('sample: ' + await state()); }
  if (PRIME) log('prime says: ' + await primeText());
  log('pressing Esc');
  wc.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
  for (let i = 0; i < 8; i++) { await wait(250); log('sample: ' + await state()); }
  for (const x of BrowserWindow.getAllWindows()) { try { x.destroy(); } catch { /* gone */ } }
  pages.close?.();
  app.exit(0);
});

// Phase 2 of the browser plan (his call, 2026-11-17): what a new engine must still do before it is offered, or put in by
// itself overnight. Every check here is BLOCKING: it asks the engine itself, with Samara's real code where there is
// some. A failure means the engine is not offered (engineupdate.ts runs this before calls-check.ts).
//
//   1. A public page loads (example.com, or Wikipedia if that one is down).
//   2. castLabs engines only: Widevine loads, and a protected test stream (Google's Shaka demo, Widevine, its open
//      licence server) plays a few seconds, with the same switches main.ts sets (software decryption, no overlay).
//   3. The phishing block still fires: Samara's own browser (browser.ts) stops a listed site on a link and on a redirect.
//   4. A download lands, and Samara marks it as from the internet (Windows' Zone.Identifier; Apple's quarantine on a Mac).
//
// Nothing shows on his screen: the windows are never shown, the profile and the downloads folder are throwaway ones.
// Prints "ENGINE chrome=<Chromium version>" for the security tier.
//
// Run: npx electron test/electron/engine-safety-check.ts
import { app, BrowserWindow } from 'electron';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.on('uncaughtException', (e) => { console.log('HARNESS NOTE ' + String((e as Error).message).split('\n')[0]); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e)); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 150_000).unref();
app.on('window-all-closed', () => { /* the test decides */ });
app.on('child-process-gone', (_e, d) => console.log(`INFO  child process gone  -- ${d.type} ${d.reason} ${d.exitCode}`));
app.on('render-process-gone', (_e, _wc, d) => console.log(`INFO  page process gone  -- ${d.reason} ${d.exitCode}`));
app.dock?.hide();

const castlabs = Boolean((await import('electron') as any).components);
// The switches Samara runs castLabs with (main.ts, samara.ts): protected video decrypted in software, never an overlay.
if (castlabs) {
  app.commandLine.appendSwitch('disable_direct_composition_video_overlays');
  app.commandLine.appendSwitch('disable-features', 'HardwareSecureDecryption,HardwareSecureDecryptionExperiment,HardwareSecureDecryptionFallback');
}
const TMP = mkdtempSync(path.join(os.tmpdir(), 'engine-safety-'));
app.setPath('userData', path.join(TMP, 'profile'));
app.setPath('downloads', path.join(TMP, 'downloads'));
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHELL = path.resolve(HERE, '..', '..');
// Never on his screen, never his focus: far off to the left, shown without taking the front (as every check here does).
const showInactive = BrowserWindow.prototype.showInactive;
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.setPosition(-6000, 100); showInactive.call(this); };
BrowserWindow.prototype.focus = function () { /* not in a test */ };

let bad = 0;
const check = (what: string, ok: boolean, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d ? '  -- ' + d : ''}`); if (!ok) bad++; };
const info = (what: string, d: string) => console.log(`INFO  ${what}  -- ${d}`);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (f: () => boolean | Promise<boolean>, ms: number) => { const end = Date.now() + ms; while (Date.now() < end) { if (await f()) return true; await wait(200); } return false; };

// The protected test stream: Google's Shaka demo "Angel One", Widevine, its smallest picture (144p), from its own start.
const DRM = { file: 'https://storage.googleapis.com/shaka-demo-assets/angel-one-widevine/v-0144p-0100k-libx264.mp4', licence: 'https://cwip-shaka-proxy.appspot.com/no_auth', codec: 'video/mp4; codecs="avc1.42c01e"' };
const DRM_PAGE = `<!doctype html><title>drm</title><video id="v" muted playsinline></video><script>
window.result = { state: 'starting' };
(async () => {
  const v = document.getElementById('v');
  try {
    const access = await navigator.requestMediaKeySystemAccess('com.widevine.alpha', [{ initDataTypes: ['cenc'], videoCapabilities: [{ contentType: ${JSON.stringify(DRM.codec)}, robustness: 'SW_SECURE_CRYPTO' }] }]);
    await v.setMediaKeys(await access.createMediaKeys());
    v.addEventListener('encrypted', async (e) => {
      try {
        const s = v.mediaKeys.createSession();
        s.addEventListener('message', async (m) => {
          try {
            const r = await fetch(${JSON.stringify(DRM.licence)}, { method: 'POST', body: m.message });
            if (!r.ok) { window.result = { state: 'licence refused ' + r.status }; return; }
            await s.update(await r.arrayBuffer());
            window.result.licence = true;
          } catch (x) { window.result = { state: 'licence failed: ' + x.message }; }
        });
        await s.generateRequest(e.initDataType, e.initData);
      } catch (x) { window.result = { state: 'session failed: ' + x.message }; }
    }, { once: true });
    const ms = new MediaSource();
    v.src = URL.createObjectURL(ms);
    await new Promise((r) => ms.addEventListener('sourceopen', r, { once: true }));
    const sb = ms.addSourceBuffer(${JSON.stringify(DRM.codec)});
    const got = await fetch(${JSON.stringify(DRM.file)}, { headers: { Range: 'bytes=0-1400000' } });
    sb.appendBuffer(await got.arrayBuffer());
    await new Promise((r) => sb.addEventListener('updateend', r, { once: true }));
    window.result.state = 'buffered';
    await v.play();
    window.result.state = 'playing';
  } catch (x) { window.result = { state: 'failed: ' + (x && x.message || x) }; }
})();
</script>`;

app.whenReady().then(async () => {
  console.log(`ENGINE chrome=${process.versions.chrome} electron=${process.versions.electron} castlabs=${castlabs}`);
  // A tiny local server: the DRM page (EME needs a secure origin; 127.0.0.1 is one), a redirect to a listed site, a file.
  const srv = http.createServer((q, r) => {
    if (q.url === '/drm') { r.writeHead(200, { 'Content-Type': 'text/html' }).end(DRM_PAGE); return; }
    if (q.url === '/go') { r.writeHead(302, { Location: 'https://phish-test.invalid/redirected' }).end(); return; }
    if (q.url === '/notes.txt') { r.writeHead(200, { 'Content-Type': 'text/plain', 'Content-Disposition': 'attachment; filename="notes.txt"' }).end('engine check\n'); return; }
    r.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>start</title><a id="a" href="https://phish-test.invalid/login">a link</a>');
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
  const local = `http://127.0.0.1:${(srv.address() as any).port}`;

  // ---------------------------------------------------------------- 1. a public page loads
  const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, offscreen: true } });
  let loaded = '';
  for (const [u, want] of [['https://example.com/', /Example Domain/], ['https://www.wikipedia.org/', /Wikipedia/]] as const) {
    try { await Promise.race([w.loadURL(u), wait(20_000).then(() => { throw new Error('timed out'); })]); if (want.test(w.webContents.getTitle())) { loaded = u; break; } info('public page', `${u}: title "${w.webContents.getTitle()}"`); }
    catch (e) { info('public page', `${u}: ${(e as Error).message}`); }
  }
  check('a public page loads', !!loaded, loaded || 'neither example.com nor wikipedia.org loaded');

  // ---------------------------------------------------------------- 2. Widevine and a protected stream (castLabs only)
  if (!castlabs) info('Widevine', 'a stock engine has none; paid video is not asked of it');
  else {
    const el = await import('electron') as any;
    let status = '';
    try { await Promise.race([el.components.whenReady(), wait(60_000).then(() => { throw new Error('not ready after a minute'); })]); status = JSON.stringify(el.components.status()); }
    catch (e) { status = 'did not load: ' + (e as Error).message; }
    check('Widevine loads', /widevine/i.test(status) && !/did not load/.test(status), status.slice(0, 200));
    await w.loadURL(`${local}/drm`);
    const played = await until(async () => {
      const t = await w.webContents.executeJavaScript(`({ t: document.getElementById('v').currentTime, r: window.result })`, true);
      return t.t >= 3 || /fail|refused/.test(String(t.r?.state));
    }, 45_000);
    const end = await w.webContents.executeJavaScript(`({ t: document.getElementById('v').currentTime, r: window.result, frames: document.getElementById('v').getVideoPlaybackQuality?.().totalVideoFrames })`, true);
    check('a protected test stream plays a few seconds', played && end.t >= 3 && end.r?.licence === true, JSON.stringify(end));
  }
  w.hide();   // (destroying it can upset the next window's load; it closes with the run)

  // ---------------------------------------------------------------- 3 and 4: Samara's own browser
  const { servePages } = await import('../../src/pageserver.ts');
  const { AangBrowser } = await import('../../src/browser.ts');
  const { wireBrowser } = await import('../../src/browseripc.ts');
  const pages = await servePages(path.join(SHELL, 'pages'));
  // The real lists are a day's download; this one lists one made-up site. What is checked is that the engine still
  // gives Samara every navigation and redirect before it happens, and honours the stop.
  const phish = { ready: true, check: (u: string) => (/^https?:\/\/phish-test\.invalid\//.test(u) ? ['TEST LIST'] : []), count: () => 1, start: async () => {}, refresh: async () => {} };
  const b = new AangBrowser({ origin: pages.origin, stateDir: path.join(TMP, 'state'), preloadPath: path.join(SHELL, 'src', 'preload.cjs'), phish: phish as never,
    tabPreloadPath: path.join(SHELL, 'src', 'tabpreload.cjs'), settingsPreloadPath: path.join(SHELL, 'src', 'settingspreload.cjs'), thingsPreloadPath: path.join(SHELL, 'src', 'thingspreload.cjs') });
  wireBrowser(() => b);
  b.open(`${local}/start`);
  const tabOf = () => (b as any).tabs.find((x: any) => x.view && /127\.0\.0\.1/.test(x.view.webContents.getURL() || x.url)) ?? (b as any).tabs[0];
  await until(() => { const t = tabOf(); return !!t?.view && t.view.webContents.getURL().startsWith(local) && !t.view.webContents.isLoading(); }, 15_000);
  const tab = tabOf();
  const wc = tab?.view?.webContents as Electron.WebContents | undefined;
  if (!wc) check('Samara opens a tab on this engine', false);
  else {
    // Clicked from the page itself, as his click would be (a link is where Samara stops a listed site first).
    await wc.executeJavaScript(`setTimeout(() => document.getElementById('a').click(), 50); true`, true);
    const linkStopped = await until(() => tab.blocked?.lists?.[0] === 'TEST LIST', 8000);
    check('a link to a listed site is stopped before it loads', linkStopped && !/phish-test/.test(wc.getURL()), JSON.stringify({ blocked: tab.blocked, at: wc.getURL() }));
    tab.blocked = null;
    await wc.loadURL(`${local}/start`).catch(() => {});
    await wc.executeJavaScript(`location.href = '/go'; true`, true);
    const redirStopped = await until(() => tab.blocked?.url === 'https://phish-test.invalid/redirected', 8000);
    check('a redirect to a listed site is stopped too', redirStopped && !/phish-test/.test(wc.getURL()), JSON.stringify({ blocked: tab.blocked, at: wc.getURL() }));
    tab.blocked = null;

    // ---------------------------------------------------------------- 4. a download, marked from the internet
    await wc.loadURL(`${local}/start`).catch(() => {});
    wc.downloadURL(`${local}/notes.txt`);
    const dl = path.join(TMP, 'downloads');
    const landed = await until(() => { try { return readdirSync(dl).some((f) => f === 'notes.txt'); } catch { return false; } }, 15_000);
    await wait(800);   // the mark is written when the download is done
    let mark = '';
    const file = path.join(dl, 'notes.txt');
    if (process.platform === 'darwin') { try { mark = execFileSync('/usr/bin/xattr', ['-p', 'com.apple.quarantine', file], { encoding: 'utf8' }); } catch { mark = ''; } }
    else { try { mark = readFileSync(file + ':Zone.Identifier', 'utf8'); } catch { mark = ''; } }
    check('a download lands whole', landed && readFileSync(file, 'utf8') === 'engine check\n');
    check(process.platform === 'darwin' ? 'it carries Apple\'s quarantine mark' : 'it carries Windows\' Zone.Identifier (from the internet)', process.platform === 'darwin' ? mark.length > 0 : /ZoneId=3/.test(mark), mark.replace(/\r?\n/g, ' ').slice(0, 120));
  }

  console.log(bad ? `${bad} FAILED` : 'ALL PASS');
  srv.close(); pages.close?.();
  app.exit(bad ? 1 : 0);
});

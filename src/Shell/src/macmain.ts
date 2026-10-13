// M6 (his interview, 2026-10-13): Aang's browser on his MacBook. The same browser as on the PC (browser.ts and its
// pages, unchanged), started on its own: no pet, no bubble yet (those are M7 to M9). It keeps everything in step with
// the PC's browser through Aang's brain on the PC, over Tailscale (bsync.ts): bookmarks, settings, the same open
// tabs, history and logins. Money sites never travel. When the PC is off it works on its own and catches up later.
//
// Run as the "Aang" app the Mac setup makes (Aang.app in ~/Applications). It can be his default browser (his yes).
import { app, ipcMain, Menu, nativeImage } from 'electron';
import { appendFileSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { servePages } from './pageserver.ts';
import { AangBrowser } from './browser.ts';
import { wireBrowser } from './browseripc.ts';
import { DrmRuntime } from './drmrunner.ts';
import { serviceFor } from './services.ts';

const HERE = import.meta.dirname;
const LISTENER = path.join(os.homedir(), 'Library', 'Application Support', 'AangListener');
const SYNC_PORT = 47832;   // the brain's hook port on the PC

app.setName('Aang');
// Started from the Dock there is no terminal: what it says goes to a log beside its settings (aang.log, kept small).
{
  const logFile = path.join(app.getPath('userData'), 'aang.log');
  try { if (statSync(logFile).size > 2_000_000) writeFileSync(logFile, ''); } catch { /* none yet */ }
  const write = (s: string) => { try { appendFileSync(logFile, new Date().toISOString().slice(0, 19).replace('T', ' ') + ' ' + s + '\n'); } catch { /* best effort */ } };
  console.log = (...a: unknown[]) => write(a.map(String).join(' '));
  console.error = (...a: unknown[]) => write(a.map(String).join(' '));
}
process.on('uncaughtException', (e) => console.error('aang: ' + e.stack));
process.on('unhandledRejection', (e) => console.error('aang: ' + String((e as Error)?.stack ?? e)));

let browser: AangBrowser | null = null;
const waiting: string[] = [];
const openUrl = (u: string) => {
  try { const x = new URL(u); if (x.protocol !== 'http:' && x.protocol !== 'https:') return; } catch { return; }
  if (browser) browser.open(u); else waiting.push(u);
};
// A link he clicked while Aang is his default browser. It can arrive before the app is ready.
app.on('open-url', (e, u) => { e.preventDefault(); openUrl(u); });

if (!app.requestSingleInstanceLock()) app.quit();

app.whenReady().then(async () => {
  // The Mac's own menu, so Cmd+C, Cmd+V, Cmd+Q and the rest work as on every Mac app.
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' },
  ]));
  try { app.dock?.setIcon(nativeImage.createFromPath(path.join(HERE, '..', 'pages', 'art', 'aang-face.png'))); } catch { /* the app's own icon stays */ }

  // Every button, menu and page of the browser, the same wiring as on the PC.
  wireBrowser(() => browser);
  const stateDir = app.getPath('userData');
  const pages = await servePages(path.join(HERE, '..', 'pages'));
  browser = new AangBrowser({
    origin: pages.origin, stateDir, preloadPath: path.join(HERE, 'preload.cjs'), tabPreloadPath: path.join(HERE, 'tabpreload.cjs'),
    settingsPreloadPath: path.join(HERE, 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, 'thingspreload.cjs'),
  });
  // Tidy asks Aang's brain, which is on the PC: from the Mac it says it is not reachable yet (until M7 links them).
  browser.onTidyAsk = (id) => browser?.tidyAnswer(id, { ok: false, why: 'offline' });
  // Paid video (2026-10-13): Netflix, Crave, Disney+, Prime and Crunchyroll play in the castLabs window, signed for
  // streaming on his own free castLabs account. Hardware acceleration stays on: there is no Shadow capture here.
  const drm = new DrmRuntime({ shellDir: path.join(HERE, '..'), stateDir });
  browser.onPaid = (url) => {
    const paid = serviceFor(url);
    if (!paid?.ready) return false;
    const why = drm.open(url, 'narrow');
    if (why) { console.error('aang: ' + why); return false; }
    return true;
  };
  ipcMain.on('browser:popout', (e, id) => {
    if (!browser?.isFrame(e.sender) || !Number.isInteger(id)) return;
    const url = browser.urlOf(id);
    if (url && serviceFor(url)) browser.onPaid?.(url);
  });
  app.on('before-quit', () => drm.close());
  browser.open(waiting.shift());
  for (const u of waiting.splice(0)) browser.open(u);

  // His yes (2026-10-13): Aang's browser is the Mac's default. macOS asks him once, in its own window.
  const asked = path.join(stateDir, 'asked-default.flag');
  if (!existsSync(asked)) {
    try { app.setAsDefaultProtocolClient('http'); app.setAsDefaultProtocolClient('https'); } catch { /* he can set it in System Settings */ }
    try { writeFileSync(asked, new Date().toISOString()); } catch { /* asked again next time */ }
  }

  // ---- the sync, through the brain on the PC
  const read = (f: string) => { try { return readFileSync(path.join(LISTENER, f), 'utf8').trim(); } catch { return ''; } };
  const key = read('bsync.key'), shadow = read('shadow');
  let ws: WebSocket | null = null;
  const sync = browser.startSync((m) => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); }, (s) => console.log('aang: ' + s));
  const connect = () => {
    if (!key || !/^100\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(shadow)) { console.log('aang: no sync key or PC address yet; run the Mac setup again'); return; }
    const s = new WebSocket(`ws://${shadow}:${SYNC_PORT}/bsync`, { headers: { 'x-aang-key': key }, maxPayload: 64 * 1024 * 1024 });
    ws = s;
    s.on('message', (raw) => {
      let m: any; try { m = JSON.parse(String(raw)); } catch { return; }
      if (typeof m?.t === 'string' && m.t.startsWith('bsync.')) void sync.got(m).catch((e: Error) => console.error('aang: sync: ' + e.message));
      // His yes (2026-10-13): Claude may look at this browser's own window and its log, when it asks.
      else if (m?.t === 'diag.ask' && browser) {
        void browser.look().then((l) => {
          let log = ''; try { log = readFileSync(path.join(app.getPath('userData'), 'aang.log'), 'utf8').split('\n').slice(-150).join('\n'); } catch { /* none */ }
          if (s.readyState === WebSocket.OPEN) s.send(JSON.stringify({ t: 'diag.reply', id: String(m.id ?? ''), ...l, log, versions: { electron: process.versions.electron, macos: process.getSystemVersion?.() ?? '' } }));
        }).catch((e: Error) => console.error('aang: look: ' + e.message));
      }
    });
    s.on('close', () => { if (ws === s) { ws = null; void sync.link(false); setTimeout(connect, 15_000); } });
    s.on('error', () => { /* close follows */ });
  };
  connect();

  // A Mac app stays open with no windows; clicking it in the Dock brings the browser back.
  app.on('activate', () => browser?.open());
  app.on('second-instance', () => browser?.open());
  app.on('before-quit', () => { browser?.closeAll(); pages.close(); });
});

// Closing the last window does not quit: the sync keeps running, as Mac apps do. Cmd+Q quits.
app.on('window-all-closed', () => { /* stay */ });

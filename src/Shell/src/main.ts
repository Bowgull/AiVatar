// Aang's Shell: every window he draws, from FINAL AANG BUILD Phase 6 onward.
//
// What stays in C#: the pet, the tray, the hotkeys, screen reading and window placement. Nothing else
// on Windows can do those. What lives here: the pop-out, the new bubble, window 2 and the browser.
//
// It talks to the brain over the WebSocket that already exists, with the password from step S1. THE
// PROTOCOL DOES NOT CHANGE: this is a second client beside the C# one, not a new language.
//
// A crash in here must never take the pet or the brain with it. It is its own process, supervised from
// the tray, and it holds nothing the others need.
import { app, BrowserWindow, Menu, ipcMain, session } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CoreLink } from './link.ts';
import { SAFE_WEB_PREFERENCES, denyPermissions, lockDown, wrongSettings } from './safety.ts';
import { snapshotOnce } from './snapshot.ts';
import { servePages, type PageServer } from './pageserver.ts';
import { Popout, popoutFile } from './popout.ts';
import { holdHotkey, type Hotkey } from './hotkey.ts';
import { DrmRuntime } from './drmrunner.ts';
import { notReadyBecause, serviceFor } from './services.ts';
import { readSettings, writeSettings, type PopoutSettings } from './settings.ts';
import { FindSkips } from './skip/find.ts';
import { DEFAULT_SKIPS, withDefaults, type SkipSettings } from './skip/settings.ts';
import { blockAds, type AdBlock } from './skip/ads.ts';
import type { Box } from './geometry.ts';

const PORT = Number(process.env.AANG_PORT ?? 47831);
const STATE_DIR = process.env.AANG_STATE_DIR
  ?? path.join(process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'), 'Aang');
const DATA_DIR = process.env.AANG_DATA_DIR ?? path.join(os.homedir(), 'Documents', 'Aang');
const HERE = import.meta.dirname;

/**
 * One Shell at a time. A second copy would fight the first for the same windows, and on this machine
 * the tray can race its own restart.
 */
if (!app.requestSingleInstanceLock()) {
  console.log('shell: another one is already running');
  app.exit(0);
}

/** Every window this Shell has open, by kind, so the brain's messages reach the right one. */
const windows = new Map<string, BrowserWindow>();

/** The pop-out's size and place, remembered between runs. His rule: "your size wins." */
function rememberedBox(): Box | null {
  try {
    const f = popoutFile(STATE_DIR);
    if (!existsSync(f)) return null;
    const j = JSON.parse(readFileSync(f, 'utf8'));
    const ok = ['x', 'y', 'width', 'height'].every(k => Number.isFinite(j?.[k]));
    return ok ? { x: j.x, y: j.y, width: j.width, height: j.height } : null;
  } catch { return null; }
}
function rememberBox(box: Box): void {
  try { writeFileSync(popoutFile(STATE_DIR), JSON.stringify(box)); }
  catch (e) { console.error('shell: could not remember the pop-out size: ' + (e as Error).message); }
}

let pages: PageServer | null = null;
let popout: Popout | null = null;
let hotkey: Hotkey | null = null;
let ads: AdBlock | null = null;
/** His pop-out switches. Read once at start and kept in step when he changes one. */
let settings: PopoutSettings = readSettings(STATE_DIR);
/** What he has asked Aang to skip. Twitch ads are off until he decides (step 6.6). */
let skipSettings: SkipSettings = DEFAULT_SKIPS;
try {
  const f = path.join(STATE_DIR, 'skips.json');
  if (existsSync(f)) skipSettings = withDefaults(JSON.parse(readFileSync(f, 'utf8')));
} catch { /* an unreadable file means the defaults, never a refusal to start */ }
/** The separate castLabs process that plays paid video (step 6.4). */
let drm: DrmRuntime | null = null;

const link = new CoreLink({
  port: PORT,
  stateDir: STATE_DIR,
  onMessage: m => {
    // "Put X on": the one message the pop-out answers to. Everything else is passed to the windows.
    if (m.t === 'popout.open' && typeof m.url === 'string') {
      // Paid video goes to the separate castLabs process: hardware acceleration has to be off for it,
      // and that is process-wide. Everything else plays in the ordinary pop-out (step 6.4).
      const paid = serviceFor(m.url);
      if (paid) {
        if (!paid.ready) { console.error(`shell: ${notReadyBecause(paid.id)}`); return; }
        popout?.close();                       // one at a time, across both runtimes (decision 34)
        const why = drm?.open(m.url);
        if (why) console.error(`shell: ${why}`);
        return;
      }
      drm?.close();
      if (!popout?.open(m.url)) console.error(`shell: nothing playable in ${String(m.url).slice(0, 80)}`);
      return;
    }
    if (m.t === 'popout.close') { popout?.close(); drm?.close(); return; }
    for (const w of windows.values()) if (!w.isDestroyed()) w.webContents.send('brain:message', m);
  },
  onConnected: up => { for (const w of windows.values()) if (!w.isDestroyed()) w.webContents.send('brain:connected', up); },
});

/** Make a window with the safe settings, locked down, showing one of the Shell's own pages. */
function open(kind: string, page: string, opts: Electron.BrowserWindowConstructorOptions = {}): BrowserWindow {
  const existing = windows.get(kind);
  if (existing && !existing.isDestroyed()) { existing.show(); existing.focus(); return existing; }

  const prefs = { ...SAFE_WEB_PREFERENCES, preload: path.join(HERE, 'preload.cjs'), ...(opts.webPreferences ?? {}) };
  // Checked before the window exists, not after: a window that is not locked down should never be
  // drawn at all. A later window can pass its own settings, and this is what stops one quietly
  // dropping the sandbox.
  const wrong = wrongSettings(prefs as Record<string, unknown>);
  if (wrong.length) throw new Error(`refusing to open [${kind}]: ${wrong.join(', ')}`);

  const win = new BrowserWindow({
    width: 520, height: 420, show: false, backgroundColor: '#100A22',
    title: 'Aang',
    ...opts,
    webPreferences: prefs,
  });
  lockDown(win.webContents);
  // A page that breaks must say so somewhere Joshua can find it, not fail in silence behind glass.
  win.webContents.on('console-message', e => {
    if (e.level === 'error' || e.level === 'warning') console.error(`shell page [${kind}] ${e.sourceId}:${e.lineNumber} ${e.message}`);
  });
  win.webContents.on('preload-error', (_e, file, err) => {
    console.error(`shell preload failed [${kind}] ${file}: ${err.message}`);
  });
  // Tell a new page where things stand the moment it can listen. Without this a window that opens
  // after the brain connected sits on "starting..." forever, because it missed the announcement: found
  // on the first real run of the Shell, 2026-10-04.
  win.webContents.on('did-finish-load', () => {
    if (!win.isDestroyed()) win.webContents.send('brain:connected', link.connected);
  });
  // Shown only once it has something to draw, so a window never flashes empty.
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => windows.delete(kind));
  void win.loadFile(path.join(HERE, '..', 'pages', page));
  windows.set(kind, win);
  return win;
}

app.whenReady().then(async () => {
  // No Electron menu bar. Aang's windows are his own look, and File/Edit/View is not it. It also
  // removes the built-in reload and developer-tools shortcuts from every window he draws.
  Menu.setApplicationMenu(null);

  // BEFORE ANYTHING ELSE: a copy of his settings and his memory as they are right now, taken once.
  // The git tag keeps the old code; this keeps the old data, which the tag cannot (step 6.0, his
  // decision 36). It never stops the Shell starting, whatever goes wrong.
  const snap = snapshotOnce(STATE_DIR, DATA_DIR);
  if (snap.dir) console.log(`shell: kept a copy of Aang as he was in ${snap.dir} (${snap.files} files, ${Math.round(snap.bytes / 1e6)} MB)`);
  if (snap.skipped.length) console.log(`shell: the copy skipped ${snap.skipped.length}: ${snap.skipped.slice(0, 3).join('; ')}`);

  // Nothing may ask for the camera, the microphone, notifications or his location. Windows that need
  // one (a video call in the browser, step 6.22) will declare it and ask him first.
  denyPermissions(session.defaultSession, []);

  ipcMain.handle('shell:windowKind', e => {
    for (const [kind, w] of windows) if (!w.isDestroyed() && w.webContents === e.sender) return kind;
    return 'unknown';
  });

  // The pop-out's page is served over http rather than loaded from disk: a YouTube embed from a
  // file:// page fails with Error 153 (tested 2026-10-04).
  try {
    pages = await servePages(path.join(HERE, '..', 'pages'));
    popout = new Popout({
      pages,
      preloadPath: path.join(HERE, 'preload.cjs'),
      remembered: rememberedBox,
      // "Your size wins", unless he has switched that off (sheet 4, section 7).
      remember: box => { if (settings.rememberSize) rememberBox(box); },
      settings: () => settings,
      skips: new FindSkips(STATE_DIR),
      skipSettings: () => skipSettings,
    });
    console.log(`shell: pages on ${pages.origin}`);

    drm = new DrmRuntime({
      shellDir: path.join(HERE, '..'),
      stateDir: STATE_DIR,
      // Always said, not only on a bad code: a paid-video window that vanishes should never do so
      // silently, and the code is the first thing worth knowing when it does.
      onExit: code => console.log(`shell: the paid-video runtime stopped (code ${code})`),
    });
    if (!drm.available) console.log('shell: the castLabs build is not installed, so paid video will not play yet');

    // The key that puts it away and brings it back, still playing (sheet 4, way 5).
    // Whichever runtime is playing, the key hides it: he should not have to know which is which.
    // Ads, on the stock Shell's session only. The paid-video runtime never gets this: a subscription
    // has no ads to block, and a request filter in front of a licence negotiation breaks playback for
    // nothing. Deliberately not awaited: fetching lists must never hold up the windows.
    if (skipSettings.youtubeAds) {
      void blockAds(session.defaultSession, STATE_DIR).then(b => {
        ads = b;
        if (b) console.log(`shell: blocking ads with ${b.lists} lists`);
      });
    }

    hotkey = holdHotkey(STATE_DIR, () => popout?.toggleHidden());
    if (hotkey.active) console.log(`shell: ${hotkey.active} hides and shows the pop-out`);
  } catch (e) {
    console.error('shell: the page server would not start, so the pop-out is unavailable: ' + (e as Error).message);
  }

  ipcMain.on('popout:hide', e => { if (fromPopout(e)) popout?.toggleHidden(); });
  ipcMain.on('popout:close', e => { if (fromPopout(e)) popout?.close(); });
  ipcMain.on('popout:opacity', (e, v) => { if (fromPopout(e) && typeof v === 'number') popout?.setOpacity(v); });
  ipcMain.on('popout:fullscreen', e => { if (fromPopout(e)) popout?.toggleFullscreen(); });
  ipcMain.on('popout:chrome', (e, px) => { if (fromPopout(e) && typeof px === 'number') popout?.setChrome(px); });
  // Step 6.8. The page reports seconds; the brain converts to the percentage Simkl wants, because the
  // page is the least trustworthy place to do arithmetic that decides what gets marked watched.
  ipcMain.on('popout:playback', (e, s) => {
    if (!fromPopout(e) || !s || typeof s !== 'object') return;
    link?.send({
      t: 'watch.state',
      playing: s.playing === true,
      at: Number(s.at) || 0,
      length: Number(s.length) || 0,
      ended: s.ended === true,
    });
  });
  ipcMain.on('popout:tomac', e => {
    if (!fromPopout(e)) return;
    // Handing it to the MacBook is step 6.9, which extends the listener that already exists there.
    // Until then, say so rather than letting the keycap do nothing at all.
    const url = popout?.link;
    if (url) console.log(`shell: send to the MacBook is step 6.9; nothing sent for ${url.slice(0, 60)}`);
  });

  link.start();
  // AANG_SHELL_PAGE lets the look driver (tests/fakecore/look-shell.mjs) open any page for a picture.
  // Ignored in normal use: there is only one page today, and later windows are opened by the brain.
  const first = process.env.AANG_SHELL_PAGE ?? 'hello.html';
  open(first.replace(/\.html$/, ''), first, { width: 460, height: 360 });

  // macOS only, and Aang does not run there, but Electron complains without it.
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) open('hello', 'hello.html'); });
});

// The tray owns the lifetime, not the last window: closing a window must not kill the Shell, because
// the pop-out and the bubble come and go while Aang stays running.
app.on('window-all-closed', () => { /* deliberately nothing */ });

/** A message is only acted on if it really came from the pop-out's own page. */
function fromPopout(e: Electron.IpcMainEvent): boolean {
  const w = popout?.window;
  return Boolean(w && e.sender === w.webContents);
}

app.on('before-quit', () => { link.stop(); hotkey?.release(); ads?.stop(); popout?.close(); drm?.close(); pages?.close(); });

// Nothing a page does may take the Shell down silently.
process.on('uncaughtException', e => console.error('shell: uncaught: ' + (e as Error).message));
process.on('unhandledRejection', e => console.error('shell: unhandled: ' + String(e)));

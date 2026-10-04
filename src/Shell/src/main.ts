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

const link = new CoreLink({
  port: PORT,
  stateDir: STATE_DIR,
  onMessage: m => {
    // "Put X on": the one message the pop-out answers to. Everything else is passed to the windows.
    if (m.t === 'popout.open' && typeof m.url === 'string') {
      if (!popout?.open(m.url)) console.error(`shell: nothing playable in ${String(m.url).slice(0, 80)}`);
      return;
    }
    if (m.t === 'popout.close') { popout?.close(); return; }
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
      remember: rememberBox,
    });
    console.log(`shell: pages on ${pages.origin}`);
  } catch (e) {
    console.error('shell: the page server would not start, so the pop-out is unavailable: ' + (e as Error).message);
  }

  ipcMain.on('popout:hide', e => { if (fromPopout(e)) popout?.toggleHidden(); });
  ipcMain.on('popout:close', e => { if (fromPopout(e)) popout?.close(); });

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

app.on('before-quit', () => { link.stop(); popout?.close(); pages?.close(); });

// Nothing a page does may take the Shell down silently.
process.on('uncaughtException', e => console.error('shell: uncaught: ' + (e as Error).message));
process.on('unhandledRejection', e => console.error('shell: unhandled: ' + String(e)));

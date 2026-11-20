// The secret window as its own program (his pick, 2026-11-19), on the Mac only. Started by normal Samara on ⇧⌘N with
// --samara-secret (secretlaunch.ts, macmain.ts). The design:
//
//  - Its own process: the vault's memory (its key, tabs, history, logins) is never in normal Samara's process.
//  - Its own Chromium data folder (secret-app, inside Aang's), so its own single-instance lock: a second ⇧⌘N while it
//    runs only brings its window forward. Its logged-in profile (persist:aang-secret) lives there; the one normal Samara
//    used to hold is moved over once, before Chromium starts.
//  - Started with the system media controls off (MAC_MEDIA_OFF): no Now Playing, no media keys, for it alone. Normal
//    Samara keeps both.
//  - Talks to nothing in normal Samara: no messages, no sync, no Claude door, no plans, no Send to Aang, no pop-out, no
//    paid-video window. It only READS normal Samara's settings, autofill details and site lists from Aang's folder.
//  - Its folder is sealed (sealdir.ts) and its logins are its own (secretlogins.ts); both open only after its PIN.
//  - It writes no log: what it says goes nowhere (a log would name its pages).
//  - Locks on its mask, the Mac sleeping or locking, 15 minutes away (browser.ts). Closing its window locks it, writes
//    its last save, shuts its folder and ends the program; ⌘Q the same. Nothing of it stays running.
//
// Same app name as normal Samara ("Aang"): the Keychain item that seals its key is that app's, as before.
import { app, Menu, session } from 'electron';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { MAC_MEDIA_OFF, SECRET_APP_DIR, secretAllowed } from './secretguard.ts';
import { moveProfile } from './secretlaunch.ts';

if (!secretAllowed()) { app.exit(0); throw new Error('the secret window lives on the Mac only'); }

app.setName('Aang');
const AANG = app.getPath('userData');                              // Aang's own folder (normal Samara's)
const MINE = path.join(AANG, SECRET_APP_DIR);
app.setPath('userData', MINE);
app.setPath('sessionData', MINE);
app.commandLine.appendSwitch('disable-features', MAC_MEDIA_OFF);
// Nothing it says is kept anywhere.
console.log = () => {}; console.info = () => {}; console.warn = () => {}; console.error = () => {};

mkdirSync(MINE, { recursive: true });
moveProfile(AANG, MINE);

const solo = app.requestSingleInstanceLock();
if (!solo) app.quit();

app.whenReady().then(async () => {
  if (!solo) return;
  const { denyPermissions } = await import('./safety.ts');
  const { servePages } = await import('./pageserver.ts');
  const { AangBrowser } = await import('./browser.ts');
  const { wireBrowser } = await import('./browseripc.ts');
  const { onCastlabs } = await import('./engineupdate.ts');
  denyPermissions(session.defaultSession, []);
  // Paid video plays in its tab on the castLabs engine, as in normal Samara (its signature first).
  if (onCastlabs()) { try { const c = (await import('electron') as any).components; await Promise.race([c.whenReady(), new Promise((r) => setTimeout(r, 15_000))]); } catch { /* plays without */ } }
  const here = import.meta.dirname;
  const pages = await servePages(path.join(here, '..', 'pages'));
  const pre = (f: string) => path.join(here, f);
  const s = new AangBrowser({ origin: pages.origin, preloadPath: pre('samarapreload.cjs'), tabPreloadPath: pre('tabpreload.cjs'), settingsPreloadPath: pre('settingspreload.cjs'),
    thingsPreloadPath: pre('thingspreload.cjs'), stateDir: path.join(AANG, 'secret'), sharedDir: AANG, secret: true });
  // Every page and button of its window goes to it (there is no other browser in this program).
  wireBrowser(() => s, () => s);
  s.onSecret = () => s.open();
  // Settings belong to normal Samara; the secret window does not reach it.
  s.onSettings = null;
  let saved = false;
  const end = () => { void s.whenSaved().then(() => { saved = true; pages.close(); app.quit(); }); };
  s.onLastClosed = end;                                           // closing its window locks it and ends the program
  app.on('before-quit', (e) => { if (saved) return; e.preventDefault(); if (s.hasWindow()) s.closeAll(); else end(); });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu' }, { role: 'editMenu' },
    { label: 'View', submenu: [{ role: 'togglefullscreen' }, { label: 'New secret window', accelerator: 'Shift+Command+N', visible: false, acceleratorWorksWhenHidden: true, click: () => s.open() }] },
    { role: 'windowMenu' },
  ]));
  app.on('second-instance', () => s.open());                     // ⇧⌘N in normal Samara while it runs
  app.on('activate', () => s.open());
  s.open();
});
app.on('window-all-closed', () => { /* its own close ends it, once saved */ });

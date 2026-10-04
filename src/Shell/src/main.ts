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
import { app, BrowserWindow, Menu, clipboard, globalShortcut, ipcMain, session, shell } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CoreLink } from './link.ts';
import { Bubble, wantsNewBubble } from './bubble.ts';
import { InputBox } from './input.ts';
import { bubbleAt, inputAt, moved, readPetAt } from './anchor.ts';
import type { PetAt } from './anchor.ts';
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
/** The new bubble (step 6.12). Null unless he has switched it on: see wantsNewBubble. */
let bubble: Bubble | null = null;
/** The new typing box (step 6.12b). Same switch as the bubble: they replace the old ones together. */
let input: InputBox | null = null;
/** The mode the typing box sends with. Starts from the pet's own settings, which the pet still owns. */
let inputMode = 'auto';
/** The last usage the brain reported, for the strip. */
let lastWeek = 0, lastLevel = 'ok';

/** His Up-arrow history, shared with the old box so it carries over. */
const HISTORY_FILE = () => path.join(STATE_DIR, 'input-history.json');
function readJson(file: string): unknown {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
}

/**
 * Ctrl+Plus, with the new front end on.
 *
 * Everything that must happen for his first key to land in the box happens HERE, synchronously, before
 * this returns: show the window and focus it. Telling the pet to slide out goes after, and does not
 * matter to the typing at all. See input.ts for why the order is the whole fix.
 */
function onHotkey(): void {
  if (!input) return;
  if (input.visible) { input.close(); link?.send({ t: 'dismiss' }); return; }
  const body = readJson(path.join(STATE_DIR, 'body.json')) as Record<string, unknown> | null;
  const at = petAt ? inputAt(petAt, { width: 268, height: 112 }) : null;
  input.open(at, {
    history: readJson(HISTORY_FILE()) ?? [],
    mode: inputMode,
    saving: body?.Saving === true,
    week: lastWeek, level: lastLevel,
  });
  link?.send({ t: 'summon' });
}
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

/** Where the pet last said it was (step 6.10b). Null until the C# Body says. */
let petAt: PetAt | null = null;

/**
 * Put Aang's own windows back where they belong beside him.
 *
 * Nothing to place yet: the bubble and the typing box arrive with 6.12. This is the seam they plug
 * into, and it is here now because the C# side, the protocol and the arithmetic all had to agree, and
 * agreeing is easier to prove while there is nothing on screen to confuse it with.
 *
 * The pop-out is deliberately NOT moved. He drags that where he wants it and it stays there; a video
 * that chased the pet around the screen would be maddening (way 6, removed on purpose).
 */
function placeWindows(): void {
  if (!petAt) return;
  // The typing box follows him too: docked, it opens at once where he IS, and he then slides out. Moving
  // a focused window does not take the keyboard from it.
  const iw = input?.visible ? input.window() : null;
  if (iw && !iw.isDestroyed()) {
    const [width, height] = iw.getSize();
    const box = inputAt(petAt, { width, height });
    iw.setPosition(box.x, box.y);
  }
  const b = bubble?.window();
  if (b && !b.isDestroyed()) {
    const [width, height] = b.getSize();
    const box = bubbleAt(petAt, { width, height });
    b.setPosition(box.x, box.y);
  }
  for (const [name, w] of windows) {
    if (w.isDestroyed()) continue;
    const place = name === 'bubble' ? bubbleAt : name === 'input' ? inputAt : null;
    if (!place) continue;
    const [width, height] = w.getSize();
    const box = place(petAt, { width, height });
    w.setPosition(box.x, box.y);
  }
}

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
    if (m.t === 'quota') { lastWeek = Number(m.week) || 0; lastLevel = String(m.level ?? 'ok'); }
    // 6.10b: where the pet is. Kept so any window opened later can be placed without waiting for Joshua
    // to move him. `moved()` drops the jitter of a drag, because re-placing a window is not free and a
    // drag arrives as a stream of positions.
    if (m.t === 'pet.at') {
      const at = readPetAt(m);
      if (at && moved(petAt, at)) { petAt = at; placeWindows(); }
      return;
    }
    for (const w of windows.values()) if (!w.isDestroyed()) w.webContents.send('brain:message', m);
    // The bubble is not in `windows`: it is made on demand and has its own lifetime, so it is told
    // separately rather than being swept up by a loop that does not know about it.
    bubble?.send('brain:message', m);
    input?.send('brain:message', m);
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

    // Step 6.12. OFF unless he asks for it: the old GDI bubble is still running, and two bubbles saying
    // the same thing at once is worse than one old one. It is not something to discover mid-raid.
    if (wantsNewBubble()) {
      bubble = new Bubble({ origin: pages.origin, preloadPath: path.join(HERE, 'preload.cjs') });
      // Built now, hidden, so the page is loaded and listening before anything is said. Waiting for
      // the first message would mean loading a page and sending to it in the same instant.
      bubble.window();
      console.log('shell: the new bubble is on (AANG_NEW_BUBBLE=1)');

      // 6.12b: the typing box comes with it, and so does the hotkey. The pet does not register Ctrl+Plus
      // when this switch is on, so there is exactly one owner and no fight over it.
      input = new InputBox({ origin: pages.origin, preloadPath: path.join(HERE, 'preload.cjs') });
      input.window();
      const body = readJson(path.join(STATE_DIR, 'body.json')) as Record<string, unknown> | null;
      if (typeof body?.Mode === 'string') inputMode = body.Mode;
      // '=' is the key with + on it (VK_OEM_PLUS), which is what the pet registered; numadd is the keypad.
      for (const key of ['Control+=', 'Control+numadd']) {
        if (!globalShortcut.register(key, onHotkey)) console.error(`shell: could not take ${key}; another program has it`);
      }
      console.log('shell: the new typing box is on; Ctrl+Plus belongs to the Shell');
    }

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
  // Step 6.12. Only the clipboard and a rating: the bubble can say what Aang said and what Joshua
  // thought of it, and nothing else. Both are checked for coming from a window of ours.
  ipcMain.on('bubble:copy', (e, text) => {
    if (!fromBubble(e) || typeof text !== 'string' || !text) return;
    clipboard.writeText(text.slice(0, 100_000));
  });
  // The page measured the drawn shape; the window follows it and is put back beside the pet. The
  // window cannot work this out itself: the browser wrapped the text using the real font at the real
  // size. Same fix as the pop-out's letterboxing - the page measures, the window follows.
  ipcMain.on('bubble:size', (e, size) => {
    if (!fromBubble(e) || !size || typeof size !== 'object') return;
    const w = bubble?.window();
    if (!w || w.isDestroyed()) return;
    const width = Math.max(220, Math.min(1400, Math.round(Number(size.width) || 0)));
    const height = Math.max(80, Math.min(900, Math.round(Number(size.height) || 0)));
    if (!width || !height) return;
    const [haveW, haveH] = w.getSize();
    if (haveW !== width || haveH !== height) {
      // setBounds, NEVER setSize: on a window made with `resizable: false`, setSize is silently ignored
      // on this machine, while setBounds works (test/electron/setsize.cjs, 2026-10-04). The first real
      // run left the bubble at its starting 560 px, so a two-word reply sat 450 px away from Aang.
      // One call for size AND position also means it never shows for a frame at the old size.
      const [x, y] = w.getPosition();
      const box = petAt ? bubbleAt(petAt, { width, height }) : { x, y, width, height };
      w.setBounds({ x: box.x, y: box.y, width, height });
    }
    bubble?.show();
  });
  // His answer to an ask. Translated here into the reply the brain expects, because each kind answers
  // differently and the page should not have to know that. "show" is not a reply at all: it is a
  // request to see the whole thing first, which is a `submit`, so the ask stays open until he decides.
  ipcMain.on('bubble:answer', (e, a) => {
    if (!fromBubble(e) || !a || typeof a !== 'object') return;
    const choice = String(a.choice ?? '');
    if (a.t === 'permission') {
      if (choice === 'show') { link?.send({ t: 'submit', id: 'show-' + Date.now(), text: 'show me that first' }); return; }
      const picked = choice === 'yes' ? 'once' : choice === 'always' ? 'always' : 'no';
      link?.send({ t: 'permission.reply', id: String(a.id ?? ''), choice: picked });
      return;
    }
    if (a.t === 'fact.ask') {
      // "Skip" is deliberately NOT a no: saying a claim is untrue and declining to judge it are
      // different answers, and only the first should teach Aang anything.
      if (choice === 'skip') return;
      link?.send({ t: 'fact.reply', id: Number(a.id) || 0, keep: choice === 'yes' });
      return;
    }
    if (a.t === 'backup.ask') { link?.send({ t: 'backup.reply', now: choice === 'yes' }); return; }
    // Consent has NO reply message, which is easy to get wrong: the turn simply stopped, and saying
    // yes means asking again with `once: true`. Checked against what the C# Body does (AllowOnce), not
    // assumed - the first version of this invented a `consent.reply` that nothing would have read.
    // Saying no means doing nothing at all: the turn is already over.
    if (a.t === 'consent') {
      if (choice === 'yes' && typeof a.text === 'string' && a.text) {
        link?.send({ t: 'submit', id: 'c' + Date.now(), text: a.text, mode: String(a.mode ?? 'smart'), once: true });
      }
      return;
    }
  });
  // A chip he pressed. Opened in HIS programs, through the operating system, never inside Aang: a
  // link from a reply is exactly the kind of thing that should land in a browser with a visible address
  // bar. Only http, https and a real file path; anything else is refused rather than handed to the
  // shell, because `openPath` and `openExternal` will both cheerfully run things.
  ipcMain.on('bubble:open', (e, t) => {
    if (!fromBubble(e) || !t || typeof t !== 'object') return;
    const value = String(t.value ?? '');
    if (t.kind === 'link') {
      if (!/^https?:\/\//i.test(value)) { console.error('shell: refused a chip that was not http'); return; }
      void shell.openExternal(value);
      return;
    }
    if (t.kind === 'file') {
      // A drive path or a UNC share, which is what entities.js matched in the first place. Checked
      // again here because the page is the least trustworthy side of this.
      if (!/^(?:[A-Za-z]:\\|\\\\)/.test(value)) { console.error('shell: refused a chip that was not a path'); return; }
      void shell.openPath(value);
      return;
    }
  });
  // Another page of his own history. `before` is a row id, so there is no limit: every time he reaches
  // the top it asks for the ones older than the oldest it has, until the database runs out.
  ipcMain.on('bubble:clickable', (e, on) => { if (fromBubble(e)) bubble?.setClickable(on === true); });

  // ---- the typing box (6.12b). Its own sender check, like the bubble's.
  ipcMain.on('input:submit', (e, a) => {
    if (!fromInput(e) || !a || typeof a.text !== 'string' || !a.text.trim()) return;
    const mode = ['auto', 'quick', 'smart', 'deep'].includes(a.mode) ? a.mode : inputMode;
    link?.send({ t: 'submit', id: 's' + Date.now(), text: a.text.slice(0, 20_000), mode });
    input?.close();                                      // the old box closes on send too
  });
  ipcMain.on('input:history', (e, list) => {
    if (!fromInput(e) || !Array.isArray(list)) return;
    try { writeFileSync(HISTORY_FILE(), JSON.stringify(list.filter((x) => typeof x === 'string').slice(-50))); }
    catch (err) { console.error('shell: history not saved: ' + (err as Error).message); }
  });
  ipcMain.on('input:close', (e) => { if (fromInput(e)) input?.close(); });
  ipcMain.on('input:stop', (e) => { if (fromInput(e)) link?.send({ t: 'stop' }); });
  ipcMain.on('input:mode', (e, m) => { if (fromInput(e) && typeof m === 'string') inputMode = m; });
  ipcMain.on('input:size', (e, s) => {
    if (fromInput(e) && s && typeof s === 'object') input?.resize(Number(s.width) || 0, Number(s.height) || 0);
  });
  ipcMain.on('bubble:older', (e, a) => {
    if (!fromBubble(e)) return;
    const before = Number(a?.before);
    link?.send({ t: 'history', q: '', ...(Number.isFinite(before) ? { before } : {}) });
  });
  ipcMain.on('bubble:forget', (e, id) => {
    if (!fromBubble(e)) return;
    const turn = Number(id);
    if (Number.isFinite(turn)) link?.send({ t: 'forget.turn', id: turn });
  });
  ipcMain.on('bubble:rate', (e, r) => {
    if (!fromBubble(e) || !r || typeof r !== 'object') return;
    const turn = Number(r.turn);
    link?.send({ t: 'rate', ...(Number.isFinite(turn) ? { turn } : {}), rating: Math.sign(Number(r.rating) || 0) });
  });
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
    // Step 6.9. The brain holds the Mac's address and key; the Shell only says which link, and the Mac
    // itself refuses anything that is not a site on its own list.
    const url = popout?.link;
    if (url) link?.send({ t: 'watch.tomac', url });
  });

  link.start();
  // NOTHING IS OPENED ON STARTUP.
  //
  // This used to open hello.html, a placeholder saying "the window layer, nothing is drawn here yet".
  // On 2026-10-04 a screenshot of his actual desktop showed what that meant in practice: a 460x360
  // window sitting over his Discord conversation, thrown up again on every restart, and Aang restarts
  // several times a day. He described the result as glitchy and said nothing made sense, and he was
  // right - it was a window in his face that he had never asked for.
  //
  // The lesson is bigger than the window: every check of this program had been done in a browser tab,
  // where a window cannot cover anything, so this was invisible to all of it.
  //
  // The Shell is a thing that waits. The brain opens its windows when there is something to show.
  // AANG_SHELL_PAGE is still honoured, for the look driver (tests/fakecore/look-shell.mjs) and for
  // looking at a page by hand.
  const first = process.env.AANG_SHELL_PAGE;
  if (first) open(first.replace(/\.html$/, ''), first, { width: 460, height: 360 });

  // macOS only, and Aang does not run there, but Electron complains without it.
  app.on('activate', () => { /* nothing to reopen: the Shell shows a window only when asked */ });
});

// The tray owns the lifetime, not the last window: closing a window must not kill the Shell, because
// the pop-out and the bubble come and go while Aang stays running.
app.on('window-all-closed', () => { /* deliberately nothing */ });

/** A message is only acted on if it really came from the pop-out's own page. */
function fromPopout(e: Electron.IpcMainEvent): boolean {
  const w = popout?.window;
  return Boolean(w && e.sender === w.webContents);
}

/**
 * Did this come from the bubble? (step 6.12)
 *
 * Separate from fromPopout on purpose rather than a general "is it one of ours": the pop-out shows
 * pages from the internet, so it must never be able to reach the bubble's doors and put things on his
 * clipboard or send ratings in his name.
 */
function fromInput(e: Electron.IpcMainEvent): boolean {
  const w = input?.window();
  return Boolean(w && !w.isDestroyed() && e.sender === w.webContents);
}

function fromBubble(e: Electron.IpcMainEvent): boolean {
  const w = bubble?.window();
  return Boolean(w && !w.isDestroyed() && e.sender === w.webContents);
}

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('before-quit', () => { input?.destroy(); link.stop(); hotkey?.release(); ads?.stop(); popout?.close(); bubble?.close(); drm?.close(); pages?.close(); });

// Nothing a page does may take the Shell down silently.
process.on('uncaughtException', e => console.error('shell: uncaught: ' + (e as Error).message));
process.on('unhandledRejection', e => console.error('shell: unhandled: ' + String(e)));

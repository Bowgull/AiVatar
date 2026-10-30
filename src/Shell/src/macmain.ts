// M6 (his interview, 2026-10-13): Aang's browser on his MacBook. The same browser as on the PC (browser.ts and its
// pages, unchanged), started on its own: no pet, no bubble yet (those are M7 to M9). It keeps everything in step with
// the PC's browser through Aang's brain on the PC, over Tailscale (bsync.ts): bookmarks, settings, the same open
// tabs, history and logins. Money sites never travel. When the PC is off it works on its own and catches up later.
//
// Run as the "Aang" app the Mac setup makes (Aang.app in ~/Applications). It can be his default browser (his yes).
import { startClaudeDoor } from './claudedoor.ts';
import { startFlight } from './flight.ts';
import { app, globalShortcut, ipcMain, Menu, nativeImage, net, powerMonitor, session } from 'electron';
import { denyPermissions } from './safety.ts';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, watch, writeFileSync } from 'node:fs';
import { startMockupDoor } from './mockupdoor.ts';
import { takeMockupFile } from './mockups.ts';
import { listen as ghListen } from './ghrelease.ts';
import { MacEngine, MacPaths, MacSamara, MacStage } from './macsource.ts';
import { UpdateEngine } from './updateengine.ts';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { servePages } from './pageserver.ts';
import { AangBrowser } from './browser.ts';
import { wireBrowser } from './browseripc.ts';
import { DrmRuntime } from './drmrunner.ts';
import { onCastlabs } from './engineupdate.ts';
import { Popout, popoutFile } from './popout.ts';
import { wirePopout } from './popoutipc.ts';
import { readSettings } from './settings.ts';
import { FindSkips } from './skip/find.ts';
import { DEFAULT_SKIPS, withDefaults, type SkipSettings } from './skip/settings.ts';
import { holdHotkey } from './hotkey.ts';
import { serviceFor } from './services.ts';
import { CardRenderer } from './cardrender.ts';
import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';

const HERE = import.meta.dirname;
const LISTENER = path.join(os.homedir(), 'Library', 'Application Support', 'AangListener');
const SYNC_PORT = 47832;   // the brain's hook port on the PC
/** Sheet 21: the front desk on this Mac asks here for a drawn card (frontdesk.ts MAC_CARD_PORT). */
const CARD_PORT = 47843;

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
/** Sheet 87: the secret window, a browser of its own, made the first time he presses ⇧⌘N in Samara. */
let secret: AangBrowser | null = null;
/** Sheet 87: the menu's hidden ⇧⌘N, set once the browser is up. */
let openSecretRef: (() => void) | null = null;
const waiting: string[] = [];
const openUrl = (u: string) => {
  try { const x = new URL(u); if (x.protocol !== 'http:' && x.protocol !== 'https:') return; } catch { return; }
  if (browser) browser.open(u); else waiting.push(u);
};
// A link he clicked while Aang is his default browser. It can arrive before the app is ready.
app.on('open-url', (e, u) => { e.preventDefault(); openUrl(u); });

// A second copy only hands over and leaves: nothing below may start in it (its servers and window raced the first one's).
const solo = app.requestSingleInstanceLock();
if (!solo) app.quit();

app.whenReady().then(async () => {
  if (!solo) return;
  startFlight(app, app.getPath('userData'), (s) => console.error(s));
  // Nothing outside the tabs (the popout, Aang's cards) may use the camera, mic, location or the rest (code audit,
  // 2026-10-14); the tabs keep their own ask-per-site rules.
  denyPermissions(session.defaultSession, []);
  // The Mac's own menu, so Cmd+C, Cmd+V, Cmd+Q and the rest work as on every Mac app.
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    // View > Enter Full Screen (Ctrl+Cmd+F), as on every Mac app (2026-10-23, his ask: "act like any other window").
    { role: 'appMenu' }, { role: 'editMenu' },
    // Sheet 87: ⇧⌘N opens the secret window whatever has the keyboard (the band too). Hidden: no sign of it in the menus.
    { label: 'View', submenu: [{ role: 'togglefullscreen' }, { label: 'New secret window', accelerator: 'Shift+Command+N', visible: false, acceleratorWorksWhenHidden: true, click: () => openSecretRef?.() }] },
    { role: 'windowMenu' },
  ]));
  // His picks (2026-10-14): the lantern is lit while Samara runs; the app's own icon (the Dock when it is closed) is
  // unlit. It lights up smoothly when Samara opens and dims back down when he quits (10 pixel-art frames, ~half a
  // second), so the Dock never jumps: the last frame down is exactly the closed icon.
  const frames = Array.from({ length: 10 }, (_, i) => { try { return nativeImage.createFromPath(path.join(HERE, '..', 'pages', 'art', 'samara', `samara-light-${i}-512.png`)); } catch { return null; } });
  const play = (from: number, to: number, done?: () => void) => {
    const step = from < to ? 1 : -1; let i = from;
    const t = setInterval(() => { const f = frames[i]; if (f && !f.isEmpty()) { try { app.dock?.setIcon(f); } catch { /* not now */ } } if (i === to) { clearInterval(t); done?.(); } else i += step; }, 55);
  };
  play(0, 9);
  let dimmed = false;
  app.on('before-quit', (e) => { if (dimmed || !app.dock) return; e.preventDefault(); dimmed = true; play(9, 0, () => setTimeout(() => app.quit(), 30)); });

  // Every button, menu and page of the browser, the same wiring as on the PC.
  wireBrowser(() => browser, () => secret);
  // castLabs' engine: Widevine must be loaded before a paid page asks for it (castLabs' own rule).
  if (onCastlabs()) {
    try { const c = (await import('electron') as any).components; await Promise.race([c.whenReady(), new Promise((r) => setTimeout(r, 15_000))]); console.log('aang: widevine ' + JSON.stringify(c.status())); }
    catch (e) { console.error('aang: widevine did not load: ' + (e as Error).message); }
  }
  const stateDir = app.getPath('userData');
  const pages = await servePages(path.join(HERE, '..', 'pages'));
  // The MOCKUPS trail on the Mac (2026-10-22): there is no AangApp repo here, but pages from the Mac's own Claude
  // sessions (their repos, or live local pages) land in it. It reads versions with git, so it is on only when Apple's
  // git is really installed: the /usr/bin/git stand-in would otherwise pop macOS's "install developer tools" window.
  const gitHere = ['/Library/Developer/CommandLineTools/usr/bin/git', '/Applications/Xcode.app/Contents/Developer/usr/bin/git'].some((f) => existsSync(f));
  browser = new AangBrowser({
    origin: pages.origin, stateDir, preloadPath: path.join(HERE, 'preload.cjs'), tabPreloadPath: path.join(HERE, 'tabpreload.cjs'),
    settingsPreloadPath: path.join(HERE, 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, 'thingspreload.cjs'),
    mockupsAnywhere: gitHere,
  });
  // Sheet 87 (his "go", 2026-10-25): ⇧⌘N opens the secret window. Its own folder (tabs, bookmarks, history), its own
  // kept logins, normal Samara's settings and autofill. No door, no sync, no mockups, nothing of it in normal Samara.
  const openSecret = (): void => {
    if (!secret) {
      const dir = path.join(stateDir, 'secret');
      try { mkdirSync(dir, { recursive: true, mode: 0o700 }); } catch (e) { console.error('aang: the secret window has no folder: ' + (e as Error).message); return; }
      secret = new AangBrowser({
        origin: pages.origin, stateDir: dir, sharedDir: stateDir, secret: true, phish: browser!.phishCheck, preloadPath: path.join(HERE, 'preload.cjs'), tabPreloadPath: path.join(HERE, 'tabpreload.cjs'),
        settingsPreloadPath: path.join(HERE, 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, 'thingspreload.cjs'),
      });
      secret.onSecret = openSecret;
      // Its settings are normal Samara's: Settings opens there.
      secret.onSettings = () => { const b = browser; if (!b) return; const had = b.hasWindow(); b.open(); setTimeout(() => b.openSettings(), had ? 0 : 1500); };
      secret.onPaid = (u) => browser?.onPaid?.(u) ?? false;
      secret.onPaidFallback = (u) => browser?.onPaidFallback?.(u) ?? false;
      app.on('before-quit', () => secret?.closeAll());
    }
    secret.open();
  };
  browser.onSecret = openSecret;
  openSecretRef = openSecret;
  // 6.25a: Claude sessions on this Mac drive the browser through its own door (claudedoor.ts).
  startClaudeDoor(() => browser, stateDir);
  // show_mockup from this Mac's Claude sessions (the aang-link mod): a signed loopback door (mockupdoor.ts).
  const closeMockDoor = startMockupDoor(stateDir, (d) => browser?.openMockupDrop(d) ?? Promise.resolve(null),
    () => (browser?.mockupsOn ? null : "Samara's Mockups trail on this Mac needs Apple's command line tools (git). Tell the user where the file is; they can install them with: xcode-select --install"),
    undefined, { list: () => browser?.mockStages() ?? [], set: (a) => browser?.mockMark(a) ?? 'Samara is not open yet.' });
  app.on('before-quit', () => closeMockDoor());
  // A .mockup file left in Samara's open-urls folder (the same small JSON tools/open-mockup.mjs leaves on the PC). Only
  // .mockup files; takeMockupFile checks each one and deletes it whatever it says.
  {
    const dir = path.join(stateDir, 'open-urls');
    const take = () => {
      let names: string[] = [];
      try { names = readdirSync(dir).sort(); } catch { return; }
      for (const n of names) if (n.endsWith('.mockup')) { const m = takeMockupFile(path.join(dir, n)); if (m && browser?.mockupsOn) void browser.openMockupDrop(m); }
    };
    try { mkdirSync(dir, { recursive: true }); watch(dir, () => setTimeout(take, 60)); } catch (e) { console.error('aang: cannot watch for mockups: ' + (e as Error).message); }
    take();
  }
  // Sheet 21 (his pick, 2026-10-13): while Shadow is off, the Mac's front desk posts the morning brief and the like as
  // the same drawn cards. It cannot draw (it has no browser engine), so it asks here. Only from this Mac (loopback),
  // only with the hook key the setup wrote, never from a web page (no Origin), small bodies, one card at a time.
  {
    const cardKey = (() => { try { return readFileSync(path.join(LISTENER, 'hook.key'), 'utf8').trim(); } catch { return ''; } })();
    const cards = new CardRenderer(pages.origin);
    const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
    let busy: Promise<unknown> = Promise.resolve();
    const srv = http.createServer((req, res) => {
      const peer = String(req.socket.remoteAddress ?? '');
      const key = String(req.headers['x-aang-key'] ?? '');
      if (req.method !== 'POST' || req.url !== '/card' || req.headers.origin || !/^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(peer) || cardKey.length < 20 || !same(key, cardKey)) { res.writeHead(403).end(); return; }
      let body = '';
      req.on('data', (d) => { body += d; if (body.length > 64_000) req.destroy(); });
      req.on('end', () => {
        let j: any = null; try { j = JSON.parse(body); } catch { /* not JSON */ }
        if (!j || typeof j.kind !== 'string') { res.writeHead(400).end(); return; }
        busy = busy.then(() => cards.render(j.kind, j.data).then((r) => res.writeHead(r.ok ? 200 : 422, { 'content-type': 'application/json' }).end(JSON.stringify(r)), () => res.writeHead(500).end()));
      });
    });
    srv.on('error', (e) => console.error('aang: the card door would not open: ' + (e as Error).message));
    if (cardKey.length >= 20) srv.listen(CARD_PORT, '127.0.0.1');
  }
  // Tidy asks Aang's brain, which is on the PC: from the Mac it says it is not reachable yet (until M7 links them).
  browser.onTidyAsk = (id) => browser?.tidyAnswer(id, { ok: false, why: 'offline' });
  // Paid video (2026-10-13): Netflix, Crave, Disney+, Prime and Crunchyroll play in the castLabs window, signed for
  // streaming on his own free castLabs account. Hardware acceleration stays on: there is no Shadow capture here.
  const drm = new DrmRuntime({ shellDir: path.join(HERE, '..'), stateDir });
  // One engine (his yes, 2026-10-13): Aang.app is built on castLabs' engine, so paid video plays right in the tab;
  // only an Aang.app on the stock engine still sends it to the separate window.
  // Netflix was the exception on this Mac (his report, 2026-10-14: error E100 in Samara's own tab). 2026-10-25: the
  // video signature checks valid, and Netflix now gets Samara's honest name; it plays in the tab, and the paid-video
  // window (castLabs' own untouched app) is only its fallback.
  browser.onPaid = (url) => {
    const paid = serviceFor(url);
    if (!paid?.ready) return false;
    // Netflix too now (2026-10-25): it plays in the tab with Samara's honest name (browser.ts HONEST_SITES), and goes
    // to the paid-video window only if Netflix still refuses there (onPaidFallback below).
    if (onCastlabs()) return false;
    const why = drm.open(url, 'narrow');
    if (why) { console.error('aang: ' + why); return false; }
    return true;
  };
  browser.onPaidFallback = (url) => {
    const why = drm.open(url, 'narrow');
    if (why) { console.error('aang: ' + why); return false; }
    return true;
  };
  let openPopRef: ((url: string) => boolean) | null = null;
  let ws: WebSocket | null = null;
  // The pop-out, as on the PC (his report, 2026-10-13: "the pop-out is a very important feature"): its keys, pin,
  // play and click-through. Ctrl+Shift+V hides and shows it; Ctrl+Alt+P pins it while it is up.
  const popSettings = readSettings(stateDir);
  let skipSettings: SkipSettings = DEFAULT_SKIPS;
  try { const f = path.join(stateDir, 'skips.json'); if (existsSync(f)) skipSettings = withDefaults(JSON.parse(readFileSync(f, 'utf8'))); } catch { /* defaults */ }
  const popout = new Popout({
    pages, preloadPath: path.join(HERE, 'preload.cjs'),
    remembered: () => { try { const j = JSON.parse(readFileSync(popoutFile(stateDir), 'utf8')); return ['x', 'y', 'width', 'height'].every((k) => Number.isFinite(j?.[k])) ? { x: j.x, y: j.y, width: j.width, height: j.height } : null; } catch { return null; } },
    remember: (box) => { if (popSettings.rememberSize) { try { writeFileSync(popoutFile(stateDir), JSON.stringify(box)); } catch { /* next time */ } } },
    settings: () => popSettings, skips: new FindSkips(stateDir), skipSettings: () => skipSettings,
  });
  openPopRef = (url: string) => openPop(url);
  const openPop = (url: string): boolean => {
    if (serviceFor(url)) return browser?.onPaid?.(url) ?? false;
    drm.close();
    return Boolean(popout.open(url));
  };
  browser.onReclaim = () => popout.returnTab();
  browser.onPopoutAct = (what) => { if (what === 'popclose') popout.close(); else if (what === 'poppin') popout.togglePin(); else if (what === 'poppause') popout.togglePlay(); };
  browser.onOpenOther = (url) => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'open.onpc', url })); };
  wirePopout({
    popout: () => popout, browser: () => browser, open: openPop, stopPaid: () => drm.close(), paidSeparately: () => !onCastlabs(),
    openOnOther: (url) => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'open.onpc', url })); else console.log('aang: the PC is not reachable, so it was not opened there'); },
    // "Send to PC": through the brain, which puts it in the PC's pop-out.
    sendToOther: (url) => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'watch.topc', url })); else console.log('aang: the PC is not reachable, so it was not sent'); },
  });
  const hk = holdHotkey(stateDir, () => popout.toggleHidden());
  if (hk.active) console.log(`aang: ${hk.active} hides and shows the pop-out`);
  let pinHeld = false;
  setInterval(() => {
    const up = Boolean(popout.window?.isVisible());
    if (up && !pinHeld) pinHeld = globalShortcut.register('Control+Alt+P', () => popout.togglePin());
    else if (!up && pinHeld) { globalShortcut.unregister('Control+Alt+P'); pinHeld = false; }
  }, 500).unref?.();
  app.on('before-quit', () => { popout.close(); hk.release(); });
  app.on('before-quit', () => drm.close());
  // Started by a Claude session (claude-door-mcp.mjs: open -g -a Aang --args --quiet): the door is open, no window comes
  // up over him. Claude's tabs are hidden ones anyway; his own window opens the first time he clicks Aang in the Dock.
  if (!process.argv.includes('--quiet') || waiting.length) {
    browser.open(waiting.shift());
    for (const u of waiting.splice(0)) browser.open(u);
  }

  // His yes (2026-10-13): Aang's browser is the Mac's default. macOS asks him once, in its own window.
  const asked = path.join(stateDir, 'asked-default.flag');
  if (!existsSync(asked)) {
    try { app.setAsDefaultProtocolClient('http'); app.setAsDefaultProtocolClient('https'); } catch { /* he can set it in System Settings */ }
    try { writeFileSync(asked, new Date().toISOString()); } catch { /* asked again next time */ }
  }

  // ---- the update engine (2026-10-30, updateengine.ts + macsource.ts): Samara's code from GitHub and new castLabs
  // engines, both sealed with his release key, built into one new Samara in the background; then his UPDATE key
  // lights up (sheet 35, sheet 108). Restart now, overnight, put away, skip and go back are the engine's, one set of
  // rules for both machines. Samara no longer takes updates from the PC (his pick: GitHub, both machines).
  const paths = new MacPaths(LISTENER);
  const log = (t: string) => console.log('aang: ' + t);
  const prefs = (): { overnight: boolean } => { try { return { overnight: JSON.parse(readFileSync(paths.prefs, 'utf8')).overnight === true }; } catch { return { overnight: false }; } };
  let updates: UpdateEngine | null = null;
  const stage = new MacStage(paths, { log, changed: () => updates?.show() });
  const samara = new MacSamara(paths, stage, { fetch: net.fetch as never, log, changed: () => updates?.show() });
  const engineSrc = new MacEngine(paths, stage, { fetch: net.fetch as never, log, changed: () => updates?.show() });
  updates = new UpdateEngine({
    sources: [samara, engineSrc],
    moment: () => ({ now: new Date(), idleSeconds: powerMonitor.getSystemIdleTime(), inCall: browser?.inCall === true, inGame: false }),
    overnight: () => prefs().overnight,
    changed: (card) => browser?.setUpdate(card ? { ...card, overnight: prefs().overnight } : null),
    // The script closes Samara itself; what to say the next time it opens is kept first (overnight only).
    beforeGo: (w) => { if (w.overnight) { try { writeFileSync(paths.night, JSON.stringify({ version: samara.installed().version, title: w.title, lines: w.lines })); } catch { /* best effort */ } } },
    restart: () => { /* the Mac's script restarts Samara */ },
    log,
  });
  const markGood = () => samara.markGood();
  setTimeout(markGood, 60_000);
  updates.start();
  ghListen(net.fetch as never, () => void updates?.checkAll('nudge'));

  // The report (his rule, 2026-10-14: a failed update must say why, so it can be fixed). After an update ran, once
  // the outcome is known (this Aang marked itself good, or the old one came back), what the update printed and the
  // end of Aang's own log go to the PC, which keeps them for Claude. Once per update run.
  const UPSENT = path.join(LISTENER, 'update.reported');
  const reportUpdate = () => {
    try {
      const ran = statSync(paths.updateLog).mtimeMs;
      let sent = 0; try { sent = Number(readFileSync(UPSENT, 'utf8')) || 0; } catch { /* never */ }
      if (ran <= sent || ws?.readyState !== WebSocket.OPEN) return;
      const text = readFileSync(paths.updateLog, 'utf8'), i = samara.installed();
      const rolledBack = /putting the old one back/.test(text);
      const ok = !rolledBack && i.status === 'good' && !/npm (ERR|error)|failed; nothing was changed|did not match its fingerprint/i.test(text);
      const outcome = rolledBack ? 'the new Samara did not start, so the old one was put back'
        : /Installing the browser's libraries failed/.test(text) ? "installing the browser's libraries failed, so nothing was changed"
        : i.status === 'trial' ? 'it started but had not run a minute yet' : ok ? 'installed and running' : 'the update stopped part way (see its log)';
      let aangLog = ''; try { aangLog = readFileSync(path.join(app.getPath('userData'), 'aang.log'), 'utf8').split('\n').slice(-200).join('\n'); } catch { /* none */ }
      ws.send(JSON.stringify({ t: 'update.report', ok, version: i.version, outcome, installed: i, failed: [], updateLog: text.slice(-60_000), aangLog }));
      writeFileSync(UPSENT, String(ran));
      log(`sent the update report (${outcome})`);
    } catch { /* no update has run */ }
  };
  setTimeout(reportUpdate, 75_000);
  ipcMain.on('browser:updateact', (e, a) => {
    if (!browser?.isFrame(e.sender) || !updates) return;
    const act = String(a?.act ?? '');
    if (act === 'changelog') { let t = ''; try { t = readFileSync(paths.changelog, 'utf8'); } catch { /* none yet */ } e.sender.send('browser:changelog', t); return; }
    if (act === 'overnight') { try { writeFileSync(paths.prefs, JSON.stringify({ overnight: a?.on === true })); } catch { /* best effort */ } updates.show(); return; }
    if (act === 'seen') { browser.setUpdated(null); try { unlinkSync(paths.night); } catch { /* gone */ } return; }
    if (act === 'castlabs') { void updates.signin().then((ok) => { if (!ok) browser?.updateWhy('Terminal could not be opened. Try again in a moment.'); }); return; }
    if (act === 'file' || act === 'skip' || act === 'check') { updates.act(act); return; }
    if (act === 'back' && !updates.act('back')) browser.updateWhy('There is no earlier version kept to go back to.');
  });
  // After an overnight update: once, by the ... key, what it did.
  try { const n = JSON.parse(readFileSync(paths.night, 'utf8')); if (n.version === samara.installed().version && typeof n.title === 'string') browser.setUpdated({ title: n.title, lines: Array.isArray(n.lines) ? n.lines.map(String) : [] }); } catch { /* none */ }
  ipcMain.on('browser:updatego', (e) => {
    if (!browser?.isFrame(e.sender) || !updates) return;
    void updates.go().then((r) => { if (!r.ok) browser?.updateWhy(r.why ?? 'Not right now.'); });
  });

  // ---- the sync, through the brain on the PC
  const read = (f: string) => { try { return readFileSync(path.join(LISTENER, f), 'utf8').trim(); } catch { return ''; } };
  const key = read('bsync.key'), shadow = read('shadow');
  const sync = browser.startSync((m) => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); }, (s) => console.log('aang: ' + s));
  const connect = () => {
    if (!key || !/^100\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(shadow)) { console.log('aang: no sync key or PC address yet; run the Mac setup again'); return; }
    const s = new WebSocket(`ws://${shadow}:${SYNC_PORT}/bsync`, { headers: { 'x-aang-key': key }, maxPayload: 64 * 1024 * 1024 });
    ws = s;
    s.on('message', (raw) => {
      let m: any; try { m = JSON.parse(String(raw)); } catch { return; }
      if (typeof m?.t === 'string' && m.t.startsWith('bsync.')) void sync.got(m).catch((e: Error) => console.error('aang: sync: ' + e.message));
      // "Open on Mac" from the PC: a full tab here, and Aang comes to the front.
      else if (m?.t === 'tab.open' && typeof m.url === 'string' && /^https?:\/\//.test(m.url)) { browser?.openForward(m.url); app.focus({ steal: true }); }
      // "Send to Mac" from the PC: it plays here, in the pop-out.
      else if (m?.t === 'watch.open' && typeof m.url === 'string' && /^https:\/\//.test(m.url)) openPopRef?.(m.url);
      // His yes (2026-10-13): Claude may look at this browser's own window and its log, when it asks.
      else if (m?.t === 'diag.ask' && browser) {
        void Promise.all([browser.look(), popout.diag().catch(() => null)]).then(([l, pop]) => {
          let log = ''; try { log = readFileSync(path.join(app.getPath('userData'), 'aang.log'), 'utf8').split('\n').slice(-150).join('\n'); } catch { /* none */ }
          if (s.readyState === WebSocket.OPEN) s.send(JSON.stringify({ t: 'diag.reply', id: String(m.id ?? ''), ...l, popout: pop, log, versions: { electron: process.versions.electron, macos: process.getSystemVersion?.() ?? '' } }));
        }).catch((e: Error) => console.error('aang: look: ' + e.message));
      }
    });
    s.on('open', () => { if (process.uptime() > 75) reportUpdate(); });
    s.on('close', () => { if (ws === s) { ws = null; void sync.link(false); setTimeout(connect, 15_000); } });
    s.on('error', () => { /* close follows */ });
  };
  connect();

  // A Mac app stays open with no windows; clicking it in the Dock brings the browser back.
  app.on('activate', () => browser?.open());
  app.on('second-instance', () => browser?.open());
  app.on('before-quit', () => { if (process.uptime() > 20) markGood(); browser?.closeAll(); pages.close(); });
});

// Closing the last window does not quit: the sync keeps running, as Mac apps do. Cmd+Q quits.
app.on('window-all-closed', () => { /* stay */ });

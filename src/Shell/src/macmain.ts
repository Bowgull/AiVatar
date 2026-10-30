// M6 (his interview, 2026-10-13): Aang's browser on his MacBook. The same browser as on the PC (browser.ts and its
// pages, unchanged), started on its own: no pet, no bubble yet (those are M7 to M9). It keeps everything in step with
// the PC's browser through Aang's brain on the PC, over Tailscale (bsync.ts): bookmarks, settings, the same open
// tabs, history and logins. Money sites never travel. When the PC is off it works on its own and catches up later.
//
// Run as the "Aang" app the Mac setup makes (Aang.app in ~/Applications). It can be his default browser (his yes).
import { app, globalShortcut, Menu, nativeImage, net } from 'electron';
import { appendFileSync, existsSync, readFileSync, statSync, writeFileSync, unlinkSync } from 'node:fs';
import { MacEngine, MacPaths, MacSamara, MacStage } from './macsource.ts';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { samaraBase, samaraBrowser, type Platform, type SamaraBooted } from './boot.ts';
import { bootDeps } from './bootdeps.ts';
import { planDoorClient } from './plandoor.ts';
import type { DrmRuntime } from './drmrunner.ts';
import { onCastlabs } from './engineupdate.ts';
import { readSettings } from './settings.ts';
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

/** Samara, once the boot engine has started it (boot.ts). */
let boot: SamaraBooted | null = null;
const waiting: string[] = [];
const openUrl = (u: string) => {
  try { const x = new URL(u); if (x.protocol !== 'http:' && x.protocol !== 'https:') return; } catch { return; }
  if (boot) boot.browserNow.open(u); else waiting.push(u);
};
// A link he clicked while Aang is his default browser. It can arrive before the app is ready.
app.on('open-url', (e, u) => { e.preventDefault(); openUrl(u); });

// A second copy only hands over and leaves: nothing below may start in it (its servers and window raced the first one's).
const solo = app.requestSingleInstanceLock();
if (!solo) app.quit();

app.whenReady().then(async () => {
  if (!solo) return;
  // The Mac's own menu, so Cmd+C, Cmd+V, Cmd+Q and the rest work as on every Mac app.
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    // View > Enter Full Screen (Ctrl+Cmd+F), as on every Mac app (2026-10-23, his ask: "act like any other window").
    { role: 'appMenu' }, { role: 'editMenu' },
    // Sheet 87: ⇧⌘N opens the secret window whatever has the keyboard (the band too). Hidden: no sign of it in the menus.
    { label: 'View', submenu: [{ role: 'togglefullscreen' }, { label: 'New secret window', accelerator: 'Shift+Command+N', visible: false, acceleratorWorksWhenHidden: true, click: () => boot?.openSecret() }] },
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

  // castLabs' engine: Widevine must be loaded before a paid page asks for it (castLabs' own rule).
  if (onCastlabs()) {
    try { const c = (await import('electron') as any).components; await Promise.race([c.whenReady(), new Promise((r) => setTimeout(r, 15_000))]); console.log('aang: widevine ' + JSON.stringify(c.status())); }
    catch (e) { console.error('aang: widevine did not load: ' + (e as Error).message); }
  }
  const stateDir = app.getPath('userData');
  const log = (t: string) => console.log('aang: ' + t);
  // His pop-out switches and skips, read once at start (the Mac has no live switch for them yet).
  const popSettings = readSettings(stateDir);
  let skipSettings: SkipSettings = DEFAULT_SKIPS;
  try { const f = path.join(stateDir, 'skips.json'); if (existsSync(f)) skipSettings = withDefaults(JSON.parse(readFileSync(f, 'utf8'))); } catch { /* defaults */ }
  let ws: WebSocket | null = null;
  const toPc = (m: Record<string, unknown>, otherwise?: string): void => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); else if (otherwise) log(otherwise); };
  // Paid video (2026-10-13): Netflix, Crave, Disney+, Prime and Crunchyroll play in the castLabs window, signed for
  // streaming on his own free castLabs account. One engine (his yes, 2026-10-13): Aang.app is built on castLabs' engine,
  // so paid video plays right in the tab; only an Aang.app on the stock engine still sends it to the separate window.
  // Netflix was the exception on this Mac (his report, 2026-10-14: error E100 in Samara's own tab). 2026-10-25: the
  // video signature checks valid, and Netflix now gets Samara's honest name; it plays in the tab, and the paid-video
  // window (castLabs' own untouched app) is only its fallback.
  const paidWindow = (drm: DrmRuntime, url: string): boolean => {
    const why = drm.open(url, 'narrow');
    if (why) { console.error('aang: ' + why); return false; }
    return true;
  };
  const paidAway = (drm: DrmRuntime, url: string): boolean => (serviceFor(url)?.ready && !onCastlabs() ? paidWindow(drm, url) : false);

  // ---- the boot engine (boot.ts): everything of Samara's the same way as on the PC. Only the Dock, the menu, the
  // default-browser ask, the PC link and the front desk's card door are the Mac's own.
  const deps = bootDeps(log);
  const platform: Platform = {
    name: 'mac', here: HERE, stateDir, log,
    settings: () => popSettings, skips: () => skipSettings,
    drm: { shellDir: path.join(HERE, '..') },
    paidPop: (url, s) => paidAway(s.drm, url),
    other: {
      open: (url) => toPc({ t: 'open.onpc', url }, 'the PC is not reachable, so it was not opened there'),
      // "Send to PC": through the brain, which puts it in the PC's pop-out.
      send: (url) => toPc({ t: 'watch.topc', url }, 'the PC is not reachable, so it was not sent'),
    },
  };
  const base = await samaraBase(platform, deps);
  // The MOCKUPS trail on the Mac (2026-10-22): there is no AangApp repo here, but pages from the Mac's own Claude
  // sessions (their repos, or live local pages) land in it. It reads versions with git, so it is on only when Apple's
  // git is really installed: the /usr/bin/git stand-in would otherwise pop macOS's "install developer tools" window.
  const gitHere = ['/Library/Developer/CommandLineTools/usr/bin/git', '/Applications/Xcode.app/Contents/Developer/usr/bin/git'].some((f) => existsSync(f));
  // The update engine's Mac half (macsource.ts): Samara's code from GitHub and new castLabs engines, built into one new
  // Samara in the background. The Mac's script closes and restarts Samara itself.
  const paths = new MacPaths(LISTENER);
  let samara = null as MacSamara | null;
  // Sheet 37 on the Mac: plan cards go to Aang's bubble (the plan door, plandoor.ts), else Samara's band.
  const plans = planDoorClient({ keyFile: path.join(stateDir, 'plan-door.key'), log: (s) => console.log(s) });
  boot = samaraBrowser(base, platform, {
    options: { mockupsAnywhere: gitHere },
    secret: true,
    plans,
    mockupDoor: { offWhy: () => "Samara's Mockups trail on this Mac needs Apple's command line tools (git). Tell the user where the file is; they can install them with: xcode-select --install" },
    syncSend: (m) => toPc(m as never),
    updates: {
      sources: (changed) => {
        const stage = new MacStage(paths, { log, changed });
        samara = new MacSamara(paths, stage, { fetch: net.fetch as never, log, changed });
        return [samara, new MacEngine(paths, stage, { fetch: net.fetch as never, log, changed })];
      },
      prefsFile: paths.prefs, changelog: paths.changelog,
      inGame: () => false,
      // The script closes Samara itself; what to say the next time it opens is kept first (overnight only).
      beforeGo: (w) => { if (w.overnight) { try { writeFileSync(paths.night, JSON.stringify({ version: samara?.installed().version, title: w.title, lines: w.lines })); } catch { /* best effort */ } } },
      restart: () => { /* the Mac's script restarts Samara */ },
      seen: () => { try { unlinkSync(paths.night); } catch { /* gone */ } },
    },
  }, deps);
  const browser = boot.browserNow;
  const { popout, drm } = base;
  browser.onPaid = (url) => paidAway(drm, url);
  browser.onPaidFallback = (url) => paidWindow(drm, url);
  // Tidy asks Aang's brain, which is on the PC: from the Mac it says it is not reachable yet (until M7 links them).
  browser.onTidyAsk = (id) => browser.tidyAnswer(id, { ok: false, why: 'offline' });
  const sync = browser.sync!;

  // Sheet 21 (his pick, 2026-10-13): while Shadow is off, the Mac's front desk posts the morning brief and the like as
  // the same drawn cards. It cannot draw (it has no browser engine), so it asks here. Only from this Mac (loopback),
  // only with the hook key the setup wrote, never from a web page (no Origin), small bodies, one card at a time.
  {
    const cardKey = (() => { try { return readFileSync(path.join(LISTENER, 'hook.key'), 'utf8').trim(); } catch { return ''; } })();
    const cards = new CardRenderer(base.pages.origin);
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
  // The pop-out's keys: Ctrl+Shift+V hides and shows it; Ctrl+Alt+P pins it while it is up.
  const hk = holdHotkey(stateDir, () => popout.toggleHidden());
  if (hk.active) console.log(`aang: ${hk.active} hides and shows the pop-out`);
  let pinHeld = false;
  setInterval(() => {
    const up = Boolean(popout.window?.isVisible());
    if (up && !pinHeld) pinHeld = globalShortcut.register('Control+Alt+P', () => popout.togglePin());
    else if (!up && pinHeld) { globalShortcut.unregister('Control+Alt+P'); pinHeld = false; }
  }, 500).unref?.();
  app.on('before-quit', () => hk.release());
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

  const markGood = () => samara?.markGood();
  setTimeout(markGood, 60_000);

  // The report (his rule, 2026-10-14: a failed update must say why, so it can be fixed). After an update ran, once
  // the outcome is known (this Aang marked itself good, or the old one came back), what the update printed and the
  // end of Aang's own log go to the PC, which keeps them for Claude. Once per update run.
  const UPSENT = path.join(LISTENER, 'update.reported');
  const reportUpdate = () => {
    try {
      const ran = statSync(paths.updateLog).mtimeMs;
      let sent = 0; try { sent = Number(readFileSync(UPSENT, 'utf8')) || 0; } catch { /* never */ }
      if (ran <= sent || ws?.readyState !== WebSocket.OPEN) return;
      if (!samara) return;
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
  // After an overnight update: once, by the ... key, what it did.
  try { const n = JSON.parse(readFileSync(paths.night, 'utf8')); if (samara && n.version === samara.installed().version && typeof n.title === 'string') browser.setUpdated({ title: n.title, lines: Array.isArray(n.lines) ? n.lines.map(String) : [] }); } catch { /* none */ }

  // ---- the sync, through the brain on the PC
  const read = (f: string) => { try { return readFileSync(path.join(LISTENER, f), 'utf8').trim(); } catch { return ''; } };
  const key = read('bsync.key'), shadow = read('shadow');
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
      else if (m?.t === 'watch.open' && typeof m.url === 'string' && /^https:\/\//.test(m.url)) base.openPop(m.url);
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
  app.on('before-quit', () => { if (process.uptime() > 20) markGood(); });
});

// Closing the last window does not quit: the sync keeps running, as Mac apps do. Cmd+Q quits.
app.on('window-all-closed', () => { /* stay */ });

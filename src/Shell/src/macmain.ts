// M6 (his interview, 2026-10-13): Aang's browser on his MacBook. The same browser as on the PC (browser.ts and its
// pages, unchanged), started on its own: no pet, no bubble yet (those are M7 to M9). It keeps everything in step with
// the PC's browser through Aang's brain on the PC, over Tailscale (bsync.ts): bookmarks, settings, the same open
// tabs, history and logins. Money sites never travel. When the PC is off it works on its own and catches up later.
//
// Run as the "Aang" app the Mac setup makes (Aang.app in ~/Applications). It can be his default browser (his yes).
import { startClaudeDoor } from './claudedoor.ts';
import { app, globalShortcut, ipcMain, Menu, nativeImage } from 'electron';
import { appendFileSync, chmodSync, existsSync, openSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
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
  try { app.dock?.setIcon(nativeImage.createFromPath(path.join(HERE, '..', 'pages', 'art', 'samara', 'samara-512.png'))); } catch { /* the app's own icon stays */ }

  // Every button, menu and page of the browser, the same wiring as on the PC.
  wireBrowser(() => browser);
  // castLabs' engine: Widevine must be loaded before a paid page asks for it (castLabs' own rule).
  if (onCastlabs()) {
    try { const c = (await import('electron') as any).components; await Promise.race([c.whenReady(), new Promise((r) => setTimeout(r, 15_000))]); console.log('aang: widevine ' + JSON.stringify(c.status())); }
    catch (e) { console.error('aang: widevine did not load: ' + (e as Error).message); }
  }
  const stateDir = app.getPath('userData');
  const pages = await servePages(path.join(HERE, '..', 'pages'));
  browser = new AangBrowser({
    origin: pages.origin, stateDir, preloadPath: path.join(HERE, 'preload.cjs'), tabPreloadPath: path.join(HERE, 'tabpreload.cjs'),
    settingsPreloadPath: path.join(HERE, 'settingspreload.cjs'), thingsPreloadPath: path.join(HERE, 'thingspreload.cjs'),
  });
  // 6.25a: Claude sessions on this Mac drive the browser through its own door (claudedoor.ts).
  startClaudeDoor(() => browser, stateDir);
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
  if (!onCastlabs()) browser.onPaid = (url) => {
    const paid = serviceFor(url);
    if (!paid?.ready) return false;
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

  // ---- the update key (his yes, 2026-10-14: "update both aang the browser the code everything"). This Mac says which
  // version it runs; the PC answers with what is new; his UPDATE key lights up in the band. Restart now asks the PC for
  // the update over the same locked connection and runs it: the Mac setup's own steps, then Aang opens again. The
  // setup keeps the old Aang beside the new one and puts it back if the new one does not start (it marks itself good
  // after a minute up).
  const INSTALLED = path.join(LISTENER, 'browser', 'installed.json');
  const installed = (): { version: string; commit: string; status: string } => { try { const j = JSON.parse(readFileSync(INSTALLED, 'utf8')); return { version: String(j.version ?? ''), commit: String(j.commit ?? ''), status: String(j.status ?? '') }; } catch { return { version: '', commit: '', status: '' }; } };
  const markGood = () => { const i = installed(); if (i.status === 'trial') { try { writeFileSync(INSTALLED, JSON.stringify({ ...i, status: 'good' })); console.log(`aang: update ${i.version} is good`); } catch { /* next start */ } } };
  setTimeout(markGood, 60_000);
  // Smooth (2026-10-14: "when i hit update it doesnt just freeze my computer"): an offered update is fetched and the
  // new Samara made in the background at low priority (macOS background QoS), while he keeps working. Only then does
  // the key light up, with its number, its name and what it brings in plain words. Restart now just swaps it in.
  let offered: { version: string; label: string; name: string; notes: string[]; since: number } | null = null;
  let preparing = '', readyFile: { version: string; sha: string } | null = null;
  const triedPrepare = new Set<string>();
  const STAGED = path.join(LISTENER, 'browser', 'staged', 'version'), SCRIPT = path.join(LISTENER, 'update.sh');
  const failedUpdates = () => { try { return readFileSync(path.join(LISTENER, 'browser', 'failed-updates.txt'), 'utf8').split(/\s+/).filter(Boolean); } catch { return []; } };
  const stagedVersion = () => { try { return readFileSync(STAGED, 'utf8').trim(); } catch { return ''; } };
  const showReady = () => {
    if (!offered || stagedVersion() !== offered.version || readyFile?.version !== offered.version) return;
    browser?.setUpdate({ version: offered.version, since: offered.since, title: `Version ${offered.label}: ${offered.name}`, kind: 'Ready. Restart takes a few seconds.', checks: offered.notes });
  };
  const prepare = (m: any) => {
    const script = String(m.script ?? ''), sha = createHash('sha256').update(script).digest('hex');
    if (!offered || m.version !== offered.version || sha !== m.sha256 || !script.startsWith('#!/bin/bash')) { console.error('aang: the update did not check out; not used'); preparing = ''; return; }
    try {
      writeFileSync(SCRIPT, script); chmodSync(SCRIPT, 0o700);
      const log = path.join(LISTENER, 'update-prepare.log'), out = openSync(log, 'w');
      // taskpolicy -b: background priority for CPU and disk, so his Mac stays smooth while it works.
      const child = spawn('/usr/sbin/taskpolicy', ['-b', '/bin/bash', SCRIPT, 'prepare'], { stdio: ['ignore', out, out] });
      console.log(`aang: getting update ${m.version} ready in the background`);
      child.on('exit', (code) => {
        preparing = '';
        if (code === 0 && stagedVersion() === m.version) { readyFile = { version: m.version, sha }; console.log(`aang: update ${m.version} is ready`); showReady(); return; }
        let text = ''; try { text = readFileSync(log, 'utf8'); } catch { /* none */ }
        console.error(`aang: getting update ${m.version} ready failed (exit ${code})`);
        if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'update.report', ok: false, version: m.version, outcome: 'getting the update ready failed, so nothing changed', installed: installed(), updateLog: text.slice(-60_000), aangLog: '' }));
      });
    } catch (e) { preparing = ''; console.error('aang: the update could not be got ready: ' + (e as Error).message); }
  };
  const onUpdateMsg = (m: any, s: WebSocket) => {
    if (m.t === 'update.offer' && typeof m.version === 'string' && /^[0-9a-f]{6,64}$/.test(m.version)) {
      if (failedUpdates().includes(m.version)) { console.log(`aang: update ${m.version} failed to start before; not offered`); return; }
      const notes = (Array.isArray(m.notes) ? m.notes : []).map((x: unknown) => String(x).slice(0, 160)).slice(0, 12);
      offered = { version: m.version, label: /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(String(m.label)) ? String(m.label) : '', name: String(m.name ?? '').slice(0, 40), notes, since: Number(m.since) || Date.now() };
      if (stagedVersion() === m.version && readyFile?.version === m.version) { showReady(); return; }
      browser?.setUpdate(null);
      // Once per version per run: a failed one waits for the next start, never loops.
      if (!preparing && !triedPrepare.has(m.version) && s.readyState === WebSocket.OPEN) { preparing = m.version; triedPrepare.add(m.version); s.send(JSON.stringify({ t: 'update.get', version: m.version })); }
    } else if (m.t === 'update.none') { offered = null; browser?.setUpdate(null); }
    else if (m.t === 'update.fail') { preparing = ''; console.error('aang: update: ' + String(m.why ?? '')); }
    else if (m.t === 'update.script' && preparing === m.version) prepare(m);
  };
  // The report (his rule, 2026-10-14: a failed update must say why, so it can be fixed). After an update ran, once
  // the outcome is known (this Aang marked itself good, or the old one came back), what the update printed and the
  // end of Aang's own log go to the PC, which keeps them for Claude. Once per update run.
  const UPLOG = path.join(LISTENER, 'update.log'), UPSENT = path.join(LISTENER, 'update.reported');
  const reportUpdate = () => {
    try {
      const ran = statSync(UPLOG).mtimeMs;
      let sent = 0; try { sent = Number(readFileSync(UPSENT, 'utf8')) || 0; } catch { /* never */ }
      if (ran <= sent || ws?.readyState !== WebSocket.OPEN) return;
      const log = readFileSync(UPLOG, 'utf8'), i = installed(), failed = failedUpdates();
      const rolledBack = /putting the old one back/.test(log), tried = (/"version":"([0-9a-f]+)"/.exec(log) ?? [])[1] ?? '';
      const ok = !rolledBack && i.status === 'good' && !/npm (ERR|error)|failed; nothing was changed|did not match its fingerprint/i.test(log);
      const outcome = rolledBack ? 'the new Samara did not start, so the old one was put back'
        : /Installing the browser's libraries failed/.test(log) ? "installing the browser's libraries failed, so nothing was changed"
        : /did not match its fingerprint/.test(log) ? 'a download did not match its fingerprint, so it was not installed'
        : i.status === 'trial' ? 'it started but had not run a minute yet' : ok ? 'installed and running' : 'the update stopped part way (see its log)';
      let aangLog = ''; try { aangLog = readFileSync(path.join(app.getPath('userData'), 'aang.log'), 'utf8').split('\n').slice(-200).join('\n'); } catch { /* none */ }
      ws.send(JSON.stringify({ t: 'update.report', ok, version: i.version || tried || offered?.version || '', outcome, installed: i, failed: failed.slice(-5), updateLog: log.slice(-60_000), aangLog }));
      writeFileSync(UPSENT, String(ran));
      console.log(`aang: sent the update report (${outcome})`);
    } catch { /* no update has run */ }
  };
  setTimeout(reportUpdate, 75_000);
  ipcMain.on('browser:updatego', (e) => {
    if (!browser?.isFrame(e.sender) || !offered) return;
    if (browser.inCall) { browser.updateWhy("You're in a call. Restart when it's over."); return; }
    // Swap in the Samara made in the background: the same script it was made by, checked again before it runs.
    let ok = false; try { ok = !!readyFile && readyFile.version === offered.version && stagedVersion() === offered.version && createHash('sha256').update(readFileSync(SCRIPT)).digest('hex') === readyFile.sha; } catch { /* not there */ }
    if (!ok) { browser.updateWhy('The update is not ready yet. It will show up again when it is.'); return; }
    try {
      const out = openSync(path.join(LISTENER, 'update.log'), 'w');
      spawn('/bin/bash', [SCRIPT, 'swap'], { detached: true, stdio: ['ignore', out, out] }).unref();
      console.log(`aang: installing update ${offered.version}; Samara closes and opens again`);
    } catch (e) { browser.updateWhy('The update could not start: ' + (e as Error).message); }
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
      else if (typeof m?.t === 'string' && m.t.startsWith('update.')) onUpdateMsg(m, s);
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
    s.on('open', () => { const i = installed(); s.send(JSON.stringify({ t: 'update.have', version: i.version, commit: i.commit })); if (process.uptime() > 75) reportUpdate(); });
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

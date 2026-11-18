// Samara on the PC as its own program (Phase 2, 2026-11-12; his words: "i want samara as its own standalone browser that i
// use forever", and Aang and Samara "can see each other"). The same browser as main.ts runs today and as macmain.ts runs
// on the Mac, through the same boot engine (boot.ts), but in a process of its own: nothing Aang's windows do (the bubble,
// the Satchel, notes, timers, the family, the taskbar pop-outs) can take it down, and it never waits on them to start.
//
// Aang and Samara see each other through Aang's brain (link.ts, hello role 'samara'): the browser's own news (sync with
// the Mac, Claude driving, notes, Claude's jobs, Hyrule routes) comes here; what is Aang's goes to Aang's windows; and
// either side can hand the other a message (`relay`). Claude's plan cards go to Aang's bubble through the plan door
// (plandoor.ts), as on the Mac.
//
// OFF until he turns it on: AANG_SAMARA_APART=1. Until then main.ts runs the browser as before. Run: electron src/samara.ts
import { app, Menu, net, session, shell } from 'electron';
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { samaraBase, samaraBrowser, type Platform, type SamaraBooted } from './boot.ts';
import { bootDeps } from './bootdeps.ts';
import { CoreLink } from './link.ts';
import { catchStrays, openLog } from './log.ts';
import { localStamp } from './clock.ts';
import { sched } from './sched.ts';
import { planDoorClient } from './plandoor.ts';
import { claudeOpenTarget, type ClaudeOpen } from './claudewire.ts';
import { EngineUpdates, onCastlabs } from './engineupdate.ts';
import { pcEngine, pcSamara } from './pcsource.ts';
import { SamaraUpdates, samaraRoot } from './pcupdate.ts';
import { readSettings } from './settings.ts';
import { DEFAULT_SKIPS, withDefaults, type SkipSettings } from './skip/settings.ts';
import { readJson } from './store.ts';
import { notReadyBecause, serviceFor } from './services.ts';
import { CardRenderer } from './cardrender.ts';
import { RedditFeed } from './reddit.ts';
import { samaraShortcutsLit } from './shortcuticon.ts';
import { SAMARA_JUMP_ICON, taskFromArgv, taskFromLockData, writeSamaraJumpList, type SamaraTask } from './jumplist.ts';
import { jumpIcons } from './taskbar.ts';
import { isPopoutTask } from './taskbarplan.ts';

const PORT = Number(process.env.AANG_PORT ?? 47831);
const STATE_DIR = process.env.AANG_STATE_DIR ?? path.join(process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'), 'Aang');
const DATA_DIR = process.env.AANG_DATA_DIR ?? path.join(os.homedir(), 'Documents', 'Aang');
const HERE = import.meta.dirname;
const SHELL_HOME = process.env.AANG_SHELL_HOME && existsSync(process.env.AANG_SHELL_HOME) ? process.env.AANG_SHELL_HOME : path.join(HERE, '..');
const AANG_ICON = path.join(HERE, '..', 'assets', 'aang.ico');
/** The exit code for a planned restart (an update), the same as main.ts's and the pet's (CoreSupervisor.cs). */
const UPDATE_RESTART = 75;
// Tests run a copy of their own: its own profile, never his (his cookies and logins live in the default one).
if (process.env.AANG_USER_DATA) app.setPath('userData', process.env.AANG_USER_DATA);

// The same engine switches as main.ts (one engine, paid video in the tabs; see main.ts for the measurements).
if (onCastlabs()) {
  app.commandLine.appendSwitch('disable_direct_composition_video_overlays');
  app.commandLine.appendSwitch('disable-features', 'HardwareSecureDecryption,HardwareSecureDecryptionExperiment,HardwareSecureDecryptionFallback');
}
app.commandLine.appendSwitch('enable-features', 'ParallelDownloading');

// Its own log, beside the Shell's.
{
  const log = openLog('samara', path.join(STATE_DIR, 'samara.log'), { maxBytes: 1024 * 1024, checkEvery: 200 });
  const write = (a: unknown[]) => { try { log.line(`${localStamp()} ${a.map((x) => (typeof x === 'string' ? x : x instanceof Error ? x.stack ?? x.message : JSON.stringify(x))).join(' ')}`); } catch { /* never stops Samara */ } };
  for (const s of [process.stdout, process.stderr]) s?.on?.('error', () => { /* nobody reading */ });
  if (!process.env.AANG_TEST) { console.log = (...a: unknown[]) => write(a); console.error = (...a: unknown[]) => write(a); console.warn = (...a: unknown[]) => write(a); }
}
catchStrays('samara');

/** Aang's pet is running (body.pid names a live process from this boot; see main.ts bodyAlive). */
function aangUp(): boolean {
  try {
    const f = path.join(STATE_DIR, 'body.pid');
    if (statSync(f).mtimeMs < Date.now() - os.uptime() * 1000 - 5_000) return false;
    const pid = Number(readFileSync(f, 'utf8').trim()); if (!pid) return false; process.kill(pid, 0); return true;
  } catch { return false; }
}
/** Start Aang (the pet, then the brain), once however many asks. */
let wokeAt = 0;
function wakeAang(): void {
  if (Date.now() - wokeAt < 30_000 || process.env.AANG_TEST) return;
  wokeAt = Date.now();
  try {
    const exe = readFileSync(path.join(STATE_DIR, 'body-exe.txt'), 'utf8').trim();
    if (exe && existsSync(exe)) { spawn(exe, [], { detached: true, stdio: 'ignore', cwd: path.dirname(exe) }).unref(); console.log('samara: starting Aang'); }
  } catch (e) { console.error('samara: could not start Aang: ' + (e as Error).message); }
}

// One Samara at a time. A second copy hands over its task or link and leaves.
const startTask = taskFromArgv(process.argv);
const solo = app.requestSingleInstanceLock(startTask ? { samaraTask: startTask } : undefined);
if (!solo) { console.log('samara: another one is already running'); app.exit(0); }
else {
  // So the pet and a link from Windows join this one instead of starting a second (CoreSupervisor.RunningSamara).
  try { mkdirSync(STATE_DIR, { recursive: true }); writeFileSync(path.join(STATE_DIR, 'samara.pid'), String(process.pid)); } catch (e) { console.error('samara: could not write samara.pid: ' + (e as Error).message); }
  app.on('will-quit', () => { try { if (readFileSync(path.join(STATE_DIR, 'samara.pid'), 'utf8').trim() === String(process.pid)) unlinkSync(path.join(STATE_DIR, 'samara.pid')); } catch { /* gone */ } });
}

let boot: SamaraBooted | null = null;
let pending: SamaraTask | null = startTask;
const waitingUrls: string[] = [];
/** A link from Windows (Aang.exe --url passes it on the command line of a second start). */
const urlsIn = (argv: string[]) => argv.filter((a) => /^https?:\/\//i.test(a)).slice(0, 5);
waitingUrls.push(...urlsIn(process.argv));

/** A taskbar task: the browser's own here; New note, Timer and the Music player are Aang's, handed to him. */
function runTask(t: SamaraTask): void {
  if (!boot) { pending = t; return; }
  if (!isPopoutTask(t)) { boot.browserNow.jumpTask(t); return; }
  if (link.connected) { link.send({ t: 'relay', m: { t: 'samara.task', task: t } } as never); return; }
  // Aang is off: start him; the task goes over once his brain answers (45 s at most).
  wakeAang();
  const until = Date.now() + 45_000;
  const tick = setInterval(() => {
    if (!link.connected && Date.now() < until) return;
    clearInterval(tick);
    if (link.connected) link.send({ t: 'relay', m: { t: 'samara.task', task: t } } as never);
  }, 500);
}
app.on('second-instance', (_e, argv, _cwd, data) => {
  const t = taskFromLockData(data) ?? taskFromArgv(argv);
  if (t) { console.log('samara: taskbar task ' + t); runTask(t); return; }
  const urls = urlsIn(argv);
  if (!boot) { waitingUrls.push(...urls); return; }
  if (urls.length) for (const u of urls) boot.browserNow.open(u); else boot.browserNow.open();
});

/** Aang's brain: the browser's news in, and the way to Aang's windows. */
let cards: CardRenderer | null = null;
const link = new CoreLink({
  port: PORT, stateDir: STATE_DIR, role: 'samara',
  onMessage: (m) => {
    const b = boot?.browserNow;
    if (typeof m.t === 'string' && m.t.startsWith('bsync.')) { void b?.sync?.got(m as never).catch((e: Error) => console.error('samara: sync: ' + e.message)); return; }
    if (m.t === 'claude.jobs' || m.t === 'claude.wait') { b?.claudeNews(m); return; }
    if (m.t === 'browser.open' && typeof m.url === 'string') { b?.openForward(m.url); return; }
    if (m.t === 'browser') { b?.open(); return; }
    if (m.t === 'engine.go') { void boot?.updates.go(); return; }
    if (m.t === 'popout.open' && typeof m.url === 'string') { boot?.openPop(m.url); return; }
    if (m.t === 'popout.close') { boot?.popout.close(); boot?.drm.close(); return; }
    if (m.t === 'hyrule.route') { if (b) b.hyruleRoute(m); else link.send({ t: 'hyrule.route.done', id: String(m.id ?? ''), state: 'off' }); return; }
    if (m.t === 'notes.state' && Array.isArray(m.notes)) {
      const own = Array.isArray((m.cats as { own?: unknown } | undefined)?.own) ? ((m.cats as { own: unknown[] }).own).map(String) : [];
      b?.notesNews(m.notes, own); return;
    }
    if (m.t === 'tidy.answer' && Number.isInteger(m.id)) { b?.tidyAnswer(Number(m.id), { ok: m.ok === true, text: typeof m.text === 'string' ? m.text : '', why: typeof m.why === 'string' ? m.why : '' }); return; }
    if (m.t === 'drive' && Number.isInteger(m.id) && typeof m.op === 'string') {
      const id = Number(m.id), a = (m.a && typeof m.a === 'object') ? m.a as Record<string, unknown> : {};
      // A card Aang draws for Discord (9.D D3), off screen with Samara's pages.
      if (m.op === 'card') {
        if (!boot) { link.send({ t: 'drive.result', id, ok: false, error: 'the pages are not ready' } as never); return; }
        cards ??= new CardRenderer(boot.pages.origin);
        void cards.render(String(a.kind ?? ''), a.data).then((r) => link.send({ t: 'drive.result', id, ...r } as never));
        return;
      }
      if (!b) { link.send({ t: 'drive.result', id, ok: false, error: 'the browser is not running' } as never); return; }
      void b.drive(m.op.slice(0, 12), a).then((r) => link.send({ t: 'drive.result', id, ...r } as never));
      return;
    }
    // From Aang's windows (through the brain): open the browser or a page.
    if (m.t === 'relay' && m.m && typeof m.m === 'object') {
      const r = m.m as Record<string, unknown>;
      if (r.t === 'samara.open') { if (typeof r.url === 'string' && /^https?:\/\//i.test(r.url)) b?.open(r.url); else b?.open(); return; }
      // His browser sounds switch on Aang's desk, and Aang's line about an update (the card comes up open).
      if (r.t === 'samara.sounds') { b?.setSounds(r.on === true); return; }
      if (r.t === 'samara.update') { b?.open(); b?.openUpdate(); return; }
    }
  },
  onConnected: (up) => { if (!up) boot?.browserNow.claudeNews(null); },
});

app.setAppUserModelId('Aang');
app.on('browser-window-created', (_e, w) => {
  try { w.setIcon(AANG_ICON); } catch { /* the default icon */ }
  try { w.setAppDetails({ appId: 'Aang', appIconPath: AANG_ICON, appIconIndex: 0, relaunchDisplayName: 'Samara' }); } catch { /* not Windows */ }
});

/** Open in Claude: the link, then Aang's pet brings the Claude window forward (see main.ts openInClaude). */
function openInClaude(t: ClaudeOpen): void {
  boot?.browserNow.claudeFold();
  if (t.kind === 'mac') { link.send({ t: 'claude.front', host: 'mac' } as never); return; }
  const front = () => link.send({ t: 'bubble.focus', focus: 'Claude' } as never);
  if (t.kind === 'front') { front(); return; }
  shell.openExternal(t.url).catch((e: Error) => console.error('samara: Open in Claude: ' + e.message));
  setTimeout(front, 700);
}

/** Restart for an update: through Aang.exe --samara, which waits for this one to finish (Program.cs). */
function exitForUpdate(): void {
  try {
    const exe = readFileSync(path.join(STATE_DIR, 'body-exe.txt'), 'utf8').trim();
    if (exe && existsSync(exe)) spawn(exe, ['--samara', '--after', String(process.pid)], { detached: true, stdio: 'ignore' }).unref();
  } catch (e) { console.error('samara: could not arrange to reopen after the update: ' + (e as Error).message); }
  app.exit(UPDATE_RESTART);
}

app.whenReady().then(async () => {
  if (!solo) return;
  Menu.setApplicationMenu(null);
  const log = (s: string) => console.log('samara: ' + s);
  const settings = readSettings(STATE_DIR);
  let skips: SkipSettings = DEFAULT_SKIPS;
  try { const raw = readJson<unknown>(path.join(STATE_DIR, 'skips.json'), null); if (raw !== null) skips = withDefaults(raw); } catch { /* defaults */ }
  const paidOnPc: Platform['paidPop'] = (url, s) => {
    const paid = serviceFor(url);
    if (!paid) return false;
    if (!paid.ready) { console.error(`samara: ${notReadyBecause(paid.id)}`); return false; }
    s.popout.close();
    const why = s.drm.open(url);
    if (why) { console.error(`samara: ${why}`); return false; }
    return true;
  };
  const platform: Platform = {
    name: 'pc', here: HERE, stateDir: STATE_DIR, log,
    settings: () => settings, skips: () => skips,
    drm: { shellDir: SHELL_HOME, codeDir: path.join(HERE, '..'), onExit: (code) => log(`the paid-video runtime stopped (code ${code})`) },
    paidPop: paidOnPc,
    other: { open: (url) => link.send({ t: 'open.onmac', url } as never), send: (url) => link.send({ t: 'watch.tomac', url } as never) },
    playback: (s) => { link.send({ t: 'watch.state', ...s } as never); link.send({ t: 'relay', m: { t: 'watch.state', ...s } } as never); },
  };
  const deps = bootDeps(log);
  const base = await samaraBase(platform, deps);
  log(`pages on ${base.pages.origin}`);
  // Claude's plan cards and Ask Claude go to Aang's bubble through his door (plandoor.ts), as on the Mac.
  const plans = planDoorClient({ keyFile: path.join(STATE_DIR, 'plan-door.key'), log });
  let engineUpdates: EngineUpdates | null = null, samaraUpdates: SamaraUpdates | null = null;
  let engineSrc: ReturnType<typeof pcEngine> | null = null;
  boot = samaraBrowser(base, platform, {
    options: { repoDir: path.join(SHELL_HOME, '..', '..') },
    secret: true,
    plans,
    claude: plans,
    mockupDoor: { offWhy: () => "Samara's Mockups trail is switched off. Tell the user where the file is." },
    syncSend: (m) => link.send(m as never),
    updates: {
      sources: (changed) => {
        // A test copy never updates anything (2026-11-12: one unpacked a 368 MB engine into the real engines folder).
        if (process.env.AANG_TEST) return [];
        engineUpdates = new EngineUpdates({ shellDir: SHELL_HOME, stateDir: STATE_DIR, quietNow: () => boot?.browserNow.inCall === true, changed,
          signinNeeded: (signIn) => link.send({ t: 'engine.signin', signIn } as never) });
        const root = !process.env.AANG_TEST ? samaraRoot() : null;
        if (root) samaraUpdates = new SamaraUpdates({ root, codeDir: path.join(HERE, '..'), fetch: net.fetch as never, changed, changelog: path.join(DATA_DIR, 'Samara Changelog.md') });
        engineSrc = pcEngine(engineUpdates, { browserOpen: () => boot?.browserNow.showing === true });
        return [...(samaraUpdates ? [pcSamara(samaraUpdates)] : []), engineSrc];
      },
      prefsFile: path.join(STATE_DIR, 'update-prefs.json'), changelog: path.join(DATA_DIR, 'Samara Changelog.md'),
      inGame: () => false,
      beforeGo: (w) => { if (engineSrc) engineSrc.overnight = w.overnight ? { title: w.title, lines: w.lines } : null; },
      restart: () => { boot?.browserNow.closeAll(); setTimeout(exitForUpdate, 400); },
      wentBack: () => { boot?.browserNow.closeAll(); setTimeout(exitForUpdate, 400); },
      told: (card) => link.send({ t: 'update.ready', update: card ? { version: card.version, title: card.title ?? '', signin: card.signin === 'ask',
        lines: card.groups.flatMap((g) => g.items.map((i) => i.text)).slice(0, 3) } : null } as never),
    },
  }, deps);
  const b = boot.browserNow;
  // The browser's news for Aang's brain, as main.ts wires it.
  b.onNoteSave = (n) => link.send({ t: 'notes.save', note: n } as never);
  b.onNotePlace = (m) => link.send(m as never);
  b.onNoteOpen = (id) => link.send({ t: 'relay', m: { t: 'samara.note.open', id } } as never);
  b.onRouteDone = (r) => link.send({ t: 'hyrule.route.done', ...r } as never);
  b.onAsk = (text) => { if (!link.send({ t: 'relay', m: { t: 'samara.ask', text } } as never)) log('Aang is not there, so the question did not reach him'); };
  b.onClaude = (m) => { link.send(m as never); };
  b.onClaudeOpen = (target) => openInClaude(target);
  b.onDriverStop = (j) => { link.send({ t: 'drive.stopped', job: j.id } as never); };
  b.onTidyAsk = (id, prompt) => { if (!link.send({ t: 'tidy.ask', id, prompt } as never)) b.tidyAnswer(id, { ok: false, why: 'offline' }); };
  b.onCall = (on) => { const e = engineUpdates as EngineUpdates | null; if (!on && e && !e.ready) void e.check(); };
  if (!onCastlabs()) b.onPaid = (url) => boot?.openPop(url) ?? false;
  // Made inside sources() above, which the boot engine has already called by now.
  const eu = engineUpdates as EngineUpdates | null;
  eu?.start();
  if (samaraUpdates) { const su = samaraUpdates as SamaraUpdates; setTimeout(() => su.markGood(), 5 * 60_000); }
  {
    const done = eu?.justUpdated();
    if (done) { if (done.overnight && done.title) b.setUpdated({ title: done.title, lines: done.lines ?? [] }); if (done.browser) b.open(); }
  }
  // The Shrine Reddit feed (sheet R18) reads with his own browser session, so it lives with the browser.
  if (!process.env.AANG_TEST) {
    const ses = session.fromPartition('persist:aang-browser');
    const reddit = new RedditFeed({ reddit: ((u: string, i?: RequestInit) => ses.fetch(u, i)) as never, plain: ((u: string, i?: RequestInit) => net.fetch(u, i)) as never, dir: STATE_DIR, log });
    sched.every('reddit.feed', 30 * 60_000, () => reddit.run(), { quiet: true, catchUp: true, first: 90_000 });
    reddit.listen();
  }
  // Samara's taskbar list: written under its own app id; its pop-out items are Aang's (runTask hands them over).
  if (!process.env.AANG_TEST) {
    const popouts = { aang: aangUp(), icons: jumpIcons(path.join(app.getPath('userData'), 'taskbar-icons'), AANG_ICON) };
    log('taskbar list: ' + writeSamaraJumpList(app, { main: path.join(HERE, 'samara.ts'), dir: path.join(HERE, '..'), icon: SAMARA_JUMP_ICON, ownId: 'Aang', popouts }));
  }
  link.start();
  // Started by a link, a task or his click: the window comes up. Started quietly (--quiet, a Claude session): only the doors.
  if (!process.argv.includes('--quiet') || waitingUrls.length) {
    b.open(waitingUrls.shift());
    for (const u of waitingUrls.splice(0)) b.open(u);
  }
  if (pending) { const t = pending; pending = null; runTask(t); }
  // Aang's helpers while he runs (main.ts rebinds the same every 3 s): Ask Claude's chats come through his door.
  setInterval(() => { if (!aangUp() && !b.hasWindow() && process.uptime() > 20) { log('no window and Aang is off: closing'); app.quit(); } }, 3000).unref();
  // The lantern on his shortcuts: lit while a window is open.
  if (!process.env.AANG_TEST) setInterval(() => samaraShortcutsLit(b.hasWindow()), 1000).unref();
});

// Closing the last window does not end Samara while Aang runs: Claude's door and the sync stay up (checked above).
app.on('window-all-closed', () => { /* the 3 s check decides */ });
app.on('before-quit', () => { if (!process.env.AANG_TEST) samaraShortcutsLit(false, { quitting: true }); link.stop(); });
void claudeOpenTarget;

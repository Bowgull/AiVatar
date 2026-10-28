// Sheet 101 (2026-10-28, his picks; the Mac is Aang's home): Aang himself on the Mac, as his own small app. Samara stays
// its own app (macmain.ts); this one holds the pet, the speech bubble, the chat box, the right-click menu and the menu
// bar Aang, and talks to the brain on this Mac the same way the PC's Shell does (link.ts, client 'desktop').
//
// On the PC the C# pet (src/Body) says where Aang is (pet.at), that he was clicked, right-clicked or dragged, and the
// Shell places the bubble and the box from that. Here the pet is a page of ours (pages/macpet.js), so all of that is
// decided right here, with the same placement maths (anchor.ts) and the same windows (bubble.ts, input.ts, aangmenu.ts).
//
// His picks: docked at the bottom like the PC (34 px of forehead and eyes; 90 when he has something to say); when the
// Dock slides up he rides on top of it; with the Shadow window in front he tucks away (the PC's Aang comes out there);
// a menu bar Aang opens the same menu as right-clicking him.
//
// Run: electron src/macaang.ts   (the LaunchAgent com.aang.pet does this)
import { app, BrowserWindow, Menu, Tray, clipboard, ipcMain, nativeImage, screen, shell } from 'electron';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CoreLink } from './link.ts';
import { Bubble } from './bubble.ts';
import { InputBox } from './input.ts';
import { AangMenu } from './aangmenu.ts';
import { Wheel } from './wheelwin.ts';
import { TimerWindows, type TimerData } from './timerwin.ts';
import { bubbleAt, headOf, inputAt, type PetAt } from './anchor.ts';
import { servePages, type PageServer } from './pageserver.ts';
import { writeFileAtomic } from './atomic.ts';

const HERE = import.meta.dirname;
const ROOT = path.join(HERE, '..', '..', '..');
const PORT = Number(process.env.AANG_PORT ?? 47831);
/** The brain's folder on the Mac (index.ts): its password for us (shell.token) lives here. Samara uses it too. */
const STATE_DIR = process.env.AANG_STATE_DIR ?? path.join(os.homedir(), 'Library', 'Application Support', 'Aang');
const FRAMES_DIR = process.env.AANG_FRAMES_DIR ?? path.join(ROOT, 'assets', 'aang', 'frames');
const CHIMES_DIR = path.join(ROOT, 'assets', 'aang', 'sfx', 'chimes');

// His windows are see-through and float over other apps, so Chromium takes them for hidden behind those apps and stops
// painting them (2026-10-28: the bubble was drawn and placed, and the screen still showed nothing; he stayed tucked on
// screen after sliding out). Always paint.
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
// Not Samara's folder: two apps on one Chromium profile fight over its lock.
app.setName('Aang');
app.setPath('userData', path.join(os.homedir(), 'Library', 'Application Support', 'AangPet'));
if (!app.requestSingleInstanceLock()) { console.log('aang: already running'); app.exit(0); }
process.on('uncaughtException', (e) => console.error('aang: uncaught: ' + (e as Error).message));
process.on('unhandledRejection', (e) => console.error('aang: unhandled: ' + String(e)));

// ---------------------------------------------------------------- where he is
/** His art box inside the 224 px frame (anchor.ts ART_IN_FRAME; measured off idle_0.png). */
const ART = { x: 88, y: 78, w: 50, h: 126 };
const MARK = 60;                                   // macpet.js: room above his head for a mark
const PEEK = 34, MORE = 90, OUT = ART.h;           // Dock.cs PeekPx, PeekMorePx; out = all of him
/** The Mac's Dock at his 64 px tiles: when it is up, its top edge is this far above the bottom (sheet 101). */
const DOCK_H = 80;
const SLIDE_MS = 170;                              // PetWindow.cs SlideMs
const TUCK_AFTER_MS = 45_000;                      // the PC's idle tuck
const SETTINGS = () => path.join(app.getPath('userData'), 'pet.json');

type Pose = 'hidden' | 'peek' | 'more' | 'out';
const SHOW: Record<Pose, number> = { hidden: 0, peek: PEEK, more: MORE, out: OUT };

let pet: BrowserWindow | null = null;
let petX = 0;                                      // the frame's left edge on screen
// Like the PC (his correction, 2026-10-28, watching it live): a full sprite, free anywhere on the screen; he docks (the
// 34 px peek) only when dropped at an edge.
let pose: Pose = 'out';
let show = OUT;
let docked = false;
/** Free: where the top of his art is. Docked: worked out from the floor. */
let artY = 0;
/** Dock.cs SnapPx: dropped within this of the bottom edge (or the Dock's top), he docks there. */
const SNAP = 24;                                   // pixels of his art showing now (animated towards SHOW[pose])
let dockUp = false;
let shadowFront = false;
let hidden = false;
let lastTouch = Date.now();
let slide: { from: number; to: number; at: number } | null = null;
let markNow: string | null = null;
/** His window is taking the mouse (the pointer is on him). */
let mouseOn = false;
/** The mouse is held on him and the wheel is up: his window keeps the mouse until it is let go, wherever it goes. */
let wheelHeld = false;

function display() { return screen.getPrimaryDisplay(); }
/** The line he stands on: the screen's bottom, or the Dock's top while it is up. */
function floor(): number { const b = display().bounds; return b.y + b.height - (dockUp ? DOCK_H : 0); }

/** The top of his art on screen: from the floor when docked, where he was put when free. */
function artTop(): number { return docked ? floor() - show : artY; }

/** What the PC's pet sends as pet.at, worked out here (anchor.ts reads it the same way). */
function petAt(): PetAt {
  const area = display().workArea;
  return {
    sprite: { x: petX + ART.x, y: artTop(), width: ART.w, height: ART.h },
    screen: { x: area.x, y: area.y, width: area.width, height: area.height },
    scale: 1, edge: docked ? 'bottom' : 'none', peeking: docked && (pose === 'peek' || pose === 'hidden'),
  };
}

/**
 * The window is exactly the part of him that shows plus the mark's room above, its bottom on the floor. macOS pushes a
 * window that hangs off the bottom of the screen back up (seen on his screen, 2026-10-28: he floated 112 px up), so
 * nothing of it may be below the edge: the slide grows and shrinks the window instead of moving it.
 */
function placePet(): void {
  if (!pet || pet.isDestroyed()) return;
  const h = MARK + Math.max(1, show);
  pet.setBounds({ x: petX, y: artTop() - MARK, width: 224, height: h });
  pet.webContents.send('pet:state', { show });
}

function setPose(p: Pose): void {
  if (hidden && p !== 'hidden') return;
  pose = p;
  const to = SHOW[p];
  if (to === show) { placeWindows(); return; }
  slide = { from: show, to, at: Date.now() };
}

/** One step of the slide, and the Dock watch. 16 ms while moving, otherwise as slow as the cursor allows. */
function step(): void {
  if (slide) {
    const t = Math.min(1, (Date.now() - slide.at) / SLIDE_MS);
    const e = 1 - Math.pow(1 - t, 3);
    show = Math.round(slide.from + (slide.to - slide.from) * e);
    placePet();
    if (t >= 1) { slide = null; placeWindows(); }
  }
  // The Dock hides at the bottom and slides up when the pointer reaches the bottom edge, then stays while the pointer is on
  // it. macOS does not say when it is up, so this follows the pointer the way the Dock itself does.
  const c = screen.getCursorScreenPoint(), b = display().bounds, bottom = b.y + b.height;
  const up = dockUp ? c.y >= bottom - DOCK_H - 6 : c.y >= bottom - 2;
  if (up !== dockUp) { dockUp = up; if (docked) { placePet(); placeWindows(); } }
  // Is the pointer on him? macOS does not pass mouse moves to a window that is letting clicks through (2026-10-28: a
  // right-click went straight through him), so the pointer is followed here and his window takes the mouse only while
  // it is over him (his art box, and his mark when one shows).
  const top = artTop() - (markNow ? 52 : 2);
  const over = !hidden && show > 0 && c.x >= petX + ART.x - 2 && c.x <= petX + ART.x + ART.w + 2 && c.y >= top && c.y <= artTop() + show;
  if (over !== mouseOn || dragFrom || wheelHeld) {
    const on = over || !!dragFrom || wheelHeld;
    if (on !== mouseOn) { mouseOn = on; if (process.env.AANG_PET_TRACE) console.log(`aang: mouse ${on ? 'on' : 'off'} him at ${c.x},${c.y}`); pet?.setIgnoreMouseEvents(!on, { forward: true }); if (on) { lastTouch = Date.now(); if (pose === 'peek') setPose('out'); } }
  }
  const near = Math.abs(c.x - (petX + ART.x + ART.w / 2)) < 160 && Math.abs(c.y - artTop()) < 240;
  // Docked and out with nothing showing for 45 s: he tucks back into the edge (the PC's idle tuck). Free, he stays.
  if (docked && (pose === 'out' || pose === 'more') && !input?.visible && !bubbleUp && Date.now() - lastTouch > TUCK_AFTER_MS) setPose('peek');
  setTimeout(step, slide || near || dragFrom ? 16 : (c.y > bottom - 140 ? 80 : 250));
}

function anim(s: string): void { pet?.webContents.send('pet:state', { anim: s }); }

// ---------------------------------------------------------------- the windows around him
let pages: PageServer | null = null;
let bubble: Bubble | null = null;
let input: InputBox | null = null;
let menu: AangMenu | null = null;
let wheel: Wheel | null = null;
let timerWins: TimerWindows | null = null;
/** The brain's notes, as it last sent them (the bubble's board edits these). */
let notesLatest: { id: string; out?: unknown }[] = [];
let tray: Tray | null = null;
let bubbleUp = false;
let heldBubble: Record<string, unknown> | null = null;
let liveAsk: Record<string, unknown> | null = null;
let inputMode = 'auto';
let lastWeek = 0, lastLevel = 'ok', lastFive = 0, lastWeekResetsAt = 0;
let muted = false;
let ackWait: { id: string; timer: NodeJS.Timeout } | null = null;
const HISTORY_FILE = () => path.join(app.getPath('userData'), 'history.json');
const readJson = (f: string): unknown => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; } };

/** bubble.ts places itself by these; the box goes up by its height while it is open (main.ts bubbleBox). */
function bubbleBox(size: { width: number; height: number }): Electron.Rectangle {
  const at = petAt(), box = bubbleAt(at, size);
  if (!input?.visible) return box;
  return { ...box, y: Math.max(at.screen.y, box.y - 14) };
}
function aimTail(w: BrowserWindow, box: { x: number; y: number }): void {
  const h = headOf(petAt());
  w.webContents.send('bubble:aim', { x: h.x - box.x, y: h.y - box.y, flip: h.x - box.x < 0, s: 1 });
}
function placeWindows(): void {
  const iw = input?.visible ? input.window() : null;
  if (iw && !iw.isDestroyed()) { const [width, height] = iw.getSize(); const box = inputAt(petAt(), { width, height }); iw.setPosition(box.x, box.y); }
  const b = bubble?.window();
  if (b && !b.isDestroyed()) { const [width, height] = b.getSize(); const box = bubbleBox({ width: width - 72, height: height - 38 }); b.setPosition(box.x, box.y); aimTail(b, box); }
}

function openTypeBox(): void {
  if (!input) return;
  lastTouch = Date.now();
  link.send({ t: 'poked' });
  setPose('out');
  input.open(inputAt(petAt(), { width: 268, height: 112 }), {
    maxH: Math.round(display().workArea.height * 0.66), history: readJson(HISTORY_FILE()) ?? [], mode: inputMode,
    week: lastWeek, level: lastLevel, five: lastFive, weekResetsAt: lastWeekResetsAt, starters: [],
  });
  bubble?.send('bubble:recall', 'recent');
}

/** Say it: slide out to talk first when he is tucked (the PC holds the reply until he is out). */
function say(m: Record<string, unknown>): void {
  heldBubble = m;
  if (shadowFront || hidden) return;              // held: said when he is back on the Mac
  if (docked && pose === 'peek') {
    setPose('more');
    setTimeout(() => { if (heldBubble === m) { bubble?.send('brain:message', m); bubble?.show(); } }, SLIDE_MS + 40);
    return;
  }
  bubble?.send('brain:message', m);
}

// ---------------------------------------------------------------- the brain
const link = new CoreLink({
  port: PORT,
  stateDir: STATE_DIR,
  onMessage: (m) => {
    if (m.t === 'claude.mark') {
      markNow = typeof m.mark === 'string' && m.mark !== 'none' ? m.mark : null;
      pet?.webContents.send('pet:state', { mark: markNow, ...(typeof m.flash === 'string' ? { flash: m.flash } : {}) });
      if (typeof m.sound === 'string' && !muted) chime(m.sound);
    }
    // The Mac's front app, from the brain (the presence helper sees it): the Shadow window in front means he is on the
    // PC, so the Mac's Aang tucks away (his pick), and comes back when it goes.
    if (m.t === 'mac.front') {
      const s = m.shadow === true;
      if (s !== shadowFront) { shadowFront = s; if (s) { bubble?.hide(); input?.close(false); setPose('hidden'); } else { setPose('out'); if (heldBubble) say(heldBubble); } }
      return;
    }
    if (m.t === 'ack' && ackWait && m.id === ackWait.id) { clearTimeout(ackWait.timer); ackWait = null; }
    if (m.t === 'quota') {
      lastWeek = Number(m.week) || 0; lastLevel = String(m.level ?? 'ok'); lastFive = Number(m.five) || 0; lastWeekResetsAt = Number(m.weekResetsAt) || 0;
      input?.send('input:state', { week: lastWeek, level: lastLevel, five: lastFive, weekResetsAt: lastWeekResetsAt });
    }
    if (m.t === 'mode' && typeof m.mode === 'string') inputMode = m.mode;
    if (m.t === 'notes.state' && Array.isArray(m.notes)) notesLatest = m.notes as { id: string; out?: unknown }[];
    if (m.t === 'timer.state' && Array.isArray(m.timers)) { timerWins?.sync(m.timers as TimerData[]); return; }
    // A timer ran out: its three wood knocks (sheet 67), even when everything else is quiet; muting still silences it.
    if (m.t === 'timer.done') { if (!muted) chime('timer'); pet?.webContents.send('pet:state', { glow: 'timer' }); setTimeout(() => pet?.webContents.send('pet:state', { glow: 'off' }), 15_000); }
    if (m.t === 'permission' || m.t === 'consent' || m.t === 'fact.ask' || m.t === 'backup.ask') { liveAsk = m; input?.send('input:ask', liveAsk); }
    if (m.t === 'ask.expired' && liveAsk && String(liveAsk.id ?? '') === String(m.id ?? '')) { liveAsk = null; input?.send('input:ask', null); }
    // While he talks, he talks; while the brain thinks, he thinks (the pet's own states).
    if (m.t === 'bubble.dots') anim('think');
    if (m.t === 'bubble' && m.stream === true) anim('talk');
    if (m.t === 'bubble' && !m.stream) { anim('idle'); say(m); input?.send('brain:message', m); return; }
    if (m.t === 'error') anim('idle');
    bubble?.send('brain:message', m);
    input?.send('brain:message', m);
  },
  onConnected: (up) => { bubble?.send('brain:connected', up); },
});

/** The four chimes (ClaudeMarks.cs Chimes.Resolve), played by macOS. */
function chime(name: string): void {
  const known = name === 'permission' || name === 'question' || name === 'plan-ready' ? 'needs-you' : name === 'job-complete' ? 'done' : name;
  const f = path.join(CHIMES_DIR, known + '.wav');
  if (!/^(needs-you|done|failed|timer)$/.test(known) || !existsSync(f)) return;
  try { spawn('/usr/bin/afplay', ['-v', '0.5', f], { stdio: 'ignore', detached: true }).unref(); } catch { /* no sound is fine */ }
}

// ---------------------------------------------------------------- his menu (the same rows as right-clicking him)
function menuState(): Record<string, unknown> {
  return { docked, dock: 'bottom', model: inputMode, muted, jobsRunning: 0, other: 'pc', otherOn: false };
}
function picked(id: string): void {
  if (id === 'jobs') { bubble?.send('brain:message', { t: 'mark.click' }); bubble?.show(); return; }
  if (id === 'hunt') { link.send({ t: 'job.hunt' }); return; }
  if (id === 'claudejob') { openTypeBox(); return; }
  if (id === 'back') { bubble?.send('bubble:recall', 'back'); return; }
  if (id.startsWith('hush.')) { const n = { 'hush.15': 15, 'hush.60': 60, 'hush.240': 240, 'hush.off': 0 }[id] ?? minutesToMorning(); link.send({ t: 'hush', minutes: n }); return; }
  if (id === 'mute') { muted = !muted; link.send({ t: 'mute', on: muted }); return; }
  if (id === 'comeback') { undock(); lastTouch = Date.now(); return; }
  if (id === 'dock.bottom') { dockBottom(); return; }
  if (id === 'hide') { hidden = true; bubble?.hide(); input?.close(false); setPose('hidden'); pet?.hide(); return; }
  if (id.startsWith('model.')) { inputMode = id.slice(6); link.send({ t: 'mode', mode: inputMode as never }); return; }
  if (id === 'saving') { link.send({ t: 'saving', on: true }); return; }
  if (id === 'quit') { app.quit(); return; }
  // gopc: the PC's Aang joins in phase 6; the row stays dim until then.
}
function minutesToMorning(): number { const now = new Date(), end = new Date(now); end.setHours(6, 0, 0, 0); if (end <= now) end.setDate(end.getDate() + 1); return Math.max(1, Math.ceil((+end - +now) / 60000)); }
function openMenu(at: { x: number; y: number }): void {
  const a = petAt();
  menu?.open(at, menuState(), { x: a.sprite.x - 10, y: a.sprite.y - MARK, width: a.sprite.width + 20, height: a.sprite.height + MARK });
}

/** His real head at its own pixel size for the menu bar: frame rows 78..119, every other pixel (sheet 101). */
function headIcon(): Electron.NativeImage {
  const img = nativeImage.createFromPath(path.join(FRAMES_DIR, 'idle_0.png'));
  const { width } = img.getSize(), src = img.toBitmap();
  const out = Buffer.alloc(27 * 21 * 4);
  for (let y = 0; y < 21; y++) for (let x = 0; x < 27; x++) {
    const i = ((78 + y * 2) * width + 86 + x * 2) * 4, j = (y * 27 + x) * 4;
    src.copy(out, j, i, i + 4);
  }
  return nativeImage.createFromBitmap(out, { width: 27, height: 21 });
}

// ---------------------------------------------------------------- start
function loadFrames(): Record<string, string[]> {
  const all: Record<string, string[]> = {};
  for (const f of readdirSync(FRAMES_DIR).filter((n) => /^[a-z]+_\d+\.png$/.test(n))) {
    const [, name, n] = /^([a-z]+)_(\d+)\.png$/.exec(f)!;
    (all[name] ??= [])[Number(n)] = 'data:image/png;base64,' + readFileSync(path.join(FRAMES_DIR, f)).toString('base64');
  }
  return all;
}

// The brain may keep a reply's formatting for us: this front end draws it (link.ts hello, 6.11).
process.env.AANG_NEW_BUBBLE = '1';

app.whenReady().then(async () => {
  app.dock?.hide();                                // his menu bar Aang is the way in, not a Dock icon
  pages = await servePages(path.join(HERE, '..', 'pages'));
  const preload = path.join(HERE, 'preload.cjs');
  bubble = new Bubble({ origin: pages.origin, preloadPath: preload });
  bubble.window();
  input = new InputBox({ origin: pages.origin, preloadPath: preload });
  input.window();
  menu = new AangMenu({ origin: pages.origin, preloadPath: preload, pick: picked });
  // Sheet 17's wheel, held on Aang (main.ts): Timer and Notes open in the bubble, Browser is Samara, Away is Discord.
  wheel = new Wheel({
    origin: pages.origin, preloadPath: preload,
    pick: (slot) => {
      if (slot === 'TIMER') { bubble?.send('brain:message', { t: 'timer.setup' }); bubble?.show(); }
      else if (slot === 'NOTES') { bubble?.send('brain:message', { t: 'notes.board' }); bubble?.show(); }
      else if (slot === 'BROWSER') void shell.openPath(path.join(os.homedir(), 'Applications', 'Samara.app'));
      else if (slot === 'AWAY') link.send({ t: 'away' });
      // MUSIC and SNIP: the mini player and Snipit come over in phase 5.
    },
  });
  wheel.warm();
  // Sheet 17 / 67: each running timer is its own small brass window, beside him (main.ts).
  timerWins = new TimerWindows({
    origin: pages.origin, preloadPath: preload, spotFile: path.join(app.getPath('userData'), 'timer-spot.json'),
    near: () => { const a = petAt().sprite; return { x: a.x - 320, y: a.y + 10 }; },
    toBrain: (m) => link.send(m as never),
  });

  const saved = readJson(SETTINGS()) as { x?: number; y?: number; docked?: boolean } | null;
  const b = display().bounds;
  petX = Number.isFinite(saved?.x) ? Math.max(b.x - ART.x, Math.min(b.x + b.width - ART.x - ART.w, Number(saved!.x))) : b.x + b.width - 330;
  docked = saved?.docked === true;
  // Free: where he was left, else standing on the bottom edge at the right.
  artY = Number.isFinite(saved?.y) ? Math.max(b.y + MARK, Math.min(b.y + b.height - ART.h, Number(saved!.y))) : b.y + b.height - ART.h;
  pose = docked ? 'peek' : 'out'; show = SHOW[pose];
  pet = new BrowserWindow({
    width: 224, height: MARK + OUT, frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false, resizable: false,
    focusable: false, skipTaskbar: true, show: false, type: 'panel', alwaysOnTop: true,
    webPreferences: { preload: path.join(HERE, 'macpetpreload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  pet.setAlwaysOnTop(true, 'floating');
  pet.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
  pet.setIgnoreMouseEvents(true, { forward: true });
  await pet.loadURL(`${pages.origin}/macpet.html`);
  pet.webContents.send('pet:frames', loadFrames());
  placePet();
  pet.showInactive();
  setTimeout(step, 100);

  tray = new Tray(headIcon());
  tray.setToolTip('Aang');
  // On the Mac the menu bar icon may say click and mouse-up for one press: one press opens it once.
  let barAt = 0;
  const fromBar = (how: string) => {
    if (Date.now() - barAt < 500) return;
    barAt = Date.now();
    const r = tray!.getBounds();
    if (process.env.AANG_PET_TRACE) console.log(`aang: menu bar ${how} at ${JSON.stringify(r)}`);
    menu?.open({ x: r.x, y: r.y + r.height + 2 }, menuState(), null);
  };
  tray.on('click', () => fromBar('click'));
  tray.on('right-click', () => fromBar('right-click'));
  tray.on('mouse-up', () => fromBar('mouse-up'));
  link.start();
  watchClicksAway();
  console.log('aang: on the Mac, talking to the brain on ' + PORT);
  // Tests only: say a line of our own a few seconds in, so the bubble can be looked at without the brain saying anything.
  if (process.env.AANG_PET_DEMO) setTimeout(() => say({ t: 'bubble', text: process.env.AANG_PET_DEMO, stream: false, proactive: true, turn: 1 }), 3000);
  if (process.env.AANG_PET_MARK) setTimeout(() => { markNow = process.env.AANG_PET_MARK!; pet?.webContents.send('pet:state', { mark: markNow }); }, 3000);
});

/**
 * A click anywhere that is not Aang's (main.ts clickedAway, the pet's outside.click on the PC): the bubble lets go and the
 * box closes, keeping its draft. bin/aang-clicks (mac/clicks.swift) hears presses in other apps only.
 */
function watchClicksAway(): void {
  const bin = process.env.AANG_CLICKS_BIN ?? path.join(HERE, '..', 'bin', 'aang-clicks');
  if (!existsSync(bin)) { console.log('aang: no click helper at ' + bin + '; the bubble will not close on a click elsewhere'); return; }
  let fails = 0;
  const run = () => {
    const child = spawn(bin, [], { stdio: ['pipe', 'pipe', 'ignore'] });
    let buf = '';
    child.stdout!.on('data', (d) => {
      buf += String(d);
      for (let i = buf.indexOf('\n'); i >= 0; i = buf.indexOf('\n')) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        if (!/^down -?\d+ -?\d+$/.test(line)) continue;
        fails = 0;
        if (bubbleUp || input?.visible) { bubble?.send('bubble:dismiss', 'outside'); if (input?.visible) input.close(false); }
      }
    });
    child.on('exit', () => { if (!quitting) setTimeout(run, Math.min(60_000, 2_000 * 2 ** Math.min(5, fails++))); });
    app.on('before-quit', () => { try { child.stdin?.end(); child.kill(); } catch { /* gone */ } });
  };
  run();
}
let quitting = false;
app.on('before-quit', () => { quitting = true; });

// ---------------------------------------------------------------- the pet's page
const fromPet = (e: Electron.IpcMainEvent) => !!pet && !pet.isDestroyed() && e.sender === pet.webContents;
ipcMain.on('pet:solid', () => { /* the pointer is followed in step(); the page's own check only decides what a click hit */ });
ipcMain.on('pet:click', (e, where) => {
  if (!fromPet(e)) return;
  lastTouch = Date.now();
  if (where === 'mark' && markNow) { bubble?.send('brain:message', { t: 'mark.click' }); setPose('more'); return; }
  if (input?.visible) { input.close(); return; }
  openTypeBox();
});
ipcMain.on('pet:context', (e, x, y) => { if (fromPet(e)) openMenu({ x: Number(x) || 0, y: Number(y) || 0 }); });
function savePlace(): void { try { writeFileAtomic(SETTINGS(), JSON.stringify({ x: petX, y: artY, docked })); } catch { /* next time */ } }
/** Free again, in full, where he is (the menu's Come back, or dragged off the edge). */
function undock(): void {
  if (docked) { artY = floor() - OUT; docked = false; }
  slide = null; pose = 'out'; show = OUT; placePet(); placeWindows(); savePlace();
}
/** Docked at the bottom: he tucks into the edge (the 34 px peek) and slides out on hover (Dock.cs). */
function dockBottom(): void {
  docked = true; slide = null; pose = 'peek'; show = PEEK; placePet(); placeWindows(); savePlace();
}
let dragFrom: { x: number; y: number; px: number; py: number } | null = null;
ipcMain.on('pet:drag', (e, phase, x, y) => {
  if (!fromPet(e)) return;
  const b = display().bounds;
  if (phase === 'start') {
    if (docked) undock();                         // picked up off the edge: he comes out in full
    dragFrom = { x: Number(x), y: Number(y), px: petX, py: artY }; anim('walk'); bubble?.hide(); input?.close(false);
  } else if (phase === 'move' && dragFrom) {
    petX = Math.max(b.x - ART.x, Math.min(b.x + b.width - ART.x - ART.w, dragFrom.px + Number(x) - dragFrom.x));
    artY = Math.max(b.y + MARK, Math.min(b.y + b.height - ART.h, dragFrom.py + Number(y) - dragFrom.y));
    placePet(); placeWindows();
  } else if (phase === 'end') {
    dragFrom = null; anim('idle');
    // Dropped near the bottom (or on the Dock's top while it is up): he docks there. Anywhere else he stays, in full.
    if (artY + ART.h >= floor() - SNAP) dockBottom(); else savePlace();
  }
});

// ---------------------------------------------------------------- the bubble and the box (main.ts, the parts the Mac needs)
const fromBubble = (e: Electron.IpcMainEvent) => { const w = bubble?.window(); return !!w && !w.isDestroyed() && e.sender === w.webContents; };
const fromInput = (e: Electron.IpcMainEvent) => { const w = input?.window(); return !!w && !w.isDestroyed() && e.sender === w.webContents; };
ipcMain.on('bubble:size', (e, size) => {
  if (!fromBubble(e) || !size || typeof size !== 'object') return;
  const w = bubble?.window(); if (!w || w.isDestroyed()) return;
  const width = Math.max(220, Math.min(1400, Math.round(Number(size.width) || 0)));
  const height = Math.max(80, Math.min(900, Math.round(Number(size.height) || 0)));
  const pr = Math.max(0, Math.min(400, Math.round(Number(size.pad?.right) || 0)));
  const pb = Math.max(0, Math.min(400, Math.round(Number(size.pad?.bottom) || 0)));
  const box = bubbleBox({ width: width - pr, height: height - pb });
  w.setBounds({ x: box.x, y: box.y, width, height });
  aimTail(w, box);
  bubbleUp = true;
  bubble?.show();
  if (process.env.AANG_PET_TRACE) console.log(`aang: bubble at ${JSON.stringify(w.getBounds())} visible=${w.isVisible()} pet=${JSON.stringify(petAt().sprite)}`);
  if (process.env.AANG_PET_SHOT) setTimeout(() => { void w.webContents.capturePage().then((img) => writeFileSync(process.env.AANG_PET_SHOT!, img.toPNG())); }, 900);
});
ipcMain.on('bubble:hidden', (e) => { if (!fromBubble(e)) return; bubbleUp = false; bubble?.setClickable(false); bubble?.hide(); heldBubble = null; lastTouch = Date.now(); });
ipcMain.on('bubble:clickable', (e, on) => { if (fromBubble(e)) bubble?.setClickable(on === true); });
ipcMain.on('bubble:recalled', (e, ok) => { if (!fromBubble(e)) return; if (ok === true) bubble?.show(); else if (!input?.visible) openTypeBox(); });
ipcMain.on('bubble:copy', (e, text) => { if (fromBubble(e) && typeof text === 'string' && text) clipboard.writeText(text.slice(0, 100_000)); });
ipcMain.on('bubble:retry', (e) => { if (fromBubble(e)) link.tryNow(); });
ipcMain.on('bubble:open', (e, t) => {
  if (!fromBubble(e) || !t || typeof t !== 'object') return;
  const value = String(t.value ?? '');
  // Links open in his default browser (Samara on this Mac), a file in its own program. Only http(s) and a real path.
  if (t.kind === 'link' && /^https?:\/\//i.test(value)) void shell.openExternal(value);
  else if (t.kind === 'file' && value.startsWith('/') && !value.includes('/../')) shell.showItemInFolder(value);
});
ipcMain.on('bubble:answer', (e, a) => { if (!fromBubble(e) || !a || typeof a !== 'object') return; answerAsk(a as Record<string, unknown>); liveAsk = null; input?.send('input:ask', null); });
ipcMain.on('input:answer', (e, a) => { if (!fromInput(e) || !liveAsk) return; answerAsk({ ...liveAsk, choice: String((a as Record<string, unknown>)?.choice ?? '') }); liveAsk = null; input?.send('input:ask', null); });
/** main.ts answerAsk, the kinds the Mac has today. The id always comes from what we hold, never from the page. */
function answerAsk(a: Record<string, unknown>): void {
  const choice = String(a.choice ?? '');
  if (a.t === 'plan') { link.send({ t: 'plan.reply', id: String(a.id ?? ''), go: choice === 'go' }); return; }
  if (a.t === 'claude.start') { const pick = choice === 'go' ? 'go' : choice === 'change' ? 'change' : 'no'; link.send({ t: 'claude.start.reply', id: String(a.id ?? '').slice(0, 64), hash: String(a.hash ?? '').slice(0, 64), choice: pick }); return; }
  if (a.t === 'choice') { const n = Number(choice); link.send({ t: 'choice.reply', id: String(a.id ?? ''), pick: Number.isInteger(n) && n >= 0 && n < 4 ? n : -1 }); return; }
  if (typeof a.reminder === 'string' && a.reminder) { link.send({ t: 'reminder.reply', id: a.reminder, snooze: choice === 'snooze' }); return; }
  if (a.t === 'permission') {
    if (choice === 'change') { link.send({ t: 'permission.reply', id: String(a.id ?? ''), choice: 'no' }); if (!input?.visible) openTypeBox(); return; }
    if (choice === 'show') { link.send({ t: 'submit', id: 'show-' + Date.now(), text: 'show me that first' }); return; }
    link.send({ t: 'permission.reply', id: String(a.id ?? ''), choice: choice === 'yes' ? 'once' : choice === 'always' ? 'always' : 'no' });
    return;
  }
  if (a.t === 'fact.ask') { if (choice !== 'skip') link.send({ t: 'fact.reply', id: Number(a.id) || 0, keep: choice === 'yes' }); return; }
  if (a.t === 'backup.ask') { link.send({ t: 'backup.reply', now: choice === 'yes' }); return; }
  if (a.t === 'consent' && choice === 'yes' && typeof a.text === 'string' && a.text) link.send({ t: 'submit', id: 'c' + Date.now(), text: a.text, mode: String(a.mode ?? 'smart'), once: true });
}
ipcMain.on('input:submit', (e, a) => {
  if (!fromInput(e) || !a || typeof a.text !== 'string' || !a.text.trim()) return;
  const mode = ['auto', 'quick', 'smart', 'deep'].includes(a.mode) ? a.mode : inputMode;
  const sid = 's' + Date.now();
  if (!link.send({ t: 'submit', id: sid, text: a.text.slice(0, 20_000), mode })) { input?.send('input:failed', { text: a.text, reason: 'brain-down' }); return; }
  clearTimeout(ackWait?.timer);
  ackWait = { id: sid, timer: setTimeout(() => {
    ackWait = null;
    bubble?.send('brain:message', { t: 'pet.say', text: 'My brain did not answer. Press Enter in the box to try again.', hold: 12000 }); bubble?.show();
    input?.send('input:failed', { text: a.text, reason: 'no-answer' });
  }, 4000) };
  bubble?.send('brain:message', { t: 'asked', text: a.text });
  input?.close();
});
ipcMain.on('input:history', (e, list) => { if (fromInput(e) && Array.isArray(list)) { try { mkdirSync(app.getPath('userData'), { recursive: true }); writeFileSync(HISTORY_FILE(), JSON.stringify(list.filter((x) => typeof x === 'string').slice(-50))); } catch { /* next time */ } } });
ipcMain.on('input:close', (e) => { if (fromInput(e)) { input?.close(); lastTouch = Date.now(); } });
ipcMain.on('input:stop', (e) => { if (fromInput(e)) link.send({ t: 'stop' }); });
ipcMain.on('input:mode', (e, m) => { if (fromInput(e) && typeof m === 'string' && ['auto', 'quick', 'smart', 'deep'].includes(m)) { inputMode = m; link.send({ t: 'mode', mode: m as never }); } });
ipcMain.on('input:size', (e, s) => { if (fromInput(e) && s && typeof s === 'object') input?.resize(Number(s.width) || 0, Number(s.height) || 0); });
ipcMain.on('input:page', (e, d) => { if (fromInput(e) && (d === 1 || d === -1)) bubble?.send('bubble:page', d); });
ipcMain.on('menu:pick', (e, id) => { if (menu?.owns(e.sender)) menu.picked(e.sender, id); });
ipcMain.on('timer:clickable', (e, on) => { if (timerWins?.owns(e.sender)) timerWins.clickable(e.sender, on === true); });
ipcMain.on('timer:opacity', (e, n) => { if (timerWins?.owns(e.sender)) timerWins.opacity(e.sender, Number(n)); });
ipcMain.on('timer:pin', (e) => { if (timerWins?.owns(e.sender)) timerWins.pin(e.sender); });
ipcMain.on('timer:through', (e) => { if (timerWins?.owns(e.sender)) timerWins.toggleThrough(e.sender); });
ipcMain.on('timer:drag', (e, a) => { if (timerWins?.owns(e.sender) && a && typeof a === 'object') timerWins.drag(e.sender, String(a.phase ?? ''), Number(a.dx) || 0, Number(a.dy) || 0); });
ipcMain.on('timer:act', (e, a) => {
  const id = timerWins?.idOf(e.sender);
  if (!id || !a || typeof a !== 'object') return;
  const action = ['add', 'pause', 'stop', 'again', 'rename'].includes(String(a.action)) ? String(a.action) : null;
  if (!action) return;
  const ms = Number(a.ms);
  link.send({ t: 'timer.act', id, action: action as 'add', ...(Number.isFinite(ms) && Math.abs(ms) <= 24 * 3_600_000 ? { ms: Math.round(ms) } : {}),
    ...(action === 'rename' ? { label: String(a.label ?? '').slice(0, 40) } : {}) });
});
ipcMain.on('timer:menu', (e, at) => { if (!timerWins?.owns(e.sender)) return; const x = Number(at?.x), y = Number(at?.y); timerWins.openMenu(e.sender, Number.isFinite(x) && Number.isFinite(y) ? { x: Math.round(x), y: Math.round(y) } : null); });
ipcMain.on('timer:typing', (e, on) => { if (timerWins?.owns(e.sender)) timerWins.typing(e.sender, on === true); });
ipcMain.on('timer:menushape', (e, rects) => { timerWins?.menu.shape(e.sender, rects); });
ipcMain.on('timer:menupick', (e, m) => { timerWins?.menu.pick(e.sender, m); });
ipcMain.on('wheel:pick', (e, slot) => { if (wheel?.owns(e.sender)) wheel.picked(e.sender, typeof slot === 'string' ? slot.slice(0, 12) : ''); });
ipcMain.on('pet:hold', (e, phase, x, y) => {
  if (!fromPet(e)) return;
  // Holding on Aang clears the stage first (his ask, 2026-10-13): the bubble and the box go, the wheel is the only thing up.
  if (phase === 'open') { wheelHeld = true; if (input?.visible) input.close(); bubble?.send('bubble:dismiss', 'wheel'); wheel?.open({ x: Number(x) || 0, y: Number(y) || 0 }); }
  else if (phase === 'release') { wheelHeld = false; wheel?.release({ x: Number(x) || 0, y: Number(y) || 0 }); }
});
// Sheet 17's timer and notes, from the bubble (main.ts): each checked against its sender.
ipcMain.on('bubble:timerstart', (e, a) => {
  if (!fromBubble(e) || !a || typeof a !== 'object') return;
  const ms = Number(a.ms);
  if (!Number.isFinite(ms) || ms < 1000 || ms > 24 * 3_600_000) return;
  link.send({ t: 'timer.start', ms: Math.round(ms), label: String(a.label ?? '').slice(0, 40) });
});
const noteOk = (n: unknown): n is { id: string } => !!n && typeof n === 'object' && typeof (n as { id?: unknown }).id === 'string' && /^n[a-z0-9]{1,20}$/.test((n as { id: string }).id);
ipcMain.on('bubble:notesave', (e, n) => { if (fromBubble(e) && noteOk(n)) link.send({ t: 'notes.save', note: { ...n, out: notesLatest.find((x) => x.id === n.id)?.out } } as never); });
ipcMain.on('bubble:notedelete', (e, id) => { if (fromBubble(e) && typeof id === 'string') link.send({ t: 'notes.delete', id }); });
// Typing in a note in the bubble: the bubble takes the keyboard only while he types there.
ipcMain.on('bubble:typing', (e, on) => {
  if (!fromBubble(e)) return;
  const w = bubble?.window(); if (!w || w.isDestroyed()) return;
  bubble?.setFocusable(on === true);
  if (on === true) { w.focus(); w.webContents.focus(); }
});
ipcMain.on('menu:shape', (e, rects) => { if (menu?.owns(e.sender)) menu.shape(e.sender, rects); });

app.on('before-quit', () => { link.stop(); input?.destroy(); bubble?.close(); menu?.close(); tray?.destroy(); pages?.close(); });
app.on('window-all-closed', () => { /* the pet decides when Aang quits */ });
Menu.setApplicationMenu(null);

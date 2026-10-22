// QA with REAL input (2026-10-22, after his report: "show my notes", "+ New note" closed the bubble and no note opened).
// The older checks called functions directly, so they never met what his mouse meets. Here every step is a mouse press,
// move and release (webContents.sendInputEvent, with screen coordinates, so the pages' own screenX drags work) or a key
// press, into the REAL product windows built the way main.ts builds them (Bubble, NoteWindows, TimerWindows, JobPops,
// MiniPlayer, FamilyHost, the video pop-out's page), wired with the same ipc doors main.ts and notes60.ts use.
//
// The bubble lets the mouse THROUGH except over its drawn shape (bubble.ts). That is modelled honestly here: a press on
// the bubble only reaches its page when the window has asked for the mouse (Bubble.setClickable); otherwise it would
// land on whatever is under it, which is a click away, and the bubble is told so. The pointer reaches the bubble's page
// only through the Shell's own look at the cursor (bubble.ts watchPointer), never through a forwarded move: forwarding
// is what broke after a page reload (qa-hwnd-probe.ts), and no harness can see Windows' forwarding anyway.
//
// Nothing is ever on his screen: every window lives far to the left of his screens (x -6000..-3000), a window asked to
// go anywhere on a real screen is moved off it first (and that is reported), nothing is focused or raised, no dialog,
// no clipboard, no real mouse or keys. Pictures (<= 4) go to the folder given as the last argument.
//
// Run (from src/Shell): npx electron test/electron/qa-real-input-check.ts <folder for pictures>
import { app, BrowserWindow, dialog, ipcMain, screen } from 'electron';
import { mkdirSync, mkdtempSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';
import { Bubble } from '../../src/bubble.ts';
import { NoteWindows, type NoteData } from '../../src/notewin.ts';
import { TimerWindows } from '../../src/timerwin.ts';
import { JobPops } from '../../src/jobpop.ts';
import { MiniPlayer, FULL_W } from '../../src/miniplayer.ts';
import { FamilyHost } from '../../src/familywin.ts';
import { NoteHeld, wireNotes60 } from '../../src/notes60.ts';
import { watchOwnClicks } from '../../src/clickaway.ts';
import { softEdge, stopEdgeHelper } from '../../src/winedge.ts';
import * as F from '../../src/family.ts';

// ------------------------------------------------------------------------------------------------ never on his screen
dialog.showErrorBox = () => {};
const closeAll = () => { for (const w of BrowserWindow.getAllWindows()) try { w.destroy(); } catch { /* gone */ } try { stopEdgeHelper(); } catch { /* gone */ } };
process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + String((e as Error)?.stack ?? e).split('\n').slice(0, 5).join(' | ')); closeAll(); app.exit(2); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e).split('\n').slice(0, 5).join(' | ')); closeAll(); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT (5 min)'); closeAll(); app.exit(3); }, 300_000).unref();
app.on('window-all-closed', () => {});
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
const TMP = mkdtempSync(path.join(os.tmpdir(), 'qa-real-input-'));
app.setPath('userData', TMP);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHELL = path.resolve(HERE, '..', '..');
const OUT = (() => { const a = process.argv.at(-1); try { if (a && !a.endsWith('.ts')) { mkdirSync(a, { recursive: true }); if (statSync(a).isDirectory()) return a; } } catch { /* below */ } return os.tmpdir(); })();

/** The made-up desk every window lives on: far left of his screens. */
const AREA = { x: -6000, y: 0, width: 3000, height: 2000 };
const onHisScreen: string[] = [];
const P = BrowserWindow.prototype;
const orig = { setBounds: P.setBounds, setPosition: P.setPosition, showInactive: P.showInactive };
const hits = (r: { x: number; y: number; width: number; height: number }) => screen.getAllDisplays().some((d) => { const b = d.bounds; return r.x < b.x + b.width && r.x + r.width > b.x && r.y < b.y + b.height && r.y + r.height > b.y; });
/** Anything asked onto a real screen goes 8000 px left instead (the family's overlay covers a screen's work area). */
const offScreen = (w: BrowserWindow, r: Electron.Rectangle, report = true): Electron.Rectangle => {
  if (!hits(r)) return r;
  const url = w.webContents.getURL();
  if (report && !/familymenu|timermenu|note.html?quick/.test(url) && url) onHisScreen.push(`${url.split('/').pop()} ${JSON.stringify(r)}`);
  return { ...r, x: r.x - 8000 };
};
P.setBounds = function (this: BrowserWindow, r: Partial<Electron.Rectangle>, an?: boolean) { const b = this.getBounds(); orig.setBounds.call(this, offScreen(this, { ...b, ...r } as Electron.Rectangle), an); };
P.setPosition = function (this: BrowserWindow, x: number, y: number, an?: boolean) { const b = this.getBounds(); const r = offScreen(this, { ...b, x, y }); orig.setPosition.call(this, r.x, r.y, an); };
P.showInactive = function (this: BrowserWindow) { const b = this.getBounds(); const r = offScreen(this, b, false); if (r.x !== b.x) orig.setBounds.call(this, r); orig.showInactive.call(this); };
P.show = function (this: BrowserWindow) { this.showInactive(); };
P.focus = function () {};
P.moveTop = function () {};
app.on('browser-window-created', (_e, w) => { try { w.setSkipTaskbar(true); } catch { /* fine */ } });

// ------------------------------------------------------------------------------------------------ results
let failed = 0, passed = 0;
const check = (step: string, ok: boolean, detail: unknown = '') => {
  if (ok) passed++; else failed++;
  const d = detail === '' ? '' : '  -- ' + String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 400);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${step}${d}`);
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (fn: () => boolean | Promise<boolean>, ms = 4000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await wait(50); } return fn(); };
const said: { ch: string; a: any }[] = [];
const lastSaid = (ch: string) => [...said].reverse().find((x) => x.ch === ch)?.a;
const countSaid = (ch: string) => said.filter((x) => x.ch === ch).length;
const pageErrors: string[] = [];
let shots = 0;

// ------------------------------------------------------------------------------------------------ real input
const js = <T = any>(w: BrowserWindow, code: string): Promise<T> => w.webContents.executeJavaScript(code, true);
/** A point inside an element, in the page's own coordinates. */
const at = (w: BrowserWindow, sel: string, fx = 0.5, fy = 0.5) => js<{ x: number; y: number } | null>(w, `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); if (!r.width || !r.height) return null; return { x: Math.round(r.left + r.width * ${fx}), y: Math.round(r.top + r.height * ${fy}) }; })()`);
const scr = (w: BrowserWindow, p: { x: number; y: number }) => { const c = w.getContentBounds(); return { x: c.x + p.x, y: c.y + p.y }; };
function mouse(w: BrowserWindow, type: 'mouseDown' | 'mouseUp' | 'mouseMove', p: { x: number; y: number }, button: 'left' | 'right' = 'left', held = false): void {
  const g = scr(w, p);
  w.webContents.sendInputEvent({ type, x: p.x, y: p.y, globalX: g.x, globalY: g.y, button, clickCount: 1, ...(held ? { modifiers: [button === 'left' ? 'leftbuttondown' : 'rightbuttondown'] } : {}) } as Electron.MouseInputEvent);
}
async function click(w: BrowserWindow, sel: string, button: 'left' | 'right' = 'left', fx = 0.5, fy = 0.5): Promise<boolean> {
  const p = await at(w, sel, fx, fy);
  if (!p) return false;
  mouse(w, 'mouseMove', p); await wait(30);
  mouse(w, 'mouseDown', p, button); await wait(50);
  mouse(w, 'mouseUp', p, button); await wait(160);
  return true;
}
/** Press on `sel`, move by dx,dy in screen pixels (a frame per step, following the window as it moves), let go. */
async function drag(w: BrowserWindow, sel: string, dx: number, dy: number, steps = 10, fx = 0.5, fy = 0.5): Promise<boolean> {
  const p = await at(w, sel, fx, fy);
  if (!p) return false;
  const start = scr(w, p);
  mouse(w, 'mouseMove', p); await wait(30);
  mouse(w, 'mouseDown', p); await wait(40);
  steps = Math.max(steps, Math.ceil(Math.hypot(dx, dy) / 22));
  for (let i = 1; i <= steps; i++) {
    const k = i / steps, g = { x: Math.round(start.x + dx * k), y: Math.round(start.y + dy * k) };
    const c = w.getContentBounds(), local = { x: g.x - c.x, y: g.y - c.y };
    w.webContents.sendInputEvent({ type: 'mouseMove', x: local.x, y: local.y, globalX: g.x, globalY: g.y, button: 'left', modifiers: ['leftbuttondown'] } as Electron.MouseInputEvent);
    await wait(34);
  }
  const c = w.getContentBounds(), g = { x: start.x + dx, y: start.y + dy };
  w.webContents.sendInputEvent({ type: 'mouseUp', x: g.x - c.x, y: g.y - c.y, globalX: g.x, globalY: g.y, button: 'left', clickCount: 1 } as Electron.MouseInputEvent);
  await wait(120);
  return true;
}
async function key(w: BrowserWindow, keyCode: string): Promise<void> {
  w.webContents.sendInputEvent({ type: 'keyDown', keyCode } as Electron.KeyboardInputEvent);
  if (keyCode.length === 1) w.webContents.sendInputEvent({ type: 'char', keyCode } as Electron.KeyboardInputEvent);
  w.webContents.sendInputEvent({ type: 'keyUp', keyCode } as Electron.KeyboardInputEvent);
  await wait(12);
}
async function type(w: BrowserWindow, text: string): Promise<void> {
  for (const ch of text) {
    if (ch !== ' ') { await key(w, ch); continue; }
    w.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Space' } as Electron.KeyboardInputEvent);
    w.webContents.sendInputEvent({ type: 'char', keyCode: ' ' } as Electron.KeyboardInputEvent);
    w.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Space' } as Electron.KeyboardInputEvent);
    await wait(12);
  }
}
async function shot(ws: BrowserWindow[], name: string): Promise<void> {
  if (shots >= 4) return;
  shots++;
  const caps = await Promise.all(ws.map(async (w) => ({ img: await w.webContents.capturePage(), b: w.getContentBounds() })));
  const k = caps[0]!.img.getSize().width / Math.max(1, caps[0]!.b.width);
  const L = Math.min(...caps.map((c) => c.b.x)) - 12, T = Math.min(...caps.map((c) => c.b.y)) - 12;
  const R = Math.max(...caps.map((c) => c.b.x + c.b.width)) + 12, B = Math.max(...caps.map((c) => c.b.y + c.b.height)) + 12;
  const Wd = Math.max(1, Math.round((R - L) * k)), Hd = Math.max(1, Math.round((B - T) * k)), out = Buffer.alloc(Wd * Hd * 4);
  for (let i = 0; i < Wd * Hd; i++) { out[i * 4] = 40; out[i * 4 + 1] = 34; out[i * 4 + 2] = 30; out[i * 4 + 3] = 255; }
  for (const c of caps) {
    const s = c.img.getSize(), bits = c.img.toBitmap(), ox = Math.round((c.b.x - L) * k), oy = Math.round((c.b.y - T) * k);
    for (let y = 0; y < s.height; y++) for (let x = 0; x < s.width; x++) {
      const si = (y * s.width + x) * 4, d = ((y + oy) * Wd + x + ox) * 4, a = bits[si + 3]! / 255;
      if (x + ox < 0 || x + ox >= Wd || y + oy < 0 || y + oy >= Hd || a === 0) continue;
      for (let j = 0; j < 3; j++) out[d + j] = Math.round(bits[si + j]! * a + out[d + j]! * (1 - a));
    }
  }
  const { nativeImage } = await import('electron');
  const file = path.join(OUT, `qa-${name}.png`);
  writeFileSync(file, nativeImage.createFromBitmap(out, { width: Wd, height: Hd }).resize({ width: Math.min(Wd, 900) }).toPNG());
  console.log('PICTURE ' + file);
}
const watchErrors = (w: BrowserWindow) => {
  w.webContents.on('console-message', (e) => { const m = e as unknown as { message?: string; level?: string }; if (m.level === 'error') pageErrors.push(String(m.message)); });
  w.webContents.on('render-process-gone', (_e, d) => pageErrors.push('renderer gone: ' + d.reason));
};
app.on('browser-window-created', (_e, w) => watchErrors(w));

// ------------------------------------------------------------------------------------------------ the data
const NOW = Date.now();
let NOTES: NoteData[] = [
  { id: 'nbf1', title: 'Before Friday', cat: 'To-do', font: 'figtree', size: 'm', updated: NOW - 1000, html: '<div class="cl done">Book the vet</div><div class="cl">Renew the passport</div>' },
  { id: 'nrl1', title: 'Route list idea', cat: 'Idea', font: 'figtree', size: 'm', updated: NOW - 2000, html: '<div>Fold the route list to one line.</div>' },
  { id: 'nrg1', title: 'Ragnaros', cat: 'Reference', font: 'figtree', size: 'm', updated: NOW - 3000, html: '<div>Tanks to the wall.</div>', src: { url: 'https://forever.warcraft.com/guides/molten-core', site: 'forever.warcraft.com' } },
] as NoteData[];
const CATS = { builtin: ['To-do', 'Idea', 'Reference', 'For Claude'], own: [] as string[] };
const S1 = '0b6c2a8e-1111-4c3d-9e2f-aaaaaaaaaaaa';
const JOB = { id: S1, machine: 'pc', cwd: 'C:\\x', project: 'Waymark', title: 'Waymark', model: 'opus', phase: 'working', startedAt: NOW - 30 * 60_000, lastActivity: 1, prompt: 'go',
  tasks: ['Replay harness', 'Athlete model', 'Rules-only brain', 'Folding the route list'].map((text, i) => ({ text, status: i < 2 ? 'completed' : i === 2 ? 'in_progress' : 'pending', ...(i === 2 ? { active: text } : {}) })),
  current: '', percent: null, etaMs: null, usage: null, open: '', held: 0, progress: { done: 2, total: 4, cur: 2, elapsedMs: 0, at: NOW, paceMs: 600_000, rev: 1, rewroteAt: null },
  activity: { now: 'Folding the route list', since: NOW - 12_000, agents: [] } };

app.whenReady().then(async () => {
  for (const d of screen.getAllDisplays()) if (hits({ ...AREA })) { console.log('ABORT: a screen reaches the test desk ' + JSON.stringify(d.bounds)); app.exit(4); return; }
  const pages = await servePages(path.join(SHELL, 'pages'));
  const preload = path.join(SHELL, 'src', 'preload.cjs');

  // ============================================================================================ the windows, as main.ts
  let cursor = { x: -9999, y: -9999 };
  const bubble = new Bubble({ origin: pages.origin, preloadPath: preload, cursor: () => cursor });
  const BUB = { x: -5900, y: 900 };
  const bw = bubble.window()!;
  orig.setBounds.call(bw, { x: BUB.x, y: BUB.y, width: 560, height: 220 });
  const fromBubble = (e: Electron.IpcMainEvent) => e.sender === bw.webContents;
  const toBubble = (m: unknown) => bubble.send('brain:message', m);
  const clickableSpy: boolean[] = [];
  const bubbleIs = { clickable: () => (bubble as unknown as { clickable: boolean }).clickable };
  const ignoreCalls: string[] = [];
  const ign0 = bw.setIgnoreMouseEvents.bind(bw);
  bw.setIgnoreMouseEvents = ((ignore: boolean, o?: { forward?: boolean }) => { ignoreCalls.push(`${ignore}${o?.forward ? '+fwd' : ''}`); ign0(ignore, o); }) as typeof bw.setIgnoreMouseEvents;
  for (const ch of ['bubble:notesave', 'bubble:noticeheld', 'bubble:typing', 'bubble:hidden', 'bubble:notepull', 'note:save', 'note:quickdone', 'note:menu', 'browser:act', 'browser:notesave', 'browser:noteopen', 'timer:menu', 'family:context']) ipcMain.on(ch, (_e, a) => said.push({ ch, a }));
  ipcMain.on('bubble:size', (e, size) => {
    if (!fromBubble(e)) return;
    const width = Math.max(220, Math.min(1400, Math.round(Number(size?.width) || 0))), height = Math.max(80, Math.min(900, Math.round(Number(size?.height) || 0)));
    bw.setBounds({ x: BUB.x, y: BUB.y, width, height });
    bubble.show();
  });
  ipcMain.on('bubble:clickable', (e, on) => { if (fromBubble(e)) { clickableSpy.push(on === true); bubble.setClickable(on === true); } });
  ipcMain.on('bubble:hidden', (e) => { if (fromBubble(e)) { bubble.setClickable(false); bubble.hide(); } });
  ipcMain.on('bubble:typing', (e, on) => { if (fromBubble(e)) bubble.setFocusable(on === true); });
  ipcMain.on('bubble:notesave', (e, n) => {
    if (!fromBubble(e) || !n?.id) return;
    const i = NOTES.findIndex((x) => x.id === n.id);
    if (i >= 0) NOTES[i] = { ...NOTES[i]!, ...n, out: NOTES[i]!.out }; else NOTES = [n, ...NOTES];
  });

  // The pop-out family and its members.
  const family = new FamilyHost({ origin: pages.origin, saveFile: path.join(TMP, 'family-layout.json') });
  family.areas = () => [AREA];
  family.displays = () => [{ id: 1, scaleFactor: 1, bounds: AREA }];
  family.overlay.warm();
  const noteWins = new NoteWindows({ origin: pages.origin, preloadPath: preload, save: (n) => { said.push({ ch: 'notes.save', a: n }); const i = NOTES.findIndex((x) => x.id === n.id); if (i >= 0) NOTES[i] = n; else NOTES = [n, ...NOTES]; }, overAang: () => false });
  noteWins.family = family;
  const held = new NoteHeld({ origin: pages.origin, preloadPath: preload, pet: () => ({ sprite: { x: -5000, y: 1500, width: 49, height: 125 }, screen: AREA, scale: 1, edge: 'none' as const, peeking: false }), offscreen: true });
  wireNotes60({ held: () => held, notes: () => noteWins, fromBubble, send: (m) => said.push({ ch: 'brain', a: m }), toBubble });
  ipcMain.on('bubble:notepull', (e, a) => {
    if (!fromBubble(e) || !a) return;
    const n = NOTES.find((x) => x.id === a.id);
    if (n) noteWins.pull(n, { x: Number(a.x), y: Number(a.y) }, String(a.phase));
  });
  ipcMain.on('note:move', (e, a) => { if (noteWins.of(e.sender) && a) noteWins.move(e.sender, a.kind === 'resize' ? 'resize' : 'drag', String(a.phase ?? ''), Number(a.dx) || 0, Number(a.dy) || 0); });
  ipcMain.on('note:menu', (e, a) => { const open = a === true || a?.open === true; noteWins.menu(e.sender, open, a && typeof a === 'object' ? { x: Number(a.x) || 0, y: Number(a.y) || 0 } : null); });
  ipcMain.on('note:save', (e, n) => { const v = noteWins.of(e.sender); if (v && n?.id === v.id) said.push({ ch: 'notes.save', a: n }); });

  const spotFile = path.join(TMP, 'timer-spot.json');
  writeFileSync(spotFile, JSON.stringify({ x: -4200, y: 1500 }));
  const timers = new TimerWindows({ origin: pages.origin, preloadPath: preload, spotFile, near: () => null, menuArea: () => AREA, toBrain: (m) => said.push({ ch: 'timer.brain', a: m }) });
  timers.family = family;
  ipcMain.on('timer:clickable', (e, on) => { if (timers.owns(e.sender)) timers.clickable(e.sender, on === true); });
  ipcMain.on('timer:drag', (e, a) => { if (timers.owns(e.sender) && a) timers.drag(e.sender, String(a.phase ?? ''), Number(a.dx) || 0, Number(a.dy) || 0); });
  ipcMain.on('timer:menu', (e, p) => { if (timers.owns(e.sender)) timers.openMenu(e.sender, p && Number.isFinite(p.x) ? { x: Math.round(p.x), y: Math.round(p.y) } : null); });
  ipcMain.on('timer:menushape', (e, r) => timers.menu.shape(e.sender, r));
  ipcMain.on('timer:menupick', (e, m) => timers.menu.pick(e.sender, m));

  const jobs = new JobPops({ origin: pages.origin, preloadPath: path.join(SHELL, 'src', 'jobpoppreload.cjs'), clampToScreen: false, aangRects: () => [] });
  jobs.family = family;
  const prefsFile = path.join(TMP, 'player.json');
  writeFileSync(prefsFile, JSON.stringify({ x: -3700, y: 1700 }));
  const player = new MiniPlayer({ origin: pages.origin, preloadPath: path.join(SHELL, 'src', 'playerpreload.cjs'), clampToScreen: false, prefsFile });
  player.family = family;

  // The video pop-out's page in a window made the way popout.ts makes it; its bar drag goes to the family as popoutipc.ts does.
  const video = new BrowserWindow({ x: -5400, y: 200, width: 640, height: 394, titleBarStyle: 'hidden', thickFrame: true, transparent: false, backgroundColor: '#24160D', show: false, skipTaskbar: true, focusable: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, preload } });
  void video.loadURL(`${pages.origin}/popout.html`);
  video.once('ready-to-show', () => { video.showInactive(); softEdge(video); });
  family.add({ id: 'video', kind: 'video', win: () => (video.isDestroyed() ? null : video), card: '.frame', osCorners: true, setOpacity: (n) => video.setOpacity(n), setPinned: () => {} });
  ipcMain.on('popout:drag', (e, a) => { if (e.sender === video.webContents && a) family.drag('video', String(a.phase ?? ''), Number(a.dx) || 0, Number(a.dy) || 0); });

  // A press in any of our windows that is not the bubble is a click away from it (main.ts, clickaway.ts).
  watchOwnClicks({ isAang: (wc) => wc === bw.webContents, busy: () => bw.isVisible(), away: () => bubble.send('bubble:dismiss', 'outside') });

  /**
   * His click on the bubble, as Windows delivers it. The pointer comes first (the Shell's cursor look); the press reaches
   * the page only if the window took the mouse. Otherwise it falls through to whatever is under it: a click away.
   */
  async function bubbleClick(sel: string, fx = 0.5, fy = 0.5): Promise<'ok' | 'through' | 'missing'> {
    const p = await at(bw, sel, fx, fy);
    if (!p) return 'missing';
    cursor = scr(bw, p);
    await until(() => bubbleIs.clickable(), 400);
    if (!bubbleIs.clickable()) { bubble.send('bubble:dismiss', 'outside'); await wait(200); return 'through'; }
    mouse(bw, 'mouseMove', p); await wait(30);
    mouse(bw, 'mouseDown', p); await wait(50);
    mouse(bw, 'mouseUp', p); await wait(200);
    return 'ok';
  }
  const bubbleShown = () => js<boolean>(bw, `!document.getElementById('bubble').hidden && !document.getElementById('bubble').classList.contains('leaving')`);
  const noteState = () => js<any>(bw, `(() => { const b = document.querySelector('.bignote'); return { open: !!b, cat: b?.dataset.cat ?? null, active: document.activeElement?.className ?? '', title: document.querySelector('.bignote .ntitle')?.textContent ?? '', body: document.querySelector('.bignote .nbody')?.innerHTML ?? '', fill: b ? getComputedStyle(b.querySelector('.np-fill')).backgroundColor : '' }; })()`);


  await until(() => !bw.webContents.isLoading(), 5000);
  await wait(400);

  // ============================================================================================ 1. notes in the bubble
  async function boardAndNewNote(label: string): Promise<void> {
    cursor = { x: -9999, y: -9999 };
    toBubble({ t: 'notes.state', notes: NOTES, cats: CATS });
    toBubble({ t: 'notes.board' });
    await until(() => js(bw, `!!document.querySelector('.board .nmini') && !document.getElementById('bubble').hidden`), 3000);
    await wait(500);
    check(`${label}: "show my notes" opens the board`, await js(bw, `document.querySelectorAll('.board .nmini').length`) >= 3);
    const p = await at(bw, '.newk');
    cursor = p ? scr(bw, p) : cursor;
    const took = await until(() => bubbleIs.clickable(), 600);
    check(`${label}: the pointer on "+ New note" makes the bubble take the mouse (no forwarded moves needed)`, took, { clickable: bubbleIs.clickable(), spy: clickableSpy.slice(-3) });
    const typed0 = countSaid('bubble:typing');
    const r = await bubbleClick('.newk');
    await wait(300);
    const s = await noteState();
    check(`${label}: a real click on "+ New note" opens a blank note and the bubble stays`, r === 'ok' && s.open && (await bubbleShown()), { r, s, shown: await bubbleShown() });
    check(`${label}: the new note has the keyboard (title focused, the window asked for it)`, /ntitle/.test(s.active) && countSaid('bubble:typing') > typed0 && lastSaid('bubble:typing') === true, { active: s.active, typing: lastSaid('bubble:typing') });
  }
  await boardAndNewNote('notes');
  // Typing a title and a body saves it.
  await type(bw, 'Raid prep');
  const bodyClick = await bubbleClick('.bignote .nbody', 0.3, 0.5);
  await wait(150);
  await type(bw, 'Flasks and food');
  await until(() => { const n = lastSaid('bubble:notesave'); return !!n && n.title === 'Raid prep' && /Flasks and food/.test(n.html); }, 2500);
  const saved = lastSaid('bubble:notesave');
  check('notes: typing a title and a body saves the note (after the pause)', bodyClick === 'ok' && saved?.title === 'Raid prep' && /Flasks and food/.test(saved?.html ?? '') && !saved?.fresh, { bodyClick, saved: saved && { title: saved.title, html: saved.html, fresh: saved.fresh } });
  const newId = saved?.id as string | undefined;
  // The # chip: a category recolours it and saves it.
  const fill0 = (await noteState()).fill;
  await bubbleClick('.bignote .np-chip');
  await until(() => js(bw, `!!document.querySelector('.np-pick')`), 1500);
  await wait(400);   // the bubble re-measures round the list first (a person does not click in the same millisecond)
  const pickRows = await js<string[]>(bw, `[...document.querySelectorAll('.np-pick .np-prow')].map((b) => b.textContent.trim())`);
  const todoIdx = pickRows.findIndex((t) => /^To-do/.test(t));
  if (todoIdx >= 0) await js(bw, `document.querySelectorAll(".np-pick .np-prow")[${todoIdx}].dataset.qa = "todo"`);
  const pickRes = todoIdx >= 0 ? await bubbleClick(`.np-pick .np-prow[data-qa="todo"]`) : "missing";
  await wait(400);
  const s2 = await noteState();
  check('notes: the # chip lists the categories; To-do recolours the paper and saves', pickRes === 'ok' && s2.cat === 'To-do' && s2.fill !== fill0 && lastSaid('bubble:notesave')?.cat === 'To-do', { pickRes, rows: pickRows, cat: s2.cat, fill0, fill: s2.fill, saved: lastSaid('bubble:notesave')?.cat });
  // The checklist key turns the lines into ticks.
  await bubbleClick('.bignote .np-ck');
  await wait(800);
  const ck = await js<any>(bw, `({ on: document.querySelector('.bignote .np-ck')?.classList.contains('on'), lines: document.querySelectorAll('.bignote .nbody .cl').length })`);
  check('notes: the checklist key turns it into a checklist (and saves)', ck.on === true && ck.lines >= 1 && /class="cl/.test(lastSaid('bubble:notesave')?.html ?? ''), { ck, html: lastSaid('bubble:notesave')?.html });
  await shot([bw], 'note-open');
  // Back to the board: the new note is on it.
  await bubbleClick('.ctitle .back');
  await wait(500);
  check('notes: ◀ BOARD shows the board with the new note on it', (await js<string[]>(bw, `[...document.querySelectorAll('.board .nmini .mt')].map((e) => e.textContent)`)).includes('Raid prep'));
  // Pull a note out onto the desktop: pressed and lifted for real; leaving the window is the one move a page cannot be
  // sent from outside it (Chromium drops it), so that last move is dispatched in the page with the real pointer's id.
  const mini = await at(bw, '.board .nmini');
  let pulledWin: BrowserWindow | null = null;
  if (mini) {
    cursor = scr(bw, mini); await until(() => bubbleIs.clickable(), 400);
    mouse(bw, 'mouseMove', mini); await wait(30);
    mouse(bw, 'mouseDown', mini); await wait(40);
    for (let i = 1; i <= 4; i++) { const q = { x: mini.x - i * 12, y: mini.y }; const g = scr(bw, q); bw.webContents.sendInputEvent({ type: 'mouseMove', x: q.x, y: q.y, globalX: g.x, globalY: g.y, button: 'left', modifiers: ['leftbuttondown'] } as Electron.MouseInputEvent); await wait(34); }
    const lifted = await js<boolean>(bw, `!!document.querySelector('.nmini.lifting')`);
    const out = scr(bw, { x: -40, y: mini.y });
    await js(bw, `(() => { const el = document.querySelector('.nmini.lifting'); if (!el) return false; const o = { bubbles: true, pointerId: 1, isPrimary: true, pointerType: 'mouse', clientX: -40, clientY: ${mini.y}, screenX: ${out.x}, screenY: ${out.y} };
      el.dispatchEvent(new PointerEvent('pointermove', o)); el.dispatchEvent(new PointerEvent('pointermove', { ...o, screenX: ${out.x - 60} })); el.dispatchEvent(new PointerEvent('pointerup', { ...o, screenX: ${out.x - 60} })); return true; })()`);
    await wait(900);
    const pulled = NOTES.find((n) => n.out);
    pulledWin = pulled ? ((noteWins as unknown as { wins: Map<string, { w: BrowserWindow }> }).wins.get(pulled.id)?.w ?? null) : null;
    check('notes: a note dragged off the board becomes a sticky window on the desktop, kept where he let go', lifted && !!pulled && !!pulledWin && pulledWin.isVisible() && family.members().includes('note:' + pulled.id),
      { lifted, pulled: pulled && { id: pulled.id, out: pulled.out }, win: pulledWin?.getBounds() });
  } else check('notes: a note dragged off the board becomes a sticky window', false, 'no note on the board');

  // ---- the reload his Shell does when Aang comes back with new pages (main.ts freshen): the bug's real trigger.
  ignoreCalls.length = 0;
  bw.webContents.reloadIgnoringCache();
  await until(() => !bw.webContents.isLoading(), 5000);
  await wait(500);
  check('reload: the bubble lets the mouse through again and re-arms the forwarding for the new page', ignoreCalls.join(',').includes('false,true+fwd') && !bubbleIs.clickable(), ignoreCalls);
  await boardAndNewNote('after a page reload');
  // Esc on a blank new note: nothing kept.
  const saves0 = countSaid('bubble:notesave');
  bubble.send('bubble:dismiss', 'esc');
  await wait(900);
  check('a blank new note he walks away from is not kept', countSaid('bubble:notesave') === saves0 && !NOTES.some((n) => !n.title && !n.html));

  // ============================================================================================ 2. the quick note
  const qn = noteWins.quick()!;
  await until(() => !qn.webContents.isLoading() && qn.isVisible(), 5000);
  await wait(500);
  const qs = await js<any>(qn, `({ quick: document.body.classList.contains('quick'), active: document.activeElement?.className ?? '' })`);
  check('quick note (Ctrl+Numpad *): opens small, empty, with the caret in it', qs.quick && /nbody/.test(qs.active), qs);
  await type(qn, 'Buy oat milk');
  await key(qn, 'Enter');
  await until(() => !!lastSaid('note:quickdone'), 2000);
  await wait(200);
  const qd = said.filter((x) => x.ch === 'notes.save').map((x) => x.a).find((n) => /Buy oat milk/.test(n.html));
  check('quick note: Enter keeps it as a note (its words, its title) and the window goes', !!qd && qd.title === 'Buy oat milk' && qn.isDestroyed(), { qd, gone: qn.isDestroyed() });

  // ============================================================================================ 3. Samara's notes rail
  const sam = new BrowserWindow({ x: -5900, y: 1300, width: 1100, height: 640, show: false, frame: false, skipTaskbar: true, focusable: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, preload } });
  await sam.loadURL(`${pages.origin}/browser.html`);
  sam.showInactive();
  await wait(700);
  sam.webContents.send('browser:tabs', { active: 1, tabs: [{ id: 1, url: 'https://forever.warcraft.com/guides/molten-core', title: 'Molten Core', pane: 1 }], canBack: false, canForward: false });
  sam.webContents.send('browser:notes', { notes: NOTES.filter((n) => n.src), cats: [] });
  await wait(300);
  await click(sam, '#menukey');
  await until(() => js(sam, `!document.getElementById('menu').hidden`), 1500);
  const railOpen = await click(sam, '#m-sitenotes');
  await wait(900);
  check('Samara: … menu → "Notes for this site" opens the rail (real clicks)', railOpen && (await js(sam, `document.getElementById('siterail').classList.contains('on')`)) === true && (await js<number>(sam, `document.querySelectorAll('.sr-card:not(.new)').length`)) >= 1);
  await click(sam, '.sr-add');
  await wait(300);
  await type(sam, 'Bring fire resist');
  await key(sam, 'Enter');
  await wait(300);
  check('Samara: "+ note for this site", typed and Enter, keeps a note', /Bring fire resist/.test(lastSaid('browser:notesave')?.html ?? ''), lastSaid('browser:notesave'));
  await key(sam, 'Escape');
  await wait(900);
  check('Samara: Esc closes the rail', (await js(sam, `document.getElementById('siterail').classList.contains('on')`)) === false);
  sam.destroy();

  // ============================================================================================ 4. notice B
  toBubble({ t: 'notes.state', notes: NOTES, cats: CATS });
  bubble.send('bubble:dismiss', 'esc');
  await wait(900);
  cursor = { x: -9999, y: -9999 };
  toBubble({ t: 'bubble', text: 'Renew the passport is due tomorrow!', stream: false, proactive: true, kind: 'note.notice', notice: { noteId: 'nbf1', line: 'Renew the passport' }, link: 'Renew the passport' });
  await wait(2400);
  check('notice: Aang holds the note up (in its colour)', lastSaid('bubble:noticeheld')?.on === true && held.showing, lastSaid('bubble:noticeheld'));
  const lp = await at(bw, '#said .link');
  if (lp) { cursor = scr(bw, lp); await until(() => bubbleIs.clickable(), 500); mouse(bw, 'mouseMove', lp); }
  await wait(700);
  const keysEarly = await js<boolean>(bw, `!!document.querySelector('.nkeys:not([hidden])')`);
  await wait(1300);
  const keys = await js<string[]>(bw, `[...document.querySelectorAll('.nkeys:not([hidden]) .key')].map((k) => k.textContent)`);
  check('notice: the keys wait for ~1.5 s of pointing, then Tick it / Open / Later', !keysEarly && JSON.stringify(keys) === JSON.stringify(['Tick it', 'Open', 'Later']), { keysEarly, keys });
  const linkRes = await bubbleClick('#said .link');
  await wait(600);
  const opened = await noteState();
  check('notice: a click on the note\'s name opens that note in the bubble', linkRes === 'ok' && opened.open && /Before Friday/.test(await js(bw, `document.querySelector('.bignote .ntitle')?.textContent ?? ''`)), { linkRes, opened });
  held.set({ on: false });
  bubble.send('bubble:dismiss', 'esc');
  await wait(900);
  cursor = { x: -9999, y: -9999 };

  // ============================================================================================ 5. the pop-out family
  timers.sync([{ id: 't1', label: 'Flask', total: 600_000, end: Date.now() + 420_000, paused: 0 }]);
  jobs.update([JOB] as never, []);
  const jw = jobs.open(S1, { x: -3600, y: 300 })!;
  const pw = player.open();
  const tw = (timers as unknown as { wins: Map<string, { w: BrowserWindow }> }).wins.get('t1')!.w;
  const nw = pulledWin && !pulledWin.isDestroyed() ? pulledWin : noteWins.show({ ...NOTES[1]!, out: { x: -4600, y: 1300, w: 240, h: 170, opacity: 1, pinned: false } })!;
  const N = 'note:' + [...(noteWins as unknown as { wins: Map<string, { w: BrowserWindow }> }).wins].find(([, v]) => v.w === nw)![0];
  const T = 'timer:t1', J = 'job:' + S1, PL = 'player', V = 'video';
  const WIN: Record<string, BrowserWindow> = { [V]: video, [N]: nw, [T]: tw, [J]: jw, [PL]: pw };
  const SEL: Record<string, string> = { [V]: '.bar', [N]: '#grab', [T]: '#tw .twr', [J]: '.pj', [PL]: '#mp' };
  /** Where along each handle he grabs (the timer's glass is its own key: hold to restart, so the plate's right part). */
  const FX: Record<string, number> = { [V]: 0.3, [N]: 0.3, [T]: 0.5, [J]: 0.3, [PL]: 0.3 };
  const ok = await until(() => [V, N, T, J, PL].every((id) => family.members().includes(id)) && Object.values(WIN).every((w) => !w.webContents.isLoading() && w.isVisible()), 15000);
  check('family: all five members are up (video, note, timer, job, player)', ok, family.members());
  await wait(2500);
  const H = family as unknown as { fam: F.Fam; live: Map<string, { last: unknown; pending: unknown[] }>; leave(id: string, relayout?: boolean, byHim?: boolean): void; setPos(id: string, x: number, y: number): void };
  const own0 = new Map([V, N, T, J, PL].map((id) => [id, { ...H.fam.get(id)!.own }]));
  console.log('OWN ' + JSON.stringify(Object.fromEntries(own0)));
  const box = (id: string) => family.boxes().get(id)!;
  const busy = () => family.busy || [...H.live.values()].some((l) => l.pending.length > 0);
  const settle = async () => { await wait(120); let prev = '', same = 0; const end = Date.now() + 5000; while (Date.now() < end) { const s = JSON.stringify([...family.boxes()]); if (!busy() && s === prev) { if (++same >= 3) return; } else same = 0; prev = s; await wait(120); } };
  const PARK: Record<string, { x: number; y: number }> = { [V]: { x: -5400, y: 300 }, [N]: { x: -3600, y: 1400 }, [T]: { x: -3300, y: 1400 }, [J]: { x: -3600, y: 1700 }, [PL]: { x: -4300, y: 1700 } };
  const put = (id: string, x: number, y: number) => { const l = H.live.get(id); if (l) l.last = null; H.setPos(id, x, y); };
  async function reset(): Promise<void> {
    if (family.wiggling) family.endWiggle();
    for (let i = 0; i < 8; i++) { const j = [V, N, T, J, PL].find((id) => family.joined(id)); if (!j) break; H.leave(j, true, true); }
    await settle();
    for (const [id, p] of Object.entries(PARK)) put(id, p.x, p.y);
    await wait(150);
  }
  const flush = (a: F.Box, b: F.Box, side: F.Side) => side === 'right' ? a.x === b.x + b.width : side === 'left' ? a.x + a.width === b.x : side === 'below' ? a.y === b.y + b.height : a.y + a.height === b.y;
  /** Drag `mover` by its own handle so it lands 6 px off `side` of `anchor`, for real; true when it joined flush there. */
  async function snapTo(mover: string, anchor: string, side: F.Side): Promise<{ ok: boolean; d: unknown }> {
    const a = box(anchor), m = box(mover);
    const tx = side === 'right' ? a.x + a.width + 6 : side === 'left' ? a.x - m.width - 6 : a.x + 4;
    const ty = side === 'below' ? a.y + a.height + 6 : side === 'above' ? a.y - m.height - 6 : a.y + 4;
    await drag(WIN[mover]!, SEL[mover]!, tx - m.x, ty - m.y, 12, FX[mover], 0.5);
    await settle();
    const now = box(mover), an = box(anchor);
    const okk = family.joined(mover) && family.groupOf(mover).includes(anchor) && flush(now, an, side);
    return { ok: okk, d: { side, mover: now, anchor: an, shape: family.shapeOf(mover), joined: family.joined(mover) } };
  }
  const sides: F.Side[] = ['right', 'left', 'below', 'above'];
  const pictured: string[] = [];
  for (const anchor of [V, T, J, PL]) {
    for (const side of sides) {
      await reset();
      put(N, box(anchor).x + (side === 'left' ? -500 : 500), box(anchor).y + (side === 'above' ? -400 : 300));
      await wait(150);
      const r = await snapTo(N, anchor, side);
      check(`family: a note dragged to the ${side} of the ${anchor.split(':')[0]} snaps flush and joins`, r.ok, r.d);
      if (r.ok && anchor === PL && side === 'below' && !pictured.length) { pictured.push('x'); await shot([pw, nw], 'note-under-player'); }
    }
  }

  // Whole-group drag, corners, reshape, the family menu, pull apart, leaving sizes, Esc / right-click / desktop rejoin.
  await reset();
  let r = await snapTo(J, V, 'right');
  r = r.ok ? await snapTo(PL, V, 'below') : r;
  r = r.ok ? await snapTo(N, V, 'above') : r;
  check('family: job right of the video (a column as tall), player below it (a strip as wide), note above', r.ok && family.shapeOf(J) === 'tall' && box(J).height === box(V).height && family.shapeOf(PL) === 'wide' && box(PL).width === box(V).width && family.shapeOf(N) === 'wide',
    { r: r.d, J: [family.shapeOf(J), box(J)], PL: [family.shapeOf(PL), box(PL)], V: box(V) });
  const sq = F.squareCorners(H.fam);
  check('family: corners: joined ones square, outer ones round (video: all four square; job: its left two)', JSON.stringify([...(sq.get(V) ?? [])].sort()) === JSON.stringify(['bl', 'br', 'tl', 'tr']) && JSON.stringify([...(sq.get(J) ?? [])].sort()) === JSON.stringify(['bl', 'tl']), Object.fromEntries(sq));
  await shot([video, jw, pw, nw], 'group');
  const before = new Map([V, J, PL, N].map((id) => [id, box(id)]));
  await drag(video, '.bar', -180, 90, 12, 0.3);
  await settle();
  const moved = [V, J, PL, N].map((id) => ({ id, dx: box(id).x - before.get(id)!.x, dy: box(id).y - before.get(id)!.y }));
  check('family: dragging the video\'s bar moves the whole group by the same amount', moved.every((m) => m.dx === moved[0]!.dx && m.dy === moved[0]!.dy) && moved[0]!.dx !== 0, moved);
  // The family menu, from a real right-click on the job.
  await click(jw, '.pj', 'right');
  await until(() => family.overlay.showing === 'menu', 1500);
  const ov = (family.overlay as unknown as { w: BrowserWindow }).w;
  await until(() => js(ov, `!!document.querySelector('.tabmenu button[data-id="apart"]')`), 1500);
  check('family: a right-click on a joined window opens the family menu (See-through, Pin, Click through, Pull apart)', family.overlay.showing === 'menu' && (await js<string[]>(ov, `[...document.querySelectorAll('.tabmenu button')].map((b) => b.dataset.id)`)).join(',').includes('pin,through,apart') || false,
    await js(ov, `[...document.querySelectorAll('.tabmenu button')].map((b) => b.dataset.id)`).catch(() => null));
  const tr = await at(ov, '.tabmenu .track', 0.5, 0.5);
  if (tr) { mouse(ov, 'mouseDown', tr); await wait(40); mouse(ov, 'mouseUp', tr); await wait(200); }
  const jobOp = Number(await js(jw, `getComputedStyle(document.querySelector('.pj')).getPropertyValue('--op')`));   // the job fades in its page
  check('family: See-through at 50% applies to every member at once', [video, pw, nw].every((w) => Math.abs(w.getOpacity() - 0.5) < 0.06) && Math.abs(jobOp - 0.5) < 0.06, { windows: [video, pw, nw].map((w) => w.getOpacity()), jobOp });
  await click(ov, '.tabmenu button[data-id="pin"]');
  check('family: Pin on top pins the family', family.sharedState.pinned === true, family.sharedState);
  family.shared('', { opacity: 1, pinned: false });
  await click(jw, '.pj', 'right');
  await until(() => family.overlay.showing === 'menu', 1500);
  await click(ov, '.tabmenu button[data-id="through"]');
  check('family: Click through: every member of the group lets clicks through', [J, PL, N].every((id) => family.isThrough(id)), [J, PL, N].map((id) => family.isThrough(id)));   // (this harness's video has no click-through door)
  check('family: ... and Ctrl+Alt+P over one brings the group back', family.reachAt({ x: box(J).x + 5, y: box(J).y + 5 }) && [V, J, PL, N].every((id) => !family.isThrough(id) || id === V));
  // The timer's own menu while joined has the family rows.
  await reset();
  r = await snapTo(T, V, 'right');
  check('family: the timer joins the video as a compact column (only as tall as itself)', r.ok && family.shapeOf(T) === 'tall' && box(T).height <= box(V).height, r.d);
  await click(tw, '#tw', 'right');
  await wait(600);
  const tm = (timers.menu as unknown as { w: BrowserWindow | null }).w;
  const tmRows = tm && !tm.isDestroyed() ? await js<string[]>(tm, `[...document.querySelectorAll('button')].map((b) => b.dataset.id)`) : [];
  check('family: the timer\'s own right-click menu, joined, carries the family rows (pin, through, apart)', ['pin', 'through', 'apart'].every((x) => tmRows.includes(x)) && family.overlay.showing !== 'menu', tmRows);
  if (tm && !tm.isDestroyed()) await click(tm, 'button[data-id="apart"]');
  await wait(700);
  check('family: Pull apart from the timer\'s menu spreads the group', family.wiggling);
  family.endWiggle(); await settle();

  // Leaving: each member pulled out of a group gets ITS OWN size back (his rule; the player stayed 640 wide).
  for (const [m, anchor, side] of [[PL, V, 'below'], [PL, V, 'right'], [J, V, 'right'], [J, V, 'below'], [N, V, 'below'], [N, J, 'right'], [T, V, 'right'], [T, PL, 'below']] as [string, string, F.Side][]) {
    await reset();
    const j = await snapTo(m, anchor, side);
    if (!j.ok) { check(`leaving: ${m.split(':')[0]} joined ${side} of ${anchor.split(':')[0]} first`, false, j.d); continue; }
    await click(WIN[m]!, SEL[m]!, "right", FX[m], 0.5);
    let viaMenu = false;
    if (m === T) { await wait(500); const tmw = (timers.menu as unknown as { w: BrowserWindow | null }).w; if (tmw && !tmw.isDestroyed()) { viaMenu = true; await click(tmw, 'button[data-id="apart"]'); } }
    else { await until(() => family.overlay.showing === 'menu', 1500); viaMenu = await click(ov, '.tabmenu button[data-id="apart"]'); }
    await until(() => family.wiggling, 1500);
    await wait(500);
    const b = box(m), dir = side === 'right' ? { x: 260, y: 0 } : side === 'below' ? { x: 0, y: 260 } : side === 'left' ? { x: -260, y: 0 } : { x: 0, y: -260 };
    await drag(WIN[m]!, SEL[m]!, dir.x + 40, dir.y + 40, 12, FX[m], 0.5);
    await settle(); await wait(500); await settle();
    const now = box(m), own = own0.get(m)!, shape = family.shapeOf(m);
    const ownW = m === T ? Math.abs(now.width - own.width) <= 24 : now.width === own.width;
    const ownH = m === T || m === J ? Math.abs(now.height - own.height) <= 24 : now.height === own.height;
    check(`leaving: ${m.split(':')[0]} (${side} of the ${anchor.split(':')[0]}) pulled apart and dragged out is free at its own size`, viaMenu && !family.joined(m) && shape === 'free' && ownW && ownH,
      { viaMenu, joined: family.joined(m), shape, now: { w: now.width, h: now.height }, own, wasAt: { w: b.width, h: b.height } });
    const a = box(anchor), aOwn = own0.get(anchor)!;
    check(`leaving: ... and the ${anchor.split(':')[0]} left on its own is back to its own size too`, !family.joined(anchor) && (anchor === T ? Math.abs(a.width - aOwn.width) <= 24 : a.width === aOwn.width), { a: { w: a.width, h: a.height }, aOwn });
  }
  // The other way a member leaves: the window it sits on goes away (the video put away). Each goes back to its own size,
  // and comes back into its slot when the video does. And Pull apart then Esc with nothing dragged out is NOT leaving:
  // they join back as they were (a strip under the video stays as wide as the video; that is right, not the 640 bug).
  for (const [m, side] of [[PL, 'below'], [J, 'right'], [N, 'below'], [T, 'right']] as [string, F.Side][]) {
    await reset();
    const j = await snapTo(m, V, side);
    if (!j.ok) { check(`video put away: ${m.split(':')[0]} joined first`, false, j.d); continue; }
    const joinedBox = box(m);
    video.hide(); await settle(); await wait(400); await settle();
    const alone = box(m), own = own0.get(m)!;
    const okOwn = m === T ? Math.abs(alone.width - own.width) <= 24 : alone.width === own.width && (m === J || alone.height === own.height);
    check(`video put away: the ${m.split(':')[0]} on its own goes back to its own size`, !family.joined(m) && okOwn, { alone, own });
    video.showInactive(); await settle(); await wait(500); await settle();
    check(`video shown again: the ${m.split(':')[0]} goes back into its slot (${side})`, family.joined(m) && box(m).width === joinedBox.width, { now: box(m), joinedBox });
    if (m === PL) {
      family.pullApart(V); await until(() => family.wiggling, 1500); await wait(500);
      await key((family.overlay as unknown as { w: BrowserWindow }).w, 'Escape');
      await wait(600); await settle();
      check('player: Pull apart then Esc, nothing dragged out: joined back as the video-wide strip', !family.wiggling && family.joined(PL) && box(PL).width === box(V).width, { pl: box(PL), v: box(V) });
    }
  }
  // Pulled apart: drag one round to another side (rearrange), then Esc / a desktop click / a right-click joins it back.
  for (const how of ['esc', 'desktop', 'right-click'] as const) {
    await reset();
    let g = await snapTo(J, V, 'right');
    g = g.ok ? await snapTo(N, V, 'below') : g;
    if (!g.ok) { check(`apart (${how}): built the group`, false, g.d); continue; }
    family.pullApart(V);
    await until(() => family.overlay.showing === 'catch', 1500);
    await wait(500);
    if (how === 'esc') {
      // the note dragged round to the video's left while apart: the rest make room, it lands there
      const v = box(V), n = box(N);
      // its middle brought just left of the video's left side, as he would
      await drag(nw, '#grab', (v.x - 30) - (n.x + n.width / 2), (v.y + v.height / 2) - (n.y + n.height / 2), 16, 0.3);
      await wait(600);
      await key(ov, 'Escape');
    } else if (how === 'desktop') {
      const cw = ov.getContentBounds(); const p = { x: 6, y: cw.height - 6 };
      mouse(ov, 'mouseDown', p); await wait(40); mouse(ov, 'mouseUp', p);
    } else await click(jw, '.pj', 'right');
    await wait(700); await settle();
    const joinedBack = !family.wiggling && family.groupOf(V).length === 3 && family.overlay.showing === 'none';
    const fam = H.fam, nA = fam.get(N)?.anchor;
    check(`apart → ${how === 'esc' ? 'note dragged to the left, Esc' : how === 'desktop' ? 'a click on the empty desktop' : 'a right-click on a member'} joins them back flush`
      + (how === 'esc' ? ' (the note now on the video\'s left)' : ''), joinedBack && (how !== 'esc' || (nA?.to === V && nA.side === 'left') || (fam.get(V)?.anchor?.to === N)),
      { wiggling: family.wiggling, group: family.groupOf(V), overlay: family.overlay.showing, noteAnchor: nA, videoAnchor: fam.get(V)?.anchor });
  }
  // Saved layout after a restart: a new family reads the same file and the player goes back under the video.
  await reset();
  const g2 = await snapTo(PL, V, 'below');
  (family as unknown as { saveNow(): void }).saveNow?.();
  await wait(300);
  const fam2 = new FamilyHost({ origin: pages.origin, saveFile: path.join(TMP, 'family-layout.json') });
  const saved2 = (fam2 as unknown as { saved: { layouts: Record<string, { members: Record<string, { anchor?: { to: string; side: string } }> }> } }).saved;
  const anyLay = Object.values(saved2.layouts)[0];
  check('saved layout: after a restart the family knows the player sits below the video', g2.ok && anyLay?.members[PL]?.anchor?.to === V && anyLay.members[PL]?.anchor?.side === 'below', { g2: g2.ok, lay: anyLay?.members[PL] });
  fam2.dispose();

  // ============================================================================================ done
  check('nothing was ever asked onto his real screens', onHisScreen.length === 0, onHisScreen.slice(0, 4));
  const real = pageErrors.filter((e) => /TypeError|ReferenceError|SyntaxError|is not a function|Cannot read/.test(e));
  check('no script errors in any page', real.length === 0, real.slice(0, 3));
  console.log(`${passed} passed, ${failed} failed`);
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
  try { family.dispose(); } catch { /* fine */ }
  try { held.close(); } catch { /* fine */ }
  try { bubble.close(); } catch { /* fine */ }
  pages.close();
  closeAll();
  setTimeout(() => app.exit(failed ? 1 : 0), 150);
  void FULL_W;
});

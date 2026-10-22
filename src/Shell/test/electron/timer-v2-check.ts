// Sheet 67 v2 + 67b, the built timer (2026-10-22). Real TimerWindows, real pages, real FamilyHost, a fake brain that is
// the brain's own Timers store (src/Core/src/timers.ts) armed for the earliest end, exactly as core.ts does. Every window
// is off his screen (x around -5000), never focused or raised; input goes in through webContents.sendInputEvent (no real
// mouse or keys). Dialogs are stubbed, any error exits, everything is closed at the end.
//
// Checks: two timers in two colours; hover keys and +1; scroll; click = pause (it lies down on its side, the sand settles
// to the low side) and back; hold = turn over (180: the fallen sand is the new top, no grain added or lost, nothing pours
// up); the right-click menu (rows, New timer ▸, Colour ▸), rename on the nameplate (the keyboard only while editing);
// time's up rings on time and stays (Again / +5 / hold X); family shapes (a compact column at the top beside the video,
// a second timer stacked under it, a plate under the video), the family rows in its menu. Then memory and CPU of one
// timer renderer at the desk and calm (a game in front).
//
// Run: npx electron test/electron/timer-v2-check.ts <folder for the pictures>
import { app, BrowserWindow, dialog, ipcMain, nativeImage } from 'electron';
import { mkdirSync, mkdtempSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { servePages } from '../../src/pageserver.ts';
import { TimerWindows, type TimerData } from '../../src/timerwin.ts';
import { FamilyHost } from '../../src/familywin.ts';
import { Timers } from '../../../Core/src/timers.ts';

process.on('uncaughtException', (e) => { console.log('HARNESS ERROR ' + String((e as Error)?.stack ?? e).split('\n').slice(0, 5).join(' | ')); app.exit(2); });
process.on('unhandledRejection', (e) => { console.log('HARNESS REJECTION ' + String((e as Error)?.stack ?? e).split('\n').slice(0, 5).join(' | ')); app.exit(2); });
setTimeout(() => { console.log('HARNESS TIMEOUT'); app.exit(3); }, 170_000).unref();
dialog.showErrorBox = (t: string, c: string) => { console.log('DIALOG (stubbed) ' + t + ' ' + c); };
dialog.showMessageBox = (async () => ({ response: 0, checkboxChecked: false })) as never;
// everything paints, as on his desk (an off-screen window would otherwise count as hidden)
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.on('window-all-closed', () => {});
const TMP = mkdtempSync(path.join(os.tmpdir(), 'timer-v2-check-'));
app.setPath('userData', TMP);
const HERE = path.dirname(fileURLToPath(import.meta.url));
BrowserWindow.prototype.show = function (this: BrowserWindow) { this.showInactive(); };
BrowserWindow.prototype.focus = function () {};
BrowserWindow.prototype.moveTop = function () {};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const check = (what: string, ok: boolean, d: unknown = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${d !== '' ? '  -- ' + String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 400) : ''}`); if (!ok) bad++; };
const until = async (fn: () => boolean | Promise<boolean>, ms = 6000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await wait(60); } return fn(); };
const OUT = (() => { const a = process.argv.at(-1); try { if (a && !a.endsWith('.ts')) { mkdirSync(a, { recursive: true }); if (statSync(a).isDirectory()) return a; } } catch { /* below */ } return TMP; })();

// ---------------------------------------------------------------- pictures
type Pic = { w: number; h: number; px: Buffer };   // BGRA
const BG = [34, 36, 40];
function blank(w: number, h: number): Pic { const px = Buffer.alloc(w * h * 4); for (let i = 0; i < px.length; i += 4) { px[i] = BG[0]!; px[i + 1] = BG[1]!; px[i + 2] = BG[2]!; px[i + 3] = 255; } return { w, h, px }; }
function over(dst: Pic, img: Electron.NativeImage, ox: number, oy: number, k = 1, crop?: { x: number; y: number; w: number; h: number }): void {
  const s = img.getSize(), b = img.toBitmap();
  const c = crop ?? { x: 0, y: 0, w: s.width, h: s.height };
  for (let y = 0; y < c.h * k; y++) for (let x = 0; x < c.w * k; x++) {
    const sx = c.x + Math.floor(x / k), sy = c.y + Math.floor(y / k);
    if (sx < 0 || sy < 0 || sx >= s.width || sy >= s.height) continue;
    const si = (sy * s.width + sx) * 4, dx = ox + x, dy = oy + y;
    if (dx < 0 || dy < 0 || dx >= dst.w || dy >= dst.h) continue;
    const di = (dy * dst.w + dx) * 4, a = b[si + 3]! / 255;
    if (!a) continue;
    for (let ch = 0; ch < 3; ch++) dst.px[di + ch] = Math.round(b[si + ch]! * a + dst.px[di + ch]! * (1 - a));
  }
}
function save(p: Pic, name: string): void {
  const f = path.join(OUT, name);
  writeFileSync(f, nativeImage.createFromBitmap(p.px, { width: p.w, height: p.h }).toPNG());
  console.log('PICTURE ' + f + ' ' + p.w + 'x' + p.h);
}
/** The windows as they sit on the (off-screen) desktop, cropped to `area` (screen DIP) or to them all. */
async function scene(ws: BrowserWindow[], area?: { x: number; y: number; width: number; height: number }): Promise<Pic> {
  const caps = await Promise.all(ws.filter((w) => !w.isDestroyed() && w.isVisible()).map(async (w) => ({ img: await w.webContents.capturePage(), b: w.getContentBounds() })));
  const L = area?.x ?? Math.min(...caps.map((c) => c.b.x)) - 12, T = area?.y ?? Math.min(...caps.map((c) => c.b.y)) - 12;
  const R = area ? area.x + area.width : Math.max(...caps.map((c) => c.b.x + c.b.width)) + 12, B = area ? area.y + area.height : Math.max(...caps.map((c) => c.b.y + c.b.height)) + 12;
  const p = blank(R - L, B - T);
  for (const c of caps) { const k = c.img.getSize().width / c.b.width; over(p, k === 1 ? c.img : c.img.resize({ width: c.b.width }), c.b.x - L, c.b.y - T); }
  return p;
}

app.whenReady().then(async () => {
  const pages = await servePages(path.join(HERE, '..', '..', 'pages'));
  const host = new FamilyHost({ origin: pages.origin, saveFile: null });
  host.displays = () => [{ id: 11, scaleFactor: 1, bounds: { x: -6000, y: 0, width: 3000, height: 1600 } }];
  host.areas = () => [{ x: -6000, y: 0, width: 3000, height: 1600 }];
  const preload = path.join(HERE, '..', '..', 'src', 'preload.cjs');

  // ---- the fake brain: the brain's own store, rung by a timeout armed for the earliest end (core.ts armTimers)
  const brain = new Timers(path.join(TMP, 'timers.json'));
  const late: number[] = [];
  const said: Record<string, unknown>[] = [];
  let arm: NodeJS.Timeout | null = null, refocused = 0;
  const push = () => timers.sync(brain.list() as TimerData[]);
  const rearm = () => { if (arm) clearTimeout(arm); arm = null; const at = brain.nextAt(); if (at !== null) arm = setTimeout(fire, Math.max(0, at - Date.now())); };
  const fire = () => { const now = Date.now(); for (const t of brain.due(now)) late.push(now - t.end); brain.expire(now); push(); rearm(); };
  const toBrain = (m: Record<string, unknown>) => {
    said.push(m);
    if (m.t === 'timer.start') brain.start(Number(m.ms), String(m.label ?? ''), Date.now(), m.colour);
    else if (m.t === 'timer.act') brain.act(String(m.id), m.action as 'add', Date.now(), m);
    push(); rearm();
  };
  const MENU_AREA = { x: -4700, y: 0, width: 1400, height: 900 };
  const timers = new TimerWindows({ origin: pages.origin, preloadPath: preload, spotFile: path.join(TMP, 'spot.json'), near: () => null, toBrain, refocus: () => { refocused++; }, menuArea: () => MENU_AREA });
  timers.family = host;
  // main.ts's doors for the timer, the same checks
  ipcMain.on('timer:clickable', (e, on) => { if (timers.owns(e.sender)) timers.clickable(e.sender, on === true); });
  ipcMain.on('timer:drag', (e, a) => { if (timers.owns(e.sender) && a) timers.drag(e.sender, String(a.phase ?? ''), Number(a.dx) || 0, Number(a.dy) || 0); });
  ipcMain.on('timer:act', (e, a) => {
    const id = timers.idOf(e.sender);
    if (!id || !a || !['add', 'pause', 'stop', 'again', 'rename'].includes(String(a.action))) return;
    toBrain({ t: 'timer.act', id, action: String(a.action), ...(Number.isFinite(Number(a.ms)) ? { ms: Math.round(Number(a.ms)) } : {}), ...(a.action === 'rename' ? { label: String(a.label ?? '') } : {}) });
  });
  ipcMain.on('timer:menu', (e, at) => { if (timers.owns(e.sender)) timers.openMenu(e.sender, at ? { x: Number(at.x), y: Number(at.y) } : null); });
  ipcMain.on('timer:typing', (e, on) => { if (timers.owns(e.sender)) timers.typing(e.sender, on === true); });
  ipcMain.on('timer:menushape', (e, r) => timers.menu.shape(e.sender, r));
  ipcMain.on('timer:menupick', (e, m) => timers.menu.pick(e.sender, m));

  const MIN = 60_000;
  const now0 = Date.now();
  brain.start(10 * MIN, 'Pizza', now0 - 3 * MIN);           // 7 minutes left, blue
  brain.start(10 * MIN, 'Raid pull', now0 - 8 * MIN);       // 2 minutes left (most of the sand down), gold
  push(); rearm();
  const ids = brain.list().map((t) => t.id);
  const W1 = timers.windowOf(ids[0]!)!, W2 = timers.windowOf(ids[1]!)!;
  W1.setPosition(-4600, 120); W2.setPosition(-4260, 120);
  const loaded = await until(() => !W1.webContents.isLoading() && !W2.webContents.isLoading(), 12000);
  await wait(900);
  const js = <T = unknown>(w: BrowserWindow, code: string) => w.webContents.executeJavaScript(code, true) as Promise<T>;
  const G = (w: BrowserWindow) => js<{ angle: number; top: number; bottom: number; colour: string; paints: number; steps: number; ended: boolean; turning: boolean }>(w,
    `(() => { const g = window.__glass; return { angle: g.angle, top: g.sand.count(1), bottom: g.sand.count(2), colour: g.sand.colour, paints: g.stats.paints, steps: g.stats.steps, ended: g.ended, turning: !!g.raf }; })()`);
  check('two timers open, each its own window, loaded', loaded && timers.windowOf(ids[0]!) !== timers.windowOf(ids[1]!));
  const g1 = await G(W1), g2 = await G(W2);
  check('sheet 67b: blue first, the next one gold', g1.colour === 'blue' && g2.colour === 'gold', { g1: g1.colour, g2: g2.colour });
  check('the sand shows the time: 30% down in Pizza, 80% in Raid pull', Math.abs(g1.bottom - 25) <= 2 && Math.abs(g2.bottom - 68) <= 2, { g1, g2 });
  const plate = await js<{ np: string; time: string; font: string }>(W1, `({ np: document.getElementById('np').textContent, time: document.getElementById('left').textContent, font: getComputedStyle(document.getElementById('left')).fontFamily + ' ' + getComputedStyle(document.getElementById('left')).fontWeight })`);
  check('the nameplate and the time read (Figtree bold)', plate.np === 'Pizza' && /^[67]:\d\d$/.test(plate.time) && /Figtree/.test(plate.font) && /800/.test(plate.font), plate);

  // input, straight into the page
  const mouse = (w: BrowserWindow, type: 'mouseMove' | 'mouseDown' | 'mouseUp' | 'mouseEnter', x: number, y: number, button: 'left' | 'right' = 'left') =>
    !w.isDestroyed() && w.webContents.sendInputEvent({ type, x: Math.round(x), y: Math.round(y), button, clickCount: 1 } as never);
  const rectOf = (w: BrowserWindow, sel: string) => js<{ x: number; y: number; w: number; h: number } | null>(w, `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; })()`);
  const click = async (w: BrowserWindow, x: number, y: number) => { mouse(w, 'mouseMove', x, y); await wait(30); mouse(w, 'mouseDown', x, y); await wait(60); mouse(w, 'mouseUp', x, y); };

  // ---- hover keys, +1, scroll
  const gb = (await rectOf(W1, '#gbox'))!;
  mouse(W1, 'mouseEnter', gb.x + 80, gb.y); mouse(W1, 'mouseMove', gb.x + 80, gb.y);
  const keysUp = await until(async () => (await js<string>(W1, `getComputedStyle(document.getElementById('keys')).opacity`)) === '1', 2000);
  const keyNames = await js<string[]>(W1, `[...document.querySelectorAll('#keys .tb')].map((b) => b.dataset.k)`);
  check('hover: +1, +5 and X slide in under it', keysUp && keyNames.join(' ') === '+1 +5 ✕', keyNames);
  const total0 = brain.list()[0]!.total;
  const k1 = (await rectOf(W1, '#keys .tb[data-k="+1"]'))!;
  await click(W1, k1.x, k1.y);
  await until(() => brain.list()[0]!.total === total0 + MIN, 2000);
  check('+1 adds a minute (to the brain)', brain.list()[0]!.total === total0 + MIN, { was: total0, now: brain.list()[0]!.total });
  await wait(1000);   // the +1 chip goes first
  const end0 = brain.list()[0]!.end;
  W1.webContents.sendInputEvent({ type: 'mouseWheel', x: Math.round(gb.x + 80), y: Math.round(gb.y), deltaX: 0, deltaY: 120, wheelTicksY: 1, canScroll: true } as never);
  await until(() => Math.abs(brain.list()[0]!.end - end0) >= 59_000, 2500);
  const chip = await js<string>(W1, `document.getElementById('chip').textContent`);
  check('scroll: one minute, sent once after the quiet, a chip shows it', Math.abs(Math.abs(brain.list()[0]!.end - end0) - MIN) < 1500 && /^[+−]1:00$/.test(chip), { d: brain.list()[0]!.end - end0, chip });
  const bot1 = (await G(W1)).bottom;
  await wait(400);
  check('time added or taken: the sand stays where it is (never pours back up)', (await G(W1)).bottom >= bot1, { before: bot1, after: (await G(W1)).bottom });

  // ---- click the glass: pause, it lies down
  const zoomOf = async (w: BrowserWindow) => nativeImage.createFromDataURL(await js<string>(w, `document.getElementById('gl').toDataURL()`));
  const frames: { name: string; img: Electron.NativeImage }[] = [];
  frames.push({ name: 'standing', img: await zoomOf(W1) });
  await click(W1, gb.x, gb.y);
  await until(async () => (await G(W1)).angle === 90 && !(await G(W1)).turning, 3000);
  const p1 = await G(W1), cls1 = await js<string>(W1, `document.getElementById('tw').className`);
  check('click the glass: paused (brain), it lies on its side, PAUSED shows', brain.list()[0]!.paused > 0 && p1.angle === 90 && /paused/.test(cls1), { p1, cls1 });
  // the sand on its side: in each bulb it has settled against the low wall (glass x high = screen down at 90 degrees)
  const lowSide = await js<{ low: number; high: number }>(W1, `(() => { const s = window.__glass.sand; let low = 0, high = 0; for (let i = 0; i < s.cells.length; i++) if (s.cells[i]) { const x = i % 27; if (x > 13) low++; else if (x < 13) high++; } return { low, high }; })()`);
  check('on its side the sand slides to the low side and stops (the sim sleeps)', lowSide.low > lowSide.high * 2, lowSide);
  const steps0 = (await G(W1)).steps; await wait(800);
  check('lying still: nothing flows, nothing is simulated', (await G(W1)).steps === steps0 && (await G(W1)).bottom === p1.bottom, { steps0, now: (await G(W1)).steps });
  frames.push({ name: 'paused', img: await zoomOf(W1) });
  await click(W1, gb.x, gb.y);
  await until(async () => (await G(W1)).angle === 0 && !(await G(W1)).turning, 3000);
  check('click again: goes on, stands up', brain.list()[0]!.paused === 0 && (await G(W1)).angle === 0);

  // ---- hold the glass: turn it right over (Raid pull, most of the sand down: a half turn)
  const gb2 = (await rectOf(W2, '#gbox'))!;
  const before = await G(W2);
  mouse(W2, 'mouseMove', gb2.x, gb2.y); mouse(W2, 'mouseDown', gb2.x, gb2.y);
  await wait(380);
  const ring = await js<boolean>(W2, `document.getElementById('gbox').classList.contains('holding')`);
  check('holding: the gold ring shows', ring);
  const shots: Record<string, boolean> = {};
  const t0 = Date.now();
  while (Date.now() - t0 < 2500) {
    const a = (await G(W2)).angle;
    if (a > 50 && a < 100 && !shots.a) { shots.a = true; frames.push({ name: 'turning ~' + Math.round(a), img: await zoomOf(W2) }); }
    if (a > 120 && a < 175 && !shots.b) { shots.b = true; frames.push({ name: 'turning ~' + Math.round(a), img: await zoomOf(W2) }); }
    if (a === 0 && shots.a) break;
    await wait(15);
  }
  mouse(W2, 'mouseUp', gb2.x, gb2.y);
  await until(async () => !(await G(W2)).turning, 3000);
  const after = await G(W2);
  frames.push({ name: 'turned over', img: await zoomOf(W2) });
  const b2 = brain.list().find((t) => t.id === ids[1])!;
  check('hold 0.6 s: it turned right over and restarted (the brain has the whole time again)', Math.abs(b2.end - Date.now() - 10 * MIN) < 4000 && shots.a === true, { left: b2.end - Date.now() });
  check('the flip is real sand: what lay in the bottom is now the top, none added or lost', after.top + after.bottom === before.top + before.bottom && Math.abs(after.top - before.bottom) <= 2, { before, after });
  const an = await js<{ left: number; top: number; base: number; next: number }>(W2, `(() => { const g = window.__glass; return { ...g.anchor, next: g.timer ? 1 : 0 }; })()`);
  check('then it runs: the new top (68 grains) drains evenly over the whole 10 minutes, asleep until the next grain', an.top === after.top && Math.abs(an.left - 10 * MIN) < 5000 && an.next === 1, an);

  // the flip in pictures: standing, paused on its side, two turning frames, turned over (3x, every pixel whole)
  {
    const k = 2, sz = frames[0]!.img.getSize().width, p = blank(frames.length * (sz * k + 16) + 16, sz * k + 32);
    frames.forEach((f, i) => over(p, f.img, 16 + i * (sz * k + 16), 16, k));
    save(p, 'timer-flip.png');
    console.log('FLIP FRAMES ' + frames.map((f) => f.name).join(' | '));
  }

  // ---- right-click: its menu
  const openMenu = async (w: BrowserWindow) => {
    const r = (await rectOf(w, '.twr'))!;
    mouse(w, 'mouseMove', r.x, r.y); mouse(w, 'mouseDown', r.x, r.y, 'right'); await wait(40); mouse(w, 'mouseUp', r.x, r.y, 'right');
    let ok = await until(() => timers.menu.visible, 1500);
    if (!ok) { await js(w, `document.getElementById('tw').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, screenX: window.screenX + ${Math.round(r.x)}, screenY: window.screenY + ${Math.round(r.y)} }))`); ok = await until(() => timers.menu.visible, 3000); }
    return ok;
  };
  const MW = () => timers.menu.windowNow!;
  const menuRows = () => js<string[]>(MW(), `[...document.querySelectorAll('#tm > button, #tm > .mhead, #tm > .seerow')].map((b) => b.querySelector('.lab')?.textContent || b.textContent)`);
  check('right-click opens its menu', await openMenu(W1));
  await until(async () => (await menuRows()).length > 0, 2000);
  const rows = await menuRows();
  check('the menu: New timer, Rename, Colour, Restart, Stop (no family rows when alone)', rows.join('|') === 'New timer|Rename|Colour|Restart|Stop', rows);
  await js(MW(), `document.querySelector('#tm button[data-id="new"]').dispatchEvent(new PointerEvent('pointerenter'))`);
  await until(async () => js<boolean>(MW(), `!!document.getElementById('tm-new')`), 1500);
  const sub = await js<string[]>(MW(), `[...document.querySelectorAll('#tm-new button .lab')].map((b) => b.textContent)`);
  const hasField = await js<boolean>(MW(), `!!document.querySelector('#tm-new input')`);
  check('New timer ▸ 5 / 10 / 25 / 45 minutes and a Custom field', sub.join('|') === '5 minutes|10 minutes|25 minutes|45 minutes' && hasField, sub);
  const parsed = await js<unknown[]>(MW(), `['25', '1:30', '1h 20m', '90s', '5s', 'soon'].map((s) => window.__timerMenu.parseCustom(s))`);
  check('Custom: "25", "1:30", "1h 20m", "90s" read; under 10 s or words do not', JSON.stringify(parsed) === JSON.stringify([25 * MIN, 90_000, 80 * MIN, 90_000, null, null]), parsed);
  {
    const mr = await js<{ x: number; y: number; w: number; h: number }>(MW(), `(() => { const a = document.getElementById('tm').getBoundingClientRect(), b = document.getElementById('tm-new').getBoundingClientRect(); return { x: Math.min(a.left, b.left), y: Math.min(a.top, b.top), w: Math.max(a.right, b.right) - Math.min(a.left, b.left), h: Math.max(a.bottom, b.bottom) - Math.min(a.top, b.top) }; })()`);
    // the timer as it sits, and the menu window's own pixels where the menu is (relative to the timer)
    const b1 = W1.getBounds(), mb = MW().getBounds();
    console.log('MENU window ' + JSON.stringify(mb) + ' menu ' + JSON.stringify(mr));
    MW().setShape([]);   // a shaped window captures blank: whole for the picture, then cut again
    await wait(150);
    const menuImg = await MW().webContents.capturePage({ x: Math.floor(mr.x), y: Math.floor(mr.y), width: Math.ceil(mr.w), height: Math.ceil(mr.h) });
    const mx = mb.x + mr.x - b1.x, my = mb.y + mr.y - b1.y;
    const L = Math.min(0, mx) - 12, T = Math.min(0, my) - 12, R = Math.max(b1.width, mx + mr.w) + 12, Bt = Math.max(b1.height, my + mr.h) + 12;
    const p = blank(Math.round(R - L), Math.round(Bt - T));
    over(p, await W1.webContents.capturePage(), -L, -T);
    const ms = menuImg.getSize();
    over(p, ms.width === Math.ceil(mr.w) ? menuImg : menuImg.resize({ width: Math.ceil(mr.w) }), Math.round(mx - L), Math.round(my - T));
    save(p, 'timer-menu.png');
  }
  const nBefore = brain.list().length;
  await js(MW(), `document.querySelector('#tm-new button[data-id="new10"]').click()`);
  await until(() => brain.list().length === nBefore + 1, 2000);
  const t3 = brain.list().at(-1)!;
  check('New timer ▸ 10 minutes: a new timer, the next colour, its own window', brain.list().length === nBefore + 1 && t3.total === 10 * MIN && t3.colour === 'rose' && !timers.menu.visible, t3);
  const W3 = timers.windowOf(t3.id)!;
  W3.setPosition(-3920, 120);

  // Colour ▸ Violet on Pizza
  await openMenu(W1);
  await until(async () => (await menuRows()).length > 0, 2000);
  await js(MW(), `document.querySelector('#tm button[data-id="colour"]').click()`);
  await until(async () => js<boolean>(MW(), `!!document.getElementById('tm-colour')`), 1500);
  const cols = await js<string[]>(MW(), `[...document.querySelectorAll('#tm-colour button')].map((b) => b.querySelector('.lab').textContent + (b.classList.contains('on') ? '*' : ''))`);
  check('Colour ▸ Blue (ticked), Gold, Rose, Jade, Violet', cols.join('|') === 'Blue*|Gold|Rose|Jade|Violet', cols);
  await js(MW(), `document.querySelector('#tm-colour button[data-id="colour-violet"]').click()`);
  await until(async () => (await G(W1)).colour === 'violet', 2000);
  check('picked Violet: the brain keeps it, the sand turns violet', brain.list()[0]!.colour === 'violet' && (await G(W1)).colour === 'violet');

  // Rename, on the nameplate
  await openMenu(W1);
  await until(async () => (await menuRows()).length > 0, 2000);
  await js(MW(), `document.querySelector('#tm button[data-id="rename"]').click()`);
  const editing = await until(async () => js<boolean>(W1, `!!document.querySelector('#np input')`), 2000);
  check('Rename: an input on the nameplate, and only now the window takes the keyboard', editing && W1.isFocusable());
  await js(W1, `(() => { const i = document.querySelector('#np input'); i.value = 'Tea'; })()`);
  const stateCrops: Electron.NativeImage[] = [await W1.webContents.capturePage()];
  W1.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' } as never);
  W1.webContents.sendInputEvent({ type: 'char', keyCode: '\r' } as never);
  W1.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' } as never);
  if (!(await until(() => brain.list()[0]!.label === 'Tea', 1200))) {
    console.log('NOTE the injected Enter did not reach the input; pressing it from the page');
    await js(W1, `document.querySelector('#np input')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`);
    await until(() => brain.list()[0]!.label === 'Tea', 2000);
  }
  check('Enter keeps it: the brain has the name, the keyboard is given back', brain.list()[0]!.label === 'Tea' && !W1.isFocusable() && refocused === 1 && (await js<string>(W1, `document.getElementById('np').textContent`)) === 'Tea', { label: brain.list()[0]!.label, focusable: W1.isFocusable(), refocused });

  // ---- time's up: exactly on time, and it stays
  toBrain({ t: 'timer.start', ms: 3000, label: 'Eggs' });
  const t4 = brain.list().at(-1)!;
  const W4 = timers.windowOf(t4.id)!;
  W4.setPosition(-4600, 330);
  await until(() => !W4.webContents.isLoading(), 6000);
  await until(() => late.length > 0, 6000);
  check('time\'s up rings on time (armed for the end, not a 1 s poll)', late.length === 1 && late[0]! >= 0 && late[0]! < 60, late);
  const doneShown = await until(async () => (await js<string>(W4, `[...document.querySelectorAll('#keys .tb')].map((b) => b.dataset.k).join(' ')`)) === 'Again +5 ✕', 3000);
  await until(async () => (await G(W4)).ended, 3000);   // the last grains land a moment after the ring
  const g4 = await G(W4);
  check('finished: the window stays, every grain down, Again / +5 / X up, the name says time\'s up', doneShown && timers.windowOf(t4.id) !== null && g4.ended && g4.top === 0 && /time's up/.test(await js<string>(W4, `document.getElementById('np').textContent`)), g4);
  stateCrops.push(await W4.webContents.capturePage());
  const again = (await rectOf(W4, '#keys .tb[data-k="Again"]'))!;
  await click(W4, again.x, again.y);
  await until(() => !brain.list().find((t) => t.id === t4.id)?.done, 2000);
  const b4 = brain.list().find((t) => t.id === t4.id)!;
  check('Again: turned over, the same time again', !b4.done && b4.end > Date.now() && b4.total === 3000, b4);
  await until(async () => !(await G(W4)).turning, 3000);
  await js(W4, `document.getElementById('tw').dispatchEvent(new MouseEvent('mouseover'))`);
  const x4 = (await rectOf(W4, '#keys .tb[data-k="✕"]'))!;
  mouse(W4, 'mouseMove', x4.x, x4.y); mouse(W4, 'mouseDown', x4.x, x4.y); await wait(120); mouse(W4, 'mouseUp', x4.x, x4.y);
  await wait(200);
  check('a click on X does nothing', brain.list().some((t) => t.id === t4.id));
  mouse(W4, 'mouseDown', x4.x, x4.y); await wait(750); mouse(W4, 'mouseUp', x4.x, x4.y);
  await until(() => timers.windowOf(t4.id) === null, 2000);
  check('hold X: stopped, its window gone', !brain.list().some((t) => t.id === t4.id) && timers.windowOf(t4.id) === null);
  stateCrops.push(await W2.webContents.capturePage());
  {
    const p = blank(stateCrops.length * 312 + 12, 168);
    stateCrops.forEach((img, i) => over(p, img.getSize().width === 300 ? img : img.resize({ width: 300 }), 12 + i * 312, 6, 1, { x: 0, y: 0, w: 300, h: 160 }));
    save(p, 'timer-states.png');
  }

  // ---- the family: a compact column beside the video, a second timer stacked under it, a plate under the video
  const video = new BrowserWindow({ x: -5600, y: 700, width: 560, height: 344, frame: false, transparent: false, backgroundColor: '#24160D', show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, preload } });
  void video.loadURL(`${pages.origin}/popout.html`);
  video.once('ready-to-show', () => video.showInactive());
  host.add({ id: 'video', kind: 'video', win: () => (video.isDestroyed() ? null : video), card: '.frame', setOpacity: (n) => video.setOpacity(n), setPinned: () => {} });
  await until(() => !video.webContents.isLoading() && host.members().length >= 4, 8000);
  await wait(800);
  const B = () => host.boxes();
  const drop = async (id: string, dx: number, dy: number) => {
    host.drag(id, 'start'); host.drag(id, 'move', dx / 2, dy / 2); await wait(60); host.drag(id, 'move', dx - 3, dy); await wait(60);
    host.drag(id, 'move', dx, dy); await wait(60); host.drag(id, 'end', dx, dy);
  };
  const T1 = 'timer:' + ids[0], T2 = 'timer:' + ids[1], T3 = 'timer:' + t3.id;
  const vb = B().get('video')!;
  const free1 = B().get(T1)!;
  check('a free plate is compact (no empty room)', free1.width < 300 && free1.height < 110, free1);
  let tb = B().get(T1)!;
  await drop(T1, vb.x + vb.width + 5 - tb.x, vb.y + 40 - tb.y);
  await until(() => host.shapeOf(T1) === 'tall', 3000); await wait(1100);
  const c1 = B().get(T1)!;
  check('beside the video: a compact COLUMN, flush, at the top, only as tall as hourglass + name + time', host.joined(T1) && c1.x === vb.x + vb.width && c1.y === vb.y && c1.width === 140 && c1.height < 210 && c1.height < vb.height, { c1, vb });
  tb = B().get(T2)!;
  await drop(T2, c1.x + 24 - tb.x, c1.y + c1.height + 6 - tb.y);   // off the video's edge, onto the column's foot
  await until(() => host.shapeOf(T2) === 'tall', 3000); await wait(1100);
  const c2 = B().get(T2)!, c1b = B().get(T1)!;
  check('a second timer under it: a column too, stacked tight', host.joined(T2) && c2.x === c1b.x && c2.y === c1b.y + c1b.height && c2.width === 140 && c2.height < 210, { c1b, c2 });
  tb = B().get(T3)!;
  await drop(T3, vb.x + 60 - tb.x, vb.y + vb.height + 5 - tb.y);
  await wait(1300);
  const s3 = B().get(T3)!;
  check('under the wider video: its own compact plate, flush (no long empty bar)', host.joined(T3) && s3.y === vb.y + vb.height && s3.width < 300 && host.shapeOf(T3) === 'free', { s3, vb });
  const tall = await js<{ dir: string; shape: string }>(W1, `({ dir: getComputedStyle(document.getElementById('tw')).flexDirection, shape: document.documentElement.dataset.famShape || '' })`);
  check('the column page stacks hourglass over name over time', tall.dir === 'column' && tall.shape === 'tall', tall);
  save(await scene([video, W1, W2, W3]), 'timer-family.png');
  // joined: its own menu, with the family's rows in it
  await openMenu(W1);
  await until(async () => (await menuRows()).length > 0, 2000);
  const famRows = await menuRows();
  check('joined: one right-click = its rows plus the family\'s (See-through, Pin on top, Click through, Pull apart), Stop last', famRows.some((r) => r.startsWith('See-through')) && famRows.includes('Pin on top') && famRows.includes('Click through') && famRows.includes('Pull apart') && famRows.at(-1) === 'Stop' && famRows[0] === 'New timer', famRows);
  await js(MW(), `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
  await until(() => !timers.menu.visible, 1500);
  check('Esc closes the menu', !timers.menu.visible);

  // ---- weight: one timer renderer (Rose, 10 minutes, untouched), at the desk and calm
  const pid = W3.webContents.getOSProcessId();
  const weigh = async (ms: number) => {
    app.getAppMetrics();   // start the CPU window
    const p0 = (await G(W3)).paints;
    await wait(ms);
    const m = app.getAppMetrics().find((x) => x.pid === pid)!;
    return { cpu: Math.round(m.cpu.percentCPUUsage * 1000) / 1000, privMB: Math.round((m.memory.privateBytes ?? 0) / 1024), wsMB: Math.round(m.memory.workingSetSize / 1024), paints: (await G(W3)).paints - p0 };
  };
  const desk = await weigh(10_000);
  timers.calm(true);
  await wait(200);
  const calm = await weigh(10_000);
  const dom = await js<number>(W3, `document.getElementsByTagName('*').length`);
  console.log(`WEIGHT desk: private ${desk.privMB} MB, working set ${desk.wsMB} MB, CPU ${desk.cpu}%, ${desk.paints} paints in 10 s`);
  console.log(`WEIGHT calm: private ${calm.privMB} MB, working set ${calm.wsMB} MB, CPU ${calm.cpu}%, ${calm.paints} paints in 10 s; DOM ${dom} nodes`);
  check('weight: <= 35 MB private and < 0.5% CPU at the desk; calm paints less', desk.privMB <= 35 && desk.cpu < 0.5 && calm.cpu < 0.5 && calm.paints <= desk.paints, { desk, calm });
  check('no stray messages to the brain', said.every((m) => m.t === 'timer.start' || m.t === 'timer.act'));

  console.log(bad ? `FAILED ${bad}` : 'ALL PASS');
  if (arm) clearTimeout(arm);
  timers.sync([]); timers.menu.dispose(); host.dispose();
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.destroy();
  app.exit(bad ? 1 : 0);
}).catch((e) => { console.log('HARNESS ERROR ' + String((e as Error)?.stack ?? e)); app.exit(2); });

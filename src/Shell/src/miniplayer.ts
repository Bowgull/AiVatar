// Sheet 59, the Spotify mini player (2026-10-22, docs/cockpit/sheet-59-mini-player.html; his picks in the interview).
//
// Look A: Winamp in pixel wood, an amber screen (time, bars, the scrolling title), ONE picture (the album cover; in
// SCENE the looping scene cross-fades into the same spot, a click on it gives the next scene). Two sizes, the same
// width: full and the thin shade strip, swapped by a double-click (or the fold key) on a spring (0.5 s, damping 0.825),
// the window's height stepped from here at 60 Hz in whole pixels. Big hit targets: keys 38 px, seek bead 18 px, volume
// 14 px with a round knob, pin / fold / close 28 px.
//
// A SOLID window, never see-through (his GPU answer): Windows' own round corners while free, the family's pixel-stepped
// region while joined (osCorners). It is a member of the window family like the video, notes, timers and jobs: it snaps
// flush, drags as a group, opens the family menu on a right-click while joined, and shares see-through, pin and
// click-through. It never takes the keyboard (focusable: false, shown inactive): clicking Pause over WoW must not pull
// the game out of focus.
//
// Data: the brain's `media.now` (Windows' now-playing, read by the pet: title, artist, cover, status, position at a
// time, duration, Spotify's volume) comes in through main.ts; the page interpolates the time between updates
// (playerstate.js). The keys go out as `media.cmd`, rebuilt here from a strict check (checkPlayerCmd) and checked again
// by the brain. No like key (his call, 2026-10-22: "I don't need a like songs").
//
// Opened from the wheel's Music slot, from asking Aang ("show the music player") and from Aang's right-click menu
// ("Music player"). main.ts only creates this and passes messages: see wireMiniPlayer at the bottom.
import { BrowserWindow, ipcMain, screen } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import { SAFE_WEB_PREFERENCES, denyPermissions, lockDown } from './safety.ts';
import { softEdge } from './winedge.ts';
import type { FamilyHooks } from './familywin.ts';
import { checkPlayerCmd, readPrefs, springAt, VIS, SCENES, type PlayerCmd, type PlayerPrefs } from './playercmd.ts';

/** CSS pixels: the art is 212 x 104 art pixels at exactly 2x; the shade is 26 art pixels tall, the same width. */
export const FULL_W = 424, FULL_H = 208, SHADE_H = 52;
/** The fold's spring (sheet 59 motion 3). */
export const FOLD = { response: 0.5, damping: 0.825 };
const MIN_OPACITY = 0.3;

export { checkPlayerCmd, readPrefs, springAt } from './playercmd.ts';
export type { PlayerCmd, PlayerPrefs } from './playercmd.ts';

export interface MiniPlayerOptions {
  origin: string;
  preloadPath: string;
  iconPath?: string;
  /** Where its choices are kept (player.json in the Shell's state folder); absent = nothing kept. */
  prefsFile?: string;
  /** A key he pressed, already checked: main.ts sends it to the brain. */
  onCmd?: (c: PlayerCmd) => void;
  /** Off only in the offscreen test, where the window lives far off any display on purpose. */
  clampToScreen?: boolean;
}

export class MiniPlayer {
  private w: BrowserWindow | null = null;
  private readonly o: MiniPlayerOptions;
  private prefs: PlayerPrefs;
  /** The latest now-playing, cover included (the brain sends the cover only when it changes). */
  private now: Record<string, unknown> | null = null;
  private pinned = false;
  private through = false;
  private opacity = 1;
  private drag: { x: number; y: number } | null = null;
  private fold: { from: number; to: number; t0: number; timer: NodeJS.Timeout } | null = null;
  /** Set by familywire.ts. */
  family: FamilyHooks | null = null;

  constructor(o: MiniPlayerOptions) {
    this.o = o;
    let raw: unknown = null;
    try { if (o.prefsFile) raw = JSON.parse(readFileSync(o.prefsFile, 'utf8')); } catch { /* first run */ }
    this.prefs = readPrefs(raw);
    players.add(this);
    wireIpc();
  }

  get window(): BrowserWindow | null { return this.w && !this.w.isDestroyed() ? this.w : null; }
  get visible(): boolean { return !!this.window?.isVisible(); }
  get state(): Readonly<PlayerPrefs> { return { ...this.prefs }; }

  /** Open it (or bring it back where it was). */
  open(): BrowserWindow {
    const had = this.window;
    if (had) { if (!had.isVisible()) had.showInactive(); this.family?.add(this.member()); this.push(); return had; }
    const h = this.prefs.shade ? SHADE_H : FULL_H;
    const at = this.spot(h);
    const w = new BrowserWindow({
      x: at.x, y: at.y, width: FULL_W, height: h, useContentSize: true,
      // Solid, never see-through. Frameless with NO thick frame: measured 2026-10-22, a thick frame (the video pop-out's way)
      // lets the page grow by the invisible resize borders the moment the window is resized from here, which the fold does
      // 60 times a second; without it the page is exactly the window. Windows 11 still rounds it (softEdge asks DWM for
      // round corners); joined, the family cuts its pixel-stepped region. The wooden body is the title bar (the page drags it).
      frame: false, thickFrame: false, transparent: false, backgroundColor: '#2c1c10', hasShadow: true,
      resizable: false, movable: true, minimizable: false, maximizable: false, fullscreenable: false,
      skipTaskbar: true, alwaysOnTop: false, focusable: false, show: false, title: 'Music',
      webPreferences: { ...SAFE_WEB_PREFERENCES, preload: this.o.preloadPath, backgroundThrottling: true },
    });
    if (this.o.iconPath) {
      try { w.setIcon(this.o.iconPath); } catch { /* the default icon */ }
      try { w.setAppDetails({ appId: 'Aang', appIconPath: this.o.iconPath, appIconIndex: 0, relaunchDisplayName: 'Aang' }); } catch { /* not Windows */ }
    }
    lockDown(w.webContents);
    denyPermissions(w.webContents.session);
    softEdge(w);
    this.w = w;
    w.on('closed', () => { if (this.w === w) { this.w = null; this.stopFold(); } });
    // Hidden, minimised or covered: the page stops its scenes and bars (it also hears the page's own visibility).
    const awake = () => this.send('player:awake', !w.isDestroyed() && w.isVisible() && !w.isMinimized());
    for (const ev of ['show', 'hide', 'minimize', 'restore'] as const) w.on(ev as 'show', awake);
    w.on('moved', () => this.savePlace());
    void w.loadURL(`${this.o.origin}/miniplayer.html`);
    w.once('ready-to-show', () => { if (!w.isDestroyed()) { w.showInactive(); this.applyMouse(); } });
    this.family?.add(this.member());
    return w;
  }

  close(): void {
    const w = this.window;
    if (!w) return;
    this.savePlace();
    this.stopFold();
    w.destroy();
    this.w = null;
  }
  toggle(): void { if (this.visible) this.close(); else this.open(); }

  /** The brain's `media.now`. Kept (the cover only comes when it changes) and passed to the page. */
  media(m: Record<string, unknown>): void {
    if (!m || m.t !== 'media.now') return;
    const prev = this.now;
    if (m.app === null) this.now = { ...m, thumb: null };
    else this.now = { ...(prev ?? {}), ...m, thumb: m.thumb !== undefined ? m.thumb : prev?.thumb ?? null };
    this.send('player:media', m.thumb === undefined && prev ? { ...m } : this.now);
  }

  // ---------------------------------------------------------------- the page's doors (matched to this window)

  owns(sender: Electron.WebContents): boolean { const w = this.window; return !!w && w.webContents === sender; }

  hearReady(): void { this.push(); }
  hearCmd(m: unknown): void { const c = checkPlayerCmd(m); if (c) this.o.onCmd?.(c); }
  hearVis(v: unknown): void { if (typeof v === 'string' && VIS.has(v)) { this.prefs.vis = v as PlayerPrefs['vis']; this.savePrefs(); } }
  hearScene(s: unknown): void { if (typeof s === 'string' && SCENES.has(s)) { this.prefs.scene = s; this.savePrefs(); } }
  hearShade(): void { this.setShade(!this.prefs.shade); }
  hearPin(): void { this.applyOnTop(!this.pinned); this.family?.shared('player', { pinned: this.pinned }); }
  hearOpacity(n: unknown): void {
    const v = Number(n);
    if (!Number.isFinite(v)) return;
    this.applyOpacity(v);
    this.family?.shared('player', { opacity: this.opacity });
  }
  hearDrag(a: unknown): void {
    const w = this.window;
    if (!w || !a || typeof a !== 'object') return;
    const { phase, dx, dy } = a as { phase?: unknown; dx?: unknown; dy?: unknown };
    const x = Number(dx) || 0, y = Number(dy) || 0;
    if (phase === 'start') { const [px, py] = w.getPosition(); this.drag = { x: px!, y: py! }; this.family?.drag('player', 'start'); return; }
    if (!this.drag) return;
    if (phase === 'move') { if (!this.family?.drag('player', 'move', x, y)) w.setPosition(Math.round(this.drag.x + x), Math.round(this.drag.y + y)); return; }
    if (phase === 'end' || phase === 'cancel') {
      this.drag = null;
      if (!this.family?.drag('player', phase, x, y)) { /* moved by hand */ }
      this.savePlace();
    }
  }

  // ---------------------------------------------------------------- full <-> shade, on a spring

  setShade(on: boolean): void {
    if (on === this.prefs.shade && !this.fold) return;
    this.prefs.shade = on;
    this.savePrefs();
    const w = this.window;
    this.send('player:ui', this.ui());
    if (!w) return;
    const from = w.getBounds().height, to = on ? SHADE_H : FULL_H;
    this.stopFold();
    const t0 = Date.now();
    const timer = setInterval(() => this.foldStep(), 16);
    this.fold = { from, to, t0, timer };
    this.foldStep();
  }
  private foldStep(): void {
    const f = this.fold, w = this.window;
    if (!f || !w) { this.stopFold(); return; }
    const t = (Date.now() - f.t0) / 1000;
    const k = springAt(t, FOLD.response, FOLD.damping);
    const done = t > 1.2 || (t > 0.3 && Math.abs(1 - k) < 0.002);
    const h = done ? f.to : Math.round(f.from + (f.to - f.from) * k);
    const clamped = Math.max(SHADE_H - 4, Math.min(FULL_H + 4, h));
    const b = w.getBounds();
    if (b.height !== clamped || b.width !== FULL_W) w.setBounds({ x: b.x, y: b.y, width: FULL_W, height: clamped });
    if (done) this.stopFold();
  }
  private stopFold(): void { if (this.fold) clearInterval(this.fold.timer); this.fold = null; }
  get folding(): boolean { return !!this.fold; }

  // ---------------------------------------------------------------- the family

  private member() {
    return {
      id: 'player', kind: 'player' as const, win: () => this.window, card: '.mp', osCorners: true,
      setOpacity: (n: number) => this.applyOpacity(n),
      // Its pin is "stay on top", nothing else: the family's pin is the same.
      setPinned: (on: boolean) => this.applyOnTop(on),
      setOnTop: (on: boolean) => this.applyOnTop(on),
      setThrough: (on: boolean) => { this.through = on; this.applyMouse(); this.send('player:ui', this.ui()); },
      moved: () => this.savePlace(),
    };
  }
  private applyOnTop(on: boolean): void {
    this.pinned = on;
    const w = this.window;
    if (w) w.setAlwaysOnTop(on, 'screen-saver');
    this.send('player:ui', this.ui());
  }
  private applyOpacity(n: number): void {
    this.opacity = Math.max(MIN_OPACITY, Math.min(1, n));
    this.window?.setOpacity(this.opacity);
    this.send('player:ui', this.ui());
  }
  private applyMouse(): void {
    const w = this.window;
    if (!w) return;
    if (this.through) w.setIgnoreMouseEvents(true, { forward: true }); else w.setIgnoreMouseEvents(false);
  }

  // ---------------------------------------------------------------- what the page is told

  private ui() { return { vis: this.prefs.vis, scene: this.prefs.scene, shade: this.prefs.shade, pinned: this.pinned, opacity: this.opacity, through: this.through }; }
  private push(): void {
    this.send('player:ui', this.ui());
    if (this.now) this.send('player:media', this.now);
  }
  private send(ch: string, v: unknown): void {
    const w = this.window;
    if (!w) return;
    const go = () => { if (!w.isDestroyed()) w.webContents.send(ch, v); };
    if (w.webContents.isLoading()) w.webContents.once('did-finish-load', go); else go();
  }

  // ---------------------------------------------------------------- where it goes

  private spot(h: number): { x: number; y: number } {
    const p = this.prefs;
    if (p.x !== undefined && p.y !== undefined) {
      if (this.o.clampToScreen === false) return { x: p.x, y: p.y };
      const area = screen.getDisplayNearestPoint({ x: p.x, y: p.y }).workArea;
      return { x: Math.max(area.x, Math.min(area.x + area.width - FULL_W, p.x)), y: Math.max(area.y, Math.min(area.y + area.height - h, p.y)) };
    }
    const area = screen.getPrimaryDisplay().workArea;
    return { x: area.x + area.width - FULL_W - 24, y: area.y + area.height - FULL_H - 24 };
  }
  private savePlace(): void {
    const w = this.window;
    if (!w || this.drag) return;
    const [x, y] = w.getPosition();
    this.prefs.x = x; this.prefs.y = y;
    this.savePrefs();
  }
  private savePrefs(): void {
    if (!this.o.prefsFile) return;
    try { writeFileSync(this.o.prefsFile, JSON.stringify(this.prefs)); } catch { /* kept for this run */ }
  }

  dispose(): void { this.close(); players.delete(this); }
}

// ------------------------------------------------------------------------------------------------ ipc

const players = new Set<MiniPlayer>();
let wired = false;
function wireIpc(): void {
  if (wired) return;
  wired = true;
  const find = (e: Electron.IpcMainEvent) => {
    if (e.senderFrame && e.senderFrame.parent !== null) return null;   // its own top frame only
    for (const p of players) if (p.owns(e.sender)) return p;
    return null;
  };
  ipcMain.on('player:ready', (e) => find(e)?.hearReady());
  ipcMain.on('player:cmd', (e, m) => find(e)?.hearCmd(m));
  ipcMain.on('player:vis', (e, v) => find(e)?.hearVis(v));
  ipcMain.on('player:scene', (e, s) => find(e)?.hearScene(s));
  ipcMain.on('player:shade', (e) => find(e)?.hearShade());
  ipcMain.on('player:pin', (e) => find(e)?.hearPin());
  ipcMain.on('player:opacity', (e, n) => find(e)?.hearOpacity(n));
  ipcMain.on('player:drag', (e, a) => find(e)?.hearDrag(a));
  ipcMain.on('player:close', (e) => find(e)?.close());
}

/**
 * main.ts's whole part, in one call: the player, its messages to the brain, and what main.ts passes in. Returns the
 * player and a `fromBrain` to call with every brain message (it takes only its own: media.now, player.open).
 */
export function wireMiniPlayer(o: { origin: string; preloadPath: string; iconPath?: string; prefsFile?: string; send: (m: Record<string, unknown>) => void }): { player: MiniPlayer; fromBrain: (m: Record<string, unknown>) => boolean } {
  const player = new MiniPlayer({
    origin: o.origin, preloadPath: o.preloadPath, iconPath: o.iconPath, prefsFile: o.prefsFile,
    onCmd: (c) => o.send(c as unknown as Record<string, unknown>),
  });
  const fromBrain = (m: Record<string, unknown>): boolean => {
    if (m.t === 'media.now') { player.media(m); return false; }      // others may want it too (the bubble's whisper)
    if (m.t === 'player.open') { player.open(); return true; }
    return false;
  };
  return { player, fromBrain };
}

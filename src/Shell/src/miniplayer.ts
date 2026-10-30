// Sheet 59, the Spotify mini player (2026-10-22, docs/cockpit/sheet-59-mini-player.html; his picks in the interview).
//
// Look A: Winamp in pixel wood, an amber screen (time, bars, the scrolling title), ONE picture (the album cover, or a
// looping scene cross-faded into the same spot). What the picture is and whether the bars show are chosen in the
// player's own small menu, behind the ··· key (2026-10-22, his report: the old BARS / SCENE / OFF key was confusing;
// PlayerMenu below). Two sizes, the same
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
import { SAFE_WEB_PREFERENCES, denyPermissions, lockDown } from './safety.ts';
import { softEdge } from './winedge.ts';
import { readJson, saveJson } from './store.ts';
import type { FamilyHooks } from './familywin.ts';
import { checkPlayerCmd, readPrefs, springAt, readDevices, DEVICE_ID, PICTURES, type PlayerCmd, type PlayerPrefs, type PlayerDevice } from './playercmd.ts';

/** CSS pixels: the art is 212 x 104 art pixels at exactly 2x; the shade is 26 art pixels tall, the same width. */
export const FULL_W = 424, FULL_H = 208, SHADE_H = 52;
/** Its family shapes (familywin.ts SHAPE API): wide keeps its own height; the column is 200 px wide, at least 300 tall. */
export const PLAYER_LAYOUTS = { tall: { width: 200, minHeight: 300 }, wide: { height: 'auto' as const } };
/** The fold's spring (sheet 59 motion 3). */
export const FOLD = { response: 0.5, damping: 0.825 };
const MIN_OPACITY = 0.3;

export { checkPlayerCmd, readPrefs, springAt, readDevices } from './playercmd.ts';
export type { PlayerCmd, PlayerPrefs, PlayerDevice } from './playercmd.ts';

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
  /**
   * Spotify Connect (2026-10-22): the window showing or not (the brain asks Spotify about his other devices only while
   * it shows), the menu wanting the device list, and his pick of a device to move the music to (already checked).
   */
  onWatch?: (visible: boolean) => void;
  onDevices?: () => void;
  onTransfer?: (id: string) => void;
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
  private menuOpen = false;
  private drag: { x: number; y: number } | null = null;
  private fold: { from: number; to: number; t0: number; timer: NodeJS.Timeout } | null = null;
  /** Spotify Connect: the last word sent to the brain about being seen, the plain line, the device list (null: asking). */
  private watched: boolean | null = null;
  private note: string | null = null;
  private devs: PlayerDevice[] | null = null;
  private devErr: string | null = null;
  /** Set by familywire.ts. */
  family: FamilyHooks | null = null;
  /** Its own menu (the ··· key): what the picture is, the bars on or off. */
  readonly menu: PlayerMenu;

  constructor(o: MiniPlayerOptions) {
    this.o = o;
    this.prefs = readPrefs(o.prefsFile ? readJson<unknown>(o.prefsFile, null) : null);   // first run: null
    this.menu = new PlayerMenu(o, () => ({ picture: this.prefs.picture, bars: this.prefs.bars, cover: typeof this.now?.thumb === 'string' ? this.now.thumb : null, devices: this.devs, devicesError: this.devErr }),
      (kind, v) => this.choose(kind, v), (open) => { this.menuOpen = open; this.send('player:ui', this.ui()); },
      () => { this.devs = null; this.devErr = null; this.o.onDevices?.(); });
    players.add(this);
    wireIpc();
  }

  get window(): BrowserWindow | null { return this.w && !this.w.isDestroyed() ? this.w : null; }
  get visible(): boolean { return !!this.window?.isVisible(); }
  get state(): Readonly<PlayerPrefs> { return { ...this.prefs }; }

  /** Open it (or bring it back where it was). */
  open(): BrowserWindow {
    const had = this.window;
    if (had) { if (!had.isVisible()) had.showInactive(); this.raise(had); this.family?.add(this.member()); this.push(); this.watch(); return had; }
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
    // Mac (2026-10-28, found in the real-click pass): without this the player opened on the desktop's space, hidden
    // behind whatever full-screen app he is in (Samara), so his clicks landed on that app instead.
    if (process.platform === 'darwin') w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
    this.w = w;
    w.on('closed', () => { if (this.w === w) { this.w = null; this.stopFold(); this.menu.close(); this.watch(); } });
    // Hidden, minimised or covered: the page stops its scenes and bars (it also hears the page's own visibility), and
    // the brain stops asking Spotify about his other devices.
    const awake = () => { this.send('player:awake', !w.isDestroyed() && w.isVisible() && !w.isMinimized()); this.watch(); };
    for (const ev of ['show', 'hide', 'minimize', 'restore'] as const) w.on(ev as 'show', awake);
    w.on('moved', () => { this.savePlace(); this.menu.close(); });
    w.on('hide', () => this.menu.close());
    void w.loadURL(`${this.o.origin}/miniplayer.html`);
    w.once('ready-to-show', () => { if (!w.isDestroyed()) { w.showInactive(); this.raise(w); this.applyMouse(); this.watch(); } });
    this.family?.add(this.member());
    return w;
  }

  close(): void {
    const w = this.window;
    if (!w) return;
    this.savePlace();
    this.stopFold();
    this.menu.close();
    w.destroy();
    this.w = null;
    this.watch();
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

  /** Tell the brain whether the player can be seen, only when that changes. */
  private watch(): void {
    const w = this.window;
    const on = !!w && w.isVisible() && !w.isMinimized();
    if (on === this.watched) return;
    if (!on && this.watched === null) { this.watched = false; return; }
    this.watched = on;
    this.o.onWatch?.(on);
  }
  get watching(): boolean { return this.watched === true; }
  /** Say it again (a brain that just started knows nothing): only when it is showing. */
  rewatch(): void { if (this.watched) this.o.onWatch?.(true); }
  /** The brain's one plain line (Spotify cannot be reached), or null when all is well. */
  setNote(t: unknown): void {
    this.note = typeof t === 'string' && t ? t.slice(0, 80) : null;
    this.send('player:note', this.note);
  }
  /** The brain's device list, for the menu (shown at once if the menu is up). */
  setDevices(m: unknown): void {
    const r = readDevices(m);
    this.devs = r.devices; this.devErr = r.error;
    this.menu.refresh();
  }
  get devices(): PlayerDevice[] | null { return this.devs; }

  // ---------------------------------------------------------------- the page's doors (matched to this window)

  owns(sender: Electron.WebContents): boolean { const w = this.window; return !!w && w.webContents === sender; }

  hearReady(): void { this.push(); }
  hearCmd(m: unknown): void { const c = checkPlayerCmd(m); if (c) this.o.onCmd?.(c); }
  /** The ··· key: its box in page pixels. Opens the menu under it, or closes it when it is up. */
  hearMenu(r: unknown): void {
    const w = this.window;
    if (!w || !r || typeof r !== 'object') return;
    const v = r as Record<string, unknown>, n = (k: string) => (Number.isFinite(v[k]) ? Number(v[k]) : 0);
    const c = w.getContentBounds();
    this.menu.toggle({ x: c.x + Math.round(n('x')), y: c.y + Math.round(n('y')), width: Math.round(n('width')), height: Math.round(n('height')) }, c);
  }
  /** A choice from the menu, checked: a picture by name, or the bars on / off. Kept, and the page repainted. */
  choose(kind: string, v: unknown): void {
    if (kind === 'picture' && typeof v === 'string' && PICTURES.has(v)) this.prefs.picture = v;
    else if (kind === 'bars' && typeof v === 'boolean') this.prefs.bars = v;
    else return;
    this.savePrefs();
    this.send('player:ui', this.ui());
  }
  hearShade(): void { this.menu.close(); this.setShade(!this.prefs.shade); }
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
    if (b.height !== clamped) w.setBounds({ x: b.x, y: b.y, width: b.width, height: clamped });
    if (done) this.stopFold();
  }
  private stopFold(): void { if (this.fold) clearInterval(this.fold.timer); this.fold = null; }
  get folding(): boolean { return !!this.fold; }

  // ---------------------------------------------------------------- the family

  private member() {
    return {
      id: 'player', kind: 'player' as const, win: () => this.window, card: '.mp', osCorners: true,
      // F4 (family part 2): above or below a wider window it is a strip as wide as it (the full player or the shade, its
      // own height); beside a taller one a column: the picture on top, then the screen, then the keys.
      layouts: PLAYER_LAYOUTS,
      setOpacity: (n: number) => this.applyOpacity(n),
      // Its pin is "stay on top", nothing else: the family's pin is the same.
      setPinned: (on: boolean) => this.applyOnTop(on),
      setOnTop: (on: boolean) => this.applyOnTop(on),
      setThrough: (on: boolean) => { this.through = on; this.applyMouse(); this.send('player:ui', this.ui()); },
      moved: () => this.savePlace(),
    };
  }
  /** Up in front when it opens. On the Mac Aang is never the active app, so a normal window of his sinks behind the app
   *  he is in the moment that app is touched (found in the real-click pass, 2026-10-28): there it floats, like his notes. */
  private raise(w: BrowserWindow): void {
    w.moveTop();
    if (process.platform === 'darwin' && !this.pinned) w.setAlwaysOnTop(true, 'floating');
  }
  private applyOnTop(on: boolean): void {
    this.pinned = on;
    const w = this.window;
    if (w) { if (!on && process.platform === 'darwin') w.setAlwaysOnTop(true, 'floating'); else w.setAlwaysOnTop(on, 'screen-saver'); }
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

  private ui() { return { picture: this.prefs.picture, bars: this.prefs.bars, menu: this.menuOpen, shade: this.prefs.shade, pinned: this.pinned, opacity: this.opacity, through: this.through }; }
  private push(): void {
    this.send('player:ui', this.ui());
    if (this.now) this.send('player:media', this.now);
    if (this.note) this.send('player:note', this.note);
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
    // The Mac (2026-10-28): the bottom right is where Aang lives and his bubble opens, so it covered the player. It
    // starts at the top right there; on the PC Aang sits on the taskbar, clear of it.
    if (process.platform === 'darwin') return { x: area.x + area.width - FULL_W - 24, y: area.y + 24 };
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
    saveJson(this.o.prefsFile, this.prefs);   // failed: kept for this run
  }

  dispose(): void { this.close(); this.menu.dispose(); players.delete(this); }
}

// ------------------------------------------------------------------------------------------------ its own menu

/**
 * What the menu shows: the picture now, the bars on or off, the album cover (a data: picture) for its thumbnail, and
 * Spotify's devices to move the music to (null while asking; an error line when Spotify cannot be reached).
 */
export interface PlayerMenuState { picture: string; bars: boolean; cover: string | null; devices?: PlayerDevice[] | null; devicesError?: string | null }

/**
 * The player's own menu (2026-10-22, his report: "shouldn't this just be hidden behind a click somewhere?"). The ··· key
 * opens it: "Picture" (Album cover and his four named scenes, each with a tiny moving thumbnail and a tick on the one
 * showing) and "Bars on the screen" (a tick). Aang's menu look (aangmenu.css: Samara's tab menu, 16 px words, 44 px rows).
 *
 * The player is only 208 px tall, so the menu is its own small see-through window, sized to the menu, under the ··· key
 * (above the player when the screen's bottom is near, beside it when neither fits). Like every menu here it takes the
 * keyboard while it is up (Esc closes it, the arrows move) and goes when he clicks away (it loses focus) or picks one.
 * The player itself still never takes the keyboard.
 */
export class PlayerMenu {
  private win: BrowserWindow | null = null;
  private pending = false;
  private shownAt = 0;
  private closedAt = 0;
  private key: Electron.Rectangle | null = null;
  private player: Electron.Rectangle | null = null;
  private readonly o: MiniPlayerOptions;
  private readonly state: () => PlayerMenuState;
  private readonly choose: (kind: string, v: unknown) => void;
  private readonly openChanged: (open: boolean) => void;
  private readonly opening: () => void;
  constructor(o: MiniPlayerOptions, state: () => PlayerMenuState, choose: (kind: string, v: unknown) => void, openChanged: (open: boolean) => void, opening: () => void = () => {}) {
    this.o = o; this.state = state; this.choose = choose; this.openChanged = openChanged; this.opening = opening;
  }
  /** What it shows changed (the device list came): drawn again where it is. */
  refresh(): void {
    const w = this.window;
    if (!w || !(this.visible || this.pending)) return;
    const send = () => { if (!w.isDestroyed()) w.webContents.send('player:menushow', this.state()); };
    if (w.webContents.isLoading()) w.webContents.once('did-finish-load', send); else send();
  }

  get visible(): boolean { return !!this.win && !this.win.isDestroyed() && this.win.isVisible(); }
  get window(): BrowserWindow | null { return this.win && !this.win.isDestroyed() ? this.win : null; }
  owns(sender: Electron.WebContents): boolean { const w = this.window; return !!w && w.webContents === sender; }

  private ensure(): BrowserWindow {
    const had = this.window;
    if (had) return had;
    const w = new BrowserWindow({
      width: 320, height: 360, frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false,
      resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
      skipTaskbar: true, alwaysOnTop: true, show: false, title: 'Music',
      webPreferences: { ...SAFE_WEB_PREFERENCES, preload: this.o.preloadPath },
    });
    if (this.o.iconPath) { try { w.setIcon(this.o.iconPath); } catch { /* the default icon */ } }
    w.setAlwaysOnTop(true, 'screen-saver');
    lockDown(w.webContents);
    denyPermissions(w.webContents.session);
    w.on('blur', () => { if (Date.now() - this.shownAt > 120) this.close(); });
    w.on('closed', () => { if (this.win === w) this.win = null; });
    void w.loadURL(`${this.o.origin}/playermenu.html`);
    this.win = w;
    return w;
  }

  /** The ··· key (screen DIP) and the player's box: open under the key, or close it if it is up. */
  toggle(key: Electron.Rectangle, player: Electron.Rectangle): void {
    // A click on ··· while the menu is up first takes its focus away (it closes on that); that click must not reopen it.
    if (this.visible || this.pending || Date.now() - this.closedAt < 300) { this.close(); return; }
    this.key = key; this.player = player;
    this.opening();
    const w = this.ensure();
    this.pending = true;
    const send = () => { if (!w.isDestroyed()) w.webContents.send('player:menushow', this.state()); };
    if (w.webContents.isLoading()) w.webContents.once('did-finish-load', send); else send();
  }

  /** The page measured its menu (shadow room included): placed and shown. */
  sized(r: unknown): void {
    const w = this.window, k = this.key, pl = this.player;
    if (!w || !k || !pl || !r || typeof r !== 'object' || !this.pending && !w.isVisible()) return;
    const v = r as Record<string, unknown>;
    const mw = Math.min(480, Math.max(120, Math.round(Number(v.w) || 0))), mh = Math.min(640, Math.max(60, Math.round(Number(v.h) || 0)));
    const a = this.o.clampToScreen === false ? { x: -100000, y: -100000, width: 200000, height: 200000 } : screen.getDisplayNearestPoint({ x: k.x, y: k.y }).workArea;
    const GAP = 2;
    // its right edge under the key's right edge; below the player, else above it, else beside it
    const x = Math.max(a.x, Math.min(a.x + a.width - mw, k.x + k.width - mw + 6));
    let at = { x, y: pl.y + pl.height + GAP };
    if (at.y + mh > a.y + a.height) {
      at = { x, y: pl.y - GAP - mh };
      if (at.y < a.y) {
        const left = pl.x - GAP - mw, right = pl.x + pl.width + GAP;
        const sx = left >= a.x ? left : right + mw <= a.x + a.width ? right : x;
        at = { x: sx, y: Math.max(a.y, Math.min(a.y + a.height - mh, k.y)) };
      }
    }
    w.setBounds({ x: Math.round(at.x), y: Math.round(at.y), width: mw, height: mh });
    if (this.pending) {
      this.pending = false;
      this.shownAt = Date.now();
      w.show();
      w.focus();
      this.openChanged(true);
    }
  }

  /** His choice ({ kind: 'close' } for Esc). Checked again by the player. The menu goes either way. */
  picked(m: unknown): void {
    if (!m || typeof m !== 'object') return;
    const { kind, value } = m as { kind?: unknown; value?: unknown };
    this.close();
    if (kind === 'picture' || kind === 'bars') this.choose(kind, value);
    // Spotify Connect: move the music to that device
    else if (kind === 'device' && typeof value === 'string' && DEVICE_ID.test(value)) this.o.onTransfer?.(value);
  }

  close(): void {
    const was = this.visible || this.pending;
    this.pending = false;
    const w = this.window;
    if (w?.isVisible()) { w.hide(); this.closedAt = Date.now(); }
    if (w && was) w.webContents.send('player:menushow', null);
    if (was) this.openChanged(false);
  }

  dispose(): void { this.close(); const w = this.window; if (w) w.destroy(); this.win = null; }
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
  ipcMain.on('player:menu', (e, r) => find(e)?.hearMenu(r));
  // the menu window's own doors: only a player's own menu window may use them
  const menuOf = (e: Electron.IpcMainEvent) => {
    if (e.senderFrame && e.senderFrame.parent !== null) return null;
    for (const p of players) if (p.menu.owns(e.sender)) return p.menu;
    return null;
  };
  ipcMain.on('player:menusize', (e, r) => menuOf(e)?.sized(r));
  ipcMain.on('player:menupick', (e, m) => menuOf(e)?.picked(m));
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
    onWatch: (visible) => o.send({ t: 'player.watch', visible }),
    onDevices: () => o.send({ t: 'media.devices.get' }),
    onTransfer: (id) => o.send({ t: 'media.transfer', id }),
  });
  const fromBrain = (m: Record<string, unknown>): boolean => {
    if (m.t === 'media.now') { player.media(m); return false; }      // others may want it too (the bubble's whisper)
    if (m.t === 'player.open') { player.open(); return true; }
    if (m.t === 'media.note') { player.setNote(m.text); return true; }
    if (m.t === 'media.devices') { player.setDevices(m); return true; }
    return false;
  };
  return { player, fromBrain };
}

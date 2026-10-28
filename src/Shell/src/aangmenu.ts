// Sheet 56, look A (2026-10-21): Aang's right-click menu, in Samara's wood, drawn here instead of the pet's old gold
// WinForms menu when the new front end is on.
//
// The pet sends the right-click (where, and what is ticked); this window opens at the mouse, and his pick goes back to
// the pet, which runs the same handler its old menu item ran. The window covers the screen's work area so the menu and
// its side submenu can sit anywhere, but it is cut to the menus' own shape: everywhere else his clicks go straight
// through. It takes the keyboard while it is up (Esc closes it) and closes when he clicks away (it loses focus).
import { BrowserWindow, screen } from 'electron';
import { SAFE_WEB_PREFERENCES, denyPermissions, lockDown } from './safety.ts';
import { chips, validAccelerator, words, type HotkeyKeeper } from './hotkeys.ts';

/** What the menu shows ticked. The pet's, plus the brain's hush end and the Shell's count of running Claude jobs. */
export type MenuState = Record<string, unknown>;

/**
 * 2026-10-21: the part of the screen the menu must never cover: Aang's sprite and Claude's mark over his head, in DIP.
 * The pet sends the sprite in real screen pixels (the same as the mouse), so both are turned into DIP the same way. The
 * mark is drawn above his head when he stands (up to about 40 px with its bob) and beside his head on the inner side
 * when he is tucked at an edge, so a tucked Aang gets that room on every side.
 */
export function avoidRect(sprite: { x: number; y: number; width: number; height: number } | null | undefined, tucked = false,
  toDip: (r: Electron.Rectangle) => Electron.Rectangle = (r) => (process.platform === 'win32' ? screen.screenToDipRect(null, r) : r)): Electron.Rectangle | null {
  if (!sprite || !(sprite.width > 0) || !(sprite.height > 0)) return null;
  const r = toDip({ x: Math.round(sprite.x), y: Math.round(sprite.y), width: Math.round(sprite.width), height: Math.round(sprite.height) });
  const top = 48, side = tucked ? 48 : 10, under = tucked ? 48 : 6;
  return { x: r.x - side, y: r.y - top, width: r.width + 2 * side, height: r.height + top + under };
}

/** The ids a pick may be; anything else is dropped. */
export const MENU_IDS = new Set(['gopc', 'back', 'jobs', 'claudejob', 'hunt', 'player', 'hush.15', 'hush.60', 'hush.240', 'hush.tomorrow', 'hush.off', 'mute',
  'quiet.auto', 'quiet.always', 'quiet.never', 'dock.bottom', 'dock.left', 'dock.right', 'dock.top', 'comeback', 'hide',
  'model.auto', 'model.quick', 'model.smart', 'model.deep', 'saving', 'quit', 'notes.notice']);

export class AangMenu {
  private win: BrowserWindow | null = null;
  private pending = false;
  private shownAt = 0;
  // Sheet 61 v2 (2026-10-22): `keys`, his hotkeys: listed in the menu's Hotkeys submenu and changed from there.
  private readonly o: { origin: string; preloadPath: string; iconPath?: string; pick: (id: string) => void; keys?: HotkeyKeeper };
  constructor(o: { origin: string; preloadPath: string; iconPath?: string; pick: (id: string) => void; keys?: HotkeyKeeper }) { this.o = o; }

  private window(): BrowserWindow {
    if (this.win && !this.win.isDestroyed()) return this.win;
    const w = new BrowserWindow({
      width: 400, height: 400, frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false,
      resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
      skipTaskbar: true, alwaysOnTop: true, show: false, title: 'Aang',
      webPreferences: { ...SAFE_WEB_PREFERENCES, preload: this.o.preloadPath },
    });
    if (this.o.iconPath) {
      try { w.setIcon(this.o.iconPath); } catch { /* the default icon */ }
      try { w.setAppDetails({ appId: 'Aang', appIconPath: this.o.iconPath, appIconIndex: 0, relaunchDisplayName: 'Aang' }); } catch { /* not Windows */ }
    }
    w.setAlwaysOnTop(true, 'screen-saver');
    lockDown(w.webContents);
    denyPermissions(w.webContents.session);
    // Clicked away: a menu goes when it loses the keyboard, as every Windows menu does.
    w.on('blur', () => { if (Date.now() - this.shownAt > 120) this.close(); });
    void w.loadURL(`${this.o.origin}/aangmenu.html`);
    this.win = w;
    return w;
  }

  /** Made at startup, hidden, so the first right-click opens it at once. */
  warm(): void { this.window(); }

  get visible(): boolean { return !!this.win && !this.win.isDestroyed() && this.win.isVisible(); }

  /**
   * Right-clicked on Aang. `phys` is the mouse in real screen pixels, from the pet. Shown once the page says its shape.
   * `avoid` (2026-10-21, DIP, from avoidRect) is Aang and his mark: the page places the menu beside it, never over it
   * (at the bottom-right corner it used to open on top of him).
   */
  /** Opened by the Mac's test door: shown without taking the keyboard (and so never closed by a blur it never had). */
  private quiet = false;
  open(phys: { x: number; y: number }, state: MenuState, avoid: Electron.Rectangle | null = null, quiet = false): void {
    const w = this.window();
    this.quiet = quiet;
    // screenToDipPoint exists on Windows only (Electron); the Mac's points are already DIPs (2026-10-28: the menu never opened).
    const at = process.platform === 'win32' ? screen.screenToDipPoint(phys) : phys;
    const b = screen.getDisplayNearestPoint(at).workArea;
    if (w.isVisible()) w.hide();
    w.setBounds({ x: b.x, y: b.y, width: b.width, height: b.height });
    this.pending = true;
    const keep = avoid ? { x: avoid.x - b.x, y: avoid.y - b.y, width: avoid.width, height: avoid.height } : null;
    const all = this.o.keys ? { ...state, hotkeys: this.o.keys.list() } : state;
    const send = () => w.webContents.send('menu', { kind: 'show', x: at.x - b.x, y: at.y - b.y, state: all, avoid: keep });
    if (w.webContents.isLoading()) w.webContents.once('did-finish-load', send); else send();
  }

  /** The page laid the menus out: only they take the mouse. The first shape after a right-click shows the window. */
  shape(sender: Electron.WebContents, rects: unknown): void {
    const w = this.win;
    if (!w || w.isDestroyed() || w.webContents !== sender || !Array.isArray(rects)) return;
    const [ww, wh] = w.getContentSize();
    const ok = rects.slice(0, 4).map((r) => {
      const v = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>;
      const x = Math.max(0, Math.round(Number(v.x) || 0)), y = Math.max(0, Math.round(Number(v.y) || 0));
      return { x, y, width: Math.max(1, Math.min(ww - x, Math.round(Number(v.width) || 0))), height: Math.max(1, Math.min(wh - y, Math.round(Number(v.height) || 0))) };
    });
    if (!ok.length) return;
    w.setShape(ok);
    if (this.pending) {
      this.pending = false;
      this.shownAt = Date.now();
      if (this.quiet) { w.showInactive(); return; }
      w.show();
      w.focus();
    }
  }

  /** His pick (or '' for Esc / a click away). Only this window may say it, and only a known id goes on. */
  picked(sender: Electron.WebContents, id: unknown): void {
    const w = this.win;
    if (!w || w.isDestroyed() || w.webContents !== sender) return;
    this.close();
    if (typeof id === 'string' && MENU_IDS.has(id)) this.o.pick(id);
  }

  /**
   * Sheet 61 v2 (2026-10-22): the Hotkeys submenu. `listen` lets go of all our keys while a row waits for new ones (so
   * what he presses reaches the menu instead of firing); `change` and `reset` are checked and held in hotkeys.ts. The
   * page hears back with the whole list and how it went: kept, taken by another program, another of ours, or not allowed.
   */
  hotkey(sender: Electron.WebContents, m: unknown): void {
    const w = this.win, keys = this.o.keys;
    if (!keys || !w || w.isDestroyed() || w.webContents !== sender || !m || typeof m !== 'object') return;
    const a = m as { kind?: unknown; id?: unknown; acc?: unknown; on?: unknown };
    if (a.kind === 'listen') { keys.pause(a.on === true); return; }
    let result: unknown;
    if (a.kind === 'reset') result = { ok: true, missed: keys.reset() };
    else if (a.kind === 'change') result = keys.change(a.id, a.acc);
    else return;
    const v = a.kind === 'change' ? validAccelerator(a.acc) : null;
    const tried = v?.ok ? { chips: chips(v.acc), words: words(v.acc) } : null;
    w.webContents.send('menu', { kind: 'hotkeys', list: keys.list(), id: typeof a.id === 'string' ? a.id.slice(0, 12) : '', tried, result });
  }

  close(): void {
    const w = this.win;
    this.pending = false;
    this.o.keys?.pause(false);   // never left without his keys because the menu went mid-listen
    if (!w || w.isDestroyed()) return;
    if (w.isVisible()) w.hide();
    w.webContents.send('menu', { kind: 'hide' });
  }

  owns(sender: Electron.WebContents): boolean { return !!this.win && !this.win.isDestroyed() && this.win.webContents === sender; }
}

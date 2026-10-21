// Sheet 56, look A (2026-10-21): Aang's right-click menu, in Samara's wood, drawn here instead of the pet's old gold
// WinForms menu when the new front end is on.
//
// The pet sends the right-click (where, and what is ticked); this window opens at the mouse, and his pick goes back to
// the pet, which runs the same handler its old menu item ran. The window covers the screen's work area so the menu and
// its side submenu can sit anywhere, but it is cut to the menus' own shape: everywhere else his clicks go straight
// through. It takes the keyboard while it is up (Esc closes it) and closes when he clicks away (it loses focus).
import { BrowserWindow, screen } from 'electron';
import { SAFE_WEB_PREFERENCES, denyPermissions, lockDown } from './safety.ts';

/** What the menu shows ticked. The pet's, plus the brain's hush end and the Shell's count of running Claude jobs. */
export type MenuState = Record<string, unknown>;

/** The ids a pick may be; anything else is dropped. */
export const MENU_IDS = new Set(['back', 'jobs', 'hunt', 'hush.15', 'hush.60', 'hush.240', 'hush.tomorrow', 'hush.off', 'mute',
  'quiet.auto', 'quiet.always', 'quiet.never', 'dock.bottom', 'dock.left', 'dock.right', 'dock.top', 'comeback', 'hide',
  'model.auto', 'model.quick', 'model.smart', 'model.deep', 'saving', 'quit']);

export class AangMenu {
  private win: BrowserWindow | null = null;
  private pending = false;
  private shownAt = 0;
  private readonly o: { origin: string; preloadPath: string; iconPath?: string; pick: (id: string) => void };
  constructor(o: { origin: string; preloadPath: string; iconPath?: string; pick: (id: string) => void }) { this.o = o; }

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

  /** Right-clicked on Aang. `phys` is the mouse in real screen pixels, from the pet. Shown once the page says its shape. */
  open(phys: { x: number; y: number }, state: MenuState): void {
    const w = this.window();
    const at = screen.screenToDipPoint(phys);
    const b = screen.getDisplayNearestPoint(at).workArea;
    if (w.isVisible()) w.hide();
    w.setBounds({ x: b.x, y: b.y, width: b.width, height: b.height });
    this.pending = true;
    const send = () => w.webContents.send('menu', { kind: 'show', x: at.x - b.x, y: at.y - b.y, state });
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

  close(): void {
    const w = this.win;
    this.pending = false;
    if (!w || w.isDestroyed()) return;
    if (w.isVisible()) w.hide();
    w.webContents.send('menu', { kind: 'hide' });
  }

  owns(sender: Electron.WebContents): boolean { return !!this.win && !this.win.isDestroyed() && this.win.webContents === sender; }
}

// Sheet 17's wheel: a see-through window around Aang that fans out six discs while he holds the mouse on him.
//
// The pet keeps the mouse the whole time (it was pressed on Aang), so this window never takes the mouse or the
// keyboard. Which disc he is pointing at comes from polling the cursor; which one he let go on comes from the pet.
import { BrowserWindow, screen } from 'electron';
import { SAFE_WEB_PREFERENCES, denyPermissions, lockDown } from './safety.ts';


export class Wheel {
  private win: BrowserWindow | null = null;
  private poll: NodeJS.Timeout | null = null;
  private origin = { x: 0, y: 0 };
  private readonly o: { origin: string; preloadPath: string; pick: (slot: string) => void };
  constructor(o: { origin: string; preloadPath: string; pick: (slot: string) => void }) { this.o = o; }

  private window(): BrowserWindow {
    if (this.win && !this.win.isDestroyed()) return this.win;
    const w = new BrowserWindow({
      width: 400, height: 400, frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false,
      resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
      skipTaskbar: true, alwaysOnTop: true, focusable: false, show: false,
      webPreferences: { ...SAFE_WEB_PREFERENCES, preload: this.o.preloadPath },
    });
    w.setAlwaysOnTop(true, 'screen-saver');
    w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
    w.setIgnoreMouseEvents(true);
    lockDown(w.webContents);
    denyPermissions(w.webContents.session);
    void w.loadURL(`${this.o.origin}/wheel.html`);
    this.win = w;
    return w;
  }

  /** Made at startup, hidden, so the first hold opens it at once. */
  warm(): void { this.window(); }

  /** Held on Aang. `phys` is where the mouse is, in real screen pixels, from the pet. */
  open(phys: { x: number; y: number }): void {
    const w = this.window();
    const at = process.platform === 'win32' ? screen.screenToDipPoint(phys) : phys;   // Windows-only call; the Mac's are DIPs
    // The whole screen, taskbar included: docked under the taskbar or in a corner, a smaller window cut discs off
    // (his test, 2026-10-12). It is see-through and only up while he holds the mouse on Aang.
    const b = screen.getDisplayNearestPoint(at).bounds;
    this.origin = { x: b.x, y: b.y };
    w.setBounds({ x: b.x, y: b.y, width: b.width, height: b.height });
    const show = () => w.webContents.send('wheel', { kind: 'show', cx: at.x - b.x, cy: at.y - b.y, w: b.width, h: b.height });
    if (w.webContents.isLoading()) w.webContents.once('did-finish-load', show); else show();
    w.showInactive();
    if (this.poll) clearInterval(this.poll);
    this.poll = setInterval(() => {
      if (w.isDestroyed()) return;
      const p = screen.getCursorScreenPoint();
      w.webContents.send('wheel', { kind: 'hover', x: p.x - this.origin.x, y: p.y - this.origin.y });
    }, 30);
  }

  /** Let go: the page says which disc is under the mouse, if any. */
  release(phys: { x: number; y: number }): void {
    const w = this.win;
    if (this.poll) { clearInterval(this.poll); this.poll = null; }
    if (!w || w.isDestroyed() || !w.isVisible()) return;
    const p = process.platform === 'win32' ? screen.screenToDipPoint(phys) : phys;
    w.webContents.send('wheel', { kind: 'release', x: p.x - this.origin.x, y: p.y - this.origin.y });
    // Whatever happens, it goes; a pick that never comes back still leaves nothing on his screen.
    setTimeout(() => { if (!w.isDestroyed()) w.hide(); }, 400);
  }

  picked(sender: Electron.WebContents, slot: string): void {
    const w = this.win;
    if (!w || w.isDestroyed() || w.webContents !== sender) return;
    w.hide();
    if (slot) this.o.pick(slot);
  }
  owns(sender: Electron.WebContents): boolean { return !!this.win && !this.win.isDestroyed() && this.win.webContents === sender; }
}

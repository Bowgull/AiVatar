// Step 6.17, pass 1: Snipit.
//
// Ctrl+Shift+Plus (his key) freezes the screen under the mouse, he drags a box, and the snip shrinks to a
// corner card with Send and Bin it. It NEVER sends by itself. Send hands it to the typing box as a chip,
// so it lands in the chat like everything else he gives Aang (his rule, 2026-10-04): he says what he
// wants, and the brain gets the picture's path with his words.
//
// Saved as a PNG in his own Pictures folder ("Aang snips"), not in Aang's data folder: it is his picture,
// he should be able to find it, and Aang reading it goes through the same "read a file" permission as any
// other file. Bin it moves it to the Recycle Bin rather than deleting it outright.
import { BrowserWindow, desktopCapturer, globalShortcut, screen, shell, type NativeImage } from 'electron';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { SAFE_WEB_PREFERENCES, denyPermissions, lockDown } from './safety.ts';

export interface SnipOptions {
  origin: string;
  preloadPath: string;
  /** Where snips are saved: Pictures\Aang snips. */
  dir: string;
  /** He pressed Send: the snip goes to the typing box. */
  onSend: (file: string) => void;
}

export class Snipper {
  private overlay: BrowserWindow | null = null;
  private card: BrowserWindow | null = null;
  private full: NativeImage | null = null;
  private file: string | null = null;
  private readonly o: SnipOptions;
  constructor(o: SnipOptions) { this.o = o; }

  isOverlay(sender: Electron.WebContents): boolean { return Boolean(this.overlay && !this.overlay.isDestroyed() && sender === this.overlay.webContents); }
  isCard(sender: Electron.WebContents): boolean { return Boolean(this.card && !this.card.isDestroyed() && sender === this.card.webContents); }

  private win(opts: Electron.BrowserWindowConstructorOptions): BrowserWindow {
    const w = new BrowserWindow({ frame: false, show: false, skipTaskbar: true, resizable: false, movable: false,
      minimizable: false, maximizable: false, fullscreenable: false, ...opts,
      webPreferences: { ...SAFE_WEB_PREFERENCES, preload: this.o.preloadPath } });
    lockDown(w.webContents);
    denyPermissions(w.webContents.session);
    return w;
  }

  /** Freeze the screen the mouse is on and let him drag a box over it. */
  async start(): Promise<void> {
    if (this.overlay && !this.overlay.isDestroyed()) return;
    this.closeCard();
    const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const sf = d.scaleFactor || 1;
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: Math.round(d.bounds.width * sf), height: Math.round(d.bounds.height * sf) } });
      const src = sources.find((s) => s.display_id === String(d.id)) ?? sources[0];
      if (!src || src.thumbnail.isEmpty()) { console.error('shell: snip: nothing came back from the screen capture'); return; }
      this.full = src.thumbnail;
    } catch (e) { console.error('shell: snip: the screen could not be captured: ' + (e as Error).message); return; }
    const w = this.win({ x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height, alwaysOnTop: true, backgroundColor: '#000000' });
    // Over everything, his game included, for the second it takes to drag a box.
    w.setAlwaysOnTop(true, 'screen-saver');
    w.webContents.once('did-finish-load', () => {
      if (w.isDestroyed() || !this.full) return;
      w.webContents.send('snip:shot', this.full.toDataURL());
      w.show(); w.focus();
    });
    w.on('closed', () => { if (this.overlay === w) this.overlay = null; this.releaseEsc(); });
    this.overlay = w;
    // Esc is TAKEN while the overlay is up. Windows does not hand the keyboard to a window that did not
    // receive the key press, so over his game the overlay never got it, and a plain Esc went to WoW
    // instead (found on his desktop, 2026-10-11). Taken for this second only, given back on close.
    this.escHeld = globalShortcut.register('Escape', () => this.done(null));
    void w.loadURL(`${this.o.origin}/snip.html`);
  }

  private escHeld = false;
  private releaseEsc(): void { if (this.escHeld) { try { globalShortcut.unregister('Escape'); } catch { /* gone */ } this.escHeld = false; } }

  /** The box he drew, in the overlay's own pixels, or null for cancelled. */
  done(r: { x: number; y: number; w: number; h: number; vw: number; vh: number } | null): void {
    const full = this.full;
    this.full = null;
    this.releaseEsc();
    if (this.overlay && !this.overlay.isDestroyed()) this.overlay.close();
    if (!r || !full) return;
    const size = full.getSize();
    const sx = size.width / Math.max(1, r.vw), sy = size.height / Math.max(1, r.vh);
    const crop = {
      x: Math.max(0, Math.round(r.x * sx)), y: Math.max(0, Math.round(r.y * sy)),
      width: Math.max(1, Math.min(size.width, Math.round(r.w * sx))), height: Math.max(1, Math.min(size.height, Math.round(r.h * sy))),
    };
    const img = full.crop(crop);
    try {
      mkdirSync(this.o.dir, { recursive: true });
      const stamp = new Date().toISOString().slice(0, 19).replace('T', ' ').replace(/:/g, '.');
      this.file = path.join(this.o.dir, `Snip ${stamp}.png`);
      writeFileSync(this.file, img.toPNG());
    } catch (e) { console.error('shell: snip: could not save it: ' + (e as Error).message); this.file = null; return; }
    this.showCard(img);
  }

  /** The corner card, bottom-right of the screen he snipped. Shown without taking focus from his game. */
  private showCard(img: NativeImage): void {
    this.closeCard();
    const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    const W = 300, H = 270;
    const w = this.win({ x: d.x + d.width - W - 16, y: d.y + d.height - H - 16, width: W, height: H,
      transparent: true, backgroundColor: '#00000000', hasShadow: false, alwaysOnTop: true, focusable: false });
    w.setAlwaysOnTop(true, 'pop-up-menu');
    w.webContents.once('did-finish-load', () => {
      if (w.isDestroyed()) return;
      w.webContents.send('snip:card', { url: img.resize({ width: Math.min(560, img.getSize().width) }).toDataURL() });
      w.showInactive();
    });
    w.on('closed', () => { if (this.card === w) this.card = null; });
    this.card = w;
    void w.loadURL(`${this.o.origin}/snipcard.html`);
  }

  private closeCard(): void { if (this.card && !this.card.isDestroyed()) this.card.close(); this.card = null; }

  send(): void {
    const f = this.file;
    this.file = null;
    this.closeCard();
    if (f) this.o.onSend(f);
  }

  bin(): void {
    const f = this.file;
    this.file = null;
    this.closeCard();
    if (f) void shell.trashItem(f).catch(() => { /* already gone */ });
  }

  close(): void {
    if (this.overlay && !this.overlay.isDestroyed()) this.overlay.close();
    this.closeCard();
  }
}

// Step 6.12: the bubble, as a window of its own.
//
// It stands beside the C# pet and has to behave as though it were part of him. Three things decide how
// this window is made, and each one is a thing he would notice immediately if it were wrong:
//
//  1. IT MUST NEVER TAKE FOCUS. He is usually in a game. A window that activates when Aang speaks
//     alt-tabs him out of a raid, and no amount of good content makes up for that. So: showInactive,
//     focusable false until something in it actually needs typing, and never `show()`.
//
//  2. IT MUST NOT BE A BOX. The old bubble is painted into a layered window with a carved frame and
//     nothing square around it. Transparent and frameless, so only the drawn shape shows.
//
//  3. IT MUST STAY WITH HIM. Always on top, but not above a full-screen game by accident, and moved by
//     `placeWindows` in main.ts rather than by anything in here. This file owns the window; where it
//     goes is 6.10b's arithmetic.
//
// The old GDI bubble keeps working the whole time. Nothing is retired until he has used this one for a
// few days and said it is better (the plan's own rule), which is why `AANG_NEW_BUBBLE` exists.
import { BrowserWindow } from 'electron';
import path from 'node:path';
import { SAFE_WEB_PREFERENCES, denyPermissions, lockDown } from './safety.ts';

export interface BubbleOptions {
  /** Where the page is served from, e.g. http://127.0.0.1:51234 */
  origin: string;
  preloadPath: string;
}

/**
 * Is the new bubble switched on?
 *
 * Off by default, deliberately. Two bubbles saying the same thing at once is worse than one old one,
 * and this cannot be the thing he discovers mid-raid. He turns it on when he wants to try it.
 */
export const wantsNewBubble = (env: NodeJS.ProcessEnv = process.env): boolean =>
  env.AANG_NEW_BUBBLE === '1';

export class Bubble {
  private win: BrowserWindow | null = null;
  private readonly o: BubbleOptions;

  constructor(o: BubbleOptions) { this.o = o; }

  /** The window, made on first use. Null only if it could not be made at all. */
  window(): BrowserWindow | null {
    if (this.win && !this.win.isDestroyed()) return this.win;
    try {
      const w = new BrowserWindow({
        width: 560, height: 220,
        // Transparent needs frameless, and both have to be set at construction: Electron cannot change
        // either afterwards, so getting this wrong means a grey box round everything he reads.
        frame: false,
        transparent: true,
        backgroundColor: '#00000000',
        hasShadow: false,
        resizable: false,
        movable: false,                  // it follows the pet; dragging it would only desynchronise them
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        skipTaskbar: true,               // it is part of Aang, not a program in its own right
        alwaysOnTop: true,
        acceptFirstMouse: true,          // a click lands on the button, not merely on the window
        focusable: false,                // see (1): raised to true only when something needs typing
        show: false,
        webPreferences: { ...SAFE_WEB_PREFERENCES, preload: this.o.preloadPath },
      });
      // Above ordinary windows, below a screen saver or a system dialog. 'normal' would sit under the
      // game; 'screen-saver' would sit over Windows' own alerts, which is not Aang's place.
      w.setAlwaysOnTop(true, 'pop-up-menu');
      // Visible on every desktop, because he switches desktops and Aang is not a per-desktop thing.
      w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      lockDown(w.webContents);
      denyPermissions(w.webContents.session);
      // THE MOUSE PASSES STRAIGHT THROUGH, except over the drawn bubble.
      //
      // This window is transparent, frameless and always on top, and most of it is empty. Without this
      // it is an INVISIBLE PANE sitting over his desktop that silently swallows every click landing in
      // it - nothing to see, nothing to drag away, clicks simply stop working in a region of the
      // screen. That is exactly what happened on the first real run (2026-10-04), and it is the one
      // bug a browser tab cannot ever show, because a tab has nothing underneath it.
      //
      // `forward: true` keeps mouse-move events coming to the page so it can still tell when the
      // pointer is over the bubble; the page says so, and `setClickable` opens it up just for that.
      w.setIgnoreMouseEvents(true, { forward: true });
      void w.loadURL(`${this.o.origin}/bubble.html`);
      // Whatever arrived while the page was loading, now that it can hear it.
      w.webContents.on('did-finish-load', () => {
        const held = this.waiting.splice(0);
        for (const [channel, payload] of held) w.webContents.send(channel, payload);
      });
      w.on('closed', () => { this.win = null; this.waiting.length = 0; });
      this.win = w;
      return w;
    } catch (e) {
      // A bubble that cannot be made must not take the Shell down with it: the pop-out and the old
      // bubble are both still working.
      console.error('shell: the bubble window could not be made: ' + (e as Error).message);
      return null;
    }
  }

  /** Show it without stealing focus. The only way this window is ever shown. */
  show(): void {
    const w = this.window();
    if (!w || w.isDestroyed()) return;
    if (!w.isVisible()) w.showInactive();
  }

  hide(): void {
    if (this.win && !this.win.isDestroyed() && this.win.isVisible()) this.win.hide();
  }

  /**
   * Take the mouse, or let it through.
   *
   * Called by the page as the pointer crosses the drawn shape. Everything outside it stays
   * click-through, so the empty parts of this window never take a click meant for his desktop.
   */
  setClickable(on: boolean): void {
    if (!this.win || this.win.isDestroyed()) return;
    if (on === this.clickable) return;              // setIgnoreMouseEvents is not free; only on a change
    this.clickable = on;
    // `forward: true` ALWAYS, not only while ignoring.
    //
    // The first version passed `forward: !on`, which is a trap: the moment the pointer touched the
    // bubble the window stopped forwarding mouse moves, so the page could never see the pointer LEAVE,
    // so it never went back to click-through. From then on the window kept every click landing in its
    // rectangle, with nothing visible to explain why. Passing it always costs nothing and the window
    // can always tell when he has moved off.
    this.win.setIgnoreMouseEvents(!on, { forward: true });
  }
  private clickable = false;

  /**
   * Let it take focus, for the one case that needs it: something in the bubble he has to type into.
   * Put back the moment it is done, because the default has to be "never steals focus".
   */
  setFocusable(on: boolean): void {
    if (this.win && !this.win.isDestroyed()) this.win.setFocusable(on);
  }

  /**
   * Pass a brain message to the page.
   *
   * The window is made here if it does not exist, and messages that arrive while the page is still
   * loading are held rather than dropped. Both were real bugs on the first run: the window was built
   * lazily and nothing ever asked for it, so no message reached it at all; and `loadURL` is
   * asynchronous, so even once it did, anything sent in the first moment landed before the page had
   * a listener and vanished silently.
   */
  send(channel: string, payload: unknown): void {
    const w = this.window();
    if (!w || w.isDestroyed()) return;
    if (w.webContents.isLoading()) {
      this.waiting.push([channel, payload]);
      return;
    }
    w.webContents.send(channel, payload);
  }
  private readonly waiting: Array<[string, unknown]> = [];

  close(): void {
    if (this.win && !this.win.isDestroyed()) this.win.close();
    this.win = null;
    this.clickable = false;
  }
}

/** Where the bubble page lives on disk, for the page server. */
export const pagesDir = (): string => path.resolve(import.meta.dirname, '..', 'pages');

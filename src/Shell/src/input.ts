// Step 6.12b: the typing box, as a window of its own.
//
// The whole point of this file is one rule, learned the hard way on 2026-10-04 with the old C# box:
//
//   WINDOWS ONLY LETS THE PROGRAM THAT RECEIVED A KEY PRESS TAKE THE KEYBOARD.
//
// So this window is opened and focused INSIDE the hotkey handler, synchronously, while the Shell still
// holds that permission. Not after a slide, not after a round trip to the brain, not on a timer. He
// presses Ctrl+Plus and starts typing in the same breath, and the first letter has to land here. The old
// box waited 600 ms for Aang to slide out, his first keys went to whatever he was in, and Windows then
// refused the box the keyboard: blank until he clicked into it.
//
// Unlike the bubble, this window MUST take focus and the mouse: it is the one thing he types into.
import { BrowserWindow } from 'electron';
import { SAFE_WEB_PREFERENCES, denyPermissions, lockDown } from './safety.ts';

export interface InputOptions {
  origin: string;
  preloadPath: string;
}

export class InputBox {
  private win: BrowserWindow | null = null;
  private readonly o: InputOptions;
  /** Messages for a page that is still loading, held rather than dropped (the bubble's first bug). */
  private readonly waiting: Array<[string, unknown]> = [];

  constructor(o: InputOptions) { this.o = o; }

  /** Made once, at startup, hidden: so the page is loaded and listening before the first key press. */
  window(): BrowserWindow | null {
    if (this.win && !this.win.isDestroyed()) return this.win;
    try {
      const w = new BrowserWindow({
        width: 268, height: 112,       // InputWindow.BaseW 256, plus the frame's margins
        frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false,
        resizable: false, minimizable: false, maximizable: false, fullscreenable: false,
        skipTaskbar: true, alwaysOnTop: true, show: false,
        focusable: true,                 // the one Aang window that must take the keyboard
        webPreferences: { ...SAFE_WEB_PREFERENCES, preload: this.o.preloadPath },
      });
      w.setAlwaysOnTop(true, 'pop-up-menu');
      w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      lockDown(w.webContents);
      denyPermissions(w.webContents.session);
      void w.loadURL(`${this.o.origin}/input.html`);
      w.webContents.on('did-finish-load', () => {
        for (const [ch, p] of this.waiting.splice(0)) w.webContents.send(ch, p);
      });
      // Clicking away closes it and keeps the draft, as the old box does. Not while it is being opened:
      // the very act of showing it can blur the window that was in front, and that is not him leaving.
      w.on('blur', () => { if (Date.now() - this.openedAt > 250) this.close(false); });
      w.on('closed', () => { this.win = null; });
      this.win = w;
      return w;
    } catch (e) {
      console.error('shell: the typing box could not be made: ' + (e as Error).message);
      return null;
    }
  }

  private openedAt = 0;
  get visible(): boolean { return Boolean(this.win && !this.win.isDestroyed() && this.win.isVisible()); }

  /**
   * Show it and take the keyboard. CALL ONLY FROM THE HOTKEY HANDLER, synchronously: see the top of the
   * file. `focus()` on both the window and its contents, because a focused window whose page has not
   * been told is a window with no caret in it.
   */
  open(at: { x: number; y: number } | null, state: Record<string, unknown>): void {
    const w = this.window();
    if (!w || w.isDestroyed()) return;
    if (at) w.setPosition(Math.round(at.x), Math.round(at.y));
    this.openedAt = Date.now();
    if (w.isMinimized()) w.restore();      // close() minimizes to give the keyboard back
    w.show();
    w.focus();
    w.webContents.focus();
    this.send('input:state', { ...state, opened: true });
  }

  /**
   * Hide it AND hand the keyboard back.
   *
   * Just hiding a focused window on Windows does not move the keyboard anywhere: the first sweep
   * (2026-10-04) showed the hidden box still reported as the window in front a minute later, so his
   * next keystrokes would have gone into an invisible window instead of back to his game. The old box
   * did `ForceForeground(previous)`. Electron cannot name the previous window, but minimizing makes
   * Windows activate the next one in line - the one he was in - and the window is hidden straight after,
   * so nothing visible happens.
   */
  close(giveBack = true): void {
    const w = this.win;
    if (!w || w.isDestroyed() || !w.isVisible()) return;
    w.hide();
    // The pet knows which window he was in and hands the keyboard straight back to it. Minimizing to
    // let Windows pick "the next window" was tried first and handed it to Discord instead of the window
    // he had come from (sweep, 2026-10-04) - in a game, his movement keys would go into Discord.
    // Not when he clicked away: he chose a window, and taking the keyboard from it would be rude.
    if (giveBack) this.onGiveBack?.();
  }
  /** Set by main.ts: ask the pet to give the keyboard back to the window he came from. */
  onGiveBack: (() => void) | null = null;

  send(channel: string, payload: unknown): void {
    const w = this.win;
    if (!w || w.isDestroyed()) return;
    if (w.webContents.isLoading()) { this.waiting.push([channel, payload]); return; }
    w.webContents.send(channel, payload);
  }

  /**
   * The page measured itself; the window follows - in HEIGHT only.
   *
   * The width is fixed at the old box's. The first version followed the measured width too, plus a few
   * pixels of margin, so every keystroke made the window wider, which made the page wider, which was
   * measured again: 268 px when opened, 372 px after one sentence.
   *
   * setBounds rather than setSize: see main.ts's bubble:size for why setSize cannot be trusted here.
   */
  resize(_width: number, height: number): void {
    const w = this.win;
    if (!w || w.isDestroyed()) return;
    const [x, y] = w.getPosition();
    const [width, oldH] = w.getSize();
    const nh = Math.max(60, Math.min(600, Math.round(height) + 4));
    if (nh === oldH) return;
    // It grows UPWARD as he types more lines, so its bottom stays put and it never walks down off the
    // screen or under the taskbar.
    w.setBounds({ x, y: y - (nh - oldH), width, height: nh });
  }

  destroy(): void {
    if (this.win && !this.win.isDestroyed()) this.win.destroy();
    this.win = null;
  }
}

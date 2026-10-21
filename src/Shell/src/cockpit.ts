// The one cockpit (his ask "for ages", decided 2026-10-21, docs/COCKPIT-BUILD.md, sheet 46, look: Lantern).
//
// Everything Aang shows lives in ONE bubble: the conversation (which is the scroll-back), the thing waiting on him,
// the jobs strip and, as its bottom edge, the typing area. So the typing box stops being a window of its own and
// becomes part of the bubble's page. This class is the typing box's stand-in: it has the InputBox's shape (open,
// close, send, visible, focused, docked) so main.ts keeps every rule it already has, and it drives the bubble's
// window instead of a second one.
//
// The two rules that made the box a separate window still hold, here, in one window:
//   1. Hands off when Aang speaks by himself: the bubble is not focusable and lets the mouse through (bubble.ts).
//   2. When HE opens it, it takes the keyboard in the same breath, synchronously inside the hotkey handler (input.ts's
//      whole lesson), and when it closes it hands the keyboard back to the window he came from (the pet's refocus).
//
// On by default (with the new bubble on) from 2026-10-21, after the size fix: the switch is read when the Shell starts,
// so a running Aang keeps whatever it started with and the cockpit arrives with his next start. AANG_COCKPIT=0 turns it
// off again (the old bubble and typing box come back).
import type { BrowserWindow } from 'electron';
import type { Bubble } from './bubble.ts';

export const wantsCockpit = (env: NodeJS.ProcessEnv = process.env): boolean => env.AANG_COCKPIT !== '0';

export class CockpitBox {
  private readonly bubble: Bubble;
  private open_ = false;
  private openedAt = 0;
  private wired = false;

  constructor(bubble: Bubble) { this.bubble = bubble; }

  /** The bubble's own window: the page that IS the cockpit. fromInput in main.ts checks senders against it. */
  window(): BrowserWindow | null {
    const w = this.bubble.window();
    if (w && !w.isDestroyed() && !this.wired) {
      this.wired = true;
      // A click away from the cockpit closes it and keeps the draft, as the old box did. Not while it is being opened:
      // showing it can blur the window that was in front, and that is not him leaving.
      w.on('blur', () => { if (this.open_ && Date.now() - this.openedAt > 250) this.close(false); });
    }
    return w;
  }

  get visible(): boolean { return this.open_; }
  get focused(): boolean { const w = this.bubble.window(); return Boolean(this.open_ && w && !w.isDestroyed() && w.isFocused()); }

  /**
   * Open the cockpit and take the keyboard. CALL ONLY FROM THE HOTKEY OR CLICK HANDLER, synchronously (input.ts).
   * `at` is ignored: the cockpit is the bubble, and the bubble is placed beside Aang by placeWindows.
   */
  open(_at: { x: number; y: number } | null, state: Record<string, unknown>, docked = false): void {
    const w = this.window();
    if (!w || w.isDestroyed()) return;
    this.docked = docked;
    this.open_ = true;
    this.openedAt = Date.now();
    this.bubble.setFocusable(true);
    this.bubble.setClickable(true);
    if (w.isMinimized()) w.restore();
    w.show();
    w.focus();
    w.webContents.focus();
    // The page opens its cockpit, then the typing area gets the same state the box always got.
    this.send('cockpit:open', { ...state, docked });
    this.send('input:state', { ...state, opened: true });
  }

  /**
   * Close the cockpit and hand the keyboard back (giveBack), or not (he clicked somewhere else: he chose that window).
   * The bubble window stays: the page decides whether a line of Aang's is still showing or it goes away.
   */
  close(giveBack = true): void {
    if (!this.open_) return;
    this.open_ = false;
    this.send('cockpit:close', null);
    this.bubble.setFocusable(false);
    if (this.docked) { this.docked = false; this.onUndock?.(); }
    if (giveBack) this.onGiveBack?.();
  }

  onGiveBack: (() => void) | null = null;
  /** Opened by a click on a message: what he types answers that message (sheet 16's binding, kept). */
  docked = false;
  onUndock: (() => void) | null = null;

  send(channel: string, payload: unknown): void { this.bubble.send(channel, payload); }

  /** The page sizes the cockpit itself, through the bubble's own size channel. */
  resize(_width: number, _height: number): void { /* nothing: one window, sized by bubble:size */ }

  destroy(): void { this.open_ = false; }
}

/** What both the old box and the cockpit can do, so main.ts holds either. */
export interface TypingSurface {
  window(): BrowserWindow | null;
  readonly visible: boolean;
  readonly focused: boolean;
  open(at: { x: number; y: number } | null, state: Record<string, unknown>, docked?: boolean): void;
  close(giveBack?: boolean): void;
  send(channel: string, payload: unknown): void;
  resize(width: number, height: number): void;
  destroy(): void;
  docked: boolean;
  onGiveBack: (() => void) | null;
  onUndock: (() => void) | null;
}

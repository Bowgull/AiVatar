// His rule (2026-10-21): "Aang should never surface ANYTHING if Claude Code is front and center."
//
// While the Claude app is the window in front (the pet reports the foreground process; CLAUDE_WINDOW), nothing of
// Aang's pops up on his desktop: no proactive bubble, no "now playing" line, no Claude card in the closed bubble, no
// chime and no mark flare. Claude is already showing him its own questions and news there.
//
// Held, never dropped. When he leaves the Claude window:
//   - the mark over Aang's head comes back for whatever is still true, quietly (no chime, no flare);
//   - the proactive lines that were held come out, oldest first, a few seconds apart.
// The waiting Claude questions are not held at all: the Shell gets every list as it is (its cockpit must stay right),
// marked `quiet` so none of them pops up on its own; they are pinned the next time he opens Aang.
//
// ONE place, in the brain, at the door every desktop message goes through (core.ts sendTo), so the pet (marks and
// chimes) and the Shell (bubbles and cards) cannot disagree about it.
import type { ToBody } from './protocol.ts';
import type { MarkMsg } from './claudemark.ts';

/** How many proactive lines are kept while he is in Claude; past that the oldest go (as the hush queue does). */
export const FRONT_HOLD_MAX = 8;

export class FrontGate {
  private held: ToBody[] = [];
  /** The latest steady mark while he was in Claude: what goes over Aang's head when he leaves (quietly). */
  private mark: MarkMsg | null = null;
  private wasIn = false;
  private readonly inClaude: () => boolean;

  /** `inClaude()` reads the foreground the pet last reported. */
  constructor(inClaude: () => boolean) { this.inClaude = inClaude; }

  /**
   * A message on its way to the desktop. Returns what to send now: the message, a quieter copy of it, or null when it
   * is held for later.
   */
  pass(msg: ToBody): ToBody | null {
    if (!this.inClaude()) { if (msg.t === 'claude.mark') this.mark = null; return msg; }
    switch (msg.t) {
      case 'bubble':
        // What he asked for (a reply) is never held: only Aang speaking up by himself.
        if (msg.proactive !== true) return msg;
        this.hold(msg);
        return null;
      case 'whisper':
        // A "now playing" line only matters while it is true: keep the latest one, not a queue of them.
        this.held = this.held.filter(m => m.t !== 'whisper');
        this.hold(msg);
        return null;
      case 'claude.mark': {
        // No chime, no flare, no new mark while Claude is in front; the steady state is remembered for later.
        const { flash: _f, sound: _s, ...steady } = msg;
        this.mark = steady;
        return null;
      }
      case 'claude.wait':
        return { ...msg, quiet: true };
      default:
        return msg;
    }
  }

  private hold(msg: ToBody): void {
    this.held.push(msg);
    while (this.held.length > FRONT_HOLD_MAX) this.held.shift();
  }

  /**
   * The foreground changed (a presence report). Returns what to send now that he has left Claude: the quiet mark
   * first, then the held lines in the order they came (the caller spaces them out). Empty while he stays in Claude.
   */
  moved(over: (msg: ToBody) => boolean = () => false): { mark: MarkMsg | null; lines: ToBody[] } {
    const nowIn = this.inClaude(), was = this.wasIn;
    this.wasIn = nowIn;
    if (nowIn || !was) return { mark: null, lines: [] };
    const mark = this.mark; this.mark = null;
    // 2026-10-22 (his "if I act on it in Claude it should disappear"): a held line about something a session waited on
    // him for, that he has since answered in Claude, is not news any more: it is dropped, never replayed.
    const lines = this.held.filter(m => !over(m)); this.held = [];
    return { mark, lines };
  }

  /** For the checks: how many lines are being held. */
  get holding(): number { return this.held.length; }
}

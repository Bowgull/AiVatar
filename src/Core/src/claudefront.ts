// His rule (2026-10-21): "Aang should never surface ANYTHING if Claude Code is front and center."
//
// While the Claude app is the window in front (the pet reports the foreground process; CLAUDE_WINDOW), nothing of
// Aang's pops up on his desktop: no proactive bubble, no "now playing" line, no Claude card in the closed bubble, no
// chime and no mark flare. Claude is already showing him its own questions and news there.
//
// Held, never dropped. When he leaves the Claude window:
//   - the mark over Aang's head was live all along (no chime, no flare while he was in Claude);
//   - the proactive lines that were held come out together, as one bundle (attention.ts).
// The waiting Claude questions are not held at all: the Shell gets every list as it is (its cockpit must stay right),
// marked `quiet` so none of them pops up on its own; they are pinned the next time he opens Aang.
//
// ONE place, in the brain, at the door every desktop message goes through (core.ts sendTo), so the pet (marks and
// chimes) and the Shell (bubbles and cards) cannot disagree about it.
import type { ToBody } from './protocol.ts';
import { HoldQueue } from './attention.ts';

/** How many lines a gate of its own keeps (the brain shares its one hold queue instead, attention.ts). */
export const FRONT_HOLD_MAX = 8;
export { WHISPER_LIFE_MS } from './attention.ts';

/**
 * 2026-10-30 (the attention engine): the gate no longer keeps a list of its own. What it holds goes into the brain's one
 * hold queue (attention.ts HoldQueue), marked "claude", and comes out with everything else held, as one bundle, once
 * nothing is in the way (not in Claude, not hushed, muted or busy).
 */
export class FrontGate {
  private wasIn = false;
  private readonly inClaude: () => boolean;
  /** The queue it holds into: the brain's own, or one of its own (the checks). */
  readonly queue: HoldQueue;

  /** `inClaude()` reads the foreground the pet last reported. */
  constructor(inClaude: () => boolean, now: () => number = Date.now, queue: HoldQueue = new HoldQueue(FRONT_HOLD_MAX, now)) { this.inClaude = inClaude; this.queue = queue; }

  /**
   * A message on its way to the desktop. Returns what to send now: the message, a quieter copy of it, or null when it
   * is held for later.
   */
  pass(msg: ToBody): ToBody | null {
    if (!this.inClaude()) return msg;
    switch (msg.t) {
      case 'bubble':
        // What he asked for (a reply) is never held: only Aang speaking up by himself.
        if (msg.proactive !== true) return msg;
        this.queue.holdMsg(msg, 'claude');
        return null;
      case 'whisper':
        // A "now playing" line only matters while it is true: the queue keeps the latest one, not a queue of them.
        this.queue.holdMsg(msg, 'claude');
        return null;
      case 'claude.mark': {
        // No chime and no flare while Claude is in front. The mark itself stays true (2026-10-29, his "build all 11", fix
        // 5): a question he answers in Claude takes its mark and glow away at once, not when he next leaves Claude.
        const { flash: _f, sound: _s, ...steady } = msg;
        return steady;
      }
      case 'claude.wait':
        return { ...msg, quiet: true };
      default:
        return msg;
    }
  }

  /** The foreground changed (a presence report). True when he has just left Claude: the caller lets held lines out. */
  moved(): boolean {
    const nowIn = this.inClaude(), was = this.wasIn;
    this.wasIn = nowIn;
    return was && !nowIn;
  }

  /** For the checks: how many lines are being held. */
  get holding(): number { return this.queue.size; }
}

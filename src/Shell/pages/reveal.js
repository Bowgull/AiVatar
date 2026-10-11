// Step 6.12: a reply arriving at a steady reading pace.
//
// Ported from BubbleView.cs, not reinvented. The numbers and the reasoning are his, from 4.2:
//
//   "Characters revealed per 50ms tick, so 2 is 40 a second. Steady, and deliberately not tied to how
//    much text is waiting. It used to be Math.Max(2, backlog / 6), which meant a reply that arrived all
//    at once was dumped at around 2,000 characters a second while a slow one trickled: the same bubble
//    read as typing or as a flash depending on how fast Claude happened to answer. Joshua's decision,
//    and the convention every RPG uses: one even pace you can start reading immediately, and a click to
//    skip the rest."
//
// That is the most important thing in this file. A faster-when-busy reveal is the obvious optimisation
// and it is the exact thing that was removed on purpose, so it is written down here as well as there.
//
// Plain JavaScript, in `pages/`, because the page server serves exactly one folder and the bubble has to
// import it in a browser. The tests import this same file, so there is one copy and no chance of the
// tested version drifting from the shipped one.

/** Characters per tick. BubbleView.cs: RevealPerTick = 2. */
export const PER_TICK = 2;
/** Milliseconds per tick. BubbleView.cs drives this from its 50ms timer. */
export const TICK_MS = 50;
/** 40 a second, against roughly 20 for comfortable prose reading. */
export const CHARS_PER_SECOND = (PER_TICK * 1000) / TICK_MS;
/**
 * The cockpit's pace (sheet 13, the Smoother look he approved 2026-10-10): whole words fading in, one
 * every 38 ms, instead of letters ticking. The rule above is unchanged: a fixed pace, never faster
 * because more is waiting. Only the unit moved from characters to words.
 */
export const WORD_MS = 38;

/**
 * Where the nth word ends, counting the space after it, so the shown part never stops mid-word.
 * @param {string} text @param {number} n @returns {number}
 */
export function wordEnd(text, n) {
  if (n <= 0) return 0;
  const re = /\S+\s*/g;
  let m, i = 0;
  while ((m = re.exec(text))) if (++i === n) return m.index + m[0].length;
  return text.length;
}

export class Reveal {
  /** Everything there is to say, including the part not shown yet. */
  #full = '';
  #shownChars = 0;
  /** The brain is still sending. Until it stops, reaching the end is not the same as being finished. */
  #more = false;
  #startedAt = 0;
  #now;
  #wordMs = 0;

  /**
   * @param {() => number} [now] a clock, so the pace can be tested without waiting in real time
   * @param {{wordMs?: number}} [opt] reveal by whole words at this pace instead of 2 characters a tick
   */
  constructor(now = Date.now, opt = {}) { this.#now = now; this.#wordMs = opt.wordMs ?? 0; }

  /** What to put on screen right now. */
  get text() { return this.#full.slice(0, this.#shownChars); }
  /** The whole message, revealed or not: what Copy takes, so copying mid-reveal is not half a sentence. */
  get whole() { return this.#full; }
  get revealing() { return this.#shownChars < this.#full.length; }
  /** Nothing more is coming AND all of it is on screen. */
  get done() { return !this.#more && !this.revealing; }

  /**
   * A new message.
   * @param {string} text
   * @param {boolean} streaming more of it is still on its way
   */
  start(text, streaming) {
    this.#full = text;
    this.#shownChars = 0;
    this.#more = streaming === true;
    this.#startedAt = this.#now();
  }

  /**
   * More of the same message arrived. The pace does NOT change: that is the whole point.
   * @param {string} text the WHOLE message so far, not the new part
   * @param {boolean} streaming
   */
  append(text, streaming) {
    this.#full = text;
    this.#more = streaming === true;
    if (!this.#startedAt) this.#startedAt = this.#now();
  }

  /**
   * How much should be visible by now.
   *
   * Worked out from the elapsed time rather than counted up tick by tick, so a dropped frame or a
   * browser that throttles a hidden window cannot make the reveal drift slower than the pace he was
   * promised. It catches up instead.
   */
  tick() {
    if (!this.#startedAt) return;
    if (this.#wordMs) {
      const words = Math.floor((this.#now() - this.#startedAt) / this.#wordMs);
      this.#shownChars = wordEnd(this.#full, words);
      return;
    }
    const ticks = Math.floor((this.#now() - this.#startedAt) / TICK_MS);
    this.#shownChars = Math.min(this.#full.length, ticks * PER_TICK);
  }

  /**
   * He clicked: show the rest at once (BubbleView.SkipReveal).
   *
   * Returns whether there was anything to skip, because the same click means "expand" when there was
   * not, and doing both would expand a bubble he was only trying to finish.
   */
  skip() {
    if (!this.revealing) return false;
    this.#shownChars = this.#full.length;
    return true;
  }

  /** Nothing is being said. */
  clear() { this.#full = ''; this.#shownChars = 0; this.#more = false; this.#startedAt = 0; }
}

/**
 * How tall the bubble is, in lines, given how many the text needs.
 *
 * Six lines collapsed, and then AS MANY AS THE REPLY NEEDS once he clicks the arrow. BubbleView.cs:25
 * capped the expanded state at twelve and scrolled past that, which contradicts the design: the arrow
 * says there is more, so clicking it has to show all of it. "If something needs to get big let it, to
 * fit" (2026-10-04). The only limit left is the screen, and anchor.ts already keeps the window on it.
 */
export const COLLAPSED_LINES = 6;

/**
 * A long answer starts as its short version (sheet 13, approved 2026-10-10).
 *
 * The voice asks Aang to open anything past about four lines with a one or two sentence short version as
 * its own paragraph. So: two or more paragraphs AND long enough to be worth folding, then the first
 * paragraph is what shows until he taps Show more. Decided from the text, not measured lines, so it cannot
 * flip while the reply is still arriving and changing size.
 */
export const SUMMARY_AFTER_CHARS = 280;

/** @param {string} text @returns {string | null} the short version, or null if the whole thing shows */
export function summaryOf(text) {
  const t = String(text ?? '');
  if (t.length <= SUMMARY_AFTER_CHARS) return null;
  const m = /\n\s*\n/.exec(t);
  if (!m || m.index === 0) return null;
  const first = t.slice(0, m.index).trimEnd();
  // A "short version" that is most of the answer is not one.
  return first.length > 0 && first.length <= t.length * 0.6 ? first : null;
}

/**
 * @param {number} total lines the text actually needs
 * @param {boolean} expanded he has clicked the arrow
 * @returns {number}
 */
export function linesShown(total, expanded) {
  return expanded ? total : Math.min(total, COLLAPSED_LINES);
}

/**
 * Is there more text than is being shown, so the arrow belongs on screen?
 * @param {number} total @param {boolean} expanded @returns {boolean}
 */
export function hasMore(total, expanded) {
  return total > linesShown(total, expanded);
}

/**
 * Does it have to scroll?
 *
 * No. Expanding shows the whole reply however long it is; the window is placed by anchor.ts, which
 * keeps it on the screen. Kept as a function because bubble.js and the tests both call it, and
 * because if a limit ever comes back it belongs here.
 * @param {number} _total @param {boolean} _expanded @returns {boolean}
 */
export function scrolls(_total, _expanded) {
  return false;
}

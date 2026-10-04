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

export class Reveal {
  /** Everything there is to say, including the part not shown yet. */
  #full = '';
  #shownChars = 0;
  /** The brain is still sending. Until it stops, reaching the end is not the same as being finished. */
  #more = false;
  #startedAt = 0;
  #now;

  /** @param {() => number} [now] a clock, so the pace can be tested without waiting in real time */
  constructor(now = Date.now) { this.#now = now; }

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
 * BubbleView.cs:25 - six lines collapsed, twelve expanded. Over six it collapses and shows the bobbing
 * arrow; a click takes it to twelve; past twelve it scrolls.
 */
export const COLLAPSED_LINES = 6, EXPANDED_LINES = 12;

/**
 * @param {number} total lines the text actually needs
 * @param {boolean} expanded he has clicked the arrow
 * @returns {number}
 */
export function linesShown(total, expanded) {
  return Math.min(total, expanded ? EXPANDED_LINES : COLLAPSED_LINES);
}

/**
 * Is there more text than is being shown, so the arrow belongs on screen?
 * @param {number} total @param {boolean} expanded @returns {boolean}
 */
export function hasMore(total, expanded) {
  return total > linesShown(total, expanded);
}

/**
 * Past twelve lines, expanding is not enough and it has to scroll.
 * @param {number} total @param {boolean} expanded @returns {boolean}
 */
export function scrolls(total, expanded) {
  return expanded && total > EXPANDED_LINES;
}

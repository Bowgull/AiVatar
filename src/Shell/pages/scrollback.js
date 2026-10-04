// Step 6.12: scrolling up in the bubble pulls older turns from memory, with no limit.
//
// Ported from PetWindow.FillStackFromMemory and BubbleView's scrollback, and the rule that makes it
// feel bottomless is theirs: ask for turns OLDER THAN THE OLDEST ALREADY SHOWN, and ask again every
// time he reaches the top. "Repeats every time he reaches the top, so there is no limit on how far back
// he can go - days, weeks, until the database runs out."
//
// The two things that go wrong here, both guarded:
//   1. asking over and over while one page is already in flight, which is what `awaitingOlder` is for
//      in the C#. A scroll at the top fires many times a second.
//   2. not knowing the beginning has been reached, so it keeps asking for ever at the top of his
//      history. An empty page means that, and nothing is asked again after it.
//
// No screen, no fetching: this decides WHEN to ask and what for. The page does the scrolling and the
// main process does the sending.

/** @typedef {{ id: number, ts: string, who: 'you'|'Aang', text: string }} Turn */

export class Scrollback {
  /** Oldest first, which is the order they are read in. */
  #turns = /** @type {Turn[]} */ ([]);
  #waiting = false;
  #reachedTheStart = false;

  /** Everything pulled back so far, oldest first. */
  get turns() { return this.#turns; }
  /** A page is already on its way: do not ask again. */
  get waiting() { return this.#waiting; }
  /** There is nothing older. Asking again would be asking for ever. */
  get reachedTheStart() { return this.#reachedTheStart; }
  /** The row to ask for turns older than. Undefined before anything has been pulled back. */
  get oldestId() { return this.#turns.length ? this.#turns[0].id : undefined; }

  /**
   * He is at the top. Should anything be asked for, and if so, what?
   * @param {boolean} atTop
   * @returns {{ before?: number } | null} null when nothing should be asked
   */
  wants(atTop) {
    if (!atTop || this.#waiting || this.#reachedTheStart) return null;
    this.#waiting = true;
    const before = this.oldestId;
    return before === undefined ? {} : { before };
  }

  /**
   * A page came back.
   *
   * Rows already held are dropped rather than added twice: two requests can overlap if the brain is
   * slow and he scrolls again, and the same message appearing twice in his own history is the kind of
   * bug that makes the whole thing untrustworthy.
   * @param {Turn[]} items
   */
  older(items) {
    this.#waiting = false;
    const rows = Array.isArray(items) ? items.filter(t => t && Number.isFinite(t.id)) : [];
    if (!rows.length) { this.#reachedTheStart = true; return 0; }
    const have = new Set(this.#turns.map(t => t.id));
    const fresh = rows.filter(t => !have.has(t.id)).sort((a, b) => a.id - b.id);
    if (!fresh.length) { this.#reachedTheStart = true; return 0; }
    this.#turns = [...fresh, ...this.#turns];
    return fresh.length;
  }

  /** A page that never arrived. Let him try again rather than locking him out of his own history. */
  gaveUp() { this.#waiting = false; }

  /** A new message arrived, so what is on screen is current again. */
  add(/** @type {Turn} */ turn) {
    if (turn && Number.isFinite(turn.id) && !this.#turns.some(t => t.id === turn.id)) this.#turns.push(turn);
  }

  /** He forgot one. */
  forget(/** @type {number} */ id) { this.#turns = this.#turns.filter(t => t.id !== id); }

  /** Start again, e.g. when the bubble is cleared. The beginning is forgotten too: he may have more now. */
  clear() { this.#turns = []; this.#waiting = false; this.#reachedTheStart = false; }
}

/**
 * Is this scroll position "at the top"?
 *
 * A few pixels of slack, because a trackpad rarely lands exactly on zero and he should not have to
 * fight it to reach the thing that loads more.
 * @param {number} scrollTop
 */
export const atTop = (scrollTop) => scrollTop <= 4;

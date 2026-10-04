// Step 6.12b: Up and Down recall what he sent before.
//
// Ported from InputHistory.cs rule for rule, and sharing its file (%APPDATA%\Aang\input-history.json),
// so the history he has built up in the old box is there in the new one on day one:
//   - at most 50, oldest dropped first
//   - the same message twice in a row is kept once
//   - Up from what he is typing keeps that as a DRAFT, and Down past the newest gives it back. Losing a
//     half-written message because he pressed Up to check something is the bug this rule prevents.

export const MAX = 50;

export class History {
  /** @type {string[]} */ #items;
  #index;
  #draft = '';

  /** @param {unknown} saved whatever the file held; anything that is not a list of strings is ignored */
  constructor(saved = []) {
    this.#items = Array.isArray(saved) ? saved.filter((s) => typeof s === 'string' && s.trim()).slice(-MAX) : [];
    this.#index = this.#items.length;
  }

  get items() { return [...this.#items]; }
  /** He is looking back through history rather than at what he was typing. */
  get browsing() { return this.#index < this.#items.length; }

  /** Something was sent. @param {string} text @returns {string[]} the list to save */
  add(text) {
    const t = String(text ?? '').trim();
    if (t && this.#items[this.#items.length - 1] !== t) this.#items.push(t);
    while (this.#items.length > MAX) this.#items.shift();
    this.reset();
    return this.items;
  }

  /** Up. @param {string} current what is in the box now, kept as the draft @returns {string | null} */
  prev(current) {
    if (!this.#items.length) return null;
    if (this.#index >= this.#items.length) this.#draft = String(current ?? '');
    if (this.#index > 0) this.#index--;
    return this.#items[this.#index];
  }

  /** Down: the next one, then the draft. @returns {string | null} null when not browsing */
  next() {
    if (this.#index >= this.#items.length) return null;
    this.#index++;
    return this.#index >= this.#items.length ? this.#draft : this.#items[this.#index];
  }

  reset() { this.#index = this.#items.length; this.#draft = ''; }
}

/** Ctrl+1 to 4, in ModelChip.cs's order. */
export const MODES = ['auto', 'quick', 'smart', 'deep'];
/** @param {string} key the digit pressed @returns {string | null} */
export const modeForKey = (key) => MODES[Number(key) - 1] ?? null;

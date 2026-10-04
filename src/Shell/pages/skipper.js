// Doing the skipping, in the page, while the video plays.
//
// Two rules run through all of this:
//
//   Nothing is skipped silently. Every skip raises a plaque for three seconds saying what it did, with
//   an Undo that puts him back exactly where he was. A player that jumps on its own and says nothing is
//   indistinguishable from a broken one.
//
//   A skip only fires at the very start of a segment. If he has let the opening run for twenty seconds
//   he is watching it on purpose, and yanking the picture out from under him would be rude.
import { dueAt } from './segments.js';

const SHOW_MS = 3000;

export class Skipper {
  constructor(player, els) {
    this.player = player;
    this.els = els;                 // { plaque, said, undo }
    this.segments = [];             // { from, to, says }
    this.enabled = true;
    this.lastUndo = null;           // where to put him back
    this.hideTimer = null;
    this.done = new Set();          // segments already skipped, so one is never fought over twice

    els.undo.addEventListener('click', () => this.undo());
  }

  /** New video: forget everything about the old one. */
  reset(segments = []) {
    this.segments = segments;
    this.done.clear();
    this.lastUndo = null;
    this.hide();
  }

  /** Called every time the player reports where it is. */
  at(seconds) {
    if (!this.enabled || !this.segments.length) return;
    const due = dueAt(this.segments, seconds, this.done);
    if (!due) return;
    this.done.add(due.from);
    this.lastUndo = { to: seconds, says: due.says };
    this.player.seekSeconds(due.to);
    this.show(`SKIPPED THE ${due.says.toUpperCase()}`);
  }

  show(text) {
    this.els.said.textContent = text;
    this.els.plaque.classList.add('up');
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => this.hide(), SHOW_MS);
  }

  hide() {
    this.els.plaque.classList.remove('up');
    if (this.hideTimer) { clearTimeout(this.hideTimer); this.hideTimer = null; }
  }

  undo() {
    if (!this.lastUndo) return;
    const { to } = this.lastUndo;
    this.player.seekSeconds(to);
    this.lastUndo = null;
    this.show('PUT BACK');
  }
}

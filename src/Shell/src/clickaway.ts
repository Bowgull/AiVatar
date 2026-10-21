// 2026-10-21 (his report: with Claude's jobs open in the speech bubble, a click inside Samara did not close it).
//
// The pet's mouse hook is what tells the Shell he clicked away from Aang (`outside.click`). It counts a click as "on Aang"
// anywhere inside the rectangle round the bubble's and the chat box's windows, which are see-through and bigger than
// what is drawn, so a click in Samara near them never counted; and its word goes through the brain and back. Samara, the
// pop-outs and the notes are windows of this same program, so the Shell can see their clicks itself, at once and
// exactly: a mouse press in any of our pages that is not the bubble, the chat box or Aang's menu is a click away.
//
// Cost: one listener per page, and it returns at once for anything but a press. Mouse moves and keys are ignored.
import { app, webContents, type WebContents } from 'electron';

export interface OwnClicks {
  /** The bubble, the chat box and Aang's menu: a press in these is ON Aang, never away. */
  isAang: (wc: WebContents) => boolean;
  /** Only while something of Aang's is up (the same as the pet's `shellBusy`). */
  busy: () => boolean;
  /** He clicked away. */
  away: () => void;
}

const watched = new WeakSet<WebContents>();

/** Watch every page this program has now and every one it makes later. */
export function watchOwnClicks(o: OwnClicks): void {
  const watch = (wc: WebContents) => {
    if (watched.has(wc)) return;
    watched.add(wc);
    wc.on('input-event', (_e, ev) => {
      if (ev.type !== 'mouseDown') return;
      try { if (!wc.isDestroyed() && !o.isAang(wc) && o.busy()) o.away(); }
      catch (err) { console.error('shell: click-away watch: ' + (err as Error).message); }
    });
  };
  for (const wc of webContents.getAllWebContents()) watch(wc);
  app.on('web-contents-created', (_e, wc) => watch(wc));
}

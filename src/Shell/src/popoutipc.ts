// The pop-out's wiring, shared by the PC (main.ts) and the Mac (macmain.ts, his report 2026-10-13: on the Mac the
// pop-out key did nothing). Each message is taken only from the pop-out's own page, or the browser's frame.
//
// "Take the tab with you" (2026-10-11): any video on any site. The live tab itself moves into the pop-out, so nothing
// reloads and his login comes along; closing the pop-out hands it back. Paid services are the one exception: their
// protected video only plays in the castLabs window, so for those the address goes there.
import { BrowserWindow, ipcMain } from 'electron';
import type { AangBrowser } from './browser.ts';
import type { Popout } from './popout.ts';
import { serviceFor } from './services.ts';

export interface PopoutWiring {
  popout: () => Popout | null;
  browser: () => AangBrowser | null;
  /** Play an address: a paid service in the castLabs window, anything else in the pop-out. True if it plays. */
  open: (url: string) => boolean;
  /** Close the paid-video window (only one plays at a time). */
  stopPaid: () => void;
  /** "Send to Mac" on the PC, "Send to PC" on the Mac: the address goes to the other machine. */
  sendToOther: (url: string) => void;
  /** True while the browser has no Widevine of its own: paid services then play in the separate castLabs window. */
  paidSeparately: () => boolean;
  /** "Open on Mac" / "Open on PC": the page as a full tab in the other machine's browser, brought to the front. */
  openOnOther: (url: string) => void;
  /** What the pop-out is playing, for the brain. */
  playback?: (s: { playing: boolean; at: number; length: number; ended: boolean }) => void;
}

/**
 * The pop-out comes forward and Samara tucks away (his ask, 2026-10-20), only when Samara was the window in front. Closing
 * the pop-out brings it back, the other half: only the window it tucked away, only while that window is still tucked, and
 * only when the pop-out was in front as it closed, so a pop-out put away from the bubble while he is in WoW never throws
 * Samara over his game.
 */
export function tuckFor(p: Popout, front: BrowserWindow | null): void {
  const pw = p.window;
  if (!front || front.isDestroyed() || front === pw || front.isMinimized()) return;
  setTimeout(() => {
    if (!front.isDestroyed()) front.minimize();
    // Minimizing Samara hands the front to whatever window Windows picks next, which was often not the pop-out (his
    // catch, 2026-10-21: "opening pop-out is pushing Samara closed and not surfacing the pop-out forward"). So the
    // pop-out is brought forward on purpose, after Samara has gone.
    const w = p.window;
    if (w && !w.isDestroyed()) { if (!w.isVisible()) w.show(); w.moveTop(); w.focus(); }
  }, 150);
  p.afterClose = (wasInFront) => {
    if (!wasInFront || front.isDestroyed()) return;
    if (front.isMinimized()) front.restore();
    front.focus();
  };
}

/** Returns the pop-out key's work, for the right-click menu's "Pop out this video" (his pick, 2026-10-20). */
export function wirePopout(o: PopoutWiring): { popTab: (id: number) => void } {
  const from = (e: Electron.IpcMainEvent) => { const w = o.popout()?.window; return Boolean(w && e.sender === w.webContents && e.senderFrame?.parent === null); };
  // EVERY pop-out closes with Samara, Aang's "put X on" ones too (his yes, 2026-10-21). The browser is made a moment after
  // this is wired, so it is hooked when it exists and checked again now and then (cheap: one property).
  const closeWithSamara = () => { o.popout()?.close(); o.stopPaid(); };
  const hook = () => { const b = o.browser(); if (b && b.onLastClosed !== closeWithSamara) b.onLastClosed = closeWithSamara; };
  hook();
  setInterval(hook, 5000).unref();
  ipcMain.on('popout:hide', (e) => { if (from(e)) o.popout()?.toggleHidden(); });
  ipcMain.on('popout:close', (e) => { if (from(e)) o.popout()?.close(); });
  ipcMain.on('popout:opacity', (e, v) => { if (from(e) && typeof v === 'number') o.popout()?.setOpacity(v); });
  ipcMain.on('popout:fullscreen', (e) => { if (from(e)) o.popout()?.toggleFullscreen(); });
  ipcMain.on('popout:chrome', (e, px) => { if (from(e) && typeof px === 'number') o.popout()?.setChrome(px); });
  ipcMain.on('popout:stage', (e, r) => { if (from(e) && r && typeof r === 'object') o.popout()?.setStage(r); });
  ipcMain.on('popout:tabcmd', (e, c) => { if (from(e) && c && typeof c === 'object') o.popout()?.tabCommand(c); });
  ipcMain.on('popout:pin', (e) => { if (from(e)) o.popout()?.togglePin(); });
  // The wooden bar dragged by hand (the window family, F2): the page says how far since the press.
  ipcMain.on('popout:drag', (e, a) => {
    if (!from(e) || !a || typeof a !== 'object') return;
    const v = a as { phase?: unknown; dx?: unknown; dy?: unknown };
    if (v.phase !== 'start' && v.phase !== 'move' && v.phase !== 'end') return;
    o.popout()?.drag(v.phase, Number(v.dx ?? 0), Number(v.dy ?? 0));
  });
  ipcMain.on('popout:playback', (e, s) => {
    if (!from(e) || !s || typeof s !== 'object') return;
    o.playback?.({ playing: s.playing === true, at: Number(s.at) || 0, length: Number(s.length) || 0, ended: s.ended === true });
  });
  // The pop-out's own "Send to" key: the address goes to the other machine, and it stops here (both playing at once
  // is overstimulation, his call 2026-10-12).
  ipcMain.on('popout:tomac', (e) => {
    if (!from(e)) return;
    const url = o.popout()?.link;
    if (url) { o.sendToOther(url); o.popout()?.pauseAndClose(); }
  });
  // Which window was in front is read BEFORE the pop-out shows (it takes the focus); the click may come from the tab
  // list, which is a view inside the window, so the focused window is asked rather than the sender's.
  const tuckAway = (front: BrowserWindow | null) => { const p = o.popout(); if (p) tuckFor(p, front); };
  ipcMain.on('browser:popout', (e, id) => {
    const b = o.browser();
    if (!b?.isFrame(e.sender) || !Number.isInteger(id)) return;
    popTab(id, BrowserWindow.getFocusedWindow());
  });
  function popTab(id: number, front: BrowserWindow | null): void {
    const b = o.browser(), p = o.popout();
    if (!b || !p) return;
    const url = b.urlOf(id);
    if (!url) return;
    hook();   // closing Samara closes this pop-out too (his ask, 2026-10-21)
    if (serviceFor(url) && o.paidSeparately()) { if (o.open(url)) b.pauseMedia(id); return; }
    o.stopPaid();
    const lent = b.lend(id);
    if (!lent) { if (o.open(url)) b.pauseMedia(id); return; }
    let label = 'PAGE';
    try { label = new URL(url).hostname.replace(/^www\./, '').split('.').slice(-2, -1)[0]!.toUpperCase().slice(0, 14); } catch { /* keep PAGE */ }
    p.openTab(lent.view, { url, title: lent.title.slice(0, 80) || url, label }, (view) => o.browser()?.giveBack(id, view));
    // The pop-out comes forward and Samara tucks away (his ask, 2026-10-20), only when Samara was the window in front.
    tuckAway(front);
  }
  // "Open on Mac" / "Open on PC" from a tab's menu: a full tab over there, and this one pauses.
  ipcMain.on('browser:openother', (e, id) => {
    const b = o.browser();
    if (!b?.isFrame(e.sender) || !Number.isInteger(id)) return;
    const url = b.urlOf(id);
    if (!url) return;
    o.openOnOther(url);
    b.pauseMedia(id);
  });
  // A tab sent to the other machine stops here.
  ipcMain.on('browser:tomac', (e, id) => {
    const b = o.browser();
    if (!b?.isFrame(e.sender) || !Number.isInteger(id)) return;
    const url = b.urlOf(id);
    if (!url) return;
    o.sendToOther(url);
    if (b.isLent(id)) o.popout()?.pauseAndClose();
    b.pauseMedia(id);
  });
  return { popTab: (id) => popTab(id, BrowserWindow.getFocusedWindow()) };
}

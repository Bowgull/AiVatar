// The pop-out's wiring, shared by the PC (main.ts) and the Mac (macmain.ts, his report 2026-10-13: on the Mac the
// pop-out key did nothing). Each message is taken only from the pop-out's own page, or the browser's frame.
//
// "Take the tab with you" (2026-10-11): any video on any site. The live tab itself moves into the pop-out, so nothing
// reloads and his login comes along; closing the pop-out hands it back. Paid services are the one exception: their
// protected video only plays in the castLabs window, so for those the address goes there.
import { ipcMain } from 'electron';
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
  /** What the pop-out is playing, for the brain. */
  playback?: (s: { playing: boolean; at: number; length: number; ended: boolean }) => void;
}

export function wirePopout(o: PopoutWiring): void {
  const from = (e: Electron.IpcMainEvent) => { const w = o.popout()?.window; return Boolean(w && e.sender === w.webContents); };
  ipcMain.on('popout:hide', (e) => { if (from(e)) o.popout()?.toggleHidden(); });
  ipcMain.on('popout:close', (e) => { if (from(e)) o.popout()?.close(); });
  ipcMain.on('popout:opacity', (e, v) => { if (from(e) && typeof v === 'number') o.popout()?.setOpacity(v); });
  ipcMain.on('popout:fullscreen', (e) => { if (from(e)) o.popout()?.toggleFullscreen(); });
  ipcMain.on('popout:chrome', (e, px) => { if (from(e) && typeof px === 'number') o.popout()?.setChrome(px); });
  ipcMain.on('popout:stage', (e, r) => { if (from(e) && r && typeof r === 'object') o.popout()?.setStage(r); });
  ipcMain.on('popout:tabcmd', (e, c) => { if (from(e) && c && typeof c === 'object') o.popout()?.tabCommand(c); });
  ipcMain.on('popout:pin', (e) => { if (from(e)) o.popout()?.togglePin(); });
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
  ipcMain.on('browser:popout', (e, id) => {
    const b = o.browser(), p = o.popout();
    if (!b?.isFrame(e.sender) || !Number.isInteger(id) || !p) return;
    const url = b.urlOf(id);
    if (!url) return;
    if (serviceFor(url)) { if (o.open(url)) b.pauseMedia(id); return; }
    o.stopPaid();
    const lent = b.lend(id);
    if (!lent) { if (o.open(url)) b.pauseMedia(id); return; }
    let label = 'PAGE';
    try { label = new URL(url).hostname.replace(/^www\./, '').split('.').slice(-2, -1)[0]!.toUpperCase().slice(0, 14); } catch { /* keep PAGE */ }
    p.openTab(lent.view, { url, title: lent.title.slice(0, 80) || url, label }, (view) => o.browser()?.giveBack(id, view));
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
}

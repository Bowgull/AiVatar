// Sheet 62, "Pin it" (his pick, 2026-10-22): a snip pinned on his desktop. "A small solid window that stays on top,
// part of the pop-out family: the same pin, the same see-through." Drawn on sheet 62 (pin-snip.png): the video pop-out's
// own window (popout.css: the wooden bar, the grip, the SNIP plaque, plum keys, 12 px corners) with the job pop-out's pin
// as its first key, and the see-through slider beside it while the mouse is near (sheet 52's B, never under 30%).
//
// It is just a picture: no page, no link, nothing to click through to. It never takes the keyboard (focusable: false,
// shown with showInactive), so pinning a snip over WoW never pulls the game out of focus. The page can only speak for its
// own window; it never names a file: the picture is read here, from a snip the Shell itself saved, and sent as an image.
//
// Every window it makes comes from ONE function, makePinWindow. Since the window family's part 2 (2026-10-22) each pinned
// snip is a family member ('snip:N'): it snaps, moves with its group, shares see-through and pin, and keeps its picture's
// shape when it joins a side (familywin.ts KIND_LAYOUTS.snip).
import { BrowserWindow, ipcMain, nativeImage, screen } from 'electron';
import { SAFE_WEB_PREFERENCES, denyPermissions, lockDown } from './safety.ts';
import type { FamilyHooks } from './familywin.ts';

export interface PinSnipOptions {
  origin: string;
  /** pinsnippreload.cjs: the page's few named doors. */
  preloadPath: string;
  /** Aang's face for the taskbar (his rule: always Aang's face, never the Electron atom). */
  iconPath?: string;
  /** Off only in the offscreen test. */
  clampToScreen?: boolean;
}

/** The bar (popout.css --bar), the room to the right for the slider, and the largest picture it opens at. */
export const BAR = 34, ROOM_R = 44, MAX_W = 360, MAX_H = 300, MIN_W = 180;
export const MIN_OPACITY = 0.3;

interface Pin { w: BrowserWindow; title: string; pic: string; pinned: boolean; opacity: number; drag: { x: number; y: number } | null; fid: string; hot?: boolean }

const all = new Set<PinSnips>();
let wired = false;

/** How big the window opens for a picture this size: the picture fits MAX_W x MAX_H, never narrower than MIN_W. */
export function pinSize(w: number, h: number): { width: number; height: number; picW: number; picH: number } {
  const k = Math.min(1, MAX_W / Math.max(1, w), MAX_H / Math.max(1, h));
  // A thin snip is shown no narrower than MIN_W (the bar needs its title and keys); the picture keeps its shape inside.
  const picW = Math.max(MIN_W, Math.round(w * k)), picH = Math.max(60, Math.min(MAX_H, Math.round(picW * h / Math.max(1, w))));
  return { width: picW + ROOM_R, height: picH + BAR, picW, picH };
}

/**
 * The one place a pinned snip's window is made (the window family will take this over). Frameless, see-through round
 * the frame, on top (pinned) at the level notes, timers and pop-outs use, never focusable, mouse through until the page
 * says the pointer is on it.
 */
export function makePinWindow(o: PinSnipOptions, b: { x: number; y: number; width: number; height: number }): BrowserWindow {
  const w = new BrowserWindow({
    ...b, frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false, resizable: false, movable: true,
    minimizable: false, maximizable: false, fullscreenable: false, skipTaskbar: true, alwaysOnTop: true,
    focusable: false, show: false, title: 'Pinned snip',
    webPreferences: { ...SAFE_WEB_PREFERENCES, preload: o.preloadPath },
  });
  if (o.iconPath) {
    try { w.setIcon(o.iconPath); } catch { /* the default icon */ }
    try { w.setAppDetails({ appId: 'Aang', appIconPath: o.iconPath, appIconIndex: 0, relaunchDisplayName: 'Aang' }); } catch { /* not Windows */ }
  }
  lockDown(w.webContents);
  denyPermissions(w.webContents.session);
  w.setIgnoreMouseEvents(true, { forward: true });
  void w.loadURL(`${o.origin}/pinsnip.html`);
  w.once('ready-to-show', () => { if (!w.isDestroyed()) w.showInactive(); });
  return w;
}

export class PinSnips {
  private readonly pins = new Set<Pin>();
  private readonly o: PinSnipOptions;
  private n = 0;
  /** Set by familywire.ts (main.ts when the snips come later): a pinned snip is a window family member. */
  family: FamilyHooks | null = null;
  constructor(o: PinSnipOptions) { this.o = o; all.add(this); wireIpc(); }

  /** Pin one snip. `file` must be a PNG the Shell saved; the window shows it with its title. Null when it cannot be read. */
  open(file: string, title: string): BrowserWindow | null {
    let img: Electron.NativeImage;
    try { img = nativeImage.createFromPath(file); } catch { return null; }
    if (img.isEmpty()) return null;
    const { width: iw, height: ih } = img.getSize();
    const sz = pinSize(iw, ih);
    const spot = this.spot(sz.width, sz.height);
    const w = makePinWindow(this.o, { ...spot, width: sz.width, height: sz.height });
    const pic = (iw > sz.picW * 2 ? img.resize({ width: sz.picW * 2, quality: 'good' }) : img).toDataURL();
    const p: Pin = { w, title: String(title).replace(/\s+/g, ' ').slice(0, 60) || 'Snip', pic, pinned: true, opacity: 1, drag: null, fid: 'snip:' + ++this.n };
    this.pins.add(p);
    this.applyPin(p);
    this.family?.add({
      id: p.fid, kind: 'snip', win: () => (w.isDestroyed() ? null : w), card: '.frame',
      setOpacity: (n) => { p.opacity = Math.round(Math.max(MIN_OPACITY, Math.min(1, n)) * 100) / 100; this.push(p); },
      setPinned: (on) => { if (p.pinned !== on) { p.pinned = on; this.applyPin(p); this.push(p); } },
    });
    w.on('closed', () => this.pins.delete(p));
    this.push(p);
    return w;
  }
  windows(): BrowserWindow[] { return [...this.pins].map((p) => p.w).filter((w) => !w.isDestroyed()); }
  /** A pinned snip's title by its family id (its name on Samara's taskbar, taskbar.ts). */
  titleOf(fid: string): string | null { for (const p of this.pins) if (p.fid === fid) return p.title; return null; }
  closeAll(): void { for (const p of [...this.pins]) if (!p.w.isDestroyed()) p.w.destroy(); this.pins.clear(); }
  dispose(): void { this.closeAll(); all.delete(this); }

  private push(p: Pin): void {
    const data = { title: p.title, pic: p.pic, pinned: p.pinned, opacity: p.opacity };
    const send = () => { if (!p.w.isDestroyed()) p.w.webContents.send('pinsnip:data', data); };
    if (p.w.webContents.isLoading()) p.w.webContents.once('did-finish-load', send); else send();
  }
  private applyPin(p: Pin): void {
    if (p.w.isDestroyed()) return;
    // Pinned = stays on top, above a full-screen game (sheet 52's meaning, the job pop-out's pin).
    if (p.pinned) { p.w.setAlwaysOnTop(true, 'screen-saver'); p.w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true }); }
    else { p.w.setAlwaysOnTop(false); p.w.setVisibleOnAllWorkspaces(false); }
  }
  /** Near the pointer (where he just snipped), kept on the screen. */
  private spot(width: number, height: number): { x: number; y: number } {
    const pt = screen.getCursorScreenPoint();
    if (this.o.clampToScreen === false) return { x: pt.x, y: pt.y };
    const a = screen.getDisplayNearestPoint(pt).workArea;
    return { x: Math.round(Math.min(Math.max(a.x, pt.x - width / 2), a.x + a.width - width)), y: Math.round(Math.min(Math.max(a.y, pt.y - height / 2), a.y + a.height - height)) };
  }
  of(sender: Electron.WebContents, frame: Electron.WebFrameMain | null | undefined): Pin | null {
    if (frame && frame.parent !== null) return null;
    for (const p of this.pins) if (!p.w.isDestroyed() && p.w.webContents === sender) return p;
    return null;
  }

  /* ---- what the page may ask */
  hearClickable(p: Pin, on: boolean): void { if (!p.w.isDestroyed()) { p.hot = on; p.w.setIgnoreMouseEvents(!(on || p.drag), { forward: true }); } }
  /**
   * The Mac (2026-10-28): macOS sends no mouse moves to a window letting clicks through, so the page never says the
   * pointer is on it. The Mac app follows the pointer and calls this, as for timers. A pinned one stays click-through.
   * True while there is a pinned snip to follow.
   */
  pointerAt(pt: { x: number; y: number }): boolean {
    let any = false;
    for (const p of this.pins) {
      if (p.w.isDestroyed() || p.pinned) continue;
      any = true;
      const b = p.w.getBounds();
      const on = pt.x >= b.x && pt.x < b.x + b.width && pt.y >= b.y && pt.y < b.y + b.height;
      if (on !== p.hot && !p.drag) { p.hot = on; p.w.setIgnoreMouseEvents(!on, { forward: true }); }
    }
    return any;
  }
  hearDrag(p: Pin, phase: unknown, dx: number, dy: number): void {
    if (p.w.isDestroyed()) return;
    const [x, y] = p.w.getPosition();
    if (phase === 'start') { p.drag = { x: x!, y: y! }; p.w.setIgnoreMouseEvents(false); this.family?.drag(p.fid, 'start'); return; }
    if (!p.drag || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
    // The family moves it (and whatever it is joined to), and snaps it; on its own it just follows the mouse.
    if (phase === 'move') { if (!this.family?.drag(p.fid, 'move', dx, dy)) p.w.setPosition(Math.round(p.drag.x + dx), Math.round(p.drag.y + dy)); return; }
    if (phase === 'end') { p.drag = null; this.family?.drag(p.fid, 'end', dx, dy); }
  }
  hearPin(p: Pin): void { p.pinned = !p.pinned; this.applyPin(p); this.push(p); this.family?.shared(p.fid, { pinned: p.pinned }); }
  hearOpacity(p: Pin, n: number): void { if (Number.isFinite(n)) { p.opacity = Math.round(Math.max(MIN_OPACITY, Math.min(1, n)) * 100) / 100; this.family?.shared(p.fid, { opacity: p.opacity }); } }
  hearClose(p: Pin): void { this.pins.delete(p); if (!p.w.isDestroyed()) p.w.destroy(); }
}

/** One set of doors for every PinSnips; each message is matched to the window that sent it. */
function wireIpc(): void {
  if (wired) return;
  wired = true;
  const find = (e: Electron.IpcMainEvent): { ps: PinSnips; p: Pin } | null => {
    for (const ps of all) { const p = ps.of(e.sender, e.senderFrame); if (p) return { ps, p }; }
    return null;
  };
  ipcMain.on('pinsnip:clickable', (e, on) => { const f = find(e); if (f) f.ps.hearClickable(f.p, on === true); });
  ipcMain.on('pinsnip:drag', (e, a) => {
    const f = find(e);
    if (!f || !a || typeof a !== 'object') return;
    f.ps.hearDrag(f.p, (a as { phase?: unknown }).phase, Number((a as { dx?: unknown }).dx ?? 0), Number((a as { dy?: unknown }).dy ?? 0));
  });
  ipcMain.on('pinsnip:pin', (e) => { const f = find(e); if (f) f.ps.hearPin(f.p); });
  ipcMain.on('pinsnip:opacity', (e, n) => { const f = find(e); if (f) f.ps.hearOpacity(f.p, Number(n)); });
  ipcMain.on('pinsnip:close', (e) => { const f = find(e); if (f) f.ps.hearClose(f.p); });
}

// Sheet 60 (his picks, 2026-10-22), the main-process half: kept in one file so main.ts only plugs it in.
//
//  - NoteHeld: "Aang holds it up" (option B). While a noticed note's line is on show, a tiny window over his hands shows
//    the little paper in the note's category colour. It lifts in on a spring and lowers when the line goes; it follows
//    him if he moves; a click opens the note; pointing at it counts as pointing at the bubble (the hover keys).
//    Shown without ever taking focus, exactly like the bubble.
//  - wireNotes60: the doors the new note parts use (the quick note's Enter/Esc, the held paper, "+ Category").
import { BrowserWindow, ipcMain, screen } from 'electron';
import { SAFE_WEB_PREFERENCES, denyPermissions, lockDown } from './safety.ts';
import { headOf, type PetAt } from './anchor.ts';
import type { NoteWindows } from './notewin.ts';

/** The sheet's held paper: 17 x 14 art pixels, 2 frame pixels each, its top-left 17 left of and 32 below his head. */
const ART = { w: 17, h: 14, px: 2, dx: -17, dy: 32 } as const;
/** How far below its place it starts when he lifts it, and ends when he lowers it (frame pixels, the sheet's 22). */
const LIFT = 22;

export class NoteHeld {
  private win: BrowserWindow | null = null;
  private on = false;
  private colours: { paper: string; deep: string } = { paper: '#f8dc8e', deep: '#d9a83a' };
  private anim: NodeJS.Timeout | null = null;
  private follow: NodeJS.Timeout | null = null;
  /** Where the paper is drawn now, relative to its resting place (frame pixels down), and its opacity. */
  private off = LIFT;
  private lastKey = '';
  private readonly o: { origin: string; preloadPath: string; pet: () => PetAt | null; /** checks only: drawn off screen */ offscreen?: boolean };
  constructor(o: { origin: string; preloadPath: string; pet: () => PetAt | null; offscreen?: boolean }) { this.o = o; }

  private window(): BrowserWindow | null {
    if (this.win && !this.win.isDestroyed()) return this.win;
    try {
      const w = new BrowserWindow({
        width: 34, height: 28, frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false, resizable: false, movable: false,
        minimizable: false, maximizable: false, fullscreenable: false, skipTaskbar: true, alwaysOnTop: true, focusable: false, show: false,
        acceptFirstMouse: true, webPreferences: { ...SAFE_WEB_PREFERENCES, preload: this.o.preloadPath, ...(this.o.offscreen ? { offscreen: true } : {}) },
      });
      // The bubble's level: above his own window, never above Windows' alerts.
      w.setAlwaysOnTop(true, 'pop-up-menu');
      w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      lockDown(w.webContents);
      denyPermissions(w.webContents.session);
      void w.loadURL(`${this.o.origin}/noteheld.html`);
      w.on('closed', () => { this.win = null; });
      this.win = w;
      return w;
    } catch (e) { console.error('shell: the held note could not be made: ' + (e as Error).message); return null; }
  }
  private sizeNow(): { s: number; x: number; y: number; w: number; h: number } | null {
    const at = this.o.pet();
    if (!at) return null;
    const s = at.scale || 1, head = headOf(at);
    const w = Math.round(ART.w * ART.px * s), h = Math.round(ART.h * ART.px * s);
    return { s, x: Math.round(head.x + ART.dx * s), y: Math.round(head.y + (ART.dy + this.off) * s), w, h };
  }
  private place(): void {
    const w = this.win, b = this.sizeNow();
    if (!w || w.isDestroyed() || !b) return;
    // Compared with what was last asked for, not what Windows gave (it may round a tiny window up).
    const key = `${b.x},${b.y},${b.w},${b.h}`;
    if (key !== this.lastKey) {
      this.lastKey = key;
      w.setBounds({ x: b.x, y: b.y, width: b.w, height: b.h });
      // Windows keeps a tiny window a little taller than asked: only the paper itself is the window (seen, and clicked).
      try { w.setShape([{ x: 0, y: 0, width: b.w, height: b.h }]); } catch { /* not on this system */ }
    }
  }
  private send(): void {
    const w = this.win, b = this.sizeNow();
    if (!w || w.isDestroyed()) return;
    const px = ART.px * (b?.s ?? 1);
    // Whole device pixels per art pixel, so the paper stays as crisp as his sprite.
    const go = () => w.webContents.send('held:data', { ...this.colours, px: Math.max(1, Math.round(px * screenScale(w))) });
    if (w.webContents.isLoading()) w.webContents.once('did-finish-load', go); else go();
  }
  /** A spring from where it is to `to` (frame pixels below rest), opacity with it; `done` once it settles. */
  private spring(to: number, done?: () => void): void {
    if (this.anim) clearInterval(this.anim);
    const w = this.win;
    if (!w || w.isDestroyed()) return;
    let x = this.off, v = 0;
    const omega = 4 / (0.82 * 0.34), zeta = 0.82;
    let last = Date.now();
    this.anim = setInterval(() => {
      // Real time between ticks: a 16 ms timer often fires every 31 ms on Windows, and the spring must not slow down with it.
      const now = Date.now(), dt = Math.min(0.04, Math.max(0.004, (now - last) / 1000)); last = now;
      const a = -omega * omega * (x - to) - 2 * zeta * omega * v;
      v += a * dt; x += v * dt;
      const settled = Math.abs(x - to) < 0.3 && Math.abs(v) < 2;
      if (settled) x = to;
      this.off = x;
      if (!w.isDestroyed()) { w.setOpacity(Math.max(0, Math.min(1, 1 - Math.max(0, x) / LIFT))); this.place(); }
      if (settled) { if (this.anim) clearInterval(this.anim); this.anim = null; done?.(); }
    }, 16);
  }
  /** The bubble says a noticed note is on show (its colours), or that it went. */
  set(a: { on: boolean; paper?: string; deep?: string }): void {
    const ok = (c: unknown) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
    if (a.on) {
      if (ok(a.paper) && ok(a.deep)) this.colours = { paper: a.paper!, deep: a.deep! };
      const w = this.window();
      if (!w || !this.o.pet()) return;
      this.send();
      if (!this.on) {
        this.on = true;
        this.off = LIFT;
        w.setOpacity(0);
        this.place();
        const show = () => { if (this.on && !w.isDestroyed()) { w.showInactive(); this.spring(0); } };
        if (w.webContents.isLoading()) w.webContents.once('did-finish-load', () => setTimeout(show, 30)); else show();
        if (!this.follow) this.follow = setInterval(() => { if (!this.anim) this.place(); }, 120);
      }
      return;
    }
    if (!this.on) return;
    this.on = false;
    if (this.follow) { clearInterval(this.follow); this.follow = null; }
    this.spring(LIFT + 2, () => { const w = this.win; if (w && !w.isDestroyed() && !this.on) w.hide(); });
  }
  get showing(): boolean { return this.on; }
  owns(wc: Electron.WebContents): boolean { return !!this.win && !this.win.isDestroyed() && this.win.webContents === wc; }
  close(): void { if (this.anim) clearInterval(this.anim); if (this.follow) clearInterval(this.follow); this.anim = this.follow = null; this.on = false; if (this.win && !this.win.isDestroyed()) this.win.destroy(); this.win = null; }
}
function screenScale(w: BrowserWindow): number {
  try { return screen.getDisplayMatching(w.getBounds()).scaleFactor || 1; } catch { return 1; }
}

export interface Notes60Deps {
  held: () => NoteHeld | null;
  notes: () => NoteWindows | null;
  /** True for the bubble's own page (main.ts fromBubble). */
  fromBubble: (e: Electron.IpcMainEvent) => boolean;
  /** To the brain. */
  send: (m: Record<string, unknown>) => unknown;
  /** To the bubble page, as a brain message. */
  toBubble: (m: Record<string, unknown>) => void;
}
/** The doors. Each is taken only from the page that may send it. */
export function wireNotes60(d: Notes60Deps): void {
  ipcMain.on('bubble:noticeheld', (e, a) => { if (d.fromBubble(e) && a && typeof a === 'object') d.held()?.set({ on: a.on === true, paper: a.paper, deep: a.deep }); });
  // The held paper clicked: the note opens on the board, the line goes.
  ipcMain.on('held:open', (e) => { const h = d.held(); if (!h?.owns(e.sender) || !h.showing) return; d.toBubble({ t: 'notes.board', openNotice: true }); });
  ipcMain.on('held:hover', (e, on) => { if (d.held()?.owns(e.sender)) d.toBubble({ t: 'held.hover', on: on === true }); });
  ipcMain.on('bubble:notecat', (e, name) => { if (d.fromBubble(e) && typeof name === 'string' && name.trim()) d.send({ t: 'notes.cat', name: name.slice(0, 24) }); });
  ipcMain.on('note:quickdone', (e, n) => { d.notes()?.quickDone(e.sender, n); });
}

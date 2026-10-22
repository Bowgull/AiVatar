// Sheet 17: each running timer is a small window of its own, so he can put it anywhere on his screen.
//
// Never takes the keyboard (focusable: false), so WoW keeps it. Takes the mouse only over the plate, its keys
// and its menu; everywhere else passes through to whatever is behind. Pinned, it lets the mouse through
// entirely, like the pop-out, and Ctrl+Alt+P over it gives it back (main.ts).
import { BrowserWindow, screen } from 'electron';
import { readFileSync } from 'node:fs';
import { SAFE_WEB_PREFERENCES, denyPermissions, lockDown } from './safety.ts';
import { writeFileAtomic } from './atomic.ts';
import type { FamilyHooks } from './familywin.ts';

export interface TimerData { id: string; label: string; total: number; end: number; paused: number }
interface Spot { x: number; y: number }

const W = 220, H = 170;          // the plate sits in the top-left; the rest is room for the keys and the menu

export class TimerWindows {
  private readonly wins = new Map<string, { w: BrowserWindow; pinned: boolean }>();
  private dragFrom: { id: string; x: number; y: number } | null = null;
  private readonly o: { origin: string; preloadPath: string; spotFile: string; near: () => Spot | null };

  constructor(o: { origin: string; preloadPath: string; spotFile: string; near: () => Spot | null }) { this.o = o; }

  /** The brain's list is the truth: open what is new, update what is there, close what is gone. */
  sync(list: TimerData[]): void {
    const keep = new Set(list.map((t) => t.id));
    for (const [id, v] of this.wins) if (!keep.has(id)) { if (!v.w.isDestroyed()) v.w.destroy(); this.wins.delete(id); }
    list.forEach((t, i) => {
      let v = this.wins.get(t.id);
      if (!v || v.w.isDestroyed()) { v = { w: this.make(i), pinned: false }; this.wins.set(t.id, v); this.joinFamily(t.id, v.w); }
      const w = v.w;
      if (w.webContents.isLoading()) w.webContents.once('did-finish-load', () => w.webContents.send('timer:data', t));
      else w.webContents.send('timer:data', t);
    });
  }

  private make(index: number): BrowserWindow {
    const at = this.startSpot(index);
    const w = new BrowserWindow({
      x: at.x, y: at.y, width: W, height: H,
      frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false, resizable: false, movable: true,
      minimizable: false, maximizable: false, fullscreenable: false, skipTaskbar: true, alwaysOnTop: true,
      focusable: false, show: false,
      webPreferences: { ...SAFE_WEB_PREFERENCES, preload: this.o.preloadPath },
    });
    // Above a full-screen game, the same level the pop-out uses.
    w.setAlwaysOnTop(true, 'screen-saver');
    w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    lockDown(w.webContents);
    denyPermissions(w.webContents.session);
    w.setIgnoreMouseEvents(true, { forward: true });
    void w.loadURL(`${this.o.origin}/timer.html`);
    w.once('ready-to-show', () => w.showInactive());
    return w;
  }

  /** Where he last left a timer; the first time, just left of Aang's head. A second and third stack below. */
  private startSpot(index: number): Spot {
    let s: Spot | null = null;
    try { const raw = JSON.parse(readFileSync(this.o.spotFile, 'utf8')) as Spot; if (Number.isFinite(raw.x) && Number.isFinite(raw.y)) s = raw; } catch { /* first time */ }
    s ??= this.o.near() ?? (() => { const a = screen.getPrimaryDisplay().workArea; return { x: a.x + a.width - 420, y: a.y + a.height - 320 }; })();
    const area = screen.getDisplayNearestPoint(s).workArea;
    const x = Math.min(Math.max(s.x, area.x), area.x + area.width - W);
    const y = Math.min(Math.max(s.y + index * 64, area.y), area.y + area.height - 70);
    return { x: Math.round(x), y: Math.round(y) };
  }

  /** Which window a page message came from, by its contents. */
  idOf(sender: Electron.WebContents): string | null {
    for (const [id, v] of this.wins) if (!v.w.isDestroyed() && v.w.webContents === sender) return id;
    return null;
  }
  owns(sender: Electron.WebContents): boolean { return this.idOf(sender) !== null; }

  clickable(sender: Electron.WebContents, on: boolean): void {
    const id = this.idOf(sender); const v = id ? this.wins.get(id) : null;
    if (!v || v.pinned) return;
    v.w.setIgnoreMouseEvents(!on, { forward: true });
  }
  opacity(sender: Electron.WebContents, n: number): void {
    const id = this.idOf(sender); const v = id ? this.wins.get(id) : null;
    if (v && Number.isFinite(n)) { v.w.setOpacity(Math.max(0.25, Math.min(1, n))); this.family?.shared('timer:' + id, { opacity: n }); }
  }

  // ---------------------------------------------------------------- the window family (F2, 2026-10-22)
  /** Set by familywire.ts: timers snap to the video, jobs, notes and each other, and share see-through and pin. */
  family: FamilyHooks | null = null;
  private joinFamily(id: string, w: BrowserWindow): void {
    this.family?.add({
      id: 'timer:' + id, kind: 'timer', win: () => (w.isDestroyed() ? null : w), card: '.tw',
      setOpacity: (n) => { if (!w.isDestroyed()) w.setOpacity(Math.max(0.25, Math.min(1, n))); },
      setPinned: (on) => this.applyPinned(id, on),
      moved: () => { if (!w.isDestroyed()) { const [x, y] = w.getPosition(); try { writeFileAtomic(this.o.spotFile, JSON.stringify({ x, y })); } catch { /* not worth failing over */ } } },
    });
  }

  drag(sender: Electron.WebContents, phase: string, dx = 0, dy = 0): void {
    const id = this.idOf(sender); const v = id ? this.wins.get(id) : null;
    if (!v || v.pinned) return;
    // The family moves it (and whatever it is joined to), and snaps it.
    if (this.family?.drag('timer:' + id, phase, dx, dy)) {
      if (phase === 'end') { const [x, y] = v.w.getPosition(); try { writeFileAtomic(this.o.spotFile, JSON.stringify({ x, y })); } catch { /* not worth failing over */ } }
      return;
    }
    const [x, y] = v.w.getPosition();
    if (phase === 'start') { this.dragFrom = { id: id!, x, y }; return; }
    if (!this.dragFrom || this.dragFrom.id !== id) return;
    if (phase === 'move') { v.w.setPosition(Math.round(this.dragFrom.x + dx), Math.round(this.dragFrom.y + dy)); return; }
    if (phase === 'end') { this.dragFrom = null; try { writeFileAtomic(this.o.spotFile, JSON.stringify({ x, y })); } catch { /* not worth failing over */ } }
  }

  /** Pinned, the mouse goes straight through it to the game. */
  setPinned(id: string, on: boolean): void {
    this.applyPinned(id, on);
    if (this.wins.has(id)) this.family?.shared('timer:' + id, { pinned: on });
  }
  private applyPinned(id: string, on: boolean): void {
    const v = this.wins.get(id);
    if (!v || v.w.isDestroyed()) return;
    v.pinned = on;
    v.w.setIgnoreMouseEvents(true, on ? undefined : { forward: true });
    v.w.webContents.send('timer:pinned', on);
  }
  pin(sender: Electron.WebContents): void { const id = this.idOf(sender); if (id) this.setPinned(id, true); }

  /** Ctrl+Alt+P: the timer under the mouse, if any, flips its pin. True when one did. */
  togglePinAt(p: Spot): boolean {
    for (const [id, v] of this.wins) {
      if (v.w.isDestroyed() || !v.w.isVisible()) continue;
      const b = v.w.getBounds();
      // only the plate's corner counts, not the empty room around it
      if (p.x >= b.x && p.x < b.x + 180 && p.y >= b.y && p.y < b.y + 70) { this.setPinned(id, !v.pinned); return true; }
    }
    return false;
  }
  get any(): boolean { for (const v of this.wins.values()) if (!v.w.isDestroyed() && v.w.isVisible()) return true; return false; }
}

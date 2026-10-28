// Sheet 17, rebuilt by sheet 67 v2 + 67b (2026-10-22): each timer is a small window of its own, so he can put it anywhere.
//
// Never takes the keyboard (focusable: false), so WoW keeps it; only while he renames it (the menu's Rename, typed on the
// nameplate) does it take the keys, and they go back on Enter, Esc or a click away. Takes the mouse only over the plate
// and its keys; everywhere else passes through to whatever is behind. Pinned, it lets the mouse through entirely, like the
// pop-out, and Ctrl+Alt+P over it gives it back (main.ts).
//
// A finished timer stays (the brain keeps it as `done`) so its hourglass shows the end: Again / +5 / hold X. A window
// family member (familywire.ts): it snaps to the video, jobs, notes and other timers, as a compact column beside a taller
// window (family.ts tall.fitHeight), and its right-click is its OWN menu (TimerMenu below) with the family's rows in it.
import { BrowserWindow, powerMonitor, screen } from 'electron';
import { readFileSync } from 'node:fs';
import { SAFE_WEB_PREFERENCES, denyPermissions, lockDown } from './safety.ts';
import { writeFileAtomic } from './atomic.ts';
import type { FamilyHooks } from './familywin.ts';

export interface TimerData { id: string; label: string; total: number; end: number; paused: number; colour?: string; done?: number }
interface Spot { x: number; y: number }
export interface TimerOptions {
  origin: string; preloadPath: string; spotFile: string; near: () => Spot | null;
  /** To the brain (a new timer from the menu, a colour, a stop). */
  toBrain?: (m: Record<string, unknown>) => void;
  /** Rename is done: the keyboard goes back to the window he was in. */
  refocus?: () => void;
  /** The Mac (2026-10-28): before a rename takes the keyboard, the app must be made active, or the keys go elsewhere. */
  takeKeys?: () => void;
  iconPath?: string;
  /** Tests: keep the menu on its own rectangle instead of a real screen's work area. */
  menuArea?: () => Electron.Rectangle;
}

// The plate sits at (10, 16); the rest is room for the keys under it, the +1:00 chip over it and the hop, and for the
// taller compact column it becomes beside a taller window (about 175 high plus its keys). The empty room lets the mouse
// through, and the family measures the plate, never the window.
const W = 300, H = 250;
export const COLOURS = ['blue', 'gold', 'rose', 'jade', 'violet'];

export class TimerWindows {
  private readonly wins = new Map<string, { w: BrowserWindow; pinned: boolean; through?: boolean; hot?: boolean; t: TimerData }>();
  private dragFrom: { id: string; x: number; y: number } | null = null;
  private calmOn = false;
  readonly menu: TimerMenu;
  private readonly o: TimerOptions;

  constructor(o: TimerOptions) {
    this.o = o;
    this.menu = new TimerMenu(o, (id, m) => this.picked(id, m));
    // back from sleep: every page gets its timer again (it redraws the exact picture at once)
    try { powerMonitor.on('resume', () => { for (const v of this.wins.values()) if (!v.w.isDestroyed()) v.w.webContents.send('timer:data', v.t); }); } catch { /* not ready: no matter */ }
  }

  /** The brain's list is the truth: open what is new, update what is there, close what is gone. */
  sync(list: TimerData[]): void {
    const keep = new Set(list.map((t) => t.id));
    for (const [id, v] of this.wins) if (!keep.has(id)) { this.menu.closeFor(id); this.family?.remove('timer:' + id); if (!v.w.isDestroyed()) v.w.destroy(); this.wins.delete(id); }
    let fresh = 0;
    list.forEach((t) => {
      let v = this.wins.get(t.id);
      if (!v || v.w.isDestroyed()) { v = { w: this.make(this.wins.size + fresh++), pinned: false, t }; this.wins.set(t.id, v); this.joinFamily(t.id, v.w); }
      v.t = t;
      const w = v.w;
      const send = () => { if (w.isDestroyed()) return; w.webContents.send('timer:data', t); if (this.calmOn) w.webContents.send('timer:calm', true); };
      if (w.webContents.isLoading()) w.webContents.once('did-finish-load', send); else send();
    });
    if (!this.wins.size) this.menu.dispose();
  }

  private make(index: number): BrowserWindow {
    const at = this.startSpot(index);
    const w = new BrowserWindow({
      x: at.x, y: at.y, width: W, height: H,
      frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false, resizable: false, movable: true,
      minimizable: false, maximizable: false, fullscreenable: false, skipTaskbar: true, alwaysOnTop: true,
      focusable: false, show: false, title: 'Timer',
      webPreferences: { ...SAFE_WEB_PREFERENCES, preload: this.o.preloadPath },
    });
    if (this.o.iconPath) { try { w.setIcon(this.o.iconPath); } catch { /* the default icon */ } }
    // Above a full-screen game, the same level the pop-out uses.
    w.setAlwaysOnTop(true, 'screen-saver');
    w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
    lockDown(w.webContents);
    denyPermissions(w.webContents.session);
    w.setIgnoreMouseEvents(true, { forward: true });
    // Rename lost the keyboard (he clicked away): the page keeps what he typed and gives the keys back.
    w.on('blur', () => { if (w.isFocusable()) { w.setFocusable(false); } });
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
    const y = Math.min(Math.max(s.y + index * 100, area.y), area.y + area.height - 110);
    return { x: Math.round(x), y: Math.round(y) };
  }

  /** Which window a page message came from, by its contents. */
  idOf(sender: Electron.WebContents): string | null {
    for (const [id, v] of this.wins) if (!v.w.isDestroyed() && v.w.webContents === sender) return id;
    return null;
  }
  owns(sender: Electron.WebContents): boolean { return this.idOf(sender) !== null; }
  /** For the tests and the taskbar: its window. */
  windowOf(id: string): BrowserWindow | null { const v = this.wins.get(id); return v && !v.w.isDestroyed() ? v.w : null; }

  clickable(sender: Electron.WebContents, on: boolean): void {
    const id = this.idOf(sender); const v = id ? this.wins.get(id) : null;
    if (!v || v.pinned || v.through) return;
    v.hot = on;
    v.w.setIgnoreMouseEvents(!on, { forward: true });
  }
  /**
   * The Mac (2026-10-28): macOS sends no mouse moves to a window that lets clicks through, so the page never learns the
   * pointer is on it and its keys could not be clicked. The Mac app follows the pointer and calls this: a timer takes
   * the mouse while the pointer is over it. True while there is a timer to follow.
   */
  pointerAt(p: { x: number; y: number }): boolean {
    let any = false;
    for (const v of this.wins.values()) {
      if (v.w.isDestroyed() || v.pinned || v.through) continue;
      any = true;
      const b = v.w.getBounds();
      const on = p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height;
      if (on !== v.hot) { v.hot = on; v.w.setIgnoreMouseEvents(!on, { forward: true }); }
    }
    return any;
  }
  opacity(sender: Electron.WebContents, n: number): void {
    const id = this.idOf(sender); const v = id ? this.wins.get(id) : null;
    if (v && Number.isFinite(n)) { v.w.setOpacity(Math.max(0.25, Math.min(1, n))); this.family?.shared('timer:' + id, { opacity: n }); }
  }
  /** A game is in front (the pet's quiet state): calm sand, one paint per grain. */
  calm(on: boolean): void {
    if (on === this.calmOn) return;
    this.calmOn = on;
    for (const v of this.wins.values()) if (!v.w.isDestroyed() && !v.w.webContents.isLoading()) v.w.webContents.send('timer:calm', on);
  }

  // ---------------------------------------------------------------- its menu and rename (sheet 67 v2)
  /** Right-click on a plate: its own menu at the mouse, with the family's rows when it is joined. */
  openMenu(sender: Electron.WebContents, at: { x: number; y: number } | null): void {
    const id = this.idOf(sender); const v = id ? this.wins.get(id) : null;
    if (!id || !v || v.pinned) return;
    const fam = this.family?.menuState?.('timer:' + id) ?? null;
    this.menu.open(id, at ?? screen.getCursorScreenPoint(), { label: v.t.label, colour: v.t.colour ?? 'blue', paused: v.t.paused > 0, done: !!v.t.done, fam });
  }
  private picked(id: string, m: { what: string; ms: number; value: number; colour: string }): void {
    const v = this.wins.get(id);
    if (!v || v.w.isDestroyed()) return;
    const send = this.o.toBrain ?? (() => {});
    const famId = 'timer:' + id;
    switch (m.what) {
      case 'new': if (m.ms >= 1000 && m.ms <= 24 * 3_600_000) send({ t: 'timer.start', ms: Math.round(m.ms), label: '' }); break;
      case 'rename': this.beginRename(id); break;
      case 'colour': if (COLOURS.includes(m.colour)) send({ t: 'timer.act', id, action: 'colour', colour: m.colour }); break;
      // the page turns it over (the sand runs), then tells the brain: the same as holding the glass
      case 'restart': v.w.webContents.send('timer:do', 'restart'); break;
      case 'stop': send({ t: 'timer.act', id, action: 'stop' }); break;
      case 'opacity': this.family?.pick?.(famId, 'opacity', Math.max(0.3, Math.min(1, m.value))); break;
      case 'pin': case 'through': case 'apart': this.family?.pick?.(famId, m.what); break;
      default: break;
    }
  }
  /** Rename: the window takes the keyboard only while the nameplate is being edited. */
  beginRename(id: string): void {
    const v = this.wins.get(id);
    if (!v || v.w.isDestroyed()) return;
    v.w.setIgnoreMouseEvents(false);
    v.w.setFocusable(true);
    this.o.takeKeys?.();
    v.w.focus(); v.w.webContents.focus();
    v.w.webContents.send('timer:do', 'rename');
  }
  /** Rename finished on the page: the keys go back to where he was. */
  typing(sender: Electron.WebContents, on: boolean): void {
    const id = this.idOf(sender); const v = id ? this.wins.get(id) : null;
    if (!v || on) return;
    const had = v.w.isFocusable();
    v.w.setFocusable(false);
    if (!v.pinned && !v.through) v.w.setIgnoreMouseEvents(true, { forward: true });
    if (had) this.o.refocus?.();
  }

  // ---------------------------------------------------------------- the window family (F2, 2026-10-22)
  /** Set by familywire.ts: timers snap to the video, jobs, notes and each other, and share see-through and pin. */
  family: FamilyHooks | null = null;
  private joinFamily(id: string, w: BrowserWindow): void {
    this.family?.add({
      id: 'timer:' + id, kind: 'timer', win: () => (w.isDestroyed() ? null : w), card: '.tw', ownMenu: true,
      setOpacity: (n) => { if (!w.isDestroyed()) w.setOpacity(Math.max(0.25, Math.min(1, n))); },
      setPinned: (on) => this.applyPinned(id, on),
      // 1b: the family's "Pin on top" is only on top, and a timer always is; its own Pin (click-through too) is separate.
      setOnTop: () => {},
      // Click-through (1b): its plate stops asking for the mouse; the rest of the window already lets clicks through.
      setThrough: (on) => { const v = this.wins.get(id); if (!v || v.w.isDestroyed()) return; v.through = on; if (!v.pinned) v.w.setIgnoreMouseEvents(true, { forward: true }); },
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
  /** The timer's own menu: "Click through" (1b). */
  toggleThrough(sender: Electron.WebContents): void { const id = this.idOf(sender); if (id) this.family?.setThrough('timer:' + id); }
  pin(sender: Electron.WebContents): void { const id = this.idOf(sender); if (id) this.setPinned(id, true); }

  /** Ctrl+Alt+P: the timer under the mouse, if any, flips its pin. True when one did. */
  togglePinAt(p: Spot): boolean {
    for (const [id, v] of this.wins) {
      if (v.w.isDestroyed() || !v.w.isVisible()) continue;
      const b = v.w.getBounds();
      // only the plate, not the empty room around it
      if (p.x >= b.x + 10 && p.x < b.x + b.width - 10 && p.y >= b.y + 16 && p.y < b.y + 120) { this.setPinned(id, !v.pinned); return true; }
    }
    return false;
  }
  get any(): boolean { for (const v of this.wins.values()) if (!v.w.isDestroyed() && v.w.isVisible()) return true; return false; }
}

// ------------------------------------------------------------------------------------------------ the right-click menu

/**
 * A timer's menu (sheet 67 v2): one see-through window over the work area, cut to the menus' shape (the menu and its side
 * submenu), like the family's and Aang's own. It takes the keyboard while it is up (Esc, the Custom field) and closes
 * when he clicks away or picks. Made on the first right-click and kept while any timer is up.
 */
export class TimerMenu {
  private w: BrowserWindow | null = null;
  private shownAt = 0;
  private forId = '';
  private pending = false;
  private readonly o: TimerOptions;
  private readonly onPick: (id: string, m: { what: string; ms: number; value: number; colour: string }) => void;
  constructor(o: TimerOptions, onPick: (id: string, m: { what: string; ms: number; value: number; colour: string }) => void) { this.o = o; this.onPick = onPick; }

  private window(): BrowserWindow {
    if (this.w && !this.w.isDestroyed()) return this.w;
    const w = new BrowserWindow({
      width: 400, height: 400, frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false,
      resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
      skipTaskbar: true, alwaysOnTop: true, show: false, title: 'Timer',
      webPreferences: { ...SAFE_WEB_PREFERENCES, preload: this.o.preloadPath },
    });
    if (this.o.iconPath) { try { w.setIcon(this.o.iconPath); } catch { /* the default icon */ } }
    w.setAlwaysOnTop(true, 'screen-saver');
    lockDown(w.webContents);
    denyPermissions(w.webContents.session);
    w.on('blur', () => { if (Date.now() - this.shownAt > 120) this.close(); });
    void w.loadURL(`${this.o.origin}/timermenu.html`);
    this.w = w;
    return w;
  }
  owns(sender: Electron.WebContents): boolean { return !!this.w && !this.w.isDestroyed() && this.w.webContents === sender; }
  get visible(): boolean { return !!this.w && !this.w.isDestroyed() && this.w.isVisible(); }
  get windowNow(): BrowserWindow | null { return this.w && !this.w.isDestroyed() ? this.w : null; }

  open(id: string, at: { x: number; y: number }, s: Record<string, unknown>): void {
    const w = this.window();
    const a = this.o.menuArea?.() ?? screen.getDisplayNearestPoint(at).workArea;
    if (w.isVisible()) w.hide();
    w.setBounds({ x: a.x, y: a.y, width: a.width, height: a.height });
    this.forId = id; this.pending = true;
    const m = { ...s, x: at.x - a.x, y: at.y - a.y, w: a.width, h: a.height };
    const go = () => { if (!w.isDestroyed()) w.webContents.send('timer:menushow', m); };
    if (w.webContents.isLoading()) w.webContents.once('did-finish-load', go); else go();
  }
  /** The page laid the menus out: only they take the mouse. The first shape after a right-click shows the window. */
  shape(sender: Electron.WebContents, rects: unknown): void {
    const w = this.w;
    if (!w || w.isDestroyed() || w.webContents !== sender || !this.forId || !Array.isArray(rects)) return;
    const [ww, wh] = w.getContentSize();
    const ok = rects.slice(0, 2).map((r) => {
      const v = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>;
      const x = Math.max(0, Math.round(Number(v.x) || 0)), y = Math.max(0, Math.round(Number(v.y) || 0));
      return { x, y, width: Math.max(1, Math.min(ww - x, Math.round(Number(v.width) || 0))), height: Math.max(1, Math.min(wh - y, Math.round(Number(v.height) || 0))) };
    });
    if (!ok.length) return;
    w.setShape(ok);
    if (this.pending) { this.pending = false; this.shownAt = Date.now(); w.show(); w.focus(); }
  }
  pick(sender: Electron.WebContents, m: unknown): void {
    if (!this.owns(sender) || !m || typeof m !== 'object') return;
    const v = m as Record<string, unknown>;
    const what = String(v.what ?? '');
    const id = this.forId;
    // the see-through slider keeps the menu up while he drags it; everything else closes it
    if (what !== 'opacity') this.close();
    if (!id || what === 'close') return;
    this.onPick(id, { what, ms: Number(v.ms) || 0, value: Number(v.value) || 0, colour: String(v.colour ?? '') });
  }
  closeFor(id: string): void { if (this.forId === id) this.close(); }
  close(): void {
    const w = this.w;
    this.forId = ''; this.pending = false;
    if (!w || w.isDestroyed()) return;
    if (w.isVisible()) w.hide();
    w.webContents.send('timer:menushow', null);
  }
  dispose(): void { this.close(); if (this.w && !this.w.isDestroyed()) this.w.destroy(); this.w = null; }
}

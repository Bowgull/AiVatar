// Sheet 17: a note stuck on his screen is a small window of its own. He drags it by its top, resizes it from the
// corner, types on it, right-clicks it, pins it so the mouse goes through to the game, or drops it on Aang to put
// it back on the board.
//
// It CAN take the keyboard, because he types on it; it is only ever shown without taking it (showInactive), so
// a note appearing never steals his game's keys. Clicking into it is him choosing to type.
import { BrowserWindow, screen } from 'electron';
import { SAFE_WEB_PREFERENCES, denyPermissions, lockDown } from './safety.ts';
import type { FamilyHooks } from './familywin.ts';

export interface NoteOut { x: number; y: number; w: number; h: number; opacity: number; pinned: boolean }
export interface NoteData { id: string; title: string; html: string; col: string; font: string; size: string; out?: NoteOut; updated: number }

const PAD = 14;                    // room around the paper for its pin and shadow
const MENU_W = 280, MENU_H = 520;  // the room the right-click menu needs while it is open

export class NoteWindows {
  private readonly wins = new Map<string, { w: BrowserWindow; note: NoteData; menu: boolean }>();
  private drag: { id: string; x: number; y: number; w: number; h: number } | null = null;
  private readonly o: { origin: string; preloadPath: string; save: (n: NoteData) => void; overAang: (p: { x: number; y: number }) => boolean };
  constructor(o: { origin: string; preloadPath: string; save: (n: NoteData) => void; overAang: (p: { x: number; y: number }) => boolean }) { this.o = o; }

  /** The brain's notes are the truth: a window for each one that is out, none for the rest. */
  sync(notes: NoteData[]): void {
    const out = new Map(notes.filter((n) => n.out).map((n) => [n.id, n]));
    for (const [id, v] of this.wins) if (!out.has(id)) { if (!v.w.isDestroyed()) v.w.destroy(); this.wins.delete(id); }
    for (const n of out.values()) this.show(n);
  }

  /** Open (or update) the window for one note, without waiting for the brain. */
  show(n: NoteData): BrowserWindow | null {
    if (!n.out) return null;
    let v = this.wins.get(n.id);
    if (!v || v.w.isDestroyed()) { v = { w: this.make(n.out), note: n, menu: false }; this.wins.set(n.id, v); this.joinFamily(n.id, v.w); }
    else v.note = n;
    const w = v.w;
    if (!v.menu && this.drag?.id !== n.id) {
      const b = { x: n.out.x - PAD, y: n.out.y - PAD, width: n.out.w + PAD * 2, height: n.out.h + PAD * 2 };
      const now = w.getBounds();
      if (now.x !== b.x || now.y !== b.y || now.width !== b.width || now.height !== b.height) w.setBounds(b);
    }
    w.setOpacity(n.out.opacity);
    this.applyMouse(n.id);
    const send = () => w.webContents.send('note:data', n);
    if (w.webContents.isLoading()) w.webContents.once('did-finish-load', send); else send();
    return w;
  }

  private make(o: NoteOut): BrowserWindow {
    const w = new BrowserWindow({
      x: o.x - PAD, y: o.y - PAD, width: o.w + PAD * 2, height: o.h + PAD * 2,
      frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false, resizable: false, movable: true,
      minimizable: false, maximizable: false, fullscreenable: false, skipTaskbar: true, alwaysOnTop: true, show: false,
      webPreferences: { ...SAFE_WEB_PREFERENCES, preload: this.o.preloadPath },
    });
    w.setAlwaysOnTop(true, 'screen-saver');
    w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    lockDown(w.webContents);
    denyPermissions(w.webContents.session);
    void w.loadURL(`${this.o.origin}/note.html`);
    w.once('ready-to-show', () => w.showInactive());
    return w;
  }

  /** Which note a page message came from. A page can only ever speak for its own note. */
  of(sender: Electron.WebContents): { id: string; w: BrowserWindow; note: NoteData; menu: boolean } | null {
    for (const [id, v] of this.wins) if (!v.w.isDestroyed() && v.w.webContents === sender) return { id, ...v };
    return null;
  }

  // ---------------------------------------------------------------- the window family (F2, 2026-10-22)
  /** Set by familywire.ts: notes snap to the video, jobs, timers and each other, and share see-through and pin. */
  family: FamilyHooks | null = null;
  /** Notes letting clicks through by the family's say (its menu or the note's own "Click through"), 1b. */
  private readonly through = new Set<string>();
  /** Pinned: clicks go straight through (as before). Click-through (1b): the same, with the mouse still seen moving. */
  private applyMouse(id: string): void {
    const v = this.wins.get(id);
    if (!v || v.w.isDestroyed()) return;
    const pinned = !!v.note.out?.pinned, thr = this.through.has(id);
    if (thr && !pinned) v.w.setIgnoreMouseEvents(true, { forward: true }); else v.w.setIgnoreMouseEvents(pinned);
  }
  /** The note's own menu: "Click through" (1b). */
  toggleThrough(sender: Electron.WebContents): void { const v = this.of(sender); if (v) this.family?.setThrough('note:' + v.id); }
  private joinFamily(id: string, w: BrowserWindow): void {
    this.family?.add({
      id: 'note:' + id, kind: 'note', win: () => (w.isDestroyed() ? null : w), card: '.sticky',
      setOpacity: (n) => this.applyOpacity(id, n),
      setPinned: (on) => this.applyPinned(id, on),
      // 1b: the family's "Pin on top" is only on top, and a note always is; its own Pin (click-through too) is separate.
      setOnTop: () => {},
      setThrough: (on) => { if (on) this.through.add(id); else this.through.delete(id); this.applyMouse(id); },
      resize: (width, height) => { if (!w.isDestroyed()) { const b = w.getBounds(); w.setBounds({ ...b, width: width + PAD * 2, height: height + PAD * 2 }); this.savePlace(id); } },
      moved: () => this.savePlace(id),
    });
  }
  /** Where the family put it, written down so the brain's next list does not put it back. */
  private savePlace(id: string): void {
    const v = this.wins.get(id);
    if (!v || v.w.isDestroyed() || !v.note.out || v.menu) return;
    const nb = v.w.getBounds();
    const note = { ...v.note, out: { ...v.note.out, x: nb.x + PAD, y: nb.y + PAD, w: nb.width - PAD * 2, h: nb.height - PAD * 2 } };
    v.note = note;
    this.o.save(note);
  }

  /** Drag by the top, or resize from the corner: the page says how far, the window follows. */
  move(sender: Electron.WebContents, kind: 'drag' | 'resize', phase: string, dx: number, dy: number): void {
    const v = this.of(sender);
    if (!v || !v.note.out || v.note.out.pinned) return;
    // Dragged by the top: the family moves it (and whatever it is joined to), and snaps it.
    const fid = 'note:' + v.id;
    if (kind === 'drag' && this.family && phase !== 'end' && this.family.drag(fid, phase, dx, dy)) { if (phase === 'start') this.drag = { id: v.id, x: 0, y: 0, w: 0, h: 0 }; return; }
    if (kind === 'drag' && this.family && phase === 'end' && this.drag?.id === v.id) {
      this.drag = null;
      // Dropped on Aang or his bubble, on its own: back on the board. Joined to others, it stays with them.
      if (!this.family.joined(fid) && this.o.overAang(screen.getCursorScreenPoint())) { this.family.drag(fid, 'cancel'); this.back(v.id); return; }
      this.family.drag(fid, 'end', dx, dy);
      this.savePlace(v.id);
      return;
    }
    const b = v.w.getBounds();
    if (phase === 'start') { this.drag = { id: v.id, x: b.x, y: b.y, w: b.width, h: b.height }; return; }
    const d = this.drag;
    if (!d || d.id !== v.id) return;
    if (phase === 'move') {
      if (kind === 'drag') v.w.setPosition(Math.round(d.x + dx), Math.round(d.y + dy));
      else v.w.setBounds({ x: d.x, y: d.y, width: Math.max(170 + PAD * 2, Math.round(d.w + dx)), height: Math.max(120 + PAD * 2, Math.round(d.h + dy)) });
      return;
    }
    if (phase !== 'end') return;
    this.drag = null;
    // Dropped on Aang or his bubble: back on the board.
    if (kind === 'drag' && this.o.overAang(screen.getCursorScreenPoint())) { this.back(v.id); return; }
    const nb = v.w.getBounds();
    const note = { ...v.note, out: { ...v.note.out, x: nb.x + PAD, y: nb.y + PAD, w: nb.width - PAD * 2, h: nb.height - PAD * 2 } };
    this.wins.get(v.id)!.note = note;
    this.o.save(note);
  }

  /** While the right-click menu is open the window grows to fit it, then goes back. */
  menu(sender: Electron.WebContents, open: boolean, at: { x: number; y: number } | null = null): void {
    const v = this.of(sender);
    if (!v || !v.note.out) return;
    const entry = this.wins.get(v.id)!;
    entry.menu = open;
    const o = v.note.out;
    const area = screen.getDisplayNearestPoint({ x: o.x, y: o.y }).workArea;
    // Big enough for the menu to open right where he clicked (`at` is inside the window).
    const needW = Math.max(o.w + PAD * 2, (at?.x ?? o.w) + MENU_W), needH = Math.max(o.h + PAD * 2, (at?.y ?? 0) + MENU_H);
    if (open) v.w.setBounds({ x: o.x - PAD, y: o.y - PAD, width: Math.min(needW, area.x + area.width - (o.x - PAD)), height: Math.min(needH, area.y + area.height - (o.y - PAD)) });
    else v.w.setBounds({ x: o.x - PAD, y: o.y - PAD, width: o.w + PAD * 2, height: o.h + PAD * 2 });
  }

  setOpacity(sender: Electron.WebContents, n: number): void {
    const v = this.of(sender);
    if (!v || !v.note.out || !Number.isFinite(n)) return;
    this.applyOpacity(v.id, n);
    this.family?.shared('note:' + v.id, { opacity: n });
  }
  private applyOpacity(id: string, n: number): void {
    const v = this.wins.get(id);
    if (!v || v.w.isDestroyed() || !v.note.out || !Number.isFinite(n)) return;
    const op = Math.max(0.25, Math.min(1, n));
    v.w.setOpacity(op);
    const note = { ...v.note, out: { ...v.note.out, opacity: op } };
    v.note = note;
    this.o.save(note);
  }
  setPinned(id: string, on: boolean): void {
    this.applyPinned(id, on);
    if (this.wins.has(id)) this.family?.shared('note:' + id, { pinned: on });
  }
  private applyPinned(id: string, on: boolean): void {
    const v = this.wins.get(id);
    if (!v || v.w.isDestroyed() || !v.note.out) return;
    const note = { ...v.note, out: { ...v.note.out, pinned: on } };
    v.note = note;
    this.applyMouse(id);
    v.w.webContents.send('note:data', note);
    this.o.save(note);
  }
  back(id: string): void {
    const v = this.wins.get(id);
    if (!v) return;
    const note = { ...v.note };
    delete note.out;
    if (!v.w.isDestroyed()) v.w.destroy();
    this.wins.delete(id);
    this.o.save(note);
  }
  /** A note dragged out of the bubble: follow the mouse, then stay where he lets go. */
  pull(n: NoteData, p: { x: number; y: number }, phase: string): void {
    const out = { x: Math.round(p.x - 110), y: Math.round(p.y - 14), w: n.out?.w ?? 220, h: n.out?.h ?? 170, opacity: 1, pinned: false };
    const note = { ...n, out };
    if (phase === 'start') { this.show(note); return; }
    const v = this.wins.get(n.id);
    if (!v || v.w.isDestroyed()) return;
    v.note = note;
    if (phase === 'move') { v.w.setPosition(out.x - PAD, out.y - PAD); return; }
    if (phase === 'end') this.o.save(note);
  }

  /** Ctrl+Alt+P: the note under the mouse, if any, flips its pin. True when one did. */
  togglePinAt(p: { x: number; y: number }): boolean {
    for (const [id, v] of this.wins) {
      if (v.w.isDestroyed() || !v.w.isVisible()) continue;
      const b = v.w.getBounds();
      if (p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height) { this.setPinned(id, !v.note.out?.pinned); return true; }
    }
    return false;
  }
  get any(): boolean { for (const v of this.wins.values()) if (!v.w.isDestroyed() && v.w.isVisible()) return true; return false; }
}

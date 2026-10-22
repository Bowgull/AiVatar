// Sheet 52, the Claude job pop-out (2026-10-21, docs/cockpit/sheet-52-job-popout.html).
//
// A job pulled out of Aang's bubble floats on his desktop as JUST the job: the parchment job bar, no frame, no title bar,
// one pin. One small frameless see-through window per popped job. His picks on 52 (2026-10-21):
//   - see-through is B: a thin slider appears next to the pin while the mouse is on it; it never goes below 30%;
//   - E: the fade stays even with the mouse over it (it does not go solid);
//   - the pin is the only chrome, and it looks clearly pressed in and lit when pinned. Pinned means "stays on top",
//     nothing else (unlike the video pop-out, where pinned lets clicks through);
//   - folded by default, a click unfolds (about 520 ms with a soft spring) and folds (about 340 ms);
//   - JOB COMPLETE is teal with a tick and "Nice", which closes it;
//   - dragged anywhere by grabbing it; dropped on Aang or his bubble it goes back (the bubble grows to take it, no slot);
//   - "needs you" is a small blue chip; clicking it asks Aang's bubble to show that question.
//
// It never takes the keyboard (focusable: false, shown with showInactive), so a job appearing or being clicked never
// pulls his game out of focus. That is stricter than notes (which he types on) and the same as timers. The mouse goes
// through it everywhere except over the card itself and its slider (the page says when, like the timer page).
//
// The page can only speak for its own job: every message from it is matched to its window, and what it asks for is
// rebuilt here from the job id this window was opened for. It never names a session, a link or a message itself.
// Pause and Play go through claudewire.ts's claudeMessage (the same checks as the cockpit), Open in Claude only ever
// hands on the brain's own link after claudeLink() has checked it.
//
// WIRING: main.ts is not touched by this file (the bubble is being rebuilt). The exact lines main.ts adds, and what the
// bubble side does with put-back, near and ask, are in docs/JOBPOP-WIRING.md.
import { BrowserWindow, ipcMain, screen } from 'electron';
import { SAFE_WEB_PREFERENCES, denyPermissions, lockDown } from './safety.ts';
import { claudeMessage, claudeLink } from './claudewire.ts';
import type { FamilyHooks } from './familywin.ts';

export interface Rect { x: number; y: number; width: number; height: number }
interface Spot { x: number; y: number }

/** What the pop-out asks main.ts to do. The claude.* ones are already checked by claudeMessage and go to the brain as they are. */
export type JobPopAction =
  | { t: 'claude.pause'; session: string }
  | { t: 'claude.play'; session: string }
  | { t: 'jobpop.open'; url: string }
  | { t: 'jobpop.ask'; session: string; id: string }
  | { t: 'jobpop.message'; session: string; project: string };

export interface JobPopsOptions {
  /** pages.origin: the pop-out's page is served with the others (jobpop.html). */
  origin: string;
  /** jobpoppreload.cjs: the page's few named doors and nothing else. */
  preloadPath: string;
  /** Aang's face for the taskbar (his rule: always Aang's face, never the Electron atom). */
  iconPath?: string;
  /** Aang's sprite and his bubble, on screen, right now (null or missing entries are skipped). */
  aangRects?: () => ReadonlyArray<Rect | null | undefined>;
  onPutBack?: (jobId: string) => void;
  onAction?: (a: JobPopAction) => void;
  onNice?: (jobId: string) => void;
  /** While dragging: the job is near Aang (so the bubble side can light him up) or not any more. */
  onNear?: (jobId: string, near: boolean) => void;
  /** Off only in the offscreen test, where the windows live far off any display on purpose. */
  clampToScreen?: boolean;
}

// The card sits inside the window with room round it: above for the "55%" readout, to the right for the slider, below
// for its shadow. The window is see-through and lets the mouse through there, so the room costs him nothing.
export const CARD_X = 16, CARD_Y = 36, CARD_W = 372;
const PAD_R = 52, PAD_B = 42;
const WIN_W = CARD_X + CARD_W + PAD_R;
// Folded, the window is still tall enough for the hover slider (96 px from just above the card) and its shadow.
const FOLDED_H = CARD_Y + 114;
/** His floor (sheet 52): 30%, so it can never vanish and he can always drag it home. */
export const MIN_OPACITY = 0.3;
/** "As you get close" (sheet 52 section 4): the bubble side may light up this far from Aang. */
const NEAR_PX = 60;

interface Pop {
  w: BrowserWindow;
  jobId: string;
  pinned: boolean;
  opacity: number;
  /** Seen at work while popped out, so a finish can be told from a job that never ran. */
  wasActive: boolean;
  /** When it was first seen finished, with how long it took then (frozen, so the line does not keep counting). */
  done: { tookMs: number | null } | null;
  near: boolean;
  drag: { x: number; y: number } | null;
  leaving: boolean;
}

// The ipc doors are process-wide; a second JobPops (only ever in a test) shares them through this list.
const all = new Set<JobPops>();
let wired = false;

export class JobPops {
  private readonly pops = new Map<string, Pop>();
  /** Per job, for this run of the Shell: where he left it, its fade, its pin (sheet 52: "it remembers"). */
  private readonly mem = new Map<string, { x: number; y: number; opacity: number; pinned: boolean }>();
  private jobs: Record<string, unknown>[] = [];
  private waits: Record<string, unknown>[] = [];
  private readonly o: JobPopsOptions;
  onPutBack: ((jobId: string) => void) | null;
  onAction: ((a: JobPopAction) => void) | null;
  onNice: ((jobId: string) => void) | null;
  onNear: ((jobId: string, near: boolean) => void) | null;

  constructor(o: JobPopsOptions) {
    this.o = o;
    this.onPutBack = o.onPutBack ?? null;
    this.onAction = o.onAction ?? null;
    this.onNice = o.onNice ?? null;
    this.onNear = o.onNear ?? null;
    all.add(this);
    wireIpc();
  }

  /** Open (or bring back) the pop-out for one job. `at` is where its top-left corner of the card goes (under his pointer). */
  open(jobId: string, at?: Spot | null): BrowserWindow | null {
    // The id must be one the brain could have sent (claudewire's own check), never a path or anything else.
    if (!claudeMessage({ t: 'claude.pause', session: jobId })) return null;
    const had = this.pops.get(jobId);
    if (had && !had.w.isDestroyed()) {
      if (at) had.w.setPosition(Math.round(at.x - CARD_X), Math.round(at.y - CARD_Y));
      return had.w;
    }
    const m = this.mem.get(jobId);
    const spot = at ? { x: at.x - CARD_X, y: at.y - CARD_Y } : m ? { x: m.x, y: m.y } : this.defaultSpot();
    const pos = this.clamp({ x: Math.round(spot.x), y: Math.round(spot.y) }, WIN_W, FOLDED_H);
    const w = new BrowserWindow({
      x: pos.x, y: pos.y, width: WIN_W, height: FOLDED_H,
      frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false, resizable: false, movable: true,
      minimizable: false, maximizable: false, fullscreenable: false, skipTaskbar: true, alwaysOnTop: false,
      // Never takes the keyboard: clicking Pause over WoW must not pull the game out of focus.
      focusable: false, show: false,
      webPreferences: { ...SAFE_WEB_PREFERENCES, preload: this.o.preloadPath },
    });
    if (this.o.iconPath) {
      try { w.setIcon(this.o.iconPath); } catch { /* the default icon */ }
      try { w.setAppDetails({ appId: 'Aang', appIconPath: this.o.iconPath, appIconIndex: 0, relaunchDisplayName: 'Aang' }); } catch { /* not Windows */ }
    }
    lockDown(w.webContents);
    denyPermissions(w.webContents.session);
    w.setIgnoreMouseEvents(true, { forward: true });
    const p: Pop = { w, jobId, pinned: m?.pinned ?? false, opacity: m?.opacity ?? 1, wasActive: false, done: null, near: false, drag: null, leaving: false };
    this.pops.set(jobId, p);
    this.applyPin(p);
    this.joinFamily(p);
    w.on('closed', () => { if (this.pops.get(jobId)?.w === w) this.pops.delete(jobId); });
    void w.loadURL(`${this.o.origin}/jobpop.html`);
    w.once('ready-to-show', () => { if (!w.isDestroyed()) w.showInactive(); });
    this.push(p);
    return w;
  }

  /** Close one pop-out (no animation: main.ts closing it, or the job went back). */
  close(jobId: string): void {
    const p = this.pops.get(jobId);
    if (!p) return;
    this.remember(p);
    this.pops.delete(jobId);
    if (!p.w.isDestroyed()) p.w.destroy();
  }
  closeAll(): void { for (const id of [...this.pops.keys()]) this.close(id); }
  has(jobId: string): boolean { const p = this.pops.get(jobId); return !!p && !p.w.isDestroyed(); }
  ids(): string[] { return [...this.pops.keys()]; }
  window(jobId: string): BrowserWindow | null { const p = this.pops.get(jobId); return p && !p.w.isDestroyed() ? p.w : null; }

  /** The brain's claude.jobs and claude.wait lists, as they came (the page reads them again with readJob). */
  update(jobs: unknown, waits: unknown): void {
    this.jobs = (Array.isArray(jobs) ? jobs : []).filter((j): j is Record<string, unknown> => !!j && typeof j === 'object').slice(0, 50);
    this.waits = (Array.isArray(waits) ? waits : []).filter((x): x is Record<string, unknown> => !!x && typeof x === 'object').slice(0, 50);
    for (const p of this.pops.values()) this.push(p);
  }

  // ---------------------------------------------------------------- the window family (F2, 2026-10-22)
  /** Set by familywire.ts: a job snaps to the video, notes, timers and other jobs, and shares see-through and pin. */
  family: FamilyHooks | null = null;
  private joinFamily(p: Pop): void {
    const w = p.w;
    this.family?.add({
      id: 'job:' + p.jobId, kind: 'job', win: () => (w.isDestroyed() ? null : w), card: '.pj',
      // The fade lives in the page (the card fades, the slider beside it never does).
      setOpacity: (n) => { p.opacity = Math.round(Math.max(MIN_OPACITY, Math.min(1, n)) * 100) / 100; this.remember(p); this.push(p); },
      setPinned: (on) => { if (p.pinned !== on) { p.pinned = on; this.applyPin(p); this.remember(p); this.push(p); } },
      moved: () => this.remember(p),
    });
  }

  /** Destroy the windows and stop answering their doors (the Shell quitting, or a test ending). */
  dispose(): void { this.closeAll(); all.delete(this); }

  /* ---------------------------------------------------------------- inside */

  private jobOf(id: string): Record<string, unknown> | null { return this.jobs.find((j) => j.id === id) ?? null; }
  private waitsOf(id: string): Record<string, unknown>[] { return this.waits.filter((x) => x.session === id && typeof x.id === 'string').slice(0, 10); }

  /** Send the page its job, its waits and its own pin and fade. Works out JOB COMPLETE here so it is the same for every view. */
  private push(p: Pop): void {
    if (p.w.isDestroyed()) return;
    const j = this.jobOf(p.jobId);
    const active = j && (j.phase === 'working' || j.phase === 'paused');
    if (active) { p.wasActive = true; p.done = null; }
    else if (j && p.wasActive && !p.done && j.failed !== true) {
      const started = Number(j.startedAt);
      // startedAt is epoch ms from the brain; anything else (a test, an older brain) just leaves the time off.
      p.done = { tookMs: started > 1e12 ? Math.max(0, Date.now() - started) : null };
    }
    const data = { job: j, waits: this.waitsOf(p.jobId), pinned: p.pinned, opacity: p.opacity, done: p.done };
    const send = () => { if (!p.w.isDestroyed()) p.w.webContents.send('jobpop:data', data); };
    if (p.w.webContents.isLoading()) p.w.webContents.once('did-finish-load', send); else send();
  }

  private applyPin(p: Pop): void {
    if (p.w.isDestroyed()) return;
    if (p.pinned) {
      // Above a full-screen game, the level the pop-out, notes and timers use.
      p.w.setAlwaysOnTop(true, 'screen-saver');
      p.w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    } else {
      p.w.setAlwaysOnTop(false);
      p.w.setVisibleOnAllWorkspaces(false);
    }
  }

  private remember(p: Pop): void {
    if (p.w.isDestroyed()) return;
    const [x, y] = p.w.getPosition();
    const at = p.drag ?? { x: x!, y: y! };
    this.mem.set(p.jobId, { x: at.x, y: at.y, opacity: p.opacity, pinned: p.pinned });
  }

  private defaultSpot(): Spot {
    const a = screen.getPrimaryDisplay().workArea;
    return { x: a.x + a.width - WIN_W - 260, y: a.y + a.height - 360 };
  }

  /** Keep at least most of the card on a screen (he must always be able to find it and drag it home). */
  private clamp(s: Spot, w: number, h: number): Spot {
    if (this.o.clampToScreen === false) return s;
    const area = screen.getDisplayNearestPoint({ x: s.x + CARD_X + 40, y: s.y + CARD_Y + 20 }).workArea;
    const x = Math.min(Math.max(s.x, area.x - CARD_X - CARD_W + 80), area.x + area.width - CARD_X - 80);
    const y = Math.min(Math.max(s.y, area.y - CARD_Y), area.y + area.height - Math.min(h, CARD_Y + 60));
    void w;
    return { x: Math.round(x), y: Math.round(y) };
  }

  private overAang(pt: Spot, margin = 0): boolean {
    const rects = this.o.aangRects?.() ?? [];
    return rects.some((r) => !!r && pt.x >= r.x - margin && pt.x < r.x + r.width + margin && pt.y >= r.y - margin && pt.y < r.y + r.height + margin);
  }

  /** Which pop a page message came from: its own window's top frame, nothing else. */
  of(sender: Electron.WebContents, frame: Electron.WebFrameMain | null | undefined): Pop | null {
    if (frame && frame.parent !== null) return null;
    for (const p of this.pops.values()) if (!p.w.isDestroyed() && p.w.webContents === sender && !p.leaving) return p;
    return null;
  }

  /* ---------------------------------------------------------------- what the page may ask */

  hearReady(p: Pop): void { this.push(p); }
  hearClickable(p: Pop, on: boolean): void {
    if (p.w.isDestroyed()) return;
    // While dragging it always takes the mouse, or the drag would fall through to the game mid-way.
    p.w.setIgnoreMouseEvents(!(on || p.drag), { forward: true });
  }
  hearSize(p: Pop, h: number): void {
    if (p.w.isDestroyed() || !Number.isFinite(h)) return;
    const height = Math.round(Math.max(FOLDED_H, Math.min(900, h)));
    const [cw, ch] = p.w.getSize();
    if (cw === WIN_W && ch === height) return;
    const [x, y] = p.w.getPosition();
    p.w.setBounds({ x: x!, y: y!, width: WIN_W, height });
  }
  hearDrag(p: Pop, phase: unknown, dx: number, dy: number): void {
    if (p.w.isDestroyed()) return;
    const [x, y] = p.w.getPosition();
    const fid = 'job:' + p.jobId;
    if (phase === 'start') { p.drag = { x: x!, y: y! }; p.w.setIgnoreMouseEvents(false); this.family?.drag(fid, 'start'); return; }
    if (!p.drag || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
    if (phase === 'move') {
      // The family moves it (and whatever it is joined to), and snaps it; on its own it just follows the mouse.
      if (!this.family?.drag(fid, 'move', dx, dy)) p.w.setPosition(Math.round(p.drag.x + dx), Math.round(p.drag.y + dy));
      if (this.family?.joined(fid)) return;     // a joined group never goes back into the bubble by a drag
      const near = this.overAang(screen.getCursorScreenPoint(), NEAR_PX);
      if (near !== p.near) { p.near = near; this.onNear?.(p.jobId, near); }
      return;
    }
    if (phase !== 'end') return;
    const from = p.drag;
    p.drag = null;
    if (p.near) { p.near = false; this.onNear?.(p.jobId, false); }
    // Dropped on Aang or his bubble: back into the bubble. It remembers where it was before this drag, so pulling it
    // out again without a spot brings it back there rather than on top of Aang. Only on its own: joined, it stays with them.
    if (!this.family?.joined(fid) && this.overAang(screen.getCursorScreenPoint())) {
      this.family?.drag(fid, 'cancel');
      p.leaving = true;
      this.mem.set(p.jobId, { x: from.x, y: from.y, opacity: p.opacity, pinned: p.pinned });
      this.pops.delete(p.jobId);
      if (!p.w.isDestroyed()) p.w.webContents.send('jobpop:leave', 'back');
      setTimeout(() => { if (!p.w.isDestroyed()) p.w.destroy(); }, 200);
      this.onPutBack?.(p.jobId);
      return;
    }
    if (this.family?.drag(fid, 'end', dx, dy)) { this.remember(p); return; }
    const [w, h] = p.w.getSize();
    const at = this.clamp({ x: x!, y: y! }, w!, h!);
    if (at.x !== x || at.y !== y) p.w.setPosition(at.x, at.y);
    this.remember(p);
  }
  hearPin(p: Pop): void {
    p.pinned = !p.pinned;
    this.applyPin(p);
    this.remember(p);
    this.push(p);
    this.family?.shared('job:' + p.jobId, { pinned: p.pinned });
  }
  hearOpacity(p: Pop, n: number): void {
    if (!Number.isFinite(n)) return;
    // The fade lives in the page (the card fades, the slider beside it never does); here it is only remembered.
    p.opacity = Math.round(Math.max(MIN_OPACITY, Math.min(1, n)) * 100) / 100;
    this.remember(p);
    this.family?.shared('job:' + p.jobId, { opacity: p.opacity });
  }
  hearAct(p: Pop, what: unknown): void {
    const j = this.jobOf(p.jobId);
    if (what === 'pause' || what === 'play') {
      // The same checks the cockpit's messages get, built here from this window's own job id.
      const m = claudeMessage({ t: what === 'pause' ? 'claude.pause' : 'claude.play', session: p.jobId });
      if (!m) { console.error('shell: refused a pop-out Pause/Play that did not check out'); return; }
      this.onAction?.(m as JobPopAction);
      return;
    }
    if (what === 'open') {
      // 2026-10-21 (his rule: never do nothing): the session's own link; on the Mac, the Mac's Claude; with no app link
      // (a terminal session), the Claude app forward at least. main.ts checks it again (claudeOpenTarget).
      const url = j?.machine === 'mac' ? 'mac' : claudeLink(j?.open) ?? 'front';
      this.onAction?.({ t: 'jobpop.open', url });
      return;
    }
    if (what === 'ask') {
      const w = this.waitsOf(p.jobId)[0];
      if (!w || typeof w.id !== 'string' || !claudeMessage({ t: 'claude.answer', id: w.id, decision: 'deny' })) return;
      this.onAction?.({ t: 'jobpop.ask', session: p.jobId, id: w.id });
      return;
    }
    if (what === 'message') {
      const project = typeof j?.title === 'string' && j.title ? j.title : typeof j?.project === 'string' ? j.project : 'Claude';
      this.onAction?.({ t: 'jobpop.message', session: p.jobId, project: project.slice(0, 60) });
    }
  }
  hearNice(p: Pop): void {
    // Only a finished job has "Nice"; the page plays the shrink, then says so.
    if (!p.done) return;
    p.leaving = true;
    this.pops.delete(p.jobId);
    this.mem.delete(p.jobId);
    if (!p.w.isDestroyed()) p.w.destroy();
    this.onNice?.(p.jobId);
  }
}

/** One set of ipc doors for every JobPops; each message is matched to the pop whose window sent it. */
function wireIpc(): void {
  if (wired) return;
  wired = true;
  const find = (e: Electron.IpcMainEvent): { jp: JobPops; p: Pop } | null => {
    for (const jp of all) { const p = jp.of(e.sender, e.senderFrame); if (p) return { jp, p }; }
    return null;
  };
  ipcMain.on('jobpop:ready', (e) => { const f = find(e); if (f) f.jp.hearReady(f.p); });
  ipcMain.on('jobpop:clickable', (e, on) => { const f = find(e); if (f) f.jp.hearClickable(f.p, on === true); });
  ipcMain.on('jobpop:size', (e, h) => { const f = find(e); if (f) f.jp.hearSize(f.p, Number(h)); });
  ipcMain.on('jobpop:drag', (e, a) => {
    const f = find(e);
    if (!f || !a || typeof a !== 'object') return;
    f.jp.hearDrag(f.p, (a as { phase?: unknown }).phase, Number((a as { dx?: unknown }).dx ?? 0), Number((a as { dy?: unknown }).dy ?? 0));
  });
  ipcMain.on('jobpop:pin', (e) => { const f = find(e); if (f) f.jp.hearPin(f.p); });
  ipcMain.on('jobpop:opacity', (e, n) => { const f = find(e); if (f) f.jp.hearOpacity(f.p, Number(n)); });
  ipcMain.on('jobpop:act', (e, what) => { const f = find(e); if (f) f.jp.hearAct(f.p, what); });
  ipcMain.on('jobpop:nice', (e) => { const f = find(e); if (f) f.jp.hearNice(f.p); });
}

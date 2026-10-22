// The window family, with real windows (docs/WINDOW-FAMILY-RESEARCH.md, "DECIDED 2026-10-22"; sheets 59 FLUSH and 63).
//
// family.ts has the maths; this moves the windows. Each member module (popout.ts, notewin.ts, timerwin.ts, jobpop.ts)
// registers its windows here and hands over its custom drag. What he gets:
//   - within 14 px of another member (20 px of the work area) a dragged window sticks, instantly, while the mouse is down;
//     let go touching and the two are joined FLUSH (only the corners a neighbour sits against go square; every outer
//     corner stays round, the video's too: Windows' rounding off and a pixel-stepped region instead, 1b);
//   - a plain drag of ANY member moves the whole group; nothing comes off by pulling;
//   - right-click any joined window: ONE family menu (Aang's menu, look A): see-through for all, pin on top for all, click
//     through for the group (1b; Ctrl+Alt+P over one brings the group back), Pull apart;
//   - Pull apart: the group spreads 14 px (spring 0.35 s, damping 0.7), every window shimmies 1 px with a soft gold rim; he
//     drags out the ones he wants (40 px away = free, back to its own size) or drags one to another side (the neighbours
//     slide aside live, NO slot is drawn); Esc, a right-click on any of them or a click on the empty desktop ends it and
//     the rest join back flush (spring 0.5 s, damping 0.825);
//   - a member that changes size (a job unfolding, a note growing, the video resized) re-places what hangs on it (F3).
// Never animated while his mouse is down; springs are stepped from here at 60 Hz in whole pixels.
//
// F4 (reshape on snap: a job beside the video becomes a column) is NOT here; Member.shape is the hook for it.
import { BrowserWindow, ipcMain, screen } from 'electron';
import path from 'node:path';
import * as F from './family.ts';
import { setCorners } from './winedge.ts';
import { SAFE_WEB_PREFERENCES, denyPermissions, lockDown } from './safety.ts';

export type Kind = 'video' | 'job' | 'note' | 'timer';
export interface Shared { opacity: number; pinned: boolean }

/** What a member module tells the family about one of its windows. */
export interface MemberWin {
  id: string;
  kind: Kind;
  win: () => BrowserWindow | null;
  /** CSS selector of the visible panel inside the window; absent = the whole window (the video pop-out). */
  card?: string;
  /**
   * The window's corners are Windows' own (DWM), not drawn by the page. Joined, Windows' rounding goes off and the window
   * gets a pixel-stepped region round only on its outer corners (winedge setCorners, 1b).
   */
  osCorners?: boolean;
  /** Apply the family's shared see-through / pin, the member's own way (no echo back to the family). */
  setOpacity: (n: number) => void;
  setPinned: (on: boolean) => void;
  /**
   * "Pin on top" from the family (1b, his yes): just on top. Members whose own pin means more (a note's or timer's pin also
   * lets clicks through) give this; absent, setPinned is used (the video: its pin exactly as today, click-through included).
   */
  setOnTop?: (on: boolean) => void;
  /** Click-through from the family menu or its own menu (1b): every click goes to whatever is under it. */
  setThrough?: (on: boolean) => void;
  /** Click-through by its own rule, whatever the family says (the video pinned, or his pop-out switch). */
  lockedThrough?: () => boolean;
  /** Back to its own size on leaving (F4 changes sizes; part 1 never does, so this is usually a no-op). */
  resize?: (width: number, height: number) => void;
  /** The family moved it: remember where (its own save). */
  moved?: () => void;
}

/** What member modules call. */
export interface FamilyHooks {
  add(m: MemberWin): void;
  remove(id: string): void;
  /** His drag of a member, phase by phase, dx/dy since the press. True when the family moved the window(s). */
  drag(id: string, phase: string, dx?: number, dy?: number): boolean;
  joined(id: string): boolean;
  /** One member's own see-through or pin changed: every other member follows (his rule). */
  shared(from: string, s: Partial<Shared>): void;
  /** Click-through for one member, from its own menu (1b): on, off, or flipped when absent. */
  setThrough(id: string, on?: boolean): void;
}

interface Pad { t: number; r: number; b: number; l: number }
interface Live { m: MemberWin; w: BrowserWindow; card: F.Box | null; sides: F.Side[]; square: F.Corner[]; mask: number; regioned: boolean; pad: Pad | null; seed: number; last: { x: number; y: number } | null; aot: boolean | null; through: boolean }
interface Anim { x: F.Spring; y: F.Spring; tx: number; ty: number; motion: { response: number; damping: number } }

export const MIN_OPACITY = 0.3;

/**
 * A member page's family look, put in from here with insertCSS (the pages' own Content-Security-Policy forbids a <style>
 * from the preload): its panel's joined sides go square (the outer corners stay round), and while the group is pulled
 * apart a soft gold rim breathes just inside its edge (sheet 63: a window cannot paint outside itself).
 */
export function familyCss(card?: string): string {
  const s = card || 'html';
  // 1b: per CORNER, not per side: a corner goes square only where a group-mate sits against it (family.ts squareCorners).
  const sq: Record<F.Corner, string> = { tl: 'top-left', tr: 'top-right', br: 'bottom-right', bl: 'bottom-left' };
  return Object.entries(sq).map(([c, css]) => `html[data-fam-sq~="${c}"] ${s}, html[data-fam-sq~="${c}"] ${s} > .fam-rim{border-${css}-radius:0 !important}`).join('\n') + `
.fam-rim{position:absolute !important;inset:0;border-radius:inherit;pointer-events:none;z-index:2147483647;opacity:0 !important;transition:opacity .2s ease}
html.fam-wiggle .fam-rim{opacity:1 !important;animation:famglow 1.2s ease-in-out infinite alternate}
html.fam-held .fam-rim{animation:none;opacity:0 !important}
@keyframes famglow{from{box-shadow:inset 0 0 0 2px rgba(255,226,140,.45),inset 0 0 6px rgba(255,186,70,.2)}to{box-shadow:inset 0 0 0 2px rgba(255,226,140,.95),inset 0 0 12px rgba(255,186,70,.5)}}
@media (prefers-reduced-motion: reduce){html.fam-wiggle .fam-rim{animation:none}}`;
}

export class FamilyHost implements FamilyHooks {
  private readonly live = new Map<string, Live>();
  private fam: F.Fam = new Map();
  private sharedNow: Shared = { opacity: 1, pinned: false };
  private applying = false;
  private dragNow: { id: string; ids: string[]; start: Map<string, F.Box>; wiggle: boolean; t: number; p: { x: number; y: number }; fast: boolean } | null = null;
  private readonly anims = new Map<string, Anim>();
  private ticker: NodeJS.Timeout | null = null;
  private lastTick = 0;
  private wiggle: { ids: string[]; fam: F.Fam; t0: number } | null = null;
  readonly overlay: FamilyOverlay;
  private seeds = 0;

  constructor(o: { origin: string; iconPath?: string; overlay?: FamilyOverlay }) {
    this.overlay = o.overlay ?? new FamilyOverlay({ origin: o.origin, iconPath: o.iconPath, host: this });
    wireIpc(this);
  }

  // ---------------------------------------------------------------- members

  add(m: MemberWin): void {
    const w = m.win();
    if (!w || w.isDestroyed()) return;
    const had = this.live.get(m.id);
    if (had && had.w === w) { had.m = m; return; }
    const l: Live = { m, w, card: null, sides: [], square: [], mask: F.ALL_ROUND, regioned: false, pad: null, seed: ++this.seeds, last: null, aot: null, through: false };
    this.live.set(m.id, l);
    const box = this.boxOf(m.id)!;
    this.fam.set(m.id, { id: m.id, kind: m.kind, box, own: { width: box.width, height: box.height } });
    w.once('closed', () => { if (this.live.get(m.id)?.w === w) this.remove(m.id); });
    // Hidden (the video put away, a note going back): it leaves its group; the rest close up.
    w.on('hide', () => { if (this.live.get(m.id)?.w === w) this.leave(m.id); });
    // Clicked (a member that takes the keyboard): the rest of its group comes up with it, so the notes beside the video
    // are not left buried under the game. It goes on top again last, so it keeps the front.
    w.on('focus', () => {
      if (this.live.get(m.id)?.w !== w || !this.joined(m.id) || this.dragNow) return;
      this.raise(F.groupOf(this.fam, m.id).filter((x) => x !== m.id));
      if (!w.isDestroyed()) w.moveTop();
    });
    // A joined window with Windows' own corners has a region cut to its size: cut again when the size changes.
    if (m.osCorners) w.on('resize', () => { const x = this.live.get(m.id); if (x?.w === w && x.regioned) this.recut(m.id); });
    const hello = () => { void w.webContents.insertCSS(familyCss(m.card)).catch(() => {}); this.sendState(m.id, true); };
    if (w.webContents.isLoading()) w.webContents.once('did-finish-load', hello); else hello();
    w.webContents.on('did-finish-load', hello);
    // A newcomer takes the family's see-through and pin.
    if (this.live.size > 1) { this.applying = true; try { m.setOpacity(this.sharedNow.opacity); (m.setOnTop ?? m.setPinned)(this.sharedNow.pinned); } finally { this.applying = false; } }
  }

  remove(id: string): void {
    if (!this.live.has(id)) return;
    this.leave(id, false);
    this.live.delete(id);
    this.fam.delete(id);
    this.anims.delete(id);
    if (this.dragNow?.ids.includes(id)) this.dragNow = null;
  }

  joined(id: string): boolean { return this.fam.has(id) && F.isJoined(this.fam, id); }
  /** For tests and the menu. */
  groupOf(id: string): string[] { return F.groupOf(this.fam, id); }
  get sharedState(): Shared { return { ...this.sharedNow }; }
  get wiggling(): boolean { return !!this.wiggle; }
  get busy(): boolean { return this.anims.size > 0 || !!this.dragNow; }
  members(): string[] { return [...this.live.keys()]; }
  boxes(): Map<string, F.Box> { this.syncBoxes(); return new Map([...this.fam].map(([id, m]) => [id, { ...m.box }])); }

  /** The visible panel on screen: the window's content origin plus where the page says its panel is. */
  boxOf(id: string): F.Box | null {
    const l = this.live.get(id), w = l?.m.win();
    if (!l || !w || w.isDestroyed()) return null;
    const c = w.getContentBounds();
    const k = l.card ?? { x: 0, y: 0, width: c.width, height: c.height };
    return { x: Math.round(c.x + k.x), y: Math.round(c.y + k.y), width: Math.round(k.width), height: Math.round(k.height) };
  }
  private syncBoxes(): void { for (const id of this.live.keys()) { const b = this.boxOf(id), m = this.fam.get(id); if (b && m) m.box = b; } }

  /** Put a member's panel at x,y (the window goes wherever that puts it). Whole pixels; skipped when nothing changed. */
  private setPos(id: string, x: number, y: number): void {
    const l = this.live.get(id), w = l?.m.win();
    if (!l || !w || w.isDestroyed()) return;
    x = Math.round(x); y = Math.round(y);
    if (l.last && l.last.x === x && l.last.y === y) return;
    l.last = { x, y };
    const b = w.getBounds(), c = w.getContentBounds(), k = l.card ?? { x: 0, y: 0 };
    w.setPosition(Math.round(x - k.x - (c.x - b.x)), Math.round(y - k.y - (c.y - b.y)));
    const m = this.fam.get(id);
    if (m) m.box = { ...m.box, x, y };
  }

  /** It leaves its group (its own size comes back); the rest close up on the settle spring. */
  private leave(id: string, relayout = true): void {
    const m = this.fam.get(id);
    if (!m) return;
    const group = F.groupOf(this.fam, id).filter((x) => x !== id);
    if (this.wiggle?.ids.includes(id)) this.wiggle.ids = this.wiggle.ids.filter((x) => x !== id);
    if (this.wiggle) this.wiggle.fam = F.remove(this.wiggle.fam, id);
    this.fam = F.remove(this.fam, id);
    const own = F.ownSize(m);
    if (own.width !== m.box.width || own.height !== m.box.height) this.live.get(id)?.m.resize?.(own.width, own.height);
    if (relayout && group.length > 1 && !this.wiggle) this.animateTo(F.arrange(this.fam, group[0]!, 0), group, F.MOTION.settle);
    this.refreshSides();
  }

  // ---------------------------------------------------------------- his drag

  drag(id: string, phase: string, dx = 0, dy = 0): boolean {
    if (!this.live.has(id)) return false;
    if (phase === 'start') {
      this.syncBoxes();
      const inWiggle = !!this.wiggle && this.wiggle.ids.includes(id);
      const ids = inWiggle ? [id] : F.groupOf(this.fam, id);
      for (const x of ids) this.anims.delete(x);          // grabbed mid-spring: it stays where it is
      this.dragNow = { id, ids, start: new Map(ids.map((x) => [x, { ...this.fam.get(x)!.box }])), wiggle: inWiggle, t: Date.now(), p: { x: 0, y: 0 }, fast: false };
      if (inWiggle) this.sendState(id); else this.raise(ids);
      return true;
    }
    const d = this.dragNow;
    if (!d || d.id !== id) return phase === 'move' || phase === 'end';
    if (phase === 'cancel') { this.dragNow = null; this.sendState(id); return true; }
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return true;
    if (phase === 'move') {
      const now = Date.now(), dt = Math.max(1, now - d.t);
      d.fast = Math.hypot(dx - d.p.x, dy - d.p.y) / dt * 1000 > F.FLING;
      d.t = now; d.p = { x: dx, y: dy };
      if (d.wiggle) { this.wiggleMove(d, dx, dy); return true; }
      const moving = d.ids.map((x) => { const s = d.start.get(x)!; return { ...s, x: s.x + dx, y: s.y + dy }; });
      const still = [...this.fam.values()].filter((m) => !d.ids.includes(m.id) && this.live.get(m.id)?.m.win()?.isVisible()).map((m) => m.box);
      const grabbed = moving[d.ids.indexOf(id)]!;
      const area = screen.getDisplayMatching({ x: grabbed.x, y: grabbed.y, width: Math.max(1, grabbed.width), height: Math.max(1, grabbed.height) }).workArea;
      const s = F.snapMove(moving, still, area, { windows: !d.fast });
      d.ids.forEach((x, i) => this.setPos(x, moving[i]!.x + s.dx, moving[i]!.y + s.dy));
      return true;
    }
    if (phase === 'end') {
      this.dragNow = null;
      if (d.wiggle) { this.wiggleDrop(id); return true; }
      const j = F.joinOnDrop(this.fam, id);
      if (j) { this.fam = j; this.refreshSides(); }
      for (const x of d.ids) this.live.get(x)?.m.moved?.();
      return true;
    }
    return true;
  }

  /** Unpinned, clicking or grabbing any member brings its whole group up together (root first). */
  raise(ids: string[]): void {
    for (const x of ids) { const w = this.live.get(x)?.m.win(); if (w && !w.isDestroyed() && w.isVisible()) w.moveTop(); }
  }

  // ---------------------------------------------------------------- see-through and pin, for everyone

  shared(from: string, s: Partial<Shared>): void {
    if (this.applying) return;
    const next = { ...this.sharedNow };
    if (typeof s.opacity === 'number' && Number.isFinite(s.opacity)) next.opacity = Math.max(MIN_OPACITY, Math.min(1, s.opacity));
    if (typeof s.pinned === 'boolean') next.pinned = s.pinned;
    this.sharedNow = next;
    this.applying = true;
    try {
      for (const [id, l] of this.live) {
        if (id === from) continue;
        try { if (s.opacity !== undefined) l.m.setOpacity(next.opacity); if (s.pinned !== undefined) (l.m.setOnTop ?? l.m.setPinned)(next.pinned); } catch { /* that window is gone */ }
      }
      for (const l of this.live.values()) { const w = l.m.win(); if (w && !w.isDestroyed()) w.webContents.send('family:shared', next); }
    } finally { this.applying = false; }
  }

  // ---------------------------------------------------------------- the right-click

  context(id: string, at: { x: number; y: number }): void {
    if (this.wiggle) { this.endWiggle(); return; }
    if (!this.joined(id)) return;
    const g = F.groupOf(this.fam, id);
    this.overlay.openMenu(at, { id, n: g.length, total: this.live.size, ...this.sharedNow, through: F.allThrough(this.throughNow(), g, this.locked()) });
  }
  /** From the menu. */
  pick(id: string, what: string, value?: number): void {
    if (what === 'opacity' && typeof value === 'number') this.shared('', { opacity: value });
    else if (what === 'pin') { this.shared('', { pinned: !this.sharedNow.pinned }); this.overlay.close(); }
    else if (what === 'apart') { this.overlay.close(); this.pullApart(id); }
    else if (what === 'through') { this.overlay.close(); this.throughGroup(id); }
  }

  // ---------------------------------------------------------------- click-through (1b, his ask 2026-10-22)

  private throughNow(): Map<string, boolean> { return new Map([...this.live].map(([id, l]) => [id, l.through])); }
  /** Members the family cannot change: click-through by their own rule, or with no way to be. */
  private locked(): Set<string> {
    const out = new Set<string>();
    for (const [id, l] of this.live) { try { if (l.m.lockedThrough?.() || !l.m.setThrough) out.add(id); } catch { /* gone */ } }
    return out;
  }
  /** Is this member letting clicks through (its own rule or the family's)? */
  isThrough(id: string): boolean { const l = this.live.get(id); return !!l && (l.through || !!l.m.lockedThrough?.()); }
  /** Something is click-through by the family's say: the way-back key must be held. */
  get anyThrough(): boolean { for (const l of this.live.values()) { const w = l.m.win(); if (l.through && w && !w.isDestroyed() && w.isVisible()) return true; } return false; }
  /** One member, from its own menu (or anywhere): on, off, or flipped. */
  setThrough(id: string, on?: boolean): void {
    const l = this.live.get(id);
    if (!l || !l.m.setThrough) return;
    const next = on ?? !l.through;
    if (next === l.through) return;
    l.through = next;
    try { l.m.setThrough(next); } catch { /* gone */ }
    this.sendState(id);
  }
  /** The family menu's "Click through": the whole group, the way groupThrough says (locked members untouched). */
  throughGroup(id: string): void {
    const g = F.groupOf(this.fam, id);
    const next = F.groupThrough(this.throughNow(), g, this.locked());
    for (const x of g) this.setThrough(x, next.get(x));
  }
  /**
   * The way back, ONE way for every member: the key that already unpins the video, a note or a timer (Ctrl+Alt+P, "pin what
   * is under the mouse"). A click-through member under the mouse takes clicks again, and so does the rest of its group.
   * True when one did.
   */
  reachAt(p: { x: number; y: number }): boolean {
    for (const [id, l] of this.live) {
      const w = l.m.win();
      if (!l.through || !w || w.isDestroyed() || !w.isVisible()) continue;
      const b = this.boxOf(id) ?? w.getBounds();
      if (p.x < b.x || p.x >= b.x + b.width || p.y < b.y || p.y >= b.y + b.height) continue;
      for (const x of F.groupOf(this.fam, id)) this.setThrough(x, false);
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- pull apart

  pullApart(id: string): void {
    if (!this.fam.has(id) || this.wiggle) return;
    this.syncBoxes();
    const ids = F.groupOf(this.fam, id);
    if (ids.length < 2) return;
    const spread = F.arrange(this.fam, id, F.SPREAD);
    this.fam = F.rerootBiggest(this.fam, id);
    this.wiggle = { ids, fam: spread, t0: Date.now() };
    // Above the catcher (the click-on-the-desktop sheet) while it lasts; each goes back to its own level after.
    for (const x of ids) { const l = this.live.get(x)!, w = l.m.win(); if (w && !w.isDestroyed()) { l.aot = w.isAlwaysOnTop(); w.setAlwaysOnTop(true, 'screen-saver'); } }
    this.overlay.catcher(this.hintAt(spread, ids));
    this.raise(ids);
    this.refreshSides();
    this.animateTo(spread, ids, F.MOTION.spread);
  }

  endWiggle(): void {
    const wg = this.wiggle;
    if (!wg) return;
    this.wiggle = null;
    this.overlay.close();
    this.syncBoxes();
    // Where each one stands without its 1 px shimmy, so the join lands on whole, exact places.
    for (const x of wg.ids) { const b = wg.fam.get(x)?.box, m = this.fam.get(x); if (b && m && !this.anims.has(x)) m.box = { ...m.box, x: b.x, y: b.y }; }
    this.anims.clear();
    // The anchors as he left them (minus whatever he took out), the boxes where they are now; then flush.
    const n = F.clone(this.fam);
    for (const [id, m] of wg.fam) { const cur = n.get(id); if (cur) { if (m.anchor) cur.anchor = { ...m.anchor }; else delete cur.anchor; } }
    this.fam = n;
    for (const x of wg.ids) { const l = this.live.get(x), w = l?.m.win(); if (l && w && !w.isDestroyed() && l.aot !== null) { if (!l.aot) w.setAlwaysOnTop(false); l.aot = null; } }
    for (const x of wg.ids) this.sendState(x);
    if (wg.ids.length > 1) this.animateTo(F.arrange(this.fam, wg.ids[0]!, 0), wg.ids, F.MOTION.join, () => { this.refreshSides(); for (const x of wg.ids) this.live.get(x)?.m.moved?.(); });
    else this.refreshSides();
  }

  private hintAt(f: F.Fam, ids: string[]): { x: number; y: number } {
    const bs = ids.map((x) => f.get(x)!.box);
    const L = Math.min(...bs.map((b) => b.x)), R = Math.max(...bs.map((b) => b.x + b.width)), T = Math.min(...bs.map((b) => b.y));
    return { x: Math.round((L + R) / 2), y: T };
  }

  /** While he drags one window of a pulled-apart group: the others slide aside to where it would go. No slot is drawn. */
  private wiggleMove(d: NonNullable<FamilyHost['dragNow']>, dx: number, dy: number): void {
    const wg = this.wiggle!, id = d.id, s = d.start.get(id)!;
    const box = { ...s, x: s.x + dx, y: s.y + dy };
    this.setPos(id, box.x, box.y);
    const others = wg.ids.filter((x) => x !== id);
    const without = F.remove(wg.fam, id);
    const slot = others.length ? F.slotFor(without, others, box) : null;
    const preview = slot ? F.rearranged(wg.fam, id, slot.target, slot.side, F.SPREAD) : wg.fam;
    this.animateTo(preview, others, F.MOTION.spread);
  }

  private wiggleDrop(id: string): void {
    const wg = this.wiggle!;
    this.syncBoxes();
    const box = this.fam.get(id)!.box;
    const others = wg.ids.filter((x) => x !== id);
    const without = F.remove(wg.fam, id);
    const slot = others.length ? F.slotFor(without, others, box) : null;
    if (slot) {
      wg.fam = F.rearranged(wg.fam, id, slot.target, slot.side, F.SPREAD);
      this.animateTo(wg.fam, others, F.MOTION.spread);
      this.animateTo(wg.fam, [id], F.MOTION.back);
    } else if (F.isFree(box, others.map((x) => this.fam.get(x)!.box))) {
      // Free: it stops wiggling, gets its own corners and size back; the rest stay spread until he ends it.
      wg.ids = others;
      wg.fam = others.length ? F.arrange(without, others[0]!, F.SPREAD) : without;
      this.fam = F.remove(this.fam, id);
      const l = this.live.get(id), w = l?.m.win();
      if (l && w && !w.isDestroyed() && l.aot !== null) { if (!l.aot) w.setAlwaysOnTop(false); l.aot = null; }
      const m = this.fam.get(id)!, own = F.ownSize(m);
      if (own.width !== m.box.width || own.height !== m.box.height) l?.m.resize?.(own.width, own.height);
      l?.m.moved?.();
      if (others.length > 0) this.animateTo(wg.fam, others, F.MOTION.spread);
      if (others.length < 2) { this.endWiggle(); return; }
    } else {
      this.animateTo(wg.fam, others, F.MOTION.spread);
      this.animateTo(wg.fam, [id], F.MOTION.back);    // too close: back to its place
    }
    this.sendState(id);
    this.refreshSides();
  }

  // ---------------------------------------------------------------- F3: sizes

  /** The page measured its panel again. A new size re-places whatever hangs on it. */
  card(id: string, r: F.Box): void {
    const l = this.live.get(id);
    if (!l) return;
    const k = { x: Math.round(r.x), y: Math.round(r.y), width: Math.max(1, Math.round(r.width)), height: Math.max(1, Math.round(r.height)) };
    const was = this.fam.get(id)?.box;
    l.card = k;
    l.last = null;
    const now = this.boxOf(id);
    const m = this.fam.get(id);
    if (!m || !now) return;
    m.box = now;
    if (!F.isJoined(this.fam, id)) { m.own = { width: now.width, height: now.height }; return; }
    if (!was || (was.width === now.width && was.height === now.height) || this.dragNow) return;
    if (this.wiggle?.ids.includes(id)) {
      const wm = this.wiggle.fam.get(id);
      if (wm) wm.box = { ...wm.box, width: now.width, height: now.height };
      this.wiggle.fam = F.layoutFrom(this.wiggle.fam, F.rootOf(this.wiggle.fam, id), F.SPREAD);
      this.animateTo(this.wiggle.fam, this.wiggle.ids.filter((x) => x !== id), F.MOTION.settle);
      return;
    }
    const root = F.rootOf(this.fam, id);
    const next = F.layoutFrom(this.fam, root, 0);
    const moving = F.groupOf(this.fam, id).filter((x) => x !== root);
    this.animateTo(next, moving, F.MOTION.settle, () => { for (const x of moving) this.live.get(x)?.m.moved?.(); });
  }

  // ---------------------------------------------------------------- springs, from here, 60 Hz

  private animateTo(target: F.Fam, ids: string[], motion: { response: number; damping: number }, done?: () => void): void {
    for (const id of ids) {
      const t = target.get(id)?.box, cur = this.fam.get(id)?.box;
      if (!t || !cur || this.dragNow?.ids.includes(id)) continue;
      const a = this.anims.get(id);
      if (a) { a.tx = t.x; a.ty = t.y; a.motion = motion; }
      else this.anims.set(id, { x: { x: cur.x, v: 0 }, y: { x: cur.y, v: 0 }, tx: t.x, ty: t.y, motion });
    }
    if (done) this.whenStill.push(done);
    this.startTicker();
  }
  private whenStill: (() => void)[] = [];

  private startTicker(): void {
    if (this.ticker) return;
    this.lastTick = Date.now();
    this.ticker = setInterval(() => this.tick(), 16);
  }

  private tick(): void {
    const now = Date.now(), dt = Math.min(0.05, (now - this.lastTick) / 1000);
    this.lastTick = now;
    for (const [id, a] of this.anims) {
      a.x = F.springStep(a.x, a.tx, dt, a.motion.response, a.motion.damping);
      a.y = F.springStep(a.y, a.ty, dt, a.motion.response, a.motion.damping);
      const done = F.settled(a.x, a.tx) && F.settled(a.y, a.ty);
      if (done) this.anims.delete(id);
      const j = this.jiggle(id, now);
      this.setPos(id, (done ? a.tx : a.x.x) + j.dx, (done ? a.ty : a.y.x) + j.dy);
      if (done && !j.dx && !j.dy) { const m = this.fam.get(id); if (m) m.box = { ...m.box, x: a.tx, y: a.ty }; }
    }
    // The shimmy, on members standing still in a pulled-apart group.
    if (this.wiggle) for (const id of this.wiggle.ids) {
      if (this.anims.has(id) || this.dragNow?.ids.includes(id)) continue;
      const b = this.wiggle.fam.get(id)?.box;
      if (!b) continue;
      const j = this.jiggle(id, now);
      this.setPos(id, b.x + j.dx, b.y + j.dy);
    }
    if (!this.anims.size) {
      const cbs = this.whenStill.splice(0);
      for (const f of cbs) try { f(); } catch (e) { console.error('shell: family settle: ' + (e as Error).message); }
      if (!this.wiggle && this.ticker) { clearInterval(this.ticker); this.ticker = null; }
    }
  }
  private jiggle(id: string, now: number): { dx: number; dy: number } {
    const wg = this.wiggle;
    if (!wg || !wg.ids.includes(id) || this.dragNow?.ids.includes(id)) return { dx: 0, dy: 0 };
    return F.shimmy((now - wg.t0) / 1000, this.live.get(id)?.seed ?? 0);
  }

  // ---------------------------------------------------------------- what each page is told

  private refreshSides(): void {
    const sides = F.joinedSides(this.fam), square = F.squareCorners(this.fam);
    for (const [id, l] of this.live) {
      const wig = !!this.wiggle?.ids.includes(id);
      l.sides = wig ? [] : (sides.get(id) ?? []);
      // 1b (his call): only the corners a group-mate sits against go square; every outer corner stays round.
      l.square = wig ? [] : (square.get(id) ?? []);
      const mask = F.roundMask(l.square), changed = mask !== l.mask;
      l.mask = mask;
      if (changed && l.m.osCorners) this.recut(id);
      this.sendState(id);
    }
  }
  /** Windows' own corners: round (free), or off with a stepped region round on the outer corners only (joined). */
  private recut(id: string): void {
    const l = this.live.get(id), w = l?.m.win();
    if (!l || !w || w.isDestroyed()) return;
    // Once cut, always cut (winedge.ts: Chromium never gives the resize borders back), round all four when free.
    if (l.mask !== F.ALL_ROUND) l.regioned = true;
    setCorners(w, l.mask, l.regioned);
    if (l.regioned) for (const ms of [60, 250, 700, 1500]) setTimeout(() => this.checkPad(id), ms);
  }
  /**
   * With a region the page grows by the window's invisible resize borders (winedge.ts). It is padded by exactly what it
   * gained, so what shows (cut by the region to Electron's own bounds) is the same page, at the same place, as before.
   */
  private checkPad(id: string): void {
    const l = this.live.get(id), w = l?.m.win();
    if (!l || !w || w.isDestroyed() || !l.regioned) return;
    const b = w.getBounds(), c = w.getContentBounds();
    const pad = { t: Math.max(0, b.y - c.y), r: Math.max(0, c.x + c.width - b.x - b.width), b: Math.max(0, c.y + c.height - b.y - b.height), l: Math.max(0, b.x - c.x) };
    const same = l.pad && l.pad.t === pad.t && l.pad.r === pad.r && l.pad.b === pad.b && l.pad.l === pad.l;
    if (same || (!l.pad && !pad.t && !pad.r && !pad.b && !pad.l)) return;
    l.pad = pad;
    this.sendState(id, true);
  }
  /** For tests: which corners of a member are square right now. */
  squareOf(id: string): F.Corner[] { return [...(this.live.get(id)?.square ?? [])]; }
  private sendState(id: string, remeasure = false): void {
    const l = this.live.get(id), w = l?.m.win();
    if (!l || !w || w.isDestroyed()) return;
    w.webContents.send('family:state', {
      joined: F.isJoined(this.fam, id), wiggle: !!this.wiggle?.ids.includes(id), held: this.dragNow?.id === id && !!this.dragNow?.wiggle,
      sides: l.sides, square: l.square, through: l.through, pad: l.pad, card: l.m.card ?? null, remeasure,
    });
  }

  /** Which member a page message came from (its own window's top frame only). */
  idOf(sender: Electron.WebContents, frame?: Electron.WebFrameMain | null): string | null {
    if (frame && frame.parent !== null) return null;
    for (const [id, l] of this.live) { const w = l.m.win(); if (w && !w.isDestroyed() && w.webContents === sender) return id; }
    return null;
  }
  ownsOverlay(sender: Electron.WebContents): boolean { return this.overlay.owns(sender); }
  overlayShape(sender: Electron.WebContents, rects: unknown): void { this.overlay.shape(sender, rects); }

  dispose(): void { if (this.ticker) clearInterval(this.ticker); this.ticker = null; this.overlay.destroy(); hosts.delete(this); }
}

// ------------------------------------------------------------------------------------------------ the menu + catcher

/**
 * One see-through window over the work area. As the family MENU it is cut to the menu's own shape (clicks elsewhere go
 * through) and closes when it loses the keyboard, like Aang's own menu. While a group is pulled apart it is the CATCHER:
 * it covers the desktop under the members (a click on the empty desktop ends it), takes Esc, and shows the hint line.
 */
export class FamilyOverlay {
  private w: BrowserWindow | null = null;
  private mode: 'none' | 'menu' | 'catch' = 'none';
  private shownAt = 0;
  private menuFor = '';
  private readonly o: { origin: string; iconPath?: string; host: FamilyHost };
  constructor(o: { origin: string; iconPath?: string; host: FamilyHost }) { this.o = o; }

  private window(): BrowserWindow {
    if (this.w && !this.w.isDestroyed()) return this.w;
    const w = new BrowserWindow({
      width: 400, height: 400, frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false,
      resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
      skipTaskbar: true, alwaysOnTop: true, show: false, title: 'Aang',
      webPreferences: { ...SAFE_WEB_PREFERENCES, preload: path.join(import.meta.dirname, 'familypreload.cjs') },
    });
    if (this.o.iconPath) {
      try { w.setIcon(this.o.iconPath); } catch { /* the default icon */ }
      try { w.setAppDetails({ appId: 'Aang', appIconPath: this.o.iconPath, appIconIndex: 0, relaunchDisplayName: 'Aang' }); } catch { /* not Windows */ }
    }
    w.setAlwaysOnTop(true, 'floating');
    lockDown(w.webContents);
    denyPermissions(w.webContents.session);
    w.on('blur', () => { if (this.mode === 'menu' && Date.now() - this.shownAt > 120) this.close(); });
    void w.loadURL(`${this.o.origin}/familymenu.html`);
    this.w = w;
    return w;
  }
  warm(): void { this.window(); }
  owns(sender: Electron.WebContents): boolean { return !!this.w && !this.w.isDestroyed() && this.w.webContents === sender; }
  get showing(): 'none' | 'menu' | 'catch' { return this.mode; }

  private send(m: Record<string, unknown>): void {
    const w = this.window();
    const go = () => { if (!w.isDestroyed()) w.webContents.send('family:overlay', m); };
    if (w.webContents.isLoading()) w.webContents.once('did-finish-load', go); else go();
  }
  private cover(at: { x: number; y: number }): Electron.Rectangle {
    const w = this.window(), b = screen.getDisplayNearestPoint(at).workArea;
    if (w.isVisible()) w.hide();
    w.setBounds({ x: b.x, y: b.y, width: b.width, height: b.height });
    return b;
  }

  openMenu(at: { x: number; y: number }, s: { id: string; n: number; total: number; opacity: number; pinned: boolean; through: boolean }): void {
    const b = this.cover(at);
    this.mode = 'menu';
    this.menuFor = s.id;
    this.send({ kind: 'menu', x: at.x - b.x, y: at.y - b.y, n: s.n, total: s.total, opacity: s.opacity, pinned: s.pinned, through: s.through });
  }
  catcher(hint: { x: number; y: number }): void {
    const b = this.cover(hint);
    this.mode = 'catch';
    const w = this.window();
    w.setShape([]);
    this.send({ kind: 'catch', x: hint.x - b.x, y: hint.y - b.y });
    this.shownAt = Date.now();
    w.show();
    w.focus();
  }
  /** The page laid the menu out: only it takes the mouse. The first shape after a right-click shows the window. */
  shape(sender: Electron.WebContents, rects: unknown): void {
    const w = this.w;
    if (!w || w.isDestroyed() || w.webContents !== sender || this.mode !== 'menu' || !Array.isArray(rects)) return;
    const [ww, wh] = w.getContentSize();
    const ok = rects.slice(0, 2).map((r) => {
      const v = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>;
      const x = Math.max(0, Math.round(Number(v.x) || 0)), y = Math.max(0, Math.round(Number(v.y) || 0));
      return { x, y, width: Math.max(1, Math.min(ww - x, Math.round(Number(v.width) || 0))), height: Math.max(1, Math.min(wh - y, Math.round(Number(v.height) || 0))) };
    });
    if (!ok.length) return;
    w.setShape(ok);
    if (!w.isVisible()) { this.shownAt = Date.now(); w.show(); w.focus(); }
  }
  pick(sender: Electron.WebContents, what: unknown, value: unknown): void {
    if (!this.owns(sender) || this.mode !== 'menu') return;
    if (what === 'close') { this.close(); return; }
    if (what !== 'opacity' && what !== 'pin' && what !== 'apart' && what !== 'through') return;
    this.o.host.pick(this.menuFor, what, typeof value === 'number' && Number.isFinite(value) ? value : undefined);
  }
  /** A click on the empty desktop, or Esc, while pulled apart. */
  end(sender: Electron.WebContents): void {
    if (!this.owns(sender)) return;
    if (this.mode === 'catch') this.o.host.endWiggle();
    else if (this.mode === 'menu') this.close();
  }
  close(): void {
    const w = this.w;
    this.mode = 'none';
    if (!w || w.isDestroyed()) return;
    if (w.isVisible()) w.hide();
    w.webContents.send('family:overlay', { kind: 'hide' });
  }
  destroy(): void { if (this.w && !this.w.isDestroyed()) this.w.destroy(); this.w = null; }
}

// ------------------------------------------------------------------------------------------------ ipc

const hosts = new Set<FamilyHost>();
let wired = false;
function wireIpc(h: FamilyHost): void {
  hosts.add(h);
  if (wired) return;
  wired = true;
  const member = (e: Electron.IpcMainEvent) => { for (const x of hosts) { const id = x.idOf(e.sender, e.senderFrame); if (id) return { x, id }; } return null; };
  const overlayOf = (e: Electron.IpcMainEvent) => { for (const x of hosts) if (x.ownsOverlay(e.sender)) return x; return null; };
  ipcMain.on('family:card', (e, r) => {
    const f = member(e);
    if (!f || !r || typeof r !== 'object') return;
    const v = r as Record<string, unknown>, n = (k: string) => Number(v[k]);
    if (!['x', 'y', 'width', 'height'].every((k) => Number.isFinite(n(k)))) return;
    f.x.card(f.id, { x: n('x'), y: n('y'), width: n('width'), height: n('height') });
  });
  ipcMain.on('family:context', (e, at) => {
    const f = member(e);
    if (!f) return;
    const p = at && typeof at === 'object' ? at as Record<string, unknown> : {};
    const x = Number(p.x), y = Number(p.y);
    f.x.context(f.id, Number.isFinite(x) && Number.isFinite(y) ? { x: Math.round(x), y: Math.round(y) } : screen.getCursorScreenPoint());
  });
  ipcMain.on('family:shape', (e, rects) => { overlayOf(e)?.overlayShape(e.sender, rects); });
  ipcMain.on('family:pick', (e, a) => {
    const x = overlayOf(e);
    if (!x || !a || typeof a !== 'object') return;
    const v = a as Record<string, unknown>;
    x.overlay.pick(e.sender, v.what, v.value);
  });
  ipcMain.on('family:end', (e) => { const x = overlayOf(e); x?.overlay.end(e.sender); });
}

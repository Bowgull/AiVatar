// The window family (docs/WINDOW-FAMILY-RESEARCH.md section 2 + "DECIDED 2026-10-22"): the maths, with no windows in it.
//
// Every pop-out (the video, Claude jobs, notes, timers) is its own solid window. He drags them loosely; within 14 px of
// another member (20 px of the screen's work area) they stick. On release a stuck window is written down as an ANCHOR
// ("I sit to the right of the video, tops lined up"), and anchors make a small tree per group. Joins are FLUSH (Winamp
// style, his pick): no gap. Any member's plain drag moves the whole group; nothing comes off by pulling (his rule).
// "Pull apart" (right-click menu) spreads a group 14 px apart; he drags out the ones he wants (40 px away = free) or drags
// one to a new spot, and the rest close up again. NO placeholders anywhere: the neighbours just slide aside.
//
// Everything here is a pure function over plain data (familywin.ts moves the real windows), so the tests need no Electron.

export type Side = 'right' | 'left' | 'below' | 'above';
/** Second-axis line-up with the parent: tops (lefts), centres, bottoms (rights), or a plain offset in px. */
export type Align = 'start' | 'center' | 'end' | number;
export interface Box { x: number; y: number; width: number; height: number }
export interface Anchor { to: string; side: Side; align: Align }
/**
 * F4 (section 7): the side it snaps to picks its shape. 'free' = its own shape and size (alone, or nothing to fit to);
 * 'tall' = a column beside a taller window; 'wide' = a strip above or below a wider one. 'small' is kept for later.
 */
export type Shape = 'free' | 'wide' | 'tall' | 'small';
export interface Member {
  id: string;
  kind: string;
  /** The visible panel on screen, in DIPs, whole numbers. */
  box: Box;
  /** Its own size from before it joined: what it goes back to when it leaves the family (his rule). */
  own: { width: number; height: number };
  shape?: Shape;
  /** Absent: free-standing, or the head (root) of its group. */
  anchor?: Anchor;
}
export type Fam = Map<string, Member>;

/** His numbers. */
export const SNAP = 14;          // window to window
export const EDGE = 20;          // to the screen's work area
export const ALIGN = 8;          // lining up tops / centres / bottoms once stuck on the other axis
export const SPREAD = 14;        // the gap while pulled apart
export const FREE = 40;          // let go this far from the group and it is on its own
export const SLOT = 60;          // a window's middle this near an open side moves it there (no slot is ever drawn)
export const FLING = 2000;       // px/s: faster than this, nothing catches (AquaSnap's rule)

const SIDES: Side[] = ['right', 'below', 'left', 'above'];
export const opposite = (s: Side): Side => (s === 'right' ? 'left' : s === 'left' ? 'right' : s === 'below' ? 'above' : 'below');
const horizontal = (s: Side) => s === 'right' || s === 'left';
const r = Math.round;

export function clone(f: Fam): Fam {
  const n: Fam = new Map();
  for (const [id, m] of f) n.set(id, { ...m, box: { ...m.box }, own: { ...m.own }, ...(m.anchor ? { anchor: { ...m.anchor } } : {}) });
  return n;
}

// ------------------------------------------------------------------------------------------------ the tree

export function childrenOf(f: Fam, id: string): Member[] {
  return [...f.values()].filter((m) => m.anchor?.to === id).sort((a, b) => SIDES.indexOf(a.anchor!.side) - SIDES.indexOf(b.anchor!.side) || (a.id < b.id ? -1 : 1));
}
export function rootOf(f: Fam, id: string): string {
  let cur = id;
  for (let i = 0; i <= f.size; i++) {
    const a = f.get(cur)?.anchor;
    if (!a || !f.has(a.to)) return cur;
    cur = a.to;
  }
  return cur;   // a loop (never written, but never hang on one)
}
/** Everyone in id's group, root first, then breadth first. */
export function groupOf(f: Fam, id: string): string[] {
  if (!f.has(id)) return [];
  const root = rootOf(f, id), out = [root];
  for (let i = 0; i < out.length; i++) for (const c of childrenOf(f, out[i]!)) if (!out.includes(c.id)) out.push(c.id);
  return out;
}
export const isJoined = (f: Fam, id: string) => groupOf(f, id).length > 1;
/** Every group (lists of ids), solo windows included. */
export function groups(f: Fam): string[][] {
  const seen = new Set<string>(), out: string[][] = [];
  for (const id of f.keys()) { if (seen.has(id)) continue; const g = groupOf(f, id); g.forEach((x) => seen.add(x)); out.push(g); }
  return out;
}
/** Would anchoring child to parent close a loop (WoW refuses these too)? */
export function makesLoop(f: Fam, child: string, parent: string): boolean {
  return pathUp(f, parent).includes(child);
}
function pathUp(f: Fam, id: string): string[] {
  const out = [id];
  for (let cur = id, i = 0; i <= f.size; i++) { const a = f.get(cur)?.anchor; if (!a || !f.has(a.to)) break; cur = a.to; out.push(cur); }
  return out;
}

// ------------------------------------------------------------------------------------------------ placing

/** Where a child of this size sits against its parent. */
export function place(parent: Box, size: { width: number; height: number }, a: Anchor, gap = 0): { x: number; y: number } {
  const along = (p0: number, plen: number, clen: number) =>
    a.align === 'start' ? p0 : a.align === 'center' ? p0 + (plen - clen) / 2 : a.align === 'end' ? p0 + plen - clen : p0 + a.align;
  switch (a.side) {
    case 'right': return { x: r(parent.x + parent.width + gap), y: r(along(parent.y, parent.height, size.height)) };
    case 'left': return { x: r(parent.x - gap - size.width), y: r(along(parent.y, parent.height, size.height)) };
    case 'below': return { x: r(along(parent.x, parent.width, size.width)), y: r(parent.y + parent.height + gap) };
    case 'above': return { x: r(along(parent.x, parent.width, size.width)), y: r(parent.y - gap - size.height) };
  }
}

/** Re-place every member under rootId from its anchor (the root stays where it is). F3: called after any size change. */
export function layoutFrom(f: Fam, rootId: string, gap = 0): Fam {
  const n = clone(f);
  const ids = groupOf(n, rootId);
  for (const id of ids.slice(1)) {
    const m = n.get(id)!, p = n.get(m.anchor!.to)!;
    const at = place(p.box, m.box, m.anchor!, gap);
    m.box = { ...m.box, x: at.x, y: at.y };
  }
  return n;
}

/**
 * Make newRoot the head of its group: every anchor on the way up is turned round (right of <-> left of), keeping how the
 * two line up. Positions do not change.
 */
export function reroot(f: Fam, newRoot: string): Fam {
  const n = clone(f);
  const path = pathUp(n, newRoot);              // newRoot, its parent, ..., the old root
  const old = path.map((id) => n.get(id)!.anchor);
  for (let i = 0; i < path.length - 1; i++) {
    const child = n.get(path[i]!)!, parent = n.get(path[i + 1]!)!, a = old[i]!;
    parent.anchor = { to: child.id, side: opposite(a.side), align: typeof a.align === 'number' ? -a.align : a.align };
  }
  delete n.get(newRoot)!.anchor;
  return n;
}

/** By its OWN size (F4): a job reshaped into a long column never out-ranks the video it was fitted to. */
export function biggest(f: Fam, ids: string[]): string {
  return [...ids].sort((a, b) => {
    const A = f.get(a)!.own, B = f.get(b)!.own;
    return B.width * B.height - A.width * A.height || (a < b ? -1 : 1);
  })[0]!;
}

/** The biggest window leads (it stays put when the group spreads, sheet 63). */
export const rerootBiggest = (f: Fam, anyId: string) => reroot(f, biggest(f, groupOf(f, anyId)));

/** Which sides of each member touch another member of its group (they go square; the outer corners stay round). */
export function joinedSides(f: Fam): Map<string, Side[]> {
  const out = new Map<string, Side[]>();
  for (const id of f.keys()) out.set(id, []);
  for (const m of f.values()) {
    if (!m.anchor || !f.has(m.anchor.to)) continue;
    const mine = out.get(m.id)!, theirs = out.get(m.anchor.to)!;
    const s = opposite(m.anchor.side);
    if (!mine.includes(s)) mine.push(s);
    if (!theirs.includes(m.anchor.side)) theirs.push(m.anchor.side);
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ corners (1b)

/**
 * His call (2026-10-22): only the JOINED sides go square; every outer corner of every member stays round, joined or not.
 * A corner goes square only where a group-mate actually sits against it: the window touching that side covers the
 * corner's own pixel row (or column). A note hanging off the lower half of the video's right side squares the note's
 * left corners but leaves the video's top-right round. 1 px of slack for rounding.
 */
export type Corner = 'tl' | 'tr' | 'br' | 'bl';
export const CORNERS: Corner[] = ['tl', 'tr', 'br', 'bl'];
/** Bit per corner, the way the region helper takes it. */
export const CORNER_BIT: Record<Corner, number> = { tl: 1, tr: 2, br: 4, bl: 8 };
export const ALL_ROUND = 15;

export function squareCorners(f: Fam): Map<string, Corner[]> {
  const out = new Map<string, Corner[]>();
  const covers = (a0: number, len: number, p: number) => a0 - 1 <= p && p < a0 + len + 1;
  for (const m of f.values()) {
    const sq = new Set<Corner>();
    const g = groupOf(f, m.id);
    if (g.length > 1) {
      const b = m.box, top = b.y, bot = b.y + b.height - 1, lft = b.x, rgt = b.x + b.width - 1;
      for (const id of g) {
        if (id === m.id) continue;
        const n = f.get(id)!.box, side = contact(n, b);
        if (side === 'left') { if (covers(n.y, n.height, top)) sq.add('tl'); if (covers(n.y, n.height, bot)) sq.add('bl'); }
        if (side === 'right') { if (covers(n.y, n.height, top)) sq.add('tr'); if (covers(n.y, n.height, bot)) sq.add('br'); }
        if (side === 'above') { if (covers(n.x, n.width, lft)) sq.add('tl'); if (covers(n.x, n.width, rgt)) sq.add('tr'); }
        if (side === 'below') { if (covers(n.x, n.width, lft)) sq.add('bl'); if (covers(n.x, n.width, rgt)) sq.add('br'); }
      }
    }
    out.set(m.id, CORNERS.filter((c) => sq.has(c)));
  }
  return out;
}

/** Which corners stay round, as bits (15 = all four: a free window, Windows' own rounding). */
export const roundMask = (square: Corner[]) => CORNERS.reduce((m, c) => (square.includes(c) ? m : m | CORNER_BIT[c]), 0);

/**
 * The stepped corner's radius in DIPs. 10: concentric with the video's faded picture, which sits 4 px inside the wood with
 * its own 6 px round (popout.css .frame.faded .stage), so the picture always stays inside its rounded wood rim.
 */
export const CORNER_RADIUS = 10;

/**
 * A pixel-stepped corner: how far in each pixel row starts, from the corner's edge row inwards, in whole pixels. A
 * midpoint circle, so it is symmetric (the same steps read down the column), whole-pixel steps like the rest of his art;
 * at 10 px it is 7,5,3,2,2,1,1.
 */
export function cornerSteps(radius: number): number[] {
  const r = Math.max(0, Math.round(radius)), out: number[] = [];
  for (let i = 0; i < r; i++) {
    const y = r - i - 0.5, inset = Math.round(r - Math.sqrt(Math.max(0, r * r - y * y)));
    if (inset <= 0) break;
    out.push(inset);
  }
  return out;
}

/**
 * The window's shape as rows (what the native helper builds as a polygon region, the same rules): runs of pixel rows
 * [y0, y1) with the same left and right insets. Round corners take the steps; square ones none. Exported for the tests.
 */
export function regionRuns(width: number, height: number, mask: number, steps: number[]): { y0: number; y1: number; l: number; r: number }[] {
  const W = Math.max(0, Math.floor(width)), H = Math.max(0, Math.floor(height));
  const k = Math.min(steps.length, Math.floor(Math.min(W, H) / 2));
  const at = (y: number) => {
    const t = y < k ? steps[y]! : 0, b = H - 1 - y < k ? steps[H - 1 - y]! : 0;
    return { l: Math.max(mask & 1 ? t : 0, mask & 8 ? b : 0), r: Math.max(mask & 2 ? t : 0, mask & 4 ? b : 0) };
  };
  const runs: { y0: number; y1: number; l: number; r: number }[] = [];
  const rows = [...Array(k).keys(), ...(H - 2 * k > 0 ? [k] : []), ...[...Array(k).keys()].map((i) => H - k + i)];
  for (const y of rows) {
    const { l, r } = at(y), y1 = y === k && H - 2 * k > 0 ? H - k : y + 1;
    const last = runs.at(-1);
    if (last && last.l === l && last.r === r && last.y1 === y) last.y1 = y1; else runs.push({ y0: y, y1, l, r });
  }
  return runs;
}

// ------------------------------------------------------------------------------------------------ click-through (1b)

/**
 * His ask (2026-10-22): any member can be click-through, from the family menu (the whole group) or its own menu (just it).
 * `locked` members are click-through by their own rule and stay so whatever the group does (the video pinned, or his
 * pop-out "click through" switch). The group toggle: if any member that can change is not click-through, all go
 * click-through; if all already are, all come back. Returns the members' new state (only `ids` change).
 */
export function groupThrough(now: Map<string, boolean>, ids: string[], locked: Set<string> = new Set()): Map<string, boolean> {
  const next = new Map(now);
  const free = ids.filter((id) => !locked.has(id));
  const on = free.some((id) => !now.get(id));
  for (const id of free) next.set(id, on);
  return next;
}
/** Shown ticked in the family menu: every member of the group lets clicks through (locked ones count as through). */
export const allThrough = (now: Map<string, boolean>, ids: string[], locked: Set<string> = new Set()) => ids.length > 0 && ids.every((id) => locked.has(id) || !!now.get(id));

// ------------------------------------------------------------------------------------------------ snapping

const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0);

/** How a lines up against b on the other axis, given it sits on `side` of b. */
export function chooseAlign(a: Box, b: Box, side: Side): Align {
  const [a0, al, b0, bl] = horizontal(side) ? [a.y, a.height, b.y, b.height] : [a.x, a.width, b.x, b.width];
  const c: [Align, number][] = [['start', Math.abs(a0 - b0)], ['center', Math.abs(a0 + al / 2 - (b0 + bl / 2))], ['end', Math.abs(a0 + al - (b0 + bl))]];
  c.sort((x, y) => x[1] - y[1]);
  return c[0]![1] <= 1 ? c[0]![0] : r(a0 - b0);
}

/** a touches b flush: which side of b it sits on (1 px of slack for rounding), or null. */
export function contact(a: Box, b: Box): Side | null {
  const ov = (s: Side) => horizontal(s) ? overlap(a.y, a.y + a.height, b.y, b.y + b.height) : overlap(a.x, a.x + a.width, b.x, b.x + b.width);
  if (Math.abs(a.x - (b.x + b.width)) <= 1 && ov('right') > 0) return 'right';
  if (Math.abs(a.x + a.width - b.x) <= 1 && ov('left') > 0) return 'left';
  if (Math.abs(a.y - (b.y + b.height)) <= 1 && ov('below') > 0) return 'below';
  if (Math.abs(a.y + a.height - b.y) <= 1 && ov('above') > 0) return 'above';
  return null;
}

export interface SnapOpts { snap?: number; edge?: number; align?: number; windows?: boolean }

/**
 * Webamp's snap, for a moving set of boxes (a whole group) against the boxes standing still and the screen's work area.
 * Returns how far to nudge the whole set. Window edges facing each other snap within 14 px when the boxes overlap on
 * the other axis; once stuck on one axis, the other lines up (tops, centres, bottoms) within 8 px; the set's outline
 * snaps to the work area's edges within 20 px where no window caught it.
 */
export function snapMove(moving: Box[], still: Box[], area: Box | null, o: SnapOpts = {}): { dx: number; dy: number } {
  const S = o.snap ?? SNAP, E = o.edge ?? EDGE, A = o.align ?? ALIGN;
  let bx: { d: number; with: Box; a: Box } | null = null, by: { d: number; with: Box; a: Box } | null = null;
  if (o.windows !== false) {
    for (const a of moving) for (const b of still) {
      if (overlap(a.y, a.y + a.height, b.y - S, b.y + b.height + S) > 0) {
        for (const d of [b.x + b.width - a.x, b.x - (a.x + a.width)]) if (Math.abs(d) <= S && (!bx || Math.abs(d) < Math.abs(bx.d))) bx = { d, with: b, a };
      }
      if (overlap(a.x, a.x + a.width, b.x - S, b.x + b.width + S) > 0) {
        for (const d of [b.y + b.height - a.y, b.y - (a.y + a.height)]) if (Math.abs(d) <= S && (!by || Math.abs(d) < Math.abs(by.d))) by = { d, with: b, a };
      }
    }
  }
  let dx = bx?.d ?? null, dy = by?.d ?? null;
  // Stuck sideways: line up tops / centres / bottoms with the one it stuck to. Stuck above/below: lefts / centres / rights.
  const lineUp = (a0: number, al: number, b0: number, bl: number) => {
    const c = [b0 - a0, b0 + bl / 2 - (a0 + al / 2), b0 + bl - (a0 + al)].filter((d) => Math.abs(d) <= A);
    return c.length ? c.sort((p, q) => Math.abs(p) - Math.abs(q))[0]! : null;
  };
  if (bx && dy === null) dy = lineUp(bx.a.y, bx.a.height, bx.with.y, bx.with.height);
  if (by && dx === null) dx = lineUp(by.a.x, by.a.width, by.with.x, by.with.width);
  if (area && moving.length) {
    const L = Math.min(...moving.map((b) => b.x)), T = Math.min(...moving.map((b) => b.y));
    const R = Math.max(...moving.map((b) => b.x + b.width)), B = Math.max(...moving.map((b) => b.y + b.height));
    if (dx === null) for (const d of [area.x - L, area.x + area.width - R]) if (Math.abs(d) <= E && (dx === null || Math.abs(d) < Math.abs(dx))) dx = d;
    if (dy === null) for (const d of [area.y - T, area.y + area.height - B]) if (Math.abs(d) <= E && (dy === null || Math.abs(d) < Math.abs(dy))) dy = d;
  }
  return { dx: r(dx ?? 0), dy: r(dy ?? 0) };
}

/**
 * On release: if any member of the dragged group now touches a window outside it, the two groups become one. The touching
 * member is made its group's head and anchored to the window it touches; then the biggest window of the joined group
 * leads. Returns the new family, or null when nothing touches.
 */
export function joinOnDrop(f: Fam, dragged: string): Fam | null {
  const mine = new Set(groupOf(f, dragged));
  let best: { g: string; o: string; side: Side; ov: number } | null = null;
  for (const g of mine) for (const o of f.values()) {
    if (mine.has(o.id)) continue;
    const a = f.get(g)!.box, b = o.box, side = contact(a, b);
    if (!side) continue;
    const ov = horizontal(side) ? overlap(a.y, a.y + a.height, b.y, b.y + b.height) : overlap(a.x, a.x + a.width, b.x, b.x + b.width);
    // A side already taken on the window it touches (it has a child there) is still fine: the tree only needs one anchor.
    if (!best || ov > best.ov) best = { g, o: o.id, side, ov };
  }
  if (!best) return null;
  const n = reroot(f, best.g);
  const m = n.get(best.g)!;
  m.anchor = { to: best.o, side: best.side, align: chooseAlign(m.box, n.get(best.o)!.box, best.side) };
  return rerootBiggest(n, best.g);
}

// ------------------------------------------------------------------------------------------------ pull apart

/**
 * Take one member out of its group. Its first child takes its place (its anchor, or the head of the group); its other
 * children hang on that first child, on the same sides as before. Nothing is left behind where it was (no placeholder).
 */
export function remove(f: Fam, id: string): Fam {
  const n = clone(f);
  const m = n.get(id);
  if (!m) return n;
  const kids = childrenOf(n, id);
  const heir = kids[0];
  if (heir) {
    if (m.anchor) heir.anchor = { ...m.anchor }; else delete heir.anchor;
    for (const k of kids.slice(1)) k.anchor = { to: heir.id, side: k.anchor!.side, align: k.anchor!.align };
  }
  delete m.anchor;
  return n;
}

/**
 * Put a free member against target on side. Whatever already hung on that side of target moves out one place and hangs
 * on the newcomer instead: the neighbours slide aside.
 */
export function insert(f: Fam, id: string, target: string, side: Side, align: Align = 'start'): Fam {
  const n = clone(f);
  const m = n.get(id), t = n.get(target);
  if (!m || !t || makesLoop(n, id, target)) return n;
  for (const c of childrenOf(n, target)) if (c.anchor!.side === side && c.id !== id) c.anchor = { to: id, side, align: c.anchor!.align };
  m.anchor = { to: target, side, align };
  return n;
}

/** Spread (gap 14) or flush (gap 0) places for every member of a group, the biggest standing still. */
export function arrange(f: Fam, anyId: string, gap: number): Fam {
  const n = rerootBiggest(f, anyId);
  return layoutFrom(n, rootOf(n, anyId), gap);
}

/** The shortest distance between two boxes' edges (0 when they touch or overlap). */
export function distance(a: Box, b: Box): number {
  const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.width, b.x + b.width));
  const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.height, b.y + b.height));
  return Math.hypot(dx, dy);
}
/** Let go at least 40 px from every other member of the group: it is on its own. */
export const isFree = (box: Box, others: Box[]) => others.every((o) => distance(box, o) >= FREE);

/**
 * While wiggling, the open side nearest the dragged window's middle, if within 60 px: that is where it would go. Never
 * drawn (his rule): the caller slides the neighbours to make room instead. `f` is the group WITHOUT the dragged member.
 */
export function slotFor(f: Fam, ids: string[], drag: Box, gap = SPREAD): { target: string; side: Side } | null {
  const mid = { x: drag.x + drag.width / 2, y: drag.y + drag.height / 2 };
  let best: { target: string; side: Side; d: number } | null = null;
  for (const id of ids) {
    const t = f.get(id)!.box, anchor = f.get(id)!.anchor;
    for (const side of SIDES) {
      if (anchor && anchor.side === opposite(side)) continue;     // that side is where its own parent sits
      // The side itself, as a line along that edge (half the gap out): his window's MIDDLE has to come near it.
      const h = gap / 2;
      const seg: Box = side === 'right' ? { x: t.x + t.width + h, y: t.y, width: 0, height: t.height }
        : side === 'left' ? { x: t.x - h, y: t.y, width: 0, height: t.height }
        : side === 'below' ? { x: t.x, y: t.y + t.height + h, width: t.width, height: 0 }
        : { x: t.x, y: t.y - h, width: t.width, height: 0 };
      const d = distance({ x: mid.x, y: mid.y, width: 0, height: 0 }, seg);
      if (d <= SLOT && (!best || d < best.d)) best = { target: id, side, d };
    }
  }
  return best ? { target: best.target, side: best.side } : null;
}

/**
 * The whole rearrange, as the neighbours should look right now: id taken out and put against target on side, the group
 * spread. Used live while he drags (the others slide) and once more on release.
 */
export function rearranged(f: Fam, id: string, target: string, side: Side, gap = SPREAD): Fam {
  const out = remove(f, id);
  const t = out.get(target)!, m = out.get(id)!;
  const al = chooseAlign(m.box, t.box, side);
  return arrange(insert(out, id, target, side, typeof al === 'number' ? 'start' : al), target, gap);
}

/** The size a member goes back to when it leaves: the one it had before it joined (his rule). */
export const ownSize = (m: Member) => ({ width: m.own.width, height: m.own.height });

// ------------------------------------------------------------------------------------------------ F4: reshape on snap

/**
 * What a member says about its shapes (section 7; Android widgets' "a few layouts that each cover a range"). A member with
 * none (the video) never reshapes. Text never turns: the page re-flows (familywin sends it data-fam-shape + the size).
 *   tall: beside a TALLER window it becomes a column as tall as that window. Width: `width`, else its own width capped by
 *         `maxWidth` (a note just gets narrower). Only when that window is at least `minHeight` tall.
 *   wide: above or below a WIDER window it becomes a strip as wide as that window. Height: a number, 'auto' (its page
 *         decides, e.g. a job strip that unfolds), or absent = its own height.
 *   aspect: keeps its own shape (a pinned snip): beside, as tall as the window and as wide as that makes it; above or
 *         below, as wide and as tall as that makes it; never past `max`.
 */
export interface Layouts {
  tall?: { width?: number; maxWidth?: number; minHeight?: number };
  wide?: { height?: number | 'auto'; minWidth?: number };
  aspect?: boolean;
  max?: { width: number; height: number };
}
/** A shape and the panel size it asks for. Absent width/height: that side is the page's own business. */
export interface Fit { shape: Shape; width?: number; height?: number }

/**
 * The shape for a member of own size `own`, sitting on `side` of a neighbour whose panel is `n`. Beside a taller window:
 * tall; above or below a wider one: wide; anything else: its own shape and size.
 */
export function shapeFor(own: { width: number; height: number }, side: Side, n: Box, L?: Layouts): Fit {
  const free: Fit = { shape: 'free', width: own.width, height: own.height };
  if (!L) return free;
  const cap = (w: number, h: number) => {
    if (!L.max) return { width: r(w), height: r(h) };
    const k = Math.min(1, L.max.width / Math.max(1, w), L.max.height / Math.max(1, h));
    return { width: r(w * k), height: r(h * k) };
  };
  const ratio = own.width / Math.max(1, own.height);
  if (horizontal(side)) {
    if (n.height <= own.height) return free;
    if (L.aspect) return { shape: 'tall', ...cap(n.height * ratio, n.height) };
    if (!L.tall || n.height < (L.tall.minHeight ?? 0)) return free;
    const width = L.tall.width ?? Math.min(own.width, L.tall.maxWidth ?? own.width);
    return { shape: 'tall', width: r(width), height: r(L.max ? Math.min(L.max.height, n.height) : n.height) };
  }
  if (n.width <= own.width) return free;
  if (L.aspect) return { shape: 'wide', ...cap(n.width, n.width / ratio) };
  if (!L.wide || n.width < (L.wide.minWidth ?? 0)) return free;
  const h = L.wide.height;
  return { shape: 'wide', width: r(L.max ? Math.min(L.max.width, n.width) : n.width), ...(h === 'auto' ? {} : { height: r(typeof h === 'number' ? h : own.height) }) };
}

/**
 * Every member's shape, worked out from the head of each group down (a child fits to its parent's NEW size, so a note
 * beside a job column beside the video comes out as tall as both). The head keeps its own shape, unless the only thing it
 * could fit to is a child that never reshapes (the video hanging under a job). A free-standing member: its own shape.
 */
export function fitShapes(f: Fam, layoutsOf: (m: Member) => Layouts | undefined): Map<string, Fit> {
  const out = new Map<string, Fit>();
  const sizeOf = (id: string) => { const m = f.get(id)!, t = out.get(id); return { ...m.box, width: t?.width ?? m.box.width, height: t?.height ?? m.box.height }; };
  for (const g of groups(f)) {
    const root = f.get(g[0]!)!;
    const own: Fit = { shape: 'free', width: root.own.width, height: root.own.height };
    let fit = own;
    if (g.length > 1) {
      const fixed = childrenOf(f, root.id).filter((c) => !layoutsOf(c));
      if (fixed.length) fit = shapeFor(root.own, opposite(fixed[0]!.anchor!.side), fixed[0]!.box, layoutsOf(root));
    }
    out.set(root.id, layoutsOf(root) ? fit : { shape: 'free' });
    for (const id of g.slice(1)) {
      const m = f.get(id)!, L = layoutsOf(m);
      if (!L) { out.set(id, { shape: 'free' }); continue; }
      out.set(id, shapeFor(m.own, m.anchor!.side, sizeOf(m.anchor!.to), L));
    }
  }
  return out;
}

/** The family with each member at the size its fit asks for (unasked sides as they are), re-placed from the heads. */
export function applyFits(f: Fam, fits: Map<string, Fit>, gap = 0): Fam {
  let n = clone(f);
  for (const [id, t] of fits) {
    const m = n.get(id);
    if (!m) continue;
    m.shape = t.shape;
    m.box = { ...m.box, width: t.width ?? m.box.width, height: t.height ?? m.box.height };
    // A column runs the full side of what it is fitted to, a strip the full width: lined up from the start.
    if (t.shape !== 'free' && m.anchor) m.anchor = { ...m.anchor, align: 'start' };
  }
  // A head fitted to a child that never reshapes (the video hanging under a job): that child lines up from the start.
  for (const g of groups(n)) {
    const root = n.get(g[0]!)!;
    if (g.length < 2 || !root.shape || root.shape === 'free') continue;
    for (const c of childrenOf(n, root.id)) if (fits.get(c.id)?.width === undefined && fits.get(c.id)?.height === undefined) c.anchor = { ...c.anchor!, align: 'start' };
  }
  for (const g of groups(n)) if (g.length > 1) n = layoutFrom(n, g[0]!, gap);
  return n;
}

/**
 * The window has to move by this much so the whole group is on a screen: on the work area that holds most of the head,
 * or the nearest one when the head is on a screen that is not there any more (a missing monitor). Never squashed.
 */
export function onScreen(boxes: Box[], areas: Box[], head?: Box): { dx: number; dy: number } {
  if (!boxes.length || !areas.length) return { dx: 0, dy: 0 };
  const L = Math.min(...boxes.map((b) => b.x)), T = Math.min(...boxes.map((b) => b.y));
  const R = Math.max(...boxes.map((b) => b.x + b.width)), B = Math.max(...boxes.map((b) => b.y + b.height));
  const h = head ?? boxes[0]!;
  const share = (a: Box) => Math.max(0, overlap(h.x, h.x + h.width, a.x, a.x + a.width)) * Math.max(0, overlap(h.y, h.y + h.height, a.y, a.y + a.height));
  const a = [...areas].sort((p, q) => share(q) - share(p) || distance(h, p) - distance(h, q))[0]!;
  const fit = (lo: number, hi: number, alo: number, ahi: number) => (hi - lo > ahi - alo ? alo - lo : lo < alo ? alo - lo : hi > ahi ? ahi - hi : 0);
  return { dx: r(fit(L, R, a.x, a.x + a.width)), dy: r(fit(T, B, a.y, a.y + a.height)) };
}

// ------------------------------------------------------------------------------------------------ motion

export interface Spring { x: number; v: number }
/**
 * One step of a damped spring set by how long it takes (`response`, s) and how much it bounces (`damping`, 1 = none),
 * SwiftUI's terms. Semi-implicit Euler in 4 ms slices, steady at 60 Hz.
 */
export function springStep(s: Spring, target: number, dt: number, response: number, damping: number): Spring {
  const k = (2 * Math.PI / response) ** 2, c = 2 * damping * Math.sqrt(k);
  let { x, v } = s;
  for (let left = dt; left > 1e-6; left -= 0.004) {
    const h = Math.min(0.004, left);
    v += (-k * (x - target) - c * v) * h;
    x += v * h;
  }
  return { x, v };
}
export const settled = (s: Spring, target: number) => Math.abs(s.x - target) < 0.5 && Math.abs(s.v) < 4;

/** His motion table (sheet 63). */
export const MOTION = {
  spread: { response: 0.35, damping: 0.7 },
  back: { response: 0.4, damping: 0.8 },     // let go too close: back to its place; or into its new place
  join: { response: 0.5, damping: 0.825 },
  settle: { response: 0.32, damping: 0.85 }, // F3: children following a size change
} as const;

/** The 1 px shimmy: left, right, up, down, each member on its own 0.26-0.34 s loop, out of step with the others. */
export function shimmy(t: number, seed: number): { dx: number; dy: number } {
  const period = 0.26 + ((seed * 7919) % 9) / 100;            // 0.26 .. 0.34
  const step = Math.floor(t / period + seed) % 4;
  return [{ dx: -1, dy: 0 }, { dx: 1, dy: 0 }, { dx: 0, dy: -1 }, { dx: 0, dy: 1 }][step]!;
}

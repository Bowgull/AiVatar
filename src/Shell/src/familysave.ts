// F5, the window family's memory (docs/WINDOW-FAMILY-RESEARCH.md section 2 "Save and restore", 2026-10-22): the group
// layout is saved as ANCHORS (who sits on which side of whom), per screen arrangement (monitor ids + scale), and put back
// when members reopen into their old slots, across restarts. Pure functions over plain data; familywin.ts reads and
// writes the file.
//
// The rules:
//   - one layout per screen arrangement. A new arrangement (a monitor unplugged) starts from the last one used, and the
//     group is pushed back onto a screen that is there (family.ts onScreen), never squashed;
//   - a member's entry is rewritten only when HE changed it (a join, a pull apart, a drag). A window closing does not
//     erase anyone's slot: the video put away keeps its place, and the job that was beside it keeps "beside the video",
//     so reopening the video brings the job back to its side;
//   - its own size from before it joined is kept too, so a note that was a column when Aang closed comes back as itself
//     if there is nothing to fit to.
import type { Anchor, Box, Fam, Shape } from './family.ts';
import { groupOf, insert, makesLoop, remove } from './family.ts';

export interface Display { id: number; scaleFactor: number; bounds: Box }
export interface SavedMember { anchor?: Anchor; shape?: Shape; own: { width: number; height: number }; at: number }
export interface SavedLayout { at: number; members: Record<string, SavedMember> }
export interface Saved { v: 1; last: string; layouts: Record<string, SavedLayout> }

export const EMPTY: Saved = { v: 1, last: '', layouts: {} };
/** Kept per arrangement: the newest this many members (job ids come and go), and this many arrangements. */
export const MAX_MEMBERS = 40, MAX_LAYOUTS = 8;

/** The screen arrangement: every monitor's id, scale (DPI) and size, in a fixed order. */
export function screenKey(ds: Display[]): string {
  return [...ds].sort((a, b) => a.id - b.id).map((d) => `${d.id}@${Math.round(d.scaleFactor * 100)}:${d.bounds.width}x${d.bounds.height}+${d.bounds.x}+${d.bounds.y}`).join('|');
}

/** The members of the family as they stand, ready to keep. */
export function snapshot(f: Fam, now: number): Record<string, SavedMember> {
  const out: Record<string, SavedMember> = {};
  for (const m of f.values()) {
    out[m.id] = { own: { width: Math.round(m.own.width), height: Math.round(m.own.height) }, at: now,
      ...(m.anchor && f.has(m.anchor.to) ? { anchor: { ...m.anchor } } : {}), ...(m.shape && m.shape !== 'free' ? { shape: m.shape } : {}) };
  }
  return out;
}

/**
 * The saved layouts with this arrangement's updated: members in `f` that are not in `keep` take their entry from now;
 * everyone else (closed, or only moved because something else closed) keeps the entry they had.
 */
export function mergeSave(s: Saved, key: string, f: Fam, keep: ReadonlySet<string>, now: number): Saved {
  const old = layoutFor(s, key)?.members ?? {};
  const members: Record<string, SavedMember> = { ...old };
  const fresh = snapshot(f, now);
  for (const [id, m] of Object.entries(fresh)) if (!keep.has(id) || !old[id]) members[id] = m;
  const newest = Object.entries(members).sort((a, b) => b[1].at - a[1].at).slice(0, MAX_MEMBERS);
  const layouts = { ...s.layouts, [key]: { at: now, members: Object.fromEntries(newest) } };
  const kept = Object.entries(layouts).sort((a, b) => b[1].at - a[1].at).slice(0, MAX_LAYOUTS);
  return { v: 1, last: key, layouts: Object.fromEntries(kept) };
}

/** This arrangement's layout; on a new arrangement, the last one used (a monitor unplugged); none the very first time. */
export function layoutFor(s: Saved, key: string): SavedLayout | null {
  return s.layouts[key] ?? (s.last ? s.layouts[s.last] ?? null : null);
}

/**
 * Put `id` (just opened) back into its old slot: against its saved parent if that window is open, and with every open
 * window that used to hang on it and is only where it is because `id` was away (`waiting`) pulled back to its side.
 * Null when nothing goes back. Positions are not decided here: the caller re-places the group from its head.
 */
export function restoreInto(f: Fam, id: string, saved: Record<string, SavedMember>, waiting: ReadonlySet<string>): Fam | null {
  if (!f.has(id)) return null;
  let n = f, changed = false;
  const a = saved[id]?.anchor;
  if (a && a.to !== id && n.has(a.to) && groupOf(n, id).length === 1 && !makesLoop(n, id, a.to)) {
    n = insert(n, id, a.to, a.side, a.align);
    changed = true;
  }
  for (const [cid, sm] of Object.entries(saved)) {
    if (cid === id || sm.anchor?.to !== id || !n.has(cid) || !waiting.has(cid)) continue;
    if (n.get(cid)!.anchor?.to === id) continue;
    const out = remove(n, cid);
    if (makesLoop(out, cid, id)) continue;
    n = insert(out, cid, id, sm.anchor.side, sm.anchor.align);
    changed = true;
  }
  return changed ? n : null;
}

/** A saved file, read back: anything that is not the right shape is dropped (never trust a file on disk blindly). */
export function readSaved(raw: unknown): Saved {
  const o = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  if (o.v !== 1 || !o.layouts || typeof o.layouts !== 'object') return { ...EMPTY, layouts: {} };
  const sides = ['right', 'left', 'below', 'above'];
  const num = (x: unknown) => typeof x === 'number' && Number.isFinite(x);
  const layouts: Record<string, SavedLayout> = {};
  for (const [k, l] of Object.entries(o.layouts as Record<string, unknown>).slice(0, MAX_LAYOUTS)) {
    const lo = l && typeof l === 'object' ? l as Record<string, unknown> : null;
    if (!lo || !lo.members || typeof lo.members !== 'object') continue;
    const members: Record<string, SavedMember> = {};
    for (const [id, m] of Object.entries(lo.members as Record<string, unknown>).slice(0, MAX_MEMBERS)) {
      const v = m && typeof m === 'object' ? m as Record<string, unknown> : null;
      const own = v?.own && typeof v.own === 'object' ? v.own as Record<string, unknown> : null;
      if (!v || !own || !num(own.width) || !num(own.height) || id.length > 200) continue;
      const an = v.anchor && typeof v.anchor === 'object' ? v.anchor as Record<string, unknown> : null;
      const align = an && (['start', 'center', 'end'].includes(an.align as string) || num(an.align)) ? an.align as Anchor['align'] : null;
      const anchor = an && typeof an.to === 'string' && sides.includes(an.side as string) && align !== null ? { to: an.to, side: an.side as Anchor['side'], align } : undefined;
      const shape = v.shape === 'tall' || v.shape === 'wide' ? v.shape : undefined;
      members[id] = { own: { width: Math.round(own.width as number), height: Math.round(own.height as number) }, at: num(v.at) ? v.at as number : 0, ...(anchor ? { anchor } : {}), ...(shape ? { shape } : {}) };
    }
    layouts[k] = { at: num(lo.at) ? lo.at as number : 0, members };
  }
  return { v: 1, last: typeof o.last === 'string' ? o.last : '', layouts };
}

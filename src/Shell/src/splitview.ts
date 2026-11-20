// Sheet 121 (4), his pick 2026-11-20: two pages side by side in one window. The sums shared by the Shell (where the two
// pages go) and the band (where it draws their name strips and the wood peg), kept apart so they are tested alone.

/** The name strip over each page, in pixels. */
export const SPLIT_HEAD = 34;
/** The gap between the two pages, where the wood peg sits. */
export const SPLIT_GAP = 22;
/** Let a tab go in this share of the window at its right edge, and it opens side by side. */
export const SPLIT_EDGE = 0.22;
/** Neither page gets narrower than this share. */
export const SPLIT_MIN = 0.2;

/** A share of the width, kept between the limits (anything that is not a number is half). */
export function clampSplit(r: number): number {
  return Number.isFinite(r) ? Math.min(1 - SPLIT_MIN, Math.max(SPLIT_MIN, r)) : 0.5;
}
/** The left page's width in a page area `w` wide: its share of what is left beside the peg's gap, in whole pixels. */
export function splitLeftWidth(w: number, ratio: number): number {
  return Math.max(0, Math.round((Math.max(0, w) - SPLIT_GAP) * clampSplit(ratio)));
}

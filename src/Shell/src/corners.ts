// Window corners in pixel steps (moved out of family.ts on 2026-11-20, phase 1 of Samara's own repo,
// docs/SAMARA-REPO-PLAN.md): Samara's windows (winedge.ts) and Aang's window family both cut their corners with these.
// Plain maths, no Electron.

export type Corner = 'tl' | 'tr' | 'br' | 'bl';
export const CORNERS: Corner[] = ['tl', 'tr', 'br', 'bl'];
/** Bit per corner, the way the region helper takes it. */
export const CORNER_BIT: Record<Corner, number> = { tl: 1, tr: 2, br: 4, bl: 8 };
export const ALL_ROUND = 15;

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
 * The mini player's corner (sheet 119 B, his pick 2026-11-07): the wood's own staircase, 13 art px, clamped to just under
 * half the body so the folded strip is nearly a pill. The same formula as miniplayer.js bodyR; keep them together.
 */
export const PLAYER_CORNER_ART = 13;
export const bodyCornerArt = (r: number, wArt: number, hArt: number) => Math.max(0, Math.min(r, Math.floor(Math.min(wArt, hArt) / 2) - 1));

/**
 * The steps of a corner drawn in art pixels (pix.js rrMask: pixel centres inside radius r + 0.01), each art pixel `px`
 * screen pixels, so a window cut by these rows follows the wood's staircase exactly. Rows from the corner's edge inwards.
 */
export function artCornerSteps(r: number, px: number): number[] {
  const R = Math.max(0, Math.round(r)), artRow: number[] = [];
  for (let y = 0; y < R; y++) {
    let x = 0;
    while (x < R && Math.hypot(x + 0.5 - R, y + 0.5 - R) > R + 0.01) x++;
    artRow.push(x);
  }
  const rows = Math.round(R * px), out: number[] = [];
  for (let i = 0; i < rows; i++) {
    const inset = Math.round(artRow[Math.min(R - 1, Math.floor(i / px))]! * px);
    if (inset <= 0) break;
    out.push(inset);
  }
  return out;
}

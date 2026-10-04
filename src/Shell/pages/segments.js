// Which segment, if any, the viewer has just reached.
//
// Its own file because both the page and the tests use it, and because the rule it holds is the one
// most worth being able to read on its own: a skip fires only at the very start of a segment.
//
// If he has let the opening run for twenty seconds he is watching it on purpose. Jumping then would be
// the player fighting him. One second is enough to catch the moment it begins, because the player
// reports where it is several times a second.
export const WINDOW_S = 1;

/**
 * @param {{from:number,to:number,says:string}[]} segments
 * @param {number} at where the video is now, in seconds
 * @param {Set<number>} already segments already skipped, so one is never fought over twice
 */
export function dueAt(segments, at, already = new Set()) {
  for (const s of segments) {
    if (already.has(s.from)) continue;
    if (at >= s.from && at < s.from + WINDOW_S) return s;
  }
  return null;
}

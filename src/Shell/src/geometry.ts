// Where the pop-out sits, how big it is, and keeping it 16 by 9.
//
// His rule, sheet 4 section 3: "Your size wins." Whatever he drags it to is the size it opens at next
// time, in the same place. It never resizes itself. The presets are shortcuts, not modes.
//
// 16 by 9 is worked out here rather than handed to Windows. `setAspectRatio` was tested on 2026-10-04
// and does not apply to a size set from code, only to a drag, so a preset or a restore would quietly
// produce a squashed picture.

export interface Box { x: number; y: number; width: number; height: number }
export interface Screen { x: number; y: number; width: number; height: number }

/** Below this a video is not worth watching, and Twitch refuses to play at all under 400 by 300. */
export const MIN = { width: 400, height: 300 };
/**
 * How tall the wooden grab bar is, in pixels, matching --bar in popout.css.
 *
 * It is here because 16 by 9 has to hold for THE PICTURE, not for the window. Making the window 16 by
 * 9 and putting a bar inside it leaves the picture short, and it letterboxes: that is exactly what the
 * first real run looked like on 2026-10-04.
 */
export const BAR = 34;
/** How close to an edge counts as "drop it near an edge and it snaps flush" (sheet 4). */
export const SNAP = 24;

/** The nearest 16 by 9 box, holding whichever side he was dragging. */
export function hold169(width: number, height: number, drove: 'width' | 'height' = 'width'): { width: number; height: number } {
  const w = Math.max(MIN.width, Math.round(width));
  const h = Math.max(MIN.height, Math.round(height));
  if (drove === 'width') {
    // The picture is 16 by 9; the window is that plus the bar.
    const byWidth = Math.round(w * 9 / 16) + BAR;
    if (byWidth < MIN.height) return { width: Math.round((MIN.height - BAR) * 16 / 9), height: MIN.height };
    return { width: w, height: byWidth };
  }
  const byHeight = Math.round((h - BAR) * 16 / 9);
  if (byHeight < MIN.width) return { width: MIN.width, height: Math.round(MIN.width * 9 / 16) + BAR };
  return { width: byHeight, height: h };
}

/** The picture inside a window of this size: what has to come out 16 by 9. */
export const pictureOf = (box: { width: number; height: number }) => ({ width: box.width, height: box.height - BAR });

/**
 * Where it goes the very first time: the right-hand side.
 *
 * His health bars are top-left and his action bars are bottom-centre, so the mid-right is the only
 * quiet part of a WoW screen (sheet 4 section 3, and the 2026-10-03 research on game interfaces).
 */
export function firstTime(screen: Screen): Box {
  const width = Math.max(MIN.width, Math.min(640, Math.round(screen.width * 0.33)));
  const { width: w, height: h } = hold169(width, 0, 'width');
  return {
    x: screen.x + screen.width - w - SNAP,
    y: screen.y + Math.round((screen.height - h) / 2),
    width: w,
    height: h,
  };
}

/** Pull it flush when he drops it near an edge. */
export function snapToEdges(box: Box, screen: Screen): Box {
  const out = { ...box };
  const right = screen.x + screen.width;
  const bottom = screen.y + screen.height;
  if (Math.abs(out.x - screen.x) <= SNAP) out.x = screen.x;
  if (Math.abs(out.y - screen.y) <= SNAP) out.y = screen.y;
  if (Math.abs(out.x + out.width - right) <= SNAP) out.x = right - out.width;
  if (Math.abs(out.y + out.height - bottom) <= SNAP) out.y = bottom - out.height;
  return out;
}

/**
 * Drag it back on screen if the remembered place no longer exists.
 *
 * This machine is streamed from Shadow and the resolution changes, so a window remembered on a screen
 * that is now smaller would open where he cannot reach it. Enough of the bar has to be reachable to
 * grab it: a window is only lost if you cannot move it.
 */
export function ontoScreen(box: Box, screen: Screen): Box {
  const out = { ...box };
  out.width = Math.min(out.width, screen.width);
  out.height = Math.min(out.height, screen.height);
  const keep = 80;                                  // enough of the grab bar to take hold of
  out.x = Math.min(Math.max(out.x, screen.x - out.width + keep), screen.x + screen.width - keep);
  out.y = Math.min(Math.max(out.y, screen.y), screen.y + screen.height - 40);
  return out;
}

/** The preset shortcuts from sheet 4. Each is a 16 by 9 box placed on the right-hand side. */
export function preset(name: 'corner' | 'medium' | 'big', screen: Screen): Box {
  const share = name === 'corner' ? 0.22 : name === 'medium' ? 0.36 : 0.55;
  const { width, height } = hold169(Math.round(screen.width * share), 0, 'width');
  return {
    x: screen.x + screen.width - width - SNAP,
    y: name === 'corner'
      ? screen.y + screen.height - height - SNAP
      : screen.y + Math.round((screen.height - height) / 2),
    width,
    height,
  };
}

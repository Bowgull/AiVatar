// The capture engine's rules, pure (capture.ts takes the pictures): one size rule, and which views a window shows.
import type { Rectangle } from 'electron';

/** Never wider than this by default: what Claude reads text in well, about 1,500 tokens for a full window. */
export const MAX_W = 1280;
/** The sizes callers ask for, in one place. */
export const SIZES = { claude: 1280, aang: 1200, glance: 960, thumb: 320 } as const;

/**
 * The one size rule (pure): the width a picture should be, given the pixels it came in, its CSS width (0 when not
 * known), the widest allowed and the pixels per CSS pixel wanted. Never made bigger than it came.
 */
export function fitWidth(px: number, css: number, maxWidth = MAX_W, scale = 1): number {
  const want = Math.min(maxWidth, css > 0 ? Math.round(css * scale) : px);
  return Math.max(1, Math.min(px, want));
}

/** One layer of a window picture: where it sits (CSS pixels of the window's content) and what to draw. */
export interface Layer { x: number; y: number; width: number; height: number; name: string }

/** The views drawn in a window, bottom first, that are shown and have a size (pure on what it is given). */
export function shownLayers(children: { visible: boolean; bounds: Rectangle; name: string }[], area: { width: number; height: number }): Layer[] {
  return children.filter((c) => c.visible && c.bounds.width > 1 && c.bounds.height > 1 && c.bounds.x < area.width && c.bounds.y < area.height && c.bounds.x + c.bounds.width > 0 && c.bounds.y + c.bounds.height > 0)
    .map((c) => ({ x: c.bounds.x, y: c.bounds.y, width: c.bounds.width, height: c.bounds.height, name: c.name }));
}


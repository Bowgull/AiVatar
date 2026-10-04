// Step 6.10b: putting Aang's windows where Aang is.
//
// The pet stays a C# window and the bubble becomes an Electron one (6.12), so two programs have to
// behave like a single thing. The C# side sends where the SPRITE is, in screen pixels, and everything
// here works out where a window of a given size goes.
//
// THE ANCHOR IS THE SPRITE, NOT THE WINDOW. The pet's window is 770 x 740 unscaled and the little monk
// occupies a 224 px square a long way inside it: the rest is empty room the bubble grows into. Anchoring
// to the window corner would put the bubble hundreds of pixels from him, and worse, the corner moves when
// display scaling changes while the sprite deliberately does not (PetWindow.Rescale goes to some trouble
// to keep him still). So the sprite is the only honest thing to measure from.
//
// Every number here is read out of the C# that draws it today, named in the comment beside it, because
// "nothing about where the bubble appears is different from today" is this step's whole acceptance test.
import type { Box, Screen } from './geometry.ts';

/** Which screen edge the pet is docked to. Mirrors Docking.DockEdge in Dock.cs. */
export type Edge = 'none' | 'left' | 'right' | 'top' | 'bottom';

/** Where the pet says it is. Screen pixels, already scaled: the Body does that conversion, once. */
export interface PetAt {
  /** The sprite's own rectangle on screen - not the window's. */
  sprite: Box;
  /** The working area of the display the pet is on, so a bubble never lands under the taskbar. */
  screen: Screen;
  /** Display scaling, e.g. 1.5 at 150%. The offsets below are unscaled and multiplied by this. */
  scale: number;
  edge: Edge;
  /** Docked AND collapsed, so only his head shows. The bubble still has to be fully on screen. */
  peeking: boolean;
}

/**
 * Where the bubble sits relative to the sprite, in UNSCALED pixels, taken from BubbleView.cs:24
 * (`Left = 6, Right = 262, Bottom = 124`) and Dock.cs:19 (`SpriteX = 246, SpriteY = 86`), both measured
 * in the same translated space (PetWindow.cs:953 translates by Margin, Extra before drawing either).
 *
 * So the bubble's bottom-right corner sits 16 px right of the sprite's left edge and 38 px below its
 * top, and it grows UP and LEFT from there. That is why a long reply widens leftwards rather than
 * pushing him across the screen.
 */
export const BUBBLE_FROM_SPRITE = {
  /** Right edge of the bubble, relative to the sprite's LEFT edge: 262 - 246. */
  right: 16,
  /** Bottom edge of the bubble, relative to the sprite's TOP edge: 124 - 86. */
  bottom: 38,
} as const;

/**
 * Place a window of this size so it hangs off the sprite the way the drawn bubble does, and is fully on
 * screen. Growth is up and to the left, so the returned box's bottom-right is the fixed point.
 */
export function bubbleAt(at: PetAt, size: { width: number; height: number }): Box {
  const s = at.scale || 1;
  const right = at.sprite.x + BUBBLE_FROM_SPRITE.right * s;
  const bottom = at.sprite.y + BUBBLE_FROM_SPRITE.bottom * s;
  return onScreen({ x: right - size.width, y: bottom - size.height, width: size.width, height: size.height }, at.screen);
}

/**
 * Where the typing box sits relative to the sprite, unscaled, read out of the C# rather than guessed (the
 * first version guessed "under his feet" and the recording showed Aang standing on top of the box).
 *
 * PetWindow.OpenInput passes `Location + (Margin, Extra) * scale`, which is the drawn origin, and
 * InputWindow.Open adds `(6, 132) * scale`. The sprite sits at Dock.cs `(SpriteX, SpriteY) = (246, 86)`
 * from that same origin. So the box's top-left is 240 px LEFT of the sprite and 46 px below its top:
 * beside him, in line with the bubble's left edge, just under the bubble.
 */
export const INPUT_FROM_SPRITE = { left: 6 - 246, top: 132 - 86 } as const;

/**
 * The page draws the box 6 px in from its window's left edge (input.css `.frame` padding), so the WINDOW
 * starts that much further left for the drawn box to land where the old one did.
 */
export const INPUT_FRAME_INSET = 6;

/** The typing box: beside him, under the bubble, where the old one opens. */
export function inputAt(at: PetAt, size: { width: number; height: number }): Box {
  const s = at.scale || 1;
  const left = at.sprite.x + INPUT_FROM_SPRITE.left * s - INPUT_FRAME_INSET;
  const top = at.sprite.y + INPUT_FROM_SPRITE.top * s;
  return onScreen({ x: left, y: top, width: size.width, height: size.height }, at.screen);
}

/**
 * Keep a box inside the working area.
 *
 * Deliberately NOT geometry.ts's `ontoScreen`, which only guarantees a window overlaps a screen at all.
 * That is right for a pop-out he dragged somewhere on purpose; it is wrong here, where nothing was
 * dragged and a bubble four fifths off the edge is simply unreadable. The same mistake is written up in
 * PetWindow.Rescale, which hit it at 150% scaling.
 *
 * A box too big for the screen is pinned to the top-left rather than centred, because text reads from
 * there and losing the end of a sentence beats losing the start of it.
 */
export function onScreen(box: Box, screen: Screen): Box {
  const x = box.width >= screen.width
    ? screen.x
    : Math.min(Math.max(box.x, screen.x), screen.x + screen.width - box.width);
  const y = box.height >= screen.height
    ? screen.y
    : Math.min(Math.max(box.y, screen.y), screen.y + screen.height - box.height);
  return { x: Math.round(x), y: Math.round(y), width: box.width, height: box.height };
}

/**
 * Has he moved far enough to be worth re-placing anything?
 *
 * A drag arrives as a stream of positions, and moving a window is not free, so the small jitter of a
 * mouse held still is ignored. One pixel at 100% is one pixel at 200% as far as his eye is concerned,
 * so the threshold scales with him.
 */
export function moved(a: PetAt | null, b: PetAt): boolean {
  if (!a) return true;
  if (a.scale !== b.scale || a.edge !== b.edge || a.peeking !== b.peeking) return true;
  if (a.screen.x !== b.screen.x || a.screen.y !== b.screen.y
    || a.screen.width !== b.screen.width || a.screen.height !== b.screen.height) return true;
  const slack = 2 * (b.scale || 1);
  return Math.abs(a.sprite.x - b.sprite.x) >= slack || Math.abs(a.sprite.y - b.sprite.y) >= slack
    || a.sprite.width !== b.sprite.width || a.sprite.height !== b.sprite.height;
}

/** Fill in anything missing or nonsensical, rather than throwing on a message from another program. */
export function readPetAt(raw: unknown): PetAt | null {
  const r = (raw ?? {}) as Record<string, any>;
  const box = (v: any): Box | null => {
    const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
    const x = n(v?.x), y = n(v?.y), w = n(v?.width), h = n(v?.height);
    return x === null || y === null || w === null || h === null || w <= 0 || h <= 0 ? null : { x, y, width: w, height: h };
  };
  const sprite = box(r.sprite);
  const screen = box(r.screen);
  if (!sprite || !screen) return null;
  const scale = typeof r.scale === 'number' && r.scale > 0.2 && r.scale < 8 ? r.scale : 1;
  const edge: Edge = ['left', 'right', 'top', 'bottom'].includes(r.edge) ? r.edge : 'none';
  return { sprite, screen, scale, edge, peeking: r.peeking === true };
}

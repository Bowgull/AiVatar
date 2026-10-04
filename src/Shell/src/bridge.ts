// The shape of what a page can see, for TypeScript. The real thing is preload.cjs, which has to be
// plain CommonJS JavaScript (see the note at the top of that file).
export interface ShellBridge {
  /** Hear messages from the brain. Returns a function that stops listening. */
  onMessage(fn: (m: Record<string, unknown>) => void): () => void;
  /** Hear whether the brain is reachable. */
  onConnected(fn: (up: boolean) => void): () => void;
  /** Which window this is, so one page can be used in more than one place. */
  windowKind(): Promise<string>;

  /** What the pop-out should play. The address is built in the main process. */
  onPopout(fn: (v: { url: string; source: string; label: string; live: boolean; title: string }) => void): () => void;
  /** Out of the way, still playing. */
  popoutHide(): void;
  popoutClose(): void;
  /** How see-through the window is, 0.2 to 1. */
  popoutOpacity(v: number): void;
  popoutFullscreen(): void;
  popoutToMac(): void;
  /** How many pixels of the window are Aang's own chrome, measured by the page. */
  popoutChrome(px: number): void;
  /** His switches, so the page knows whether it may fade. */
  onPopoutSettings(fn: (s: { fadeControls?: boolean; alwaysOnTop?: boolean; clickThrough?: boolean }) => void): () => void;
}

declare global {
  interface Window { aang: ShellBridge }
}

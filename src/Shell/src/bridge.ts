// The shape of what a page can see, for TypeScript. The real thing is preload.cjs, which has to be
// plain CommonJS JavaScript (see the note at the top of that file).
export interface ShellBridge {
  /** Hear messages from the brain. Returns a function that stops listening. */
  onMessage(fn: (m: Record<string, unknown>) => void): () => void;
  /** Hear whether the brain is reachable. */
  onConnected(fn: (up: boolean) => void): () => void;
  /** Which window this is, so one page can be used in more than one place. */
  windowKind(): Promise<string>;
}

declare global {
  interface Window { aang: ShellBridge }
}

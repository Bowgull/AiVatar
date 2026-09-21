// What Joshua is doing right now, from the title of the window he is in.
//
// This is the cheap tier of perception. The Body already polls the foreground process twice a second at
// 0.31% of one core; the window title comes with it for nothing, and it answers most of "what is he
// doing" - the repo he is in, the file he has open, the page he is reading, the game he is playing -
// without a single screenshot. A 1080p screenshot is about 1,560 visual tokens; this is free.
//
// It is held in memory only and never written to disk. Aang is not told any of it unless he asks: it
// reaches a conversation only through the what_im_doing tool, so a turn that has nothing to do with the
// screen costs nothing and leaks nothing.

export interface Activity {
  /** Process name without the extension, e.g. "Code", "WowB", "chrome". */
  process: string;
  /** The window title, trimmed and capped. May be empty. */
  title: string;
  /** When this became the foreground window. */
  at: number;
  /** The window's handle, for reading what is in it (screen.ts). 0 when the Body did not say. */
  hwnd?: number;
}

const MAX_ENTRIES = 50;
const MAX_TITLE = 120;
/** Ignore a window that was only in front for a moment while alt-tabbing through. */
export const SETTLE_MS = 1500;

/** Aang's own windows, by exact name: matching anything merely starting with "aang" threw away a real
 *  folder called aang-window-RzCvMb, which is exactly the kind of thing Joshua would be looking at. */
const OWN_WINDOW = /^(aang (body|input|hotkey)|aivatar)$/i;
/** Shell furniture that is never an answer to "what am I doing". */
const NOISE = /^(program manager|windows input experience|task switching|search|start|desktop)$/i;

export class ActivityLog {
  private entries: Activity[] = [];
  /** False when Joshua has switched this off in the tray; nothing is recorded or reported. */
  watching = true;

  record(process: string, title: string, at = Date.now(), hwnd = 0): void {
    if (!this.watching) return;
    const p = (process ?? '').trim();
    const t = (title ?? '').trim().slice(0, MAX_TITLE);
    if (!p && !t) return;
    if (/^aang$/i.test(p) || OWN_WINDOW.test(t) || NOISE.test(p) || NOISE.test(t)) return;
    const last = this.entries[this.entries.length - 1];
    if (last && last.process === p && last.title === t) { if (hwnd) last.hwnd = hwnd; return; }   // same window, nothing changed
    this.entries.push({ process: p, title: t, at, hwnd });
    if (this.entries.length > MAX_ENTRIES) this.entries.shift();
  }

  /** Forget everything. Used when Joshua switches it off, so nothing lingers. */
  clear(): void { this.entries = []; }

  current(): Activity | null { return this.entries[this.entries.length - 1] ?? null; }

  /** Most recent first, dropping the flicker of windows that were only in front for a moment. */
  recent(now = Date.now(), limit = 8): Activity[] {
    const out: Activity[] = [];
    for (let i = this.entries.length - 1; i >= 0 && out.length < limit; i--) {
      const e = this.entries[i]!;
      const until = i + 1 < this.entries.length ? this.entries[i + 1]!.at : now;
      if (until - e.at >= SETTLE_MS || i === this.entries.length - 1) out.push(e);
    }
    return out;
  }

  /** A plain answer for "what am I doing", straight from the window titles. */
  summary(now = Date.now()): string {
    if (!this.watching) return 'Joshua has turned off seeing which window he is in, so there is nothing to report.';
    const cur = this.current();
    if (!cur) return 'Nothing recorded yet: no window has come to the front since Aang started.';
    const lines = [`Right now: ${describe(cur)}, for ${forHowLong(now - cur.at)}.`];
    const before = this.recent(now).slice(1);
    if (before.length) lines.push('Before that: ' + before.map(describe).join(', then ') + '.');
    return lines.join('\n');
  }
}

/** "Code - core.ts" reads better than a process name and a raw title glued together. */
export function describe(a: Activity): string {
  if (!a.title) return a.process || 'something with no title';
  if (!a.process) return a.title;
  return `${a.process} (${a.title})`;
}

export function forHowLong(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 90) return `${Math.max(s, 1)} seconds`;
  const m = Math.round(s / 60);
  return m < 90 ? `${m} minutes` : `${Math.round(m / 60)} hours`;
}

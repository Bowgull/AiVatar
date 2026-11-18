// SessionStore (Phase 2, 2026-11-12): the one owner of browser-tabs.json, as Firefox's SessionStore is the one writer of
// its session file. Before, three places in browser.ts wrote it on their own: the snapshot (every 8 s and 1.5 s after a
// change), closing the last tab, and taking the other machine's tabs. The snapshot takes the tab list, then waits up to
// 800 ms for the pages' scroll spots; a close or a sync that wrote in that wait was then written over by the older list,
// so closed tabs came back.
//
// Now every write goes through here. A save that started before another write landed is stale and dropped. The copy
// kept aside before a write that drops most of his tabs (the 2026-10-23 loss) lives here too.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { writeFileAtomic, writeFileAtomicSoon } from './atomic.ts';

/** One tab as written. Extra fields (mock, pageBg, pageState, favicon, win) pass through untouched. */
export interface SavedTab { url: string; title?: string; mock?: unknown; [k: string]: unknown }
/** The file: every window's tabs, the trails, the recently closed. */
export interface SessionData { v: 1; active: number; fronts?: number[]; tabs: SavedTab[]; trails: unknown[]; closed: string[] }

/** A save in progress: taken before waiting on anything, so a write that lands meanwhile makes it stale. */
export interface Ticket { readonly gen: number }

const KEEP_COPIES = 10;

export class SessionStore {
  /** Every write bumps it; a ticket older than the last write is stale. */
  private gen = 0;
  /** How many of his own tabs (not mockups) the file held when last read or written. */
  private count = 0;
  /** The last thing written, without its time: nothing changed means nothing written. */
  private last = '';

  readonly file: string;
  private readonly log: (s: string) => void;
  private readonly now: () => Date;
  constructor(file: string, log: (s: string) => void = (s) => console.error(s), now: () => Date = () => new Date()) {
    this.file = file; this.log = log; this.now = now;
  }

  /** The file as it is, or null when there is none or it cannot be read. Counts his tabs for the drop guard. */
  read(): Partial<SessionData> | null {
    try {
      if (!existsSync(this.file)) return null;
      const s = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<SessionData>;
      this.count = mine(s?.tabs);
      return s && typeof s === 'object' ? s : null;
    } catch { return null; }
  }

  /** The file as it is, for a look only (sync's own list, the closed tabs): the drop guard's count is left alone. */
  peek(): Partial<SessionData> | null {
    try { return existsSync(this.file) ? JSON.parse(readFileSync(this.file, 'utf8')) as Partial<SessionData> : null; } catch { return null; }
  }

  /** Start a save that will wait on something (the pages' scroll spots). */
  ticket(): Ticket { return { gen: this.gen }; }

  /**
   * Write the session. now: on the spot (closing, quitting, a deliberate change); otherwise in the background. ticket: a
   * save that began earlier is dropped when anything was written since it began. force: write even when nothing changed.
   * Returns false when nothing was written (stale, or unchanged).
   */
  write(data: SessionData, o: { now?: boolean; ticket?: Ticket; force?: boolean; why?: string } = {}): boolean {
    if (process.env.AANG_SESSION_TRACE) console.log(`session: write now=${Boolean(o.now)} ticket=${o.ticket?.gen ?? '-'} gen=${this.gen} tabs=${data.tabs.map((t) => t.url.replace(/^https?:\/\/[^/]+/, '')).join(' ')}\n${new Error().stack?.split('\n').slice(2, 5).join('\n')}`);
    if (o.ticket && o.ticket.gen !== this.gen) return false;
    const body = JSON.stringify(data);
    if (!o.force && body === this.last) return false;
    const n = mine(data.tabs);
    if (this.count >= 4 && n < this.count / 2) this.keepCopy(o.why ?? 'drop');
    this.count = n;
    this.last = body;
    this.gen++;
    const text = JSON.stringify({ ...data, at: this.now().toISOString() });
    const fail = (e: unknown) => this.log('shell: browser: the tabs could not be saved: ' + (e as Error).message);
    if (o.now) { try { writeFileAtomic(this.file, text); } catch (e) { fail(e); } } else writeFileAtomicSoon(this.file, text).catch(fail);
    return true;
  }

  /**
   * Keep a copy of the file as it is now (2026-10-23: one restart came back with every tab gone, and only a stray copy
   * from that morning brought them back). Taken at every start and before any write that drops most of his tabs.
   * The newest ten are kept, in browser-tabs-kept beside it.
   */
  keepCopy(why: string): void {
    try {
      if (!existsSync(this.file)) return;
      const s = JSON.parse(readFileSync(this.file, 'utf8'));
      if (mine(s?.tabs) < 2) return;
      const dir = path.join(path.dirname(this.file), 'browser-tabs-kept');
      mkdirSync(dir, { recursive: true });
      copyFileSync(this.file, path.join(dir, `${this.now().toISOString().replace(/[:.]/g, '-')}-${why}.json`));
      const all = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
      for (const f of all.slice(0, Math.max(0, all.length - KEEP_COPIES))) { try { unlinkSync(path.join(dir, f)); } catch { /* next time */ } }
    } catch (e) { this.log('shell: browser: the tabs copy was not kept: ' + (e as Error).message); }
  }
}

/** His own tabs in a list: mockups do not count. */
const mine = (tabs: unknown): number => (Array.isArray(tabs) ? tabs : []).filter((t: { mock?: unknown }) => !t?.mock).length;

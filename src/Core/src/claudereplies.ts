// "Aang never notified me of this reply, don't we have something in place?" (Joshua, 2026-10-21).
//
// What there was: the hooks only spoke up for a turn over 60 s (or one that had been waiting on him), and nothing at all
// while the Claude app was in front. His new rule: whenever a Claude session ends a turn and he is NOT looking at
// Claude, Aang says ONE quiet line, whatever the turn's length: "<session title> replied: <Claude's first sentence>".
// A click on it opens that session in the Claude app (core.ts adds the session's app link, as for finished jobs).
//
// One line per turn end, however it is heard of:
//   - the aang-link mod (turn.end) and the old Stop hook both report the same turn end; a report that comes with no
//     new turn started since the last one is the same turn, so it only fills in what was missing (its words);
//   - each report waits a moment (SETTLE_MS) so the second source can arrive before the line is said;
//   - quick turns in the same session collapse: after a line, the next one for that session waits until COLLAPSE_MS
//     have passed, and only the latest turn end is said then.
// Whether to say it at all is asked at the moment of saying (`say` returns false when he is in Claude: he saw it
// there, so it is dropped, never replayed when he leaves).

/** How long a turn end waits for its other report (the link and the hook arrive within a second or two). */
export const SETTLE_MS = 1500;
/** Turn ends in the same session closer than this collapse into the latest. */
export const COLLAPSE_MS = 20_000;

export interface TurnEnd {
  session: string;
  project: string;
  /** Claude's last words, when this report has them (the hook reads the transcript; the link does not). */
  words?: string;
  /** He stopped it himself: nothing to tell him. */
  aborted?: boolean;
  /** It came over Tailscale: a MacBook session. */
  host?: 'mac';
}

export interface ReplyLine { session: string; project: string; text: string; host?: 'mac' }

/** Claude's first sentence, about 90 characters, markdown and code left out. */
export function firstSentence(text: string, max = 90): string {
  const plain = text.replace(/```[\s\S]*?```/g, ' ').replace(/[*`#>|]/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s*[-•]\s+/gm, '').replace(/\s+/g, ' ').trim();
  const m = /^(.+?[.!?])(\s|$)/.exec(plain);
  const s = (m ? m[1]! : plain).trim();
  if (s.length <= max) return s;
  return s.slice(0, max).replace(/\s+\S*$/, '').replace(/[,;:]$/, '') + '...';
}

interface Pending { end: TurnEnd; timer: NodeJS.Timeout | null }

export class ReplyNotifier {
  /** Per session: a turn end not said yet. */
  private readonly pending = new Map<string, Pending>();
  /** Per session: when its last line was said (or dropped because he was in Claude). */
  private readonly lastAt = new Map<string, number>();
  /** Per session: a new turn has started since its last turn end, so the next end is a new one. */
  private readonly fresh = new Map<string, boolean>();
  /** Per session: the last turn end has already been handled (said, or seen in Claude). */
  private readonly handled = new Set<string>();
  private readonly title: (session: string, project: string) => string;
  private readonly say: (line: ReplyLine) => boolean;
  private readonly words: (session: string) => string;
  private readonly now: () => number;

  /**
   * `title` names the session (his title from the Claude app, else the project). `say` delivers a line and returns
   * false when it was not shown (he is in Claude); either way the turn counts as told. `words` finds Claude's last
   * words for a turn end that came without them (the link's turn.end), from the session's transcript tail.
   */
  constructor(opts: { title: (session: string, project: string) => string; say: (line: ReplyLine) => boolean; words?: (session: string) => string; now?: () => number }) {
    this.title = opts.title; this.say = opts.say; this.words = opts.words ?? (() => ''); this.now = opts.now ?? Date.now;
  }

  /** A turn started (the link's turn.start, the hook's UserPromptSubmit): the next end is a new reply. */
  started(session: string): void {
    if (!session) return;
    this.fresh.set(session, true);
    this.handled.delete(session);
  }

  /** A turn ended, from either source. */
  ended(e: TurnEnd): void {
    if (!e.session) return;
    const p = this.pending.get(e.session);
    if (p) {
      // The same turn's other report, or a later turn before the line went out: either way the latest wins, and
      // words already found are kept when this report has none.
      const same = this.fresh.get(e.session) !== true;
      const words = e.words || (same ? p.end.words : undefined);
      const aborted = same ? (p.end.aborted === true || e.aborted === true) : e.aborted === true;
      p.end = { session: e.session, project: e.project || p.end.project, ...(words ? { words } : {}), ...(aborted ? { aborted } : {}), ...((e.host ?? p.end.host) ? { host: e.host ?? p.end.host } : {}) };
      this.fresh.set(e.session, false);
      return;
    }
    // Already said, and no new turn since: this is the second report of a turn already told. Its words are not needed.
    if (this.handled.has(e.session) && this.fresh.get(e.session) !== true) return;
    this.fresh.set(e.session, false);
    this.handled.delete(e.session);
    const last = this.lastAt.get(e.session);
    const wait = Math.max(SETTLE_MS, last === undefined ? 0 : last + COLLAPSE_MS - this.now());
    const entry: Pending = { end: { ...e }, timer: null };
    entry.timer = setTimeout(() => this.fire(e.session), wait);
    entry.timer.unref?.();
    this.pending.set(e.session, entry);
  }

  private fire(session: string): void {
    const p = this.pending.get(session);
    if (!p) return;
    this.pending.delete(session);
    this.handled.add(session);
    if (p.end.aborted) return;
    this.lastAt.set(session, this.now());
    while (this.lastAt.size > 50) this.lastAt.delete(this.lastAt.keys().next().value as string);
    const name = this.title(session, p.end.project) || p.end.project || 'Claude';
    let said = p.end.words ?? '';
    if (!said) { try { said = this.words(session); } catch { said = ''; } }
    const words = said ? firstSentence(said) : '';
    this.say({ session, project: p.end.project, text: words ? `${name} replied: ${words}` : `${name} replied.`, ...(p.end.host ? { host: p.end.host } : {}) });
  }

  /** The session is gone: anything waiting for it goes too. */
  forget(session: string): void {
    const p = this.pending.get(session);
    if (p?.timer) clearTimeout(p.timer);
    this.pending.delete(session); this.lastAt.delete(session); this.fresh.delete(session); this.handled.delete(session);
  }

  close(): void { for (const s of [...this.pending.keys()]) this.forget(s); }
}

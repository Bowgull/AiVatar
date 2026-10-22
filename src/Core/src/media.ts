// What is playing on this PC, for the Spotify mini player (docs/POPOUTS-NOTES-RESEARCH.md section 4).
//
// The pet reads Windows' own now-playing feed (SMTC, NowPlaying.cs) and pushes `media.now` when something changes;
// the brain keeps the latest and passes it to the Shell as it came, so the future player window can draw it. The
// player's buttons come back as `media.cmd`, checked strictly here before they reach the pet: only these seven
// things, only these fields, only sane numbers. Costs no Spotify quota and no network.

export type MediaStatus = 'playing' | 'paused' | 'stopped' | 'changing' | 'opened' | 'closed';

/** Sent by the pet. `app: null` means nothing is playing anywhere. */
export interface MediaNow {
  t: 'media.now';
  v: 1;
  /** A short name for the app ('spotify', 'chrome'), or null when there is no session. */
  app: string | null;
  spotify?: boolean;
  title?: string;
  artist?: string;
  album?: string;
  status?: MediaStatus;
  /** Seconds into the song, true at `at` (unix ms). Add the time since `at` while playing. */
  position?: number;
  duration?: number;
  at?: number;
  canSeek?: boolean;
  /** Spotify's own volume in the Windows mixer, 0..1; null when Spotify has no audio session. */
  volume?: number | null;
  /** Present only when the cover changed: a PNG data URL (300 px at most), or null for no cover. */
  thumb?: string | null;
}

export type MediaOp = 'play' | 'pause' | 'toggle' | 'next' | 'prev' | 'seek' | 'volume';
export type MediaCmd =
  | { t: 'media.cmd'; op: 'play' | 'pause' | 'toggle' | 'next' | 'prev' }
  | { t: 'media.cmd'; op: 'seek'; position: number }
  | { t: 'media.cmd'; op: 'volume'; volume: number };

const PLAIN_OPS = new Set(['play', 'pause', 'toggle', 'next', 'prev']);
/** Longer than any song or mix; a seek past it is nonsense. */
const MAX_SEEK = 24 * 3600;

const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const exactKeys = (o: object, keys: string[]) => { const k = Object.keys(o); return k.length === keys.length && k.every(x => keys.includes(x)); };

/** The player's command, or null. Unknown ops, extra fields and out-of-range numbers are all refused, never fixed. */
export function checkMediaCmd(m: unknown): MediaCmd | null {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
  const o = m as Record<string, unknown>;
  if (o.t !== 'media.cmd' || typeof o.op !== 'string') return null;
  if (PLAIN_OPS.has(o.op)) return exactKeys(o, ['t', 'op']) ? { t: 'media.cmd', op: o.op as 'play' } : null;
  if (o.op === 'seek') return exactKeys(o, ['t', 'op', 'position']) && finite(o.position) && o.position >= 0 && o.position <= MAX_SEEK ? { t: 'media.cmd', op: 'seek', position: o.position } : null;
  if (o.op === 'volume') return exactKeys(o, ['t', 'op', 'volume']) && finite(o.volume) && o.volume >= 0 && o.volume <= 1 ? { t: 'media.cmd', op: 'volume', volume: o.volume } : null;
  return null;
}

const STATUSES = new Set(['playing', 'paused', 'stopped', 'changing', 'opened', 'closed']);
const optStr = (x: unknown) => x === undefined || typeof x === 'string';
const optNum = (x: unknown) => x === undefined || finite(x);

/** The pet's update, or null if it is not one. A shape check only: what passes is forwarded as it came. */
export function checkMediaNow(m: unknown): MediaNow | null {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
  const o = m as Record<string, unknown>;
  if (o.t !== 'media.now' || o.v !== 1) return null;
  if (o.app !== null && typeof o.app !== 'string') return null;
  if (!optStr(o.title) || !optStr(o.artist) || !optStr(o.album)) return null;
  if (o.status !== undefined && !(typeof o.status === 'string' && STATUSES.has(o.status))) return null;
  if (!optNum(o.position) || !optNum(o.duration) || !optNum(o.at)) return null;
  if (o.volume !== undefined && o.volume !== null && !finite(o.volume)) return null;
  if (o.thumb !== undefined && o.thumb !== null && !(typeof o.thumb === 'string' && o.thumb.startsWith('data:image/png;base64,'))) return null;
  return o as unknown as MediaNow;
}

/** The latest state, with the last cover kept, so a Shell that starts (or restarts) later gets the full picture. */
export class MediaState {
  private latest: MediaNow | null = null;
  private thumb: string | null = null;
  take(m: MediaNow): void {
    if (m.app === null) { this.latest = m; this.thumb = null; return; }
    if (m.thumb !== undefined) this.thumb = m.thumb;
    this.latest = m;
  }
  /** What a fresh Shell is sent on hello: the latest, cover included. */
  now(): MediaNow | null {
    if (!this.latest) return null;
    if (this.latest.app === null) return this.latest;
    return { ...this.latest, thumb: this.thumb };
  }
}

// ------------------------------------------------------------------------------------------------ the mini player (2026-10-22)

/**
 * "show the music player", "open the spotify player", "bring up my music controls", "mini player": he wants the player window.
 * Short asks only, and never a "play X" (that is the music tool's job) or a question about it.
 */
export function wantsPlayer(text: string): boolean {
  const t = text.trim().toLowerCase().replace(/[.!?]+$/, '').replace(/^(hey |ok |okay )?(aang[, ]+)?(can you |could you |please )?/, '').replace(/ please$/, '');
  if (t.length > 60 || /^(what|why|how|when|who|is|does|do)\b/.test(t)) return false;
  if (/^(mini ?player|music player|spotify player)$/.test(t)) return true;
  // "open spotify" alone stays the app: music or Spotify needs "player", "controls" or "window" after it.
  return /^(show|open|bring up|pull up|pop up|give me|put up|get)( me)? (the |my |a |your )?(little |mini |small )?((music|spotify)( mini)? ?(player|controls|window)|mini ?player)$/.test(t);
}

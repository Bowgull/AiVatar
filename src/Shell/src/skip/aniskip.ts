// Anime openings and endings: where they are, episode by episode.
//
// AniSkip is a free community database with no key and no sign-up. It answers by MyAnimeList id and
// episode number, so a title has to be turned into that id first, which AniList does, also free.
//
// Both are cached hard. AniSkip's backend has been dormant since 2024: it works, it is not maintained,
// and the polite and the sensible thing are the same here. Asking twice for the same episode is waste.
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { reportWriteFailure, writeFileAtomic } from '../atomic.ts';

export interface Skip {
  /** 'op' for an opening, 'ed' for an ending. */
  kind: 'op' | 'ed';
  from: number;
  to: number;
}

type Fetch = typeof globalThis.fetch;

/** A day is plenty: these never change once an episode is out, and a wrong one is better re-fetched. */
const KEEP_MS = 7 * 24 * 60 * 60 * 1000;

interface Cached<T> { at: number; value: T }

export class SkipTimes {
  private dir: string;
  private fetch: Fetch;

  constructor(stateDir: string, fetchImpl: Fetch = globalThis.fetch) {
    this.dir = path.join(stateDir, 'skip-cache');
    this.fetch = fetchImpl;
    try { mkdirSync(this.dir, { recursive: true }); } catch { /* checked again on write */ }
  }

  private file(key: string): string {
    // A title can hold anything, so it never reaches the filesystem as itself.
    return path.join(this.dir, key.replace(/[^a-z0-9._-]/gi, '_').slice(0, 80) + '.json');
  }

  private read<T>(key: string): T | null {
    try {
      const f = this.file(key);
      if (!existsSync(f)) return null;
      const c = JSON.parse(readFileSync(f, 'utf8')) as Cached<T>;
      return Date.now() - c.at < KEEP_MS ? c.value : null;
    } catch { return null; }
  }

  private write<T>(key: string, value: T): void {
    try { writeFileAtomic(this.file(key), JSON.stringify({ at: Date.now(), value })); }
    catch (e) { reportWriteFailure(this.file(key), e); }
  }

  /** Turn a title into a MyAnimeList id, which is the only thing AniSkip understands. */
  async malId(title: string): Promise<number | null> {
    const key = 'mal:' + title.toLowerCase().trim();
    const cached = this.read<number | null>(key);
    if (cached !== null) return cached;
    try {
      const r = await this.fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'query($s:String){Media(search:$s,type:ANIME){idMal}}',
          variables: { s: title },
        }),
      });
      if (!r.ok) return null;
      const j = await r.json() as { data?: { Media?: { idMal?: number | null } } };
      const id = j?.data?.Media?.idMal ?? null;
      if (id) this.write(key, id);
      return id;
    } catch {
      // No network, or the service is down. Not knowing where the opening is must never break playback.
      return null;
    }
  }

  /** Where the opening and ending are in this episode, or an empty list if nobody has marked them. */
  async forEpisode(malId: number, episode: number): Promise<Skip[]> {
    const key = `skip:${malId}:${episode}`;
    const cached = this.read<Skip[]>(key);
    if (cached) return cached;
    try {
      const url = `https://api.aniskip.com/v2/skip-times/${malId}/${episode}`
        + '?types=op&types=ed&episodeLength=0';
      const r = await this.fetch(url);
      // 404 means nobody has marked this episode, which is an ordinary answer, not a failure.
      if (!r.ok) { if (r.status === 404) this.write(key, []); return []; }
      const j = await r.json() as { found?: boolean; results?: { interval?: { startTime?: number; endTime?: number }; skipType?: string }[] };
      const out: Skip[] = [];
      for (const res of j.results ?? []) {
        const from = res.interval?.startTime;
        const to = res.interval?.endTime;
        const kind = res.skipType;
        if (typeof from !== 'number' || typeof to !== 'number') continue;
        if (kind !== 'op' && kind !== 'ed') continue;
        if (to <= from) continue;
        out.push({ kind, from, to });
      }
      this.write(key, out);
      return out;
    } catch { return []; }
  }
}

/**
 * Which skip, if any, the viewer has just reached.
 *
 * `at` is where the video is now, in seconds. A skip only counts within a second of its start: later
 * than that and he has chosen to watch it, and jumping the picture out from under him would be rude.
 */
export function dueAt(skips: Skip[], at: number): Skip | null {
  for (const s of skips) {
    if (at >= s.from && at < s.from + 1) return s;
  }
  return null;
}

// Sheet 117 (2026-11-01, his pick): the mini player's lyrics, from LRCLIB (lrclib.net), a free and open library of
// timed lyrics. No account, no key. Never Spotify's own lyrics: those only come through its private door (ban risk,
// his rule). Asked only while lyrics are switched on in the player's ··· menu, once per song, kept for this run.
//
// LRCLIB's timed lyrics are LRC text: "[mm:ss.xx] words" a line. Read here into { t (seconds), text } lines, in order.
//
// 2026-11-01, his note after the first day ("we need to find lyrics, there has to be a way"): LRCLIB is often busy
// (measured: 2 of 3 identical asks timed out, its search answered "ServerOverloaded"), and many songs there have only
// untimed lyrics. So: every ask is tried three times; the title is also tried without "- Remastered", "(feat. ...)" and
// the like; untimed lyrics are used too, spread evenly over the song (timed: false); and "could not reach it" is told
// apart from "it has none", so a busy moment is asked again instead of being remembered as no lyrics.

export interface LyricLine { t: number; text: string }
export interface Lyrics { lines: LyricLine[] | null; instrumental: boolean; timed: boolean }
export interface SongKey { title: string; artist: string; album?: string; duration?: number }
/** What an ask came to: lyrics, null (LRCLIB has none), or 'error' (it could not be reached: ask again later). */
export type LyricsResult = Lyrics | null | 'error';

const BASE = 'https://lrclib.net/api';
const UA = 'Aang mini player (https://github.com/Bowgull/AiVatar)';

/** "[01:02.34] words" lines into timed lines; a line may carry several stamps. Untimed or empty input: null. */
export function parseLrc(text: unknown): LyricLine[] | null {
  if (typeof text !== 'string' || !text.trim()) return null;
  const out: LyricLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g)];
    if (!stamps.length) continue;
    const words = raw.replace(/\[[^\]]*\]/g, '').trim();
    for (const m of stamps) out.push({ t: Number(m[1]) * 60 + Number(m[2]!.replace(':', '.')), text: words });
  }
  out.sort((a, b) => a.t - b.t);
  return out.length ? out.slice(0, 2000).map((l) => ({ t: Math.round(l.t * 100) / 100, text: l.text.slice(0, 200) })) : null;
}

/** Untimed lyrics spread evenly from 6% to 94% of the song (a blank line is a short pause). Null without words. */
export function spreadPlain(text: unknown, duration: number): LyricLine[] | null {
  if (typeof text !== 'string' || !text.trim()) return null;
  const rows = text.split(/\r?\n/).map((r) => r.trim()).slice(0, 2000);
  while (rows.length && !rows[0]) rows.shift();
  while (rows.length && !rows.at(-1)) rows.pop();
  const words = rows.filter(Boolean).length;
  if (!words) return null;
  const d = duration > 20 ? duration : 180, from = d * 0.06, span = d * 0.88;
  const weight = rows.reduce((n, r) => n + (r ? 1 : 0.5), 0);
  const out: LyricLine[] = [];
  let at = 0;
  for (const r of rows) { if (r) out.push({ t: Math.round((from + span * at / weight) * 100) / 100, text: r.slice(0, 200) }); at += r ? 1 : 0.5; }
  return out;
}

/** The line showing at `pos` seconds: the last one that has started (-1 before the first). */
export function lineAt(lines: LyricLine[], pos: number): number {
  let lo = 0, hi = lines.length - 1, at = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (lines[mid]!.t <= pos) { at = mid; lo = mid + 1; } else hi = mid - 1; }
  return at;
}

/** The title without what the lyrics sites leave out: "- Remastered 2011", "(feat. X)", "[Live]", "- Radio Edit". */
export function plainTitle(title: string): string {
  return title
    .replace(/\s*[([](feat\.?|ft\.?|with|prod\.?)\s[^)\]]*[)\]]/gi, '')
    .replace(/\s*[([][^)\]]*(remaster|version|edit|mix|live|mono|stereo|deluxe|bonus|acoustic|demo)[^)\]]*[)\]]/gi, '')
    .replace(/\s+-\s+.*(remaster|version|edit|mix|live|mono|stereo|deluxe|bonus|acoustic|demo|from\s).*$/i, '')
    .trim() || title;
}

type Fetch = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const read = (o: unknown, duration: number): Lyrics | null => {
  if (!o || typeof o !== 'object') return null;
  const r = o as Record<string, unknown>;
  if (r.instrumental === true) return { lines: null, instrumental: true, timed: false };
  const timed = parseLrc(r.syncedLyrics);
  if (timed) return { lines: timed, instrumental: false, timed: true };
  const plain = spreadPlain(r.plainLyrics, Number(r.duration) || duration);
  return plain ? { lines: plain, instrumental: false, timed: false } : null;
};
/** Timed beats untimed; untimed beats none. */
const better = (a: Lyrics | null, b: Lyrics | null): Lyrics | null => (!a ? b : !b ? a : a.timed || !b.timed ? a : b);

/** The song's lyrics from LRCLIB: the exact match (title, artist, album, length), then its search; null: none. */
export async function fetchLyrics(fetch: Fetch, s: SongKey, { tries = 3, timeoutMs = 9000, pause = [1200, 3000] } = {}): Promise<LyricsResult> {
  if (!s.title || !s.artist) return null;
  const dur = s.duration && s.duration > 0 ? s.duration : 0;
  let reached = false;
  /** One address, tried up to `tries` times: the JSON, null for "not there" (404), undefined when it never answered. */
  const get = async (url: string): Promise<unknown> => {
    for (let i = 0; i < tries; i++) {
      if (i) await wait(pause[Math.min(i - 1, pause.length - 1)]!);
      const ac = new AbortController(), timer = setTimeout(() => ac.abort(), timeoutMs);
      try {
        const r = await fetch(url, { headers: { 'User-Agent': UA, 'Lrclib-Client': UA }, signal: ac.signal });
        if (r.ok) { reached = true; return await r.json(); }
        if (r.status === 404) { reached = true; return null; }
        // busy (429 / 5xx): try again
      } catch { /* timed out or no network: try again */ } finally { clearTimeout(timer); }
    }
    return undefined;
  };
  const titles = [...new Set([s.title, plainTitle(s.title)])];
  let best: Lyrics | null = null;
  for (const title of titles) {
    const q = new URLSearchParams({ track_name: title, artist_name: s.artist });
    if (s.album) q.set('album_name', s.album);
    if (dur) q.set('duration', String(Math.round(dur)));
    best = better(best, read(await get(`${BASE}/get?${q}`), dur));
    if (best?.timed || best?.instrumental) return best;
    const found = await get(`${BASE}/search?${new URLSearchParams({ track_name: title, artist_name: s.artist })}`);
    if (Array.isArray(found)) {
      // the closest in length (within 5 s when the length is known), timed ones first
      const near = found.slice(0, 20).map((o) => ({ l: read(o, dur), d: dur ? Math.abs(Number((o as Record<string, unknown>)?.duration) - dur) : 0 }))
        .filter((x) => x.l?.lines && x.d <= 5).sort((a, b) => Number(b.l!.timed) - Number(a.l!.timed) || a.d - b.d)[0];
      best = better(best, near?.l ?? null);
      if (best?.timed) return best;
    }
  }
  return best ?? (reached ? null : 'error');
}

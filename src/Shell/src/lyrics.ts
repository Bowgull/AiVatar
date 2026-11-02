// Sheet 117 (2026-11-01, his pick): the mini player's lyrics, from LRCLIB (lrclib.net), a free and open library of
// timed lyrics. No account, no key. Never Spotify's own lyrics: those only come through its private door (ban risk,
// his rule). Asked only while lyrics are switched on in the player's ··· menu, once per song, kept for this run.
//
// LRCLIB's timed lyrics are LRC text: "[mm:ss.xx] words" a line. Read here into { t (seconds), text } lines, in order.

export interface LyricLine { t: number; text: string }
export interface Lyrics { lines: LyricLine[] | null; instrumental: boolean }
export interface SongKey { title: string; artist: string; album?: string; duration?: number }

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

/** The line showing at `pos` seconds: the last one that has started (-1 before the first). */
export function lineAt(lines: LyricLine[], pos: number): number {
  let lo = 0, hi = lines.length - 1, at = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (lines[mid]!.t <= pos) { at = mid; lo = mid + 1; } else hi = mid - 1; }
  return at;
}

type Fetch = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

const read = (o: unknown): Lyrics | null => {
  if (!o || typeof o !== 'object') return null;
  const r = o as Record<string, unknown>;
  if (r.instrumental === true) return { lines: null, instrumental: true };
  const lines = parseLrc(r.syncedLyrics);
  return lines ? { lines, instrumental: false } : null;
};

/** The song's timed lyrics: LRCLIB's exact match first (title, artist, album, length), then its search. Null: none. */
export async function fetchLyrics(fetch: Fetch, s: SongKey, timeoutMs = 8000): Promise<Lyrics | null> {
  if (!s.title || !s.artist) return null;
  const ac = new AbortController(), timer = setTimeout(() => ac.abort(), timeoutMs);
  const get = async (url: string) => { const r = await fetch(url, { headers: { 'User-Agent': UA, 'Lrclib-Client': UA }, signal: ac.signal }); return r.ok ? r.json() : null; };
  try {
    const q = new URLSearchParams({ track_name: s.title, artist_name: s.artist });
    if (s.album) q.set('album_name', s.album);
    if (s.duration && s.duration > 0) q.set('duration', String(Math.round(s.duration)));
    const exact = read(await get(`${BASE}/get?${q}`));
    if (exact) return exact;
    const found = await get(`${BASE}/search?${new URLSearchParams({ track_name: s.title, artist_name: s.artist })}`);
    if (Array.isArray(found)) {
      // the closest in length among those with timed lines
      const near = found.map(read).map((l, i) => ({ l, d: Math.abs(Number((found[i] as Record<string, unknown>)?.duration) - (s.duration ?? 0)) }))
        .filter((x) => x.l?.lines).sort((a, b) => a.d - b.d)[0];
      if (near && (!s.duration || near.d <= 4)) return near.l;
    }
    return null;
  } catch { return null; } finally { clearTimeout(timer); }
}

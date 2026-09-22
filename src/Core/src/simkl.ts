// What he is watching, and the next episode of it: "put the next one on", "what am I watching". Simkl keeps his list
// (MALSync and the Simkl browser extension mark episodes as he watches them); Aang only reads it. Signed in once with
// tools/simkl-setup.cmd (Simkl's PIN sign-in; the token is in %APPDATA%\Aang\simkl.json and does not expire).
// Where an episode is opened is his choice, kept in the same file as a link with {q} in it (a search for the show and
// episode); Crunchyroll's search until he says otherwise.
import { existsSync, readFileSync } from 'node:fs';
import type { Fetch } from './google.ts';

export interface Show { title: string; next: number; watched: number; total: number | null; kind: 'anime' | 'tv'; /** when he last watched it (ms), for "the next one" */ lastAt: number }
export const DEFAULT_SITE = 'https://www.crunchyroll.com/search?q={q}';

interface Saved { clientId: string; accessToken: string; site?: string }

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** The next episode number from one entry of Simkl's list, defensively: a "S1E6"-style field if there is one, else one past what is watched. */
export function nextOf(e: any): number {
  const n = String(e?.next_to_watch ?? '');
  const m = /E(\d+)/i.exec(n) ?? /^(\d+)$/.exec(n);
  if (m) return Number(m[1]);
  return Number(e?.watched_episodes_count ?? 0) + 1;
}

/** The show he means: an exact title, then one that contains his words, then one sharing most of them. */
export function findShow(shows: Show[], said: string): Show | null {
  const q = norm(said);
  if (!q) return null;
  const exact = shows.find(s => norm(s.title) === q); if (exact) return exact;
  const has = shows.find(s => norm(s.title).includes(q)); if (has) return has;
  const words = q.split(' ').filter(w => w.length > 2);
  let best: Show | null = null, score = 0;
  for (const s of shows) { const t = norm(s.title); const n = words.filter(w => t.includes(w)).length; if (n > score) { score = n; best = s; } }
  return score > 0 ? best : null;
}

export const episodeLink = (site: string, s: Show): string => site.replace('{q}', encodeURIComponent(`${s.title} episode ${s.next}`));

export class Simkl {
  private readonly file: string;
  private readonly fetcher: Fetch;
  constructor(file: string, fetcher?: Fetch) { this.file = file; this.fetcher = fetcher ?? ((url, init) => fetch(url, init as RequestInit) as any); }
  private saved(): Saved | null {
    try { if (existsSync(this.file)) { const j = JSON.parse(readFileSync(this.file, 'utf8')); if (j?.clientId && j?.accessToken) return j; } } catch { /* not signed in */ }
    return null;
  }
  get connected(): boolean { return this.saved() !== null; }
  get site(): string { return this.saved()?.site || DEFAULT_SITE; }

  /** Everything he is watching now, anime and TV, with the next episode of each. */
  async watching(): Promise<Show[]> {
    const s = this.saved();
    if (!s) throw new Error('Simkl is not connected. Run tools\\simkl-setup.cmd once.');
    const r = await this.fetcher('https://api.simkl.com/sync/all-items/?extended=full', { headers: { 'simkl-api-key': s.clientId, authorization: `Bearer ${s.accessToken}` } });
    if (r.status === 401) throw new Error('Simkl turned the sign-in down. Run tools\\simkl-setup.cmd again.');
    if (!r.ok) throw new Error(`Simkl said ${r.status}.`);
    const j = await r.json().catch(() => ({}));
    const out: Show[] = [];
    for (const kind of ['anime', 'shows'] as const) {
      for (const e of (j?.[kind] ?? []) as any[]) {
        if (String(e?.status ?? '') !== 'watching') continue;
        const total = Number(e?.total_episodes_count) || null;
        const next = nextOf(e);
        if (total && next > total) continue;                               // caught up to the end
        out.push({ title: String(e?.show?.title ?? e?.anime?.title ?? 'Untitled'), next, watched: Number(e?.watched_episodes_count ?? 0), total, kind: kind === 'anime' ? 'anime' : 'tv', lastAt: Date.parse(String(e?.last_watched_at ?? '')) || 0 });
      }
    }
    return out.sort((a, b) => b.lastAt - a.lastAt);                        // the one he watched last comes first
  }
}

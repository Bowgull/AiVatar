// What he is watching, and the next episode of it: "put the next one on", "what am I watching". Simkl keeps his list
// (MALSync and the Simkl browser extension mark episodes as he watches them); Aang only reads it. Signed in once with
// tools/simkl-setup.cmd (Simkl's device sign-in; the sign-in lives in %APPDATA%\Aang\simkl.json).
// Where an episode is opened is his choice, kept in the same file as a link with {q} in it (a search for the show and
// episode); Crunchyroll's search until he says otherwise.
//
// TOKENS DO EXPIRE. This file used to say they did not, the setup script threw the refresh token away because of it,
// and on 2026-10-04 his access token came back 401 "Access token has expired" with no way to recover but re-running
// setup by hand. Nothing told him: `watch_next` is not something he uses daily, so it would have sat broken for
// months. So: the whole token response is kept now, a 401 refreshes once and retries, and a refresh that fails says
// plainly what to do. An expiring credential with no refresh path is a thing that breaks quietly, which is the worst
// way for anything in Aang to break.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { Fetch } from './google.ts';

export interface Show { title: string; next: number; watched: number; total: number | null; kind: 'anime' | 'tv'; /** when he last watched it (ms), for "the next one" */ lastAt: number }
export const DEFAULT_SITE = 'https://www.crunchyroll.com/search?q={q}';

interface Saved {
  clientId: string;
  accessToken: string;
  /** Kept so an expired token can be swapped for a fresh one without him doing anything. Absent in sign-ins made
   *  before 2026-10-04, which the setup script wrote without it: those have to be re-run once. */
  refreshToken?: string;
  /** ms since epoch, from the token response's expires_in. Absent means "unknown", not "never". */
  expiresAt?: number;
  site?: string;
}

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

  /** Keep whatever changed, leaving the rest of the file alone. */
  private write(patch: Partial<Saved>): void {
    try {
      const now = this.saved();
      if (!now) return;
      writeFileSync(this.file, JSON.stringify({ ...now, ...patch }, null, 2), 'utf8');
    } catch { /* read-only disk: the new token is still good for this run */ }
  }

  /**
   * One refresh at a time, ever.
   *
   * Simkl invalidates the old access token the moment a new one is issued, so two calls refreshing at once would
   * leave one of them holding a token that was already dead on arrival. Everyone waits on the first one instead.
   */
  private refreshing: Promise<string | null> | null = null;

  /**
   * Swap an expired access token for a fresh one.
   *
   * Simkl's AUTH V2 (2026-09-18) cut access tokens from five years to SEVEN DAYS, with a refresh token good for 180
   * days that is renewed every time it is used. So this is not a rare repair: it runs most weeks, and if it ever
   * stops working `watch_next` is dead within the week.
   *
   * Form-encoded, not JSON: it is an OAuth 2.0 token endpoint and that is what the spec says they take. The first
   * version of this sent JSON, which would have failed every time.
   */
  private async refresh(s: Saved): Promise<string | null> {
    if (!s.refreshToken) return null;
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      try {
        const r = await this.fetcher('https://api.simkl.com/oauth2/token', {
          method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: s.refreshToken!, client_id: s.clientId }).toString(),
        });
        if (!r.ok) return null;
        const j: any = await r.json().catch(() => ({}));
        const token = String(j?.access_token ?? '');
        if (!token) return null;
        this.write({
          accessToken: token,
          // The refresh token rotates, and the old one dies with it. Losing this write means signing in by hand again.
          ...(j?.refresh_token ? { refreshToken: String(j.refresh_token) } : {}),
          ...(Number(j?.expires_in) ? { expiresAt: Date.now() + Number(j.expires_in) * 1000 } : {}),
        });
        return token;
      } catch { return null; }
      finally { this.refreshing = null; }
    })();
    return this.refreshing;
  }

  /** A signed-in GET that renews the token once if Simkl says it is stale, instead of giving up. */
  private async get(url: string): Promise<any> {
    const s = this.saved();
    if (!s) throw new Error('Simkl is not connected. Run tools\\simkl-setup.cmd once.');
    const call = (token: string) => this.fetcher(url, { headers: { 'simkl-api-key': s.clientId, authorization: `Bearer ${token}` } });

    let r = await call(s.accessToken);
    if (r.status === 401) {
      const fresh = await this.refresh(s);
      if (!fresh) {
        throw new Error(s.refreshToken
          ? 'Simkl would not renew the sign-in. Run tools\\simkl-setup.cmd again.'
          : 'The Simkl sign-in has run out. Simkl signs-ins now last a week, and this one was saved before Aang kept the renewal key, so there is nothing to renew it with. Run tools\\simkl-setup.cmd once and it will keep itself going after that.');
      }
      r = await call(fresh);
    }
    if (r.status === 401) throw new Error('Simkl turned the sign-in down. Run tools\\simkl-setup.cmd again.');
    if (!r.ok) throw new Error(`Simkl said ${r.status}.`);
    return await r.json().catch(() => ({}));
  }

  /** Everything he is watching now, anime and TV, with the next episode of each. */
  async watching(): Promise<Show[]> {
    const j = await this.get('https://api.simkl.com/sync/all-items/?extended=full');
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

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
import path from 'node:path';
import type { Fetch } from './google.ts';

export interface Show {
  title: string; next: number; watched: number; total: number | null; kind: 'anime' | 'tv';
  /** when he last watched it (ms), for "the next one" */
  lastAt: number;
  /**
   * Simkl's own id for the show. Carried because step 6.8 scrobbles against it: Simkl matches on
   * title and year otherwise, and "Frieren" matching the wrong row would tick off the wrong show.
   * Zero when the list did not carry one, which is the one case scrobbling declines to guess.
   */
  id: number;
  /** Simkl's own year, sent alongside the id so a bad id still matches the right thing. */
  year: number | null;
  /** AniList's id for it, from Simkl's own list. How the English name is found. 0 when there is none. */
  anilist?: number;
  /**
   * Other names it goes by: the English title and the common short ones ("The Apothecary Diaries",
   * "AoT"). Simkl keeps only the Japanese name, and he says the English one, so without these three of
   * his seven shows could not be found by the name he actually uses (checked 2026-10-04).
   */
  aka?: string[];
}
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
/** With the spaces taken out, so "dandadan" and "Dan Da Dan" are the same thing. */
const squash = (s: string) => s.replace(/ /g, '');

/** The next episode number from one entry of Simkl's list, defensively: a "S1E6"-style field if there is one, else one past what is watched. */
export function nextOf(e: any): number {
  const n = String(e?.next_to_watch ?? '');
  const m = /E(\d+)/i.exec(n) ?? /^(\d+)$/.exec(n);
  if (m) return Number(m[1]);
  return Number(e?.watched_episodes_count ?? 0) + 1;
}

/**
 * The show he means, by ANY name it goes by: an exact name, then one that contains his words, then one
 * sharing most of them. Spaces are ignored at each step, because people do not agree on where they go.
 */
export function findShow(shows: Show[], said: string): Show | null {
  const q = norm(said);
  if (!q) return null;
  const sq = squash(q);
  const names = (s: Show) => [s.title, ...(s.aka ?? [])].map(norm).filter(Boolean);
  const exact = shows.find(s => names(s).some(n => n === q || squash(n) === sq)); if (exact) return exact;
  const has = shows.find(s => names(s).some(n => n.includes(q) || squash(n).includes(sq))); if (has) return has;
  const words = q.split(' ').filter(w => w.length > 2);
  let best: Show | null = null, score = 0;
  for (const s of shows) {
    const n = Math.max(0, ...names(s).map(t => words.filter(w => t.includes(w)).length));
    if (n > score) { score = n; best = s; }
  }
  return score > 0 ? best : null;
}

/**
 * The English and other names for his anime, from AniList, which needs no key and no account.
 *
 * Names do not change, so each is looked up ONCE and kept in a file next to the Simkl sign-in. Only the
 * shows not already in that file are asked about, all in one request. If AniList is down this returns
 * what is already known and the rest are matched on Simkl's name alone: a missing nickname must never
 * stop him seeing his own list.
 */
export async function otherNames(ids: number[], cacheFile: string, fetcher: Fetch): Promise<Map<number, string[]>> {
  let known: Record<string, string[]> = {};
  try { if (existsSync(cacheFile)) known = JSON.parse(readFileSync(cacheFile, 'utf8')) ?? {}; } catch { known = {}; }
  const want = [...new Set(ids.filter(id => id > 0 && !Array.isArray(known[String(id)])))];
  if (want.length) {
    try {
      const r = await fetcher('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          query: 'query($ids:[Int]){ Page(perPage:50){ media(id_in:$ids, type:ANIME){ id title{ english romaji } synonyms } } }',
          variables: { ids: want.slice(0, 50) },
        }),
      });
      if (r.ok) {
        const j: any = await r.json().catch(() => ({}));
        for (const m of (j?.data?.Page?.media ?? []) as any[]) {
          const id = Number(m?.id);
          if (!id) continue;
          const list = [m?.title?.english, m?.title?.romaji, ...((m?.synonyms ?? []) as unknown[])]
            .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
            .map(x => x.trim());
          known[String(id)] = [...new Set(list)].slice(0, 12);
        }
        try { writeFileSync(cacheFile, JSON.stringify(known, null, 2), 'utf8'); } catch { /* still good for this run */ }
      }
    } catch { /* AniList down: match on Simkl's names, as before */ }
  }
  const out = new Map<number, string[]>();
  for (const id of ids) if (Array.isArray(known[String(id)])) out.set(id, known[String(id)]!);
  return out;
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

  /**
   * Simkl allows ONE scrobble operation per account at a time, with a twenty-second lock (their docs,
   * read 2026-10-04). Two of these overlapping means one of them loses, so they queue here instead.
   */
  private scrobbling: Promise<unknown> = Promise.resolve();

  /** A signed-in POST that renews the token once if Simkl says it is stale, instead of giving up. */
  private async post(url: string, body: unknown): Promise<{ status: number; json: any }> {
    const s = this.saved();
    if (!s) throw new Error('Simkl is not connected. Run tools\simkl-setup.cmd once.');
    const call = (token: string) => this.fetcher(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'simkl-api-key': s.clientId, authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    let r = await call(s.accessToken);
    if (r.status === 401) {
      const fresh = await this.refresh(s);
      if (!fresh) throw new Error('The Simkl sign-in has run out. Run tools\simkl-setup.cmd once.');
      r = await call(fresh);
    }
    // 403 is the one that is NOT a network problem: the sign-in is real but was made without permission
    // to write. His own sign-in predates that permission, so this is the likely first failure.
    if (r.status === 403) throw new Error('This Simkl sign-in can read his list but not change it. Run tools\simkl-setup.cmd once to grant that.');
    return { status: r.status, json: await r.json().catch(() => ({})) };
  }

  /**
   * One scrobble call. `at` and `length` are seconds; Simkl wants a PERCENTAGE, which is the easiest
   * thing in here to get wrong.
   *
   * There is NO heartbeat, deliberately: Simkl's session expires on its own after the runtime elapses,
   * so start and stop are enough, and polling it would cost 45 to 135 times as much for nothing.
   *
   * Returns what Simkl did, in its own words: 'start', 'pause' (saved for later), 'scrobble' (marked
   * watched), or 'already' when it had already been marked within the hour.
   */
  async scrobble(what: 'start' | 'pause' | 'stop', s: Show, episode: number, at: number, length: number):
    Promise<'start' | 'pause' | 'scrobble' | 'already' | null> {
    if (!s.id) return null;                   // no id means matching by title, which can tick the wrong show
    const progress = length > 0 ? Math.max(0, Math.min(100, (at / length) * 100)) : 0;
    const run = async () => {
      const item = { title: s.title, ...(s.year ? { year: s.year } : {}), ids: { simkl: s.id } };
      const { status, json } = await this.post(`https://api.simkl.com/scrobble/${what}`, {
        progress: Number(progress.toFixed(2)),
        [s.kind === 'anime' ? 'anime' : 'show']: item,
        // Simkl's own episode number from his own list, so there is no numbering to convert. Their docs
        // warn that anime numbering differs between AniDB, TVDB and TMDB; using Simkl's avoids all of it.
        episode: { number: episode },
      });
      // Their duplicate protection: stopping something already marked watched in the last hour. That is
      // a success from his point of view, not a failure.
      if (status === 409) return 'already' as const;
      if (status !== 200 && status !== 201) throw new Error(`Simkl said ${status}.`);
      const action = String(json?.action ?? '');
      return (action === 'start' || action === 'pause' || action === 'scrobble') ? action : null;
    };
    const queued = this.scrobbling.then(run, run);
    this.scrobbling = queued.catch(() => {});   // a failure must not block the next one for ever
    return queued;
  }

  /**
   * Mark an episode watched outright, with no playback involved: for when he says so himself.
   *
   * The normal path does NOT come through here. `/scrobble/stop` already marks anything past 80%
   * watched, so calling both would write the same episode twice.
   */
  async markWatched(s: Show, episode: number): Promise<boolean> {
    if (!s.id) return false;
    const item = { title: s.title, ...(s.year ? { year: s.year } : {}), ids: { simkl: s.id }, episodes: [{ number: episode }] };
    const { status } = await this.post('https://api.simkl.com/sync/history',
      s.kind === 'anime' ? { shows: [item] } : { shows: [item] });
    return status === 200 || status === 201 || status === 409;
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
        const it = e?.show ?? e?.anime ?? {};
        out.push({
          title: String(it?.title ?? 'Untitled'), next, watched: Number(e?.watched_episodes_count ?? 0), total,
          kind: kind === 'anime' ? 'anime' : 'tv', lastAt: Date.parse(String(e?.last_watched_at ?? '')) || 0,
          id: Number(it?.ids?.simkl ?? it?.ids?.simkl_id ?? 0) || 0,
          year: Number(it?.year) || null,
          anilist: Number(it?.ids?.anilist) || 0,
        });
      }
    }
    // The names he actually says, for the anime. One request for any not seen before, then never again.
    const ids = out.map(s => s.anilist ?? 0).filter(n => n > 0);
    if (ids.length) {
      const names = await otherNames(ids, path.join(path.dirname(this.file), 'anime-names.json'), this.fetcher);
      for (const s of out) { const aka = s.anilist ? names.get(s.anilist) : undefined; if (aka) s.aka = aka; }
    }
    return out.sort((a, b) => b.lastAt - a.lastAt);                        // the one he watched last comes first
  }
}

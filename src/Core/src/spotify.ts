// Music by name: "play lo-fi girl", "put on Hotel California". Spotify's Web API, signed in once with
// tools/spotify-setup.cmd (PKCE, no client secret: the tokens are in %APPDATA%\Aang\spotify.json). Controlling playback
// needs Spotify Premium, which Joshua has (2026-09-21). The network call is injected so tests never reach Spotify.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { Fetch } from './google.ts';

interface Tokens { clientId: string; refreshToken: string; accessToken?: string; expiresAt?: number }
export type Kind = 'track' | 'playlist' | 'artist' | 'album';
export interface Pick { kind: Kind; uri: string; name: string; by: string }

export class SpotifyError extends Error {
  readonly kind: 'none' | 'signin' | 'device' | 'premium' | 'api';
  constructor(message: string, kind: 'none' | 'signin' | 'device' | 'premium' | 'api' = 'api') { super(message); this.kind = kind; }
}

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/**
 * The best match among Spotify's top results of each kind. An exact name wins (a playlist or artist called what he
 * said, before a song that merely contains it); otherwise the kind he named; otherwise the top song.
 */
export function choose(results: Record<Kind, Pick[]>, query: string, want?: Kind): Pick | null {
  const q = norm(query);
  const order: Kind[] = want ? [want, 'track', 'playlist', 'artist', 'album'] : ['artist', 'playlist', 'album', 'track'];
  for (const k of order) { const hit = (results[k] ?? []).find(p => norm(p.name) === q); if (hit) return hit; }
  // "hotel california by the eagles": the song and its artist
  const by = /^(.*)\s+by\s+(.+)$/.exec(q);
  if (by) { const hit = (results.track ?? []).find(p => norm(p.name) === by[1] && norm(p.by).includes(by[2]!)); if (hit) return hit; }
  if (want && results[want]?.[0]) return results[want]![0]!;
  return results.track?.[0] ?? results.playlist?.[0] ?? results.artist?.[0] ?? results.album?.[0] ?? null;
}

export class Spotify {
  private t: Tokens | null = null;
  private readonly file: string;
  private readonly fetcher: Fetch;
  private readonly now: () => number;
  constructor(file: string, fetcher?: Fetch, now: () => number = Date.now) {
    this.file = file; this.now = now;
    this.fetcher = fetcher ?? ((url, init) => fetch(url, init as RequestInit) as any);
  }
  get connected(): boolean { return this.load() !== null; }
  private load(): Tokens | null {
    if (this.t) return this.t;
    try { if (existsSync(this.file)) { const j = JSON.parse(readFileSync(this.file, 'utf8')); if (j?.clientId && j?.refreshToken) this.t = j; } } catch { /* not signed in */ }
    return this.t;
  }

  private async token(): Promise<string> {
    const t = this.load();
    if (!t) throw new SpotifyError('Spotify is not connected. Run tools\\spotify-setup.cmd once.', 'none');
    if (t.accessToken && (t.expiresAt ?? 0) > this.now()) return t.accessToken;
    const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: t.refreshToken, client_id: t.clientId }).toString();
    const r = await this.fetcher('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) {
      if (j?.error === 'invalid_grant') { this.t = null; throw new SpotifyError('The Spotify sign-in has expired. Run tools\\spotify-setup.cmd again.', 'signin'); }
      throw new SpotifyError(`Spotify would not refresh the sign-in (${r.status}).`);
    }
    t.accessToken = j.access_token; t.expiresAt = this.now() + (Number(j.expires_in) || 3600) * 1000 - 60_000;
    if (j.refresh_token) t.refreshToken = j.refresh_token;                 // PKCE sign-ins rotate the refresh token
    try { writeFileSync(this.file, JSON.stringify(t, null, 2)); } catch { /* refreshes again next time */ }
    return t.accessToken;
  }

  private async call(method: string, path: string, body?: unknown): Promise<any> {
    const auth = await this.token();
    const r = await this.fetcher(`https://api.spotify.com/v1${path}`, { method, headers: { authorization: `Bearer ${auth}`, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const text = await r.text();
    let j: any = {}; try { j = text ? JSON.parse(text) : {}; } catch { /* empty */ }
    if (r.status === 401) { if (this.t) this.t.expiresAt = 0; throw new SpotifyError('Spotify turned the sign-in down. Run tools\\spotify-setup.cmd again.', 'signin'); }
    if (r.status === 403) throw new SpotifyError('Spotify only lets Premium accounts be controlled like this.', 'premium');
    if (r.status === 404 && /device/i.test(String(j?.error?.message ?? ''))) throw new SpotifyError('No Spotify is open to play on.', 'device');
    if (!r.ok) throw new SpotifyError(`Spotify said ${r.status}: ${String(j?.error?.message ?? text).slice(0, 160)}`);
    return j;
  }

  async search(query: string): Promise<Record<Kind, Pick[]>> {
    const j = await this.call('GET', `/search?q=${encodeURIComponent(query)}&type=track,playlist,artist,album&limit=5`);
    const map = (items: any[] | undefined, kind: Kind): Pick[] => (items ?? []).filter(Boolean).map(i => ({
      kind, uri: String(i.uri), name: String(i.name ?? ''),
      by: kind === 'playlist' ? String(i.owner?.display_name ?? '') : kind === 'artist' ? '' : (i.artists ?? []).map((a: any) => a.name).join(', '),
    }));
    return { track: map(j.tracks?.items, 'track'), playlist: map(j.playlists?.items, 'playlist'), artist: map(j.artists?.items, 'artist'), album: map(j.albums?.items, 'album') };
  }

  /** A device to play on: the one already playing, else this computer, else any. Null if Spotify is open nowhere. */
  async device(): Promise<string | null> {
    const j = await this.call('GET', '/me/player/devices');
    const list: any[] = j.devices ?? [];
    const pick = list.find(d => d.is_active) ?? list.find(d => d.type === 'Computer') ?? list[0];
    return pick?.id ?? null;
  }

  /** Find it and play it. Throws SpotifyError with kind 'device' when Spotify is not open anywhere. */
  async play(query: string, want?: Kind): Promise<string> {
    const results = await this.search(query);
    const p = choose(results, query, want);
    if (!p) return `Nothing on Spotify matches "${query}".`;
    const dev = await this.device();
    if (!dev) throw new SpotifyError('No Spotify is open to play on.', 'device');
    await this.call('PUT', `/me/player/play?device_id=${encodeURIComponent(dev)}`, p.kind === 'track' ? { uris: [p.uri] } : { context_uri: p.uri });
    const what = p.kind === 'track' ? `"${p.name}"${p.by ? ` by ${p.by}` : ''}` : p.kind === 'artist' ? `${p.name}` : `the ${p.kind} "${p.name}"${p.by && p.kind === 'album' ? ` by ${p.by}` : ''}`;
    return `Playing ${what} on Spotify.`;
  }
}

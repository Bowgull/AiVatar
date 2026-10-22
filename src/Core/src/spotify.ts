// Music by name: "play lo-fi girl", "put on Hotel California". Spotify's Web API, signed in once with
// tools/spotify-setup.cmd (PKCE, no client secret: the tokens are in %APPDATA%\Aang\spotify.json). Controlling playback
// needs Spotify Premium, which Joshua has (2026-09-21). The network call is injected so tests never reach Spotify.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { Fetch } from './google.ts';

interface Tokens { clientId: string; refreshToken: string; accessToken?: string; expiresAt?: number }
export type Kind = 'track' | 'playlist' | 'artist' | 'album';
export interface Pick { kind: Kind; uri: string; name: string; by: string }

export class SpotifyError extends Error {
  readonly kind: 'none' | 'signin' | 'device' | 'premium' | 'rate' | 'api';
  /** For 'rate' (a 429): how long Spotify asked us to wait, in seconds. */
  readonly retryAfter: number;
  constructor(message: string, kind: 'none' | 'signin' | 'device' | 'premium' | 'rate' | 'api' = 'api', retryAfter = 0) { super(message); this.kind = kind; this.retryAfter = retryAfter; }
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
    return String(j.access_token);
  }

  private async call(method: string, path: string, body?: unknown): Promise<any> {
    const auth = await this.token();
    const r = await this.fetcher(`https://api.spotify.com/v1${path}`, { method, headers: { authorization: `Bearer ${auth}`, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const text = await r.text();
    let j: any = {}; try { j = text ? JSON.parse(text) : {}; } catch { /* empty */ }
    if (r.status === 429) {
      const ra = Number((r as { headers?: { get?: (n: string) => string | null } }).headers?.get?.('retry-after'));
      throw new SpotifyError('Spotify asked to slow down.', 'rate', Number.isFinite(ra) && ra > 0 ? Math.min(3600, ra) : 30);
    }
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

  // ---------------------------------------------------------------- Spotify Connect, for the mini player (2026-10-22)
  // His question: "how does the music player pick up something in Spotify if it's playing on my phone or my Mac or my
  // smart speakers?" Windows' now-playing only sees this PC; these read and steer whatever device Spotify is playing on.

  /** GET /me/player: the raw playback state, or null when nothing is playing anywhere (204). */
  async playback(): Promise<any | null> {
    const j = await this.call('GET', '/me/player?additional_types=episode');
    return j && typeof j === 'object' && j.device ? j : null;
  }
  /** Every device Spotify can play on right now. */
  async devices(): Promise<any[]> {
    const j = await this.call('GET', '/me/player/devices');
    return Array.isArray(j.devices) ? j.devices : [];
  }
  /** One of the player's keys, on that device. Positions in seconds, volume 0..1. */
  async control(op: 'play' | 'pause' | 'next' | 'prev' | 'seek' | 'volume', device: string, value?: number): Promise<void> {
    const d = `device_id=${encodeURIComponent(device)}`;
    if (op === 'play') await this.call('PUT', `/me/player/play?${d}`);
    else if (op === 'pause') await this.call('PUT', `/me/player/pause?${d}`);
    else if (op === 'next') await this.call('POST', `/me/player/next?${d}`);
    else if (op === 'prev') await this.call('POST', `/me/player/previous?${d}`);
    else if (op === 'seek') await this.call('PUT', `/me/player/seek?position_ms=${Math.max(0, Math.round((value ?? 0) * 1000))}&${d}`);
    else if (op === 'volume') await this.call('PUT', `/me/player/volume?volume_percent=${Math.max(0, Math.min(100, Math.round((value ?? 0) * 100)))}&${d}`);
  }
  /** Move playback to another device (Spotify Connect's transfer), playing. */
  async transfer(device: string): Promise<void> {
    await this.call('PUT', '/me/player', { device_ids: [device], play: true });
  }
  /** An album cover from Spotify's image host, as a data URL for the player (its page loads nothing from the web). */
  async cover(url: string): Promise<string | null> {
    let u: URL;
    try { u = new URL(url); } catch { return null; }
    if (u.protocol !== 'https:' || !/(^|\.)scdn\.co$|(^|\.)spotifycdn\.com$/.test(u.hostname)) return null;
    const r = await this.fetcher(u.toString(), { method: 'GET' }) as Awaited<ReturnType<Fetch>> & { arrayBuffer?: () => Promise<ArrayBuffer>; headers?: { get?: (n: string) => string | null } };
    if (!r.ok || !r.arrayBuffer) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (!buf.length || buf.length > 400_000) return null;
    const type = buf[0] === 0x89 && buf[1] === 0x50 ? 'png' : buf[0] === 0xff && buf[1] === 0xd8 ? 'jpeg' : null;
    return type ? `data:image/${type};base64,${buf.toString('base64')}` : null;
  }
}

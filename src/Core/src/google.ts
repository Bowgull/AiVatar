// Gmail and Calendar over plain REST. The sign-in (tools/google-setup.cmd) leaves the tokens in %APPDATA%\Aang\google.json.
// The network call is injected so tests never touch Google. This file only moves bytes; every rule about what may be
// sent lives in mail.ts.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export type Fetch = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; json(): Promise<any>; text(): Promise<string> }>;

export interface Tokens { clientId: string; clientSecret: string; refreshToken: string; accessToken?: string; expiresAt?: number; scope?: string; account?: string }

export class GoogleError extends Error {
  /** `signin`: he has to run google-setup again (the token was revoked or expired). `none`: he never signed in. */
  readonly kind: 'signin' | 'none' | 'api';
  constructor(message: string, kind: 'signin' | 'none' | 'api' = 'api') { super(message); this.kind = kind; }
}

export interface Part { mimeType?: string; filename?: string; body?: { data?: string; size?: number }; parts?: Part[]; headers?: { name: string; value: string }[] }
export interface Message { id: string; threadId: string; snippet?: string; internalDate?: string; labelIds?: string[]; payload?: Part }
export interface CalEvent { id: string; summary?: string; location?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string }; status?: string; attendees?: { email: string; self?: boolean; responseStatus?: string }[] }

export class Google {
  private t: Tokens | null = null;
  private readonly file: string;
  private readonly fetcher: Fetch;
  private readonly now: () => number;
  constructor(file: string, fetcher?: Fetch, now: () => number = Date.now) {
    this.file = file; this.now = now;
    this.fetcher = fetcher ?? ((url, init) => fetch(url, init as RequestInit) as any);
  }

  /** Signed in at all? Cheap: reads the file, never the network. */
  get connected(): boolean { return this.load() !== null; }
  get account(): string { return this.load()?.account ?? ''; }
  /** Whether the grant includes a scope (a client signed in before a scope was added would not). */
  has(scope: string): boolean { return (this.load()?.scope ?? '').split(' ').some(s => s.endsWith('/' + scope)); }

  private load(): Tokens | null {
    if (this.t) return this.t;
    try {
      if (!existsSync(this.file)) return null;
      const j = JSON.parse(readFileSync(this.file, 'utf8'));
      if (j?.clientId && j?.clientSecret && j?.refreshToken) this.t = j as Tokens;
    } catch { /* unreadable: treated as not signed in */ }
    return this.t;
  }

  private async token(): Promise<string> {
    const t = this.load();
    if (!t) throw new GoogleError('Google is not connected. Run tools\\google-setup.cmd once.', 'none');
    if (t.accessToken && (t.expiresAt ?? 0) > this.now()) return t.accessToken;
    const body = new URLSearchParams({ client_id: t.clientId, client_secret: t.clientSecret, refresh_token: t.refreshToken, grant_type: 'refresh_token' }).toString();
    const r = await this.fetcher('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) {
      if (j?.error === 'invalid_grant') { this.t = null; throw new GoogleError('Google sign-in has expired. Run tools\\google-setup.cmd again.', 'signin'); }
      throw new GoogleError(`Google would not refresh the sign-in (${r.status}).`);
    }
    t.accessToken = j.access_token; t.expiresAt = this.now() + (Number(j.expires_in) || 3600) * 1000 - 60_000;
    try { writeFileSync(this.file, JSON.stringify(t, null, 2)); } catch { /* it just refreshes again next time */ }   // in place, so the owner-only ACL stays
    return t.accessToken;
  }

  private async call(method: string, url: string, body?: unknown): Promise<any> {
    const auth = await this.token();
    const r = await this.fetcher(url, { method, headers: { authorization: `Bearer ${auth}`, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const text = await r.text();
    let j: any = {}; try { j = text ? JSON.parse(text) : {}; } catch { /* not json */ }
    if (r.status === 401) { if (this.t) { this.t.accessToken = undefined; this.t.expiresAt = 0; } throw new GoogleError('Google turned the sign-in down. Run tools\\google-setup.cmd again.', 'signin'); }
    if (!r.ok) throw new GoogleError(`Google said ${r.status}: ${String(j?.error?.message ?? text).slice(0, 200)}`);
    return j;
  }

  // ---------------------------------------------------------------- Gmail

  private static readonly G = 'https://gmail.googleapis.com/gmail/v1/users/me';

  async list(query: string, max: number): Promise<{ id: string; threadId: string }[]> {
    const j = await this.call('GET', `${Google.G}/messages?maxResults=${Math.max(1, Math.min(25, max))}&q=${encodeURIComponent(query)}`);
    return j.messages ?? [];
  }
  async message(id: string, format: 'full' | 'metadata' = 'full'): Promise<Message> {
    const meta = format === 'metadata' ? '&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=To&metadataHeaders=Reply-To&metadataHeaders=Message-ID&metadataHeaders=References' : '';
    return this.call('GET', `${Google.G}/messages/${encodeURIComponent(id)}?format=${format}${meta}`);
  }
  /** Sends. Only mail.ts calls this, and only for a draft whose hash he approved. */
  async send(raw: string, threadId?: string): Promise<{ id: string }> {
    return this.call('POST', `${Google.G}/messages/send`, { raw, ...(threadId ? { threadId } : {}) });
  }
  /** Leaves it in his Gmail Drafts folder, unsent. */
  async saveDraft(raw: string, threadId?: string): Promise<{ id: string }> {
    return this.call('POST', `${Google.G}/drafts`, { message: { raw, ...(threadId ? { threadId } : {}) } });
  }

  // ---------------------------------------------------------------- Calendar

  async events(fromIso: string, toIso: string, max = 25): Promise<CalEvent[]> {
    const j = await this.call('GET', `https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=${max}&timeMin=${encodeURIComponent(fromIso)}&timeMax=${encodeURIComponent(toIso)}`);
    return j.items ?? [];
  }
}

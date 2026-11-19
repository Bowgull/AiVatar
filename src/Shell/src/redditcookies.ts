// The Shrine Reddit feed moved out of Samara (2026-11-19, his "Trim it": Samara should only talk to what a browser
// needs). The feed now runs in Aang's own process on the PC (main.ts), which has a profile of its own ('Aang Pet') and
// so no Reddit sign-in. Samara hands it his reddit.com cookies, and only those, through the brain's relay: local only
// (127.0.0.1), never written to a file, never kept by the brain (core.ts 'relay'). Aang keeps them in its own persistent
// partition, which Chromium encrypts on disk as it does Samara's. One way only: Samara's are always the truth.
// Its own file so it is tested without Electron.

/** The fields a cookie keeps (Electron's Cookie, cut down to what goes back in). */
export interface RedditCookie {
  name: string; value: string; domain: string; path: string;
  secure: boolean; httpOnly: boolean; hostOnly: boolean;
  expirationDate?: number; sameSite?: 'unspecified' | 'no_restriction' | 'lax' | 'strict';
}
type AnyCookie = { name?: unknown; value?: unknown; domain?: unknown; path?: unknown; secure?: unknown; httpOnly?: unknown; hostOnly?: unknown; expirationDate?: unknown; sameSite?: unknown };

/** reddit.com and its own subdomains; never a look-alike (notreddit.com, reddit.com.evil). */
export const isReddit = (domain: unknown): boolean => typeof domain === 'string' && /^(?:.+\.)?reddit\.com$/i.test(domain.replace(/^\./, ''));

const SAME_SITE = new Set(['unspecified', 'no_restriction', 'lax', 'strict']);
/** Only Reddit's, only plain fields, at most 60 (Reddit sets about 15; the relay takes 64 KB). */
export function redditOnly(list: readonly AnyCookie[]): RedditCookie[] {
  const out: RedditCookie[] = [];
  for (const c of list) {
    if (!c || !isReddit(c.domain) || typeof c.name !== 'string' || typeof c.value !== 'string' || !c.name) continue;
    if (c.value.length > 4096) continue;
    out.push({
      name: c.name, value: c.value, domain: String(c.domain), path: typeof c.path === 'string' && c.path.startsWith('/') ? c.path : '/',
      secure: c.secure === true, httpOnly: c.httpOnly === true, hostOnly: c.hostOnly === true,
      ...(typeof c.expirationDate === 'number' && Number.isFinite(c.expirationDate) ? { expirationDate: c.expirationDate } : {}),
      ...(typeof c.sameSite === 'string' && SAME_SITE.has(c.sameSite) ? { sameSite: c.sameSite as RedditCookie['sameSite'] } : {}),
    });
    if (out.length >= 60) break;
  }
  return out;
}

/** The details Electron's cookies.set takes for one: a host-only cookie keeps no domain, so it stays host-only. */
export function setDetails(c: RedditCookie): Record<string, unknown> {
  const host = c.domain.replace(/^\./, '');
  return {
    url: `https://${host}${c.path}`, name: c.name, value: c.value, path: c.path, secure: c.secure, httpOnly: c.httpOnly,
    ...(c.hostOnly ? {} : { domain: c.domain }),
    ...(c.expirationDate !== undefined ? { expirationDate: c.expirationDate } : {}),
    ...(c.sameSite ? { sameSite: c.sameSite } : {}),
  };
}

/** What a session's cookie store has to offer here (Electron's session.cookies). */
export interface CookieStore {
  get(filter: Record<string, unknown>): Promise<AnyCookie[]>;
  set(details: Record<string, unknown>): Promise<void>;
  remove(url: string, name: string): Promise<void>;
  on?(ev: 'changed', fn: (e: unknown, cookie: AnyCookie, cause: string, removed: boolean) => void): unknown;
}

const key = (c: { name: string; domain: string; path: string }) => `${c.name}|${c.domain}|${c.path}`;
// Always the whole jar, filtered here: Chromium's { domain: 'reddit.com' } leaves out host-only cookies on
// www.reddit.com (measured 2026-11-19, redditcookies-check).

/**
 * Samara's half: sends his Reddit cookies now, and again a few seconds after any of them changes (a sign-in, a sign-out,
 * Reddit's own refreshes). `send` returns false while the brain is away; the next change or ask sends them again.
 */
export function shareRedditCookies(store: CookieStore, send: (cookies: RedditCookie[]) => boolean, o: { waitMs?: number } = {}): { now(): Promise<boolean>; stop(): void } {
  let timer: ReturnType<typeof setTimeout> | null = null, stopped = false;
  const now = async () => { if (stopped) return false; try { return send(redditOnly(await store.get({}))); } catch { return false; } };
  store.on?.('changed', (_e, c) => {
    if (stopped || !isReddit(c?.domain)) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; void now(); }, o.waitMs ?? 3000);
    (timer as { unref?: () => void }).unref?.();
  });
  return { now, stop: () => { stopped = true; if (timer) clearTimeout(timer); } };
}

/**
 * Aang's half: his Reddit cookies, exactly as Samara has them. Ones Samara no longer has are taken out (he signed out
 * there), the rest put in. Nothing but reddit.com is ever touched. Returns how many are in.
 */
export async function takeRedditCookies(store: CookieStore, sent: unknown): Promise<number> {
  const want = redditOnly(Array.isArray(sent) ? sent : []);
  const wanted = new Set(want.map(key));
  const have = redditOnly(await store.get({}));
  for (const c of have) if (!wanted.has(key(c))) { try { await store.remove(`https://${c.domain.replace(/^\./, '')}${c.path}`, c.name); } catch { /* gone */ } }
  let n = 0;
  for (const c of want) { try { await store.set(setDetails(c)); n++; } catch { /* one Chromium would not take */ } }
  return n;
}

/** Whether a store holds a Reddit sign-in (the feed waits for one rather than ask Reddit signed out). */
export async function signedIn(store: CookieStore): Promise<boolean> {
  try { return redditOnly(await store.get({})).some((c) => c.name === 'reddit_session' && c.value); } catch { return false; }
}

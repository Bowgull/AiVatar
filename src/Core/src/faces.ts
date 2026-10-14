/**
 * The picture at the top of a message (his ask, 2026-10-14): "if there's a thumbnail to grab he should surface that".
 * A YouTube channel's own round picture for its uploads; a site's icon for a website or an email's sender.
 *
 * Every picture is fetched here and handed to the bubble as a data: address, so no window ever loads from the web.
 * Site icons come through DuckDuckGo's icon service, never the site itself: a sender (maybe a phishing one) never
 * learns that this PC looked at their email.
 */

const MAX_BYTES = 150_000;
const IMAGE = /^image\/(png|jpeg|gif|webp|x-icon|vnd\.microsoft\.icon)\b/i;

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

/** The channel picture's address in a channel page, asked for at 88 pixels. Null when the page has none. */
export function channelPictureIn(html: string): string | null {
  const m = /<meta\s+property="og:image"\s+content="([^"]+)"/i.exec(html) ?? /<link\s+itemprop="thumbnailUrl"\s+href="([^"]+)"/i.exec(html);
  if (!m) return null;
  const u = m[1]!.replace(/&amp;/g, '&');
  if (!/^https:\/\/yt\d\.(googleusercontent|ggpht)\.com\//.test(u)) return null;
  return u.replace(/=s\d+(-[^?#]*)?$/, '=s88-c-k-c0x00ffffff-no-rj');
}

/** A web address's host, for its icon. Null for anything that is not a plain https or http site. */
export function hostOf(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return /^[a-z0-9.-]+$/i.test(u.hostname) && u.hostname.includes('.') ? u.hostname.toLowerCase() : null;
  } catch { return null; }
}

/** An email address's domain. */
export function domainOfEmail(from: string): string | null {
  const m = /@([a-z0-9.-]+\.[a-z]{2,})>?\s*$/i.exec(String(from ?? '').trim());
  return m ? m[1]!.toLowerCase() : null;
}

/** One picture as a data: address, or null: wrong type, too big, or not there. */
export async function pictureAt(url: string, get: Fetcher = fetch): Promise<string | null> {
  try {
    const r = await get(url, { signal: AbortSignal.timeout(8000), redirect: 'follow', credentials: 'omit' } as RequestInit);
    if (!r.ok) return null;
    const type = (r.headers.get('content-type') ?? '').split(';')[0]!.trim();
    if (!IMAGE.test(type)) return null;
    const b = Buffer.from(await r.arrayBuffer());
    if (b.length < 60 || b.length > MAX_BYTES) return null;
    return `data:${type};base64,${b.toString('base64')}`;
  } catch { return null; }
}

/** Remembered pictures, so each channel or site is fetched once a day at most. */
export class Faces {
  private got = new Map<string, { img: string | null; at: number }>();
  private get: Fetcher;
  private readText: (url: string) => Promise<string>;
  constructor(get: Fetcher = fetch, readText?: (url: string) => Promise<string>) {
    this.get = get;
    this.readText = readText ?? (async (u) => (await get(u, { signal: AbortSignal.timeout(10_000), headers: { 'Accept-Language': 'en' } })).text());
  }

  private async cached(key: string, make: () => Promise<string | null>): Promise<string | null> {
    const had = this.got.get(key);
    if (had && Date.now() - had.at < 24 * 3600_000) return had.img;
    const img = await make().catch(() => null);
    this.got.set(key, { img, at: Date.now() });
    while (this.got.size > 300) this.got.delete(this.got.keys().next().value as string);
    return img;
  }

  /** A YouTube channel's own picture, by its channel id. */
  channel(id: string): Promise<string | null> {
    if (!/^UC[\w-]{20,24}$/.test(id)) return Promise.resolve(null);
    return this.cached(`yt:${id}`, async () => {
      const at = channelPictureIn(await this.readText(`https://www.youtube.com/channel/${id}`));
      return at ? pictureAt(at, this.get) : null;
    });
  }

  /** A site's icon, by its host (DuckDuckGo's copy). */
  site(host: string | null): Promise<string | null> {
    if (!host) return Promise.resolve(null);
    return this.cached(`site:${host}`, () => pictureAt(`https://icons.duckduckgo.com/ip3/${encodeURIComponent(host)}.ico`, this.get));
  }
}

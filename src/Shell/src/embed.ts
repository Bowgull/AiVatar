// Turning a link he pasted into something that will actually play in the pop-out.
//
// Two things make this fiddlier than it looks, both found by testing on 2026-10-04:
//
// 1. A YouTube embed loaded from a file:// page fails with Error 153. It needs a real http origin as
//    its referrer. So the pop-out's page is served from a tiny server on 127.0.0.1 rather than loaded
//    off disk, and that is the only reason that server exists.
// 2. Twitch refuses to play unless the page's own host is named in a `parent` parameter, and unless
//    the player is at least 400 by 300.
//
// Anything not recognised is opened as an ordinary page, so a link to a site with its own player still
// works. Nothing here fetches anything; it only rewrites addresses.

export type Source = 'youtube' | 'twitch' | 'page';

export interface Embed {
  /** What to put in the frame. */
  url: string;
  source: Source;
  /** What the grab bar shows on the right: YOUTUBE, TWITCH, or the site's own name. */
  label: string;
  /** True for a live stream, where the scrub groove is full and unmoving (sheet 4, section 2). */
  live: boolean;
}

/** The smallest Twitch will play at. The window is never allowed below this while Twitch is in it. */
export const TWITCH_MIN = { width: 400, height: 300 };

const youtubeId = (u: URL): string | null => {
  // youtu.be/ID
  if (/(^|\.)youtu\.be$/i.test(u.hostname)) return u.pathname.slice(1).split('/')[0] || null;
  if (!/(^|\.)youtube(-nocookie)?\.com$/i.test(u.hostname)) return null;
  // /watch?v=ID
  const v = u.searchParams.get('v');
  if (v) return v;
  // /embed/ID, /live/ID, /shorts/ID
  const m = /^\/(embed|live|shorts|v)\/([^/?#]+)/.exec(u.pathname);
  return m ? m[2]! : null;
};

const twitchChannel = (u: URL): { channel?: string; video?: string } | null => {
  if (!/(^|\.)twitch\.tv$/i.test(u.hostname)) return null;
  const parts = u.pathname.split('/').filter(Boolean);
  if (parts[0] === 'videos' && parts[1]) return { video: parts[1] };
  // A channel page is just twitch.tv/name. Everything else there is not a stream.
  if (parts.length === 1 && parts[0] && !/^(directory|settings|downloads|store|p)$/i.test(parts[0])) {
    return { channel: parts[0] };
  }
  return null;
};

/**
 * Work out what to show for a link.
 *
 * `host` is the address the pop-out's own page is served from, which Twitch insists on being told.
 */
export function embedFor(link: string, host = '127.0.0.1', origin?: string): Embed | null {
  let u: URL;
  try { u = new URL(link.trim()); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;   // never file:, never javascript:

  const yt = youtubeId(u);
  if (yt) {
    // enablejsapi is what lets Aang's own play, pause, scrub and volume work at all: without it the
    // player ignores every message and the controls would sit there doing nothing (step 6.5).
    const q = new URLSearchParams({ autoplay: '1', rel: '0', modestbranding: '1', enablejsapi: '1' });
    // YouTube wants to know which page is driving it. Without this it accepts the address but ignores
    // the commands, which looks exactly like controls that are wired up and do nothing.
    if (origin) q.set('origin', origin);
    // Keep his place if the link had a timestamp on it.
    const t = u.searchParams.get('t') ?? u.searchParams.get('start');
    if (t) q.set('start', String(parseInt(t, 10) || 0));
    return { url: `https://www.youtube.com/embed/${encodeURIComponent(yt)}?${q}`, source: 'youtube', label: 'YOUTUBE', live: false };
  }

  const tw = twitchChannel(u);
  if (tw) {
    const q = new URLSearchParams({ parent: host, autoplay: 'true', muted: 'false' });
    if (tw.channel) q.set('channel', tw.channel);
    if (tw.video) q.set('video', tw.video);
    return {
      url: `https://player.twitch.tv/?${q}`,
      source: 'twitch',
      label: 'TWITCH',
      live: Boolean(tw.channel),              // a saved video is not live; a channel is
    };
  }

  // Anything else: show the page itself and let it use its own player.
  return { url: u.toString(), source: 'page', label: u.hostname.replace(/^www\./, '').toUpperCase(), live: false };
}

/** What the grab bar says on the left, before Aang knows the real title. */
export function titleFor(e: Embed, link: string): string {
  if (e.source === 'twitch') {
    const u = new URL(link);
    const name = u.pathname.split('/').filter(Boolean).pop() ?? 'Twitch';
    return name.charAt(0).toUpperCase() + name.slice(1);
  }
  return e.source === 'youtube' ? 'YouTube video' : e.label.toLowerCase();
}

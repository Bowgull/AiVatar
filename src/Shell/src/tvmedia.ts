// Sheet 89 (his picks, 2026-10-25): what "Just the video" sends to his TV, for each kind of page.
//  - Stremio, and any page playing a plain video file: the file's own address (Stremio's from its engine on this Mac,
//    which the TV reaches over the home network);
//  - Twitch: the stream's own HLS playlist, asked of Twitch the way its web player asks;
//  - YouTube: the TV's own YouTube app, told which video and where (YouTube's "lounge", the way phones cast to it).
// A page that plays from inside itself (most other sites) has no address to send: it goes as the whole window instead.
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import type { CastMedia } from './tv.ts';

/** This Mac's address on the home network (where the TV fetches Stremio's stream from). */
export function lanIp(): string {
  const all = os.networkInterfaces();
  for (const name of ['en0', 'en1', ...Object.keys(all)]) for (const a of all[name] ?? []) if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')) return a.address;
  return '';
}
/** A YouTube video's id from its address (watch, youtu.be, shorts, live), or null. */
export function youTubeId(url: string): string | null {
  try {
    const u = new URL(url), h = u.hostname.replace(/^(www|m|music)\./, '');
    if (h === 'youtu.be') return /^[\w-]{11}$/.test(u.pathname.slice(1, 12)) ? u.pathname.slice(1, 12) : null;
    if (h !== 'youtube.com') return null;
    const v = u.searchParams.get('v') ?? /^\/(shorts|live|embed)\/([\w-]{11})/.exec(u.pathname)?.[2] ?? null;
    return v && /^[\w-]{11}$/.test(v) ? v : null;
  } catch { return null; }
}
/** A Twitch channel (live) or video (past broadcast) from its address, or null. */
export function twitchOf(url: string): { login: string } | { vod: string } | null {
  try {
    const u = new URL(url);
    if (!/(^|\.)twitch\.tv$/.test(u.hostname)) return null;
    const vod = /^\/videos\/(\d+)/.exec(u.pathname)?.[1];
    if (vod) return { vod };
    const login = /^\/([a-z0-9_]{3,25})\/?$/i.exec(u.pathname)?.[1];
    if (!login || /^(directory|videos|settings|subscriptions|inventory|wallet|drops|p|search|downloads|turbo|friends|messages)$/i.test(login)) return null;
    return { login: login.toLowerCase() };
  } catch { return null; }
}

/** Run in the page: its main video (the largest), where it is, and its own address when it has one. */
export const PAGE_VIDEO_JS = `(() => {
  const vs = [...document.querySelectorAll('video')].filter((v) => v.readyState > 0 || v.currentSrc);
  vs.sort((a, b) => (b.clientWidth * b.clientHeight) - (a.clientWidth * a.clientHeight));
  const v = vs[0]; if (!v) return null;
  return { src: v.currentSrc || v.src || '', at: v.currentTime || 0, live: !isFinite(v.duration), paused: v.paused, poster: v.poster || '', title: document.title };
})()`;
/** Pause the page's own videos (the TV has it now). */
export const PAUSE_PAGE_JS = `(() => { for (const v of document.querySelectorAll('video')) { try { v.pause(); } catch {} } return true; })()`;
/** Put the page's main video back where the TV left it, still paused. */
export const seekPageJs = (at: number) => `(() => { const vs = [...document.querySelectorAll('video')].sort((a, b) => (b.clientWidth * b.clientHeight) - (a.clientWidth * a.clientHeight)); const v = vs[0]; if (v && isFinite(${Number(at) || 0})) { try { v.currentTime = ${Number(at) || 0}; v.pause(); } catch {} } return !!v; })()`;

/** The type the TV is told, from the address (its own player guesses badly without it). */
function typeOf(src: string): string {
  const p = src.toLowerCase().split('?')[0]!;
  if (p.endsWith('.m3u8') || p.includes('/hls')) return 'application/x-mpegURL';
  if (p.endsWith('.mpd')) return 'application/dash+xml';
  if (p.endsWith('.webm')) return 'video/webm';
  if (p.endsWith('.mkv')) return 'video/x-matroska';
  return 'video/mp4';
}
/**
 * A page's playing video as something the TV can fetch itself, or null (a stream made inside the page, a blob:). Stremio's
 * engine address on this Mac becomes the Mac's home-network address, which the TV can reach.
 */
export function plainMedia(v: { src: string; at: number; live: boolean; poster: string; title: string } | null): CastMedia | null {
  if (!v || !/^https?:\/\//i.test(v.src)) return null;
  let url = v.src;
  try {
    const u = new URL(url);
    if ((u.hostname === '127.0.0.1' || u.hostname === 'localhost') && u.port === '11470') { const ip = lanIp(); if (!ip) return null; u.hostname = ip; url = u.href; }
    else if (/^(127\.|localhost$)/.test(u.hostname)) return null;           // anything else on this Mac the TV cannot reach
  } catch { return null; }
  return { url, type: typeOf(url), live: v.live, title: v.title.slice(0, 200), at: v.live ? 0 : v.at, ...(v.poster && /^https:/.test(v.poster) ? { poster: v.poster } : {}) };
}

/** Twitch's public web-player id (the one its own site sends; no account). */
const TWITCH_CLIENT = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
/** A Twitch stream or past broadcast as its HLS playlist, which the TV plays by itself. */
export async function twitchMedia(url: string, title: string, at = 0): Promise<CastMedia | null> {
  const t = twitchOf(url);
  if (!t) return null;
  const live = 'login' in t;
  const query = `query PlaybackAccessToken($login: String!, $isLive: Boolean!, $vodID: ID!, $isVod: Boolean!, $playerType: String!) {
    streamPlaybackAccessToken(channelName: $login, params: {platform: "web", playerBackend: "mediaplayer", playerType: $playerType}) @include(if: $isLive) { value signature }
    videoPlaybackAccessToken(id: $vodID, params: {platform: "web", playerBackend: "mediaplayer", playerType: $playerType}) @include(if: $isVod) { value signature } }`;
  const r = await fetch('https://gql.twitch.tv/gql', {
    method: 'POST', signal: AbortSignal.timeout(8000),
    headers: { 'Client-ID': TWITCH_CLIENT, 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify({ query, variables: { login: live ? t.login : '', isLive: live, vodID: live ? '' : t.vod, isVod: !live, playerType: 'embed' } }),
  }).catch(() => null);
  if (!r?.ok) return null;
  const j = await r.json().catch(() => null) as { data?: Record<string, { value: string; signature: string } | null> } | null;
  const tok = live ? j?.data?.streamPlaybackAccessToken : j?.data?.videoPlaybackAccessToken;
  if (!tok?.value || !tok.signature) return null;
  const q = new URLSearchParams({ sig: tok.signature, token: tok.value, allow_source: 'true', allow_audio_only: 'true', p: String(Math.floor(Math.random() * 1e6)), player_backend: 'mediaplayer', playlist_include_framerate: 'true' });
  const hls = live ? `https://usher.ttvnw.net/api/channel/hls/${t.login}.m3u8?${q}` : `https://usher.ttvnw.net/vod/${t.vod}.m3u8?${q}`;
  return { url: hls, type: 'application/x-mpegURL', live, title: title.slice(0, 200), at: live ? 0 : at };
}

/** The TV's YouTube app on Google Cast, and its own channel. */
export const YOUTUBE_APP = '233637DE';
export const YOUTUBE_NS = 'urn:x-cast:com.google.youtube.mdx';
/**
 * Tell the TV's YouTube app to play a video from a point (YouTube's lounge, as a phone does when it casts): the screen's
 * id comes from the app on the TV, a lounge token from YouTube, then a session, then the video. Null when it went.
 */
export async function youTubeOnTv(screenId: string, videoId: string, at: number): Promise<string | null> {
  const tokR = await fetch('https://www.youtube.com/api/lounge/pairing/get_lounge_token_batch', {
    method: 'POST', signal: AbortSignal.timeout(8000), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ screen_ids: screenId }),
  }).catch(() => null);
  const tok = (await tokR?.json().catch(() => null) as { screens?: { loungeToken?: string }[] } | null)?.screens?.[0]?.loungeToken;
  if (!tok) return 'YouTube did not let Samara reach your TV.';
  const base = 'https://www.youtube.com/api/lounge/bc/bind';
  const common = { device: 'REMOTE_CONTROL', id: randomUUID(), name: 'Samara', 'mdx-version': '3', pairing_type: 'cast', app: 'android-phone-13.14.55', VER: '8', CVER: '1' };
  const head = { 'Content-Type': 'application/x-www-form-urlencoded', 'X-YouTube-LoungeId-Token': tok };
  const bind = await fetch(`${base}?${new URLSearchParams({ ...common, RID: '0', loungeIdToken: tok })}`, { method: 'POST', headers: head, body: 'count=0', signal: AbortSignal.timeout(8000) }).catch(() => null);
  const text = await bind?.text().catch(() => '') ?? '';
  const sid = /"c","([^"]+)"/.exec(text)?.[1], gs = /"S","([^"]+)"/.exec(text)?.[1];
  if (!sid || !gs) return 'YouTube did not open a session with your TV.';
  const body = new URLSearchParams({ count: '1', ofs: '0', req0__sc: 'setPlaylist', req0_videoId: videoId, req0_currentTime: String(Math.max(0, Math.floor(at))), req0_currentIndex: '-1', req0_audioOnly: 'false', req0_videoIds: videoId, req0_listId: '' });
  const set = await fetch(`${base}?${new URLSearchParams({ ...common, RID: '1', SID: sid, gsessionid: gs, loungeIdToken: tok })}`, { method: 'POST', headers: head, body, signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (!set?.ok) return 'YouTube did not start the video on your TV.';
  // His rule (2026-10-25): it waits, paused, for him. YouTube's app always starts playing, so it is paused once it has.
  await new Promise((r) => setTimeout(r, 2500));
  await fetch(`${base}?${new URLSearchParams({ ...common, RID: '2', SID: sid, gsessionid: gs, loungeIdToken: tok })}`, { method: 'POST', headers: head, body: new URLSearchParams({ count: '1', ofs: '1', req0__sc: 'pause' }), signal: AbortSignal.timeout(8000) }).catch(() => null);
  return null;
}

// ---- Sheet 99 (his pick, 2026-10-27): the TV's own apps, through Google TV's remote service (tvremote.ts). Each site's
// page address becomes the link the TV's app answers, as found on his TV that day: YouTube's watch link plays in the
// TV's YouTube with his Premium (no ads); Netflix plays a title only with ?source=30; Prime's app.primevideo.com link
// reaches the Prime app (it stops at its profile picker, then shows its home); Stremio opens the show's page.
export type TvApp = 'YouTube' | 'Netflix' | 'Prime Video' | 'Stremio';
export interface TvAppLink { app: TvApp; link: string }
/** The TV-app link for a page, or null when the site has no app on the TV that Samara knows how to open. */
export function tvAppLink(url: string, at = 0): TvAppLink | null {
  const yt = youTubeId(url);
  if (yt) return { app: 'YouTube', link: `https://www.youtube.com/watch?v=${yt}${at >= 1 ? `&t=${Math.floor(at)}` : ''}` };
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  const h = u.hostname.replace(/^www\./, '');
  if (h === 'netflix.com') {
    const id = /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(?:watch|title)\/(\d{5,})/i.exec(u.pathname)?.[1] ?? (/^\d{5,}$/.test(u.searchParams.get('jbv') ?? '') ? u.searchParams.get('jbv') : null);
    return id ? { app: 'Netflix', link: `https://www.netflix.com/title/${id}?source=30` } : null;
  }
  const prime = h === 'primevideo.com' ? /\/detail\/([A-Z0-9]{8,})/i.exec(u.pathname)?.[1]
    : /^amazon\.(ca|com|co\.uk)$/.test(h) ? /\/gp\/video\/detail\/([A-Z0-9]{8,})/i.exec(u.pathname)?.[1] : undefined;
  if (prime) return { app: 'Prime Video', link: `https://app.primevideo.com/detail?gti=${prime}` };
  if (h === 'web.stremio.com') {
    const m = /^#\/detail\/(movie|series)\/(tt\d{5,})/.exec(u.hash);
    return m ? { app: 'Stremio', link: `stremio:///detail/${m[1]}/${m[2]}` } : null;
  }
  return null;
}
/** Sites whose video is copy-protected inside the page: "Send only the video" cannot work there. */
export function copyProtected(url: string): boolean {
  try { return /(^|\.)(netflix\.com|primevideo\.com|disneyplus\.com|crave\.ca|crunchyroll\.com|max\.com|hulu\.com|paramountplus\.com|apple\.com)$/.test(new URL(url).hostname) || /amazon\.[a-z.]+$/.test(new URL(url).hostname) && /\/gp\/video\//.test(new URL(url).pathname); } catch { return false; }
}
/**
 * What Samara does on the TV, in order: wake it, Home (an app opened over the screensaver stays behind it), the link;
 * then on YouTube, answer "Who's watching?" with his account (the first choice) and pause, as his rule wants videos to
 * arrive paused. Netflix ignores outside pause keys, so it is left playing. Times in ms from the start.
 */
export function tvSteps(a: TvAppLink, o: { answerYouTube: boolean; pause: boolean }): Array<{ link: string; at: number } | { key: number; at: number }> {
  const KEYS = { HOME: 3, OK: 23, PAUSE: 127, WAKEUP: 224 };
  const s: Array<{ link: string; at: number } | { key: number; at: number }> = [{ key: KEYS.WAKEUP, at: 0 }, { key: KEYS.HOME, at: 1500 }, { link: a.link, at: 2500 }];
  if (a.app === 'YouTube') {
    if (o.answerYouTube) s.push({ key: KEYS.OK, at: 7000 });
    if (o.pause) s.push({ key: KEYS.PAUSE, at: 11000 });
  }
  return s;
}

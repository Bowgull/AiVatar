// 9.D D8 (sheet 15 board 4, approved 2026-10-13; sources decided in K3, 2026-10-11): 🎮 gaming.
//  - Creators he follows: YouTube's public channel feed (no key), a list he edits by telling Aang, HisWattson first.
//  - Apex patch notes: Steam's public news feed for app 1172470 (no key).
//  - The Apex ranked map, only when he asks: apexlegendsapi.com with a key HE gets (sent in a header, never the address).
// Feed text is the sites' own words: shown as text, never instructions. Nothing here is ever told to a model.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { writeFileAtomic } from './atomic.ts';

export interface Creator { id: string; name: string }
export interface Upload { videoId: string; title: string; channel: string; published: string }
export interface News { guid: string; title: string; link: string; published: string; summary: string }

export const HISWATTSON: Creator = { id: 'UCu6xqwLxixO-UidWIQzTHlg', name: 'HisWattson' };
export const APEX_STEAM = 'https://store.steampowered.com/feeds/news/app/1172470/';

const unxml = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').trim();
const tag = (xml: string, name: string) => unxml(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`).exec(xml)?.[1] ?? '');

/** A YouTube channel feed's videos, newest first. Shorts and streams come mixed in; they are uploads too. */
export function parseYouTubeFeed(xml: string): Upload[] {
  const channel = tag(xml.split('<entry>')[0] ?? '', 'title');
  return (xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? []).map(e => ({
    videoId: tag(e, 'yt:videoId'), title: tag(e, 'title').slice(0, 200), channel: channel.slice(0, 80), published: tag(e, 'published'),
  })).filter(u => /^[\w-]{6,20}$/.test(u.videoId));
}

/** Steam's news feed (RSS), newest first. */
export function parseSteamFeed(xml: string): News[] {
  return (xml.match(/<item>[\s\S]*?<\/item>/g) ?? []).map(i => ({
    guid: tag(i, 'guid') || tag(i, 'link'), title: tag(i, 'title').slice(0, 200), link: tag(i, 'link'),
    published: tag(i, 'pubDate'), summary: tag(i, 'description').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400),
  })).filter(n => n.guid && /^https:\/\/store\.steampowered\.com\//.test(n.link));
}

/** The channel id for a YouTube channel link or @handle, from the channel's own page. */
export async function channelOf(input: string, fetchText: (u: string) => Promise<string>): Promise<Creator | null> {
  const s = input.trim();
  const direct = /(UC[\w-]{22})/.exec(s)?.[1];
  const handle = /@([\w.-]{2,40})/.exec(s)?.[1];
  const url = direct ? `https://www.youtube.com/channel/${direct}` : handle ? `https://www.youtube.com/@${handle}` : null;
  if (!url) return null;
  const page = await fetchText(url);
  const id = direct ?? /"(?:externalId|channelId)":"(UC[\w-]{22})"/.exec(page)?.[1];
  const name = (/<meta property="og:title" content="([^"]{1,80})"/.exec(page)?.[1] ?? handle ?? 'a creator');
  return id ? { id, name: unxml(name) } : null;
}

interface FeedState { creators: Creator[]; seenVideos: string[]; seenNews: string[]; primed: string[] }

/** What he follows and what he has already been told about. Kept between runs. */
export class Feeds {
  private s: FeedState;
  private readonly file: string;
  constructor(dir: string) {
    this.file = path.join(dir, 'gaming-feeds.json');
    let s: Partial<FeedState> = {};
    try { if (existsSync(this.file)) s = JSON.parse(readFileSync(this.file, 'utf8')); } catch { /* fresh */ }
    this.s = { creators: Array.isArray(s.creators) ? s.creators : [HISWATTSON], seenVideos: s.seenVideos ?? [], seenNews: s.seenNews ?? [], primed: s.primed ?? [] };
  }
  private save() { try { writeFileAtomic(this.file, JSON.stringify(this.s, null, 2)); } catch { /* next time */ } }
  get creators(): Creator[] { return [...this.s.creators]; }
  follow(c: Creator): boolean {
    if (this.s.creators.some(x => x.id === c.id)) return false;
    this.s.creators.push(c); this.save(); return true;
  }
  unfollow(words: string): Creator | null {
    const w = words.toLowerCase().replace(/^@/, '');
    const c = this.s.creators.find(x => x.name.toLowerCase().includes(w) || x.id === words);
    if (!c) return null;
    this.s.creators = this.s.creators.filter(x => x !== c); this.save(); return c;
  }
  /**
   * The uploads he has not heard about. The first look at a creator only remembers what is already there, so
   * following someone never floods him with their back catalogue.
   */
  freshUploads(creator: Creator, uploads: Upload[]): Upload[] {
    const first = !this.s.primed.includes(creator.id);
    const fresh = uploads.filter(u => !this.s.seenVideos.includes(u.videoId));
    this.s.seenVideos = [...this.s.seenVideos, ...fresh.map(u => u.videoId)].slice(-600);
    if (first) this.s.primed.push(creator.id);
    this.save();
    return first ? [] : fresh.slice(0, 3);
  }
  freshNews(items: News[]): News[] {
    const first = !this.s.primed.includes('steam:apex');
    const fresh = items.filter(n => !this.s.seenNews.includes(n.guid));
    this.s.seenNews = [...this.s.seenNews, ...fresh.map(n => n.guid)].slice(-300);
    if (first) this.s.primed.push('steam:apex');
    this.save();
    return first ? [] : fresh.slice(0, 2);
  }
}

/** "What's the ranked map?": apexlegendsapi.com, with his key in a header. */
export async function apexMap(key: string, fetchJson: (u: string, headers: Record<string, string>) => Promise<any>): Promise<string> {
  const j = await fetchJson('https://api.mozambiquehe.re/maprotation?version=2', { Authorization: key });
  const line = (label: string, x: any) => {
    if (!x?.current) return '';
    const left = Number(x.current.remainingSecs);
    const mins = Number.isFinite(left) ? `${Math.floor(left / 3600) ? Math.floor(left / 3600) + 'h ' : ''}${Math.floor((left % 3600) / 60)}m left` : '';
    return `${label}: ${String(x.current.map ?? '?')}${mins ? ` (${mins})` : ''}${x.next?.map ? `, then ${String(x.next.map)}` : ''}`;
  };
  return [line('Ranked', j?.ranked), line('Pubs', j?.battle_royale)].filter(Boolean).join('\n') + '\nData from apexlegendsstatus.com';
}

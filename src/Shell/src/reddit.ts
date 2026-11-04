// The Shrine Reddit feed, Samara's half (sheet R18, approved 2026-11-03; build plan phase 1). Every 30 minutes Samara reads
// his Reddit with his own signed-in session: his front page first, then a trending mix so the feed never runs dry. Each
// post keeps its picture or short video (saved locally, 150 MB at most, oldest out first), its sub's emblem and its top
// two comments, so the widget opens a post instantly and never touches Reddit itself. NSFW is left out, spoilers are
// marked for the widget to blur. The result is reddit-feed.json next to player-now.json, read by ShrineDock's widget.
// Only reads: votes go out only when he clicks one (phase 2/4). Nothing here is ever committed: it all lives in %APPDATA%.
// Gentle by design (reports/Reddit feed safe reading.md, 2026-11-03): signed-out reading is blocked everywhere since
// October and RSS ends on 13 Nov 2026, so his signed-in session is the only door, and it is kept quiet: the whole read
// stops at Reddit's first no and leaves Reddit alone for an hour; at most 60 asks a read and 1,500 a day, 1.2 to 2 s apart;
// comments only for posts that are new or suddenly busy (prawcore's and RSS-Bridge's rules).
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, utimesSync, watch, writeFileSync, type FSWatcher } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { saveJson } from './store.ts';
import { fade, freshTaste, headStart, learn, mix, readTaste, type Ask, type Mixed, type Taste } from './reddittaste.ts';

const WWW = 'https://www.reddit.com';
/** The trending mix (his pick: news, science, movies, tech, AI, music), so the feed is never only his own subs. */
export const TRENDING = ['news', 'science', 'movies', 'technology', 'artificial', 'Music'];
/** Breath of the Wild is his first run (2026-11-02): posts in these subs that talk about late-game things are spoilers. */
const BOTW_SUBS = new Set(['breath_of_the_wild', 'zelda', 'botw', 'tearsofthekingdom', 'truezelda']);
const BOTW_SPOILER = /spoil|ending|final boss|calamity ganon|dark beast|master sword|divine beast|hylian shield|champion'?s ballad|memor(y|ies)\b|\bdlc\b/i;
export const CACHE_CAP = 150 * 1024 * 1024;
const IMAGE_MAX = 4 * 1024 * 1024, VIDEO_MAX = 20 * 1024 * 1024;
const DAY_MS = 86_400_000, KEEP_POSTS = 60, WITH_COMMENTS = 40, ICON_FRESH_MS = 7 * 86_400_000;
export const READ_CAP = 60, DAY_CAP = 1500, REST_MS = 3_600_000;

/** Reddit said no (blocked, too many asks, signed out): the whole read stops and Reddit is left alone for an hour. */
export class Refused extends Error {}
/** This read's or today's share of asks is used up: what was read so far is kept. */
export class OutOfAsks extends Error {}
/** A failure that may be swallowed (a missing comment, an icon) is fine; a refusal never is. */
const soft = (e: unknown): void => { if (e instanceof Refused) throw e; };

export interface Reply { ok: boolean; status: number; json(): Promise<unknown>; arrayBuffer(): Promise<ArrayBuffer>; headers: { get(n: string): string | null } }
export type Fetch = (url: string, init?: { signal?: AbortSignal; credentials?: 'omit' | 'include'; method?: string; body?: string; headers?: Record<string, string> }) => Promise<Reply>;

export interface FeedComment { author: string; body: string; score: number }
export interface FeedPost {
  id: string; sub: string; title: string; author: string; created: number; score: number; comments: number;
  link: string;              // the post on Reddit (what "Open in Samara" opens)
  url: string | null;        // where a link post points
  kind: 'text' | 'image' | 'gallery' | 'video' | 'link';
  body: string;              // a text post's words, trimmed
  image: string | null;      // file name in the cache: the picture, or a video's still
  video: string | null;      // file name in the cache: a short silent mp4
  w: number | null; h: number | null;
  spoiler: boolean;
  source: 'yours' | 'trending' | 'discovery';
  vote: 1 | 0 | -1;          // his vote on Reddit
  top: FeedComment[];
  topAt: number;             // when the comments were read
}
export interface Feed { v: 1; at: number; pid: number; signedIn: boolean; user: string | null; cacheDir: string; icons: Record<string, string | null>; posts: Mixed[] }
export interface Prefs { blockSubs: string[]; blockWords: string[]; dial: number; picks: string[] }

type Obj = Record<string, unknown>;
const obj = (x: unknown): Obj => (x && typeof x === 'object' ? x as Obj : {});
const str = (x: unknown): string => (typeof x === 'string' ? x : '');
const num = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? x : 0);

/** The posts in a listing reply ({ data: { children: [{ kind: 't3', data }] } }). */
export function listing(json: unknown): Obj[] {
  const kids = obj(obj(json).data).children;
  return Array.isArray(kids) ? kids.map(obj).filter((k) => k.kind === 't3').map((k) => obj(k.data)) : [];
}

/** A Reddit picture link, readable: listings with raw_json=1 already have no &amp;, older replies might. */
const clean = (u: unknown): string | null => { const s = str(u).replace(/&amp;/g, '&'); return /^https:\/\//.test(s) ? s : null; };

/** The picture (about 640 wide, never the full original) or the silent video a post shows. */
export function media(d: Obj): { kind: FeedPost['kind']; image: string | null; video: string | null; w: number | null; h: number | null } {
  const rv = obj(obj(d.secure_media).reddit_video), pv = obj(obj(d.preview).reddit_video_preview);
  const imgs = obj(d.preview).images, first = Array.isArray(imgs) ? obj(imgs[0]) : {};
  const sized = (src: Obj, res: unknown) => {
    const all = [...(Array.isArray(res) ? res.map(obj) : []), src].filter((r) => clean(r.url));
    const pick = all.find((r) => num(r.width) >= 600) ?? all[all.length - 1];
    return pick ? { image: clean(pick.url), w: num(pick.width) || null, h: num(pick.height) || null } : { image: null, w: null, h: null };
  };
  const still = sized(obj(first.source), first.resolutions);
  const video = clean(rv.fallback_url) ?? clean(pv.fallback_url);
  if (video) return { kind: 'video', video, ...still, w: num(rv.width) || still.w, h: num(rv.height) || still.h };
  if (d.is_gallery === true) {
    const order = Array.isArray(obj(d.gallery_data).items) ? (obj(d.gallery_data).items as unknown[]).map((i) => str(obj(i).media_id)) : [];
    const m = obj(obj(d.media_metadata)[order[0] ?? '']);
    const std = (x: unknown) => { const r = obj(x); return { url: r.u ?? r.gif, width: r.x, height: r.y }; };   // a gallery says u, x, y
    const g = sized(std(m.s), Array.isArray(m.p) ? m.p.map(std) : []);
    if (g.image) return { kind: 'gallery', video: null, ...g };
  }
  if (d.is_self === true) return { kind: 'text', video: null, ...still };
  if (still.image && (d.post_hint === 'image' || /i\.redd\.it|i\.imgur\.com/.test(str(d.url)))) return { kind: 'image', video: null, ...still };
  return { kind: 'link', video: null, ...still };
}

/** One post as the widget needs it; null for what never shows (NSFW, pinned, removed, blocked by him). */
export function toPost(d: Obj, source: FeedPost['source'], prefs: Prefs): FeedPost | null {
  const id = str(d.id), sub = str(d.subreddit), title = str(d.title).trim();
  if (!id || !sub || !title) return null;
  if (d.over_18 === true || d.stickied === true || d.promoted === true || d.removed_by_category || d.quarantine === true) return null;
  if (str(d.author) === '[deleted]' || /^\[(removed|deleted)\]$/.test(str(d.selftext).trim())) return null;   // gone from Reddit: gone from the feed
  const low = sub.toLowerCase();
  if (prefs.blockSubs.some((b) => b.toLowerCase().replace(/^r\//, '') === low)) return null;
  const text = `${title}\n${str(d.selftext)}`.toLowerCase();
  if (prefs.blockWords.some((w) => w.trim() && text.includes(w.trim().toLowerCase()))) return null;
  const m = media(d);
  return {
    id, sub, title, author: str(d.author), created: num(d.created_utc) * 1000, score: num(d.score), comments: num(d.num_comments),
    link: WWW + str(d.permalink), url: d.is_self === true ? null : clean(d.url), kind: m.kind,
    body: d.is_self === true ? str(d.selftext).trim().slice(0, 1500) : '',
    image: m.image, video: m.video, w: m.w, h: m.h,
    spoiler: d.spoiler === true || (BOTW_SUBS.has(low) && BOTW_SPOILER.test(title)),
    source, vote: d.likes === true ? 1 : d.likes === false ? -1 : 0, top: [], topAt: 0,
  };
}

/** The top two comments from a post's reply ([post listing, comment listing]): no bots, no removed, no pinned notes. */
export function topComments(json: unknown, n = 2): FeedComment[] {
  const kids = Array.isArray(json) ? obj(obj(json[1]).data).children : null;
  if (!Array.isArray(kids)) return [];
  return kids.map(obj).filter((k) => k.kind === 't1').map((k) => obj(k.data))
    .filter((c) => !c.stickied && !c.distinguished && str(c.author) && !/^(\[deleted\]|automoderator)$/i.test(str(c.author)) && !/^\[(removed|deleted)\]$/.test(str(c.body).trim()))
    .slice(0, n).map((c) => ({ author: str(c.author), body: str(c.body).trim().slice(0, 600), score: num(c.score) }));
}

/** His front page first, trending after, each post once. */
export function merge(yours: FeedPost[], trending: FeedPost[], keep = KEEP_POSTS): FeedPost[] {
  const seen = new Set<string>(), out: FeedPost[] = [];
  for (const p of [...yours, ...trending]) if (!seen.has(p.id)) { seen.add(p.id); out.push(p); }
  return out.slice(0, keep);
}

/** The cache's file name for a remote picture or video: the same link always lands on the same file. */
export const cacheName = (url: string, ext: string): string => createHash('sha1').update(url).digest('hex').slice(0, 20) + ext;
const extOf = (url: string, kind: 'image' | 'video'): string => kind === 'video' ? '.mp4' : (/\.(png|gif|webp|jpe?g)(\?|$)/i.exec(new URL(url).pathname + '?')?.[0].replace('?', '').toLowerCase() ?? '.jpg');

/** Oldest files out until the cache is under its cap; files the feed still shows are never removed. */
export function prune(dir: string, cap: number, keep: Set<string>): number {
  let files: { f: string; size: number; at: number }[] = [];
  try { files = readdirSync(dir).map((f) => { const s = statSync(path.join(dir, f)); return { f, size: s.size, at: s.mtimeMs }; }); } catch { return 0; }
  let total = files.reduce((a, x) => a + x.size, 0), gone = 0;
  for (const x of files.sort((a, b) => a.at - b.at)) {
    if (total <= cap) break;
    if (keep.has(x.f)) continue;
    try { unlinkSync(path.join(dir, x.f)); total -= x.size; gone++; } catch { /* in use: next time */ }
  }
  return gone;
}

export function readPrefs(file: string): Prefs {
  try {
    const p = obj(JSON.parse(readFileSync(file, 'utf8')));
    const list = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string').slice(0, 500) : []);
    const subName = (x: string) => x.trim().replace(/^\/?r\//i, '');
    return { blockSubs: list(p.blockSubs), blockWords: list(p.blockWords), dial: typeof p.dial === 'number' && Number.isFinite(p.dial) ? Math.min(1, Math.max(0, p.dial)) : 0.5,
      picks: list(p.picks).map(subName).filter((x) => /^[A-Za-z0-9_]{2,21}$/.test(x)).slice(0, 20) };
  } catch { return { blockSubs: [], blockWords: [], dial: 0.5, picks: [] }; }
}

export interface RedditOpts {
  /** Reads Reddit as him (Samara's own signed-in session). */
  reddit: Fetch;
  /** Fetches pictures and videos, without his cookies. */
  plain: Fetch;
  /** %APPDATA%\Aang: the feed, the prefs and the cache live here. */
  dir: string;
  log: (s: string) => void;
  /** The pause between two asks to Reddit (ms), with up to 0.8 s more at random, so a read is a light trickle, never a burst. */
  gap?: number;
  now?: () => number;
}

export class RedditFeed {
  private running = false;
  readonly feedFile: string; readonly prefsFile: string; readonly cacheDir: string; private readonly iconsFile: string; private readonly tasteFile: string; private readonly stateFile: string;
  private readonly o: RedditOpts;
  constructor(o: RedditOpts) {
    this.o = o;
    this.feedFile = path.join(o.dir, 'reddit-feed.json');
    this.prefsFile = path.join(o.dir, 'reddit-prefs.json');
    this.cacheDir = path.join(o.dir, 'reddit-cache');
    this.iconsFile = path.join(this.cacheDir, 'icons.json');
    this.tasteFile = path.join(o.dir, 'reddit-taste.json');
    this.stateFile = path.join(o.dir, 'reddit-state.json');
  }
  private now(): number { return this.o.now?.() ?? Date.now(); }
  private async rest(): Promise<void> { const g = this.o.gap ?? 1200; if (g > 0) await new Promise((r) => setTimeout(r, g + Math.random() * 800)); }

  // ---- how much he has asked of Reddit: this read, today, and whether Reddit asked to be left alone
  private asked = 0;
  private state(): { restUntil: number; day: string; asked: number } {
    try { const x = obj(JSON.parse(readFileSync(this.stateFile, 'utf8'))); return { restUntil: num(x.restUntil), day: str(x.day), asked: num(x.asked) }; }
    catch { return { restUntil: 0, day: '', asked: 0 }; }
  }
  private today(): string { return new Date(this.now()).toISOString().slice(0, 10); }

  private async ask(url: string): Promise<unknown> {
    const st = this.state(), day = this.today(), today = st.day === day ? st.asked : 0;
    if (this.asked >= READ_CAP || today >= DAY_CAP) throw new OutOfAsks(this.asked >= READ_CAP ? 'this read has had its 60 asks' : "today's 1,500 asks are used");
    await this.rest();
    this.asked++;
    saveJson(this.stateFile, { ...st, day, asked: today + 1 });
    const r = await this.o.reddit(url, { signal: AbortSignal.timeout(15_000) });
    if (r.status === 401 || r.status === 403 || r.status === 429) throw new Refused(`Reddit said no (${r.status}) to ${url.replace(WWW, '').split('?')[0]}`);
    if (!r.ok) throw new Error(`reddit ${r.status} for ${url.replace(WWW, '').split('?')[0]}`);
    return r.json();
  }

  /** One full read. Returns the feed written, or null when Reddit could not be read (the last feed then stays). */
  async run(): Promise<Feed | null> {
    if (this.running) return null;
    const rest = this.state().restUntil;
    if (rest > this.now()) { this.o.log(`reddit: leaving Reddit alone until ${new Date(rest).toLocaleTimeString()}`); return null; }
    this.running = true; this.asked = 0;
    try { return await this.read(); }
    catch (e) {
      if (e instanceof Refused) {   // never ask again straight away: an hour's rest, then the next read tries once
        saveJson(this.stateFile, { ...this.state(), restUntil: this.now() + REST_MS });
        this.o.log(`reddit: ${e.message}; the last feed stays and Reddit is left alone for an hour`);
      } else this.o.log(`reddit: read failed, the last feed stays: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
    finally { this.running = false; }
  }

  private async read(): Promise<Feed> {
    const started = this.now(), prefs = readPrefs(this.prefsFile), taste = this.taste();
    fade(taste, started);
    const me = obj(await this.ask(`${WWW}/api/me.json?raw_json=1`));
    const user = str(me.name) || str(obj(me.data).name) || null;
    if (!user) throw new Refused('Samara is not signed in to Reddit');
    this.modhash = str(obj(me.data).modhash) || str(me.modhash) || null;
    const posts = (xs: Obj[], source: FeedPost['source']) => xs.map((d) => toPost(d, source, prefs)).filter((p): p is FeedPost => !!p);

    // his subs (once a day) and his own upvotes and saves (a head start, once a day)
    let mine: Obj[] = [];
    if (started - taste.subscribedAt > DAY_MS) {
      try {
        mine = listingAny(await this.ask(`${WWW}/subreddits/mine/subscriber.json?raw_json=1&limit=100`));
        taste.subscribed = mine.map((d) => str(d.display_name)).filter(Boolean); taste.subscribedAt = started;
      } catch (e) { soft(e); /* yesterday's list stays */ }
    }
    if (started - taste.headStartAt > DAY_MS) {
      const subsOf = async (what: string) => {
        try { return listing(await this.ask(`${WWW}/user/${encodeURIComponent(user)}/${what}.json?raw_json=1&limit=100`)).map((d) => str(d.subreddit)).filter(Boolean); }
        catch (e) { soft(e); return null; }
      };
      const up = await subsOf('upvoted'), saved = await subsOf('saved');
      if (up && saved) headStart(taste, up, saved, started);
    }

    // his picks (the Feed tab: subs he wants now, joined or not, like WoW: Forever at launch) count as his own
    const picks = prefs.picks.length ? posts(listing(await this.ask(`${WWW}/r/${prefs.picks.join('+')}/hot.json?raw_json=1&limit=25`)), 'yours') : [];
    const yours = [...posts(listing(await this.ask(`${WWW}/.json?raw_json=1&limit=60`)), 'yours'), ...picks];
    const trending = posts(listing(await this.ask(`${WWW}/r/${TRENDING.join('+')}/hot.json?raw_json=1&limit=40`)), 'trending');
    let discovery: FeedPost[] = [];
    try { discovery = posts(listing(await this.ask(`${WWW}/r/popular.json?raw_json=1&limit=60`)), 'discovery'); } catch (e) { soft(e); }
    const mixed = mix({ yours, trending, discovery }, { ...taste, subscribed: [...taste.subscribed, ...prefs.picks] }, prefs.dial, started, KEEP_POSTS);

    // comments only for posts that are new to the feed, or suddenly busy (half as many again, and 20 more): the rest keep theirs
    const last = new Map((this.last()?.posts ?? []).map((p) => [p.id, p]));
    let asked = 0;
    for (const p of mixed) {
      const was = last.get(p.id);
      const busy = was ? p.comments >= Math.max(was.comments * 1.5, was.comments + 20) : true;
      if (was && !busy) { p.top = was.top; p.topAt = was.topAt; continue; }
      if (p.comments === 0 || asked >= WITH_COMMENTS) { if (was) { p.top = was.top; p.topAt = was.topAt; } continue; }
      asked++;
      try { p.top = topComments(await this.ask(`${WWW}/comments/${p.id}.json?raw_json=1&limit=6&depth=1&sort=top`)); p.topAt = this.now(); }
      catch (e) { soft(e); if (e instanceof OutOfAsks) break; if (was) { p.top = was.top; p.topAt = was.topAt; } }
    }

    mkdirSync(this.cacheDir, { recursive: true });
    for (const p of mixed) {
      if (p.image) p.image = await this.save(p.image, 'image');
      if (p.video) p.video = await this.save(p.video, 'video');
    }
    const icons = await this.icons(mixed.map((p) => p.sub), mine);
    const feed: Feed = { v: 1, at: this.now(), pid: process.pid, signedIn: true, user, cacheDir: this.cacheDir, icons, posts: mixed };
    saveJson(this.feedFile, feed);
    this.saveTaste(taste);
    const keep = new Set([...mixed.flatMap((p) => [p.image, p.video]), ...Object.values(icons), 'icons.json'].filter((x): x is string => !!x));
    const gone = prune(this.cacheDir, CACHE_CAP, keep);
    const n = (k: Mixed['pick']) => mixed.filter((p) => p.pick === k).length;
    this.o.log(`reddit: ${mixed.length} posts (${n('yours')} yours, ${n('trending')} trending, ${n('discovery')} new) in ${this.asked} asks, ${Math.round((this.now() - started) / 1000)} s${gone ? `, ${gone} old files out` : ''}`);
    return feed;
  }

  // ---- what he likes: one small file on his PC (reddittaste.ts)
  private modhash: string | null = null;
  private tasteNow: Taste | null = null;
  private taste(): Taste {
    if (!this.tasteNow) { try { this.tasteNow = readTaste(JSON.parse(readFileSync(this.tasteFile, 'utf8'))); } catch { this.tasteNow = freshTaste(); } }
    return this.tasteNow;
  }
  private saveTaste(t: Taste): void { this.tasteNow = t; saveJson(this.tasteFile, t); }

  /**
   * What he did in the widget (reddit-ask.json, written by ShrineDock): it teaches the taste file, and a hidden sub or a
   * vote shows in the feed at once. A vote goes to Reddit only here, and only because he clicked it.
   */
  async hear(asks: Ask[]): Promise<void> {
    const t = this.taste(), feed = this.last();
    let changed = false;
    for (const a of asks) {
      learn(t, a);
      if (!feed) continue;
      if (a.t === 'hide') { const k = a.sub.toLowerCase(), n = feed.posts.length; feed.posts = feed.posts.filter((p) => p.sub.toLowerCase() !== k); changed ||= feed.posts.length !== n; }
      if (a.t === 'vote') {
        const p = feed.posts.find((x) => x.id === a.id);
        if (!p || !(await this.vote(a.id, a.dir))) continue;
        p.score += a.dir - p.vote; p.vote = a.dir; changed = true;
      }
    }
    this.saveTaste(t);
    if (changed && feed) saveJson(this.feedFile, feed);
  }

  private async vote(id: string, dir: 1 | 0 | -1): Promise<boolean> {
    if (!/^[a-z0-9]+$/.test(id) || ![1, 0, -1].includes(dir)) return false;
    if (!this.modhash) { const me = obj(await this.ask(`${WWW}/api/me.json?raw_json=1`).catch(() => null)); this.modhash = str(obj(me.data).modhash) || null; }   // one vote, one try: a failed vote is never sent again by itself
    if (!this.modhash) { this.o.log('reddit: a vote could not go: not signed in'); return false; }
    try {
      const r = await this.o.reddit(`${WWW}/api/vote`, { method: 'POST', body: new URLSearchParams({ id: 't3_' + id, dir: String(dir), rank: '1' }).toString(),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Modhash': this.modhash }, signal: AbortSignal.timeout(15_000) });
      if (!r.ok) this.o.log(`reddit: a vote was refused (${r.status})`);
      return r.ok;
    } catch (e) { this.o.log(`reddit: a vote could not go: ${e instanceof Error ? e.message : String(e)}`); return false; }
  }

  /** Listens for the widget's asks: read once, removed, heard (the player-ask.json way). */
  listen(): () => void {
    let w: FSWatcher | null = null;
    const file = path.join(this.o.dir, 'reddit-ask.json');
    const take = () => {
      let raw: unknown;
      try { raw = JSON.parse(readFileSync(file, 'utf8')); unlinkSync(file); } catch { return; }   // half-written: the next change reads it
      const list = Array.isArray(raw) ? raw : Array.isArray(obj(raw).asks) ? obj(raw).asks as unknown[] : [];
      void this.hear(list.filter(isAsk)).catch((e) => this.o.log('reddit: asks: ' + String(e)));
    };
    try { w = watch(this.o.dir, (_e, name) => { if (name === 'reddit-ask.json') take(); }); w.on('error', () => { w?.close(); w = null; }); } catch { w = null; }
    take();
    return () => w?.close();
  }

  last(): Feed | null {
    try { const f = JSON.parse(readFileSync(this.feedFile, 'utf8')) as Feed; return f?.v === 1 && Array.isArray(f.posts) ? f : null; } catch { return null; }
  }

  /** A picture or video into the cache; its file name, or null when it is too big or will not come. */
  private async save(url: string, kind: 'image' | 'video'): Promise<string | null> {
    let name: string;
    try { name = cacheName(url, extOf(url, kind)); } catch { return null; }
    const file = path.join(this.cacheDir, name);
    if (existsSync(file)) { try { const t = new Date(); utimesSync(file, t, t); } catch { /* fine */ } return name; }   // still shown: newest again, so pruning spares it
    const max = kind === 'video' ? VIDEO_MAX : IMAGE_MAX;
    try {
      const r = await this.o.plain(url, { signal: AbortSignal.timeout(30_000), credentials: 'omit' });
      if (!r.ok || num(Number(r.headers.get('content-length'))) > max) return null;
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length === 0 || buf.length > max) return null;
      writeFileSync(file + '.part', buf); renameSync(file + '.part', file);
      return name;
    } catch { return null; }
  }

  /** Each sub's emblem, read once a week: his own subs come in one ask, the rest one by one. */
  private async icons(subs: string[], mine: Obj[]): Promise<Record<string, string | null>> {
    let known: Record<string, { file: string | null; at: number }> = {};
    try { known = JSON.parse(readFileSync(this.iconsFile, 'utf8')); } catch { /* first time */ }
    const fresh = (s: string) => known[s.toLowerCase()] && this.now() - known[s.toLowerCase()]!.at < ICON_FRESH_MS;
    const want = [...new Set(subs)];
    const urlOf = (d: Obj) => clean(d.community_icon) ?? clean(d.icon_img);
    for (const d of mine) {   // his own subs came with today's list: no ask each
      const s = str(d.display_name).toLowerCase(), u = urlOf(d);
      if (s && !fresh(s) && want.some((x) => x.toLowerCase() === s)) known[s] = { file: u ? await this.save(u, 'image') : null, at: this.now() };
    }
    for (const s of want) {
      if (fresh(s)) continue;
      try { const u = urlOf(obj(obj(await this.ask(`${WWW}/r/${s}/about.json?raw_json=1`)).data)); known[s.toLowerCase()] = { file: u ? await this.save(u, 'image') : null, at: this.now() }; }
      catch (e) {
        if (e instanceof Refused) { saveJson(this.iconsFile, known); throw e; }
        if (e instanceof OutOfAsks) break;   // the rest next read
        known[s.toLowerCase()] = { file: null, at: this.now() - ICON_FRESH_MS + 86_400_000 };   // try again tomorrow
      }
    }
    saveJson(this.iconsFile, known);
    return Object.fromEntries(want.map((s) => [s, known[s.toLowerCase()]?.file ?? null]));
  }
}

/** Any listing's children (t5 subs as well as t3 posts). */
function listingAny(json: unknown): Obj[] {
  const kids = obj(obj(json).data).children;
  return Array.isArray(kids) ? kids.map((k) => obj(obj(k).data)) : [];
}

const isAsk = (x: unknown): x is Ask => {
  const a = obj(x), t = a.t;
  if (t === 'vote') return typeof a.id === 'string' && (a.dir === 1 || a.dir === 0 || a.dir === -1);
  if (t === 'open' || t === 'read') return typeof a.id === 'string' && typeof a.sub === 'string' && (t === 'open' || typeof a.ms === 'number');
  return (t === 'more' || t === 'less' || t === 'hide' || t === 'unhide') && typeof a.sub === 'string' && /^[A-Za-z0-9_]{2,21}$/.test(a.sub);
};

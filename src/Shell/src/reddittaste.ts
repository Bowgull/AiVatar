// What he likes on Reddit, learned (Shrine Reddit feed, build plan phase 2). One small file on his PC, never committed:
// a weight per sub, grown by what he opens and how long he reads, by More / Less like this, by his own Reddit upvotes and
// saves (a head start on day one), and faded a little every day so old habits give way. Hide sub takes a sub out.
// The mix: in every 10 posts about 6 from his subs, 3 trending and 1 discovery (the dial in the Feed tab moves that),
// posts compared within their own sub so a small sub's best is not drowned by a big sub's average, no sub twice within
// five, and nothing he has already opened.
import type { FeedPost } from './reddit.ts';

export interface SubTaste { w: number; opened: number; readMs: number; more: number; less: number; up: number; saved: number }
export interface Taste {
  v: 1;
  subs: Record<string, SubTaste>;   // by lower-case name
  subscribed: string[];             // his subs, as Reddit says (read once a day)
  hidden: string[];                 // Hide sub (lower case)
  opened: string[];                 // post ids he has opened, newest last: they leave the feed
  headStartAt: number; subscribedAt: number; fadedAt: number;
}
export type Ask =
  | { t: 'open'; id: string; sub: string }
  | { t: 'read'; id: string; sub: string; ms: number }
  | { t: 'more' | 'less'; id?: string; sub: string }
  | { t: 'hide' | 'unhide'; sub: string }
  | { t: 'vote'; id: string; dir: 1 | 0 | -1 };

export const freshTaste = (): Taste => ({ v: 1, subs: {}, subscribed: [], hidden: [], opened: [], headStartAt: 0, subscribedAt: 0, fadedAt: 0 });
const DAY = 86_400_000, FADE = 0.97, KEEP_OPENED = 1000;
const blank = (): SubTaste => ({ w: 0, opened: 0, readMs: 0, more: 0, less: 0, up: 0, saved: 0 });
const of = (t: Taste, sub: string): SubTaste => (t.subs[sub.toLowerCase()] ??= blank());

/** Reads a taste file's contents safely: anything odd starts fresh rather than breaking the feed. */
export function readTaste(raw: unknown): Taste {
  const t = raw && typeof raw === 'object' ? raw as Partial<Taste> : {};
  if (t.v !== 1) return freshTaste();
  const list = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : []);
  const subs: Record<string, SubTaste> = {};
  for (const [k, v] of Object.entries(t.subs && typeof t.subs === 'object' ? t.subs : {})) {
    const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
    const s = v as Partial<SubTaste>;
    subs[k.toLowerCase()] = { w: n(s.w), opened: n(s.opened), readMs: n(s.readMs), more: n(s.more), less: n(s.less), up: n(s.up), saved: n(s.saved) };
  }
  const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
  return { v: 1, subs, subscribed: list(t.subscribed), hidden: list(t.hidden), opened: list(t.opened).slice(-KEEP_OPENED),
    headStartAt: num(t.headStartAt), subscribedAt: num(t.subscribedAt), fadedAt: num(t.fadedAt) };
}

/** One thing he did in the widget. Votes are Reddit's business (reddit.ts sends them), but an upvote also teaches. */
export function learn(t: Taste, a: Ask): void {
  switch (a.t) {
    case 'open': { const s = of(t, a.sub); s.opened++; s.w += 1; if (!t.opened.includes(a.id)) t.opened = [...t.opened, a.id].slice(-KEEP_OPENED); break; }
    // reading time counts up to three minutes a post: half a point a minute, so a long read beats a glance
    case 'read': { const ms = Math.max(0, Math.min(a.ms, 180_000)); const s = of(t, a.sub); s.readMs += ms; s.w += ms / 120_000; break; }
    case 'more': { const s = of(t, a.sub); s.more++; s.w += 3; break; }
    case 'less': { const s = of(t, a.sub); s.less++; s.w -= 3; break; }
    case 'hide': { const k = a.sub.toLowerCase(); if (!t.hidden.includes(k)) t.hidden = [...t.hidden, k]; break; }
    case 'unhide': t.hidden = t.hidden.filter((h) => h !== a.sub.toLowerCase()); break;
    case 'vote': break;
  }
}

/** His own Reddit history as a head start: subs he upvotes and saves in, even ones he never joined. */
export function headStart(t: Taste, upvoted: string[], saved: string[], now: number): void {
  const count = (xs: string[]) => xs.reduce((m, s) => m.set(s.toLowerCase(), (m.get(s.toLowerCase()) ?? 0) + 1), new Map<string, number>());
  for (const [k, n] of count(upvoted)) { const s = of(t, k); const add = n - s.up; if (add > 0) { s.up = n; s.w += add * 0.4; } }
  for (const [k, n] of count(saved)) { const s = of(t, k); const add = n - s.saved; if (add > 0) { s.saved = n; s.w += add * 0.7; } }
  t.headStartAt = now;
}

/** A little fading each day, so last month's habit gives way to this week's. */
export function fade(t: Taste, now: number): void {
  if (!t.fadedAt) { t.fadedAt = now; return; }
  const days = Math.floor((now - t.fadedAt) / DAY);
  if (days < 1) return;
  const k = FADE ** days;
  for (const s of Object.values(t.subs)) s.w *= k;
  t.fadedAt += days * DAY;
}

/** How much he likes a sub: joined counts for a base, learned weight on top. */
export function liking(t: Taste, sub: string): number {
  const k = sub.toLowerCase();
  return (t.subscribed.some((s) => s.toLowerCase() === k) ? 1 : 0) + (t.subs[k]?.w ?? 0);
}

/**
 * How good a post is next to the others from its own sub in this read (its score against the sub's middle score, on a
 * log scale), cooled by age: half as hot after about 12 hours.
 */
export function heat(posts: FeedPost[], now: number): Map<string, number> {
  const bySub = new Map<string, number[]>();
  for (const p of posts) bySub.set(p.sub.toLowerCase(), [...(bySub.get(p.sub.toLowerCase()) ?? []), p.score]);
  const mid = new Map([...bySub].map(([k, xs]) => { const s = [...xs].sort((a, b) => a - b); return [k, s[Math.floor(s.length / 2)]!]; }));
  return new Map(posts.map((p) => {
    const rel = Math.log((Math.max(0, p.score) + 1) / (Math.max(0, mid.get(p.sub.toLowerCase())!) + 1));
    const hours = Math.max(0, (now - p.created) / 3_600_000);
    return [p.id, (1 + rel) / (1 + hours / 12)];
  }));
}

/** In every 10: his subs, trending, discovery. The dial (0 favourites ... 1 new things) moves the split; 0.5 is 6/3/1. */
export function split(dial: number): { yours: number; trending: number; discovery: number } {
  const d = Math.min(1, Math.max(0, Number.isFinite(dial) ? dial : 0.5));
  const discovery = Math.round(d * d * 3);   // 0 at favourites, 1 in the middle, 3 at new things
  const trending = Math.round(2 + d * 2);
  return { yours: 10 - trending - discovery, trending, discovery };
}

export interface Pools { yours: FeedPost[]; trending: FeedPost[]; discovery: FeedPost[] }
export interface Mixed extends FeedPost { pick: 'yours' | 'trending' | 'discovery'; why: string | null }

/** Why a discovery post is there, in his words: the amber line under it. */
export function whyFor(t: Taste, sub: string): string {
  const s = t.subs[sub.toLowerCase()];
  if (s?.more) return `You asked for more like r/${sub}`;
  if (s?.saved) return `You save posts from r/${sub}`;
  if (s?.up) return `You upvote posts in r/${sub}`;
  if (s?.opened) return `You've been opening posts from r/${sub}`;
  return `Popular today in r/${sub}`;
}

export function mix(p: Pools, t: Taste, dial: number, now: number, keep = 60): Mixed[] {
  const hidden = new Set(t.hidden), opened = new Set(t.opened), seen = new Set<string>();
  const ok = (x: FeedPost) => !hidden.has(x.sub.toLowerCase()) && !opened.has(x.id) && !seen.has(x.id);
  const h = heat([...p.yours, ...p.trending, ...p.discovery], now);
  // his subs: liking matters most; trending: mostly the post's own heat; discovery: subs he leans to, never ones he joined
  const joined = new Set(t.subscribed.map((s) => s.toLowerCase()));
  const rank = (xs: FeedPost[], w: number) => xs.map((x) => ({ x, v: (h.get(x.id) ?? 0) * (1 + w * Math.max(-0.9, Math.tanh(liking(t, x.sub) / 4))) }))
    .sort((a, b) => b.v - a.v).map((r) => r.x);
  const queues = {
    yours: rank(p.yours, 1.5),
    trending: rank(p.trending, 0.5),
    discovery: rank(p.discovery.filter((x) => !joined.has(x.sub.toLowerCase()) && (t.subs[x.sub.toLowerCase()]?.w ?? 0) > -1), 1),
  };
  const s = split(dial);
  // the order of picks inside each 10: discovery lands mid-way, trending spread between his own
  const slots: Mixed['pick'][] = [];
  const taken = { yours: 0, trending: 0, discovery: 0 };
  for (let i = 0; i < 10; i++) {   // each slot to whichever kind is furthest behind its share so far
    const behind = (k: keyof typeof s) => (s[k] * (i + 1)) / 10 - taken[k];
    const k = (['discovery', 'trending', 'yours'] as const).filter((x) => taken[x] < s[x]).sort((a, b) => behind(b) - behind(a))[0] ?? 'yours';
    taken[k]++; slots.push(k);
  }
  const out: Mixed[] = [];
  const recent = () => new Set(out.slice(-4).map((m) => m.sub.toLowerCase()));
  const take = (k: Mixed['pick']): boolean => {
    const q = queues[k], r = recent();
    let i = q.findIndex((x) => ok(x) && !r.has(x.sub.toLowerCase()));
    if (i < 0) i = q.findIndex(ok);   // only one sub left: better twice than an empty slot
    if (i < 0) return false;
    const [x] = q.splice(i, 1);
    seen.add(x!.id);
    out.push({ ...x!, pick: k, why: k === 'discovery' ? whyFor(t, x!.sub) : null });
    return true;
  };
  for (let round = 0; out.length < keep; round++) {
    const before = out.length;
    for (const k of slots) { if (out.length >= keep) break; if (!take(k)) take(k === 'yours' ? 'trending' : 'yours') || take('discovery'); }
    if (out.length === before) break;
  }
  return out;
}

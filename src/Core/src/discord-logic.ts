// The parts of the Discord channel that are decisions rather than plumbing: what the server looks like, who is
// allowed to speak to Aang, when a message is allowed to make his phone buzz, how a long reply is cut up.
// Pure, so every one of them is tested without a token or a network.
//
// Chosen by Joshua on 2026-09-21: Discord, for message persistence and better-looking cards. Aang stays on the
// Shadow PC and only ever connects OUT to Discord, so nothing on Shadow listens for anything.
import { randomInt } from 'node:crypto';

// ------------------------------------------------------------------ the server

export interface ChannelDef {
  /** What Aang's code calls it. Never changes, whatever the channel is named on Discord. */
  key: string;
  /** What it is called on Discord (lower case, dashes; symbols as he picked them). */
  name: string;
  kind: 'text' | 'forum';
  topic: string;
  /** A forum's tags. */
  tags?: string[];
  /** Plain names it had before 2026-10-13, so the old channel is renamed in place and keeps its history. */
  was?: string[];
  /** Messages here may buzz his phone (sheet 15: the green ones). */
  buzz?: boolean;
}
export interface CategoryDef { name: string; channels: ChannelDef[] }

/**
 * 9.D, sheet 15 board 1 (approved 2026-10-13): ten channels grouped by what needs him, with symbols. Only the green
 * ones buzz. Channels that already exist are renamed in place, so nothing he has there is lost.
 */
export const LAYOUT: CategoryDef[] = [
  { name: 'NEEDS YOU', channels: [
    // Colour emoji (his pick, 2026-10-13: Discord has no channel icons, emoji in the name are the nearest thing). Discord
    // strips ASCII "!" and "+" from names (found live the same day), so never use those.
    { key: 'needs-you', name: '❗-needs-you', kind: 'text', topic: 'Everything waiting on you: a question, an approval, a captcha. The one that always buzzes.', was: ['needs-you', '-needs-you'], buzz: true },
    { key: 'drafts', name: '📨-drafts', kind: 'text', topic: 'Email drafts waiting for a yes. Nothing is sent without a button press.', was: ['drafts'], buzz: true },
  ] },
  { name: 'TALK', channels: [
    { key: 'aang', name: '🌀-aang', kind: 'text', topic: 'Talk to Aang.', was: ['aang'], buzz: true },
    { key: 'capture', name: '📥-capture', kind: 'text', topic: 'Drop anything: notes, links, recipes, videos. Aang files it.', was: ['capture', '-capture'] },
  ] },
  { name: 'RUNNING', channels: [
    { key: 'claude-jobs', name: '⚙️-claude-jobs', kind: 'forum', topic: 'One post per Claude job, kept current. Buzzes when one is done.', tags: ['Working', 'Needs you', 'Done'], buzz: true },
    { key: 'jobs', name: '💼-jobs', kind: 'forum', topic: 'Paste job links here. One post per job.', tags: ['Found', 'Applied', 'Skipped'] },
  ] },
  { name: 'KEPT', channels: [
    { key: 'library', name: '📚-library', kind: 'forum', topic: 'Recipes, guides, saved videos, ideas and notes. Filter by tag.', tags: ['Recipe', 'Guide', 'Video', 'Idea', 'Note'] },
    { key: 'lists', name: '📝-lists', kind: 'text', topic: 'The grocery list and other lists.', was: ['lists'] },
  ] },
  { name: 'AT A GLANCE', channels: [
    { key: 'home', name: '🏠-home', kind: 'text', topic: 'The home card, pinned and kept current, and a quiet log of what Aang did.', was: ['log'] },
    { key: 'gaming', name: '🎮-gaming', kind: 'text', topic: 'Apex ranked map, creator uploads, patch notes.' },
  ] },
];

/** 9.D D2: the channels that may buzz his phone (sheet 15: the green ones). Everything else is posted silently. */
export const BUZZ_KEYS: ReadonlySet<string> = new Set(LAYOUT.flatMap(c => c.channels.filter(d => d.buzz).map(d => d.key)));

/** Old channels whose contents move into a new forum, then are deleted once he says yes. */
export const MERGED: Record<string, string> = { 'job-inbox': 'jobs', 'job-digest': 'jobs', applied: 'jobs', recipes: 'library', guides: 'library' };
/** Old categories, deleted with the old channels when they are empty. */
export const OLD_CATEGORIES = ['JOBS', 'MAIL', 'KEEP', 'AANG'];

/** Channels (by key) whose messages are things Joshua says to Aang. */
export const LISTEN_CHANNELS = ['aang', 'capture', 'lists', 'jobs', 'drafts', 'needs-you', 'claude-jobs'] as const;

/** A channel as Discord has it. */
export interface ChannelInfo { id: string; name: string; kind: 'category' | 'text' | 'forum' | 'other'; parentId: string | null; tags?: string[] }

export interface LayoutPlan {
  categories: { name: string; id: string | null }[];
  channels: { def: ChannelDef; category: string; id: string | null; rename: boolean; moveTo: boolean; addTags: string[] }[];
  /** Old channels to copy from and then (with his yes) delete. */
  old: { name: string; id: string; into: string }[];
  oldCategories: { name: string; id: string }[];
}

/**
 * What has to change on Discord to match LAYOUT. Pure. A channel is found by its new name, its key or an old name;
 * it is renamed only from an old plain name, and only once (`renamed`), because Discord may store a symbol
 * differently and a channel can be renamed only twice in ten minutes.
 */
export function planLayout(existing: ChannelInfo[], namedAs: Readonly<Record<string, string>> = {}, known: Readonly<Record<string, string>> = {}): LayoutPlan {
  const cats = existing.filter(c => c.kind === 'category');
  const catByName = (n: string) => cats.find(c => c.name.toLowerCase() === n.toLowerCase()) ?? null;
  const used = new Set<string>();
  const plan: LayoutPlan = { categories: [], channels: [], old: [], oldCategories: [] };
  for (const cat of LAYOUT) {
    const c = catByName(cat.name);
    plan.categories.push({ name: cat.name, id: c?.id ?? null });
    for (const def of cat.channels) {
      const names = [def.name, def.key, ...(def.was ?? [])];
      // The channel Aang already knows comes first: a name Discord changed can never make a second one. Otherwise by
      // name, and when two share a name, the OLDEST (the one with his history in it).
      const byId = known[def.key] ? existing.find(x => x.id === known[def.key] && x.kind !== 'category' && !used.has(x.id)) : undefined;
      const found = byId ?? existing.filter(x => x.kind !== 'category' && !used.has(x.id) && names.includes(x.name))
        .sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1))[0] ?? null;
      if (found) used.add(found.id);
      // Renamed toward a name only ONCE (namedAs remembers it): Discord may store it differently, and a channel can be
      // renamed only twice in ten minutes, so trying again on every start would never end.
      const rename = !!found && found.name !== def.name && namedAs[def.key] !== def.name;
      const moveTo = !!found && (!c || found.parentId !== c.id);
      const have = new Set(found?.tags ?? []);
      plan.channels.push({ def, category: cat.name, id: found?.id ?? null, rename, moveTo, addTags: def.kind === 'forum' && found ? (def.tags ?? []).filter(t => !have.has(t)) : [] });
    }
  }
  for (const x of existing) if (x.kind !== 'category' && !used.has(x.id) && MERGED[x.name]) plan.old.push({ name: x.name, id: x.id, into: MERGED[x.name]! });
  // A second channel carrying one of Aang's own names (the empty copies a stripped symbol made, 2026-10-13): offered
  // for deletion with the old channels, never used, never touched before his yes.
  const ours = new Set(LAYOUT.flatMap(c => c.channels.flatMap(d => [d.name, d.key, ...(d.was ?? [])])));
  for (const x of existing) if (x.kind !== 'category' && !used.has(x.id) && !MERGED[x.name] && ours.has(x.name)) plan.old.push({ name: `${x.name} (an empty copy)`, id: x.id, into: 'none' });
  for (const name of OLD_CATEGORIES) { const c = catByName(name); if (c) plan.oldCategories.push({ name, id: c.id }); }
  return plan;
}

/** The permissions Aang needs, by the names discord.js uses. Anything outside this is reported, not assumed. */
export const NEEDED = ['ViewChannel', 'ManageChannels', 'SendMessages', 'SendMessagesInThreads', 'CreatePublicThreads',
  'EmbedLinks', 'AttachFiles', 'ReadMessageHistory', 'AddReactions', 'ManageWebhooks'] as const;
/** Permissions he must NOT have: anything that destroys or takes over. */
// ManageWebhooks moved to NEEDED for 9.D D4 (2026-10-13, approved sheet 15: Claude and Job Hunt as their own senders).
// Aang only ever uses the webhooks he made himself (discord-client.ts hookFor checks the owner).
export const FORBIDDEN = ['Administrator', 'ManageGuild', 'ManageRoles', 'KickMembers', 'BanMembers', 'MentionEveryone'] as const;

// ------------------------------------------------------------------ who may speak to him

export interface Pairing { code: string; expiresAt: number; attempts: number }
export const PAIR_MINUTES = 10, PAIR_TRIES = 5;

export function newPairing(now = Date.now()): Pairing {
  return { code: String(randomInt(0, 1_000_000)).padStart(6, '0'), expiresAt: now + PAIR_MINUTES * 60_000, attempts: 0 };
}

export type PairResult = 'paired' | 'wrong' | 'expired';
/** A message either contains the code, or it is just a message from somebody. */
export function tryPair(p: Pairing, content: string, now = Date.now()): PairResult {
  if (now > p.expiresAt || p.attempts >= PAIR_TRIES) return 'expired';
  const said = content.trim().replace(/[^0-9]/g, '');
  if (said.length !== 6) return 'wrong';                 // ordinary chatter does not use up a try
  p.attempts++;
  return said === p.code ? 'paired' : 'wrong';
}

// ------------------------------------------------------------------ when a message may buzz his phone

export interface Quiet { fromHour: number; toHour: number; perDay: number }
/** "Balanced": Joshua has not chosen yet. Replies to him, reminders he set, and a job he started are exempt. */
export const BALANCED: Quiet = { fromHour: 22, toHour: 7, perDay: 5 };

export function inQuietHours(q: Quiet, now = new Date()): boolean {
  const h = now.getHours();
  return q.fromHour > q.toHour ? h >= q.fromHour || h < q.toHour : h >= q.fromHour && h < q.toHour;
}

export type Kind = 'reply' | 'reminder' | 'needs' | 'asked' | 'other';
/** What a proactive bubble is, from the Core's own flags and wording. */
export function kindOf(msg: { text: string; proactive?: boolean; asked?: boolean; blocking?: boolean }): Kind {
  if (!msg.proactive) return 'reply';
  if (/^Reminder:/i.test(msg.text)) return 'reminder';
  if (msg.blocking === true || /^Need input/i.test(msg.text)) return 'needs';
  if (msg.asked) return 'asked';
  return 'other';
}

export class Budget {
  private day = '';
  private used = 0;
  private readonly q: Quiet;
  constructor(q: Quiet = BALANCED) { this.q = q; }
  private roll(now: Date) { const d = now.toDateString(); if (d !== this.day) { this.day = d; this.used = 0; } }
  /**
   * Should this one make a sound? Replies, reminders and a Claude session that needs him always do. Things he asked to
   * be told about buzz outside quiet hours (2026-10-28 review R14: a long job finishing at 2 am woke the phone). Anything
   * else buzzes only outside quiet hours and while the day's few are not used up; otherwise it is posted
   * silently, so nothing is lost and nothing wakes him.
   */
  loud(kind: Kind, now = new Date()): boolean {
    this.roll(now);
    if (kind === 'reply' || kind === 'reminder' || kind === 'needs') return true;
    if (kind === 'asked') return !inQuietHours(this.q, now);
    if (inQuietHours(this.q, now) || this.used >= this.q.perDay) return false;
    this.used++;
    return true;
  }
  get count(): number { return this.used; }
  /** Inside his quiet hours now (a finished job's "Done" posts silently then). */
  quiet(now = new Date()): boolean { return inQuietHours(this.q, now); }
}

// ------------------------------------------------------------------ cutting a long reply up

export const MAX = 1900;                                 // Discord allows 2000; leave room
/** Cut at a paragraph, then a line, then a sentence, then a space. Never in the middle of a word if avoidable. */
export function chunkMessage(text: string, max = MAX): string[] {
  const t = (text ?? '').trim();
  if (!t) return [];
  if (t.length <= max) return [t];
  const out: string[] = [];
  let rest = t;
  while (rest.length > max) {
    const slice = rest.slice(0, max);
    const cut = Math.max(slice.lastIndexOf('\n\n'), slice.lastIndexOf('\n'), slice.lastIndexOf('. ') + 1, slice.lastIndexOf(' '));
    const at = cut > max * 0.4 ? cut : max;
    out.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/** Discord channel names: lower-case, dashes, no spaces. */
export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');

/** S2 2.9: wrap every bare link in <>, which Discord never previews. For a message that carries our own card. */
export function noPreview(text: string | undefined): string | undefined {
  if (text == null) return text;
  return text.replace(/(^|[^<])(https?:\/\/[^\s<>]+)/gi, (_m, pre, url) => `${pre}<${url}>`);
}

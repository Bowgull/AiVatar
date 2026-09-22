// The parts of the Discord channel that are decisions rather than plumbing: what the server looks like, who is
// allowed to speak to Aang, when a message is allowed to make his phone buzz, how a long reply is cut up.
// Pure, so every one of them is tested without a token or a network.
//
// Chosen by Joshua on 2026-09-21: Discord, for message persistence and better-looking cards. Aang stays on the
// Shadow PC and only ever connects OUT to Discord, so nothing on Shadow listens for anything.
import { randomInt } from 'node:crypto';

// ------------------------------------------------------------------ the server

export interface ChannelDef {
  /** Discord channel names are lower-case with dashes. */
  name: string;
  kind: 'text' | 'forum';
  topic: string;
}
export interface CategoryDef { name: string; channels: ChannelDef[] }

/**
 * A quiet server: few channels, each with one job. The channel a message lands in is the strongest hint Aang
 * has about what it is. Only what is built is created; the rest of the design is in docs/ROADMAP.md.
 */
export const LAYOUT: CategoryDef[] = [
  { name: 'TALK', channels: [
    { name: 'aang', kind: 'text', topic: 'Ask Aang anything.' },
    { name: 'capture', kind: 'text', topic: 'Paste anything here: recipes, lists, notes, links. Aang files it.' },
  ] },
  { name: 'JOBS', channels: [
    { name: 'job-inbox', kind: 'text', topic: 'Paste job links. Aang vets each one.' },
    { name: 'job-digest', kind: 'text', topic: 'What the job hunt found.' },
    { name: 'applied', kind: 'text', topic: 'One line per application, with its confirmation.' },
    { name: 'needs-you', kind: 'text', topic: 'Only things blocked on Joshua: a captcha, an essay, an approval. Reply to one to answer that Claude job.' },
  ] },
  { name: 'MAIL', channels: [
    { name: 'drafts', kind: 'text', topic: 'Email drafts waiting for a yes. Nothing is sent without a button press.' },
  ] },
  { name: 'KEEP', channels: [
    { name: 'lists', kind: 'text', topic: 'The grocery list and other lists.' },
    { name: 'recipes', kind: 'forum', topic: 'One post per recipe.' },
    { name: 'guides', kind: 'forum', topic: 'Guides and how-tos Aang writes.' },
  ] },
  { name: 'AANG', channels: [
    { name: 'log', kind: 'text', topic: 'A receipt of what Aang did, plus errors and whether Shadow is on.' },
  ] },
];

/** Channels whose messages are things Joshua says to Aang. */
export const LISTEN_CHANNELS = ['aang', 'capture', 'lists', 'job-inbox', 'drafts', 'needs-you'] as const;

/** The permissions Aang needs, by the names discord.js uses. Anything outside this is reported, not assumed. */
export const NEEDED = ['ViewChannel', 'ManageChannels', 'SendMessages', 'SendMessagesInThreads', 'CreatePublicThreads',
  'EmbedLinks', 'AttachFiles', 'ReadMessageHistory', 'AddReactions'] as const;
/** Permissions he must NOT have: anything that destroys or takes over. */
export const FORBIDDEN = ['Administrator', 'ManageGuild', 'ManageRoles', 'KickMembers', 'BanMembers', 'MentionEveryone', 'ManageWebhooks'] as const;

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

export type Kind = 'reply' | 'reminder' | 'asked' | 'other';
/** What a proactive bubble is, from the Core's own flags and wording. */
export function kindOf(msg: { text: string; proactive?: boolean; asked?: boolean }): Kind {
  if (!msg.proactive) return 'reply';
  if (/^Reminder:/i.test(msg.text)) return 'reminder';
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
   * Should this one make a sound? Replies, reminders and things he asked to be told about always do. Anything
   * else buzzes only outside quiet hours and while the day's few are not used up; otherwise it is posted
   * silently, so nothing is lost and nothing wakes him.
   */
  loud(kind: Kind, now = new Date()): boolean {
    this.roll(now);
    if (kind === 'reply' || kind === 'reminder' || kind === 'asked') return true;
    if (inQuietHours(this.q, now) || this.used >= this.q.perDay) return false;
    this.used++;
    return true;
  }
  get count(): number { return this.used; }
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

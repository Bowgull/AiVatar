// Aang's attention engine (2026-10-30, his engines plan: "should I tell him, where, and how").
//
// Before this, five places held notices (the brain, FrontGate, the PC pet, the Mac app, the bubble page), "busy" meant
// a game on the PC but a call, full screen, Focus or the Shadow window on the Mac, and four "ask him" cards each kept
// their own timer. Now the brain decides once and both pets only draw:
//   - Presence: the pets send raw readings (front app, idle, mic, camera, full screen, Focus); ONE rule says busy or
//     not and at the desk or away, for both machines. His pick (2026-10-30): the same list on both machines.
//   - The hold queue: everything held for any reason (hush, mute, busy, Claude in front, nowhere to say it) is one list
//     of whole messages (text, links, cards, session, tier, age). It comes out as one bundle, nothing lost.
//   - Routing: bubble, Discord (buzz or silent), or hold. His pick (2026-10-30): while busy, what he asked to hear
//     about is held too, with a marker on Aang, and comes out with the rest as one bundle when busy ends.
//   - Asks: every card that waits on him (a permission, a plan, a choice, a Claude job card, a fact) has its timer
//     here, and its card is taken down when it runs out.
// The message engine (messages.ts) writes the words; this decides whether, where and when they go.
import type { ToBody } from './protocol.ts';
import { fresh, keep, tierOf, type Tier, type TierBits } from './heldnotes.ts';
import { Budget, kindOf } from './discord-logic.ts';

// ------------------------------------------------------------------ presence

/** What a pet reads off its machine. Names and on/off states only, nothing from inside any app. */
export interface Reading {
  /** The app in front: its process name on the PC, its name on the Mac. */
  front: string;
  /** The Mac's bundle id of the app in front. */
  bundle?: string;
  /** Seconds since the last key or mouse input. */
  idle?: number;
  mic?: boolean;
  cam?: boolean;
  /** The app in front covers a whole screen (a full-screen video, a game, a presentation). */
  full?: boolean;
  /** Focus / Do Not Disturb on. Null when the machine cannot tell: unknown is not on. */
  focus?: boolean | null;
  /** His game list (process name starts), from the PC pet's settings. */
  games?: string[];
  /** The PC tray's "Quiet mode": auto (the rule), always or never. */
  forced?: 'auto' | 'always' | 'never';
}

/** The same five minutes on both machines. */
export const AWAY_AFTER_S = 5 * 60;
/** The PC pet's default game list (Support.cs QuietProcessPrefixes). */
export const DEFAULT_GAMES = ['Wow'];
/** The Shadow PC's stream: when it is in front he is on the PC (FINAL-AANG-BUILD M9). */
const SHADOW = /^com\.electron\.shadow$/i;

export type BusyWhy = '' | 'set' | 'call' | 'shadow' | 'game' | 'full screen' | 'focus';

/** Why he is busy right now, or '' when he is not. One rule for the Mac and the PC (his pick, 2026-10-30). */
export function busyWhy(r: Reading): BusyWhy {
  if (r.forced === 'never') return '';
  if (r.forced === 'always') return 'set';
  if (r.mic || r.cam) return 'call';
  if (SHADOW.test(r.bundle ?? '') || /^shadow( pc)?$/i.test(r.front)) return 'shadow';
  const front = r.front.toLowerCase();
  if ((r.games ?? DEFAULT_GAMES).some(g => g && front.startsWith(g.toLowerCase()))) return 'game';
  if (r.full) return 'full screen';
  if (r.focus === true) return 'focus';
  return '';
}

/**
 * At the machine? Away after AWAY_AFTER_S without input. After "brb" (awayFrom), away until input comes AFTER that
 * moment: idle time shorter than the time since then.
 */
export function atDesk(idle: number, now: number, awayFrom: number | null): boolean {
  // Inside the grace (the click or Enter that said it) he stays away; after it, only new input brings him back.
  if (awayFrom !== null && (now <= awayFrom || idle * 1000 >= now - awayFrom)) return false;
  return idle < AWAY_AFTER_S;
}

const bool = (v: unknown) => v === true;
/** A reading from a pet or the Mac helper, checked before it is used. Null when it is not one. */
export function readingOf(j: unknown): Reading | null {
  if (!j || typeof j !== 'object') return null;
  const o = j as Record<string, unknown>;
  if (typeof o.front !== 'string') return null;
  const r: Reading = { front: o.front.slice(0, 80), mic: bool(o.mic), cam: bool(o.cam), full: bool(o.full), focus: typeof o.focus === 'boolean' ? o.focus : null };
  if (typeof o.bundle === 'string') r.bundle = o.bundle.slice(0, 120);
  if (typeof o.idle === 'number' && Number.isFinite(o.idle) && o.idle >= 0) r.idle = o.idle;
  if (Array.isArray(o.games)) r.games = o.games.filter((g): g is string => typeof g === 'string' && g.length > 0).slice(0, 20).map(g => g.slice(0, 60));
  if (o.forced === 'always' || o.forced === 'never' || o.forced === 'auto') r.forced = o.forced;
  return r;
}

export interface PresenceOut { foreground: string; quiet: boolean; why: BusyWhy; /** the Shadow window is in front: he is on the PC */ shadow: boolean }

/** The one presence rule, fed readings from either machine. Reports busy and desk changes, nothing else. */
export class Presence {
  private awayFrom: number | null = null;
  private last: { fg: string; why: BusyWhy | null; desk: boolean | null } = { fg: '', why: null, desk: null };
  private reading: Reading | null = null;
  private readonly o: { presence: (p: PresenceOut) => void; desk: (active: boolean) => void; log?: (s: string) => void; now?: () => number; first?: () => void };
  constructor(o: Presence['o']) { this.o = o; }

  take(r: Reading): void {
    if (!this.reading) this.o.first?.();
    this.reading = r;
    const now = (this.o.now ?? Date.now)();
    const why = busyWhy(r);
    const was = this.last.why;
    if (why !== was) this.o.log?.(why ? `presence: busy (${why})` : 'presence: not busy');
    if (r.front !== this.last.fg || why !== was) {
      this.last.fg = r.front; this.last.why = why;
      this.o.presence({ foreground: r.front, quiet: why !== '', why, shadow: why === 'shadow' });
    }
    // No idle in it (an older pet): the desk is left to whoever reports it.
    if (r.idle === undefined) return;
    const desk = atDesk(r.idle, now, this.awayFrom);
    if (desk && this.awayFrom !== null && now > this.awayFrom) this.awayFrom = null;   // he is back: brb is over
    if (desk !== this.last.desk) { this.last.desk = desk; this.o.log?.(desk ? 'presence: at the desk' : 'presence: away'); this.o.desk(desk); }
  }

  /** "brb" or the Away key: away now; the first input after a few seconds' grace (the Enter that sent it) brings him back. */
  awaySet(): void {
    this.awayFrom = (this.o.now ?? Date.now)() + 4_000;
    if (this.last.desk !== false) { this.last.desk = false; this.o.log?.('presence: away (he said so)'); this.o.desk(false); }
  }

  /** What it last saw, for "why are you quiet?" and the logs. */
  now(): Reading | null { return this.reading; }
  /** Why he is busy now ('' when not), from the last reading. */
  get why(): BusyWhy { return this.last.why ?? ''; }
}

// ------------------------------------------------------------------ the hold queue

/** Why something is held. */
export type HoldWhy = 'hush' | 'muted' | 'busy' | 'claude' | 'nowhere';

/** The parts of an announce()'s options the queue reads. */
export interface SayOpts extends TierBits { asked?: boolean; blocking?: boolean; done?: boolean; reminder?: string; brief?: unknown; claude?: string; session?: string; heldAt?: number }

/**
 * One held thing. `say` is a line that goes back through announce() when it comes out (so it is stored when it reaches
 * him, keeps its card, and goes to Discord instead if he walked away); `msg` is a message that was already built (a
 * note notice, a bundle, a "now playing" line) and goes to the desk as it is.
 */
export interface HeldItem<O extends SayOpts = SayOpts> {
  say?: { text: string; opts: O };
  msg?: ToBody;
  at: number;
  tier: Tier;
  why: HoldWhy;
  /** Shown as a marker on Aang while it waits (his pick, 2026-10-30): what he asked about, or a session stuck on him. */
  marker: boolean;
}

/** How many are kept; past that the least important go first (heldnotes.ts keep). */
export const HOLD_MAX = 8;
/** A held "now playing" line is only true for a song's length. */
export const WHISPER_LIFE_MS = 5 * 60_000;

const sessionOf = (h: HeldItem): string | undefined => {
  const s = h.say ? h.say.opts.session : (h.msg as { session?: unknown } | undefined)?.session;
  return typeof s === 'string' && s ? s : undefined;
};
const isWhisper = (h: HeldItem) => h.msg?.t === 'whisper';
const isBrief = (h: HeldItem) => !!(h.say ? h.say.opts.brief : (h.msg as { brief?: unknown } | undefined)?.brief);

/** What the marker on Aang shows: how many wait, and the most pressing kind. */
export interface Marker { count: number; tier: Tier; blocking: boolean; done: boolean }

export class HoldQueue<O extends SayOpts = SayOpts> {
  private items: HeldItem<O>[] = [];
  private readonly cap: number;
  private readonly now: () => number;
  constructor(cap = HOLD_MAX, now: () => number = Date.now) { this.cap = cap; this.now = now; }

  /** A line to say later. A line held a second time keeps the time it first arrived (`heldAt`). Returns how many were let go. */
  hold(text: string, opts: O, why: HoldWhy, marker = false): number {
    const at = opts.heldAt ?? this.now();
    return keep(this.items, { say: { text, opts }, at, tier: tierOf(opts), why, marker }, this.cap);
  }

  /** A message already built. A "now playing" line replaces the one before it: only the latest is true. */
  holdMsg(msg: ToBody, why: HoldWhy, marker = false, at = this.now()): number {
    if (msg.t === 'whisper') this.items = this.items.filter(h => !isWhisper(h));
    return keep(this.items, { msg, at, tier: msg.t === 'bubble' ? tierOf(msg as TierBits) : 3, why, marker }, this.cap);
  }

  /**
   * What is still news, most important first (oldest among equals), taken out of the queue. Past its tier's age it is
   * dropped; so is anything `over` says he has dealt with (a Claude question he answered in Claude). `which` picks what
   * may come out now (away, only lines that can go to Discord); the rest stay.
   */
  take(over: (h: HeldItem<O>) => boolean = () => false, which: (h: HeldItem<O>) => boolean = () => true): HeldItem<O>[] {
    const now = this.now();
    const out: HeldItem<O>[] = [], stay: HeldItem<O>[] = [];
    for (const h of this.items) {
      if (!which(h)) { stay.push(h); continue; }
      const live = fresh(h, now, isBrief(h)) && !(isWhisper(h) && now - h.at > WHISPER_LIFE_MS) && !over(h);
      if (live) out.push(h);
    }
    this.items = stay;
    return out.sort((a, b) => a.tier - b.tier || a.at - b.at);
  }

  /** Claude news he has seen in Claude: its held copies go (fix 3, 2026-10-29). Returns how many went. */
  dropSessions(ids: string[]): number {
    const n = this.items.length;
    this.items = this.items.filter(h => { const s = sessionOf(h); return !s || !ids.includes(s); });
    return n - this.items.length;
  }

  /** What the marker on Aang should show now. Count 0: no marker. */
  marker(): Marker {
    const m = this.items.filter(h => h.marker);
    const flag = (h: HeldItem<O>, k: 'blocking' | 'done') => (h.say ? h.say.opts[k] : (h.msg as { blocking?: unknown; done?: unknown } | undefined)?.[k]) === true;
    const blocking = m.some(h => flag(h, 'blocking'));
    const done = m.some(h => flag(h, 'done'));
    return { count: m.length, tier: m.reduce<Tier>((t, h) => (h.tier < t ? h.tier : t), 3), blocking, done };
  }

  get size(): number { return this.items.length; }
  /** For the checks. */
  list(): readonly HeldItem<O>[] { return this.items; }
}

// ------------------------------------------------------------------ routing

/** Everything that decides where a line goes, read at the moment it is said. */
export interface Gates {
  hushed: boolean;
  muted: boolean;
  /** The presence rule says busy (a game, a call, full screen, Focus, the Shadow window). */
  busy: boolean;
  /** The Claude app is in front (claudefront.ts, his rule of 2026-10-21). */
  inClaude: boolean;
  /** Where he can be told: the desk, Discord, or nowhere right now. */
  where: 'desktop' | 'discord' | null;
}

export type Route =
  | { to: 'bubble' }
  | { to: 'discord' }
  | { to: 'hold'; why: HoldWhy; marker: boolean };

/**
 * Where one line Aang says on his own goes. In order:
 *   hush holds everything, even what he asked for;
 *   away, Discord and only Discord (its quiet hours make it silent, not lost);
 *   nowhere to say it (a reconnect), held, not sent into nothing;
 *   mute holds everything, no marker;
 *   busy holds everything; what he asked about, a session stuck on him, gets a marker (his pick, 2026-10-30);
 *   the Claude app in front holds it (Claude shows him its own news);
 *   else the bubble.
 */
export function route(o: { asked?: boolean; blocking?: boolean }, g: Gates): Route {
  if (g.hushed) return { to: 'hold', why: 'hush', marker: false };
  if (g.where === 'discord') return { to: 'discord' };
  if (g.where === null) return { to: 'hold', why: 'nowhere', marker: false };
  if (g.muted) return { to: 'hold', why: 'muted', marker: false };
  if (g.busy) return { to: 'hold', why: 'busy', marker: o.asked === true || o.blocking === true };
  if (g.inClaude) return { to: 'hold', why: 'claude', marker: false };
  return { to: 'bubble' };
}

/** Can held lines come out now, and where to. Null: not yet. */
export function releaseTo(g: Gates): 'desktop' | 'discord' | null {
  if (g.hushed || g.where === null) return null;
  if (g.where === 'discord') return 'discord';
  return g.muted || g.busy || g.inClaude ? null : 'desktop';
}

/**
 * Should a post to his phone buzz? The brain decides (it knows what the post is); the Discord bridge only posts.
 * Replies, reminders and a session that needs him always do; what he asked about outside his quiet hours; anything
 * else a few a day outside them (discord-logic.ts Budget).
 */
export class Buzz {
  private readonly budget: Budget;
  constructor(budget: Budget = new Budget()) { this.budget = budget; }
  of(msg: { text: string; proactive?: boolean; asked?: boolean; blocking?: boolean }, now = new Date()): boolean {
    return this.budget.loud(kindOf(msg), now);
  }
}

// ------------------------------------------------------------------ asks (cards that wait on him)

/** The cards that wait on him. At most one of each at a time, except Claude job cards. */
export type AskKind = 'permission' | 'plan' | 'choice' | 'card' | 'fact';

interface Open { kind: AskKind; settle: (v: unknown) => void; timer: NodeJS.Timeout }

/**
 * Every card that waits on him, with its timer, in one place (it was four copies in core.ts). When the time runs out
 * the card is taken down (`expired`, the bubble's ask.expired) and the wait ends with its "no" answer.
 */
export class Asks {
  private readonly open = new Map<string, Open>();
  private readonly expired: (id: string | number) => void;
  constructor(expired: (id: string | number) => void) { this.expired = expired; }

  /**
   * Wait for his answer to card `id`. `onTimeout` is the answer when the time runs out (it may note why first).
   * Resolves once: with his answer (answer()), or with the timeout's.
   */
  wait<T>(kind: AskKind, id: string | number, ms: number, onTimeout: () => T): Promise<T> {
    const key = String(id);
    return new Promise<T>(resolve => {
      const timer = setTimeout(() => {
        if (!this.open.delete(key)) return;
        resolve(onTimeout());
        this.expired(id);
      }, ms);
      timer.unref?.();
      this.open.set(key, { kind, timer, settle: v => resolve(v as T) });
    });
  }

  /** His answer to card `id`. False when no such card waits (answered already, or it ran out). */
  answer(id: string | number, value: unknown): boolean {
    const key = String(id), o = this.open.get(key);
    if (!o) return false;
    clearTimeout(o.timer);
    this.open.delete(key);
    o.settle(value);
    return true;
  }

  /** The id of the card of this kind that waits, if any. */
  waiting(kind: AskKind): string | null {
    for (const [id, o] of this.open) if (o.kind === kind) return id;
    return null;
  }

  /** Is card `id` of this kind still waiting? */
  has(kind: AskKind, id: string | number): boolean { return this.open.get(String(id))?.kind === kind; }
}

// Sheet 17 timers (his call, 2026-10-12): "set a timer for 25 minutes for the pizza", decided in plain code.
// No model is asked, so a timer costs no quota and works the instant he sends it.
//
// Kept on disk, so a brain restart mid-timer does not lose it; one that ran out while the brain was down
// goes off as soon as it is back.
import { writeFileAtomic } from './atomic.ts';
import { readJson } from './store.ts';

/** Sheet 67b (2026-10-22): each timer has its own sand colour. Blue first, his default; new timers take the next one free. */
export const COLOURS = ['blue', 'gold', 'rose', 'jade', 'violet'] as const;
export type Colour = typeof COLOURS[number];
export const isColour = (c: unknown): c is Colour => typeof c === 'string' && (COLOURS as readonly string[]).includes(c);

/**
 * `done` (sheet 67 v2): when it ran out. A finished timer stays on the list, so its hourglass shows the end (the last
 * grains, the glint, Again / +5 / hold X) until he answers, or for DONE_KEEP_MS.
 */
export interface Timer { id: string; label: string; total: number; end: number; paused: number; colour?: Colour; done?: number }

/** At most this many running at once: each one is a little hourglass on his screen (one per sand colour). */
export const MAX_TIMERS = 5;
/** A finished timer waits this long for Got it / Again / X, then goes by itself. */
export const DONE_KEEP_MS = 10 * 60_000;
/** Scrolling or -1 never takes a timer below this. */
export const MIN_LEFT_MS = 10_000;
/** Nothing longer than a day is a timer; that is a reminder. */
export const MAX_MS = 24 * 3_600_000;

const WORDNUM: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, 'forty five': 45, fifty: 50, ninety: 90 };
const NUM = String.raw`(\d+(?:\.\d+)?|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty five|forty|fifty|ninety)`;
const UNIT = String.raw`(h|hr|hrs|hour|hours|m|min|mins|minute|minutes|s|sec|secs|second|seconds)`;

/** "25 minutes", "1h30", "an hour and a half", "half an hour", "90 seconds", "1 hour 20 minutes" -> ms, or null. */
export function parseDuration(raw: string): number | null {
  let t = ` ${raw.toLowerCase().replace(/[,]/g, ' ').replace(/\s+/g, ' ').trim()} `;
  let ms = 0, found = false;
  if (/\bhalf an hour\b/.test(t)) { ms += 30 * 60_000; found = true; t = t.replace(/\bhalf an hour\b/, ' '); }
  if (/\band a half\b/.test(t)) { const m = new RegExp(String.raw`${NUM}\s*${UNIT}\s+and a half`).exec(t); if (m) { ms += 0.5 * unitMs(m[2]!); } t = t.replace(/\band a half\b/, ' '); }
  // "1h30" / "1h 30" (minutes implied)
  const hm = /\b(\d+)\s*h\s*(\d{1,2})\b(?!\s*(?:s|sec|m|min))/.exec(t);
  if (hm) { ms += Number(hm[1]) * 3_600_000 + Number(hm[2]) * 60_000; found = true; t = t.replace(hm[0], ' '); }
  const re = new RegExp(String.raw`\b${NUM}\s*${UNIT}\b`, 'g');
  for (const m of t.matchAll(re)) {
    const n = /^\d/.test(m[1]!) ? Number(m[1]) : WORDNUM[m[1]!] ?? NaN;
    if (!Number.isFinite(n)) continue;
    ms += n * unitMs(m[2]!); found = true;
  }
  if (!found || ms <= 0 || ms > MAX_MS) return null;
  return Math.round(ms);
}
function unitMs(u: string): number { return /^h/.test(u) ? 3_600_000 : /^m/.test(u) ? 60_000 : 1000; }

export type TimerCommand = { op: 'start'; ms: number; label: string } | { op: 'setup' } | { op: 'stop' };

const LEAD = String.raw`^(?:hey\s+|ok\s+|okay\s+)?(?:aang[,!]?\s+)?(?:can you\s+|could you\s+|please\s+)?`;
const DUR = String.raw`((?:(?:\d+(?:\.\d+)?|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty five|forty|fifty|ninety|half)\s*(?:h|hr|hrs|hour|hours|m|min|mins|minute|minutes|s|sec|secs|second|seconds|an hour)?(?:\s*(?:and\s+)?(?:a half|\d+\s*(?:m|min|mins|minutes|s|sec|secs|seconds)?))?\s*){1,3})`;
const tidyLabel = (s: string | undefined) => (s ?? '').replace(/^(?:for|to|on|the|my)\s+/i, '').replace(/^(?:the|my)\s+/i, '').replace(/[.!?\s]+$/, '').trim().slice(0, 40);
const cap = (s: string) => s ? s[0]!.toUpperCase() + s.slice(1) : '';

/**
 * Is this a timer request? Deliberately narrow: only when the word "timer" is there, or the whole message is
 * a duration and a couple of words ("10m food"). "remind me in 10 minutes" stays a reminder; "I waited 10
 * minutes for food" is not a timer.
 */
export function parseTimerCommand(text: string): TimerCommand | null {
  const t = text.trim().replace(/\s+/g, ' ');
  if (t.length > 120) return null;
  let m: RegExpExecArray | null;
  if (new RegExp(`${LEAD}(?:stop|cancel|kill|end)\\s+(?:the\\s+|my\\s+)?timers?\\s*[.!]?$`, 'i').test(t)) return { op: 'stop' };
  // "set a timer for 25 minutes for the pizza", "start a 10 minute timer for food", "timer 1h tea"
  if ((m = new RegExp(`${LEAD}(?:set|start|make|put on|give me)\\s+(?:me\\s+)?(?:a|an|another)?\\s*timer\\s+(?:for\\s+)?${DUR}(?:\\s+(?:for|to|on)\\s+(.+))?\\s*[.!]?$`, 'i').exec(t))
    || (m = new RegExp(`${LEAD}(?:set|start|make)\\s+(?:me\\s+)?(?:a|an)\\s+${DUR}\\s*timer(?:\\s+(?:for|to|on)\\s+(.+))?\\s*[.!]?$`, 'i').exec(t))
    || (m = new RegExp(`^timer\\s+(?:for\\s+)?${DUR}(?:\\s+(?:for\\s+)?(.+))?\\s*[.!]?$`, 'i').exec(t))) {
    const ms = parseDuration(m[1]!);
    if (!ms) return null;
    return { op: 'start', ms, label: cap(tidyLabel(m[2])) };
  }
  // "10m food", "25 min pizza": the whole message is a duration and at most three words.
  if ((m = /^(\d+(?:\.\d+)?\s*(?:h|hr|hrs|hours?|m|min|mins|minutes?|s|sec|secs|seconds?))\s+([a-z][a-z' ]{0,24})$/i.exec(t)) && m[2]!.trim().split(' ').length <= 3) {
    const ms = parseDuration(m[1]!);
    if (!ms) return null;
    return { op: 'start', ms, label: cap(tidyLabel(m[2])) };
  }
  // "set a timer" with no time: open the dial.
  if (new RegExp(`${LEAD}(?:set|start|make)\\s+(?:me\\s+)?(?:a|an)?\\s*timer\\s*[.!?]?$`, 'i').test(t)) return { op: 'setup' };
  return null;
}

/** "25 minutes", "1 hour 5 minutes", "90 seconds": how a duration is said back to him. */
export function sayDuration(ms: number): string {
  const s = Math.round(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = s % 60;
  const part = (n: number, w: string) => n ? `${n} ${w}${n === 1 ? '' : 's'}` : '';
  return [part(h, 'hour'), part(m, 'minute'), h ? '' : part(sec, 'second')].filter(Boolean).join(' ') || '0 seconds';
}

export type TimerAction = 'add' | 'pause' | 'stop' | 'again' | 'rename' | 'colour';
export const TIMER_ACTIONS: readonly TimerAction[] = ['add', 'pause', 'stop', 'again', 'rename', 'colour'];

export class Timers {
  private all: Timer[] = [];
  private seq = 0;
  private readonly file: string;
  constructor(file: string) {
    this.file = file;
    this.all = readJson<Timer[]>(file, [], (raw) => Array.isArray(raw)
      ? raw.filter(x => x && typeof x.id === 'string' && typeof x.end === 'number' && typeof x.total === 'number').slice(0, MAX_TIMERS * 2) : null);
  }
  list(): Timer[] { return this.all.map(t => ({ ...t })); }
  private running(): Timer[] { return this.all.filter(t => !t.done); }
  /** The next colour: blue, then whichever of the five no other timer on screen has, in order. */
  private nextColour(): Colour {
    const used = new Set(this.all.map(t => t.colour));
    return COLOURS.find(c => !used.has(c)) ?? COLOURS[this.all.length % COLOURS.length]!;
  }
  start(ms: number, label: string, now = Date.now(), colour?: unknown): Timer | null {
    if (this.running().length >= MAX_TIMERS) return null;
    // finished ones make room for a new one (oldest first), so a done plate never blocks a new timer
    while (this.all.length >= MAX_TIMERS) { const i = this.all.findIndex(t => t.done); if (i < 0) break; this.all.splice(i, 1); }
    const t: Timer = { id: `t${now.toString(36)}${++this.seq}`, label, total: ms, end: now + ms, paused: 0, colour: isColour(colour) ? colour : this.nextColour() };
    this.all.push(t); this.save(); return { ...t };
  }
  /**
   * The hourglass's hands-on (sheet 67 v2): add (ms, default +1 min; minus too, never under 10 s), pause / go on,
   * stop, again (turned over: the same time, or `ms`), rename, colour. A finished timer only takes again / stop /
   * rename / colour (+5 at the end is "again" for five minutes).
   */
  act(id: string, action: TimerAction, now = Date.now(), arg: { ms?: unknown; label?: unknown; colour?: unknown } = {}): Timer | null {
    const t = this.all.find(x => x.id === id);
    if (!t) return null;
    if (action === 'stop') { this.all = this.all.filter(x => x !== t); this.save(); return null; }
    if (action === 'again') {
      const ms = Number(arg.ms);
      const total = Number.isFinite(ms) && ms >= 1000 && ms <= MAX_MS ? Math.round(ms) : t.total;
      t.total = total; t.end = now + total; t.paused = 0; delete t.done;
    } else if (action === 'rename') {
      t.label = String(arg.label ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
    } else if (action === 'colour') {
      if (!isColour(arg.colour)) return { ...t };
      t.colour = arg.colour;
    } else if (t.done) {
      return { ...t };
    } else if (action === 'add') {
      const raw = arg.ms === undefined ? 60_000 : Number(arg.ms);
      if (!Number.isFinite(raw) || Math.abs(raw) > MAX_MS) return { ...t };
      const left = t.paused || Math.max(0, t.end - now);
      const next = Math.min(MAX_MS, Math.max(MIN_LEFT_MS, left + Math.round(raw)));
      const d = next - left;
      if (!d) return { ...t };
      t.total = Math.max(next, t.total + d);
      if (t.paused) t.paused = next; else t.end = now + next;
    } else if (action === 'pause') {
      if (t.paused) { t.end = now + t.paused; t.paused = 0; } else { t.paused = Math.max(1, t.end - now); }
    }
    this.save(); return { ...t };
  }
  stopAll(): number { const n = this.running().length; this.all = []; this.save(); return n; }
  /** The ones that have just run out: marked done (kept on the list), returned once. */
  due(now = Date.now()): Timer[] {
    const out = this.all.filter(t => !t.done && !t.paused && t.end <= now);
    if (out.length) { for (const t of out) t.done = t.end; this.save(); }
    return out.map(t => ({ ...t }));
  }
  /** Finished timers nobody answered within DONE_KEEP_MS go. True when the list changed. */
  expire(now = Date.now()): boolean {
    const keep = this.all.filter(t => !t.done || now - t.done < DONE_KEEP_MS);
    if (keep.length === this.all.length) return false;
    this.all = keep; this.save(); return true;
  }
  /** When the brain must look next: the earliest running end, or the earliest finished one's going. Null = none. */
  nextAt(): number | null {
    let n: number | null = null;
    for (const t of this.all) {
      const at = t.done ? t.done + DONE_KEEP_MS : t.paused ? null : t.end;
      if (at !== null && (n === null || at < n)) n = at;
    }
    return n;
  }
  private save(): void { writeFileAtomic(this.file, JSON.stringify(this.all)); }
}

// Reminders and timers: the other thing Aang is allowed to speak up about unprompted.
//
// They are written to disk the moment they are made, so a restart (or a power cut, which has happened here)
// never loses one, and anything that came due while the Core was down is delivered as soon as it is back.
import { writeFileAtomic } from './atomic.ts';
import path from 'node:path';
import { homeTime } from './clock.ts';
import { readJson } from './store.ts';
import { Scheduler } from './scheduler.ts';

export interface Reminder {
  id: string;
  /** Epoch ms when it is due. */
  at: number;
  text: string;
  createdAt: number;
}

export const MAX_REMINDERS = 50;

/** "in 20 minutes" style input, kept deliberately small: the model does the understanding, this does the arithmetic. */
export function dueAt(inMinutes: number | undefined, at: string | undefined, now = Date.now()): number | null {
  if (typeof inMinutes === 'number' && Number.isFinite(inMinutes)) {
    if (inMinutes <= 0 || inMinutes > 60 * 24 * 30) return null;
    return now + Math.round(inMinutes * 60_000);
  }
  if (typeof at === 'string' && at.trim()) {
    const t = Date.parse(at);
    if (Number.isFinite(t) && t > now - 60_000) return Math.max(t, now);
  }
  return null;
}

export function describeWhen(at: number, now = Date.now()): string {
  const mins = Math.round((at - now) / 60_000);
  if (mins < 1) return 'in a moment';
  if (mins === 1) return 'in a minute';
  if (mins < 60) return `in ${mins} minutes`;
  const h = Math.round(mins / 60);
  if (h < 24) return `in about ${h} hour${h === 1 ? '' : 's'}`;
  return `on ${homeTime(at, { weekday: 'long', hour: 'numeric', minute: '2-digit', hour12: true }, 'en-CA')}`;
}

export class Reminders {
  private items: Reminder[] = [];
  private alarm: (() => void) | null = null;
  private seq = 0;
  private readonly file: string;
  private readonly sched: Scheduler;

  /** Called for each reminder that comes due. */
  onDue: (r: Reminder) => void = () => {};

  /** `sched`: the brain's scheduler (the next one due is a one-shot on it); left out, a scheduler of its own. */
  constructor(stateDir: string, sched?: Scheduler) {
    this.sched = sched ?? new Scheduler();
    this.file = path.join(stateDir, 'reminders.json');
    this.load();
  }

  private load(): void {
    // A corrupt file must not stop the Core from starting.
    this.items = readJson(this.file, this.items, (raw) => (Array.isArray(raw) ? raw.filter(r => r && typeof r.at === 'number' && typeof r.text === 'string') : null));
  }

  private save(): void {
    try {
      writeFileAtomic(this.file, JSON.stringify(this.items, null, 2));
    } catch { /* best effort */ }
  }

  list(now = Date.now()): Reminder[] {
    return this.items.filter(r => r.at > now).sort((a, b) => a.at - b.at);
  }

  add(text: string, at: number, now = Date.now()): Reminder | null {
    const clean = text.trim().slice(0, 300);
    if (!clean || this.list(now).length >= MAX_REMINDERS) return null;
    const r: Reminder = { id: `r${now.toString(36)}${this.seq++}`, at, text: clean, createdAt: now };
    this.items.push(r);
    this.save();
    this.arm(now);
    return r;
  }

  cancel(idOrText: string, now = Date.now()): Reminder | null {
    const needle = idOrText.trim().toLowerCase();
    const live = this.list(now);
    const hit = live.find(r => r.id === idOrText) ?? live.find(r => r.text.toLowerCase().includes(needle));
    if (!hit) return null;
    this.items = this.items.filter(r => r !== hit);
    this.save();
    this.arm(now);
    return hit;
  }

  /** Start the clock. Anything already overdue (the Core was off) fires right away. */
  start(now = Date.now()): void { this.arm(now); }

  private arm(now = Date.now()): void {
    this.alarm?.(); this.alarm = null;
    const due = this.items.filter(r => r.at <= now);
    if (due.length) {
      this.items = this.items.filter(r => r.at > now);
      this.save();
      for (const r of due) { try { this.onDue(r); } catch { /* a listener must not stop the rest */ } }
    }
    const next = this.list(now)[0];
    if (!next) return;
    // A one-shot on the scheduler (2026-10-30). It looks at the wall clock at least once a minute, as this did, so a
    // sleeping computer or a huge delay never makes one late. Never quiet-held: a reminder is his, it rings in a game.
    this.alarm = this.sched.at(Math.max(next.at, now + 20), () => { this.alarm = null; this.arm(); }, { name: 'reminders.next' });
  }

  stop(): void { this.alarm?.(); this.alarm = null; }
}

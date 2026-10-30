import type { ToBody } from './protocol.ts';

// Held notices (2026-10-28, his notice review: "all 17"). Aang holds what he says on his own while Joshua is hushed,
// muted, quiet (a game, a call, the Shadow window) or in Claude, and says it once that ends. Two things were wrong:
//   - nothing held knew when it arrived, so "X just posted" could come out four hours later as if new (R2);
//   - a full queue dropped the OLDEST first, and the oldest was often the most important (the morning brief pushed
//     out by video posts) (R8).
// One rule for the one hold queue (attention.ts HoldQueue, 2026-10-30): each entry carries its time and its tier;
// a full queue drops the least important first (oldest among equals); on release, anything past its tier's age is
// dropped, and a reminder that waited says when it was due instead.

/** 1: he set it or something waits on him (a reminder, a Claude session needing him). 2: he asked for it, or the
 *  brief. 3: everything else Aang offers on his own (feeds, nudges, notes, facts, now playing). */
export type Tier = 1 | 2 | 3;

/** What decides a tier, read off a held bubble or an announce()'s options. */
export interface TierBits { reminder?: unknown; blocking?: unknown; session?: unknown; brief?: unknown; asked?: unknown; research?: unknown; t?: unknown }

export function tierOf(m: TierBits): Tier {
  if (m.reminder || m.blocking === true) return 1;
  if (m.brief || m.asked === true || m.research) return 2;
  return 3;
}

/** How long a held line stays worth saying, by tier. A reminder never goes stale: it is said with its time instead. */
export const STALE_MS: Record<Tier, number> = { 1: Infinity, 2: 2 * 3_600_000, 3: 60 * 60_000 };
/** The brief is tier 2 but only means something in the morning: an hour, like the feeds. */
export const BRIEF_STALE_MS = 60 * 60_000;

export interface Held { at: number; tier: Tier }

/** Add one, then trim to `cap` by dropping the least important (the oldest of those). Returns how many were dropped. */
export function keep<T extends Held>(list: T[], item: T, cap: number): number {
  list.push(item);
  let dropped = 0;
  while (list.length > cap) {
    let worst = 0;
    for (let i = 1; i < list.length; i++) if (list[i]!.tier > list[worst]!.tier) worst = i;   // first of the highest tier = oldest
    list.splice(worst, 1);
    dropped++;
  }
  return dropped;
}

/** Still worth saying now? `brief` uses the brief's shorter life. */
export function fresh(h: Held, now: number, brief = false): boolean {
  return now - h.at <= (brief ? BRIEF_STALE_MS : STALE_MS[h.tier]);
}

/** "Earlier, at 2:10 pm: " for a line that waited more than ten minutes, else ''. Toronto time, his clock. */
export function earlier(at: number, now: number): string {
  if (now - at < 10 * 60_000) return '';
  const t = new Date(at).toLocaleTimeString('en-US', { timeZone: 'America/Toronto', hour: 'numeric', minute: '2-digit' }).toLowerCase();
  return `Earlier, at ${t}: `;
}

/** What a held bubble is, for its row's chip (sheet 102). */
function chipOf(m: Record<string, unknown>): { chipText: string; chipTone: string } {
  if (m.reminder) return { chipText: 'REMINDER', chipTone: 'careful' };
  if (m.kind === 'claude') return { chipText: 'CLAUDE', chipTone: m.blocking === true ? 'stop' : 'good' };
  if (m.brief) return { chipText: 'BRIEF', chipTone: 'normal' };
  if (m.about) return { chipText: 'VIDEO', chipTone: 'inactive' };
  return { chipText: 'AANG', chipTone: 'normal' };
}

/** A row's two lines from a bubble's words: the first sentence, then the rest, both cut short. */
export function rowOf(text: string): { title: string; subtitle?: string } {
  let t = text.replace(/\s+/g, ' ').trim();
  // "Earlier, at 2:10 pm: Reminder: call the dentist" -> the reminder as the title, its time under it (sheet 102).
  const was = /^Earlier, at ([^:]+:\d{2} [ap]m): /.exec(t);
  if (was) t = t.slice(was[0].length);
  // The first sentence is the title; a colon only splits when the line is too long to keep ("Reminder: laundry" stays).
  let cut = t.search(/[.!?](\s|$)/);
  if (cut < 0 || cut > 70) cut = t.length > 60 ? t.search(/:(\s|$)/) : -1;
  const title = (cut > 0 && cut <= 70 ? t.slice(0, cut) : t.length > 60 ? t.slice(0, 58) + '...' : t).trim();
  let rest = cut > 0 && cut <= 70 ? t.slice(cut).replace(/^[.:!?]\s*/, '').trim() : '';
  if (was) rest = `due at ${was[1]}` + (rest ? ` · ${rest}` : '');
  return rest ? { title, subtitle: rest.length > 70 ? rest.slice(0, 68) + '...' : rest } : { title };
}

/**
 * Sheet 102 (his yes, 2026-10-28): what was held while he was busy comes out as ONE bubble, a row each in the order
 * given (most important first), each row carrying the whole message it stands for, so a tap shows it as it would have
 * come. The rows are the bubble's own present_list rows.
 */
export function bundleOf(msgs: ToBody[], header: string): ToBody {
  const items = msgs.map((m) => { const b = m as unknown as Record<string, unknown>; return { ...rowOf(String(b.text ?? '')), ...chipOf(b) }; });
  return { t: 'bubble', text: header, stream: false, proactive: true, asked: true, list: { items, held: msgs } } as unknown as ToBody;
}

/** What went to his phone while he was away, kept for the one "welcome back" line (sheet 102). */
export interface AwayItem { text: string; at: number; chipText: string; chipTone: string; session?: string; blocking?: boolean }
/** With its Claude session, if any, so news he has since dealt with in Claude can be left out (2026-10-29). */
export function awayItemOf(text: string, o: Record<string, unknown>, at: number): AwayItem {
  return { text, at, ...chipOf(o), ...(typeof o.session === 'string' && o.session ? { session: o.session } : {}), ...(o.blocking === true ? { blocking: true } : {}) };
}

/**
 * Sheet 102 (his yes): back from away, ONE line saying what went to his phone, a row each (newest last), each opening Look
 * back where it is kept. Nothing is sent again. Null when nothing went.
 */
export function welcomeBack(items: AwayItem[], max = 6): ToBody | null {
  if (!items.length) return null;
  const n = items.length;
  const rows = items.slice(-max).map((x) => ({ ...rowOf(x.text), chipText: x.chipText, chipTone: x.chipTone, look: true }));
  return { t: 'bubble', text: `Welcome back. ${n === 1 ? '1 thing' : `${n} things`} went to your phone while you were away:`, stream: false, proactive: true, asked: true,
    list: { items: rows, ...(n > max ? { moreCount: n - max } : {}) } } as unknown as ToBody;
}

// E5, the email assistant (his interview, 2026-10-13): book a meeting, or answer an invite, from an email he went
// through. His rule: "NEVER EVER ... book anything wrong, get a date wrong". So:
//   - The time comes from CODE: the invite's own data, or a date code read in the email's words (emailfacts.ts). The
//     model only says WHICH one (by its exact words) and, if he said it, am or pm. It never writes a time itself.
//   - Nothing is booked until he has seen everything: the weekday, date and time in Toronto, where that came from, the
//     place, who is told, and any clash with his calendar.
//   - After it is booked, the event is read back from Google and compared field by field with what he approved.
import type { EmailFacts, FoundDate, Invite } from './emailfacts.ts';
import type { CalEvent } from './google.ts';

export type Answer = 'accept' | 'decline' | 'maybe' | 'add';
/** What is about to happen, all of it from code. */
export interface Plan {
  answer: Answer;
  title: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  where: string;
  /** Where the time came from, exactly as written, for the approval. */
  source: string;
  /** The invite's own id, when it is an invite. */
  uid?: string;
  organizer?: string;
  /** Things the approval must show as doubts (he says yes knowing them). */
  doubts: string[];
}

const TZ = 'America/Toronto';
const RESPONSE: Record<Exclude<Answer, 'add'>, string> = { accept: 'accepted', decline: 'declined', maybe: 'tentative' };
export const responseOf = (a: Answer) => (a === 'add' ? null : RESPONSE[a]);

/** The plan from an invite, or why there is none. */
export function planFromInvite(inv: Invite, answer: Answer): Plan | { why: string } {
  if (inv.cancelled) return { why: 'The sender cancelled this meeting. Nothing to book.' };
  const s = inv.start, e = inv.end;
  if (!s || (!s.iso && !s.date)) return { why: `The invite's time could not be read for sure (${s?.note ?? 'no start time'}). As written: ${s?.raw ?? 'none'}. Ask him to check the time in Gmail.` };
  const start = s.date ? { date: s.date } : { dateTime: s.iso! };
  const end = e?.date ? { date: e.date } : e?.iso ? { dateTime: e.iso } : s.date ? { date: nextDay(s.date) } : { dateTime: new Date(Date.parse(s.iso!) + 3_600_000).toISOString() };
  const doubts = [s.note, e?.note].filter((x): x is string => Boolean(x));
  if (!e?.iso && !e?.date && !s.date) doubts.push('the invite has no end time, so one hour is used');
  return { answer, title: inv.title || 'Meeting', start, end, where: inv.where, source: `the invite (${s.raw})`, uid: inv.uid, ...(inv.organizer ? { organizer: inv.organizer.name || inv.organizer.email } : {}), doubts };
}

/**
 * The plan from a date code read in the email's words. `pick` is am or pm only when HE said it; without it a time with
 * no am or pm is refused, and so is a day with no time at all. Never a guess.
 */
export function planFromWords(d: FoundDate, title: string, minutes: number, pick?: 'am' | 'pm'): Plan | { why: string } {
  let iso = d.iso;
  if (!iso && d.am && d.pm) {
    if (!pick) return { why: `"${d.text}" does not say am or pm. Ask him which, then call again with pick.` };
    iso = pick === 'am' ? d.am : d.pm;
  }
  if (!iso) return { why: `"${d.text}" has a day but no time. Ask him what time.` };
  const len = Math.max(15, Math.min(8 * 60, Math.round(minutes) || 60));
  const doubts = d.unsure.filter(u => !/am or pm is not written/.test(u) || !pick);
  if (pick) doubts.push(`am or pm was not written; you said ${pick}`);
  return { answer: 'add', title: title.trim().slice(0, 200) || 'Meeting', start: { dateTime: iso }, end: { dateTime: new Date(Date.parse(iso) + len * 60_000).toISOString() }, where: '', source: `the email's words "${d.text}"`, doubts };
}

const nextDay = (date: string) => { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };

/** "Friday, October 16, 2026, 2:00 PM to 3:00 PM Toronto time" (or all day), always with the weekday. */
export function sayPlanTime(p: Plan): string {
  if (p.start.date) {
    const day = (k: string) => new Date(k + 'T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const last = p.end.date ? nextDayBack(p.end.date) : p.start.date;
    return last && last !== p.start.date ? `${day(p.start.date)} to ${day(last)}, all day` : `${day(p.start.date)}, all day`;
  }
  const a = new Date(p.start.dateTime!), b = new Date(p.end.dateTime!);
  const date = a.toLocaleDateString('en-US', { timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const t = (x: Date) => x.toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
  const sameDay = a.toLocaleDateString('en-CA', { timeZone: TZ }) === b.toLocaleDateString('en-CA', { timeZone: TZ });
  return sameDay ? `${date}, ${t(a)} to ${t(b)} Toronto time` : `${date}, ${t(a)} to ${b.toLocaleDateString('en-US', { timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric' })}, ${t(b)} Toronto time`;
}
const nextDayBack = (date: string) => { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); };

const ms = (x: { dateTime?: string; date?: string } | undefined) => (x?.dateTime ? Date.parse(x.dateTime) : x?.date ? Date.parse(x.date + 'T00:00:00Z') : NaN);
/** Events already in his calendar that overlap the plan (not the same invite). */
export function clashes(p: Plan, events: CalEvent[]): CalEvent[] {
  const a = ms(p.start), b = ms(p.end);
  return events.filter(e => e.status !== 'cancelled' && !(p.uid && (e as any).iCalUID === p.uid) && ms(e.start) < b && ms(e.end) > a);
}

/** The approval, in words, with everything he needs to say yes knowing exactly what happens. */
export function approvalText(p: Plan, found: CalEvent[]): { question: string; means: string } {
  const what = p.answer === 'add' ? `add "${p.title}" to your calendar` : `${p.answer === 'accept' ? 'accept' : p.answer === 'decline' ? 'decline' : 'say maybe to'} "${p.title}"`;
  const lines = [`When: ${sayPlanTime(p)}`, `From: ${p.source}`];
  if (p.where) lines.push(`Where: ${p.where}`);
  if (p.answer !== 'add' && p.organizer) lines.push(`${p.organizer} will be told you ${responseOf(p.answer)}.`);
  if (p.answer === 'add') lines.push('Nobody else is told: it only goes in your calendar.');
  const c = clashes(p, found);
  if (c.length) lines.push(`CLASHES with: ${c.slice(0, 3).map(e => `${e.summary ?? '(no title)'} (${e.start?.dateTime ? new Date(e.start.dateTime).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }) : 'all day'})`).join(', ')}`);
  for (const d of p.doubts) lines.push(`CHECK: ${d}`);
  return { question: what, means: lines.join('\n') };
}

/** After booking: what Google now holds, compared with what he approved. Empty means it matches exactly. */
export function readBack(p: Plan, ev: CalEvent, me: string): string[] {
  const out: string[] = [];
  if (p.start.dateTime ? ms(ev.start) !== Date.parse(p.start.dateTime) : ev.start?.date !== p.start.date) out.push(`the start is ${ev.start?.dateTime ?? ev.start?.date}, not ${p.start.dateTime ?? p.start.date}`);
  if (p.end.dateTime ? ms(ev.end) !== Date.parse(p.end.dateTime) : ev.end?.date !== p.end.date) out.push(`the end is ${ev.end?.dateTime ?? ev.end?.date}, not ${p.end.dateTime ?? p.end.date}`);
  if (p.answer === 'add' && (ev.summary ?? '') !== p.title) out.push(`the title is "${ev.summary ?? ''}", not "${p.title}"`);
  if (p.answer === 'add' && p.where && (ev.location ?? '') !== p.where) out.push(`the place is "${ev.location ?? ''}", not "${p.where}"`);
  const want = responseOf(p.answer);
  if (want) {
    const mine = (ev.attendees ?? []).find(a => a.self || a.email.toLowerCase() === me.toLowerCase());
    if (mine?.responseStatus !== want) out.push(`your answer shows as ${mine?.responseStatus ?? 'missing'}, not ${want}`);
  }
  return out;
}

/** Which invite or which written date the model meant, or why it could not be found. */
export function pickSource(f: EmailFacts, words?: string): { invite: Invite } | { date: FoundDate } | { why: string } {
  const live = f.invites.filter(i => !i.cancelled);
  if (!words && live.length) return { invite: live[0]! };
  if (!words && f.invites.length) return { why: 'The sender cancelled this meeting. Nothing to book.' };
  if (words) {
    const d = f.dates.find(x => x.text === words) ?? f.dates.find(x => x.text.toLowerCase() === words.toLowerCase());
    if (d) return { date: d };
  }
  const list = f.dates.map(d => `"${d.text}"`).join(', ');
  return { why: list ? `Give one of the dates code read, by its exact words: ${list}.` : 'There is no invite and no date in this email. Ask him when.' };
}

// Sheet 21 board 1 (his order, 2026-10-13): the morning brief as the Discord card draws it. Job hunt first, then what is
// waiting on him, then today, then the other email WITH its subject. One builder for the PC and for the Mac (which sends
// the brief when Shadow is off), so the two can never say it differently. Plain data in, plain data out; every word
// goes onto the card as text.
import { dayKey as homeDayKey, fullMoment, shortTime } from './clock.ts';
export interface BriefInput {
  day?: string;
  events?: { title?: string; start?: string | null; allDay?: boolean; where?: string }[];
  unread?: { from?: string; subject?: string; job?: boolean }[];
  jobsNew?: number;
  waiting?: string[];
  weather?: { high: number; low: number; words: string; rain: number } | null;
}

const s = (v: unknown, n: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
/** Times written out with am or pm, in Toronto: never a bare "2:00" that could be read two ways. */
export const atToronto = (iso: unknown): string => {
  const d = new Date(String(iso ?? ''));
  return Number.isNaN(d.getTime()) ? '' : shortTime(d);
};

/**
 * His ask (2026-10-14: "fix the internal time for Aang"): the moment, as he says it, put in front of every message he
 * sends, on the PC and on the Mac. Aang's conversation lasts for days, so without this he guessed the time or used
 * UTC ("sent at 16:39 UTC"). Toronto time always.
 */
export function nowNote(d: Date = new Date()): string {
  const when = fullMoment(d);
  return `<now>${when}, Toronto time (Joshua is in Toronto).</now>`;
}

/** An email's own Date header in his time, with what it said: "Tuesday, October 13, 2026, 12:39 PM Toronto time". */
export function mailDate(raw: string): string {
  const ms = Date.parse(String(raw ?? ''));
  if (!Number.isFinite(ms)) return String(raw ?? '');
  return fullMoment(ms) + ' Toronto time';
}

/** Sheet 21 board 2b: the inbox card. Names only (never the address), subjects as written, JOB where his hunt knows them. */
export function inboxCardData(rows: { from: string; subject: string; unread: boolean }[], companies: string[]): Record<string, unknown> {
  const name = (f: string) => s(String(f ?? '').replace(/<[^>]*>/g, '').replace(/"/g, ''), 40) || 'Someone';
  const shown = rows.slice(0, 7).map(r => ({ tag: companies.some(c => String(r.from ?? '').toLowerCase().includes(c)) ? 'JOB' : '', who: name(r.from), what: s(r.subject, 90), unread: r.unread }));
  return { unread: rows.filter(r => r.unread).length, count: rows.length, rows: shown, more: Math.max(0, rows.length - shown.length) };
}

/**
 * Sheet 21 board 2b: the week card. Grouped by his day in Toronto; an all-day event is a DATE, not a time, so it is
 * read as that date (noon UTC, never shifted into the day before). Every time says am or pm.
 */
export function weekCardData(events: { summary?: string; location?: string; start?: { dateTime?: string; date?: string } }[], from: Date, days: number): Record<string, unknown> {
  const dayKey = (d: Date) => homeDayKey(d);
  const nameOf = (key: string) => new Date(key + 'T12:00:00Z').toLocaleDateString('en-CA', { timeZone: 'UTC', weekday: 'long' }).toUpperCase();
  const short = (key: string) => new Date(key + 'T12:00:00Z').toLocaleDateString('en-CA', { timeZone: 'UTC', month: 'short', day: 'numeric' });
  const keys: string[] = [];
  for (let i = 0; i < Math.max(1, Math.min(14, days)); i++) keys.push(dayKey(new Date(from.getTime() + i * 86_400_000)));
  const by = new Map<string, { tm: string; title: string; where: string; sort: string }[]>(keys.map(k => [k, []]));
  for (const e of events) {
    const key = e.start?.dateTime ? dayKey(new Date(e.start.dateTime)) : String(e.start?.date ?? '');
    const list = by.get(key);
    if (!list) continue;
    list.push({ tm: e.start?.dateTime ? atToronto(e.start.dateTime) : 'all day', title: s(e.summary ?? '(no title)', 70), where: s(e.location, 50), sort: e.start?.dateTime ?? '' });
  }
  const out = keys.map(k => ({ name: `${nameOf(k)}, ${short(k).toUpperCase()}`, items: (by.get(k) ?? []).sort((a, b) => a.sort.localeCompare(b.sort)).slice(0, 6).map(({ tm, title, where }) => ({ tm, title, where })) }));
  return { title: keys.length === 1 ? 'TODAY' : 'YOUR WEEK', range: keys.length === 1 ? short(keys[0]!) : `${short(keys[0]!)} to ${short(keys[keys.length - 1]!)}`, days: out };
}

export function briefCardData(b: BriefInput): { data: Record<string, unknown>; text: string; waiting: number } {
  const unread = Array.isArray(b.unread) ? b.unread : [];
  const job = unread.filter(u => u?.job).slice(0, 4).map(u => ({ tag: 'REPLY', who: s(u.from, 40), what: s(u.subject, 90) }));
  const fresh = Number(b.jobsNew) || 0;
  if (fresh > 0) job.push({ tag: 'NEW', who: `${fresh} job match${fresh === 1 ? '' : 'es'}`, what: '' });
  const waiting = (Array.isArray(b.waiting) ? b.waiting : []).slice(0, 4).map(w => ({ tag: 'WAITING', who: s(w, 90), what: '' }));
  const today = (Array.isArray(b.events) ? b.events : []).slice(0, 6).map(e => ({ tm: e?.allDay ? 'all day' : atToronto(e?.start), title: s(e?.title, 70), where: s(e?.where, 50) }));
  const rest = unread.filter(u => !u?.job);
  const other = rest.slice(0, 4).map(u => ({ who: s(u.from, 40), what: s(u.subject, 90) }));
  const w = b.weather;
  const weather = w ? `${Math.round(Number(w.low))} to ${Math.round(Number(w.high))} degrees, ${s(w.words, 40).toLowerCase()}${Number(w.rain) >= 30 ? `, ${Math.round(Number(w.rain))}% chance of rain` : ''}` : '';
  const data = { day: s(b.day, 40), weather, job, waiting, today, other, more: Math.max(0, rest.length - other.length) };
  // The same, as words: his phone's notification, and what is posted if the card cannot be drawn.
  const lines: string[] = [`**Morning brief, ${data.day}**`];
  if (weather) lines.push(weather);
  if (job.length) lines.push('', '**Job hunt**', ...job.map(r => `- ${r.who}${r.what ? ': ' + r.what : ''}`));
  if (waiting.length) lines.push('', '**Waiting on you**', ...waiting.map(r => `- ${r.who}`));
  if (today.length) lines.push('', '**Today**', ...today.map(e => `- ${e.tm} ${e.title}${e.where ? ', ' + e.where : ''}`));
  if (other.length) lines.push('', '**Other email**', ...other.map(o => `- ${o.who}: ${o.what}`), ...(data.more ? [`+ ${data.more} more`] : []));
  if (lines.length === 1 || (lines.length === 2 && weather)) lines.push('Nothing new this morning.');
  return { data, text: lines.join('\n').slice(0, 1900), waiting: waiting.length };
}

/**
 * Is this his ask for the brief, however he puts it (2026-10-22: "when I ask him for my morning brief in any way")?
 * "brief", "my brief", "brief me", "can I get my morning brief?", "what's in today's briefing", "pull up the brief pls".
 * Short asks only, and never one about MAKING a brief ("write a brief for the designer").
 */
export function wantsBrief(text: string): boolean {
  const t = (text ?? '').trim();
  if (!t || t.length > 90) return false;
  if (/\b(write|draft|make|create|prepare|edit|rewrite|send)\b[^.?!]*\bbrief|\bbrief\b[^.?!]*\b(shorter|longer)\b/i.test(t)) return false;
  if (/^(the\s+|my\s+)?(morning\s+)?brief(ing)?[\s.!?]*$/i.test(t)) return true;
  if (/\bbrief\s+me\b/i.test(t)) return true;
  return /\b(my|the|today'?s|this\s+morning'?s|morning|daily)\s+(morning\s+|daily\s+)?brief(ing)?\b/i.test(t);
}

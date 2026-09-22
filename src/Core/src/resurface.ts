// Bringing up what he told Aang, when it becomes relevant, and finding a day's conversation. Plain code, no model.
//
// Joshua's choice (2026-09-21): Aang may bring things up on his own "only when relevant", and no weekly recap. Here
// "relevant" means a day he named has come: "He has a dentist appointment on Thursday at 2pm", learned on Monday, is
// said back on Thursday morning (or an hour before 2pm). Once per fact, at most three a day, and through announce(),
// so hush, quiet and mute all hold it as they hold anything else.

const TZ = 'America/Toronto';
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** The Toronto calendar day of a moment, as YYYY-MM-DD. */
export const torontoDay = (t: Date): string => t.toLocaleDateString('en-CA', { timeZone: TZ });
const hourIn = (t: Date): number => Number(t.toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false }).slice(0, 2));
function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n, 12)).toISOString().slice(0, 10);
}
const weekday = (day: string): number => new Date(day + 'T12:00:00Z').getUTCDay();

export interface Mention { day: string; hour: number | null }

/**
 * The one day a sentence is about, worked out from when it was said. Recurring things ("Tuesdays", "every Friday",
 * "each morning") are not a day and give nothing, so a habit is never nagged about.
 */
export function mentionedDay(text: string, said: Date): Mention | null {
  const t = ` ${text.toLowerCase()} `;
  if (/\b(every|each|usually|always|weekly|daily)\b/.test(t) || /\b(sun|mon|tues|wednes|thurs|fri|satur)days\b/.test(t)) return null;
  const base = torontoDay(said);
  let day: string | null = null;
  if (/\b(today|tonight|this (morning|afternoon|evening))\b/.test(t)) day = base;
  else if (/\btomorrow\b/.test(t)) day = addDays(base, 1);
  else if (/\bday after tomorrow\b/.test(t)) day = addDays(base, 2);
  else {
    const w = /\b(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/.exec(t);
    if (w) {
      const target = DAYS.indexOf(w[2]!);
      let ahead = (target - weekday(base) + 7) % 7;
      if (w[1] && ahead < 7) ahead += ahead === 0 ? 7 : 0;          // "next Thursday" said on a Thursday is a week on
      day = addDays(base, ahead);
    } else {
      const md = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/.exec(t)
        ?? /\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/.exec(t);
      if (md) {
        const monthWord = /^\d/.test(md[1]!) ? md[2]! : md[1]!;
        const dayNum = Number(/^\d/.test(md[1]!) ? md[1] : md[2]);
        const month = MONTHS.indexOf(monthWord.slice(0, 3));
        if (month >= 0 && dayNum >= 1 && dayNum <= 31) {
          const year = Number(base.slice(0, 4));
          let cand = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
          if (cand < base) cand = `${year + 1}${cand.slice(4)}`;                // a date already gone this year is next year's
          day = cand;
        }
      }
    }
  }
  if (!day) return null;
  const at = /\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?\b/.exec(t) ?? /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)\b/.exec(t);
  let hour: number | null = null;
  if (at) {
    let h = Number(at[1]); const ap = (at[3] ?? '').replace(/\./g, '');
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    if (!ap && h >= 1 && h <= 7) h += 12;                                   // "at 2" means the afternoon
    if (h >= 0 && h <= 23) hour = h;
  }
  if (hour === null && /\btonight|this evening\b/.test(t)) hour = 19;
  return { day, hour };
}

export interface Fact { id: number; text: string; lastSeen: string }
export interface Nudge { id: number; text: string; key: string }

/**
 * Which remembered facts are due to be brought up now. A fact counts from when it was last said (lastSeen, UTC
 * "YYYY-MM-DD HH:MM:SS"). Due on its day from 8:00, or from an hour before its time. `done` holds the keys already
 * said; at most `left` come back.
 */
export function dueNudges(facts: Fact[], now: Date, done: Set<string>, left: number): Nudge[] {
  if (left <= 0) return [];
  const today = torontoDay(now), hour = hourIn(now);
  if (hour < 8 || hour >= 22) return [];                                    // never early in the morning or late at night
  const out: Nudge[] = [];
  for (const f of facts) {
    const said = new Date(f.lastSeen.replace(' ', 'T') + 'Z');
    if (!Number.isFinite(said.getTime())) continue;
    const m = mentionedDay(f.text, said);
    if (!m || m.day !== today) continue;
    if (m.hour !== null && hour < m.hour - 1) continue;
    if (m.hour !== null && hour > m.hour) continue;                         // it has passed: saying it now helps nobody
    const key = `${f.id}@${m.day}`;
    if (done.has(key)) continue;
    out.push({ id: f.id, text: f.text, key });
    if (out.length >= left) break;
  }
  return out;
}

export const nudgeText = (fact: string): string => `From what you told me: ${fact.replace(/\s*\.?\s*$/, '.')}`;

/** "monday", "yesterday", "today", "2026-09-19", "sept 19": the day he means, looking back (a conversation is in the past). */
export function pastDay(word: string, now: Date): string | null {
  const w = word.trim().toLowerCase();
  const today = torontoDay(now);
  if (/^\d{4}-\d{2}-\d{2}$/.test(w)) return w;
  if (w === 'today' || w === 'this morning' || w === 'tonight') return today;
  if (w === 'yesterday') return addDays(today, -1);
  const d = DAYS.indexOf(w.replace(/^(last|on)\s+/, ''));
  if (d >= 0) { const back = (weekday(today) - d + 7) % 7 || (/^last\s/.test(w) ? 7 : 0); return addDays(today, -back); }
  const md = mentionedDay(`on ${w}`, now);
  if (md && /[a-z]{3}/.test(w) && /\d/.test(w)) return md.day > today ? `${Number(md.day.slice(0, 4)) - 1}${md.day.slice(4)}` : md.day;
  return null;
}

/** The UTC range, as stored in the turns table, that covers one Toronto day. */
export function utcRangeOf(day: string): { from: string; to: string } {
  const probe = new Date(day + 'T12:00:00Z');
  const p = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(probe);
  const g = (k: string) => Number(p.find(x => x.type === k)!.value);
  const offsetMin = Math.round((Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute')) - probe.getTime()) / 60000);
  const start = new Date(Date.parse(day + 'T00:00:00Z') - offsetMin * 60000);
  const end = new Date(start.getTime() + 24 * 3600_000);
  const f = (d: Date) => d.toISOString().replace('T', ' ').slice(0, 19);
  return { from: f(start), to: f(end) };
}

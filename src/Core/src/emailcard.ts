// E3 (sheet 21 board 2, approved 2026-10-13): one email, gone through, as a card. His rule: never a date, a time or a
// place wrong. So every fact on this card comes from CODE (emailfacts.ts: the invite's own data, the dates as written,
// the links, the files); the model only adds two things in its own words, the summary and what the sender asks him,
// and those are labelled as Aang's reading. Anything code is not sure of is a CHECK row, with why.
import type { EmailFacts, IcsTime } from './emailfacts.ts';
import { HOME_TZ } from './clock.ts';

export interface SeenEmail { id: string; fromName: string; fromEmail: string; subject: string; sentMs: number; facts: EmailFacts }
export interface CardRow { icon: 'cal' | 'pin' | 'call' | 'video' | 'file' | 'ask' | 'check'; w: string; m: string }
export type EmailAct = 'book' | 'drive' | 'transcripts' | 'prep' | 'reply' | 'files';

const s = (v: unknown, n: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const TZ = HOME_TZ;
const dayOf = (ms: number) => new Date(ms).toLocaleDateString('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric' });
const timeOf = (ms: number) => new Date(ms).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).toLowerCase();

/** "Fri, Oct 16, 2:00 pm to 3:00 pm" (Toronto), "Sat, Oct 17, all day", or null when code is not sure of the start. */
export function sayRange(start: IcsTime | null, end: IcsTime | null): string | null {
  if (!start) return null;
  if (start.date) return `${new Date(start.date + 'T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' })}, all day`;
  if (!start.iso) return null;
  const a = Date.parse(start.iso);
  const b = end?.iso ? Date.parse(end.iso) : NaN;
  if (Number.isNaN(b)) return `${dayOf(a)}, ${timeOf(a)}`;
  return dayOf(a) === dayOf(b) ? `${dayOf(a)}, ${timeOf(a)} to ${timeOf(b)}` : `${dayOf(a)}, ${timeOf(a)} to ${dayOf(b)}, ${timeOf(b)}`;
}

const CALL_NAMES: Record<string, string> = { 'zoom.us': 'Zoom', 'meet.google.com': 'Google Meet', 'teams.microsoft.com': 'Teams', 'teams.live.com': 'Teams', 'webex.com': 'Webex' };
const callName = (site: string) => CALL_NAMES[site] ?? CALL_NAMES[Object.keys(CALL_NAMES).find(k => site.endsWith(k)) ?? ''] ?? site;

/** The card's data and its buttons. `summary` and `asks` are the model's words; everything else is code's. */
export function emailCardData(e: SeenEmail, summary: string, asks: string[], canBook = false, canDrive = false): { data: Record<string, unknown>; acts: EmailAct[]; join: string | null; words: string } {
  const f = e.facts;
  const rows: CardRow[] = [];
  const checks: string[] = [];
  const invite = f.invites.find(i => !i.cancelled) ?? f.invites[0];
  if (invite) {
    const when = sayRange(invite.start, invite.end);
    if (invite.cancelled) rows.push({ icon: 'cal', w: when ?? s(invite.title, 60), m: 'CANCELLED by the sender' });
    else if (when) rows.push({ icon: 'cal', w: when, m: `invite${invite.recurring ? ', repeats' : ''}` });
    else checks.push(`the invite's time: ${invite.start?.note ?? 'it could not be read'}`);
    for (const t of [invite.start, invite.end]) if (t?.note && when) checks.push(`the invite's time: ${t.note}`);
  } else {
    // No invite: the dates as written, with the words they came from beside them.
    for (const d of f.dates.slice(0, 2)) {
      rows.push({ icon: d.unsure.length ? 'check' : 'cal', w: s(d.means.replace(/ Toronto time$/, ''), 90), m: `"${s(d.text, 40)}"` });
      for (const u of d.unsure) checks.push(`"${s(d.text, 40)}": ${u}`);
    }
  }
  const place = invite?.where && !/^https?:/i.test(invite.where) ? invite.where : f.addresses[0];
  if (place) rows.push({ icon: 'pin', w: s(place, 80), m: '' });
  const call = f.links.find(l => l.kind === 'call');
  if (call) rows.push({ icon: 'call', w: `${callName(call.site)} call`, m: 'link in the email' });
  const videos = f.links.filter(l => l.kind === 'video');
  if (videos.length) rows.push({ icon: 'video', w: `${videos.length} video${videos.length === 1 ? '' : 's'}`, m: s(videos.map(v => v.text || v.site).join(', '), 90) });
  const files = f.attachments;
  if (files.length) rows.push({ icon: 'file', w: s(files.slice(0, 2).map(a => a.name).join(', '), 70), m: files.length > 2 ? `+ ${files.length - 2} more` : '' });
  const shared = f.links.filter(l => l.kind === 'file');
  if (shared.length) rows.push({ icon: 'file', w: `${shared.length} shared file${shared.length === 1 ? '' : 's'}`, m: s(shared.map(x => x.site).join(', '), 60) });
  const ask = asks.map(a => s(a, 80)).filter(Boolean).slice(0, 4);
  if (ask.length) rows.push({ icon: 'ask', w: 'Asks', m: ask.join('; ') });
  for (const c of checks.slice(0, 3)) rows.push({ icon: 'check', w: 'CHECK', m: s(c, 120) });

  const acts: EmailAct[] = [];
  // E5: Book it, when there is something to book (a live invite, or a date with a time written) and he has signed in for it.
  if (canBook && (f.invites.some(i => !i.cancelled) || f.dates.some(d => d.iso || (d.am && d.pm)))) acts.push('book');
  // E7: Drive time, when there is a place and he has a TomTom key and a home set.
  if (canDrive && place) acts.push('drive');
  if (videos.length) acts.push('transcripts');
  acts.push('prep', 'reply');
  if (files.length) acts.push('files');
  const sent = e.sentMs ? `${dayOf(e.sentMs)}, ${timeOf(e.sentMs)}` : '';
  const data = { from: s(e.fromName || e.fromEmail, 40), sent, subject: s(e.subject || '(no subject)', 120), summary: s(summary, 320), rows };
  const words = [`${data.from}: ${data.subject}`, data.summary, ...rows.map(r => `- ${r.w}${r.m ? ' (' + r.m + ')' : ''}`)].filter(Boolean).join('\n').slice(0, 1900);
  return { data, acts, join: call ? call.url : null, words };
}

/** What a button asks Aang to do, in words, as if he typed it (the model then uses its own tools, with their asks). */
export function promptFor(act: EmailAct, id: string): string {
  switch (act) {
    case 'book': return `Book the meeting in email ${id}: if it has an invite, accept it (calendar_book answer accept); if not, add it from the date code read (calendar_book answer add with its exact words), and if am or pm is not written, ask me which first.`;
    case 'drive': return `How long is the drive to the place in email ${id}? Use drive_time with emailId ${id}, and arriveBy if it has an invite.`;
    case 'transcripts': return `Get the transcripts of the videos in email ${id} (watch_video on each video link mail_read lists) and give me two lines on each.`;
    case 'prep': return `Help me prep for what email ${id} is about: start a background job that reads the email, its attachments and its videos, researches the company and the people, and writes me a short briefing.`;
    case 'reply': return `Draft a reply to email ${id}. If what I want to say is not clear from what we have talked about, ask me first.`;
    case 'files': return `Send me the attachments of email ${id}: save each one with mail_attachment (save=true), then send it with send_to_phone.`;
  }
}

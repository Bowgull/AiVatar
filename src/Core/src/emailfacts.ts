// E1, the email assistant (his interview, 2026-10-13). What an email holds, read by PLAIN CODE, never by the model:
// the calendar invite inside it, its links (with where they really go), videos, call links, map links, phone numbers
// and street addresses. His rule: "this email thing needs to NEVER EVER make a mistake, a typo, book anything wrong,
// get a date wrong". So:
//   - An invite's own calendar data (text/calendar, .ics) is the source of truth for a meeting's time and place. A time
//     zone this code does not know is said to be unknown; it is never guessed.
//   - Everything is copied character for character from the email (cleaned of hidden characters only), with the
//     words it came from, so the card and every approval can show the source beside what Aang made of it.
//   - Nothing here acts. It only reads. The model is shown these facts as read by code, beside its own reading.
import type { Part } from './google.ts';

// ------------------------------------------------------------------ time zones

/** Windows and Outlook names for the zones he is likely to meet, to the real (IANA) name. Anything else is unknown. */
const WINDOWS_ZONES: Record<string, string> = {
  'eastern standard time': 'America/Toronto', 'us eastern standard time': 'America/Indianapolis',
  'central standard time': 'America/Chicago', 'mountain standard time': 'America/Denver', 'us mountain standard time': 'America/Phoenix',
  'pacific standard time': 'America/Los_Angeles', 'atlantic standard time': 'America/Halifax', 'newfoundland standard time': 'America/St_Johns',
  'alaskan standard time': 'America/Anchorage', 'hawaiian standard time': 'Pacific/Honolulu', 'canada central standard time': 'America/Regina',
  'gmt standard time': 'Europe/London', 'greenwich standard time': 'Atlantic/Reykjavik', 'utc': 'UTC', 'coordinated universal time': 'UTC',
  'w. europe standard time': 'Europe/Berlin', 'central europe standard time': 'Europe/Budapest', 'romance standard time': 'Europe/Paris',
  'central european standard time': 'Europe/Warsaw', 'e. europe standard time': 'Europe/Chisinau', 'fle standard time': 'Europe/Kiev',
  'india standard time': 'Asia/Kolkata', 'china standard time': 'Asia/Shanghai', 'tokyo standard time': 'Asia/Tokyo',
  'aus eastern standard time': 'Australia/Sydney', 'singapore standard time': 'Asia/Singapore', 'israel standard time': 'Asia/Jerusalem',
  'arabian standard time': 'Asia/Dubai', 'e. south america standard time': 'America/Sao_Paulo', 'sa pacific standard time': 'America/Bogota',
};
/** Outlook's long labels, "(UTC-05:00) Eastern Time (US & Canada)": only these exact ones, never a near miss. */
const OUTLOOK_LABELS: Record<string, string> = {
  '(utc-05:00) eastern time (us & canada)': 'America/Toronto', '(utc-06:00) central time (us & canada)': 'America/Chicago',
  '(utc-07:00) mountain time (us & canada)': 'America/Denver', '(utc-08:00) pacific time (us & canada)': 'America/Los_Angeles',
  '(utc-04:00) atlantic time (canada)': 'America/Halifax', '(utc) coordinated universal time': 'UTC',
  '(utc+00:00) dublin, edinburgh, lisbon, london': 'Europe/London',
};

/** A zone name as written in an invite, to one this machine can do arithmetic in. Null when it is not known for sure. */
export function zoneOf(tzid: string): string | null {
  const t = tzid.trim().replace(/^"|"$/g, '');
  if (!t) return null;
  const lower = t.toLowerCase();
  if (WINDOWS_ZONES[lower]) return WINDOWS_ZONES[lower]!;
  if (OUTLOOK_LABELS[lower]) return OUTLOOK_LABELS[lower]!;
  // A real IANA name (some senders prefix it with a path, e.g. /mozilla.org/.../America/Toronto).
  const iana = /([A-Za-z]+\/[A-Za-z_]+(?:\/[A-Za-z_]+)?)$/.exec(t)?.[1] ?? (t === 'UTC' ? 'UTC' : '');
  if (!iana) return null;
  try { new Intl.DateTimeFormat('en-US', { timeZone: iana }); return iana; } catch { return null; }
}

/** How far ahead of UTC a zone is at one moment, in minutes. */
function offsetAt(utcMs: number, zone: string): number {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(new Date(utcMs)).reduce<Record<string, number>>((a, x) => { if (x.type !== 'literal') a[x.type] = Number(x.value); return a; }, {});
  return (Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!, p.second!) - utcMs) / 60_000;
}
/**
 * A wall-clock time in a zone, as the real moment. Two passes, so a time right at a clock change lands right. A time
 * that does not exist (skipped by the spring change) or exists twice (the autumn hour) is reported, never smoothed over.
 */
export function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, s: number, zone: string): { ms: number; note?: string } {
  const wall = Date.UTC(y, mo - 1, d, h, mi, s);
  // The zone's offset a day before and a day after: at most two candidates. A candidate is real when that moment,
  // shown in the zone, IS this wall time.
  const before = offsetAt(wall - 86_400_000, zone), after = offsetAt(wall + 86_400_000, zone);
  const cands = [...new Set([wall - before * 60_000, wall - after * 60_000])];
  const real = cands.filter(ms => wall - offsetAt(ms, zone) * 60_000 === ms).sort((a, b) => a - b);
  if (real.length === 2) return { ms: real[0]!, note: 'this time happens twice (the clocks go back that night)' };
  if (real.length === 1) return { ms: real[0]! };
  return { ms: wall - before * 60_000, note: 'this time falls in the hour the clocks skip' };
}

// ------------------------------------------------------------------ the invite (iCalendar)

export interface IcsTime {
  /** The real moment, ISO in UTC. Absent for an all-day date or a time in a zone this code does not know. */
  iso?: string;
  /** An all-day event's date, YYYY-MM-DD, exactly as written: a date, never shifted by a zone. */
  date?: string;
  /** The zone it was written in, as the invite named it, and the one used (null: not known, so not converted). */
  tzWritten: string;
  zone: string | null;
  /** The value exactly as it was in the invite, for showing beside what Aang made of it. */
  raw: string;
  note?: string;
}
export interface Invite {
  method: string;            // REQUEST (an invite), CANCEL, REPLY, PUBLISH
  uid: string;
  title: string;
  start: IcsTime | null;
  end: IcsTime | null;
  allDay: boolean;
  where: string;
  organizer: { name: string; email: string } | null;
  attendees: { name: string; email: string; answer: string }[];
  description: string;
  recurring: string;         // the RRULE as written, or ''
  cancelled: boolean;
  sequence: number;
}

const unfold = (ics: string) => ics.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '');
const unescapeText = (v: string) => v.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');

interface IcsLine { name: string; params: Record<string, string>; value: string }
function parseLine(line: string): IcsLine | null {
  // NAME;PARAM=a;PARAM="b:c":value. A colon inside a quoted parameter is not the separator.
  let i = 0, inQ = false;
  for (; i < line.length; i++) { const c = line[i]; if (c === '"') inQ = !inQ; else if (c === ':' && !inQ) break; }
  if (i >= line.length) return null;
  const head = line.slice(0, i), value = line.slice(i + 1);
  const bits = head.match(/(?:[^;"]|"[^"]*")+/g) ?? [];
  const name = (bits.shift() ?? '').toUpperCase();
  const params: Record<string, string> = {};
  for (const b of bits) { const k = b.indexOf('='); if (k > 0) params[b.slice(0, k).toUpperCase()] = b.slice(k + 1).replace(/^"|"$/g, ''); }
  return { name, params, value };
}

export function parseIcsTime(l: IcsLine): IcsTime | null {
  const v = l.value.trim();
  const raw = `${l.name}${Object.entries(l.params).map(([k, x]) => `;${k}=${x}`).join('')}:${v}`;
  const date = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (date || l.params.VALUE === 'DATE') {
    if (!date) return null;
    return { date: `${date[1]}-${date[2]}-${date[3]}`, tzWritten: '', zone: null, raw };
  }
  const t = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(v);
  if (!t) return null;
  const [y, mo, d, h, mi, s] = t.slice(1, 7).map(Number) as [number, number, number, number, number, number];
  if (t[7] === 'Z') return { iso: new Date(Date.UTC(y, mo - 1, d, h, mi, s)).toISOString(), tzWritten: 'UTC', zone: 'UTC', raw };
  const tzid = l.params.TZID ?? '';
  // A "floating" time (no zone at all) means the same wall time wherever he is: his own zone.
  const zone = tzid ? zoneOf(tzid) : 'America/Toronto';
  if (!zone) return { tzWritten: tzid, zone: null, raw, note: `the invite uses a time zone Aang does not know for sure ("${tzid.slice(0, 60)}")` };
  const r = zonedToUtc(y, mo, d, h, mi, s, zone);
  return { iso: new Date(r.ms).toISOString(), tzWritten: tzid || '(none: your own time)', zone, raw, ...(r.note ? { note: r.note } : {}) };
}

/** "PT1H30M", "P1D": an event's length, for an invite with DURATION instead of an end. */
function durationMs(v: string): number | null {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v.trim());
  if (!m) return null;
  const [, sign, w, d, h, mi, s] = m;
  const ms = ((Number(w ?? 0) * 7 + Number(d ?? 0)) * 86_400 + Number(h ?? 0) * 3600 + Number(mi ?? 0) * 60 + Number(s ?? 0)) * 1000;
  return sign === '-' ? -ms : ms;
}

const person = (l: IcsLine) => ({ name: (l.params.CN ?? '').trim(), email: l.value.replace(/^mailto:/i, '').trim().toLowerCase() });

/** Every event in an iCalendar text (an invite usually has one). Never throws: what cannot be read is left out. */
export function parseInvites(ics: string): Invite[] {
  const lines = unfold(ics).split('\n').map(x => x.trimEnd());
  let method = '';
  const out: Invite[] = [];
  let ev: { lines: IcsLine[] } | null = null;
  let depth = 0;                           // inside a VALARM or VTIMEZONE in an event: not the event's own lines
  for (const raw of lines) {
    const l = parseLine(raw);
    if (!l) continue;
    if (l.name === 'METHOD' && !ev) method = l.value.trim().toUpperCase();
    if (l.name === 'BEGIN' && l.value.toUpperCase() === 'VEVENT') { ev = { lines: [] }; depth = 0; continue; }
    if (!ev) continue;
    if (l.name === 'BEGIN') { depth++; continue; }
    if (l.name === 'END' && l.value.toUpperCase() === 'VEVENT') {
      const get = (n: string) => ev!.lines.find(x => x.name === n);
      const start = get('DTSTART') ? parseIcsTime(get('DTSTART')!) : null;
      let end = get('DTEND') ? parseIcsTime(get('DTEND')!) : null;
      const dur = get('DURATION') ? durationMs(get('DURATION')!.value) : null;
      if (!end && start?.iso && dur !== null) end = { ...start, iso: new Date(Date.parse(start.iso) + dur).toISOString(), raw: `DURATION:${get('DURATION')!.value}` };
      const status = (get('STATUS')?.value ?? '').trim().toUpperCase();
      const org = get('ORGANIZER');
      out.push({
        method: method || 'PUBLISH', uid: (get('UID')?.value ?? '').trim().slice(0, 300),
        title: unescapeText(get('SUMMARY')?.value ?? '').trim().slice(0, 300),
        start, end, allDay: Boolean(start?.date),
        where: unescapeText(get('LOCATION')?.value ?? '').trim().slice(0, 300),
        organizer: org ? person(org) : null,
        attendees: ev.lines.filter(x => x.name === 'ATTENDEE').slice(0, 50).map(x => ({ ...person(x), answer: (x.params.PARTSTAT ?? '').toUpperCase() })),
        description: unescapeText(get('DESCRIPTION')?.value ?? '').trim().slice(0, 4000),
        recurring: (get('RRULE')?.value ?? '').trim().slice(0, 300),
        cancelled: method === 'CANCEL' || status === 'CANCELLED',
        sequence: Number(get('SEQUENCE')?.value) || 0,
      });
      ev = null;
      continue;
    }
    if (l.name === 'END') { depth = Math.max(0, depth - 1); continue; }
    if (depth === 0) ev.lines.push(l);
  }
  return out;
}

// ------------------------------------------------------------------ links

export type LinkKind = 'video' | 'call' | 'map' | 'file' | 'unsubscribe' | 'link';
export interface FoundLink { url: string; text: string; kind: LinkKind; site: string; wrapped?: string }

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decodeEntities = (s: string) => s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
  if (e[0] === '#') { const n = e[1]!.toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ''; }
  return ENT[e.toLowerCase()] ?? m;
});

/** Where a link REALLY goes: Outlook's Safe Links, Google's redirect and the like are unwrapped (one level each, twice). */
export function realUrl(url: string): string {
  let u = url;
  for (let i = 0; i < 2; i++) {
    let p: URL; try { p = new URL(u); } catch { return u; }
    const h = p.hostname.toLowerCase();
    const inner = /safelinks\.protection\.outlook\.com$/.test(h) ? p.searchParams.get('url')
      : (h === 'www.google.com' || h === 'google.com') && p.pathname === '/url' ? (p.searchParams.get('q') ?? p.searchParams.get('url'))
      : h === 'urldefense.com' && /^\/v3\/__/.test(p.pathname) ? p.pathname.replace(/^\/v3\/__/, '').replace(/__;.*$/, '')
      : null;
    if (!inner || !/^https?:\/\//i.test(inner)) return u;
    u = inner;
  }
  return u;
}

export function kindOfLink(url: string, text = ''): LinkKind {
  let p: URL; try { p = new URL(url); } catch { return 'link'; }
  const h = p.hostname.toLowerCase().replace(/^www\./, ''), path = p.pathname;
  if (/unsubscribe|opt-?out|email-preferences/i.test(url) || /unsubscribe/i.test(text)) return 'unsubscribe';
  if (/(^|\.)zoom\.us$/.test(h) && /^\/(j|my|w)\//.test(path)) return 'call';
  if (h === 'meet.google.com' || (/^teams\.(microsoft|live)\.com$/.test(h) && /meetup-join|\/meet\//.test(path)) || /(^|\.)webex\.com$/.test(h)) return 'call';
  if (h === 'youtu.be' || (/(^|\.)youtube\.com$/.test(h) && /^\/(watch|shorts|live|embed)/.test(path)) || h === 'vimeo.com' || h === 'player.vimeo.com'
    || (h === 'loom.com' && /^\/(share|embed)\//.test(path)) || /(^|\.)vidyard\.com$/.test(h) || /(^|\.)wistia\.(com|net)$/.test(h)
    || (/(^|\.)tiktok\.com$/.test(h) && /\/video\//.test(path)) || (h === 'instagram.com' && /^\/(reel|p)\//.test(path))) return 'video';
  if ((/(^|\.)google\.[a-z.]+$/.test(h) && /^\/maps/.test(path)) || h === 'maps.app.goo.gl' || (h === 'goo.gl' && /^\/maps/.test(path)) || h === 'maps.apple.com' || /(^|\.)waze\.com$/.test(h)) return 'map';
  if (h === 'drive.google.com' || h === 'docs.google.com' || /(^|\.)dropbox\.com$/.test(h) || /(^|\.)sharepoint\.com$/.test(h) || h === '1drv.ms' || /(^|\.)onedrive\.live\.com$/.test(h)
    || /(^|\.)box\.com$/.test(h) || /(^|\.)wetransfer\.com$/.test(h) || h === 'we.tl') return 'file';
  return 'link';
}

/** Every link in an email: from the HTML (with the words it was on) and from the plain text. Web addresses only. */
export function findLinks(html: string, plain: string): FoundLink[] {
  const seen = new Map<string, FoundLink>();
  const add = (href: string, text: string) => {
    const raw = decodeEntities(href.trim());
    if (!/^https?:\/\//i.test(raw) || raw.length > 2000) return;
    const url = realUrl(raw);
    let site = ''; try { site = new URL(url).hostname.replace(/^www\./, ''); } catch { return; }
    const t = decodeEntities(text.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim().slice(0, 120);
    const had = seen.get(url);
    if (had) { if (!had.text && t) had.text = t; return; }
    seen.set(url, { url, text: t, kind: kindOfLink(url, t), site, ...(url !== raw ? { wrapped: raw.slice(0, 300) } : {}) });
  };
  for (const m of html.matchAll(/<a\b[^>]*?\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi)) add(m[2] ?? m[3] ?? m[4] ?? '', m[5] ?? '');
  for (const m of `${plain}\n${decodeEntities(html.replace(/<[^>]+>/g, ' '))}`.matchAll(/https?:\/\/[^\s<>"')\]]+/gi)) add(m[0].replace(/[.,;:!?]+$/, ''), '');
  return [...seen.values()].slice(0, 60);
}

// ------------------------------------------------------------------ phone numbers and street addresses

export interface FoundPhone { text: string; digits: string }
/** North American numbers (with or without +1, any of the usual separators) and +-international ones, as written. */
export function findPhones(text: string): FoundPhone[] {
  const out = new Map<string, FoundPhone>();
  for (const m of text.matchAll(/(?<![\d\w])(?:\+?1[\s.-]?)?\(?([2-9]\d{2})\)?[\s.-]?([2-9]\d{2})[\s.-]?(\d{4})(?:\s*(?:x|ext\.?)\s*(\d{1,6}))?(?![\d\w])/gi)) {
    const digits = `+1${m[1]}${m[2]}${m[3]}${m[4] ? 'x' + m[4] : ''}`;
    // Ten digits in a row with nothing around them is as likely an order or account number: not taken as a phone.
    if (/^\d{10,11}$/.test(m[0].trim())) continue;
    if (!out.has(digits)) out.set(digits, { text: m[0].trim(), digits });
  }
  for (const m of text.matchAll(/(?<![\d\w+])\+(?!1[\s.(-]?\d{3})(\d[\d\s().-]{6,18}\d)(?![\d\w])/g)) {
    const digits = '+' + m[1]!.replace(/\D/g, '');
    if (digits.length >= 9 && digits.length <= 16 && !out.has(digits)) out.set(digits, { text: m[0].trim(), digits });
  }
  return [...out.values()].slice(0, 10);
}

const STREET = '(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Crescent|Cres|Court|Ct|Place|Pl|Parkway|Pkwy|Highway|Hwy|Square|Sq|Terrace|Terr|Circle|Cir|Trail|Trl|Gate|Line|Sideroad|Concession)';
const DIR = '(?:North|South|East|West|N|S|E|W|NE|NW|SE|SW)';
const ADDRESS = new RegExp(
  `\\b\\d{1,6}[A-Za-z]?(?:-\\d{1,6})?\\s+(?:[A-Z][\\w'.-]*\\s+){0,4}${STREET}\\.?(?:\\s+${DIR}\\.?)?` +
  `(?:,?\\s+(?:Suite|Unit|Floor|Fl|#)\\s*[\\w-]+)?` +
  `(?:,\\s*[A-Z][\\w .'-]{1,40}?)?(?:,\\s*(?:[A-Z]{2}|Ontario|Quebec|British Columbia|Alberta))?(?:,?\\s+(?:[A-Z]\\d[A-Z]\\s?\\d[A-Z]\\d|\\d{5}(?:-\\d{4})?))?\\b`, 'g');
/** Street addresses in the text, exactly as written. Only clear ones (a number, a street word); a guess is not made. */
export function findAddresses(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(ADDRESS)) { const a = m[0].replace(/\s+/g, ' ').replace(/[,.]$/, '').trim(); if (a.length >= 8) out.add(a); }
  return [...out].slice(0, 8);
}

// ------------------------------------------------------------------ one email, all of it

export interface Attachment { name: string; mimeType: string; size: number; attachmentId?: string; inlineData?: string; partId?: string }
export interface EmailFacts {
  invites: Invite[];
  links: FoundLink[];
  phones: FoundPhone[];
  addresses: string[];
  attachments: Attachment[];
}

/** The calendar parts and attachments of a message, without opening anything (an invite's data is fetched by the caller). */
export function partsOf(payload: Part | undefined): { calendars: Attachment[]; attachments: Attachment[]; html: string; plain: string } {
  const calendars: Attachment[] = [], attachments: Attachment[] = [];
  const html: string[] = [], plain: string[] = [];
  const b64 = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  const walk = (p: Part) => {
    const mime = (p.mimeType ?? '').toLowerCase();
    const a: Attachment = { name: String(p.filename ?? ''), mimeType: mime, size: Number(p.body?.size) || 0, ...(p.body?.attachmentId ? { attachmentId: p.body.attachmentId } : {}), ...(p.body?.data ? { inlineData: p.body.data } : {}), ...(p.partId ? { partId: p.partId } : {}) };
    if (mime === 'text/calendar' || mime === 'application/ics' || /\.ics$/i.test(a.name)) calendars.push(a);
    else if (p.filename) attachments.push(a);
    else if (mime === 'text/html' && p.body?.data) html.push(b64(p.body.data));
    else if (mime === 'text/plain' && p.body?.data) plain.push(b64(p.body.data));
    for (const c of p.parts ?? []) walk(c);
  };
  if (payload) walk(payload);
  return { calendars, attachments, html: html.join('\n'), plain: plain.join('\n') };
}

/** Everything code can read out of one email. `calendarText` is each calendar part's text, already fetched. */
export function factsOf(payload: Part | undefined, calendarText: string[]): EmailFacts {
  const p = partsOf(payload);
  const invites = calendarText.flatMap(t => parseInvites(t)).slice(0, 5);
  const text = `${p.plain}\n${p.html.replace(/<(br|\/p|\/div|\/tr|\/li)\b[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' ')}`;
  const decoded = decodeEntities(text);
  const links = findLinks(p.html, `${p.plain}\n${invites.map(i => `${i.description}\n${i.where}`).join('\n')}`);
  return {
    invites, links,
    phones: findPhones(decoded),
    addresses: [...new Set([...invites.map(i => i.where).filter(w => findAddresses(w).length || /\d/.test(w)).filter(w => !/^https?:/i.test(w)), ...findAddresses(decoded)])].slice(0, 8),
    attachments: p.attachments.map(({ inlineData: _d, ...a }) => a).slice(0, 20),
  };
}

// ------------------------------------------------------------------ words for the model and for him

/** A time as he reads it: the weekday, the date, the time with am or pm, in Toronto; and the sender's zone too when different. */
export function sayTime(t: IcsTime | null): string {
  if (!t) return 'no time given';
  if (t.date) return `${new Date(t.date + 'T12:00:00Z').toLocaleDateString('en-CA', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} (all day)`;
  if (!t.iso) return `NOT SURE: ${t.note ?? 'the time could not be read'} (as written: ${t.raw})`;
  const d = new Date(t.iso);
  const here = d.toLocaleString('en-US', { timeZone: 'America/Toronto', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' Toronto time';
  const there = t.zone && t.zone !== 'America/Toronto' && offsetAt(d.getTime(), t.zone) !== offsetAt(d.getTime(), 'America/Toronto')
    ? ` (${d.toLocaleString('en-US', { timeZone: t.zone, hour: 'numeric', minute: '2-digit', weekday: 'short' })} where it was written, ${t.zone})` : '';
  return here + there + (t.note ? ` [${t.note}]` : '');
}

/** The facts as the model is shown them: read by code, exact, each with what it was read from. */
export function factsBlock(f: EmailFacts): string {
  const out: string[] = ['--- read from this email by code, exactly (trust these over your own reading; if they differ, say so and do not guess) ---'];
  for (const i of f.invites) {
    out.push(`Invite (${i.cancelled ? 'CANCELLED' : i.method}): "${i.title}"`,
      `  Starts: ${sayTime(i.start)}   [as written: ${i.start?.raw ?? 'none'}]`,
      `  Ends: ${sayTime(i.end)}   [as written: ${i.end?.raw ?? 'none'}]`);
    if (i.where) out.push(`  Where: ${i.where}`);
    if (i.organizer) out.push(`  From: ${i.organizer.name ? i.organizer.name + ' ' : ''}<${i.organizer.email}>`);
    if (i.attendees.length) out.push(`  Invited: ${i.attendees.map(a => a.name ? `${a.name} <${a.email}>` : a.email).join(', ')}`);
    if (i.recurring) out.push(`  Repeats: ${i.recurring}`);
  }
  const by = (k: LinkKind) => f.links.filter(l => l.kind === k);
  for (const [k, label] of [['call', 'Call links'], ['video', 'Videos'], ['map', 'Map links'], ['file', 'Shared files'], ['link', 'Other links']] as [LinkKind, string][]) {
    const ls = by(k).slice(0, k === 'link' ? 12 : 8);
    if (ls.length) out.push(`${label}:`, ...ls.map(l => `  ${l.url}${l.text && l.text !== l.url ? `  (shown as "${l.text}")` : ''}${l.wrapped ? '  [unwrapped from a redirect link]' : ''}`));
  }
  if (f.addresses.length) out.push('Addresses, exactly as written:', ...f.addresses.map(a => `  ${a}`));
  if (f.phones.length) out.push('Phone numbers, as written:', ...f.phones.map(p => `  ${p.text}`));
  if (f.attachments.length) out.push('Attachments:', ...f.attachments.map(a => `  ${a.name} (${a.mimeType}, ${Math.max(1, Math.round(a.size / 1024))} KB)`));
  if (out.length === 1) out.push('(nothing beyond the text itself)');
  out.push('--- end of what code read ---');
  return out.join('\n');
}

// Sheet 21 board 1 (his order, 2026-10-13): the morning brief as the Discord card draws it. Job hunt first, then what is
// waiting on him, then today, then the other email WITH its subject. One builder for the PC and for the Mac (which sends
// the brief when Shadow is off), so the two can never say it differently. Plain data in, plain data out; every word
// goes onto the card as text.
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
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-US', { timeZone: 'America/Toronto', hour: 'numeric', minute: '2-digit' }).toLowerCase();
};

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

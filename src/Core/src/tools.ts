// Grounding tools. Aang states a fact only if one of these returned it this turn (the linter enforces it).
import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { Memory } from './memory.ts';
import type { HookTracker } from './hooks.ts';
import type { Reminders } from './reminders.ts';
import { describeWhen, dueAt } from './reminders.ts';

const TZ = 'America/Toronto';
const LAT = 43.65, LON = -79.38; // Toronto, from Joshua's profile

const WMO: Record<number, string> = {
  0: 'clear', 1: 'mostly clear', 2: 'partly cloudy', 3: 'overcast', 45: 'fog', 48: 'freezing fog',
  51: 'light drizzle', 53: 'drizzle', 55: 'heavy drizzle', 56: 'freezing drizzle', 57: 'heavy freezing drizzle',
  61: 'light rain', 63: 'rain', 65: 'heavy rain', 66: 'freezing rain', 67: 'heavy freezing rain',
  71: 'light snow', 73: 'snow', 75: 'heavy snow', 77: 'snow grains',
  80: 'light rain showers', 81: 'rain showers', 82: 'heavy rain showers', 85: 'snow showers', 86: 'heavy snow showers',
  95: 'thunderstorm', 96: 'thunderstorm with hail', 99: 'severe thunderstorm with hail',
};
export const describeWeatherCode = (c: number): string => WMO[c] ?? `weather code ${c}`;

export function formatTime(d = new Date()): string {
  return d.toLocaleString('en-CA', { timeZone: TZ, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
}

export async function fetchWeather(fetchImpl: typeof fetch = fetch): Promise<string> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
    `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation&timezone=${encodeURIComponent(TZ)}`;
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`weather service returned ${res.status}`);
  const j: any = await res.json();
  const c = j.current;
  return `Toronto right now (${c.time}): ${describeWeatherCode(c.weather_code)}, ${Math.round(c.temperature_2m)} C ` +
    `(feels like ${Math.round(c.apparent_temperature)} C), wind ${Math.round(c.wind_speed_10m)} km/h, precipitation ${c.precipitation} mm.`;
}

/** Short receipt lines the Body can show while a tool runs. */
export const TOOL_LABELS: Record<string, string> = {
  get_time: 'checking the time',
  get_weather: 'checking the weather',
  search_memory: 'looking through our history',
  claude_code_status: 'checking on Claude Code',
  set_reminder: 'setting a reminder',
  list_reminders: 'checking your reminders',
  cancel_reminder: 'cancelling that reminder',
  WebSearch: 'searching the web',
  WebFetch: 'reading that page',
  Read: 'reading that file',
  Glob: 'looking through your files',
  Grep: 'searching your files',
  Bash: 'running that',
  Write: 'writing that file',
  Edit: 'editing that file',
};
export const toolLabel = (fullName: string): string => TOOL_LABELS[fullName.replace(/^mcp__aang__/, '')] ?? 'working';

export const TOOL_NAMES = ['mcp__aang__get_time', 'mcp__aang__get_weather', 'mcp__aang__search_memory',
  'mcp__aang__claude_code_status', 'mcp__aang__set_reminder', 'mcp__aang__list_reminders', 'mcp__aang__cancel_reminder'];

/**
 * Built-in tools Aang may use without asking. All of them only look: they search, fetch and read, and none
 * of them changes anything on the machine. Bash, Write and Edit are deliberately absent, so they fall through
 * to canUseTool and Joshua gets a yes/no in the bubble first.
 */
export const READ_ONLY_BUILTINS = ['WebSearch', 'WebFetch', 'Read', 'Glob', 'Grep'];

/** A short, plain sentence describing a tool call, for the receipt line and the permission question. */
export function describeCall(tool: string, input: Record<string, unknown>): string {
  const s = (k: string) => typeof input?.[k] === 'string' ? String(input[k]) : '';
  const short = (v: string, n = 90) => v.length > n ? v.slice(0, n) + '...' : v;
  switch (tool) {
    case 'Bash': {
      // a leading `cd somewhere &&` is scaffolding, not the thing he is agreeing to
      const cmd = s('command').replace(/^s*cds+[^&]+&&s*/i, '').trim();
      return `run ${short(cmd, 70)}`;
    }
    case 'Write': return `write to ${short(s('file_path'), 60)}`;
    case 'Edit': return `change ${short(s('file_path'), 60)}`;
    case 'WebSearch': return `search the web for ${short(s('query'), 60)}`;
    case 'WebFetch': return `read ${short(s('url'), 60)}`;
    case 'Read': return `read ${short(s('file_path'), 60)}`;
    case 'Glob': case 'Grep': return `look through your files`;
    default: return `use ${tool}`;
  }
}

export function makeToolServer(memory: Memory, hooks?: HookTracker, reminders?: Reminders) {
  const ok = (text: string) => ({ content: [{ type: 'text' as const, text }] });
  const fail = (text: string) => ({ content: [{ type: 'text' as const, text }], isError: true });

  return createSdkMcpServer({
    name: 'aang',
    tools: [
      tool('get_time', 'Current local date and time in Toronto. Use for any question about the time or date.', {},
        async () => ok(formatTime())),
      tool('get_weather', 'Current weather in Toronto. Use for any question about the weather or what to wear.', {},
        async () => {
          try { return ok(await fetchWeather()); }
          catch (e) { return fail(`Could not get the weather: ${(e as Error).message}`); }
        }),
      tool('search_memory', 'Search past conversations with Joshua by words. Use when he refers to something from before.',
        { query: z.string().describe('a few key words to search for') },
        async ({ query }) => {
          const hits = memory.search(query);
          if (process.env.AANG_TRACE) console.log(`[trace] search_memory query=${JSON.stringify(query)} hits=${hits.length}`);
          // Be explicit about the gap so Aang neither invents its old answers nor claims there is no record.
          const gap = 'Note: many of Aang\'s own older replies are not kept, so results may show only what Joshua said.';
          if (!hits.length) return ok(`Nothing found in past conversations for that. ${gap}`);
          return ok(hits.map(h => `${h.ts} ${h.who}: ${h.text}`).join('\n') + `\n${gap}`);
        }),
      tool('claude_code_status', 'What Joshua\'s Claude Code sessions are doing right now: working, waiting for him, or idle. Use for any question about Claude Code, his coding sessions, or whether something finished.', {},
        async () => ok(hooks ? hooks.status() : 'Session tracking is not running, so there is nothing to report.')),
      tool('set_reminder', 'Remind Joshua about something later. Give either in_minutes or at (an ISO timestamp); call get_time first if he named a clock time.',
        { text: z.string().describe('what to remind him about, in his own words'),
          in_minutes: z.number().optional().describe('how many minutes from now'),
          at: z.string().optional().describe('ISO timestamp for when it is due') },
        async ({ text, in_minutes, at }) => {
          if (!reminders) return fail('Reminders are not running right now.');
          const when = dueAt(in_minutes, at);
          if (when === null) return fail('That time did not make sense. Ask him when he wants it, within the next month.');
          const r = reminders.add(text, when);
          if (!r) return fail('That reminder was empty, or he already has the maximum number set.');
          return ok(`Reminder set: "${r.text}" ${describeWhen(r.at)}.`);
        }),
      tool('list_reminders', 'The reminders Joshua has set that have not gone off yet.', {},
        async () => {
          if (!reminders) return fail('Reminders are not running right now.');
          const live = reminders.list();
          if (!live.length) return ok('No reminders are set.');
          return ok(live.map(r => `${r.text} - ${describeWhen(r.at)}`).join('\n'));
        }),
      tool('cancel_reminder', 'Cancel a reminder Joshua set, matched by a few words of its text.',
        { which: z.string().describe('a few words from the reminder to cancel') },
        async ({ which }) => {
          if (!reminders) return fail('Reminders are not running right now.');
          const gone = reminders.cancel(which);
          return gone ? ok(`Cancelled: "${gone.text}".`) : fail('No reminder matched that.');
        }),
    ],
  });
}

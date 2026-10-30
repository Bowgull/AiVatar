// Weather from Open-Meteo (free, no key, no account), shared by the PC and the Mac: the Mac's morning brief needs it
// when Shadow is off (his pick, 2026-10-13), and the Mac is sent only small files.
import { HOME_TZ } from './clock.ts';
const TZ = HOME_TZ;
export const LAT = 43.65, LON = -79.38; // Toronto, from Joshua's profile

const WMO: Record<number, string> = {
  0: 'clear', 1: 'mostly clear', 2: 'partly cloudy', 3: 'overcast', 45: 'fog', 48: 'freezing fog',
  51: 'light drizzle', 53: 'drizzle', 55: 'heavy drizzle', 56: 'freezing drizzle', 57: 'heavy freezing drizzle',
  61: 'light rain', 63: 'rain', 65: 'heavy rain', 66: 'freezing rain', 67: 'heavy freezing rain',
  71: 'light snow', 73: 'snow', 75: 'heavy snow', 77: 'snow grains',
  80: 'light rain showers', 81: 'rain showers', 82: 'heavy rain showers', 85: 'snow showers', 86: 'heavy snow showers',
  95: 'thunderstorm', 96: 'thunderstorm with hail', 99: 'severe thunderstorm with hail',
};
export const describeWeatherCode = (c: number): string => WMO[c] ?? `weather code ${c}`;

/**
 * Today's weather for the morning brief (6.15): now, the high and low, and the chance of rain. Same free
 * service as get_weather (Open-Meteo, no key, no account), and like the rest of the brief, no model.
 */
export async function fetchDayWeather(fetchImpl: typeof fetch = fetch): Promise<{ now: number; high: number; low: number; words: string; rain: number }> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
    `&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code` +
    `&forecast_days=1&timezone=${encodeURIComponent(TZ)}`;
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`weather service returned ${res.status}`);
  const j: any = await res.json();
  return {
    now: Math.round(j.current.temperature_2m), high: Math.round(j.daily.temperature_2m_max[0]), low: Math.round(j.daily.temperature_2m_min[0]),
    words: describeWeatherCode(j.daily.weather_code[0]), rain: Math.round(j.daily.precipitation_probability_max[0] ?? 0),
  };
}


/** The kind of sky, for the brief's pixel icons (sheet 24). */
export type Sky = 'sun' | 'moon' | 'partly' | 'cloud' | 'fog' | 'rain' | 'snow' | 'storm';
export function skyOf(code: number, night = false): Sky {
  if (code >= 95) return 'storm';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if (code === 45 || code === 48) return 'fog';
  if (code === 3) return 'cloud';
  if (code === 2) return 'partly';
  return night ? 'moon' : 'sun';
}
/** How bad a sky is, so a part of the day shows its worst hour. */
const SEVERITY: Record<Sky, number> = { sun: 0, moon: 0, partly: 1, cloud: 2, fog: 3, rain: 4, snow: 5, storm: 6 };

export interface DayPart { part: 'morn' | 'aftn' | 'eve'; temp: number; sky: Sky }
/**
 * His pick (2026-10-14): the day as morning, afternoon and evening, each with its own icon and temperature, and
 * when the rain starts. Morning 6 to 12 (temperature at 9), afternoon 12 to 18 (at 15), evening 18 to 23 (at 20);
 * each shows its worst sky. Rain is said from the first hour from now with a 50% chance or more.
 */
export function dayParts(hourly: { time: string[]; temperature_2m: number[]; weather_code: number[]; precipitation_probability: number[] }, nowHour: number): { parts: DayPart[]; rainFrom: string | null } {
  const hourOf = (t: string) => Number(t.slice(11, 13));
  const at = (h: number) => hourly.time.findIndex(t => hourOf(t) === h);
  const span = (from: number, to: number, night = false): Sky => {
    let worst: Sky = night ? 'moon' : 'sun';
    hourly.time.forEach((t, i) => { const h = hourOf(t); if (h >= from && h < to) { const s = skyOf(hourly.weather_code[i]!, night); if (SEVERITY[s] > SEVERITY[worst]) worst = s; } });
    return worst;
  };
  const temp = (h: number) => Math.round(hourly.temperature_2m[Math.max(0, at(h))] ?? 0);
  const parts: DayPart[] = [
    { part: 'morn', temp: temp(9), sky: span(6, 12) },
    { part: 'aftn', temp: temp(15), sky: span(12, 18) },
    { part: 'eve', temp: temp(20), sky: span(18, 24, true) },
  ];
  let rainFrom: string | null = null;
  for (let i = 0; i < hourly.time.length; i++) {
    const h = hourOf(hourly.time[i]!);
    const wet = (hourly.precipitation_probability[i] ?? 0) >= 50 && ['rain', 'snow', 'storm'].includes(skyOf(hourly.weather_code[i]!));
    if (h >= nowHour && wet) { rainFrom = h === 0 ? '12 am' : h < 12 ? `${h} am` : h === 12 ? '12 pm' : `${h - 12} pm`; break; }
  }
  return { parts, rainFrom };
}

/** Today's three parts from Open-Meteo, in Toronto time. */
export async function fetchDayParts(fetchImpl: typeof fetch = fetch, now: Date = new Date()): Promise<{ parts: DayPart[]; rainFrom: string | null; rainIsSnow: boolean }> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
    `&hourly=temperature_2m,weather_code,precipitation_probability&forecast_days=1&timezone=${encodeURIComponent(TZ)}`;
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`weather service returned ${res.status}`);
  const j: any = await res.json();
  const nowHour = Number(now.toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false }).slice(0, 2));
  const r = dayParts(j.hourly, nowHour);
  const snowy = r.parts.some(p => p.sky === 'snow') && !r.parts.some(p => p.sky === 'rain');
  return { ...r, rainIsSnow: snowy };
}
